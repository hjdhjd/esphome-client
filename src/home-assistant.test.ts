/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * home-assistant.test.ts: Unit tests for the HomeAssistantApi SSOT - covers the outbound subscribe-and-respond surface, the inbound dispatchers, and the
 * memoized inbound-context accessor across the module's test categories (exports, methods, branches, boundary, edge, hot path, negative, errors, among others).
 */
import type { FieldValue, ProtoField } from "./protocol/codec.ts";
import { HomeAssistantApi, dispatchHomeAssistantStateRequest, dispatchHomeassistantService } from "./home-assistant.ts";
import type { HomeAssistantApiHost, HomeAssistantInboundContext, HomeAssistantServiceEvent, HomeAssistantStateRequest } from "./home-assistant.ts";
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { EspHomeLogging } from "./types.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";

// Build a logger that records every message at every level. Tests assert against the captured arrays directly so the diagnostic debug lines emitted by the bridge are
// inspectable as side effects.
type RecordingLogger = EspHomeLogging & { debugged: string[]; errored: string[]; infoed: string[]; warned: string[] };

const recordingLogger = (): RecordingLogger => {

  const debugged: string[] = [];
  const errored: string[] = [];
  const infoed: string[] = [];
  const warned: string[] = [];

  return {

    debug: (msg: string): void => { debugged.push(msg); },
    debugged,
    error: (msg: string): void => { errored.push(msg); },
    errored,
    info: (msg: string): void => { infoed.push(msg); },
    infoed,
    warn: (msg: string): void => { warned.push(msg); },
    warned
  };
};

// Captured outbound frame shape - the bridge's host seam send hook records every wire frame here so tests can assert on the wire-protocol contract directly.
interface CapturedFrame {

  payload: Buffer;
  type: number;
}

interface Harness {

  bridge: HomeAssistantApi;
  bus: EventBus<ClientEventsMap>;
  decoded: number;
  log: RecordingLogger;
  outbound: CapturedFrame[];
}

// Construct a bridge plus its bus, recording logger, decoder counter, and outbound-frame buffer in one call. The decoder counter increments every time the seam's
// decode hook is invoked so tests can assert on the inbound-context's allocation contract.
const buildHarness = (): Harness => {

  const bus = new EventBus<ClientEventsMap>();
  const log = recordingLogger();
  const outbound: CapturedFrame[] = [];
  const counter = { decoded: 0 };
  const host: HomeAssistantApiHost = {

    bus,
    decode: (buffer: Buffer): Record<number, FieldValue[]> => {

      counter.decoded++;

      return decodeProtobuf(buffer, { maxFieldsPerMessage: 100 });
    },
    log,
    send: (type: number, payload: Buffer): void => { outbound.push({ payload, type }); }
  };
  const bridge = new HomeAssistantApi(host);

  return {

    bridge,
    bus,
    get decoded(): number { return counter.decoded; },
    log,
    outbound
  };
};

// Subscribe to one event and capture every payload. Returns the captured array so tests can assert against it.
const captureEvent = <K extends keyof ClientEventsMap>(bus: EventBus<ClientEventsMap>, event: K): ClientEventsMap[K][] => {

  const captured: ClientEventsMap[K][] = [];

  bus.on(event, (payload): void => { captured.push(payload); });

  return captured;
};

