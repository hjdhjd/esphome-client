/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.types.ts: Type-level rules for the key forms the client's `psk` option accepts.
 */

/**
 * Compile-time rules for the `psk` option of {@link EspHomeClientOptions}. The option accepts a base64 key string, `null`, or a synchronous {@link PskResolver}. The
 * client calls a resolver synchronously and uses its return value as the key, so an asynchronous resolver and a resolver that returns anything other than a key or
 * `null` must fail to compile. A regression that widened the option would drop a `@ts-expect-error` (turning the directive itself into an error); one that narrowed it
 * would break a sentinel assertion or a directive-free construction.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`, NOT by
 * `node --test`.
 *
 * @module esphome-client.types
 */
import type { Assert, Equal, Extends } from "./internal/type-assertions.ts";
import type { NoiseServerHello, Nullable, PskResolver } from "./types.ts";
import type { EspHomeClientOptions } from "./esphome-client.ts";

/**
 * A base64 key string is accepted.
 */
type StringKeyAccepted = Assert<Extends<string, EspHomeClientOptions["psk"]>>;

/**
 * `null` is accepted and means no key.
 */
type NullKeyAccepted = Assert<Extends<null, EspHomeClientOptions["psk"]>>;

/**
 * A {@link PskResolver} is accepted.
 */
type ResolverAccepted = Assert<Extends<PskResolver, EspHomeClientOptions["psk"]>>;

/**
 * The resolver is exactly a synchronous function from the parsed server hello to a key or `null`.
 */
type ResolverShape = Assert<Equal<PskResolver, (hello: NoiseServerHello) => Nullable<string>>>;

/**
 * A resolver written inline in the options object is contextually typed, so it reads the announced MAC address without annotating its parameter.
 */
const _inlineResolver: EspHomeClientOptions = { host: "device.local", psk: (hello): Nullable<string> => hello.macAddress ?? null };

/**
 * Illegal: an asynchronous resolver. The client consumes the resolver's return value synchronously as the key, so a promise is not a key.
 */
const _asyncResolver: EspHomeClientOptions = {

  host: "device.local",
  // @ts-expect-error - a resolver returning a promise is not a PskResolver; the key must be returned synchronously.
  psk: async (): Promise<string> => Promise.resolve("key")
};

/**
 * Illegal: a resolver returning a number. Only a base64 key string or `null` is a key.
 */
const _numericResolver: EspHomeClientOptions = {

  host: "device.local",
  // @ts-expect-error - a resolver returning a number is not a PskResolver; the key is a base64 string or null.
  psk: (): number => 32
};

// Every sentinel-assertion type alias is exported so the module carries its rules as a surface a reader can find. The typecheck-only constants take the leading
// underscore that the unused-variable lint reads as "declared for its compile-time effect alone"; their value is purely the compile-time validation they produce.
export type {

  NullKeyAccepted,
  ResolverAccepted,
  ResolverShape,
  StringKeyAccepted
};
