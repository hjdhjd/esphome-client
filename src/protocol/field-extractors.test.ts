/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * field-extractors.test.ts: Unit tests for the typed-field readers in field-extractors.ts.
 */
import {
  FIXED32_FIELD_BYTES, decodeWithLimits, extractEntityKey, extractFixed32Field, extractNumberField, extractRepeatedServiceMap, extractStringField,
  extractTelemetryValue
} from "./field-extractors.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { decodeProtobuf } from "./codec.ts";

describe("FIXED32_FIELD_BYTES", () => {

  test("is 4 - the protobuf-spec width of a fixed32 field", () => {

    assert.equal(FIXED32_FIELD_BYTES, 4);
  });
});

describe("decodeWithLimits", () => {

  test("delegates to decodeProtobuf and respects the field cap", () => {

    const buffer = Buffer.from([ 0x08, 0x01 ]);
    const warned: string[] = [];
    const result = decodeWithLimits(buffer, { maxFieldsPerMessage: 100, warn: (m): void => { warned.push(m); } });

    assert.deepEqual(result[1], [1]);
    assert.equal(warned.length, 0, "no warnings expected on well-formed input");
  });
});

describe("extractEntityKey", () => {

  test("returns undefined for a missing field", () => {

    assert.equal(extractEntityKey({}, 1), undefined);
  });

  test("reads a fixed32 little-endian Buffer key", () => {

    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(0xdeadbeef, 0);

    assert.equal(extractEntityKey({ 1: [buf] }, 1), 0xdeadbeef);
  });

  test("reads a numeric varint key", () => {

    assert.equal(extractEntityKey({ 1: [42] }, 1), 42);
  });

  test("preserves a legitimate varint key of value 0", () => {

    // The function's JSDoc claims to support the legacy varint key path; a varint-encoded key of value 0 is a legitimate key, not a missing field. The hardened
    // presence guard distinguishes 0 from absence, mirroring extractFixed32Field's handling of a zero-filled fixed32 buffer.
    assert.equal(extractEntityKey({ 1: [0] }, 1), 0, "a varint key of 0 must round-trip as 0, not be dropped as missing");
  });

  test("returns undefined for a sub-4-byte fixed32 key buffer rather than throwing", () => {

    // A fixed32 key buffer whose length is not exactly 4 bytes must return undefined rather than throwing an untyped RangeError out of readUInt32LE, regardless of how
    // such a buffer arises. This mirrors the sibling extractFixed32Field's length guard and removes the crash vector.
    assert.equal(extractEntityKey({ 1: [Buffer.alloc(0)] }, 1), undefined, "zero-length buffer is not a valid fixed32 key - returns undefined");
    assert.equal(extractEntityKey({ 1: [Buffer.alloc(2)] }, 1), undefined, "2-byte buffer is not a valid fixed32 key - returns undefined");
    assert.equal(extractEntityKey({ 1: [Buffer.alloc(8)] }, 1), undefined, "8-byte buffer (wrong width) is not a valid fixed32 key - returns undefined");
  });
});

describe("extractFixed32Field", () => {

  test("returns undefined for a missing field", () => {

    assert.equal(extractFixed32Field({}, 1), undefined);
  });

  test("reads a 4-byte little-endian uint32", () => {

    const buf = Buffer.alloc(4);

    buf.writeUInt32LE(12345, 0);

    assert.equal(extractFixed32Field({ 1: [buf] }, 1), 12345);
  });

  test("returns undefined when the buffer is not exactly 4 bytes", () => {

    assert.equal(extractFixed32Field({ 1: [Buffer.alloc(2)] }, 1), undefined, "wrong-width buffer must not parse");
    assert.equal(extractFixed32Field({ 1: [Buffer.alloc(8)] }, 1), undefined, "8-byte buffer (FIXED64) must not parse as FIXED32");
  });

  test("returns undefined when the field is a number rather than a Buffer", () => {

    assert.equal(extractFixed32Field({ 1: [42] }, 1), undefined, "FIXED32 reader requires a Buffer; varint number must not parse");
  });
});

