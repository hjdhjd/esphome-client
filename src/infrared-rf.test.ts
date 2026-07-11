/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * infrared-rf.test.ts: Unit and integration tests for the infrared and radio_frequency entity types.
 *
 * The two entity types share a single transmit RPC (id 136) and a single receive event (id 137) on the wire, distinguished only by which schema's listEntities response
 * (id 135 vs 148) discovered them. The tests below cover the following threads:
 *
 *   1. Packed sint32 codec primitives (zigzag and packed-varint round-trips) - the wire-format addition IR/RF depends on.
 *   2. Pure schema decode of `LIST_ENTITIES_INFRARED_RESPONSE` and `LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE` produces the right capability fields.
 *   3. The receive-event disambiguation in `handleTelemetry` routes id 137 to whichever channel matches the registered entity's type, not whichever schema iterates
 *      first.
 *   4. `transmitRawTimings` produces the correct INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST wire frame and refuses RX-only / unknown ids with the documented
 *      ConnectionError codes.
 *   5. Schema-table sanity checks confirm the SSOT chain (state/listEntities/command messageTypes, command + state slot presence).
 */
import { InfraredCapabilityFlags, RadioFrequencyCapabilityFlags, RadioFrequencyModulation } from "./api-constants.ts";
import type { InfraredEntity, InfraredEvent, RadioFrequencyEntity, RadioFrequencyEvent } from "./schemas/index.ts";
import { MockTransport, pushInfraredListEntity, pushInfraredRFReceiveEvent, pushRadioFrequencyListEntity } from "./testing/mock-transport.ts";
import { decodePackedSint32, decodeProtobuf, encodePackedSint32, encodeProtoFields, zigzagDecode, zigzagEncode } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { CapturedFrame } from "./testing/mock-transport.ts";
import { ConnectionError } from "./errors.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import { EspHomeClient } from "./esphome-client.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { ProtoField } from "./protocol/codec.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { entityId } from "./entity-id.ts";

// Quiet logger - prevents the host's debug/info logging from polluting test output.
function quietLogger(): { debug: () => void; info: () => void; warn: () => void; error: () => void } {

  return { debug: (): void => undefined, error: (): void => undefined, info: (): void => undefined, warn: (): void => undefined };
}

// 4-byte little-endian fixed32 key (matches the wire encoding for every list-entities and state-response message).
function encodeKeyFixed32(key: number): Buffer {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(key, 0);

  return buf;
}

// Synthesized HELLO_RESPONSE for API 1.12, the canonical modern-handshake fixture version (above the minor-11 modernHandshake threshold). Wire shape per
// api.proto §HelloResponse.
function helloResponse(major: number, minor: number, serverInfo: string, deviceName: string): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: major, wireType: WireType.VARINT },
    { fieldNumber: 2, value: minor, wireType: WireType.VARINT },
    { fieldNumber: 3, value: Buffer.from(serverInfo, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 4, value: Buffer.from(deviceName, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ]);
}

const HELLO_RESPONSE_PROTOCOL_1_12 = helloResponse(1, 12, "test-server", "test-device");