// Build a HomeAssistantServiceMap nested entry: field 1 key, field 2 value. Used by the inbound-dispatcher tests.
const buildServiceMapEntry = (key: string, value: string): Buffer => encodeProtoFields([

  { fieldNumber: 1, value: Buffer.from(key, "utf8"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 2, value: Buffer.from(value, "utf8"), wireType: WireType.LENGTH_DELIMITED }
]);

// Exports. Verify every exported symbol from `home-assistant.ts` is reachable and well-typed.
describe("home-assistant module exports", () => {

  test("HomeAssistantApi is a constructable class", () => {

    const { bridge } = buildHarness();

    assert.ok(bridge instanceof HomeAssistantApi);
  });

  test("dispatchHomeassistantService is a callable function", () => {

    assert.equal(typeof dispatchHomeassistantService, "function");
  });

  test("dispatchHomeAssistantStateRequest is a callable function", () => {

    assert.equal(typeof dispatchHomeAssistantStateRequest, "function");
  });

  test("HomeAssistantServiceEvent is structurally usable", () => {

    const event: HomeAssistantServiceEvent = {

      data: { foo: "bar" },
      dataTemplate: {},
      isEvent: true,
      service: "test.service",
      variables: {}
    };

    assert.equal(event.service, "test.service");
  });

  test("HomeAssistantStateRequest is structurally usable", () => {

    const request: HomeAssistantStateRequest = { attribute: "", entityId: "sensor.x", once: false };

    assert.equal(request.entityId, "sensor.x");
  });

  test("HomeAssistantInboundContext is structurally usable", () => {

    const { bridge } = buildHarness();
    const ctx: HomeAssistantInboundContext = bridge.inboundContext;

    assert.ok(ctx.bus);
    assert.ok(ctx.log);
    assert.equal(typeof ctx.decode, "function");
  });

  test("HomeAssistantApiHost is structurally usable", () => {

    const host: HomeAssistantApiHost = {

      bus: new EventBus<ClientEventsMap>(),
      decode: (): Record<number, FieldValue[]> => ({}),
      log: { debug: (): void => { /* */ }, error: (): void => { /* */ }, info: (): void => { /* */ }, warn: (): void => { /* */ } },
      send: (): void => { /* */ }
    };
    const bridge = new HomeAssistantApi(host);

    assert.ok(bridge instanceof HomeAssistantApi);
  });
});

// Methods. Every public method on HomeAssistantApi has at least one direct invocation test.
describe("HomeAssistantApi.subscribeServices", () => {

  test("sends an empty SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST frame", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST);
    assert.equal(outbound[0]?.payload.length, 0);
  });

  test("emits a debug breadcrumb describing the subscription", () => {

    const { bridge, log } = buildHarness();

    bridge.subscribeServices();

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0] ?? "", /subscribing to home assistant services/i);
  });

  test("returns void", () => {

    const { bridge } = buildHarness();

    assert.equal(bridge.subscribeServices(), undefined);
  });
});

describe("HomeAssistantApi.subscribeStates", () => {

  test("sends an empty SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST frame", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeStates();

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST);
    assert.equal(outbound[0]?.payload.length, 0);
  });

  test("emits a debug breadcrumb describing the subscription", () => {

    const { bridge, log } = buildHarness();

    bridge.subscribeStates();

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0] ?? "", /subscribing to home assistant state requests/i);
  });

  test("returns void", () => {

    const { bridge } = buildHarness();

    assert.equal(bridge.subscribeStates(), undefined);
  });
});

// SubscriptionLifecycle. The HA-bridge joins the reset/reissue cycle: reissueOnReconnect replays whichever feeds the consumer subscribed to, and clearConnectionState
// PRESERVES the desired intent (clearing it would be the reconnect-drops-the-subscription bug the contract exists to prevent).
describe("HomeAssistantApi.clearConnectionState / reissueOnReconnect", () => {

  // The two HA subscribe wire types we filter the captured outbound frames by across this group.
  const servicesType = MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST;
  const statesType = MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST;

  test("reissueOnReconnect re-sends the services subscribe when services were subscribed", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();

    // Snapshot the post-subscribe outbound length so we measure only what reissueOnReconnect adds.
    const before = outbound.length;

    bridge.reissueOnReconnect();

    const reissued = outbound.slice(before).filter((f): boolean => f.type === servicesType);

    assert.equal(reissued.length, 1);
    assert.equal(reissued[0]?.payload.length, 0);
  });

  test("reissueOnReconnect re-sends the states subscribe when states were subscribed", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeStates();

    const before = outbound.length;

    bridge.reissueOnReconnect();

    const reissued = outbound.slice(before).filter((f): boolean => f.type === statesType);

    assert.equal(reissued.length, 1);
    assert.equal(reissued[0]?.payload.length, 0);
  });

  test("reissueOnReconnect re-sends both feeds when both were subscribed", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();
    bridge.subscribeStates();

    const before = outbound.length;

    bridge.reissueOnReconnect();

    const reissued = outbound.slice(before);

    assert.equal(reissued.filter((f): boolean => f.type === servicesType).length, 1);
    assert.equal(reissued.filter((f): boolean => f.type === statesType).length, 1);
  });

  test("reissueOnReconnect is a no-op when nothing was subscribed", () => {

    const { bridge, outbound } = buildHarness();

    bridge.reissueOnReconnect();

    assert.equal(outbound.length, 0);
  });

  test("clearConnectionState preserves the desired intent", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();
    bridge.subscribeStates();

    // clearConnectionState must NOT drop the desired booleans; if it did, the subsequent reissue would send nothing.
    bridge.clearConnectionState();

    const before = outbound.length;

    bridge.reissueOnReconnect();

    const reissued = outbound.slice(before);

    assert.equal(reissued.filter((f): boolean => f.type === servicesType).length, 1);
    assert.equal(reissued.filter((f): boolean => f.type === statesType).length, 1);
  });
});

