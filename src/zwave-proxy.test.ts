/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * zwave-proxy.test.ts: Unit tests for the ZWaveProxyApi class. Exercises every public method against an in-memory host seam (no transport, no real device). Verifies
 * the byte-pipe wire-format encode, the refcounted-subscription pattern for the AsyncIterable frame view, the cached/uncached homeId fallback, and the
 * reset/reissueOnReconnect lifecycle. The byte-pipe contract is enforced at the test level: adversarial Buffer content (null bytes, high bytes, the Z-Wave SOF byte
 * 0x01) is round-tripped end-to-end with no modification.
 */
import type { CapturedContractFrame, ContractFrameKind } from "./reissuable-subscription-contract.helpers.ts";
import type { FieldValue, ProtoField } from "./protocol/codec.ts";
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import { WireType } from "./protocol/wire-types.ts";
import { ZWaveProxyApi } from "./zwave-proxy.ts";
import type { ZWaveProxyHost } from "./zwave-proxy.ts";
import { ZWaveProxyRequestType } from "./api-constants.ts";
import assert from "node:assert/strict";
import { runReissuableSubscriptionContract } from "./reissuable-subscription-contract.helpers.ts";

interface CapturedFrame {

  payload: Buffer;
  type: number;
}

interface DeviceInfoFixture {

  zwaveHomeId?: number;
  zwaveProxyFeatureFlags?: number;
}

interface HostHandle {

  bus: EventBus<ClientEventsMap>;
  debugLogs: string[];
  host: ZWaveProxyHost;
  sent: CapturedFrame[];
  setDeviceInfo(info: DeviceInfoFixture | null): void;
  warnLogs: string[];
}

// Build a fresh host seam in one call. Each test gets its own bus, captured-frames buffer, and recording logger so assertions stay isolated.
function makeHost(): HostHandle {

  const bus = new EventBus<ClientEventsMap>();
  const sent: CapturedFrame[] = [];
  const debugLogs: string[] = [];
  const warnLogs: string[] = [];
  let deviceInfoFixture: DeviceInfoFixture | null = null;

  const host: ZWaveProxyHost = {

    bus,
    deviceInfo: (): DeviceInfoFixture | null => deviceInfoFixture,
    log: {

      debug: (message: string): void => { debugLogs.push(message); },
      error: (): void => { /* */ },
      info: (): void => { /* */ },
      warn: (message: string): void => { warnLogs.push(message); }
    },
    send: (type: number, payload: Buffer): void => { sent.push({ payload, type }); }
  };

  return {

    bus,
    debugLogs,
    host,
    sent,
    setDeviceInfo: (info: DeviceInfoFixture | null): void => { deviceInfoFixture = info; },
    warnLogs
  };
}

function decodeFields(payload: Buffer): Record<number, FieldValue[]> {

  return decodeProtobuf(payload, { maxFieldsPerMessage: 100 });
}

// Convenience: build a `ZWaveProxyFrame` payload with the supplied raw bytes.
function framePayload(data: Buffer): Buffer {

  const fields: ProtoField[] = [{ fieldNumber: 1, value: data, wireType: WireType.LENGTH_DELIMITED }];

  return encodeProtoFields(fields);
}

// Convenience: build a `ZWaveProxyRequest(HOME_ID_CHANGE)` payload with a 4-byte big-endian home id.
function homeIdChangePayload(homeId: number): Buffer {

  const data = Buffer.alloc(4);

  data.writeUInt32BE(homeId >>> 0, 0);

  const fields: ProtoField[] = [
    { fieldNumber: 1, value: ZWaveProxyRequestType.HOME_ID_CHANGE, wireType: WireType.VARINT },
    { fieldNumber: 2, value: data, wireType: WireType.LENGTH_DELIMITED }
  ];

  return encodeProtoFields(fields);
}

