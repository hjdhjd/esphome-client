/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * run-phase-handlers.ts: Authoritative dispatch table for the run-phase {@link MessageReceiver.startDrain} hand-off.
 */

/**
 * Single source of truth for "what the client does when it receives each protocol message in steady-state." Implements every entry the host's
 * {@link EspHomeClient.connect} hands to {@link MessageReceiver.startDrain} once the setup phase finishes.
 *
 * @remarks Each per-{@link MessageType} handler is a named module-private function that receives the {@link RunPhaseHost} seam plus the inbound {@link InboundMessage}.
 * The module-level {@link buildRunPhaseHandlers} factory assembles those named functions into the {@link MessageHandlers} record the receiver consumes. Every handler is
 * individually exported so the test suite can call it directly with a stub host - the seam's narrowness is what makes that practical.
 *
 * The narrow seam pattern. The {@link RunPhaseHost} interface is intentionally small. It exposes only what every handler reasonably needs (the bus, the logger, the
 * frame-and-send hook, the bounded-protobuf decoder) plus a handful of host-side coordination methods that handlers delegate into for multi-step bodies (e.g.,
 * {@link RunPhaseHost.acknowledgePingResponse} bundles `consumePingRtt` + `healthRecord` mutation + `healthChange` emission so the handler stays a one-liner). The
 * decoders, registry mutators, and telemetry-routing helpers (`handleLogResponse`, `handleListEntity`, `handleTelemetry`, ...) stay on the host as named methods because
 * the wire-decoding pipeline is a host concern; the dispatcher delegates to them via the seam rather than pulling broad host state across the boundary.
 *
 * The heartbeat tap is not in this module. {@link buildRunPhaseHandlers} returns the bare unwrapped map; the host's `tapInboundActivity` wraps it so every dispatched
 * message stamps the heartbeat scheduler's activity timestamp. The wrap is a host concern (heartbeat lives on the host); keeping it out of this module preserves the
 * single-responsibility boundary - this module routes messages, the host coordinates liveness.
 *
 * The module-level {@link STATE_MESSAGE_TYPES} and {@link LIST_ENTITIES_MESSAGE_TYPES} constants are the default-table sets, computed once from the canonical
 * {@link ENTITY_SCHEMAS} registry. They are kept as exports for test ergonomics - tests building a stub {@link RunPhaseHost} can drop them straight into the seam
 * without rebuilding from a schemas table. The host class does NOT consume these directly; it builds per-instance sets from its own {@link
 * SchemasTable} (which folds the consumer's optional {@link ExtraSchemaSet} over the canonical floor) and threads them
 * through the {@link RunPhaseHost.stateMessageTypes} / {@link RunPhaseHost.listEntitiesMessageTypes} fields so an extras-registered entity type's wire-message-types
 * route through the same telemetry / late-discovery paths as built-ins. {@link defaultRunPhaseHandler} consults the seam-supplied sets (not the module-level ones) so
 * extras participate in routing.
 *
 * @module run-phase-handlers
 */
import type { ClientMetrics, EspHomeLogging } from "./types.ts";
import { FIXED32_FIELD_BYTES, encodeProtoFields, extractFixed32Field } from "./protocol/index.ts";
import { dispatchHomeAssistantStateRequest, dispatchHomeassistantService } from "./home-assistant.ts";
import {
  dispatchVoiceAssistantAnnounceFinished,
  dispatchVoiceAssistantAudio,
  dispatchVoiceAssistantConfiguration,
  dispatchVoiceAssistantRequest
} from "./voice-assistant.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EventBus } from "./event-bus.ts";
import type { FieldValue } from "./protocol/codec.ts";
import type { HomeAssistantInboundContext } from "./home-assistant.ts";
import type { InboundMessage } from "./transport.ts";
import type { MessageHandlers } from "./message-receiver.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { ProtoField } from "./protocol/index.ts";
import type { VoiceAssistantInboundContext } from "./voice-assistant.ts";
import { WireType } from "./protocol/wire-types.ts";

/**
 * Default-table set of inbound message types that carry entity-discovery information. Derived from the canonical {@link ENTITY_SCHEMAS} registry so adding a new
 * entity type only requires updating the schema; the user-defined-services list is the single non-entity entry and is added explicitly.
 *
 * @remarks This module-level constant is the no-extras-supplied set. The host class builds a per-instance superset from its {@link SchemasTable}
 * via {@link buildListEntitiesMessageTypes} so extras-registered entity types route through the same setup-phase awaiter and the run-phase
 * default-dispatcher's late-discovery branch. Tests that wire a stub {@link RunPhaseHost} can drop this constant into the seam unchanged.
 */
export const LIST_ENTITIES_MESSAGE_TYPES: ReadonlySet<number> = new Set<number>([

  ...Object.values(ENTITY_SCHEMAS).map((schema) => schema.listEntities.messageType),
  MessageType.LIST_ENTITIES_SERVICES_RESPONSE
]);

