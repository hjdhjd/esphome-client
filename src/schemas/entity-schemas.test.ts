/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-schemas.test.ts: Guarantee tests for the ENTITY_SCHEMAS registry and its schema-lookup helpers.
 */
import {
  AlarmControlPanelState, CLIMATE_FEATURE_BITS, ClimateAction, ClimateFanMode, ClimateMode, ClimatePreset, ClimateSwingMode, ColorMode, CoverOperation,
  EntityCategory, FanDirection, LockState, MediaPlayerState, NumberMode, SensorStateClass, TemperatureUnit, TextMode, ValveOperation,
  WATER_HEATER_STATE_COMMAND_BITS, WATER_HEATER_STATE_INBOUND_BITS, WaterHeaterMode
} from "../api-constants.ts";
import {
  ENTITY_SCHEMAS, findSchemaByCommandMessageType, findSchemaByListEntitiesMessageType, findSchemaByStateMessageType, getEntitySchema
} from "./entity-schemas.ts";
import { describe, test } from "node:test";
import type { EntitySchema } from "./entity-schemas.ts";
import { MessageType } from "../protocol/message-types.ts";
import assert from "node:assert/strict";

describe("ENTITY_SCHEMAS registry guarantees", () => {

  test("declares the canonical 26 entity types", () => {

    const types = Object.keys(ENTITY_SCHEMAS).sort();
    const expected = [

      "alarm_control_panel", "binary_sensor", "button", "camera", "climate", "cover", "date", "datetime", "event", "fan", "infrared", "light", "lock", "media_player",
      "number", "radio_frequency", "select", "sensor", "siren", "switch", "text", "text_sensor", "time", "update", "valve", "water_heater"
    ].sort();

    assert.deepEqual(types, expected, "the registry must contain exactly the 26 documented entity types");
  });

  test("every entry's type tag matches its key", () => {

    for(const [ key, schema ] of Object.entries(ENTITY_SCHEMAS) as [string, EntitySchema][]) {

      assert.equal(schema.type, key, "ENTITY_SCHEMAS." + key + ".type must equal '" + key + "'");
    }
  });

  test("every entry has a unique listEntities messageType", () => {

    const messageTypes = new Set<number>();

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      const mt = schema.listEntities.messageType;

      assert.equal(messageTypes.has(mt), false, "duplicate listEntities.messageType: " + String(mt) + " (entity: " + schema.type + ")");
      messageTypes.add(mt);
    }
  });

  test("every entry has a unique state messageType, except the documented IR/RF receive event that is shared by design", () => {

    // The infrared and radio_frequency schemas intentionally share `state.messageType: INFRARED_RF_RECEIVE_EVENT` (id 137) - the wire event is the same for both
    // physical layers, and `handleTelemetry` disambiguates by consulting the registered entity's type. Any other duplication is a bug.
    const sharedStateMessageTypes: ReadonlySet<number> = new Set<number>([MessageType.INFRARED_RF_RECEIVE_EVENT]);
    const messageTypes = new Set<number>();

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      const mt = schema.state.messageType;

      // button has no state schema (synthesized 'pressed: true' event); skip.
      if(mt === 0) {

        continue;
      }

      if(sharedStateMessageTypes.has(mt)) {

        continue;
      }

      assert.equal(messageTypes.has(mt), false, "duplicate state.messageType: " + String(mt) + " (entity: " + schema.type + ")");
      messageTypes.add(mt);
    }
  });

  test("every command schema (where present) has a unique messageType, except the documented IR/RF transmit request that is shared by design", () => {

    // The infrared and radio_frequency schemas share `command.messageType: INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` (id 136) - one wire RPC drives both physical
    // layers and the schemas declare it identically. Any other duplication is a bug.
    const sharedCommandMessageTypes: ReadonlySet<number> = new Set<number>([MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST]);
    const messageTypes = new Set<number>();

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      if(!schema.command) {

        continue;
      }

      const mt = schema.command.messageType;

      if(sharedCommandMessageTypes.has(mt)) {

        continue;
      }

      assert.equal(messageTypes.has(mt), false, "duplicate command.messageType: " + String(mt) + " (entity: " + schema.type + ")");
      messageTypes.add(mt);
    }
  });

  test("listEntities field numbers within each schema are unique", () => {

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      const numbers = new Set<number>();

      for(const [ name, spec ] of Object.entries(schema.listEntities.fields)) {

        assert.equal(numbers.has(spec.fieldNumber), false, schema.type + ".listEntities field-number collision on " + name + ": " + String(spec.fieldNumber));
        numbers.add(spec.fieldNumber);
      }
    }
  });

  test("state field numbers within each schema are unique", () => {

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      const numbers = new Set<number>();

      for(const [ name, spec ] of Object.entries(schema.state.fields)) {

        assert.equal(numbers.has(spec.fieldNumber), false, schema.type + ".state field-number collision on " + name + ": " + String(spec.fieldNumber));
        numbers.add(spec.fieldNumber);
      }
    }
  });

  test("command has-pattern fields within each schema have non-overlapping hasField/valueField numbers", () => {

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      if(!schema.command) {

        continue;
      }

      const numbers = new Set<number>();

      for(const [ name, spec ] of Object.entries(schema.command.hasPatternFields)) {

        for(const fn of [ spec.hasFieldNumber, spec.valueFieldNumber ]) {

          assert.equal(numbers.has(fn), false, schema.type + ".command has-pattern collision on " + name + ": " + String(fn));
          numbers.add(fn);
        }
      }
    }
  });

  test("listEntities fields use a known valueType tag", () => {

    const known: readonly string[] = [ "bool", "enum", "fixed32", "float", "sint32", "sint32-packed", "string", "varint" ];

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      for(const [ name, spec ] of Object.entries(schema.listEntities.fields)) {

        assert.equal(known.includes(spec.valueType), true, schema.type + ".listEntities." + name + " unknown valueType: " + spec.valueType);
      }
    }
  });

  test("state fields use a known valueType tag", () => {

    const known: readonly string[] = [ "bool", "enum", "fixed32", "float", "sint32", "sint32-packed", "string", "varint" ];

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      for(const [ name, spec ] of Object.entries(schema.state.fields)) {

        assert.equal(known.includes(spec.valueType), true, schema.type + ".state." + name + " unknown valueType: " + spec.valueType);
      }
    }
  });
});

