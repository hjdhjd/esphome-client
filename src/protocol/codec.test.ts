/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * codec.test.ts: Unit tests for the varint and protobuf encode/decode primitives in codec.ts.
 */
import { MAX_VARINT_BYTES, decodeProtobuf, encodeProtoFields, encodeVarint, readVarint } from "./codec.ts";
import { MalformedVarintError, TruncatedMessageError } from "../errors.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ProtoField } from "./codec.ts";
import { WireType } from "./wire-types.ts";
import assert from "node:assert/strict";

describe("encodeVarint", () => {

  test("encodes 0 as a single zero byte", () => {

    assert.deepEqual(encodeVarint(0), Buffer.from([0x00]), "0 encodes to one zero byte with no continuation bit");
  });

  test("encodes 1 as a single one byte", () => {

    assert.deepEqual(encodeVarint(1), Buffer.from([0x01]));
  });

  test("encodes 127 (largest single-byte value) as 0x7f", () => {

    assert.deepEqual(encodeVarint(127), Buffer.from([0x7f]), "127 fits in one byte without setting the continuation bit");
  });

  test("encodes 128 as two bytes - the continuation bit fires at the 7-bit boundary", () => {

    assert.deepEqual(encodeVarint(128), Buffer.from([ 0x80, 0x01 ]), "128 spills into a second byte; LSB has continuation bit, MSB carries the high 7 bits");
  });

  test("encodes 300 (canonical varint test value) as 0xac 0x02", () => {

    assert.deepEqual(encodeVarint(300), Buffer.from([ 0xac, 0x02 ]), "300 in varint is the canonical example from the protobuf spec");
  });

  test("encodes 16383 (largest two-byte value) as two 7-bit-max bytes", () => {

    assert.deepEqual(encodeVarint(16383), Buffer.from([ 0xff, 0x7f ]));
  });

  test("encodes 16384 as three bytes", () => {

    assert.deepEqual(encodeVarint(16384), Buffer.from([ 0x80, 0x80, 0x01 ]));
  });

  test("MAX_VARINT_BYTES is 10 - the protobuf-spec limit for a 64-bit varint", () => {

    assert.equal(MAX_VARINT_BYTES, 10);
  });
});