describe("ZWaveProxyApi.available", () => {

  test("returns false before discovery completes (deviceInfo is null)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    assert.equal(api.available, false);
  });

  test("returns false when the device advertises zero feature flags", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveProxyFeatureFlags: 0 });

    assert.equal(api.available, false);
  });

  test("returns true when the device advertises any nonzero feature-flag bitmask", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveProxyFeatureFlags: 1 });
    assert.equal(api.available, true);

    handle.setDeviceInfo({ zwaveProxyFeatureFlags: 0xff });
    assert.equal(api.available, true);
  });
});

describe("ZWaveProxyApi.homeId", () => {

  test("returns null when discovery has not completed", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    assert.equal(api.homeId(), null);
  });

  test("returns null when device-info reports homeId zero (no network joined)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveHomeId: 0, zwaveProxyFeatureFlags: 1 });

    assert.equal(api.homeId(), null);
  });

  test("falls back to device-info homeId when no HOME_ID_CHANGE has been observed", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveHomeId: 0xdeadbeef, zwaveProxyFeatureFlags: 1 });

    assert.equal(api.homeId(), 0xdeadbeef);
  });

  test("returns the cached value after a HOME_ID_CHANGE push, ignoring device-info", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveHomeId: 0x11111111, zwaveProxyFeatureFlags: 1 });

    api.acceptRequest(homeIdChangePayload(0xaabbccdd));

    assert.equal(api.homeId(), 0xaabbccdd);
  });

  test("returns null after a HOME_ID_CHANGE to zero (network left)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveHomeId: 0x12345678, zwaveProxyFeatureFlags: 1 });

    api.acceptRequest(homeIdChangePayload(0));

    assert.equal(api.homeId(), null);
  });

  test("decodes a bit-31-set zwave_home_id from a DEVICE_INFO_RESPONSE wire payload as the unsigned uint32 interpretation", () => {

    // End-to-end coverage of the varint signedness rule: build a DEVICE_INFO_RESPONSE-shaped wire payload with field 24 (zwave_home_id) carrying a varint whose high
    // bit is set, decode it through the real codec, hand the decoded value to the host seam, and confirm ZWaveProxyApi.homeId() reports the correct unsigned value. A
    // varint with bit 31 set must decode to its unsigned uint32 interpretation, 0xDEADBEEF (3735928559), and homeId() must surface it unsigned rather than negative.
    const wirePayload = encodeProtoFields([
      { fieldNumber: 23, value: 0x1, wireType: WireType.VARINT },
      { fieldNumber: 24, value: 0xdeadbeef, wireType: WireType.VARINT }
    ]);
    const fields = decodeFields(wirePayload);
    const decodedHomeId = fields[24]?.[0];

    assert.equal(typeof decodedHomeId, "number");
    assert.equal(decodedHomeId, 0xdeadbeef, "varint field 24 must decode to the unsigned uint32 value 3735928559");

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    handle.setDeviceInfo({ zwaveHomeId: decodedHomeId, zwaveProxyFeatureFlags: fields[23]?.[0] as number });

    assert.equal(api.homeId(), 0xdeadbeef, "client.zwave.homeId() must surface the unsigned uint32 value");
  });

  test("decodes uint32 boundary zwave_home_id values from a DEVICE_INFO_RESPONSE wire payload", () => {

    // Three boundary values that all straddle the int32 / uint32 line: the first bit-31-set value (0x80000000), one near the top (0xFFFFFFFE), and uint32-max
    // (0xFFFFFFFF). Each must round-trip through encode -> readVarint -> ZWaveProxyApi.homeId() with no signed-wraparound loss.
    const boundaries = [ 0x80000000, 0xfffffffe, 0xffffffff ];

    for(const homeId of boundaries) {

      const wirePayload = encodeProtoFields([
        { fieldNumber: 23, value: 0x1, wireType: WireType.VARINT },
        { fieldNumber: 24, value: homeId, wireType: WireType.VARINT }
      ]);
      const fields = decodeFields(wirePayload);
      const decoded = fields[24]?.[0];

      assert.equal(decoded, homeId, "boundary value " + homeId.toString(16) + " must decode unsigned");

      const handle = makeHost();
      const api = new ZWaveProxyApi(handle.host);

      handle.setDeviceInfo({ zwaveHomeId: decoded, zwaveProxyFeatureFlags: 0x1 });

      assert.equal(api.homeId(), homeId, "homeId() must report unsigned boundary " + homeId.toString(16));
    }
  });
});