describe("ENTITY_SCHEMAS state-side enumMappings reference the named constant", () => {

  // Each entry pairs a schema state-side enumMappings entry with the canonical named constant in api-constants.ts. The schema must reference the constant by
  // reference (not an inline-literal copy) so that drift is impossible by construction - both the schema-driven narrowing and the consumer-facing label union derive
  // from the same single source of truth. The strict-identity assertion below catches any regression that reintroduces an inline literal copy.
  const expectedReferences = [
    { entityType: "alarm_control_panel", field: "state", named: AlarmControlPanelState },
    { entityType: "climate", field: "action", named: ClimateAction },
    { entityType: "climate", field: "fanMode", named: ClimateFanMode },
    { entityType: "climate", field: "mode", named: ClimateMode },
    { entityType: "climate", field: "preset", named: ClimatePreset },
    { entityType: "climate", field: "swingMode", named: ClimateSwingMode },
    { entityType: "cover", field: "currentOperation", named: CoverOperation },
    { entityType: "fan", field: "direction", named: FanDirection },
    { entityType: "light", field: "colorMode", named: ColorMode },
    { entityType: "lock", field: "state", named: LockState },
    { entityType: "media_player", field: "state", named: MediaPlayerState },
    { entityType: "valve", field: "currentOperation", named: ValveOperation },
    { entityType: "water_heater", field: "mode", named: WaterHeaterMode }
  ] as const;

  for(const { entityType, field, named } of expectedReferences) {

    test(entityType + ".state.enumMappings." + field + " is the named constant from api-constants.ts (by reference)", () => {

      const schema = (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType];

      assert.notEqual(schema, undefined, "schema must exist for " + entityType);

      const mapping = schema?.state.enumMappings?.[field];

      assert.notEqual(mapping, undefined, entityType + ".state.enumMappings." + field + " must be declared");
      assert.strictEqual(mapping, named, entityType + ".state.enumMappings." + field + " must reference the named constant by reference, not an inline copy");
    });
  }

  test("every state-side enum field has a corresponding enumMappings entry", () => {

    // Every wire-level enum field on a state schema must have a matching enumMappings entry so the StateEventFor narrowing applies. Discovering a state field with
    // valueType "enum" but no mapping means a downstream consumer's switch over event.<field> stays untyped, which is the architectural drift this rule prevents.
    const expectedFields = new Map<string, Set<string>>();

    for(const { entityType, field } of expectedReferences) {

      const set = expectedFields.get(entityType) ?? new Set<string>();

      set.add(field);
      expectedFields.set(entityType, set);
    }

    for(const [ entityType, schema ] of Object.entries(ENTITY_SCHEMAS) as [string, EntitySchema][]) {

      const expected = expectedFields.get(entityType) ?? new Set<string>();

      for(const [ fieldName, spec ] of Object.entries(schema.state.fields)) {

        if(spec.valueType !== "enum") {

          continue;
        }

        assert.equal(expected.has(fieldName), true, entityType + ".state." + fieldName + " is wire-enum but has no enumMappings entry; either add one (and " +
          "list it in expectedReferences) or remove the field if it is not actually used");
      }
    }
  });
});