describe("readVarint", () => {

  test("decodes a single zero byte to value 0 and length 1", () => {

    const [ value, length ] = readVarint(Buffer.from([0x00]), 0);

    assert.equal(value, 0);
    assert.equal(length, 1);
  });

  test("decodes 127 from a single byte", () => {

    const [ value, length ] = readVarint(Buffer.from([0x7f]), 0);

    assert.equal(value, 127);
    assert.equal(length, 1);
  });

  test("decodes 128 from two bytes", () => {

    const [ value, length ] = readVarint(Buffer.from([ 0x80, 0x01 ]), 0);

    assert.equal(value, 128);
    assert.equal(length, 2);
  });

  test("decodes 300 from two bytes (canonical example)", () => {

    const [ value, length ] = readVarint(Buffer.from([ 0xac, 0x02 ]), 0);

    assert.equal(value, 300);
    assert.equal(length, 2);
  });

  test("decodes from a non-zero offset", () => {

    const [ value, length ] = readVarint(Buffer.from([ 0xff, 0x80, 0x01 ]), 1);

    assert.equal(value, 128);
    assert.equal(length, 2);
  });

  test("round-trips: encode then decode reproduces the original value across the full uint32 range", () => {

    // The decoder's internal accumulator is a signed int32 because JavaScript bitwise operators force int32 semantics; the `>>> 0` exit at the return statement
    // reinterprets the bit pattern as an unsigned uint32 so the full `0`..`2^32 - 1` range round-trips correctly. Real ESPHome wire fields whose values may reach the
    // high end (Z-Wave home_id, the various feature-flag bitmasks) need the unsigned reading; values below `2^31` are unchanged.
    const cases = [ 0, 1, 127, 128, 255, 256, 16383, 16384, 65535, 1000000, 2147483647 ];

    for(const v of cases) {

      const [decoded] = readVarint(encodeVarint(v), 0);

      assert.equal(decoded, v, "round-trip must preserve " + String(v));
    }
  });

  test("decodes uint32-max (0xFFFFFFFF) as the unsigned interpretation, not as -1", () => {

    // Five-byte canonical varint for uint32-max. The `>>> 0` reinterprets the accumulator as unsigned, so this decodes to 4294967295. This matters for wire fields
    // like Z-Wave home_id, which routinely spans the full uint32 range.
    const [ value, length ] = readVarint(Buffer.from([ 0xff, 0xff, 0xff, 0xff, 0x0f ]), 0);

    assert.equal(value, 0xFFFFFFFF, "0xFFFFFFFF must decode to its unsigned uint32 value (4294967295)");
    assert.equal(length, 5);
  });

  test("decodes bit-31-set values to their unsigned interpretation", () => {

    // Boundary values straddling the int32 / uint32 line. Every entry has bit 31 set and decodes to its unsigned interpretation. Each must round-trip through
    // encodeVarint -> readVarint without loss.
    const cases = [ 0x80000000, 0xC0000000, 0xFFFFFFFE, 0xFFFFFFFF ];

    for(const v of cases) {

      const [decoded] = readVarint(encodeVarint(v), 0);

      assert.equal(decoded, v, "bit-31-set value " + v.toString(16) + " must decode to its unsigned interpretation");
    }
  });

  test("throws MalformedVarintError when the continuation bit never clears within MAX_VARINT_BYTES", () => {

    // Eleven bytes all with the continuation bit set - never produces a stop bit. The decoder must throw rather than loop forever.
    const malformed = Buffer.from([ 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80 ]);

    assert.throws(() => readVarint(malformed, 0), MalformedVarintError, "no stop bit must throw MalformedVarintError");
  });

  test("throws RangeError when offset is past the buffer end", () => {

    assert.throws(() => readVarint(Buffer.alloc(0), 0), { name: "RangeError" }, "reading past end of buffer must throw RangeError");
  });
});

describe("encodeProtoFields", () => {

  test("encodes a single VARINT field", () => {

    const encoded = encodeProtoFields([{ fieldNumber: 1, value: 42, wireType: WireType.VARINT }]);

    // Tag for field 1 + VARINT(0) is (1 << 3) | 0 = 0x08, value 42 = 0x2a.
    assert.deepEqual(encoded, Buffer.from([ 0x08, 0x2a ]));
  });

  test("encodes a LENGTH_DELIMITED field as [tag, length-varint, bytes]", () => {

    const payload = Buffer.from("hi", "utf8");
    const encoded = encodeProtoFields([{ fieldNumber: 1, value: payload, wireType: WireType.LENGTH_DELIMITED }]);

    // Tag for field 1 + LENGTH_DELIMITED(2) is (1 << 3) | 2 = 0x0a, then length 2, then "hi".
    assert.deepEqual(encoded, Buffer.from([ 0x0a, 0x02, 0x68, 0x69 ]));
  });

  test("encodes a FIXED32 numeric field little-endian into 4 bytes", () => {

    const encoded = encodeProtoFields([{ fieldNumber: 1, value: 1, wireType: WireType.FIXED32 }]);

    // Tag for field 1 + FIXED32(5) is (1 << 3) | 5 = 0x0d.
    assert.deepEqual(encoded, Buffer.from([ 0x0d, 0x01, 0x00, 0x00, 0x00 ]));
  });

  test("encodes a FIXED32 Buffer field by copying its bytes verbatim", () => {

    const fixed = Buffer.from([ 0xde, 0xad, 0xbe, 0xef ]);
    const encoded = encodeProtoFields([{ fieldNumber: 1, value: fixed, wireType: WireType.FIXED32 }]);

    assert.deepEqual(encoded.subarray(1), fixed, "the FIXED32 buffer body must be copied verbatim after the tag");
  });

  test("throws EncodingError for an unsupported wire type", () => {

    const fields: ProtoField[] = [{ fieldNumber: 1, value: 0, wireType: WireType.FIXED64 }];

    assert.throws(() => encodeProtoFields(fields), { name: "EncodingError" }, "FIXED64 is not supported by the encoder; must throw a typed error");
  });

  test("encodes an empty field list as an empty buffer", () => {

    assert.deepEqual(encodeProtoFields([]), Buffer.alloc(0));
  });

  test("encodes multiple fields in declared order", () => {

    const encoded = encodeProtoFields([

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 2, wireType: WireType.VARINT }
    ]);

    assert.deepEqual(encoded, Buffer.from([ 0x08, 0x01, 0x10, 0x02 ]));
  });
});