describe("HomeAssistantApi.sendState", () => {

  test("encodes entity_id and state into a HOME_ASSISTANT_STATE_RESPONSE frame", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.temperature", "21.5");

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, MessageType.HOME_ASSISTANT_STATE_RESPONSE);
    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const entityIdBuf = fields[1]?.[0];
    const stateBuf = fields[2]?.[0];

    assert.ok(Buffer.isBuffer(entityIdBuf));
    assert.ok(Buffer.isBuffer(stateBuf));
    assert.equal(entityIdBuf?.toString("utf8"), "sensor.temperature");
    assert.equal(stateBuf?.toString("utf8"), "21.5");
  });

  test("emits a debug breadcrumb describing the send", () => {

    const { bridge, log } = buildHarness();

    bridge.sendState("sensor.x", "ok", "attr");

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0] ?? "", /sending home assistant state.*sensor\.x.*ok.*attr/i);
  });

  test("returns void", () => {

    const { bridge } = buildHarness();

    assert.equal(bridge.sendState("a", "b"), undefined);
  });
});

describe("HomeAssistantApi.respondToAction", () => {

  test("encodes a successful action response with only call_id and success", () => {

    const { bridge, outbound } = buildHarness();

    bridge.respondToAction(42, { success: true });

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.type, MessageType.HOMEASSISTANT_ACTION_RESPONSE);

    const fields = decodeProtobuf(outbound[0].payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[1]?.[0], 42);
    assert.equal(fields[2]?.[0], 1);
    assert.equal(fields[3], undefined);
    assert.equal(fields[4], undefined);
  });

  test("encodes a failed action response with errorMessage", () => {

    const { bridge, outbound } = buildHarness();

    bridge.respondToAction(7, { errorMessage: "service not found", success: false });

    const fields = decodeProtobuf(outbound[0]!.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[1]?.[0], 7);
    assert.equal(fields[2]?.[0], 0);
    assert.equal((fields[3]?.[0] as Buffer).toString("utf8"), "service not found");
  });

  test("encodes a successful action response with responseData", () => {

    const { bridge, outbound } = buildHarness();
    const data = Buffer.from("{\"value\":21.5}", "utf8");

    bridge.respondToAction(99, { responseData: data, success: true });

    const fields = decodeProtobuf(outbound[0]!.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[1]?.[0], 99);
    assert.equal(fields[2]?.[0], 1);
    assert.deepEqual(fields[4]?.[0], data);
  });
});