// Minimal DeviceInfoResponse - just the required base fields. The IR/RF tests do not care about device-info content; we only need a well-formed response so the host's
// discovery phase completes.
function deviceInfoResponse(): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
    { fieldNumber: 2, value: Buffer.from("test-device", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 3, value: Buffer.from("AA:BB:CC:DD:EE:FF", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 4, value: Buffer.from("2025.10.0", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 5, value: Buffer.from("Jan  1 2026, 12:00:00", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 6, value: Buffer.from("esp32dev", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 7, value: 0, wireType: WireType.VARINT },
    { fieldNumber: 13, value: Buffer.from("Test Device", "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 19, value: 0, wireType: WireType.VARINT }
  ]);
}

const DEVICE_INFO_RESPONSE_DEFAULT = deviceInfoResponse();
const LIST_ENTITIES_DONE_RESPONSE = Buffer.alloc(0);

// Drive a fresh client through the canonical plaintext connect -> discover -> ready sequence with caller-supplied IR/RF list-entities pushes interleaved between the
// device-info response and the discovery-done sentinel. Returns once the connect promise resolves.
async function driveConnectWithEntities(transport: MockTransport, client: EspHomeClient, pushEntities: (transport: MockTransport) => void): Promise<void> {

  const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

  await Promise.resolve();
  await delay(5);

  transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
  await delay(5);

  transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
  await delay(2);

  pushEntities(transport);

  await delay(2);
  transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

  await connectPromise;
}

// 1. Packed sint32 codec primitives - the wire-format addition IR/RF depends on.

describe("zigzagEncode / zigzagDecode round-trip", () => {

  test("encodes small positive and negative integers as expected", () => {

    assert.equal(zigzagEncode(0), 0);
    assert.equal(zigzagEncode(-1), 1);
    assert.equal(zigzagEncode(1), 2);
    assert.equal(zigzagEncode(-2), 3);
    assert.equal(zigzagEncode(2), 4);
  });

  test("inverts cleanly across a representative set of timings", () => {

    // Sample timings reflect a realistic IR pattern: NEC header + bit cells. Each round-trips identically through the zigzag pair.
    const samples = [ 0, 1, -1, 9000, -4500, 560, -560, 560, -1690, 2000000, -2000000 ];

    for(const value of samples) {

      assert.equal(zigzagDecode(zigzagEncode(value)), value, "zigzag round-trip failed for " + String(value));
    }
  });
});

describe("encodePackedSint32 / decodePackedSint32 round-trip", () => {

  test("encodes an empty array as an empty buffer", () => {

    const buf = encodePackedSint32([]);

    assert.equal(buf.length, 0);
    assert.deepEqual(decodePackedSint32(buf), []);
  });

  test("round-trips a representative IR timing pattern through the packed encoding", () => {

    const original = [ 9000, -4500, 560, -560, 560, -1690, 560, -560, 560, -1690, 560, -560 ];
    const buf = encodePackedSint32(original);
    const decoded = decodePackedSint32(buf);

    assert.deepEqual(decoded, original);
  });

  test("decodes a back-to-back varint sequence into the corresponding signed integers", () => {

    // Two values: 1 (zigzag-encoded as varint 2) and -1 (zigzag-encoded as varint 1).
    const buf = Buffer.from([ 0x02, 0x01 ]);

    assert.deepEqual(decodePackedSint32(buf), [ 1, -1 ]);
  });
});

// 2. Schema decode of LIST_ENTITIES_INFRARED_RESPONSE and LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE.

describe("Infrared list-entities decode via the schema", () => {

  test("decodes a LIST_ENTITIES_INFRARED_RESPONSE into an InfraredEntity with capabilities and receiverFrequency", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.TRANSMITTER | InfraredCapabilityFlags.RECEIVER,
        key: 0x1234,
        name: "IR Blaster",
        objectId: "ir_blaster",
        receiverFrequency: 38000
      });
    });

    const entity = client.getEntityById(entityId("infrared", "ir_blaster")) as InfraredEntity | null;

    assert.notEqual(entity, null);
    assert.equal(entity?.type, "infrared");
    assert.equal(entity?.key, 0x1234);
    assert.equal(entity?.name, "IR Blaster");
    assert.equal(entity?.objectId, "ir_blaster");
    assert.equal(entity?.capabilities, 0x3);
    assert.equal(entity?.receiverFrequency, 38000);

    client.disconnect();
  });

  test("decodes a TX-only infrared entity with capabilities bit 0 set, bit 1 clear", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.TRANSMITTER,
        key: 1,
        name: "TX Only",
        objectId: "tx_only"
      });
    });

    const entity = client.getEntityById(entityId("infrared", "tx_only")) as InfraredEntity | null;

    assert.equal((entity?.capabilities ?? 0) & InfraredCapabilityFlags.TRANSMITTER, InfraredCapabilityFlags.TRANSMITTER);
    assert.equal((entity?.capabilities ?? 0) & InfraredCapabilityFlags.RECEIVER, 0);

    client.disconnect();
  });
});

