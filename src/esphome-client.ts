/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.ts: ESPHome native API client with Noise encryption support.
 */

/**
 * ESPHome native API client - the main consumer entry point.
 *
 * @remarks Exports the host class {@link EspHomeClient}, the async {@link openEspHomeClient} factory, the typed {@link ClientEventsMap} event surface, and the
 * {@link EspHomeClientOptions} configuration shape. Per-symbol docstrings below document each export. The [README](https://github.com/hjdhjd/esphome-client#readme) is
 * the canonical consumer guide (entities, commands, telemetry, sub-APIs, schema extensions); runnable examples for every documented workflow live in
 * [`src/examples/showcase.ts`](./examples/showcase.ts).
 *
 * @module esphome-client
 */
import type { BackoffParameters, ReconnectConfig, ResolvedReconnectConfig } from "./reconnect.ts";
import type {
  ConnectionStateData as BluetoothConnectionStateData, ConnectionsFreeData as BluetoothConnectionsFreeData, BluetoothLERawAdvertisement,
  NotifyDataChunk as BluetoothNotifyDataChunk, BluetoothProxyHost, BluetoothScannerStateData
} from "./bluetooth-proxy.ts";
import type { ClientMetrics, EspHomeLogging, Nullable, PskResolver, ServiceEntity } from "./types.ts";
import type { ClockFn, HeartbeatConfig, HeartbeatHost } from "./heartbeat.ts";
import type { CommandAndAwaitOptions, CommandHost, NonAwaitableEntityType, TransmitEntityType } from "./command-runner.ts";
import type { CommandFor, StateEventFor } from "./schemas/derived.ts";
import {
  ConnectionClosedByPeerError, ConnectionError, ConnectionLostError, EncryptionKeyInvalidError, EspHomeError, PeerClosedDuringNoiseError, PermanentError
} from "./errors.ts";
import {
  ENTITY_SCHEMAS, buildListEntitiesMessageTypes, buildSchemaByListEntitiesMessageType, buildSchemaByStateMessageType, buildSchemasTable, buildStateMessageTypes,
  getSchemaIn
} from "./schemas/index.ts";
import type { Entity, EntitySchema, EntityType, ExtendedEntityType, ExtraSchemaSet, SchemaForExtended, SchemasTable, TelemetryEvent } from "./schemas/index.ts";
import { EventBus, endedAsyncIterable } from "./event-bus.ts";
import type { FieldValue, ProtoField } from "./protocol/codec.ts";
import { HealthState, connectedHealth, disconnectedHealth, downHealth, isConnectionLive } from "./health.ts";
import type { HomeAssistantApiHost, HomeAssistantServiceEvent, HomeAssistantStateRequest } from "./home-assistant.ts";
import type { InboundMessage, TransportLike, TransportOpenOptions } from "./transport.ts";
import { MessageType, WireType, extractEntityKey, extractNumberField, extractStringField, extractTelemetryValue, messageTypeName } from "./protocol/index.ts";
import type { SerialDataChunk, SerialProxyHost, SerialProxyInfo } from "./serial-proxy.ts";
import { SerialProxyApi, extractSerialProxies } from "./serial-proxy.ts";
import { Transport, formatHostPort, unbracketHost } from "./transport.ts";
import type { VoiceAssistantHost, VoiceAssistantInboundContext } from "./voice-assistant.ts";
import { assertTransmitter, runCommand, runCommandAndAwait } from "./command-runner.ts";
import { authenticateIfNeeded, performDiscovery, performNoiseHandshake, performPlaintextHandshake } from "./lifecycle/handshake.ts";
import { backoffDelay, nextBackoffDelay, resolveReconnectConfig } from "./reconnect.ts";
import { composeRequestSignal, connectionLostError, requireConnection } from "./connection-scope.ts";
import { decodeEntityFromSchema, decodeServiceEntity, getEntityTypeLabel } from "./discovery.ts";
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { disconnectedCapabilities, parseCapabilities } from "./capabilities.ts";
import { BluetoothProxyApi } from "./bluetooth-proxy.ts";
import { Buffer } from "node:buffer";
import { CameraApi } from "./camera.ts";
import type { CameraHost } from "./camera.ts";
import type { ClientCapabilities } from "./capabilities.ts";
import type { ConnectionHealth } from "./health.ts";
import type { ConnectionScope } from "./connection-scope.ts";
import { Correlator } from "./correlator.ts";
import type { EntityId } from "./entity-id.ts";
import { EntityRegistry } from "./registries/entity-registry.ts";
import { HeartbeatScheduler } from "./heartbeat.ts";
import type { HeartbeatStalledError } from "./errors.ts";
import { HomeAssistantApi } from "./home-assistant.ts";
import { LatestStateCache } from "./latest-state-cache.ts";
import type { LifecycleEvent } from "./lifecycle.ts";
import { LogLevel } from "./api-constants.ts";
import { LogSubscriptionManager } from "./log-subscription-manager.ts";
import type { LogSubscriptionManagerHost } from "./log-subscription-manager.ts";
import type { MessageHandlers } from "./message-receiver.ts";
import { MessageReceiver } from "./message-receiver.ts";
import { NOISE_PSK_LEN } from "./crypto-noise.ts";
import { ReadableStream } from "node:stream/web";
import type { RunPhaseHost } from "./run-phase-handlers.ts";
import { ServiceRegistry } from "./registries/service-registry.ts";
import type { StreamOptions } from "./event-bus.ts";
import type { SubDevice } from "./sub-device.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";
import { UserServicesApi } from "./user-services.ts";
import { VoiceAssistantApi } from "./voice-assistant.ts";
import type { VoiceAssistantTimerEvent } from "./api-constants.ts";
import { ZWaveProxyApi } from "./zwave-proxy.ts";
import type { ZWaveProxyHost } from "./zwave-proxy.ts";
import { buildRunPhaseHandlers } from "./run-phase-handlers.ts";
import { decodeStateFromSchema } from "./telemetry.ts";
import { extractSubDevices } from "./sub-device.ts";
import { entityId as mintEntityId } from "./entity-id.ts";

// Default resource bounds. Each is overridable via EspHomeClientOptions. Sized against observed real-world workloads: 1 MiB frame for camera images, 1024 fields per
// message for entity discovery on large devices, 4 MiB buffer to allow burst-traffic margin during enumeration on devices with hundreds of entities.
const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_MAX_FIELDS_PER_MESSAGE = 1024;
const DEFAULT_MAX_RECV_BUFFER_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Default handshake-phase timeout. Bounds each phase of the connect handshake (the noise handshake, the hello exchange, authentication, and entity discovery) with its
// own AbortSignal.timeout, composed with the overall connect signal. Tunable via EspHomeClientOptions.handshakeTimeoutMs.
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;

// Default overall connect timeout. Bounds the transport open + handshake + discovery phases when the consumer does not supply their own AbortSignal. Composed with
// the user signal via AbortSignal.any so either trigger aborts the in-flight connect.
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;

// Default graceful disconnect window. {@link EspHomeClient.disconnectAsync} sends DISCONNECT_REQUEST and waits this long for the matching response before falling
// through to immediate teardown. Long enough to give a healthy device time to acknowledge, short enough that a hung device doesn't stall consumer shutdown.
const DEFAULT_GRACEFUL_DISCONNECT_TIMEOUT_MS = 1000;

// Default bound on the noise-encryption-key set request/response round-trip. Unlike the three lifecycle timeouts above, this is a per-call request/response await, so
// its structural siblings are the serial and command await timeouts in their own modules rather than the connection-lifecycle trio. setNoiseEncryptionKey is a rare
// administrative operation, so the bound is a module constant rather than a constructor option.
const DEFAULT_NOISE_KEY_SET_TIMEOUT_MS = 5000;

// Protocol-version negotiation: the supported major-version range is range-based - a peer's announced major must satisfy `min <= peerMajor <= max`. When ESPHome
// ships a major-version bump, this client adds support with a one-line constant change here rather than a new major version of this library.
const SUPPORTED_API_MAJORS = { max: 1, min: 1 } as const;

// Client API version we send in HELLO_REQUEST. Major must be in SUPPORTED_API_MAJORS; minor advertises feature parity with the upstream spec we implement. Bumping
// this constant is deliberate - it declares that we honestly support every feature at or below the advertised minor. See `api-feature-versions.ts` for the per-feature
// version floors that match this number. ESPHome 1.14 added the `clientDerivedObjectId` behavior (server omits `object_id` from `ListEntities*Response`); the
// discovery decoder handles both shapes via wire-first-with-fallback so this constant only needs to advance when a NEW capability requires implementation work.
const CLIENT_API_VERSION = { major: 1, minor: 14 } as const;

/**
 * Represents an argument value when executing a service.
 */
export interface ExecuteServiceArgumentValue {

  boolValue?: boolean;
  intValue?: number;
  floatValue?: number;
  stringValue?: string;
  boolArray?: boolean[];
  intArray?: number[];
  floatArray?: number[];
  stringArray?: string[];
}

/**
 * Voice assistant audio settings for configuring audio processing.
 *
 * @property autoGain - The automatic gain control setting.
 * @property noiseSuppressionLevel - The level of noise suppression to apply.
 * @property volumeMultiplier - The volume multiplier for audio output.
 */
export interface VoiceAssistantAudioSettings {

  autoGain: number;
  noiseSuppressionLevel: number;
  volumeMultiplier: number;
}

/**
 * Voice assistant event data that provides additional information about an event.
 *
 * @property name - The name of the event data field.
 * @property value - The value of the event data field.
 */
export interface VoiceAssistantEventData {

  name: string;
  value: string;
}

/**
 * Voice assistant wake word configuration.
 *
 * @property id - The unique identifier for the wake word.
 * @property wakeWord - The wake word phrase.
 * @property trainedLanguages - List of languages the wake word is trained for.
 */
export interface VoiceAssistantWakeWord {

  id: string;
  wakeWord: string;
  trainedLanguages: string[];
}

/**
 * Voice assistant configuration response.
 *
 * @property availableWakeWords - List of available wake words.
 * @property activeWakeWords - List of currently active wake word IDs.
 * @property maxActiveWakeWords - Maximum number of wake words that can be active.
 */
export interface VoiceAssistantConfiguration {

  availableWakeWords: VoiceAssistantWakeWord[];
  activeWakeWords: string[];
  maxActiveWakeWords: number;
}

/**
 * Voice assistant timer event data.
 *
 * @property eventType - The type of timer event.
 * @property timerId - The unique identifier for the timer.
 * @property name - The name of the timer.
 * @property totalSeconds - The total duration of the timer in seconds.
 * @property secondsLeft - The remaining time in seconds.
 * @property isActive - Whether the timer is currently active.
 */
export interface VoiceAssistantTimerEventData {

  eventType: VoiceAssistantTimerEvent;
  timerId: string;
  name: string;
  totalSeconds: number;
  secondsLeft: number;
  isActive: boolean;
}

/**
 * Voice assistant audio data for streaming audio.
 *
 * @property data - The audio data bytes (primary channel; mono on pre-1.14 firmware, left channel on stereo-capable firmware).
 * @property data2 - The second channel of a stereo audio stream (right channel). Present only when the device firmware supports the stereo audio extension; check
 *   `client.capabilities().voiceAssistant.stereoAudio` to know whether the connected device can send it. Always `undefined` on mono streams and pre-1.14 firmware.
 * @property end - Whether this is the last audio packet.
 */
export interface VoiceAssistantAudioData {

  data: Buffer;
  data2?: Buffer;
  end: boolean;
}

/**
 * Voice assistant request event data.
 *
 * @property audioSettings - The audio settings for the request.
 * @property conversationId - The unique identifier for the conversation.
 * @property flags - The voice assistant request flags.
 * @property start - Whether this is the start of a new request.
 * @property wakeWordPhrase - The detected wake word phrase, if any.
 */
export interface VoiceAssistantRequest {

  audioSettings?: VoiceAssistantAudioSettings;
  conversationId?: string;
  flags: number;
  start: boolean;
  wakeWordPhrase?: string;
}

/**
 * Device information received from the ESPHome device. This structure contains all metadata about the connected ESPHome device.
 *
 * @property usesPassword - Whether the device uses password authentication (field 1).
 * @property name - The name of the node, given by "App.set_name()" (field 2).
 * @property macAddress - The MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 3).
 * @property esphomeVersion - A string describing the ESPHome version (field 4).
 * @property compilationTime - The date of compilation (field 5).
 * @property model - The model of the board (e.g., NodeMCU) (field 6).
 * @property hasDeepSleep - Whether the device has deep sleep configured (field 7).
 * @property projectName - The ESPHome project name if set (field 8).
 * @property projectVersion - The ESPHome project version if set (field 9).
 * @property webserverPort - Port number of the web server if enabled (field 10).
 * @property legacyBluetoothProxyVersion - Legacy Bluetooth proxy version, deprecated (field 11).
 * @property manufacturer - The manufacturer of the device (field 12).
 * @property friendlyName - User-friendly name of the device (field 13).
 * @property legacyVoiceAssistantVersion - Legacy voice assistant version, deprecated (field 14).
 * @property bluetoothProxyFeatureFlags - Bluetooth proxy feature flags (field 15).
 * @property suggestedArea - Suggested area for the device (field 16).
 * @property voiceAssistantFeatureFlags - Voice assistant feature flags (field 17).
 * @property bluetoothMacAddress - The Bluetooth MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 18).
 * @property apiEncryptionSupported - Whether the device supports API encryption (field 19).
 * @property zwaveProxyFeatureFlags - Z-Wave-proxy feature-flags bitmask (field 23). Nonzero indicates the device firmware was compiled with `USE_ZWAVE_PROXY` and is
 * advertising the Z-Wave Serial-API byte-pipe surface; absent or zero indicates Z-Wave proxy is unavailable on this device. See {@link ZWaveProxyApi}.
 * @property zwaveHomeId - Z-Wave home id reported by the device's Z-Wave radio (field 24). Zero indicates no Z-Wave network is currently joined; absent indicates the
 * device firmware does not include the Z-Wave proxy component. The value is updated over the wire via `HOME_ID_CHANGE` request pushes and re-surfaced via
 * {@link ZWaveProxyApi.homeId}.
 * @property serialProxies - Per-instance metadata for every serial-proxy port advertised by the device (field 25). Empty (or absent) when the device firmware was not
 * compiled with `USE_SERIAL_PROXY`; otherwise the array index is the `instance` number used in every subsequent serial-proxy wire message.
 *
 * @remarks The client hands out one frozen record per `DeviceInfoResponse`: {@link EspHomeClient.deviceInfo} and the `deviceInfo` event carry the same object, and a
 * later response replaces it whole rather than mutating it.
 */
export interface DeviceInfo {

  readonly usesPassword?: boolean;
  readonly name?: string;
  readonly macAddress?: string;
  readonly esphomeVersion?: string;
  readonly compilationTime?: string;
  readonly model?: string;
  readonly hasDeepSleep?: boolean;
  readonly projectName?: string;
  readonly projectVersion?: string;
  readonly webserverPort?: number;
  readonly legacyBluetoothProxyVersion?: number;
  readonly manufacturer?: string;
  readonly friendlyName?: string;
  readonly legacyVoiceAssistantVersion?: number;
  readonly bluetoothProxyFeatureFlags?: number;
  readonly suggestedArea?: string;
  readonly voiceAssistantFeatureFlags?: number;
  readonly bluetoothMacAddress?: string;
  readonly apiEncryptionSupported?: boolean;
  readonly zwaveProxyFeatureFlags?: number;
  readonly zwaveHomeId?: number;
  readonly serialProxies?: readonly SerialProxyInfo[];
}

/**
 * Message event data. This structure is emitted with the 'message' event for raw protocol messages.
 */
export interface MessageEventData {

  type: number;
  payload: Buffer;
}

// Per-entity event shapes (LightEvent, ClimateEvent, etc.) and the TelemetryEvent union are derived from ENTITY_SCHEMAS via the schema-driven mapped types in
// src/schemas/derived.ts. The decoder produces those shapes directly; the type system traces every per-message payload back to the single schema source of truth.

/**
 * Schema-derived map of every entity-keyed event. One entry per key in {@link ENTITY_SCHEMAS}; the value is the consumer-facing
 * {@link StateEventFor} shape (wire base plus the {@link EventOverrides} entry, if any). Adding a new entity type to the schema registry extends
 * this map automatically - there is no parallel declaration to maintain. {@link ClientEventsMap} inherits these entries and adds only the non-entity event channels
 * alongside.
 */
type SchemaEvents = { [K in EntityType]: StateEventFor<typeof ENTITY_SCHEMAS[K]> };

/**
 * The complete set of events this client emits. Entity-keyed events are inherited from the module-private `SchemaEvents` map so the entry list tracks the schema
 * registry as the single source of truth. Non-entity events are listed explicitly below. This interface enables strongly typed `.on()`, `.once()`, and `.stream()`
 * overloads without resorting to `any`, and a typo in an entity event name surfaces as a compile error at the subscription site.
 */
export interface ClientEventsMap extends SchemaEvents {

  bluetoothAdvertisement: BluetoothLERawAdvertisement;
  bluetoothConnectionsFree: BluetoothConnectionsFreeData;
  bluetoothConnectionState: BluetoothConnectionStateData;
  bluetoothNotifyData: BluetoothNotifyDataChunk;
  bluetoothScannerState: BluetoothScannerStateData;
  connect: boolean;
  deviceInfo: DeviceInfo;
  disconnect: string | undefined;
  entities: Entity[];
  healthChange: ConnectionHealth;
  heartbeat: undefined;
  homeassistantService: HomeAssistantServiceEvent;
  homeassistantStateRequest: HomeAssistantStateRequest;
  lifecycle: LifecycleEvent;
  log: LogEventData;
  message: MessageEventData;
  noiseKeySet: boolean;
  serialData: SerialDataChunk;
  serviceCallResult: ServiceCallResult;
  serviceDiscovered: ServiceEntity;
  services: ServiceEntity[];
  telemetry: TelemetryEvent;

  /**
   * This event communicates a server-provided epoch time that is intended for time synchronization. It is deliberately separate from the telemetry "time" channel to
   * avoid event-name collision with a "time" entity update.
   */
  timeSync: number;
  voiceAssistantAnnounceFinished: boolean;
  voiceAssistantAudio: VoiceAssistantAudioData;
  voiceAssistantConfiguration: VoiceAssistantConfiguration;
  voiceAssistantRequest: VoiceAssistantRequest;
  zwaveFrame: Buffer;
  zwaveHomeIdChange: number;
}

/**
 * Log event data emitted when log messages are received from the ESPHome device. These provide insight into the device's internal operation and debugging information.
 *
 * @property level - The log level of the message (ERROR, WARN, INFO, DEBUG, VERBOSE, VERY_VERBOSE).
 * @property message - The actual log message text.
 * @property sendFailed - Whether sending the log message failed (optional).
 */
export interface LogEventData {

  level: LogLevel;
  message: string;
  sendFailed?: boolean;
}

/**
 * Result of a user-defined service execution. Emitted via the `serviceCallResult` event when the device reports back via `EXECUTE_SERVICE_RESPONSE` (only sent by
 * firmwares that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES`; older firmwares treat `executeService` as fire-and-forget and never produce this event).
 *
 * Consumers correlate results to their `executeService` calls via {@link callId}; the call id is supplied by the device-side service definition.
 *
 * @property callId - The numeric call id, matching the `call_id` carried on the originating `EXECUTE_SERVICE_REQUEST`.
 * @property success - Whether the device-side service handler ran successfully.
 * @property errorMessage - Human-readable error string when `success` is `false`. Absent on success.
 * @property responseData - Optional opaque response bytes (typically JSON-encoded) when the device-side service was defined with
 *   `USE_API_USER_DEFINED_ACTION_RESPONSES_JSON`.
 */
export interface ServiceCallResult {

  callId: number;
  errorMessage?: string;
  responseData?: Buffer;
  success: boolean;
}