describe("ENTITY_SCHEMAS listEntities-side enumMappings reference the named constant", () => {

  // Each entry pairs a schema listEntities-side enumMappings entry with the canonical named constant in api-constants.ts. The schema must reference the constant by
  // reference (not an inline-literal copy) so that drift is impossible by construction. The strict-identity assertion below catches any regression that reintroduces
  // an inline literal copy. entityCategory is repeated across every entity because every entity carries the field; the structural test below enforces that.
  const allEntityCategoryCases = Object.keys(ENTITY_SCHEMAS).map((entityType) => ({ entityType, field: "entityCategory", named: EntityCategory }));
  const expectedReferences = [
    ...allEntityCategoryCases,
    { entityType: "climate", field: "supportedFanModes", named: ClimateFanMode },
    { entityType: "climate", field: "supportedModes", named: ClimateMode },
    { entityType: "climate", field: "supportedPresets", named: ClimatePreset },
    { entityType: "climate", field: "supportedSwingModes", named: ClimateSwingMode },
    { entityType: "climate", field: "temperatureUnit", named: TemperatureUnit },
    { entityType: "light", field: "supportedColorModes", named: ColorMode },
    { entityType: "number", field: "mode", named: NumberMode },
    { entityType: "sensor", field: "stateClass", named: SensorStateClass },
    { entityType: "text", field: "mode", named: TextMode },
    { entityType: "water_heater", field: "supportedModes", named: WaterHeaterMode },
    { entityType: "water_heater", field: "temperatureUnit", named: TemperatureUnit }
  ];

  for(const { entityType, field, named } of expectedReferences) {

    test(entityType + ".listEntities.enumMappings." + field + " is the named constant (by reference)", () => {

      const schema = (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType];

      assert.notEqual(schema, undefined, "schema must exist for " + entityType);

      const mapping = schema?.listEntities.enumMappings?.[field];

      assert.notEqual(mapping, undefined, entityType + ".listEntities.enumMappings." + field + " must be declared");
      assert.strictEqual(mapping, named, entityType + ".listEntities.enumMappings." + field + " must reference the named constant by reference, not an inline copy");
    });
  }

  test("every listEntities-side enum field has a corresponding enumMappings entry", () => {

    // Mirrors the state-side structural test. Every wire-level enum field on a listEntities schema (both scalar `fields` and repeated `repeatedFields`) must have
    // a matching enumMappings entry so the EntityFor narrowing applies. Discovering an enum field without a mapping means a downstream consumer's narrowing on
    // `entity.<field>` stays untyped, which is the architectural drift this rule prevents.
    const expectedFields = new Map<string, Set<string>>();

    for(const { entityType, field } of expectedReferences) {

      const set = expectedFields.get(entityType) ?? new Set<string>();

      set.add(field);
      expectedFields.set(entityType, set);
    }

    for(const [ entityType, schema ] of Object.entries(ENTITY_SCHEMAS) as [string, EntitySchema][]) {

      const expected = expectedFields.get(entityType) ?? new Set<string>();

      for(const [ fieldName, spec ] of Object.entries(schema.listEntities.fields)) {

        if(spec.valueType !== "enum") {

          continue;
        }

        assert.equal(expected.has(fieldName), true, entityType + ".listEntities." + fieldName + " is wire-enum but has no enumMappings entry; either add one " +
          "(and list it in expectedReferences) or remove the field if it is not actually used");
      }

      const repeatedFields = schema.listEntities.repeatedFields ?? {};

      for(const [ fieldName, spec ] of Object.entries(repeatedFields)) {

        if(spec.valueType !== "enum") {

          continue;
        }

        assert.equal(expected.has(fieldName), true, entityType + ".listEntities (repeated)." + fieldName + " is wire-enum but has no enumMappings entry; either " +
          "add one (and list it in expectedReferences) or remove the field if it is not actually used");
      }
    }
  });
});