describe("Radio frequency list-entities decode via the schema", () => {

  test("decodes a LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE with capabilities, frequencyMin/Max, supportedModulations", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushRadioFrequencyListEntity(t, {

        capabilities: RadioFrequencyCapabilityFlags.TRANSMITTER | RadioFrequencyCapabilityFlags.RECEIVER,
        frequencyMax: 434000000,
        frequencyMin: 433000000,
        key: 0xabcd,
        name: "RF Module",
        objectId: "rf_module",
        // Single-bit modulation bitmask: bit 0 = OOK supported.
        supportedModulations: 1 << RadioFrequencyModulation.OOK
      });
    });

    const entity = client.getEntityById(entityId("radio_frequency", "rf_module")) as RadioFrequencyEntity | null;

    assert.notEqual(entity, null);
    assert.equal(entity?.type, "radio_frequency");
    assert.equal(entity?.key, 0xabcd);
    assert.equal(entity?.capabilities, 0x3);
    assert.equal(entity?.frequencyMin, 433000000);
    assert.equal(entity?.frequencyMax, 434000000);
    assert.equal(entity?.supportedModulations, 1);

    client.disconnect();
  });
});

// 3. Receive event disambiguation - the architectural proof that handleTelemetry routes id 137 by the entity's type, not by message-type-first-match.

describe("INFRARED_RF_RECEIVE_EVENT (id 137) disambiguation by entity type", () => {

  test("an IR-registered key emits on the infrared channel with the timings array", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const received: { ir: InfraredEvent[]; rf: RadioFrequencyEvent[] } = { ir: [], rf: [] };

    client.on("infrared", (event): void => { received.ir.push(event); });
    client.on("radio_frequency", (event): void => { received.rf.push(event); });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.RECEIVER,
        key: 0x100,
        name: "IR RX",
        objectId: "ir_rx"
      });
    });

    pushInfraredRFReceiveEvent(transport, { key: 0x100, timings: [ 9000, -4500, 560, -560 ] });
    await delay(5);

    assert.equal(received.ir.length, 1, "the IR entity must receive the event on its own channel");
    assert.equal(received.rf.length, 0, "the RF channel must not see an event for a key registered as IR");
    assert.deepEqual(received.ir[0]?.timings, [ 9000, -4500, 560, -560 ]);
    assert.equal(received.ir[0]?.type, "infrared");
    assert.equal(received.ir[0]?.key, 0x100);

    client.disconnect();
  });

  test("an RF-registered key emits on the radio_frequency channel even though both schemas declare state.messageType 137", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const received: { ir: InfraredEvent[]; rf: RadioFrequencyEvent[] } = { ir: [], rf: [] };

    client.on("infrared", (event): void => { received.ir.push(event); });
    client.on("radio_frequency", (event): void => { received.rf.push(event); });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushRadioFrequencyListEntity(t, {

        capabilities: RadioFrequencyCapabilityFlags.RECEIVER,
        key: 0x200,
        name: "RF RX",
        objectId: "rf_rx"
      });
    });

    pushInfraredRFReceiveEvent(transport, { key: 0x200, timings: [ 100, -200, 300, -400 ] });
    await delay(5);

    assert.equal(received.rf.length, 1, "the RF entity must receive the event on its own channel");
    assert.equal(received.ir.length, 0, "the IR channel must not see an event for a key registered as RF");
    assert.deepEqual(received.rf[0]?.timings, [ 100, -200, 300, -400 ]);
    assert.equal(received.rf[0]?.type, "radio_frequency");
    assert.equal(received.rf[0]?.key, 0x200);

    client.disconnect();
  });

  test("the latest-state cache is updated to carry the most recently received timings", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.RECEIVER,
        key: 0x300,
        name: "IR RX Cache",
        objectId: "ir_rx_cache"
      });
    });

    pushInfraredRFReceiveEvent(transport, { key: 0x300, timings: [ 1, -2, 3 ] });
    await delay(5);

    const cached = client.latest(entityId("infrared", "ir_rx_cache"));

    assert.notEqual(cached, null);
    assert.deepEqual(cached?.timings, [ 1, -2, 3 ]);

    client.disconnect();
  });
});

