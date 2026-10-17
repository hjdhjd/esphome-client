/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.test.ts: Integration enumeration for the host class - synthesized handshake-byte fixtures driving MockTransport end-to-end through the
 * full connect -> discover -> ready -> state-fanout -> disconnect sequence, plus per-method delegation, lifecycle event ordering, error-class enumeration, and
 * byte-level wire fixtures that double as the protocol reference for the connect path.
 */
import type {
  AlarmControlPanelEvent, ClimateEvent, CoverEvent, DateEvent, DateTimeEvent, Entity, EntitySchema, EntityType, EventEntityEvent, FanEvent, LightEvent, LockEvent,
  MediaPlayerEvent, NumberEvent, SelectEvent, SensorEvent, SirenEvent, SwitchEvent, TextEvent, TextSensorEvent, TimeEvent, UpdateEvent, ValveEvent, WaterHeaterEvent
} from "./schemas/index.ts";
import type { ClientMetrics, Nullable, ServiceEntity } from "./types.ts";
import {
  ConfigurationError, ConnectionClosedByPeerError, ConnectionError, ConnectionLostError, EncryptionKeyInvalidError, EspHomeError, HeartbeatStalledError,
  NegotiationFailedError, NoiseHandshakeError, NotConnectedError, PeerClosedDuringNoiseError, PermanentError
} from "./errors.ts";
import { ENTITY_SCHEMAS, aliasOf, extending } from "./schemas/index.ts";
import { EspHomeClient, openEspHomeClient } from "./esphome-client.ts";
import { LockState, LogLevel, SerialProxyPortType, WaterHeaterMode } from "./api-constants.ts";
import { MockTransport, pushDeviceInfo, pushHandshake, pushInfraredRFReceiveEvent } from "./testing/mock-transport.ts";
import { ProtocolByte, Transport } from "./transport.ts";
import { decodeProtobuf, encodeProtoFields, encodeVarint } from "./protocol/codec.ts";
import { describe, mock, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientCapabilities } from "./capabilities.ts";
import type { ClockFn } from "./heartbeat.ts";
import type { ConnectionHealth } from "./health.ts";
import type { ConnectionScope } from "./connection-scope.ts";
import type { DeviceInfo } from "./esphome-client.ts";
import { MessageType } from "./protocol/message-types.ts";
import { MockSocket } from "./testing/mock-socket.ts";
import { NOISE_PSK_LEN } from "./crypto-noise.ts";
import type { NoiseCipherPair } from "./transport.ts";
import type { ProtoField } from "./protocol/codec.ts";
import type { PushHandshakeOptions } from "./testing/mock-transport.ts";
import type { SerialProxyHost } from "./serial-proxy.ts";
import type { Socket } from "node:net";
import type { TestContext } from "node:test";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";
import { captureTimeoutSignals } from "./timeout-signals.helpers.ts";
import { connectionUptimeMs } from "./health.ts";
import { defaultShouldRetry } from "./reconnect.ts";
import { setTimeout as delay } from "node:timers/promises";
import { disconnectedCapabilities } from "./capabilities.ts";
import { entityId } from "./entity-id.ts";
import { mockDeviceInfo } from "./testing/factories.ts";

// Quiet logger used by every test that constructs an EspHomeClient. Prevents the host's debug/info logging from polluting the test runner output and makes warn/error
// outputs assertable by capturing into in-memory arrays. Each test that wants to inspect the log calls makeLogCapture() to get a fresh isolated logger.
function quietLogger(): { debug: () => void; info: () => void; warn: () => void; error: () => void } {

  return { debug: (): void => undefined, error: (): void => undefined, info: (): void => undefined, warn: (): void => undefined };
}

// The warn sentence the client logs when a consumer's event listener throws.
const LISTENER_FAULT_WARNING = "A client event listener threw; the remaining listeners still received the event.";

interface LogCapture {

  debug: string[];
  error: string[];
  info: string[];
  warn: string[];
  logger: { debug: (...args: unknown[]) => void; info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

function makeLogCapture(): LogCapture {

  const debugMessages: string[] = [];
  const errorMessages: string[] = [];
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];

  return {

    debug: debugMessages,
    error: errorMessages,
    info: infoMessages,
    logger: {

      debug: (...args: unknown[]): void => { debugMessages.push(args.map(String).join(" ")); },
      error: (...args: unknown[]): void => { errorMessages.push(args.map(String).join(" ")); },
      info: (...args: unknown[]): void => { infoMessages.push(args.map(String).join(" ")); },
      warn: (...args: unknown[]): void => { warnMessages.push(args.map(String).join(" ")); }
    },
    warn: warnMessages
  };
}

// Encode a fixed32 entity key (4-byte little-endian unsigned int). Mirrors how api.proto declares `fixed32 key = 1;` for every list-entities and state-response message.
function encodeKey(key: number): Buffer {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(key, 0);

  return buf;
}

// Encode an IEEE-754 little-endian float32. Used for sensor / climate / number / date-time-component fixed32 fields.
function encodeFloat(value: number): Buffer {

  const buf = Buffer.alloc(4);

  buf.writeFloatLE(value, 0);

  return buf;
}

// Synthesized handshake-byte fixtures.
//
// Every fixture in this section is hand-derived from the canonical encode rules in src/protocol/codec.ts, exercised via the production `encodeProtoFields` so the
// bytes emitted here are byte-for-byte identical to what the host would itself encode if it had to re-emit them. The constants double as the wire-protocol reference
// for the connect path: a future contributor can read the names + provenance comments and learn the canonical message shape without leaving the test file.
//
// Naming convention: SCREAMING_SNAKE_CASE constants grouped by message family. Each group's leading factory function documents the schema's field layout.

// HelloResponse payload: field 1 (api_version_major, varint), field 2 (api_version_minor, varint), field 3 (server_info, length-delimited UTF-8), field 4 (name,
// length-delimited UTF-8). Provenance: api.proto §HelloResponse. Derivation: encodeProtoFields with the four fields above.
function helloResponse(major = 1, minor = 12, serverInfo = "test-server", deviceName = "test-device"): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: major, wireType: WireType.VARINT },
    { fieldNumber: 2, value: minor, wireType: WireType.VARINT },
    { fieldNumber: 3, value: Buffer.from(serverInfo, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 4, value: Buffer.from(deviceName, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ]);
}

const HELLO_RESPONSE_PROTOCOL_1_12 = helloResponse(1, 12, "test-server", "test-device");
const HELLO_RESPONSE_PROTOCOL_1_10 = helloResponse(1, 10, "test-server", "test-device");
const HELLO_RESPONSE_PROTOCOL_2_0 = helloResponse(2, 0, "test-server", "test-device");
const HELLO_RESPONSE_PROTOCOL_0_0 = helloResponse(0, 0, "test-server", "test-device");

// ConnectResponse payload: field 1 (invalid_password, varint bool). Provenance: api.proto §ConnectResponse. ESPHome devices using API >= 1.11 do not require this
// message in the handshake at all (modern handshake skips CONNECT_REQUEST), but for legacy 1.10 we must emit it. Derivation: encodeProtoFields with the boolean field.
const CONNECT_RESPONSE_OK = encodeProtoFields([{ fieldNumber: 1, value: 0, wireType: WireType.VARINT }]);

// ListEntitiesDoneResponse payload is empty. Provenance: api.proto §ListEntitiesDoneResponse - the message has no fields.
const LIST_ENTITIES_DONE_RESPONSE = Buffer.alloc(0);

// PingRequest / PingResponse payloads are empty. Provenance: api.proto §PingRequest / §PingResponse.
const PING_REQUEST_PAYLOAD = Buffer.alloc(0);
const PING_RESPONSE_PAYLOAD = Buffer.alloc(0);

// DisconnectRequest / DisconnectResponse payloads are empty. Provenance: api.proto §DisconnectRequest / §DisconnectResponse.
const DISCONNECT_REQUEST_PAYLOAD = Buffer.alloc(0);
const DISCONNECT_RESPONSE_PAYLOAD = Buffer.alloc(0);

// GetTimeResponse payload: field 1 (epoch_seconds, fixed32). Provenance: api.proto §GetTimeResponse - the device sends a fixed32 epoch second count; the client mirrors
// the same shape when responding to a server-issued GetTimeRequest.
function getTimeResponse(epoch: number): Buffer {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(epoch, 0);

  return encodeProtoFields([{ fieldNumber: 1, value: buf, wireType: WireType.FIXED32 }]);
}

const GET_TIME_RESPONSE_FIXTURE = getTimeResponse(0x65000000);

// SubscribeLogsResponse payload: field 1 (level, varint enum), field 3 (message, length-delimited UTF-8), optional field 4 (send_failed, varint bool). Provenance:
// api.proto §SubscribeLogsResponse. Derivation: encodeProtoFields with the three fields.
function logResponse(level: LogLevel, message: string, sendFailed = false): Buffer {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: level, wireType: WireType.VARINT },
    { fieldNumber: 3, value: Buffer.from(message, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ];

  if(sendFailed) {

    fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

const LOG_RESPONSE_INFO = logResponse(LogLevel.INFO, "info-line");
const LOG_RESPONSE_WARN = logResponse(LogLevel.WARN, "warn-line");
const LOG_RESPONSE_ERROR_FAILED = logResponse(LogLevel.ERROR, "error-line", true);

// NoiseEncryptionSetKeyResponse payload: field 1 (success, varint bool). Provenance: api.proto §NoiseEncryptionSetKeyResponse.
const NOISE_KEY_SET_RESPONSE_OK = encodeProtoFields([{ fieldNumber: 1, value: 1, wireType: WireType.VARINT }]);
const NOISE_KEY_SET_RESPONSE_FAIL = encodeProtoFields([{ fieldNumber: 1, value: 0, wireType: WireType.VARINT }]);

// CameraImageResponse payload: field 1 (key, fixed32), field 2 (image bytes, length-delimited), field 3 (done flag, varint bool). Provenance: api.proto
// §CameraImageResponse. Derivation: encodeProtoFields with the three fields.
function cameraImageResponse(key: number, imageData: Buffer, done: boolean): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: encodeKey(key), wireType: WireType.FIXED32 },
    { fieldNumber: 2, value: imageData, wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 3, value: done ? 1 : 0, wireType: WireType.VARINT }
  ]);
}

// HomeAssistantServiceResponse payload: field 1 (service, length-delimited UTF-8), field 2 (repeated map data), field 3 (repeated map variables), field 4 (is_event,
// varint bool). Provenance: api.proto §HomeassistantServiceResponse - this is the "service called from device" inbound surface.
function homeassistantServiceResponse(serviceName: string, isEvent = false): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: Buffer.from(serviceName, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 4, value: isEvent ? 1 : 0, wireType: WireType.VARINT }
  ]);
}

// SubscribeHomeAssistantStateResponse payload: field 1 (entity_id), field 2 (attribute), field 3 (once flag).
// Provenance: api.proto §SubscribeHomeAssistantStateResponse.
function subscribeHomeAssistantStateResponse(haEntityId: string, attribute = "", once = false): Buffer {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: Buffer.from(haEntityId, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ];

  if(attribute) {

    fields.push({ fieldNumber: 2, value: Buffer.from(attribute, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  if(once) {

    fields.push({ fieldNumber: 3, value: 1, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

// ListEntitiesServicesResponse payload: field 1 (name), field 2 (key fixed32), field 3 (repeated argument {name, type}).
// Provenance: api.proto §ListEntitiesServicesResponse.
function listEntitiesServicesResponse(name: string, key: number, args: { name: string; type: number }[] = []): Buffer {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: Buffer.from(name, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 2, value: encodeKey(key), wireType: WireType.FIXED32 }
  ];

  for(const arg of args) {

    const argPayload = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from(arg.name, "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: arg.type, wireType: WireType.VARINT }
    ]);

    fields.push({ fieldNumber: 3, value: argPayload, wireType: WireType.LENGTH_DELIMITED });
  }

  return encodeProtoFields(fields);
}

// Per-entity-type fixture factories.
//
// listEntitiesPayloadFor(type, key, objectId, name) builds the LIST_ENTITIES_*_RESPONSE bytes for any supported entity type. statePayloadFor(type, key, fields)
// builds the matching STATE_*_RESPONSE bytes. Both consult ENTITY_SCHEMAS at the call site so adding a new entity type to the schema registry automatically extends
// these factories with no parallel hand-maintained list.

function listEntitiesPayloadFor(type: EntityType, key: number, objectId: string, name: string): Buffer {

  const schema = ENTITY_SCHEMAS[type];
  const list = schema.listEntities;

  return encodeProtoFields([

    { fieldNumber: list.objectIdFieldNumber, value: Buffer.from(objectId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: list.keyFieldNumber, value: encodeKey(key), wireType: WireType.FIXED32 },
    { fieldNumber: list.nameFieldNumber, value: Buffer.from(name, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ]);
}

// Build a state-response payload using the per-entity-type schema's keyFieldNumber + the provided extra fields. The fields map is keyed by field number; values are
// either numeric (encoded as VARINT) or Buffer (encoded as LENGTH_DELIMITED for strings, FIXED32 for floats).
function statePayloadFor(type: EntityType, key: number, extras: { fieldNumber: number; value: Buffer | number; wireType: WireType }[] = []): Buffer {

  const schema = ENTITY_SCHEMAS[type];
  const fields: ProtoField[] = [

    { fieldNumber: schema.state.keyFieldNumber, value: encodeKey(key), wireType: WireType.FIXED32 }
  ];

  for(const extra of extras) {

    fields.push(extra);
  }

  return encodeProtoFields(fields);
}

// MockTransport drive helpers.

// Drive a fresh client through the canonical plaintext connect -> discover -> ready sequence using the supplied discovery. The whole connect is queued on the transport
// through the testing entry's handshake injector before the connect starts, because the transport holds the frames until the client reads them. After this resolves,
// the client is fully connected, all entities are registered, and the run-phase dispatcher is consuming inbound messages. Tests that don't care about the discovery
// shape pass nothing; those that need entities present pass a list and assert against `client.getEntitiesWithIds()`.
async function driveConnect(transport: MockTransport, client: EspHomeClient, options: PushHandshakeOptions & { signal?: AbortSignal } = {}): Promise<void> {

  pushHandshake(transport, options);
  await client.connect(options.signal !== undefined ? { signal: options.signal } : undefined);
}

// Read the connection scope the serial sub-API's host object hands out, through the instance's private `host` field. The serial host stands for every sub-API host
// object, since each builds its member over the client's one derivation.
function serialScope(client: EspHomeClient): ConnectionScope {

  return (client.serial as unknown as { host: SerialProxyHost }).host.connectionScope();
}

// Read the signal of the connection the client has attached, failing the row when none is attached.
function attachedSignal(client: EspHomeClient): AbortSignal {

  const scope = serialScope(client);

  if(scope.kind !== "attached") {

    assert.fail("The client must hold an attached connection, but its scope reads " + scope.kind + ".");
  }

  return scope.signal;
}

// Count the key-set requests the client has handed the transport.
function keySetRequests(transport: MockTransport): number {

  return transport.outboundFrames.filter((f): boolean => f.type === MessageType.NOISE_ENCRYPTION_SET_KEY_REQUEST).length;
}

// A metrics sink that keeps the tags of every `connect.attempts` count, so a row reads how each connect was counted.
function connectAttemptsSink(attempts: (Record<string, string> | undefined)[]): ClientMetrics {

  return {

    gauge: (): void => undefined,
    increment: (name: string, _by?: number, tags?: Record<string, string>): void => { if(name === "connect.attempts") { attempts.push(tags); } },
    timing: (): void => undefined
  };
}

// A metrics sink that counts every `reconnect.attempts` increment, which the reconnect loop makes once per attempt it schedules.
function reconnectAttemptsSink(counter: { reconnectAttempts: number }): ClientMetrics {

  return {

    gauge: (): void => undefined,
    increment: (name: string): void => { if(name === "reconnect.attempts") { counter.reconnectAttempts++; } },
    timing: (): void => undefined
  };
}

// Read the controller of the manual connect in flight, through the client's private field, so a row can compare a rejection with the reason it was aborted with.
function connectController(client: EspHomeClient): Nullable<AbortController> {

  return (client as unknown as { connectController: Nullable<AbortController> }).connectController;
}

// Discovery-burst fixtures.

// The number of same-type entities in a discovery burst, chosen far past the receiver's per-type setup-buffer mark so a burst that arrives ahead of the discovery
// loop would lose entities to that mark if the list-entities stream were not exempt from it.
const DISCOVERY_BURST_ENTITY_COUNT = 40;

// The entities of a discovery burst: one sensor per key, each named by its index so an assertion on discovery order reads plainly.
const DISCOVERY_BURST: { key: number; name: string; objectId: string; type: EntityType }[] = Array.from({ length: DISCOVERY_BURST_ENTITY_COUNT },
  (_, index) => ({ key: index + 1, name: "Sensor " + String(index), objectId: "sensor_" + String(index), type: "sensor" }));

// Frame a typed message as a plaintext device writes it to its socket: the plaintext indicator byte, the payload length and the message type as varints, then the
// payload itself.
function plaintextFrame(type: number, payload: Buffer): Buffer {

  return Buffer.concat([ Buffer.from([ProtocolByte.PLAINTEXT]), encodeVarint(payload.length), encodeVarint(type), payload ]);
}

// A testing socket whose write callback fires on the next tick, as a real socket's does. The base testing socket calls it synchronously, which lets each send of the
// connect flow settle inside the same run of microtasks as the receiver's pump and so hides how far the pump reads ahead of the flow.
class DeferredWriteMockSocket extends MockSocket {

  public override write(data: Buffer | string, callback?: (err?: Error) => void): boolean {

    return super.write(data, (err?: Error): void => {

      process.nextTick((): void => { callback?.(err); });
    });
  }
}

// 1. Construction and pre-connect smoke.

describe("EspHomeClient construction with injected MockTransport", () => {

  test("accepts a MockTransport via EspHomeClientOptions.transport without throwing", () => {

    const transport = new MockTransport();

    assert.doesNotThrow(() => new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => transport }));
  });

  test("does not consume the injected transport's resources at construction time", () => {

    const transport = new MockTransport();

    new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => transport });

    assert.equal(transport.outboundFrames.length, 0, "constructing the client must not send any outbound frame");
  });

  /* The two ends of the bracketed-host contract in one test. The open options are where the unwrap is observable: `[::1]` is a hostname to the platform resolver and
   * `::1` is an address, so the host the factory receives is the difference between a connection and a failed lookup. The summary is the other end, and it reads the
   * same stored field, so both spellings of the option have to produce one pair of brackets in the display text.
   */
  test("unwraps a bracketed IPv6 host so the socket and the summary both see one address", async () => {

    const transport = new MockTransport();
    const observedHosts: string[] = [];
    const client = new EspHomeClient({

      host: "[::1]",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (options): MockTransport => {

        observedHosts.push(options.host);

        return transport;
      }
    });
    const inspectFn = (client as unknown as Record<symbol, (depth: number, options: { stylize: (text: string, style: string) => string }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: (text: string, style: string) => string }) => string;
    const summary = inspectFn.call(client, 2, { stylize: (s): string => s });

    assert.ok(summary.includes("[::1]:6053"), "the summary must show the address with exactly one pair of brackets, got: " + summary);

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.deepEqual(observedHosts, ["::1"], "the transport open options must carry the bare IPv6 literal, not the bracketed spelling");

    client.disconnect();
  });

  test("reports disconnected health before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const health = client.health();

    assert.equal(health.state, "disconnected");
    assert.equal(health.encrypted, false);
    assert.equal(connectionUptimeMs(health), 0);
  });

  test("returns the disconnected capability record before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const caps = client.capabilities();

    assert.equal(caps.api.major, 0);
    assert.equal(caps.encryption.active, false);
    assert.equal(caps.voiceAssistant.supported, false);
  });

  test("connect does not resolve until DeviceInfo arrives, even when LIST_ENTITIES_DONE comes first - capabilities/deviceInfo are populated", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });
    let resolved = false;

    void connectPromise.then((): void => { resolved = true; }, (): void => { /* failure is asserted elsewhere */ });

    // Drive the handshake, then the entity stream and DONE, WITHOUT DeviceInfo yet.
    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    // connect() must not resolve on the LIST_ENTITIES DONE - discovery waits for DeviceInfo - so the promise is still pending here, capabilities not yet populated.
    assert.equal(resolved, false, "connect must not resolve until DEVICE_INFO_RESPONSE is received");

    pushDeviceInfo(transport);
    await connectPromise;

    assert.equal(client.capabilities().api.major, 1, "capabilities must be populated (not the 0.0 disconnected placeholder) once connect resolves");
    assert.notEqual(client.deviceInfo(), null, "deviceInfo must be populated once connect resolves");

    client.disconnect();
  });

  test("capabilities() returns a deep boundary copy so consumer mutation cannot corrupt the cached record", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const caps = client.capabilities();

    // Mutate both a top-level and a nested field on the returned snapshot.
    caps.encryption.active = true;
    caps.api.minor = 99;

    assert.equal(client.capabilities().encryption.active, false, "mutating a nested field of a returned capabilities snapshot must not affect the cached record");
    assert.equal(client.capabilities().api.minor, 0, "nested capability objects must be decoupled by the boundary copy");
    assert.equal(client.isEncrypted, false, "isEncrypted reads the cached record, which must be insulated from consumer mutation");
  });

  test("health() returns the frozen record itself in the disconnected branch so consumer mutation cannot corrupt the cached record", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const health = client.health();

    assert.equal(health.state, "disconnected");
    assert.equal(Object.isFrozen(health), true, "the disconnected health record must be frozen");
    assert.equal(client.health(), health, "health() must return the same record until a transition replaces it");

    // The record type is read-only, so each write goes through a writable view: the guarantee under test is that a plain JavaScript caller's write to the frozen record
    // throws rather than corrupting it. `encrypted` is the literal `false` on a down record, so we write base `number` fields present on both variants.
    assert.throws((): void => { (health as { consecutiveStalls: number }).consecutiveStalls = 999; }, TypeError);
    assert.throws((): void => { (health as { lastInboundActivityAt: number }).lastInboundActivityAt = 12345; }, TypeError);

    assert.equal(client.health().consecutiveStalls, 0, "a rejected write must leave the cached record unchanged");
    assert.equal(client.health().lastInboundActivityAt, 0, "a rejected write must leave the cached record unchanged");
  });

  test("snapshot is empty before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.snapshot().size, 0);
  });

  test("subDevices is empty before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.deepEqual(client.subDevices(), []);
  });

  test("voiceAssistant accessor returns the same lazy instance on repeated calls", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    const a = client.voiceAssistant;
    const b = client.voiceAssistant;

    assert.equal(a, b, "voiceAssistant getter is memoized to a single instance per client");
  });

  test("constructor with a 32-byte base64 PSK retains the key", () => {

    const psk = Buffer.alloc(32, 0x42).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, transportFactory: (): MockTransport => new MockTransport() });

    // The host holds the key without validating it; the handshake checks it where it is used. Indirectly observable: construction completes.
    assert.notEqual(client, null);
  });

  test("an invalid PSK length logs nothing at construction and fails an encrypted connect closed with EncryptionKeyInvalidError on one transport", async () => {

    // The key is checked once, where the handshake uses it, so a malformed string key fails closed exactly like a malformed key a resolver returns: construction logs
    // nothing, and connecting to a device that speaks encryption rejects with the permanent INVALID_PSK_LENGTH failure rather than downgrading to plaintext.
    const log = makeLogCapture();
    const tooShortPsk = Buffer.alloc(16, 0x77).toString("base64");
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, psk: tooShortPsk, reconnect: false, transportFactory });

    assert.deepEqual([ ...log.debug, ...log.error, ...log.info, ...log.warn ], [], "construction must not log about the key");

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    // An encrypted device answers the client's empty initial frame with its server hello; the malformed key then fails before any handshake message is sent.
    noiseTransport.pushNoiseHandshakeFrame(Buffer.from([1]));

    await assert.rejects(connectPromise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "a malformed key must reject with EncryptionKeyInvalidError");
      assert.equal(err.code, "INVALID_PSK_LENGTH");
      assert.ok(err.cause instanceof NoiseHandshakeError, "the primitive's own length check must be preserved on the cause chain");
      assert.equal(err.cause.code, "INVALID_PSK_LENGTH");
      assert.ok(err instanceof PermanentError, "a malformed key must be a PermanentError so the default reconnect predicate gives up");

      return true;
    });

    assert.equal(transports.length, 1, "a malformed key must NOT construct a second (plaintext) transport");
    assert.equal(noiseTransport.outboundHandshakeFrames.length, 1, "only the empty initial frame may be sent - never a handshake message");

    client.disconnect();
  });

  test("constructor honors a custom clientId, port, and timeouts", () => {

    const client = new EspHomeClient({ clientId: "custom-id", connectTimeoutMs: 1000, gracefulDisconnectTimeoutMs: 250, handshakeTimeoutMs: 500, host: "abc.local",
      logger: quietLogger(), port: 9999, transportFactory: (): MockTransport => new MockTransport() });

    // The constructor stores the values on private fields; we observe them through the connect path's outbound HELLO_REQUEST clientInfo on a later test.
    assert.notEqual(client, null);
  });

  test("constructor accepts keepAlive: false (heartbeat disabled)", () => {

    assert.doesNotThrow(() => new EspHomeClient({

      host: "x.local", keepAlive: false, logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport()
    }));
  });

  test("constructor accepts reconnect: false", () => {

    assert.doesNotThrow(() => new EspHomeClient({

      host: "x.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new MockTransport()
    }));
  });

  test("constructor accepts custom resource bounds (max frame, max fields, max recv buffer)", () => {

    assert.doesNotThrow(() => new EspHomeClient({ host: "x.local", logger: quietLogger(), maxFieldsPerMessage: 32, maxFrameBytes: 65536, maxRecvBufferBytes: 131072,
      transportFactory: (): MockTransport => new MockTransport() }));
  });
});

// 2. Connect path - plaintext happy path.

describe("EspHomeClient.connect - plaintext happy path", () => {

  test("connect issues HELLO_REQUEST as the first outbound frame", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(500) }).catch((): undefined => undefined);

    await delay(20);

    assert.equal(transport.outboundFrames[0]?.type, MessageType.HELLO_REQUEST);
    assert.equal(transport.outboundFrames[0]?.encrypted, false);

    await connectPromise;
    client.disconnect();
  });

  test("connect HELLO_REQUEST encodes clientId, major, minor as fields 1/2/3", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      clientId: "session-eleven", host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    void client.connect({ signal: AbortSignal.timeout(500) }).catch((): undefined => undefined);
    await delay(20);

    const helloFrame = transport.outboundFrames.find((f): boolean => f.type === MessageType.HELLO_REQUEST);

    assert.notEqual(helloFrame, undefined);
    // Field 1 = LENGTH_DELIMITED clientId. The first byte of the encoded payload is the field tag (1 << 3 | 2) = 0x0A.
    assert.equal(helloFrame!.payload.readUInt8(0), 0x0A);
    // The clientId string appears verbatim in the encoded payload.
    assert.ok(helloFrame!.payload.includes(Buffer.from("session-eleven", "utf8")));

    client.disconnect();
  });

  test("connect through driveConnect succeeds with no entities and no services", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(client.health().state, "connected");
    assert.equal(client.deviceInfo()?.name, "test-device");
    assert.equal(client.getEntitiesWithIds().length, 0);

    client.disconnect();
  });

  test("connect resolves health to 'connected' and stamps lastInboundActivityAt", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const health = client.health();

    assert.equal(health.state, "connected");
    assert.equal(health.encrypted, false);
    assert.equal(typeof health.lastInboundActivityAt, "number");
    assert.ok(connectionUptimeMs(health) >= 0);

    // The connected record is the live variant and carries the connect epoch SSOT; uptime is derived from it via connectionUptimeMs rather than stored.
    assert.ok(("connectedAtMs" in health), "a connected health record must carry connectedAtMs");

    client.disconnect();
  });

  test("connect builds a structured capability record after successful handshake", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const caps: ClientCapabilities = client.capabilities();

    assert.equal(caps.api.major, 1);
    assert.equal(caps.api.minor, 12);
    assert.equal(caps.encryption.active, false);

    client.disconnect();
  });

  test("connect emits 'connect' event with encrypted=false on plaintext", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    let observed: Nullable<boolean> = null;
    const sub = client.on("connect", (encrypted): void => { observed = encrypted; });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(observed, false);
    sub[Symbol.dispose]();
    client.disconnect();
  });

  test("connect emits 'lifecycle' connect event with kind='connect'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const events: string[] = [];

    client.on("lifecycle", (e): void => { events.push(e.kind); });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.deepEqual(events, ["connect"]);
    client.disconnect();
  });

  test("connect sends DEVICE_INFO_REQUEST and LIST_ENTITIES_REQUEST during discovery", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const types = transport.outboundFrames.map((f): number => f.type);

    assert.ok(types.includes(MessageType.DEVICE_INFO_REQUEST), "DEVICE_INFO_REQUEST must have been sent");
    assert.ok(types.includes(MessageType.LIST_ENTITIES_REQUEST), "LIST_ENTITIES_REQUEST must have been sent");
    assert.ok(types.includes(MessageType.SUBSCRIBE_STATES_REQUEST), "SUBSCRIBE_STATES_REQUEST must have been sent after discovery");

    client.disconnect();
  });

  test("connect with API minor < 11 sends CONNECT_REQUEST and waits for CONNECT_RESPONSE (legacy auth path)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_10);
    await delay(10);
    // Legacy path: after HELLO_RESPONSE, host sends CONNECT_REQUEST and awaits CONNECT_RESPONSE.
    transport.pushInbound(MessageType.CONNECT_RESPONSE, CONNECT_RESPONSE_OK);
    await delay(10);
    pushDeviceInfo(transport);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

    const types = transport.outboundFrames.map((f): number => f.type);

    assert.ok(types.includes(MessageType.CONNECT_REQUEST), "legacy path must send CONNECT_REQUEST after HELLO_RESPONSE");

    client.disconnect();
  });

  test("connect with API minor >= 11 skips CONNECT_REQUEST (modern auth path)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const types = transport.outboundFrames.map((f): number => f.type);

    assert.equal(types.includes(MessageType.CONNECT_REQUEST), false, "modern path must NOT send CONNECT_REQUEST");

    client.disconnect();
  });
});

