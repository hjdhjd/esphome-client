/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * discovery.test.ts: Unit tests for the pure discovery decoders.
 */
import {
  decodeEntityFromSchema, decodeServiceEntity, extractFieldBySpec, extractRepeatedField,
  getEntityTypeLabel
} from "./discovery.ts";
import { decodeProtobuf, encodeProtoFields, zigzagEncode } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { ConfigurationError } from "./errors.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EspHomeLogging } from "./types.ts";
import { MessageType } from "./protocol/index.ts";
import { ServiceArgType } from "./types.ts";
import { WireType } from "./protocol/index.ts";
import assert from "node:assert/strict";

const silentLog = (): EspHomeLogging => ({

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info:  (): void => { /* discard */ },
  warn:  (): void => { /* discard */ }
});

const recordingLog = (): EspHomeLogging & { warned: string[] } => {

  const warned: string[] = [];

  return {

    debug: (): void => { /* discard */ },
    error: (): void => { /* discard */ },
    info:  (): void => { /* discard */ },
    warn:  (msg: string): void => { warned.push(msg); },
    warned
  };
};

type DecodedFields = Record<number, ReturnType<typeof decodeProtobuf>[number]>;

const decodeWith = (buffer: Buffer): DecodedFields => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* discard */ } });

describe("getEntityTypeLabel", () => {

  test("strips LIST_ENTITIES_ prefix and _RESPONSE suffix and lower-cases", () => {

    assert.equal(getEntityTypeLabel(MessageType.LIST_ENTITIES_LIGHT_RESPONSE), "light");
    assert.equal(getEntityTypeLabel(MessageType.LIST_ENTITIES_SWITCH_RESPONSE), "switch");
    assert.equal(getEntityTypeLabel(MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE), "binary_sensor");
  });

  test("strips _STATE suffix on state-response message types", () => {

    assert.equal(getEntityTypeLabel(MessageType.LIGHT_STATE_RESPONSE), "light");
    assert.equal(getEntityTypeLabel(MessageType.BINARY_SENSOR_STATE_RESPONSE), "binary_sensor");
  });
});

describe("extractFieldBySpec", () => {

  test("dispatches floats to the float-shaped extractor", () => {

    const valBuf = Buffer.alloc(4);

    valBuf.writeFloatLE(1.5, 0);

    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: valBuf, wireType: WireType.FIXED32 }]));
    const result = extractFieldBySpec(fields, { fieldNumber: 1, valueType: "float", wireType: WireType.FIXED32 });

    assert.equal(result, 1.5);
  });

  test("dispatches strings to the string extractor", () => {

    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: Buffer.from("hello", "utf8"), wireType: WireType.LENGTH_DELIMITED }]));
    const result = extractFieldBySpec(fields, { fieldNumber: 1, valueType: "string", wireType: WireType.LENGTH_DELIMITED });

    assert.equal(result, "hello");
  });

  test("dispatches enum/varint to the number extractor and bool to the boolean-coercion path", () => {

    // The extractor's contract: each valueType is coerced to its canonical TypeScript type declared by `WireFieldOutput<F>`. The raw varint variants (enum/varint)
    // return the raw integer. The bool path coerces 0/1 to `boolean` so consumers see the same type at runtime as the schema-derived public types declare.
    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: 42, wireType: WireType.VARINT }]));

    assert.equal(extractFieldBySpec(fields, { fieldNumber: 1, valueType: "enum", wireType: WireType.VARINT }), 42);
    assert.equal(extractFieldBySpec(fields, { fieldNumber: 1, valueType: "varint", wireType: WireType.VARINT }), 42);

    // bool returns true for any nonzero wire value, false for zero, undefined for absent. 42 (nonzero) coerces to true.
    assert.equal(extractFieldBySpec(fields, { fieldNumber: 1, valueType: "bool", wireType: WireType.VARINT }), true);

    const zeroFields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: 0, wireType: WireType.VARINT }]));

    assert.equal(extractFieldBySpec(zeroFields, { fieldNumber: 1, valueType: "bool", wireType: WireType.VARINT }), false);

    const absentFields = decodeWith(Buffer.alloc(0));

    assert.equal(extractFieldBySpec(absentFields, { fieldNumber: 99, valueType: "bool", wireType: WireType.VARINT }), undefined);
  });

  test("dispatches a scalar sint32 field through the zigzag decoder so negative values round-trip", () => {

    // A scalar sint32 field is a signed number on the wire encoded as a zigzag varint. The decoder must apply zigzagDecode rather than returning the raw varint, or
    // negative values would surface as large positive integers. We encode the zigzag wire form of a negative value and assert the original signed value comes back.
    const negativeWire = zigzagEncode(-3);
    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: negativeWire, wireType: WireType.VARINT }]));

    assert.equal(extractFieldBySpec(fields, { fieldNumber: 1, valueType: "sint32", wireType: WireType.VARINT }), -3);

    // A positive value round-trips too; the zigzag mapping for 7 is the wire value 14, which must decode back to 7.
    const positiveWire = zigzagEncode(7);
    const positiveFields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: positiveWire, wireType: WireType.VARINT }]));

    assert.equal(extractFieldBySpec(positiveFields, { fieldNumber: 1, valueType: "sint32", wireType: WireType.VARINT }), 7);
  });

  test("dispatches fixed32 (non-float) to the fixed32 extractor", () => {

    const valBuf = Buffer.alloc(4);

    valBuf.writeUInt32LE(0xDEADBEEF, 0);

    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: valBuf, wireType: WireType.FIXED32 }]));
    const result = extractFieldBySpec(fields, { fieldNumber: 1, valueType: "fixed32", wireType: WireType.FIXED32 });

    assert.equal(result, 0xDEADBEEF);
  });

  test("returns undefined when the field is absent", () => {

    const fields = decodeWith(Buffer.alloc(0));
    const result = extractFieldBySpec(fields, { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT });

    assert.equal(result, undefined);
  });
});

