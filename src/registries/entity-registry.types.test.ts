/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-registry.types.test.ts: Type-level tests for the EntityRegistry brand-narrowing seam.
 */
import type { EspHomeLogging, Nullable } from "../types.ts";
import { describe, test } from "node:test";
import type { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EntityFor } from "../schemas/derived.ts";
import type { EntityId } from "../entity-id.ts";
import { EntityRegistry } from "./entity-registry.ts";
import type { EntityRegistryHost } from "./entity-registry.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";

const noopLogger: EspHomeLogging = {

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info:  (): void => { /* discard */ },
  warn:  (): void => { /* discard */ }
};

const noopHost: EntityRegistryHost = { log: noopLogger };

describe("EntityRegistry - byId<T> brand-narrowing seam", () => {

  test("byId narrows EntityId<\"light\"> to a light-typed entity record", () => {

    const registry = new EntityRegistry(noopHost);
    const lightId: EntityId<"light"> = entityId("light", "x");

    // The static type of `result` is `Nullable<EntityFor<typeof ENTITY_SCHEMAS["light"]>>`. Verify by assigning to that exact type and back.
    const result = registry.byId(lightId);
    const narrowed: Nullable<EntityFor<typeof ENTITY_SCHEMAS["light"]>> = result;

    assert.equal(narrowed, null, "the registry is empty - the lookup returns null at runtime");
  });

  test("byId narrowed to switch type cannot be assigned to a light-typed slot", () => {

    const registry = new EntityRegistry(noopHost);
    const switchId: EntityId<"switch"> = entityId("switch", "x");
    const switchResult = registry.byId(switchId);

    // @ts-expect-error - Nullable<EntityFor<switch>> is not assignable to Nullable<EntityFor<light>>; the brand distinction flows through to the return type.
    const _wrong: Nullable<EntityFor<typeof ENTITY_SCHEMAS["light"]>> = switchResult;

    void _wrong;

    assert.equal(switchResult, null);
  });

  test("byId rejects a plain unbranded string at the type level", () => {

    const registry = new EntityRegistry(noopHost);

    // @ts-expect-error - byId requires a branded EntityId; a plain string fails the brand constraint.
    const result = registry.byId("light-x");

    void result;

    assert.equal(typeof registry.byId, "function");
  });
});

describe("EntityRegistry - keyForId requires a branded id", () => {

  test("keyForId accepts EntityId and returns Nullable<number>", () => {

    const registry = new EntityRegistry(noopHost);
    const id: EntityId = entityId("light", "x");
    const key: Nullable<number> = registry.keyForId(id);

    assert.equal(key, null);
  });

  test("keyForId rejects a plain unbranded string at the type level", () => {

    const registry = new EntityRegistry(noopHost);

    // @ts-expect-error - keyForId requires a branded EntityId; a plain string is not assignable.
    const key = registry.keyForId("light-x");

    void key;

    assert.equal(typeof registry.keyForId, "function");
  });
});

describe("EntityRegistry - hasId boundary accepts EntityId and string", () => {

  test("hasId accepts EntityId<T> at the type level", () => {

    const registry = new EntityRegistry(noopHost);
    const id: EntityId<"light"> = entityId("light", "x");

    // No type error; the EntityId | string union accepts the more-specific branded type.
    const present: boolean = registry.hasId(id);

    assert.equal(present, false);
  });

  test("hasId accepts a plain string at the type level (boundary widening for membership checks)", () => {

    const registry = new EntityRegistry(noopHost);
    const present: boolean = registry.hasId("light-x");

    assert.equal(present, false);
  });
});
