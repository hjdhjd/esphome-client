/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * api-constants.ts: ESPHome protocol enumerations as const-objects with literal-union types.
 */

/**
 * ESPHome wire-level enumerations.
 *
 * @remarks Every protocol enum is modelled as `as const` plus `typeof X[keyof typeof X]` so it survives `erasableSyntaxOnly` and produces a literal-union type
 * without a runtime enum object. The host re-exports each binding to preserve the public-API surface.
 *
 * @module api-constants
 */

/* Every const-object in this file is a wire-protocol enum whose keys are declared in numeric-value order (the protocol's canonical ordering) so a reader scanning
 * the file sees `NONE=0, ERROR=1, WARN=2, INFO=3, ...` in protocol-value sequence instead of alphabetized scramble. The `sort-keys` rule's alphabetical-only
 * default would sacrifice protocol fidelity for stylistic uniformity. The disable block ends at the bottom of the file with the matching `eslint-enable`.
 */
/* eslint-disable sort-keys */

/**
 * Log levels supported by ESPHome for log subscriptions. These control the verbosity of log messages received from the device.
 */
export const LogLevel = {

  NONE:         0,
  ERROR:        1,
  WARN:         2,
  INFO:         3,
  DEBUG:        4,
  VERBOSE:      5,
  VERY_VERBOSE: 6
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Reverse map (number -> name) derived from the same SSOT object. Computed once at module init via Object.entries; adding a new entry to LogLevel automatically extends
// the reverse lookup.
const LOG_LEVEL_NAMES = new Map<number, string>(Object.entries(LogLevel).map(([ name, id ]) => [ id, name ]));

/**
 * Resolve a numeric log level back to its canonical name. Used by diagnostic logging and consumer code that wants to display the level alongside the message. Falls
 * back to a stable `Unknown(<id>)` placeholder when the level is outside the registered set so callers never see `undefined`.
 *
 * @param level - Numeric log level.
 * @returns The canonical name from {@link LogLevel}, or `"Unknown(<id>)"` for unrecognized levels.
 */
export function logLevelName(level: number): string {

  return LOG_LEVEL_NAMES.get(level) ?? ("Unknown(" + String(level) + ")");
}

/**
 * Climate modes supported by ESPHome climate entities. These define the primary operating state of HVAC systems.
 */
export const ClimateMode = {

  OFF:       0,
  HEAT_COOL: 1,
  COOL:      2,
  HEAT:      3,
  FAN_ONLY:  4,
  DRY:       5,
  AUTO:      6
} as const;

export type ClimateMode = typeof ClimateMode[keyof typeof ClimateMode];

/**
 * Climate fan modes supported by ESPHome climate entities. These control how the fan operates within the HVAC system.
 */
export const ClimateFanMode = {

  ON:      0,
  OFF:     1,
  AUTO:    2,
  LOW:     3,
  MEDIUM:  4,
  HIGH:    5,
  MIDDLE:  6,
  FOCUS:   7,
  DIFFUSE: 8,
  QUIET:   9
} as const;

export type ClimateFanMode = typeof ClimateFanMode[keyof typeof ClimateFanMode];

/**
 * Climate swing modes supported by ESPHome climate entities. These control the direction of airflow from the HVAC system.
 */
export const ClimateSwingMode = {

  OFF:        0,
  BOTH:       1,
  VERTICAL:   2,
  HORIZONTAL: 3
} as const;

export type ClimateSwingMode = typeof ClimateSwingMode[keyof typeof ClimateSwingMode];

/**
 * Climate presets supported by ESPHome climate entities. These are predefined configurations for common scenarios.
 */
export const ClimatePreset = {

  NONE:     0,
  HOME:     1,
  AWAY:     2,
  BOOST:    3,
  COMFORT:  4,
  ECO:      5,
  SLEEP:    6,
  ACTIVITY: 7
} as const;

export type ClimatePreset = typeof ClimatePreset[keyof typeof ClimatePreset];

/**
 * Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing. Wire value 1 is intentionally
 * absent: `api.proto` aligns action values with the matching `ClimateMode` values "for readability", and mode value 1 (`HEAT_COOL`) has no activity counterpart, so the
 * sequence jumps from `OFF` (0) to `COOLING` (2). The upstream proto additionally defines `CLIMATE_ACTION_DEFROSTING = 7`, which this table does not yet enumerate; a
 * device reporting that action therefore falls outside the named set surfaced through the climate schema's `action` enum mapping.
 */
export const ClimateAction = {

  OFF:     0,
  COOLING: 2,
  HEATING: 3,
  IDLE:    4,
  DRYING:  5,
  FAN:     6
} as const;

export type ClimateAction = typeof ClimateAction[keyof typeof ClimateAction];

/**
 * Climate capability bits packed into the `feature_flags` field on `ListEntitiesClimateResponse` (ESPHome API 1.14+). Mirrors the upstream firmware enum
 * `ClimateFeatures` in `esphome/components/climate/climate_mode.h`. The schema's `packedBitsFields` declaration uses these bit values to surface each capability as a
 * named boolean on the climate entity (`entity.supportsAction: boolean` etc.), with the deprecated per-capability boolean fields (proto fields 5, 6, 12, 22, 23)
 * acting as fallbacks when `feature_flags` is absent on older firmware.
 *
 * The `REQUIRES_TWO_POINT_TARGET_TEMPERATURE` bit has no pre-1.14 boolean counterpart; it only surfaces on firmware that emits `feature_flags`.
 */
export const ClimateFeature = {

  SUPPORTS_CURRENT_TEMPERATURE:          1,
  SUPPORTS_TWO_POINT_TARGET_TEMPERATURE: 2,
  REQUIRES_TWO_POINT_TARGET_TEMPERATURE: 4,
  SUPPORTS_CURRENT_HUMIDITY:             8,
  SUPPORTS_TARGET_HUMIDITY:              16,
  SUPPORTS_ACTION:                       32
} as const;

export type ClimateFeature = typeof ClimateFeature[keyof typeof ClimateFeature];

/**
 * Climate `feature_flags` packed-bits record. Maps each consumer-facing boolean name to its bit position from {@link ClimateFeature}. The single source of truth for
 * the schema engine: the `climate.listEntities.packedBitsFields.featureFlags.bits` slot references this record by name, so the bit values live in exactly one place
 * (here). A regression test in `entity-schemas.test.ts` asserts schema<->constant reference identity (`assert.strictEqual(schema.bits, CLIMATE_FEATURE_BITS)`) -
 * structural drift between schema and constant becomes impossible by construction because they ARE the same record.
 *
 * @remarks This co-location pattern eliminates the dual-write between schema declaration and named constant that the previous shape `{ bit: ClimateFeature.X }` left
 * open: a schema author writing `bit: 5` (wrong) instead of `bit: ClimateFeature.SUPPORTS_ACTION` (32) would not trip equality assertions where both sides cited the
 * same wrong constant. With the bits embedded directly in the named constant, there is nothing to drift.
 * @internal
 */
export const CLIMATE_FEATURE_BITS = {

  requiresTwoPointTargetTemperature: { bit: ClimateFeature.REQUIRES_TWO_POINT_TARGET_TEMPERATURE },
  supportsAction:                    { bit: ClimateFeature.SUPPORTS_ACTION },
  supportsCurrentHumidity:           { bit: ClimateFeature.SUPPORTS_CURRENT_HUMIDITY },
  supportsCurrentTemperature:        { bit: ClimateFeature.SUPPORTS_CURRENT_TEMPERATURE },
  supportsTargetHumidity:            { bit: ClimateFeature.SUPPORTS_TARGET_HUMIDITY },
  supportsTwoPointTargetTemperature: { bit: ClimateFeature.SUPPORTS_TWO_POINT_TARGET_TEMPERATURE }
} as const;

/**
 * Water heater operating modes per `api.proto` `WaterHeaterMode`. Selects the heating strategy on devices that expose multiple energy sources or efficiency profiles.
 */
export const WaterHeaterMode = {

  OFF:          0,
  ECO:          1,
  ELECTRIC:     2,
  PERFORMANCE:  3,
  HIGH_DEMAND:  4,
  HEAT_PUMP:    5,
  GAS:          6
} as const;

export type WaterHeaterMode = typeof WaterHeaterMode[keyof typeof WaterHeaterMode];

/**
 * Water-heater state-flag bit positions packed into the `state` field on both `WaterHeaterStateResponse` (inbound) and `WaterHeaterCommandRequest` (outbound). The
 * proto's per-field comment ("bit 0 = away, bit 1 = on") is the authoritative source; this constant gives consumers a named alternative to magic-number bit math.
 * The schema's `packedBitsFields` declaration uses these positions to surface each flag as a named boolean (`awayState`, `onState`) on water-heater entities and to
 * accept the same names on water-heater commands.
 * @internal
 */
export const WaterHeaterStateFlags = {

  AWAY: 1,
  ON:   2
} as const;

/**
 * @internal
 */
export type WaterHeaterStateFlags = typeof WaterHeaterStateFlags[keyof typeof WaterHeaterStateFlags];

/**
 * Water-heater command has-bitmask values per `api.proto` `WaterHeaterCommandHasField`. The schema's command-side `bitmaskFieldNumber` (`has_fields`, field 2)
 * carries the OR of these bits; each touched value field contributes its own bit. The deprecated `HAS_STATE = 4` is intentionally omitted - it was superseded in the
 * proto and no encoder path touches it. `HAS_ON_STATE` and `HAS_AWAY_STATE` are wired through the schema's `packedBitsFields.state.bits` declaration on the command
 * role, so encoder behavior derives from this single named-constant SSOT.
 * @internal
 */
export const WaterHeaterCommandHasField = {

  MODE:                     1,
  TARGET_TEMPERATURE:       2,
  TARGET_TEMPERATURE_LOW:   8,
  TARGET_TEMPERATURE_HIGH:  16,
  HAS_ON_STATE:             32,
  HAS_AWAY_STATE:           64
} as const;

/**
 * @internal
 */
export type WaterHeaterCommandHasField = typeof WaterHeaterCommandHasField[keyof typeof WaterHeaterCommandHasField];

/**
 * Water-heater state-side packed-bits record (state response). Maps each consumer-facing boolean to its bit position in the packed `state` uint32 field
 * (field 6 on `WaterHeaterStateResponse`). The schema's `water_heater.state.packedBitsFields.state.bits` slot references this record by name; the regression test
 * asserts reference identity so the bit values live in exactly one place.
 * @internal
 */
export const WATER_HEATER_STATE_INBOUND_BITS = {

  awayState: { bit: WaterHeaterStateFlags.AWAY },
  onState:   { bit: WaterHeaterStateFlags.ON }
} as const;

/**
 * Water-heater command-side packed-bits record (command request). Mirrors {@link WATER_HEATER_STATE_INBOUND_BITS} but adds each bit's `hasFieldBit` - the bit the
 * encoder ORs into the `has_fields` carrier (field 2) when the consumer touches the named boolean. The schema's `water_heater.command.packedBitsFields.state.bits`
 * slot references this record by name; the regression test asserts reference identity.
 * @internal
 */
export const WATER_HEATER_STATE_COMMAND_BITS = {

  awayState: { bit: WaterHeaterStateFlags.AWAY, hasFieldBit: WaterHeaterCommandHasField.HAS_AWAY_STATE },
  onState:   { bit: WaterHeaterStateFlags.ON,   hasFieldBit: WaterHeaterCommandHasField.HAS_ON_STATE }
} as const;

/**
 * Valve operation states that indicate the current activity of a valve. These represent what the valve is actively doing.
 */
export const ValveOperation = {

  IDLE:       0,
  IS_OPENING: 1,
  IS_CLOSING: 2
} as const;

export type ValveOperation = typeof ValveOperation[keyof typeof ValveOperation];

/**
 * Fan direction values reported by ESPHome fan entities and accepted on fan commands. Mirrors `api.proto` `FanDirection`. The command path also accepts the string keys
 * (`"forward"` / `"reverse"`) per the schema's command `enumMappings`; consumers reading telemetry receive the numeric value and should narrow against this constant.
 */
export const FanDirection = {

  FORWARD: 0,
  REVERSE: 1
} as const;

export type FanDirection = typeof FanDirection[keyof typeof FanDirection];

/**
 * Alarm control panel state commands accepted on the `command` field of `AlarmControlPanelCommandRequest` (see the `alarm_control_panel.command` schema). Mirrors
 * `api.proto` `AlarmControlPanelCommand`. The request also carries an optional `code` string alongside this command, required when the entity's discovery-time
 * `requiresCode` or `requiresCodeToArm` flag is set.
 */
export const AlarmControlPanelCommand = {

  DISARM:            0,
  ARM_AWAY:          1,
  ARM_HOME:          2,
  ARM_NIGHT:         3,
  ARM_VACATION:      4,
  ARM_CUSTOM_BYPASS: 5,
  TRIGGER:           6
} as const;

export type AlarmControlPanelCommand = typeof AlarmControlPanelCommand[keyof typeof AlarmControlPanelCommand];

/**
 * Alarm control panel state values reported by ESPHome alarm-control-panel entities on telemetry. Mirrors `api.proto` `AlarmControlPanelState`. Use this constant for
 * narrowing on `AlarmControlPanelEvent.state` instead of raw numeric literals.
 */
export const AlarmControlPanelState = {

  DISARMED:           0,
  ARMED_HOME:         1,
  ARMED_AWAY:         2,
  ARMED_NIGHT:        3,
  ARMED_VACATION:     4,
  ARMED_CUSTOM_BYPASS: 5,
  PENDING:            6,
  ARMING:             7,
  DISARMING:          8,
  TRIGGERED:          9
} as const;

export type AlarmControlPanelState = typeof AlarmControlPanelState[keyof typeof AlarmControlPanelState];

/**
 * Outbound device-request tag used in `BluetoothDeviceRequest` (`api.proto` §id 68). The deprecated `CONNECT=0` value is intentionally absent - this client
 * uses the V3 variants (`CONNECT_V3_WITH_CACHE`, `CONNECT_V3_WITHOUT_CACHE`) unconditionally so what decides cached-vs-uncached is the caller's explicit choice
 * rather than a silent default. Mirrors `api.proto` `BluetoothDeviceRequestType` (§api.proto, `BluetoothDeviceRequest.request_type`).
 * @internal
 */
export const BluetoothDeviceRequestType = {

  DISCONNECT:               1,
  PAIR:                     2,
  UNPAIR:                   3,
  CONNECT_V3_WITH_CACHE:    4,
  CONNECT_V3_WITHOUT_CACHE: 5,
  CLEAR_CACHE:              6
} as const;

/**
 * @internal
 */
export type BluetoothDeviceRequestType = typeof BluetoothDeviceRequestType[keyof typeof BluetoothDeviceRequestType];

/**
 * Bluetooth-proxy scanner state values pushed by the device on `BluetoothScannerStateResponse`. The state machine transitions through IDLE -> STARTING -> RUNNING when
 * scanning is activated, and RUNNING -> STOPPING -> STOPPED when deactivated. FAILED indicates the device's scanner refused to start (typically due to BT
 * controller-level errors). Mirrors `api.proto` `BluetoothScannerState` (§api.proto, `BluetoothScannerStateResponse.state`).
 */
export const BluetoothScannerState = {

  IDLE:     0,
  STARTING: 1,
  RUNNING:  2,
  FAILED:   3,
  STOPPING: 4,
  STOPPED:  5
} as const;

export type BluetoothScannerState = typeof BluetoothScannerState[keyof typeof BluetoothScannerState];

/**
 * Bluetooth-proxy scanner-mode values accepted on `BluetoothScannerSetModeRequest` and reported on `BluetoothScannerStateResponse`. PASSIVE listens for advertisements
 * without sending scan requests; ACTIVE additionally sends scan requests to elicit scan-response data from advertisers. Mirrors `api.proto` `BluetoothScannerMode`
 * (§api.proto, `BluetoothScannerSetModeRequest.mode`).
 */
export const BluetoothScannerMode = {

  PASSIVE: 0,
  ACTIVE:  1
} as const;

export type BluetoothScannerMode = typeof BluetoothScannerMode[keyof typeof BluetoothScannerMode];

/**
 * Color modes supported by ESPHome light entities. These define the color control capabilities of lights. The numeric values are an upstream capability bitfield
 * (`ColorMode` in `api.proto`): each entry ORs together the capability bits its mode requires, which is why the sequence is sparse (0, 1, 3, 7, 11, 19, 35, 39, 47, 51)
 * rather than contiguous. The deprecated `COLOR_MODE_LEGACY_BRIGHTNESS = 2` is intentionally not exported - it was superseded by `BRIGHTNESS` (3).
 */
export const ColorMode = {

  UNKNOWN:               0,
  ON_OFF:                1,
  BRIGHTNESS:            3,
  WHITE:                 7,
  COLOR_TEMPERATURE:     11,
  COLD_WARM_WHITE:       19,
  RGB:                   35,
  RGB_WHITE:             39,
  RGB_COLOR_TEMPERATURE: 47,
  RGB_COLD_WARM_WHITE:   51
} as const;

export type ColorMode = typeof ColorMode[keyof typeof ColorMode];

/**
 * Media player commands accepted on the has-pattern `command` field of `MediaPlayerCommandRequest` (see the `media_player.command` schema). Mirrors `api.proto`
 * `MediaPlayerCommand`. Because `command`, `volume`, `mediaUrl`, and `announcement` are independent has-pattern fields on the same request, a single command call
 * can combine, for example, a volume change with a play command in one round trip.
 */
export const MediaPlayerCommand = {

  PLAY:           0,
  PAUSE:          1,
  STOP:           2,
  MUTE:           3,
  UNMUTE:         4,
  TOGGLE:         5,
  VOLUME_UP:      6,
  VOLUME_DOWN:    7,
  ENQUEUE:        8,
  REPEAT_ONE:     9,
  REPEAT_OFF:     10,
  CLEAR_PLAYLIST: 11,
  TURN_ON:        12,
  TURN_OFF:       13
} as const;

export type MediaPlayerCommand = typeof MediaPlayerCommand[keyof typeof MediaPlayerCommand];

/**
 * Media player state values reported by ESPHome media player entities on telemetry. Mirrors `api.proto` `MediaPlayerState`. Use this constant for narrowing on
 * `MediaPlayerEvent.state` instead of raw numeric literals.
 */
export const MediaPlayerState = {

  NONE:        0,
  IDLE:        1,
  PLAYING:     2,
  PAUSED:      3,
  ANNOUNCING:  4,
  OFF:         5,
  ON:          6
} as const;

export type MediaPlayerState = typeof MediaPlayerState[keyof typeof MediaPlayerState];

/**
 * Media player supported-format purpose values reported on entity discovery. Mirrors `api.proto` `MediaPlayerFormatPurpose`. Use this constant for narrowing on
 * `MediaPlayerEntity.supportedFormats[].purpose` instead of raw numeric literals.
 */
export const MediaPlayerFormatPurpose = {

  DEFAULT:      0,
  ANNOUNCEMENT: 1
} as const;

export type MediaPlayerFormatPurpose = typeof MediaPlayerFormatPurpose[keyof typeof MediaPlayerFormatPurpose];

/**
 * Lock commands accepted on the `command` field of `LockCommandRequest` (see the `lock.command` schema). Mirrors `api.proto` `LockCommand`. `OPEN` is only meaningful
 * when the entity's discovery-time `supportsOpen` flag is set; the request also carries an optional `code` has-pattern field, required when `requiresCode` is set.
 */
export const LockCommand = {

  UNLOCK: 0,
  LOCK:   1,
  OPEN:   2
} as const;

export type LockCommand = typeof LockCommand[keyof typeof LockCommand];

/**
 * Lock state values reported by ESPHome lock entities on telemetry. Mirrors `api.proto` `LockState`. Use this constant for narrowing on `LockEvent.state` instead of raw
 * numeric literals so call sites stay readable and survive future ESPHome wire-enum additions.
 */
export const LockState = {

  NONE:      0,
  LOCKED:    1,
  UNLOCKED:  2,
  JAMMED:    3,
  LOCKING:   4,
  UNLOCKING: 5,
  OPENING:   6,
  OPEN:      7
} as const;

export type LockState = typeof LockState[keyof typeof LockState];

/**
 * Cover operation states indicating what a cover is currently doing.
 */
export const CoverOperation = {

  IDLE:       0,
  IS_OPENING: 1,
  IS_CLOSING: 2
} as const;

export type CoverOperation = typeof CoverOperation[keyof typeof CoverOperation];

/**
 * Voice assistant subscription flags that control what data is received.
 */
export const VoiceAssistantSubscribeFlag = {

  NONE:      0,
  API_AUDIO: 1
} as const;

export type VoiceAssistantSubscribeFlag = typeof VoiceAssistantSubscribeFlag[keyof typeof VoiceAssistantSubscribeFlag];

/**
 * Temperature units reported by climate and water-heater entities on `ListEntities*Response`. Mirrors `api.proto` `TemperatureUnit`. Carried by ESPHome firmware
 * that advertises API minor 14 or higher with the temperature-unit extension; firmware that does not omits the field, and consumers should treat the unit as
 * celsius by default in that case. Capability gate: `client.capabilities().climateTemperatureUnit`.
 */
export const TemperatureUnit = {

  CELSIUS:    0,
  FAHRENHEIT: 1,
  KELVIN:     2
} as const;

export type TemperatureUnit = typeof TemperatureUnit[keyof typeof TemperatureUnit];

/**
 * Entity-category classification reported on every `ListEntities*Response` payload (`entity_category` field). Mirrors `api.proto` `EntityCategory`. Use for filtering
 * UI display lists ("show config entities separately from diagnostics") and for narrowing on `entity.entityCategory` rather than comparing against magic numbers.
 */
export const EntityCategory = {

  NONE:       0,
  CONFIG:     1,
  DIAGNOSTIC: 2
} as const;

export type EntityCategory = typeof EntityCategory[keyof typeof EntityCategory];

/**
 * State-class classification for sensor entities, surfaced on `ListEntitiesSensorResponse` (`state_class` field). Mirrors `api.proto` `SensorStateClass`. The class
 * tells the consumer how to interpret a numeric sensor reading over time (instantaneous measurement vs. monotonically increasing total vs. resetting total vs. angular
 * measurement).
 */
export const SensorStateClass = {

  NONE:               0,
  MEASUREMENT:        1,
  TOTAL_INCREASING:   2,
  TOTAL:              3,
  MEASUREMENT_ANGLE:  4
} as const;

export type SensorStateClass = typeof SensorStateClass[keyof typeof SensorStateClass];

/**
 * Number-entity input mode, surfaced on `ListEntitiesNumberResponse` (`mode` field). Mirrors `api.proto` `NumberMode`. The mode tells the consumer how to render
 * the number input - free-form auto, exact numeric box, or bounded slider.
 */
export const NumberMode = {

  AUTO:    0,
  BOX:     1,
  SLIDER:  2
} as const;

export type NumberMode = typeof NumberMode[keyof typeof NumberMode];

/**
 * Text-entity input mode, surfaced on `ListEntitiesTextResponse` (`mode` field). Mirrors `api.proto` `TextMode`. The mode tells the consumer whether to render
 * the input as plaintext or as a password (masked) field.
 */
export const TextMode = {

  TEXT:     0,
  PASSWORD: 1
} as const;

export type TextMode = typeof TextMode[keyof typeof TextMode];

/**
 * Voice assistant request flags carried as a bitmask on `VoiceAssistantRequest.flags`, the server-to-client message that starts an assistant run. Mirrors `api.proto`
 * `VoiceAssistantRequestFlag`. `USE_VAD` tells the client to apply voice-activity detection to end the utterance automatically; `USE_WAKE_WORD` tells the client the
 * run was triggered by a wake word rather than a manual start.
 */
export const VoiceAssistantRequestFlag = {

  NONE:          0,
  USE_VAD:       1,
  USE_WAKE_WORD: 2
} as const;

export type VoiceAssistantRequestFlag = typeof VoiceAssistantRequestFlag[keyof typeof VoiceAssistantRequestFlag];

/**
 * Voice assistant pipeline-progress events reported by the client on `VoiceAssistantEventResponse.event_type` as an assistant run advances. Mirrors `api.proto`
 * `VoiceAssistantEvent`. The values fall into paired start/end brackets for each pipeline stage (STT, intent, TTS, wake word, VAD) plus a standalone `ERROR` and the
 * higher-numbered `TTS_STREAM_START` / `TTS_STREAM_END` / `INTENT_PROGRESS` additions used for streamed responses.
 */
export const VoiceAssistantEvent = {

  ERROR:            0,
  RUN_START:        1,
  RUN_END:          2,
  STT_START:        3,
  STT_END:          4,
  INTENT_START:     5,
  INTENT_END:       6,
  TTS_START:        7,
  TTS_END:          8,
  WAKE_WORD_START:  9,
  WAKE_WORD_END:    10,
  STT_VAD_START:    11,
  STT_VAD_END:      12,
  TTS_STREAM_START: 98,
  TTS_STREAM_END:   99,
  INTENT_PROGRESS:  100
} as const;

export type VoiceAssistantEvent = typeof VoiceAssistantEvent[keyof typeof VoiceAssistantEvent];

/**
 * Voice assistant timer lifecycle events reported by the client on `VoiceAssistantTimerEventResponse.event_type`, alongside the affected `timer_id`. Mirrors
 * `api.proto` `VoiceAssistantTimerEvent`. Consumers use this to track assistant-set timers (e.g. "set a timer for five minutes") from creation through completion or
 * cancellation.
 */
export const VoiceAssistantTimerEvent = {

  STARTED:   0,
  UPDATED:   1,
  CANCELLED: 2,
  FINISHED:  3
} as const;

export type VoiceAssistantTimerEvent = typeof VoiceAssistantTimerEvent[keyof typeof VoiceAssistantTimerEvent];

/**
 * Infrared entity capability bitmask flags. The wire-side `ListEntitiesInfraredResponse.capabilities` field is a bitwise OR of these values. Consumers bit-test against
 * this constant to gate UI affordances (transmitter-only entities have no receiver pipeline; receiver-only entities cannot accept transmit commands).
 *
 * The flag values mirror ESPHome's `esphome/components/infrared/infrared.h::InfraredCapabilityFlags`. Bit 0 marks transmitter capability, bit 1 marks receiver
 * capability. Unlike {@link RadioFrequencyCapabilityFlags}, whose bit positions `api.proto` documents inline, the Infrared bit positions here are inferred by parity
 * with the RF flags and from the upstream `infrared.h` header, and assumed to remain stable across firmware revisions.
 */
export const InfraredCapabilityFlags = {

  TRANSMITTER: 1 << 0,
  RECEIVER:    1 << 1
} as const;

export type InfraredCapabilityFlags = typeof InfraredCapabilityFlags[keyof typeof InfraredCapabilityFlags];

/**
 * Radio-frequency entity capability bitmask flags. The wire-side `ListEntitiesRadioFrequencyResponse.capabilities` field is a bitwise OR of these values. The two bits
 * map identically to {@link InfraredCapabilityFlags}: bit 0 = transmitter, bit 1 = receiver, per the comment at `api.proto`
 * §ListEntitiesRadioFrequencyResponse.capabilities.
 *
 * Mirrors ESPHome's `esphome/components/radio_frequency/radio_frequency.h::RadioFrequencyCapabilityFlags`.
 */
export const RadioFrequencyCapabilityFlags = {

  TRANSMITTER: 1 << 0,
  RECEIVER:    1 << 1
} as const;

export type RadioFrequencyCapabilityFlags = typeof RadioFrequencyCapabilityFlags[keyof typeof RadioFrequencyCapabilityFlags];

/**
 * Radio-frequency modulation values accepted on transmit requests and reported (as a bitmask) in `ListEntitiesRadioFrequencyResponse.supported_modulations`. The
 * `supported_modulations` bitmask uses bit N to indicate that modulation value N is supported by the entity. Mirrors ESPHome's
 * `esphome/components/radio_frequency/radio_frequency.h::RadioFrequencyModulation` enum.
 *
 * Only OOK (on-off keying, value 0) is canonically defined in `api.proto`; other ESPHome firmware headers (FSK, GFSK, ASK, ...) may exist but are not yet exported here
 * because the upstream `api.proto` does not enumerate them. Additional values should be added once they can be verified against an authoritative ESPHome source; the
 * decoder passes through any modulation number unchanged so forward-compatibility is preserved at runtime.
 */
export const RadioFrequencyModulation = {

  OOK: 0
} as const;

export type RadioFrequencyModulation = typeof RadioFrequencyModulation[keyof typeof RadioFrequencyModulation];

/**
 * Serial-proxy parity values accepted on `SerialProxyConfigureRequest`. Mirrors `api.proto` `SerialProxyParity` (§api.proto, `SerialProxyConfigureRequest.parity`). The
 * three values are the only ones the upstream firmware accepts; ESPHome's serial-proxy component rejects any other value.
 */
export const SerialProxyParity = {

  NONE: 0,
  EVEN: 1,
  ODD:  2
} as const;

export type SerialProxyParity = typeof SerialProxyParity[keyof typeof SerialProxyParity];

/**
 * Serial-proxy port-type tag carried on each `SerialProxyInfo` entry advertised by the device in `DeviceInfoResponse.serial_proxies`. Mirrors `api.proto`
 * `SerialProxyPortType` (§api.proto, `SerialProxyInfo.port_type`). The numeric value distinguishes the wiring topology so consumers can adapt timing or DTR/RTS use; the
 * client is otherwise indifferent to the value.
 */
export const SerialProxyPortType = {

  TTL:   0,
  RS232: 1,
  RS485: 2
} as const;

export type SerialProxyPortType = typeof SerialProxyPortType[keyof typeof SerialProxyPortType];

/**
 * Serial-proxy request-type tag carried on `SerialProxyRequest` (subscribe / unsubscribe the inbound data stream, or flush the device-side TX buffer). Mirrors
 * `api.proto` `SerialProxyRequestType` (§api.proto, `SerialProxyRequest.type`). FLUSH is the only request type that produces a matching `SerialProxyRequestResponse`;
 * SUBSCRIBE and UNSUBSCRIBE are fire-and-forget at the wire level.
 * @internal
 */
export const SerialProxyRequestType = {

  SUBSCRIBE:   0,
  UNSUBSCRIBE: 1,
  FLUSH:       2
} as const;

/**
 * @internal
 */
export type SerialProxyRequestType = typeof SerialProxyRequestType[keyof typeof SerialProxyRequestType];

/**
 * Serial-proxy status code carried on `SerialProxyRequestResponse.status`. Mirrors `api.proto` `SerialProxyStatus` (§api.proto, `SerialProxyRequestResponse.status`). OK
 * and ASSUMED_SUCCESS both indicate the requested operation completed (ASSUMED_SUCCESS is used when the device cannot verify completion but has no reason to suspect
 * failure); ERROR, TIMEOUT, and NOT_SUPPORTED are the failure variants.
 */
export const SerialProxyStatus = {

  OK:              0,
  ASSUMED_SUCCESS: 1,
  ERROR:           2,
  TIMEOUT:         3,
  NOT_SUPPORTED:   4
} as const;

export type SerialProxyStatus = typeof SerialProxyStatus[keyof typeof SerialProxyStatus];

/**
 * Modem-control line bitmask flags used by `SerialProxySetModemPinsRequest` and `SerialProxyGetModemPinsResponse`. RTS is bit 0, DTR is bit 1 - the standard UART
 * modem-control set. Mirrors ESPHome's `SerialProxyLineStateFlags` enum (upstream header location not yet pinned down; the bit positions follow the standard UART
 * convention used by every comparable driver). Consumers compose flags via bitwise OR (e.g., `SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR`) and read
 * the response value as a bitmask.
 */
export const SerialProxyLineStateFlags = {

  RTS: 1 << 0,
  DTR: 1 << 1
} as const;

export type SerialProxyLineStateFlags = typeof SerialProxyLineStateFlags[keyof typeof SerialProxyLineStateFlags];

/**
 * Update commands accepted by ESPHome update entities. Mirrors `api.proto` `UpdateCommand`. The schema's command `enumMappings` also accepts the string keys (`"none"` /
 * `"update"` / `"check"`); this constant gives consumers a named alternative that survives wire-enum additions.
 */
export const UpdateCommand = {

  NONE:   0,
  UPDATE: 1,
  CHECK:  2
} as const;

export type UpdateCommand = typeof UpdateCommand[keyof typeof UpdateCommand];

/**
 * Tag for Z-Wave-proxy request messages (`api.proto` §`ZWaveProxyRequestType`, used by `ZWaveProxyRequest`). Z-Wave proxy is a deliberately thin byte pipe to
 * the device's Z-Wave radio Serial API; this library does not parse Z-Wave Serial API frames, command classes, or security envelopes. Consumers route the inbound
 * frame stream into a Z-Wave-aware library (e.g., `zwave-js`) and write back via {@link ZWaveProxyApi.send}.
 *
 * The tag is used in both directions on the wire:
 *
 * - **Client-to-device** - `SUBSCRIBE` opens the bidirectional frame channel; `UNSUBSCRIBE` closes it. The accompanying `data` field is empty.
 * - **Device-to-client** - `HOME_ID_CHANGE` notifies that the device's Z-Wave home id has changed. The new home id is carried in the request's `data` field, encoded as
 *   a 4-byte big-endian uint32 per the ESPHome firmware's `zwave_proxy` component. The proto does not document the encoding inline; the 4-byte big-endian assumption
 *   mirrors the only encoding the upstream component emits.
 * @internal
 */
export const ZWaveProxyRequestType = {

  SUBSCRIBE:      0,
  UNSUBSCRIBE:    1,
  HOME_ID_CHANGE: 2
} as const;

/**
 * @internal
 */
export type ZWaveProxyRequestType = typeof ZWaveProxyRequestType[keyof typeof ZWaveProxyRequestType];

/* eslint-enable sort-keys */
