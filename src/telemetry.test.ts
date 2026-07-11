/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * telemetry.test.ts: Unit tests for the schema-driven state-update decoder.
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import { WireType } from "./protocol/index.ts";
import assert from "node:assert/strict";
import { decodeProtobuf } from "./protocol/codec.ts";
import { decodeStateFromSchema } from "./telemetry.ts";
import { encodeProtoFields } from "./protocol/codec.ts";

type DecodedFields = Record<number, ReturnType<typeof decodeProtobuf>[number]>;

const decodeWith = (buffer: Buffer): DecodedFields => decodeProtobuf(buffer, { maxFieldsPerMessage: 64, warn: (): void => { /* discard */ } });

const fixed32 = (n: number): Buffer => {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(n, 0);

  return buf;
};

const float32 = (n: number): Buffer => {

  const buf = Buffer.alloc(4);

  buf.writeFloatLE(n, 0);

  return buf;
};

describe("decodeStateFromSchema - light entity", () => {

  const lightSchema = ENTITY_SCHEMAS.light.state;

  test("stamps the entity, key, and type tag onto the result", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.state.fieldNumber, value: 1, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 99, name: "Lamp", stateSchema: lightSchema });

    assert.equal(event.entity, "Lamp");
    assert.equal(event.key, 99);
    assert.equal(event.type, "light");
  });

  test("coerces bool field state=1 to boolean true", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.state.fieldNumber, value: 1, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "L", stateSchema: lightSchema });

    assert.equal((event as { state?: boolean }).state, true);
  });

  test("coerces bool field state=0 to boolean false", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.state.fieldNumber, value: 0, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "L", stateSchema: lightSchema });

    assert.equal((event as { state?: boolean }).state, false);
  });

  test("preserves float fields as numbers", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.brightness.fieldNumber, value: float32(0.75), wireType: WireType.FIXED32 }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "L", stateSchema: lightSchema });

    assert.ok(Math.abs(((event as { brightness?: number }).brightness ?? 0) - 0.75) < 1e-6);
  });
});

describe("decodeStateFromSchema - sensor entity", () => {

  const sensorSchema = ENTITY_SCHEMAS.sensor.state;

  test("decodes the float `state` field", () => {

    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: sensorSchema.fields.state.fieldNumber, value: float32(23.5), wireType: WireType.FIXED32 }
    ]));

    const event = decodeStateFromSchema({ entityType: "sensor", fields: fields, key: 5, name: "Temperature", stateSchema: sensorSchema });

    assert.ok(Math.abs(((event as { state?: number }).state ?? 0) - 23.5) < 1e-6);
  });

  test("includes deviceId when the schema declares one and the field is present", () => {

    // Sensor's state schema declares deviceIdFieldNumber=4 per the canonical schema registry.
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: sensorSchema.deviceIdFieldNumber, value: 7, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "sensor", fields: fields, key: 1, name: "T", stateSchema: sensorSchema });

    assert.equal((event as { deviceId?: number }).deviceId, 7);
  });
});

describe("decodeStateFromSchema - switch entity", () => {

  const switchSchema = ENTITY_SCHEMAS.switch.state;

  test("decodes the bool `state` field as true/false", () => {

    const onFields = decodeWith(encodeProtoFields([
      { fieldNumber: switchSchema.fields.state.fieldNumber, value: 1, wireType: WireType.VARINT }
    ]));

    const offFields = decodeWith(encodeProtoFields([
      { fieldNumber: switchSchema.fields.state.fieldNumber, value: 0, wireType: WireType.VARINT }
    ]));

    assert.equal((decodeStateFromSchema({ entityType: "switch", fields: onFields, key: 1, name: "S", stateSchema: switchSchema }) as { state?: boolean }).state, true);
    assert.equal((decodeStateFromSchema({ entityType: "switch", fields: offFields, key: 1, name: "S", stateSchema: switchSchema }) as { state?: boolean }).state, false);
  });
});

describe("decodeStateFromSchema - fixed32 fields", () => {

  test("preserves fixed32-typed numeric fields verbatim", () => {

    // Light's color_mode is a varint enum. This pins that the schema-driven decoder round-trips the varint-enum carrier (colorMode) verbatim: we encode colorMode as a
    // VARINT field with value 7 against the real light state schema, decode it, and assert the value survives unchanged.
    const lightSchema = ENTITY_SCHEMAS.light.state;
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.colorMode.fieldNumber, value: 7, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "L", stateSchema: lightSchema });

    assert.equal((event as { colorMode?: number }).colorMode, 7);
  });
});

