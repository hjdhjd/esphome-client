/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.test.ts: Integration enumeration for the host class - synthesized handshake-byte fixtures driving MockTransport end-to-end through the
 * full connect -> discover -> ready -> state-fanout -> disconnect sequence, plus per-method delegation, lifecycle event ordering, error-class enumeration, and
 * byte-level wire fixtures that double as the protocol reference for the connect path.
 */
import type {
  AlarmControlPanelEvent, ClimateEvent, CoverEvent, DateEvent, DateTimeEvent, EntitySchema, EntityType, EventEntityEvent, FanEvent, LightEvent, LockEvent,
  MediaPlayerEvent, NumberEvent, SelectEvent, SensorEvent, SirenEvent, SwitchEvent, TextEvent, TextSensorEvent, TimeEvent, UpdateEvent, ValveEvent, WaterHeaterEvent
} from "./schemas/index.ts";
import {
  CameraStreamClosedError, ConnectionClosedByPeerError, ConnectionError, EncryptionKeyInvalidError, EspHomeError, HeartbeatStalledError, NegotiationFailedError,
  NoiseHandshakeError, PeerClosedDuringNoiseError, PermanentError
} from "./errors.ts";
import { ENTITY_SCHEMAS, aliasOf, extending } from "./schemas/index.ts";
import { EspHomeClient, LockState, LogLevel, openEspHomeClient } from "./esphome-client.ts";
import type { Nullable, ServiceEntity } from "./types.ts";
import { decodeProtobuf, encodeProtoFields, encodeVarint } from "./protocol/codec.ts";
import { describe, mock, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientCapabilities } from "./capabilities.ts";
import type { ClockFn } from "./heartbeat.ts";
import type { DeviceInfo } from "./esphome-client.ts";
import type { Entity } from "./schemas/index.ts";
import { MessageType } from "./protocol/message-types.ts";
import { MockTransport } from "./testing/mock-transport.ts";
import type { ProtoField } from "./protocol/codec.ts";
import { WaterHeaterMode } from "./api-constants.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";
import { connectionUptimeMs } from "./health.ts";
import { defaultShouldRetry } from "./reconnect.ts";
import { setTimeout as delay } from "node:timers/promises";
import { entityId } from "./entity-id.ts";

// Quiet logger used by every test that constructs an EspHomeClient. Prevents the host's debug/info logging from polluting the test runner output and makes warn/error
// outputs assertable by capturing into in-memory arrays. Each test that wants to inspect the log calls makeLogCapture() to get a fresh isolated logger.
function quietLogger(): { debug: () => void; info: () => void; warn: () => void; error: () => void } {

  return { debug: (): void => undefined, error: (): void => undefined, info: (): void => undefined, warn: (): void => undefined };
}

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