/**
 * Default-table set of inbound message types that carry telemetry-state updates. Derived from {@link ENTITY_SCHEMAS} for the same reason as
 * {@link LIST_ENTITIES_MESSAGE_TYPES}. `BUTTON_COMMAND_REQUEST` is special-cased because buttons are stateless on the wire and the client re-emits their command
 * echoes through the telemetry pipeline so consumers see a uniform state shape per entity.
 *
 * @remarks This module-level constant is the no-extras-supplied set; see {@link LIST_ENTITIES_MESSAGE_TYPES} for the per-instance vs. default-table distinction.
 */
export const STATE_MESSAGE_TYPES: ReadonlySet<number> = new Set<number>([

  ...Object.values(ENTITY_SCHEMAS).map((schema) => schema.state.messageType),
  MessageType.BUTTON_COMMAND_REQUEST
]);

/**
 * Narrow seam the run-phase dispatcher consumes from the host. Mirrors {@link LogSubscriptionManagerHost} /
 * {@link HeartbeatHost} - a small read surface (logger, bus, decoders, decode-and-emit contexts), a frame-send hook, and a handful of host-side coordination
 * methods that handlers delegate into for multi-step bodies that span subsystems the dispatcher does not own.
 *
 * @remarks Two design decisions hold the seam at this width. First, decoders, registry mutators, and telemetry routers stay on the host (`handleListEntity`,
 * `handleTelemetry`, `handleLogResponse`, `handleCameraImageResponse`, `handleNoiseKeySetResponse`, `handleListServiceEntity`) - they exist independently of the
 * dispatcher and pre-date this module; pulling them across the seam would be moving code, not architecture. Second, the multi-step coordination paths
 * (`acknowledgePingResponse`, `acknowledgeDisconnectRequest`, `acknowledgeDisconnectResponse`) bundle host-private state mutations behind a single named method per
 * handler so the dispatcher never reaches into host internals - the rule is: any handler that needs more than the read fields here delegates to a host method, and that
 * method becomes part of the seam.
 */
export interface RunPhaseHost {

  /**
   * Acknowledge an inbound `DISCONNECT_REQUEST` from the device. The host sends `DISCONNECT_RESPONSE` and runs `disconnectInternal("device disconnected", undefined)`
   * to fan out the disconnect event and tear down. Bundles the two coordination steps into one method so the handler stays a one-line delegate.
   */
  acknowledgeDisconnectRequest(): void;

  /**
   * Acknowledge an inbound `DISCONNECT_RESPONSE` from the device. The host resolves any pending graceful-disconnect awaiter (set by
   * {@link EspHomeClient.disconnectAsync}); when no awaiter is pending the host falls back to `disconnectInternal(undefined, undefined)` so a stray
   * `DISCONNECT_RESPONSE` still tears down the connection cleanly.
   */
  acknowledgeDisconnectResponse(): void;

  /**
   * Acknowledge an inbound `PING_RESPONSE` from the device. The host consumes the heartbeat scheduler's pending ping RTT, updates the {@link ConnectionHealth}
   * record with the freshly measured `lastPingRttMs`, and fires `healthChange` if and only if the consumption produced a value (the heartbeat may have already cleared
   * the marker on a stall, in which case there is nothing to record). Bundles the three steps so the handler stays a one-line delegate.
   */
  acknowledgePingResponse(): void;

  /**
   * Decode an inbound protobuf payload through the host's bounded decoder. The host enforces `maxFieldsPerMessage` and routes parser warnings to its logger; the
   * dispatcher reuses this single entry rather than re-implementing field decoding.
   *
   * @param buffer - The protobuf-encoded payload bytes.
   * @returns The decoded field map keyed by field number.
   */
  decodeProtobuf(buffer: Buffer): Record<number, FieldValue[]>;

  /**
   * Forward an inbound camera image chunk to the host's reassembly pipeline. The host owns the per-camera reassembly state via {@link CameraApi}; the
   * dispatcher hands the payload off and lets the camera pipeline emit the assembled image when it has received every chunk.
   *
   * @param payload - The raw `CAMERA_IMAGE_RESPONSE` payload bytes.
   */
  handleCameraImageResponse(payload: Buffer): void;

  /**
   * Apply an inbound `DEVICE_INFO_RESPONSE` arriving during run phase. ESPHome devices may push device-info refreshes after discovery completes
   * (firmware-update detection,
   * sub-device list changes, capability flag updates). The host decodes the payload through the same routine discovery uses, recomputes the cached
   * {@link ClientCapabilities} record (capabilities derive from `DeviceInfo + apiMinor + encrypted`, and `DeviceInfo` is the piece that can change
   * mid-session), and emits the `deviceInfo` event so consumers see the refresh.
   *
   * @param payload - The raw `DEVICE_INFO_RESPONSE` payload bytes.
   */
  handleDeviceInfoResponse(payload: Buffer): void;

  /**
   * Decode an inbound `EXECUTE_SERVICE_RESPONSE` and emit the `serviceCallResult` event. Sent by devices that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES` in
   * firmware to acknowledge the success/failure (and optional response payload) of a prior `EXECUTE_SERVICE_REQUEST`. Consumers correlate by `callId`.
   *
   * @param payload - The raw `EXECUTE_SERVICE_RESPONSE` payload bytes.
   */
  handleExecuteServiceResponse(payload: Buffer): void;