describe("ZWaveProxyApi.send", () => {

  test("encodes the buffer verbatim into a ZWAVE_PROXY_FRAME field 1", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const frame = Buffer.from([ 0x01, 0x03, 0x00, 0x02, 0xfe ]);

    api.send(frame);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.ZWAVE_PROXY_FRAME);

    const fields = decodeFields(handle.sent[0]!.payload);
    const decoded = fields[1]?.[0];

    assert.ok(Buffer.isBuffer(decoded), "field 1 must be a length-delimited buffer");
    assert.deepEqual(decoded, frame);
  });

  test("round-trips an adversarial buffer (null byte, high byte, Z-Wave SOF byte) byte-for-byte", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    // Z-Wave SOF byte is 0x01; null byte 0x00; high byte 0xff; an internal 0xff plus a low ASCII byte exercise the entire byte range we care about.
    const adversarial = Buffer.from([ 0x00, 0x01, 0xff, 0x41, 0x00, 0xfe, 0x7f, 0x80 ]);

    api.send(adversarial);

    const fields = decodeFields(handle.sent[0]!.payload);
    const decoded = fields[1]?.[0] as Buffer;

    assert.deepEqual(decoded, adversarial);
    assert.equal(decoded.length, adversarial.length);
  });

  test("encodes a zero-length buffer cleanly (length-prefixed empty data)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    api.send(Buffer.alloc(0));

    const fields = decodeFields(handle.sent[0]!.payload);
    const decoded = fields[1]?.[0] as Buffer;

    assert.ok(Buffer.isBuffer(decoded));
    assert.equal(decoded.length, 0);
  });
});

describe("ZWaveProxyApi.frames refcounted subscription", () => {

  test("first subscriber sends SUBSCRIBE; pushed frames yield in order; consumer break sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const iter = api.frames()[Symbol.asyncIterator]();

    // First subscriber should have sent SUBSCRIBE.
    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.ZWAVE_PROXY_REQUEST);

    const subFields = decodeFields(handle.sent[0]!.payload);

    assert.equal(subFields[1]?.[0], ZWaveProxyRequestType.SUBSCRIBE);
    assert.equal(subFields[2], undefined, "SUBSCRIBE carries no data field");

    // Push two frames in order.
    const first = Buffer.from([0xaa]);
    const second = Buffer.from([ 0xbb, 0xcc ]);

    api.acceptFrame(framePayload(first));
    api.acceptFrame(framePayload(second));

    const a = await iter.next();
    const b = await iter.next();

    assert.deepEqual(a.value, first);
    assert.deepEqual(b.value, second);

    // Detach the iterator. The generator's finally should send UNSUBSCRIBE.
    await iter.return?.();

    assert.equal(handle.sent.length, 2);

    const unsubFields = decodeFields(handle.sent[1]!.payload);

    assert.equal(unsubFields[1]?.[0], ZWaveProxyRequestType.UNSUBSCRIBE);
    assert.equal(api.subscriberCount(), 0);
  });

  test("two concurrent consumers share one wire SUBSCRIBE; second detach sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const iterA = api.frames()[Symbol.asyncIterator]();
    const iterB = api.frames()[Symbol.asyncIterator]();

    // Only one SUBSCRIBE on the wire.
    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(), 2);

    api.acceptFrame(framePayload(Buffer.from([0x10])));

    const a = await iterA.next();
    const b = await iterB.next();

    assert.deepEqual(a.value, Buffer.from([0x10]));
    assert.deepEqual(b.value, Buffer.from([0x10]));

    // First detach: no UNSUBSCRIBE yet.
    await iterA.return?.();
    assert.equal(handle.sent.length, 1, "first detach must not send UNSUBSCRIBE");
    assert.equal(api.subscriberCount(), 1);

    // Second detach: UNSUBSCRIBE.
    await iterB.return?.();
    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[1]!.payload)[1]?.[0], ZWaveProxyRequestType.UNSUBSCRIBE);
    assert.equal(api.subscriberCount(), 0);
  });

  test("AbortSignal abort tears down the refcount and sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const controller = new AbortController();
    const iter = api.frames({ signal: controller.signal })[Symbol.asyncIterator]();
    const nextPromise = iter.next();

    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(), 1);

    controller.abort();

    await assert.rejects(nextPromise);

    assert.equal(api.subscriberCount(), 0);
    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[1]!.payload)[1]?.[0], ZWaveProxyRequestType.UNSUBSCRIBE);
  });
});

