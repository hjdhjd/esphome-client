/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capabilities.ts: Structured capability detection from DeviceInfo + negotiated API minor version.
 */

/**
 * Capability detection.
 *
 * @remarks Translates the device's `DeviceInfoResponse` plus the negotiated API minor version into a structured {@link ClientCapabilities} record. Consumers gate on
 * named capabilities rather than version numbers or raw bitfields...adding a new capability is one entry in the type plus one parser case, with no spread of
 * `(featureFlags & 0x10) !== 0` checks across the codebase.
 *
 * The parser is pure and deterministic: same input always yields the same record. The host class caches the result for the lifetime of the connection and rebuilds it
 * on the next connect.
 *
 * @module capabilities
 */
import { API_FEATURE_VERSIONS, deviceSupports } from "./api-feature-versions.ts";
import type { DeviceInfo } from "./esphome-client.ts";
import type { Nullable } from "./types.ts";

/**
 * Voice-assistant feature flag bits, as published by the ESPHome firmware in `DeviceInfoResponse.voice_assistant_feature_flags` (field 17).
 *
 * @remarks Bit values match the upstream ESPHome `VoiceAssistantFeatureFlag` definitions. Adding a new flag bit is one entry here plus one mapped property on
 * {@link ClientCapabilities.voiceAssistant}.
 */
const VOICE_ASSISTANT_FLAG = {

  ANNOUNCE:           1 << 4,
  API_AUDIO:          1 << 2,
  SPEAKER:            1 << 1,
  START_CONVERSATION: 1 << 5,
  TIMERS:             1 << 3,
  VOICE_ASSISTANT:    1 << 0
} as const;

/**
 * Bluetooth-proxy feature flag bits, as published by the ESPHome firmware in `DeviceInfoResponse.bluetooth_proxy_feature_flags` (field 15).
 *
 * @remarks Bit values match the upstream ESPHome `BluetoothProxyFeature` definitions.
 */
const BLUETOOTH_PROXY_FLAG = {

  ACTIVE_CONNECTIONS:  1 << 1,
  CACHE_CLEARING:      1 << 4,
  PAIRING:             1 << 3,
  PASSIVE_SCAN:        1 << 0,
  RAW_ADVERTISEMENTS:  1 << 5,
  REMOTE_CACHING:      1 << 2,
  STATE_AND_MODE:      1 << 6
} as const;

/**
 * Structured capability record. Consumers gate on named capabilities rather than version numbers or raw bitfields. Version-gated capabilities derive from the
 * `API_FEATURE_VERSIONS` table; subsystem-flag capabilities derive from `DeviceInfo` feature-flag bits.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#capability-feature-gating}
 */
export interface ClientCapabilities {

  /**
   * Negotiated protocol version. `minor` comes from the negotiated `HelloResponse.api_version_minor` value. `major` is currently always 1, a synthesized
   * constant reflecting the connect-time major-version gate performed earlier in the handshake rather than a value read from the wire at this call site.
   */
  api: { major: number; minor: number };

  /**
   * Bluetooth proxy support details. `supported` is true when the device declares any non-zero bluetooth-proxy feature flag.
   *
   * @remarks `legacyAdvertisements` is true when the device advertises the module-private `BLUETOOTH_PROXY_FLAG.PASSIVE_SCAN` bit, which is upstream ESPHome's bit for
   * the legacy standardized-advertisement reporting mode. Newer firmware also exposes `BLUETOOTH_PROXY_FLAG.RAW_ADVERTISEMENTS`, surfaced separately as
   * `rawAdvertisements`.
   */
  bluetoothProxy: {

    activeConnections: boolean;
    legacyAdvertisements: boolean;
    rawAdvertisements: boolean;
    supported: boolean;
  };

  /**
   * The server omits `object_id` from `ListEntities*Response` for clients that advertise this version or higher, since the value is always derivable from `name`
   * via the upstream `sanitize(snake_case(name))` algorithm. The discovery decoder mirrors that algorithm in `deriveObjectId` and resolves the
   * field via wire-first-with-fallback: when the server sends the wire value (older firmware) we use it; when the server omits it (this version or higher) we
   * derive. Both paths produce byte-identical canonical ids, so this flag is purely informational - consumers can read it to know which protocol generation the
   * device speaks, but the resulting `objectId` on every entity record is the same value either way.
   */
  clientDerivedObjectId: boolean;

  /**
   * `ListEntitiesClimateResponse` and `ListEntitiesWaterHeaterResponse` carry a `temperature_unit` enum field (celsius/fahrenheit/kelvin) declaring the unit the device
   * reports temperatures in. When false, the field is absent on the wire and consumers should treat the unit as celsius by default (ESPHome's pre-1.14 convention).
   */
  climateTemperatureUnit: boolean;

