/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * sub-device.test.ts: Type-level tests for the SubDevice descriptor.
 */
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { FieldValue } from "./protocol/codec.ts";
import type { ProtoField } from "./protocol/codec.ts";
import type { SubDevice } from "./sub-device.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";
import { extractSubDevices } from "./sub-device.ts";

// Build a sub-device nested message: field 1 device_id (varint), field 2 name (string), field 3 area_id (varint).
function buildSubDeviceEntry(id: number, name?: string, areaId?: number): Buffer {

  const fields: ProtoField[] = [{ fieldNumber: 1, value: id, wireType: WireType.VARINT }];

  if(name !== undefined) {

    fields.push({ fieldNumber: 2, value: Buffer.from(name, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  if(areaId !== undefined) {

    fields.push({ fieldNumber: 3, value: areaId, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

const decode = (buffer: Buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 100 });

describe("SubDevice type", () => {

  test("accepts the minimum required shape (id only)", () => {

    const minimal: SubDevice = { id: 1 };

    assert.equal(minimal.id, 1);
    assert.equal(minimal.name, undefined);
    assert.equal(minimal.areaId, undefined);
  });

  test("accepts the full shape with name and areaId", () => {

    const full: SubDevice = { areaId: 42, id: 1, name: "Kitchen Module" };

    assert.equal(full.id, 1);
    assert.equal(full.name, "Kitchen Module");
    assert.equal(full.areaId, 42);
  });

  test("type is structurally compatible with object-literal construction inline", () => {

    // No assertion needed; this is a compile-time check that the type allows direct construction. If any field becomes required without changing this test, the
    // declaration below would fail typecheck.
    const arr: readonly SubDevice[] = [ { id: 1 }, { areaId: 0, id: 2, name: "two" } ];

    assert.equal(arr.length, 2);
  });
});

describe("extractSubDevices", () => {

  test("returns an empty array when the field is absent", () => {

    assert.deepEqual(extractSubDevices({}, 20, decode), []);
  });

  test("returns an empty array when the field is not an array", () => {

    // Defensive: malformed input where the field is an array whose single entry is a non-Buffer number, exercising the per-entry Buffer.isBuffer skip rather than
    // the not-an-array guard.
    assert.deepEqual(extractSubDevices({ 20: [42] }, 20, decode), [], "non-Buffer entries are skipped");
  });

  test("decodes a single sub-device with id only", () => {

    const result = extractSubDevices({ 20: [buildSubDeviceEntry(5)] }, 20, decode);

    assert.deepEqual(result, [{ id: 5 }]);
  });

  test("decodes a sub-device with id and name", () => {

    const result = extractSubDevices({ 20: [buildSubDeviceEntry(7, "Garage")] }, 20, decode);

    assert.deepEqual(result, [{ id: 7, name: "Garage" }]);
  });

  test("decodes a sub-device with id, name, and areaId", () => {

    const result = extractSubDevices({ 20: [buildSubDeviceEntry(3, "Kitchen", 12)] }, 20, decode);

    assert.deepEqual(result, [{ areaId: 12, id: 3, name: "Kitchen" }]);
  });

  test("decodes multiple entries in declared order", () => {

    const fields = { 20: [ buildSubDeviceEntry(1, "a"), buildSubDeviceEntry(2, "b"), buildSubDeviceEntry(3, "c") ] };
    const result = extractSubDevices(fields, 20, decode);

    assert.deepEqual(result.map((d) => d.id), [ 1, 2, 3 ], "preserves declared order");
  });

  test("skips entries with id 0 - the parent device is not enumerated as a sub-device", () => {

    const fields = { 20: [ buildSubDeviceEntry(0, "parent"), buildSubDeviceEntry(5, "child") ] };
    const result = extractSubDevices(fields, 20, decode);

    assert.deepEqual(result, [{ id: 5, name: "child" }], "id 0 is the parent and must not appear");
  });

  test("skips entries without an id field", () => {

    // Build a malformed entry with only a name (field 2) - no field 1 (id). The helper must skip it.
    const malformed = encodeProtoFields([{ fieldNumber: 2, value: Buffer.from("nameless", "utf8"), wireType: WireType.LENGTH_DELIMITED }]);
    const result = extractSubDevices({ 20: [malformed] }, 20, decode);

    assert.deepEqual(result, []);
  });

  test("omits the name field from the result when absent on the wire (exactOptionalPropertyTypes contract)", () => {

    const result = extractSubDevices({ 20: [buildSubDeviceEntry(1)] }, 20, decode);

    assert.equal(("name" in result[0]!), false, "absent on the wire -> omitted from the record (not set to undefined)");
  });
});