/**
 * Configuration options for creating an ESPHome client instance. These options control how the client connects to and communicates with ESPHome devices.
 *
 * @typeParam Extras - Optional {@link ExtraSchemaSet} threaded through the client's type-system surface. Defaults to `{}` (no extras) so existing call sites continue
 * to type-check unchanged. When supplied, the public surface (`command`, `commandAndAwait`, `latest`, `snapshotFor`, `telemetryFor`, `telemetryForId`) widens to
 * accept the extras-keyed entity types alongside the built-in {@link EntityType} union.
 *
 * @property clientId - Optional client identifier to announce when connecting (default: "esphome-client").
 * @property extraSchemas - Optional registry of additional entity schemas registered for this client instance only. See {@link ExtraSchemaSet} for the contract.
 * @property logger - Optional logging interface for debug and error messages.
 * @property port - The port number for the ESPHome API (default: 6053).
 * @property psk - Optional Noise encryption key: the base64-encoded pre-shared key, or a {@link PskResolver} the client calls with the node name and MAC address the
 * device announces in its server hello, so the key can be selected per device at first contact. An empty string means no key.
 * @property serverName - Optional expected server name for validation during encrypted connections.
 *
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` default is required; see infrared-rf.types.test.ts.
export interface EspHomeClientOptions<Extras extends ExtraSchemaSet = {}> {

  clientId?: Nullable<string>;

  /**
   * Injectable wall clock. Defaults to `Date.now`. The client reads every elapsed-time and connection-uptime measurement through this function - the heartbeat
   * supervisor's idle/stall/RTT timing, the Noise handshake duration, and the connect-timing/health-epoch stamps - so a deterministic test can advance time without
   * real timers. Real consumers should leave this field unset and let the client use the system clock; test code injects a controllable clock. Note: the
   * `connectTimeoutMs` bound is an `AbortSignal.timeout` and is NOT governed by this clock.
   */
  clock?: ClockFn;

  /**
   * Overall connect timeout in milliseconds. Bounds the entire {@link EspHomeClient.connect} flow when the consumer does not pass their own AbortSignal. Composed with
   * the user signal via `AbortSignal.any` so either trigger aborts the in-flight connect. Default 30000.
   */
  connectTimeoutMs?: number;

  /**
   * Graceful disconnect timeout in milliseconds. {@link EspHomeClient.disconnectAsync} sends DISCONNECT_REQUEST and waits this long for the matching response before
   * falling through to immediate teardown. Default 1000. Sync {@link EspHomeClient.disconnect} ignores this option entirely.
   */
  gracefulDisconnectTimeoutMs?: number;

  /**
   * Handshake-phase timeout in milliseconds. Bounds each phase of the connect handshake (the noise handshake, the hello exchange, authentication, and entity discovery)
   * separately, so the messages within one phase share its window. Default 5000. Tune up for very slow devices, down for tighter test harnesses.
   */
  handshakeTimeoutMs?: number;

  /**
   * Optional registry of additional entity schemas. Registered for this client instance only - the module-level {@link ENTITY_SCHEMAS} is
   * left unchanged so two clients with disjoint extras never cross-pollinate. The merged registry is consulted by every downstream subsystem (run-phase dispatch,
   * command encoder,
   * discovery decoder, telemetry decoder) so extras-registered entity types route through the same schema-driven machinery as built-ins.
   *
   * @remarks Built-in entity-type keys are the floor and cannot be silently shadowed. Supplying an `extraSchemas` key that collides with a built-in throws a
   * {@link ConfigurationError} with code `EXTRA_SCHEMA_OVERRIDES_BUILTIN` at construction time. Use {@link aliasOf} for the common case
   * (custom type that mirrors an upstream type with a different name) or {@link extending} to add fields beyond the upstream shape.
   *
   */
  extraSchemas?: Extras;

  /**
   * Device address: a hostname, an IPv4 address, or an IPv6 literal. An IPv6 literal may be written with the surrounding square brackets of URL notation
   * (`[2001:db8::5]`), the spelling a browser address bar and this library's own display text both use; the brackets come off before the address reaches the socket,
   * so the bracketed and bare spellings address the same device.
   */
  host: string;

  /**
   * Lazy heartbeat configuration. When enabled (the default), the client sends `PING_REQUEST` after `intervalMs` of inbound silence and emits
   * {@link HeartbeatStalledError} if no inbound activity follows within `stallTimeoutMs`. Pass `false` to disable heartbeat entirely (useful for tests and short-lived
   * scripts). Default `{ intervalMs: 30000, stallTimeoutMs: 60000 }`.
   */
  keepAlive?: { intervalMs: number; stallTimeoutMs: number } | false;

  logger?: EspHomeLogging;

  /**
   * Optional metrics interface. When supplied, the library emits structured counters, timings, and gauges per the {@link ClientMetrics} contract. Default `undefined`
   * short-circuits to no overhead at all.
   */
  metrics?: ClientMetrics;

  /**
   * Maximum protobuf field count permitted in a single decoded message. The decoder allocates one record entry per field number; this caps that allocation to defend
   * against malformed or hostile devices that might emit a message claiming an unbounded number of fields. Default 1024 - far above any realistic ESPHome message
   * (typical: 5-50 fields). On an established connection, a message over the cap makes the decoder throw a `MessageTooManyFieldsError`; the receiver logs a warning
   * and drops that one message, and the connection stays up because the frame was received whole and the stream remains in sync, unlike `maxFrameBytes`, whose fault
   * ends the connection because an unbuffered frame cannot be skipped.
   */
  maxFieldsPerMessage?: number;

  /**
   * Maximum byte size for a single decoded protocol frame. Hard cap on how large any one inbound message may be; protects against malformed length-prefixes that would
   * otherwise drive an unbounded slice. Default 1 MiB - comfortably above camera image payloads (typically 50-200 KiB) and far below DoS-class allocations. Exceeding
   * triggers a `FrameTooLargeError` and disconnects the client.
   */
  maxFrameBytes?: number;

  /**
   * Maximum byte size of a single reassembled multi-packet camera image. ESPHome streams a camera image across multiple `CameraImageResponse` frames; the camera
   * sub-API accumulates them until the `done` flag, then concatenates. This bounds that above-transport accumulator - which `maxRecvBufferBytes` does not cover - so a
   * device that never sets `done`, or a `done` frame lost mid-image, cannot grow it without limit or silently corrupt the next image. Default 8 MiB, far above any
   * realistic ESPHome camera frame. Unlike the wire-boundary caps, exceeding this drops the in-flight image and emits a warning rather than disconnecting: a single
   * malformed image is a per-image fault, not a connection fault.
   */
  maxImageBytes?: number;

  /**
   * Maximum bytes allowed to accumulate in the receive buffer before declaring the device is sending garbage. Set higher than `maxFrameBytes` to allow legitimate burst
   * traffic during entity discovery on devices with hundreds of entities. Default 4 MiB. Exceeding triggers a `BufferOverflowError` and disconnects the client.
   */
  maxRecvBufferBytes?: number;

  port?: number;
  psk?: Nullable<string> | PskResolver;

  /**
   * Auto-reconnect configuration. When enabled (the default), a non-permanent disconnect of a session the client reported connected triggers a backoff-scheduled
   * reconnect; consumer-held subscriptions survive the cycle. Pass `false` to disable entirely. Default `{}` (defaults applied internally).
   */
  reconnect?: ReconnectConfig | false;

  serverName?: Nullable<string>;

  /**
   * Transport factory injection point. When provided, {@link EspHomeClient.connect} invokes this factory to construct a fresh `TransportLike` for
   * each handshake attempt instead of the default `Transport.open` path. The host owns and disposes whatever the factory returns.
   *
   * **Lifetime contract.** A `TransportLike` is single-shot: open, use, dispose. The factory is therefore called more than once per
   * {@link EspHomeClient.connect} invocation when the noise -> plaintext fallback fires (the failed transport is disposed and a fresh one constructed for the
   * plaintext retry). The factory MUST return a brand-new transport on each call.
   *
   * The factory receives the fully-resolved `TransportOpenOptions` the host would otherwise hand to `Transport.open` - host, port,
   * log, frame and buffer limits, optional metrics, and the composed connect signal. A factory that wraps the real transport (e.g. a recording tee) constructs it via
   * `Transport.open(options)` with no need to re-derive any of that configuration; a factory that returns an in-memory test transport may ignore the argument entirely.
   * The `options.signal` field composes the user-supplied connect signal with the host's overall connect timeout, so I/O-bearing factories should honour it.
   *
   * Real consumers should leave this field unset and let the host construct its own `Transport`. Test code uses this to inject a `MockTransport`
   * from the `esphome-client/testing` subpath - see the testing docs for the canonical wiring patterns.
   */
  transportFactory?: (options: TransportOpenOptions) => TransportLike | Promise<TransportLike>;
}

/**
 * Backoff configuration for the {@link openEspHomeClient} factory's bounded construction-retry loop.
 *
 * @remarks Construction retry is separate from runtime auto-reconnect by design: construction retry is bounded (default 3 retries after the initial attempt) so
 * misconfigurations surface quickly; runtime reconnect is unbounded so transient drops recover invisibly once the consumer has a working client.
 */
export interface ConstructionRetryConfig {

  /**
   * Multiplier applied to each successive delay. Default 2 (doubling backoff).
   */
  backoffMultiplier?: number;

  /**
   * Initial backoff in milliseconds before the first retry. Default 500.
   */
  initialDelayMs?: number;

  /**
   * Random jitter factor in [0, 1] applied to each delay. Default 0.2 (+/-20%). Prevents thundering-herd reconnects across multiple clients.
   */
  jitter?: number;

  /**
   * Upper bound on a single delay in milliseconds. Default 5000.
   */
  maxDelayMs?: number;
}

/**
 * Options accepted by {@link openEspHomeClient}. Inherits every {@link EspHomeClientOptions} field and adds the construction-retry knobs.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` default is required; see infrared-rf.types.test.ts.
export interface EspHomeClientOpenOptions<Extras extends ExtraSchemaSet = {}> extends EspHomeClientOptions<Extras> {

  /**
   * Backoff configuration for construction retries. Defaults: `initialDelayMs: 500`, `maxDelayMs: 5000`, `backoffMultiplier: 2`, `jitter: 0.2`.
   */
  constructionRetry?: ConstructionRetryConfig;

  /**
   * Maximum number of retries on transient connection failures. Permanent errors ({@link PermanentError} subclasses) reject immediately regardless. Default 3.
   */
  maxConstructionRetries?: number;

  /**
   * Cancellation signal applied to the entire factory call - both the initial attempt and any retries. Aborting rejects with the signal's reason, unless the
   * interrupted attempt failed permanently; see {@link openEspHomeClient}.
   */
  signal?: AbortSignal;
}

/**
 * Internal bundle returned by {@link EspHomeClient.openHandshakeContext} - the per-attempt setup-phase resources (transport, receiver, two interleave-handler
 * disposers). Bundled so the connect flow can dispose every resource together on noise -> plaintext fallback or fatal failure, and so the success path can hand off
 * the transport and receiver to the run phase as a unit.
 */
interface HandshakeContext {

  readonly discHandler: Disposable;
  readonly pingHandler: Disposable;
  readonly receiver: MessageReceiver;
  readonly transport: TransportLike;
}

/**
 * The step a connect attempt is running. The `CONNECT_FAILED` wrap a failure outside the typed hierarchy receives names it, so the step a connect failed in stays
 * observable on every announcement that wrap reaches and in the connect's debug line.
 */
type ConnectStep = "discovery" | "the hello exchange" | "the legacy authentication" | "the Noise handshake" | "the run-phase hand-off" | "the transport open";

/**
 * The session the host holds while a transport is attached: the transport, the run-phase receiver that drains it, and the connection scope every awaiting call
 * composes into its wait. One record holds them together, so a scope exists exactly while a transport is attached by the shape of the type rather than by writes kept in
 * step: the attach builds the record with a fresh scope, and the teardown takes it, clears the field, and aborts the scope in one step.
 */
interface AttachedSession {

  readonly receiver: MessageReceiver;
  readonly scope: AbortController;
  readonly transport: TransportLike;
}