  /**
   * Encryption status. `supported` reflects what the device advertises (`api_encryption_supported`); `active` reflects whether this session is actually encrypted
   * (the noise handshake completed).
   */
  encryption: { active: boolean; supported: boolean };

  /**
   * `LockState` enum extended with `LOCK_STATE_OPENING` (6) and `LOCK_STATE_OPEN` (7). Devices on older firmware never emit these values; consumers narrowing on the
   * extended union can short-circuit pre-1.14 devices via this flag.
   */
  lockOpenStates: boolean;

  /**
   * Modern handshake path availability. When true, the client can skip `CONNECT_REQUEST` for unauthenticated sessions because the device's API minor supports the
   * unified Hello/Connect exchange.
   */
  modernHandshake: boolean;

  /**
   * Noise pre-shared-key rotation availability. When true, `client.setNoiseEncryptionKey(...)` reaches a device that understands `NOISE_ENCRYPTION_SET_KEY_REQUEST`.
   */
  noiseKeyRotation: boolean;

  /**
   * Serial-proxy support details. `supported` is true when the device advertises at least one serial-proxy instance on `DeviceInfoResponse.serial_proxies` (field 25);
   * `count` is the number of advertised instances. `client.deviceInfo()?.serialProxies` carries only the advertised per-instance metadata (`SerialProxyInfo`'s
   * `name` and `portType`); baud rate, data bits, and parity are write-side settings passed to `SerialProxyApi.configure()`, not values readable from device info -
   * the structured-capability record stays focused on the per-subsystem availability question.
   */
  serialProxy: {

    count: number;
    supported: boolean;
  };

  /**
   * Voice-assistant support details. `supported` is true when the device declares any non-zero voice-assistant feature flag, or - on older firmware -
   * `legacyVoiceAssistantVersion > 0`. Each per-feature boolean reflects one bit of `voice_assistant_feature_flags`; see the module-private `VOICE_ASSISTANT_FLAG`
   * table for the bit assignments. `stereoAudio` is the one exception: it derives from the negotiated API version (see
   * `API_FEATURE_VERSIONS.voiceAssistantStereo`) rather than a feature-flag bit, because the wire shape change is a protocol-version
   * concern rather than a per-device feature toggle.
   */
  voiceAssistant: {

    announcements: boolean;
    apiAudio: boolean;
    speaker: boolean;
    startConversation: boolean;
    stereoAudio: boolean;
    supported: boolean;
    timerEvents: boolean;
  };

  /**
   * Z-Wave-proxy support details. `supported` is true when the device advertises a nonzero `zwave_proxy_feature_flags` bitmask (field 23); `featureFlags` exposes that
   * bitmask verbatim for forward compatibility with future ESPHome feature bits. `homeId` mirrors `DeviceInfoResponse.zwave_home_id` (field 24), normalised so a value of
   * `0` (no Z-Wave network joined) surfaces as `null`; absent device-info field 24 also surfaces as `null`. The runtime-authoritative home id - updated by inbound
   * `HOME_ID_CHANGE` request pushes - is read via {@link ZWaveProxyApi.homeId}; this record carries the snapshot observed at the most recent connect.
   */
  zwaveProxy: {

    featureFlags: number;
    homeId: number | null;
    supported: boolean;
  };
}

/**
 * Inputs to the capability parser.
 *
 * @internal
 */
export interface ParseCapabilitiesInput {

  /**
   * Negotiated API minor version from `HelloResponse`. Defaults to 0 before negotiation completes.
   */
  apiMinor: number;

  /**
   * Whether the current session's transport is encrypted (the noise handshake completed). Distinct from the device's `apiEncryptionSupported` advertisement.
   */
  encrypted: boolean;

  /**
   * Most recent `DeviceInfo` from the device. May be `null` before discovery completes; the parser returns the "disconnected" record in that case.
   */
  deviceInfo: Nullable<DeviceInfo>;
}

/**
 * Returns the "disconnected" capability record. Used as the initial value in {@link EspHomeClient.capabilities} before the first successful
 * connect, and as the result during a connect-failure window where `deviceInfo` is null.
 *
 * @returns A capability record where every flag is false and `api` is `{ major: 0, minor: 0 }`.
 */
