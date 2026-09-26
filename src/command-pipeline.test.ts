/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-pipeline.test.ts: Unit tests for the schema-driven command encoder.
 */
import type { EntitySchema, FieldSpec } from "./schemas/index.ts";
import { MessageType, WireType } from "./protocol/index.ts";
import { buildKeyField, encodeEntityCommand, encodeFieldValue, isValueInRange, reportUnrecognizedOptions } from "./command-pipeline.ts";
import { decodeProtobuf, zigzagDecode } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EncodeResult } from "./command-pipeline.ts";
import type { EspHomeLogging } from "./types.ts";
import assert from "node:assert/strict";
import { entityId } from "./entity-id.ts";

// Default schema resolver wired to ENTITY_SCHEMAS. Tests that need extras-aware resolution build their own; tests of the canonical encode path consume this one.
const defaultResolveSchema = (entityType: string): EntitySchema | undefined => (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType];

type DecodedFields = Record<number, ReturnType<typeof decodeProtobuf>[number]>;

const decodeWith = (buffer: Buffer): DecodedFields => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* discard */ } });

const recordingLog = (): EspHomeLogging & { debugged: string[] } => {

  const debugged: string[] = [];

  return {

    debug: (msg: string): void => { debugged.push(msg); },
    debugged,
    error: (): void => { /* discard */ },
    info:  (): void => { /* discard */ },
    warn:  (): void => { /* discard */ }
  };
};

describe("buildKeyField", () => {

  test("returns a fixed32 ProtoField with field number 1", () => {

    const field = buildKeyField(0x1234);

    assert.equal(field.fieldNumber, 1);
    assert.equal(field.wireType, WireType.FIXED32);
    assert.equal(field.value, 0x1234);
  });
});

describe("encodeFieldValue", () => {

  const spec = (valueType: FieldSpec["valueType"]): FieldSpec => ({ fieldNumber: 1, valueType, wireType: WireType.VARINT });

  test("bool true encodes to 1", () => {

    assert.equal(encodeFieldValue(true, spec("bool")), 1);
  });

  test("bool false encodes to 0", () => {

    assert.equal(encodeFieldValue(false, spec("bool")), 0);
  });

  test("varint passes through as number", () => {

    assert.equal(encodeFieldValue(42, spec("varint")), 42);
  });

  test("enum passes through as number", () => {

    assert.equal(encodeFieldValue(7, spec("enum")), 7);
  });

  test("sint32 is zigzag-encoded so negative values map to compact unsigned wire values", () => {

    // A scalar sint32 field is a signed number; protobuf encodes it via zigzag so negative magnitudes stay compact. The encoder must apply zigzagEncode rather than
    // passing the raw signed number through (which would write a 10-byte two's-complement varint and decode wrong). zigzagEncode(-3) is 5 and zigzagEncode(7) is 14.
    assert.equal(encodeFieldValue(-3, spec("sint32")), 5);
    assert.equal(encodeFieldValue(7, spec("sint32")), 14);
  });

  test("sint32 round-trips a negative value through encode then decode", () => {

    // The full contract: a negative scalar sint32 value survives encode-then-decode unchanged. The encoder zigzag-encodes to the wire value, the decoder zigzag-decodes
    // it back, so the original signed number is recovered.
    const original = -12345;
    const wire = encodeFieldValue(original, spec("sint32"));

    assert.equal(typeof wire, "number");
    assert.equal(zigzagDecode(wire as number), original);
  });

  test("string encodes as a UTF-8 buffer", () => {

    const buf = encodeFieldValue("hello", spec("string"));

    assert.ok(Buffer.isBuffer(buf));
    assert.equal((buf).toString("utf8"), "hello");
  });

  test("float encodes as a 4-byte LE buffer", () => {

    const buf = encodeFieldValue(0.5, spec("float"));

    assert.ok(Buffer.isBuffer(buf));
    assert.equal((buf).length, 4);
    assert.ok(Math.abs((buf).readFloatLE(0) - 0.5) < 1e-6);
  });

  test("fixed32 encodes as a 4-byte LE uint32", () => {

    const buf = encodeFieldValue(0xCAFEBABE, spec("fixed32"));

    assert.ok(Buffer.isBuffer(buf));
    assert.equal((buf).readUInt32LE(0), 0xCAFEBABE);
  });
});

