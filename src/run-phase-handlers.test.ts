/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * run-phase-handlers.test.ts: Unit tests for the run-phase dispatcher.
 */
import type { ClientEventsMap, LogEventData } from "./esphome-client.ts";
import {
  LIST_ENTITIES_MESSAGE_TYPES, STATE_MESSAGE_TYPES, buildRunPhaseHandlers, defaultRunPhaseHandler, handleCameraImageResponse, handleDisconnectRequest,
  handleDisconnectResponse, handleGetTimeRequest, handleGetTimeResponse, handleHomeassistantServiceResponse, handleNoiseEncryptionSetKeyResponse,
  handlePingRequest, handlePingResponse, handleSubscribeHomeAssistantStateResponse, handleSubscribeLogsResponse, handleVoiceAssistantAnnounceFinished,
  handleVoiceAssistantAudio, handleVoiceAssistantConfigurationResponse, handleVoiceAssistantRequest
} from "./run-phase-handlers.ts";
import { decodeProtobuf, encodeProtoFields, extractNumberField } from "./protocol/index.ts";
import { describe, mock, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientMetrics } from "./types.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import { EventBus } from "./event-bus.ts";
import type { FieldValue } from "./protocol/index.ts";
import type { HomeAssistantInboundContext } from "./home-assistant.ts";
import type { InboundMessage } from "./transport.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { RunPhaseHost } from "./run-phase-handlers.ts";
import type { VoiceAssistantInboundContext } from "./voice-assistant.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";

// Frame the dispatcher captures. The seam's send hook records every outbound frame here so tests can verify wire-protocol behavior end-to-end.
interface CapturedFrame {

  payload: Buffer;
  type: number;
}

// Recording logger. Captures every level so tests can assert on diagnostic lines and the default-handler "unhandled message type" warning.
interface RecordingLogger {

  debug: (msg: string) => void;
  debugged: string[];
  error: (msg: string) => void;
  errored: string[];
  info: (msg: string) => void;
  infoed: string[];
  warn: (msg: string) => void;
  warned: string[];
}

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

// Recording metrics sink. Captures every increment/timing/gauge so tests can verify the unknown-type counter without coupling to a real sink.
interface CapturedMetric {

  delta: number;
  name: string;
  tags: Record<string, string> | undefined;
}

const recordingMetrics = (): { metrics: ClientMetrics; recorded: CapturedMetric[] } => {

  const recorded: CapturedMetric[] = [];

  const metrics: ClientMetrics = {

    gauge: (name: string, value: number, tags?: Record<string, string>): void => { recorded.push({ delta: value, name, tags }); },
    increment: (name: string, delta: number, tags?: Record<string, string>): void => { recorded.push({ delta, name, tags }); },
    timing: (name: string, durationMs: number, tags?: Record<string, string>): void => { recorded.push({ delta: durationMs, name, tags }); }
  };

  return { metrics, recorded };
};

// Snapshot of every host call the dispatcher routed through the seam. Each delegate method on the host pushes a record so tests can verify that the dispatcher
// invoked the right delegate with the right arguments.
interface HostInvocations {

  acknowledgeDisconnectRequest: number;
  acknowledgeDisconnectResponse: number;
  acknowledgePingResponse: number;
  handleBluetoothAdvertisementsBatch: Buffer[];
  handleBluetoothConnectionsFreeResponse: Buffer[];
  handleBluetoothDeviceClearCacheResponse: Buffer[];
  handleBluetoothDeviceConnectionResponse: Buffer[];
  handleBluetoothDevicePairingResponse: Buffer[];
  handleBluetoothDeviceUnpairingResponse: Buffer[];
  handleBluetoothGattErrorResponse: Buffer[];
  handleBluetoothGattGetServicesDoneResponse: Buffer[];
  handleBluetoothGattGetServicesResponse: Buffer[];
  handleBluetoothGattNotifyDataResponse: Buffer[];
  handleBluetoothGattNotifyResponse: Buffer[];
  handleBluetoothGattReadResponse: Buffer[];
  handleBluetoothGattWriteResponse: Buffer[];
  handleBluetoothScannerState: Buffer[];
  handleBluetoothSetConnectionParamsResponse: Buffer[];
  handleCameraImageResponse: Buffer[];
  handleDeviceInfoResponse: Buffer[];
  handleExecuteServiceResponse: Buffer[];
  handleListEntitiesDoneResponse: number;
  handleListEntity: { payload: Buffer; type: number }[];
  handleListServiceEntity: Buffer[];
  handleLogResponse: Buffer[];
  handleNoiseKeySetResponse: Buffer[];
  handleSerialProxyData: Buffer[];
  handleSerialProxyModemPinsResponse: Buffer[];
  handleSerialProxyRequestResponse: Buffer[];
  handleTelemetry: { payload: Buffer; type: number }[];
  handleZWaveProxyFrame: Buffer[];
  handleZWaveProxyRequest: Buffer[];
}

interface Harness {

  bus: EventBus<ClientEventsMap>;
  host: RunPhaseHost;
  invocations: HostInvocations;
  log: RecordingLogger;
  metrics: CapturedMetric[];
  outbound: CapturedFrame[];
}

