/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * api-feature-versions.ts: Single source of truth for protocol-feature version floors.
 */

/**
 * Protocol-feature version floors.
 *
 * @remarks Each entry declares the minimum ESPHome API version at which a given wire-level feature is available. {@link parseCapabilities} reads this
 * table and produces the matching boolean flags on the live {@link ClientCapabilities} record so consumer code asks `caps.modernHandshake`, never
 * `apiVersion.minor >= 11`. The version comparison happens here, once, at capability construction.
 *
 * Adding a new version-gated feature is a single-row diff in this file plus, optionally, a capability flag on `ClientCapabilities` that surfaces it to consumers.
 * The decoder layer never reads this table directly...the schema-driven decoder is forward-compatible by default (unknown fields ignored, new optional fields surface
 * when the wire carries them), so version gating is a consumer-facing concern, not a wire-decoding one. This keeps the decode path version-blind and the surface
 * area for protocol-version churn small.
 *
 * The table is intentionally major-aware: comparing `{ major, minor }` rather than a raw minor number future-proofs against a hypothetical ESPHome API v2 without
 * requiring a separate table or a wholesale refactor. Until that day, every entry has `major: 1`...the handshake validates the device's major against
 * `SUPPORTED_API_MAJORS` before this table is consulted, so any unsupported major has already failed the connect.
 *
 * @module api-feature-versions
 */

/**
 * Concrete ESPHome API version. Mirrors the `{ major, minor }` shape on {@link ClientCapabilities.api} so the same record type flows through both
 * sides of the comparison.
 *
 * @internal
 */
export interface ApiVersion {

  major: number;
  minor: number;
}

/**
 * Version floors at which each named protocol feature became available on the wire. Sorted alphabetically...new entries land in the natural place.
 *
 * @remarks Feature-name conventions:
 *   - Names describe the device-side feature, not the client behavior. `modernHandshake` means "the device supports the unified Hello/Connect exchange," not "the
 *     client takes the modern path." Consumer code reads `caps.modernHandshake` as a fact about the connected device.
 *   - Booleans only. Numeric thresholds (counts, sizes) are not version-feature gates...they belong on a different data structure if we ever add one.
 *   - The table is the only place that names protocol-version constants. No `apiMinor >= 11` checks should live anywhere else in `src/`.
 *
 * @internal
 */
export const API_FEATURE_VERSIONS = {

  /**
   * The device computes its own `object_id` from the entity name client-side, so `ListEntities*Response` payloads omit the wire `object_id` field for clients that
   * advertise this version or higher. The discovery decoder reads the wire value when present and falls back to client-side derivation when absent...this flag is
   * informational for consumers that want to know which behavior is active.
   */
  clientDerivedObjectId:  { major: 1, minor: 14 },

  /**
   * `ListEntitiesClimateResponse` and `ListEntitiesWaterHeaterResponse` carry a `temperature_unit` enum field (celsius/fahrenheit/kelvin) declaring the unit the
   * device reports temperatures in.
   */
  climateTemperatureUnit: { major: 1, minor: 14 },

  /**
   * `LockState` enum extended with `LOCK_STATE_OPENING` (6) and `LOCK_STATE_OPEN` (7). Devices on older versions never emit these values; consumers narrowing on the
   * extended union can use this flag to short-circuit pre-1.14 devices.
   */
  lockOpenStates:         { major: 1, minor: 14 },

  /**
   * The unified Hello/Connect exchange that lets unauthenticated sessions skip `CONNECT_REQUEST` entirely. Introduced at API minor 11.
   */
  modernHandshake:        { major: 1, minor: 11 },

  /**
   * `NOISE_ENCRYPTION_SET_KEY_REQUEST` (message id 124) is understood by the device, so `client.setNoiseEncryptionKey(...)` can succeed. Older devices respond with
   * `success: false`, so the rotation surface degrades gracefully on devices that don't expose the flag.
   */
  noiseKeyRotation:       { major: 1, minor: 7 },

  /**
   * `VoiceAssistantAudio` carries an optional `data2` field (field 3) for the second channel of a stereo audio stream. The decoder surfaces both channels when
   * present; older devices send only `data` (field 1).
   */
  voiceAssistantStereo:   { major: 1, minor: 14 }
} as const satisfies Record<string, ApiVersion>;

/**
 * Type-level enumeration of the feature names. Useful when functions take a feature key by name.
 *
 * @internal
 */
export type ApiFeatureName = keyof typeof API_FEATURE_VERSIONS;

/**
 * Returns true when `deviceVersion` is at or above `featureFloor`. Major-aware: a device on `{ major: 2, minor: 0 }` is considered to support every major-1 feature.
 *
 * @param deviceVersion - The version the connected device announced.
 * @param featureFloor - The minimum version at which the feature became available.
 * @returns Whether the device supports the feature.
 * @internal
 */
export function deviceSupports(deviceVersion: ApiVersion, featureFloor: ApiVersion): boolean {

  if(deviceVersion.major > featureFloor.major) {

    return true;
  }

  if(deviceVersion.major < featureFloor.major) {

    return false;
  }

  return deviceVersion.minor >= featureFloor.minor;
}
