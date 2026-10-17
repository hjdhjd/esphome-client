/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-transport.test.ts: Helper-coverage-parity tests for the MockTransport test helper.
 */
import type { Entity, InfraredEntity } from "../schemas/index.ts";
import { EspHomeClient, openEspHomeClient } from "../esphome-client.ts";
import { InfraredCapabilityFlags, SerialProxyPortType } from "../api-constants.ts";
import { MockTransport, MockTransportPhase, mockNoiseHandshakeExchange, pushDeviceInfo, pushHandshake, pushInfraredListEntity } from "./mock-transport.ts";
import { describe, test } from "node:test";
import { mockDeviceInfo, mockEntityDiscovery } from "./factories.ts";
import { Buffer } from "node:buffer";
import type { DeviceInfo } from "../esphome-client.ts";
import { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EspHomeLogging } from "../types.ts";
import type { InboundMessage } from "../transport.ts";
import { MessageType } from "../protocol/message-types.ts";
import type { SubDevice } from "../sub-device.ts";
import assert from "node:assert/strict";
import { decodeProtobuf } from "../protocol/codec.ts";
import { entityId } from "../entity-id.ts";
import { setImmediate as settle } from "node:timers/promises";

// The decode bound for reading a queued frame's payload back field by field.
const DECODE_OPTIONS = { maxFieldsPerMessage: 64 };

// Drain every frame queued on a transport. Disposing the transport first ends its inbound stream after the last queued frame, so the drain returns exactly what was
// queued by the time of the call and never parks awaiting another frame.
async function drainQueued(transport: MockTransport): Promise<InboundMessage[]> {

  const frames: InboundMessage[] = [];

  transport[Symbol.dispose]();

  for await (const frame of transport) {

    frames.push(frame);
  }

  return frames;
}

// A client logger that discards every level. A row that reads the client's warnings overrides the warn level with its own capture.
function quietLogger(): EspHomeLogging {

  return { debug: (): void => undefined, error: (): void => undefined, info: (): void => undefined, warn: (): void => undefined };
}

// Open a real client over a transport the row has already primed. The client has no encryption key because the mock cannot run a Noise handshake, and it neither
// retries nor reconnects, so a connect that cannot finish fails the row within the short timeout rather than hanging it.
async function openPrimedClient(transport: MockTransport, logger: EspHomeLogging = quietLogger()): Promise<EspHomeClient> {

  return openEspHomeClient({

    connectTimeoutMs: 500, host: "test.local", logger, maxConstructionRetries: 0, reconnect: false, transportFactory: (): MockTransport => transport
  });
}

describe("MockTransport phase transitions", () => {

  test("starts in plaintext phase", () => {

    const t = new MockTransport();

    assert.equal(t.phase, MockTransportPhase.PLAINTEXT);
    assert.equal(t.isEncrypted, false);
  });

  test("enterNoiseHandshake transitions to noise-handshake", () => {

    const t = new MockTransport();

    t.enterNoiseHandshake();

    assert.equal(t.phase, MockTransportPhase.NOISE_HANDSHAKE);
    assert.equal(t.isEncrypted, false, "noise-handshake is not yet encrypted");
  });

  test("installCipher transitions to noise-data and sets isEncrypted", () => {

    const t = new MockTransport();
    const cipher = { receiveCipher: { k: Buffer.alloc(32), n: 0n } as never, sendCipher: { k: Buffer.alloc(32), n: 0n } as never };

    t.installCipher(cipher);

    assert.equal(t.phase, MockTransportPhase.NOISE_DATA);
    assert.equal(t.isEncrypted, true);
    assert.equal(t.cipher, cipher);
  });

});

describe("MockTransport outbound capture", () => {

  test("captures send() calls in order", async () => {

    const t = new MockTransport();

    await t.send(1, Buffer.from([0x01]));
    await t.send(2, Buffer.from([ 0x02, 0x03 ]));

    assert.equal(t.outboundFrames.length, 2);
    assert.equal(t.outboundFrames[0]?.type, 1);
    assert.deepEqual(t.outboundFrames[0]?.payload, Buffer.from([0x01]));
    assert.equal(t.outboundFrames[0]?.encrypted, false, "plaintext phase -> encrypted=false");
    assert.equal(t.outboundFrames[1]?.type, 2);
  });

  test("send() in noise-data phase tags captured frames as encrypted", async () => {

    const t = new MockTransport();

    t.installCipher({ receiveCipher: {} as never, sendCipher: {} as never });
    await t.send(7, Buffer.from([0xff]));

    assert.equal(t.outboundFrames[0]?.encrypted, true);
  });

  test("captures sendNoiseHandshakeFrame separately from send", async () => {

    const t = new MockTransport();

    await t.sendNoiseHandshakeFrame(Buffer.from([0xaa]));

    assert.equal(t.outboundHandshakeFrames.length, 1);
    assert.deepEqual(t.outboundHandshakeFrames[0], Buffer.from([0xaa]));
    assert.equal(t.outboundFrames.length, 0, "handshake frames are not captured in the typed outbound list");
  });
});