describe("dispatchHomeassistantService - action-response correlation fields", () => {

  test("populates callId, wantsResponse, and responseTemplate when present on the wire", () => {

    const { bridge, bus } = buildHarness();
    const events: HomeAssistantServiceEvent[] = [];

    bus.on("homeassistantService", (e): void => { events.push(e); });

    const payload = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("light.turn_on", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 6, value: 17, wireType: WireType.VARINT },
      { fieldNumber: 7, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 8, value: Buffer.from("{{ value_json.state }}", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    dispatchHomeassistantService(payload, bridge.inboundContext);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.callId, 17);
    assert.equal(events[0]?.wantsResponse, true);
    assert.equal(events[0]?.responseTemplate, "{{ value_json.state }}");
  });

  test("omits action-response fields entirely on legacy firmware payloads", () => {

    const { bridge, bus } = buildHarness();
    const events: HomeAssistantServiceEvent[] = [];

    bus.on("homeassistantService", (e): void => { events.push(e); });

    const payload = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("light.turn_on", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    dispatchHomeassistantService(payload, bridge.inboundContext);

    assert.equal(events.length, 1);
    assert.equal("callId" in events[0]!, false);
    assert.equal("wantsResponse" in events[0]!, false);
    assert.equal("responseTemplate" in events[0]!, false);
  });
});

describe("HomeAssistantApi.inboundContext", () => {

  test("exposes a memoized HomeAssistantInboundContext", () => {

    const { bridge } = buildHarness();
    const ctx: HomeAssistantInboundContext = bridge.inboundContext;

    assert.ok(ctx.bus);
    assert.ok(ctx.log);
    assert.equal(typeof ctx.decode, "function");
  });

  test("returns the same object identity across reads (no per-frame allocation)", () => {

    const { bridge } = buildHarness();
    const a = bridge.inboundContext;
    const b = bridge.inboundContext;

    assert.equal(a, b);
  });

  test("the memoized context is frozen", () => {

    const { bridge } = buildHarness();

    assert.equal(Object.isFrozen(bridge.inboundContext), true);
  });

  test("the context's bus is the same instance the bridge was constructed with", () => {

    const { bridge, bus } = buildHarness();

    assert.equal(bridge.inboundContext.bus, bus);
  });

  test("the context's log is the same instance the bridge was constructed with", () => {

    const { bridge, log } = buildHarness();

    assert.equal(bridge.inboundContext.log, log);
  });

  test("the context's decode forwards through the seam", () => {

    const harness = buildHarness();

    assert.equal(harness.decoded, 0);

    harness.bridge.inboundContext.decode(Buffer.alloc(0));
    assert.equal(harness.decoded, 1);
  });
});

// Branches. Both sides of the only branch in HomeAssistantApi.sendState (`attribute.length > 0`) are covered.
describe("HomeAssistantApi.sendState branches", () => {

  test("omits field 3 when attribute is the empty string default", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.x", "value");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[1]?.length, 1);
    assert.equal(fields[2]?.length, 1);
    assert.equal(fields[3], undefined);
  });

  test("omits field 3 when attribute is explicitly empty string", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.x", "value", "");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[3], undefined);
  });

  test("includes field 3 when attribute is a non-empty string", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("climate.x", "22", "temperature");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const attributeBuf = fields[3]?.[0];

    assert.ok(Buffer.isBuffer(attributeBuf));
    assert.equal(attributeBuf?.toString("utf8"), "temperature");
  });

  test("includes field 3 even when attribute is a single-character string", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("e", "s", "a");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const attributeBuf = fields[3]?.[0];

    assert.ok(Buffer.isBuffer(attributeBuf));
    assert.equal(attributeBuf?.toString("utf8"), "a");
  });
});

// Boundary. Boundary inputs across the three string fields: empty strings, multi-byte UTF-8, and UTF-8 byte length versus character length.
describe("HomeAssistantApi.sendState boundary inputs", () => {

  test("encodes empty entityId as a zero-length field 1", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("", "value");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const entityIdBuf = fields[1]?.[0];

    assert.ok(Buffer.isBuffer(entityIdBuf));
    assert.equal(entityIdBuf?.length, 0);
  });

  test("encodes empty state as a zero-length field 2", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.x", "");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const stateBuf = fields[2]?.[0];

    assert.ok(Buffer.isBuffer(stateBuf));
    assert.equal(stateBuf?.length, 0);
  });

  test("preserves multi-byte UTF-8 in entityId field 1", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.café", "ok");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const entityIdBuf = fields[1]?.[0];

    assert.ok(Buffer.isBuffer(entityIdBuf));
    assert.equal(entityIdBuf?.toString("utf8"), "sensor.café");
  });

  test("preserves multi-byte UTF-8 in state field 2", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.x", "21.5°C");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const stateBuf = fields[2]?.[0];

    assert.ok(Buffer.isBuffer(stateBuf));
    assert.equal(stateBuf?.toString("utf8"), "21.5°C");
  });

  test("preserves multi-byte UTF-8 in attribute field 3", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("e", "s", "température");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const attributeBuf = fields[3]?.[0];

    assert.ok(Buffer.isBuffer(attributeBuf));
    assert.equal(attributeBuf?.toString("utf8"), "température");
  });

  test("encodes UTF-8 byte length, not character length, in field 1", () => {

    const { bridge, outbound } = buildHarness();

    // The character "🌡" encodes as 4 bytes in UTF-8. The wire-protocol length must reflect the byte count so ESPHome decodes it correctly.
    bridge.sendState("🌡", "v");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });
    const entityIdBuf = fields[1]?.[0];

    assert.ok(Buffer.isBuffer(entityIdBuf));
    assert.equal(entityIdBuf?.length, 4);
  });
});

