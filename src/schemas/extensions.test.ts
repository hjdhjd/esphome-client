/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * extensions.test.ts: Unit tests for the schema-extension helpers (aliasOf, extending), the per-instance schemas-table builders, and the
 * per-table lookup helpers (findSchemaByStateMessageTypeIn, findSchemaByListEntitiesMessageTypeIn, getSchemaIn).
 */
import {
  aliasOf, buildListEntitiesMessageTypes, buildSchemasTable, buildStateMessageTypes, extending, findSchemaByListEntitiesMessageTypeIn,
  findSchemaByStateMessageTypeIn, getSchemaIn
} from "./extensions.ts";
import { describe, test } from "node:test";
import { ConfigurationError } from "../errors.ts";
import { ENTITY_SCHEMAS } from "./entity-schemas.ts";
import { MessageType } from "../protocol/message-types.ts";
import { WireType } from "../protocol/wire-types.ts";
import assert from "node:assert/strict";

describe("aliasOf", () => {

  test("returns a schema that mirrors the upstream type's wire format", () => {

    const cloned = aliasOf("cover");
    const upstream = ENTITY_SCHEMAS.cover;

    assert.equal(cloned.type, upstream.type);
    assert.equal(cloned.listEntities.messageType, upstream.listEntities.messageType);
    assert.equal(cloned.state.messageType, upstream.state.messageType);
  });

  test("returns a fresh object - mutating the alias's listEntities.fields does not leak into the upstream registry", () => {

    const cloned = aliasOf("cover");
    const before = Object.keys(ENTITY_SCHEMAS.cover.listEntities.fields).length;

    // Mutate the alias to confirm isolation.
    (cloned.listEntities.fields as Record<string, unknown>)["__synthetic"] = { fieldNumber: 999, valueType: "varint", wireType: WireType.VARINT };

    const after = Object.keys(ENTITY_SCHEMAS.cover.listEntities.fields).length;

    assert.equal(after, before, "alias mutation must not leak into the upstream registry");
  });

  test("returns a fresh state.fields object too", () => {

    const cloned = aliasOf("switch");
    const before = Object.keys(ENTITY_SCHEMAS.switch.state.fields).length;

    (cloned.state.fields as Record<string, unknown>)["__alias_only"] = { fieldNumber: 998, valueType: "bool", wireType: WireType.VARINT };

    const after = Object.keys(ENTITY_SCHEMAS.switch.state.fields).length;

    assert.equal(after, before, "state.fields mutation must not leak");
  });

  test("works for every standard entity type without throwing", () => {

    for(const type of Object.keys(ENTITY_SCHEMAS) as (keyof typeof ENTITY_SCHEMAS)[]) {

      assert.doesNotThrow(() => aliasOf(type), "aliasOf must work for every entity type, but failed for: " + type);
    }
  });
});

describe("extending", () => {

  test("returns a schema with the supplied state field merged onto the upstream", () => {

    const extended = extending("switch", {

      addedStateFields: { surgeCount: { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT } }
    });

    assert.equal(extended.state.fields["surgeCount"]?.fieldNumber, 99);
    assert.notEqual(extended.state.fields["state"], undefined, "upstream state field is preserved");
  });

  test("returns a schema with the supplied listEntities field merged onto the upstream", () => {

    const extended = extending("switch", {

      addedListEntitiesFields: { customLabel: { fieldNumber: 88, valueType: "string", wireType: WireType.LENGTH_DELIMITED } }
    });

    assert.equal(extended.listEntities.fields["customLabel"]?.fieldNumber, 88);

    // Verify an upstream listEntities field is preserved (icon and entityCategory are present on every standard discovery message).
    assert.notEqual(extended.listEntities.fields["icon"], undefined, "upstream listEntities field is preserved");
  });

  test("with no additions, returns a schema with the upstream fields", () => {

    const extended = extending("light", {});
    const upstream = ENTITY_SCHEMAS.light;

    assert.deepEqual(Object.keys(extended.state.fields).sort(), Object.keys(upstream.state.fields).sort());
  });

  test("does not leak into the upstream registry", () => {

    const upstreamBefore = JSON.stringify(Object.keys(ENTITY_SCHEMAS.switch.state.fields).sort());

    extending("switch", { addedStateFields: { extra: { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT } } });

    const upstreamAfter = JSON.stringify(Object.keys(ENTITY_SCHEMAS.switch.state.fields).sort());

    assert.equal(upstreamAfter, upstreamBefore, "extending() must not mutate the registry");
  });

  test("merges both listEntities and state additions in a single call", () => {

    const extended = extending("sensor", {

      addedListEntitiesFields: { hwRev: { fieldNumber: 77, valueType: "string", wireType: WireType.LENGTH_DELIMITED } },
      addedStateFields: { rawAdc: { fieldNumber: 66, valueType: "varint", wireType: WireType.VARINT } }
    });

    assert.equal(extended.listEntities.fields["hwRev"]?.fieldNumber, 77);
    assert.equal(extended.state.fields["rawAdc"]?.fieldNumber, 66);
  });
});