  /**
   * Forward an inbound entity-discovery payload (any `LIST_ENTITIES_*_RESPONSE` other than `LIST_ENTITIES_SERVICES_RESPONSE`) to the host's discovery decoder. The host
   * decodes via the schema registry and registers the entity through {@link EntityRegistry}.
   *
   * @param type - The wire message-type identifier; the host uses it to look up the matching schema.
   * @param payload - The raw discovery payload bytes.
   */
  handleListEntity(type: number, payload: Buffer): void;

  /**
   * Commit an inbound `LIST_ENTITIES_DONE_RESPONSE` arriving during run phase. The protocol only sends this in response to a `LIST_ENTITIES_REQUEST`; the host
   * issues that request only during connect-time discovery, so a run-phase delivery is unsolicited (typically a re-discovery push from a firmware that mutates its
   * entity set at runtime). The host recomputes each registry's `snapshotChanges()` and emits `entities` (and `services`, when the snapshot is non-empty) exactly
   * when the corresponding registry changed since the last snapshot, committing whatever entities or services the run-phase late-discovery branch registered.
   */
  handleListEntitiesDoneResponse(): void;

  /**
   * Forward an inbound `LIST_ENTITIES_SERVICES_RESPONSE` to the host's service-discovery decoder. The host decodes the service entity and registers it through
   * {@link ServiceRegistry}; arrivals during run phase are unexpected but tolerated for forward-compatibility.
   *
   * @param payload - The raw service-discovery payload bytes.
   */
  handleListServiceEntity(payload: Buffer): void;

  /**
   * Forward an inbound `SUBSCRIBE_LOGS_RESPONSE` to the host's log decoder. The host decodes the wire frame into {@link LogEventData}, hands the
   * structured event to {@link LogSubscriptionManager.dispatch}, and emits the per-message diagnostic.
   *
   * @param payload - The raw log-response payload bytes.
   */
  handleLogResponse(payload: Buffer): void;

  /**
   * Forward an inbound `NOISE_ENCRYPTION_SET_KEY_RESPONSE` to the host's noise-key resolver. The host owns the in-flight resolver promise that
   * {@link EspHomeClient.setNoiseEncryptionKey} awaits; the response settles the promise with the device-reported success bit.
   *
   * @param payload - The raw noise-key-response payload bytes.
   */
  handleNoiseKeySetResponse(payload: Buffer): void;