// Build a fresh harness in one call. Every test gets its own bus, logger, metrics sink, outbound-frame buffer, and invocation counter so assertions stay isolated.
const buildHarness = (overrides: Partial<RunPhaseHost> = {}): Harness => {

  const bus = new EventBus<ClientEventsMap>();
  const log = recordingLogger();
  const { metrics: metricsSink, recorded: metrics } = recordingMetrics();
  const outbound: CapturedFrame[] = [];
  const invocations: HostInvocations = {

    acknowledgeDisconnectRequest: 0,
    acknowledgeDisconnectResponse: 0,
    acknowledgePingResponse: 0,
    handleBluetoothAdvertisementsBatch: [],
    handleBluetoothConnectionsFreeResponse: [],
    handleBluetoothDeviceClearCacheResponse: [],
    handleBluetoothDeviceConnectionResponse: [],
    handleBluetoothDevicePairingResponse: [],
    handleBluetoothDeviceUnpairingResponse: [],
    handleBluetoothGattErrorResponse: [],
    handleBluetoothGattGetServicesDoneResponse: [],
    handleBluetoothGattGetServicesResponse: [],
    handleBluetoothGattNotifyDataResponse: [],
    handleBluetoothGattNotifyResponse: [],
    handleBluetoothGattReadResponse: [],
    handleBluetoothGattWriteResponse: [],
    handleBluetoothScannerState: [],
    handleBluetoothSetConnectionParamsResponse: [],
    handleCameraImageResponse: [],
    handleDeviceInfoResponse: [],
    handleExecuteServiceResponse: [],
    handleListEntitiesDoneResponse: 0,
    handleListEntity: [],
    handleListServiceEntity: [],
    handleLogResponse: [],
    handleNoiseKeySetResponse: [],
    handleSerialProxyData: [],
    handleSerialProxyModemPinsResponse: [],
    handleSerialProxyRequestResponse: [],
    handleTelemetry: [],
    handleZWaveProxyFrame: [],
    handleZWaveProxyRequest: []
  };

  const homeAssistantInboundContext: HomeAssistantInboundContext = {

    bus,
    decode: (buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* swallow */ } }),
    log
  };

  const voiceAssistantInboundContext: VoiceAssistantInboundContext = {

    bus,
    decode: (buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* swallow */ } }),
    log
  };

  const host: RunPhaseHost = {

    acknowledgeDisconnectRequest: (): void => { invocations.acknowledgeDisconnectRequest++; },
    acknowledgeDisconnectResponse: (): void => { invocations.acknowledgeDisconnectResponse++; },
    acknowledgePingResponse: (): void => { invocations.acknowledgePingResponse++; },
    bus,
    decodeProtobuf: (buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (m): void => { log.warn(m); } }),
    handleBluetoothAdvertisementsBatch: (payload): void => { invocations.handleBluetoothAdvertisementsBatch.push(payload); },
    handleBluetoothConnectionsFreeResponse: (payload): void => { invocations.handleBluetoothConnectionsFreeResponse.push(payload); },
    handleBluetoothDeviceClearCacheResponse: (payload): void => { invocations.handleBluetoothDeviceClearCacheResponse.push(payload); },
    handleBluetoothDeviceConnectionResponse: (payload): void => { invocations.handleBluetoothDeviceConnectionResponse.push(payload); },
    handleBluetoothDevicePairingResponse: (payload): void => { invocations.handleBluetoothDevicePairingResponse.push(payload); },
    handleBluetoothDeviceUnpairingResponse: (payload): void => { invocations.handleBluetoothDeviceUnpairingResponse.push(payload); },
    handleBluetoothGattErrorResponse: (payload): void => { invocations.handleBluetoothGattErrorResponse.push(payload); },
    handleBluetoothGattGetServicesDoneResponse: (payload): void => { invocations.handleBluetoothGattGetServicesDoneResponse.push(payload); },
    handleBluetoothGattGetServicesResponse: (payload): void => { invocations.handleBluetoothGattGetServicesResponse.push(payload); },
    handleBluetoothGattNotifyDataResponse: (payload): void => { invocations.handleBluetoothGattNotifyDataResponse.push(payload); },
    handleBluetoothGattNotifyResponse: (payload): void => { invocations.handleBluetoothGattNotifyResponse.push(payload); },
    handleBluetoothGattReadResponse: (payload): void => { invocations.handleBluetoothGattReadResponse.push(payload); },
    handleBluetoothGattWriteResponse: (payload): void => { invocations.handleBluetoothGattWriteResponse.push(payload); },
    handleBluetoothScannerState: (payload): void => { invocations.handleBluetoothScannerState.push(payload); },
    handleBluetoothSetConnectionParamsResponse: (payload): void => { invocations.handleBluetoothSetConnectionParamsResponse.push(payload); },
    handleCameraImageResponse: (payload): void => { invocations.handleCameraImageResponse.push(payload); },
    handleDeviceInfoResponse: (payload): void => { invocations.handleDeviceInfoResponse.push(payload); },
    handleExecuteServiceResponse: (payload): void => { invocations.handleExecuteServiceResponse.push(payload); },
    handleListEntitiesDoneResponse: (): void => { invocations.handleListEntitiesDoneResponse++; },
    handleListEntity: (type, payload): void => { invocations.handleListEntity.push({ payload, type }); },
    handleListServiceEntity: (payload): void => { invocations.handleListServiceEntity.push(payload); },
    handleLogResponse: (payload): void => { invocations.handleLogResponse.push(payload); },
    handleNoiseKeySetResponse: (payload): void => { invocations.handleNoiseKeySetResponse.push(payload); },
    handleSerialProxyData: (payload): void => { invocations.handleSerialProxyData.push(payload); },
    handleSerialProxyModemPinsResponse: (payload): void => { invocations.handleSerialProxyModemPinsResponse.push(payload); },
    handleSerialProxyRequestResponse: (payload): void => { invocations.handleSerialProxyRequestResponse.push(payload); },
    handleTelemetry: (type, payload): void => { invocations.handleTelemetry.push({ payload, type }); },
    handleZWaveProxyFrame: (payload): void => { invocations.handleZWaveProxyFrame.push(payload); },
    handleZWaveProxyRequest: (payload): void => { invocations.handleZWaveProxyRequest.push(payload); },
    homeAssistantInboundContext,
    listEntitiesMessageTypes: LIST_ENTITIES_MESSAGE_TYPES,
    log,
    metrics: metricsSink,
    send: (type, payload): void => { outbound.push({ payload, type }); },
    stateMessageTypes: STATE_MESSAGE_TYPES,
    voiceAssistantInboundContext,
    ...overrides
  };

  return { bus, host, invocations, log, metrics, outbound };
};

const inbound = (type: number, payload: Buffer = Buffer.alloc(0)): InboundMessage => ({ payload, type });

