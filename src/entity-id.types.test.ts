/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-id.types.test.ts: Type-level tests for the EntityId<T> branded-type contract.
 */
import { describe, test } from "node:test";
import { entityId, isEntityId, parseEntityId } from "./entity-id.ts";
import type { EntityId } from "./entity-id.ts";
import assert from "node:assert/strict";

describe("EntityId<T> type-level guarantees", () => {

  test("entityId returns a branded EntityId<T> that's structurally a string", () => {

    const lightId: EntityId<"light"> = entityId("light", "kitchen");

    // The brand is type-erased at runtime - the value is still a string.
    assert.equal(typeof lightId, "string");

    // The brand makes EntityId<"light"> and EntityId<"switch"> distinct at compile time. The line below validates: a value of type EntityId<"light"> cannot be assigned
    // to a variable typed as EntityId<"switch">.
    const lightForSwitch = (): EntityId<"switch"> => {

      // @ts-expect-error - EntityId<"light"> is not assignable to EntityId<"switch">; the brand distinction is enforced.
      return lightId;
    };

    // The function exists only to host the @ts-expect-error annotation. It's never executed.
    assert.equal(typeof lightForSwitch, "function");
  });

  test("entityId distinguishes by type at the type level - cross-type assignment is rejected", () => {

    const lightId = entityId("light", "x");
    const switchId = entityId("switch", "x");

    // Two distinct branded types share the same erased shape (string).
    assert.equal(typeof lightId, "string");
    assert.equal(typeof switchId, "string");

    // @ts-expect-error - assigning EntityId<"switch"> to EntityId<"light"> is a type error.
    const _x: EntityId<"light"> = switchId;

    // Reference _x to keep the no-unused-locals quiet without introducing runtime semantics.
    void _x;
  });

  test("isEntityId narrows a string to the matching EntityId<T> branch", () => {

    const raw = "light-kitchen";

    if(isEntityId(raw, "light")) {

      // Inside this branch, raw is narrowed to EntityId<"light">. Verify by passing it to a function that expects exactly that type.
      const accept = (id: EntityId<"light">): string => id;

      assert.equal(accept(raw), "light-kitchen");
    }
  });

  test("parseEntityId returns a discriminated union narrowable on .type", () => {

    const parsed = parseEntityId("light-kitchen");

    assert.notEqual(parsed, null);

    if(parsed) {

      // After narrowing on parsed.type, the id is typed as EntityId<typeof parsed.type>.
      const id: EntityId = parsed.id;

      assert.equal(typeof id, "string");
      assert.equal(parsed.type, "light");
    }
  });
});

describe("EntityId<T> contract violations - @ts-expect-error annotations must trigger", () => {

  test("rejects passing a plain string where EntityId is expected", () => {

    const accept = (id: EntityId<"light">): string => id;

    // @ts-expect-error - plain string is not a branded EntityId<"light">; the brand requires the mint helper.
    accept("light-kitchen");

    // The runtime call still works because the brand is type-erased; we exercise the call path here just to keep the test non-vacuous at runtime, but the @ts-expect-
    // error above is the contract this test guards.
    assert.equal(typeof accept, "function");
  });

  test("rejects mixing entity types via direct assignment", () => {

    const lightId = entityId("light", "x");

    // @ts-expect-error - cannot assign EntityId<"light"> into EntityId<"switch"> without re-minting.
    const _switchId: EntityId<"switch"> = lightId;

    void _switchId;
  });
});