describe("MockTransport inbound queueing", () => {

  test("pushInbound enqueues a message that the iterator yields", async () => {

    const t = new MockTransport();

    t.pushInbound(1, Buffer.from([0x42]));

    const it = t[Symbol.asyncIterator]();
    const result = await it.next();

    assert.equal(result.done, false);
    assert.equal(result.value?.type, 1);
    assert.deepEqual(result.value?.payload, Buffer.from([0x42]));
  });

  test("pushFirstByte enqueues a byte that firstByte() resolves with", async () => {

    const t = new MockTransport();

    t.pushFirstByte(0x00);

    assert.equal(await t.firstByte(), 0x00);
  });

  test("pushNoiseHandshakeFrame enqueues a frame that nextNoiseHandshakeFrame resolves with", async () => {

    const t = new MockTransport();

    t.pushNoiseHandshakeFrame(Buffer.from([ 0x01, 0x02 ]));

    assert.deepEqual(await t.nextNoiseHandshakeFrame(), Buffer.from([ 0x01, 0x02 ]));
  });

  test("firstByte parks an awaiter when no byte is queued yet", async () => {

    const t = new MockTransport();
    const promise = t.firstByte();

    setImmediate(() => t.pushFirstByte(0x01));

    assert.equal(await promise, 0x01);
  });

  test("nextNoiseHandshakeFrame parks an awaiter when no frame is queued yet", async () => {

    const t = new MockTransport();
    const promise = t.nextNoiseHandshakeFrame();

    setImmediate(() => t.pushNoiseHandshakeFrame(Buffer.from([0xee])));

    assert.deepEqual(await promise, Buffer.from([0xee]));
  });

  test("iterator parks when no message is queued yet, resolves on push", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    setImmediate(() => t.pushInbound(5, Buffer.from([0x99])));

    const result = await promise;

    assert.equal(result.done, false);
    assert.equal(result.value?.type, 5);
  });
});

describe("MockTransport whenIdle", () => {

  test("resolves once the consumer drains every pushed frame and parks", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const consumed: number[] = [];

    // Background consumer pulls frames until the transport is disposed; it parks whenever the queue is empty.
    const consumer = (async (): Promise<void> => {

      for(;;) {

        const result = await it.next();

        if(result.done) {

          break;
        }

        consumed.push(result.value.type);
      }
    })();

    t.pushInbound(1, Buffer.from([0]));
    t.pushInbound(2, Buffer.from([0]));
    t.pushInbound(3, Buffer.from([0]));

    await t.whenIdle();

    // whenIdle resolved only after the consumer pulled all three frames and parked - deterministic, no timer.
    assert.deepEqual(consumed, [ 1, 2, 3 ]);

    t[Symbol.dispose]();
    await consumer;
  });

  test("resolves immediately when the consumer is already parked on an empty queue", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const pending = it.next();

    await t.whenIdle();

    t.pushInbound(7, Buffer.from([0]));

    const result = await pending;

    assert.equal(result.value?.type, 7);
  });

  test("resolves after disposal (a terminated transport consumes nothing further)", async () => {

    const t = new MockTransport();

    t[Symbol.dispose]();

    await t.whenIdle();
  });

  test("a wait pending when fail() runs resolves (a failed transport consumes nothing further)", async () => {

    const t = new MockTransport();

    // A queued frame with no consumer parked holds the wait pending until something ends the transport.
    t.pushInbound(1, Buffer.from([0]));

    const idle = t.whenIdle().then((): string => "settled");

    assert.equal(await Promise.race([ idle, settle("pending") ]), "pending", "the wait must be pending before fail() runs");

    t.fail(new Error("peer reset"));

    assert.equal(await Promise.race([ idle, settle("pending") ]), "settled", "fail() must settle the pending wait");
  });

  test("a wait pending when the inbound iterator's return() runs resolves (an ended stream consumes nothing further)", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();

    t.pushInbound(1, Buffer.from([0]));

    const idle = t.whenIdle().then((): string => "settled");

    assert.equal(await Promise.race([ idle, settle("pending") ]), "pending", "the wait must be pending before return() runs");

    await it.return?.();

    assert.equal(await Promise.race([ idle, settle("pending") ]), "settled", "the iterator's return() must settle the pending wait");
  });
});