// 3. Connect path - error and abort enumeration.

describe("EspHomeClient.connect - error and abort paths", () => {

  test("connect honors a pre-aborted signal by rejecting synchronously", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(client.connect({ signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason);
  });

  test("a connect pre-aborted with a string reason rejects with that string as it is", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new MockTransport() });
    const controller = new AbortController();

    controller.abort("the caller gave up");

    await assert.rejects(client.connect({ signal: controller.signal }), (err: unknown): boolean => err === "the caller gave up");
  });

  test("connect honors a mid-flight AbortSignal", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const controller = new AbortController();

    const connectPromise = client.connect({ signal: controller.signal });

    setImmediate((): void => controller.abort());

    await assert.rejects(connectPromise, (err: unknown): boolean => err === controller.signal.reason, "abort during connect must reject");
  });

  test("disconnect() while the handshake is parked rejects the pending connect() with the connection-lost error it built and leaves no transport", async () => {

    const transport = new MockTransport();
    const attempts: (Record<string, string> | undefined)[] = [];

    // The handshake-phase timeout is short so a connect the disconnect failed to cancel would still settle inside the test, on the timeout instead of the abort. The
    // metrics sink keeps the connect counter's tags, so the row reads how the cancelled connect was counted.
    const client = new EspHomeClient({

      handshakeTimeoutMs: 1000,
      host: "test.local",
      logger: quietLogger(),
      metrics: connectAttemptsSink(attempts),
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });
    const connectEvents: boolean[] = [];

    client.on("connect", (encrypted): void => { connectEvents.push(encrypted); });

    // No caller signal: only the client's own teardown can cancel this connect. The handshake parks awaiting a HELLO_RESPONSE that is never pushed.
    const pending = client.connect();

    await delay(10);

    // The connect controller is private. Reading it before the disconnect lets the row compare the rejection with the error the disconnect aborts it with.
    const controller = (client as unknown as { connectController: Nullable<AbortController> }).connectController;

    assert.ok(controller, "a manual connect in flight must hold its controller");

    const disconnectedAt = Date.now();

    client.disconnect();

    const lost: unknown = controller.signal.reason;

    await assert.rejects(pending, (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionLostError, "the cancelled connect must reject with the disconnect's connection-lost error");
      assert.equal(err, lost, "the rejection must be the object the disconnect aborted the connect controller with");
      assert.equal(err.code, "CONNECTION_LOST");
      assert.equal(Object.hasOwn(err, "cause"), false, "an explicit disconnect knows no cause, so the error carries none");

      return true;
    });

    const elapsed = Date.now() - disconnectedAt;

    assert.ok(elapsed < 500, "the disconnect must cancel the connect at once rather than leave it to the handshake-phase timeout: " + String(elapsed) + " ms");
    assert.deepEqual(attempts, [{ result: "failure" }], "a connect a disconnect cuts short counts as a failure, not a timeout");

    // No transport survives the cancelled connect: the client holds no session, and the parked transport was disposed (a disposed mock ends its iterator at once).
    assert.equal((client as unknown as { session: Nullable<{ transport: unknown }> }).session?.transport ?? null, null,
      "the client must hold no transport after the cancelled connect");

    const iteration = await Promise.race([ transport[Symbol.asyncIterator]().next(), delay(50).then((): string => "parked") ]);

    assert.deepEqual(iteration, { done: true, value: undefined }, "the parked handshake transport must have been disposed");
    assert.equal(client.health().state, "disconnected", "the client must remain disconnected");
    assert.deepEqual(connectEvents, [], "a cancelled connect must never announce a session");
  });

  test("disconnectAsync() while the handshake is parked resolves and rejects the pending connect() with the connection-lost error it built", async () => {

    const transport = new MockTransport();
    const attempts: (Record<string, string> | undefined)[] = [];
    const client = new EspHomeClient({

      handshakeTimeoutMs: 1000,
      host: "test.local",
      logger: quietLogger(),
      metrics: connectAttemptsSink(attempts),
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    // No caller signal: only the graceful disconnect can cancel this connect, whose handshake parks awaiting a HELLO_RESPONSE that is never pushed.
    const pending = client.connect();

    await delay(10);

    const controller = (client as unknown as { connectController: Nullable<AbortController> }).connectController;

    assert.ok(controller, "a manual connect in flight must hold its controller");

    // With no session attached the graceful path has nothing to send, so it resolves once it has cut the connect short.
    await client.disconnectAsync();

    const lost: unknown = controller.signal.reason;

    assert.ok(lost instanceof ConnectionLostError, "the graceful path must abort the connect with a connection-lost error");
    await assert.rejects(pending, (err: unknown): boolean => err === lost);
    assert.deepEqual(attempts, [{ result: "failure" }], "a connect a graceful disconnect cuts short counts as a failure, not a timeout");
  });

  test("a pre-aborted signal rejects connect() with the signal's own reason", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new MockTransport() });
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(client.connect({ signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason);
  });

  test("a pre-aborted connect() over a live session rejects with the signal's reason, announces nothing, and leaves the session connected", async () => {

    const transport = new MockTransport();
    const vended: MockTransport[] = [];
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => {

        const t = (vended.length === 0) ? transport : new MockTransport();

        vended.push(t);

        return t;
      }
    });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const events: string[] = [];

    client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
    client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
    client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });

    const controller = new AbortController();

    controller.abort();

    await assert.rejects(client.connect({ signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason);

    // The abort check runs before the supersede, so the live session is neither torn down nor announced as ended.
    assert.deepEqual(events, [], "a pre-aborted connect must emit no disconnect, lifecycle, or health event for the session it never superseded");
    assert.equal(client.health().state, "connected", "the live session must stay connected");
    assert.equal((client as unknown as { session: Nullable<{ transport: unknown }> }).session?.transport, transport, "the live session's transport must stay attached");
    assert.equal(vended.length, 1, "the pre-aborted connect must never open a transport");

    client.disconnect();
  });

  test("an abort that lands while the transport is still opening rejects connect() with the abort reason itself", async () => {

    // The factory settles only when the connect signal aborts, standing in for a TCP connect still in progress when the caller gives up.
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (options): Promise<MockTransport> => new Promise<MockTransport>((_resolve, reject): void => {

        options.signal?.addEventListener("abort", (): void => {

          reject((options.signal?.reason instanceof Error) ? options.signal.reason : new DOMException("Aborted", "AbortError"));
        }, { once: true });
      })
    });
    const controller = new AbortController();
    const pending = client.connect({ signal: controller.signal });

    await delay(5);
    controller.abort();

    await assert.rejects(pending, (err: unknown): boolean => err === controller.signal.reason);

    assert.equal(client.health().state, "disconnected", "the client must remain disconnected");
  });

  test("a transport factory that throws rejects connect() with a typed ConnectionError carrying the factory's error", async () => {

    const factoryFault = new Error("Synthetic transport factory failure.");
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => { throw factoryFault; }
    });

    await assert.rejects(client.connect({ signal: AbortSignal.timeout(2000) }), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a failed transport open must reject with a typed ConnectionError");
      assert.equal(err.code, "CONNECT_FAILED", "the failed open must carry the CONNECT_FAILED code");
      assert.equal(err.cause, factoryFault, "the cause must be the error the factory threw");

      return true;
    });

    assert.equal(client.health().state, "disconnected", "the client must remain disconnected");
  });

  test("a listener that throws while a connect is announced is reported through the logger and connect() resolves connected", async () => {

    const transport = new MockTransport();
    const warnings: unknown[][] = [];
    const client = new EspHomeClient({

      host: "test.local",
      logger: { ...quietLogger(), warn: (...args: unknown[]): void => { warnings.push(args); } },
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });
    const listenerFault = new Error("Synthetic connect-listener fault.");
    const siblingAnnouncements: boolean[] = [];

    // The throw lands inside the connect flow's own announcement, after the run-phase handoff has attached the transport and marked health connected. The bus reports
    // it through the logger, so the flow completes and a listener registered after the throwing one still receives the announcement.
    client.on("connect", (): void => { throw listenerFault; });
    client.on("connect", (encrypted): void => { siblingAnnouncements.push(encrypted); });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(client.health().state, "connected", "a throwing listener must not unwind the connect flow");
    assert.deepEqual(siblingAnnouncements, [false], "the sibling listener must still receive the announcement");
    assert.deepEqual(warnings, [[ LISTENER_FAULT_WARNING, { error: listenerFault, event: "connect" } ]],
      "the fault must be reported once through the logger with the error and the event name");

    client.disconnect();
  });

  test("connect rejects with NegotiationFailedError when device announces an unsupported API major", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    // API major = 2 falls outside the client's supported range (1..1).
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_2_0);

    await assert.rejects(connectPromise, (err: unknown) => {

      // Class identity: consumers narrow on the concrete subclass.
      assert.ok(err instanceof NegotiationFailedError, "rejection must be a NegotiationFailedError");

      // Permanent marker: the auto-reconnect supervisor's default shouldRetry filter discards PermanentError subclasses without consuming the retry budget.
      assert.ok(err instanceof PermanentError, "NegotiationFailedError must extend PermanentError so the reconnect supervisor skips it");

      // Documented machine-readable code: consumers can switch on err.code without parsing the message.
      assert.equal(err.code, "API_MAJOR_OUT_OF_RANGE", "error must carry the documented API_MAJOR_OUT_OF_RANGE code");

      // Error message: must name both the negotiated major and the supported range so a consumer can debug the device-firmware mismatch from logs alone.
      assert.match(err.message, /major version 2/, "error message must name the negotiated major version");
      assert.match(err.message, /supported range 1-1/, "error message must name the client's supported range");

      return true;
    });

    // Transport teardown: the host's connect-failure path drops to the disconnected health state with no lingering session.
    assert.equal(client.health().state, "disconnected", "client must be in the disconnected state after a NegotiationFailedError");

    client.disconnect();
  });

  test("connect rejects with NegotiationFailedError when device announces an API major below the supported range", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    // API major = 0 falls below the client's supported range floor (1..1). Mirrors the handshake-unit boundary test for symmetric integration coverage so a regression
    // that breaks one direction of the comparison is caught at the integration level too.
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_0_0);

    await assert.rejects(connectPromise, (err: unknown) => {

      assert.ok(err instanceof NegotiationFailedError, "rejection must be a NegotiationFailedError for below-range majors as well");
      assert.ok(err instanceof PermanentError, "below-range mismatches must also be permanent");
      assert.equal(err.code, "API_MAJOR_OUT_OF_RANGE", "the same code applies to both directions of the boundary");
      assert.match(err.message, /major version 0/, "error message must name the negotiated major even when it is below the floor");

      return true;
    });

    client.disconnect();
  });

  test("auto-reconnect supervisor does not retry after a NegotiationFailedError", async () => {

    const transport = new MockTransport();
    const attemptDelays: number[] = [];

    // Reconnect is enabled with a small initialDelayMs so a real retry would surface inside the test's wait window. The onAttempt callback is the canonical observation
    // point for "the supervisor decided to retry"; if it never fires, the PermanentError filter in maybeScheduleReconnect did its job.
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 3, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory: (): MockTransport => transport
    });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_2_0);

    await assert.rejects(connectPromise, NegotiationFailedError);

    // Wait well past the reconnect initialDelayMs to give a hypothetical retry plenty of time to fire. With the PermanentError filter in place, no second HELLO_REQUEST
    // is emitted and onAttempt is never called.
    await delay(80);

    assert.equal(attemptDelays.length, 0, "reconnect supervisor must not invoke onAttempt for a PermanentError");

    const helloRequestCount = transport.outboundFrames.filter((frame) => frame.type === MessageType.HELLO_REQUEST).length;

    assert.equal(helloRequestCount, 1, "no second HELLO_REQUEST must be emitted: a PermanentError must terminate the reconnect loop after the first attempt");

    client.disconnect();
  });

  test("disconnectAsync stays disconnected and does NOT auto-reconnect under default reconnect", async () => {

    const transport = new MockTransport();
    const attemptDelays: number[] = [];

    // Reconnect is ENABLED with a small initialDelayMs so a hypothetical auto-reconnect surfaces inside the wait window. A graceful disconnectAsync must mark the client
    // explicitly closed and cancel the reconnect loop, exactly as the synchronous disconnect() does - otherwise disconnectInternal's maybeScheduleReconnect silently
    // reconnects on the non-permanent CONNECTION_DROPPED cause about 500ms later. gracefulDisconnectTimeoutMs is small so the test does not wait on the full default
    // graceful-handshake window (no DISCONNECT_RESPONSE is pushed, so disconnectAsync falls through to immediate teardown on timeout).
    const client = new EspHomeClient({

      gracefulDisconnectTimeoutMs: 30,
      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 3, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory: (): MockTransport => transport
    });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    await client.disconnectAsync();

    // Wait well past both the graceful timeout and the reconnect initialDelayMs so a hypothetical retry would have fired.
    await delay(80);

    assert.equal(attemptDelays.length, 0, "a graceful disconnectAsync must not schedule an auto-reconnect");
    assert.equal(client.health().state, "disconnected", "the client must remain disconnected after a graceful disconnectAsync");
  });

  test("connect emits 'disconnect' with the failure reason on connect-time error", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const reasons: (string | undefined)[] = [];

    client.on("disconnect", (reason): void => { reasons.push(reason); });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_2_0);

    await assert.rejects(connectPromise, { code: "API_MAJOR_OUT_OF_RANGE", constructor: NegotiationFailedError });

    assert.ok(reasons.length > 0, "connect failure must emit a disconnect event with the reason");

    client.disconnect();
  });

  test("connect handshake timeout maps to a TimeoutError reject", async (t) => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      handshakeTimeoutMs: 60, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });
    const captured = captureTimeoutSignals(t);
    const start = Date.now();

    // Don't push HELLO_RESPONSE; let the handshake-phase timer fire. The connect builds its overall bound and then the hello step's short bound, the last timeout it
    // builds before the rejection, so the rejection must be that bound's own TimeoutError.
    const connectPromise = client.connect();

    await assert.rejects(connectPromise, (err: unknown): boolean => err === captured.at(-1)?.reason);
    assert.equal(captured.length, 2, "the connect builds its overall bound and the hello step's bound");
    assert.ok((Date.now() - start) < 1000, "the short handshake-phase bound must end the connect, well before the overall bound");
    client.disconnect();
  });

  test("connect wraps a non-EspHomeError thrown from setup-phase as a ConnectionError", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    // Cause a fatal error in the transport mid-handshake.
    transport.fail(new Error("simulated socket fault"));

    await assert.rejects(connectPromise, (err: unknown) => {

      assert.ok(err instanceof EspHomeError);

      return true;
    });
  });

  test("connect preserves a non-Error thrown during the handshake on the wrapped error's cause chain", async () => {

    const thrown = { synthetic: "non-error cause" };

    // A transport whose send throws a non-Error during HELLO_REQUEST. The plaintext handshake re-throws it unwrapped, so it reaches connect()'s catch and is wrapped in a
    // ConnectionError. The wrap must preserve the original thrown value on the cause chain even though it is not an Error instance.
    class ThrowingSendTransport extends MockTransport {

      public override async send(): Promise<void> {

        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a non-Error to exercise the connect catch's cause-preservation path.
        throw thrown;
      }
    }

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new ThrowingSendTransport() });

    await assert.rejects(client.connect({ signal: AbortSignal.timeout(2000) }), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a non-Error thrown from the handshake must be wrapped in a ConnectionError");
      assert.equal(err.cause, thrown, "the wrapped error must preserve the original non-Error thrown value on its cause chain");

      return true;
    });
  });

  test("connect with PSK + noise handshake timeout fails closed - no plaintext fallback, exactly one transport", async (t) => {

    // A noise timeout is NOT a no-encryption signal: the Noise step rethrows every abort and timeout (a user abort, the connect deadline, AND the noise-step timeout)
    // unchanged, so falling back on it would silently downgrade a user-cancel or a deadline to plaintext - and a real no-encryption ESPHome device never times out
    // (it responds plaintext or closes). The gate fails it closed, so connect() rejects and NO second (plaintext) transport is constructed. The factory-call-count
    // assertion is what gives mutation-check (i) teeth: a gate that fell back on anything but PeerClosedDuringNoiseError would fall back here (factory twice),
    // flipping this red.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ handshakeTimeoutMs: 100, host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });
    const callerSignal = AbortSignal.timeout(2000);
    const captured = captureTimeoutSignals(t);
    const start = Date.now();

    // Push nothing: the Noise step's handshake-phase bound, the last timeout the connect builds, fires and aborts nextNoiseHandshakeFrame with its TimeoutError, which
    // the Noise step rethrows unchanged; the gate fails it closed and the connect rejects with that TimeoutError itself.
    await assert.rejects(client.connect({ signal: callerSignal }), (err: unknown): boolean => err === captured.at(-1)?.reason);

    assert.equal(callerSignal.aborted, false, "the caller's own deadline must not be what ended the connect");
    assert.ok((Date.now() - start) < 1000, "the short Noise-step bound must end the connect, well before the caller's deadline");
    assert.equal(transports.length, 1, "a fail-closed noise timeout must NOT construct a second (plaintext) transport");

    client.disconnect();
  });

  test("a transport factory's own TimeoutError rejects connect() with the CONNECT_FAILED wrap whose cause is that error", async () => {

    // No signal of the connect has aborted, so the factory's TimeoutError is no signal's reason: the unwrap goes by identity, never by the error's name or class.
    const own = new DOMException("socket timed out", "TimeoutError");
    const client = new EspHomeClient({

      host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): Promise<MockTransport> => Promise.reject(own)
    });

    await assert.rejects(client.connect(), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a factory's own TimeoutError must reach the caller wrapped as a typed ConnectionError");
      assert.equal(err.code, "CONNECT_FAILED");
      assert.equal(err.cause, own, "the wrap must carry the factory's own error as its cause");

      return true;
    });
  });

  test("connect() wraps a factory's own error even when the caller's signal or the connect bound aborted first, and counts it a failure", async () => {

    // The factory aborts the caller's signal and then rejects with an error of its own, so the catch finds the connect's signal aborted while the rejection is not
    // its reason.
    const callerAttempts: (Record<string, string> | undefined)[] = [];
    const controller = new AbortController();
    const own = new Error("socket refused");
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      metrics: connectAttemptsSink(callerAttempts),
      reconnect: false,
      transportFactory: (): Promise<MockTransport> => {

        controller.abort(new Error("caller gave up"));

        return Promise.reject(own);
      }
    });

    await assert.rejects(client.connect({ signal: controller.signal }), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a factory's own error must reach the caller wrapped even though the caller's signal aborted first");
      assert.equal(err.code, "CONNECT_FAILED");
      assert.equal(err.cause, own, "the wrap must carry the factory's own error, not the caller's reason");

      return true;
    });
    assert.deepEqual(callerAttempts, [{ result: "failure" }], "a factory's own error counts as a failure");

    // The connect bound fires while the factory waits, and the factory then rejects with its own error, so the bound is aborted while the rejection is not its reason.
    const boundAttempts: (Record<string, string> | undefined)[] = [];
    const boundClient = new EspHomeClient({

      connectTimeoutMs: 30,
      host: "test.local",
      logger: quietLogger(),
      metrics: connectAttemptsSink(boundAttempts),
      reconnect: false,
      transportFactory: (options): Promise<MockTransport> => new Promise<MockTransport>((_resolve, reject): void => {

        options.signal?.addEventListener("abort", (): void => { reject(own); }, { once: true });
      })
    });

    await assert.rejects(boundClient.connect(), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a factory's own error must reach the caller wrapped even though the connect bound aborted first");
      assert.equal(err.code, "CONNECT_FAILED");
      assert.equal(err.cause, own, "the wrap must carry the factory's own error, not the bound's TimeoutError");

      return true;
    });
    assert.deepEqual(boundAttempts, [{ result: "failure" }], "a factory's own error counts as a failure even after the bound fired");
  });

  test("a manual connect that times out in its Noise step rejects with that TimeoutError and announces CONNECT_FAILED naming the step with it as cause", async (t) => {

    // The client connects through the Noise fallback, so its key stays configured, and a transient run-phase fault parks the reconnect loop in its long backoff with
    // the health record reconnecting. The manual connect that supersedes the loop opens a transport that answers nothing, so its Noise step's short bound ends it.
    const noiseTransport = new MockTransport();
    const plaintextTransport = new MockTransport();
    const manualTransport = new MockTransport();
    const transportQueue = [ noiseTransport, plaintextTransport, manualTransport ];
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({

      handshakeTimeoutMs: 100, host: "test.local", logger: quietLogger(), psk, reconnect: { initialDelayMs: 10000, jitter: 0 },
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    // The disconnect in the finally ends the reconnect loop however the assertions end, so a failing assertion cannot leave the loop retrying behind the suite.
    try {

      const firstConnect = client.connect({ signal: AbortSignal.timeout(2000) });

      await delay(10);
      noiseTransport.fail(new PeerClosedDuringNoiseError("Peer closed the TCP socket while the noise handshake was in flight.", "PEER_CLOSED_NOISE"));
      await delay(10);
      pushHandshake(plaintextTransport);
      await firstConnect;

      plaintextTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));
      await delay(10);

      assert.equal(client.health().state, "reconnecting", "the reconnect loop must be parked in its backoff before the manual connect");

      const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

      client.on("lifecycle", (event): void => { if(event.kind === "disconnect") { lifecycleDisconnects.push(event); } });

      // The manual connect builds its overall bound and then its Noise step's short bound, the last timeout it builds, whose own TimeoutError ends it.
      const callerSignal = AbortSignal.timeout(2000);
      const captured = captureTimeoutSignals(t);

      await assert.rejects(client.connect({ signal: callerSignal }), (err: unknown): boolean => err === captured.at(-1)?.reason);
      assert.equal(captured.length, 2, "the manual connect builds its overall bound and its Noise step's bound");
      assert.equal(lifecycleDisconnects.length, 1, "the failed connect must announce its end exactly once");

      const announced = lifecycleDisconnects[0]?.cause;

      assert.ok(announced instanceof ConnectionError, "the announcement must carry a typed ConnectionError");
      assert.equal(announced.code, "CONNECT_FAILED");
      assert.match(announced.message, /^Connect failed during the Noise handshake: /, "the announced cause must name the step the connect failed in");
      assert.equal(announced.cause, captured.at(-1)?.reason, "the announced cause must carry the same TimeoutError the connect rejected with");

    } finally {

      client.disconnect();
    }
  });

  test("a connect that falls back to plaintext and then times out in hello names the hello exchange on its legacy disconnect event", async (t) => {

    const noiseTransport = new MockTransport();
    const plaintextTransport = new MockTransport();
    const transportQueue = [ noiseTransport, plaintextTransport ];
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({

      handshakeTimeoutMs: 100, host: "test.local", logger: quietLogger(), psk, reconnect: false,
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });
    const reasons: (string | undefined)[] = [];

    client.on("disconnect", (reason): void => { reasons.push(reason); });

    const callerSignal = AbortSignal.timeout(2000);
    const captured = captureTimeoutSignals(t);
    const pending = client.connect({ signal: callerSignal });

    await delay(10);
    noiseTransport.fail(new PeerClosedDuringNoiseError("Peer closed the TCP socket while the noise handshake was in flight.", "PEER_CLOSED_NOISE"));

    // The plaintext transport answers nothing to hello, so the hello step's bound, the last timeout the connect builds, ends it after the fallback.
    await assert.rejects(pending, (err: unknown): boolean => err === captured.at(-1)?.reason);

    // A failed connect from the disconnected state announces on the legacy event alone, and its reason is the wrap's message, which names the step.
    assert.equal(reasons.length, 1, "the failed connect must announce its end exactly once");
    assert.match(reasons[0] ?? "", /^Connect failed during the hello exchange: /, "the announcement must name the step after the Noise step");
  });

  test("connect.attempts counts timeout only for the library's own bounds, never for a caller abort or the caller's own timeout signal", async (t) => {

    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const captured = captureTimeoutSignals(t);

    // The transport answers nothing, so the Noise step's own bound, the last timeout the connect builds, ends the connect.
    const noiseAttempts: (Record<string, string> | undefined)[] = [];
    const noiseClient = new EspHomeClient({

      handshakeTimeoutMs: 60, host: "test.local", logger: quietLogger(), metrics: connectAttemptsSink(noiseAttempts), psk, reconnect: false,
      transportFactory: (): MockTransport => new MockTransport()
    });

    await assert.rejects(noiseClient.connect(), (err: unknown): boolean => err === captured.at(-1)?.reason);
    assert.deepEqual(noiseAttempts, [{ result: "timeout" }], "a Noise-phase timeout counts as a timeout");

    // A caller abort with the default reason, an AbortError, is a cancellation and counts as a failure.
    const abortAttempts: (Record<string, string> | undefined)[] = [];
    const abortClient = new EspHomeClient({

      host: "test.local", logger: quietLogger(), metrics: connectAttemptsSink(abortAttempts), reconnect: false, transportFactory: (): MockTransport => new MockTransport()
    });
    const controller = new AbortController();
    const aborted = abortClient.connect({ signal: controller.signal });

    await delay(5);
    controller.abort();

    await assert.rejects(aborted, (err: unknown): boolean => err === controller.signal.reason);
    assert.deepEqual(abortAttempts, [{ result: "failure" }], "a caller abort counts as a failure");

    // The caller's own timeout signal ends a connect whose own bounds sit far above it: its TimeoutError is the caller's, so the connect counts it a failure.
    const ownAttempts: (Record<string, string> | undefined)[] = [];
    const ownClient = new EspHomeClient({

      connectTimeoutMs: 30000, handshakeTimeoutMs: 30000, host: "test.local", logger: quietLogger(), metrics: connectAttemptsSink(ownAttempts), reconnect: false,
      transportFactory: (): MockTransport => new MockTransport()
    });
    const own = AbortSignal.timeout(50);

    await assert.rejects(ownClient.connect({ signal: own }), (err: unknown): boolean => err === own.reason);
    assert.deepEqual(ownAttempts, [{ result: "failure" }], "a connect the caller's own timeout signal ends counts as a failure");
  });

  test("a disconnect an entities listener issues during a manual connect rejects the connect with its connection-lost error before anything attaches", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const connects: boolean[] = [];
    const reasons: (string | undefined)[] = [];
    const seen: { controller: Nullable<AbortController> } = { controller: null };

    client.on("connect", (encrypted): void => { connects.push(encrypted); });
    client.on("disconnect", (reason): void => { reasons.push(reason); });

    // Discovery announces the entity list after its last abortable wait, so the disconnect lands with only discovery's unsignalled final write ahead of the attach.
    client.on("entities", (): void => {

      seen.controller = connectController(client);
      client.disconnect();
    });

    await assert.rejects(driveConnect(transport, client, { signal: AbortSignal.timeout(2000) }), (err: unknown): boolean => err === seen.controller?.signal.reason);
    assert.deepEqual(connects, [], "a connect cut short before its attach must announce no connect");
    assert.equal(client.health().state, "disconnected");
    assert.equal((client as unknown as { session: Nullable<{ transport: unknown }> }).session?.transport ?? null, null, "nothing may attach after the disconnect");
    assert.equal(reasons.length, 1, "the failed connect must announce its end exactly once on the legacy event");
  });

  test("a disconnect a replayed state listener issues during the hand-off rejects the connect with the scope's error and announces the end once", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const events: string[] = [];
    const seen: { scope: Nullable<AbortSignal> } = { scope: null };

    client.on("connect", (): void => { events.push("connect"); });
    client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
    client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
    client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });

    // The state frame lands ahead of the handshake, so the hand-off replays it after the attach, while the connect is still in flight.
    client.on("telemetry", (): void => {

      seen.scope = attachedSignal(client);
      client.disconnect();
    });

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));

    await assert.rejects(driveConnect(transport, client, { entities: [{ key: 12, name: "S1", objectId: "shelf", type: "switch" }], signal: AbortSignal.timeout(2000) }),
      (err: unknown): boolean => err === seen.scope?.reason);
    assert.deepEqual(events, [ "healthChange:disconnected", "lifecycle:disconnect", "disconnect:undefined" ],
      "the disconnect's teardown announces the end once, and the connect announces neither a connected session nor a second end");
    assert.equal(client.health().state, "disconnected");
  });

  test("a stray DISCONNECT_RESPONSE the hand-off replays rejects the connect with its teardown's error and schedules no reconnect for the session", async () => {

    const transport = new MockTransport();
    const counts = { onAttempt: 0, reconnectAttempts: 0 };
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      metrics: reconnectAttemptsSink(counts),
      reconnect: { initialDelayMs: 10000, jitter: 0, onAttempt: (): void => { counts.onAttempt++; } },
      transportFactory: (): MockTransport => transport
    });
    const events: string[] = [];
    const seen: { controller: Nullable<AbortController>; scope: Nullable<AbortSignal> } = { controller: null, scope: null };

    client.on("connect", (): void => { events.push("connect"); });
    client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
    client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
    client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });
    client.on("telemetry", (): void => {

      seen.controller = connectController(client);
      seen.scope = attachedSignal(client);
    });

    // The state frame and then a DISCONNECT_RESPONSE land ahead of the handshake, so no setup-phase wait claims them: the hand-off replays the state frame to its
    // listener and then the response to its handler, which finds no graceful disconnect pending and tears the attached session down.
    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    transport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);

    // The disconnect in the finally ends a reconnect loop however the assertions end, so a failing assertion cannot leave the loop retrying behind the suite.
    try {

      await assert.rejects(driveConnect(transport, client, { entities: [{ key: 12, name: "S1", objectId: "shelf", type: "switch" }], signal: AbortSignal.timeout(2000) }),
        (err: unknown): boolean => err === seen.scope?.reason);
      assert.equal(seen.controller?.signal.aborted, false, "the stray response must tear the session down with the connect controller untouched");
      assert.deepEqual(events, [ "healthChange:disconnected", "lifecycle:disconnect", "disconnect:undefined" ],
        "the stray response's teardown announces the end once, and no reconnecting record follows a session never reported live");
      assert.equal(counts.onAttempt, 0, "no reconnect attempt may be scheduled for a session never reported live");
      assert.equal(counts.reconnectAttempts, 0, "no reconnect attempt may be counted for a session never reported live");
      assert.equal(client.health().state, "disconnected");

    } finally {

      client.disconnect();
    }
  });

  test("connect with PSK fails closed on a bad encryption key - no plaintext fallback, exactly one transport, permanent error", async () => {

    // The cardinal-sin guard: a bad encryption key must NEVER silently downgrade to plaintext. We fail the noise transport with an EncryptionKeyInvalidError (the
    // consolidated bad-key error the handshake re-tag produces), and assert connect() rejects, the produced error is permanent (so defaultShouldRetry gives up - the
    // reconnect-loop-forever half of the guarantee), and exactly ONE transport was constructed (no fallback rebuild). This gives mutation-check (ii) teeth.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    noiseTransport.fail(new EncryptionKeyInvalidError(
      "The device's encrypted handshake reply could not be authenticated; the encryption key may be wrong or the reply was rejected.", "NOISE_HANDSHAKE_FAILED"
    ));

    await assert.rejects(connectPromise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "a bad key must reject with EncryptionKeyInvalidError");
      assert.ok(err instanceof PermanentError, "a bad-key failure must be a PermanentError so the default reconnect predicate gives up");
      assert.equal(defaultShouldRetry(err), false, "defaultShouldRetry must give up on a permanent bad-key failure");

      return true;
    });

    assert.equal(transports.length, 1, "a fail-closed bad key must NOT construct a second (plaintext) transport");

    client.disconnect();
  });

  test("connect with PSK fails closed on an in-band key rejection the device closes behind - permanent error, no plaintext fallback, one transport", async () => {

    // The mock plays a device with the wrong key: it answers the empty initial frame with its server hello, and the client's handshake message with the in-band
    // wrong-key rejection followed by the ordinary peer close, so the step's read meets the rejection queued behind the stored close. The rejection arrived first,
    // so the connect reports it as the permanent key error and never opens a plaintext transport.
    const hello = Buffer.concat([ Buffer.from([1]), Buffer.from("device\x00", "utf8") ]);
    const rejection = Buffer.concat([ Buffer.from([1]), Buffer.from("Handshake MAC failure", "utf8") ]);
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();
      const send = t.sendNoiseHandshakeFrame.bind(t);

      t.sendNoiseHandshakeFrame = async (frame: Buffer): Promise<void> => {

        await send(frame);

        if(t.outboundHandshakeFrames.length === 1) {

          t.pushNoiseHandshakeFrame(hello);

          return;
        }

        t.pushNoiseHandshakeFrame(rejection);
        t.fail(new ConnectionClosedByPeerError("Peer closed the socket.", "PEER_CLOSED"));
      };

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    await assert.rejects(client.connect({ signal: AbortSignal.timeout(2000) }), (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "the rejection the device sent before it closed must reject the connect with EncryptionKeyInvalidError");
      assert.ok(err instanceof PermanentError, "a bad-key failure must be a PermanentError so the default reconnect predicate gives up");

      return true;
    });

    assert.equal(transports.length, 1, "a key rejection the device closes behind must NOT construct a second (plaintext) transport");

    client.disconnect();
  });

  test("connect with PSK fails closed on a garbled noise reply (TRUNCATED_E) - no plaintext fallback, exactly one transport", async () => {

    // A garbled/truncated noise reply is NOT a no-encryption signal: the device spoke noise but the reply was framing-broken. It is transient (the reconnect supervisor
    // may retry a one-off garble) but it still fails the connect CLOSED rather than downgrading to plaintext. Exactly one transport must be constructed. Part of
    // mutation-check (i)'s teeth alongside the timeout case.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    noiseTransport.fail(new NoiseHandshakeError("Truncated ephemeral key", "TRUNCATED_E"));

    await assert.rejects(connectPromise, (err: unknown) => {

      assert.ok(err instanceof NoiseHandshakeError, "a garbled noise reply must reject with a NoiseHandshakeError");
      assert.equal(err instanceof PermanentError, false, "a framing failure is transient, NOT a permanent bad-key error");

      return true;
    });

    assert.equal(transports.length, 1, "a fail-closed garbled noise reply must NOT construct a second (plaintext) transport");

    client.disconnect();
  });

  test("connect with PSK falls back to plaintext when the peer closed the socket during the noise handshake", async () => {

    // PEER_CLOSED_NOISE is one of the two genuine no-encryption signals carried by PeerClosedDuringNoiseError. The gate falls back: a second (plaintext) transport is
    // constructed and the connect succeeds unencrypted. This asserts the OTHER PeerClosedDuringNoiseError code than the plaintext-indicator test below.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    noiseTransport.fail(new PeerClosedDuringNoiseError(
      "Peer closed the TCP socket while the noise handshake was in flight; the device may not support encryption.", "PEER_CLOSED_NOISE"
    ));

    await delay(10);

    assert.equal(transports.length, 2, "a peer-closed-during-noise signal must fall back and construct a second (plaintext) transport");

    const plaintextTransport = transports[1];

    if(!plaintextTransport) {

      throw new Error("plaintext transport not constructed");
    }

    pushHandshake(plaintextTransport);

    await connectPromise;

    assert.equal(client.health().state, "connected");
    assert.equal(client.isEncrypted, false);

    client.disconnect();
  });

  test("connect with PSK falls back to plaintext when the device responds with a plaintext indicator during noise", async () => {

    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    noiseTransport.fail(new PeerClosedDuringNoiseError(
      "Peer responded with a plaintext indicator byte (0x00) during the noise handshake; the device may not support encryption.", "PEER_PLAINTEXT_DURING_NOISE"
    ));

    await delay(10);

    assert.equal(transports.length, 2);

    const plaintextTransport = transports[1];

    if(!plaintextTransport) {

      throw new Error("plaintext transport not constructed");
    }

    pushHandshake(plaintextTransport);

    await connectPromise;

    assert.equal(client.health().state, "connected");
    assert.equal(client.isEncrypted, false);

    client.disconnect();
  });

  test("connect with a PSK resolver falls back to plaintext like a string key, without calling the resolver, when the device answers in plaintext", async () => {

    // The resolver runs only after an encrypted device's server hello, so a device that answers the client's initial frame in plaintext takes the same fallback a
    // string key takes and never reaches the resolver.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    let resolverCalls = 0;
    const psk = (): string => {

      resolverCalls++;

      return Buffer.alloc(32, 0x55).toString("base64");
    };
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);

    const noiseTransport = transports[0];

    if(!noiseTransport) {

      throw new Error("noise transport not constructed");
    }

    noiseTransport.fail(new PeerClosedDuringNoiseError(
      "Peer responded with a plaintext indicator byte (0x00) during the noise handshake; the device may not support encryption.", "PEER_PLAINTEXT_DURING_NOISE"
    ));

    await delay(10);

    assert.equal(transports.length, 2, "a plaintext answer during noise must fall back and construct a second (plaintext) transport");

    const plaintextTransport = transports[1];

    if(!plaintextTransport) {

      throw new Error("plaintext transport not constructed");
    }

    pushHandshake(plaintextTransport);

    await connectPromise;

    assert.equal(client.health().state, "connected");
    assert.equal(client.isEncrypted, false);
    assert.equal(resolverCalls, 0, "the resolver must never be called for a device that does not speak encryption");

    client.disconnect();
  });
});