/**
 * The ESPHome native-API client. The single high-level entry point for ESP8266/ESP32 devices running ESPHome firmware.
 *
 * The host class composes - never inherits - the carved subsystems that own the client surface end-to-end: a `Transport` for the wire (framing, cipher install,
 * socket lifetime); a run-phase `MessageReceiver` for the inbound dispatch pump; an `EventBus` for typed event delivery; a typed {@link EspHomeError}
 * hierarchy for failures; the schema-derived encode/decode pipeline for entity payloads; an `EntityRegistry` and a
 * `ServiceRegistry` as the single sources of truth for entity and service identity; a `LogSubscriptionManager` for
 * refcounted device-log subscriptions; a {@link HomeAssistantApi} for the
 * ESPHome `homeassistant.*` action / state-import surface; the run-phase handler table built by `buildRunPhaseHandlers`; the command
 * runners exported from `command-runner.ts` for {@link EspHomeClient.command} and {@link EspHomeClient.commandAndAwait}; a `HeartbeatScheduler` for keepalive
 * and stall detection; a `LatestStateCache` for synchronous latest-state reads; and a {@link ClientCapabilities} record built from the negotiated session.
 *
 * The client is event-driven via composition - it does **not** extend `EventEmitter`. Subscribe with {@link EspHomeClient.on} (returns `Disposable`),
 * {@link EspHomeClient.once} (returns `Promise<payload>`), or {@link EspHomeClient.stream} (returns `AsyncIterable<payload>` with backpressure). Subscriptions survive
 * reconnects: a handle issued before `connect()` keeps firing across disconnect/reconnect cycles unless the consumer disposes or aborts.
 *
 * ## Construction
 *
 * Two construction paths:
 *
 * - **{@link openEspHomeClient}** (preferred) - async factory with bounded retry on transient errors and an `AbortSignal`-aware open. Resolves with a connected client.
 * - **`new EspHomeClient(options)`** then `await client.connect()` - explicit two-step construction when the consumer needs to attach subscriptions before connect.
 *
 * ## Connection lifecycle
 *
 * `connect()` runs the linear handshake: TCP connect, `HelloRequest`/`HelloResponse`, optional Noise NNpsk0 handshake (with plaintext fallback when the peer closes
 * mid-noise or returns a plaintext frame), `ConnectRequest`/`ConnectResponse`, `DeviceInfoRequest`, `ListEntitiesRequest`, `SubscribeStatesRequest`. Failures surface
 * as typed errors from {@link EspHomeError} subclasses. Auto-reconnect is on by default with `PermanentError`-filtered retry; pass `reconnect: false` to opt out. Lazy
 * heartbeat (30s idle / 60s stall) is on by default; pass `keepAlive: false` to opt out. Live state is observable via {@link EspHomeClient.health},
 * {@link EspHomeClient.onHealthChange}, {@link EspHomeClient.healthStream}, and the typed {@link EspHomeClient.lifecycle} stream.
 *
 * ## Entity model
 *
 * Entities are identified by branded {@link EntityId}<T> values shaped `${type}-${objectId}`. Mint with {@link entityId}, narrow untrusted input with
 * {@link parseEntityId} or {@link isEntityId}. Send commands with {@link EspHomeClient.command}<T>(id, options) or
 * {@link EspHomeClient.commandAndAwait}<T>(id, options, awaitOptions); read latest cached state with {@link EspHomeClient.latest}<T>; enumerate snapshots with
 * {@link EspHomeClient.snapshot} / {@link EspHomeClient.snapshotFor}. Multi-device parents enumerate sub-devices via {@link EspHomeClient.subDevices} and filter the
 * entity list with {@link EspHomeClient.entitiesByDevice}.
 *
 * ## Sub-APIs
 *
 * - **{@link EspHomeClient.voiceAssistant}** - lazy single-instance voice-assistant API ({@link VoiceAssistantApi}).
 * - **{@link EspHomeClient.camera}**(id) - per-id camera API ({@link CameraApi}) with image buffering owned by the sub-API.
 *
 * The Home-Assistant integration surface lives under {@link EspHomeClient.homeAssistant} as a sub-API matching the pattern used by camera, voice-assistant,
 * bluetooth, serial, and zwave. The sub-API owns the outbound subscribe-and-respond surface (`subscribeServices`, `subscribeStates`, `sendState`,
 * `respondToAction`) and the memoized inbound-dispatcher context the run-phase dispatcher consumes for HA-bridge frames.
 *
 * ## Disposal
 *
 * Both `Symbol.dispose` and `Symbol.asyncDispose` are implemented. `using client = await openEspHomeClient(...)` binds sync disposal (immediate teardown);
 * `await using client = await openEspHomeClient(...)` binds async disposal (graceful path - sends `DISCONNECT_REQUEST` and awaits the response within the configured
 * timeout, then falls through to immediate teardown).
 *
 * Usage examples are kept exclusively in `src/examples/showcase.ts` so this docstring stays a single source of truth on **what the class is** and the showcase file
 * stays the single source of truth on **how to use it**. Regions in the showcase are type-checked against the live public API, so renames or signature changes break
 * the build before they ship.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#connect-then-construct}
 *
 * @see {@link openEspHomeClient}
 * @see {@link entityId}
 * @see {@link VoiceAssistantApi}
 * @see {@link CameraApi}
 * @see {@link ConnectionHealth}
 * @see {@link LifecycleEvent}
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` default is required; see infrared-rf.types.test.ts.
export class EspHomeClient<Extras extends ExtraSchemaSet = {}> {

  // The client information string to announce when we connect to an ESPHome device.
  private clientId: string;

  // Typed event bus. Composes node:events.EventEmitter internally; consumers see a curated `on`/`once`/`stream` facade with `Disposable` callback handles,
  // `Promise`-shaped one-shots, and `AsyncIterable` streams with backpressure policy.
  private readonly bus: EventBus<ClientEventsMap>;

  // The hostname or IP address of the ESPHome device.
  private host: string;

  // Logging interface for debug and error messages.
  private log: EspHomeLogging;

  // The port number for the ESPHome API connection.
  private port: number;

  // The attached session: the wire-level transport (the real `Transport` or a `MockTransport` from an injected {@link EspHomeClientOptions.transportFactory}), the
  // run-phase receiver that drains it, and the connection scope. Null between disconnect and the next attach. Attachment and the health record are separate facts:
  // the transport attaches before the health record reports connected, because the run-phase hand-off replays the setup buffer first, and a request a listener issues
  // during that replay is sent on the attached transport.
  private session: Nullable<AttachedSession> = null;

  // Optional transport factory handed in via {@link EspHomeClientOptions.transportFactory}. When set, {@link connect} calls this in place of `Transport.open`
  // for every handshake attempt - including the noise -> plaintext fallback retry. The host owns and disposes whatever the factory returns. Each invocation must
  // produce a fresh transport (the `TransportLike` contract is single-shot). The composed connect signal is forwarded to the factory so I/O-bound
  // implementations can honour cancellation.
  private readonly transportFactory: Nullable<(options: TransportOpenOptions) => TransportLike | Promise<TransportLike>>;

  // Device information received from the ESPHome device. A frozen record installed only through {@link setDeviceInfo}, so the getter and the `deviceInfo` event can hand
  // it out as-is.
  private remoteDeviceInfo: Nullable<DeviceInfo>;

  // Single source of truth for entity identity. Holds the branded-id <-> protocol-key bijection, the per-key entity record, the device-id overlay
  // populated by state messages, and the discovery-ordered entity list. Composed via a single private field; every entity-related public method on the host is a one-
  // line delegate to this object. The registry has no host-specific state and depends only on the host's logger via
  // {@link EntityRegistryHost}.
  private readonly registry: EntityRegistry;

  // Single source of truth for user-defined-service identity. Holds the discovery-ordered service list and the by-key index used by the execute
  // pipeline. Composed via a single private field; every service-related lookup on the host is a one-line delegate to this object. The registry has no host-specific
  // state and depends only on the host's logger via {@link ServiceRegistryHost}. Service execution and event coordination stay on the host (transport / event-bus
  // concerns).
  private readonly serviceRegistry: ServiceRegistry;

  // Per-image reassembly state for multi-packet camera images lives inside each {@link CameraApi} instance, keyed by branded camera id. The host's run-phase dispatcher
  // resolves the inbound entity-key to a `CameraApi` (constructing one lazily on first chunk so consumers that only subscribe to the bus event - never calling
  // `client.camera(id)` - still observe assembled images) and delegates the chunk; the instance publishes each assembled image back through {@link publishTelemetry}.

  // Latest-state cache. One {@link TelemetryEvent} per branded entity id, updated synchronously inside the run-phase state-message handler. Cleared on
  // every connect() so a fresh session starts with no inherited state. Read via the public `latest`, `snapshot`, and `snapshotFor` surfaces.
  private readonly latestCache: LatestStateCache;

  // Structured capability record. Built from the negotiated API minor version, the encrypted-transport flag, and the {@link DeviceInfo} response. Initialized
  // to the {@link disconnectedCapabilities} placeholder; rebuilt at the end of every successful connect() and reset on every connect-attempt teardown.
  private capabilitiesCache: ClientCapabilities;

  // Sub-device records reported by the parent ESP in `DeviceInfoResponse.devices`. Empty for the typical single-device configuration; populated when the
  // parent declares one or more sub-devices addressable via the protocol's `device_id` field.
  private subDeviceList: SubDevice[];

  // Refcounted log-subscription coordinator. Owns the per-iterator subscriber map, the cached device-side level, and the encoding/sending of
  // `SUBSCRIBE_LOGS_REQUEST` frames. The host composes this manager via a single field; every log-subscription public method on the host becomes a one-line delegate
  // to it. The manager has no host-specific state and depends only on the host's bus, logger, and frame-send hook via `LogSubscriptionManagerHost`.
  private readonly logManager: LogSubscriptionManager;

  // Voice-assistant sub-API. Lazy-instantiated on first access via the {@link voiceAssistant} getter; one instance per client for the lifetime of the client. Holds
  // its own connection-scoped state (subscription flag, cached configuration); reset on every connect.
  private voiceAssistantApi: Nullable<VoiceAssistantApi> = null;

  // User-defined services sub-API, lazily constructed on first access via the {@link EspHomeClient.services} getter. Stateless aside from its host reference; the
  // service registry, encoder, and frame-send hook flow through the `UserServicesApiHost` interface from this host.
  private userServicesApi: Nullable<UserServicesApi> = null;

  // Serial-proxy sub-API. Lazy-instantiated on first access via the {@link serial} getter; one instance per client for the lifetime of the client. Owns its own
  // connection-scoped state (two Correlator instances keyed by instance, plus a refcounted per-instance subscriber map); reset on every connect.
  private serialProxyApi: Nullable<SerialProxyApi> = null;

  // Bluetooth-proxy sub-API. Lazy-instantiated on first access via the {@link bluetooth} getter; one instance per client for the lifetime of the client. Owns its own
  // connection-scoped state (the global advertisement-subscription refcount, the cached scanner-state push); reset on every connect.
  private bluetoothProxyApi: Nullable<BluetoothProxyApi> = null;

  // Z-Wave-proxy sub-API. Lazy-instantiated on first access via the {@link zwave} getter; one instance per client for the lifetime of the client. Owns its own
  // connection-scoped state (the global frame-subscription refcount, the cached home id); reset on every connect.
  private zwaveProxyApi: Nullable<ZWaveProxyApi> = null;

  // Camera sub-API instances, keyed by branded camera id. Per-id cache so repeated `client.camera(id)` calls return the same object; instances survive reconnects and
  // take part in the subscription lifecycle, which resets each instance's connection-scoped state at both session boundaries and resends an open stream's request on
  // reconnect. The Map itself is never cleared: a camera id maps to one stable instance for the lifetime of the client.
  private readonly cameraInstances = new Map<EntityId<"camera">, CameraApi>();

  // Cached decode-and-emit context for the voice-assistant inbound dispatchers. Built once in the constructor so the per-message dispatch in the run-phase dispatch
  // table doesn't allocate a new context object for every inbound voice-assistant frame. The context closes over `this`'s bus/log/decoder.
  private readonly voiceAssistantInboundContext: VoiceAssistantInboundContext;

  // The Home-Assistant sub-API SSOT. Owns the outbound subscribe-and-respond surface (`subscribeServices`, `subscribeStates`, `sendState`, `respondToAction`) plus
  // the memoized inbound-dispatcher context the run-phase dispatcher consumes for `HOMEASSISTANT_SERVICE_RESPONSE` and `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE`
  // frames. Exposed publicly via the {@link EspHomeClient.homeAssistant} getter; the field is intentionally non-lazy because the dispatcher reads the inbound
  // context at construction time.
  private readonly homeAssistantApi: HomeAssistantApi;

  // Pre-built `RunPhaseHost` object for the run-phase dispatcher. The host composes it once at construction time so every connect() reuses
  // the same object; the dispatcher's per-{@link MessageType} handlers route through it (read fields plus host-side coordination methods) without ever
  // touching host private state directly. `buildRunPhaseHandlers` consumes it; the heartbeat-stamp wrap stays on the host where it belongs.
  private readonly runPhaseHost: RunPhaseHost;

  // Pre-built `CommandHost` object for the command runner. The host composes it once at construction time so every {@link command} and
  // {@link commandAndAwait} call reuses the same object; {@link runCommand} and {@link runCommandAndAwait} consume it. Narrow interface (bus, log, metrics, registry's
  // keyForId / deviceIdForKey, the schemas table's resolveSchema, frameAndSend hook); the runner owns the encode pipeline and the bus pre-subscription.
  private readonly commandHost: CommandHost;

  // The client's single elapsed-time/uptime clock, defaulting to `Date.now`. Every facade elapsed-time and connection-uptime read (connect-start, connect-duration,
  // health-epoch) goes through this, and it is threaded to the heartbeat scheduler so the supervisor's idle/stall/RTT math shares the same time base. Tests inject a
  // controllable function (via {@link EspHomeClientOptions.clock}) to drive deterministic timing without real timers.
  private readonly clock: ClockFn;

  // Heartbeat scheduler. Owns the supervisory timer, last-activity timestamp, and in-flight ping marker. A `null` constructor `config` means heartbeat
  // is disabled (`keepAlive: false`); otherwise it ticks the configured interval and surfaces stalls through the `HeartbeatHost` interface.
  private readonly heartbeat: HeartbeatScheduler;

  // Live connection-health record. A frozen value replaced whole on every transition through {@link setHealthRecord}, and emitted via the `healthChange` event for
  // streaming consumers, so the getter and every listener share one object that no reader can mutate.
  private healthRecord: ConnectionHealth = Object.freeze(disconnectedHealth());

  // Resolved auto-reconnect config. `null` when reconnect is disabled (`reconnect: false`).
  private readonly reconnectConfig: Nullable<ResolvedReconnectConfig>;

  // The active reconnect attempt's abort controller and counter. Reset to a fresh controller after each successful connect.
  private reconnectController: Nullable<AbortController> = null;
  private reconnectAttempts = 0;
  private reconnectInProgress = false;
  private explicitlyClosed = false;

  // The in-flight reconnect supervisor loop's promise, tracked so a manual `connect()` can cancel the loop AND await its current attempt fully settling before taking
  // over the connection state - guaranteeing the loop and a superseding manual connect never mutate `session`/registries/health concurrently. `null` when no loop runs.
  private reconnectLoopPromise: Nullable<Promise<void>> = null;

  // The abort controller of the most recent manual `connect()` still in flight, so a teardown can cancel a handshake the consumer has abandoned, the way
  // `reconnectController` cancels the reconnect loop's attempts. `null` when no manual connect is in flight.
  private connectController: Nullable<AbortController> = null;

  // The Noise encryption key resolver. A string key is held as a resolver that returns it, so the handshake has one key path for every key form; null means no key.
  private readonly resolvePsk: Nullable<PskResolver>;

  // The expected server name for validation (optional).
  private expectedServerName: Nullable<string>;

  // Correlator for the {@link EspHomeClient.setNoiseEncryptionKey} request/response pair. The single in-flight slot keys on `"default"`; the request response carries no
  // correlation id, so concurrent invocations are forbidden via the correlator's in-flight guard (surfaced as {@link ConnectionError} with code `KEY_SET_IN_FLIGHT`).
  private readonly noiseKeyCorrelator: Correlator<boolean>;

  // Device API minor version for protocol compatibility checks.
  private deviceApiMinorVersion: number;

  // Resource bounds applied at the wire boundary to defend against malformed or hostile devices. See EspHomeClientOptions for the per-field rationale and defaults.
  private readonly maxFrameBytes: number;
  private readonly maxFieldsPerMessage: number;
  private readonly maxRecvBufferBytes: number;
  private readonly maxImageBytes: number;

  // Handshake-phase timeout in milliseconds. Bounds each phase of the connect handshake declaratively via AbortSignal.timeout composition at each phase's call site.
  private readonly handshakeTimeoutMs: number;

  // Overall connect timeout in milliseconds. Bounds the entire connect() flow when the consumer does not pass their own AbortSignal. Composed with the user signal via
  // AbortSignal.any so either trigger aborts the in-flight connect.
  private readonly connectTimeoutMs: number;

  // Graceful-disconnect timeout. {@link EspHomeClient.disconnectAsync} sends DISCONNECT_REQUEST and waits up to this many milliseconds for a matching
  // response; on timeout the teardown proceeds anyway. Sync {@link EspHomeClient.disconnect} skips the handshake entirely.
  private readonly gracefulDisconnectTimeoutMs: number;

  // Correlator for the graceful-disconnect handshake. {@link EspHomeClient.disconnectAsync} awaits the `"graceful"` slot; the run-phase DISCONNECT_RESPONSE handler
  // resolves it. The single in-flight slot suffices because the device only acknowledges one disconnect at a time.
  private readonly disconnectCorrelator: Correlator<void>;

  // The graceful disconnect in progress, or `null` when none is. Every concurrent {@link EspHomeClient.disconnectAsync} call shares it, so the device sees one
  // DISCONNECT_REQUEST and the correlator's single slot has one awaiter. Set by the first call and cleared when that disconnect settles, including when a synchronous
  // disconnect or a teardown settles its correlator wait early.
  private disconnectInFlight: Nullable<Promise<void>> = null;

  // Per-instance schemas table. Built once at construction by merging the canonical {@link ENTITY_SCHEMAS} floor with the optional
  // {@link EspHomeClientOptions.extraSchemas}.
  // Every downstream consumer (run-phase dispatcher, command encoder, discovery decoder, telemetry decoder) consults this table - never the module-level constant
  // directly - so an extras-registered entity type's wire-message-types route through the same code paths as a built-in. Two clients with disjoint extras have disjoint
  // tables and do not see each other's registrations.
  private readonly schemasTable: SchemasTable;

  // Per-instance set of inbound state-message wire-message-types. Derived once from {@link schemasTable} via {@link buildStateMessageTypes}; threaded into the run-phase
  // dispatcher's `RunPhaseHost` so the default-handler's telemetry routing branch sees extras-registered state types.
  private readonly stateMessageTypes: ReadonlySet<number>;

  // Per-instance set of inbound list-entities wire-message-types. Derived once from {@link schemasTable} via {@link buildListEntitiesMessageTypes}; threaded into
  // each handshake context's `MessageReceiver`, the setup-phase discovery awaiter, and the `RunPhaseHost`, so an extras-registered `LIST_ENTITIES_*_RESPONSE` waits
  // uncapped in the receiver's setup buffer, is awaited during discovery, and is routed via the default-handler's late-discovery branch during run phase.
  private readonly listEntitiesMessageTypes: ReadonlySet<number>;

  // Per-instance lookup from inbound state-message wire-message-type to the schema that decodes it. Derived once from {@link schemasTable} via
  // {@link buildSchemaByStateMessageType}, so each state frame resolves its schema with one map read; the later schema in table order owns a shared type, which is how
  // an extras alias shadows the built-in it aliases.
  private readonly schemaByStateMessageType: ReadonlyMap<number, EntitySchema>;

  // Per-instance lookup from inbound list-entities wire-message-type to the schema that decodes it. Derived once from {@link schemasTable} via
  // {@link buildSchemaByListEntitiesMessageType} under the same later-schema-wins rule, so discovery resolves each entity message with one map read.
  private readonly schemaByListEntitiesMessageType: ReadonlyMap<number, EntitySchema>;

  // Optional metrics sink. Undefined when the consumer hasn't supplied one; every emit site uses optional chaining (`this.metrics?.increment(...)`) so the no-metrics
  // path is a single property lookup.
  private readonly metrics: ClientMetrics | undefined;

  // Tracks the connect-attempt start timestamp for the connect.duration_ms timing. Reset on every connect() call.
  private connectStartMs = 0;

  /**
   * Construct a client without connecting. Prefer {@link openEspHomeClient}, the async factory that constructs, connects with bounded retry, and resolves with a
   * ready-to-use instance; reach for `new EspHomeClient(options)` only when the consumer must attach subscriptions before the first `connect()` so events fired during
   * the handshake are not missed.
   *
   * @remarks Every option is optional except `host`. When `psk` is supplied, as a key or as a {@link PskResolver}, the client attempts the Noise NNpsk0 handshake first
   * and falls back to plaintext ONLY when the device demonstrably does not speak encryption - it responded in plaintext or closed the socket during the noise exchange.
   * The key is checked where the handshake uses it, not at construction: a bad encryption key (a key that does not decode to 32 bytes, a rejected PSK, or a
   * malformed/low-order peer key) fails closed with a permanent {@link EncryptionKeyInvalidError}, and a resolver that returns no key fails closed with a permanent
   * {@link EncryptionKeyMissingError}, rather than silently downgrading to plaintext. The full options surface (transport injection, metrics sink, keep-alive,
   * reconnect, frame/buffer/field caps, handshake and connect timeouts) is documented on {@link EspHomeClientOptions}; consult that type rather than this docstring for
   * a complete listing.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#manual-construction}
   *
   * @param options - Configuration options. See {@link EspHomeClientOptions} for the full surface.
   *
   */
  constructor(options: EspHomeClientOptions<Extras>) {

    // A consumer's listener runs inside emits the client makes from timers, the receive loop, and the connect flow, so its fault is reported through the logger and
    // never unwinds into that caller. The logger is read when a fault arrives, after construction has assigned it.
    this.bus = new EventBus<ClientEventsMap>({

      onListenerError: (error: unknown, event: string): void => {

        this.log.warn("A client event listener threw; the remaining listeners still received the event.", { error, event });
      }
    });

    options.logger ??= {

      /* eslint-disable no-console */
      debug: (): void => { /* No debug logging by default. */ },
      error: (message: string, ...parameters: unknown[]): void => { console.error(message, ...parameters); },
      info: (message: string, ...parameters: unknown[]): void => { console.log(message, ...parameters); },
      warn: (message: string, ...parameters: unknown[]): void => { console.warn(message, ...parameters); }
      /* eslint-enable no-console */
    };

    this.clientId = options.clientId ?? "esphome-client";
    this.registry = new EntityRegistry({ log: options.logger });
    this.serviceRegistry = new ServiceRegistry({ log: options.logger });

    const logManagerHost: LogSubscriptionManagerHost = {

      bus: this.bus,
      log: options.logger,
      send: (type, payload): void => { this.frameAndSend(type, payload); }
    };

    this.logManager = new LogSubscriptionManager(logManagerHost);
    this.latestCache = new LatestStateCache();
    this.capabilitiesCache = disconnectedCapabilities();
    this.subDeviceList = [];
    this.host = unbracketHost(options.host);
    this.transportFactory = options.transportFactory ?? null;
    this.clock = options.clock ?? Date.now;
    this.log = options.logger;
    this.port = options.port ?? 6053;

    // Build the voice-assistant decode-and-emit context once. It closes over `this.bus`, `this.log`, and `this.decodeProtobuf`; the closure stays valid for the
    // client's full lifetime since none of those members are reassigned after construction (`bus` is `readonly`; `log` and the decode limits are stable). The dispatch
    // sites in `runPhaseHandlers` reference this by direct property read, avoiding per-message allocation.
    this.voiceAssistantInboundContext = {

      bus: this.bus,
      decode: (buffer): Record<number, FieldValue[]> => this.decodeProtobuf(buffer),
      log: this.log
    };

    // Build the Home-Assistant sub-API SSOT. Owns the outbound subscribe-and-respond surface and exposes a memoized inbound-dispatcher context
    // (`api.inboundContext`) that the run-phase dispatcher consumes for `HOMEASSISTANT_SERVICE_RESPONSE` / `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE` frames. Its host
    // closes over `this.bus`, `this.log`, the bounded protobuf decoder, and the host's `frameAndSend` so the sub-API never reaches into host private state.
    const homeAssistantApiHost: HomeAssistantApiHost = {

      bus: this.bus,
      decode: (buffer: Buffer): Record<number, FieldValue[]> => this.decodeProtobuf(buffer),
      log: this.log,
      send: (type: number, payload: Buffer): void => { this.frameAndSend(type, payload); }
    };

    this.homeAssistantApi = new HomeAssistantApi(homeAssistantApiHost);

    this.remoteDeviceInfo = null;

    // We normalize the key forms, once, into the single resolver the handshake consults: a function is used as given, a non-empty string becomes a resolver that
    // returns it, and an empty string, like an absent key, means no key. The key is not validated here...the handshake checks it where it is used, so a malformed
    // string key fails the connection closed exactly like a malformed key a resolver returns.
    const psk = options.psk;

    this.resolvePsk = (typeof psk === "function") ? psk : (psk ? (): string => psk : null);
    this.expectedServerName = options.serverName ?? null;
    this.disconnectCorrelator = new Correlator<void>();
    this.noiseKeyCorrelator = new Correlator<boolean>();
    this.deviceApiMinorVersion = 0;

    // Apply resource bounds: each option falls back to its default when omitted. Stored as readonly so the contract is fixed for the lifetime of the client.
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    this.maxFieldsPerMessage = options.maxFieldsPerMessage ?? DEFAULT_MAX_FIELDS_PER_MESSAGE;
    this.maxRecvBufferBytes = options.maxRecvBufferBytes ?? DEFAULT_MAX_RECV_BUFFER_BYTES;
    this.maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;

    // Build the per-instance schemas table once, here at the boundary. The merge step throws ConfigurationError("EXTRA_SCHEMA_OVERRIDES_BUILTIN") when an extras key
    // collides with a built-in entity-type key; surfacing it from the constructor means callers see the failure synchronously rather than at first-command. Each
    // derived lookup - the state and list-entities message-type sets and the schema maps beside them - is computed once from the table; downstream consumers read the
    // per-instance copies so extras-registered wire-message-types route through the same code paths as built-ins.
    this.schemasTable = buildSchemasTable(ENTITY_SCHEMAS, options.extraSchemas);
    this.stateMessageTypes = buildStateMessageTypes(this.schemasTable);
    this.listEntitiesMessageTypes = buildListEntitiesMessageTypes(this.schemasTable);
    this.schemaByStateMessageType = buildSchemaByStateMessageType(this.schemasTable);
    this.schemaByListEntitiesMessageType = buildSchemaByListEntitiesMessageType(this.schemasTable);

    // Connect-flow timeouts. Both fall back to compile-time defaults when omitted; both are then composed with the user signal at connect() time via AbortSignal.any.
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.gracefulDisconnectTimeoutMs = options.gracefulDisconnectTimeoutMs ?? DEFAULT_GRACEFUL_DISCONNECT_TIMEOUT_MS;

    // Heartbeat. Defaults to 30s idle / 60s stall; pass `keepAlive: false` to disable. The scheduler is constructed up front so its lifetime matches the host's;
    // transitions are surfaced through the `HeartbeatHost` callbacks below.
    const heartbeatConfig: Nullable<HeartbeatConfig> = (options.keepAlive === false) ? null : {

      intervalMs: options.keepAlive?.intervalMs ?? 30000,
      stallTimeoutMs: options.keepAlive?.stallTimeoutMs ?? 60000
    };

    const heartbeatHost: HeartbeatHost = {

      log: this.log,
      onSendPing: (): void => { this.frameAndSend(MessageType.PING_REQUEST, Buffer.alloc(0)); },
      onStall: (cause: HeartbeatStalledError): void => {

        // Stall budget exhausted. A stall only fires while the socket is up, so the record is live; narrowing to the live variant lets the spread into STALLED retain
        // `connectedAtMs` (both connected and stalled are "socket up" states) so uptime stays live through the stall. Bump the consecutive-stall counter, broadcast the
        // new health record, and tear down so auto-reconnect (when enabled) can pick up.
        if(isConnectionLive(this.healthRecord)) {

          const stalls = this.healthRecord.consecutiveStalls + 1;

          this.publishHealthRecord({ ...this.healthRecord, consecutiveStalls: stalls, state: HealthState.STALLED });
        }

        this.metrics?.increment("heartbeat.stalled");
        this.disconnectInternal({ cause, reason: "heartbeat stalled" });
      }
    };

    this.heartbeat = new HeartbeatScheduler(heartbeatHost, heartbeatConfig, this.clock);

    // Auto-reconnect. Defaults to on with battle-tested values (500ms initial delay, 2x backoff, 30s cap, 20% jitter); pass `reconnect: false` to disable.
    this.reconnectConfig = (options.reconnect === false) ? null : resolveReconnectConfig(options.reconnect);

    // Optional metrics sink. Stored as-is so emit sites can use optional chaining; absence means zero-cost emit.
    this.metrics = options.metrics;

    // Build the dispatcher's `RunPhaseHost` once. It exposes a small read surface (bus/log/metrics/decode contexts/maxFieldsPerMessage), the frame-and-send hook, the
    // bounded protobuf decoder, and a handful of host-side coordination methods that the dispatch table delegates into for multi-step bodies (acknowledge*) plus the
    // host's decoder methods (handleLogResponse / handleCameraImageResponse / handleNoiseKeySetResponse / handleListEntity / handleListServiceEntity /
    // handleTelemetry). Reused unchanged across every connect()/disconnect cycle.
    this.runPhaseHost = {

      acknowledgeDisconnectRequest: (): void => { this.acknowledgeDisconnectRequest(); },
      acknowledgeDisconnectResponse: (): void => { this.acknowledgeDisconnectResponse(); },
      acknowledgePingResponse: (): void => { this.acknowledgePingResponse(); },
      bus: this.bus,
      decodeProtobuf: (buffer: Buffer): Record<number, FieldValue[]> => this.decodeProtobuf(buffer),
      handleBluetoothAdvertisementsBatch: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptAdvertisementsBatch(payload); },
      handleBluetoothConnectionsFreeResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptConnectionsFreeResponse(payload); },
      handleBluetoothDeviceClearCacheResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptClearCacheResponse(payload); },
      handleBluetoothDeviceConnectionResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptDeviceConnectionResponse(payload); },
      handleBluetoothDevicePairingResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptPairingResponse(payload); },
      handleBluetoothDeviceUnpairingResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptUnpairingResponse(payload); },
      handleBluetoothGattErrorResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGattErrorResponse(payload); },
      handleBluetoothGattGetServicesDoneResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGetServicesDoneResponse(payload); },
      handleBluetoothGattGetServicesResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGetServicesResponse(payload); },
      handleBluetoothGattNotifyDataResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGattNotifyDataResponse(payload); },
      handleBluetoothGattNotifyResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGattNotifyResponse(payload); },
      handleBluetoothGattReadResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGattReadResponse(payload); },
      handleBluetoothGattWriteResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptGattWriteResponse(payload); },
      handleBluetoothScannerState: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptScannerStateResponse(payload); },
      handleBluetoothSetConnectionParamsResponse: (payload: Buffer): void => { this.bluetoothProxyApi?.acceptSetConnectionParamsResponse(payload); },
      handleCameraImageResponse: (payload: Buffer): void => { this.handleCameraImageResponse(payload); },
      handleDeviceInfoResponse: (payload: Buffer): void => {

        this.handleDeviceInfoResponse(payload);

        this.capabilitiesCache = parseCapabilities({

          apiMinor: this.deviceApiMinorVersion,
          deviceInfo: this.remoteDeviceInfo,
          encrypted: this.session?.transport.isEncrypted ?? false
        });

        if(this.remoteDeviceInfo) {

          this.emit("deviceInfo", this.remoteDeviceInfo);
        }
      },
      handleExecuteServiceResponse: (payload: Buffer): void => { this.handleExecuteServiceResponse(payload); },
      handleListEntitiesDoneResponse: (): void => {

        // Mid-session re-discovery commit. Each registry's snapshotChanges returns `{ changed, ... }`; emit only when the corresponding registry actually changed since
        // the last snapshot. The dirty flag was set as a side effect of host.handleListEntity / host.handleListServiceEntity (the run-phase late-discovery branch in
        // defaultRunPhaseHandler routes any LIST_ENTITIES_*_RESPONSE arriving in run phase through those host methods, which delegate to registry.register). When the
        // device pushes a stale DONE with no preceding entity messages, both snapshots return `changed: false` and the handler is a no-op. The `services` length check
        // mirrors the connect-time emitServices callback so the "do not emit `services` when empty" public-API contract holds at both call sites.
        const entitySnapshot = this.registry.snapshotChanges();

        if(entitySnapshot.changed) {

          this.emit("entities", entitySnapshot.entities);
        }

        const serviceSnapshot = this.serviceRegistry.snapshotChanges();

        if(serviceSnapshot.changed && (serviceSnapshot.services.length > 0)) {

          this.emit("services", serviceSnapshot.services);
        }
      },
      handleListEntity: (type: number, payload: Buffer): void => { this.handleListEntity(type, payload); },
      handleListServiceEntity: (payload: Buffer): void => { this.handleListServiceEntity(payload); },
      handleLogResponse: (payload: Buffer): void => { this.handleLogResponse(payload); },
      handleNoiseKeySetResponse: (payload: Buffer): void => { this.handleNoiseKeySetResponse(payload); },
      handleSerialProxyData: (payload: Buffer): void => { this.serialProxyApi?.acceptDataMessage(payload); },
      handleSerialProxyModemPinsResponse: (payload: Buffer): void => { this.serialProxyApi?.acceptModemPinsResponse(payload); },
      handleSerialProxyRequestResponse: (payload: Buffer): void => { this.serialProxyApi?.acceptRequestResponse(payload); },
      handleTelemetry: (type: number, payload: Buffer): void => { this.handleTelemetry(type, payload); },
      handleZWaveProxyFrame: (payload: Buffer): void => { this.zwaveProxyApi?.acceptFrame(payload); },
      handleZWaveProxyRequest: (payload: Buffer): void => { this.zwaveProxyApi?.acceptRequest(payload); },
      homeAssistantInboundContext: this.homeAssistantApi.inboundContext,
      listEntitiesMessageTypes: this.listEntitiesMessageTypes,
      log: this.log,
      metrics: this.metrics,
      send: (type: number, payload: Buffer): void => { this.frameAndSend(type, payload); },
      stateMessageTypes: this.stateMessageTypes,
      voiceAssistantInboundContext: this.voiceAssistantInboundContext
    };

    // Build the runner's `CommandHost` once. Same composition pattern as runPhaseHost: small read surface (bus / log / metrics) plus methods that delegate into
    // the registry (keyForId, deviceIdForKey), the schemas table (resolveSchema), the connection scope (connectionScope), and the transport (frameAndSend).
    // {@link runCommand} and {@link runCommandAndAwait} consume this surface; the encode pipeline and adapter table are pure-function imports inside the runner.
    this.commandHost = {

      bus: this.bus,
      connectionScope: (): ConnectionScope => this.connectionScope(),
      deviceIdForKey: (key: number): number | undefined => this.registry.deviceIdForKey(key),
      keyForId: (id: EntityId): Nullable<number> => this.registry.keyForId(id),
      log: this.log,
      metrics: this.metrics,
      resolveSchema: (entityType: string): EntitySchema | undefined => getSchemaIn(this.schemasTable, entityType),
      send: (type: number, payload: Buffer): void => { this.frameAndSend(type, payload); }
    };
  }

  /**
   * Single source of truth for which managers participate in the `SubscriptionLifecycle` reset/reissue cycle. The eagerly-constructed log manager and
   * Home-Assistant bridge are always present; the lazily-instantiated sub-APIs (voice-assistant, serial, Bluetooth, Z-Wave, and any future addition) are included only
   * once a consumer has accessed them, so the `null` entries are filtered out, and every camera instance the client has created takes part. The connection teardown
   * ({@link tearDownConnection}) calls `SubscriptionLifecycle.clearConnectionState` on each, and connect-bottom calls `SubscriptionLifecycle.reissueOnReconnect` on
   * each, so adding a future streaming sub-API to the lifecycle is a one-line edit here rather than scattered per-manager call sites.
   *
   * @returns The live subscription-lifecycle participants, with un-instantiated lazy sub-APIs omitted.
   */
  private subscriptionLifecycles(): SubscriptionLifecycle[] {

    // The eager log manager and Home-Assistant bridge plus each lazily-instantiated streaming sub-API and every camera instance. We narrow out the `null` entries with a
    // type predicate over the non-null member union (rather than the bare `SubscriptionLifecycle` interface) so the predicate's narrowed type stays assignable to the
    // array's element type; each concrete class implements `SubscriptionLifecycle`, so the filtered result satisfies the declared return type.
    const participants = [ this.logManager, this.homeAssistantApi, this.voiceAssistantApi, this.serialProxyApi, this.bluetoothProxyApi, this.zwaveProxyApi,
      ...this.cameraInstances.values() ];

    return participants.filter((manager): manager is NonNullable<(typeof participants)[number]> => manager !== null);
  }

  /**
   * Connect to the ESPHome device and start communication. If an encryption key was provided, this attempts an encrypted connection first and falls back to plaintext if
   * the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#manual-construction}
   *
   * @param options - Optional configuration.
   * @param options.signal - Optional AbortSignal to cancel the connect attempt. Aborting tears down any in-progress handshake and rejects the returned promise with the
   *   signal's reason, as it is, including when the signal was already aborted at call time.
   * @returns A promise that resolves when the connection is established and ready. It rejects with the platform `TimeoutError` when the connect or handshake
   *   timeout elapses, with the signal's reason when `options.signal` aborts, with the {@link ConnectionLostError} of a {@link EspHomeClient.disconnect} or
   *   {@link EspHomeClient.disconnectAsync} that cuts it short or of a teardown during the hand-off to the run phase, and with a typed {@link EspHomeError} subclass
   *   for every other failure. A timeout names no step; the step a connect failed in is logged at debug level and carried on the legacy `disconnect` event.
   */
  public async connect(options?: { signal?: AbortSignal }): Promise<void> {

    // Every manual connect carries its own abort controller, composed with the caller's signal, so `disconnect()` can cancel a handshake still in flight the same way it
    // cancels the reconnect loop. The controller exists before the superseded loop is awaited below, so a disconnect landing during that wait cancels this connect too.
    // The field holds only the most recent manual connect's controller: concurrent manual connects are consumer misuse, and a newer one neither aborts nor waits on an
    // older one.
    const controller = new AbortController();
    const signal = (options?.signal !== undefined) ? AbortSignal.any([ options.signal, controller.signal ]) : controller.signal;

    this.connectController = controller;

    try {

      // A manual connect supersedes any in-flight auto-reconnect supervisor: abort the loop, then await its current connect attempt fully settling so two connect flows
      // never mutate the connection state (`session`, registries, health) concurrently. `cancelReconnect` is repeatable, so this is a no-op on a first connect with no
      // loop running. The reconnect loop itself calls `connectInternal` (below), NOT this method, so it never aborts its own controller or awaits its own promise.
      this.cancelReconnect();

      const supersededLoop = this.reconnectLoopPromise;

      if(supersededLoop) {

        // The loop never rejects - it handles every attempt error internally and breaks - so this await resolves once the superseded loop has fully torn down its current
        // attempt. The `.catch` is belt-and-suspenders: a superseded loop's failure must never surface as this manual connect's rejection.
        await supersededLoop.catch((): void => undefined);
      }

      await this.connectInternal({ signal, unwrapSignalReasons: true });

    } finally {

      // A newer manual connect may have installed its own controller while this one was in flight; the field then belongs to it and stays.
      if(this.connectController === controller) {

        this.connectController = null;
      }
    }
  }

  /**
   * The actual connect flow: supersede any live session, run the handshake/discovery, and hand off to the run-phase drain. Private because every caller must first
   * decide supersede policy: the public {@link connect} cancels and drains any in-flight reconnect loop before invoking this; the reconnect supervisor loop
   * ({@link runReconnectLoop}) invokes this directly so it neither aborts its own controller nor deadlocks awaiting its own promise.
   *
   * @param options - The attempt's inputs.
   * @param options.signal - The attempt's signal: the caller's signal composed with the manual connect's controller, or the reconnect loop's signal.
   * @param options.unwrapSignalReasons - Whether a rejection that is the reason of one of the attempt's own signals reaches the caller as it is. The public
   *   {@link connect} sets it; the reconnect loop's attempt, whose rejection no consumer awaits, receives the `CONNECT_FAILED` wrap that names the failed step.
   */
  private async connectInternal(options: { signal: AbortSignal; unwrapSignalReasons?: boolean }): Promise<void> {

    // Declared ahead of the try so the catch knows whether this attempt opened a handshake context, and tracked in `let` because the noise -> plaintext fallback
    // constructs a brand-new context (Transport is single-shot) and reassigns this binding.
    let context: HandshakeContext | undefined;

    // The session this attempt attaches. The check after the hand-off and the catch compare it with the attached record to learn whether another path detached it.
    let session: AttachedSession | undefined;

    // The step this attempt is running, the overall connect bound, and the running step's handshake-phase bound. The catch names the step in its wrap and reads the
    // bounds to tell a signal's own reason apart from every other failure.
    let step: ConnectStep = "the transport open";
    let overallSignal: AbortSignal | undefined;
    let stepSignal: AbortSignal | undefined;

    // One try covers the whole attempt, so every rejection - an already-aborted signal, a transport that fails to open, a handshake failure, a teardown around the
    // hand-off - leaves through the same catch, which hands the public connect a signal's own reason as it is and every other failure as a typed EspHomeError.
    try {

      // The abort check comes first, ahead of the supersede below, so a connect whose signal is already aborted leaves a live session untouched.
      options.signal.throwIfAborted();

      // A connect issued over a live session supersedes it. The shared disconnect path tears that session down and announces its end, and marking the close explicit
      // keeps that path from scheduling an auto-reconnect of the superseded session...a successful connect clears the mark. Without a live session the same call only
      // runs the connection teardown, so every connect starts from the disconnected baseline.
      if(this.session) {

        this.explicitlyClosed = true;
      }

      this.disconnectInternal({ reason: "superseded by a new connect" });

      // Reset entity and service discovery state for the new connection. The `EntityRegistry` owns the entity-identity indexes; the `ServiceRegistry` owns the
      // user-defined-service identity indexes; the latest-state cache holds the last telemetry per branded id. They reset in lock-step here at connect time rather than
      // in the connection teardown, so the last-known device state stays readable after a disconnect while a fresh session still starts with no inherited state.
      this.registry.clear();
      this.serviceRegistry.clear();
      this.latestCache.clear();

      this.connectStartMs = this.clock();

      // Compose the caller's signal with our overall connect timeout. Either trigger aborts the in-flight connect.
      overallSignal = this.combineSignals(options.signal, this.connectTimeoutMs);

      context = await this.openHandshakeContext(overallSignal);

      try {

        // Try the noise handshake first if a key or key resolver was supplied.
        if(this.resolvePsk) {

          try {

            step = "the Noise handshake";
            stepSignal = this.combineSignals(overallSignal, this.handshakeTimeoutMs);

            await performNoiseHandshake({

              expectedServerName: this.expectedServerName,
              log: this.log,
              metrics: this.metrics,
              now: this.clock,
              resolvePsk: this.resolvePsk,
              signal: stepSignal,
              transport: context.transport
            });

          } catch(err) {

            // We fall back to plaintext ONLY on the genuine no-encryption signal: the peer demonstrably does not speak the encrypted protocol because it responded in
            // plaintext (PEER_PLAINTEXT_DURING_NOISE) or closed during the noise exchange (PEER_CLOSED_NOISE). Both are carried by {@link PeerClosedDuringNoiseError}, so
            // the single instanceof check covers exactly those two wire-level triggers with no code keying. Everything else - a bad key (EncryptionKeyInvalidError), a
            // garbled/truncated reply, a server-name mismatch, AND a noise timeout/abort - is NOT evidence the device wants plaintext, so it fails closed and re-throws.
            if(!(err instanceof PeerClosedDuringNoiseError)) {

              throw err;
            }

            this.log.debug("Noise handshake failed (" + err.message + "); falling back to plaintext.");

            // Single-shot transport contract: dispose the failed context (transport + receiver) and construct a fresh pair for the plaintext retry.
            await this.disposeHandshakeContext(context);

            step = "the transport open";
            stepSignal = undefined;
            context = await this.openHandshakeContext(overallSignal);
          }
        }

        // Plaintext handshake: send HELLO_REQUEST and await HELLO_RESPONSE. Protocol-version negotiation lands inside this helper.
        step = "the hello exchange";
        stepSignal = this.combineSignals(overallSignal, this.handshakeTimeoutMs);

        await performPlaintextHandshake({

          clientApiVersion: CLIENT_API_VERSION,
          clientId: this.clientId,
          log: this.log,
          maxFieldsPerMessage: this.maxFieldsPerMessage,
          pskConfigured: this.resolvePsk !== null,
          receiver: context.receiver,
          setApiMinorVersion: (minor: number): void => { this.deviceApiMinorVersion = minor; },
          signal: stepSignal,
          supportedApiMajors: SUPPORTED_API_MAJORS,
          transport: context.transport
        });

        // Authenticate (CONNECT_REQUEST) for legacy API < 1.11.
        step = "the legacy authentication";
        stepSignal = this.combineSignals(overallSignal, this.handshakeTimeoutMs);

        await authenticateIfNeeded({

          apiMinorVersion: this.deviceApiMinorVersion,
          log: this.log,
          receiver: context.receiver,
          signal: stepSignal,
          transport: context.transport
        });

        // Run entity discovery in the setup phase. Each discovery message is awaited explicitly until LIST_ENTITIES_DONE_RESPONSE arrives.
        step = "discovery";
        stepSignal = this.combineSignals(overallSignal, this.handshakeTimeoutMs);

        await performDiscovery({

          applyDeviceInfo: (payload: Buffer): void => { this.handleDeviceInfoResponse(payload); },
          applyListEntity: (type: number, payload: Buffer): void => { this.handleListEntity(type, payload); },
          applyListServiceEntity: (payload: Buffer): void => { this.handleListServiceEntity(payload); },
          countEntities: (): number => this.registry.size,
          countServices: (): number => this.serviceRegistry.size,
          emitDeviceInfo: (): void => { if(this.remoteDeviceInfo) { this.emit("deviceInfo", this.remoteDeviceInfo); } },
          // snapshotChanges is the SSOT primitive: same call shape used by the run-phase LIST_ENTITIES_DONE_RESPONSE handler. Connect-time emits `entities`
          // unconditionally because discovery completion is always a consumer-meaningful transition (even with zero entities); calling snapshotChanges here also clears
          // the registry's dirty bit so a stale mid-session DONE correctly no-ops instead of re-emitting the initial discovery set.
          emitEntities: (): void => { this.emit("entities", this.registry.snapshotChanges().entities); },
          // The `services` event preserves its existing semantic: fires only when there are services to report. We always call snapshotChanges to clear the dirty bit
          // (so a stale mid-session DONE on a service-less device does not later emit `services` with an empty list); the conditional emit honours the consumer-visible
          // contract.
          emitServices: (): void => {

            const snapshot = this.serviceRegistry.snapshotChanges();

            if(snapshot.services.length > 0) {

              this.emit("services", snapshot.services);
            }
          },
          // Use the per-instance, extras-aware set (the same one the run-phase handler builder consumes), NOT the module-level no-extras constant - so a directly-
          // constructed extras schema declaring a novel list-entities message id is awaited and applied during the connect-time discovery sweep, exactly as it is in the
          // run phase. Both phases source which list-entities wire types to accept from this single per-instance set, so connect-time discovery and the run phase agree.
          listEntitiesMessageTypes: this.listEntitiesMessageTypes,
          metrics: this.metrics,
          receiver: context.receiver,
          signal: stepSignal,
          transport: context.transport
        });

      } finally {

        // Setup-phase interleave handlers are always torn down before drain handoff. The transport and receiver hand off to the run phase below on success, or are
        // disposed by the catch block on failure.
        context.pingHandler[Symbol.dispose]();
        context.discHandler[Symbol.dispose]();
      }

      // A disconnect that landed after discovery's last abortable wait - during its final write, or from a listener of the entity or service list - aborted this
      // attempt's signal without ending a wait, so we check it here and fail the connect with its reason before anything attaches.
      options.signal.throwIfAborted();

      // Attach the session, with a fresh connection scope, then hand off to the run-phase drain. The attach comes first because startDrain replays the setup-phase
      // buffer at once: a request the device sent during setup (a GET_TIME_REQUEST, say) is answered through frameAndSend, which drops the reply unless a session is
      // attached, and an awaiting call a replayed frame's listener issues finds the scope and is admitted. From this point on, every inbound message routes through the
      // dispatch table built by `buildRunPhaseHandlers`, wrapped via {@link tapInboundActivity} so every dispatched frame stamps the heartbeat scheduler. The second
      // argument is the terminal-completion callback: the receiver escalates a passive run-phase transport death (peer RST/FIN, device reboot, mid-session decrypt
      // failure, oversized frame) back to the host through it. `disconnectInternal` is repeatable and gates `maybeScheduleReconnect` behind the attached-session
      // check, so this collapses with a racing heartbeat-stall or `DISCONNECT_REQUEST` to a single teardown.
      step = "the run-phase hand-off";
      stepSignal = undefined;
      session = { receiver: context.receiver, scope: new AbortController(), transport: context.transport };
      this.session = session;

      context.receiver.startDrain(this.tapInboundActivity(buildRunPhaseHandlers(this.runPhaseHost)),
        (cause) => this.disconnectInternal({ cause, reason: "transport terminated" }));

      // The replay inside startDrain runs listeners and handlers that can tear this session down: a listener's disconnect, or a stray DISCONNECT_RESPONSE the device
      // sent during setup. That teardown announced the session's end and aborted its scope, so the connect fails with the error the scope was aborted with rather than
      // announcing a connected session that is already gone.
      if(this.session !== session) {

        throw session.scope.signal.reason;
      }

      this.metrics?.timing("connect.duration_ms", this.clock() - this.connectStartMs, { encrypted: context.transport.isEncrypted ? "true" : "false" });
      this.metrics?.increment("connect.attempts", 1, { result: "success" });

      // Rebuild the structured capability record now that DeviceInfo is populated and the API minor version has been negotiated. Cached for the lifetime of the
      // session and read synchronously via `client.capabilities()`.
      this.capabilitiesCache = parseCapabilities({

        apiMinor: this.deviceApiMinorVersion,
        deviceInfo: this.remoteDeviceInfo,
        encrypted: context.transport.isEncrypted
      });

      // Stamp the connect epoch once and build the live health record atomically from it - the epoch is a property of the connected state, not a separate field, so it
      // cannot drift from `state` and is gone the moment the record becomes a down variant. Heartbeat seeds its initial activity from the same local.
      const connectedAtMs = this.clock();

      this.heartbeat.start(connectedAtMs);
      this.setHealthRecord(connectedHealth(this.healthRecord, {

        connectedAtMs,
        encrypted: context.transport.isEncrypted,
        lastInboundActivityAt: this.heartbeat.lastActivityAt
      }));
      this.reconnectAttempts = 0;
      this.explicitlyClosed = false;

      // Re-issue protocol-level subscriptions across reconnects via the uniform `SubscriptionLifecycle` contract. Each participant owns its own re-subscribe path
      // (the multiset sub-APIs replay every surviving consumer's desired wire-state; the voice-assistant replays its preserved desired intent with the originally-
      // requested flags); the host invokes them all after every successful connect so consumer-held iterators see the same wire-level subscription state they had before
      // the disconnect, without any per-manager special-casing.
      for(const lifecycle of this.subscriptionLifecycles()) {

        lifecycle.reissueOnReconnect();
      }

      // The connected record went in above, before the reissue and the connect event, so their listeners already read it; the announcement follows the connect event and
      // carries the current record.
      this.emit("connect", context.transport.isEncrypted);
      this.publishHealthRecord(this.healthRecord);
      this.emit("lifecycle", { encrypted: context.transport.isEncrypted, kind: "connect" });

    } catch(err) {

      // Whether another path detached this attempt's session, read before this catch's own teardown detaches it. That path's teardown already announced the end.
      const detachedElsewhere = (session !== undefined) && (this.session !== session);

      // Only an attempt that opened a handshake context has anything of its own to undo. An attempt that failed before the open changed no connection-scoped state
      // beyond the supersede, which already ran the connection teardown, and one stopped by the abort check never reached the supersede at all.
      if(context) {

        // Partial cleanup of the failed context. The receiver dispose settles every parked awaiter; the transport asyncDispose tears down the socket. Both are
        // repeatable so calling them after the inner finally already disposed the interleave handlers is safe.
        await this.disposeHandshakeContext(context);

        // The connection teardown returns the connection-scoped state to the disconnected baseline, including the session that a failure after the run-phase handoff
        // leaves attached, whose scope it aborts with a connection-lost error carrying this failure. Its disposals repeat the ones above, which is safe.
        this.tearDownConnection({ cause: err });
      }

      /* We classify the rejection by identity against the attempt's own signals, never by its name or class, so a transport's own `TimeoutError` is a failure like any
       * other. A rejection that is the reason of the attempt's signal ended by cancellation: the caller's, a disconnect's, or the reconnect loop's. One that is the
       * reason of the overall bound or the running step's bound, and not the attempt's signal's, ended by timeout, and only that counts as `timeout`.
       */
      const cancelled = options.signal.aborted && (options.signal.reason === err);
      const bounded = [ overallSignal, stepSignal ].some((bound) => (bound?.aborted === true) && (bound.reason === err));

      this.metrics?.increment("connect.attempts", 1, { result: (bounded && !cancelled) ? "timeout" : "failure" });

      // Translate the failure into a typed EspHomeError naming the step it happened in, if it is not already one. The cause chain preserves the underlying error for
      // diagnostics.
      const wrapped = (err instanceof EspHomeError) ? err :
        new ConnectionError("Connect failed during " + step + ": " + (err instanceof Error ? err.message : String(err)), "CONNECT_FAILED", { cause: err });

      // The public connect hands back a signal's own reason as it is, so a consumer tells a timeout or its own cancellation apart by identity. The announcement keeps
      // the typed wrap, since the lifecycle event's cause is typed.
      const rejection = (options.unwrapSignalReasons && (cancelled || bounded)) ? err : wrapped;

      this.log.debug("Connect failed: " + wrapped.name + ": " + wrapped.message);

      // A session still attached here is one this attempt never superseded: the abort check stopped it first. That session carries on, so there is nothing to announce.
      // A session another path detached during the hand-off had its end announced by that path's teardown, so the attempt adds no announcement of its own.
      if(this.session || detachedElsewhere) {

        throw rejection;
      }

      // With no reconnect loop alive, a health record that is not yet disconnected belongs to this failed attempt: RECONNECTING inherited from a loop this connect
      // superseded, or CONNECTED left by a throw after the run-phase handoff. The canonical disconnect surface releases it with the typed cause. A loop's own attempt
      // leaves RECONNECTING to the loop, which retries or gives up itself, and a failure from the disconnected state keeps the legacy string-payload `disconnect`
      // carrying the human-readable reason.
      if((this.reconnectLoopPromise === null) && (this.healthRecord.state !== HealthState.DISCONNECTED)) {

        this.emitDisconnected(wrapped.message, wrapped);
      } else {

        this.emit("disconnect", wrapped.message);
      }

      throw rejection;
    }
  }

  // Connect-flow handshake/negotiation/discovery is implemented in `lifecycle/handshake.ts`. The host owns the orchestration above; each phase is a pure function the
  // module exports for direct testing.

  /**
   * Open one handshake context: a fresh transport, a fresh `MessageReceiver`, and the two setup-phase interleave handlers. Returned as a single bundle so the
   * connect flow can dispose all four resources together on noise -> plaintext fallback or fatal failure.
   *
   * @remarks Each call constructs a brand-new transport (via {@link openTransport}, which honours the optional {@link EspHomeClientOptions.transportFactory}) and a
   * brand-new receiver. This is the foundation of the noise -> plaintext fallback path: the failed context is disposed in full and a fresh one is constructed for
   * the plaintext retry, so no stale state from the noise attempt can leak into the plaintext session.
   *
   * @param signal - Composed signal that aborts the transport open if the user signal or overall connect timeout fires.
   * @returns A bundle holding the live transport, receiver, and the two interleave-handler disposers.
   */
  private async openHandshakeContext(signal: AbortSignal): Promise<HandshakeContext> {

    const transport = await this.openTransport(signal);
    const receiver = new MessageReceiver(transport, { log: this.log, uncappedMessageTypes: this.listEntitiesMessageTypes });

    // Setup-phase interleave handlers. Both auto-tear-down when the receiver enters drain phase via startDrain(); the connect-flow finally also disposes them
    // explicitly to handle the failure path.
    const pingHandler = receiver.onInterleave(MessageType.PING_REQUEST, () => {

      // Fire-and-forget; if the send fails the transport's iterator will throw separately and our awaiters will surface it.
      void transport.send(MessageType.PING_RESPONSE, Buffer.alloc(0)).catch((): void => { /* drained by next iterator step */ });
    });
    const discHandler = receiver.onInterleave(MessageType.DISCONNECT_REQUEST, () => {

      throw new ConnectionClosedByPeerError("Device requested disconnect during handshake.", "PEER_DISCONNECT_DURING_HANDSHAKE");
    });

    return { discHandler, pingHandler, receiver, transport };
  }

  /**
   * Symmetric teardown for {@link openHandshakeContext}. Disposes the interleave handlers, the receiver, and the transport, in that order. Repeatable - every
   * underlying dispose is a no-op when already torn down.
   *
   * @param context - The bundle returned by a prior {@link openHandshakeContext} call.
   */
  private async disposeHandshakeContext(context: HandshakeContext): Promise<void> {

    context.pingHandler[Symbol.dispose]();
    context.discHandler[Symbol.dispose]();
    context.receiver[Symbol.dispose]();

    await context.transport[Symbol.asyncDispose]();
  }

  /**
   * Construct one transport: either via the injected {@link EspHomeClientOptions.transportFactory} when present, or via the default `Transport.open` path. The
   * caller owns the returned transport and is responsible for its dispose.
   *
   * @param signal - Composed signal that aborts the open if the user signal or overall connect timeout fires. Threaded into both code paths: the default factory
   * passes it to `Transport.open`; injected factories receive it as their first argument. Factories that don't perform I/O may ignore the parameter.
   * @returns A live transport in `plaintext` phase.
   */
  private async openTransport(signal: AbortSignal): Promise<TransportLike> {

    // The fully-resolved open options are the single source of transport configuration. We build them once and hand them either to an injected factory (which can wrap
    // `Transport.open(options)` without re-deriving anything) or to the default open path. `metrics` is conditionally spread so undefined is omission, not an explicit
    // `undefined` value (which exactOptional would reject as semantically distinct from absence).
    const options: TransportOpenOptions = {

      host: this.host,
      log: this.log,
      maxFrameBytes: this.maxFrameBytes,
      maxRecvBufferBytes: this.maxRecvBufferBytes,
      ...(this.metrics !== undefined ? { metrics: this.metrics } : {}),
      port: this.port,
      signal
    };

    if(this.transportFactory) {

      return this.transportFactory(options);
    }

    return Transport.open(options);
  }

  /**
   * Acknowledge an inbound `PING_RESPONSE` from the device. Consumes the heartbeat scheduler's pending RTT (recorded when the supervisor sent the matching
   * `PING_REQUEST`), updates {@link ConnectionHealth.lastPingRttMs} on the cached record, and emits `healthChange` only when the consumption produced a value - the
   * heartbeat may have already cleared its in-flight marker on a stall, in which case there is nothing useful to record. Bundled here so the dispatcher's
   * {@link handlePingResponse} stays a one-line delegate.
   *
   * @internal Dispatcher coordination method; not part of the consumer surface. Invoked exclusively by the run-phase handler table.
   */
  public acknowledgePingResponse(): void {

    const rttMs = this.heartbeat.consumePingRtt();

    if(rttMs !== undefined) {

      this.publishHealthRecord({ ...this.healthRecord, lastPingRttMs: rttMs });
      this.metrics?.timing("heartbeat.rtt_ms", rttMs);
    }
  }

  /**
   * Acknowledge an inbound `DISCONNECT_REQUEST` from the device. Sends `DISCONNECT_RESPONSE` to confirm the request, then runs the disconnect path with the legacy
   * reason "device disconnected" and no cause, so the disconnect event fans out and auto-reconnect (when enabled) can pick up. Bundled here so the dispatcher's
   * {@link handleDisconnectRequest} stays a one-line delegate.
   *
   * @internal Dispatcher coordination method; not part of the consumer surface. Invoked exclusively by the run-phase handler table.
   */
  public acknowledgeDisconnectRequest(): void {

    this.frameAndSend(MessageType.DISCONNECT_RESPONSE, Buffer.alloc(0));
    this.disconnectInternal({ reason: "device disconnected" });
  }

  /**
   * Acknowledge an inbound `DISCONNECT_RESPONSE` from the device. Resolves the pending graceful-disconnect awaiter set by {@link EspHomeClient.disconnectAsync} when one
   * is registered (the resolver itself performs the teardown via `disconnectInternal`); otherwise falls back to the disconnect path with no legacy reason and no cause,
   * so a stray `DISCONNECT_RESPONSE` (e.g., arrived after the graceful timeout already fired) still tears the connection down cleanly. Bundled here so the dispatcher's
   * {@link handleDisconnectResponse} stays a one-line delegate.
   *
   * @internal Dispatcher coordination method; not part of the consumer surface. Invoked exclusively by the run-phase handler table.
   */
  public acknowledgeDisconnectResponse(): void {

    // The correlator returns true when a pending graceful-disconnect await was settled; that path will run `disconnectInternal` from `disconnectAsync` itself.
    // A false return means the response is stray (e.g., arrived after the graceful timeout already fired) - tear down here so the connection still closes cleanly.
    if(!this.disconnectCorrelator.resolve("graceful", undefined)) {

      this.disconnectInternal({});
    }
  }

  /**
   * Wrap a {@link MessageHandlers} dispatch table so every inbound message stamps the heartbeat supervisor's activity timestamp before delegating to the original
   * handler. This is the single boundary where idle detection sees inbound traffic.
   */
  private tapInboundActivity(handlers: MessageHandlers): MessageHandlers {

    const tapped: MessageHandlers = {};

    if(handlers.default) {

      const original = handlers.default;

      tapped.default = (msg: InboundMessage): void => { this.stampInboundActivity(); original(msg); };
    }

    for(const key of Object.keys(handlers)) {

      if(key === "default") {

        continue;
      }

      const numericKey = Number(key);
      const original = handlers[numericKey];

      if(original) {

        tapped[numericKey] = (msg: InboundMessage): void => { this.stampInboundActivity(); original(msg); };
      }
    }

    return tapped;
  }

  /**
   * Stamp the most recent inbound activity timestamp. Called from every dispatched run-phase handler via {@link tapInboundActivity}. Any inbound message proves the
   * connection live, so it resets a non-zero consecutive-stall count.
   */
  private stampInboundActivity(): void {

    this.heartbeat.stamp();

    const lastActivityAt = this.heartbeat.lastActivityAt;

    // This is the single reset of the consecutive-stall count, and it applies in any state because a stalled record never sees inbound traffic: the stall handler
    // tears the session down in the same synchronous call that marks it stalled, disposing the receiver that dispatches here. The count therefore carries into the
    // reconnected session and returns to 0 on that session's first inbound message...the recovery signal, so it is broadcast.
    if(this.healthRecord.consecutiveStalls !== 0) {

      this.publishHealthRecord({ ...this.healthRecord, consecutiveStalls: 0, lastInboundActivityAt: lastActivityAt });
    } else if(this.healthRecord.lastInboundActivityAt !== lastActivityAt) {

      // Cheap snapshot update without re-emitting healthChange (consumers don't need a tick on every inbound message; transitions are the meaningful signal).
      this.setHealthRecord({ ...this.healthRecord, lastInboundActivityAt: lastActivityAt });
    }
  }

  /**
   * Install the next health record. The record is frozen here, the only place the field is written after construction, so the object {@link health} returns and every
   * `healthChange` payload carries is one no reader can mutate. The silent per-frame inbound-activity stamp calls this directly; every announced transition goes through
   * {@link publishHealthRecord}.
   *
   * @param next - The record that replaces the current one.
   */
  private setHealthRecord(next: ConnectionHealth): void {

    this.healthRecord = Object.freeze(next);
  }

  /**
   * Install the next health record and announce it on `healthChange`. Every health transition consumers observe goes through here, so each one installs a frozen record
   * and emits exactly that record.
   *
   * @param next - The record that replaces the current one.
   */
  private publishHealthRecord(next: ConnectionHealth): void {

    this.setHealthRecord(next);
    this.emit("healthChange", this.healthRecord);
  }

  /**
   * Internal disconnect path. Runs the connection teardown ({@link tearDownConnection}) and, when a live session was attached, announces its end with the supplied reason
   * and hands the typed cause, with whether the health record reported that session live, to the reconnect supervisor. Safe to call more than once.
   *
   * @param options - The teardown's inputs.
   * @param options.cause - What ended the connection, when known. It feeds the debug line, the connection-lost error the teardown builds, and, narrowed to the typed
   *   hierarchy, the announcement and the reconnect decision.
   * @param options.lost - The connection-lost error the teardown aborts the connection scope with, when the caller built one. {@link EspHomeClient.disconnect} and the
   *   graceful path build it so a manual connect they cut short rejects with the same object. It is never announced.
   * @param options.reason - The human-readable reason carried on the legacy string `disconnect` event.
   */
  private disconnectInternal(options: { cause?: Error; lost?: ConnectionLostError; reason?: string }): void {

    // The teardown detaches the session and the announcement below publishes the disconnected record, so we read liveness, and whether the health record reported the
    // session live, before the teardown or the announcement runs.
    const live = this.session !== null;
    const reportedLive = isConnectionLive(this.healthRecord);

    // The teardown reads the cause and the connection-lost error from the same options.
    this.tearDownConnection(options);

    if(options.cause) {

      this.log.debug("Disconnect cause: " + options.cause.name + ": " + options.cause.message);
    }

    if(live) {

      // Narrow the disconnect cause to the typed hierarchy once and thread the same value to both the disconnect surface and the reconnect supervisor: the typed cause is
      // what consumers pattern-match on, and what the shouldRetry predicate filters permanent errors by. A non-EspHomeError cause is dropped to undefined here so neither
      // consumer sees an off-hierarchy error.
      const espCause = (options.cause instanceof EspHomeError) ? options.cause : undefined;

      this.emitDisconnected(options.reason, espCause);

      // Auto-reconnect runs unless the consumer explicitly closed, reconnect is disabled, or the session was never reported live. The supervisor itself filters on the
      // typed cause via the configured shouldRetry predicate; permanent errors stop the loop without consuming the retry budget.
      this.maybeScheduleReconnect({ cause: espCause, reportedLive });
    }
  }

  /**
   * Return every piece of connection-scoped state to the disconnected baseline. This is the single reset path for that state: the disconnect path (which every connect
   * also runs first, announcing any live session it supersedes) and a failed connect attempt both run it, so no reset can drift between them. The entity and service
   * registries and the latest-state cache are not reset here; they clear at connect time so the last-known device state stays readable after a disconnect. Safe to call
   * more than once.
   *
   * @param options - The teardown's inputs.
   * @param options.cause - What ended the connection, when known, which the connection-lost error this teardown builds carries as its `cause`.
   * @param options.lost - The connection-lost error to abort the connection scope with, in place of building one.
   */
  private tearDownConnection(options: { cause?: unknown; lost?: ConnectionLostError }): void {

    const session = this.session;

    // Detach the session and abort its connection scope in one step, ahead of every disposal below. Every wait that composed the scope follows its abort
    // synchronously, so each rejects with this one connection-lost error inside this call, its correlator entry already gone, before anything is announced. An error
    // is built only when a session is detached and the caller handed none, so a teardown with nothing attached builds none.
    if(session) {

      this.session = null;
      session.scope.abort(options.lost ?? connectionLostError(options.cause));
      session.receiver[Symbol.dispose]();

      // Every transport we hold came from {@link openTransport} (default path) or the injected {@link EspHomeClientOptions.transportFactory}. Either way, the host owns
      // it for this session - the factory contract requires a fresh transport per call. Dispose unconditionally.
      session.transport[Symbol.dispose]();
    }

    this.heartbeat.stop();

    // Every streaming sub-API implements the uniform `SubscriptionLifecycle` contract. Each participant's `clearConnectionState` clears its connection-scoped wire/cache
    // state - a fresh ESPHome connection starts with no subscription - while preserving the consumer subscriber ledgers and desired intent so the next
    // `reissueOnReconnect` can replay them. The loop resets connection-scoped state and ends no wait: the scope's abort above ends every wait, since each awaiting call
    // composes the scope into its wait. Running it at teardown means connection-scoped reads (e.g. Bluetooth `isConnected`) report the disconnected truth at once, and
    // a partial camera image from this session never bleeds into the next one. Per-manager specifics live in each manager's own `clearConnectionState` documentation.
    for(const lifecycle of this.subscriptionLifecycles()) {

      lifecycle.clearConnectionState();
    }

    // The session's negotiated and reported facts end with it, so `isEncrypted`, `capabilities()`, `deviceInfo()`, and `subDevices()` report the disconnected truth
    // rather than the last session's values.
    this.capabilitiesCache = disconnectedCapabilities();
    this.subDeviceList = [];
    this.remoteDeviceInfo = null;
    this.deviceApiMinorVersion = 0;
  }

  /**
   * Emit the canonical terminal-disconnect surface: transition {@link ConnectionHealth} to the disconnected record `downHealth` builds from the current one and
   * broadcast it via `healthChange`, emit the typed `lifecycle` event (with the cause when present), and emit the legacy string-payload `disconnect` event. This is
   * the single source of truth for the disconnect surface, shared by {@link EspHomeClient.disconnectInternal} (the run-phase teardown),
   * {@link EspHomeClient.runReconnectLoop} (the auto-reconnect give-up and the release after an explicit close), and {@link EspHomeClient.connectInternal} (a failed
   * attempt left holding a reconnecting or connected health record). The caller has already narrowed `cause` to the typed hierarchy, so this method does not re-narrow.
   *
   * @param reason - The human-readable disconnect reason carried on the legacy string `disconnect` event.
   * @param cause - The typed cause, already narrowed by the caller, or undefined for a causeless disconnect.
   */
  private emitDisconnected(reason: string | undefined, cause: EspHomeError | undefined): void {

    // Emit both the typed lifecycle event (canonical) and the legacy string-payload `disconnect` bus event. ConnectionHealth transitions to disconnected and is
    // broadcast via healthChange.
    this.publishHealthRecord(downHealth(this.healthRecord, HealthState.DISCONNECTED));
    this.emit("lifecycle", cause ? { cause, kind: "disconnect" } : { kind: "disconnect" });
    this.emit("disconnect", reason);
  }

  /**
   * Synchronous disconnect: tear down the transport immediately so the device observes a TCP close. Cancels any in-flight reconnect loop or manual connect and marks
   * the client as explicitly closed so auto-reconnect does not pick the connection up again. Safe to call more than once. Use {@link EspHomeClient.disconnectAsync} when
   * a graceful `DISCONNECT_REQUEST`/`DISCONNECT_RESPONSE` handshake is preferable.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#disconnect-and-cleanup}
   *
   */
  public disconnect(): void {

    // One connection-lost error ends a manual connect still in flight and every wait the session carried alike, so each rejects with the same object.
    const lost = connectionLostError();

    this.explicitlyClosed = true;
    this.cancelReconnect();
    this.connectController?.abort(lost);
    this.disconnectInternal({ lost });
  }

  /**
   * Graceful asynchronous disconnect. Sends DISCONNECT_REQUEST and awaits DISCONNECT_RESPONSE up to {@link EspHomeClientOptions.gracefulDisconnectTimeoutMs} (default
   * 1000ms), then tears down the transport. On timeout, falls through to immediate teardown - the consumer is never blocked indefinitely. Marks the client explicitly
   * closed and cancels any in-flight reconnect loop or manual connect (mirroring {@link EspHomeClient.disconnect}), so a graceful disconnect stays disconnected rather
   * than auto-reconnecting. Concurrent calls share the disconnect already in flight: the device sees one `DISCONNECT_REQUEST`, and every call resolves when it settles.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#disconnect-and-cleanup}
   *
   * @returns A promise that resolves when teardown completes (either after the response handshake or after the timeout falls through).
   *
   */
  public async disconnectAsync(): Promise<void> {

    this.disconnectInFlight ??= this.gracefulDisconnect().finally((): void => { this.disconnectInFlight = null; });

    return this.disconnectInFlight;
  }

  /**
   * The graceful disconnect behind {@link EspHomeClient.disconnectAsync}, run once per in-flight disconnect.
   */
  private async gracefulDisconnect(): Promise<void> {

    // Mark the client explicitly closed and cancel any in-flight reconnect loop BEFORE tearing down, mirroring the synchronous {@link EspHomeClient.disconnect}. Without
    // this, the `disconnectInternal` below calls `maybeScheduleReconnect`, and a non-permanent cause (the default `CONNECTION_DROPPED`) would silently reconnect about
    // 500ms after the graceful teardown - defeating the consumer's intent. Setting it before the no-op fast-path return also cancels a reconnect loop that is
    // mid-backoff (between attempts, with no active transport yet) and a manual connect still in its handshake. One connection-lost error ends that manual connect
    // and, through the closing teardown, every wait the session carried, so each rejects with the same object.
    const lost = connectionLostError();

    this.explicitlyClosed = true;
    this.cancelReconnect();
    this.connectController?.abort(lost);

    const session = this.session;

    if(!session) {

      // Nothing to disconnect; no-op fast path.
      return;
    }

    // Fire the request. Send failures short-circuit the await via the catch handler below by resolving the correlator with the same `undefined` value the response
    // path produces; the consumer is never blocked waiting for a response after a failed send.
    void session.transport.send(MessageType.DISCONNECT_REQUEST, Buffer.alloc(0)).catch((err: unknown) => {

      this.log.debug("DISCONNECT_REQUEST send failed: " + (err instanceof Error ? err.message : String(err)) + "; falling through to immediate teardown.");
      this.disconnectCorrelator.resolve("graceful", undefined);
    });

    try {

      // The wait follows the session's scope, so a teardown that lands while it is pending ends it at once rather than at the graceful timeout.
      await this.disconnectCorrelator.await("graceful", { signal: session.scope.signal, timeoutMs: this.gracefulDisconnectTimeoutMs });

    } catch(err) {

      // The expected rejections are the graceful timeout's `TimeoutError` and the connection-lost error of a teardown that landed during the wait. For each, the
      // teardown below runs and the disconnect resolves; any other rejection is a bug elsewhere and must surface.
      if((err instanceof DOMException) && (err.name === "TimeoutError")) {

        this.log.debug("Graceful disconnect timed out after " + String(this.gracefulDisconnectTimeoutMs) + " ms; tearing down anyway.");
      } else if(!(err instanceof ConnectionLostError)) {

        throw err;
      }
    }

    this.disconnectInternal({ lost });
  }

  /**
   * `Symbol.dispose` hook for `using` scopes. Aliased to {@link EspHomeClient.disconnect} - tears down synchronously, the device sees a TCP close, no
   * `DISCONNECT_REQUEST` is sent. Suitable for crash paths and short-lived scripts.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#disconnect-and-cleanup}
   *
   */
  public [Symbol.dispose](): void {

    this.disconnect();
  }

  /**
   * Symbol.asyncDispose hook for `await using` scopes. Performs the graceful disconnect handshake - sends DISCONNECT_REQUEST and awaits the matching response up to
   * {@link EspHomeClientOptions.gracefulDisconnectTimeoutMs}, then tears down. Suitable for daemon-style consumers that want a clean shutdown.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#disconnect-and-cleanup}
   *
   */
  public async [Symbol.asyncDispose](): Promise<void> {

    // {@link EspHomeClient.disconnectAsync} owns the explicitly-closed marking and reconnect cancellation, so this hook is a thin delegate - one SSOT for the
    // graceful-teardown path.
    await this.disconnectAsync();
  }

  /**
   * Evaluate the consumer-supplied retry predicate defensively. A predicate that throws is treated as "do not retry" (the conservative, fail-closed reading: a broken
   * predicate is not a license to retry forever, and an unguarded throw would escape across the library's internal async boundaries - the reconnect loop or the receiver
   * pump that drives disconnectInternal - as an unhandled rejection). Both consult sites (the scheduling decision and the loop) route through this single defensive call
   * so the defense is one fact that cannot drift between them. Returns the predicate's verdict, or false if it threw or no reconnect config is present.
   *
   * @param error - The typed cause threaded to the predicate, identical to what the inline consult passed.
   * @returns The predicate's verdict, or false when it threw or no reconnect config is present.
   */
  private safeShouldRetry(error: EspHomeError): boolean {

    try {

      return this.reconnectConfig?.shouldRetry(error, this.reconnectAttempts) ?? false;

    } catch(predicateError) {

      this.log.debug("Reconnect shouldRetry predicate threw; treating as a give-up. predicateError=" + (predicateError instanceof Error ? predicateError.message :
        String(predicateError)));

      return false;
    }
  }

  /**
   * Schedule a reconnect attempt unless the consumer explicitly closed, reconnect is disabled, the session that ended was never reported live, the cause is
   * permanent, or the retry budget is exhausted.
   *
   * @param options - The decision's inputs.
   * @param options.cause - The typed error from the most recent disconnect path, when known.
   * @param options.reportedLive - Whether the health record reported the session that ended as live, read before its end was announced.
   */
  private maybeScheduleReconnect(options: { cause: EspHomeError | undefined; reportedLive: boolean }): void {

    // Only a session the client reported live is reconnected after it ends. The connect that attached any other session reports its own failure to its caller, so no
    // loop follows it.
    if(!this.reconnectConfig || this.explicitlyClosed || this.reconnectInProgress || !options.reportedLive) {

      return;
    }

    const decisionError = options.cause ?? new ConnectionError("Connection dropped.", "CONNECTION_DROPPED");

    if(!this.safeShouldRetry(decisionError)) {

      this.log.debug("Reconnect skipped per shouldRetry predicate; cause=" + decisionError.name);

      return;
    }

    this.reconnectInProgress = true;
    this.reconnectController = new AbortController();

    this.reconnectLoopPromise = this.runReconnectLoop(this.reconnectController.signal);
  }

  /**
   * Cancel any in-flight reconnect loop. Safe to call more than once.
   */
  private cancelReconnect(): void {

    this.reconnectController?.abort();
    this.reconnectController = null;
    this.reconnectInProgress = false;
  }

  /**
   * Drive the reconnect loop until success, retry budget exhausted, or signal abort. Each iteration applies the configured backoff with jitter and calls `connect()`;
   * success transitions health to `connected` and stops the loop, failure re-enters the loop after another backoff.
   */
  private async runReconnectLoop(signal: AbortSignal): Promise<void> {

    if(!this.reconnectConfig) {

      return;
    }

    // The most recent failed attempt's typed cause, carried by the release below when an explicit close ends the loop.
    let lastCause: EspHomeError | undefined;

    while(!signal.aborted && !this.explicitlyClosed) {

      this.reconnectAttempts++;
      this.metrics?.increment("reconnect.attempts");

      const config = this.reconnectConfig;
      const delayMs = nextBackoffDelay(this.reconnectAttempts, config);

      // Every attempt announces the down "reconnecting" record before its backoff, so consumers see each retry begin. The record is built from the one in place, which
      // is a live record when the previous attempt failed after the run-phase handoff, and the down builder drops the connect epoch by construction.
      this.publishHealthRecord(downHealth(this.healthRecord, HealthState.RECONNECTING));

      try {

        config.onAttempt?.(this.reconnectAttempts, delayMs);
        this.log.debug("Reconnect attempt " + String(this.reconnectAttempts) + " in " + String(delayMs) + " ms.");

        // eslint-disable-next-line no-await-in-loop -- Reconnect loop is intrinsically sequential: wait the backoff, then try to connect, then maybe loop.
        await backoffDelay(delayMs, signal);

        // Either field can flip async (signal abort, disconnect()) during the awaited delay above, so the recheck is required; TS's narrowing from the
        // while-condition doesn't account for that.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if(signal.aborted || this.explicitlyClosed) {

          break;
        }

        // eslint-disable-next-line no-await-in-loop -- Connect attempt is sequenced after the backoff; parallelizing would defeat the purpose of the loop.
        await this.connectInternal({ signal });

        // Success path. The connect() flow itself stamped health/lifecycle; we just clear the loop state.
        this.reconnectInProgress = false;
        this.reconnectController = null;
        this.reconnectLoopPromise = null;

        return;

      } catch(err) {

        // Either field can flip async during the awaited operations above; TS's narrowing from the while-condition doesn't account for that.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if(signal.aborted || this.explicitlyClosed) {

          break;
        }

        const espError = (err instanceof EspHomeError) ? err : new ConnectionError("Reconnect attempt failed.", "RECONNECT_FAILED",
          { cause: err });

        lastCause = espError;

        // Evaluate the consumer-supplied retry predicate defensively via the shared safeShouldRetry helper. The call is the only remaining throw site inside the catch
        // and there is no `finally`, so a predicate that throws would otherwise escape the loop entirely - skipping the loop-end cleanup, leaving `reconnectInProgress`
        // true and health frozen at RECONNECTING, and leaving the floated loop promise rejecting unhandled. The helper treats a throwing predicate as a give-up (the
        // conservative, fail-closed reading: a broken predicate is not a license to retry forever) and we route it through the same terminal disconnect as an explicit
        // `false` return. With the helper's catch, no throw site remains here, so the loop always reaches its cleanup below.
        const keepRetrying = this.safeShouldRetry(espError);

        if(!keepRetrying) {

          this.log.debug("Reconnect loop terminated by shouldRetry predicate after " + String(this.reconnectAttempts) + " attempts; cause=" + espError.name);

          // The supervisor is giving up: surface the terminal disconnect with its typed cause and unfreeze health from RECONNECTING to disconnected. This is the same
          // canonical surface the run-phase disconnect emits, shared via emitDisconnected.
          this.emitDisconnected(espError.message, espError);

          break;
        }

        if((config.maxAttempts !== undefined) && (this.reconnectAttempts >= config.maxAttempts)) {

          this.log.debug("Reconnect loop exhausted maxAttempts (" + String(config.maxAttempts) + "); giving up.");

          // The retry budget is exhausted: surface the terminal disconnect with the last attempt's typed cause and unfreeze health from RECONNECTING to disconnected.
          this.emitDisconnected(espError.message, espError);

          break;
        }

        this.log.debug("Reconnect attempt " + String(this.reconnectAttempts) + " failed: " + espError.name + ": " + espError.message);
      }
    }

    // The loop owns leaving the reconnecting state it entered. A give-up has already released it through emitDisconnected; an explicit close ends the loop without
    // one, so we release it here with the last failed attempt's typed cause, when there is one. A manual connect that supersedes the loop also ends it but never marks
    // the close explicit, so it announces nothing here: the loss it follows was announced when the loop began, and that connect now owns the connection state.
    if(this.explicitlyClosed && (this.healthRecord.state === HealthState.RECONNECTING)) {

      this.emitDisconnected("explicitly closed while reconnecting", lastCause);
    }

    this.reconnectInProgress = false;
    this.reconnectController = null;
    this.reconnectLoopPromise = null;
  }

  /**
   * Compose a signal with an internal timeout. Either trigger aborts the returned signal.
   */
  private combineSignals(signal: AbortSignal, timeoutMs: number): AbortSignal {

    return AbortSignal.any([ signal, AbortSignal.timeout(timeoutMs) ]);
  }

  /**
   * Handle log response messages from the ESPHome device. This processes incoming log messages and emits appropriate events for monitoring and debugging.
   *
   * @param payload - The log response payload containing the log level and message.
   */
  private handleLogResponse(payload: Buffer): void {

    // Field numbers below are dictated by api.proto's SubscribeLogsResponse: 1=level, 3=message, 4=send_failed.
    const fields = this.decodeProtobuf(payload);
    const level = extractNumberField(fields, 1);

    if(level === undefined) {

      this.log.warn("Received log response without a valid level.");

      return;
    }

    const message = extractStringField(fields, 3);

    if(message === undefined) {

      this.log.warn("Received log response without a message.");

      return;
    }

    const sendFailed = extractNumberField(fields, 4) === 1;

    // Build the log event data via conditional spread so the optional sendFailed field is omitted entirely when false (rather than carrying an explicit `undefined`,
    // which `exactOptionalPropertyTypes` correctly rejects as semantically distinct from absence).
    const logData: LogEventData = {

      level: level as LogLevel,
      message,
      ...(sendFailed && { sendFailed: true as const })
    };

    // Hand off to the manager. Fans the event out to every active `client.on("log", ...)` listener, every open `client.logs(...)` iterator, and the diagnostic debug
    // log line emitted alongside every received log frame.
    this.logManager.dispatch(logData);
  }

  /**
   * Handle one inbound `CameraImageResponse` chunk. The host decodes the entity key, the image bytes, and the `done` flag, resolves the key to its cached
   * {@link CameraApi} instance, and delegates the chunk to {@link CameraApi.acceptChunk}, which owns reassembly and publishes each assembled image through
   * {@link publishTelemetry}. The instance is constructed lazily on the first chunk when no consumer has called {@link camera} yet, because a consumer that only
   * subscribes to the `camera` or `telemetry` channel must still observe assembled images.
   *
   * @param payload - The camera image response payload.
   */
  private handleCameraImageResponse(payload: Buffer): void {

    const fields = this.decodeProtobuf(payload);
    const key = extractEntityKey(fields, 1);

    if(key === undefined) {

      this.log.warn("Received camera image without a valid entity key.");

      return;
    }

    const name = this.registry.byKey(key)?.name ?? ("unknown(" + String(key) + ")");
    const imageData = fields[2]?.[0];

    if(!Buffer.isBuffer(imageData)) {

      this.log.warn("Received camera image without valid image data for entity: " + name + ".");

      return;
    }

    const done = extractNumberField(fields, 3) === 1;
    const cameraApi = this.cameraApiForKey(key);

    if(!cameraApi) {

      // We received a CAMERA_IMAGE_RESPONSE for a key that is not registered as a camera entity. Drop the chunk; the run-phase decoder already logged the discovery
      // skew when entity discovery completed.
      this.log.warn("Received camera image for unknown entity key: " + String(key) + ".");

      return;
    }

    cameraApi.acceptChunk(imageData, done, name, key);
  }

  /**
   * Resolve an entity-key to its cached {@link CameraApi} instance, constructing one lazily on first chunk so consumers who only subscribe to the bus event (and
   * never call `client.camera(id)` directly) still observe assembled images. Returns `null` when the key does not correspond to a discovered camera entity.
   *
   * @param key - The wire-side entity key from a `CameraImageResponse`.
   * @returns The matching {@link CameraApi} instance, or `null` when no camera entity is registered under that key.
   */
  private cameraApiForKey(key: number): Nullable<CameraApi> {

    const entity = this.registry.byKey(key);

    if(entity?.type !== "camera") {

      return null;
    }

    return this.camera(mintEntityId("camera", entity.objectId));
  }

  /**
   * Decode an inbound `EXECUTE_SERVICE_RESPONSE` and emit `serviceCallResult`. Devices opt into this acknowledgement by setting `USE_API_USER_DEFINED_ACTION_RESPONSES`
   * in firmware; older devices treat `executeService` as fire-and-forget and never produce this message.
   *
   * @param payload - The response payload bytes.
   */
  private handleExecuteServiceResponse(payload: Buffer): void {

    const fields = this.decodeProtobuf(payload);
    const callId = extractNumberField(fields, 1);
    const success = extractNumberField(fields, 2) === 1;
    const errorMessage = extractStringField(fields, 3);
    const responseData = fields[4]?.[0];

    if(callId === undefined) {

      this.log.warn("EXECUTE_SERVICE_RESPONSE missing required call_id field; dropping.");

      return;
    }

    const result: ServiceCallResult = {

      callId,
      success,
      ...((errorMessage !== undefined) && { errorMessage }),
      ...(Buffer.isBuffer(responseData) && { responseData })
    };

    this.emit("serviceCallResult", result);
  }

  /**
   * Handle noise encryption key set response from the ESPHome device. This processes the response to setting a new encryption key.
   *
   * @param payload - The response payload containing the success status.
   */
  private handleNoiseKeySetResponse(payload: Buffer): void {

    // Field 1 is `success` per api.proto's NoiseEncryptionSetKeyResponse.
    const fields = this.decodeProtobuf(payload);
    const success = extractNumberField(fields, 1) === 1;

    this.log.debug("Noise encryption key set response: " + (success ? "success" : "failed"));
    this.emit("noiseKeySet", success);

    // The correlator's resolve returns false when no `setNoiseEncryptionKey` is in flight; the event was still emitted above so consumers see the asynchronous result.
    this.noiseKeyCorrelator.resolve("default", success);
  }

  /**
   * Set a new Noise encryption key on the device. This allows changing the encryption key used for future connections.
   *
   * **Concurrency:** this method is NOT safe to call concurrently. The protocol carries no correlation ID for the key-set request, so the response can only be matched
   * to a single in-flight call. A second invocation while the first is still pending rejects rather than silently leaving the first promise hanging.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#connection-with-noise}
   *
   * @param key - The new encryption key, base64 encoded. It must decode to exactly 32 bytes, or the call rejects without sending anything.
   * @param options - Optional configuration.
   * @param options.signal - Optional AbortSignal to cancel the request. Aborting rejects the returned promise with the signal's reason at once rather than waiting for
   *   the timeout.
   * @param options.timeoutMs - Optional bound on the request/response round-trip; defaults to 5000 ms. On elapse the promise rejects with the timeout's `TimeoutError`.
   *
   * @returns A promise that resolves to `true` when the device reports the key set and `false` when the device reports a failure. Every other ending rejects - see the
   * `@throws` clauses below.
   *
   * @throws {NotConnectedError} (`CONNECT_IN_PROGRESS`) when the call is issued while a manual connect has not yet settled or the automatic reconnect is active, and
   * (`NOT_CONNECTED`) when it is issued with no connection otherwise. Nothing is sent, and this check runs before the in-flight and key-length checks.
   * @throws {ConnectionError} (`KEY_SET_IN_FLIGHT`) when another `setNoiseEncryptionKey` call is already pending - the protocol carries no correlation id and cannot
   * multiplex concurrent requests.
   * @throws {EncryptionKeyInvalidError} (`INVALID_PSK_LENGTH`) when the key does not decode to exactly 32 bytes. Nothing is sent.
   * @throws {ConnectionLostError} when the connection the request was issued on is torn down before the device replies.
   * @throws The signal's reason, as it is, when `options.signal` aborts, including when it was already aborted at call time, and the timeout's `TimeoutError` when
   * the round-trip outlasts `options.timeoutMs`.
   */
  public async setNoiseEncryptionKey(key: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<boolean> {

    options?.signal?.throwIfAborted();

    const connection = requireConnection(this.connectionScope(), "setNoiseEncryptionKey()");

    // Reject concurrent invocations explicitly. The protocol response carries no correlation, so a second call would steal the first call's response. The correlator's
    // own in-flight error code is `CORRELATOR_KEY_IN_FLIGHT`; we surface our host-specific `KEY_SET_IN_FLIGHT` instead so existing consumers continue to pattern-match
    // on the documented code.
    if(this.noiseKeyCorrelator.pending("default")) {

      throw new ConnectionError("setNoiseEncryptionKey is already in flight; await the previous call before issuing another.", "KEY_SET_IN_FLIGHT");
    }

    // This validator stands beside the handshake's own because the key set validates a key it sends to the device, and no handshake state exists here to validate it.
    // It reports the fault in the connect flow's wording for the same fault.
    const keyBuffer = Buffer.from(key, "base64");

    if(keyBuffer.length !== NOISE_PSK_LEN) {

      throw new EncryptionKeyInvalidError("The encryption key is invalid: PSK must be exactly " + String(NOISE_PSK_LEN) + " bytes, got " + String(keyBuffer.length) +
        ".", "INVALID_PSK_LENGTH");
    }

    // Build the protobuf fields for the key set request.
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: keyBuffer, wireType: WireType.LENGTH_DELIMITED }
    ];

    // The wait follows the caller's signal and the connection, and the correlator holds its timeout, so a cancellation, a teardown, and a timeout each reject with
    // their own reason and only the device's reply resolves. The composite is bound ahead of the send, so a teardown the send itself triggers still ends the wait.
    using request = composeRequestSignal(connection, { signal: options?.signal });

    // Encode and send the noise encryption key set request before parking on the correlator so the response handler always finds an awaiter.
    this.frameAndSend(MessageType.NOISE_ENCRYPTION_SET_KEY_REQUEST, this.encodeProtoFields(fields));

    return await this.noiseKeyCorrelator.await("default", { signal: request.signal, timeoutMs: options?.timeoutMs ?? DEFAULT_NOISE_KEY_SET_TIMEOUT_MS });
  }

  /**
   * Request the device-side log subscription at the supplied level. Pairs with `client.on("log", ...)` for callback-style consumption; for an `AsyncIterable` view with
   * refcounted level upgrades, use {@link EspHomeClient.logs} instead.
   *
   * @remarks ESPHome has no unsubscribe path on the wire, so subsequent calls at a more verbose level upgrade the device-side subscription. The level this method
   * sets is a floor held alongside the levels of any open {@link EspHomeClient.logs} iterators, and the device level is the maximum across them; a later call at a
   * less verbose level lowers the floor to that level without ever sending a level below the surviving maximum. Reissued automatically on every reconnect.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#log-subscription}
   *
   * @param level - The minimum log level to subscribe to. Defaults to `LogLevel.INFO`.
   * @param dumpConfig - When `true`, the device prepends a one-shot dump of its configuration to the log stream. Defaults to `false`.
   *
   */
  public subscribeToLogs(level: LogLevel = LogLevel.INFO, dumpConfig = false): void {

    this.logManager.requestDeviceLevel(level, dumpConfig);
  }

  /**
   * Handle device info response from the ESPHome device. This extracts all the device metadata from the response message.
   *
   * @param payload - The device info response payload.
   */
  private handleDeviceInfoResponse(payload: Buffer): void {

    this.log.debug("Received DeviceInfoResponse");

    // Decode the protobuf fields from the payload.
    const fields = this.decodeProtobuf(payload);

    // Pull every potentially-present field once. Each variable is `T | undefined`; we'll fold them into the DeviceInfo via conditional spread so absent fields stay
    // omitted rather than carrying explicit `undefined` (which `exactOptionalPropertyTypes` rightly distinguishes from omission).
    const usesPasswordValue = extractNumberField(fields, 1);
    const hasDeepSleepValue = extractNumberField(fields, 7);
    const apiEncryptionValue = extractNumberField(fields, 19);

    const name = extractStringField(fields, 2);
    const macAddress = extractStringField(fields, 3);
    const esphomeVersion = extractStringField(fields, 4);
    const compilationTime = extractStringField(fields, 5);
    const model = extractStringField(fields, 6);
    const projectName = extractStringField(fields, 8);
    const projectVersion = extractStringField(fields, 9);
    const webserverPort = extractNumberField(fields, 10);
    const legacyBluetoothProxyVersion = extractNumberField(fields, 11);
    const manufacturer = extractStringField(fields, 12);
    const friendlyName = extractStringField(fields, 13);
    const legacyVoiceAssistantVersion = extractNumberField(fields, 14);
    const bluetoothProxyFeatureFlags = extractNumberField(fields, 15);
    const suggestedArea = extractStringField(fields, 16);
    const voiceAssistantFeatureFlags = extractNumberField(fields, 17);
    const bluetoothMacAddress = extractStringField(fields, 18);
    const zwaveProxyFeatureFlags = extractNumberField(fields, 23);
    const zwaveHomeId = extractNumberField(fields, 24);

    // Decode the repeated serial-proxy advertisements at field 25. Each entry is a nested message with `name` (1) and `port_type` (2); the array index becomes the
    // `instance` number used in every subsequent serial-proxy wire message. Empty (or absent) when the device firmware was not compiled with `USE_SERIAL_PROXY`.
    const serialProxies = extractSerialProxies(fields, 25, (buffer) => this.decodeProtobuf(buffer));

    // Build the device info from a single object literal. Each conditional spread either contributes a property or contributes nothing - so absence is preserved.
    const info: DeviceInfo = {

      ...((apiEncryptionValue !== undefined) && { apiEncryptionSupported: apiEncryptionValue === 1 }),
      ...((bluetoothMacAddress !== undefined) && { bluetoothMacAddress }),
      ...((bluetoothProxyFeatureFlags !== undefined) && { bluetoothProxyFeatureFlags }),
      ...((compilationTime !== undefined) && { compilationTime }),
      ...((esphomeVersion !== undefined) && { esphomeVersion }),
      ...((friendlyName !== undefined) && { friendlyName }),
      ...((hasDeepSleepValue !== undefined) && { hasDeepSleep: hasDeepSleepValue === 1 }),
      ...((legacyBluetoothProxyVersion !== undefined) && { legacyBluetoothProxyVersion }),
      ...((legacyVoiceAssistantVersion !== undefined) && { legacyVoiceAssistantVersion }),
      ...((macAddress !== undefined) && { macAddress }),
      ...((manufacturer !== undefined) && { manufacturer }),
      ...((model !== undefined) && { model }),
      ...((name !== undefined) && { name }),
      ...((projectName !== undefined) && { projectName }),
      ...((projectVersion !== undefined) && { projectVersion }),
      ...((serialProxies.length > 0) && { serialProxies }),
      ...((suggestedArea !== undefined) && { suggestedArea }),
      ...((usesPasswordValue !== undefined) && { usesPassword: usesPasswordValue === 1 }),
      ...((voiceAssistantFeatureFlags !== undefined) && { voiceAssistantFeatureFlags }),
      ...((webserverPort !== undefined) && { webserverPort }),
      ...((zwaveHomeId !== undefined) && { zwaveHomeId }),
      ...((zwaveProxyFeatureFlags !== undefined) && { zwaveProxyFeatureFlags })
    };

    // Decode the repeated sub-device records at field 20. Each entry is a nested message with `device_id` (1), `name` (2), and `area_id` (3). Single-device
    // configurations leave this empty; multi-device parents enumerate every sub-device addressable via the protocol's `device_id` field.
    this.subDeviceList = extractSubDevices(fields, 20, (buffer) => this.decodeProtobuf(buffer));

    this.setDeviceInfo(info);

    this.log.debug("Device info extracted: " + JSON.stringify(info));
  }

  /**
   * Install a decoded device-information record, frozen along with its nested serial-proxy entries, so {@link deviceInfo} and the `deviceInfo` event can hand out the
   * record itself. The discovery decoder is the only caller; teardown clears the field to `null` directly.
   *
   * @param info - The freshly decoded record. It becomes read-only in place.
   */
  private setDeviceInfo(info: DeviceInfo): void {

    if(info.serialProxies) {

      for(const proxy of info.serialProxies) {

        Object.freeze(proxy);
      }

      Object.freeze(info.serialProxies);
    }

    this.remoteDeviceInfo = Object.freeze(info);
  }

  /**
   * Return the device information of the connected ESPHome device if available. The record is frozen and is the same object the most recent `deviceInfo` event carried;
   * a later `DeviceInfoResponse` replaces it whole.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#device-info}
   *
   * @returns The device information if available, or `null` if not yet received.
   *
   */
  public deviceInfo(): Nullable<DeviceInfo> {

    return this.remoteDeviceInfo;
  }

  /**
   * Parse a single `LIST_ENTITIES_*_RESPONSE`, decode it, and register it in the internal discovery maps. The decoder lives in `discovery.ts`; this handler owns the
   * state mutation.
   *
   * @param type - The message type indicating the entity type.
   * @param payload - The entity description payload.
   */
  private handleListEntity(type: number, payload: Buffer): void {

    if(type === MessageType.LIST_ENTITIES_SERVICES_RESPONSE) {

      this.handleListServiceEntity(payload);

      return;
    }

    const schema = this.schemaByListEntitiesMessageType.get(type);

    if(!schema) {

      this.log.warn("Unknown list entities message type.", { type });

      return;
    }

    const fields = this.decodeProtobuf(payload);

    // Prefer the schema's own `type` tag over the wire-derived label. For built-ins the two are identical (e.g., LIST_ENTITIES_COVER_RESPONSE -> "cover" matches
    // the cover schema's `type`); for extras-registered schemas that alias an upstream wire-message-type with a renamed tag ({@link aliasOf}'s
    // `{ ...aliasOf("cover"), type: "door_cover" }` pattern), the schema's `type` is the consumer-facing identifier and the wire label would mis-name the entity.
    const entityType = schema.type as EntityType;
    const entity = decodeEntityFromSchema({

      decodeNested: (buffer: Buffer): Record<number, FieldValue[]> => this.decodeProtobuf(buffer),
      entityType,
      fields,
      log: this.log,
      schema
    });

    if(!entity) {

      return;
    }

    // Defer the canonical id mint, the lock-step index updates, and the per-entity debug log to the registry; the host's job here is to decode the wire payload into
    // the {@link Entity} record and hand it off.
    this.registry.register(entity);
  }

  /**
   * Handle a `LIST_ENTITIES_SERVICES_RESPONSE` message. Decoding lives in `discovery.ts`; the `ServiceRegistry` owns the per-
   * service debug log and the lock-step index updates; this handler emits the per-service discovery event after the registry has accepted the record.
   *
   * @param payload - The service entity description payload.
   */
  private handleListServiceEntity(payload: Buffer): void {

    const fields = this.decodeProtobuf(payload);
    const service = decodeServiceEntity({

      decodeNested: (buffer): Record<number, FieldValue[]> => this.decodeProtobuf(buffer),
      fields,
      log: this.log
    });

    if(!service) {

      return;
    }

    this.serviceRegistry.register(service);
    this.emit("serviceDiscovered", service);
  }

  /**
   * Decodes a state update, looks up entity info, and emits events. This processes telemetry data from entities and emits appropriate events.
   *
   * @param type - The message type indicating the entity type.
   * @param payload - The state update payload.
   */
  private handleTelemetry(type: number, payload: Buffer): void {

    // Decode the protobuf fields from the payload.
    const fields = this.decodeProtobuf(payload);

    // Determine where the entity key lives. The original state-response messages all stamped the key at field 1, but newer wire messages (the shared IR/RF receive event
    // at id 137) put it elsewhere because their proto layout reserves earlier field numbers for device_id. Consult the schema for the right slot; schemas that share a
    // state.messageType (IR + RF) must declare the same keyFieldNumber because they describe the same wire bytes. Fall back to field 1 when no schema claims this
    // messageType (the BUTTON_COMMAND_REQUEST re-emit path, where the inbound frame is the original command rather than a state response).
    const probeSchema = this.schemaByStateMessageType.get(type);
    const keyFieldNumber = probeSchema?.state.keyFieldNumber ?? 1;
    const key = extractEntityKey(fields, keyFieldNumber);

    if(key === undefined) {

      return;
    }

    // Look up the entity information using the key.
    const knownEntity = this.registry.byKey(key);
    const name = knownEntity?.name ?? ("unknown(" + String(key) + ")");
    const typeLabel = knownEntity?.type ?? getEntityTypeLabel(type);
    const eventType = typeLabel.toLowerCase();

    // Read the device_id field number straight from the already-resolved (extras-aware) schema - the schema's `state.deviceIdFieldNumber` is the single source of truth,
    // with `0` meaning "this state shape has no device_id slot" (the same sentinel telemetry.ts honors). Reading it from the resolved schema means a power-user extras
    // schema declaring a novel state message with a device_id slot records that slot correctly.
    const stateDeviceIdField = (probeSchema && (probeSchema.state.deviceIdFieldNumber > 0)) ? probeSchema.state.deviceIdFieldNumber : undefined;

    if(stateDeviceIdField !== undefined) {

      const stateDeviceId = extractNumberField(fields, stateDeviceIdField);

      if(stateDeviceId !== undefined) {

        // Store or update the device_id for this entity.
        this.registry.recordDeviceId(key, stateDeviceId);
      }
    }

    // Handle different entity types with their specific state structures.
    let data: TelemetryEvent;

    // Handle special cases that don't follow the standard schema pattern.
    if(type === MessageType.BUTTON_COMMAND_REQUEST) {

      // Button is a special case - it's not a state response but a convenience notification.
      data = {

        entity: name,
        key,
        pressed: true,
        type: "button"
      };

    } else {

      // Try schema-driven decoding for standard state responses. Prefer the entity's declared type when the entity is known: this disambiguates wire messages that are
      // shared across entity types (the canonical case is `InfraredRFReceiveEvent` at id 137, which both `infrared` and `radio_frequency` schemas claim as their state
      // message). When no registered entity claims the key, the wire message type is the only signal we have, so we decode with the last schema in table order that
      // declares it...extras follow the built-ins, so an extras alias wins its shared type, and an unclaimed receive event on id 137 decodes as `radio_frequency`.
      const schema = knownEntity ? getSchemaIn(this.schemasTable, knownEntity.type) : this.schemaByStateMessageType.get(type);

      if(schema) {

        // Use unified schema-driven decoding for all entity types with defined schemas.
        data = decodeStateFromSchema({ entityType: schema.type, fields, key, name, stateSchema: schema.state });

      } else {

        // Fall back to a best-effort payload for unknown message types.
        const state = extractTelemetryValue(fields, 2);

        data = {

          entity: name,
          key,
          type: eventType,
          ...((typeof state !== "undefined") ? { value: state } : {})
        } as TelemetryEvent;
      }
    }

    // When the entity is unknown (no successful discovery), there is no id to cache the event under, so we publish without a cache write rather than fabricate an id.
    // For a known entity we reuse the id the registry already minted at register time rather than building the string again on every state event. The registry is the
    // single mint site; the `??` fallback re-mints only in the unreachable case where a key resolved by `byKey` is somehow absent from the id index.
    this.publishTelemetry(knownEntity ? (this.registry.idByKey(key) ?? mintEntityId(knownEntity.type, knownEntity.objectId)) : null, data);

    // We keep a concise debug record for quick tracing during development and diagnostics. The event is passed as a deferred parameter rather than pre-serialized, so the
    // default no-op debug logger discards it without paying the per-frame JSON.stringify (a full object walk + string allocation) the warm telemetry path would otherwise
    // incur on every state event regardless of whether debug is enabled.
    this.log.debug("State update received.", data);
  }

  /**
   * Publish one state event: the single path every entity's state reaches consumers through, the state-frame handler and the camera's reassembled images alike.
   *
   * @remarks Mutate-then-notify: the cache write comes first, so a listener reading `client.latest(id)` or iterating `client.snapshot()` from inside `on("telemetry")`
   * or the per-type channel sees the event that fired it. Asserted by the "cache contract:" test in esphome-client.test.ts.
   *
   * @param id - The branded id to cache the event under, or `null` when no registered entity claims it, in which case the cache is left alone.
   * @param data - The state event to publish.
   */
  private publishTelemetry(id: Nullable<EntityId>, data: TelemetryEvent): void {

    if(id !== null) {

      this.latestCache.set(id, data);
    }

    // We emit a strongly-typed union on the generic telemetry channel. This is the most flexible subscription path.
    this.emit("telemetry", data);

    // We also emit on the per-type channel named by the event's tag, which enables targeted subscriptions. `data.type` is the tag of `data`'s own variant, so the
    // channel and payload match by construction; the compiler checks the call only against the union of every per-type payload, which `data` satisfies as-is.
    this.emit(data.type, data);
  }

  // Schema-driven decoders are implemented in `discovery.ts` (entity discovery + scalar/repeated field extractors) and `telemetry.ts` (state-update decoding). The
  // host class owns state mutation: it routes inbound payloads through the pure decoders, then writes the results into its registries and emits bus events.

  /**
   * Derive the connection scope a request issued at this moment would travel on. This is the host's one derivation of that fact, which every sub-API host object hands
   * out and the key set reads, and it stores nothing: each call reads the attached session, then whether a manual connect is in flight (its controller is set until
   * that connect settles, a disconnect aborting it without clearing it) or the automatic reconnect is active (its flag spans every attempt and backoff, the give-up's
   * announcement included).
   *
   * @returns `attached` with the session's scope signal, `connecting` while a manual connect or the automatic reconnect runs, and `none` otherwise.
   */
  private connectionScope(): ConnectionScope {

    if(this.session) {

      return { kind: "attached", signal: this.session.scope.signal };
    }

    if((this.connectController !== null) || this.reconnectInProgress) {

      return { kind: "connecting" };
    }

    return { kind: "none" };
  }

  /**
   * Send a typed message via the active transport. Routes to plaintext framing or to encrypted noise framing automatically based on the transport's phase. The promise
   * is fire-and-forget at the consumer level: a send-time socket fault tears the transport's iterator down, which the receiver escalates through its terminal-completion
   * hook to {@link disconnectInternal}, so the fault drives a single teardown (and auto-reconnect) rather than being lost. The method returns synchronously so call sites
   * stay one-line; the underlying socket write is awaited internally.
   *
   * @param type - The message type identifier.
   * @param payload - The encoded message payload (already a protobuf-encoded body).
   */
  private frameAndSend(type: number, payload: Buffer): void {

    const session = this.session;

    if(!session) {

      this.log.debug("frameAndSend invoked without an active transport; dropping " + messageTypeName(type) + ".");

      return;
    }

    // Fire-and-forget; a send-related socket fault surfaces on the transport's iterator and is routed via the receiver's terminal-completion hook into the disconnect
    // path (which schedules auto-reconnect). The local catch sees every failed write, and its error is the one the transport has already ended itself with, so
    // logging at debug suffices because the iterator-driven teardown is the authoritative recovery.
    void session.transport.send(type, payload).catch((err: unknown) => {

      this.log.debug("frameAndSend failed for " + messageTypeName(type) + ": " + (err instanceof Error ? err.message : String(err)));
    });
  }

  /**
   * Get entity key by ID. This looks up the numeric key for an entity given its branded id. Use {@link entityId} to mint the brand or
   * {@link parseEntityId} to narrow an untrusted string before calling.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#entity-key-resolution}
   *
   * @param id - The branded entity id to look up.
   *
   * @returns The entity key or `null` if not found.
   *
   */
  public getEntityKey(id: EntityId): Nullable<number> {

    return this.registry.keyForId(id);
  }

  /**
   * Emit a structured debug-level log of every registered entity, grouped by type, with names and numeric keys. Diagnostic helper - not for consumer-facing UI.
   */
  public logAllEntityIds(): void {

    this.registry.logAll();
  }

  /**
   * Get entity information by ID. This retrieves full entity details given its branded id. Use {@link entityId} to mint the brand or
   * {@link parseEntityId} to narrow an untrusted string before calling.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#discovery-walkthrough}
   *
   * @param id - The branded entity id to look up.
   *
   * @returns The entity information or `null` if not found.
   *
   */
  public getEntityById(id: EntityId): Nullable<Entity> {

    return this.registry.byId(id);
  }

  /**
   * Check if an entity ID exists. This is the one entity-lookup method that explicitly accepts both branded ids and plain strings - the question "is this a known
   * id at all" is the boundary where untrusted input is allowed.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#entity-id-narrowing}
   *
   * @param id - The entity id to check, branded or plain.
   *
   * @returns `true` if the entity exists, `false` otherwise.
   *
   */
  public hasEntity(id: EntityId | string): boolean {

    return this.registry.hasId(id);
  }

  /**
   * Read the most recent state event for an entity, narrowed to the entity's type.
   *
   * @remarks Cache contract: the latest-state cache is updated **before** listeners are notified. A `client.latest(id)` read from inside an `on("telemetry")` or
   * per-type listener sees the event that fired the listener. The same guarantee holds for the {@link snapshot} and {@link snapshotFor} views.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#latest-state-lookup}
   *
   * @typeParam T - Entity type tag carried by the branded id.
   * @param id - Branded entity id.
   * @returns The state event, or `null` when no state has been recorded since the most recent {@link EspHomeClient.connect}.
   *
   */
  public latest<T extends ExtendedEntityType<Extras>>(id: EntityId<T>): Nullable<StateEventFor<SchemaForExtended<T, Extras>>> {

    // The cache is keyed by the same branded id the caller already narrowed to type T; for extras-keyed types the cache stores whatever event was set under that
    // id, so the cast back to the extras-keyed shape is sound without needing extras-specific cache typing.
    return this.latestCache.get(id as EntityId) as Nullable<StateEventFor<SchemaForExtended<T, Extras>>>;
  }

  /**
   * Read-only snapshot of the entire latest-state cache. One {@link TelemetryEvent} per entity, keyed by branded id. Useful for "rehydrate UI from current state on
   * (re)connect" patterns.
   *
   * @remarks Cache contract: the returned map is a live view, and the cache is updated **before** listeners are notified. A `client.snapshot()` iteration inside an
   * `on("telemetry")` or per-type listener already includes the event that fired the listener. The map reflects only the state events received so far - it is a live view
   * of the cache, not a guaranteed-complete point-in-time snapshot, because ESPHome's `SubscribeStates` stream has no "initial states complete" marker.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#snapshot}
   *
   * @returns A read-only view of every entity's most recent state.
   *
   */
  public snapshot(): ReadonlyMap<EntityId, TelemetryEvent> {

    return this.latestCache.entries();
  }

  /**
   * Read-only snapshot of the latest-state cache, narrowed to one entity type.
   *
   * @remarks Cache contract: same as {@link snapshot} - the cache is updated **before** listeners are notified, so an `on("telemetry")` or per-type listener that
   * calls `snapshotFor(type)` sees the event that fired the listener.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#snapshot}
   *
   * @typeParam T - Entity type tag.
   * @param type - The entity type to filter on.
   * @returns A read-only map of entity ids to their state events, narrowed to entries of type `T`.
   */
  public snapshotFor<T extends ExtendedEntityType<Extras>>(type: T): ReadonlyMap<EntityId<T>, StateEventFor<SchemaForExtended<T, Extras>>> {

    // entriesFor filters by the same type string the schema's `type` tag declares, matching the bus channel's routing key one-to-one; extras-keyed
    // entries route correctly without needing extras-specific cache typing.
    return this.latestCache.entriesFor(type as EntityType) as unknown as ReadonlyMap<EntityId<T>, StateEventFor<SchemaForExtended<T, Extras>>>;
  }

  /**
   * Enumerate the parent ESP's sub-devices. Single-device configurations return an empty array; multi-device parents return one record per addressable sub-device
   * (the parent itself, `device_id` 0, is not included).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#sub-device-enumeration}
   *
   * @returns A read-only list of {@link SubDevice} records.
   *
   */
  public subDevices(): readonly SubDevice[] {

    return this.subDeviceList;
  }

  /**
   * Filter the discovered entity list by parent device. Pass a positive sub-device id to scope to that sub-device, `0` to scope to the parent ESP, or `undefined`
   * to return every entity regardless of device.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#sub-device-enumeration}
   *
   * @param deviceId - The device id to filter on, or `undefined` to return every entity.
   * @returns A new array of matching entities. The original entity records are not copied; consumers should treat them as read-only.
   *
   */
  public entitiesByDevice(deviceId: number | undefined): Entity[] {

    return this.registry.byDevice(deviceId);
  }

  /**
   * Snapshot every discovered entity id, grouped by entity type. Convenient for "what can I control on this device?" UIs that don't need the per-entity metadata.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#discovery-walkthrough}
   *
   * @returns A plain record keyed by entity type, each value an array of branded id strings in discovery order.
   *
   */
  public getAvailableEntityIds(): Record<string, string[]> {

    return this.registry.availableIds();
  }

  /**
   * Snapshot every discovered entity record with its branded id stamped in as the `id` field. Useful when a consumer needs both the typed metadata and the routable
   * id together (for example to populate a UI list keyed by id).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#discovery-walkthrough}
   *
   * @returns A new array of entity records with `id` derived from the registry's reverse index. Mutating the array does not affect the registry.
   *
   */
  public getEntitiesWithIds(): (Entity & { id: string })[] {

    return this.registry.withIds();
  }

  /**
   * Send a `PING_REQUEST` frame on demand. The keep-alive supervisor drives heartbeat automatically when `keepAlive` is enabled; this method is for consumers that
   * want to force an immediate liveness probe (e.g., after a long idle period before issuing a critical command).
   */
  public sendPing(): void {

    this.frameAndSend(MessageType.PING_REQUEST, Buffer.alloc(0));
  }

  /**
   * Generic, type-safe command entry point. The single canonical way to issue any entity command.
   *
   * @remarks `T` is inferred from the branded id, which narrows `options` automatically: `command(lightId, { state: true, brightness: 0.5 })` typechecks; passing
   * `position` for a light is a compile error. The runtime adapter table (`COMMAND_ADAPTERS` from `./schemas/adapters.ts`) handles wire-vs-API divergences (light's
   * `rgb: { r, g, b }` flattening, siren's duration rounding) before the schema-driven encoder runs.
   *
   * Fire-and-forget at the consumer level: encode failures and unknown ids are warned via the configured logger and dropped rather than thrown, so the call site
   * stays linear. To await a matching state event, use {@link EspHomeClient.commandAndAwait}.
   *
   * Infrared and radio-frequency ids are a compile error here because a transmit must pass the transmitter-capability check, so they go through
   * {@link EspHomeClient.transmitRawTimings}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#command-and-await}
   *
   * @param id - The branded entity id. Use the {@link entityId} mint or {@link parseEntityId} / {@link isEntityId} predicates to
   * obtain one from an untrusted string.
   * @param options - Type-narrowed command options for the entity type.
   *
   */
  public command<T extends Exclude<ExtendedEntityType<Extras>, TransmitEntityType>>(id: EntityId<T>, options: CommandFor<SchemaForExtended<T, Extras>>): void {

    // The internal {@link runCommand} runner is parameterized over the built-in {@link EntityType} for tests' ergonomic continuity. The runtime is brand-erased - the
    // runner extracts the entity-type string from the id's prefix and consults the host's per-instance schema resolver - so casting at this single boundary is sound:
    // for an extras-keyed `T` the cast widens the brand to the runner's accepted type without changing the runtime payload, and the host routes the schema lookup
    // through the per-instance table, not the module-level constant.
    runCommand(this.commandHost, id as unknown as EntityId, options as unknown);
  }

  /**
   * Send a command and resolve with the next matching state event for the same entity. Useful for "set the light, await confirmation" patterns where the caller
   * wants the post-command state in one await rather than wiring up a separate subscription.
   *
   * @remarks Type-level constraint excludes entity types with no state response - `button` (stateless), `sensor`, `binary_sensor`, and `text_sensor` (read-only),
   * `camera` (its schema declares no command, so there is nothing to send and await), and `infrared` / `radio_frequency` (transmit is
   * fire-and-forget; the receive event is an unsolicited inbound signal, not a command acknowledgement). Calling `commandAndAwait` against any of those is a compile
   * error, not a runtime hang.
   *
   * The stream subscription opens *before* the command is sent, so the device cannot win the race by responding before we listen. The await follows the caller's
   * optional signal, the default 2000ms timeout, and the connection the command was issued on; whichever ends it first rejects the await with its own reason and tears
   * down the subscription.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#command-and-await}
   *
   * @typeParam T - Entity type tag carried by the branded id.
   * @param id - Branded entity id.
   * @param options - Type-narrowed command options for the entity type.
   * @param awaitOptions - Optional cancellation signal, custom timeout, and predicate that further narrows the matching state event.
   * @returns The first state event for the entity that matches the predicate.
   *
   * @throws {NotConnectedError} (`CONNECT_IN_PROGRESS`) when the call is issued while a manual connect has not yet settled or the automatic reconnect is active, and
   * (`NOT_CONNECTED`) when it is issued with no connection otherwise. Nothing is sent or counted, and this check runs before every check below.
   * @throws {ConfigurationError} (`MALFORMED_ENTITY_ID`) when the supplied id is not a valid `${type}-${objectId}` brand.
   * @throws {ConfigurationError} (`UNKNOWN_ENTITY_ID`) when the id parses but the entity has not been discovered on the current connection.
   * @throws {ConfigurationError} (`SCHEMA_UNKNOWN` / `COMMAND_UNSUPPORTED`) when no schema, or no command schema, is registered for the entity type. Nothing is sent.
   * @throws {ConfigurationError} (`ENUM_VALUE_UNKNOWN` / `VALUE_OUT_OF_RANGE`) when a command field receives an unknown enum alias or a value outside the integer domain
   * its wire type carries. Nothing is sent.
   * @throws {ConnectionLostError} when the connection the command was issued on is torn down before a matching state event arrives.
   * @throws The signal's reason, as it is, when `awaitOptions.signal` aborts, including when it was already aborted at call time, and nothing is sent then; and the
   * timeout's `TimeoutError` when the deadline elapses (2000ms unless `awaitOptions.timeoutMs` overrides it).
   */
  public async commandAndAwait<T extends Exclude<ExtendedEntityType<Extras>, NonAwaitableEntityType>>(
    id: EntityId<T>,
    options: CommandFor<SchemaForExtended<T, Extras>>,
    awaitOptions?: CommandAndAwaitOptions<T & Exclude<EntityType, NonAwaitableEntityType>>
  ): Promise<StateEventFor<SchemaForExtended<T, Extras>>> {

    // Same brand-erasure pattern as {@link command}; the per-instance schema resolver flows through the host so extras-registered entity types resolve correctly.
    return runCommandAndAwait(
      this.commandHost,
      id as unknown as EntityId<Exclude<EntityType, NonAwaitableEntityType>>,
      options as unknown,
      awaitOptions as unknown as CommandAndAwaitOptions<Exclude<EntityType, NonAwaitableEntityType>>
    ) as Promise<StateEventFor<SchemaForExtended<T, Extras>>>;
  }

  /**
   * Transmit raw mark/space timings on an infrared or radio-frequency entity. Issues `INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` (id 136) on the wire; the device drives
   * its LED or RF transmitter to reproduce the supplied pattern. Accepts either `EntityId<"infrared">` or `EntityId<"radio_frequency">`, since the wire message and
   * field layout are shared across both physical layers.
   *
   * @remarks This is the only consumer-facing entry point for the shared transmit RPC. Unlike {@link command}, the call surfaces typed failure for unknown or
   * non-transmitter entities instead of warn-and-drop, because an IR/RF transmit silently dropped is invisible to the consumer (no acknowledged completion event arrives,
   * so a missing transmission cannot be detected after the fact). Capability gating is centralized here so callers do not need to bit-test against
   * {@link InfraredCapabilityFlags} themselves before every transmit. The capability flag bit positions are identical between {@link InfraredCapabilityFlags} and
   * {@link RadioFrequencyCapabilityFlags}, so the same `TRANSMITTER` constant covers both branches.
   *
   * Usage (infrared):
   *
   * {@includeCode ./examples/showcase.ts#infrared-transmit}
   *
   * Usage (radio frequency):
   *
   * {@includeCode ./examples/showcase.ts#radio-frequency-transmit}
   *
   * @typeParam T - The branded entity-type tag; must resolve to `"infrared"` or `"radio_frequency"`.
   * @param id - The branded entity id. The brand carries the entity type at the type level so consumers cannot transmit through a non-IR/RF entity by accident.
   * @param options - Transmit parameters. `carrierFrequency` (Hz) drives the IR carrier or RF carrier; `repeatCount` is the number of times the entire pattern is
   * transmitted (1 = once); `timings` is the mark/space pattern in microseconds where positive values are mark (LED/TX on) and negative values are space (LED/TX off);
   * `modulation` is the {@link RadioFrequencyModulation} enum value (ignored for IR entities per the proto, but accepted for consumer simplicity - passing through
   * whatever the consumer supplies is the safer choice than silently rewriting it).
   *
   * @throws {ConnectionError} with code `ENTITY_NOT_FOUND` when no entity is registered for `id` on the current connection.
   * @throws {ConnectionError} with code `ENTITY_NOT_TRANSMITTER` when the entity exists but its `capabilities` bitmask does not include the transmitter bit. Receive-only
   * hardware cannot fulfill a transmit request, so failing eagerly surfaces the configuration mismatch.
   *
   */
  public transmitRawTimings<T extends TransmitEntityType>(id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void {

    const entity = this.registry.byId(id);

    if(!entity) {

      throw new ConnectionError("No entity is registered for " + id + ".", "ENTITY_NOT_FOUND");
    }

    // A receive-only entity is refused before anything reaches the wire. The check lives in the command runner module so the testing mock refuses exactly the entities
    // the client refuses.
    assertTransmitter(entity, id);

    // Delegate to the schema-driven command runner. Both infrared and radio_frequency declare the same command messageType (136) and field layout, so encoder output is
    // wire-identical; the only consumer-visible distinction is the branded id's type tag carried through telemetry, not the transmit path.
    runCommand(this.commandHost, id as unknown as EntityId, options as unknown);
  }

  /**
   * Async-iterable view of every state update across every entity. Yields the {@link TelemetryEvent} discriminated union; consumers narrow on the event's `type`
   * tag.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#telemetry-stream}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<TelemetryEvent>`.
   *
   */
  public telemetry(options?: StreamOptions): AsyncIterable<TelemetryEvent> {

    return this.bus.stream("telemetry", options);
  }

  /**
   * Async-iterable view of state updates for one entity type. Filters the generic {@link telemetry} stream to events of the requested type.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#telemetry-stream-per-type}
   *
   * @typeParam T - Entity type tag.
   * @param type - The entity type to filter on.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>`.
   *
   */
  public telemetryFor<T extends ExtendedEntityType<Extras>>(type: T, options?: StreamOptions): AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>> {

    // The bus already keys per-type events by the type string; we read directly from that channel rather than filter the generic telemetry stream because the channel
    // matches the EntityType key one-to-one in {@link ClientEventsMap}. For extras-keyed types the bus channel is the same string the schema's `type` tag
    // declares, so the generic stream() call routes them correctly without needing extras-specific bus typing.
    return this.bus.stream(type as EntityType, options) as AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>>;
  }

  /**
   * Async-iterable view of state updates for one specific entity. Filters {@link telemetryFor} on the entity's numeric key (resolved from the branded id when the view
   * is requested, so the filter is O(1) per event). An id the client has not discovered yields a view that ends at once.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#telemetry-stream-per-id}
   *
   * @typeParam T - Entity type tag carried by the branded id.
   * @param id - Branded entity id.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>`.
   *
   */
  public telemetryForId<T extends ExtendedEntityType<Extras>>(id: EntityId<T>, options?: StreamOptions): AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>> {

    // We resolve the target key once, before touching the bus. An entity the registry does not know yet (e.g., one subscribed to before discovery completes) can never
    // match an event - we shouldn't fabricate a match against a key we don't have - so the consumer gets an already-ended view and re-acquires it once the entity is
    // known. Opening a bus stream for it would attach a listener that no iteration ever releases.
    const targetKey = this.registry.keyForId(id as EntityId);

    if(targetKey === null) {

      return endedAsyncIterable();
    }

    const dash = id.indexOf("-");
    const entityType = ((dash > 0) ? id.slice(0, dash) : id) as T;

    // The selector keeps this entity's events and skips its siblings' as they are emitted, so they never occupy the view's queue. Every entity event carries the
    // numeric `key`, the camera's reassembled image included, so the selector compares it directly.
    return this.bus.stream(entityType as EntityType, {

      ...options,
      select: (event: ClientEventsMap[EntityType]): typeof event | undefined => (event.key === targetKey) ? event : undefined
    }) as AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>>;
  }

  /**
   * Refcounted async-iterable view of device log messages at the requested level. The first iterator opened sends `SUBSCRIBE_LOGS_REQUEST(level)` on the wire;
   * opening a second iterator at a higher verbosity upgrades the device-side subscription. Closing the iterator that holds the highest level sends a downgrade to the
   * next-highest level still held (by another iterator or by {@link EspHomeClient.subscribeToLogs}) at once. ESPHome has no unsubscribe path, so closing the last one
   * sends nothing and the device keeps its last level until the connection drops.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#log-subscription}
   *
   * @param level - The minimum log level to subscribe to.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<LogEventData>`.
   *
   */
  public logs(level: LogLevel, options?: StreamOptions): AsyncIterable<LogEventData> {

    return this.logManager.subscribe(level, options);
  }

  /**
   * Web Streams adapter for {@link telemetry}. Same data, different surface; backpressure parity comes from the underlying AsyncIterable. Construction is one line
   * because `ReadableStream.from` is a stable platform method in Node 22.6+.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#web-streams-interop}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns A `ReadableStream<TelemetryEvent>`.
   *
   */
  public telemetryReadable(options?: StreamOptions): ReadableStream<TelemetryEvent> {

    return ReadableStream.from(this.telemetry(options));
  }

  /**
   * Web Streams adapter for {@link logs}. Subscription refcounting and level-upgrade semantics are inherited from the underlying AsyncIterable.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#web-streams-interop}
   *
   * @param level - The minimum log level to subscribe to.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns A `ReadableStream<LogEventData>`.
   *
   */
  public logsReadable(level: LogLevel, options?: StreamOptions): ReadableStream<LogEventData> {

    return ReadableStream.from(this.logs(level, options));
  }

  /**
   * Synchronous read of the live {@link ConnectionHealth} record. The record is frozen and is the same object the most recent `healthChange` event carried; each
   * transition replaces it whole. Uptime is not stored on the record; derive it from the returned snapshot via {@link connectionUptimeMs}, which reads `connectedAtMs`
   * while the socket is up and `0` while it is down.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#lifecycle-and-health}
   *
   * @returns The current health record.
   *
   */
  public health(): ConnectionHealth {

    // The record is a frozen value that every transition replaces whole, so we hand out the object itself: it is the same one the latest `healthChange` carried, and no
    // caller can mutate it. Uptime is derived by the caller via {@link connectionUptimeMs} from `connectedAtMs`, so there is nothing to compute or guard here.
    return this.healthRecord;
  }

  /**
   * Subscribe a callback to health-state transitions. Returns a `Disposable` that removes the listener on dispose.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#health-stream}
   *
   * @param handler - The callback. Receives the current health record on every transition.
   * @returns A `Disposable` that removes the listener.
   *
   */
  public onHealthChange(handler: (health: ConnectionHealth) => void): Disposable {

    return this.bus.on("healthChange", handler);
  }

  /**
   * Async-iterable view of health-state transitions.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#health-stream}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<ConnectionHealth>`.
   *
   */
  public healthStream(options?: StreamOptions): AsyncIterable<ConnectionHealth> {

    return this.bus.stream("healthChange", options);
  }

  /**
   * Async-iterable view of connect/disconnect transitions. Each event is the typed {@link LifecycleEvent} discriminated union; consumers gate on
   * `event.kind === "connect" | "disconnect"` and pattern-match the disconnect cause against the typed error hierarchy.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#lifecycle-and-health}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<LifecycleEvent>`.
   *
   */
  public lifecycle(options?: StreamOptions): AsyncIterable<LifecycleEvent> {

    return this.bus.stream("lifecycle", options);
  }

  /**
   * Web Streams adapter for {@link lifecycle}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#web-streams-interop}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns A `ReadableStream<LifecycleEvent>`.
   *
   */
  public lifecycleReadable(options?: StreamOptions): ReadableStream<LifecycleEvent> {

    return ReadableStream.from(this.lifecycle(options));
  }

  /**
   * Voice-assistant sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant}
   *
   * @returns The voice-assistant sub-API instance.
   *
   */
  public get voiceAssistant(): VoiceAssistantApi {

    if(!this.voiceAssistantApi) {

      const voiceAssistantHost: VoiceAssistantHost = {

        bus: this.bus,
        connectionScope: (): ConnectionScope => this.connectionScope(),
        log: this.log,
        send: (type, payload): void => { this.frameAndSend(type, payload); }
      };

      this.voiceAssistantApi = new VoiceAssistantApi(voiceAssistantHost);
    }

    return this.voiceAssistantApi;
  }

  /**
   * Serial-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).
   *
   * @remarks Composes two `Correlator` instances (flush + getModemPins, keyed by instance) with a refcounted per-instance subscriber map for the data-stream
   * iterators. Re-issues the device-side subscriptions on every successful reconnect so consumer-held iterators see a continuous stream across the disconnect.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-list}
   *
   * @returns The serial-proxy sub-API instance.
   *
   */
  public get serial(): SerialProxyApi {

    if(!this.serialProxyApi) {

      const serialProxyHost: SerialProxyHost = {

        bus: this.bus,
        connectionScope: (): ConnectionScope => this.connectionScope(),
        deviceInfo: (): Nullable<DeviceInfo> => this.remoteDeviceInfo,
        log: this.log,
        send: (type, payload): void => { this.frameAndSend(type, payload); }
      };

      this.serialProxyApi = new SerialProxyApi(serialProxyHost);
    }

    return this.serialProxyApi;
  }

  /**
   * Bluetooth-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).
   *
   * @remarks Owns the global advertisement-subscription refcount and the cached scanner-state push. Re-issues the device-side advertisement subscription on every
   * successful reconnect so iterators alive across the cycle see a continuous stream. The module owns both the scanning surface and the `Correlator`-driven GATT
   * request/response operations (connect, pair, unpair, service discovery, characteristic and descriptor read/write, notify).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-availability}
   *
   * @returns The Bluetooth-proxy sub-API instance.
   *
   */
  public get bluetooth(): BluetoothProxyApi {

    if(!this.bluetoothProxyApi) {

      const bluetoothProxyHost: BluetoothProxyHost = {

        bus: this.bus,
        connectionScope: (): ConnectionScope => this.connectionScope(),
        deviceInfo: (): Nullable<DeviceInfo> => this.remoteDeviceInfo,
        log: this.log,
        send: (type, payload): void => { this.frameAndSend(type, payload); }
      };

      this.bluetoothProxyApi = new BluetoothProxyApi(bluetoothProxyHost);
    }

    return this.bluetoothProxyApi;
  }

  /**
   * Z-Wave-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).
   *
   * @remarks This sub-API is a transparent byte pipe to the device's Z-Wave radio Serial API. It does NOT parse Z-Wave Serial API frames, command classes, or security
   * envelopes. Consumers route the inbound frame stream into a Z-Wave-aware library (e.g., `zwave-js`) and write back via {@link ZWaveProxyApi.send}. The
   * module shape mirrors {@link bluetooth} simplified for the single-subscription case: a single-integer refcount, a cached home id, and no `Correlator` instances
   * (there is no request/response correlation in this subsystem - frames flow asynchronously in both directions and home-id changes are unsolicited pushes).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#zwave-byte-pipe}
   *
   * @returns The Z-Wave-proxy sub-API instance.
   *
   */
  public get zwave(): ZWaveProxyApi {

    if(!this.zwaveProxyApi) {

      const zwaveProxyHost: ZWaveProxyHost = {

        bus: this.bus,
        deviceInfo: (): Nullable<DeviceInfo> => this.remoteDeviceInfo,
        log: this.log,
        send: (type, payload): void => { this.frameAndSend(type, payload); }
      };

      this.zwaveProxyApi = new ZWaveProxyApi(zwaveProxyHost);
    }

    return this.zwaveProxyApi;
  }

  /**
   * Camera sub-API. Returns a per-id instance cached for the lifetime of the client; repeated calls with the same id return the same object, so a single
   * `const cam = client.camera(id)` stays coherent across call sites.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#camera-snapshot}
   *
   * @param id - Branded camera id.
   * @returns The camera sub-API instance.
   *
   */
  public camera(id: EntityId<"camera">): CameraApi {

    const existing = this.cameraInstances.get(id);

    if(existing) {

      return existing;
    }

    const cameraHost: CameraHost = {

      bus: this.bus,
      connectionScope: (): ConnectionScope => this.connectionScope(),
      log: this.log,
      maxImageBytes: this.maxImageBytes,
      publishTelemetry: (cameraId, event): void => { this.publishTelemetry(cameraId, event); },
      send: (type, payload): void => { this.frameAndSend(type, payload); }
    };

    const fresh = new CameraApi(cameraHost, id);

    this.cameraInstances.set(id, fresh);

    return fresh;
  }

  /**
   * User-defined services sub-API. Exposes the discovered service catalog and the two execution paths:
   *
   *   - `list()` - enumerate the user-defined services discovered on the current connection (shallow copy in discovery order).
   *   - `execute(key, args?)` - execute a service by its numeric key (the lower-level entry point when the key is cached).
   *   - `executeByName(name, args?)` - look the service up by name in the discovery registry and dispatch.
   *
   * Devices that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES` emit an `EXECUTE_SERVICE_RESPONSE` correlated via `callId`; consumers receive these via the
   * client's `serviceCallResult` event. Older firmware treats `execute()` as fire-and-forget and never produces the response message.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#service-execution}
   *
   * @returns The {@link UserServicesApi} instance bound to this client. The instance is lazy-built on first access and cached for the client's lifetime.
   *
   */
  public get services(): UserServicesApi {

    this.userServicesApi ??= new UserServicesApi({

      log: this.log,
      send: (type: number, payload: Buffer): void => { this.frameAndSend(type, payload); },
      serviceRegistry: this.serviceRegistry
    });

    return this.userServicesApi;
  }

  /**
   * Home Assistant integration sub-API. Exposes the outbound subscribe-and-respond surface for the two HA-bridge feeds:
   *
   *   - `subscribeServices()` - subscribe to inbound `homeassistant.action` / `homeassistant.service` calls from the device. Receives `homeassistantService` events.
   *   - `subscribeStates()` - subscribe to inbound state-import requests. Receives `homeassistantStateRequest` events.
   *   - `sendState(entityId, state, attribute?)` - respond with a Home Assistant entity's current state. Pair with `subscribeStates()`.
   *   - `respondToAction(callId, options)` - acknowledge an inbound action with a `callId` and `wantsResponse: true`. Firmware enabling
   *     `USE_API_HOMEASSISTANT_ACTION_RESPONSES` surfaces these fields on the `homeassistantService` event.
   *
   * The subscriptions are connection-scoped on the wire, and the client re-issues each requested subscription automatically on every successful reconnect while
   * the consumer's intent stands, so a consumer subscribes once rather than after every reconnect.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#home-assistant-services}
   *
   * @returns The {@link HomeAssistantApi} instance bound to this client.
   *
   */
  public get homeAssistant(): HomeAssistantApi {

    return this.homeAssistantApi;
  }

  /**
   * Decode a protobuf message body into a record keyed by field number. Thin wrapper around {@link decodeProtobuf} that injects the client's resource
   * bound and the diagnostic warn hook so call sites stay terse.
   *
   * @param buffer - The encoded message body.
   * @returns The decoded fields by number.
   */
  private decodeProtobuf(buffer: Buffer): Record<number, FieldValue[]> {

    return decodeProtobuf(buffer, { maxFieldsPerMessage: this.maxFieldsPerMessage, warn: (m): void => { this.log.warn(m); } });
  }

  /**
   * Encode a list of fields into a protobuf message. Thin wrapper around {@link encodeProtoFields} preserved as a method so the dozens of call sites
   * stay terse without each one re-importing the function.
   *
   * @param fields - The fields to encode.
   * @returns The encoded message bytes.
   */
  private encodeProtoFields(fields: readonly ProtoField[]): Buffer {

    return encodeProtoFields(fields);
  }

  /**
   * Whether the active transport is operating in noise-data phase. Mirrors `Transport.isEncrypted`.
   *
   * @returns `true` when an encrypted session is established, `false` otherwise (including when disconnected).
   */
  public get isEncrypted(): boolean {

    return this.capabilitiesCache.encryption.active;
  }

  /**
   * Read the structured capability record for the current connection. Built from the negotiated API minor version, the encrypted-transport flag, and the device's
   * {@link DeviceInfo} response. Returns the disconnected placeholder before the first successful connect.
   *
   * @remarks Consumers should gate behavior on named capabilities rather than version numbers or raw bitfields. Adding a new capability is one entry in the type
   * definition plus one parser case; the consumer-visible API stays stable as the underlying flag layout evolves. Returns a deep boundary copy (deepening the
   * {@link deviceInfo} shallow-copy idiom because the capability record nests one level) so a consumer mutating the snapshot cannot corrupt the host's cached record -
   * which {@link isEncrypted} reads internally.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#capabilities}
   *
   * @returns A point-in-time copy of the structured capability record.
   *
   */
  public capabilities(): ClientCapabilities {

    // Deep boundary copy. The record nests one level (api / encryption / voiceAssistant / ... are objects), so a shallow spread would still alias those nested objects;
    // structuredClone (a Node 22 built-in) decouples every level with no shape-specific maintenance, and this is a cold read path.
    return structuredClone(this.capabilitiesCache);
  }

  /**
   * Subscribe a callback to an event. Returns a `Disposable` whose `[Symbol.dispose]` removes the listener; per the explicit-resource-management proposal,
   * `using sub = client.on("telemetry", cb)` automatically removes the listener on scope exit.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#typed-event-bus}
   *
   * @param event - The event name. Narrowed to keys of {@link ClientEventsMap}.
   * @param handler - The callback. The payload parameter type is inferred from the event name.
   * @returns A `Disposable` that removes the listener.
   *
   */
  public on<K extends keyof ClientEventsMap>(event: K, handler: (payload: ClientEventsMap[K]) => void): Disposable {

    return this.bus.on(event, handler);
  }

  /**
   * Resolve on the next emission of `event`. Returns a `Promise`-shaped one-shot; the optional signal argument cancels the await, and rejection propagates through
   * the returned promise.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#typed-event-bus}
   *
   * @param event - The event name. Narrowed to keys of {@link ClientEventsMap}.
   * @param options - Optional cancellation signal.
   * @returns A `Promise` that resolves with the next payload.
   *
   */
  public async once<K extends keyof ClientEventsMap>(event: K, options?: { signal?: AbortSignal }): Promise<ClientEventsMap[K]> {

    return this.bus.once(event, options);
  }

  /**
   * Async-iterable view of every emission of `event` for the lifetime of the iteration. Applies the backpressure policy from {@link StreamOptions}. Each call
   * produces an independent subscription; multiple concurrent iterators of the same event each receive every emission.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#typed-event-bus}
   *
   * @param event - The event name. Narrowed to keys of {@link ClientEventsMap}.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<ClientEventsMap[event]>`.
   *
   */
  public stream<K extends keyof ClientEventsMap>(event: K, options?: StreamOptions): AsyncIterable<ClientEventsMap[K]> {

    return this.bus.stream(event, options);
  }

  /**
   * Internal emit forwarder. Type-narrowed against {@link ClientEventsMap} so a typo in the event name or a payload-shape mismatch is a compile error. Returns whether
   * any listener was invoked, mirroring the platform's emit contract.
   */
  private emit<K extends keyof ClientEventsMap>(event: K, payload: ClientEventsMap[K]): boolean {

    return this.bus.emit(event, payload);
  }

  /**
   * Custom `util.inspect` implementation. `console.log(client)` produces a clean structured summary (host, encryption, entity count, connection state) instead of
   * dumping every internal field, listener, and cipher state. The {@link VoiceAssistantApi} and {@link CameraApi} sub-API classes carry their own inspect
   * implementations so nested logging stays equally tidy.
   *
   * @param depth - Inspector depth, propagated from the parent inspect call.
   * @param options - Stylization options propagated from the parent inspect call.
   * @returns A formatted string suitable for direct console output.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](depth: number, options: { stylize: (text: string, style: string) => string; depth: number | null }): string {

    if(depth < 0) {

      return options.stylize("[EspHomeClient]", "special");
    }

    const summary: Record<string, unknown> = {

      encrypted: this.isEncrypted,
      entities: this.registry.size,
      host: formatHostPort(this.host, this.port),
      state: this.session ? "connected" : "disconnected"
    };

    if(this.remoteDeviceInfo) {

      summary["device"] = this.remoteDeviceInfo.name;
      summary["api"] = "1." + String(this.deviceApiMinorVersion);
    }

    return options.stylize("EspHomeClient", "special") + " " + JSON.stringify(summary);
  }
}

/**
 * Factory function. Creates a new {@link EspHomeClient}, connects, and resolves the connected client. Permanent errors ({@link PermanentError} subclasses) reject
 * immediately; transient errors retry up to {@link EspHomeClientOpenOptions.maxConstructionRetries} times with backoff. Every rejection disposes the client before
 * the error reaches the caller, so a failed construction leaves nothing to clean up. A caller-supplied {@link EspHomeClientOpenOptions.signal} rejects with the
 * signal's own reason and settles promptly whichever phase the abort interrupts - before an attempt, during a connect, or during a backoff. The one exception is an
 * attempt that fails permanently as the abort lands: the permanent error is reported, because it names a misconfiguration the abort reason would hide. An attempt
 * that runs out the library's connect or handshake timeout rejects with the platform `TimeoutError`, which carries no step or host, so a consumer that wraps the open
 * in a try beside its own `AbortSignal.timeout` tells its own timeout apart by identity, `error === mySignal.reason`, never by `name === "TimeoutError"`.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#open-and-dispose}
 *
 * @param options - Client construction options plus open-time retry configuration.
 * @returns A `Promise<EspHomeClient>` that resolves to a connected client.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` default is required; see infrared-rf.types.test.ts.
export async function openEspHomeClient<Extras extends ExtraSchemaSet = {}>(options: EspHomeClientOpenOptions<Extras>): Promise<EspHomeClient<Extras>> {

  const client = new EspHomeClient<Extras>(options);
  const maxRetries = options.maxConstructionRetries ?? 3;

  // Construction retry uses the same exponential-backoff-with-jitter formula as the reconnect supervisor, differing only in its cap: a consumer waiting on a factory
  // call wants failure reported in seconds, where a background supervisor can afford a far longer ceiling. Resolving the parameters into the shape
  // nextBackoffDelay reads keeps the formula in one place.
  const backoff: BackoffParameters = {

    backoffMultiplier: options.constructionRetry?.backoffMultiplier ?? 2,
    initialDelayMs: options.constructionRetry?.initialDelayMs ?? 500,
    jitter: options.constructionRetry?.jitter ?? 0.2,
    maxDelayMs: options.constructionRetry?.maxDelayMs ?? 5000
  };

  // Every attempt is handed the caller's signal, so connect() tears down its own in-progress handshake on abort rather than running to its timeout.
  const connectOptions = options.signal !== undefined ? { signal: options.signal } : undefined;

  /* One chokepoint for what every rejection owes the caller: the client is disposed exactly once, and an aborted caller gets the signal's own reason rather than
   * whatever error the interrupted await happened to produce. A permanent error is the exception and is reported even under an aborted signal...it is the device's
   * own verdict on the configuration, and an abort reason says "try again" where the permanent error says "fix this first". Those duties live in the outer catch,
   * which no exit from the loop can bypass...the loop body is left to decide one thing only, whether another attempt is worth making.
   */
  try {

    // Keep trying until either success, a permanent error, an abort, or the retry budget is spent. With a budget of N the factory makes N+1 connect attempts.
    for(let attempt = 1; ; attempt++) {

      options.signal?.throwIfAborted();

      try {

        // eslint-disable-next-line no-await-in-loop -- Construction-retry loop is intrinsically sequential: try connect, on failure wait the backoff, then maybe retry.
        await client.connect(connectOptions);

        return client;
      } catch(err) {

        // Two conditions end the retry budget early: a permanent error describes a misconfiguration no retry can fix, and a spent budget has nothing left to
        // spend. Every other failure is worth one more attempt once the backoff below has elapsed.
        if((err instanceof PermanentError) || (attempt > maxRetries)) {

          throw err;
        }
      }

      /* The sleep abandons an aborted wait the moment the signal fires, and rejects at once when the signal has already aborted. That one behavior is what makes an
       * abort prompt in every phase...an abort landing during an attempt turns that attempt's failure into a backoff that ends immediately rather than one the
       * caller waits out, so the retry condition above never has to test the signal itself.
       */
      // eslint-disable-next-line no-await-in-loop -- Backoff delay between retry attempts is sequential by design.
      await backoffDelay(nextBackoffDelay(attempt, backoff), options.signal);
    }
  } catch(err) {

    client[Symbol.dispose]();

    throw (options.signal?.aborted && !(err instanceof PermanentError)) ? options.signal.reason : err;
  }
}