describe("MockTransport abort handling", () => {

  test("firstByte rejects when the abort signal fires", async () => {

    const t = new MockTransport();
    const controller = new AbortController();
    const promise = t.firstByte(controller.signal);

    controller.abort();

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason, "abort signal must reject the parked firstByte awaiter");
  });

  test("nextNoiseHandshakeFrame rejects when the abort signal fires", async () => {

    const t = new MockTransport();
    const controller = new AbortController();
    const promise = t.nextNoiseHandshakeFrame(controller.signal);

    controller.abort();

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason);
  });

  test("firstByte called with a pre-aborted signal rejects synchronously", async () => {

    const t = new MockTransport();
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(t.firstByte(controller.signal), { name: "AbortError" });
  });
});

describe("MockTransport.fail (simulating fatal transport error)", () => {

  test("makes pending firstByte awaiters reject with the supplied error", async () => {

    const t = new MockTransport();
    const promise = t.firstByte();

    t.fail(new Error("peer reset"));

    await assert.rejects(promise, /peer reset/);
  });

  test("makes pending iterator awaiters reject with the supplied error", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    t.fail(new Error("transport down"));

    await assert.rejects(promise, /transport down/);
  });

  test("subsequent send() calls reject with the same error", async () => {

    const t = new MockTransport();

    t.fail(new Error("dead"));

    await assert.rejects(t.send(1, Buffer.alloc(0)), /dead/);
    await assert.rejects(t.sendNoiseHandshakeFrame(Buffer.alloc(0)), /dead/);
  });

  test("fail is safe to call more than once - calling twice does not throw", () => {

    const t = new MockTransport();

    t.fail(new Error("first"));

    assert.doesNotThrow(() => t.fail(new Error("second")));
  });
});

describe("MockTransport disposal", () => {

  test("Symbol.dispose terminates pending awaiters cleanly", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    t[Symbol.dispose]();

    const result = await promise;

    assert.equal(result.done, true, "iterator must end cleanly on dispose");
  });

  test("Symbol.asyncDispose calls Symbol.dispose synchronously", async () => {

    const t = new MockTransport();

    await t[Symbol.asyncDispose]();

    // After async dispose, push should be a no-op.
    t.pushInbound(1, Buffer.alloc(0));

    const it = t[Symbol.asyncIterator]();
    const result = await it.next();

    assert.equal(result.done, true, "after dispose, the iterator yields done immediately");
  });

  test("dispose is safe to call more than once", () => {

    const t = new MockTransport();

    t[Symbol.dispose]();

    assert.doesNotThrow(() => t[Symbol.dispose]());
  });
});

describe("mockNoiseHandshakeExchange factory", () => {

  test("returns the placeholder shape for a valid 32-byte PSK", () => {

    const psk = Buffer.alloc(32, 0x42).toString("base64");
    const result = mockNoiseHandshakeExchange(psk);

    assert.equal(Buffer.isBuffer(result.serverHello), true);
    assert.equal(Buffer.isBuffer(result.serverHandshake), true);
  });

  test("throws on a PSK shorter than 32 bytes", () => {

    const shortPsk = Buffer.alloc(16, 0).toString("base64");

    assert.throws(() => mockNoiseHandshakeExchange(shortPsk), /32-byte/);
  });

  test("throws on a PSK longer than 32 bytes", () => {

    const longPsk = Buffer.alloc(64, 0).toString("base64");

    assert.throws(() => mockNoiseHandshakeExchange(longPsk), /32-byte/);
  });

  test("throws on an empty string", () => {

    assert.throws(() => mockNoiseHandshakeExchange(""), /32-byte/);
  });
});

describe("MockTransportPhase const-object", () => {

  test("declares the three phase values", () => {

    assert.equal(MockTransportPhase.PLAINTEXT, "plaintext");
    assert.equal(MockTransportPhase.NOISE_HANDSHAKE, "noise-handshake");
    assert.equal(MockTransportPhase.NOISE_DATA, "noise-data");
  });

  test("the three values are pairwise distinct", () => {

    assert.equal(new Set(Object.values(MockTransportPhase)).size, 3);
  });
});

