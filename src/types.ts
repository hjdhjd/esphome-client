/* Copyright(C) 2017-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * types.ts: Types for the ESPHome client library.
 */

/**
 * Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.
 *
 * @remarks By default, logging is done to the console. If you use your own logging functions, you must specify all the alert levels that the library uses: `debug`,
 * `error`, `info`, and `warn`.
 */
export interface EspHomeLogging {

  debug(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
  info(message: string, ...parameters: unknown[]): void;
  warn(message: string, ...parameters: unknown[]): void;
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
