/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: Public API surface for the ESPHome client library.
 */

/**
 * Public API barrel for the ESPHome client. Every consumer-facing symbol is re-exported here; per-symbol JSDoc lives at the symbol's defining module so each contract
 * has a single canonical home.
 *
 * @remarks Consumers should import from the package root (`import { openEspHomeClient, entityId, ConfigurationError } from "esphome-client"`); deep imports into the
 * compiled `dist/` paths are not part of the public contract. Test helpers ship under the conditional export `esphome-client/testing`; they are intentionally not
 * re-exported here so production bundles don't pull in the mock-transport surface.
 *
 * The surface covers the client and its connection lifecycle, the entity model with its schemas and named wire-enum constants, the sub-API types, the typed error
 * hierarchy, the option and callback types the client's signatures name, and protocol-level primitives such as the wire types and the Noise handshake. The export list
 * names each public symbol from the module that declares it and is the authority on what the package exposes.
 *
 * @module esphome-client
 */

// This list is the package's public surface: each name is exported from the module that declares it, and an export not named here stays internal. The sub-API
// classes are type-only exports, so consumers hold the instances the client hands out without constructing their own.
export {
  AlarmControlPanelCommand, AlarmControlPanelState, BluetoothScannerMode, BluetoothScannerState, ClimateAction, ClimateFanMode, ClimateFeature, ClimateMode,
  ClimatePreset, ClimateSwingMode, ColorMode, CoverOperation, EntityCategory, FanDirection, InfraredCapabilityFlags, LockCommand, LockState, LogLevel, MediaPlayerCommand,
  MediaPlayerFormatPurpose, MediaPlayerState, NumberMode, RadioFrequencyCapabilityFlags, RadioFrequencyModulation, SensorStateClass, SerialProxyLineStateFlags,
  SerialProxyParity, SerialProxyPortType, SerialProxyRequestType, SerialProxyStatus, TemperatureUnit, TextMode, UpdateCommand, ValveOperation, VoiceAssistantEvent,
  VoiceAssistantRequestFlag, VoiceAssistantSubscribeFlag, VoiceAssistantTimerEvent, WaterHeaterMode, logLevelName
} from "./api-constants.ts";
export type {
  BluetoothGATTCharacteristic, BluetoothGATTDescriptor, BluetoothGATTService, BluetoothLERawAdvertisement, BluetoothProxyApi, BluetoothScannerStateData, ConnectionParams,
  ConnectionStateData, ConnectionsFreeData, NotifyDataChunk
} from "./bluetooth-proxy.ts";
export type { CameraApi } from "./camera.ts";
export { disconnectedCapabilities } from "./capabilities.ts";
export type { ClientCapabilities } from "./capabilities.ts";
export type { CommandAndAwaitOptions, CommandAndAwaitable, NonAwaitableEntityType, TransmitEntityType } from "./command-runner.ts";
export {
  CipherState, ESPHOME_NOISE_PROLOGUE, HandshakeState, NOISE_DH_LEN, NOISE_MAX_MESSAGE_LEN, NOISE_PSK_LEN, createESPHomeHandshake, createHandshake
} from "./crypto-noise.ts";
export type { ESPHomeHandshakeOptions, NoiseHandshakeOptions, NoiseRole } from "./crypto-noise.ts";
export { entityId, isEntityId, parseEntityId } from "./entity-id.ts";
export type { EntityId } from "./entity-id.ts";
export {
  AuthenticationError, BackpressureError, BufferOverflowError, ConfigurationError, ConnectionClosedByPeerError, ConnectionError, ConnectionLostError,
  ConnectionRefusedError, ConnectionTimeoutError, DecodingError, DecryptionFailedError, EncodingError, EncryptionKeyInvalidError, EncryptionKeyMissingError,
  EncryptionRequiredError, EspHomeError, FrameTooLargeError, HandshakeError, HeartbeatStalledError, IncompatibleApiVersionError, MalformedVarintError,
  MessageTooManyFieldsError, NegotiationFailedError, NoiseHandshakeError, NotConnectedError, PeerClosedDuringNoiseError, PermanentError, PlaintextHandshakeError,
  ProtocolError, TruncatedMessageError, UnknownEntityTypeError, UnknownMessageTypeError, UnsupportedCapabilityError
} from "./errors.ts";
export type { ConfigurationErrorCode, NoiseHandshakeErrorCode } from "./errors.ts";
export { EspHomeClient, openEspHomeClient } from "./esphome-client.ts";
export type {
  ClientEventsMap, ConstructionRetryConfig, DeviceInfo, EspHomeClientOpenOptions, EspHomeClientOptions, ExecuteServiceArgumentValue, LogEventData, MessageEventData,
  ServiceCallResult, VoiceAssistantAudioData, VoiceAssistantAudioSettings, VoiceAssistantConfiguration, VoiceAssistantEventData, VoiceAssistantRequest,
  VoiceAssistantTimerEventData, VoiceAssistantWakeWord
} from "./esphome-client.ts";
export type { StreamBackpressureMode, StreamOptions } from "./event-bus.ts";
export { HealthState, connectionUptimeMs, disconnectedHealth, isConnectionLive } from "./health.ts";
export type { ConnectionHealth, DownConnectionHealth, LiveConnectionHealth } from "./health.ts";
export type { ClockFn } from "./heartbeat.ts";
export type { HomeAssistantApi, HomeAssistantServiceEvent, HomeAssistantStateRequest } from "./home-assistant.ts";
export type { LifecycleEvent } from "./lifecycle.ts";
export { WireType } from "./protocol/wire-types.ts";
export { withReconnect } from "./reconnect.ts";
export type { ReconnectConfig, WithReconnectClient, WithReconnectOptions } from "./reconnect.ts";
export type { CommandFor, Entity, EntityFor, EntityOf, StateEventFor, TelemetryEvent, TelemetryEventOf } from "./schemas/derived.ts";
export { ENTITY_SCHEMAS } from "./schemas/entity-schemas.ts";
export type {
  BitmaskField, CommandPackedBitSpec, CommandPackedBitsField, CommandSchema, EntitySchema, EnumMapping, FieldSpec, HasPatternField, InboundPackedBitSpec,
  InboundPackedBitsField, ListEntitiesSchema, RepeatedFieldSpec, RepeatedMessageFieldSpec, StateSchema, ValueType
} from "./schemas/entity-schemas.ts";
export type {
  AlarmControlPanelEntity, AlarmControlPanelEvent, BaseEntity, BinarySensorEntity, BinarySensorEvent, ButtonEntity, ButtonEvent, CameraEntity, CameraEvent, ClimateEntity,
  ClimateEvent, CoverEntity, CoverEvent, DateEntity, DateEvent, DateTimeEntity, DateTimeEvent, EntityType, EventEntity, EventEntityEvent, FanEntity, FanEvent,
  InfraredEntity, InfraredEvent, LightEntity, LightEvent, LockEntity, LockEvent, MediaPlayerEntity, MediaPlayerEvent, NumberEntity, NumberEvent, RadioFrequencyEntity,
  RadioFrequencyEvent, SelectEntity, SelectEvent, SensorEntity, SensorEvent, SirenEntity, SirenEvent, SwitchEntity, SwitchEvent, TelemetryEventType, TextEntity,
  TextEvent, TextSensorEntity, TextSensorEvent, TimeEntity, TimeEvent, UpdateEntity, UpdateEvent, ValveEntity, ValveEvent, WaterHeaterEntity, WaterHeaterEvent
} from "./schemas/entity-types.ts";
export { aliasOf, extending } from "./schemas/extensions.ts";
export type { ExtendedEntityType, ExtraSchemaSet, SchemaExtensions, SchemaForExtended } from "./schemas/extensions.ts";
export type { SerialDataChunk, SerialProxyApi, SerialProxyAwaitOptions, SerialProxyConfigureOptions, SerialProxyFlushResult, SerialProxyInfo } from "./serial-proxy.ts";
export type { SubDevice } from "./sub-device.ts";
export type { InboundMessage, NoiseCipherPair, TransportLike, TransportOpenOptions } from "./transport.ts";
export { ServiceArgType } from "./types.ts";
export type { ClientMetrics, EspHomeLogging, NoiseServerHello, Nullable, PskResolver, ServiceArgument, ServiceEntity } from "./types.ts";
export type { UserServicesApi } from "./user-services.ts";
export type { VoiceAssistantAnnounceOptions, VoiceAssistantApi } from "./voice-assistant.ts";
export type { ZWaveProxyApi } from "./zwave-proxy.ts";