// 4. transmitRawTimings - encode path, capability guard, and entity-not-found error surface.

describe("EspHomeClient.transmitRawTimings()", () => {

  test("encodes an INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST with the supplied timings, carrier, repeat, and modulation", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.TRANSMITTER,
        key: 0x4000,
        name: "IR TX",
        objectId: "ir_tx"
      });
    });

    transport.outboundFrames.length = 0;

    client.transmitRawTimings(entityId("infrared", "ir_tx"), {

      carrierFrequency: 38000,
      modulation: RadioFrequencyModulation.OOK,
      repeatCount: 1,
      timings: [ 9000, -4500, 560, -560 ]
    });

    await delay(2);

    const frame: CapturedFrame | undefined = transport.outboundFrames.find((f): boolean => f.type === MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST);

    assert.notEqual(frame, undefined);

    // Decode the payload to verify the field values. The fixed32 key field arrives as a 4-byte buffer; the packed timings arrive as a length-delimited buffer of
    // back-to-back zigzag-encoded varints. We do not assert the byte-exact tag ordering because encodeProtoFields determines that; we assert the decoded field values.
    const decoded = decodeProtobuf(frame!.payload, { maxFieldsPerMessage: 64 });
    const keyBytes = decoded[2]?.[0];

    assert.equal(Buffer.isBuffer(keyBytes), true);
    assert.equal((keyBytes as Buffer).readUInt32LE(0), 0x4000);
    assert.equal(decoded[3]?.[0], 38000);
    assert.equal(decoded[4]?.[0], 1);
    assert.equal(decoded[6]?.[0], RadioFrequencyModulation.OOK);

    const timingsField = decoded[5]?.[0];

    assert.equal(Buffer.isBuffer(timingsField), true);
    assert.deepEqual(decodePackedSint32(timingsField as Buffer), [ 9000, -4500, 560, -560 ]);

    client.disconnect();
  });

  test("encodes a radio_frequency transmit through the same shared command schema", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushRadioFrequencyListEntity(t, {

        capabilities: RadioFrequencyCapabilityFlags.TRANSMITTER,
        frequencyMax: 433920000,
        frequencyMin: 433920000,
        key: 0x5000,
        name: "RF TX",
        objectId: "rf_tx",
        supportedModulations: 1 << RadioFrequencyModulation.OOK
      });
    });

    transport.outboundFrames.length = 0;

    client.transmitRawTimings(entityId("radio_frequency", "rf_tx"), {

      carrierFrequency: 433920000,
      modulation: RadioFrequencyModulation.OOK,
      repeatCount: 3,
      timings: [ 350, -1050, 1050, -350 ]
    });

    await delay(2);

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST);

    assert.notEqual(frame, undefined);

    const decoded = decodeProtobuf(frame!.payload, { maxFieldsPerMessage: 64 });

    assert.equal(decoded[3]?.[0], 433920000);
    assert.equal(decoded[4]?.[0], 3);
    assert.deepEqual(decodePackedSint32(decoded[5]?.[0] as Buffer), [ 350, -1050, 1050, -350 ]);

    client.disconnect();
  });

  test("throws ENTITY_NOT_TRANSMITTER on an RX-only IR entity", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      pushInfraredListEntity(t, {

        capabilities: InfraredCapabilityFlags.RECEIVER,
        key: 0x6000,
        name: "RX Only",
        objectId: "rx_only"
      });
    });

    assert.throws(

      () => client.transmitRawTimings(entityId("infrared", "rx_only"), { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] }),
      (err: unknown): boolean => {

        assert.equal(err instanceof ConnectionError, true);
        assert.equal((err as ConnectionError).code, "ENTITY_NOT_TRANSMITTER");
        assert.match((err as Error).message, /not a transmitter/);

        return true;
      }
    );

    client.disconnect();
  });

  test("throws ENTITY_NOT_FOUND on an unregistered id", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (): void => { /* no entities */ });

    assert.throws(

      () => client.transmitRawTimings(entityId("infrared", "ghost"), { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] }),
      (err: unknown): boolean => {

        assert.equal(err instanceof ConnectionError, true);
        assert.equal((err as ConnectionError).code, "ENTITY_NOT_FOUND");

        return true;
      }
    );

    client.disconnect();
  });

  test("treats a missing capabilities bitmask as no transmitter bit set (fail-closed)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnectWithEntities(transport, client, (t): void => {

      // No `capabilities` field on the wire; the host sees `capabilities` as undefined.
      pushInfraredListEntity(t, { key: 0x7000, name: "Missing Cap", objectId: "missing_cap" });
    });

    assert.throws(

      () => client.transmitRawTimings(entityId("infrared", "missing_cap"), { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] }),
      (err: unknown): boolean => {

        assert.equal(err instanceof ConnectionError, true);
        assert.equal((err as ConnectionError).code, "ENTITY_NOT_TRANSMITTER");

        return true;
      }
    );

    client.disconnect();
  });
});