describe("buildSchemasTable", () => {

  test("with no extras, returns the base table containing every built-in entity-type key", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, undefined);

    for(const key of Object.keys(ENTITY_SCHEMAS)) {

      assert.ok(table[key], "expected built-in key '" + key + "' in merged table");
    }
  });

  test("with door_cover extras, merged table contains both built-in keys and the door_cover key", () => {

    const extras = { "door_cover": aliasOf("cover") };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);

    assert.ok(table["cover"], "built-in cover must remain present");
    assert.ok(table["door_cover"], "extras key door_cover must be present");
  });

  test("with extras using extending(), merged table preserves the upstream fields plus the additions", () => {

    const extras = {

      "enhanced_switch": extending("switch", {

        addedStateFields: { surgeCount: { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT } }
      })
    };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);
    const enhanced = table["enhanced_switch"];

    assert.notEqual(enhanced, undefined, "enhanced_switch must be present");
    assert.equal(enhanced!.state.fields["surgeCount"]?.fieldNumber, 99);
    assert.notEqual(enhanced!.state.fields["state"], undefined, "upstream state field is preserved");
  });

  test("throws ConfigurationError(EXTRA_SCHEMA_OVERRIDES_BUILTIN) when an extras key collides with a built-in", () => {

    const extras = { cover: aliasOf("cover") };

    assert.throws((): unknown => buildSchemasTable(ENTITY_SCHEMAS, extras), (err: unknown): boolean => {

      assert.ok(err instanceof ConfigurationError, "expected ConfigurationError instance");
      assert.equal(err.code, "EXTRA_SCHEMA_OVERRIDES_BUILTIN");

      return true;
    });
  });

  test("does not mutate the canonical ENTITY_SCHEMAS constant", () => {

    const before = Object.keys(ENTITY_SCHEMAS).length;

    buildSchemasTable(ENTITY_SCHEMAS, { "door_cover": aliasOf("cover") });

    assert.equal(Object.keys(ENTITY_SCHEMAS).length, before, "ENTITY_SCHEMAS must not have grown");
    assert.equal(("door_cover" in ENTITY_SCHEMAS), false, "module-level constant must not gain extras keys");
  });
});

describe("buildStateMessageTypes / buildListEntitiesMessageTypes", () => {

  test("buildStateMessageTypes derives every built-in state-message-type plus BUTTON_COMMAND_REQUEST", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, undefined);
    const set = buildStateMessageTypes(table);

    for(const schema of Object.values(ENTITY_SCHEMAS)) {

      assert.ok(set.has(schema.state.messageType));
    }

    assert.ok(set.has(MessageType.BUTTON_COMMAND_REQUEST));
  });

  test("buildListEntitiesMessageTypes derives every built-in list-message-type plus LIST_ENTITIES_SERVICES_RESPONSE", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, undefined);
    const set = buildListEntitiesMessageTypes(table);

    for(const schema of Object.values(ENTITY_SCHEMAS)) {

      assert.ok(set.has(schema.listEntities.messageType));
    }

    assert.ok(set.has(MessageType.LIST_ENTITIES_SERVICES_RESPONSE));
  });

  test("buildStateMessageTypes includes extras-derived state-message-types (collision case still includes the type)", () => {

    const extras = { "door_cover": aliasOf("cover") };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);
    const set = buildStateMessageTypes(table);

    // door_cover aliases cover, so the wire-message-type is the same. The set already contained it via the cover schema; the assertion just confirms presence.
    assert.ok(set.has(ENTITY_SCHEMAS.cover.state.messageType));
  });
});

describe("findSchemaByStateMessageTypeIn / findSchemaByListEntitiesMessageTypeIn / getSchemaIn", () => {

  test("getSchemaIn resolves a built-in entity type from the merged table", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, { "door_cover": aliasOf("cover") });

    assert.equal(getSchemaIn(table, "cover"), ENTITY_SCHEMAS.cover);
  });

  test("getSchemaIn resolves an extras-keyed entity type from the merged table", () => {

    const extras = { "door_cover": aliasOf("cover") };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);

    assert.equal(getSchemaIn(table, "door_cover"), extras.door_cover);
  });

  test("getSchemaIn returns undefined for an unknown entity type", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, undefined);

    assert.equal(getSchemaIn(table, "not_an_entity_type"), undefined);
  });

  test("findSchemaByStateMessageTypeIn prefers extras over built-ins on wire-message-type collision", () => {

    const aliased = { ...aliasOf("cover"), type: "door_cover" };
    const extras = { "door_cover": aliased };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);

    const resolved = findSchemaByStateMessageTypeIn(table, ENTITY_SCHEMAS.cover.state.messageType);

    assert.equal(resolved?.type, "door_cover", "extras schema must shadow built-in for state-message routing");
  });

  test("findSchemaByListEntitiesMessageTypeIn prefers extras over built-ins on wire-message-type collision", () => {

    const aliased = { ...aliasOf("cover"), type: "door_cover" };
    const extras = { "door_cover": aliased };
    const table = buildSchemasTable(ENTITY_SCHEMAS, extras);

    const resolved = findSchemaByListEntitiesMessageTypeIn(table, ENTITY_SCHEMAS.cover.listEntities.messageType);

    assert.equal(resolved?.type, "door_cover", "extras schema must shadow built-in for list-entities routing");
  });

  test("findSchemaByStateMessageTypeIn returns undefined for an unknown wire-message-type", () => {

    const table = buildSchemasTable(ENTITY_SCHEMAS, undefined);

    assert.equal(findSchemaByStateMessageTypeIn(table, 999999), undefined);
  });
});