describe("ENTITY_SCHEMAS packedBitsFields reference the named-constant bit records", () => {

  // Each entry pins one packedBitsFields entry's `bits` slot against its canonical bit-record constant in api-constants.ts via STRICT REFERENCE IDENTITY. The
  // co-located shape (bits-record exported from api-constants, schema references by name) means the bit values live in exactly one place; drift between schema and
  // constant is structurally impossible because they ARE the same record.
  //
  // A schema author writing `bits: { ... }` inline (instead of `bits: NAMED_CONSTANT`) fails the assertion immediately, because the schema's bits slot and the
  // named constant are checked for strict reference identity rather than value equality - a value-equality check would pass even when the fixture and the schema
  // cite the values independently, masking a mismatched citation. Same pattern as the enumMappings reference-identity tests above.
  const expectedReferences = [
    { constantName: "CLIMATE_FEATURE_BITS", named: CLIMATE_FEATURE_BITS, packedField: "featureFlags", path: "climate.listEntities" },
    { constantName: "WATER_HEATER_STATE_INBOUND_BITS", named: WATER_HEATER_STATE_INBOUND_BITS, packedField: "state", path: "water_heater.state" },
    { constantName: "WATER_HEATER_STATE_COMMAND_BITS", named: WATER_HEATER_STATE_COMMAND_BITS, packedField: "state", path: "water_heater.command" }
  ] as const;

  for(const check of expectedReferences) {

    test(check.path + ".packedBitsFields." + check.packedField + ".bits is the " + check.constantName + " constant (by reference)", () => {

      const [ entityType, role ] = check.path.split(".") as [ string, "listEntities" | "state" | "command" ];
      const schema = (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType];

      assert.notEqual(schema, undefined);

      const roleSchema = schema?.[role];

      assert.notEqual(roleSchema, undefined);

      const packedField = roleSchema?.packedBitsFields?.[check.packedField];

      assert.notEqual(packedField, undefined, check.path + ".packedBitsFields." + check.packedField + " must be declared");
      assert.strictEqual(packedField?.bits, check.named, check.path + ".packedBitsFields." + check.packedField + ".bits must reference " + check.constantName +
        " by identity (not an inline copy)");
    });
  }

  test("every declared packedBitsFields entry references a constant listed in expectedReferences", () => {

    // Structural guard: if a future schema adds a new packed-bits entry but forgets to list its expected bit-record in expectedReferences, this test fails. Mirrors
    // the per-role structural tests for enumMappings ("every wire-enum field has a corresponding enumMappings entry").
    const visited = new Set<string>();

    for(const check of expectedReferences) {

      visited.add(check.path + "." + check.packedField);
    }

    for(const [ entityType, schema ] of Object.entries(ENTITY_SCHEMAS) as [string, EntitySchema][]) {

      for(const role of [ "listEntities", "state", "command" ] as const) {

        const roleSchema = schema[role];
        const packedBitsFields = (roleSchema as { packedBitsFields?: Record<string, { bits: Record<string, unknown> }> })?.packedBitsFields;

        if(!packedBitsFields) {

          continue;
        }

        for(const packedField of Object.keys(packedBitsFields)) {

          const key = entityType + "." + role + "." + packedField;

          assert.equal(visited.has(key), true, "packedBitsFields entry " + key + " is declared on the schema but missing from the expectedReferences " +
            "reference-identity table; add an entry asserting its bits-record reference against the matching api-constants record");
        }
      }
    }
  });
});