describe("isValueInRange", () => {

  test("fixed32 accepts a safe integer in the uint32 range and rejects negative, oversized, and non-integer values", () => {

    assert.equal(isValueInRange("fixed32", 0), true);
    assert.equal(isValueInRange("fixed32", 0xFFFFFFFF), true);
    assert.equal(isValueInRange("fixed32", -1), false);
    assert.equal(isValueInRange("fixed32", 0x100000000), false);
    assert.equal(isValueInRange("fixed32", 1.5), false);
  });

  test("varint and enum accept a safe integer in the uint32 range and reject negative, oversized, and non-integer values", () => {

    for(const valueType of [ "enum", "varint" ] as const) {

      assert.equal(isValueInRange(valueType, 0), true, valueType);
      assert.equal(isValueInRange(valueType, 0xFFFFFFFF), true, valueType);
      assert.equal(isValueInRange(valueType, -1), false, valueType);
      assert.equal(isValueInRange(valueType, 0x100000000), false, valueType);
      assert.equal(isValueInRange(valueType, 2.5), false, valueType);
    }
  });

  test("sint32 accepts a safe integer in the int32 range and rejects values below it, above it, or between integers", () => {

    assert.equal(isValueInRange("sint32", -0x80000000), true);
    assert.equal(isValueInRange("sint32", 0x7FFFFFFF), true);
    assert.equal(isValueInRange("sint32", -0x80000001), false);
    assert.equal(isValueInRange("sint32", 0x80000000), false);
    assert.equal(isValueInRange("sint32", -0.5), false);
  });

  test("sint32-packed accepts an array of int32 values and rejects an array holding one bad element or a value that is not an array", () => {

    assert.equal(isValueInRange("sint32-packed", [ 9000, -4500, 560, -560 ]), true);
    assert.equal(isValueInRange("sint32-packed", []), true);
    assert.equal(isValueInRange("sint32-packed", [ 9000, -4500.5, 560 ]), false);
    assert.equal(isValueInRange("sint32-packed", [ 9000, 0x80000000 ]), false);
    assert.equal(isValueInRange("sint32-packed", 9000), false);
  });

  test("an integer value type rejects a value that is not a finite number", () => {

    for(const value of [ "5", 5n, Number.NaN, Number.POSITIVE_INFINITY, null, true ]) {

      assert.equal(isValueInRange("varint", value), false, String(value));
    }
  });

  test("bool, float, and string values carry no integer domain and always pass", () => {

    assert.equal(isValueInRange("bool", true), true);
    assert.equal(isValueInRange("float", -1.5), true);
    assert.equal(isValueInRange("string", "any text"), true);
  });
});