describe("run-phase-handlers - module exports", () => {

  test("STATE_MESSAGE_TYPES contains every entity-state message-type from ENTITY_SCHEMAS plus BUTTON_COMMAND_REQUEST", () => {

    for(const schema of Object.values(ENTITY_SCHEMAS)) {

      assert.ok(STATE_MESSAGE_TYPES.has(schema.state.messageType),
        "expected STATE_MESSAGE_TYPES to include " + String(schema.state.messageType));
    }

    assert.ok(STATE_MESSAGE_TYPES.has(MessageType.BUTTON_COMMAND_REQUEST), "expected STATE_MESSAGE_TYPES to include BUTTON_COMMAND_REQUEST");
  });

  test("LIST_ENTITIES_MESSAGE_TYPES contains every list-entities message-type from ENTITY_SCHEMAS plus the services variant", () => {

    for(const schema of Object.values(ENTITY_SCHEMAS)) {

      assert.ok(LIST_ENTITIES_MESSAGE_TYPES.has(schema.listEntities.messageType),
        "expected LIST_ENTITIES_MESSAGE_TYPES to include " + String(schema.listEntities.messageType));
    }

    assert.ok(LIST_ENTITIES_MESSAGE_TYPES.has(MessageType.LIST_ENTITIES_SERVICES_RESPONSE),
      "expected LIST_ENTITIES_MESSAGE_TYPES to include LIST_ENTITIES_SERVICES_RESPONSE");
  });

  test("STATE_MESSAGE_TYPES and LIST_ENTITIES_MESSAGE_TYPES are disjoint sets", () => {

    for(const stateType of STATE_MESSAGE_TYPES) {

      assert.ok(!LIST_ENTITIES_MESSAGE_TYPES.has(stateType), "state type " + String(stateType) + " unexpectedly present in LIST_ENTITIES_MESSAGE_TYPES");
    }
  });

  test("buildRunPhaseHandlers returns a record with the expected per-MessageType entries plus a default handler", () => {

    const { host } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    const expected = [

      MessageType.CAMERA_IMAGE_RESPONSE,
      MessageType.DEVICE_INFO_RESPONSE,
      MessageType.DISCONNECT_REQUEST,
      MessageType.DISCONNECT_RESPONSE,
      MessageType.EXECUTE_SERVICE_RESPONSE,
      MessageType.GET_TIME_REQUEST,
      MessageType.GET_TIME_RESPONSE,
      MessageType.HOMEASSISTANT_SERVICE_RESPONSE,
      MessageType.LIST_ENTITIES_DONE_RESPONSE,
      MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE,
      MessageType.PING_REQUEST,
      MessageType.PING_RESPONSE,
      MessageType.SERIAL_PROXY_DATA_RECEIVED,
      MessageType.SERIAL_PROXY_GET_MODEM_PINS_RESPONSE,
      MessageType.SERIAL_PROXY_REQUEST_RESPONSE,
      MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE,
      MessageType.SUBSCRIBE_LOGS_RESPONSE,
      MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED,
      MessageType.VOICE_ASSISTANT_AUDIO,
      MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE,
      MessageType.VOICE_ASSISTANT_REQUEST
    ];

    for(const type of expected) {

      assert.equal(typeof handlers[type], "function", "expected handler for " + String(type));
    }

    assert.equal(typeof handlers.default, "function");
  });
});

describe("run-phase-handlers - handlePingRequest", () => {

  test("emits debug log line, sends PING_RESPONSE with empty payload, and emits 'heartbeat'", () => {

    const { host, log, outbound, bus } = buildHarness();
    const events: undefined[] = [];

    bus.on("heartbeat", (e) => events.push(e));

    handlePingRequest(host);

    assert.equal(log.debugged.length, 1);
    assert.match(log.debugged[0]!, /PingRequest/);
    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]!.type, MessageType.PING_RESPONSE);
    assert.equal(outbound[0]!.payload.length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0], undefined);
  });

  test("does not invoke any host coordination method beyond send", () => {

    const { host, invocations } = buildHarness();

    handlePingRequest(host);

    assert.equal(invocations.acknowledgePingResponse, 0);
    assert.equal(invocations.acknowledgeDisconnectRequest, 0);
    assert.equal(invocations.acknowledgeDisconnectResponse, 0);
    assert.equal(invocations.handleCameraImageResponse.length, 0);
    assert.equal(invocations.handleTelemetry.length, 0);
  });

  test("repeated invocations send one PING_RESPONSE per call", () => {

    const { host, outbound } = buildHarness();

    handlePingRequest(host);
    handlePingRequest(host);
    handlePingRequest(host);

    assert.equal(outbound.length, 3);

    for(const frame of outbound) {

      assert.equal(frame.type, MessageType.PING_RESPONSE);
    }
  });
});

describe("run-phase-handlers - handlePingResponse", () => {

  test("delegates to host.acknowledgePingResponse and emits 'heartbeat'", () => {

    const { host, invocations, bus } = buildHarness();
    const events: undefined[] = [];

    bus.on("heartbeat", (e) => events.push(e));

    handlePingResponse(host);

    assert.equal(invocations.acknowledgePingResponse, 1);
    assert.equal(events.length, 1);
  });

  test("emits no wire frame", () => {

    const { host, outbound } = buildHarness();

    handlePingResponse(host);

    assert.equal(outbound.length, 0);
  });

  test("does not log on the debug channel by default", () => {

    const { host, log } = buildHarness();

    handlePingResponse(host);

    assert.equal(log.debugged.length, 0);
  });
});