// 5. Schema-table sanity checks - the SSOT chain (state/listEntities/command messageTypes, command + state slot presence).

describe("ENTITY_SCHEMAS infrared and radio_frequency", () => {

  test("infrared schema declares state.messageType 137 (INFRARED_RF_RECEIVE_EVENT)", () => {

    assert.equal(ENTITY_SCHEMAS.infrared.state.messageType, MessageType.INFRARED_RF_RECEIVE_EVENT);
  });

  test("radio_frequency schema declares state.messageType 137 (INFRARED_RF_RECEIVE_EVENT) - shared by design", () => {

    assert.equal(ENTITY_SCHEMAS.radio_frequency.state.messageType, MessageType.INFRARED_RF_RECEIVE_EVENT);
  });

  test("both schemas declare command.messageType 136 (INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST)", () => {

    assert.equal(ENTITY_SCHEMAS.infrared.command?.messageType, MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST);
    assert.equal(ENTITY_SCHEMAS.radio_frequency.command?.messageType, MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST);
  });

  test("infrared schema declares listEntities.messageType 135 and radio_frequency declares 148", () => {

    assert.equal(ENTITY_SCHEMAS.infrared.listEntities.messageType, MessageType.LIST_ENTITIES_INFRARED_RESPONSE);
    assert.equal(ENTITY_SCHEMAS.radio_frequency.listEntities.messageType, MessageType.LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE);
  });

  test("both schemas declare the timings field as sint32-packed at field number 5 on command and field number 3 on state", () => {

    const irCmdField = ENTITY_SCHEMAS.infrared.command?.fields.timings;
    const irStateField = ENTITY_SCHEMAS.infrared.state.fields.timings;
    const rfCmdField = ENTITY_SCHEMAS.radio_frequency.command?.fields.timings;
    const rfStateField = ENTITY_SCHEMAS.radio_frequency.state.fields.timings;

    for(const spec of [ irCmdField, rfCmdField ]) {

      assert.equal(spec?.fieldNumber, 5);
      assert.equal(spec?.valueType, "sint32-packed");
      assert.equal(spec?.wireType, WireType.LENGTH_DELIMITED);
    }

    for(const spec of [ irStateField, rfStateField ]) {

      assert.equal(spec?.fieldNumber, 3);
      assert.equal(spec?.valueType, "sint32-packed");
      assert.equal(spec?.wireType, WireType.LENGTH_DELIMITED);
    }
  });
});

// Referenced here only to keep the type-only import from being flagged as unused.
void ([] as ProtoField[]);

// Reference the encodeKeyFixed32 helper so it is not flagged as an unused local; it is kept on hand for fixture construction.
void encodeKeyFixed32;