// 4. Discovery flow.

describe("EspHomeClient discovery flow", () => {

  test("discovery registers a single light entity with brand id 'light-bedroom_lamp'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0x10000001, name: "Bedroom Lamp", objectId: "bedroom_lamp", type: "light" }],
      signal: AbortSignal.timeout(2000)
    });

    const entities = client.getEntitiesWithIds();

    assert.equal(entities.length, 1);
    assert.equal(entities[0]?.id, "light-bedroom_lamp");
    assert.equal(client.hasEntity(entityId("light", "bedroom_lamp")), true);
    assert.equal(client.getEntityKey(entityId("light", "bedroom_lamp")), 0x10000001);

    client.disconnect();
  });

  test("discovery emits 'entities' event with the full registered list", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    let captured: { name?: string }[] = [];

    client.on("entities", (list): void => { captured = list; });

    await driveConnect(transport, client, {

      entities: [

        { key: 1, name: "Front Door", objectId: "front_door", type: "switch" },
        { key: 2, name: "Bedroom Lamp", objectId: "bedroom_lamp", type: "light" }
      ],
      signal: AbortSignal.timeout(2000)
    });

    assert.equal(captured.length, 2);
    client.disconnect();
  });

  test("discovery emits 'deviceInfo' event before 'entities'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const order: string[] = [];

    client.on("deviceInfo", (): void => { order.push("deviceInfo"); });
    client.on("entities", (): void => { order.push("entities"); });

    await driveConnect(transport, client, { entities: [{ key: 1, name: "L", objectId: "x", type: "light" }], signal: AbortSignal.timeout(2000) });

    assert.deepEqual(order, [ "deviceInfo", "entities" ]);
    client.disconnect();
  });

  test("discovery handles 1000 entities without overflow", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      host: "test.local", logger: quietLogger(), maxFieldsPerMessage: 4096, reconnect: false, transportFactory: (): MockTransport => transport
    });

    const entities: NonNullable<PushHandshakeOptions["entities"]> = Array.from({ length: 1000 },
      (_, i) => ({ key: i + 1, name: "Sensor " + String(i), objectId: "sensor_" + String(i), type: "sensor" }));

    // The whole entity stream is queued at once, before the connect starts, so the receiver's pump reads far ahead of the discovery loop. The host exempts its
    // list-entities types from the setup buffer's per-type cap, so every buffered entity waits for the discovery loop rather than being dropped.
    pushHandshake(transport, { entities });

    await client.connect({ signal: AbortSignal.timeout(5000) });

    assert.equal(client.getEntitiesWithIds().length, 1000);
    assert.equal(client.snapshotFor("sensor").size, 0, "discovery alone does not populate state cache");

    client.disconnect();
  });

  test("a same-type discovery burst queued before connect keeps every entity, in order, and logs no drop", async () => {

    const transport = new MockTransport();
    const capture = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: capture.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    // Every reply is queued before connect() starts, so the receiver's pump reads the whole burst into its setup buffer before the discovery loop takes any of it.
    pushHandshake(transport, { entities: DISCOVERY_BURST });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    assert.deepEqual(client.getEntitiesWithIds().map((entity) => entity.id), DISCOVERY_BURST.map((entity) => entityId(entity.type, entity.objectId)),
      "every entity of the burst must be registered, in the order the device sent it");
    assert.deepEqual(capture.warn, [], "a discovery burst must not trip the setup buffer's drop warning");

    client.disconnect();
  });

  test("a same-type discovery burst written in one chunk over the real transport keeps every entity, in order, and logs no drop", async () => {

    const socket = new DeferredWriteMockSocket();
    const capture = makeLogCapture();
    const client = new EspHomeClient({

      host: "test.local", keepAlive: false, logger: capture.logger, reconnect: false,
      transportFactory: async (options): Promise<Transport> => Transport.open({ ...options, socketFactory: (): Socket => socket as unknown as Socket })
    });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    // Yield a macrotask so the transport has attached its connect listener before the socket reports the connection.
    await delay(5);
    socket.simulateConnect();

    // The device's whole reply stream lands as one chunk, so the transport decodes every frame at once and the receiver's pump reads them all ahead of the connect flow.
    socket.pushData(Buffer.concat([

      plaintextFrame(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12),

      // The row reads nothing from the device information, so an empty payload, a valid message with every field absent, stands in for it.
      plaintextFrame(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0)),
      ...DISCOVERY_BURST.map((entity) => plaintextFrame(ENTITY_SCHEMAS[entity.type].listEntities.messageType,
        listEntitiesPayloadFor(entity.type, entity.key, entity.objectId, entity.name))),
      plaintextFrame(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE)
    ]));

    await connectPromise;

    assert.deepEqual(client.getEntitiesWithIds().map((entity) => entity.id), DISCOVERY_BURST.map((entity) => entityId(entity.type, entity.objectId)),
      "every entity of the burst must be registered, in the order the device sent it");
    assert.deepEqual(capture.warn, [], "a discovery burst must not trip the setup buffer's drop warning");

    client.disconnect();
  });

  test("a discovery burst of an extras list-entities type no built-in schema uses keeps every entity, in order, and logs no drop", async () => {

    // The vendor schema reuses the sensor wire format under a list-entities type id past every message type the protocol defines, so only the host's per-instance
    // set, built from its own schema table, can name it.
    const vendorListEntitiesType = Math.max(...Object.values(MessageType)) + 1;
    const sensor = aliasOf("sensor");
    const extras: Record<string, EntitySchema> = {

      "vendor_sensor": { ...sensor, listEntities: { ...sensor.listEntities, messageType: vendorListEntitiesType }, type: "vendor_sensor" }
    };
    const transport = new MockTransport();
    const capture = makeLogCapture();
    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: capture.logger, reconnect: false, transportFactory: (): MockTransport => transport
    });

    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    pushDeviceInfo(transport);

    for(const entity of DISCOVERY_BURST) {

      transport.pushInbound(vendorListEntitiesType, listEntitiesPayloadFor(entity.type, entity.key, entity.objectId, entity.name));
    }

    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await client.connect({ signal: AbortSignal.timeout(2000) });

    assert.deepEqual(client.getEntitiesWithIds().map((entity) => entity.id), DISCOVERY_BURST.map((entity) => entityId("vendor_sensor", entity.objectId)),
      "every entity of the extras burst must be registered, in the order the device sent it");
    assert.deepEqual(capture.warn, [], "an extras discovery burst must not trip the setup buffer's drop warning");

    client.disconnect();
  });

  test("discovery surfaces parent + sub-devices via subDevices()", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      signal: AbortSignal.timeout(2000),
      subDevices: [ { id: 1, name: "Bedroom Sub" }, { areaId: 3, id: 2, name: "Kitchen Sub" } ]
    });

    const subs = client.subDevices();

    assert.equal(subs.length, 2);
    assert.equal(subs[0]?.name, "Bedroom Sub");
    client.disconnect();
  });

  test("discovery registers user-defined services and emits 'services' / 'serviceDiscovered'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    let servicesEmitted = 0;
    let serviceDiscoveredCount = 0;

    client.on("services", (list): void => { servicesEmitted = list.length; });
    client.on("serviceDiscovered", (): void => { serviceDiscoveredCount++; });

    await driveConnect(transport, client, { services: [{ key: 0xCAFE0001, name: "test.service" }], signal: AbortSignal.timeout(2000) });

    assert.equal(serviceDiscoveredCount, 1);
    assert.equal(servicesEmitted, 1);
    assert.equal(client.services.list().length, 1);
    assert.equal(client.services.list()[0]?.name, "test.service");
    client.disconnect();
  });

  test("entitiesByDevice filters discovered entities by device_id", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [

        { key: 1, name: "S1", objectId: "s_one", type: "switch" },
        { key: 2, name: "S2", objectId: "s_two", type: "switch" }
      ],
      signal: AbortSignal.timeout(2000)
    });

    const allEntities = client.entitiesByDevice(undefined);
    const parentEntities = client.entitiesByDevice(0);

    assert.equal(allEntities.length, 2);
    // Both entities default to deviceId 0 (parent).
    assert.equal(parentEntities.length, 2);
    client.disconnect();
  });
});

// 5. State fanout per entity type.

describe("EspHomeClient state fanout - per entity type", () => {

  interface EntityFixture { type: EntityType; sample: { fieldNumber: number; wireType: WireType; value: Buffer | number }[]; assertion: (event: unknown) => void }

  // Each row exercises one entity type's state-response decoding path. We stamp a unique key, push a list-entities-* response so the registry knows the entity, push a
  // STATE_*_RESPONSE with one or more representative fields, and assert the bus emission. These rows cover each value-bearing entity type's state-message branch.
  const fixtures: EntityFixture[] = [

    {

      assertion: (e): void => { assert.equal((e as SwitchEvent).state, true); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "switch"
    },
    {

      assertion: (e): void => { assert.equal((e as LightEvent).state, true); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "light"
    },
    {

      assertion: (e): void => { assert.equal((e as SensorEvent).state, 23.5); },
      sample: [{ fieldNumber: 2, value: encodeFloat(23.5), wireType: WireType.FIXED32 }],
      type: "sensor"
    },
    {

      assertion: (e): void => { assert.equal((e as { state: boolean }).state, true); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "binary_sensor"
    },
    {

      assertion: (e): void => { assert.equal((e as TextSensorEvent).state, "hello"); },
      sample: [{ fieldNumber: 2, value: Buffer.from("hello", "utf8"), wireType: WireType.LENGTH_DELIMITED }],
      type: "text_sensor"
    },
    {

      assertion: (e): void => { assert.equal((e as NumberEvent).state, 42.0); },
      sample: [{ fieldNumber: 2, value: encodeFloat(42.0), wireType: WireType.FIXED32 }],
      type: "number"
    },
    {

      assertion: (e): void => { assert.equal((e as SelectEvent).state, "option-A"); },
      sample: [{ fieldNumber: 2, value: Buffer.from("option-A", "utf8"), wireType: WireType.LENGTH_DELIMITED }],
      type: "select"
    },
    {

      assertion: (e): void => { assert.equal((e as TextEvent).state, "text-x"); },
      sample: [{ fieldNumber: 2, value: Buffer.from("text-x", "utf8"), wireType: WireType.LENGTH_DELIMITED }],
      type: "text"
    },
    {

      assertion: (e): void => { assert.equal((e as DateEvent).year, 2026); },
      sample: [

        { fieldNumber: 2, value: 0, wireType: WireType.VARINT },
        { fieldNumber: 3, value: 2026, wireType: WireType.VARINT },
        { fieldNumber: 4, value: 5, wireType: WireType.VARINT },
        { fieldNumber: 5, value: 8, wireType: WireType.VARINT }
      ],
      type: "date"
    },
    {

      assertion: (e): void => { assert.ok((typeof (e as DateTimeEvent).epochSeconds === "number") || ((e as DateTimeEvent).missingState === false)); },
      sample: [{ fieldNumber: 3, value: encodeKey(1700000000), wireType: WireType.FIXED32 }],
      type: "datetime"
    },
    {

      assertion: (e): void => { assert.equal((e as TimeEvent).hour, 10); },
      sample: [

        { fieldNumber: 2, value: 0, wireType: WireType.VARINT },
        { fieldNumber: 3, value: 10, wireType: WireType.VARINT },
        { fieldNumber: 4, value: 30, wireType: WireType.VARINT },
        { fieldNumber: 5, value: 0, wireType: WireType.VARINT }
      ],
      type: "time"
    },
    {

      assertion: (e): void => { assert.equal(typeof (e as ClimateEvent).type, "string"); },
      sample: [{ fieldNumber: 2, value: 0, wireType: WireType.VARINT }],
      type: "climate"
    },
    {

      assertion: (e): void => { assert.equal((e as CoverEvent).position, 0.5); },
      sample: [{ fieldNumber: 3, value: encodeFloat(0.5), wireType: WireType.FIXED32 }],
      type: "cover"
    },
    {

      assertion: (e): void => { assert.equal((e as FanEvent).state, true); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "fan"
    },
    {

      // We narrow on LockState.LOCKED rather than the raw varint 1 so the state-fanout matrix doubles as a consumer-facing reference for the api-constants enum.
      // Wire value 1 corresponds to LOCK_STATE_LOCKED per api.proto §LockState.
      assertion: (e): void => { assert.equal((e as LockEvent).state, LockState.LOCKED); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "lock"
    },
    {

      assertion: (e): void => { assert.equal((e as SirenEvent).state, true); },
      sample: [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }],
      type: "siren"
    },
    {

      assertion: (e): void => { assert.equal((e as ValveEvent).position, 1.0); },
      sample: [{ fieldNumber: 2, value: encodeFloat(1.0), wireType: WireType.FIXED32 }],
      type: "valve"
    },
    {

      assertion: (e): void => { assert.equal(typeof (e as MediaPlayerEvent).type, "string"); },
      sample: [{ fieldNumber: 2, value: 0, wireType: WireType.VARINT }],
      type: "media_player"
    },
    {

      assertion: (e): void => { assert.equal(typeof (e as AlarmControlPanelEvent).type, "string"); },
      sample: [{ fieldNumber: 2, value: 0, wireType: WireType.VARINT }],
      type: "alarm_control_panel"
    },
    {

      assertion: (e): void => { assert.equal((e as EventEntityEvent).eventType, "boop"); },
      sample: [{ fieldNumber: 2, value: Buffer.from("boop", "utf8"), wireType: WireType.LENGTH_DELIMITED }],
      type: "event"
    },
    {

      assertion: (e): void => { assert.equal(typeof (e as UpdateEvent).type, "string"); },
      sample: [{ fieldNumber: 4, value: Buffer.from("1.0.0", "utf8"), wireType: WireType.LENGTH_DELIMITED }],
      type: "update"
    },
    {

      // Water heater state: current_temperature (field 2) is a fixed32 float; mode (field 4) is the WaterHeaterMode enum.
      assertion: (e): void => { assert.equal((e as WaterHeaterEvent).currentTemperature, 60.5); assert.equal((e as WaterHeaterEvent).mode, WaterHeaterMode.HEAT_PUMP); },
      sample: [

        { fieldNumber: 2, value: encodeFloat(60.5), wireType: WireType.FIXED32 },
        { fieldNumber: 4, value: WaterHeaterMode.HEAT_PUMP, wireType: WireType.VARINT }
      ],
      type: "water_heater"
    }
  ];

  for(const fix of fixtures) {

    test("state response for entity type '" + fix.type + "' decodes and emits via the per-type bus channel", async () => {

      const transport = new MockTransport();
      const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
      // Derive a deterministic key from the entity-type label so each fixture row has a distinct, predictable key. Hashing keeps the key inside fixed32 range and avoids
      // collisions across the fixture rows.
      let hash = 0;

      for(const ch of fix.type) {

        hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
      }

      const key = (0xC0DE0000 ^ hash) >>> 0;

      await driveConnect(transport, client, {

        entities: [{ key, name: fix.type + "-name", objectId: "obj_id", type: fix.type }],
        signal: AbortSignal.timeout(2000)
      });

      const events: unknown[] = [];

      client.on(fix.type, (e): void => { events.push(e); });

      transport.pushInbound(ENTITY_SCHEMAS[fix.type].state.messageType, statePayloadFor(fix.type, key, fix.sample));
      await delay(10);

      assert.ok(events.length >= 1, "expected at least one " + fix.type + " event");
      fix.assertion(events[0]);

      client.disconnect();
    });
  }

  test("state event populates the latest-state cache for branded id reads", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const id = entityId("switch", "front_door");

    await driveConnect(transport, client, {

      entities: [{ key: 999, name: "Front Door", objectId: "front_door", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 999, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(10);

    const latest = client.latest(id);

    assert.notEqual(latest, null);
    assert.equal(latest?.state, true);

    client.disconnect();
  });

  test("snapshot reflects every entity that has produced state, snapshotFor narrows by type", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [

        { key: 11, name: "L1", objectId: "lamp", type: "light" },
        { key: 12, name: "S1", objectId: "shelf", type: "switch" }
      ],
      signal: AbortSignal.timeout(2000)
    });

    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 11, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 0, wireType: WireType.VARINT }]));
    await delay(10);

    assert.equal(client.snapshot().size, 2);
    assert.equal(client.snapshotFor("light").size, 1);
    assert.equal(client.snapshotFor("switch").size, 1);
    assert.equal(client.snapshotFor("sensor").size, 0);

    client.disconnect();
  });

  test("telemetry channel emits the unified TelemetryEvent for every state response", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 7, name: "L", objectId: "lamp", type: "light" }],
      signal: AbortSignal.timeout(2000)
    });

    const events: { type: string }[] = [];

    client.on("telemetry", (e): void => { events.push({ type: e.type }); });

    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 7, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(10);

    assert.ok(events.length >= 1);
    assert.equal(events[0]?.type, "light");

    client.disconnect();
  });

  test("cache contract: latest/snapshot/snapshotFor reads from inside telemetry and per-type listeners see the just-emitted event", async () => {

    // This test locks in the mutate-then-notify ordering. If a future refactor reverses it (emit before latestCache.set), every assertion below flips to null/0 and the
    // test fails red. The contract matters for connect-then-construct consumers that use `client.snapshot()` from inside `on("telemetry")` as a completion gate.
    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const id = entityId("light", "bedroom");

    await driveConnect(transport, client, {

      entities: [{ key: 42, name: "Bedroom", objectId: "bedroom", type: "light" }],
      signal: AbortSignal.timeout(2000)
    });

    let latestInTelemetry: unknown = "unset";
    let snapshotSizeInTelemetry = -1;
    let snapshotForSizeInTelemetry = -1;
    let latestInPerType: unknown = "unset";

    client.on("telemetry", (): void => {

      latestInTelemetry = client.latest(id);
      snapshotSizeInTelemetry = client.snapshot().size;
      snapshotForSizeInTelemetry = client.snapshotFor("light").size;
    });

    client.on("light", (): void => {

      latestInPerType = client.latest(id);
    });

    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 42, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(10);

    assert.notEqual(latestInTelemetry, null, "client.latest(id) inside on(\"telemetry\") must see the just-emitted event");
    assert.notEqual(latestInTelemetry, "unset", "on(\"telemetry\") listener did not fire");
    assert.equal(snapshotSizeInTelemetry, 1, "client.snapshot() inside on(\"telemetry\") must include the just-emitted event");
    assert.equal(snapshotForSizeInTelemetry, 1, "client.snapshotFor(type) inside on(\"telemetry\") must include the just-emitted event");
    assert.notEqual(latestInPerType, null, "client.latest(id) inside on(\"light\") must see the just-emitted event");
    assert.notEqual(latestInPerType, "unset", "on(\"light\") listener did not fire");

    client.disconnect();
  });

  test("button command request fans out a synthetic button telemetry event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 555, name: "Trigger", objectId: "trig", type: "button" }],
      signal: AbortSignal.timeout(2000)
    });

    const presses: number[] = [];

    client.on("button", (e): void => { presses.push(e.key); });

    // BUTTON_COMMAND_REQUEST is special - the device echoes button presses back through the same wire id.
    transport.pushInbound(MessageType.BUTTON_COMMAND_REQUEST, encodeProtoFields([{ fieldNumber: 1, value: encodeKey(555), wireType: WireType.FIXED32 }]));
    await delay(10);

    assert.equal(presses.length, 1);
    assert.equal(presses[0], 555);
    client.disconnect();
  });
});

// 6. Lifecycle event ordering and disconnect paths.