describe("extractStringField", () => {

  test("returns undefined for a missing field", () => {

    assert.equal(extractStringField({}, 1), undefined);
  });

  test("decodes UTF-8 from a Buffer", () => {

    assert.equal(extractStringField({ 1: [Buffer.from("hello", "utf8")] }, 1), "hello");
  });

  test("returns undefined when the field is a number rather than a Buffer", () => {

    assert.equal(extractStringField({ 1: [42] }, 1), undefined, "string reader requires a Buffer; numeric input must not parse");
  });

  test("decodes the empty string from a zero-length Buffer", () => {

    assert.equal(extractStringField({ 1: [Buffer.alloc(0)] }, 1), "");
  });
});

describe("extractNumberField", () => {

  test("returns undefined for a missing field", () => {

    assert.equal(extractNumberField({}, 1), undefined);
  });

  test("returns the numeric value when the field is a number", () => {

    assert.equal(extractNumberField({ 1: [42] }, 1), 42);
  });

  test("returns undefined when the field is a Buffer rather than a number", () => {

    assert.equal(extractNumberField({ 1: [Buffer.alloc(4)] }, 1), undefined, "number reader does not parse Buffer fields");
  });

  test("returns 0 (a falsy value) without coercing it to undefined", () => {

    assert.equal(extractNumberField({ 1: [0] }, 1), 0, "0 is a valid varint result and must NOT be returned as undefined");
  });
});

describe("extractRepeatedServiceMap", () => {

  // Build a HomeassistantServiceMap nested-message buffer for { key, value } via the encoder so the test exercises real wire bytes.
  function buildEntry(key: string, value: string): Buffer {

    // Tag for field 1 + LENGTH_DELIMITED = 0x0a, then length, then bytes for key. Same for field 2.
    const keyBuf = Buffer.from(key, "utf8");
    const valBuf = Buffer.from(value, "utf8");

    return Buffer.concat([

      Buffer.from([ 0x0a, keyBuf.length ]), keyBuf,
      Buffer.from([ 0x12, valBuf.length ]), valBuf
    ]);
  }

  test("returns an empty record for a missing field", () => {

    assert.deepEqual(extractRepeatedServiceMap({}, 1, (b) => decodeProtobuf(b, { maxFieldsPerMessage: 100 })), {});
  });

  test("flattens repeated nested entries into a Record", () => {

    const fields = { 1: [ buildEntry("a", "1"), buildEntry("b", "2") ] };
    const result = extractRepeatedServiceMap(fields, 1, (b) => decodeProtobuf(b, { maxFieldsPerMessage: 100 }));

    assert.deepEqual(result, { a: "1", b: "2" });
  });

  test("skips entries with a missing key or value", () => {

    // Build an entry with only a value (field 2) - the helper must skip it because the key is missing.
    const onlyValue = Buffer.from([ 0x12, 0x01, 0x76 ]);
    const result = extractRepeatedServiceMap({ 1: [ onlyValue, buildEntry("ok", "yes") ] }, 1, (b) => decodeProtobuf(b, { maxFieldsPerMessage: 100 }));

    assert.deepEqual(result, { ok: "yes" }, "entries with a missing key are skipped silently");
  });

  test("returns an empty record when the field is not an array (defensive against malformed input)", () => {

    // A non-Buffer entry inside the repeated array (a bare number here) is skipped rather than passed to the decoder, leaving an empty result.
    const malformed = { 1: [42] };
    const result = extractRepeatedServiceMap(malformed, 1, (b) => decodeProtobuf(b, { maxFieldsPerMessage: 100 }));

    assert.deepEqual(result, {}, "non-Buffer entries inside the repeated array are skipped");
  });
});

describe("extractTelemetryValue", () => {

  test("returns undefined for a missing field", () => {

    assert.equal(extractTelemetryValue({}, 1), undefined);
  });

  test("decodes a 4-byte buffer as a little-endian float32", () => {

    const buf = Buffer.alloc(4);

    buf.writeFloatLE(1.5, 0);

    assert.equal(extractTelemetryValue({ 1: [buf] }, 1), 1.5);
  });

  test("decodes a non-4-byte buffer as a UTF-8 string", () => {

    assert.equal(extractTelemetryValue({ 1: [Buffer.from("status", "utf8")] }, 1), "status");
  });

  test("returns the numeric value verbatim when the field is a varint number", () => {

    assert.equal(extractTelemetryValue({ 1: [42] }, 1), 42);
  });
});
