/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * types.ts: Types for the ESPHome client library.
 */

/**
 * Shared types and utilities.
 *
 * @module types
 */

/**
 * Logging interface for the client. Defaults to console output. Consumers supplying their own implementation must define all four levels: `debug`, `error`, `info`,
 * and `warn`.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#custom-logger-injection}
 *
 */
export interface EspHomeLogging {

  debug(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
  info(message: string, ...parameters: unknown[]): void;
  warn(message: string, ...parameters: unknown[]): void;
}

/**
 * Optional metrics interface for observability. Consumers wire this to their backend (StatsD, OpenTelemetry, Prometheus, Datadog, custom) to count frames, time
 * operations, and gauge state. Tags are passed as a flat record so each backend can shape labels per its conventions.
 *
 * @remarks The library's metric names are designed for low cardinality - they tag by entity TYPE, error CLASS, and result CATEGORY rather than by entity id, error
 * message, or per-frame state. High-cardinality concerns are consumer-side. The default `metrics: undefined` short-circuits to no overhead at all; consumers who want
 * metrics pay only the property lookup and function-call cost.
 *
 * Library-emitted metric names (the contract; additive only across minor versions, breaking only across major):
 *
 * | Name | Kind | Tags |
 * |---|---|---|
 * | `frames.received` | counter | `{ encrypted: "true" \| "false" }` |
 * | `frames.sent` | counter | `{ encrypted, type }` (where type is MessageType name) |
 * | `frames.dropped` | counter | `{ reason }` |
 * | `messages.unknown_type` | counter | `{ type }` (numeric) |
 * | `connect.attempts` | counter | `{ result: "success" \| "failure" \| "timeout" }` |
 * | `connect.duration_ms` | timing | `{ encrypted }` |
 * | `reconnect.attempts` | counter | - |
 * | `noise.handshake.duration_ms` | timing | - |
 * | `heartbeat.rtt_ms` | timing | - |
 * | `heartbeat.stalled` | counter | - |
 * | `entity.commands.sent` | counter | `{ type }` (entity type) |
 * | `discovery.entities_found` | gauge | - |
 * | `discovery.services_found` | gauge | - |
 */
export interface ClientMetrics {

  /**
   * Increment a counter. Tag values should be low-cardinality strings; the library never emits high-cardinality tags.
   *
   * @param name - The metric name (dot-separated namespace).
   * @param by - Increment value. Defaults to 1.
   * @param tags - Optional flat record of label key/value pairs.
   */
  increment(name: string, by?: number, tags?: Record<string, string>): void;

  /**
   * Record a timing measurement.
   *
   * @param name - The metric name.
   * @param durationMs - Elapsed milliseconds.
   * @param tags - Optional flat record of label key/value pairs.
   */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;

  /**
   * Set a gauge to a specific value.
   *
   * @param name - The metric name.
   * @param value - The current gauge value.
   * @param tags - Optional flat record of label key/value pairs.
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Utility type that allows a value to be either the given type or `null`.
 *
 * This type is used to explicitly indicate that a variable, property, or return value may be either a specific type or `null`.
 *
 * @typeParam T - The type to make nullable.
 *
 * @example
 *
 * ```ts
 * let id: Nullable<string> = null;
 *
 * // Later...
 * id = "device-001";
 * ```
 */
export type Nullable<T> = T | null;

/**
 * The facts a device announces in its Noise server hello, the first frame it sends on an encrypted connection and the only one it sends before any key is used.
 *
 * @remarks The hello is unauthenticated: any peer can announce any name or MAC address. Supplying a key in answer to it never reveals the key, because the device
 * receives only a handshake message sealed with it and an impostor without the key cannot complete the handshake. The MAC address a consumer admits a device under
 * should be the authenticated {@link DeviceInfo.macAddress} the client delivers after the encrypted connection completes, not the one announced here.
 */
export interface NoiseServerHello {

  /**
   * The device's MAC address in the library's public form, uppercase and colon-separated (`"24:4C:AB:06:49:9C"`), the same form {@link DeviceInfo.macAddress}
   * carries. Absent on firmware before ESPHome 2025.4.0, which announces only the node name.
   */
  readonly macAddress?: string;

  /**
   * The device's node name.
   */
  readonly name?: string;
}

/**
 * Selects the Noise encryption key for a device from what its server hello announces. Pass one as the `psk` client option when the key depends on which device
 * answers, for example a consumer that stores keys under each device's MAC address and connects to an address before it knows which device is there.
 *
 * @remarks The client calls the resolver synchronously on every connection attempt, reconnects included, after it reads the server hello and after the expected
 * server-name check, and before any key material is used. Return the base64-encoded key, or `null` when there is none. A `null` or empty return fails the connection
 * with {@link EncryptionKeyMissingError}, and a key that does not decode to 32 bytes fails it with {@link EncryptionKeyInvalidError}. An exception the resolver
 * throws fails the connection attempt: `connect()` rejects with it as thrown when it is an {@link EspHomeError}, and otherwise with a {@link ConnectionError}
 * (`CONNECT_FAILED`) that carries it as `cause`. A device that does not speak encryption falls back to plaintext without the resolver being called.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#psk-resolver}
 *
 */
export type PskResolver = (hello: NoiseServerHello) => Nullable<string>;

/**
 * Service argument types supported by ESPHome user-defined services. Carved here so the discovery module can decode service entities without depending on the host.
 */
/* Wire-protocol enum: keys are declared in numeric-value order (BOOL=0, INT=1, FLOAT=2, ...) so the file reads in protocol-value sequence. Alphabetizing would
 * scramble that. The matching `eslint-enable` is immediately after the type alias below.
 */
/* eslint-disable sort-keys */
export const ServiceArgType = {

  BOOL:         0,
  INT:          1,
  FLOAT:        2,
  STRING:       3,
  BOOL_ARRAY:   4,
  INT_ARRAY:    5,
  FLOAT_ARRAY:  6,
  STRING_ARRAY: 7
} as const;

export type ServiceArgType = typeof ServiceArgType[keyof typeof ServiceArgType];
/* eslint-enable sort-keys */

/**
 * One argument definition on a user-defined service.
 *
 * @property name - The name of the argument.
 * @property type - The type of the argument (from {@link ServiceArgType}).
 */
export interface ServiceArgument {

  name: string;
  type: ServiceArgType;
}

/**
 * A user-defined service exposed by an ESPHome device.
 *
 * @property key - The unique numeric identifier for the service.
 * @property name - The name of the service.
 * @property args - The list of arguments the service accepts.
 */
export interface ServiceEntity {

  args: ServiceArgument[];
  key: number;
  name: string;
}