describe("EspHomeClient.disconnect / disconnectAsync / dispose", () => {

  test("disconnect on a never-connected client is a no-op", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.disconnect());
  });

  test("Symbol.dispose tears down cleanly without throwing", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client[Symbol.dispose]());
  });

  test("Symbol.asyncDispose tears down cleanly without throwing", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    await client[Symbol.asyncDispose]();
  });

  test("disconnect after a connect emits 'lifecycle' disconnect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const events: string[] = [];

    client.on("lifecycle", (e): void => { events.push(e.kind); });

    client.disconnect();
    await delay(2);

    assert.ok(events.includes("disconnect"));
  });

  test("disconnect transitions health to 'disconnected'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    client.disconnect();
    await delay(2);

    assert.equal(client.health().state, "disconnected");
  });

  test("disconnect returns isEncrypted and capabilities() to their disconnected values after an encrypted session", async () => {

    // The mock reports an encrypted wire once a cipher pair is installed, and the client reads encryption from the transport it connected over, so installing a stub
    // pair before the connect yields an encrypted session without driving a full Noise handshake. The stub is never invoked: the mock does not encrypt.
    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    transport.installCipher({ receiveCipher: {}, sendCipher: {} } as unknown as NoiseCipherPair);
    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(client.isEncrypted, true, "the session must be encrypted before the disconnect for the reset to be observable");
    assert.equal(client.capabilities().encryption.active, true, "the connected capability record must report the encrypted wire");

    client.disconnect();

    assert.equal(client.isEncrypted, false, "isEncrypted must not report the torn-down session's encryption");
    assert.deepEqual(client.capabilities(), disconnectedCapabilities(), "capabilities() must return the disconnected placeholder once the session ends");
    assert.equal(client.deviceInfo(), null, "the torn-down session's device information must not outlive it");
  });

  test("connect() over a live session announces the superseded session's end before the new session's connect events and schedules no reconnect", async () => {

    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();
    const transportQueue = [ firstTransport, secondTransport ];
    const vended: MockTransport[] = [];
    const attemptDelays: number[] = [];

    // Reconnect is enabled with a short backoff so a reconnect wrongly scheduled for the superseded session would fire inside the wait below and vend a third transport.
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory: (): MockTransport => {

        const t = transportQueue.shift() ?? new MockTransport();

        vended.push(t);

        return t;
      }
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const events: string[] = [];

    client.on("connect", (): void => { events.push("connect"); });
    client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
    client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
    client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });

    await driveConnect(secondTransport, client, { signal: AbortSignal.timeout(2000) });

    // The full sequence: the superseded session's disconnect surface, then the new session's connect surface, with nothing in between and no reconnecting state.
    assert.deepEqual(events, [

      "healthChange:disconnected", "lifecycle:disconnect", "disconnect:superseded by a new connect", "connect", "healthChange:connected", "lifecycle:connect"
    ]);

    // Wait well past the reconnect backoff so a reconnect scheduled for the superseded session would have fired.
    await delay(60);

    assert.equal(attemptDelays.length, 0, "superseding a live session must not schedule an auto-reconnect of the session it replaces");
    assert.equal(vended.length, 2, "no reconnect attempt may vend a third transport");
    assert.equal(client.health().state, "connected", "the superseding session must remain live");

    client.disconnect();
  });

  test("disconnect keeps the last-known state readable through latest() and snapshot()", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 12, name: "S1", objectId: "shelf", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    const id = entityId("switch", "shelf");

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await transport.whenIdle();

    const lastState = client.latest(id);

    assert.notEqual(lastState, null, "the state event must be recorded before the disconnect");

    client.disconnect();

    // latest() promises the last-known state until the next connect(), so the connection teardown must leave the latest-state cache alone.
    assert.deepEqual(client.latest(id), lastState, "latest() must still return the last state after a disconnect");
    assert.equal(client.snapshot().size, 1, "snapshot() must still hold the last state after a disconnect");
    assert.deepEqual(client.snapshot().get(id), lastState, "snapshot() must hold the same last state latest() returns");
  });

  test("disconnect rejects an in-flight sub-API correlator promptly, not after its per-await timeout", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Park a serial-proxy Correlator: getModemPins sends its request and awaits the matching response, which never arrives because we disconnect below. The wait
    // composes the connection scope the serial host object hands out, so the disconnect's abort of that scope ends it with the scope's own reason, and the
    // elapsed-time bound shows the disconnect, not the 2000ms per-await timeout, settled it.
    const scope = attachedSignal(client);
    const pending = client.serial.getModemPins(0, { timeoutMs: 2000 });
    let settled = false;

    void pending.then((): void => { settled = true; }, (): void => { settled = true; });

    // The await must still be in flight right after issuing it - no response was pushed.
    await delay(5);
    assert.equal(settled, false, "the modem-pins await must be pending before disconnect");

    const disconnectedAt = Date.now();

    client.disconnect();

    // The teardown aborts the scope with its connection-lost error inside the disconnect's synchronous span, and the wait rejects with that error by identity. A wait
    // that missed the scope would linger to its 2000ms timeout; the elapsed-time bound below is what proves the disconnect - not the timeout - settled it.
    await assert.rejects(pending, (err: unknown): boolean => err === scope.reason);

    const elapsed = Date.now() - disconnectedAt;

    assert.ok(elapsed < 250, "the await must reject promptly on disconnect, not linger to its per-await timeout: " + String(elapsed) + "ms");
  });

  test("disconnectAsync sends DISCONNECT_REQUEST and resolves on DISCONNECT_RESPONSE", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const promise = client.disconnectAsync();

    await delay(5);
    transport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);
    await promise;

    const types = transport.outboundFrames.map((f): number => f.type);

    assert.ok(types.includes(MessageType.DISCONNECT_REQUEST), "graceful disconnect must send DISCONNECT_REQUEST");
    assert.equal(client.health().state, "disconnected");
  });

  test("concurrent disconnectAsync calls share one graceful disconnect: the device sees one DISCONNECT_REQUEST and both calls resolve", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const first = client.disconnectAsync();
    const second = client.disconnectAsync();

    await delay(5);
    transport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);
    await Promise.all([ first, second ]);

    assert.equal(transport.outboundFrames.filter((f): boolean => f.type === MessageType.DISCONNECT_REQUEST).length, 1, "the calls must share one request");
    assert.equal(client.health().state, "disconnected");
  });

  test("disconnectAsync falls through to teardown on graceful timeout", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      gracefulDisconnectTimeoutMs: 50, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Don't push a DISCONNECT_RESPONSE; let the graceful timer fire.
    await client.disconnectAsync();

    assert.equal(client.health().state, "disconnected");
  });

  test("a disconnect() during a pending disconnectAsync() resolves it at once rather than at the graceful timeout", async () => {

    const log = makeLogCapture();
    const transport = new MockTransport();
    const client = new EspHomeClient({

      gracefulDisconnectTimeoutMs: 10000, host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport
    });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // No DISCONNECT_RESPONSE is pushed, so only the teardown the synchronous disconnect runs can end the graceful wait before its long timeout.
    const graceful = client.disconnectAsync();

    await delay(5);

    const disconnectedAt = Date.now();

    client.disconnect();
    await graceful;

    const elapsed = Date.now() - disconnectedAt;

    assert.ok(elapsed < 500, "the graceful disconnect must resolve once the teardown ends its wait, far short of its timeout: " + String(elapsed) + " ms");
    assert.equal(log.debug.some((line): boolean => line.includes("Graceful disconnect timed out")), false, "a teardown that ends the wait is not a timeout");
    assert.equal(client.health().state, "disconnected");
  });

  test("disconnectAsync on a never-connected client is a no-op", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    await client.disconnectAsync();
    assert.equal(client.health().state, "disconnected");
  });

  test("stray DISCONNECT_RESPONSE arriving after disconnectAsync settles still routes through teardown", async () => {

    // A DISCONNECT_RESPONSE that arrives after the graceful timeout already fell through still tears the connection down. The Correlator returns `false` from
    // `resolve` on a stray response; the host's `acknowledgeDisconnectResponse` branches on the boolean to call `disconnectInternal` in that case.
    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // After the connection is up, simulate a stray response with no graceful-disconnect in flight.
    transport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);
    await delay(10);

    assert.equal(client.health().state, "disconnected", "the stray response must drive the connection to disconnected via disconnectInternal");
  });

  test("Symbol.asyncDispose performs the graceful disconnect handshake", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      gracefulDisconnectTimeoutMs: 100, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const promise = client[Symbol.asyncDispose]();

    await delay(5);
    transport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);
    await promise;

    assert.equal(client.health().state, "disconnected");
  });

  test("device-initiated DISCONNECT_REQUEST triggers acknowledgement and teardown", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    transport.pushInbound(MessageType.DISCONNECT_REQUEST, DISCONNECT_REQUEST_PAYLOAD);
    await delay(10);

    const types = transport.outboundFrames.map((f): number => f.type);

    assert.ok(types.includes(MessageType.DISCONNECT_RESPONSE), "must acknowledge device-initiated disconnect with DISCONNECT_RESPONSE");
    assert.equal(client.health().state, "disconnected");
  });

  test("disconnect is a no-op on repeated calls", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    client.disconnect();

    assert.doesNotThrow((): void => client.disconnect());
    assert.doesNotThrow((): void => client.disconnect());
  });

  // Host-level proof driven end-to-end through MockTransport: a voice-assistant subscription with non-zero flags must survive a full disconnect/reconnect
  // cycle, and the host's connect-bottom reissue loop must replay the SUBSCRIBE frame onto the FRESH transport carrying the originally-requested flags. The host hands a
  // distinct transport to each connect (transport is single-shot), so the assertion that the second transport carries the SUBSCRIBE proves the reissue, not a residual
  // frame from the first connection.
  test("a voice-assistant subscription with non-zero flags survives a full reconnect cycle and re-issues SUBSCRIBE with the original flags", async () => {

    const subscribeFlags = 1;
    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();

    // The host constructs one transport per connect (transport is single-shot), so the factory hands out the first transport on connect #1 and the second on reconnect.
    const transportQueue = [ firstTransport, secondTransport ];

    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    // First connect, then the consumer subscribes to the voice assistant with a non-zero flag.
    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });
    client.voiceAssistant.subscribe(subscribeFlags);

    // Sanity: the SUBSCRIBE landed on the first transport with the requested flags.
    const firstSubscribe = firstTransport.outboundFrames.find((f): boolean => f.type === MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST);

    assert.ok(firstSubscribe !== undefined, "the initial subscribe must send SUBSCRIBE_VOICE_ASSISTANT_REQUEST on the first transport");

    // Tear down the first connection and reconnect onto the second transport.
    client.disconnect();
    await delay(5);
    await driveConnect(secondTransport, client, { signal: AbortSignal.timeout(2000) });

    // The reissue must have replayed the SUBSCRIBE onto the fresh transport with the ORIGINAL flags.
    const reissued = secondTransport.outboundFrames.find((f): boolean => f.type === MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST);

    assert.ok(reissued !== undefined, "the reconnect must re-issue SUBSCRIBE_VOICE_ASSISTANT_REQUEST on the second transport");

    const fields = decodeProtobuf(reissued?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 1, "subscribe=1 on the replayed frame");
    assert.equal(fields[2]?.[0], subscribeFlags, "the replayed SUBSCRIBE carries the original non-zero flags across the reconnect");

    client.disconnect();
  });

  // Host-level proof that the Home-Assistant bridge now participates in the reset/reissue cycle: a HA services + states subscription must survive a full disconnect /
  // reconnect cycle, and the host's connect-bottom reissue loop must replay both SUBSCRIBE frames onto the FRESH transport. The host hands a distinct transport to each
  // connect (transport is single-shot), so the assertion that the second transport carries the SUBSCRIBE frames proves the reissue, not residual frames from the first.
  test("a Home-Assistant subscription survives a full reconnect cycle and re-issues the subscribe frames", async () => {

    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();

    // The host constructs one transport per connect (transport is single-shot), so the factory hands out the first transport on connect #1 and the second on reconnect.
    const transportQueue = [ firstTransport, secondTransport ];

    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    // First connect, then the consumer subscribes to both Home-Assistant feeds.
    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });
    client.homeAssistant.subscribeServices();
    client.homeAssistant.subscribeStates();

    // Sanity: the services subscribe landed on the first transport.
    const firstServices = firstTransport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST);

    assert.ok(firstServices, "the initial services subscribe must land on the first transport");

    // Tear down the first connection and reconnect onto the second transport.
    client.disconnect();
    await delay(5);
    await driveConnect(secondTransport, client, { signal: AbortSignal.timeout(2000) });

    // The reissue must have replayed BOTH subscribe frames onto the fresh transport.
    const reissuedServices = secondTransport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST);
    const reissuedStates = secondTransport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST);

    assert.ok(reissuedServices, "the reconnect must re-issue the services subscribe on the second transport");
    assert.ok(reissuedStates, "the reconnect must re-issue the states subscribe on the second transport");

    client.disconnect();
  });
});

// 6b. Run-phase terminal-completion hook (passive transport death during the run phase)

describe("EspHomeClient run-phase terminal-completion hook", () => {

  test("a passive run-phase transport death drives a lifecycle disconnect carrying the real typed cause", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleEvents: { cause?: EspHomeError; kind: string }[] = [];
    const disconnectReasons: (string | undefined)[] = [];

    client.on("lifecycle", (e): void => { lifecycleEvents.push(e); });
    client.on("disconnect", (reason): void => { disconnectReasons.push(reason); });

    // Simulate a passive transport death during the run phase: the run-phase pump is parked on the transport's iterator, and fail() rejects that parked awaiter with a
    // typed cause (peer RST/FIN, device reboot, mid-session decrypt failure, oversized frame). Without the terminal hook this death is a silent no-op and the client
    // hangs falsely CONNECTED.
    const peerDeath = new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED");

    transport.fail(peerDeath);
    await delay(5);

    const disconnectEvent = lifecycleEvents.find((e) => e.kind === "disconnect");

    assert.ok(disconnectEvent, "a passive run-phase transport death must emit a lifecycle disconnect");
    assert.equal(disconnectEvent.cause, peerDeath, "the lifecycle disconnect must carry the real typed cause the transport died with");
    assert.ok(disconnectReasons.includes("transport terminated"), "the legacy disconnect event must carry the host's transport-terminated reason");
    assert.equal(client.health().state, "disconnected", "the client must transition out of the false CONNECTED state");

    client.disconnect();
  });

  test("a passive run-phase transport death schedules an auto-reconnect under the default config", async () => {

    const firstTransport = new MockTransport();
    const transports: MockTransport[] = [];

    // The factory vends the explicitly-held first transport for the initial connect, then fresh transports for every reconnect attempt. We hold the first reference so
    // driveConnect can push the handshake frames onto it before the reconnect vends a second one.
    const transportFactory = (): MockTransport => {

      const t = (transports.length === 0) ? firstTransport : new MockTransport();

      transports.push(t);

      return t;
    };
    const attemptDelays: number[] = [];

    // Reconnect is enabled with a small initialDelayMs so a real retry surfaces inside the test's wait window; onAttempt is the canonical "the supervisor decided to
    // retry" observation point. A fresh transport is vended per connect attempt, matching the transport-factory contract.
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 3, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    // Kill the live transport passively; the terminal hook must escalate to disconnectInternal, which gates maybeScheduleReconnect on the typed cause.
    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));

    // Wait past initialDelayMs so the scheduled reconnect attempt fires.
    await delay(60);

    assert.ok(attemptDelays.length > 0, "a passive run-phase transport death must schedule an auto-reconnect attempt under the default config");
    assert.ok(transports.length >= 2, "the reconnect attempt must vend a fresh transport from the factory");

    client.disconnect();
  });

  test("a manual connect() while a reconnect loop is parked in backoff supersedes the loop and is not torn down by it", async () => {

    const firstTransport = new MockTransport();
    const manualTransport = new MockTransport();
    const vended: MockTransport[] = [];

    // Vend the first transport for the initial connect, the manual transport for the consumer's mid-backoff connect, then fresh transports for any (buggy) third attempt.
    const transportQueue = [ firstTransport, manualTransport ];
    const transportFactory = (): MockTransport => {

      const t = transportQueue.shift() ?? new MockTransport();

      vended.push(t);

      return t;
    };
    const attemptDelays: number[] = [];

    // initialDelayMs is large enough that the manual connect lands while the supervisor is parked in its backoff sleep, small enough to keep the test fast.
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 80, jitter: 0, maxAttempts: 3, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    // A passive run-phase death schedules a reconnect; the supervisor parks in its 80 ms backoff sleep.
    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
    await delay(15);

    // While the supervisor is parked, the consumer connects manually. This must cancel-and-drain the loop, then establish a fresh session on the manual transport.
    await driveConnect(manualTransport, client, { signal: AbortSignal.timeout(2000) });
    assert.equal(client.health().state, "connected", "the manual connect must establish a live session");

    // Wait well past the supervisor's backoff so a surviving loop would have woken and torn down the manual session.
    await delay(140);

    assert.equal(client.health().state, "connected", "the superseded reconnect loop must not tear down the manually-established session");
    assert.equal(vended.length, 2, "the manual connect must cancel the in-flight reconnect loop, so no third transport is vended");

    client.disconnect();
  });

  test("with keepAlive disabled, a passive run-phase transport death still recovers (no silent hang)", async () => {

    const firstTransport = new MockTransport();
    const transports: MockTransport[] = [];

    const transportFactory = (): MockTransport => {

      const t = (transports.length === 0) ? firstTransport : new MockTransport();

      transports.push(t);

      return t;
    };
    const attemptDelays: number[] = [];

    // keepAlive:false disarms the heartbeat stall timer, leaving the terminal-completion hook as the only remaining run-phase liveness detector, so a passive
    // transport death must still drive teardown and auto-reconnect rather than hanging forever.
    const client = new EspHomeClient({

      host: "test.local",
      keepAlive: false,
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 3, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const disconnectReasons: (string | undefined)[] = [];

    client.on("disconnect", (reason): void => { disconnectReasons.push(reason); });

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
    await delay(60);

    assert.ok(disconnectReasons.includes("transport terminated"), "with keepAlive disabled, the terminal hook must still tear the connection down");
    assert.ok(attemptDelays.length > 0, "with keepAlive disabled, the terminal hook must still schedule auto-reconnect (no silent hang)");

    client.disconnect();
  });
});

// 7. Subscription rails - on / once / stream.

describe("EspHomeClient.on / once / stream subscription rails", () => {

  test("on returns a Disposable that unsubscribes when disposed", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const sub = client.on("connect", (): void => undefined);

    assert.equal(typeof sub[Symbol.dispose], "function");
    sub[Symbol.dispose]();
  });

  test("stream returns an AsyncIterable", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const stream = client.stream("telemetry");

    assert.equal(typeof stream[Symbol.asyncIterator], "function");
  });

  test("once resolves on the next matching event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const oncePromise = client.once("connect");

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const value = await oncePromise;

    assert.equal(value, false, "plaintext connect emits encrypted=false");
    client.disconnect();
  });

  test("once rejects when its signal is aborted", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const controller = new AbortController();

    const oncePromise = client.once("connect", { signal: controller.signal });

    setImmediate((): void => controller.abort());
    await assert.rejects(oncePromise, (err: unknown): boolean => err === controller.signal.reason);
  });

  test("a once() for connect registered while connected resolves on the next connect, since a teardown ends no once()", async () => {

    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();
    const transportQueue = [ firstTransport, secondTransport ];
    const client = new EspHomeClient({

      host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const next = client.once("connect", { signal: AbortSignal.timeout(2000) });

    client.disconnect();
    await driveConnect(secondTransport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(await next, false, "the once() must outlive the teardown and resolve on the reconnect's announcement");
    client.disconnect();
  });

  test("subscriptions registered before connect fire after connect (subscribe-before-connect contract)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const events: boolean[] = [];

    client.on("connect", (e): void => { events.push(e); });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    assert.equal(events.length, 1);

    client.disconnect();
  });
});

// 8. Pre-connect entity-registry accessor surface.

describe("EspHomeClient entity-registry accessors before connect", () => {

  test("hasEntity returns false for any string when registry is empty", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.hasEntity("light-anything"), false);
  });

  test("getEntityKey returns null for an unknown branded id", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.getEntityKey(entityId("light", "kitchen")), null);
  });

  test("getEntityById returns null for an unknown branded id", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.getEntityById(entityId("switch", "front")), null);
  });

  test("getEntitiesWithIds returns an empty array before discovery", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.deepEqual(client.getEntitiesWithIds(), []);
  });

  test("getAvailableEntityIds returns an empty record before discovery", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.deepEqual(client.getAvailableEntityIds(), {});
  });

  test("entitiesByDevice returns an empty array for any device id before discovery", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.deepEqual(client.entitiesByDevice(0), []);
    assert.deepEqual(client.entitiesByDevice(99), []);
    assert.deepEqual(client.entitiesByDevice(undefined), []);
  });
});

describe("EspHomeClient.latest before connect", () => {

  test("latest returns null for any branded id", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.latest(entityId("light", "x")), null);
  });

  test("snapshot returns an empty map", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.snapshot().size, 0);
  });

  test("snapshotFor returns an empty map for any type", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.snapshotFor("light").size, 0);
    assert.equal(client.snapshotFor("switch").size, 0);
  });
});

describe("EspHomeClient telemetry stream wrappers", () => {

  test("telemetry() returns an AsyncIterable<TelemetryEvent>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(typeof client.telemetry()[Symbol.asyncIterator], "function");
  });

  test("telemetryFor() returns an AsyncIterable narrowed by type", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(typeof client.telemetryFor("light")[Symbol.asyncIterator], "function");
  });

  test("telemetryForId() returns an AsyncIterable narrowed by id", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const stream = client.telemetryForId(entityId("sensor", "temperature"));

    assert.equal(typeof stream[Symbol.asyncIterator], "function");
  });

  test("telemetryForId() for an id the client has not discovered opens no bus stream and ends at once", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    // The bus is private; the listener count on the per-type channel is the observable for whether a stream was opened on it.
    const bus = (client as unknown as { bus: { listenerCount: (event: string) => number } }).bus;
    const before = bus.listenerCount("sensor");
    const view = client.telemetryForId(entityId("sensor", "temperature"));

    assert.equal(bus.listenerCount("sensor"), before, "an unknown id must not attach a listener to the per-type channel");

    const iterator = view[Symbol.asyncIterator]();

    assert.deepEqual(await iterator.next(), { done: true, value: undefined }, "the view for an unknown id must end at once");
    assert.equal(bus.listenerCount("sensor"), before, "ending the view must leave the per-type channel's listener count unchanged");
  });

  test("telemetryReadable() returns a ReadableStream<TelemetryEvent>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const readable = client.telemetryReadable();

    assert.equal(readable.locked, false);
    assert.notEqual(readable, null);
  });

  test("telemetryForId yields only events for the matching entity key", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [

        { key: 100, name: "L1", objectId: "lamp_one", type: "light" },
        { key: 101, name: "L2", objectId: "lamp_two", type: "light" }
      ],
      signal: AbortSignal.timeout(2000)
    });

    const id = entityId("light", "lamp_one");
    const events: number[] = [];

    const controller = new AbortController();

    void (async (): Promise<void> => {

      for await (const e of client.telemetryForId(id, { signal: controller.signal })) {

        events.push((e as { key: number }).key);

        if(events.length >= 1) {

          break;
        }
      }
    })();

    await delay(2);
    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 101, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 100, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));

    await delay(20);
    controller.abort();
    client.disconnect();

    assert.equal(events[0], 100);
  });

  test("return() on a telemetryForId view that was never iterated detaches its bus listener", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { entities: [{ key: 100, name: "L1", objectId: "lamp_one", type: "light" }], signal: AbortSignal.timeout(2000) });

    // The bus is private; the listener count on the per-type channel is the observable for whether the view still holds its stream.
    const bus = (client as unknown as { bus: { listenerCount: (event: string) => number } }).bus;
    const before = bus.listenerCount("light");
    const iterator = client.telemetryForId(entityId("light", "lamp_one"))[Symbol.asyncIterator]();

    assert.equal(bus.listenerCount("light"), before + 1, "the view attaches its listener when it is requested");

    await iterator.return!();

    assert.equal(bus.listenerCount("light"), before, "return() must detach the listener even though the view was never iterated");
    client.disconnect();
  });
});

describe("EspHomeClient lifecycle stream + health", () => {

  test("lifecycle() returns an AsyncIterable<LifecycleEvent>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(typeof client.lifecycle()[Symbol.asyncIterator], "function");
  });

  test("lifecycleReadable() returns a ReadableStream<LifecycleEvent>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const readable = client.lifecycleReadable();

    assert.equal(readable.locked, false);
  });

  test("healthStream() returns an AsyncIterable<ConnectionHealth>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(typeof client.healthStream()[Symbol.asyncIterator], "function");
  });

  test("onHealthChange returns a Disposable", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const sub = client.onHealthChange((): void => undefined);

    assert.equal(typeof sub[Symbol.dispose], "function");
    sub[Symbol.dispose]();
  });

  test("onHealthChange fires with 'connected' record after a successful connect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    const states: string[] = [];

    client.onHealthChange((h): void => { states.push(h.state); });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.ok(states.includes("connected"));
    client.disconnect();
    await delay(2);
    assert.ok(states.includes("disconnected"));
  });

  test("every healthChange payload is frozen and is the record health() returns while the listener runs", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const seen: { current: ConnectionHealth; payload: ConnectionHealth }[] = [];

    client.onHealthChange((payload): void => { seen.push({ current: client.health(), payload }); });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Inbound traffic stamps the activity time on every frame without announcing it, so the connected session emits nothing until the disconnect.
    transport.pushInbound(MessageType.PING_REQUEST, PING_REQUEST_PAYLOAD);
    await delay(5);
    client.disconnect();

    assert.deepEqual(seen.map((entry): string => entry.payload.state), [ "connected", "disconnected" ], "each transition must emit exactly once");

    for(const { current, payload } of seen) {

      assert.equal(Object.isFrozen(payload), true, "each healthChange payload must be frozen");
      assert.equal(payload, current, "each healthChange payload must be the record health() returns while the listener runs");
    }

    assert.equal(client.health(), seen.at(-1)?.payload, "health() must keep returning the last announced record");
  });
});

// 9. Camera per-id sub-API.

describe("EspHomeClient.camera per-id sub-API caching", () => {

  test("returns the same CameraApi instance for repeated calls with the same branded id", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const id = entityId("camera", "front");

    const a = client.camera(id);
    const b = client.camera(id);

    assert.equal(a, b);
  });

  test("returns different CameraApi instances for different ids", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    const a = client.camera(entityId("camera", "front"));
    const b = client.camera(entityId("camera", "back"));

    assert.notEqual(a, b);
  });

  test("camera image multi-packet reassembly aggregates into one event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0xCA000001, name: "Front Cam", objectId: "front_cam", type: "camera" }],
      signal: AbortSignal.timeout(2000)
    });

    const events: { name: string; image: Buffer }[] = [];

    client.on("camera", (e): void => { events.push(e); });

    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xCA000001, Buffer.from([ 0x01, 0x02 ]), false));
    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xCA000001, Buffer.from([ 0x03, 0x04 ]), true));
    await delay(10);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.image.length, 4);
    assert.deepEqual(events[0]?.image, Buffer.from([ 0x01, 0x02, 0x03, 0x04 ]));

    client.disconnect();
  });

  test("a finished camera image is cached as the camera's latest state before it reaches the telemetry and camera channels", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const camId = entityId("camera", "front_cam");

    await driveConnect(transport, client, {

      entities: [{ key: 0xCA000003, name: "Front Cam", objectId: "front_cam", type: "camera" }],
      signal: AbortSignal.timeout(2000)
    });

    const seen: { cached: unknown; channel: string; event: unknown }[] = [];

    client.on("telemetry", (event): void => { seen.push({ cached: client.latest(camId), channel: "telemetry", event }); });
    client.on("camera", (event): void => { seen.push({ cached: client.latest(camId), channel: "camera", event }); });

    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xCA000003, Buffer.from([ 0x01, 0x02 ]), false));
    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xCA000003, Buffer.from([0x03]), true));
    await delay(10);

    assert.deepEqual(seen.map((entry): string => entry.channel), [ "telemetry", "camera" ], "one finished image must reach each channel exactly once, telemetry first");

    const event = seen[0]?.event;

    assert.equal(seen[1]?.event, event, "both channels must carry the same event");
    assert.deepEqual((event as { image: Buffer }).image, Buffer.from([ 0x01, 0x02, 0x03 ]));
    assert.equal(seen[0]?.cached, event, "the cache must hold the image before the telemetry listener runs");
    assert.equal(seen[1]?.cached, event, "the cache must hold the image before the camera listener runs");
    assert.equal(client.latest(camId), event, "latest(cameraId) must return the finished image");
    assert.equal(client.snapshot().get(camId), event, "the snapshot must carry the camera's entry");

    client.disconnect();
  });

  test("an open camera stream survives a reconnect: the stream request goes out again on the new transport, and the last view's close stops it", async () => {

    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();

    // The host constructs one transport per connect (transport is single-shot), so the factory hands out the first transport on connect #1 and the second on reconnect.
    const transportQueue = [ firstTransport, secondTransport ];
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });
    const entities: NonNullable<PushHandshakeOptions["entities"]> = [{ key: 0xCA000004, name: "Front Cam", objectId: "front_cam", type: "camera" }];

    // Count the CameraImageRequest frames on one transport that carry single=false and the given stream flag. Bytes per api.proto's CameraImageRequest: field 1 (single)
    // VARINT 0 -> 0x08 0x00; field 2 (stream) VARINT -> 0x10 and the flag.
    const streamRequests = (transport: MockTransport, stream: number): number => {

      const payload = Buffer.from([ 0x08, 0x00, 0x10, stream ]);

      return transport.outboundFrames.filter((frame): boolean => (frame.type === MessageType.CAMERA_IMAGE_REQUEST) && frame.payload.equals(payload)).length;
    };

    await driveConnect(firstTransport, client, { entities, signal: AbortSignal.timeout(2000) });

    const iterator = client.camera(entityId("camera", "front_cam")).stream()[Symbol.asyncIterator]();
    const nextFrame = iterator.next();

    assert.equal(streamRequests(firstTransport, 1), 1, "opening the view must request the stream on the first transport");

    // Tear down the first connection and reconnect onto the second transport. The parked view stays open across the cycle because the bus is never disposed.
    client.disconnect();
    await delay(5);
    await driveConnect(secondTransport, client, { entities, signal: AbortSignal.timeout(2000) });

    assert.equal(streamRequests(firstTransport, 0), 0, "the disconnect must not send a stop for a view that is still open");
    assert.equal(streamRequests(secondTransport, 1), 1, "the reconnect must request the stream again for the view still open");

    // The view keeps yielding on the new connection.
    secondTransport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xCA000004, Buffer.from([0x42]), true));

    const frame = await nextFrame;

    assert.deepEqual(frame.value, Buffer.from([0x42]), "the view must yield the image the new connection delivers");

    await iterator.return?.();

    assert.equal(streamRequests(secondTransport, 0), 1, "closing the last view must stop the stream on the live transport");

    client.disconnect();
  });

  test("camera image for an unknown key is dropped with a warn log", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(0xDEADBEEF, Buffer.from([0x42]), true));
    await delay(10);

    assert.ok(log.warn.some((m): boolean => m.includes("camera")), "expected a camera-related warning for the unknown key");
    client.disconnect();
  });

  test("a pending camera.snapshot rejects promptly with the connection-lost error the disconnect aborted the connection with", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0xCA000002, name: "Front Cam", objectId: "front_cam", type: "camera" }],
      signal: AbortSignal.timeout(2000)
    });

    const scope = attachedSignal(client);
    const start = Date.now();
    const snapshotPromise = client.camera(entityId("camera", "front_cam")).snapshot({ timeoutMs: 5000 });

    // Yield so the snapshot's stream subscription attaches before the disconnect.
    await delay(5);

    client.disconnect();

    await assert.rejects(snapshotPromise, (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionLostError, "the teardown must reject the snapshot with a ConnectionLostError");
      assert.equal(err, scope.reason, "the snapshot must reject with the one error the teardown aborted the connection with");

      return true;
    });

    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, "the teardown must end the snapshot at once rather than at its timeout - observed " + String(elapsed) + " ms");
  });

  test("a camera.snapshot issued after the client disconnects is refused at once with NOT_CONNECTED and sends no image request", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0xCA000002, name: "Front Cam", objectId: "front_cam", type: "camera" }],
      signal: AbortSignal.timeout(2000)
    });

    client.disconnect();

    await assert.rejects(client.camera(entityId("camera", "front_cam")).snapshot({ timeoutMs: 1000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });
    assert.equal(transport.outboundFrames.filter((f): boolean => f.type === MessageType.CAMERA_IMAGE_REQUEST).length, 0, "a refused snapshot sends no request");
  });
});