describe("decodeProtobuf", () => {

  test("decodes a single VARINT field", () => {

    const fields = decodeProtobuf(Buffer.from([ 0x08, 0x2a ]), { maxFieldsPerMessage: 100 });

    assert.deepEqual(fields[1], [42]);
  });

  test("decodes a single LENGTH_DELIMITED field as a Buffer", () => {

    const fields = decodeProtobuf(Buffer.from([ 0x0a, 0x02, 0x68, 0x69 ]), { maxFieldsPerMessage: 100 });

    const value = fields[1]?.[0];

    assert.equal(Buffer.isBuffer(value), true, "LENGTH_DELIMITED decodes to a Buffer");
    assert.equal(Buffer.isBuffer(value) ? value.toString("utf8") : null, "hi");
  });

  test("decodes repeated occurrences of the same field number into the array under that key", () => {

    // Field 1 VARINT 1, field 1 VARINT 2 - the decoder must accumulate both into fields[1].
    const fields = decodeProtobuf(Buffer.from([ 0x08, 0x01, 0x08, 0x02 ]), { maxFieldsPerMessage: 100 });

    assert.deepEqual(fields[1], [ 1, 2 ]);
  });

  test("returns an empty record for an empty buffer", () => {

    assert.deepEqual(decodeProtobuf(Buffer.alloc(0), { maxFieldsPerMessage: 100 }), {});
  });

  test("throws MessageTooManyFieldsError when total decoded values exceed the cap", () => {

    // Three VARINT fields. Cap of 2 must trigger the bound.
    const buffer = Buffer.from([ 0x08, 0x01, 0x08, 0x02, 0x08, 0x03 ]);

    assert.throws(() => decodeProtobuf(buffer, { maxFieldsPerMessage: 2 }), { name: "MessageTooManyFieldsError" });
  });

  test("round-trips: encode then decode reproduces a field map", () => {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 42, wireType: WireType.VARINT },
      { fieldNumber: 2, value: Buffer.from("hello", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ];

    const decoded = decodeProtobuf(encodeProtoFields(fields), { maxFieldsPerMessage: 100 });

    assert.deepEqual(decoded[1], [42]);
    assert.equal(Buffer.isBuffer(decoded[2]?.[0]) && decoded[2]?.[0].toString("utf8"), "hello");
  });

  test("raises a typed TruncatedMessageError when a FIXED32 field runs past the buffer end", () => {

    // Tag for field 1 FIXED32 is (1 << 3) | 5 = 0x0d, then only 2 of the required 4 body bytes follow. A FIXED32 field whose declared 4-byte width overruns the remaining
    // buffer raises one typed TruncatedMessageError instead of reading past the offset.
    const truncated = Buffer.from([ 0x0d, 0x01, 0x02 ]);

    assert.throws(() => decodeProtobuf(truncated, { maxFieldsPerMessage: 100 }), { name: "TruncatedMessageError" },
      "a FIXED32 width exceeding the remaining bytes must raise the typed truncation error");
    assert.throws(() => decodeProtobuf(truncated, { maxFieldsPerMessage: 100 }), TruncatedMessageError);
  });

  test("raises a typed TruncatedMessageError when a FIXED64 field runs past the buffer end", () => {

    // Tag for field 1 FIXED64 is (1 << 3) | 1 = 0x09, then only 4 of the required 8 body bytes follow. An over-wide FIXED64 raises TruncatedMessageError so the
    // codec's typed-error contract holds for this wire type.
    const truncated = Buffer.from([ 0x09, 0x01, 0x02, 0x03, 0x04 ]);

    assert.throws(() => decodeProtobuf(truncated, { maxFieldsPerMessage: 100 }), { name: "TruncatedMessageError" },
      "a FIXED64 width exceeding the remaining bytes must raise the typed truncation error, not an untyped RangeError");
  });

  test("raises a typed TruncatedMessageError when a LENGTH_DELIMITED body runs past the buffer end", () => {

    // Tag for field 1 LENGTH_DELIMITED is (1 << 3) | 2 = 0x0a, length varint claims 5 bytes, but only 2 body bytes follow. A short buffer raises the typed truncation
    // error rather than clamping silently. The length varint itself reads cleanly - only the body overruns, so the intentional need-more-bytes varint seam is
    // untouched.
    const truncated = Buffer.from([ 0x0a, 0x05, 0x68, 0x69 ]);

    assert.throws(() => decodeProtobuf(truncated, { maxFieldsPerMessage: 100 }), { name: "TruncatedMessageError" },
      "a LENGTH_DELIMITED body exceeding the remaining bytes must raise the typed truncation error rather than silently clamping");
  });
});