// Values. The encoded payload matches `api.proto`'s `HomeAssistantStateResponse` definition byte-for-byte. Hand-verified hex fixture so any wire-format regression
// surfaces immediately.
describe("HomeAssistantApi.sendState wire-format fixtures", () => {

  test("two-field encoding matches the hand-verified hex fixture", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("a", "b");

    const frame = outbound[0];

    assert.ok(frame);

    // Field 1 (entity_id) tag = (1 << 3) | 2 = 0x0A. Length = 1. Bytes = "a" = 0x61.
    // Field 2 (state) tag = (2 << 3) | 2 = 0x12. Length = 1. Bytes = "b" = 0x62.
    // Field 3 (attribute) is omitted because attribute defaults to "".
    assert.deepEqual(frame.payload, Buffer.from([ 0x0A, 0x01, 0x61, 0x12, 0x01, 0x62 ]));
  });

  test("three-field encoding matches the hand-verified hex fixture", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("a", "b", "c");

    const frame = outbound[0];

    assert.ok(frame);

    // Field 3 (attribute) tag = (3 << 3) | 2 = 0x1A. Length = 1. Bytes = "c" = 0x63.
    assert.deepEqual(frame.payload, Buffer.from([ 0x0A, 0x01, 0x61, 0x12, 0x01, 0x62, 0x1A, 0x01, 0x63 ]));
  });

  test("field order is deterministic: entity_id, state, attribute", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("a", "b", "c");

    const frame = outbound[0];

    assert.ok(frame);

    // The first byte's tag must be field 1 (entity_id), the fourth byte's tag must be field 2 (state), the seventh must be field 3 (attribute).
    assert.equal(frame.payload[0], 0x0A);
    assert.equal(frame.payload[3], 0x12);
    assert.equal(frame.payload[6], 0x1A);
  });

  test("empty SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST is a zero-byte payload", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();

    assert.deepEqual(outbound[0]?.payload, Buffer.alloc(0));
  });

  test("empty SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST is a zero-byte payload", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeStates();

    assert.deepEqual(outbound[0]?.payload, Buffer.alloc(0));
  });
});

// Edge. Documented edge cases verified.
describe("HomeAssistantApi edge cases", () => {

  test("subscribing to services twice sends two frames (no de-dup; ESPHome has no unsubscribe)", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeServices();
    bridge.subscribeServices();

    assert.equal(outbound.length, 2);
    assert.equal(outbound[0]?.type, MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST);
    assert.equal(outbound[1]?.type, MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST);
  });

  test("subscribing to states twice sends two frames (no de-dup; ESPHome has no unsubscribe)", () => {

    const { bridge, outbound } = buildHarness();

    bridge.subscribeStates();
    bridge.subscribeStates();

    assert.equal(outbound.length, 2);
  });

  test("sendState with the same entityId twice sends two distinct frames", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("sensor.x", "1");
    bridge.sendState("sensor.x", "2");

    assert.equal(outbound.length, 2);

    const fields1 = decodeProtobuf(outbound[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 16 });
    const fields2 = decodeProtobuf(outbound[1]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 16 });
    const state1Buf = fields1[2]?.[0];
    const state2Buf = fields2[2]?.[0];

    assert.ok(Buffer.isBuffer(state1Buf));
    assert.ok(Buffer.isBuffer(state2Buf));
    assert.equal(state1Buf?.toString("utf8"), "1");
    assert.equal(state2Buf?.toString("utf8"), "2");
  });

  test("two bridges constructed from the same host produce independent inbound contexts (no shared mutable state)", () => {

    const harness = buildHarness();
    const host: HomeAssistantApiHost = {

      bus: harness.bus,
      decode: (buffer: Buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 16 }),
      log: harness.log,
      send: (): void => { /* */ }
    };
    const bridgeA = new HomeAssistantApi(host);
    const bridgeB = new HomeAssistantApi(host);

    // Each bridge memoizes its own context object even when constructed from the same seam.
    assert.notEqual(bridgeA.inboundContext, bridgeB.inboundContext);
  });
});