describe("ZWaveProxyApi.homeIdChanges", () => {

  test("iterates pushed HOME_ID_CHANGE notifications", async () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const iter = api.homeIdChanges()[Symbol.asyncIterator]();

    api.acceptRequest(homeIdChangePayload(0x11223344));
    api.acceptRequest(homeIdChangePayload(0));

    const a = await iter.next();
    const b = await iter.next();

    assert.equal(a.value, 0x11223344);
    assert.equal(b.value, 0);

    await iter.return?.();
  });

  test("does NOT send a wire-side subscribe/unsubscribe (home-id pushes are unsolicited)", async () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const iter = api.homeIdChanges()[Symbol.asyncIterator]();

    assert.equal(handle.sent.length, 0, "homeIdChanges must not generate a wire-side subscribe");

    await iter.return?.();

    assert.equal(handle.sent.length, 0, "homeIdChanges must not generate a wire-side unsubscribe on detach");
  });
});

describe("ZWaveProxyApi.acceptFrame", () => {

  test("decodes the wire frame and emits zwaveFrame on the bus", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: Buffer[] = [];

    handle.bus.on("zwaveFrame", (frame: Buffer): void => { captured.push(frame); });

    api.acceptFrame(framePayload(Buffer.from([ 0xaa, 0xbb, 0xcc ])));

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], Buffer.from([ 0xaa, 0xbb, 0xcc ]));
  });

  test("a frame with no data field is dropped at debug (forward-compatible keepalive shape)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: Buffer[] = [];

    handle.bus.on("zwaveFrame", (frame: Buffer): void => { captured.push(frame); });

    api.acceptFrame(Buffer.alloc(0));

    assert.equal(captured.length, 0);
    assert.equal(handle.debugLogs.length, 1);
    assert.match(handle.debugLogs[0]!, /ZWaveProxyFrame without a valid data field/);
  });
});