describe("run-phase-handlers - handleDisconnectRequest", () => {

  test("delegates exactly once to host.acknowledgeDisconnectRequest", () => {

    const { host, invocations } = buildHarness();

    handleDisconnectRequest(host);

    assert.equal(invocations.acknowledgeDisconnectRequest, 1);
  });

  test("does not send a wire frame directly (the host's acknowledge bundles the send + tear-down)", () => {

    const { host, outbound } = buildHarness();

    handleDisconnectRequest(host);

    assert.equal(outbound.length, 0);
  });

  test("does not emit any bus event directly", () => {

    const { host, bus } = buildHarness();
    let count = 0;

    bus.on("disconnect", () => count++);
    bus.on("heartbeat", () => count++);
    bus.on("healthChange", () => count++);
    handleDisconnectRequest(host);
    assert.equal(count, 0);
  });
});

describe("run-phase-handlers - handleDisconnectResponse", () => {

  test("delegates exactly once to host.acknowledgeDisconnectResponse", () => {

    const { host, invocations } = buildHarness();

    handleDisconnectResponse(host);

    assert.equal(invocations.acknowledgeDisconnectResponse, 1);
  });

  test("does not send a wire frame directly", () => {

    const { host, outbound } = buildHarness();

    handleDisconnectResponse(host);

    assert.equal(outbound.length, 0);
  });
});

describe("run-phase-handlers - handleGetTimeRequest", () => {

  test("sends a GET_TIME_RESPONSE with field 1 = current epoch (seconds, fixed32 LE)", () => {

    const { host, outbound } = buildHarness();
    const before = Math.floor(Date.now() / 1000);

    handleGetTimeRequest(host);

    const after = Math.floor(Date.now() / 1000);

    assert.equal(outbound.length, 1);
    const frame = outbound[0]!;

    assert.equal(frame.type, MessageType.GET_TIME_RESPONSE);
    const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16, warn: (): void => { /* swallow */ } });
    const rawBuf = fields[1]?.[0];

    assert.ok(Buffer.isBuffer(rawBuf), "expected fixed32 buffer at field 1");
    assert.equal(rawBuf.length, 4);
    const epoch = rawBuf.readUInt32LE(0);

    assert.ok((epoch >= before) && (epoch <= after), "epoch " + String(epoch) + " out of [" + String(before) + ", " + String(after) + "]");
  });

  test("does not log or call any host method beyond send", () => {

    const { host, log, invocations } = buildHarness();

    handleGetTimeRequest(host);

    assert.equal(log.debugged.length, 0);
    assert.equal(log.warned.length, 0);
    assert.equal(invocations.acknowledgePingResponse, 0);
    assert.equal(invocations.handleTelemetry.length, 0);
  });
});

describe("run-phase-handlers - handleGetTimeResponse", () => {

  test("emits 'timeSync' with the decoded epoch when field 1 is present and 4 bytes", () => {

    const { host, bus } = buildHarness();
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    const epoch = 1735689600;
    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(epoch, 0);
    const payload = encodeProtoFields([{ fieldNumber: 1, value: buf, wireType: WireType.FIXED32 }]);

    handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, payload));

    assert.equal(events.length, 1);
    assert.equal(events[0], epoch);
  });

  test("does NOT emit 'timeSync' when field 1 is absent (negative case)", () => {

    const { host, bus } = buildHarness();
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, Buffer.alloc(0)));

    assert.equal(events.length, 0);
  });

  test("does NOT emit 'timeSync' when field 1 has the wrong wire length (negative case)", () => {

    const { host, bus } = buildHarness();
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    // A length-delimited (3-byte) value at field 1 instead of fixed32 - the helper requires exactly 4 bytes.
    const payload = encodeProtoFields([{ fieldNumber: 1, value: Buffer.from([ 1, 2, 3 ]), wireType: WireType.LENGTH_DELIMITED }]);

    handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, payload));

    assert.equal(events.length, 0);
  });

  test("decodes field 1 across the boundary range (epoch=0 and epoch=2^32-1)", () => {

    const { host, bus } = buildHarness();
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    for(const epoch of [ 0, 0xffffffff ]) {

      const buf = Buffer.alloc(4);

      buf.writeUInt32LE(epoch, 0);
      const payload = encodeProtoFields([{ fieldNumber: 1, value: buf, wireType: WireType.FIXED32 }]);

      handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, payload));
    }

    assert.deepEqual(events, [ 0, 0xffffffff ]);
  });
});

describe("run-phase-handlers - delegating handlers (handleSubscribeLogsResponse, handleCameraImageResponse, handleNoiseEncryptionSetKeyResponse)", () => {

  test("handleSubscribeLogsResponse forwards the payload to host.handleLogResponse", () => {

    const { host, invocations } = buildHarness();
    const payload = Buffer.from([ 1, 2, 3, 4 ]);

    handleSubscribeLogsResponse(host, inbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, payload));

    assert.equal(invocations.handleLogResponse.length, 1);
    assert.deepEqual(invocations.handleLogResponse[0], payload);
  });

  test("handleCameraImageResponse forwards the payload to host.handleCameraImageResponse", () => {

    const { host, invocations } = buildHarness();
    const payload = Buffer.from([ 0xff, 0xd8, 0xff ]);

    handleCameraImageResponse(host, inbound(MessageType.CAMERA_IMAGE_RESPONSE, payload));

    assert.equal(invocations.handleCameraImageResponse.length, 1);
    assert.deepEqual(invocations.handleCameraImageResponse[0], payload);
  });

  test("handleNoiseEncryptionSetKeyResponse forwards the payload to host.handleNoiseKeySetResponse", () => {

    const { host, invocations } = buildHarness();
    const payload = Buffer.from([ 0x08, 0x01 ]);

    handleNoiseEncryptionSetKeyResponse(host, inbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, payload));

    assert.equal(invocations.handleNoiseKeySetResponse.length, 1);
    assert.deepEqual(invocations.handleNoiseKeySetResponse[0], payload);
  });

  test("repeated invocations push one entry per call into the host delegate (no batching, no caching)", () => {

    const { host, invocations } = buildHarness();
    const payloads = [ Buffer.from([1]), Buffer.from([2]), Buffer.from([3]) ];

    for(const p of payloads) {

      handleSubscribeLogsResponse(host, inbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, p));
    }

    assert.equal(invocations.handleLogResponse.length, 3);
    assert.deepEqual(invocations.handleLogResponse[0], payloads[0]);
    assert.deepEqual(invocations.handleLogResponse[1], payloads[1]);
    assert.deepEqual(invocations.handleLogResponse[2], payloads[2]);
  });
});