// Hot path. 5000-call tight loop confirming no allocation regression in the encode-and-frame path. The seam captures every frame so the count is exact.
describe("HomeAssistantApi hot path", () => {

  test("5000 sendState calls produce exactly 5000 frames with stable per-call shape", () => {

    const { bridge, outbound } = buildHarness();
    const N = 5000;

    for(let i = 0; i < N; i++) {

      bridge.sendState("sensor.t", String(i));
    }

    assert.equal(outbound.length, N);

    // Spot-check the first, middle, and last frames to confirm shape stability across the loop.
    const firstFields = decodeProtobuf(outbound[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 16 });
    const midFields = decodeProtobuf(outbound[N / 2]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 16 });
    const lastFields = decodeProtobuf(outbound[N - 1]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 16 });
    const firstState = firstFields[2]?.[0];
    const midState = midFields[2]?.[0];
    const lastState = lastFields[2]?.[0];

    assert.ok(Buffer.isBuffer(firstState));
    assert.ok(Buffer.isBuffer(midState));
    assert.ok(Buffer.isBuffer(lastState));
    assert.equal(firstState?.toString("utf8"), "0");
    assert.equal(midState?.toString("utf8"), String(N / 2));
    assert.equal(lastState?.toString("utf8"), String(N - 1));
  });

  test("5000 inboundContext reads return the same object identity (zero allocation)", () => {

    const { bridge } = buildHarness();
    const first = bridge.inboundContext;

    for(let i = 0; i < 5000; i++) {

      assert.equal(bridge.inboundContext, first);
    }
  });
});

// Negative. "X does NOT happen when Z" assertions for the conditional side effects.
describe("HomeAssistantApi negative assertions", () => {

  test("sendState with default attribute does NOT emit a third proto field", () => {

    const { bridge, outbound } = buildHarness();

    bridge.sendState("a", "b");

    const frame = outbound[0];

    assert.ok(frame);

    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16 });

    assert.equal(fields[3], undefined);
  });

  test("sendState does NOT emit any bus event (outbound is fire-and-forget)", () => {

    const { bridge, bus } = buildHarness();
    const serviceCaptured = captureEvent(bus, "homeassistantService");
    const requestCaptured = captureEvent(bus, "homeassistantStateRequest");

    bridge.sendState("a", "b", "c");

    assert.equal(serviceCaptured.length, 0);
    assert.equal(requestCaptured.length, 0);
  });

  test("subscribeServices does NOT emit any bus event", () => {

    const { bridge, bus } = buildHarness();
    const serviceCaptured = captureEvent(bus, "homeassistantService");
    const requestCaptured = captureEvent(bus, "homeassistantStateRequest");

    bridge.subscribeServices();

    assert.equal(serviceCaptured.length, 0);
    assert.equal(requestCaptured.length, 0);
  });

  test("subscribeStates does NOT emit any bus event", () => {

    const { bridge, bus } = buildHarness();
    const serviceCaptured = captureEvent(bus, "homeassistantService");
    const requestCaptured = captureEvent(bus, "homeassistantStateRequest");

    bridge.subscribeStates();

    assert.equal(serviceCaptured.length, 0);
    assert.equal(requestCaptured.length, 0);
  });

  test("constructing the bridge does NOT decode anything (inboundContext is built from the seam directly)", () => {

    const harness = buildHarness();

    assert.equal(harness.decoded, 0);
  });

  test("the inbound context object identity is stable across outbound activity", () => {

    const { bridge } = buildHarness();
    const before = bridge.inboundContext;

    bridge.subscribeServices();
    bridge.subscribeStates();
    bridge.sendState("a", "b", "c");

    assert.equal(bridge.inboundContext, before);
  });
});