describe("EspHomeClient.deviceInfo", () => {

  test("returns null before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.deviceInfo(), null);
  });

  test("returns the frozen record after discovery, the same object the single deviceInfo event carried before entities", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const emitted: DeviceInfo[] = [];
    const order: string[] = [];

    client.on("deviceInfo", (info): void => { emitted.push(info); order.push("deviceInfo"); });
    client.on("entities", (): void => { order.push("entities"); });

    await driveConnect(transport, client, {

      deviceInfo: mockDeviceInfo({ serialProxies: [{ name: "uart_0", portType: SerialProxyPortType.TTL }] }),
      signal: AbortSignal.timeout(2000)
    });

    const info = client.deviceInfo();

    assert.deepEqual(order, [ "deviceInfo", "entities" ], "discovery must emit deviceInfo exactly once, before entities");
    assert.equal(info, emitted[0], "deviceInfo() must return the record the event carried");
    assert.equal(client.deviceInfo(), info, "repeated reads must return the same record");
    assert.equal(Object.isFrozen(info), true, "the record must be frozen");
    assert.deepEqual(info?.serialProxies, [{ name: "uart_0", portType: SerialProxyPortType.TTL }], "the record must carry exactly the queued serial proxy");
    assert.equal(Object.isFrozen(info?.serialProxies), true, "the nested serial-proxy list must be frozen");
    assert.equal(Object.isFrozen(info?.serialProxies?.[0]), true, "each serial-proxy entry must be frozen");

    // The record type is read-only, so the write goes through a writable view: the guarantee under test is that a plain JavaScript caller's write to the frozen record
    // throws rather than corrupting it.
    assert.throws((): void => { (info as { name?: string }).name = "mutated"; }, TypeError);
    assert.equal(client.deviceInfo()?.name, "test-device", "a rejected write must leave the record unchanged");

    client.disconnect();
  });

  test("an unsolicited DEVICE_INFO_RESPONSE during run phase refreshes deviceInfo, recomputes capabilities, emits the event, and never warns 'Unhandled message type'",
    async () => {

      const transport = new MockTransport();
      const log = makeLogCapture();
      const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      assert.notEqual(client.deviceInfo(), null);

      const refreshes: DeviceInfo[] = [];
      const sub = client.on("deviceInfo", (info): void => { refreshes.push(info); });

      pushDeviceInfo(transport, { deviceInfo: mockDeviceInfo({ friendlyName: "Refreshed Name", voiceAssistantFeatureFlags: 5 }) });
      await delay(10);

      assert.equal(refreshes.length, 1);
      assert.equal(refreshes[0]?.friendlyName, "Refreshed Name");

      const refreshedInfo = client.deviceInfo();

      assert.equal(refreshedInfo, refreshes[0], "the refreshed record must be the object the event carried");
      assert.equal(Object.isFrozen(refreshedInfo), true, "the refreshed record must be frozen");
      assert.equal(refreshedInfo?.friendlyName, "Refreshed Name");
      assert.equal(refreshedInfo?.voiceAssistantFeatureFlags, 5);

      // voiceAssistantFeatureFlags=5 is binary 101: bit 0 (VOICE_ASSISTANT -> supported) and bit 2 (API_AUDIO -> apiAudio).
      const caps = client.capabilities();

      assert.equal(caps.voiceAssistant.supported, true);
      assert.equal(caps.voiceAssistant.apiAudio, true);

      assert.equal(log.warn.filter((m) => m.includes("Unhandled message type")).length, 0);

      sub[Symbol.dispose]();
      client.disconnect();
    });
});

// 10. Pre-connect callable surface (no-throw guarantees).

describe("EspHomeClient.subscribeToLogs / sendPing / executeService - pre-connect behavior", () => {

  test("subscribeToLogs is callable but no-ops before connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.subscribeToLogs());
  });

  test("sendPing is callable but no-ops before connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.sendPing());
  });

  test("logAllEntityIds is a no-op when no entities are discovered", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.logAllEntityIds());
  });
});

describe("EspHomeClient.getServices / executeService", () => {

  test("getServices returns an empty array before discovery", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.deepEqual(client.services.list(), []);
  });

  test("executeService is a no-op for an unknown key", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.services.execute(99999, []));
  });

  test("executeServiceByName is a no-op for an unknown name", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.services.executeByName("nope.service", []));
  });

  test("executeService encodes every argument variant", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      services: [{ key: 0xABCD0001, name: "test.service" }],
      signal: AbortSignal.timeout(2000)
    });

    // Build a service entity that accepts every arg type. The discovery payload doesn't matter for our purposes - we just need a known key registered.
    // Variants tested: bool, int, float, string, boolArray, intArray, floatArray, stringArray.
    client.services.execute(0xABCD0001, [

      { boolValue: true },
      { intValue: -7 },
      { floatValue: 3.14 },
      { stringValue: "hello" },
      { boolArray: [ true, false ] },
      { intArray: [ 1, 2, 3 ] },
      { floatArray: [ 1.5, 2.5 ] },
      { stringArray: [ "a", "b" ] }
    ]);

    await delay(5);
    const types = transport.outboundFrames.map((f): number => f.type);

    assert.ok(types.includes(MessageType.EXECUTE_SERVICE_REQUEST), "executeService must emit EXECUTE_SERVICE_REQUEST");
    client.disconnect();
  });

  test("executeServiceByName resolves to executeService for a known name", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      services: [{ key: 0xCAFEBABE, name: "named.service" }],
      signal: AbortSignal.timeout(2000)
    });

    client.services.executeByName("named.service", [{ stringValue: "hi" }]);
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.EXECUTE_SERVICE_REQUEST));
    client.disconnect();
  });

  test("inbound EXECUTE_SERVICE_RESPONSE emits 'serviceCallResult' with decoded callId, success, errorMessage, and responseData", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const results: { callId: number; errorMessage?: string; responseData?: Buffer; success: boolean }[] = [];

    client.on("serviceCallResult", (r): void => { results.push(r); });

    const responseData = Buffer.from("{\"value\":42}", "utf8");
    const successPayload = encodeProtoFields([

      { fieldNumber: 1, value: 7, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 4, value: responseData, wireType: WireType.LENGTH_DELIMITED }
    ]);
    const failurePayload = encodeProtoFields([

      { fieldNumber: 1, value: 8, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 3, value: Buffer.from("permission denied", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.EXECUTE_SERVICE_RESPONSE, successPayload);
    await delay(5);
    transport.pushInbound(MessageType.EXECUTE_SERVICE_RESPONSE, failurePayload);
    await delay(5);

    assert.equal(results.length, 2);
    assert.equal(results[0]?.callId, 7);
    assert.equal(results[0]?.success, true);
    assert.deepEqual(results[0]?.responseData, responseData);
    assert.equal("errorMessage" in results[0], false);

    assert.equal(results[1]?.callId, 8);
    assert.equal(results[1]?.success, false);
    assert.equal(results[1]?.errorMessage, "permission denied");
    assert.equal("responseData" in results[1], false);

    client.disconnect();
  });
});

// 11. HA bridge delegation.

describe("EspHomeClient.subscribeHomeAssistantStates / Services / sendHomeAssistantState", () => {

  test("subscribeHomeAssistantServices is callable before connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.homeAssistant.subscribeServices());
  });

  test("subscribeHomeAssistantStates is callable before connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.homeAssistant.subscribeStates());
  });

  test("sendHomeAssistantState is callable before connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.doesNotThrow(() => client.homeAssistant.sendState("sensor.temperature", "21.5"));
  });

  test("subscribeHomeAssistantServices emits SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST after connect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    client.homeAssistant.subscribeServices();
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST));
    client.disconnect();
  });

  test("subscribeHomeAssistantStates emits SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST after connect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    client.homeAssistant.subscribeStates();
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST));
    client.disconnect();
  });

  test("sendHomeAssistantState emits HOME_ASSISTANT_STATE_RESPONSE", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    client.homeAssistant.sendState("sensor.outdoor", "12.3", "temperature");
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.HOME_ASSISTANT_STATE_RESPONSE));
    client.disconnect();
  });

  test("inbound HOMEASSISTANT_SERVICE_RESPONSE emits 'homeassistantService'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let captured: Nullable<{ service: string }> = null;

    client.on("homeassistantService", (e): void => { captured = e; });
    transport.pushInbound(MessageType.HOMEASSISTANT_SERVICE_RESPONSE, homeassistantServiceResponse("sensor.notify"));
    await delay(10);

    assert.notEqual(captured, null);
    assert.equal(captured!.service, "sensor.notify");
    client.disconnect();
  });

  test("inbound SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE emits 'homeassistantStateRequest'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let captured: Nullable<{ entityId: string }> = null;

    client.on("homeassistantStateRequest", (req): void => { captured = req; });
    transport.pushInbound(MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE, subscribeHomeAssistantStateResponse("sensor.outdoor", "temperature", true));
    await delay(10);

    assert.notEqual(captured, null);
    assert.equal(captured!.entityId, "sensor.outdoor");
    client.disconnect();
  });

  test("respondToHomeAssistantAction emits a HOMEASSISTANT_ACTION_RESPONSE frame correlated by callId", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    transport.outboundFrames.length = 0;
    client.homeAssistant.respondToAction(123, { responseData: Buffer.from("ok", "utf8"), success: true });

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.HOMEASSISTANT_ACTION_RESPONSE);

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[1]?.[0], 123);
    assert.equal(fields[2]?.[0], 1);
    assert.deepEqual(fields[4]?.[0], Buffer.from("ok", "utf8"));
    client.disconnect();
  });
});

describe("EspHomeClient mid-session re-discovery via LIST_ENTITIES_DONE_RESPONSE", () => {

  test("a stale DONE arriving with no preceding list-entities messages emits no event and no warn", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let entitiesEmits = 0;
    let servicesEmits = 0;

    client.on("entities", (): void => { entitiesEmits++; });
    client.on("services", (): void => { servicesEmits++; });

    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(entitiesEmits, 0);
    assert.equal(servicesEmits, 0);
    assert.equal(log.warn.filter((m) => m.includes("Unhandled message type")).length, 0);

    client.disconnect();
  });

  test("a mid-session list-entities message followed by DONE emits 'entities' with the updated registry contents", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0x100, name: "Initial", objectId: "initial", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    const captured: Entity[][] = [];

    client.on("entities", (list): void => { captured.push(list); });

    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, listEntitiesPayloadFor("light", 0x200, "added_lamp", "Added Lamp"));
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(captured.length, 1, "mid-session DONE must emit 'entities' exactly once for the batch");
    assert.equal(captured[0]?.length, 2, "the emitted snapshot includes both the initial and the newly-arrived entity");
    assert.ok(captured[0]?.some((e): boolean => e.objectId === "added_lamp"));

    // The new entity is now queryable through the public surface.
    assert.equal(client.hasEntity(entityId("light", "added_lamp")), true);
    assert.equal(client.getEntityKey(entityId("light", "added_lamp")), 0x200);

    client.disconnect();
  });

  test("multiple list-entities messages followed by one DONE emit 'entities' exactly once with all of them", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let emits = 0;
    let lastList: Entity[] = [];

    client.on("entities", (list): void => { emits++; lastList = list; });

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, listEntitiesPayloadFor("switch", 0x301, "s1", "Switch 1"));
    await delay(1);
    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, listEntitiesPayloadFor("switch", 0x302, "s2", "Switch 2"));
    await delay(1);
    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, listEntitiesPayloadFor("light", 0x303, "l1", "Light 1"));
    await delay(1);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(emits, 1);
    assert.equal(lastList.length, 3);

    client.disconnect();
  });

  test("two consecutive batches each fire their own 'entities' event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let emits = 0;

    client.on("entities", (): void => { emits++; });

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, listEntitiesPayloadFor("switch", 0x401, "a", "A"));
    await delay(1);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(5);

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, listEntitiesPayloadFor("switch", 0x402, "b", "B"));
    await delay(1);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(emits, 2);

    // A subsequent stale DONE alone does not fire a third event.
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(5);

    assert.equal(emits, 2);

    client.disconnect();
  });

  test("a mid-session LIST_ENTITIES_SERVICES_RESPONSE followed by DONE emits 'services'", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let captured: ServiceEntity[] = [];

    client.on("services", (list): void => { captured = list; });

    transport.pushInbound(MessageType.LIST_ENTITIES_SERVICES_RESPONSE, listEntitiesServicesResponse("doorbell", 7));
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.name, "doorbell");

    client.disconnect();
  });
});

// 12. Logs.

describe("EspHomeClient.logs / logsReadable", () => {

  test("logs() returns an AsyncIterable<LogEventData>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const stream = client.logs(LogLevel.INFO);

    assert.equal(typeof stream[Symbol.asyncIterator], "function");
  });

  test("logsReadable() returns a ReadableStream<LogEventData>", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const readable = client.logsReadable(LogLevel.INFO);

    assert.equal(readable.locked, false);
  });

  test("inbound SUBSCRIBE_LOGS_RESPONSE emits 'log' events", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const events: { level: number; message: string }[] = [];

    client.on("log", (e): void => { events.push({ level: e.level, message: e.message }); });

    transport.pushInbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, LOG_RESPONSE_INFO);
    transport.pushInbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, LOG_RESPONSE_ERROR_FAILED);
    await delay(10);

    assert.equal(events.length, 2);
    assert.equal(events[0]?.message, "info-line");
    assert.equal(events[1]?.message, "error-line");

    client.disconnect();
  });

  test("subscribeToLogs after connect issues SUBSCRIBE_LOGS_REQUEST on the wire", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    client.subscribeToLogs(LogLevel.WARN);
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.SUBSCRIBE_LOGS_REQUEST));
    client.disconnect();
  });

  test("a malformed log response without a level is dropped with a warn", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    transport.pushInbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, encodeProtoFields([
      { fieldNumber: 3, value: Buffer.from("orphan", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));
    await delay(10);

    assert.ok(log.warn.some((m): boolean => m.includes("log response")));
    client.disconnect();
  });

  test("the LOG_RESPONSE_WARN fixture has the expected on-the-wire shape", () => {

    // Sanity check - the fixture starts with field 1 (varint level) then field 3 (length-delimited message). Tag for field 1 varint = 0x08; tag for field 3 LD = 0x1a.
    assert.equal(LOG_RESPONSE_WARN.readUInt8(0), 0x08, "first byte of LOG_RESPONSE_WARN should be field 1 varint tag");
  });
});

// 13. Command path.

describe("EspHomeClient.command<T> error handling", () => {

  test("command() with a brand-new id but no transport drops the call (logs internally, does not throw)", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const id = entityId("switch", "front_door");

    assert.doesNotThrow(() => client.command(id, { state: true }));
  });

  test("command() with an unknown id post-connect logs a warning and drops", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    client.command(entityId("switch", "no_such_thing"), { state: true });
    await delay(2);

    assert.ok((log.warn.length > 0) || (log.error.length > 0), "expected a warn or error for an unknown id");
    client.disconnect();
  });

  test("command() for a known switch issues SWITCH_COMMAND_REQUEST", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0x77777, name: "Front", objectId: "front", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    client.command(entityId("switch", "front"), { state: true });
    await delay(2);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.SWITCH_COMMAND_REQUEST));
    client.disconnect();
  });

  test("commandAndAwait() resolves with the matching state event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 8888, name: "Lamp", objectId: "lamp", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    const awaitPromise = client.commandAndAwait(entityId("switch", "lamp"), { state: true }, { signal: AbortSignal.timeout(2000) });

    await delay(2);
    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 8888, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));

    const result = await awaitPromise;

    assert.equal(result.state, true);
    client.disconnect();
  });

  test("commandAndAwait() rejects when its signal aborts mid-flight", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 9999, name: "Lamp", objectId: "lamp", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    const controller = new AbortController();
    const awaitPromise = client.commandAndAwait(entityId("switch", "lamp"), { state: true }, { signal: controller.signal });

    setImmediate((): void => controller.abort());
    await assert.rejects(awaitPromise, (err: unknown): boolean => err === controller.signal.reason);

    client.disconnect();
  });

  test("a pending commandAndAwait() rejects promptly with the disconnect's connection-lost error, and one issued after it is refused NOT_CONNECTED", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 9999, name: "Lamp", objectId: "lamp", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    const connection = attachedSignal(client);
    const pending = client.commandAndAwait(entityId("switch", "lamp"), { state: true }, { timeoutMs: 5000 });
    const disconnectedAt = Date.now();

    client.disconnect();

    await assert.rejects(pending, (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionLostError, "the teardown must reject the command wait with a connection-lost error");
      assert.equal(err, connection.reason, "the command wait must reject with the one error the disconnect aborted the connection with");

      return true;
    });
    assert.ok((Date.now() - disconnectedAt) < 1000, "the disconnect must end the command wait at once rather than at its timeout");

    const sentBefore = transport.outboundFrames.length;

    await assert.rejects(client.commandAndAwait(entityId("switch", "lamp"), { state: true }, { timeoutMs: 5000 }),
      { code: "NOT_CONNECTED", constructor: NotConnectedError });
    assert.equal(transport.outboundFrames.length, sentBefore, "a refused command wait must send nothing");
  });

  test("commandAndAwait() rejects on an unknown entity id (UNKNOWN_ENTITY_ID)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    await assert.rejects(client.commandAndAwait(entityId("switch", "missing"), { state: true }, { signal: AbortSignal.timeout(500) }),
      { code: "UNKNOWN_ENTITY_ID", constructor: ConfigurationError });
    client.disconnect();
  });
});

// 13b. extraSchemas integration. Drives `aliasOf("cover")`-registered `door_cover` end-to-end through MockTransport: discovery surfaces the door_cover entity, state
// fanout routes through the door_cover channel, and `client.command(entityId("door_cover", ...), ...)` encodes a COVER_COMMAND_REQUEST. Plus two-client isolation and
// the conflict-policy throw at construction.

describe("EspHomeClient extraSchemas integration - door_cover via aliasOf", () => {

  // Build the canonical aliased extras: door_cover reuses cover's wire format but surfaces under the new type tag. The schema's literal `type` field is widened
  // to the EntitySchema interface so the `type: "door_cover"` override does not collide with cover's literal `type: "cover"` brand.
  const buildDoorCoverExtras = (): Record<string, EntitySchema> => ({

    "door_cover": { ...aliasOf("cover"), type: "door_cover" }
  });

  test("constructor merges extraSchemas without mutating the canonical ENTITY_SCHEMAS", () => {

    const before = Object.keys(ENTITY_SCHEMAS).length;
    const transport = new MockTransport();
    const extras = buildDoorCoverExtras();

    new EspHomeClient({ extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    assert.equal(Object.keys(ENTITY_SCHEMAS).length, before, "ENTITY_SCHEMAS must not have grown");
    assert.equal(("door_cover" in ENTITY_SCHEMAS), false, "module-level constant must not gain extras keys");
  });

  test("constructor throws ConfigurationError(EXTRA_SCHEMA_OVERRIDES_BUILTIN) when extras shadow a built-in", () => {

    assert.throws((): EspHomeClient => new EspHomeClient({

      // Intentionally collide with the built-in cover. The narrow ExtraSchemaSet typing accepts any string key.
      extraSchemas: { cover: { ...aliasOf("cover"), type: "door_cover" } },
      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => new MockTransport()
    }), {

      code: "EXTRA_SCHEMA_OVERRIDES_BUILTIN",
      name: "ConfigurationError"
    });
  });

  test("discovery surfaces an aliased door_cover entity end-to-end through MockTransport", async () => {

    const transport = new MockTransport();
    const extras = buildDoorCoverExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    // Discover a LIST_ENTITIES_COVER_RESPONSE shaped exactly like a cover entity. The schema-table lookup prefers the extras schema on collision; the entity surfaces as
    // door_cover, not cover.
    pushHandshake(transport, { entities: [{ key: 0x42, name: "Garage Door", objectId: "garage_door", type: "cover" }] });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    const ids = client.getAvailableEntityIds();

    assert.ok(ids["door_cover"], "door_cover bucket must exist on availableIds");
    assert.equal(ids["door_cover"]?.[0], "door_cover-garage_door");
    assert.equal(ids["cover"], undefined, "cover bucket must NOT exist - extras shadows the built-in for routing");

    client.disconnect();
  });

  test("state fanout routes a cover-shaped state response through the door_cover channel", async () => {

    const transport = new MockTransport();
    const extras = buildDoorCoverExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    pushHandshake(transport, { entities: [{ key: 7, name: "Front Cover", objectId: "front", type: "cover" }] });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    // Subscribe to the typed door_cover channel via the public on() facade. The bus is keyed by the schema's `type` tag, so an extras-keyed channel works
    // through the same per-type routing the built-ins use.
    const observed: { type: string; key: number; position?: number | string }[] = [];
    const sub = client.on("door_cover" as keyof typeof ENTITY_SCHEMAS, (event): void => {

      observed.push(event);
    });

    // Push a COVER_STATE_RESPONSE. The dispatcher's per-instance schemas table prefers the extras schema on collision, so the decoded event surfaces as door_cover.
    const coverState = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.cover.state.keyFieldNumber, value: encodeKey(7), wireType: WireType.FIXED32 },
      { fieldNumber: 2, value: encodeFloat(0.75), wireType: WireType.FIXED32 }
    ]);

    transport.pushInbound(MessageType.COVER_STATE_RESPONSE, coverState);
    await delay(5);

    assert.equal(observed.length, 1, "expected one door_cover event");
    assert.equal(observed[0]?.type, "door_cover");
    assert.equal(observed[0]?.key, 7);

    sub[Symbol.dispose]();
    client.disconnect();
  });

  test("command(entityId('door_cover', ...), { position }) encodes a COVER_COMMAND_REQUEST frame", async () => {

    const transport = new MockTransport();
    const extras = buildDoorCoverExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    pushHandshake(transport, { entities: [{ key: 11, name: "Garage", objectId: "garage", type: "cover" }] });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    const outboundBefore = transport.outboundFrames.length;

    client.command(entityId("door_cover", "garage"), { position: 0.5 });

    const newFrames = transport.outboundFrames.slice(outboundBefore);
    const cmd = newFrames.find((f): boolean => f.type === MessageType.COVER_COMMAND_REQUEST);

    assert.notEqual(cmd, undefined, "expected COVER_COMMAND_REQUEST emitted for door_cover entity");

    client.disconnect();
  });

  test("two clients with disjoint extras do not cross-pollinate state fanout", async () => {

    const transportA = new MockTransport();
    const transportB = new MockTransport();
    const extras = buildDoorCoverExtras();

    const clientPlain = new EspHomeClient({ host: "a.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transportA });
    const clientWithExtras = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "b.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transportB
    });

    // Each client gets its own LIST_ENTITIES_COVER_RESPONSE; the routing decision is made per-client from its own schemas table.
    for(const t of [ transportA, transportB ]) {

      pushHandshake(t, { entities: [{ key: 1, name: "X", objectId: "x", type: "cover" }] });
    }

    await Promise.all([ clientPlain.connect({ signal: AbortSignal.timeout(2000) }), clientWithExtras.connect({ signal: AbortSignal.timeout(2000) }) ]);

    // Plain client treats the wire frame as a cover; extras client treats it as a door_cover. Their availableIds buckets must be disjoint.
    const idsPlain = clientPlain.getAvailableEntityIds();
    const idsWithExtras = clientWithExtras.getAvailableEntityIds();

    assert.ok(idsPlain["cover"], "plain client must surface a 'cover' entity");
    assert.equal(idsPlain["door_cover"], undefined, "plain client must NOT surface a 'door_cover' entity");
    assert.ok(idsWithExtras["door_cover"], "extras client must surface a 'door_cover' entity");
    assert.equal(idsWithExtras["cover"], undefined, "extras client must NOT surface a 'cover' entity");

    clientPlain.disconnect();
    clientWithExtras.disconnect();
  });
});

// 13c. extending() integration. Drives an `extending("switch", { addedListEntitiesFields, addedStateFields })`-registered `vendor_switch` end-to-end through
// MockTransport: discovery surfaces the extended entity with the additional metadata field decoded; state fanout routes the extended state through the vendor_switch
// channel with the additional measurement field decoded; commands continue to encode through the upstream switch's pristine command spec because `extending()` is a
// read-side extension by design (command-field extension would be an additive, backward-compatible change if ever made). Plus two-client isolation, the conflict-policy
// throw at construction, and the ENTITY_SCHEMAS-unchanged guarantee. Mirror of the door_cover (aliasOf) integration block above; the two together verify the full
// ExtraSchemaSet API end-to-end.