describe("ZWaveProxyApi.acceptRequest", () => {

  test("HOME_ID_CHANGE emits zwaveHomeIdChange and updates the cached homeId", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: number[] = [];

    handle.bus.on("zwaveHomeIdChange", (homeId: number): void => { captured.push(homeId); });

    api.acceptRequest(homeIdChangePayload(0xaabbccdd));

    assert.deepEqual(captured, [0xaabbccdd]);
    assert.equal(api.homeId(), 0xaabbccdd);
  });

  test("an unknown request type is logged at debug and dropped (forward-compatible)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: number[] = [];

    handle.bus.on("zwaveHomeIdChange", (homeId: number): void => { captured.push(homeId); });

    // Type 99 is not in the ZWaveProxyRequestType enum; a future firmware may add it. The handler must log at debug and drop the message.
    const fields: ProtoField[] = [{ fieldNumber: 1, value: 99, wireType: WireType.VARINT }];

    assert.doesNotThrow(() => api.acceptRequest(encodeProtoFields(fields)));

    assert.equal(captured.length, 0);
    assert.equal(handle.debugLogs.length, 1);
    assert.match(handle.debugLogs[0]!, /unsupported type 99/);
  });

  test("HOME_ID_CHANGE with invalid data length is logged at debug and dropped", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: number[] = [];

    handle.bus.on("zwaveHomeIdChange", (homeId: number): void => { captured.push(homeId); });

    const fields: ProtoField[] = [
      { fieldNumber: 1, value: ZWaveProxyRequestType.HOME_ID_CHANGE, wireType: WireType.VARINT },
      { fieldNumber: 2, value: Buffer.from([ 0x01, 0x02 ]), wireType: WireType.LENGTH_DELIMITED }
    ];

    assert.doesNotThrow(() => api.acceptRequest(encodeProtoFields(fields)));

    assert.equal(captured.length, 0);
    assert.equal(handle.debugLogs.length, 1);
    assert.match(handle.debugLogs[0]!, /invalid data length/);
  });

  test("HOME_ID_CHANGE with missing data field is logged at debug and dropped", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const captured: number[] = [];

    handle.bus.on("zwaveHomeIdChange", (homeId: number): void => { captured.push(homeId); });

    const fields: ProtoField[] = [{ fieldNumber: 1, value: ZWaveProxyRequestType.HOME_ID_CHANGE, wireType: WireType.VARINT }];

    assert.doesNotThrow(() => api.acceptRequest(encodeProtoFields(fields)));

    assert.equal(captured.length, 0);
    assert.equal(handle.debugLogs.length, 1);
  });
});

describe("ZWaveProxyApi.clearConnectionState and reissueOnReconnect", () => {

  test("clearConnectionState clears the cached homeId but PRESERVES the subscriber ledger", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    api.acceptRequest(homeIdChangePayload(0xaabbccdd));

    const iter = api.frames()[Symbol.asyncIterator]();

    assert.equal(api.subscriberCount(), 1);
    assert.equal(api.homeId(), 0xaabbccdd);

    api.clearConnectionState();

    // The subscriber ledger survives clearConnectionState - the iterator is still open across the reconnect cycle - so the count stays 1; only the cached homeId clears.
    assert.equal(api.subscriberCount(), 1, "clearConnectionState must PRESERVE the subscriber ledger");
    assert.equal(api.homeId(), null);

    void iter.return?.();
  });

  test("after clearConnectionState, homeId() falls back to the new device-info value (not the stale cache)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    api.acceptRequest(homeIdChangePayload(0xaabbccdd));
    api.clearConnectionState();

    handle.setDeviceInfo({ zwaveHomeId: 0x55667788, zwaveProxyFeatureFlags: 1 });

    assert.equal(api.homeId(), 0x55667788);
  });

  test("after clearConnectionState, homeId() returns null when the new device-info has homeId zero", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    api.acceptRequest(homeIdChangePayload(0xaabbccdd));
    api.clearConnectionState();

    handle.setDeviceInfo({ zwaveHomeId: 0, zwaveProxyFeatureFlags: 1 });

    assert.equal(api.homeId(), null);
  });

  test("a surviving iterator is re-SUBSCRIBEd after the host's clearConnectionState + reissueOnReconnect cycle (must-fix #2)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    // Open an iterator and leave it parked (no iteration) - exactly modeling a consumer in `for await` across a reconnect.
    const iter = api.frames()[Symbol.asyncIterator]();

    // First SUBSCRIBE on initial subscribe.
    assert.equal(handle.sent.length, 1);

    // Drive the host's real connect-top order: clearConnectionState() then reissueOnReconnect(). The subscriber ledger survives clearConnectionState, so reissue replays
    // SUBSCRIBE for the still-live consumer WITHOUT the iterator being touched.
    api.clearConnectionState();
    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 2, "reissueOnReconnect must re-SUBSCRIBE the surviving iterator");
    assert.equal(decodeFields(handle.sent[1]!.payload)[1]?.[0], ZWaveProxyRequestType.SUBSCRIBE);

    void iter.return?.();
  });

  test("reissueOnReconnect is a no-op when no iterator is alive", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);

    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 0);
  });

  test("reissueOnReconnect re-sends SUBSCRIBE when subscribers are preserved (no clearConnectionState between attach and reissue)", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const iter = api.frames()[Symbol.asyncIterator]();

    // Initial SUBSCRIBE.
    assert.equal(handle.sent.length, 1);

    // reissueOnReconnect clears the wire cache internally and replays the desired state for the live key, so it re-emits SUBSCRIBE even without a preceding
    // clearConnectionState call.
    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[1]!.payload)[1]?.[0], ZWaveProxyRequestType.SUBSCRIBE);

    void iter.return?.();
  });
});

