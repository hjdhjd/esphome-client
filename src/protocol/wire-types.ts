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
 * @remarks `WireType` is an `as const` object paired with a type of the same name: the object carries the named values such as `WireType.VARINT` and `WireType.FIXED32`,
 * and the type is the union of their numeric literals. We chose this form over an `enum` because it is plain JavaScript once its types are erased, so it compiles under
 * TypeScript's `erasableSyntaxOnly` mode and runs unchanged through build pipelines that strip types rather than transform them.
 */
export const WireType = {

  FIXED32: 5,
  FIXED64: 1,
  LENGTH_DELIMITED: 2,
  VARINT: 0
} as const;

export type WireType = typeof WireType[keyof typeof WireType];