describe("EspHomeClient extraSchemas integration - vendor-extended switch via extending()", () => {

  // Field number 100 sits well above the upstream switch schema's listEntities range (max 10) and state range (max 3), so the additions and base fields are
  // structurally guaranteed not to collide on the wire. The vendor adds two read-side fields: a static metadata string (firmware revision) surfaced in discovery and
  // a dynamic measurement float (power consumption in watts) surfaced on every state update. The schema's literal `type` is widened to EntitySchema so the
  // `type: "vendor_switch"` override does not collide with switch's literal `type: "switch"` brand.
  const VENDOR_HW_REV_FIELD = 100;
  const VENDOR_POWER_WATTS_FIELD = 100;

  const buildVendorSwitchExtras = (): Record<string, EntitySchema> => ({

    "vendor_switch": {

      ...extending("switch", {

        addedListEntitiesFields: { hwRev: { fieldNumber: VENDOR_HW_REV_FIELD, valueType: "string", wireType: WireType.LENGTH_DELIMITED } },
        addedStateFields: { powerWatts: { fieldNumber: VENDOR_POWER_WATTS_FIELD, valueType: "float", wireType: WireType.FIXED32 } }
      }),
      type: "vendor_switch"
    }
  });

  test("constructor merges extending()-built extraSchemas without mutating the canonical ENTITY_SCHEMAS", () => {

    const before = Object.keys(ENTITY_SCHEMAS).length;
    const transport = new MockTransport();
    const extras = buildVendorSwitchExtras();

    new EspHomeClient({ extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    assert.equal(Object.keys(ENTITY_SCHEMAS).length, before, "ENTITY_SCHEMAS must not have grown");
    assert.equal(("vendor_switch" in ENTITY_SCHEMAS), false, "module-level constant must not gain extras keys");
  });

  test("constructor throws ConfigurationError(EXTRA_SCHEMA_OVERRIDES_BUILTIN) when an extending()-built extras shadows a built-in", () => {

    assert.throws((): EspHomeClient => new EspHomeClient({

      // Intentionally collide with the built-in switch. The narrow ExtraSchemaSet typing accepts any string key; the `as EntitySchema` cast aligns with the
      // door_cover block's pattern for the same conflict-policy assertion.
      extraSchemas: {

        switch: extending("switch", { addedStateFields: { powerWatts: { fieldNumber: 100, valueType: "float", wireType: WireType.FIXED32 } } })
      },
      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => new MockTransport()
    }), {

      code: "EXTRA_SCHEMA_OVERRIDES_BUILTIN",
      name: "ConfigurationError"
    });
  });

  test("discovery surfaces an extended vendor_switch entity with the added listEntities field decoded end-to-end through MockTransport", async () => {

    const transport = new MockTransport();
    const extras = buildVendorSwitchExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    pushDeviceInfo(transport);
    await delay(2);

    // Wire fixture: a LIST_ENTITIES_SWITCH_RESPONSE carrying the standard switch fields plus the vendor's hwRev string at field number 100. The schema-table lookup
    // prefers the extras schema on collision, so the entity surfaces as vendor_switch with hwRev populated. Provenance: api.proto §ListEntitiesSwitchResponse with a
    // vendor extension at field 100. Derivation: encodeProtoFields with the four fields below.
    const switchList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.objectIdFieldNumber, value: Buffer.from("smart_outlet", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.keyFieldNumber, value: encodeKey(0x71), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.nameFieldNumber, value: Buffer.from("Smart Outlet", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: VENDOR_HW_REV_FIELD, value: Buffer.from("v3.1.0-vendor", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, switchList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

    const ids = client.getAvailableEntityIds();

    assert.ok(ids["vendor_switch"], "vendor_switch bucket must exist on availableIds");
    assert.equal(ids["vendor_switch"]?.[0], "vendor_switch-smart_outlet");
    assert.equal(ids["switch"], undefined, "switch bucket must NOT exist - extras shadows the built-in for routing");

    // The added listEntities field threads through decodeEntityFromSchema's `Object.entries(listSchema.fields)` walk, so the decoded entity record carries the vendor
    // field alongside the upstream's standard fields. Read the entity record back through the public surface and assert the vendor field landed on it. The cast on
    // the branded id widens the extras-keyed brand to the public surface's EntityType-defaulted parameter; the runtime is brand-erased so this is sound at the boundary.
    const vendorBrandedId = entityId("vendor_switch", "smart_outlet") as unknown as Parameters<typeof client.getEntityById>[0];
    const entity = client.getEntityById(vendorBrandedId) as Nullable<Record<string, unknown>>;

    assert.notEqual(entity, null, "vendor_switch entity must be retrievable by branded id");
    assert.equal(entity?.["type"], "vendor_switch");
    assert.equal(entity?.["objectId"], "smart_outlet");
    assert.equal(entity?.["hwRev"], "v3.1.0-vendor", "additional listEntities field must decode onto the entity record");

    client.disconnect();
  });

  test("state fanout routes a switch-shaped state response with the added powerWatts field through the vendor_switch channel", async () => {

    const transport = new MockTransport();
    const extras = buildVendorSwitchExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    pushHandshake(transport, { entities: [{ key: 0x9a, name: "Outlet", objectId: "outlet", type: "switch" }] });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    // Subscribe to the typed vendor_switch channel via the public on() facade. The bus is keyed by the schema's `type` tag, so the extras-keyed channel
    // works through the same per-type routing the built-ins use. The cast to `keyof typeof ENTITY_SCHEMAS` mirrors the door_cover block's pattern for keying into a
    // channel whose name only exists at the per-instance schemas table level.
    const observed: { type: string; key: number; state?: boolean; powerWatts?: number }[] = [];
    const sub = client.on("vendor_switch" as keyof typeof ENTITY_SCHEMAS, (event): void => {

      observed.push(event as unknown as { type: string; key: number; state?: boolean; powerWatts?: number });
    });

    // Wire fixture: a SWITCH_STATE_RESPONSE carrying the standard key + state fields plus the vendor's powerWatts float at field number 100. The dispatcher's
    // per-instance schemas table prefers the extras schema on collision, so the decoded event surfaces as vendor_switch with powerWatts populated. Provenance:
    // api.proto §SwitchStateResponse with a vendor extension at field 100. Derivation: encodeProtoFields with the three fields below.
    const switchState = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.switch.state.keyFieldNumber, value: encodeKey(0x9a), wireType: WireType.FIXED32 },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT },
      { fieldNumber: VENDOR_POWER_WATTS_FIELD, value: encodeFloat(1500.5), wireType: WireType.FIXED32 }
    ]);

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, switchState);
    await delay(5);

    assert.equal(observed.length, 1, "expected one vendor_switch event");
    assert.equal(observed[0]?.type, "vendor_switch");
    assert.equal(observed[0]?.key, 0x9a);
    assert.equal(observed[0]?.state, true, "base switch field must still decode");
    assert.equal(observed[0]?.powerWatts, 1500.5, "additional state field must decode onto the event");

    sub[Symbol.dispose]();
    client.disconnect();
  });

  test("command(entityId('vendor_switch', ...), { state: true }) encodes a SWITCH_COMMAND_REQUEST through the upstream's pristine command spec", async () => {

    const transport = new MockTransport();
    const extras = buildVendorSwitchExtras();

    const client = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    pushHandshake(transport, { entities: [{ key: 11, name: "Relay", objectId: "relay", type: "switch" }] });

    await client.connect({ signal: AbortSignal.timeout(2000) });

    const outboundBefore = transport.outboundFrames.length;

    client.command(entityId("vendor_switch", "relay"), { state: true });

    const newFrames = transport.outboundFrames.slice(outboundBefore);
    const cmd = newFrames.find((f): boolean => f.type === MessageType.SWITCH_COMMAND_REQUEST);

    assert.notEqual(cmd, undefined, "expected SWITCH_COMMAND_REQUEST emitted for vendor_switch entity");

    // Byte-level provenance assertion: the command payload must contain ONLY the upstream switch's standard fields - key @1 fixed32 = 11, state @2 varint = 1.
    // extending() does not extend the command spec by design; the encoder walks the schema's command.fields map and that map is the upstream's pristine record. If a
    // future contributor accidentally threads added*Fields into the command spec the byte equality below will break loudly. Provenance: api.proto §SwitchCommandRequest.
    // Derivation: encodeProtoFields with the two fields below.
    const expected = encodeProtoFields([

      { fieldNumber: 1, value: encodeKey(11), wireType: WireType.FIXED32 },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT }
    ]);

    assert.deepEqual(cmd!.payload, expected, "SWITCH_COMMAND_REQUEST payload must match the upstream command spec exactly - extending() is read-side only");

    client.disconnect();
  });

  test("two clients with disjoint extending() extras do not cross-pollinate state fanout", async () => {

    const transportA = new MockTransport();
    const transportB = new MockTransport();
    const extras = buildVendorSwitchExtras();

    const clientPlain = new EspHomeClient({ host: "a.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transportA });
    const clientWithExtras = new EspHomeClient<typeof extras>({

      extraSchemas: extras, host: "b.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transportB
    });

    // Each client gets its own LIST_ENTITIES_SWITCH_RESPONSE; the routing decision is made per-client from its own schemas table.
    for(const t of [ transportA, transportB ]) {

      pushHandshake(t, { entities: [{ key: 2, name: "Y", objectId: "y", type: "switch" }] });
    }

    await Promise.all([ clientPlain.connect({ signal: AbortSignal.timeout(2000) }), clientWithExtras.connect({ signal: AbortSignal.timeout(2000) }) ]);

    // Plain client treats the wire frame as a switch; extras client treats it as a vendor_switch. Their availableIds buckets must be disjoint - the per-instance
    // schemas table is the routing chokepoint, so each client's dispatch decision is made from its own table without cross-pollination.
    const idsPlain = clientPlain.getAvailableEntityIds();
    const idsWithExtras = clientWithExtras.getAvailableEntityIds();

    assert.ok(idsPlain["switch"], "plain client must surface a 'switch' entity");
    assert.equal(idsPlain["vendor_switch"], undefined, "plain client must NOT surface a 'vendor_switch' entity");
    assert.ok(idsWithExtras["vendor_switch"], "extras client must surface a 'vendor_switch' entity");
    assert.equal(idsWithExtras["switch"], undefined, "extras client must NOT surface a 'switch' entity");

    clientPlain.disconnect();
    clientWithExtras.disconnect();
  });
});

// 14. Heartbeat / ping path.

describe("EspHomeClient heartbeat + ping", () => {

  test("inbound PING_REQUEST is acknowledged with PING_RESPONSE", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    transport.pushInbound(MessageType.PING_REQUEST, PING_REQUEST_PAYLOAD);
    await delay(10);

    assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.PING_RESPONSE));
    client.disconnect();
  });

  test("sendPing post-connect issues a PING_REQUEST", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const before = transport.outboundFrames.length;

    client.sendPing();
    await delay(2);

    const after = transport.outboundFrames.filter((f): boolean => f.type === MessageType.PING_REQUEST).length;

    assert.ok(after >= 1, "after sendPing the outbound list contains at least one PING_REQUEST. before=" + String(before));
    client.disconnect();
  });

  test("inbound PING_RESPONSE is consumed by the run-phase handler without throwing", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    transport.pushInbound(MessageType.PING_RESPONSE, PING_RESPONSE_PAYLOAD);
    await delay(10);

    // With keepAlive disabled the heartbeat scheduler doesn't track per-ping RTT; the handler still runs without throwing and the connection stays healthy. The
    // RTT-stamping path is covered by heartbeat.test.ts's HeartbeatScheduler.consumePingRtt enumeration.
    assert.equal(client.health().state, "connected");
    client.disconnect();
  });

  test("inbound GET_TIME_REQUEST is answered with a fixed32 epoch GET_TIME_RESPONSE", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    transport.pushInbound(MessageType.GET_TIME_REQUEST, Buffer.alloc(0));
    await delay(10);

    const reply = transport.outboundFrames.find((f): boolean => f.type === MessageType.GET_TIME_RESPONSE);

    assert.notEqual(reply, undefined);
    assert.equal(reply!.payload.length, 5, "GET_TIME_RESPONSE has one fixed32 field => 1-byte tag + 4-byte LE epoch = 5 bytes");
    client.disconnect();
  });

  test("a GET_TIME_REQUEST the device sends during setup is answered once the run phase starts", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const connecting = client.connect({ signal: AbortSignal.timeout(2000) });

    // The request lands ahead of the HELLO response, so no setup-phase wait claims it: it waits in the receiver's buffer until the run-phase hand-off replays it.
    await delay(5);
    transport.pushInbound(MessageType.GET_TIME_REQUEST, Buffer.alloc(0));
    pushHandshake(transport);
    await connecting;
    await delay(10);

    assert.equal(transport.outboundFrames.filter((f): boolean => f.type === MessageType.GET_TIME_RESPONSE).length, 1, "the buffered request must be answered once");
    client.disconnect();
  });

  test("inbound GET_TIME_RESPONSE emits 'timeSync' event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let captured: Nullable<number> = null;

    client.on("timeSync", (epoch): void => { captured = epoch; });

    transport.pushInbound(MessageType.GET_TIME_RESPONSE, GET_TIME_RESPONSE_FIXTURE);
    await delay(10);

    assert.notEqual(captured, null);
    client.disconnect();
  });
});

// 15. setNoiseEncryptionKey.

describe("EspHomeClient.setNoiseEncryptionKey", () => {

  test("rejects synchronously when called concurrently (KEY_SET_IN_FLIGHT)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const first = client.setNoiseEncryptionKey(psk);

    await assert.rejects(client.setNoiseEncryptionKey(psk), (err: unknown) => {

      assert.ok(err instanceof ConnectionError);
      assert.equal((err as ConnectionError & { code?: string }).code, "KEY_SET_IN_FLIGHT");

      return true;
    });

    // Resolve the first call so it doesn't dangle.
    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);
    await first;
    client.disconnect();
  });

  test("rejects pre-aborted AbortSignal", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    const controller = new AbortController();

    controller.abort();

    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const before = transport.outboundFrames.length;

    await assert.rejects(client.setNoiseEncryptionKey(psk, { signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason);
    assert.equal(transport.outboundFrames.length, before, "a pre-aborted key set must send nothing");
    client.disconnect();
  });

  test("rejects a key of the wrong length with EncryptionKeyInvalidError in the connect flow's wording, sending nothing", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const before = transport.outboundFrames.length;

    await assert.rejects(client.setNoiseEncryptionKey(Buffer.alloc(8).toString("base64")), {

      code: "INVALID_PSK_LENGTH",
      constructor: EncryptionKeyInvalidError,
      message: "The encryption key is invalid: PSK must be exactly " + String(NOISE_PSK_LEN) + " bytes, got 8."
    });
    assert.equal(transport.outboundFrames.length, before, "invalid key must not send a frame");
    client.disconnect();
  });

  test("honors a custom timeoutMs override on the request/response await", async (t) => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Call with a short custom bound and never answer. The correlator arms AbortSignal.timeout(timeoutMs), so the await rejects with that signal's own TimeoutError at
    // ~30 ms rather than at the built-in 5000 ms default. The elapsed-time assertion is the anti-vacuity: a rejection well under a second proves the override bound
    // applied, not the default.
    const captured = captureTimeoutSignals(t);
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const start = Date.now();
    const pending = client.setNoiseEncryptionKey(psk, { timeoutMs: 30 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the await must build its timeout through AbortSignal.timeout");
    await assert.rejects(pending, (err: unknown): boolean => err === timeoutSignal.reason);

    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, "the custom 30 ms timeout must bind (well under the 5000 ms default) - observed " + String(elapsed) + " ms");
    client.disconnect();
  });

  test("resolves true on NOISE_ENCRYPTION_SET_KEY_RESPONSE success", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const promise = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"));

    await delay(5);
    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);

    assert.equal(await promise, true);
    client.disconnect();
  });

  test("resolves false on NOISE_ENCRYPTION_SET_KEY_RESPONSE failure", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const promise = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x33).toString("base64"));

    await delay(5);
    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_FAIL);

    assert.equal(await promise, false);
    client.disconnect();
  });

  test("rejects with the caller's reason when its signal aborts mid-flight", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const controller = new AbortController();
    const promise = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"), { signal: controller.signal });

    setImmediate((): void => controller.abort());

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason);
    client.disconnect();
  });

  test("rejects with the connection-lost error when the client disconnects mid-flight", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const connection = attachedSignal(client);
    const promise = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"), { timeoutMs: 5000 });

    await delay(5);
    client.disconnect();

    await assert.rejects(promise, (err: unknown): boolean => err === connection.reason);
    assert.ok(connection.reason instanceof ConnectionLostError, "the disconnect must abort the connection with a connection-lost error");
  });

  test("rejects at once with NotConnectedError coded NOT_CONNECTED before the first connect and after a disconnect, sending and logging nothing", async () => {

    const log = makeLogCapture();
    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });
    const valid = Buffer.alloc(32, 0x55).toString("base64");
    const wrongLength = Buffer.alloc(8).toString("base64");

    // The refusal comes ahead of the key-length check, so a wrong-length key reports the missing connection; a caller signal already aborted comes ahead of every check.
    const assertRefused = async (moment: string): Promise<void> => {

      const controller = new AbortController();
      const reason = new Error("Cancelled " + moment + ".");

      controller.abort(reason);

      await assert.rejects(client.setNoiseEncryptionKey(valid), { code: "NOT_CONNECTED", constructor: NotConnectedError });
      await assert.rejects(client.setNoiseEncryptionKey(wrongLength), { code: "NOT_CONNECTED", constructor: NotConnectedError });
      await assert.rejects(client.setNoiseEncryptionKey(valid, { signal: controller.signal }), (err: unknown): boolean => err === reason);
    };

    await assertRefused("before the first connect");
    assert.equal(transport.outboundFrames.length, 0, "a refused key set before the first connect must send nothing");

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    client.disconnect();

    const before = transport.outboundFrames.length;

    await assertRefused("after a disconnect");
    assert.equal(transport.outboundFrames.length, before, "a refused key set after a disconnect must send nothing");
    assert.equal(log.debug.some((line): boolean => line.includes("frameAndSend invoked without an active transport")), false,
      "a refused key set must never reach the send path's drop");
    assert.deepEqual(log.error, [], "a refused key set must log nothing at error level");
  });

  test("a key set issued while a connect is in its handshake rejects at once coded CONNECT_IN_PROGRESS, and one issued once the connect completes is sent", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const psk = Buffer.alloc(32, 0x55).toString("base64");

    // Nothing is queued yet, so the connect parks before its hello. A key set issued here has no attached connection to travel on.
    const connecting = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);

    const issuedAt = Date.now();

    await assert.rejects(client.setNoiseEncryptionKey(psk, { timeoutMs: 1000 }), { code: "CONNECT_IN_PROGRESS", constructor: NotConnectedError });
    assert.ok((Date.now() - issuedAt) < 250, "the windowed key set must be refused at once rather than wait out its timeout");
    assert.equal(keySetRequests(transport), 0, "the windowed key set must send nothing");

    pushHandshake(transport);
    await connecting;

    // Admitted once the connect completes: no KEY_SET_IN_FLIGHT from a refused call left behind, and the request reaches the transport.
    const admitted = client.setNoiseEncryptionKey(psk);

    assert.equal(keySetRequests(transport), 1, "the key set issued after the connect must be sent");
    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);
    assert.equal(await admitted, true);
    client.disconnect();
  });

  test("a key set whose own send tears the connection down rejects at once with the connection-lost error the disconnect built", async (t) => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const connection = attachedSignal(client);
    const platformSend = transport.send.bind(transport);

    // The disconnect lands inside the call's own send, after the call read a live connection and before it parks on the correlator, so the wait it reaches must
    // already be ended rather than parked on a signal that fired.
    t.mock.method(transport, "send", async (type: number, payload: Buffer): Promise<void> => {

      if(type === MessageType.NOISE_ENCRYPTION_SET_KEY_REQUEST) {

        client.disconnect();
      }

      await platformSend(type, payload);
    });

    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const issuedAt = Date.now();

    await assert.rejects(client.setNoiseEncryptionKey(psk, { timeoutMs: 5000 }), (err: unknown): boolean => err === connection.reason);

    const elapsed = Date.now() - issuedAt;

    assert.ok(elapsed < 250, "the key set must reject at once, far short of its timeout: " + String(elapsed) + " ms");
    assert.ok(connection.reason instanceof ConnectionLostError, "the disconnect must abort the connection with a connection-lost error");
  });

  test("noiseKeySet event fires with the success boolean", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let observed: Nullable<boolean> = null;

    client.on("noiseKeySet", (s): void => { observed = s; });

    const p = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"));

    await delay(5);
    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);
    await p;

    assert.equal(observed, true);
    client.disconnect();
  });
});

// 15b. The connection scope. Each row reads the scope the serial sub-API's host object hands out, which stands for every sub-API host object, and uses the key set
// as the awaiting call the host itself issues.

describe("EspHomeClient connection scope", () => {

  test("a run-phase transport fault aborts the scope with one connection-lost error whose cause is the fault, and a pending key set rejects with it", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const connection = attachedSignal(client);
    const pending = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"), { timeoutMs: 5000 });
    const fault = new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED");
    const faultAt = Date.now();

    transport.fail(fault);

    await assert.rejects(pending, (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionLostError, "the key set must reject with a connection-lost error");
      assert.equal(err.cause, fault, "the error must carry the fault that ended the connection");
      assert.equal(err, connection.reason, "the key set must reject with the object the scope was aborted with");

      return true;
    });
    assert.ok((Date.now() - faultAt) < 250, "the teardown must end the key set at once rather than at its timeout");
    assert.equal(serialScope(client).kind, "none", "the host object must read no attached connection after the fault");
  });

  test("the scope reads none before the first connect, connecting in the handshake, attached from a connect listener, and none after a disconnect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const fromConnectListener: string[] = [];

    assert.equal(serialScope(client).kind, "none", "a never-connected client reads no connection");

    client.on("connect", (): void => { fromConnectListener.push(serialScope(client).kind); });

    // Nothing is queued yet, so the connect parks before its hello, inside the handshake window.
    const connecting = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    assert.equal(serialScope(client).kind, "connecting", "a connect parked in its handshake reads a connect in progress");

    pushHandshake(transport);
    await connecting;

    assert.deepEqual(fromConnectListener, ["attached"], "a connect listener runs after the attach and reads the attached connection");

    const connection = attachedSignal(client);

    client.disconnect();

    assert.equal(serialScope(client).kind, "none", "a disconnect issued once the connect resolved leaves no connection");
    assert.equal(connection.aborted, true, "the disconnect must abort the scope read before it");
    assert.ok(connection.reason instanceof ConnectionLostError, "the scope must carry the disconnect's connection-lost error");
  });

  test("a key set issued while the reconnect loop backs off is refused CONNECT_IN_PROGRESS, and NOT_CONNECTED once a disconnect ends the loop", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      host: "test.local", logger: quietLogger(), reconnect: { initialDelayMs: 10000, jitter: 0 }, transportFactory: (): MockTransport => transport
    });
    const psk = Buffer.alloc(32, 0x55).toString("base64");

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // The disconnect in the finally ends the reconnect loop however the assertions end, so a failing assertion cannot leave the loop retrying behind the suite.
    try {

      assert.equal(serialScope(client).kind, "attached");

      // The fault tears the session down and schedules the reconnect loop, which parks in its long backoff.
      transport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
      await delay(5);

      assert.equal(serialScope(client).kind, "connecting", "the reconnect loop's backoff reads a connect in progress");
      await assert.rejects(client.setNoiseEncryptionKey(psk), { code: "CONNECT_IN_PROGRESS", constructor: NotConnectedError });
      assert.equal(keySetRequests(transport), 0, "a refused key set must send nothing");

      client.disconnect();

      assert.equal(serialScope(client).kind, "none", "a disconnect that ends the loop leaves no connect in progress");
      await assert.rejects(client.setNoiseEncryptionKey(psk), { code: "NOT_CONNECTED", constructor: NotConnectedError });

    } finally {

      client.disconnect();
    }
  });

  test("a key set a listener issues while the hand-off replays the setup buffer is admitted and sent", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const issued: Promise<boolean>[] = [];

    // The state frame lands ahead of the handshake, so no setup-phase wait claims it: the receiver buffers it until the run-phase hand-off replays it, after the
    // attach and before the health record reports connected.
    client.on("telemetry", (): void => {

      const attempt = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"));

      void attempt.catch((): void => undefined);
      issued.push(attempt);
    });

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await driveConnect(transport, client, { entities: [{ key: 12, name: "S1", objectId: "shelf", type: "switch" }], signal: AbortSignal.timeout(2000) });

    assert.equal(issued.length, 1, "the replayed state must reach the listener once");
    assert.equal(keySetRequests(transport), 1, "the listener's key set must be admitted and sent");

    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);
    assert.equal(await issued[0], true);
    client.disconnect();
  });

  test("a key set an entities listener issues during a connect is refused CONNECT_IN_PROGRESS, and the same listener on a re-discovery is admitted", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const issued: Promise<boolean>[] = [];

    client.on("entities", (): void => {

      const attempt = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"));

      void attempt.catch((): void => undefined);
      issued.push(attempt);
    });

    // Discovery announces the entity list before the transport attaches, so the listener's call finds a connect in progress.
    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(issued.length, 1, "the connect's discovery must announce the entity list once");
    await assert.rejects(issued[0]!, { code: "CONNECT_IN_PROGRESS", constructor: NotConnectedError });
    assert.equal(keySetRequests(transport), 0, "the refused key set must send nothing");

    // A mid-session re-discovery announces with the transport attached, so the same listener's call is admitted.
    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, listEntitiesPayloadFor("switch", 0x301, "s1", "Switch 1"));
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await delay(10);

    assert.equal(issued.length, 2, "the re-discovery must announce the entity list again");
    assert.equal(keySetRequests(transport), 1, "the re-discovery listener's key set must be sent");

    transport.pushInbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, NOISE_KEY_SET_RESPONSE_OK);
    assert.equal(await issued[1], true);
    client.disconnect();
  });

  test("a disconnect aborts the scope before it announces the end, so the announcement's listeners read no attached connection", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const connection = attachedSignal(client);
    const readings: string[] = [];

    client.on("healthChange", (health): void => {

      if(health.state === "disconnected") {

        readings.push("healthChange:" + String(connection.aborted) + ":" + serialScope(client).kind);
      }
    });
    client.on("disconnect", (): void => { readings.push("disconnect:" + String(connection.aborted) + ":" + serialScope(client).kind); });

    client.disconnect();

    assert.deepEqual(readings, [ "healthChange:true:none", "disconnect:true:none" ], "every wait must be ended before the end of the session is announced");
  });

  test("one run-phase fault rejects a pending key set, serial request and command wait with the one connection-lost error whose cause is the fault", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { entities: [{ key: 9999, name: "Lamp", objectId: "lamp", type: "switch" }], signal: AbortSignal.timeout(2000) });

    const connection = attachedSignal(client);
    const keySet = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"), { timeoutMs: 5000 });
    const modemPins = client.serial.getModemPins(0, { timeoutMs: 5000 });
    const command = client.commandAndAwait(entityId("switch", "lamp"), { state: true }, { timeoutMs: 5000 });
    const fault = new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED");

    transport.fail(fault);

    // Each wait composes the one connection scope, so each rejects with the object the teardown aborted it with.
    await Promise.all([

      assert.rejects(keySet, (err: unknown): boolean => err === connection.reason),
      assert.rejects(modemPins, (err: unknown): boolean => err === connection.reason),
      assert.rejects(command, (err: unknown): boolean => err === connection.reason)
    ]);

    const lost: unknown = connection.reason;

    assert.ok(lost instanceof ConnectionLostError, "the teardown must abort the scope with a connection-lost error");
    assert.equal(lost.cause, fault, "the connection-lost error must carry the fault that ended the connection");
  });

  test("serial.getModemPins is refused CONNECT_IN_PROGRESS inside the handshake window and NOT_CONNECTED once a disconnect's cut-short connect settled", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    // Nothing is queued yet, so the connect parks before its hello, inside the handshake window.
    const connecting = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    await assert.rejects(client.serial.getModemPins(0, { timeoutMs: 5000 }), { code: "CONNECT_IN_PROGRESS", constructor: NotConnectedError });

    client.disconnect();

    await assert.rejects(connecting, ConnectionLostError);
    await assert.rejects(client.serial.getModemPins(0, { timeoutMs: 5000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });
    assert.equal(transport.outboundFrames.filter((f): boolean => f.type === MessageType.SERIAL_PROXY_GET_MODEM_PINS_REQUEST).length, 0,
      "a refused serial request must send nothing");
  });

  test("a Home Assistant states subscription requested before the first connect sends its subscribe frame once the connect completes", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    // A subscription is exempt from the not-connected rule: it records its intent with no connection, and the connect's hand-off replays it.
    assert.doesNotThrow(() => client.homeAssistant.subscribeStates());

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.equal(transport.outboundFrames.filter((f): boolean => f.type === MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST).length, 1,
      "the subscription recorded before the connect must be sent once the connect attaches");
    client.disconnect();
  });

  test("a command() for a discovered switch issued after a disconnect returns without a throw and drops its frame with the debug line", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { entities: [{ key: 9999, name: "Lamp", objectId: "lamp", type: "switch" }], signal: AbortSignal.timeout(2000) });
    client.disconnect();

    // A fire-and-forget send is exempt from the not-connected rule: with no connection it drops its frame rather than throwing.
    assert.doesNotThrow(() => client.command(entityId("switch", "lamp"), { state: true }));
    assert.ok(log.debug.some((line): boolean => line.includes("frameAndSend invoked without an active transport")), "the dropped frame must be logged at debug level");
  });
});

// 16. openEspHomeClient factory.

/* Count `[Symbol.dispose]()` calls on every EspHomeClient for the duration of one test, calling through to the real disposal. The factory never hands a failing
 * client to its caller and the retry configuration carries no per-attempt hook, so the prototype is the only vantage point on how often construction disposed.
 *
 * `t.mock.method` is the natural tool and is what the string-keyed `connect` counting below uses. It cannot serve here: Node's mock `restore()` reinstates only
 * string-keyed properties, and a symbol key takes its bare-function branch, so the property is never reinstated - the stub stays on the prototype with no
 * implementation and every later call in the file throws. Saving the descriptor and reinstating it from an `after` hook gives the same vantage point and restores
 * cleanly.
 */
function countClientDisposals(t: TestContext): { count: number } {

  const descriptor = Object.getOwnPropertyDescriptor(EspHomeClient.prototype, Symbol.dispose)!;
  const original = descriptor.value as () => void;
  const counter = { count: 0 };
  const counting = function(this: unknown): void {

    counter.count++;
    Reflect.apply(original, this, []);
  };

  Object.defineProperty(EspHomeClient.prototype, Symbol.dispose, { ...descriptor, value: counting });
  t.after((): void => {

    Object.defineProperty(EspHomeClient.prototype, Symbol.dispose, descriptor);
  });

  return counter;
}

describe("openEspHomeClient factory", () => {

  test("openEspHomeClient resolves a connected client when the transport drives connect successfully", async (t) => {

    const transport = new MockTransport();
    // The success-path disposal count is the other half of the rejection-path assertions below: the caller is handed a live client, so nothing disposes it here.
    const disposals = countClientDisposals(t);

    pushHandshake(transport);

    const client = await openEspHomeClient({

      host: "test.local", logger: quietLogger(), maxConstructionRetries: 0, reconnect: false, transportFactory: (): MockTransport => transport
    });

    assert.equal(client.health().state, "connected");
    assert.equal(disposals.count, 0, "the success path returns a live client without disposing it");
    client.disconnect();
  });

  test("openEspHomeClient rejects on permanent error without retrying", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const opener = openEspHomeClient({

      handshakeTimeoutMs: 1000, host: "test.local", logger: log.logger, maxConstructionRetries: 5, reconnect: false, transportFactory: (): MockTransport => transport
    });

    await delay(5);
    // API major 2 -> NegotiationFailedError, which is a PermanentError.
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_2_0);

    await assert.rejects(opener, PermanentError);
  });

  test("openEspHomeClient honors a pre-aborted signal", async (t) => {

    const controller = new AbortController();
    const reason = new Error("Construction abandoned before the first attempt.");
    // Stubbing `connect` with no implementation leaves the real method in place and adds only a call count, which is all this test needs from it.
    const connectCalls = t.mock.method(EspHomeClient.prototype, "connect");
    const disposals = countClientDisposals(t);

    controller.abort(reason);

    await assert.rejects(openEspHomeClient({ host: "test.local", logger: quietLogger(), maxConstructionRetries: 0, signal: controller.signal,
      transportFactory: (): MockTransport => new MockTransport() }), (err: unknown) => err === reason);

    assert.equal(connectCalls.mock.callCount(), 0, "an already-aborted signal must reject before any connect attempt");
    assert.equal(disposals.count, 1, "the pre-abort rejection path disposes the client exactly once");
  });

  test("openEspHomeClient retries on transient failures up to maxConstructionRetries", async (t) => {

    // Each attempt gets a fresh transport, as the transport contract requires, so the second attempt fails on its own handshake timeout rather than on a transport the
    // first attempt already disposed. The last timeout the open builds is the last attempt's hello-step bound, whose own TimeoutError the open rejects with.
    const captured = captureTimeoutSignals(t);
    const transports: MockTransport[] = [];
    const opener = openEspHomeClient({

      constructionRetry: { initialDelayMs: 5, jitter: 0, maxDelayMs: 5 },
      handshakeTimeoutMs: 30,
      host: "test.local",
      logger: quietLogger(),
      maxConstructionRetries: 1,
      reconnect: false,
      transportFactory: (): MockTransport => {

        const transport = new MockTransport();

        transports.push(transport);

        return transport;
      }
    });

    // Don't push anything - both attempts will fail with handshake timeout. After maxConstructionRetries+1 attempts, the factory rejects.
    await assert.rejects(opener, (err: unknown): boolean => err === captured.at(-1)?.reason);
    assert.equal(transports.length, 2, "the open must request one transport per attempt: the first and its one retry");
  });

  /* The latency tests below time the interval from abort to rejection with `process.hrtime.bigint()` against real timers rather than a mocked clock. The timer the
   * abort has to cut short IS the mechanism under test, so measuring it through a clock the test controls would only restate the thing being checked. Each
   * configures a 5000 ms jitter-free backoff, which makes the reading unambiguous: a rejection inside the 1000 ms bound can only have come from the abort, never
   * from the sleep elapsing.
   */

  test("openEspHomeClient rejects with the signal's reason when the abort lands during a connect attempt", async (t) => {

    const controller = new AbortController();
    const reason = new Error("Construction abandoned during a connect attempt.");
    const connectCalls = t.mock.method(EspHomeClient.prototype, "connect", async (connectOptions?: { signal?: AbortSignal }): Promise<void> => {

      // Park the attempt until the factory's threaded signal aborts, then fail the way connectInternal does - a wrapped transient ConnectionError, not the signal's
      // own reason. That distinction is what gives the rejection-identity assertion below something to prove.
      await new Promise<void>((resolve) => {

        connectOptions?.signal?.addEventListener("abort", () => resolve(), { once: true });
      });

      throw new ConnectionError("Connect failed: the caller abandoned the attempt.", "CONNECT_FAILED");
    });
    const disposals = countClientDisposals(t);
    const opener = openEspHomeClient({

      constructionRetry: { initialDelayMs: 5000, jitter: 0, maxDelayMs: 5000 },
      host: "test.local",
      logger: quietLogger(),
      maxConstructionRetries: 3,
      reconnect: false,
      signal: controller.signal,
      transportFactory: (): MockTransport => new MockTransport()
    });

    // Abort only once the first attempt is genuinely in flight, so the abort interrupts the connect rather than the loop top.
    while(connectCalls.mock.callCount() < 1) {

      await delay(5);
    }

    const abortedAt = process.hrtime.bigint();

    controller.abort(reason);

    await assert.rejects(opener, (err: unknown) => err === reason);

    const elapsedMs = Number(process.hrtime.bigint() - abortedAt) / 1000000;

    assert.ok(elapsedMs < 1000, "an abort during a connect attempt must not pay a backoff sleep; elapsed " + String(elapsedMs) + " ms");
    assert.equal(connectCalls.mock.callCount(), 1, "a failed attempt must not be retried once the signal has aborted");
    assert.equal(disposals.count, 1, "the mid-connect rejection path disposes the client exactly once");
  });

  test("openEspHomeClient rejects with the signal's reason when the abort lands during the backoff sleep", async (t) => {

    const controller = new AbortController();
    const reason = new Error("Construction abandoned during the backoff sleep.");
    const connectCalls = t.mock.method(EspHomeClient.prototype, "connect", async (): Promise<void> => {

      // Fail instantly with a transient error so the factory spends effectively the whole test parked in the backoff sleep.
      throw new ConnectionError("Connect failed: the device refused the connection.", "CONNECT_FAILED");
    });
    const disposals = countClientDisposals(t);
    const opener = openEspHomeClient({

      constructionRetry: { initialDelayMs: 5000, jitter: 0, maxDelayMs: 5000 },
      host: "test.local",
      logger: quietLogger(),
      maxConstructionRetries: 3,
      reconnect: false,
      signal: controller.signal,
      transportFactory: (): MockTransport => new MockTransport()
    });

    // Wait for the first attempt to fail, then leave a real-time margin so the factory is demonstrably inside the sleep rather than still unwinding the catch.
    while(connectCalls.mock.callCount() < 1) {

      await delay(5);
    }

    await delay(50);

    const abortedAt = process.hrtime.bigint();

    controller.abort(reason);

    await assert.rejects(opener, (err: unknown) => err === reason);

    const elapsedMs = Number(process.hrtime.bigint() - abortedAt) / 1000000;

    assert.ok(elapsedMs < 1000, "an abort during the backoff sleep must abandon the sleep; elapsed " + String(elapsedMs) + " ms");
    assert.equal(connectCalls.mock.callCount(), 1, "the abort must land inside the sleep, with no second connect attempt");
    assert.equal(disposals.count, 1, "the mid-backoff rejection path disposes the client exactly once");
  });

  test("openEspHomeClient rejects with the permanent error when an abort and a permanent error land on the same attempt", async (t) => {

    const controller = new AbortController();
    const reason = new Error("Construction abandoned as the attempt failed permanently.");
    const permanent = new NegotiationFailedError("Device API major version 2 is outside the supported range.", "API_MAJOR_OUT_OF_RANGE");
    const connectCalls = t.mock.method(EspHomeClient.prototype, "connect", async (connectOptions?: { signal?: AbortSignal }): Promise<void> => {

      // Park the attempt until the signal aborts, then fail it permanently, so both endings arrive together. The permanent error takes precedence: it names a
      // misconfiguration the caller has to fix, which the abort reason would hide.
      await new Promise<void>((resolve) => {

        connectOptions?.signal?.addEventListener("abort", () => resolve(), { once: true });
      });

      throw permanent;
    });
    const disposals = countClientDisposals(t);
    const opener = openEspHomeClient({

      constructionRetry: { initialDelayMs: 5000, jitter: 0, maxDelayMs: 5000 },
      host: "test.local",
      logger: quietLogger(),
      maxConstructionRetries: 3,
      reconnect: false,
      signal: controller.signal,
      transportFactory: (): MockTransport => new MockTransport()
    });

    while(connectCalls.mock.callCount() < 1) {

      await delay(5);
    }

    controller.abort(reason);

    await assert.rejects(opener, (err: unknown) => err === permanent);

    assert.equal(connectCalls.mock.callCount(), 1, "a permanent failure must not be retried");
    assert.equal(disposals.count, 1, "the abort-plus-permanent-error path disposes the client exactly once");
  });
});