describe("run-phase-handlers - voice-assistant handlers", () => {

  test("handleVoiceAssistantRequest emits 'voiceAssistantRequest' through the inbound context", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("voiceAssistantRequest", () => received++);

    // VoiceAssistantRequest payload: an arbitrary varint field used purely as decode filler; the field number does not match the real `flags` field
    // (field 3 per api.proto), since this test only checks that the handler emits the event.
    const payload = encodeProtoFields([{ fieldNumber: 4, value: 0, wireType: WireType.VARINT }]);

    handleVoiceAssistantRequest(host, inbound(MessageType.VOICE_ASSISTANT_REQUEST, payload));

    assert.equal(received, 1);
  });

  test("handleVoiceAssistantAnnounceFinished emits 'voiceAssistantAnnounceFinished' through the inbound context", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("voiceAssistantAnnounceFinished", () => received++);

    handleVoiceAssistantAnnounceFinished(host, inbound(MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED, Buffer.alloc(0)));

    assert.equal(received, 1);
  });

  test("handleVoiceAssistantConfigurationResponse emits 'voiceAssistantConfiguration' through the inbound context", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("voiceAssistantConfiguration", () => received++);

    handleVoiceAssistantConfigurationResponse(host, inbound(MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE, Buffer.alloc(0)));

    assert.equal(received, 1);
  });

  test("handleVoiceAssistantAudio emits 'voiceAssistantAudio' through the inbound context (with audio payload)", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("voiceAssistantAudio", () => received++);

    // VoiceAssistantAudio payload: field 1 carries arbitrary length-delimited data as decode filler; the second field's number is also filler and does
    // not match the real `end` field (field 2 per api.proto), since this test only checks that the handler emits the event.
    const audioBuf = Buffer.from([ 0x10, 0x20, 0x30 ]);
    const payload = encodeProtoFields([

      { fieldNumber: 1, value: audioBuf, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 0, wireType: WireType.VARINT }
    ]);

    handleVoiceAssistantAudio(host, inbound(MessageType.VOICE_ASSISTANT_AUDIO, payload));

    assert.equal(received, 1);
  });
});

describe("run-phase-handlers - home-assistant handlers", () => {

  test("handleHomeassistantServiceResponse emits 'homeassistantService' through the inbound context", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("homeassistantService", () => received++);

    // HomeassistantServiceResponse payload: field 1 = service name (string).
    const payload = encodeProtoFields([{ fieldNumber: 1, value: Buffer.from("light.turn_on", "utf8"), wireType: WireType.LENGTH_DELIMITED }]);

    handleHomeassistantServiceResponse(host, inbound(MessageType.HOMEASSISTANT_SERVICE_RESPONSE, payload));

    assert.equal(received, 1);
  });

  test("handleSubscribeHomeAssistantStateResponse emits 'homeassistantStateRequest' through the inbound context", () => {

    const { host, bus } = buildHarness();
    let received = 0;

    bus.on("homeassistantStateRequest", () => received++);

    // SubscribeHomeAssistantStateResponse payload: field 1 = entity_id (string), field 2 = attribute (string), field 3 = once (varint).
    const payload = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("sensor.temperature", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 0, wireType: WireType.VARINT }
    ]);

    handleSubscribeHomeAssistantStateResponse(host, inbound(MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE, payload));

    assert.equal(received, 1);
  });
});

describe("run-phase-handlers - defaultRunPhaseHandler", () => {

  test("emits the generic 'message' event for every dispatched type", () => {

    const { host, bus } = buildHarness();
    const messages: { payload: Buffer; type: number }[] = [];

    bus.on("message", (e) => messages.push(e));

    const payload = Buffer.from([ 0xab, 0xcd ]);
    const someType = 0x4242;

    defaultRunPhaseHandler(host, inbound(someType, payload));

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { payload, type: someType });
  });

  test("routes a STATE_MESSAGE_TYPES type to host.handleTelemetry and does NOT log a warning", () => {

    const { host, invocations, log } = buildHarness();
    const stateType = MessageType.SENSOR_STATE_RESPONSE;
    const payload = Buffer.from([ 0x05, 0x06 ]);

    defaultRunPhaseHandler(host, inbound(stateType, payload));

    assert.equal(invocations.handleTelemetry.length, 1);
    assert.equal(invocations.handleTelemetry[0]!.type, stateType);
    assert.deepEqual(invocations.handleTelemetry[0]!.payload, payload);
    assert.equal(log.warned.length, 0);
  });

  test("routes BUTTON_COMMAND_REQUEST through telemetry (special-cased into STATE_MESSAGE_TYPES)", () => {

    const { host, invocations } = buildHarness();
    const payload = Buffer.alloc(0);

    defaultRunPhaseHandler(host, inbound(MessageType.BUTTON_COMMAND_REQUEST, payload));

    assert.equal(invocations.handleTelemetry.length, 1);
    assert.equal(invocations.handleTelemetry[0]!.type, MessageType.BUTTON_COMMAND_REQUEST);
  });

  test("routes a non-services LIST_ENTITIES type to host.handleListEntity", () => {

    const { host, invocations } = buildHarness();
    const listType = MessageType.LIST_ENTITIES_LIGHT_RESPONSE;
    const payload = Buffer.from([ 0x07, 0x08 ]);

    defaultRunPhaseHandler(host, inbound(listType, payload));

    assert.equal(invocations.handleListEntity.length, 1);
    assert.equal(invocations.handleListEntity[0]!.type, listType);
    assert.deepEqual(invocations.handleListEntity[0]!.payload, payload);
    assert.equal(invocations.handleListServiceEntity.length, 0);
  });

  test("routes LIST_ENTITIES_SERVICES_RESPONSE to host.handleListServiceEntity (not handleListEntity)", () => {

    const { host, invocations } = buildHarness();
    const payload = Buffer.from([ 0x09, 0x0a ]);

    defaultRunPhaseHandler(host, inbound(MessageType.LIST_ENTITIES_SERVICES_RESPONSE, payload));

    assert.equal(invocations.handleListServiceEntity.length, 1);
    assert.deepEqual(invocations.handleListServiceEntity[0], payload);
    assert.equal(invocations.handleListEntity.length, 0);
  });

  test("logs a warn line and increments the messages.unknown_type metric for an entirely unknown type", () => {

    const { host, log, metrics } = buildHarness();
    const payload = Buffer.from([ 0xde, 0xad, 0xbe, 0xef ]);
    const unknownType = 0xffff;

    defaultRunPhaseHandler(host, inbound(unknownType, payload));

    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /Unhandled message type: 65535/);
    assert.match(log.warned[0]!, /deadbeef/);

    assert.equal(metrics.length, 1);
    assert.deepEqual(metrics[0], { delta: 1, name: "messages.unknown_type", tags: { type: "65535" } });
  });

  test("does NOT log or count for known types that take the telemetry path (negative case)", () => {

    const { host, log, metrics } = buildHarness();

    defaultRunPhaseHandler(host, inbound(MessageType.SENSOR_STATE_RESPONSE, Buffer.alloc(0)));

    assert.equal(log.warned.length, 0);
    assert.equal(metrics.length, 0);
  });

  test("does NOT log or count for known types that take the discovery path (negative case)", () => {

    const { host, log, metrics } = buildHarness();

    defaultRunPhaseHandler(host, inbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, Buffer.alloc(0)));

    assert.equal(log.warned.length, 0);
    assert.equal(metrics.length, 0);
  });

  test("metrics increment is silent when the host has no metrics sink (undefined branch)", () => {

    const { host, log } = buildHarness({ metrics: undefined });
    const unknownType = 0xfffe;

    defaultRunPhaseHandler(host, inbound(unknownType, Buffer.from([0])));

    // Warn line still fires; the optional-chain just no-ops the increment.
    assert.equal(log.warned.length, 1);
  });
});

