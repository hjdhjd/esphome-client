/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * codec.ts: Pure protobuf codec primitives - varint encode/decode, message encode/decode, field-spec encoding.
 */

/**
 * Protobuf codec primitives shared by transport-level framing and payload-level message handling.
 *
 * @remarks Every function here is pure: no instance state, no IO, no logging dependency. Resource bounds are passed in by the caller; errors are thrown via the typed
 * {@link MalformedVarintError} / {@link MessageTooManyFieldsError} hierarchy from `errors`.
 *
 * The codec actively decodes the wire types the ESPHome native API uses today: varint, fixed32, length-delimited. Fixed64 decoding is also implemented, but purely
 * for forward compatibility - no field in the current protocol specification is declared fixed64, double, or sfixed64, so the branch has no live producer. Other wire
 * types are reported via a caller-supplied warning hook and the decoder returns the partial result rather than throwing - the goal is forward compatibility: unknown
 * fields arriving from a newer device must not crash an older client.
 *
 * @module protocol/codec
 */
import { EncodingError, MalformedVarintError, MessageTooManyFieldsError, TruncatedMessageError } from "../errors.ts";
import { Buffer } from "node:buffer";
import { WireType } from "./wire-types.ts";

/**
 * Maximum bytes a single varint may consume before its stop-bit. Hardcoded to the 64-bit-varint upper bound dictated by the protobuf encoding itself - no consumer-
 * tunable knob; the limit exists to prevent a runaway loop on a malformed varint without a stop bit, which would otherwise advance offset indefinitely until the buffer
 * ran out.
 *
 * @internal
 */
export const MAX_VARINT_BYTES = 10;

/**
 * Decoded protobuf field value. The codec returns:
 * - `number` for varint fields (`uint32`, `int32`, `bool`, `enum`) and `fixed64` (decoded as a JavaScript double)
 * - `Buffer` for length-delimited and fixed32 fields (callers interpret the contents per their schema)
 *
 * The union collapses to `Buffer | number` because the codec implements exactly these wire types; unknown wire types short-circuit decode without producing a value.
 *
 * @internal
 */
export type FieldValue = Buffer | number;

/**
 * One field in an outbound protobuf message. The encoder serializes each entry by wire type.
 *
 * @remarks `value`'s shape depends on `wireType`: `VARINT` expects a `number` or a `bigint` (the bigint path encodes through {@link encodeVarintBigInt} and preserves the
 * full 64-bit range for wire fields declared `uint64`), `LENGTH_DELIMITED` expects a `Buffer`, `FIXED32` expects a `number` (encoded little-endian as `uint32`) or a
 * `Buffer` (copied verbatim into the four output bytes). `FIXED64` is not supported on the encoder side because the client never needs to send `fixed64` fields
 * outbound - if outbound fixed64 is ever required, extend the encoder rather than open-coding the encode at the call site.
 *
 * @internal
 */
export interface ProtoField {

  /**
   * The protobuf field number (the value to the left of the `=` in the `.proto` definition).
   */
  fieldNumber: number;

  /**
   * The value to encode. Shape depends on `wireType` (see remarks). `bigint` is accepted only for VARINT fields and is the right type for protobuf `uint64` (BLE
   * addresses, GATT handles serialised end-to-end, etc.).
   */
  value: Buffer | bigint | number;

  /**
   * The wire type. The encoder supports `VARINT`, `LENGTH_DELIMITED`, and `FIXED32` for outbound message fields. `FIXED64` is accepted at the type level for symmetry
   * with the schema's wireType union and the decoder's forward-compatibility support for it, but the encoder throws {@link EncodingError} on FIXED64 because no field
   * in the current ESPHome native API protocol is declared fixed64, and the client never needs to send one outbound.
   */
  wireType: WireType;
}

/**
 * Optional warning hook for the decoder. Called once per unsupported wire type encountered. The decoder returns its partial result after the first such warning rather
 * than throwing, matching the forward-compatibility intent: a newer device adding a field with an unsupported wire type should not crash an older client.
 *
 * @internal
 */
export type CodecWarn = (message: string) => void;

/**
 * Configuration for {@link decodeProtobuf}.
 *
 * @internal
 */
export interface DecodeOptions {

  /**
   * Maximum total decoded values across all field numbers. Bounded against pathological payloads. The decoder throws {@link MessageTooManyFieldsError} if
   * the running count exceeds this value.
   */
  maxFieldsPerMessage: number;