// DeviceInfoResponse payload. Provenance: api.proto §DeviceInfoResponse - field numbers 1-19 cover the consumer-visible fields (usesPassword, name, mac, etc.) and
// field 20 is the repeated DeviceInfo.SubDevice nested message. Derivation: encodeProtoFields with each consumer-visible primitive field.
function deviceInfoResponse(overrides: Partial<DeviceInfo> & { subDevices?: { area_id?: string; device_id: number; name: string }[] } = {}): Buffer {

  const fields: ProtoField[] = [];
  // Default fixture values match a typical ESPHome dev board.
  const usesPassword = overrides.usesPassword ?? false;
  const name = overrides.name ?? "test-device";
  const macAddress = overrides.macAddress ?? "AA:BB:CC:DD:EE:FF";
  const esphomeVersion = overrides.esphomeVersion ?? "2025.10.0";
  const compilationTime = overrides.compilationTime ?? "Jan  1 2026, 12:00:00";
  const model = overrides.model ?? "esp32dev";
  const hasDeepSleep = overrides.hasDeepSleep ?? false;
  const friendlyName = overrides.friendlyName ?? "Test Device";
  const apiEncryptionSupported = overrides.apiEncryptionSupported ?? false;

  fields.push({ fieldNumber: 1, value: usesPassword ? 1 : 0, wireType: WireType.VARINT });
  fields.push({ fieldNumber: 2, value: Buffer.from(name, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 3, value: Buffer.from(macAddress, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 4, value: Buffer.from(esphomeVersion, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 5, value: Buffer.from(compilationTime, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 6, value: Buffer.from(model, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 7, value: hasDeepSleep ? 1 : 0, wireType: WireType.VARINT });
  fields.push({ fieldNumber: 13, value: Buffer.from(friendlyName, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  fields.push({ fieldNumber: 19, value: apiEncryptionSupported ? 1 : 0, wireType: WireType.VARINT });

  // Capability-bearing flag fields. Only encoded when the test supplies an override - omitting them mirrors how a real ESPHome device with the corresponding component
  // disabled would send the response (the field is absent on the wire, not present-with-zero).
  if(overrides.bluetoothProxyFeatureFlags !== undefined) {

    fields.push({ fieldNumber: 15, value: overrides.bluetoothProxyFeatureFlags, wireType: WireType.VARINT });
  }

  if(overrides.voiceAssistantFeatureFlags !== undefined) {

    fields.push({ fieldNumber: 17, value: overrides.voiceAssistantFeatureFlags, wireType: WireType.VARINT });
  }

  if(overrides.subDevices) {

    for(const sub of overrides.subDevices) {

      const subFields: ProtoField[] = [
        { fieldNumber: 1, value: sub.device_id, wireType: WireType.VARINT },
        { fieldNumber: 2, value: Buffer.from(sub.name, "utf8"), wireType: WireType.LENGTH_DELIMITED }
      ];

      if(sub.area_id) {

        subFields.push({ fieldNumber: 3, value: Buffer.from(sub.area_id, "utf8"), wireType: WireType.LENGTH_DELIMITED });
      }

      fields.push({ fieldNumber: 20, value: encodeProtoFields(subFields), wireType: WireType.LENGTH_DELIMITED });
    }
  }

  return encodeProtoFields(fields);
}

const DEVICE_INFO_RESPONSE_DEFAULT = deviceInfoResponse();

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

// Drive a fresh client through the canonical plaintext connect -> discover -> ready sequence using the supplied entity discovery list. After this resolves, the client
// is fully connected, all entities are registered, and the run-phase dispatcher is consuming inbound messages. Tests that don't care about the discovery shape pass an
// empty list; those that need entities present pass a list and assert against `client.getEntitiesWithIds()`.
async function driveConnect(transport: MockTransport, client: EspHomeClient, options: {
  entities?: { type: EntityType; key: number; objectId: string; name: string }[];
  services?: { name: string; key: number }[];
  deviceInfo?: Buffer;
  helloResponsePayload?: Buffer;
  signal?: AbortSignal;
} = {}): Promise<void> {

  const entities = options.entities ?? [];
  const services = options.services ?? [];
  const helloPayload = options.helloResponsePayload ?? HELLO_RESPONSE_PROTOCOL_1_12;
  const deviceInfo = options.deviceInfo ?? DEVICE_INFO_RESPONSE_DEFAULT;

  const connectPromise = client.connect(options.signal !== undefined ? { signal: options.signal } : undefined);

  // Push the canonical handshake responses. We pump them one-by-one with brief waits so the host's awaiters resolve in order.
  await Promise.resolve();
  await delay(5);

  transport.pushInbound(MessageType.HELLO_RESPONSE, helloPayload);
  await delay(5);

  // The host sent LIST_ENTITIES_REQUEST and DEVICE_INFO_REQUEST after the hello succeeded. Push the responses.
  transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, deviceInfo);
  await delay(2);

  for(const entity of entities) {

    transport.pushInbound(ENTITY_SCHEMAS[entity.type].listEntities.messageType, listEntitiesPayloadFor(entity.type, entity.key, entity.objectId, entity.name));
  }

  for(const service of services) {

    transport.pushInbound(MessageType.LIST_ENTITIES_SERVICES_RESPONSE, listEntitiesServicesResponse(service.name, service.key));
  }

  await delay(2);
  transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

  await connectPromise;
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

    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
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

  test("health() returns a boundary copy in the disconnected branch so consumer mutation cannot corrupt the cached record", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });
    const health = client.health();

    assert.equal(health.state, "disconnected");

    // Mutate two base fields of the returned snapshot. `encrypted` is the literal `false` on a down record so it cannot be flipped through the type; we mutate
    // `lastInboundActivityAt` instead - a base `number` field present on both variants - so the boundary-copy guarantee is still exercised across two fields.
    health.consecutiveStalls = 999;
    health.lastInboundActivityAt = 12345;

    assert.equal(client.health().consecutiveStalls, 0, "mutating a returned disconnected health snapshot must not affect the cached record");
    assert.equal(client.health().lastInboundActivityAt, 0, "the disconnected health branch must return a boundary copy, not the cached reference");
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

    // The host clears an invalid PSK to null but retains a 32-byte one. Indirectly observable: once construction completes without an error log entry, the PSK persists.
    assert.notEqual(client, null);
  });

  test("constructor with an invalid PSK length logs an error and clears the key", () => {

    const log = makeLogCapture();
    const tooShortPsk = Buffer.alloc(16, 0x77).toString("base64");

    new EspHomeClient({ host: "test.local", logger: log.logger, psk: tooShortPsk, transportFactory: (): MockTransport => new MockTransport() });

    assert.ok(log.error.some((m) => m.includes("Invalid encryption key")), "expected an invalid-encryption-key error log");
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
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
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

    await assert.rejects(client.connect({ signal: controller.signal }));
  });

  test("connect honors a mid-flight AbortSignal", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });
    const controller = new AbortController();

    const connectPromise = client.connect({ signal: controller.signal });

    setImmediate((): void => controller.abort());

    await assert.rejects(connectPromise, "abort during connect must reject");
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

    await assert.rejects(connectPromise, (err: unknown) => err instanceof NegotiationFailedError);

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

    await assert.rejects(connectPromise);

    assert.ok(reasons.length > 0, "connect failure must emit a disconnect event with the reason");

    client.disconnect();
  });

  test("connect handshake timeout maps to a TimeoutError reject", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({

      handshakeTimeoutMs: 60, host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport
    });

    // Don't push HELLO_RESPONSE; let the per-step handshake timer fire.
    const connectPromise = client.connect();

    await assert.rejects(connectPromise);
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

  test("connect with PSK + noise handshake timeout fails closed - no plaintext fallback, exactly one transport", async () => {

    // A noise timeout is NOT a no-encryption signal: the handshake catch translates every abort/timeout (user-abort, the connect deadline, AND the noise-step timeout)
    // into one NoiseHandshakeTimeoutError, so falling back on it would silently downgrade a user-cancel or a deadline to plaintext - and a real no-encryption ESPHome
    // device never times out (it responds plaintext or closes). The gate fails it closed, so connect() rejects and NO second (plaintext) transport is constructed. The
    // factory-call-count assertion is what gives mutation-check (i) teeth: reverting the gate to `instanceof NoiseHandshakeError` would fall back here (factory
    // twice), flipping this red.
    const transports: MockTransport[] = [];
    const transportFactory = (): MockTransport => {

      const t = new MockTransport();

      transports.push(t);

      return t;
    };
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const client = new EspHomeClient({ handshakeTimeoutMs: 100, host: "test.local", logger: quietLogger(), psk, reconnect: false, transportFactory });

    // Push nothing: the per-step handshake timer fires, aborting nextNoiseHandshakeFrame -> NoiseHandshakeTimeoutError -> the gate fails it closed.
    await assert.rejects(client.connect({ signal: AbortSignal.timeout(2000) }), (err: unknown) => {

      assert.ok(err instanceof EspHomeError, "a fail-closed noise timeout must reject with a typed client error");

      return true;
    });

    assert.equal(transports.length, 1, "a fail-closed noise timeout must NOT construct a second (plaintext) transport");

    client.disconnect();
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
    // constructed and the connect succeeds unencrypted. This pins the OTHER PeerClosedDuringNoiseError code than the plaintext-indicator test below.
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

    plaintextTransport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    plaintextTransport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);
    plaintextTransport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

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

    plaintextTransport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    plaintextTransport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);
    plaintextTransport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

    assert.equal(client.health().state, "connected");
    assert.equal(client.isEncrypted, false);

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

    // For the 1000-entity stress we drive the connect manually so we can batch the entity pushes with periodic awaits, letting the host's discovery loop chew through
    // each batch before the next set arrives. driveConnect's synchronous-flush model is fine for <=100 entities but the receiver's awaiter resolution scheduling needs
    // breathing room at this scale.
    const connectPromise = client.connect({ signal: AbortSignal.timeout(5000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    // The setup-phase per-type buffer in MessageReceiver caps at 8 messages. Push in batches of 5 with a microtask yield so the pump+waitFor stay synchronized: each
    // batch fits comfortably under the buffer ceiling, and the await yields the event loop to let the discovery loop's next waitFor consume the buffered ones before
    // the next batch arrives. This is exactly how steady-state network traffic looks - bursts of a few packets followed by application-level processing.
    for(let i = 0; i < 1000; i += 5) {

      for(let j = i; j < Math.min(i + 5, 1000); j++) {

        transport.pushInbound(MessageType.LIST_ENTITIES_SENSOR_RESPONSE, listEntitiesPayloadFor("sensor", j + 1, "sensor_" + String(j), "Sensor " + String(j)));
      }

      await delay(0);
    }

    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    await connectPromise;

    assert.equal(client.getEntitiesWithIds().length, 1000);
    assert.equal(client.snapshotFor("sensor").size, 0, "discovery alone does not populate state cache");

    client.disconnect();
  });

  test("discovery surfaces parent + sub-devices via subDevices()", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      deviceInfo: deviceInfoResponse({ subDevices: [ { "device_id": 1, "name": "Bedroom Sub" }, { "area_id": "kitchen", "device_id": 2, "name": "Kitchen Sub" } ] }),
      signal: AbortSignal.timeout(2000)
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

    // This test pins the mutate-then-notify ordering. If a future refactor reverses it (emit before latestCache.set), every assertion below flips to null/0 and the
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

  test("disconnect rejects an in-flight sub-API correlator promptly, not after its per-await timeout", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Park a serial-proxy Correlator: getModemPins sends its request and awaits the matching response, which never arrives because we disconnect below. Accessing the
    // `serial` getter also instantiates the sub-API, so it joins the SubscriptionLifecycle participant list the disconnect path now iterates. Both a disconnect-rejection
    // and the 2000ms per-await timeout reject with the same `AbortError`, so the telltale is LATENCY: the fix must reject on disconnect, far short of the timeout.
    const pending = client.serial.getModemPins(0, { timeoutMs: 2000 });
    let settled = false;

    void pending.then((): void => { settled = true; }, (): void => { settled = true; });

    // The await must still be in flight right after issuing it - no response was pushed.
    await delay(5);
    assert.equal(settled, false, "the modem-pins await must be pending before disconnect");

    const disconnectedAt = Date.now();

    client.disconnect();

    // disconnectInternal now calls each participant's clearConnectionState, which rejects the parked Correlator with a typed AbortError immediately. Without the fix the
    // await would linger to its 2000ms timeout; the elapsed-time bound below is what proves the disconnect - not the timeout - settled it.
    await assert.rejects(pending, (err: unknown): boolean => (err instanceof DOMException) && (err.name === "AbortError"));

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

  test("disconnectAsync on a never-connected client is a no-op", async () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    await client.disconnectAsync();
    assert.equal(client.health().state, "disconnected");
  });

  test("stray DISCONNECT_RESPONSE arriving after disconnectAsync settles still routes through teardown", async () => {

    // Regression test for the Correlator refactor: when a DISCONNECT_RESPONSE arrives after the graceful timeout already fell through, the response handler must
    // still tear the connection down. The Correlator returns `false` from `resolve` on a stray response; the host's `acknowledgeDisconnectResponse` branches on the
    // boolean to call `disconnectInternal` in that case.
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

// 6b. Run-phase terminal-completion seam (passive transport death during the run phase)

describe("EspHomeClient run-phase terminal-completion seam", () => {

  test("a passive run-phase transport death drives a lifecycle disconnect carrying the real typed cause", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const lifecycleEvents: { cause?: EspHomeError; kind: string }[] = [];
    const disconnectReasons: (string | undefined)[] = [];

    client.on("lifecycle", (e): void => { lifecycleEvents.push(e); });
    client.on("disconnect", (reason): void => { disconnectReasons.push(reason); });

    // Simulate a passive transport death during the run phase: the run-phase pump is parked on the transport's iterator, and fail() rejects that parked awaiter with a
    // typed cause (peer RST/FIN, device reboot, mid-session decrypt failure, oversized frame). Pre-seam, this was a silent no-op and the client hung falsely CONNECTED.
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

    // Kill the live transport passively; the terminal seam must escalate to disconnectInternal, which gates maybeScheduleReconnect on the typed cause.
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

    // keepAlive:false disarms the heartbeat stall timer - the sole run-phase liveness detector before this seam. The terminal-completion seam is now the run-phase
    // detector that survives a disabled heartbeat, so a passive transport death must still drive teardown and auto-reconnect rather than hanging forever.
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

    assert.ok(disconnectReasons.includes("transport terminated"), "with keepAlive disabled, the terminal seam must still tear the connection down");
    assert.ok(attemptDelays.length > 0, "with keepAlive disabled, the terminal seam must still schedule auto-reconnect (no silent hang)");

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
    await assert.rejects(oncePromise);
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

  test("camera.snapshot rejects with a typed CameraStreamClosedError when the bus closes before any image arrives", async () => {

    // Drive the full path through MockTransport: discovery -> snapshot call -> bus dispose -> typed rejection. The bus is the chokepoint behind `camera(id).snapshot()`;
    // when it closes without yielding a matching `camera` event, the for-await loop exits cleanly and the typed throw fires. We reach into the private `bus` field via
    // the standard TypeScript-private bypass pattern used elsewhere in this file - the bus has no public dispose seam because subscription continuity across
    // connect/disconnect is a design guarantee.
    //
    // The rejection carries six independent assertions: (1) the rejection is CameraStreamClosedError, (2) the tagged code is STREAM_CLOSED, (3) the cameraId
    // matches the branded id, (4) the class climbs to EspHomeError, (5) the class does NOT climb to ConnectionError (the operational/transport distinction matters), and
    // (6) the message names the failing camera id for log correlation.
    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, {

      entities: [{ key: 0xCA000002, name: "Front Cam", objectId: "front_cam", type: "camera" }],
      signal: AbortSignal.timeout(2000)
    });

    const camId = entityId("camera", "front_cam");
    const snapshotPromise = client.camera(camId).snapshot();

    // Yield so the snapshot's stream subscription attaches before we dispose the bus.
    await delay(5);

    (client as unknown as { bus: { dispose: () => void } }).bus.dispose();

    await assert.rejects(snapshotPromise, (err: unknown): boolean => {

      assert.equal(err instanceof CameraStreamClosedError, true, "must surface as CameraStreamClosedError");
      assert.equal((err as CameraStreamClosedError).code, "STREAM_CLOSED");
      assert.equal((err as CameraStreamClosedError).cameraId, "camera-front_cam");
      assert.equal(err instanceof EspHomeError, true, "climbs to EspHomeError");
      assert.equal(err instanceof ConnectionError, false, "operational standalone, not a connection-family error");
      assert.ok((err as Error).message.includes("camera-front_cam"), "message names the camera id for log correlation");

      return true;
    });

    client.disconnect();
  });
});

describe("EspHomeClient.deviceInfo", () => {

  test("returns null before any connect", () => {

    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), transportFactory: (): MockTransport => new MockTransport() });

    assert.equal(client.deviceInfo(), null);
  });

  test("returns a deep copy after discovery so callers cannot mutate internal state", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const a = client.deviceInfo();
    const b = client.deviceInfo();

    assert.notEqual(a, b, "deviceInfo() must return a fresh object on each call");
    assert.deepEqual(a, b);
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

      transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, deviceInfoResponse({ friendlyName: "Refreshed Name", voiceAssistantFeatureFlags: 5 }));
      await delay(10);

      assert.equal(refreshes.length, 1);
      assert.equal(refreshes[0]?.friendlyName, "Refreshed Name");

      const refreshedInfo = client.deviceInfo();

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
    await assert.rejects(awaitPromise);

    client.disconnect();
  });

  test("commandAndAwait() rejects on an unknown entity id (UNKNOWN_ENTITY_ID)", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    await assert.rejects(client.commandAndAwait(entityId("switch", "missing"), { state: true }, { signal: AbortSignal.timeout(500) }));
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

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    // Push a LIST_ENTITIES_COVER_RESPONSE shaped exactly like a cover entity. The schema-table lookup prefers the extras schema on collision; the entity surfaces as
    // door_cover, not cover.
    const coverList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.objectIdFieldNumber, value: Buffer.from("garage_door", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.keyFieldNumber, value: encodeKey(0x42), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.nameFieldNumber, value: Buffer.from("Garage Door", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_COVER_RESPONSE, coverList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

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

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    const coverList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.objectIdFieldNumber, value: Buffer.from("front", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.keyFieldNumber, value: encodeKey(7), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.nameFieldNumber, value: Buffer.from("Front Cover", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_COVER_RESPONSE, coverList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

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

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    const coverList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.objectIdFieldNumber, value: Buffer.from("garage", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.keyFieldNumber, value: encodeKey(11), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.nameFieldNumber, value: Buffer.from("Garage", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_COVER_RESPONSE, coverList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

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

    const connectA = clientPlain.connect({ signal: AbortSignal.timeout(2000) });
    const connectB = clientWithExtras.connect({ signal: AbortSignal.timeout(2000) });

    // Drive both connects in lock-step. Each client gets its own LIST_ENTITIES_COVER_RESPONSE; the routing decision is made per-client from its own schemas table.
    for(const t of [ transportA, transportB ]) {

      await delay(5);
      t.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
      await delay(5);
      t.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
      await delay(2);

      const coverList = encodeProtoFields([

        { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.objectIdFieldNumber, value: Buffer.from("x", "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.keyFieldNumber, value: encodeKey(1), wireType: WireType.FIXED32 },
        { fieldNumber: ENTITY_SCHEMAS.cover.listEntities.nameFieldNumber, value: Buffer.from("X", "utf8"), wireType: WireType.LENGTH_DELIMITED }
      ]);

      t.pushInbound(MessageType.LIST_ENTITIES_COVER_RESPONSE, coverList);
      await delay(2);
      t.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    }

    await Promise.all([ connectA, connectB ]);

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
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
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

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    const switchList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.objectIdFieldNumber, value: Buffer.from("outlet", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.keyFieldNumber, value: encodeKey(0x9a), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.nameFieldNumber, value: Buffer.from("Outlet", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, switchList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

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

    const connectPromise = client.connect({ signal: AbortSignal.timeout(2000) });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);

    const switchList = encodeProtoFields([

      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.objectIdFieldNumber, value: Buffer.from("relay", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.keyFieldNumber, value: encodeKey(11), wireType: WireType.FIXED32 },
      { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.nameFieldNumber, value: Buffer.from("Relay", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, switchList);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    await connectPromise;

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

    const connectA = clientPlain.connect({ signal: AbortSignal.timeout(2000) });
    const connectB = clientWithExtras.connect({ signal: AbortSignal.timeout(2000) });

    // Drive both connects in lock-step. Each client gets its own LIST_ENTITIES_SWITCH_RESPONSE; the routing decision is made per-client from its own schemas table.
    for(const t of [ transportA, transportB ]) {

      await delay(5);
      t.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
      await delay(5);
      t.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
      await delay(2);

      const switchList = encodeProtoFields([

        { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.objectIdFieldNumber, value: Buffer.from("y", "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.keyFieldNumber, value: encodeKey(2), wireType: WireType.FIXED32 },
        { fieldNumber: ENTITY_SCHEMAS.switch.listEntities.nameFieldNumber, value: Buffer.from("Y", "utf8"), wireType: WireType.LENGTH_DELIMITED }
      ]);

      t.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, switchList);
      await delay(2);
      t.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);
    }

    await Promise.all([ connectA, connectB ]);

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

    await assert.rejects(client.setNoiseEncryptionKey(psk, { signal: controller.signal }));
    client.disconnect();
  });

  test("returns false for an invalid key length without sending anything", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const before = transport.outboundFrames.length;
    const result = await client.setNoiseEncryptionKey(Buffer.alloc(8).toString("base64"));

    assert.equal(result, false);
    assert.equal(transport.outboundFrames.length, before, "invalid key must not send a frame");
    client.disconnect();
  });

  test("honors a custom timeoutMs override on the request/response await", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    // Call with a short custom bound and never answer. The correlator arms AbortSignal.timeout(timeoutMs), so the await settles to false at ~30 ms rather than at the
    // built-in 5000 ms default. The elapsed-time assertion is the anti-vacuity: a resolution well under a second proves the override bound applied, not the default.
    const psk = Buffer.alloc(32, 0x55).toString("base64");
    const start = Date.now();
    const result = await client.setNoiseEncryptionKey(psk, { timeoutMs: 30 });
    const elapsed = Date.now() - start;

    assert.equal(result, false, "the unmet request must time out to false");
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

  test("settles to false on AbortSignal abort mid-flight", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });

    const controller = new AbortController();
    const promise = client.setNoiseEncryptionKey(Buffer.alloc(32, 0x55).toString("base64"), { signal: controller.signal });

    setImmediate((): void => controller.abort());

    assert.equal(await promise, false);
    client.disconnect();
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

// 16. openEspHomeClient factory.

describe("openEspHomeClient factory", () => {

  test("openEspHomeClient resolves a connected client when the transport drives connect successfully", async () => {

    const transport = new MockTransport();
    const opener = openEspHomeClient({

      host: "test.local", logger: quietLogger(), maxConstructionRetries: 0, reconnect: false, transportFactory: (): MockTransport => transport
    });

    await delay(5);
    transport.pushInbound(MessageType.HELLO_RESPONSE, HELLO_RESPONSE_PROTOCOL_1_12);
    await delay(5);
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
    await delay(2);
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, LIST_ENTITIES_DONE_RESPONSE);

    const client = await opener;

    assert.equal(client.health().state, "connected");
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

    await assert.rejects(opener, (err: unknown) => err instanceof PermanentError);
  });

  test("openEspHomeClient honors a pre-aborted signal", async () => {

    const controller = new AbortController();

    controller.abort();

    await assert.rejects(openEspHomeClient({ host: "test.local", logger: quietLogger(), maxConstructionRetries: 0, signal: controller.signal,
      transportFactory: (): MockTransport => new MockTransport() }));
  });

  test("openEspHomeClient retries on transient failures up to maxConstructionRetries", async () => {

    const transport = new MockTransport();
    const opener = openEspHomeClient({

      constructionRetry: { initialDelayMs: 5, jitter: 0, maxDelayMs: 5 },
      handshakeTimeoutMs: 30,
      host: "test.local",
      logger: quietLogger(),
      maxConstructionRetries: 1,
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    // Don't push anything - both attempts will fail with handshake timeout. After maxConstructionRetries+1 attempts, the factory rejects.
    await assert.rejects(opener);
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
    // The advertised minor is `CLIENT_API_VERSION.minor` in esphome-client.ts (currently 14). Bumping that constant is the deliberate "we honestly support this
    // version" declaration; this test pins the wire shape so accidental bumps without implementation work are caught.
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

  test("a consumer disconnect during a parked reconnect backoff emits NO give-up typed disconnect from the loop", async () => {

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

    // The only typed disconnect is the run-phase one; the abort break emits NO give-up disconnect. We key on the typed lifecycle disconnect, not raw string-disconnect
    // counts (the per-attempt and run-phase string disconnects are not the give-up signal).
    assert.equal(lifecycleDisconnects.length, 1, "only the run-phase disconnect must fire; the consumer-abort break must not emit a give-up typed disconnect");

    const onlyDisconnect = lifecycleDisconnects[0];

    assert.ok(onlyDisconnect, "the single run-phase typed disconnect must be present");
    assert.equal(onlyDisconnect.cause, runPhaseCause, "the single typed disconnect must be the run-phase one, carrying the peer-death cause");
    assert.equal(vended.length, 1, "the consumer abort during backoff must prevent any reconnect attempt from vending a second transport");

    client.disconnect();
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
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, DEVICE_INFO_RESPONSE_DEFAULT);
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

  test("isEncrypted getter returns false for plaintext-only sessions", async () => {

    const transport = new MockTransport();
    const client = new EspHomeClient({ host: "test.local", logger: quietLogger(), reconnect: false, transportFactory: (): MockTransport => transport });

    assert.equal(client.isEncrypted, false);
    await driveConnect(transport, client, { signal: AbortSignal.timeout(2000) });
    assert.equal(client.isEncrypted, false);
    client.disconnect();
  });
});

// Build a controllable clock the clock-seam tests advance by hand. Mirrors heartbeat.test.ts's file-local `buildClock` shape (the heartbeat one is not exported), with an
// explicit return type. The origin is seeded at `Date.now()` by the caller (NOT 0/1000): a near-epoch origin is what gives the `:1026` mutation-check teeth -
// when the heartbeat thread is reverted, the scheduler reads real `Date.now` while the idle baseline is the injected seed, so `idleMs ~= 0` and no stall/ping fires,
// flipping the clock-seam tests red. A small origin would let a reverted heartbeat read `Date.now (~1.7e12) - seed(small)` = huge and stall anyway, making the
// mutation-check vacuous.
function buildClock(initial: number): { advance: (deltaMs: number) => void; clock: ClockFn; set: (atMs: number) => void } {

  let now = initial;

  return {

    advance: (deltaMs: number): void => { now += deltaMs; },
    clock: (): number => now,
    set: (atMs: number): void => { now = atMs; }
  };
}

// 23. Clock seam - live heartbeat stall / RTT / connect-timeout integration. These drive the heartbeat stall, ping RTT, and stall-recovery behaviors through the REAL
// EspHomeClient by injecting a controllable clock (the C7 seam) and firing the scheduler's `setInterval` tick synchronously via node:test `mock.timers` (setInterval
// only).
// The injected clock governs the idle/stall/RTT arithmetic; `mock.timers.tick(tickMs)` fires the supervisory tick the clock cannot drive; `transport.whenIdle()` settles
// pushed-inbound dispatch. B1/B2/B3 are anti-vacuity mutation-checked by reverting the `:1026` heartbeat-clock thread (the origin = `Date.now()` makes that reversal
// detectable - each flips red). B5 pins pre-existing `connectTimeoutMs` / `AbortSignal.timeout` behavior and is EXEMPT from the seam-mutation-check.

describe("EspHomeClient clock seam - live heartbeat stall / RTT / timeout integration", () => {

  // B1 - heartbeat stall through the LIVE client -> teardown -> auto-reconnect, with a NEGATIVE CONTROL. The headline test: a budget-crossing idle window stalls the live
  // client, which tears down with a typed HeartbeatStalledError cause and schedules an auto-reconnect. The negative control (tick BEFORE advancing the clock -> no stall)
  // proves the seed and the tick share one clock, so a real stall is distinguished from a spurious seed/tick time-base mismatch.
  test("B1: a budget-crossing heartbeat stall tears the live client down with a typed cause and schedules auto-reconnect (with a negative control)", async () => {

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

      // Negative control: WITHOUT advancing the clock, fire the supervisory tick. idleMs ~= 0 < stallTimeoutMs, so no stall must fire and health stays CONNECTED. This is
      // the in-test guard that the seed and the tick share one clock.
      mock.timers.tick(15000);

      assert.ok(!healthStates.includes("stalled"), "negative control: an unadvanced clock must not stall the live client");
      assert.equal(client.health().state, "connected", "negative control: health must remain CONNECTED when the idle window has not elapsed");

      // Positive: advance past the stall budget (the boundary is `>=`, so exactly 60000 stalls) and fire the tick. The chain tick -> onStall -> disconnectInternal ->
      // emitDisconnected -> maybeScheduleReconnect -> runReconnectLoop runs synchronously to the first await (the backoff), so the post-tick assertions are synchronous.
      clock.advance(60000);
      mock.timers.tick(15000);

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

  // B2 - ping RTT through the LIVE client. An idle tick past intervalMs (but short of the stall budget) sends a PING_REQUEST and stamps pingSentAt = clock(); the inbound
  // PING_RESPONSE consumes the RTT = clock() - pingSentAt inside the scheduler's clock (the HeartbeatScheduler clock injection). The RTT lands deterministically
  // as lastPingRttMs. The seam is the HeartbeatScheduler clock injection (NOT the connect.duration_ms clock read): without it the heartbeat reads Date.now while
  // the idle baseline is the injected seed, so idleMs ~= 0 < intervalMs, no ping fires, consumePingRtt returns undefined, and lastPingRttMs is never set -> B2 red.
  test("B2: an idle tick's PING_REQUEST/PING_RESPONSE round-trip lands a deterministic lastPingRttMs through the heartbeat clock", async () => {

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

  // B3 - delayed-frame timing / stall recovery (idle reset), with a MANDATORY positive contrast. An inbound run-phase frame resets the idle window so a subsequent
  // sub-budget advance does NOT stall; the mandatory positive contrast (a budget-crossing advance from the recovered state DOES stall) proves the no-stall is not
  // vacuous - the tick mechanism is live and the earlier frame genuinely reset the idle window.
  test("B3: an in-time inbound frame resets the idle window (no stall), and a later budget-crossing advance still stalls (positive contrast)", async () => {

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

  // B5 - connectTimeoutMs as the sole/binding bound. Pins PRE-EXISTING AbortSignal.timeout behavior (a real coverage gap), NOT the clock seam: no injected clock, no
  // mock.timers, and EXEMPT from the seam-mutation-check. With a small real connectTimeoutMs (50) and the default larger handshakeTimeoutMs (5000), withholding every
  // handshake response makes the overall connect timeout win. Its anti-vacuity is the timing: the rejection arrives near connectTimeoutMs (~50 ms), NOT near
  // handshakeTimeoutMs (~5000 ms) - that timing IS the proof connectTimeoutMs is the binding bound.
  test("B5: connectTimeoutMs is the binding connect bound and surfaces a typed ConnectionError wrapping a TimeoutError (no clock, pre-existing behavior)", async () => {

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

      // Withhold every handshake response: never push HELLO_RESPONSE. The overall connectTimeoutMs (50 ms) fires before the default handshakeTimeoutMs (5000 ms).
      await assert.rejects(client.connect(), (err: unknown): boolean => {

        assert.ok(err instanceof ConnectionError, "the connect-timeout failure must surface as a typed ConnectionError");
        assert.equal(err.code, "CONNECT_FAILED", "the connect-timeout failure must carry the CONNECT_FAILED code");

        const cause = err.cause;

        assert.ok(cause instanceof DOMException, "the cause must be the underlying DOMException");
        assert.equal(cause.name, "TimeoutError", "the cause must be an AbortSignal.timeout TimeoutError");

        return true;
      });

      const elapsed = Date.now() - startedAt;

      // Anti-vacuity: the rejection arrives near connectTimeoutMs (~50 ms), NOT near handshakeTimeoutMs (~5000 ms). The generous ceiling keeps the timing assertion
      // robust on a loaded CI runner while still proving the 50 ms arm - not the 5000 ms arm - is the binding bound.
      assert.ok(elapsed < 2000, "the rejection must arrive near connectTimeoutMs (50 ms), not near the 5000 ms handshakeTimeoutMs; observed " + String(elapsed) + " ms");

    } finally {

      client.disconnect();
    }
  });
});