describe("run-phase-handlers - buildRunPhaseHandlers wiring (every map entry routes through the matching named handler)", () => {

  test("PING_REQUEST entry sends PING_RESPONSE and emits heartbeat (matches handlePingRequest)", () => {

    const { host, outbound, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const events: undefined[] = [];

    bus.on("heartbeat", (e) => events.push(e));

    handlers[MessageType.PING_REQUEST]!(inbound(MessageType.PING_REQUEST));

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]!.type, MessageType.PING_RESPONSE);
    assert.equal(events.length, 1);
  });

  test("PING_RESPONSE entry routes to host.acknowledgePingResponse", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers[MessageType.PING_RESPONSE]!(inbound(MessageType.PING_RESPONSE));

    assert.equal(invocations.acknowledgePingResponse, 1);
  });

  test("DISCONNECT_REQUEST entry routes to host.acknowledgeDisconnectRequest", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers[MessageType.DISCONNECT_REQUEST]!(inbound(MessageType.DISCONNECT_REQUEST));

    assert.equal(invocations.acknowledgeDisconnectRequest, 1);
  });

  test("DISCONNECT_RESPONSE entry routes to host.acknowledgeDisconnectResponse", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers[MessageType.DISCONNECT_RESPONSE]!(inbound(MessageType.DISCONNECT_RESPONSE));

    assert.equal(invocations.acknowledgeDisconnectResponse, 1);
  });

  test("GET_TIME_REQUEST entry sends a GET_TIME_RESPONSE", () => {

    const { host, outbound } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers[MessageType.GET_TIME_REQUEST]!(inbound(MessageType.GET_TIME_REQUEST));

    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]!.type, MessageType.GET_TIME_RESPONSE);
  });

  test("GET_TIME_RESPONSE entry decodes payload and emits 'timeSync'", () => {

    const { host, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(42, 0);
    const payload = encodeProtoFields([{ fieldNumber: 1, value: buf, wireType: WireType.FIXED32 }]);

    handlers[MessageType.GET_TIME_RESPONSE]!(inbound(MessageType.GET_TIME_RESPONSE, payload));

    assert.deepEqual(events, [42]);
  });

  test("SUBSCRIBE_LOGS_RESPONSE entry routes payload to host.handleLogResponse", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const payload = Buffer.from([0x55]);

    handlers[MessageType.SUBSCRIBE_LOGS_RESPONSE]!(inbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, payload));

    assert.equal(invocations.handleLogResponse.length, 1);
    assert.deepEqual(invocations.handleLogResponse[0], payload);
  });

  test("CAMERA_IMAGE_RESPONSE entry routes payload to host.handleCameraImageResponse", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const payload = Buffer.from([0x77]);

    handlers[MessageType.CAMERA_IMAGE_RESPONSE]!(inbound(MessageType.CAMERA_IMAGE_RESPONSE, payload));

    assert.equal(invocations.handleCameraImageResponse.length, 1);
    assert.deepEqual(invocations.handleCameraImageResponse[0], payload);
  });

  test("NOISE_ENCRYPTION_SET_KEY_RESPONSE entry routes payload to host.handleNoiseKeySetResponse", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const payload = Buffer.from([ 0x08, 0x01 ]);

    handlers[MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE]!(inbound(MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE, payload));

    assert.equal(invocations.handleNoiseKeySetResponse.length, 1);
    assert.deepEqual(invocations.handleNoiseKeySetResponse[0], payload);
  });

  test("voice-assistant entries dispatch through the inbound context (one event per type)", () => {

    const { host, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    let requestEvents = 0;
    let audioEvents = 0;
    let configEvents = 0;
    let announceEvents = 0;

    bus.on("voiceAssistantRequest", () => requestEvents++);
    bus.on("voiceAssistantAudio", () => audioEvents++);
    bus.on("voiceAssistantConfiguration", () => configEvents++);
    bus.on("voiceAssistantAnnounceFinished", () => announceEvents++);

    handlers[MessageType.VOICE_ASSISTANT_REQUEST]!(inbound(MessageType.VOICE_ASSISTANT_REQUEST,
      encodeProtoFields([{ fieldNumber: 4, value: 0, wireType: WireType.VARINT }])));
    handlers[MessageType.VOICE_ASSISTANT_AUDIO]!(inbound(MessageType.VOICE_ASSISTANT_AUDIO,
      encodeProtoFields([
        { fieldNumber: 1, value: Buffer.from([ 1, 2, 3 ]), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: 3, value: 0, wireType: WireType.VARINT }
      ])));
    handlers[MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE]!(inbound(MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE, Buffer.alloc(0)));
    handlers[MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED]!(inbound(MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED, Buffer.alloc(0)));

    assert.equal(requestEvents, 1);
    assert.equal(audioEvents, 1);
    assert.equal(configEvents, 1);
    assert.equal(announceEvents, 1);
  });

  test("home-assistant entries dispatch through the inbound context (one event per type)", () => {

    const { host, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    let serviceEvents = 0;
    let stateRequestEvents = 0;

    bus.on("homeassistantService", () => serviceEvents++);
    bus.on("homeassistantStateRequest", () => stateRequestEvents++);

    handlers[MessageType.HOMEASSISTANT_SERVICE_RESPONSE]!(inbound(MessageType.HOMEASSISTANT_SERVICE_RESPONSE,
      encodeProtoFields([{ fieldNumber: 1, value: Buffer.from("light.turn_on", "utf8"), wireType: WireType.LENGTH_DELIMITED }])));
    handlers[MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE]!(inbound(MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE,
      encodeProtoFields([
        { fieldNumber: 1, value: Buffer.from("sensor.temperature", "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: 3, value: 0, wireType: WireType.VARINT }
      ])));

    assert.equal(serviceEvents, 1);
    assert.equal(stateRequestEvents, 1);
  });

  test("default entry handles unknown types via the generic message + warn + metric path", () => {

    const { host, log, metrics, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const events: { payload: Buffer; type: number }[] = [];

    bus.on("message", (e) => events.push(e));

    const payload = Buffer.from([ 0xde, 0xad ]);
    const unknownType = 0x9999;

    handlers.default!(inbound(unknownType, payload));

    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, unknownType);
    assert.equal(log.warned.length, 1);
    assert.equal(metrics.length, 1);
  });
});

describe("run-phase-handlers - hot path", () => {

  test("dispatches 5000 mixed run-phase messages through buildRunPhaseHandlers without dropping or mis-routing", () => {

    const { host, invocations, outbound, bus } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);
    const heartbeats: undefined[] = [];

    bus.on("heartbeat", (e) => heartbeats.push(e));

    const N = 5000;
    let stateCount = 0;
    let pingRequestCount = 0;
    let pingResponseCount = 0;
    let logCount = 0;

    for(let i = 0; i < N; i++) {

      switch(i % 4) {

        case 0: {

          handlers[MessageType.PING_REQUEST]!(inbound(MessageType.PING_REQUEST));
          pingRequestCount++;

          break;
        }

        case 1: {

          handlers[MessageType.PING_RESPONSE]!(inbound(MessageType.PING_RESPONSE));
          pingResponseCount++;

          break;
        }

        case 2: {

          handlers.default!(inbound(MessageType.SENSOR_STATE_RESPONSE, Buffer.alloc(4)));
          stateCount++;

          break;
        }

        default: {

          handlers[MessageType.SUBSCRIBE_LOGS_RESPONSE]!(inbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, Buffer.alloc(2)));
          logCount++;

          break;
        }
      }
    }

    assert.equal(outbound.length, pingRequestCount, "expected one PING_RESPONSE per inbound PING_REQUEST");
    assert.equal(invocations.acknowledgePingResponse, pingResponseCount);
    assert.equal(invocations.handleTelemetry.length, stateCount);
    assert.equal(invocations.handleLogResponse.length, logCount);
    // PING_REQUEST and PING_RESPONSE both emit 'heartbeat'.
    assert.equal(heartbeats.length, pingRequestCount + pingResponseCount);
  });

  test("default-handler hot path classifies 1000 alternating telemetry / discovery / unknown-type messages correctly", () => {

    const { host, invocations, log } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    const N = 1000;
    let stateCount = 0;
    let listCount = 0;
    let unknownCount = 0;

    for(let i = 0; i < N; i++) {

      switch(i % 3) {

        case 0: {

          handlers.default!(inbound(MessageType.SENSOR_STATE_RESPONSE, Buffer.alloc(0)));
          stateCount++;

          break;
        }

        case 1: {

          handlers.default!(inbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, Buffer.alloc(0)));
          listCount++;

          break;
        }

        default: {

          handlers.default!(inbound(0xabcd, Buffer.alloc(0)));
          unknownCount++;

          break;
        }
      }
    }

    assert.equal(invocations.handleTelemetry.length, stateCount);
    assert.equal(invocations.handleListEntity.length, listCount);
    assert.equal(log.warned.length, unknownCount);
  });
});