export function disconnectedCapabilities(): ClientCapabilities {

  return {

    api: { major: 0, minor: 0 },
    bluetoothProxy: { activeConnections: false, legacyAdvertisements: false, rawAdvertisements: false, supported: false },
    clientDerivedObjectId: false,
    climateTemperatureUnit: false,
    encryption: { active: false, supported: false },
    lockOpenStates: false,
    modernHandshake: false,
    noiseKeyRotation: false,
    serialProxy: { count: 0, supported: false },
    voiceAssistant: { announcements: false, apiAudio: false, speaker: false, startConversation: false, stereoAudio: false, supported: false, timerEvents: false },
    zwaveProxy: { featureFlags: 0, homeId: null, supported: false }
  };
}

/**
 * Parse a {@link ClientCapabilities} record from the negotiated API version, encrypted flag, and the device-info response.
 *
 * @param input - Parser inputs.
 * @returns A populated capability record. Returns the {@link disconnectedCapabilities} shape when `deviceInfo` is null.
 * @internal
 */
export function parseCapabilities(input: ParseCapabilitiesInput): ClientCapabilities {

  const { apiMinor, deviceInfo, encrypted } = input;

  if(!deviceInfo) {

    const base = disconnectedCapabilities();

    base.encryption.active = encrypted;

    return base;
  }

  const vaFlags = deviceInfo.voiceAssistantFeatureFlags ?? 0;
  const btFlags = deviceInfo.bluetoothProxyFeatureFlags ?? 0;
  const zwFlags = deviceInfo.zwaveProxyFeatureFlags ?? 0;
  const legacyVa = deviceInfo.legacyVoiceAssistantVersion ?? 0;
  const legacyBt = deviceInfo.legacyBluetoothProxyVersion ?? 0;
  const serialCount = deviceInfo.serialProxies?.length ?? 0;
  const rawHomeId = deviceInfo.zwaveHomeId ?? 0;

  // Synthesize the device's API version for table comparisons. Major is hardcoded to 1 because the handshake validates the device's major against `SUPPORTED_API_MAJORS`
  // before this parser is called - any unsupported major has already failed the connect. When a hypothetical ESPHome v2 ships, we widen the parser input to thread the
  // major through and this synthesis goes away.
  const apiVersion = { major: 1, minor: apiMinor };

  return {

    api: apiVersion,
    bluetoothProxy: {

      activeConnections: (btFlags & BLUETOOTH_PROXY_FLAG.ACTIVE_CONNECTIONS) !== 0,
      legacyAdvertisements: (btFlags & BLUETOOTH_PROXY_FLAG.PASSIVE_SCAN) !== 0,
      rawAdvertisements: (btFlags & BLUETOOTH_PROXY_FLAG.RAW_ADVERTISEMENTS) !== 0,
      supported: (btFlags !== 0) || (legacyBt > 0)
    },
    clientDerivedObjectId: deviceSupports(apiVersion, API_FEATURE_VERSIONS.clientDerivedObjectId),
    climateTemperatureUnit: deviceSupports(apiVersion, API_FEATURE_VERSIONS.climateTemperatureUnit),
    encryption: {

      active: encrypted,
      supported: deviceInfo.apiEncryptionSupported ?? false
    },
    lockOpenStates: deviceSupports(apiVersion, API_FEATURE_VERSIONS.lockOpenStates),
    modernHandshake: deviceSupports(apiVersion, API_FEATURE_VERSIONS.modernHandshake),
    noiseKeyRotation: deviceSupports(apiVersion, API_FEATURE_VERSIONS.noiseKeyRotation),
    serialProxy: {

      count: serialCount,
      supported: serialCount > 0
    },
    voiceAssistant: {

      announcements: (vaFlags & VOICE_ASSISTANT_FLAG.ANNOUNCE) !== 0,
      apiAudio: (vaFlags & VOICE_ASSISTANT_FLAG.API_AUDIO) !== 0,
      speaker: (vaFlags & VOICE_ASSISTANT_FLAG.SPEAKER) !== 0,
      startConversation: (vaFlags & VOICE_ASSISTANT_FLAG.START_CONVERSATION) !== 0,
      stereoAudio: deviceSupports(apiVersion, API_FEATURE_VERSIONS.voiceAssistantStereo),
      supported: (vaFlags !== 0) || (legacyVa > 0),
      timerEvents: (vaFlags & VOICE_ASSISTANT_FLAG.TIMERS) !== 0
    },
    zwaveProxy: {

      featureFlags: zwFlags,
      // Normalise a "no network joined" reading (device-info field absent, or `zwave_home_id` = 0) to `null` so consumers gate on the value's presence rather than a
      // magic zero. The runtime-authoritative home id (updated by HOME_ID_CHANGE pushes) is read via `ZWaveProxyApi.homeId`; this record carries the connect-time
      // snapshot only.
      homeId: rawHomeId === 0 ? null : rawHomeId,
      supported: zwFlags !== 0
    }
  };
}