describe("ZWaveProxyApi util.inspect.custom", () => {

  test("renders a human-readable summary with frameSubscribers and observedHomeId", () => {

    const handle = makeHost();
    const api = new ZWaveProxyApi(handle.host);
    const inspectorKey = Symbol.for("nodejs.util.inspect.custom");
    const inspector = (api as unknown as Record<symbol, (depth: number, options: { stylize: (text: string, style: string) => string }) => string>)[inspectorKey]!;

    const output = inspector.call(api, 0, { stylize: (text: string): string => text });

    assert.match(output, /ZWaveProxyApi/);
    assert.match(output, /"frameSubscribers":0/);
    assert.match(output, /"observedHomeId":null/);
  });
});

// Drive the shared reissuable-subscription contract harness against the Z-Wave global frame channel. The harness asserts its canonical guarantees (first-subscriber
// SUBSCRIBE / concurrent share / last-release UNSUBSCRIBE, reconnect-survival, dispose-after-reconnect, and clearConnectionState-alone wire-silence) so the
// Z-Wave sub-API proves the same contract every migrated sub-API does. Z-Wave is a single global wire key, so classify ignores the key and branches purely on the
// ZWAVE_PROXY_REQUEST type field.
runReissuableSubscriptionContract<ZWaveProxyApi>({

  classify: (frame: CapturedContractFrame): ContractFrameKind => {

    if(frame.type !== MessageType.ZWAVE_PROXY_REQUEST) {

      return "other";
    }

    const type = decodeFields(frame.payload)[1]?.[0];

    if(type === ZWaveProxyRequestType.SUBSCRIBE) {

      return "subscribe";
    }

    if(type === ZWaveProxyRequestType.UNSUBSCRIBE) {

      return "unsubscribe";
    }

    return "other";
  },
  label: "ZWaveProxyApi.frames",
  openSubscription: (api: ZWaveProxyApi) => {

    // Open the iterator under an AbortController and start it so it enters its try/finally and parks in `for await` - exactly modeling a consumer parked across a
    // reconnect. release() aborts the controller, which rejects the parked inner stream next, unwinds the `for await`, and runs the cleanup finally (the subscription
    // release). We swallow the parked promise's abort rejection so it does not surface as an unhandled rejection.
    const controller = new AbortController();
    const iter = api.frames({ signal: controller.signal })[Symbol.asyncIterator]();
    const parked = iter.next();

    // The abort below settles this; the rejection is expected teardown, not a failure.
    parked.catch((): void => { /* Expected teardown rejection, not a failure. */ });

    return { release: async (): Promise<void> => {

      controller.abort();

      // Await the parked next so the generator's finally (the subscription release) has run before the harness asserts on the wire effects. The rejection here
      // is the expected abort, not a failure.
      await parked.catch((): void => { /* Expected abort rejection, not a failure. */ });
    } };
  },
  setup: () => {

    const handle = makeHost();

    return { api: new ZWaveProxyApi(handle.host), sent: handle.sent };
  }
});
