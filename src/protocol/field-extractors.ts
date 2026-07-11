/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * field-extractors.ts: Shared helpers that read typed values from a `decodeProtobuf` result.
 */

/**
 * Pure helpers that pluck typed values out of the `Record<number, FieldValue[]>` shape returned by {@link decodeProtobuf}. Extracted from the host class so receive
 * handlers in `voice-assistant.ts` and `home-assistant.ts` can decode payloads without reaching back into the host.
 *
 * Every helper is pure: same fields plus same field number always produce the same output. None of them mutate the input.
 *
 * @module protocol/field-extractors
 */
import { Buffer } from "node:buffer";
import type { FieldValue } from "./codec.ts";
import { decodeProtobuf } from "./codec.ts";

/**
 * Width of a fixed32 protobuf field in bytes. Used to distinguish a 4-byte float from a UTF-8 string in {@link extractTelemetryValue}, to validate the fixed32
 * entity-key buffer width in {@link extractEntityKey}, and to validate the generic fixed32 field width in {@link extractFixed32Field}.
 *
 * @internal
 */
export const FIXED32_FIELD_BYTES = 4;

/**
 * Options accepted by {@link decodeWithLimits}. Mirrors the shape of the host's instance-bound decoder so a caller outside the host class can supply the same
 * per-message field-count cap and warn callback the host applies.
 *
 * @internal
 */
export interface DecodeWithLimitsOptions {

  /**
   * Maximum total decoded values across all field numbers. Bounded against pathological payloads. {@link decodeProtobuf} throws a `MessageTooManyFieldsError`
   * once the running count exceeds this value.
   */
  readonly maxFieldsPerMessage: number;

  /**
   * Warning hook. Called once when the decoder encounters an unsupported wire type; the decoder then returns the partial result.
   */
  warn(message: string): void;
}

/**
 * Decode a payload buffer into a field map, applying the same per-message field-count cap and warn callback the host applies. Use this in receive handlers that need
 * to decode a top-level or nested payload from outside the host class.
 *
 * @param buffer - The protobuf bytes to decode.
 * @param options - Decode limits and warn callback.
 * @returns The field map keyed by field number.
 * @internal
 */
export function decodeWithLimits(buffer: Buffer, options: DecodeWithLimitsOptions): Record<number, FieldValue[]> {

  return decodeProtobuf(buffer, options);
}

/**
 * Read an entity key from a protobuf field. ESPHome stamps entity keys as fixed32 in most messages and as a varint in a few legacy paths; this helper accepts either
 * to keep call sites uniform.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number to read.
 * @returns The numeric entity key, or `undefined` when the field is missing or the wrong shape.
 * @internal
 */
export function extractEntityKey(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

  const rawKey = fields[fieldNum]?.[0];

  // An explicit presence check rather than a falsy guard: a falsy guard would drop a legitimate varint key of value 0 (the legacy varint path this helper documents),
  // so we distinguish "missing" from a real 0. The Buffer branch then mirrors the sibling extractFixed32Field's length guard - a sub-4-byte buffer can reach here when a
  // field that should be fixed32 instead arrives wire-encoded as a shorter length-delimited body, so we return undefined rather than throwing an untyped RangeError out
  // of readUInt32LE. The codec throws TruncatedMessageError rather than a bare RangeError, so clamping is not the source of a short buffer here.
  if(rawKey === undefined) {

    return undefined;
  }

  if(Buffer.isBuffer(rawKey)) {

    return (rawKey.length === FIXED32_FIELD_BYTES) ? rawKey.readUInt32LE(0) : undefined;
  }

  if(typeof rawKey === "number") {

    return rawKey;
  }

  return undefined;
}

/**
 * Read a fixed32 numeric field. Returns `undefined` when the field is missing or its byte length is not 4.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number to read.
 * @returns The 32-bit unsigned integer value, or `undefined`.
 * @internal
 */
export function extractFixed32Field(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

  const rawBuf = fields[fieldNum]?.[0];

  if(!Buffer.isBuffer(rawBuf) || (rawBuf.length !== FIXED32_FIELD_BYTES)) {

    return undefined;
  }

  return rawBuf.readUInt32LE(0);
}

/**
 * Read a UTF-8 string field. Returns `undefined` when the field is missing or arrives as a number.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number to read.
 * @returns The decoded string, or `undefined`.
 * @internal
 */
export function extractStringField(fields: Record<number, FieldValue[]>, fieldNum: number): string | undefined {

  const rawBuf = fields[fieldNum]?.[0];

  if(!Buffer.isBuffer(rawBuf)) {

    return undefined;
  }

  return rawBuf.toString("utf8");
}

/**
 * Read a varint-encoded number field. Returns `undefined` when the field is missing or arrives as a Buffer.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number to read.
 * @returns The numeric value, or `undefined`.
 * @internal
 */
export function extractNumberField(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

  const raw = fields[fieldNum]?.[0];

  return (typeof raw === "number") ? raw : undefined;
}

/**
 * Read a repeated `HomeassistantServiceMap`-shaped nested message and flatten it into a string-to-string `Record`. The wire shape is `repeated message{ key, value }`;
 * this helper hides that detail behind a uniform map.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number containing the repeated nested entries.
 * @param decode - The decoder to apply to each nested message's payload.
 * @returns A `Record<string, string>` from decoded entries; entries with missing keys or values are skipped.
 * @internal
 */
export function extractRepeatedServiceMap(fields: Record<number, FieldValue[]>, fieldNum: number, decode: (buffer: Buffer) => Record<number, FieldValue[]>):
Record<string, string> {

  const result: Record<string, string> = {};
  const mapFields = fields[fieldNum];

  if(!mapFields || !Array.isArray(mapFields)) {

    return result;
  }

  for(const mapBuffer of mapFields) {

    if(Buffer.isBuffer(mapBuffer)) {

      const mapMsg = decode(mapBuffer);
      const key = extractStringField(mapMsg, 1);
      const value = extractStringField(mapMsg, 2);

      if((key !== undefined) && (value !== undefined)) {

        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Read a polymorphic telemetry value. The wire shape varies by entity type: numeric sensors stamp a 4-byte float, text sensors stamp a UTF-8 string, and varint
 * fields arrive as numbers directly. This helper picks the right interpretation based on the byte shape.
 *
 * @param fields - Decoded field map.
 * @param fieldNum - The field number to read.
 * @returns The decoded value, or `undefined`.
 * @internal
 */
export function extractTelemetryValue(fields: Record<number, FieldValue[]>, fieldNum: number): number | string | undefined {

  const valRaw = fields[fieldNum]?.[0];

  if(Buffer.isBuffer(valRaw)) {

    return (valRaw.length === FIXED32_FIELD_BYTES) ? valRaw.readFloatLE(0) : valRaw.toString("utf8");
  }

  return valRaw;
}