describe("extractRepeatedField", () => {

  test("returns each repeated string", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 5, value: Buffer.from("a", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 5, value: Buffer.from("b", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 5, value: Buffer.from("c", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const result = extractRepeatedField(fields, { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED });

    assert.deepEqual(result, [ "a", "b", "c" ]);
  });

  test("returns each repeated number", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 5, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 5, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 5, value: 3, wireType: WireType.VARINT }
    ]));

    const result = extractRepeatedField(fields, { fieldNumber: 5, valueType: "varint", wireType: WireType.VARINT });

    assert.deepEqual(result, [ 1, 2, 3 ]);
  });

  test("returns undefined when the field is absent", () => {

    const result = extractRepeatedField(decodeWith(Buffer.alloc(0)), { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT });

    assert.equal(result, undefined);
  });

  test("returns undefined when typed values produce zero results (e.g. all values are wrong shape)", () => {

    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 5, value: 1, wireType: WireType.VARINT }]));
    const result = extractRepeatedField(fields, { fieldNumber: 5, valueType: "string", wireType: WireType.LENGTH_DELIMITED });

    assert.equal(result, undefined, "a varint cannot be coerced to a string; the helper drops it");
  });
});

describe("decodeEntityFromSchema", () => {

  // The light schema is a good fixture: it has the canonical key/objectId/name trio plus several scalar fields and repeated effects.
  const lightSchema = ENTITY_SCHEMAS.light;

  const buildLightPayload = (args: { key: number; name: string; objectId: string; deviceId?: number }): Buffer => {

    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(args.key, 0);

    const fields = [
      { fieldNumber: lightSchema.listEntities.objectIdFieldNumber, value: Buffer.from(args.objectId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from(args.name, "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ];

    if(args.deviceId !== undefined) {

      // TypeScript infers the array's element type from the three fixed-shape entries above, each of which carries `value: Buffer`, so a
      // fourth entry whose value is a number falls outside that inferred union. The cast below is the escape hatch that lets this
      // differently-shaped push through without widening the array's declared element type.
      fields.push({ fieldNumber: lightSchema.listEntities.deviceIdFieldNumber, value: args.deviceId, wireType: WireType.VARINT } as never);
    }

    return encodeProtoFields(fields);
  };

  test("decodes a light entity with the canonical key/name/objectId trio", () => {

    const fields = decodeWith(buildLightPayload({ key: 42, name: "Lamp", objectId: "lamp" }));
    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log: silentLog(), schema: lightSchema });

    assert.ok(entity);
    assert.equal(entity.key, 42);
    assert.equal(entity.name, "Lamp");
    assert.equal(entity.objectId, "lamp");
    assert.equal(entity.type, "light");
  });

  test("derives objectId from name when the wire field is absent (ESPHome API 1.14+ shape)", () => {

    // ESPHome API 1.14 stops sending object_id over the wire because the value is always derivable from name as `sanitize(snake_case(name))`. The discovery decoder
    // must produce the same canonical id whether or not the wire carries the field, so the rest of the client (registry indexes, branded-id minting, latest-state
    // cache) sees a single consistent value.
    const log = recordingLog();
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from("Living Room Lamp", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log, schema: lightSchema });

    assert.ok(entity);
    assert.equal(entity.objectId, "living_room_lamp");
    assert.equal(log.warned.length, 0, "absence of wire object_id is not a warn case");
  });

  test("wire object_id wins over derivation when present (ESPHome 1.13- shape)", () => {

    // Pre-1.14 firmware sends object_id on the wire. We trust the wire value rather than re-derive, on the off-chance any firmware ever produces a non-derivable id.
    // For all standard ESPHome firmware the wire value and the derived value agree byte-for-byte.
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.objectIdFieldNumber, value: Buffer.from("custom_id", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from("Living Room Lamp", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log: silentLog(), schema: lightSchema });

    assert.ok(entity);
    assert.equal(entity.objectId, "custom_id");
  });

  test("returns undefined and logs a warn when name is absent", () => {

    // name is required - the decoder cannot produce a usable Entity without it. (key is also required; tested separately below.)
    const log = recordingLog();
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log, schema: lightSchema });

    assert.equal(entity, undefined);
    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /missing required field\(s\): name/);
  });

  test("returns undefined and logs a warn when name is an empty string (wire-present but functionally missing)", () => {

    // Empty-string names are wire-present but functionally equivalent to missing - both would mint an invalid entity id like "light-" that breaks every downstream
    // lookup. The defensive guard treats the two cases identically so the failure surfaces at decode time rather than as an opaque empty-id collision later.
    const log = recordingLog();
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from("", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log, schema: lightSchema });

    assert.equal(entity, undefined);
    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /name \(empty\)/);
  });

  test("returns undefined and logs a warn when name is whitespace-only (treated as empty)", () => {

    const log = recordingLog();
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from("   ", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log, schema: lightSchema });

    assert.equal(entity, undefined);
    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /name \(empty\)/);
  });

  test("returns undefined and logs a warn when key is absent", () => {

    const log = recordingLog();
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.listEntities.nameFieldNumber, value: Buffer.from("Lamp", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log, schema: lightSchema });

    assert.equal(entity, undefined);
    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /missing required field\(s\): key/);
  });

  test("includes deviceId when present on the wire", () => {

    const fields = decodeWith(buildLightPayload({ deviceId: 7, key: 1, name: "X", objectId: "x" }));
    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log: silentLog(), schema: lightSchema });

    assert.ok(entity);
    assert.equal((entity as { deviceId?: number }).deviceId, 7);
  });

  test("omits deviceId when absent on the wire", () => {

    const fields = decodeWith(buildLightPayload({ key: 1, name: "X", objectId: "x" }));
    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "light", fields, log: silentLog(), schema: lightSchema });

    assert.ok(entity);
    assert.equal((entity as { deviceId?: number }).deviceId, undefined);
  });

  test("decodes the climate temperatureUnit field added in ESPHome API 1.14 (field 28)", () => {

    const climateSchema = ENTITY_SCHEMAS.climate;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: climateSchema.listEntities.objectIdFieldNumber, value: Buffer.from("hvac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: climateSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: climateSchema.listEntities.nameFieldNumber, value: Buffer.from("HVAC", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      // TemperatureUnit.FAHRENHEIT = 1 on the wire; the schema declares this field as a raw enum and the decoder surfaces it as a number, matching the existing
      // convention for listEntities enum fields (entityCategory, supportedFanModes, etc.). Consumers narrow via the TemperatureUnit constant.
      { fieldNumber: 28, value: 1, wireType: WireType.VARINT }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "climate", fields, log: silentLog(), schema: climateSchema });

    assert.ok(entity);
    assert.equal((entity as { temperatureUnit?: number }).temperatureUnit, 1);
  });

  test("omits temperatureUnit on climate discovery when the device runs pre-1.14 firmware (field 28 absent)", () => {

    const climateSchema = ENTITY_SCHEMAS.climate;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: climateSchema.listEntities.objectIdFieldNumber, value: Buffer.from("hvac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: climateSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: climateSchema.listEntities.nameFieldNumber, value: Buffer.from("HVAC", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "climate", fields, log: silentLog(), schema: climateSchema });

    assert.ok(entity);
    assert.equal((entity as { temperatureUnit?: number }).temperatureUnit, undefined);
  });

  test("decodes the water_heater temperatureUnit field added in ESPHome API 1.14 (field 13)", () => {

    const waterHeaterSchema = ENTITY_SCHEMAS.water_heater;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(11, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: waterHeaterSchema.listEntities.objectIdFieldNumber, value: Buffer.from("tank", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: waterHeaterSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: waterHeaterSchema.listEntities.nameFieldNumber, value: Buffer.from("Tank", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 13, value: 2, wireType: WireType.VARINT }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "water_heater", fields, log: silentLog(), schema: waterHeaterSchema });

    assert.ok(entity);
    assert.equal((entity as { temperatureUnit?: number }).temperatureUnit, 2);
  });

  test("decodes climate feature_flags into named booleans (1.14+ firmware path via packedBitsFields)", () => {

    // 1.14+ firmware that emits feature_flags = (SUPPORTS_ACTION | SUPPORTS_CURRENT_TEMPERATURE | REQUIRES_TWO_POINT_TARGET_TEMPERATURE) = 32 | 1 | 4 = 37. The
    // decoder surfaces each named bit as a typed boolean on the entity, eliminating consumer-side magic-number bit math.
    const climateSchema = ENTITY_SCHEMAS.climate;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: climateSchema.listEntities.objectIdFieldNumber, value: Buffer.from("hvac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: climateSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: climateSchema.listEntities.nameFieldNumber, value: Buffer.from("HVAC", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 27, value: 37, wireType: WireType.VARINT }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "climate", fields, log: silentLog(), schema: climateSchema });

    assert.ok(entity);

    const e = entity as {
      featureFlags?: number;
      requiresTwoPointTargetTemperature?: boolean;
      supportsAction?: boolean;
      supportsCurrentHumidity?: boolean;
      supportsCurrentTemperature?: boolean;
      supportsTargetHumidity?: boolean;
      supportsTwoPointTargetTemperature?: boolean;
    };

    assert.equal(e.supportsCurrentTemperature, true, "bit 0 set in feature_flags");
    assert.equal(e.supportsTwoPointTargetTemperature, false, "bit 1 clear");
    assert.equal(e.requiresTwoPointTargetTemperature, true, "bit 2 set");
    assert.equal(e.supportsCurrentHumidity, false, "bit 3 clear");
    assert.equal(e.supportsTargetHumidity, false, "bit 4 clear");
    assert.equal(e.supportsAction, true, "bit 5 set");
    assert.equal(e.featureFlags, undefined, "raw featureFlags is no longer surfaced - named booleans replace it");
  });

  test("decodes climate per-capability boolean fields when feature_flags is absent (pre-1.14 firmware fallback)", () => {

    // Pre-1.14 firmware emits the deprecated booleans (proto fields 5, 6, 12, 22, 23) and does not emit feature_flags (field 27). The scalar fields decoder writes
    // values from those booleans; the packedBitsFields decoder finds no field 27 on the wire and skips, leaving the boolean values intact.
    const climateSchema = ENTITY_SCHEMAS.climate;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: climateSchema.listEntities.objectIdFieldNumber, value: Buffer.from("hvac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: climateSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: climateSchema.listEntities.nameFieldNumber, value: Buffer.from("HVAC", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 12, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 5, value: 1, wireType: WireType.VARINT }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "climate", fields, log: silentLog(), schema: climateSchema });

    assert.ok(entity);

    const e = entity as { supportsAction?: boolean; supportsCurrentTemperature?: boolean; supportsTwoPointTargetTemperature?: boolean };

    assert.equal(e.supportsAction, true);
    assert.equal(e.supportsCurrentTemperature, true);
    assert.equal(e.supportsTwoPointTargetTemperature, undefined, "no scalar boolean on the wire, no packed bit on the wire, so the key is absent");
  });

  test("1.14+ feature_flags overwrites pre-1.14 boolean values when both arrive on the wire", () => {

    // ESPHome's back-compat path sends BOTH the deprecated booleans and the new feature_flags. The packed-bits decoder runs after the scalar fields decoder, so the
    // packed values win. This test pins the "newer wins" semantics by sending feature_flags=0 alongside supportsAction=true - the result should be false because the
    // packed source (0) overrides the boolean fallback (true).
    const climateSchema = ENTITY_SCHEMAS.climate;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: climateSchema.listEntities.objectIdFieldNumber, value: Buffer.from("hvac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: climateSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: climateSchema.listEntities.nameFieldNumber, value: Buffer.from("HVAC", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 12, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 27, value: 0, wireType: WireType.VARINT }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "climate", fields, log: silentLog(), schema: climateSchema });

    assert.ok(entity);
    assert.equal((entity as { supportsAction?: boolean }).supportsAction, false, "feature_flags=0 overwrites supportsAction=true from the deprecated boolean");
  });

  test("decodes media_player supportedFormats as an array of structured records (repeatedMessageFields)", () => {

    const mediaPlayerSchema = ENTITY_SCHEMAS.media_player;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(99, 0);

    // Each MediaPlayerSupportedFormat carries (format, sampleRate, numChannels, purpose, sampleBytes). Encode two sub-message instances at the outer
    // repeatedMessageFields wire field number (9) and verify the decoder surfaces them as an array of structured records, with the `purpose` field surfacing as a
    // raw number that the schema-derived consumer-facing type narrows via MediaPlayerFormatPurpose.
    const fmt1 = encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("wav", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 48000, wireType: WireType.VARINT },
      { fieldNumber: 3, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 4, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 5, value: 2, wireType: WireType.VARINT }
    ]);
    const fmt2 = encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("flac", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 16000, wireType: WireType.VARINT },
      { fieldNumber: 3, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 4, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 5, value: 2, wireType: WireType.VARINT }
    ]);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: mediaPlayerSchema.listEntities.objectIdFieldNumber, value: Buffer.from("speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: mediaPlayerSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: mediaPlayerSchema.listEntities.nameFieldNumber, value: Buffer.from("Speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 9, value: fmt1, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 9, value: fmt2, wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "media_player", fields, log: silentLog(), schema: mediaPlayerSchema });

    assert.ok(entity);

    const supportedFormats = (entity as { supportedFormats?: Record<string, unknown>[] }).supportedFormats;

    assert.ok(Array.isArray(supportedFormats));
    assert.equal(supportedFormats.length, 2);
    assert.deepEqual(supportedFormats[0], { format: "wav", numChannels: 2, purpose: 0, sampleBytes: 2, sampleRate: 48000 });
    assert.deepEqual(supportedFormats[1], { format: "flac", numChannels: 1, purpose: 1, sampleBytes: 2, sampleRate: 16000 });
  });

  test("omits supportedFormats on media_player discovery when the device reports no formats", () => {

    const mediaPlayerSchema = ENTITY_SCHEMAS.media_player;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(100, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: mediaPlayerSchema.listEntities.objectIdFieldNumber, value: Buffer.from("speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: mediaPlayerSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: mediaPlayerSchema.listEntities.nameFieldNumber, value: Buffer.from("Speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ decodeNested: decodeWith, entityType: "media_player", fields, log: silentLog(), schema: mediaPlayerSchema });

    assert.ok(entity);
    assert.equal((entity as { supportedFormats?: unknown[] }).supportedFormats, undefined);
  });

  test("throws ConfigurationError when the schema declares repeatedMessageFields but no decodeNested callback is supplied", () => {

    // The runtime guard surfaces a schema/host wiring mismatch as a typed error rather than silently dropping the repeated-message field. Callers that fail to wire
    // the nested decoder need a loud failure, not a quiet omission of structured sub-message data the schema promised to decode.
    const mediaPlayerSchema = ENTITY_SCHEMAS.media_player;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(101, 0);

    const fmt = encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("wav", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: mediaPlayerSchema.listEntities.objectIdFieldNumber, value: Buffer.from("speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: mediaPlayerSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: mediaPlayerSchema.listEntities.nameFieldNumber, value: Buffer.from("Speaker", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 9, value: fmt, wireType: WireType.LENGTH_DELIMITED }
    ]));

    assert.throws(
      () => decodeEntityFromSchema({ entityType: "media_player", fields, log: silentLog(), schema: mediaPlayerSchema }),
      (err: unknown) => (err instanceof ConfigurationError) && (err as Error).message.includes("declares repeatedMessageFields")
    );
  });

  test("schemas without repeatedMessageFields decode without a decodeNested callback (optional path)", () => {

    // Decoding a switch entity (no repeatedMessageFields) without the callback is the canonical optional path. The guard fires only when the schema declares the
    // slot - everything else stays cleanly callable with the minimum-required options.
    const switchSchema = ENTITY_SCHEMAS.switch;
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(7, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: switchSchema.listEntities.objectIdFieldNumber, value: Buffer.from("relay", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: switchSchema.listEntities.keyFieldNumber, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: switchSchema.listEntities.nameFieldNumber, value: Buffer.from("Relay", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const entity = decodeEntityFromSchema({ entityType: "switch", fields, log: silentLog(), schema: switchSchema });

    assert.ok(entity);
    assert.equal(entity.name, "Relay");
  });
});

describe("decodeServiceEntity", () => {

  test("decodes the canonical (name, key, args[]) shape", () => {

    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(123, 0);

    const argPayload = encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("brightness", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: ServiceArgType.INT, wireType: WireType.VARINT }
    ]);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("set_brightness", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: 3, value: argPayload, wireType: WireType.LENGTH_DELIMITED }
    ]));

    const service = decodeServiceEntity({ decodeNested: decodeWith, fields, log: silentLog() });

    assert.ok(service);
    assert.equal(service.name, "set_brightness");
    assert.equal(service.key, 123);
    assert.equal(service.args.length, 1);
    assert.equal(service.args[0]!.name, "brightness");
    assert.equal(service.args[0]!.type, ServiceArgType.INT);
  });

  test("returns undefined and warns when the service name is missing", () => {

    const log = recordingLog();
    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(1, 0);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 2, value: keyBuf, wireType: WireType.FIXED32 }
    ]));

    const service = decodeServiceEntity({ decodeNested: decodeWith, fields, log });

    assert.equal(service, undefined);
    assert.match(log.warned[0]!, /without a name/);
  });

  test("returns undefined and warns when the service key is missing", () => {

    const log = recordingLog();
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("svc", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const service = decodeServiceEntity({ decodeNested: decodeWith, fields, log });

    assert.equal(service, undefined);
    assert.match(log.warned[0]!, /without a key/);
  });

  test("skips malformed argument entries that lack name or type", () => {

    const keyBuf = Buffer.alloc(4);

    keyBuf.writeUInt32LE(99, 0);

    const goodArg = encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("good", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: ServiceArgType.STRING, wireType: WireType.VARINT }
    ]);
    const badArg = encodeProtoFields([
      // Missing name; the helper should skip this entry.
      { fieldNumber: 2, value: ServiceArgType.STRING, wireType: WireType.VARINT }
    ]);

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 1, value: Buffer.from("svc", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: keyBuf, wireType: WireType.FIXED32 },
      { fieldNumber: 3, value: goodArg, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: badArg, wireType: WireType.LENGTH_DELIMITED }
    ]));

    const service = decodeServiceEntity({ decodeNested: decodeWith, fields, log: silentLog() });

    assert.ok(service);
    assert.equal(service.args.length, 1);
    assert.equal(service.args[0]!.name, "good");
  });
});