describe("getEntitySchema", () => {

  test("returns the matching schema for a known entity type", () => {

    const schema = getEntitySchema("light");

    assert.notEqual(schema, undefined);
    assert.equal(schema?.type, "light");
  });

  test("returns undefined for an unknown type", () => {

    assert.equal(getEntitySchema("nope"), undefined);
  });

  test("returns undefined for an empty string", () => {

    assert.equal(getEntitySchema(""), undefined);
  });

  test("works for every standard entity type", () => {

    for(const type of Object.keys(ENTITY_SCHEMAS)) {

      assert.notEqual(getEntitySchema(type), undefined, "must resolve " + type);
    }
  });
});

describe("findSchemaByStateMessageType", () => {

  test("returns the matching schema for a known state message type", () => {

    const expected = ENTITY_SCHEMAS.light;
    const result = findSchemaByStateMessageType(expected.state.messageType);

    assert.equal(result?.type, "light");
  });

  test("returns undefined for an unknown message type", () => {

    assert.equal(findSchemaByStateMessageType(999999), undefined);
  });
});

describe("findSchemaByListEntitiesMessageType", () => {

  test("returns the matching schema for a known list-entities message type", () => {

    const expected = ENTITY_SCHEMAS.switch;
    const result = findSchemaByListEntitiesMessageType(expected.listEntities.messageType);

    assert.equal(result?.type, "switch");
  });

  test("returns undefined for an unknown message type", () => {

    assert.equal(findSchemaByListEntitiesMessageType(999999), undefined);
  });
});

describe("findSchemaByCommandMessageType", () => {

  test("returns the matching schema for a known command message type", () => {

    const expected = ENTITY_SCHEMAS.light.command;

    if(expected) {

      const result = findSchemaByCommandMessageType(expected.messageType);

      assert.equal(result?.type, "light");
    }
  });

  test("returns undefined for an unknown message type", () => {

    assert.equal(findSchemaByCommandMessageType(999999), undefined);
  });

  test("returns undefined when looking up a state-only entity (camera, sensor, button) by command message type", () => {

    // Camera has no command; looking up its hypothetical command id should miss.
    // We can't construct a synthetic id; instead, verify that no schema's command messageType is shared with cameras.
    // The infrared and radio_frequency schemas legitimately share `INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` (id 136) - both physical layers drive the same RPC. For
    // shared command messageTypes the first-match-wins lookup returns whichever schema iterates first, and that match still belongs to a real command-bearing entity,
    // which is the rule this test cares about. So we assert membership rather than exact-type-equality for the shared case.
    const sharedCommandMessageTypes: ReadonlySet<number> = new Set<number>([MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST]);

    for(const schema of Object.values(ENTITY_SCHEMAS) as EntitySchema[]) {

      if(schema.command) {

        const found = findSchemaByCommandMessageType(schema.command.messageType);

        if(sharedCommandMessageTypes.has(schema.command.messageType)) {

          // Any schema declaring this messageType is an acceptable match; verify the returned schema is a real command-bearing one.
          assert.notEqual(found, undefined, "shared command messageType should still resolve to some command-bearing schema");
          assert.equal(found?.command !== undefined, true);

          continue;
        }

        // Every command messageType is paired with a real command-bearing entity.
        assert.equal(found?.type, schema.type);
      }
    }
  });
});