describe("encodeEntityCommand", () => {

  const lightId = entityId("light", "lamp");
  const switchId = entityId("switch", "front_door");

  test("returns key_not_found when the host has not discovered the entity yet", () => {

    const result = encodeEntityCommand({ deviceId: undefined, id: lightId, key: undefined, options: { state: true }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);
    assert.equal((result).reason, "key_not_found");
  });

  test("returns schema_unknown for an unrecognized entity-type prefix", () => {

    // We bypass the brand by casting because the EntityId type would normally prevent unknown prefixes upstream.
    const fakeId = "unknownentity-foo" as ReturnType<typeof entityId<"light">>;
    const result = encodeEntityCommand({ deviceId: undefined, id: fakeId, key: 1, options: {}, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);
    assert.equal((result).reason, "schema_unknown");
  });

  test("returns schema_unknown for malformed (no dash) ids", () => {

    const malformed = "lightlamp" as ReturnType<typeof entityId<"light">>;
    const result = encodeEntityCommand({ deviceId: undefined, id: malformed, key: 1, options: {}, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);
    assert.equal((result).reason, "schema_unknown");
  });

  test("fails closed with enum_value_unknown for an unmapped enum alias instead of coercing to wire 0", () => {

    const climateId = entityId("climate", "thermostat");

    // A typo'd / runtime-derived / cast string for climate.mode. An unmapped enum alias must fail closed with enum_value_unknown rather than fall through the
    // enum-mapping substitution and be coerced to wire value 0 by encodeVarint - 0 is "off" for climate.mode, so coercion would silently command the device OFF.
    const result = encodeEntityCommand({ deviceId: undefined, id: climateId, key: 3, options: { mode: "freze" }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);

    if(!result.ok) {

      assert.equal(result.reason, "enum_value_unknown");
      assert.match(result.detail ?? "", /mode/);
      assert.match(result.detail ?? "", /freze/);
    }
  });

  test("refuses an out-of-range fixed32 value with value_out_of_range instead of throwing (datetime epochSeconds)", () => {

    // The fixed32 writer throws a RangeError outside the uint32 range, which would escape the fire-and-forget command path. The encoder returns the refusal instead.
    const datetimeId = entityId("datetime", "alarm");

    for(const epochSeconds of [ -1, 0x100000000 ]) {

      const result = encodeEntityCommand({ deviceId: undefined, id: datetimeId, key: 4, options: { epochSeconds }, resolveSchema: defaultResolveSchema });

      assert.equal(result.ok, false);

      if(!result.ok) {

        assert.equal(result.reason, "value_out_of_range");
        assert.equal(result.detail, "field 'epochSeconds' received out-of-range value '" + String(epochSeconds) + "'");
      }
    }
  });

  test("refuses a negative or non-integer varint value with value_out_of_range instead of wrapping it (date day)", () => {

    // The 32-bit varint encoder would wrap -1 to 0xFFFFFFFF and truncate 1.5 to 1, commanding a date the caller never asked for.
    const dateId = entityId("date", "birthday");

    for(const day of [ -1, 1.5 ]) {

      const result = encodeEntityCommand({ deviceId: undefined, id: dateId, key: 5, options: { day, month: 6, year: 2026 }, resolveSchema: defaultResolveSchema });

      assert.equal(result.ok, false);

      if(!result.ok) {

        assert.equal(result.reason, "value_out_of_range");
        assert.equal(result.detail, "field 'day' received out-of-range value '" + String(day) + "'");
      }
    }
  });

  test("refuses an out-of-range has-pattern value with value_out_of_range (fan speedLevel)", () => {

    const result = encodeEntityCommand({ deviceId: undefined, id: entityId("fan", "ceiling"), key: 6, options: { speedLevel: -2, state: true },
      resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);

    if(!result.ok) {

      assert.equal(result.reason, "value_out_of_range");
      assert.equal(result.detail, "field 'speedLevel' received out-of-range value '-2'");
    }
  });

  test("refuses an out-of-range bitmask value with value_out_of_range (water_heater mode passed as a raw number)", () => {

    // A numeric mode skips the enum-alias mapping, so the range check is the only guard between it and the wire.
    const result = encodeEntityCommand({ deviceId: undefined, id: entityId("water_heater", "tank"), key: 7, options: { mode: 2.5 },
      resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, false);

    if(!result.ok) {

      assert.equal(result.reason, "value_out_of_range");
      assert.equal(result.detail, "field 'mode' received out-of-range value '2.5'");
    }
  });

  test("refuses a packed sint32 array by naming its first offending element and that element's index (infrared timings)", () => {

    // A timings list can run to hundreds of entries, so the detail names the one element to correct rather than echoing the whole array. A value that is not an array
    // at all has no element to name and is quoted whole.
    const infraredId = entityId("infrared", "blaster");
    const cases: [ unknown, string ][] = [
      [ [ 9000, -4500.5, 560, 1.5 ], "field 'timings' received out-of-range value '-4500.5' at index 1" ],
      [ [ 9000, -4500, 0x80000000 ], "field 'timings' received out-of-range value '2147483648' at index 2" ],
      [ 9000, "field 'timings' received out-of-range value '9000'" ]
    ];

    for(const [ timings, detail ] of cases) {

      const result = encodeEntityCommand({ deviceId: undefined, id: infraredId, key: 8, options: { carrierFrequency: 38000, repeatCount: 1, timings },
        resolveSchema: defaultResolveSchema });

      assert.equal(result.ok, false);

      if(!result.ok) {

        assert.equal(result.reason, "value_out_of_range");
        assert.equal(result.detail, detail);
      }
    }
  });

  test("encodes a valid enum alias (climate mode 'heat') to its protocol number", () => {

    const climateId = entityId("climate", "thermostat");
    const result = encodeEntityCommand({ deviceId: undefined, id: climateId, key: 3, options: { mode: "heat" }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);
  });

  test("encodes a switch state=true command with the canonical key+state field set", () => {

    const result = encodeEntityCommand({ deviceId: undefined, id: switchId, key: 99, options: { state: true }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;

    assert.equal(success.value.messageType, MessageType.SWITCH_COMMAND_REQUEST);
    assert.equal(success.entityType, "switch");

    const decoded = decodeWith(success.value.payload);

    // Key field number 1 fixed32; state field number 2 varint = 1.
    const keyBuf = decoded[1]?.[0];

    assert.ok(Buffer.isBuffer(keyBuf));
    assert.equal((keyBuf).readUInt32LE(0), 99);
    assert.equal(decoded[2]?.[0], 1);
  });

  test("attaches device_id when both supplied and declared on the schema", () => {

    const result = encodeEntityCommand({ deviceId: 5, id: switchId, key: 1, options: { state: false }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;
    const decoded = decodeWith(success.value.payload);

    // SwitchCommandRequest declares device_id at field 3 per the schema.
    assert.equal(decoded[3]?.[0], 5);
  });

  test("omits device_id when not supplied even if the schema declares one", () => {

    const result = encodeEntityCommand({ deviceId: undefined, id: switchId, key: 1, options: { state: false }, resolveSchema: defaultResolveSchema });
    const success = result as Extract<EncodeResult, { ok: true }>;
    const decoded = decodeWith(success.value.payload);

    assert.equal(decoded[3], undefined);
  });

  test("returns processedKeys covering every option the encoder consumed", () => {

    const result = encodeEntityCommand({

      deviceId: undefined, id: switchId, key: 1, options: { state: true, unknownOption: "ignored" }, resolveSchema: defaultResolveSchema
    });
    const success = result as Extract<EncodeResult, { ok: true }>;

    assert.ok(success.processedKeys.has("state"));
    assert.equal(success.processedKeys.has("unknownOption"), false);
  });

  test("water_heater command with awayState+onState packs both bits in field 6 and OR-s both HAS_*_STATE bits into the has_fields carrier", () => {

    // The packedBitsFields engine collapses several behaviors into one declaration: named consumer booleans (awayState, onState) instead of magic-number bit math,
    // per-bit hasFieldBit contributions to the role's has-bitmask carrier, and independent set/clear for each named bit. Setting both to true: field 6 carries
    // bit0|bit1 = 3, field 2 carries HAS_AWAY_STATE|HAS_ON_STATE = 96.
    const waterHeaterId = entityId("water_heater", "tank");
    const result = encodeEntityCommand({ deviceId: undefined, id: waterHeaterId, key: 7, options: { awayState: true, onState: true },
      resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;
    const decoded = decodeWith(success.value.payload);

    assert.equal(success.value.messageType, MessageType.WATER_HEATER_COMMAND_REQUEST);
    assert.equal(decoded[6]?.[0], 3, "field 6 packs awayState (bit 0 = 1) | onState (bit 1 = 2) = 3");
    assert.equal(decoded[2]?.[0], 96, "has_fields carrier OR-s HAS_AWAY_STATE (64) | HAS_ON_STATE (32) = 96 when both bits are touched");
  });

  test("water_heater command with only onState=true clears bit 0 in field 6 and OR-s only HAS_ON_STATE into the has_fields carrier", () => {

    // Each named bit (awayState, onState) is independently settable: the encoder ORs only the touched bit's hasFieldBit into the carrier. The encoder must signal
    // "consumer touched onState alone" via HAS_ON_STATE (32) without asserting HAS_AWAY_STATE - the firmware then knows to read only bit 1 of the state field.
    const waterHeaterId = entityId("water_heater", "tank");
    const result = encodeEntityCommand({ deviceId: undefined, id: waterHeaterId, key: 7, options: { onState: true }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;
    const decoded = decodeWith(success.value.payload);

    assert.equal(decoded[6]?.[0], 2, "field 6 carries only bit 1 (onState = 2); bit 0 (awayState) is clear");
    assert.equal(decoded[2]?.[0], 32, "has_fields carrier OR-s only HAS_ON_STATE (32); HAS_AWAY_STATE is not signaled");
  });

  test("water_heater command with awayState=false (explicit clear) still emits field 6 and OR-s HAS_AWAY_STATE so the firmware sees the explicit clear", () => {

    // false-valued bits are a real signal, not omission: the consumer asks the firmware to clear the bit, and the firmware must know via HAS_AWAY_STATE that the
    // packed state field's bit 0 is meaningful (rather than incidentally zero because no one touched it).
    const waterHeaterId = entityId("water_heater", "tank");
    const result = encodeEntityCommand({ deviceId: undefined, id: waterHeaterId, key: 7, options: { awayState: false }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;
    const decoded = decodeWith(success.value.payload);

    assert.equal(decoded[6]?.[0], 0, "field 6 carries 0 (awayState=false clears bit 0; no other bits touched)");
    assert.equal(decoded[2]?.[0], 64, "has_fields carrier OR-s HAS_AWAY_STATE (64) to mark bit 0 of the packed field as meaningful");
  });

  test("water_heater command without state-bit options omits field 6 and contributes no bits to the has_fields carrier", () => {

    const waterHeaterId = entityId("water_heater", "tank");
    const result = encodeEntityCommand({ deviceId: undefined, id: waterHeaterId, key: 7, options: { targetTemperature: 60.0 }, resolveSchema: defaultResolveSchema });

    assert.equal(result.ok, true);

    const success = result;
    const decoded = decodeWith(success.value.payload);

    assert.equal(decoded[6], undefined, "field 6 absent when no packed bit is touched");
    assert.equal(decoded[2]?.[0], 2, "has_fields reflects only the targetTemperature bit (HAS_TARGET_TEMPERATURE) when no packed bit is touched");
  });
});

describe("reportUnrecognizedOptions", () => {

  test("emits a debug log line for every option not in the processed set", () => {

    const log = recordingLog();
    const processed = new Set(["state"]);

    reportUnrecognizedOptions({ entityType: "switch", log, options: { brightness: 0.5, foo: "bar", state: true }, processedKeys: processed });

    assert.equal(log.debugged.length, 2);
    assert.match(log.debugged[0]!, /unrecognized option 'brightness'/);
    assert.match(log.debugged[1]!, /unrecognized option 'foo'/);
  });

  test("emits zero log lines when every option was processed", () => {

    const log = recordingLog();
    const processed = new Set(["state"]);

    reportUnrecognizedOptions({ entityType: "switch", log, options: { state: true }, processedKeys: processed });

    assert.equal(log.debugged.length, 0);
  });
});
