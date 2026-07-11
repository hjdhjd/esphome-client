/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * wire-types.ts: Protocol buffer wire types for ESPHome API encoding/decoding.
 */

/**
 * Protocol buffer wire types for encoding and decoding ESPHome API messages.
 *
 * @module protocol/wire-types
 */

/**
 * Wire types used in protobuf encoding. These define how data is encoded on the wire in the protocol buffer format.
 *
 * @remarks Implemented as an `as const` object plus a derived literal-union type. Consumers continue to read `WireType.VARINT`, `WireType.FIXED32`, etc., and the type
 * `WireType` narrows to the underlying numeric literal union. This pattern is the modern replacement for `enum`, compatible with TypeScript's `erasableSyntaxOnly` mode
 * and with build pipelines that strip types at compile time.
 *
 * @internal
 */
export const WireType = {

  FIXED32: 5,
  FIXED64: 1,
  LENGTH_DELIMITED: 2,
  VARINT: 0
} as const;

/**
 * @internal
 */
export type WireType = typeof WireType[keyof typeof WireType];