describe("pushHandshake", () => {

  test("queues the hello, the device information, the entities, the services, the discovery frames, and the end of discovery, in order, before it returns", async () => {

    const transport = new MockTransport();

    pushHandshake(transport, {

      discovery: (target): void => { target.pushInbound(MessageType.PING_REQUEST, Buffer.alloc(0)); },
      entities: [{ key: 1, name: "Kitchen Lamp", objectId: "kitchen_lamp", type: "light" }],
      services: [{ key: 2, name: "reboot" }]
    });

    assert.deepEqual((await drainQueued(transport)).map((frame): number => frame.type), [ MessageType.HELLO_RESPONSE, MessageType.DEVICE_INFO_RESPONSE,
      ENTITY_SCHEMAS.light.listEntities.messageType, MessageType.LIST_ENTITIES_SERVICES_RESPONSE, MessageType.PING_REQUEST, MessageType.LIST_ENTITIES_DONE_RESPONSE ]);
  });

  test("queues a protocol 1.12 hello and list frames carrying the schema's identity fields", async () => {

    const transport = new MockTransport();
    const listEntities = ENTITY_SCHEMAS.switch.listEntities;
    const key = Buffer.alloc(4);

    key.writeUInt32LE(0xCAFE0001, 0);

    pushHandshake(transport, { entities: [{ key: 0xCAFE0001, name: "Front Door", objectId: "front_door", type: "switch" }] });

    const [ hello, , entity ] = await drainQueued(transport);

    assert.deepEqual(decodeProtobuf(hello?.payload ?? Buffer.alloc(0), DECODE_OPTIONS),
      { 1: [1], 2: [12], 3: [Buffer.from("test-server", "utf8")], 4: [Buffer.from("test-device", "utf8")] }, "the hello must announce protocol 1.12");
    assert.equal(entity?.type, listEntities.messageType, "the entity frame must carry the schema's list-entities message type");
    assert.deepEqual(decodeProtobuf(entity?.payload ?? Buffer.alloc(0), DECODE_OPTIONS), {

      [listEntities.keyFieldNumber]: [key],
      [listEntities.nameFieldNumber]: [Buffer.from("Front Door", "utf8")],
      [listEntities.objectIdFieldNumber]: [Buffer.from("front_door", "utf8")]
    }, "the entity frame must carry the object id, the key, and the name at the schema's field numbers");
  });

  test("primes a transport so a client opened without an encryption key connects and sends no CONNECT_REQUEST", async () => {

    const transport = new MockTransport();

    pushHandshake(transport);

    using client = await openPrimedClient(transport);

    assert.equal(client.health().state, "connected");
    assert.equal(transport.outboundFrames.some((frame): boolean => frame.type === MessageType.CONNECT_REQUEST), false,
      "the hello's protocol version must let the client skip the legacy CONNECT exchange");
  });

  test("connects with mockDeviceInfo()'s record when the options give no device information", async () => {

    const transport = new MockTransport();

    pushHandshake(transport);

    using client = await openPrimedClient(transport);

    assert.deepEqual(client.deviceInfo(), mockDeviceInfo());
  });

  test("round-trips a device information record defining every member, and sub-devices with and without names and area ids", async () => {

    const transport = new MockTransport();

    // The record type requires every member, so a member added to DeviceInfo fails to compile here until the round trip covers it.
    const deviceInfo: Required<DeviceInfo> = {

      apiEncryptionSupported: true,
      bluetoothMacAddress: "11:22:33:44:55:66",
      bluetoothProxyFeatureFlags: 0x3F,
      compilationTime: "2026-10-03 12:00:00",
      esphomeVersion: "2026.10.0",
      friendlyName: "Garage Controller",
      hasDeepSleep: true,
      legacyBluetoothProxyVersion: 5,
      legacyVoiceAssistantVersion: 2,
      macAddress: "AA:BB:CC:00:11:22",
      manufacturer: "Espressif",
      model: "esp32-c6",
      name: "garage-controller",
      projectName: "acme.garage",
      projectVersion: "1.2.3",
      serialProxies: [ { name: "uart_0", portType: SerialProxyPortType.TTL }, { name: "rs485_bus", portType: SerialProxyPortType.RS485 } ],
      suggestedArea: "Garage",
      usesPassword: true,
      voiceAssistantFeatureFlags: 5,
      webserverPort: 80,
      zwaveHomeId: 0xDEADBEEF,
      zwaveProxyFeatureFlags: 1
    };
    const subDevices: SubDevice[] = [ { areaId: 7, id: 1, name: "Left Door" }, { id: 2, name: "Right Door" }, { areaId: 9, id: 3 }, { id: 4 } ];

    pushHandshake(transport, { deviceInfo, subDevices });

    using client = await openPrimedClient(transport);

    assert.deepEqual(client.deviceInfo(), deviceInfo);
    assert.deepEqual(client.subDevices(), subDevices);
  });

  test("discovers entities across types with their identity fields and device id, and services with their names and keys", async () => {

    const transport = new MockTransport();

    // The sensor belongs to a sub-device, so its list frame carries a device id the others omit.
    const entities = mockEntityDiscovery({ light: ["kitchen_lamp"], sensor: ["outdoor_temperature"], switch: ["front_door"] })
      .map((entity): Entity => (entity.type === "sensor") ? { ...entity, deviceId: 2 } : entity);
    const services = [ { key: 0xCAFE0001, name: "reboot" }, { key: 0xCAFE0002, name: "identify" } ];
    const identity = ({ deviceId, key, name, objectId, type }: Entity): Record<string, unknown> => ({ deviceId, key, name, objectId, type });

    pushHandshake(transport, { entities, services });

    using client = await openPrimedClient(transport);

    assert.deepEqual(client.getEntitiesWithIds().map(identity), entities.map(identity));
    assert.deepEqual(client.services.list().map(({ key, name }) => ({ key, name })), services);
  });

  test("connects with every entity of a discovery far past the setup buffer's per-type mark, in order, and logs no warning", async () => {

    const transport = new MockTransport();
    const warnings: unknown[][] = [];

    // The discovery holds far more entities of one type than the receiver's per-type setup-buffer mark, and every frame is queued before the client reads any, so the
    // whole list waits in that buffer at once.
    const entities = mockEntityDiscovery({ switch: Array.from({ length: 40 }, (_, index): string => "switch_" + String(index)) });

    pushHandshake(transport, { entities });

    using client = await openPrimedClient(transport, { ...quietLogger(), warn: (...parameters: unknown[]): void => { warnings.push(parameters); } });

    assert.deepEqual(client.getEntitiesWithIds().map((entity): string => entity.id), entities.map((entity): string => entityId(entity.type, entity.objectId)),
      "every entity must be registered, in the order the discovery listed it");
    assert.deepEqual(warnings, [], "a discovery past the per-type mark must not trip the setup buffer's drop warning");
  });

  test("lands a discovery callback's infrared list frame inside discovery, its capabilities included", async () => {

    const transport = new MockTransport();
    const capabilities = InfraredCapabilityFlags.TRANSMITTER | InfraredCapabilityFlags.RECEIVER;

    using client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    // The row reads the entity list the connect announces rather than the registry. A list frame queued after the end of discovery still reaches the registry through
    // the client's run-phase late-discovery path, but only a frame inside discovery belongs to the list the connect announces.
    const announced = client.once("entities", { signal: AbortSignal.timeout(500) });

    pushHandshake(transport, {

      discovery: (target): void => { pushInfraredListEntity(target, { capabilities, key: 0x1234, name: "IR Blaster", objectId: "ir_blaster" }); }
    });

    await client.connect({ signal: AbortSignal.timeout(500) });

    assert.equal((await announced).find((entity): entity is InfraredEntity => entity.type === "infrared")?.capabilities, capabilities,
      "the connect's entity list must carry the infrared entity with its capabilities");
  });
});