describe("run-phase-handlers - documented edge cases", () => {

  test("late LIST_ENTITIES_SERVICES_RESPONSE during run phase routes to handleListServiceEntity (forward-compat)", () => {

    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers.default!(inbound(MessageType.LIST_ENTITIES_SERVICES_RESPONSE, Buffer.alloc(0)));

    assert.equal(invocations.handleListServiceEntity.length, 1);
    assert.equal(invocations.handleListEntity.length, 0);
  });

  test("PING_REQUEST entry uses send (frameAndSend) and never throws even if send is sync-broken", () => {

    let sendCalled = 0;

    const partial: Partial<RunPhaseHost> = {

      send: (): void => { sendCalled++; }
    };
    const { host } = buildHarness(partial);

    handlePingRequest(host);
    assert.equal(sendCalled, 1);
  });

  test("the heartbeat tap is NOT applied by buildRunPhaseHandlers (host owns the wrap)", () => {

    // Construct a host whose acknowledgePingResponse counts invocations; verify that buildRunPhaseHandlers passes the message through unwrapped (no extra activity stamp,
    // no extra invocation, no extra emission). The wrap is the host's tapInboundActivity concern - this test pins that contract.
    const { host, invocations } = buildHarness();
    const handlers = buildRunPhaseHandlers(host);

    handlers[MessageType.PING_RESPONSE]!(inbound(MessageType.PING_RESPONSE));

    // Only one invocation - if the wrap leaked into the new module, we would see additional bookkeeping.
    assert.equal(invocations.acknowledgePingResponse, 1);
  });

  test("default-handler emits 'message' BEFORE telemetry routing (so listeners always observe the raw frame even when it routes onward)", () => {

    const { host, bus } = buildHarness();
    const order: string[] = [];

    bus.on("message", () => order.push("message"));
    const harnessHost: RunPhaseHost = {

      ...host,
      handleTelemetry: (): void => { order.push("telemetry"); }
    };

    defaultRunPhaseHandler(harnessHost, inbound(MessageType.SENSOR_STATE_RESPONSE, Buffer.alloc(0)));

    assert.deepEqual(order, [ "message", "telemetry" ]);
  });
});