describe("encodeProtoFields - hot path", () => {

  test("encodes 10,000 mixed-wire-type command messages, each round-tripping intact through the decoder", () => {

    // The architectural-reference hot path "outbound command encoding" terminates at encodeProtoFields - every switch / light / climate / number command and every
    // Bluetooth / Z-Wave / voice request is serialized through it. The fuzz harness already load-tests the decode primitive at N=100k; this is the encode-side analogue.
    // Each iteration builds a realistic four-field command (a FIXED32 entity key, a number-typed VARINT counter, a bigint VARINT for the uint64 BLE-address encode
    // branch, and a LENGTH_DELIMITED object-id string), so the loop exercises every round-trippable encoder branch under load. We weave the index into every field and
    // verify the encode -> decode round-trip each iteration, so a regression in the tag math, the length prefix, or the varint emission surfaces as a failed assertion
    // rather than a silent throughput-only pass.
    const N = 10000;

    for(let i = 0; i < N; i++) {

      const objectId = Buffer.from("cmd_" + String(i), "utf8");
      const key = (0x10000000 | i) >>> 0;
      const fields: ProtoField[] = [

        { fieldNumber: 1, value: key, wireType: WireType.FIXED32 },
        { fieldNumber: 2, value: i, wireType: WireType.VARINT },
        { fieldNumber: 3, value: BigInt(i), wireType: WireType.VARINT },
        { fieldNumber: 4, value: objectId, wireType: WireType.LENGTH_DELIMITED }
      ];
      const decoded = decodeProtobuf(encodeProtoFields(fields), { maxFieldsPerMessage: 100 });
      const decodedKey = decoded[1]?.[0];
      const decodedBody = decoded[4]?.[0];

      // FIXED32 decodes to the raw four bytes; read them back as the little-endian uint32 the encoder wrote. The high nibble (0x1) keeps all four output bytes
      // significant rather than just the low byte a small counter would touch.
      assert.equal(Buffer.isBuffer(decodedKey) ? decodedKey.readUInt32LE(0) : null, key, "the FIXED32 entity key must round-trip intact");

      // The number-typed VARINT branch and the bigint-typed VARINT branch must both decode back to i. The bigint stays uint32-safe so the number-typed decoder reads it
      // losslessly - this proves encodeVarintBigInt agrees with encodeVarint over the shared range while still exercising the dedicated bigint code path under load.
      assert.equal(decoded[2]?.[0], i, "the number-typed VARINT field must round-trip intact");
      assert.equal(decoded[3]?.[0], i, "the bigint-typed VARINT field must round-trip to the same value through the number-typed decoder");
      assert.equal(Buffer.isBuffer(decodedBody) && decodedBody.equals(objectId), true, "the LENGTH_DELIMITED object-id body must round-trip byte-for-byte");
    }
  });
});