describe("pushDeviceInfo", () => {

  test("queues exactly one DEVICE_INFO_RESPONSE frame before it returns", async () => {

    const transport = new MockTransport();

    pushDeviceInfo(transport);

    assert.deepEqual((await drainQueued(transport)).map((frame): number => frame.type), [MessageType.DEVICE_INFO_RESPONSE]);
  });

  test("queues the payload pushHandshake queues for the same device information and sub-devices", async () => {

    const options = { deviceInfo: mockDeviceInfo({ friendlyName: "Porch Controller" }), subDevices: [ { areaId: 4, id: 1, name: "Porch Light" }, { id: 2 } ] };
    const handshake = new MockTransport();
    const alone = new MockTransport();

    pushHandshake(handshake, options);
    pushDeviceInfo(alone, options);

    const [aloneFrame] = await drainQueued(alone);

    assert.notEqual(aloneFrame, undefined);
    assert.deepEqual((await drainQueued(handshake)).find((frame): boolean => frame.type === MessageType.DEVICE_INFO_RESPONSE)?.payload, aloneFrame?.payload);
  });

  test("refreshes a connected client's device information as a run-phase frame", async () => {

    const transport = new MockTransport();

    pushHandshake(transport);

    using client = await openPrimedClient(transport);

    pushDeviceInfo(transport, { deviceInfo: mockDeviceInfo({ friendlyName: "Renamed Controller" }) });
    await transport.whenIdle();

    assert.equal(client.deviceInfo()?.friendlyName, "Renamed Controller");
  });
});
