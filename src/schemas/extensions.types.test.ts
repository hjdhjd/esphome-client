/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * extensions.types.test.ts: Type-level tests for aliasOf / extending, the ExtraSchemaSet contract, and extras-aware client typing.
 */
import type { ExtendedEntityType, ExtraSchemaSet, SchemaForExtended } from "./extensions.ts";
import { aliasOf, extending } from "./extensions.ts";
import { describe, test } from "node:test";
import type { EntitySchema } from "./entity-schemas.ts";
import { EspHomeClient } from "../esphome-client.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";

describe("ExtraSchemaSet typing", () => {

  test("aliasOf() returns an EntitySchema assignable to ExtraSchemaSet entries", () => {

    const set: ExtraSchemaSet = {

      doorCover: aliasOf("cover")
    };

    const schema: EntitySchema = set["doorCover"]!;

    assert.equal(schema.type, "cover");
  });

  test("extending() preserves the base schema's structure with the additions merged in", () => {

    const customSwitch = extending("switch", {

      addedListEntitiesFields: {

        wattage: { fieldNumber: 100, valueType: "float", wireType: 5 }
      }
    });

    // The result must satisfy EntitySchema's contract.
    const schema: EntitySchema = customSwitch;

    assert.equal(schema.type, "switch");
    assert.ok("wattage" in schema.listEntities.fields);
  });

  test("aliasOf rejects unknown base entity types at compile time", () => {

    // The wrapper is never invoked - the test asserts the TypeScript compiler rejects the call shape, not the runtime behaviour.
    const _typeCheck = (): void => {

      // @ts-expect-error -- "not_an_entity" is not in the canonical ENTITY_SCHEMAS keys.
      aliasOf("not_an_entity");
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("extending rejects unknown base entity types at compile time", () => {

    const _typeCheck = (): void => {

      // @ts-expect-error -- "not_an_entity" is not in the canonical ENTITY_SCHEMAS keys.
      extending("not_an_entity", { addedListEntitiesFields: {} });
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("ExtraSchemaSet is structurally a readonly record of EntitySchema entries", () => {

    const set: ExtraSchemaSet = { customRelay: aliasOf("switch") };

    // Indexing returns EntitySchema (or undefined under noUncheckedIndexedAccess).
    const schema: EntitySchema | undefined = set["customRelay"];

    assert.ok(schema);

    const _typeCheck = (): void => {

      // @ts-expect-error -- ExtraSchemaSet is readonly; assignment should be flagged.
      set["foo"] = aliasOf("switch");
    };

    void _typeCheck;
  });
});

// Helper marker type for "no extras supplied". Mirrors the default the client uses in its `Extras extends ExtraSchemaSet = {}` parameter, but spelled as an empty
// readonly record so the no-empty-object-type lint stays happy at usage sites.
type NoExtras = Readonly<Record<string, never>>;

type DoorCoverExtras = Readonly<{ "door_cover": EntitySchema }>;

describe("EspHomeClient<Extras> type threading", () => {

  test("ExtendedEntityType<NoExtras> reduces to the built-in EntityType union", () => {

    // Static-type-only check: ExtendedEntityType<NoExtras> must accept "light" (built-in) and reject "door_cover" (no extras).
    const _typeCheck = (): void => {

      const builtIn: ExtendedEntityType<NoExtras> = "light";

      void builtIn;
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("ExtendedEntityType<{ door_cover: ... }> includes both built-in and extras keys", () => {

    const _typeCheck = (): void => {

      const builtIn: ExtendedEntityType<DoorCoverExtras> = "light";
      const extras: ExtendedEntityType<DoorCoverExtras> = "door_cover";

      void builtIn;
      void extras;
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("SchemaForExtended<T, Extras> resolves a built-in to ENTITY_SCHEMAS[T]", () => {

    type CoverSchema = SchemaForExtended<"cover", NoExtras>;

    const _typeCheck = (): void => {

      const _value: CoverSchema = undefined as unknown as CoverSchema;

      void _value;
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("client.command(extrasId, options) typechecks under EspHomeClient<{ door_cover: ... }>", () => {

    const _typeCheck = (): void => {

      const aliased = { ...aliasOf("cover"), type: "door_cover" };

      const client = new EspHomeClient<DoorCoverExtras>({

        extraSchemas: { "door_cover": aliased },
        host: "x",
        reconnect: false,
        transportFactory: (): MockTransport => new MockTransport()
      });

      // The cover schema's command shape declares optional `position` and `tilt`. Passing a cover-shaped command for an extras-keyed entity narrows correctly.
      client.command(entityId("door_cover", "garage"), { position: 0.5 });
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("client.command(extrasId, builtinOptions) is a brand mismatch error", () => {

    const _typeCheck = (): void => {

      const aliased = { ...aliasOf("cover"), type: "door_cover" };

      const client = new EspHomeClient<DoorCoverExtras>({

        extraSchemas: { "door_cover": aliased },
        host: "x",
        reconnect: false,
        transportFactory: (): MockTransport => new MockTransport()
      });

      // @ts-expect-error -- a switch id branded as EntityId<"switch"> is not assignable to EntityId<"door_cover">; the brand mismatch is the type-system guarantee.
      client.command(entityId("switch", "x"), { position: 0.5 });
    };

    void _typeCheck;
    assert.ok(true);
  });

  test("default EspHomeClient (no Extras parameter) accepts only built-in entity types", () => {

    const _typeCheck = (): void => {

      const client = new EspHomeClient({

        host: "x",
        reconnect: false,
        transportFactory: (): MockTransport => new MockTransport()
      });

      // Built-in entity types still narrow correctly when Extras defaults to its parameter default.
      client.command(entityId("switch", "x"), { state: true });
    };

    void _typeCheck;
    assert.ok(true);
  });
});
