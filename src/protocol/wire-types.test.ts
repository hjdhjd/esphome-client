/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * wire-types.test.ts: Unit tests for the WireType const-object and its derived literal-union type.
 */
import { describe, test } from "node:test";
import { WireType } from "./wire-types.ts";
import assert from "node:assert/strict";

describe("WireType", () => {

  test("VARINT is 0 - the wire-format value for varint-encoded fields", () => {

    assert.equal(WireType.VARINT, 0, "VARINT must be 0; this is the protobuf-spec value");
  });

  test("FIXED64 is 1 - the wire-format value for 8-byte fixed-width fields", () => {

    assert.equal(WireType.FIXED64, 1, "FIXED64 must be 1; this is the protobuf-spec value");
  });

  test("LENGTH_DELIMITED is 2 - the wire-format value for length-prefixed fields (strings, bytes, nested messages)", () => {

    assert.equal(WireType.LENGTH_DELIMITED, 2, "LENGTH_DELIMITED must be 2");
  });

  test("FIXED32 is 5 - the wire-format value for 4-byte fixed-width fields", () => {

    assert.equal(WireType.FIXED32, 5, "FIXED32 must be 5");
  });

  test("the four wire types use distinct values", () => {

    const values = new Set([ WireType.VARINT, WireType.FIXED64, WireType.LENGTH_DELIMITED, WireType.FIXED32 ]);

    assert.equal(values.size, 4, "all four declared wire types must be distinct");
  });

  test("does not declare additional unsupported wire types - the protobuf 3 and 4 (start/end group) are explicitly absent", () => {

    const declared = Object.values(WireType) as readonly number[];

    assert.equal(declared.includes(3), false, "WireType.START_GROUP (3) is deprecated in proto3 and is not declared");
    assert.equal(declared.includes(4), false, "WireType.END_GROUP (4) is deprecated in proto3 and is not declared");
  });
});