// 17. Reconnect coordination.

describe("EspHomeClient reconnect coordination", () => {

  test("disconnect after explicit close does not schedule a reconnect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 5, jitter: 0, maxDelayMs: 5 }, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    client.disconnect();
    await delay(20);

    // No way to *prove* a negative directly; the absence of new outbound frames + the disconnected health is the signal.
    assert.equal(client.health().state, "disconnected");
  });

  test("post-dispose disconnect is a no-op with no recurrence", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new MockTransport() });

    client[Symbol.dispose]();
    assert.doesNotThrow(() => client[Symbol.dispose]());
  });
});

// 18. Hot path probe.

describe("EspHomeClient hot path", () => {

  test("10000 sequential SWITCH_STATE_RESPONSE messages decode and update the cache without throwing", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      host: "test.local", logger: quietLogger(), maxFieldsPerMessage: 32, reconnect: false, transportFactory: (): MockTransport => transport
    });

    await driveConnect(transport, client, {

      entities: [{ key: 0x55555, name: "Switch", objectId: "switch_x", type: "switch" }],
      signal: AbortSignal.timeout(5000)
    });

    const start = Date.now();

    for(let i = 0; i < 10000; i++) {

      transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 0x55555,
        [{ fieldNumber: 2, value: (i & 1) === 1 ? 1 : 0, wireType: WireType.VARINT }]));
    }

    await delay(50);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 5000, "10k state-fanout iterations should comfortably complete in under 5s; observed " + String(elapsed) + "ms");
    assert.notEqual(client.latest(entityId("switch", "switch_x")), null);

    client.disconnect();
  });

  test("client.latest tight loop is O(1) per call", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 1, name: "Lamp", objectId: "lamp", type: "light" }],
      signal: AbortSignal.timeout(2000)
    });

    transport.pushInbound(MessageType.LIGHT_STATE_RESPONSE, statePayloadFor("light", 1, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(5);

    const id = entityId("light", "lamp");
    const start = Date.now();

    for(let i = 0; i < 100000; i++) {

      client.latest(id);
    }

    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, "100k cache lookups must comfortably finish in under a second; observed " + String(elapsed) + "ms");

    client.disconnect();
  });
});

// 19. Byte-level wire fixtures.

describe("EspHomeClient byte-level wire fixtures", () => {

  test("HELLO_REQUEST encodes exactly the bytes we expect for the canonical clientId/version", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      clientId: "esphome-client", host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    void client.connect({ signal: AbortSignal.timeout(500) }).catch((): undefined => undefined);
    await delay(20);

    const hello = transport.outboundFrames.find((f): boolean => f.type === MessageType.HELLO_REQUEST);

    assert.notEqual(hello, undefined);

    // Tag for field 1 LD = 0x0A; varint length = 14 (length of "esphome-client"); then the string; then field 2 varint major (0x10 0x01); then field 3 varint minor.
    // The advertised minor is `CLIENT_API_VERSION.minor` in esphome-client.ts. Bumping that constant is the deliberate "we honestly support this
    // version" declaration; this test locks in the wire shape so accidental bumps without implementation work are caught.
    const expected = Buffer.concat([

      Buffer.from([0x0A]),
      encodeVarint("esphome-client".length),
      Buffer.from("esphome-client", "utf8"),
      Buffer.from([0x10]),
      encodeVarint(1),
      Buffer.from([0x18]),
      encodeVarint(14)
    ]);

    assert.deepEqual(hello!.payload, expected);
    client.disconnect();
  });

  test("DEVICE_INFO_REQUEST is sent with an empty payload", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.DEVICE_INFO_REQUEST);

    assert.notEqual(frame, undefined);
    assert.equal(frame!.payload.length, 0);
    client.disconnect();
  });

  test("LIST_ENTITIES_REQUEST is sent with an empty payload", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.LIST_ENTITIES_REQUEST);

    assert.notEqual(frame, undefined);
    assert.equal(frame!.payload.length, 0);
    client.disconnect();
  });

  test("SUBSCRIBE_STATES_REQUEST is sent with an empty payload after discovery", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.SUBSCRIBE_STATES_REQUEST);

    assert.notEqual(frame, undefined);
    assert.equal(frame!.payload.length, 0);
    client.disconnect();
  });

  test("PING_RESPONSE bytes are exactly empty", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", keepAlive: false, logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    transport.pushInbound(MessageType.PING_REQUEST, PING_REQUEST_PAYLOAD);
    await delay(10);

    const reply = transport.outboundFrames.find((f): boolean => f.type === MessageType.PING_RESPONSE);

    assert.notEqual(reply, undefined);
    assert.equal(reply!.payload.length, 0);
    client.disconnect();
  });

  test("SWITCH_COMMAND_REQUEST encodes key (fixed32) + state (varint bool)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0x12345678, name: "S", objectId: "x", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    client.command(entityId("switch", "x"), { state: true });
    await delay(2);

    const frame = transport.outboundFrames.find((f): boolean => f.type === MessageType.SWITCH_COMMAND_REQUEST);

    assert.notEqual(frame, undefined);
    // Field 1 (key) is fixed32 -> tag 0x0D + 4-byte LE. Field 2 (state) is varint -> tag 0x10 + 1-byte 0x01.
    assert.equal(frame!.payload.readUInt8(0), 0x0D, "first byte should be field 1 fixed32 tag");
    assert.equal(frame!.payload.readUInt32LE(1), 0x12345678, "key should match the entity key in fixed32 LE");
    client.disconnect();
  });
});

// 20. Negative assertions.

describe("EspHomeClient negative assertions", () => {

  test("sendPing post-dispose is a no-op (drops without throwing, no frame appended)", () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    client[Symbol.dispose]();

    const before = transport.outboundFrames.length;

    assert.doesNotThrow(() => client.sendPing());
    assert.equal(transport.outboundFrames.length, before);
  });

  test("command post-dispose is a no-op (no frame appended)", () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    client[Symbol.dispose]();

    const before = transport.outboundFrames.length;

    assert.doesNotThrow(() => client.command(entityId("switch", "x"), { state: true }));
    assert.equal(transport.outboundFrames.length, before);
  });

  test("disconnect does NOT emit a 'disconnect' event on a never-connected client", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => new MockTransport() });

    let fired = false;

    client.on("disconnect", (): void => { fired = true; });
    client.disconnect();

    assert.equal(fired, false);
  });

  test("disconnect after dispose does not fire a second 'disconnect' event", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let count = 0;

    client.on("disconnect", (): void => { count++; });
    client.disconnect();
    client.disconnect();
    await delay(2);

    assert.equal(count, 1, "second disconnect should be a no-op");
  });

  test("camera image for a known non-camera entity is dropped (warn only)", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 100, name: "Switch", objectId: "shelf", type: "switch" }],
      signal: AbortSignal.timeout(2000)
    });

    let cameraEvents = 0;

    client.on("camera", (): void => { cameraEvents++; });
    transport.pushInbound(MessageType.CAMERA_IMAGE_RESPONSE, cameraImageResponse(100, Buffer.from([0x42]), true));
    await delay(10);

    assert.equal(cameraEvents, 0, "camera event must NOT fire for a non-camera entity key");
    client.disconnect();
  });

  test("malformed device info without sub-device records leaves subDevices() empty", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    assert.deepEqual(client.subDevices(), []);
    client.disconnect();
  });
});

// 21. Reconnect-loop coverage and additional edge paths.

describe("EspHomeClient reconnect loop end-to-end", () => {

  test("a peer-initiated disconnect schedules and runs a reconnect attempt", async () => {

    const transport = new MockTransport();
    const recordedMetrics: { name: string; value: number }[] = [];
    const metrics = {

      gauge: (name: string, value: number): void => { recordedMetrics.push({ name, value }); },
      increment: (name: string, by = 1): void => { recordedMetrics.push({ name, value: by }); },
      timing: (name: string, durationMs: number): void => { recordedMetrics.push({ name, value: durationMs }); }
    };
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      metrics, reconnect: { initialDelayMs: 5, jitter: 0, maxAttempts: 1, maxDelayMs: 5 }, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleEvents: string[] = [];

    client.on("lifecycle", (e): void => { lifecycleEvents.push(e.kind); });

    // Trigger a peer-initiated disconnect; the reconnect supervisor should kick a retry attempt.
    transport.pushInbound(MessageType.DISCONNECT_REQUEST, DISCONNECT_REQUEST_PAYLOAD);
    await delay(50);

    assert.ok(lifecycleEvents.includes("disconnect"));
    assert.ok(recordedMetrics.some((m) => m.name === "reconnect.attempts"), "the reconnect supervisor must emit the reconnect.attempts counter metric");
    // The reconnect attempt itself will fail (no further pushes), but the supervisor should have run at least once.
    client.disconnect();
  });

  test("a reconnect give-up on a PermanentError (shouldRetry-false) emits a terminal typed disconnect and unfreezes health to disconnected", async () => {

    const firstTransport = new MockTransport();
    const reconnectTransport = new MockTransport();

    // Pre-fail the reconnect attempt's transport with a PermanentError. When the supervisor's connectInternal sends its first frame onto this transport, the send throws
    // the EncryptionKeyInvalidError, connectInternal rejects with it unchanged (it is already an EspHomeError), and the default shouldRetry predicate returns false for a
    // PermanentError - driving the give-up path under test.
    const giveUpCause = new EncryptionKeyInvalidError("Synthetic permanent encryption failure on the reconnect attempt.", "NOISE_HANDSHAKE_FAILED");

    reconnectTransport.fail(giveUpCause);

    // The factory vends the live first transport, then the pre-failed reconnect transport, then fresh transports for any (unexpected) further attempt.
    const transportQueue: MockTransport[] = [ firstTransport, reconnectTransport ];
    const transportFactory = (): MockTransport => transportQueue.shift() ?? new MockTransport();

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 5, maxDelayMs: 10 }, transportFactory });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (e): void => { if(e.kind === "disconnect") { lifecycleDisconnects.push(e); } });

    // A transient run-phase death (not permanent) schedules a reconnect; the reconnect attempt then fails permanently and the supervisor gives up.
    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));

    // Wait past initialDelayMs so the single reconnect attempt fires, rejects with the PermanentError, and the give-up emits.
    await delay(60);

    // The give-up disconnect is the one carrying the PermanentError cause; the earlier run-phase disconnect carries the transient peer-death cause. We key on the typed
    // give-up cause, never on raw string-disconnect counts.
    const giveUpDisconnect = lifecycleDisconnects.find((e) => e.cause === giveUpCause);

    assert.ok(giveUpDisconnect, "the reconnect give-up must emit a typed lifecycle disconnect carrying the PermanentError cause");
    assert.equal(lifecycleDisconnects.filter((e) => e.cause === giveUpCause).length, 1, "the give-up must emit exactly one terminal typed disconnect");
    assert.equal(client.health().state, "disconnected", "the give-up must unfreeze health from reconnecting to disconnected (the core fix)");

    client.disconnect();
  });

  test("a reconnect give-up on exhausted maxAttempts emits a terminal typed disconnect and unfreezes health to disconnected", async () => {

    const firstTransport = new MockTransport();
    const reconnectTransport = new MockTransport();

    // Pre-fail the single reconnect attempt's transport with a TRANSIENT cause: shouldRetry returns true (it is not a PermanentError), so the give-up here is driven by
    // the exhausted retry budget (maxAttempts: 1), not the predicate. The cause carried on the terminal disconnect is this last attempt's error.
    const giveUpCause = new ConnectionClosedByPeerError("Synthetic transient failure on the final reconnect attempt.", "PEER_CLOSED");

    reconnectTransport.fail(giveUpCause);

    const transportQueue: MockTransport[] = [ firstTransport, reconnectTransport ];
    const transportFactory = (): MockTransport => transportQueue.shift() ?? new MockTransport();

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 1, maxDelayMs: 10 }, transportFactory });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (e): void => { if(e.kind === "disconnect") { lifecycleDisconnects.push(e); } });

    // A transient run-phase death schedules a reconnect; the single attempt fails and maxAttempts (1) is reached, so the supervisor gives up.
    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));

    await delay(60);

    const giveUpDisconnect = lifecycleDisconnects.find((e) => e.cause === giveUpCause);

    assert.ok(giveUpDisconnect, "the maxAttempts give-up must emit a typed lifecycle disconnect carrying the last attempt's cause");
    assert.equal(lifecycleDisconnects.filter((e) => e.cause === giveUpCause).length, 1, "the maxAttempts give-up must emit exactly one terminal typed disconnect");
    assert.equal(client.health().state, "disconnected", "the maxAttempts give-up must unfreeze health from reconnecting to disconnected");

    client.disconnect();
  });

  test("a throwing shouldRetry predicate is treated as a give-up: the loop does not escape, health unfreezes, and the loop state is cleaned up", async () => {

    const firstTransport = new MockTransport();
    const reconnectTransport = new MockTransport();

    // Pre-fail the reconnect attempt's transport so connectInternal rejects and the supervisor consults shouldRetry.
    const attemptCause = new ConnectionClosedByPeerError("Synthetic transient failure on the reconnect attempt.", "PEER_CLOSED");

    reconnectTransport.fail(attemptCause);

    const transportQueue: MockTransport[] = [ firstTransport, reconnectTransport ];
    const transportFactory = (): MockTransport => transportQueue.shift() ?? new MockTransport();

    // A consumer-supplied predicate that THROWS inside the reconnect loop. We gate on the attempt counter so the predicate returns true at the scheduling decision
    // (maybeScheduleReconnect consults it with reconnectAttempts === 0, after a successful session reset the counter) and throws on the loop's own consult (the loop
    // increments reconnectAttempts to >= 1 before its first attempt). This isolates the loop-level throw: a throw from the loop's own consult is treated as a give-up
    // (fail-closed) and routed through the same terminal disconnect, rather than escaping the loop and skipping cleanup, freezing health at reconnecting, and leaving the
    // floated loop promise rejecting unhandled.
    const shouldRetry = (_error: EspHomeError, attempts: number): boolean => {

      if(attempts >= 1) {

        throw new Error("Synthetic predicate fault.");
      }

      return true;
    };
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 5, maxDelayMs: 10, shouldRetry }, transportFactory });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (e): void => { if(e.kind === "disconnect") { lifecycleDisconnects.push(e); } });

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));

    await delay(60);

    const giveUpDisconnect = lifecycleDisconnects.find((e) => e.cause === attemptCause);

    assert.ok(giveUpDisconnect, "a throwing shouldRetry must still emit a terminal typed disconnect carrying the attempt's cause");
    assert.equal(client.health().state, "disconnected", "a throwing shouldRetry must unfreeze health to disconnected (not freeze at reconnecting)");
    // The loop must have reached its cleanup despite the predicate throw: reconnectInProgress is cleared, proving no escape and no unhandled loop-promise rejection.
    assert.equal((client as unknown as { reconnectInProgress: boolean }).reconnectInProgress, false,
      "a throwing shouldRetry must not escape the loop: the loop-end cleanup must clear reconnectInProgress");

    client.disconnect();
  });

  test("a throwing shouldRetry predicate at the SCHEDULING consult is caught: no unhandled rejection escapes the receiver pump, reconnect is not scheduled, and the " +
    "terminal disconnect / disconnected health still hold", async () => {

    const transport = new MockTransport();

    // A consumer-supplied predicate that THROWS at the SCHEDULING consult. maybeScheduleReconnect consults shouldRetry with reconnectAttempts === 0 (the run phase reset
    // the counter on a successful connect, and the loop only increments it AFTER scheduling). Gating the throw on attempts === 0 isolates the scheduling-level throw:
    // safeShouldRetry catches it and returns false, so the existing skip-and-return path runs and no reconnect is scheduled. Without that guard the throw would escape
    // maybeScheduleReconnect -> disconnectInternal -> the MessageReceiver terminal callback -> the receiver pump as an unhandled promise rejection (emitDisconnected
    // already ran upstream at disconnectInternal, so the residual would be the unhandled rejection, not a freeze).
    const shouldRetry = (_error: EspHomeError, attempts: number): boolean => {

      if(attempts === 0) {

        throw new Error("Synthetic scheduling-consult predicate fault.");
      }

      return true;
    };
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 5, maxDelayMs: 10, shouldRetry }, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (e): void => { if(e.kind === "disconnect") { lifecycleDisconnects.push(e); } });

    // Capture any unhandled rejection that escapes the receiver pump: an uncaught scheduling-consult throw would surface here as a process-level unhandledRejection. We
    // install the guard for the duration of the test only and remove it in finally so it never leaks across tests.
    const escapedRejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { escapedRejections.push(reason); };

    process.on("unhandledRejection", onUnhandled);

    try {

      // Drive a REAL run-phase transport death so the throw traverses the genuine pump boundary: the parked pump awaiter rejects, the pump's terminal escalation invokes
      // onTerminal -> disconnectInternal -> maybeScheduleReconnect -> the scheduling consult (with reconnectAttempts === 0). This is NOT a direct maybeScheduleReconnect
      // call.
      const runPhaseCause = new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED");

      transport.fail(runPhaseCause);

      // Wait long enough that an escaped rejection would have surfaced (Node reports unhandled rejections on a later microtask turn) and any hypothetical reconnect loop
      // would have started. With the fix the consult is caught, the skip-return runs, and no loop ever starts.
      await delay(60);

      // Rule 1a: no unhandled rejection escaped the receiver pump - the scheduling throw was caught by safeShouldRetry.
      assert.equal(escapedRejections.length, 0,
        "a throwing shouldRetry at scheduling must not escape the receiver pump as an unhandled rejection; observed: " + String(escapedRejections.length));

      // Rule 1b: reconnect was NOT scheduled - the caught throw routes through the existing skip-and-return path, so no loop starts.
      assert.equal((client as unknown as { reconnectInProgress: boolean }).reconnectInProgress, false,
        "a throwing shouldRetry at scheduling must be treated as fail-closed: no reconnect loop may start");

      // Rule 1c: the terminal typed lifecycle disconnect fired upstream (emitDisconnected ran at disconnectInternal before the scheduling consult), carrying the
      // typed run-phase cause, and health stands at disconnected.
      const disconnectEvent = lifecycleDisconnects.find((e) => e.cause === runPhaseCause);

      assert.ok(disconnectEvent, "the run-phase disconnect surface must still have fired upstream of the (caught) scheduling consult with the typed peer-death cause");
      assert.equal(client.health().state, "disconnected", "health must stand at disconnected after a caught scheduling-consult throw");

    } finally {

      process.removeListener("unhandledRejection", onUnhandled);
    }

    client.disconnect();
  });

  test("a consumer disconnect during a parked reconnect backoff emits NO give-up typed disconnect from the loop, only a causeless release", async () => {

    const firstTransport = new MockTransport();
    const vended: MockTransport[] = [];

    // Only the first transport is expected to be vended: the consumer aborts the loop while it is parked in backoff, before any reconnect attempt vends a second
    // transport.
    const transportFactory = (): MockTransport => {

      const t = (vended.length === 0) ? firstTransport : new MockTransport();

      vended.push(t);

      return t;
    };

    // A large initialDelayMs parks the supervisor in its backoff sleep long enough for the consumer disconnect to land first.
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 80, jitter: 0, maxAttempts: 5 }, transportFactory });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (e): void => { if(e.kind === "disconnect") { lifecycleDisconnects.push(e); } });

    // A transient run-phase death schedules a reconnect; the supervisor parks in its 80 ms backoff sleep. This emits the run-phase typed disconnect (cause = peer death).
    const runPhaseCause = new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED");

    firstTransport.fail(runPhaseCause);
    await delay(15);

    // The consumer explicitly closes while the loop is parked: this cancels the reconnect (aborts the signal) so the loop breaks on the abort path, NOT the give-up path.
    client.disconnect();

    // Wait well past the supervisor's backoff so a surviving loop would have woken, attempted, and (wrongly) emitted a give-up disconnect.
    await delay(120);

    // The abort break emits NO give-up disconnect: a give-up carries the failed attempt's cause, and no attempt ran. What follows the run-phase disconnect is the loop
    // releasing the reconnecting state it entered, causeless because no attempt failed. We key on the typed lifecycle disconnect, not raw string-disconnect counts (the
    // per-attempt and run-phase string disconnects are not the give-up signal).
    assert.equal(lifecycleDisconnects.length, 2, "the run-phase disconnect and the explicit-close release must each fire exactly once, with no give-up beside them");

    const [ runPhaseDisconnect, releaseDisconnect ] = lifecycleDisconnects;

    assert.ok(runPhaseDisconnect, "the run-phase typed disconnect must be present");
    assert.equal(runPhaseDisconnect.cause, runPhaseCause, "the first typed disconnect must be the run-phase one, carrying the peer-death cause");
    assert.ok(releaseDisconnect, "the explicit close must release the reconnecting state through a typed disconnect");
    assert.equal(releaseDisconnect.cause, undefined, "the release carries no cause because no attempt failed, so it cannot be a give-up");
    assert.equal(client.health().state, "disconnected", "the release must leave health disconnected rather than reconnecting");
    assert.equal(vended.length, 1, "the consumer abort during backoff must prevent any reconnect attempt from vending a second transport");

    client.disconnect();
  });

  // Each close form cancels a reconnect loop parked in its backoff, and the loop then releases the reconnecting state it entered. The close itself returns before the
  // loop settles, so the test awaits the loop's promise before asserting.
  for(const close of [ "disconnect", "disconnectAsync" ] as const) {

    test(close + "() during a parked reconnect backoff ends with health disconnected and exactly one healthChange to it", async () => {

      const firstTransport = new MockTransport();
      const transportQueue = [firstTransport];
      const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
        reconnect: { initialDelayMs: 80, jitter: 0, maxAttempts: 5 }, transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport() });

      await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

      firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));
      await delay(15);

      assert.equal(client.health().state, "reconnecting", "the supervisor must be parked in its backoff before the close");

      const healthStates: string[] = [];

      client.on("healthChange", (health): void => { healthStates.push(health.state); });

      const loop = (client as unknown as { reconnectLoopPromise: Nullable<Promise<void>> }).reconnectLoopPromise;

      await client[close]();
      await loop;

      // Wait past the backoff as well, so a transition the loop fired late would be counted.
      await delay(100);

      assert.deepEqual(healthStates, ["disconnected"], "the close must produce exactly one healthChange, to disconnected");
      assert.equal(client.health().state, "disconnected", "health must end disconnected rather than frozen at reconnecting");
    });
  }

  test("a manual connect() superseding a parked reconnect loop emits only the new session's connect events", async () => {

    const firstTransport = new MockTransport();
    const manualTransport = new MockTransport();
    const transportQueue = [ firstTransport, manualTransport ];
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 80, jitter: 0, maxAttempts: 5 }, transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport() });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));
    await delay(15);

    const events: string[] = [];

    client.on("connect", (): void => { events.push("connect"); });
    client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
    client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
    client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });

    await driveConnect(manualTransport, client, { signal: AbortSignal.timeout(2000) });

    // Wait past the superseded loop's backoff so an announcement it made late would be recorded too.
    await delay(100);

    // The loss the loop was recovering from was announced when it began, so superseding it adds no disconnect: the full sequence is the new session's connect surface.
    assert.deepEqual(events, [ "connect", "healthChange:connected", "lifecycle:connect" ]);

    client.disconnect();
  });

  test("a manual connect() superseding a parked reconnect loop that fails ends with health disconnected and one typed lifecycle disconnect", async () => {

    const firstTransport = new MockTransport();
    const manualTransport = new MockTransport();
    const transportQueue = [ firstTransport, manualTransport ];
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(),
      reconnect: { initialDelayMs: 80, jitter: 0, maxAttempts: 5 }, transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport() });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));
    await delay(15);

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (event): void => { if(event.kind === "disconnect") { lifecycleDisconnects.push(event); } });

    // The superseding connect fails inside its handshake: the device announces an API major the client does not support.
    const pending = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(10);
    manualTransport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_2_0);

    let rejection: unknown;

    await assert.rejects(pending, (err: unknown): boolean => {

      rejection = err;
      assert.ok(err instanceof NegotiationFailedError, "The superseding connect rejects with NegotiationFailedError.");

      return true;
    });

    // The superseded loop left health reconnecting and no loop is running any more, so the failed connect releases that state with its own typed cause.
    assert.equal(client.health().state, "disconnected", "health must not stay reconnecting after the superseding connect fails");
    assert.equal(lifecycleDisconnects.length, 1, "the failed supersede must emit exactly one typed lifecycle disconnect");
    assert.equal(lifecycleDisconnects[0]?.cause, rejection, "the lifecycle disconnect must carry the typed cause the connect rejected with");
  });

  test("a manual connect() superseding a parked reconnect loop whose transport fails to open rejects typed and ends with health disconnected", async () => {

    const firstTransport = new MockTransport();
    const factoryFault = new Error("Synthetic unreachable device.");
    let opened = 0;
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      reconnect: { initialDelayMs: 200, jitter: 0, maxAttempts: 5 },
      transportFactory: (): MockTransport => {

        opened++;

        if(opened === 1) {

          return firstTransport;
        }

        throw factoryFault;
      }
    });

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic transient run-phase peer death.", "PEER_CLOSED"));
    await delay(10);

    const lifecycleDisconnects: { cause?: EspHomeError; kind: string }[] = [];

    client.on("lifecycle", (event): void => { if(event.kind === "disconnect") { lifecycleDisconnects.push(event); } });

    // The most likely failure of a reconnect by hand: the device is still unreachable, so the transport never opens.
    await assert.rejects(client.connect({ signal: AbortSignal.timeout(2000) }), (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionError, "a failed transport open must reject with a typed ConnectionError");
      assert.equal(err.cause, factoryFault, "the cause must be the error the transport open failed with");

      return true;
    });

    assert.equal(client.health().state, "disconnected", "health must not stay reconnecting after the superseding connect fails to open");
    assert.equal(lifecycleDisconnects.length, 1, "the failed supersede must emit exactly one typed lifecycle disconnect");
    assert.ok(lifecycleDisconnects[0]?.cause instanceof ConnectionError, "the lifecycle disconnect must carry the typed cause");
  });

  test("a reconnect attempt that times out in hello gives up with the CONNECT_FAILED wrap naming the step, and is retried while the budget lasts", async (t) => {

    const firstTransport = new MockTransport();
    const transportQueue = [firstTransport];
    const client = new EspHomeClient({

      handshakeTimeoutMs: 50, host: "test.local", logger: quietLogger(), reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 1 },
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });
    const disconnects: { cause: EspHomeError | undefined; reading: string }[] = [];

    await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

    // The reading the serial host object hands out inside each announcement: the give-up announces while the loop is still active.
    client.on("lifecycle", (event): void => { if(event.kind === "disconnect") { disconnects.push({ cause: event.cause, reading: serialScope(client).kind }); } });

    // The loop's attempt builds its overall bound and then its hello step's short bound, whose own TimeoutError ends the attempt.
    const captured = captureTimeoutSignals(t);

    firstTransport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
    await delay(300);

    assert.equal(disconnects.length, 2, "the run-phase fault and the give-up must each announce their end once");
    assert.equal(captured.length, 2, "the attempt builds its overall bound and its hello step's bound");

    const giveUp = disconnects[1];

    assert.ok(giveUp?.cause instanceof ConnectionError, "the give-up must carry a typed ConnectionError");
    assert.equal(giveUp.cause.code, "CONNECT_FAILED", "the loop's attempt keeps the step-naming wrap");
    assert.match(giveUp.cause.message, /^Connect failed during the hello exchange: /, "the give-up's cause must name the step the attempt failed in");
    assert.equal(giveUp.cause.cause, captured[1]?.reason, "the wrap must carry the hello step's own TimeoutError");
    assert.equal(giveUp.reading, "connecting", "the give-up announces while the reconnect loop is still active");
    client.disconnect();

    // With a budget that leaves room for a retry, the default predicate retries the timed-out attempt, so the loop requests another transport of its own.
    const retryFirst = new MockTransport();
    const retryQueue = [retryFirst];
    let requested = 0;
    const retryClient = new EspHomeClient({

      handshakeTimeoutMs: 50, host: "test.local", logger: quietLogger(), reconnect: { initialDelayMs: 10, jitter: 0, maxAttempts: 2 },
      transportFactory: (): MockTransport => {

        requested++;

        return retryQueue.shift() ?? new MockTransport();
      }
    });

    try {

      await driveConnect(retryFirst, retryClient, { signal: AbortSignal.timeout(2000) });
      retryFirst.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
      await delay(400);

      assert.equal(requested, 3, "the first connect's transport and one per reconnect attempt: the timed-out attempt must be retried");

    } finally {

      retryClient.disconnect();
    }
  });

  test("a stray DISCONNECT_RESPONSE in the hand-off of a connect that superseded a parked loop schedules no new loop, though health read reconnecting", async () => {

    const firstTransport = new MockTransport();
    const manualTransport = new MockTransport();
    const transportQueue = [ firstTransport, manualTransport ];
    const counts = { onAttempt: 0, reconnectAttempts: 0 };
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      metrics: reconnectAttemptsSink(counts),
      reconnect: { initialDelayMs: 10000, jitter: 0, onAttempt: (): void => { counts.onAttempt++; } },
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    // The disconnect in the finally ends the reconnect loop however the assertions end, so a failing assertion cannot leave the loop retrying behind the suite.
    try {

      await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

      assert.equal(serialScope(client).kind, "attached");

      firstTransport.fail(new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED"));
      await delay(5);

      assert.equal(counts.onAttempt, 1, "the fault must schedule the loop once");
      assert.equal(counts.reconnectAttempts, 1, "the parked loop must count its one attempt");
      assert.equal(client.health().state, "reconnecting", "the parked loop must leave the reconnecting record in place");

      const events: string[] = [];
      const seen: { scope: Nullable<AbortSignal> } = { scope: null };

      client.on("connect", (): void => { events.push("connect"); });
      client.on("disconnect", (reason): void => { events.push("disconnect:" + String(reason)); });
      client.on("healthChange", (health): void => { events.push("healthChange:" + health.state); });
      client.on("lifecycle", (event): void => { events.push("lifecycle:" + event.kind); });
      client.on("telemetry", (): void => { seen.scope = attachedSignal(client); });

      // A superseding connect ends the loop without announcing, so the reconnecting record stays in place when the replayed stray response tears the new session down.
      manualTransport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 12, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
      manualTransport.pushInbound(MessageType.DISCONNECT_RESPONSE, DISCONNECT_RESPONSE_PAYLOAD);

      await assert.rejects(driveConnect(manualTransport, client, {

        entities: [{ key: 12, name: "S1", objectId: "shelf", type: "switch" }],
        signal: AbortSignal.timeout(2000)
      }), (err: unknown): boolean => err === seen.scope?.reason);
      assert.deepEqual(events, [ "healthChange:disconnected", "lifecycle:disconnect", "disconnect:undefined" ],
        "the stray response's teardown announces the end once, and no reconnecting record follows a session never reported live");
      assert.equal(counts.onAttempt, 1, "no second loop may be scheduled");
      assert.equal(counts.reconnectAttempts, 1, "no second loop may count an attempt");
      assert.equal(client.health().state, "disconnected");

    } finally {

      client.disconnect();
    }
  });

  test("a stray DISCONNECT_RESPONSE after the session was reported live schedules the reconnect while the connect controller is still set", async () => {

    const transport = new MockTransport();
    const counts = { onAttempt: 0, reconnectAttempts: 0 };
    const client = new EspHomeClient({

      host: "test.local",
      logger: quietLogger(),
      metrics: reconnectAttemptsSink(counts),
      reconnect: { initialDelayMs: 10000, jitter: 0, onAttempt: (): void => { counts.onAttempt++; } },
      transportFactory: (): MockTransport => transport
    });
    const healthStates: string[] = [];
    const seen: { acknowledged: boolean; controller: Nullable<AbortController> } = { acknowledged: false, controller: null };

    client.on("healthChange", (health): void => { healthStates.push(health.state); });

    // The lifecycle connect is the connect path's last statement, so a stray response handled from its listener lands after the session was reported live and while
    // the connect controller is still set.
    client.on("lifecycle", (event): void => {

      if((event.kind === "connect") && !seen.acknowledged) {

        seen.acknowledged = true;
        seen.controller = connectController(client);
        client.acknowledgeDisconnectResponse();
      }
    });

    // The disconnect in the finally ends the reconnect loop however the assertions end, so a failing assertion cannot leave the loop retrying behind the suite.
    try {

      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      assert.ok(seen.controller instanceof AbortController, "the stray response must land while the connect controller is still set");
      assert.deepEqual(healthStates, [ "connected", "disconnected", "reconnecting" ], "a session reported live is reconnected after a stray response ends it");
      assert.equal(counts.onAttempt, 1, "the loop must be scheduled once");
      assert.equal(counts.reconnectAttempts, 1, "the loop must count its one attempt");

    } finally {

      client.disconnect();
    }
  });

  test("voiceAssistant.subscribe sends SUBSCRIBE_VOICE_ASSISTANT_REQUEST after connect", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const before = transport.outboundFrames.filter((f): boolean => f.type === MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST).length;

    client.voiceAssistant.subscribe();
    await delay(2);

    const after = transport.outboundFrames.filter((f): boolean => f.type === MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST).length;

    assert.ok(after > before, "voiceAssistant.subscribe should issue SUBSCRIBE_VOICE_ASSISTANT_REQUEST");
    client.disconnect();
  });
});