// Errors. The outbound surface is fire-and-forget by contract; this group documents that the public methods never throw on benign-but-unusual inputs. Errors
// inside the transport (a disconnected client, a frame too large) surface through the existing `frameAndSend` failure path the host owns - the bridge does not
// duplicate that detection.
describe("HomeAssistantApi fire-and-forget contract", () => {

  test("sendState does not throw on empty entityId, empty state, and empty attribute", () => {

    const { bridge } = buildHarness();

    assert.doesNotThrow(() => bridge.sendState("", "", ""));
  });

  test("sendState does not throw on a 4 KiB payload", () => {

    const { bridge, outbound } = buildHarness();
    const big = "x".repeat(4096);

    assert.doesNotThrow(() => bridge.sendState(big, big, big));
    assert.equal(outbound.length, 1);
  });

  test("subscribeServices is safe to call more than once at the public-method level (no throws on repeated calls)", () => {

    const { bridge } = buildHarness();

    assert.doesNotThrow(() => {

      bridge.subscribeServices();
      bridge.subscribeServices();
      bridge.subscribeServices();
    });
  });
});

// Exports + Branches + Narrowing + Boundary + Edge + Negative for the inbound dispatchers.
describe("dispatchHomeassistantService", () => {

  test("emits a homeassistantService event with all fields populated", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from("light.turn_on", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: buildServiceMapEntry("entity_id", "light.living_room"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: buildServiceMapEntry("brightness", "{{ states('input_number.brightness') }}"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 4, value: buildServiceMapEntry("var1", "value1"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 5, value: 1, wireType: WireType.VARINT }
    ];

    dispatchHomeassistantService(encodeProtoFields(fields), bridge.inboundContext);

    assert.equal(captured.length, 1);

    const payload = captured[0];

    assert.ok(payload);
    assert.equal(payload.service, "light.turn_on");
    assert.equal(payload.isEvent, true);
    assert.deepEqual(payload.data, { "entity_id": "light.living_room" });
    assert.deepEqual(payload.dataTemplate, { brightness: "{{ states('input_number.brightness') }}" });
    assert.deepEqual(payload.variables, { var1: "value1" });
  });

  test("uses empty maps for absent repeated fields and false for absent isEvent", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");

    dispatchHomeassistantService(encodeProtoFields([{ fieldNumber: 1, value: Buffer.from("noop", "utf8"), wireType: WireType.LENGTH_DELIMITED }]),
      bridge.inboundContext);

    const payload = captured[0];

    assert.ok(payload);
    assert.deepEqual(payload.data, {});
    assert.deepEqual(payload.dataTemplate, {});
    assert.deepEqual(payload.variables, {});
    assert.equal(payload.isEvent, false);
  });

  test("service defaults to empty string when name field absent", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");

    dispatchHomeassistantService(Buffer.alloc(0), bridge.inboundContext);

    assert.equal(captured[0]?.service, "");
  });

  test("decodes multiple repeated entries into the same data map", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from("scene.set", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: buildServiceMapEntry("a", "1"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: buildServiceMapEntry("b", "2"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: buildServiceMapEntry("c", "3"), wireType: WireType.LENGTH_DELIMITED }
    ];

    dispatchHomeassistantService(encodeProtoFields(fields), bridge.inboundContext);

    assert.deepEqual(captured[0]?.data, { a: "1", b: "2", c: "3" });
  });

  test("isEvent narrows correctly: 0 yields false, 1 yields true, 2+ yields false", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");

    for(const isEventValue of [ 0, 1, 2 ]) {

      dispatchHomeassistantService(encodeProtoFields([

        { fieldNumber: 1, value: Buffer.from("svc", "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: 5, value: isEventValue, wireType: WireType.VARINT }
      ]), bridge.inboundContext);
    }

    assert.equal(captured.length, 3);
    assert.equal(captured[0]?.isEvent, false);
    assert.equal(captured[1]?.isEvent, true);
    assert.equal(captured[2]?.isEvent, false);
  });

  test("emits a debug breadcrumb with service name and isEvent", () => {

    const { bridge, log } = buildHarness();

    dispatchHomeassistantService(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("notify.send", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 5, value: 0, wireType: WireType.VARINT }
    ]), bridge.inboundContext);

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0] ?? "", /home assistant service call received.*notify\.send/i);
  });

  test("ignores a malformed nested map entry without crashing the dispatch", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");

    // Field 2 holds a non-buffer value at the wire layer (a varint where a length-delimited buffer was expected). The decoder skips the malformed nested entry; the
    // dispatcher emits an event with an empty `data` map rather than throwing.
    const malformed: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from("svc", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 42, wireType: WireType.VARINT }
    ];

    assert.doesNotThrow(() => dispatchHomeassistantService(encodeProtoFields(malformed), bridge.inboundContext));
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0]?.data, {});
  });
});