describe("run-phase-handlers - boundary values", () => {

  test("handleGetTimeResponse tolerates a payload with extra fields beyond field 1", () => {

    const { host, bus } = buildHarness();
    const events: number[] = [];

    bus.on("timeSync", (e) => events.push(e));

    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(123, 0);
    const payload = encodeProtoFields([

      { fieldNumber: 1, value: buf, wireType: WireType.FIXED32 },
      { fieldNumber: 2, value: 99, wireType: WireType.VARINT },
      { fieldNumber: 7, value: Buffer.from("ignored"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, payload));

    assert.deepEqual(events, [123]);
  });

  test("default-handler routes large payloads through the dispatcher without truncation", () => {

    const { host, log } = buildHarness();
    const big = Buffer.alloc(1024).fill(0xff);

    defaultRunPhaseHandler(host, inbound(0xfffd, big));

    // Warn line should include the payload hex.
    assert.equal(log.warned.length, 1);
    const warnLine = log.warned[0]!;

    assert.ok(warnLine.includes(big.toString("hex")), "warn line should include the full payload hex");
  });

  test("handleSubscribeLogsResponse forwards an empty payload to the host without throwing", () => {

    const { host, invocations } = buildHarness();
    const empty = Buffer.alloc(0);

    handleSubscribeLogsResponse(host, inbound(MessageType.SUBSCRIBE_LOGS_RESPONSE, empty));

    assert.equal(invocations.handleLogResponse.length, 1);
    assert.equal(invocations.handleLogResponse[0]!.length, 0);
  });
});

describe("run-phase-handlers - protocol decode side effects", () => {

  // Verify the decode helpers used by handleGetTimeResponse don't drift away from the host's bounded decoder. These tests exercise the seam contract directly: the host
  // owns decodeProtobuf and the bounded field-extractors live in protocol/, not on the host.
  test("the host's decodeProtobuf seam method is invoked by handleGetTimeResponse", () => {

    let decodeCalls = 0;
    const harness = buildHarness();
    const host: RunPhaseHost = {

      ...harness.host,
      decodeProtobuf: (buffer): Record<number, FieldValue[]> => {

        decodeCalls++;

        return decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* swallow */ } });
      }
    };

    handleGetTimeResponse(host, inbound(MessageType.GET_TIME_RESPONSE, Buffer.alloc(0)));

    assert.equal(decodeCalls, 1);
  });

  test("a synthesized GET_TIME_REQUEST reply round-trips back through extractNumberField when re-decoded", () => {

    // Sanity contract: handleGetTimeRequest's wire output is a valid protobuf the device can parse (here we re-parse with the canonical decoder + extractor pair).
    const { host, outbound } = buildHarness();

    handleGetTimeRequest(host);

    assert.equal(outbound.length, 1);
    const fields = decodeProtobuf(outbound[0]!.payload, { maxFieldsPerMessage: 16, warn: (): void => { /* swallow */ } });

    // Field 1 is fixed32, not varint, so extractNumberField returns undefined; the decoder still parses the frame without error.
    assert.equal(extractNumberField(fields, 1), undefined);
    assert.ok(Buffer.isBuffer(fields[1]?.[0]));
  });
});

describe("run-phase-handlers - mock.fn host seam", () => {

  // Verify the seam works with a typical mock.fn() pattern - this is the recommended testing surface for downstream consumers that build their own dispatcher harnesses.
  test("a mock.fn() acknowledgePingResponse records exactly one call when a PING_RESPONSE is dispatched", () => {

    const fn = mock.fn();
    const harness = buildHarness();
    const host: RunPhaseHost = { ...harness.host, acknowledgePingResponse: fn };

    handlePingResponse(host);

    assert.equal(fn.mock.callCount(), 1);
  });

  test("a mock.fn() handleTelemetry records exactly one call with (type, payload) when default-handler routes a state message", () => {

    const fn = mock.fn();
    const harness = buildHarness();
    const host: RunPhaseHost = { ...harness.host, handleTelemetry: fn };

    const payload = Buffer.from([0x42]);

    defaultRunPhaseHandler(host, inbound(MessageType.SENSOR_STATE_RESPONSE, payload));

    assert.equal(fn.mock.callCount(), 1);
    const call = fn.mock.calls[0]!;

    assert.equal(call.arguments[0], MessageType.SENSOR_STATE_RESPONSE);
    assert.deepEqual(call.arguments[1], payload);
  });
});

// Suppress unused-var lint on the LogEventData type-import; the import documents the seam's relationship to LogSubscriptionManager but no test instantiates it.
void (null as unknown as LogEventData);