describe("EspHomeClient telemetry decode edge cases", () => {

  test("a telemetry message for an unknown key is dropped without crashing", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let switchEvents = 0;

    client.on("switch", (): void => { switchEvents++; });
    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, statePayloadFor("switch", 0x99999999, [{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(10);

    // Unknown entity -> emits with synthesized "unknown(<key>)" name, but doesn't crash.
    assert.ok(switchEvents >= 1);
    client.disconnect();
  });

  test("an unclaimed infrared-or-radio-frequency receive event decodes as radio_frequency, the later schema in table order", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const types: string[] = [];

    client.on("telemetry", (event): void => { types.push(event.type); });

    // No entity is registered under this key, so the shared wire message type is the only signal the lookup has.
    pushInfraredRFReceiveEvent(transport, { key: 0x7777, timings: [ 100, -200 ] });
    await delay(10);

    assert.deepEqual(types, ["radio_frequency"], "an unclaimed receive event must decode under the last schema in table order that declares the message type");
    client.disconnect();
  });

  test("a telemetry message without a key is silently dropped", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    let switchEvents = 0;

    client.on("switch", (): void => { switchEvents++; });
    // No key field present.
    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, encodeProtoFields([{ fieldNumber: 2, value: 1, wireType: WireType.VARINT }]));
    await delay(10);

    assert.equal(switchEvents, 0);
    client.disconnect();
  });

  test("a list-entities response with an unknown wire type is dropped with a warn log", async () => {

    const transport = new MockTransport();
    const log = makeLogCapture();
    const client = new EspHomeClient({ host: "test.local", logger: log.logger, reconnect: false, transportFactory: (): MockTransport => transport });

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    pushDeviceInfo(transport);
    await delay(2);
    // Push a list-entities-light response with no required fields - decodeEntityFromSchema should return undefined.
    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, encodeProtoFields([{ fieldNumber: 99, value: 0, wireType: WireType.VARINT }]));
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

    assert.equal(client.getEntitiesWithIds().length, 0);
    client.disconnect();
  });
});

describe("EspHomeClient.executeService argument encoding edge cases", () => {

  test("executeService with no args does not push a service request frame for unknown keys", () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const before = transport.outboundFrames.length;

    client.services.execute(99999, []);

    assert.equal(transport.outboundFrames.length, before);
    client.disconnect();
  });
});

// 22. util.inspect output.

describe("EspHomeClient util.inspect support", () => {

  test("util.inspect returns a structured summary, not a property dump", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const inspectFn = (client as unknown as Record<symbol, (depth: number, options: { stylize: (text: string, style: string) => string }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: (text: string, style: string) => string }) => string;
    const out = inspectFn.call(client, 2, { stylize: (s): string => s });

    assert.ok(out.includes("EspHomeClient"));
    assert.ok(out.includes("disconnected"));
  });

  test("util.inspect returns the short form at depth < 0", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const inspectFn = (client as unknown as Record<symbol, (depth: number, options: { stylize: (text: string, style: string) => string }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: (text: string, style: string) => string }) => string;
    const out = inspectFn.call(client, -1, { stylize: (s): string => s });

    assert.equal(out, "[EspHomeClient]");
  });

  test("util.inspect brackets an IPv6 host so the summary's host field stays readable", () => {

    const client = new EspHomeClient({ host: "2001:db8::5", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const inspectFn = (client as unknown as Record<symbol, (depth: number, options: { stylize: (text: string, style: string) => string }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: (text: string, style: string) => string }) => string;
    const out = inspectFn.call(client, 2, { stylize: (s): string => s });

    assert.ok(out.includes("[2001:db8::5]:6053"), "the inspect summary must bracket the IPv6 host, got: " + out);
  });

  test("isEncrypted getter returns false for plaintext-only sessions", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    assert.equal(client.isEncrypted, false);
    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    assert.equal(client.isEncrypted, false);
    client.disconnect();
  });
});

// Build a controllable clock the clock tests advance by hand. Mirrors heartbeat.test.ts's file-local `buildClock` shape (the heartbeat one is not exported), with an
// explicit return type. The origin is seeded at `Date.now()` by the caller (NOT 0/1000): a near-epoch origin is what gives the heartbeat-clock mutation check teeth -
// when the heartbeat thread is reverted, the scheduler reads real `Date.now` while the idle baseline is the injected seed, so `idleMs ~= 0` and no stall/ping fires,
// flipping the clock tests red. A small origin would let a reverted heartbeat read `Date.now (~1.7e12) - seed(small)` = huge and stall anyway, making the
// mutation-check vacuous.
function buildClock(initial: number): { advance: (deltaMs: number) => void; clock: ClockFn; set: (atMs: number) => void } {

  let now = initial;

  return {

    advance: (deltaMs: number): void => { now += deltaMs; },
    clock: (): number => now,
    set: (atMs: number): void => { now = atMs; }
  };
}

// 23. Clock option - live heartbeat stall / RTT / connect-timeout integration. These drive the heartbeat stall, ping RTT, and stall-recovery behaviors through the REAL
// EspHomeClient by injecting a controllable clock (the `clock` option) and firing the scheduler's `setInterval` tick synchronously via node:test `mock.timers`
// (setInterval only).
// The injected clock governs the idle/stall/RTT arithmetic; `mock.timers.tick(tickMs)` fires the supervisory tick the clock cannot drive; `transport.whenIdle()` settles
// pushed-inbound dispatch. The stall, ping-RTT, and idle-reset tests are anti-vacuity mutation-checked by reverting the client clock the constructor hands to
// `HeartbeatScheduler` (the origin = `Date.now()` makes that reversal detectable - each flips red). The consecutive-stall test is mutation-checked against the stall
// count's carry across the teardown and reconnect and its reset on inbound activity. The connect-timeout test asserts `connectTimeoutMs` / `AbortSignal.timeout`
// behavior that does not read the injected clock, so it is EXEMPT from the clock mutation-check.

describe("EspHomeClient clock option - live heartbeat stall / RTT / timeout integration", () => {

  // Heartbeat stall through the LIVE client -> teardown -> auto-reconnect, with a NEGATIVE CONTROL. The headline test: a budget-crossing idle window stalls the live
  // client, which tears down with a typed HeartbeatStalledError cause and schedules an auto-reconnect. The negative control (tick BEFORE advancing the clock -> no stall)
  // proves the seed and the tick share one clock, so a real stall is distinguished from a spurious seed/tick time-base mismatch.
  test("a budget-crossing heartbeat stall tears the live client down with a typed cause and schedules auto-reconnect (with a negative control)", async () => {

    const clock = buildClock(Date.now());
    const transport = new MockTransport();
    const healthStates: string[] = [];
    const lifecycleEvents: { cause?: EspHomeError; kind: string }[] = [];
    const disconnectReasons: (string | undefined)[] = [];
    const attemptDelays: number[] = [];
    const recordedMetrics: { name: string; value: number }[] = [];
    const metrics = {

      gauge: (name: string, value: number): void => { recordedMetrics.push({ name, value }); },
      increment: (name: string, by = 1): void => { recordedMetrics.push({ name, value: by }); },
      timing: (name: string, durationMs: number): void => { recordedMetrics.push({ name, value: durationMs }); }
    };
    const client = new EspHomeClient({

      clock: clock.clock,
      host: "test.local",
      keepAlive: { intervalMs: 30000, stallTimeoutMs: 60000 },
      logger: quietLogger(),
      metrics,
      reconnect: { initialDelayMs: 10, jitter: 0, onAttempt: (_attempt, delayMs): void => { attemptDelays.push(delayMs); } },
      transportFactory: (): MockTransport => transport
    });

    // Enable the setInterval mock BEFORE connect so the scheduler's `start()` setInterval is captured (MockTimers only intercepts a setInterval created while mocking is
    // active; enabling after connect would make `tick()` a silent no-op).
    mock.timers.enable({ apis: ["setInterval"] });

    try {

      client.on("healthChange", (h): void => { healthStates.push(h.state); });
      client.on("lifecycle", (e): void => { lifecycleEvents.push(e); });
      client.on("disconnect", (reason): void => { disconnectReasons.push(reason); });

      // Seeds lastActivityAtMs = connectedAtMs = clock() = the injected origin.
      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      // What a sub-API's host object reads on each health record after the connect: the stall publishes its stalled record while the session is still attached, and
      // tears the session down only after.
      const scopeReadings: string[] = [];

      assert.equal(serialScope(client).kind, "attached");
      client.on("healthChange", (h): void => {

        const scope = serialScope(client);

        scopeReadings.push(h.state + ":" + scope.kind + ((scope.kind === "attached") ? ":" + (scope.signal.aborted ? "aborted" : "live") : ""));
      });

      // Negative control: WITHOUT advancing the clock, fire the supervisory tick. idleMs ~= 0 < stallTimeoutMs, so no stall must fire and health stays CONNECTED. This is
      // the in-test guard that the seed and the tick share one clock.
      mock.timers.tick(15000);

      assert.ok(!healthStates.includes("stalled"), "negative control: an unadvanced clock must not stall the live client");
      assert.equal(client.health().state, "connected", "negative control: health must remain CONNECTED when the idle window has not elapsed");

      // Positive: advance past the stall budget (the boundary is `>=`, so exactly 60000 stalls) and fire the tick. The chain tick -> onStall -> disconnectInternal ->
      // emitDisconnected -> maybeScheduleReconnect -> runReconnectLoop runs synchronously to the first await (the backoff), so the post-tick assertions are synchronous.
      clock.advance(60000);
      mock.timers.tick(15000);

      assert.deepEqual(scopeReadings.slice(0, 2), [ "stalled:attached:live", "disconnected:none" ],
        "the stalled record must be published with the session still attached, and the next record with no connection attached");
      assert.deepEqual(healthStates, [ "connected", "stalled", "disconnected", "reconnecting" ],
        "the stall must transition health CONNECTED -> STALLED -> disconnected -> RECONNECTING synchronously within the tick");

      const disconnectEvent = lifecycleEvents.find((e) => e.kind === "disconnect");

      assert.ok(disconnectEvent, "the stall must emit a lifecycle disconnect");
      assert.ok(disconnectEvent.cause instanceof HeartbeatStalledError, "the lifecycle disconnect must carry a typed HeartbeatStalledError cause");
      assert.equal(disconnectEvent.cause.code, "HEARTBEAT_STALLED", "the typed cause must carry the HEARTBEAT_STALLED code");
      assert.ok(disconnectReasons.includes("heartbeat stalled"), "the legacy disconnect event must carry the 'heartbeat stalled' reason");
      assert.ok(attemptDelays.length > 0, "the stall teardown must schedule an auto-reconnect attempt");
      assert.ok(recordedMetrics.some((m) => m.name === "heartbeat.stalled"), "the stall must emit the heartbeat.stalled counter metric");

    } finally {

      client.disconnect();
      mock.timers.reset();
    }
  });

  // A consumer's healthChange listener runs inside the scheduler's timer tick when a stall fires. Its fault must be reported through the logger rather than escape the
  // tick, and the stall must still run its teardown.
  test("a healthChange listener that throws during a heartbeat stall is reported through the logger and the stall still tears the client down", async () => {

    const clock = buildClock(Date.now());
    const transport = new MockTransport();
    const warnings: unknown[][] = [];
    const listenerFault = new Error("Synthetic health-listener fault.");
    const client = new EspHomeClient({

      clock: clock.clock,
      host: "test.local",
      keepAlive: { intervalMs: 30000, stallTimeoutMs: 60000 },
      logger: { ...quietLogger(), warn: (...args: unknown[]): void => { warnings.push(args); } },
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    mock.timers.enable({ apis: ["setInterval"] });

    try {

      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      // The listener attaches after the connect, so its first throw is the stall's STALLED transition, raised from inside the scheduler's tick. It detaches when this
      // block exits, so the cleanup below runs without it however the assertions end.
      using _faulty = client.on("healthChange", (): void => { throw listenerFault; });

      clock.advance(60000);

      assert.doesNotThrow(() => { mock.timers.tick(15000); }, "a throwing health listener must not escape the heartbeat timer");
      assert.equal(client.health().state, "disconnected", "the stall must still tear the client down");
      assert.deepEqual(warnings.filter(([message]) => message === LISTENER_FAULT_WARNING), [
        [ LISTENER_FAULT_WARNING, { error: listenerFault, event: "healthChange" } ], [ LISTENER_FAULT_WARNING, { error: listenerFault, event: "healthChange" } ]
      ], "both health transitions the stall drives must report the listener's fault through the logger");

    } finally {

      client.disconnect();
      mock.timers.reset();
    }
  });

  // Ping RTT through the LIVE client. An idle tick past intervalMs (but short of the stall budget) sends a PING_REQUEST and stamps pingSentAt = clock(); the inbound
  // PING_RESPONSE consumes the RTT = clock() - pingSentAt inside the scheduler's clock (the HeartbeatScheduler clock injection). The RTT lands deterministically
  // as lastPingRttMs. The tested injection is the HeartbeatScheduler clock (NOT the connect.duration_ms clock read): without it the heartbeat reads Date.now while
  // the idle baseline is the injected seed, so idleMs ~= 0 < intervalMs and no ping fires; consumePingRtt then returns undefined, lastPingRttMs is never set, and
  // the test fails.
  test("an idle tick's PING_REQUEST/PING_RESPONSE round-trip lands a deterministic lastPingRttMs through the heartbeat clock", async () => {

    const clock = buildClock(Date.now());
    const transport = new MockTransport();
    const healthRtts: (number | undefined)[] = [];
    const recordedMetrics: { name: string; value: number }[] = [];
    const metrics = {

      gauge: (name: string, value: number): void => { recordedMetrics.push({ name, value }); },
      increment: (name: string, by = 1): void => { recordedMetrics.push({ name, value: by }); },
      timing: (name: string, durationMs: number): void => { recordedMetrics.push({ name, value: durationMs }); }
    };
    const client = new EspHomeClient({

      clock: clock.clock,
      host: "test.local",
      keepAlive: { intervalMs: 30000, stallTimeoutMs: 60000 },
      logger: quietLogger(),
      metrics,
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    mock.timers.enable({ apis: ["setInterval"] });

    try {

      client.on("healthChange", (h): void => { healthRtts.push(h.lastPingRttMs); });

      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      // Advance to the idle threshold (>= intervalMs, < stallTimeoutMs) and fire the tick: the scheduler sends a PING_REQUEST and stamps pingSentAt = clock().
      clock.advance(30000);
      mock.timers.tick(15000);

      assert.ok(transport.outboundFrames.some((f): boolean => f.type === MessageType.PING_REQUEST), "the idle tick must send a PING_REQUEST");

      // Advance the round-trip and deliver the PING_RESPONSE. The scheduler computes RTT = clock() - pingSentAt = 42.
      clock.advance(42);
      transport.pushInbound(MessageType.PING_RESPONSE, Buffer.alloc(0));
      await transport.whenIdle();

      assert.equal(client.health().lastPingRttMs, 42, "lastPingRttMs must be the deterministic injected-clock round-trip delta");
      assert.ok(healthRtts.includes(42), "a healthChange carrying the RTT must have fired");
      assert.ok(recordedMetrics.some((m) => (m.name === "heartbeat.rtt_ms") && (m.value === 42)), "the ping round-trip must emit heartbeat.rtt_ms with the RTT value");

    } finally {

      client.disconnect();
      mock.timers.reset();
    }
  });

  // Delayed-frame timing / stall recovery (idle reset), with a MANDATORY positive contrast. An inbound run-phase frame resets the idle window so a subsequent
  // sub-budget advance does NOT stall; the mandatory positive contrast (a budget-crossing advance from the recovered state DOES stall) proves the no-stall is not
  // vacuous - the tick mechanism is live and the earlier frame genuinely reset the idle window.
  test("an in-time inbound frame resets the idle window (no stall), and a later budget-crossing advance still stalls (positive contrast)", async () => {

    const clock = buildClock(Date.now());
    const transport = new MockTransport();
    const healthStates: string[] = [];
    const client = new EspHomeClient({

      clock: clock.clock,
      host: "test.local",
      keepAlive: { intervalMs: 30000, stallTimeoutMs: 60000 },
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    mock.timers.enable({ apis: ["setInterval"] });

    try {

      client.on("healthChange", (h): void => { healthStates.push(h.state); });

      await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

      const activityBefore = client.health().lastInboundActivityAt;

      // Recovery leg: advance most of the way to the stall budget, then deliver an inbound run-phase frame so stampInboundActivity resets lastActivityAtMs = clock(). The
      // stamp reads the injected clock, so the readback advances by the injected delta.
      clock.advance(50000);
      transport.pushInbound(MessageType.PING_RESPONSE, Buffer.alloc(0));
      await transport.whenIdle();

      assert.equal(client.health().lastInboundActivityAt, activityBefore + 50000, "the inbound frame must reset lastInboundActivityAt through the injected clock");

      // From the reset baseline, a sub-budget advance must NOT stall (the idle window was reset by the frame above).
      clock.advance(20000);
      mock.timers.tick(15000);

      assert.ok(!healthStates.includes("stalled"), "an in-time inbound frame must reset the idle window so a sub-budget advance does not stall");
      assert.equal(client.health().state, "connected", "health must remain CONNECTED after the idle reset");

      // Mandatory positive contrast: from the recovered state, a budget-crossing advance MUST stall - proving the tick mechanism is live and the no-stall above was not
      // vacuous.
      clock.advance(60000);
      mock.timers.tick(15000);

      assert.ok(healthStates.includes("stalled"), "a budget-crossing advance from the recovered state must still stall (the tick mechanism is live)");

    } finally {

      client.disconnect();
      mock.timers.reset();
    }
  });

  // The consecutive-stall count across stall-driven reconnects. A stall tears the session down, so the count has to survive the teardown and the reconnect to be
  // consecutive at all, and only the reconnected session's first inbound frame proves it live and resets the count. The reconnect handshakes arrive through the
  // setup-phase receiver rather than the run-phase activity tap, so they leave the count alone.
  test("the consecutive-stall count survives a stall-driven reconnect, reaches 2 on a second stall, and resets on inbound activity", async () => {

    const clock = buildClock(Date.now());
    const firstTransport = new MockTransport();
    const secondTransport = new MockTransport();
    const thirdTransport = new MockTransport();
    const transportQueue = [ firstTransport, secondTransport, thirdTransport ];
    const client = new EspHomeClient({

      clock: clock.clock,
      host: "test.local",
      keepAlive: { intervalMs: 30000, stallTimeoutMs: 60000 },
      logger: quietLogger(),
      reconnect: { initialDelayMs: 10, jitter: 0 },
      transportFactory: (): MockTransport => transportQueue.shift() ?? new MockTransport()
    });

    mock.timers.enable({ apis: ["setInterval"] });

    try {

      await driveConnect(firstTransport, client, { signal: AbortSignal.timeout(2000) });

      // First stall: the budget-crossing tick tears the session down and the supervisor enters its backoff.
      clock.advance(60000);
      mock.timers.tick(15000);

      assert.equal(client.health().state, "reconnecting", "the first stall must hand the connection to the reconnect supervisor");
      assert.equal(client.health().consecutiveStalls, 1, "the stall count must survive the teardown into the reconnecting record");

      // The backoff runs on real timers; once it has vended the second transport, answer the supervisor's own connect attempt and wait for it to complete.
      const firstReconnect = client.once("connect", { signal: AbortSignal.timeout(2000) });

      await delay(20);
      pushHandshake(secondTransport);
      await firstReconnect;

      assert.equal(client.health().state, "connected", "the supervisor must reconnect on the second transport");
      assert.equal(client.health().consecutiveStalls, 1, "the reconnected session must carry the count until inbound activity proves it live");

      // Second stall, with no run-phase traffic since the reconnect.
      clock.advance(60000);
      mock.timers.tick(15000);

      assert.equal(client.health().consecutiveStalls, 2, "a second stall before any inbound activity must count consecutively");

      const secondReconnect = client.once("connect", { signal: AbortSignal.timeout(2000) });

      await delay(20);
      pushHandshake(thirdTransport);
      await secondReconnect;

      assert.equal(client.health().consecutiveStalls, 2, "the second reconnect must carry the count as well");

      const stallCounts: number[] = [];

      client.on("healthChange", (health): void => { stallCounts.push(health.consecutiveStalls); });

      // The first run-phase frame on the reconnected session proves it live.
      thirdTransport.pushInbound(MessageType.PING_RESPONSE, PING_RESPONSE_PAYLOAD);
      await thirdTransport.whenIdle();

      assert.equal(client.health().consecutiveStalls, 0, "inbound activity must reset the stall count");
      assert.deepEqual(stallCounts, [0], "the reset must be broadcast once through healthChange");

    } finally {

      client.disconnect();
      mock.timers.reset();
    }
  });

  // connectTimeoutMs as the sole/binding bound. Asserts AbortSignal.timeout behavior, NOT the clock option: no injected clock, no
  // mock.timers, and EXEMPT from the clock mutation-check. With a small real connectTimeoutMs (50) and the default larger handshakeTimeoutMs (5000), withholding every
  // handshake response makes the overall connect timeout win. Its anti-vacuity is the timing: the rejection arrives near connectTimeoutMs (~50 ms), NOT near
  // handshakeTimeoutMs (~5000 ms) - that timing IS the proof connectTimeoutMs is the binding bound.
  test("connectTimeoutMs is the binding connect bound and rejects with its own TimeoutError (no injected clock)", async (t) => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      connectTimeoutMs: 50,
      host: "test.local",
      logger: quietLogger(),
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    try {

      const startedAt = Date.now();

      // Withhold every handshake response: never push HELLO_RESPONSE. The overall connectTimeoutMs (50 ms), the first timeout the connect builds, fires before the
      // default handshakeTimeoutMs (5000 ms), and the connect rejects with that bound's own TimeoutError.
      const captured = captureTimeoutSignals(t);

      await assert.rejects(client.connect(), (err: unknown): boolean => err === captured[0]?.reason);

      const elapsed = Date.now() - startedAt;

      // Anti-vacuity: the rejection arrives near connectTimeoutMs (~50 ms), NOT near handshakeTimeoutMs (~5000 ms). The generous ceiling keeps the timing assertion
      // robust on a loaded CI runner while still proving the 50 ms arm - not the 5000 ms arm - is the binding bound.
      assert.ok(elapsed < 2000, "the rejection must arrive near connectTimeoutMs (50 ms), not near the 5000 ms handshakeTimeoutMs; observed " + String(elapsed) + " ms");

    } finally {

      client.disconnect();
    }
  });
});