describe("dispatchHomeAssistantStateRequest", () => {

  test("emits a homeassistantStateRequest event with all fields populated", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantStateRequest");
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from("sensor.temperature", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("unit_of_measurement", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 1, wireType: WireType.VARINT }
    ];

    dispatchHomeAssistantStateRequest(encodeProtoFields(fields), bridge.inboundContext);

    assert.equal(captured.length, 1);

    const payload = captured[0];

    assert.ok(payload);
    assert.equal(payload.entityId, "sensor.temperature");
    assert.equal(payload.attribute, "unit_of_measurement");
    assert.equal(payload.once, true);
  });

  test("entityId and attribute default to empty strings, once defaults to false when fields absent", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantStateRequest");

    dispatchHomeAssistantStateRequest(Buffer.alloc(0), bridge.inboundContext);

    const payload = captured[0];

    assert.ok(payload);
    assert.equal(payload.entityId, "");
    assert.equal(payload.attribute, "");
    assert.equal(payload.once, false);
  });

  test("once narrows correctly: 0 yields false, 1 yields true, 2+ yields false", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantStateRequest");

    for(const onceValue of [ 0, 1, 5 ]) {

      dispatchHomeAssistantStateRequest(encodeProtoFields([

        { fieldNumber: 1, value: Buffer.from("e", "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: 3, value: onceValue, wireType: WireType.VARINT }
      ]), bridge.inboundContext);
    }

    assert.equal(captured[0]?.once, false);
    assert.equal(captured[1]?.once, true);
    assert.equal(captured[2]?.once, false);
  });

  test("preserves multi-byte UTF-8 in entityId and attribute", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantStateRequest");

    dispatchHomeAssistantStateRequest(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("sensor.café", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("température", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]), bridge.inboundContext);

    const payload = captured[0];

    assert.ok(payload);
    assert.equal(payload.entityId, "sensor.café");
    assert.equal(payload.attribute, "température");
  });

  test("emits a debug breadcrumb with entityId, attribute, and once", () => {

    const { bridge, log } = buildHarness();

    dispatchHomeAssistantStateRequest(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("sensor.x", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("attr", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 1, wireType: WireType.VARINT }
    ]), bridge.inboundContext);

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0] ?? "", /home assistant state request received.*sensor\.x.*attr.*true/i);
  });
});

// Boundary integration. Verify the bridge integrates correctly with the run-phase dispatcher's contract: feeding `bridge.inboundContext` into the module-level
// dispatchers produces the same observable behavior as the dispatchers consuming a hand-built context object. This is the cross-module integration boundary
// the host depends on.
describe("HomeAssistantApi.inboundContext + dispatcher integration", () => {

  test("dispatchHomeassistantService through bridge.inboundContext emits on the bridge's bus", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantService");

    dispatchHomeassistantService(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("svc.name", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]), bridge.inboundContext);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.service, "svc.name");
  });

  test("dispatchHomeAssistantStateRequest through bridge.inboundContext emits on the bridge's bus", () => {

    const { bridge, bus } = buildHarness();
    const captured = captureEvent(bus, "homeassistantStateRequest");

    dispatchHomeAssistantStateRequest(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("sensor.x", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]), bridge.inboundContext);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.entityId, "sensor.x");
  });

  test("dispatcher path increments the seam's decode counter (the inbound context forwards through the host's bounded decoder)", () => {

    const harness = buildHarness();

    // Service dispatcher decodes the top-level payload plus one nested map entry.
    dispatchHomeassistantService(encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("svc", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: buildServiceMapEntry("k", "v"), wireType: WireType.LENGTH_DELIMITED }
    ]), harness.bridge.inboundContext);

    assert.ok(harness.decoded >= 1);
  });
});