  /**
   * Optional warning hook. Called once when the decoder encounters an unsupported wire type; the decoder then returns the partial result.
   */
  warn?: CodecWarn;
}

/**
 * Encode a non-negative integer as a protobuf varint.
 *
 * @param value - The non-negative integer to encode. Behavior is undefined for negative numbers; callers are expected to convert signed values via zigzag encoding
 *   before calling this.
 * @returns The encoded varint as a `Buffer`.
 * @internal
 */
export function encodeVarint(value: number): Buffer {

  const bytes: number[] = [];

  // Standard protobuf base-128 varint encoding: emit 7 bits of value at a time with the MSB as continuation flag, until the residual is zero.
  for(let v = value; ; v >>>= 7) {

    const bytePart = v & 0x7F;
    const hasMore = (v >>> 7) !== 0;

    bytes.push(hasMore ? (bytePart | 0x80) : bytePart);

    if(!hasMore) {

      break;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Encode a non-negative `bigint` as a protobuf varint. The standard {@link encodeVarint} works in JavaScript numbers and uses 32-bit bitwise operators internally; that
 * silently truncates anything above 2^32, so wire fields declared as `uint64` (BLE addresses, GATT handles end-to-end, etc.) need this bigint-typed encoder instead.
 *
 * Algorithm mirrors {@link encodeVarint}: emit seven bits of value at a time with the MSB as the continuation flag, until the residual is zero. The only difference is
 * the accumulator type (`bigint`) and the use of bigint arithmetic operators so the full 64-bit dynamic range is preserved.
 *
 * @param value - The non-negative bigint to encode. Behavior is undefined for negative values - protobuf `uint64` is unsigned.
 * @returns The encoded varint as a `Buffer`.
 * @internal
 */
export function encodeVarintBigInt(value: bigint): Buffer {

  const bytes: number[] = [];

  // Standard protobuf base-128 varint encoding, bigint variant: emit 7 bits per step, MSB as continuation flag, stop when the residual is zero. Mask via `& 0x7Fn` then
  // narrow to a JS number for the byte buffer; `Number()` on a value < 128 is lossless.
  for(let v = value; ; v >>= 7n) {

    const bytePart = Number(v & 0x7Fn);
    const hasMore = (v >> 7n) !== 0n;

    bytes.push(hasMore ? (bytePart | 0x80) : bytePart);

    if(!hasMore) {

      break;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Encode a signed 32-bit integer using protobuf zigzag encoding. Zigzag maps small-magnitude negative numbers to small-magnitude unsigned numbers so the resulting
 * varint stays compact for the signed values protobuf `sint32` fields carry. Behavior is undefined outside the int32 range; within that range the encoding follows
 * protobuf's `sint32` zigzag definition.
 *
 * @param value - The signed 32-bit integer to encode.
 * @returns The unsigned zigzag-encoded representation.
 * @internal
 */
export function zigzagEncode(value: number): number {

  return ((value << 1) ^ (value >> 31)) >>> 0;
}

/**
 * Decode a zigzag-encoded unsigned integer back into a signed 32-bit integer. Inverse of {@link zigzagEncode}.
 *
 * @param value - The unsigned zigzag-encoded value as read off the wire.
 * @returns The signed integer the encoder originally supplied.
 * @internal
 */
export function zigzagDecode(value: number): number {

  return (value >>> 1) ^ -(value & 1);
}

/**
 * Encode an array of signed 32-bit integers as a single packed `sint32` field body. The protobuf packed encoding concatenates every value's zigzag-encoded varint into a
 * single length-delimited buffer; the caller wraps that buffer with the field tag and length prefix via {@link encodeProtoFields}. Mirrors the wire layout described for
 * `repeated sint32 [packed = true]` in `src/api.proto` (used by `InfraredRFTransmitRawTimingsRequest.timings` and `InfraredRFReceiveEvent.timings`).
 *
 * @param values - The signed integers to encode in order.
 * @returns The concatenated packed body.
 * @internal
 */
export function encodePackedSint32(values: readonly number[]): Buffer {

  const parts: Buffer[] = [];

  for(const value of values) {

    parts.push(encodeVarint(zigzagEncode(value)));
  }

  return Buffer.concat(parts);
}

/**
 * Decode a packed `sint32` field body into an array of signed integers. The buffer holds back-to-back zigzag-encoded varints; each is read in sequence until the buffer
 * is exhausted. Returns an empty array when the buffer is empty (the wire-legal "no timings" case for an `InfraredRFReceiveEvent`).
 *
 * @param buffer - The length-delimited field body.
 * @returns The decoded signed integers in wire order.
 *
 * @throws {@link MalformedVarintError} when a varint exceeds {@link MAX_VARINT_BYTES} without a stop bit.
 * @internal
 */
export function decodePackedSint32(buffer: Buffer): number[] {

  const values: number[] = [];

  for(let offset = 0; offset < buffer.length;) {

    const [ raw, bytesRead ] = readVarint(buffer, offset);

    values.push(zigzagDecode(raw));
    offset += bytesRead;
  }

  return values;
}

/**
 * Decode a varint at `offset` in `buffer` as a `bigint`. The standard {@link readVarint} returns a JavaScript `number`, which is safe for values up to 2^53 but uses
 * 32-bit bitwise operators internally and therefore truncates anything beyond 32 bits. Wire fields declared as `uint64` (BLE addresses, GATT handles, etc.) need the
 * full 64-bit precision; this helper decodes those without loss.
 *
 * Algorithm mirrors {@link readVarint}: read seven bits per byte, MSB-as-continuation, stop bit ends the encoding; the only difference is the accumulator type
 * (`bigint`) and the use of arithmetic operators (`|`, `<<`) on `bigint` operands so the 64-bit dynamic range is preserved.
 *
 * @param buffer - Source buffer.
 * @param offset - Starting offset.
 * @returns A tuple `[value, bytesRead]`. `bytesRead` is the number of bytes consumed; advance the caller's cursor by this amount.
 *
 * @throws {@link MalformedVarintError} when the encoding never sets a stop bit within {@link MAX_VARINT_BYTES} bytes.
 * @internal
 */
export function readVarintBigInt(buffer: Buffer, offset: number): [ bigint, number ] {

  let result = 0n;
  let bytesRead = 0;

  // Read byte-by-byte, adding seven bits at each step, until the continuation bit clears. The `bigint` accumulator avoids the 32-bit truncation that the number-typed
  // sibling suffers from on values beyond 2^32; the same MAX_VARINT_BYTES cap stops malformed input that never sets the stop bit.
  for(let shift = 0n; ; shift += 7n) {

    if(bytesRead >= MAX_VARINT_BYTES) {

      throw new MalformedVarintError("Varint exceeded " + String(MAX_VARINT_BYTES) + " bytes without a stop bit.", "MALFORMED_VARINT");
    }

    const byte = buffer.readUInt8(offset + bytesRead);

    result |= BigInt(byte & 0x7F) << shift;
    bytesRead++;

    if((byte & 0x80) === 0) {

      break;
    }
  }

  return [ result, bytesRead ];
}

/**
 * Decode a varint at `offset` in `buffer`.
 *
 * @param buffer - Source buffer.
 * @param offset - Starting offset.
 * @returns A tuple `[value, bytesRead]`. The value is the **unsigned uint32 interpretation** of the varint (range `0`..`2^32 - 1`); `bytesRead` is the number of bytes
 * consumed, so advance the caller's cursor by this amount.
 *
 * @throws {@link MalformedVarintError} when the encoding never sets a stop bit within {@link MAX_VARINT_BYTES} bytes.
 *
 * @remarks JavaScript's bitwise operators force operands to signed int32, so the byte-by-byte accumulator wraps into negative numbers for any value with bit 31 set
 * (e.g., a raw `0xFFFFFFFF` would otherwise return `-1`). The `>>> 0` (unsigned right shift by zero) at the return statement converts the signed-int32 accumulator into
 * its unsigned-uint32 interpretation - a no-op for values below `2^31` and the correct unsigned reading for values `2^31`..`2^32 - 1`. The wider {@link readVarintBigInt}
 * primitive covers the rare `uint64` wire fields (BLE addresses, GATT handles) where the full 64-bit range matters; this `number`-typed primitive is the right choice
 * for every other inbound wire field.
 *
 * Convention for ESPHome's protocol: every inbound `int32` wire field in `src/api.proto` (BLE error codes, fan `supported_speed_count` / `speed_level`, sensor
 * `accuracy_decimals`) carries values that are non-negative in practice, so the unsigned return shape is the correct interpretation for every real-world consumer. If a
 * future inbound field genuinely needs a negative-value reading, the caller converts at the call site via `(value | 0)` - a one-character signed-int32 cast - rather
 * than asking this primitive to return signed numbers.
 *
 * @internal
 */
export function readVarint(buffer: Buffer, offset: number): [ number, number ] {

  let result = 0;
  let bytesRead = 0;

  // Read byte-by-byte, adding 7 bits at each step, until the continuation bit is clear. We use readUInt8 (rather than buf[offset]) so an out-of-bounds read throws
  // RangeError rather than producing undefined; the strict-mode index-access check is satisfied without a fallback path that would mask malformed input. The
  // MAX_VARINT_BYTES cap stops malformed input that never sets the stop bit from advancing the offset indefinitely.
  for(let shift = 0; ; shift += 7) {

    if(bytesRead >= MAX_VARINT_BYTES) {

      throw new MalformedVarintError("Varint exceeded " + String(MAX_VARINT_BYTES) + " bytes without a stop bit.", "MALFORMED_VARINT");
    }

    const byte = buffer.readUInt8(offset + bytesRead);

    result |= (byte & 0x7F) << shift;
    bytesRead++;

    if((byte & 0x80) === 0) {

      break;
    }
  }

  // The accumulator is a signed int32 because JS bitwise operators force int32 semantics. `>>> 0` reinterprets the bit pattern as an unsigned uint32, which is the
  // correct shape for varint wire values - see the JSDoc above for the audit of consumers and the convention for the rare callers that legitimately need signed reads.
  return [ result >>> 0, bytesRead ];
}

/**
 * Encode a list of fields into a protobuf message.
 *
 * @param fields - Field definitions to encode in order.
 * @returns The encoded message as a `Buffer`.
 * @internal
 */
export function encodeProtoFields(fields: readonly ProtoField[]): Buffer {

  const parts: Buffer[] = [];

  for(const field of fields) {

    // Encode the field tag (field number << 3 | wire type) as a varint.
    parts.push(encodeVarint((field.fieldNumber << 3) | field.wireType));

    switch(field.wireType) {

      case WireType.VARINT:

        // VARINT accepts either `number` (the common case, used for uint32 / int32 / bool / enum fields) or `bigint` (used for uint64 fields like BLE addresses). The
        // bigint path delegates to {@link encodeVarintBigInt} which preserves the full 64-bit range; the number path uses the 32-bit-bitwise encoder, which is fine for
        // every wire field declared narrower than 33 bits. `ProtoField.value` is typed to also allow `Buffer`, but every VARINT call site across the codebase supplies
        // a `number` or `bigint`, never a `Buffer`; unlike the FIXED32 branch below, that exclusion is a rule upheld by caller discipline rather than a runtime
        // guard here.
        parts.push((typeof field.value === "bigint") ? encodeVarintBigInt(field.value) : encodeVarint(field.value as number));

        break;

      case WireType.LENGTH_DELIMITED: {

        const buf = field.value as Buffer;

        parts.push(encodeVarint(buf.length));
        parts.push(buf);

        break;
      }

      case WireType.FIXED32: {

        const buf = Buffer.alloc(4);

        if(typeof field.value === "number") {

          buf.writeUInt32LE(field.value, 0);

        } else if(Buffer.isBuffer(field.value)) {

          field.value.copy(buf);

        } else {

          // The VARINT branch above is the only legitimate consumer of the bigint path; surfacing here means a caller mis-typed the field. Throw rather than silently
          // emitting an empty four-byte buffer that would corrupt the wire message.
          throw new EncodingError("FIXED32 field " + String(field.fieldNumber) + " received a bigint; use VARINT for uint64 values.", "FIXED32_BIGINT");
        }

        parts.push(buf);

        break;
      }

      default:

        // FIXED64 (decoded inbound only for forward compatibility - no current ESPHome field is declared fixed64) and any future wire type are not supported by the
        // encoder. Throw a typed error rather than silently emitting an empty value, which would corrupt the message body.
        throw new EncodingError("Unsupported outbound wire type " + String(field.wireType) + " for field " + String(field.fieldNumber) + ".", "UNSUPPORTED_WIRE_TYPE");
    }
  }

  return Buffer.concat(parts);
}

/**
 * Decode a protobuf message into a record keyed by field number.
 *
 * @param buffer - The encoded message body (no length prefix).
 * @param options - Resource bounds and the optional warning hook.
 * @returns A `Record<number, FieldValue[]>`; each field number maps to an array of decoded values (one entry per repeated occurrence).
 *
 * @throws {@link MalformedVarintError} on malformed varints, {@link MessageTooManyFieldsError} when the decoded value count exceeds the configured cap,
 * {@link TruncatedMessageError} when a FIXED32 / FIXED64 / LENGTH_DELIMITED field declares a width that runs past the end of the buffer.
 * @internal
 */
export function decodeProtobuf(buffer: Buffer, options: DecodeOptions): Record<number, FieldValue[]> {

  const fields: Record<number, FieldValue[]> = {};

  // Counter of total decoded values across all field numbers; bounded against maxFieldsPerMessage to defend against pathological payloads.
  let totalFields = 0;

  for(let offset = 0; offset < buffer.length;) {

    const [ tag, tagLen ] = readVarint(buffer, offset);

    offset += tagLen;

    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    let value: FieldValue;

    switch(wireType) {

      case WireType.VARINT: {

        const [ v, vLen ] = readVarint(buffer, offset);

        value = v;
        offset += vLen;

        break;
      }

      case WireType.FIXED64:

        // 64-bit little-endian double. No field in the current ESPHome native API protocol is declared fixed64 - every float field uses FIXED32 instead - so this
        // branch exists purely for forward compatibility with a wire type the protocol may adopt later. Guard the width against the remaining bytes before the read:
        // an explicit typed truncation error is the codec's contract, whereas readDoubleLE on a short buffer would throw an untyped RangeError. The guard is one
        // integer compare per field with no allocation, so the hot path is unaffected.
        if((offset + 8) > buffer.length) {

          throw new TruncatedMessageError("FIXED64 field " + String(fieldNum) + " declares 8 bytes but only " + String(buffer.length - offset) +
            " remain.", "TRUNCATED_MESSAGE");
        }

        value = buffer.readDoubleLE(offset);
        offset += 8;

        break;

      case WireType.LENGTH_DELIMITED: {

        // The length prefix is a varint; reading it preserves the intentional need-more-bytes seam (a truncated length varint surfaces as the shared readVarint
        // behavior). We guard only the BODY: a declared length that overruns the remaining buffer must raise the typed truncation error rather than silently
        // subarray-clamping to a short buffer (which would also overshoot the offset and corrupt the remaining decode).
        const [ len, lenLen ] = readVarint(buffer, offset);

        offset += lenLen;

        if((offset + len) > buffer.length) {

          throw new TruncatedMessageError("LENGTH_DELIMITED field " + String(fieldNum) + " declares " + String(len) + " bytes but only " +
            String(buffer.length - offset) + " remain.", "TRUNCATED_MESSAGE");
        }

        value = buffer.subarray(offset, offset + len);
        offset += len;

        break;
      }

      case WireType.FIXED32:

        // For 32-bit fields, return the raw four bytes for caller interpretation (some are fixed32 entity keys, others are little-endian uint32 timestamps, others are
        // float bit patterns - the schema layer knows which). Guard the width against the remaining bytes so a truncated field raises the typed truncation error instead
        // of silently subarray-clamping to a short buffer and overshooting the offset.
        if((offset + 4) > buffer.length) {

          throw new TruncatedMessageError("FIXED32 field " + String(fieldNum) + " declares 4 bytes but only " + String(buffer.length - offset) +
            " remain.", "TRUNCATED_MESSAGE");
        }

        value = buffer.subarray(offset, offset + 4);
        offset += 4;

        break;

      default:

        // Unsupported wire type. Warn (if a hook was supplied) and return the partial result. Forward compatibility: a newer device adding a field with an unsupported
        // wire type must not crash an older client.
        options.warn?.("Unsupported wire type " + String(wireType) + ".");

        return fields;
    }

    const bucket = fields[fieldNum] ??= [];

    totalFields++;

    if(totalFields > options.maxFieldsPerMessage) {

      throw new MessageTooManyFieldsError("Decoded protobuf message exceeded maxFieldsPerMessage (" + String(options.maxFieldsPerMessage) + ").", "TOO_MANY_FIELDS");
    }

    bucket.push(value);
  }

  return fields;
}