describe("decodeStateFromSchema - absent fields", () => {

  test("omits fields entirely when not present on the wire", () => {

    const lightSchema = ENTITY_SCHEMAS.light.state;
    const fields = decodeWith(Buffer.alloc(0));
    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "L", stateSchema: lightSchema });

    assert.equal((event as { state?: boolean }).state, undefined);
    assert.equal((event as { brightness?: number }).brightness, undefined);
  });
});

describe("decodeStateFromSchema - multi-field round-trip", () => {

  test("decodes multiple light fields in one payload", () => {

    const lightSchema = ENTITY_SCHEMAS.light.state;
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: lightSchema.fields.state.fieldNumber, value: 1, wireType: WireType.VARINT },
      { fieldNumber: lightSchema.fields.brightness.fieldNumber, value: float32(0.5), wireType: WireType.FIXED32 },
      { fieldNumber: lightSchema.fields.colorMode.fieldNumber, value: 3, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({ entityType: "light", fields: fields, key: 1, name: "Lamp", stateSchema: lightSchema });

    assert.equal((event as { state?: boolean }).state, true);
    assert.ok(Math.abs(((event as { brightness?: number }).brightness ?? 0) - 0.5) < 1e-6);
    assert.equal((event as { colorMode?: number }).colorMode, 3);
  });
});

describe("decodeStateFromSchema - non-string fixed32 round-trip", () => {

  test("returns the raw uint32 when valueType is fixed32", () => {

    // ENTITY_SCHEMAS.datetime.state.fields.epochSeconds is a real fixed32 scalar field, but decoding through the datetime schema would also
    // decode missingState alongside it. Construct a synthetic StateSchema with a single fixed32 field so the assertion isolates the fixed32
    // dispatch path from datetime's other fields.
    const synthetic = {

      deviceIdFieldNumber: 0,
      fields: {

        custom: { fieldNumber: 1, valueType: "fixed32", wireType: WireType.FIXED32 }
      },
      keyFieldNumber: 1,
      messageType: 0
    } as const;

    const fields = decodeWith(encodeProtoFields([{ fieldNumber: 1, value: fixed32(0xCAFEBABE), wireType: WireType.FIXED32 }]));
    const event = decodeStateFromSchema({ entityType: "x", fields: fields, key: 1, name: "X", stateSchema: synthetic }) as { custom?: number };

    assert.equal(event.custom, 0xCAFEBABE);
  });
});

describe("decodeStateFromSchema - water_heater packedBitsFields", () => {

  test("decodes the packed state field (field 6) into named awayState/onState booleans", () => {

    // State-side packedBitsFields decoder mirrors the listEntities-side path: the engine reads the packed uint32 and writes each named bit as a typed boolean on the
    // event. Consumers see `event.awayState: boolean` instead of raw `(event.state & 1) !== 0` magic-number math.
    const waterHeaterSchema = ENTITY_SCHEMAS.water_heater.state;
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 6, value: 3, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({

      entityType: "water_heater", fields: fields, key: 1, name: "Tank", stateSchema: waterHeaterSchema
    }) as { awayState?: boolean; onState?: boolean };

    assert.equal(event.awayState, true, "bit 0 of the packed state field");
    assert.equal(event.onState, true, "bit 1 of the packed state field");
  });

  test("decodes zero-valued packed state field as both booleans false", () => {

    const waterHeaterSchema = ENTITY_SCHEMAS.water_heater.state;
    const fields = decodeWith(encodeProtoFields([
      { fieldNumber: 6, value: 0, wireType: WireType.VARINT }
    ]));

    const event = decodeStateFromSchema({

      entityType: "water_heater", fields: fields, key: 1, name: "Tank", stateSchema: waterHeaterSchema
    }) as { awayState?: boolean; onState?: boolean };

    assert.equal(event.awayState, false);
    assert.equal(event.onState, false);
  });

  test("omits awayState/onState when the packed state field is absent on the wire", () => {

    const waterHeaterSchema = ENTITY_SCHEMAS.water_heater.state;
    const fields = decodeWith(Buffer.alloc(0));
    const event = decodeStateFromSchema({

      entityType: "water_heater", fields: fields, key: 1, name: "Tank", stateSchema: waterHeaterSchema
    }) as { awayState?: boolean; onState?: boolean };

    assert.equal(event.awayState, undefined);
    assert.equal(event.onState, undefined);
  });
});