  /**
   * Forward an inbound state-message payload to the host's telemetry decoder. The host runs the schema-driven decoder to produce the per-entity
   * {@link TelemetryEvent}, updates the {@link LatestStateCache}, and emits the per-type plus generic `telemetry` events.
   *
   * @param type - The wire message-type identifier; the host uses it to look up the matching schema.
   * @param payload - The raw state payload bytes.
   */
  handleTelemetry(type: number, payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE` payload to the host's Bluetooth-proxy sub-API, which decodes the batched nested-message body and
   * fans each advertisement out as an individual `bluetoothAdvertisement` bus event.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothAdvertisementsBatch(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_SCANNER_STATE_RESPONSE` payload to the host's Bluetooth-proxy sub-API, which updates the cached snapshot and emits the
   * `bluetoothScannerState` bus event. Pushes are unsolicited at the wire level.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothScannerState(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_DEVICE_CONNECTION_RESPONSE` (id 69) to the host's Bluetooth-proxy sub-API. The sub-API branches on the `connected` boolean to
   * route between the connect and disconnect Correlators, updates the per-address cache, and emits the streaming `bluetoothConnectionState` event.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothDeviceConnectionResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_GET_SERVICES_RESPONSE` (id 71) to the host's Bluetooth-proxy sub-API, which accumulates the streamed service list keyed by
   * address until the matching Done sentinel (id 72) flushes it.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattGetServicesResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE` (id 72) to the host's Bluetooth-proxy sub-API, which resolves the `getServices` await with the
   * accumulated service list.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattGetServicesDoneResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_READ_RESPONSE` (id 74) to the host's Bluetooth-proxy sub-API, which resolves the matching `readCharacteristic` /
   * `readDescriptor` await.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattReadResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE` (id 79) to the host's Bluetooth-proxy sub-API, which emits the chunk on `bluetoothNotifyData`.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattNotifyDataResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_CONNECTIONS_FREE_RESPONSE` (id 81) to the host's Bluetooth-proxy sub-API, which updates the cached snapshot and emits
   * `bluetoothConnectionsFree`.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothConnectionsFreeResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_ERROR_RESPONSE` (id 82) to the host's Bluetooth-proxy sub-API, which routes through the try-each-Correlator-reject GATT-error
   * router. The first matching Correlator family wins; no auxiliary key map is needed because at most one Correlator has a pending entry per (address, handle) at a
   * time.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattErrorResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_WRITE_RESPONSE` (id 83) to the host's Bluetooth-proxy sub-API, which resolves the matching `writeCharacteristic(response=true)`
   * or `writeDescriptor` await.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattWriteResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_GATT_NOTIFY_RESPONSE` (id 84) to the host's Bluetooth-proxy sub-API, which resolves the matching `setNotify` await.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothGattNotifyResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_DEVICE_PAIRING_RESPONSE` (id 85) to the host's Bluetooth-proxy sub-API.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothDevicePairingResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_DEVICE_UNPAIRING_RESPONSE` (id 86) to the host's Bluetooth-proxy sub-API.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothDeviceUnpairingResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE` (id 88) to the host's Bluetooth-proxy sub-API.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothDeviceClearCacheResponse(payload: Buffer): void;

  /**
   * Forward an inbound `BLUETOOTH_SET_CONNECTION_PARAMS_RESPONSE` (id 146) to the host's Bluetooth-proxy sub-API, which settles the matching `setConnectionParams`
   * await.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleBluetoothSetConnectionParamsResponse(payload: Buffer): void;

  /**
   * Forward an inbound `SERIAL_PROXY_DATA_RECEIVED` payload to the host's serial-proxy sub-API, which decodes the per-instance bytes and emits the `serialData` event.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleSerialProxyData(payload: Buffer): void;

  /**
   * Forward an inbound `SERIAL_PROXY_GET_MODEM_PINS_RESPONSE` payload to the host's serial-proxy sub-API, which resolves the matching `getModemPins` await keyed by
   * instance.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleSerialProxyModemPinsResponse(payload: Buffer): void;

  /**
   * Forward an inbound `SERIAL_PROXY_REQUEST_RESPONSE` payload to the host's serial-proxy sub-API, which resolves the matching `flush` await keyed by instance.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleSerialProxyRequestResponse(payload: Buffer): void;

  /**
   * Forward an inbound `ZWAVE_PROXY_FRAME` (id 128) payload to the host's Z-Wave-proxy sub-API, which decodes the `bytes data` field and emits it on the `zwaveFrame`
   * bus event for streaming consumers.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleZWaveProxyFrame(payload: Buffer): void;

  /**
   * Forward an inbound `ZWAVE_PROXY_REQUEST` (id 129) payload to the host's Z-Wave-proxy sub-API. The only inbound request type the upstream firmware emits is
   * `HOME_ID_CHANGE`; unknown request types are logged at debug by the sub-API and dropped so a forward-compatible firmware cannot break this client.
   *
   * @param payload - The raw protobuf-payload bytes.
   */
  handleZWaveProxyRequest(payload: Buffer): void;

  /**
   * Pre-built decode-and-emit context for `HOMEASSISTANT_SERVICE_RESPONSE` and `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE` payloads. Constructed once on the host so the
   * dispatcher avoids per-message context allocation on the run-phase hot path.
   */
  readonly homeAssistantInboundContext: HomeAssistantInboundContext;

  /**
   * Logger interface used for per-handler debug lines plus the `default` handler's "unhandled message type" warning.
   */
  readonly log: EspHomeLogging;

  /**
   * Optional structured-metrics sink. The dispatcher emits `messages.unknown_type` from the `default` handler when a message arrives that is neither in
   * {@link RunPhaseHost.stateMessageTypes} nor in {@link RunPhaseHost.listEntitiesMessageTypes} and has no specific routing entry in the dispatch map.
   */
  readonly metrics: ClientMetrics | undefined;

  /**
   * Send a wire frame fire-and-forget. The host routes through `frameAndSend`, which picks plaintext vs. noise framing automatically and surfaces transport-level
   * errors via the disconnect path.
   *
   * @param type - The outbound message-type identifier.
   * @param payload - The encoded protobuf-payload bytes.
   */
  send(type: number, payload: Buffer): void;

  /**
   * Per-instance set of inbound message types that carry telemetry-state updates. The host builds this from its {@link SchemasTable} so
   * extras-registered entity types route through the telemetry path; the default-table {@link STATE_MESSAGE_TYPES} export is kept for test ergonomics. The
   * dispatcher consults this seam field (not the module-level constant) so extras participate in routing.
   */
  readonly stateMessageTypes: ReadonlySet<number>;

  /**
   * Per-instance set of inbound message types that carry entity-discovery information. Same per-instance vs. default-table story as {@link stateMessageTypes}; the
   * {@link defaultRunPhaseHandler}'s late-discovery branch reads this field so an extras-registered `LIST_ENTITIES_*_RESPONSE` arriving during run phase still
   * routes through {@link RunPhaseHost.handleListEntity}.
   */
  readonly listEntitiesMessageTypes: ReadonlySet<number>;

  /**
   * Pre-built decode-and-emit context for `VOICE_ASSISTANT_REQUEST`, `VOICE_ASSISTANT_AUDIO`, `VOICE_ASSISTANT_CONFIGURATION_RESPONSE`, and
   * `VOICE_ASSISTANT_ANNOUNCE_FINISHED` payloads. Constructed once on the host so the dispatcher avoids per-message context allocation on the run-phase voice-assistant
   * audio-frame path.
   */
  readonly voiceAssistantInboundContext: VoiceAssistantInboundContext;

  /**
   * Bus the dispatcher emits run-phase {@link ClientEventsMap} events through (`heartbeat`, `timeSync`, `message`).
   */
  readonly bus: EventBus<ClientEventsMap>;
}

/**
 * Handle inbound `PING_REQUEST`. Replies with an empty-payload `PING_RESPONSE` and emits the `heartbeat` event so consumers observing connection liveness see one tick
 * per inbound ping.
 *
 * @param host - The run-phase seam.
 */
export function handlePingRequest(host: RunPhaseHost): void {

  host.log.debug("Received PingRequest, replying.");
  host.send(MessageType.PING_RESPONSE, Buffer.alloc(0));
  host.bus.emit("heartbeat", undefined);
}

/**
 * Handle inbound `PING_RESPONSE`. Delegates to {@link RunPhaseHost.acknowledgePingResponse} (which consumes the heartbeat scheduler's pending RTT, updates
 * {@link LiveConnectionHealth.lastPingRttMs}, and fires `healthChange` only when an RTT was produced) and then emits the `heartbeat` event for consumers that
 * observe connection liveness directly.
 *
 * @param host - The run-phase seam.
 */
export function handlePingResponse(host: RunPhaseHost): void {

  host.acknowledgePingResponse();
  host.bus.emit("heartbeat", undefined);
}

/**
 * Handle inbound `DISCONNECT_REQUEST` from the device. Delegates to {@link RunPhaseHost.acknowledgeDisconnectRequest}, which sends `DISCONNECT_RESPONSE` and runs the
 * host's internal teardown so auto-reconnect (when enabled) can pick up.
 *
 * @param host - The run-phase seam.
 */
export function handleDisconnectRequest(host: RunPhaseHost): void {

  host.acknowledgeDisconnectRequest();
}

/**
 * Handle inbound `DISCONNECT_RESPONSE` from the device. Delegates to {@link RunPhaseHost.acknowledgeDisconnectResponse}, which resolves any pending graceful-disconnect
 * awaiter set by {@link EspHomeClient.disconnectAsync} and falls back to `disconnectInternal(undefined, undefined)` when no awaiter is pending - a
 * stray response after the graceful timeout already fired still tears the connection down cleanly.
 *
 * @param host - The run-phase seam.
 */
export function handleDisconnectResponse(host: RunPhaseHost): void {

  host.acknowledgeDisconnectResponse();
}

/**
 * Handle inbound `GET_TIME_REQUEST`. Replies with the current epoch (seconds) encoded as a little-endian fixed32 field at field number 1. Self-contained on the
 * dispatcher because the response is a single field with a constant shape; no host coordination is required.
 *
 * @param host - The run-phase seam.
 */
export function handleGetTimeRequest(host: RunPhaseHost): void {

  const nowBuf = Buffer.alloc(FIXED32_FIELD_BYTES);

  nowBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 0);

  const fields: ProtoField[] = [{ fieldNumber: 1, value: nowBuf, wireType: WireType.FIXED32 }];

  host.send(MessageType.GET_TIME_RESPONSE, encodeProtoFields(fields));
}

/**
 * Handle inbound `GET_TIME_RESPONSE`. Decodes the fixed32 epoch field at field number 1 through the host's bounded decoder and the shared
 * {@link extractFixed32Field} helper, then emits the `timeSync` event when the decode produces a value. Missing or malformed payloads are silently dropped - the device
 * may have rejected the request, and there is nothing useful to surface to consumers in that case.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleGetTimeResponse(host: RunPhaseHost, msg: InboundMessage): void {

  const fields = host.decodeProtobuf(msg.payload);
  const epoch = extractFixed32Field(fields, 1);

  if(epoch !== undefined) {

    host.bus.emit("timeSync", epoch);
  }
}

/**
 * Handle inbound `SUBSCRIBE_LOGS_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleLogResponse}, which decodes the wire frame, hands the decoded
 * {@link LogEventData} to {@link LogSubscriptionManager.dispatch}, and emits the per-message diagnostic.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleSubscribeLogsResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleLogResponse(msg.payload);
}

/**
 * Handle inbound `CAMERA_IMAGE_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleCameraImageResponse}, which routes the chunk into the per-camera reassembly
 * pipeline owned by {@link CameraApi}.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleCameraImageResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleCameraImageResponse(msg.payload);
}

/**
 * Handle inbound `VOICE_ASSISTANT_REQUEST`. Routes through the host's pre-built {@link RunPhaseHost.voiceAssistantInboundContext}; the decoder owns the wire-format
 * concerns and the bus-emit path - the dispatcher just feeds it the payload.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleVoiceAssistantRequest(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchVoiceAssistantRequest(msg.payload, host.voiceAssistantInboundContext);
}

/**
 * Handle inbound `VOICE_ASSISTANT_ANNOUNCE_FINISHED`. Routes through {@link RunPhaseHost.voiceAssistantInboundContext}; see {@link handleVoiceAssistantRequest} for the
 * shape of the dispatch.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleVoiceAssistantAnnounceFinished(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchVoiceAssistantAnnounceFinished(msg.payload, host.voiceAssistantInboundContext);
}

/**
 * Handle inbound `VOICE_ASSISTANT_CONFIGURATION_RESPONSE`. Routes through {@link RunPhaseHost.voiceAssistantInboundContext}, which decodes the payload and emits the
 * configuration event on the bus. The voice-assistant API caches the configuration as a side effect of its own `voiceAssistantConfiguration` bus subscription - the
 * decoder holds no API instance and writes no cache directly.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleVoiceAssistantConfigurationResponse(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchVoiceAssistantConfiguration(msg.payload, host.voiceAssistantInboundContext);
}

/**
 * Handle inbound `VOICE_ASSISTANT_AUDIO`. Routes through {@link RunPhaseHost.voiceAssistantInboundContext}; this is the high-rate audio-chunk path during an active
 * voice-assistant session, so the per-message dispatch must avoid allocations - the pre-built context is the optimization this path depends on.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleVoiceAssistantAudio(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchVoiceAssistantAudio(msg.payload, host.voiceAssistantInboundContext);
}

/**
 * Handle inbound `HOMEASSISTANT_SERVICE_RESPONSE`. Routes through {@link RunPhaseHost.homeAssistantInboundContext}; the decoder fans the payload out as the
 * `homeassistantService` event, which Home Assistant integration code observes.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleHomeassistantServiceResponse(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchHomeassistantService(msg.payload, host.homeAssistantInboundContext);
}

/**
 * Handle inbound `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE`. Routes through {@link RunPhaseHost.homeAssistantInboundContext}; the decoder emits the
 * `homeassistantStateRequest` event so consumers can supply the requested entity state back to the device.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleSubscribeHomeAssistantStateResponse(host: RunPhaseHost, msg: InboundMessage): void {

  dispatchHomeAssistantStateRequest(msg.payload, host.homeAssistantInboundContext);
}

/**
 * Handle inbound `NOISE_ENCRYPTION_SET_KEY_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleNoiseKeySetResponse}, which settles the in-flight resolver promise
 * that {@link EspHomeClient.setNoiseEncryptionKey} awaits.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleNoiseEncryptionSetKeyResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleNoiseKeySetResponse(msg.payload);
}

/**
 * Handle inbound `DEVICE_INFO_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleDeviceInfoResponse}, which decodes the payload, refreshes the capabilities cache,
 * and emits the `deviceInfo` event. Run-phase delivery is the device's way of pushing a mid-session device-info refresh; the dispatcher routes it through the same
 * decode path discovery uses so consumer-visible state stays consistent.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleDeviceInfoResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleDeviceInfoResponse(msg.payload);
}

/**
 * Handle inbound `LIST_ENTITIES_DONE_RESPONSE`. Run-phase arrival is unsolicited (the protocol only sends this in response to a `LIST_ENTITIES_REQUEST`, which the
 * host issues only during connect-time discovery). One-line delegate to {@link RunPhaseHost.handleListEntitiesDoneResponse}, which commits the mid-session
 * rediscovery by emitting `entities` and/or `services` for whichever registries changed since the last snapshot. Wired so the message does not fall through to
 * the default handler's "Unhandled message type" warning.
 *
 * @param host - The run-phase seam.
 */
export function handleListEntitiesDoneResponse(host: RunPhaseHost): void {

  host.handleListEntitiesDoneResponse();
}

/**
 * Handle inbound `EXECUTE_SERVICE_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleExecuteServiceResponse}, which decodes the payload and emits
 * `serviceCallResult` for consumers correlating to a prior `executeService` call.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleExecuteServiceResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleExecuteServiceResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleBluetoothAdvertisementsBatch}, which fans each batched
 * advertisement out as an individual `bluetoothAdvertisement` bus event after decoding.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothAdvertisementsBatch(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothAdvertisementsBatch(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_SCANNER_STATE_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleBluetoothScannerState}, which updates the cached snapshot and
 * emits the `bluetoothScannerState` bus event. Scanner-state pushes are unsolicited at the wire level.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothScannerState(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothScannerState(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_DEVICE_CONNECTION_RESPONSE` (id 69). One-line delegate; the sub-API distinguishes connect vs disconnect via the `connected` boolean.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothDeviceConnectionResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothDeviceConnectionResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_GET_SERVICES_RESPONSE` (id 71). Streamed; accumulated by the sub-API.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattGetServicesResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattGetServicesResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE` (id 72). Sentinel terminator for service discovery.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattGetServicesDoneResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattGetServicesDoneResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_READ_RESPONSE` (id 74). Shared response for characteristic and descriptor reads.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattReadResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattReadResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE` (id 79). Per-(address, handle) notification chunk.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattNotifyDataResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattNotifyDataResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_CONNECTIONS_FREE_RESPONSE` (id 81). Pushed on subscribe and on every change.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothConnectionsFreeResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothConnectionsFreeResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_ERROR_RESPONSE` (id 82). Routed through the try-each-Correlator-reject pattern in the sub-API.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattErrorResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattErrorResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_WRITE_RESPONSE` (id 83). Shared response for characteristic and descriptor writes.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattWriteResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattWriteResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_GATT_NOTIFY_RESPONSE` (id 84). Acknowledges `setNotify`.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothGattNotifyResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothGattNotifyResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_DEVICE_PAIRING_RESPONSE` (id 85).
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothDevicePairingResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothDevicePairingResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_DEVICE_UNPAIRING_RESPONSE` (id 86).
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothDeviceUnpairingResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothDeviceUnpairingResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE` (id 88).
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothDeviceClearCacheResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothDeviceClearCacheResponse(msg.payload);
}

/**
 * Handle inbound `BLUETOOTH_SET_CONNECTION_PARAMS_RESPONSE` (id 146).
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleBluetoothSetConnectionParamsResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleBluetoothSetConnectionParamsResponse(msg.payload);
}

/**
 * Handle inbound `SERIAL_PROXY_DATA_RECEIVED`. One-line delegate to {@link RunPhaseHost.handleSerialProxyData}, which routes the chunk through the serial-proxy
 * sub-API's `acceptDataMessage` decoder.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleSerialProxyData(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleSerialProxyData(msg.payload);
}

/**
 * Handle inbound `SERIAL_PROXY_GET_MODEM_PINS_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleSerialProxyModemPinsResponse}, which resolves the matching
 * `getModemPins` await on the serial-proxy sub-API.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleSerialProxyModemPinsResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleSerialProxyModemPinsResponse(msg.payload);
}

/**
 * Handle inbound `SERIAL_PROXY_REQUEST_RESPONSE`. One-line delegate to {@link RunPhaseHost.handleSerialProxyRequestResponse}, which resolves the matching `flush`
 * await on the serial-proxy sub-API.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleSerialProxyRequestResponse(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleSerialProxyRequestResponse(msg.payload);
}

/**
 * Handle inbound `ZWAVE_PROXY_FRAME` (id 128). One-line delegate to {@link RunPhaseHost.handleZWaveProxyFrame}, which routes the chunk through the Z-Wave-proxy
 * sub-API's `acceptFrame` decoder.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleZWaveProxyFrame(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleZWaveProxyFrame(msg.payload);
}

/**
 * Handle inbound `ZWAVE_PROXY_REQUEST` (id 129). One-line delegate to {@link RunPhaseHost.handleZWaveProxyRequest}; the sub-API decodes the tag and routes
 * HOME_ID_CHANGE to the bus while ignoring unknown request types at debug.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function handleZWaveProxyRequest(host: RunPhaseHost, msg: InboundMessage): void {

  host.handleZWaveProxyRequest(msg.payload);
}

/**
 * Catch-all for inbound message types that are not in the dispatch map. Always emits the generic `message` event for low-level consumers that observe the raw frame
 * stream, then routes the message based on its membership:
 *
 * - {@link STATE_MESSAGE_TYPES} - hand off to {@link RunPhaseHost.handleTelemetry} so the schema-driven decoder updates {@link LatestStateCache} and
 *   emits the per-type plus generic `telemetry` events.
 * - {@link LIST_ENTITIES_MESSAGE_TYPES} - hand off to {@link RunPhaseHost.handleListEntity} (or {@link RunPhaseHost.handleListServiceEntity} for the service variant). A
 *   late `LIST_ENTITIES_*_RESPONSE` is unexpected during run phase - discovery completes during setup - but the router tolerates it for forward-compatibility with
 *   firmwares that retransmit a discovery entry.
 * - Anything else - log a warning at warn level naming the message type plus the payload hex, then increment the `messages.unknown_type` metric so operators can detect
 *   protocol drift.
 *
 * @param host - The run-phase seam.
 * @param msg - The inbound message.
 */
export function defaultRunPhaseHandler(host: RunPhaseHost, msg: InboundMessage): void {

  // Only build and emit the diagnostic `message` event when something is listening. listenerCount counts both on() callbacks and active stream() iterators, so a stream
  // consumer still receives it; on the common no-subscriber path this skips the per-frame { payload, type } allocation entirely - and narrows the window in which a
  // throwing `message` subscriber could abort this handler mid-frame before the telemetry routing below runs.
  if(host.bus.listenerCount("message") > 0) {

    host.bus.emit("message", { payload: msg.payload, type: msg.type });
  }

  if(host.stateMessageTypes.has(msg.type)) {

    host.handleTelemetry(msg.type, msg.payload);

    return;
  }

  if(host.listEntitiesMessageTypes.has(msg.type)) {

    if(msg.type === MessageType.LIST_ENTITIES_SERVICES_RESPONSE) {

      host.handleListServiceEntity(msg.payload);

    } else {

      host.handleListEntity(msg.type, msg.payload);
    }

    return;
  }

  host.log.warn("Unhandled message type: " + String(msg.type) + " | payload: " + msg.payload.toString("hex") + ".");
  host.metrics?.increment("messages.unknown_type", 1, { type: String(msg.type) });
}

/**
 * Build the run-phase {@link MessageHandlers} record handed to {@link MessageReceiver.startDrain}. The host calls this at the end of
 * {@link EspHomeClient.connect} (after every setup-phase awaiter has settled) and wraps the result via the host's own `tapInboundActivity` before
 * passing it to the receiver - the wrap stamps the
 * heartbeat scheduler's activity timestamp on every dispatched message and is intentionally not folded into this builder so the dispatcher's responsibility stays
 * narrow.
 *
 * @remarks Each entry is a small arrow that closes over `host` and forwards to the matching named handler; the named handlers are individually exported so the test
 * suite can call them directly without going through the builder. The map's `default` entry routes through {@link defaultRunPhaseHandler}, which owns the
 * telemetry / late-discovery routing decisions.
 *
 * @param host - The run-phase seam.
 * @returns The {@link MessageHandlers} record ready to pass to `startDrain` (after the host's `tapInboundActivity` wrap).
 */
export function buildRunPhaseHandlers(host: RunPhaseHost): MessageHandlers {

  return {

    [MessageType.BLUETOOTH_CONNECTIONS_FREE_RESPONSE]: (msg: InboundMessage): void => handleBluetoothConnectionsFreeResponse(host, msg),
    [MessageType.BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE]: (msg: InboundMessage): void => handleBluetoothDeviceClearCacheResponse(host, msg),
    [MessageType.BLUETOOTH_DEVICE_CONNECTION_RESPONSE]: (msg: InboundMessage): void => handleBluetoothDeviceConnectionResponse(host, msg),
    [MessageType.BLUETOOTH_DEVICE_PAIRING_RESPONSE]: (msg: InboundMessage): void => handleBluetoothDevicePairingResponse(host, msg),
    [MessageType.BLUETOOTH_DEVICE_UNPAIRING_RESPONSE]: (msg: InboundMessage): void => handleBluetoothDeviceUnpairingResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_ERROR_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattErrorResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattGetServicesDoneResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_GET_SERVICES_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattGetServicesResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattNotifyDataResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_NOTIFY_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattNotifyResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_READ_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattReadResponse(host, msg),
    [MessageType.BLUETOOTH_GATT_WRITE_RESPONSE]: (msg: InboundMessage): void => handleBluetoothGattWriteResponse(host, msg),
    [MessageType.BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE]: (msg: InboundMessage): void => handleBluetoothAdvertisementsBatch(host, msg),
    [MessageType.BLUETOOTH_SCANNER_STATE_RESPONSE]: (msg: InboundMessage): void => handleBluetoothScannerState(host, msg),
    [MessageType.BLUETOOTH_SET_CONNECTION_PARAMS_RESPONSE]: (msg: InboundMessage): void => handleBluetoothSetConnectionParamsResponse(host, msg),
    [MessageType.CAMERA_IMAGE_RESPONSE]: (msg: InboundMessage): void => handleCameraImageResponse(host, msg),
    [MessageType.DEVICE_INFO_RESPONSE]: (msg: InboundMessage): void => handleDeviceInfoResponse(host, msg),
    [MessageType.DISCONNECT_REQUEST]: (): void => handleDisconnectRequest(host),
    [MessageType.DISCONNECT_RESPONSE]: (): void => handleDisconnectResponse(host),
    [MessageType.EXECUTE_SERVICE_RESPONSE]: (msg: InboundMessage): void => handleExecuteServiceResponse(host, msg),
    [MessageType.GET_TIME_REQUEST]: (): void => handleGetTimeRequest(host),
    [MessageType.GET_TIME_RESPONSE]: (msg: InboundMessage): void => handleGetTimeResponse(host, msg),
    [MessageType.HOMEASSISTANT_SERVICE_RESPONSE]: (msg: InboundMessage): void => handleHomeassistantServiceResponse(host, msg),
    [MessageType.LIST_ENTITIES_DONE_RESPONSE]: (): void => handleListEntitiesDoneResponse(host),
    [MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE]: (msg: InboundMessage): void => handleNoiseEncryptionSetKeyResponse(host, msg),
    [MessageType.PING_REQUEST]: (): void => handlePingRequest(host),
    [MessageType.PING_RESPONSE]: (): void => handlePingResponse(host),
    [MessageType.SERIAL_PROXY_DATA_RECEIVED]: (msg: InboundMessage): void => handleSerialProxyData(host, msg),
    [MessageType.SERIAL_PROXY_GET_MODEM_PINS_RESPONSE]: (msg: InboundMessage): void => handleSerialProxyModemPinsResponse(host, msg),
    [MessageType.SERIAL_PROXY_REQUEST_RESPONSE]: (msg: InboundMessage): void => handleSerialProxyRequestResponse(host, msg),
    [MessageType.SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE]: (msg: InboundMessage): void => handleSubscribeHomeAssistantStateResponse(host, msg),
    [MessageType.SUBSCRIBE_LOGS_RESPONSE]: (msg: InboundMessage): void => handleSubscribeLogsResponse(host, msg),
    [MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED]: (msg: InboundMessage): void => handleVoiceAssistantAnnounceFinished(host, msg),
    [MessageType.VOICE_ASSISTANT_AUDIO]: (msg: InboundMessage): void => handleVoiceAssistantAudio(host, msg),
    [MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE]: (msg: InboundMessage): void => handleVoiceAssistantConfigurationResponse(host, msg),
    [MessageType.VOICE_ASSISTANT_REQUEST]: (msg: InboundMessage): void => handleVoiceAssistantRequest(host, msg),
    [MessageType.ZWAVE_PROXY_FRAME]: (msg: InboundMessage): void => handleZWaveProxyFrame(host, msg),
    [MessageType.ZWAVE_PROXY_REQUEST]: (msg: InboundMessage): void => handleZWaveProxyRequest(host, msg),
    default: (msg: InboundMessage): void => defaultRunPhaseHandler(host, msg)
  };
}
