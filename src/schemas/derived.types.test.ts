/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * derived.types.test.ts: Type-level tests for the schema-derived StateEventFor / CommandFor / EntityFor narrowing.
 */
import { ClimateMode, CoverOperation, LockState, MediaPlayerState } from "../api-constants.ts";
import type { CommandFor, EntityFor, StateEventFor } from "./derived.ts";
import { describe, test } from "node:test";
import type { ENTITY_SCHEMAS } from "./entity-schemas.ts";
import assert from "node:assert/strict";

describe("StateEventFor<S> per-entity narrowing", () => {

  test("light state event has fields type='light' + key + entity + brightness/state etc.", () => {

    const event: StateEventFor<typeof ENTITY_SCHEMAS["light"]> = {

      brightness: 0.5,
      entity: "light-kitchen",
      key: 12345,
      state: true,
      type: "light"
    };

    // Type-level: event.type must be exactly the literal "light".
    const _t: "light" = event.type;

    void _t;
    assert.equal(event.type, "light");
  });

  test("switch state event has fields type='switch' + key + entity + state", () => {

    const event: StateEventFor<typeof ENTITY_SCHEMAS["switch"]> = {

      entity: "switch-front",
      key: 999,
      state: true,
      type: "switch"
    };

    const _t: "switch" = event.type;

    void _t;
    assert.equal(event.type, "switch");
  });

  test("rejects assigning a switch state event to a light state event", () => {

    const lightEvent: StateEventFor<typeof ENTITY_SCHEMAS["light"]> = {

      entity: "light-x",
      key: 1,
      state: true,
      type: "light"
    };

    // @ts-expect-error - the tag excludes cross-type assignment.
    const _bad: StateEventFor<typeof ENTITY_SCHEMAS["switch"]> = lightEvent;

    void _bad;
    assert.equal(lightEvent.type, "light");
  });
});

describe("StateEventFor<S> enumMappings narrowing", () => {

  // Schema-level enumMappings on every state field whose wire type is an enum drive the derived StateEventFor type to narrow those fields from plain `number` to the
  // literal-union of the mapping's numeric values. The tests below verify that narrowing through three lenses: positive assignment, negative assignment, and
  // exhaustive switch coverage.

  test("lock event.state accepts the LockState literal-union and assigning a non-member numeric literal errors", () => {

    const ok: StateEventFor<typeof ENTITY_SCHEMAS["lock"]> = {

      entity: "lock-front",
      key: 1,
      state: LockState.LOCKED,
      type: "lock"
    };

    // The state field accepts every member of the mapping's value-union. ESPHome API 1.14 added OPENING (6) and OPEN (7); the literal-union widened accordingly.
    const _members: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 = ok.state ?? 0;

    void _members;

    // @ts-expect-error - 99 is not a member of LockState; the narrowed type rejects it.
    const _bad: StateEventFor<typeof ENTITY_SCHEMAS["lock"]> = { entity: "lock-x", key: 2, state: 99, type: "lock" };

    void _bad;
    assert.equal(ok.state, LockState.LOCKED);
  });

  test("cover event.currentOperation narrows to the CoverOperation value-union", () => {

    const ok: StateEventFor<typeof ENTITY_SCHEMAS["cover"]> = {

      currentOperation: CoverOperation.IS_OPENING,
      entity: "cover-garage",
      key: 1,
      type: "cover"
    };

    const _members: 0 | 1 | 2 = ok.currentOperation ?? 0;

    void _members;

    // @ts-expect-error - 5 is outside CoverOperation's literal union; assignment errors.
    const _bad: StateEventFor<typeof ENTITY_SCHEMAS["cover"]> = { currentOperation: 5, entity: "cover-x", key: 2, type: "cover" };

    void _bad;
    assert.equal(ok.currentOperation, CoverOperation.IS_OPENING);
  });

  test("media-player event.state narrows to MediaPlayerState's value-union", () => {

    const ok: StateEventFor<typeof ENTITY_SCHEMAS["media_player"]> = {

      entity: "media_player-kitchen",
      key: 1,
      state: MediaPlayerState.PLAYING,
      type: "media_player"
    };

    // @ts-expect-error - 99 is not a MediaPlayerState member; the narrowed type rejects it.
    const _bad: StateEventFor<typeof ENTITY_SCHEMAS["media_player"]> = { entity: "media_player-x", key: 2, state: 99, type: "media_player" };

    void _bad;
    assert.equal(ok.state, MediaPlayerState.PLAYING);
  });

  test("climate event has multiple narrowed enum fields (mode + action + fanMode + swingMode + preset)", () => {

    const ok: StateEventFor<typeof ENTITY_SCHEMAS["climate"]> = {

      entity: "climate-main",
      key: 1,
      mode: ClimateMode.HEAT_COOL,
      type: "climate"
    };

    const _modeMembers: 0 | 1 | 2 | 3 | 4 | 5 | 6 = ok.mode ?? 0;

    void _modeMembers;

    // @ts-expect-error - 99 is outside ClimateMode's literal union.
    const _bad: StateEventFor<typeof ENTITY_SCHEMAS["climate"]> = { entity: "climate-x", key: 2, mode: 99, type: "climate" };

    void _bad;
    assert.equal(ok.mode, ClimateMode.HEAT_COOL);
  });

  test("exhaustive switch on lock event.state hits every LockState member", () => {

    // The narrowed event.state accepts every LockState member; an exhaustive switch covers all eight rails and the default branch is unreachable. Forgetting any rail
    // would either widen the assigned-to-never variable (catching the missing case) or break the assignment to `_exhaustive`. We use the standard `never` chokepoint
    // pattern below to prove exhaustiveness at the type level rather than at runtime.
    type LockEventState = NonNullable<StateEventFor<typeof ENTITY_SCHEMAS["lock"]>["state"]>;

    function checkExhaustive(state: LockEventState): string {

      switch(state) {

        case LockState.NONE: { return "none"; }
        case LockState.LOCKED: { return "locked"; }
        case LockState.UNLOCKED: { return "unlocked"; }
        case LockState.JAMMED: { return "jammed"; }
        case LockState.LOCKING: { return "locking"; }
        case LockState.UNLOCKING: { return "unlocking"; }
        case LockState.OPENING: { return "opening"; }
        case LockState.OPEN: { return "open"; }
        default: {

          const _exhaustive: never = state;

          return _exhaustive;
        }
      }
    }

    assert.equal(checkExhaustive(LockState.LOCKED), "locked");
    assert.equal(checkExhaustive(LockState.UNLOCKED), "unlocked");
  });

  test("narrowing flows through a handler's parameter type", () => {

    // The schema-derived narrowing must reach the handler's parameter on `client.on(type, handler)` style subscriptions. We model the typed entry-point with a generic
    // helper that mirrors the host's `ClientEventsMap[K]` signature and verify that the handler's `event` parameter has the narrowed `state` field.
    type LockEventAlias = StateEventFor<typeof ENTITY_SCHEMAS["lock"]>;

    function onLock(handler: (event: LockEventAlias) => void): void {

      handler({ entity: "lock-front", key: 1, state: LockState.LOCKED, type: "lock" });
    }

    let captured: LockEventAlias["state"];

    onLock((event) => {

      // Inside the handler, event.state narrows to the LockState union; assigning to a variable typed as the union is valid, and assigning a non-member numeric literal
      // would error (covered by the tests above).
      captured = event.state;
    });

    assert.equal(captured, LockState.LOCKED);
  });

  test("entity types without state-side enumMappings keep plain-number fields", () => {

    // Entity types whose state fields carry no wire-level enum (or have not declared enumMappings) should still see plain `number` for numeric fields. We verify with
    // `sensor`, whose `state` field is `float` and therefore unaffected by the narrowing.
    const ok: StateEventFor<typeof ENTITY_SCHEMAS["sensor"]> = {

      entity: "sensor-temp",
      key: 1,
      state: 22.5,
      type: "sensor"
    };

    const _state: number | undefined = ok.state;

    void _state;
    assert.equal(ok.state, 22.5);
  });
});

describe("CommandFor<S> per-entity narrowing", () => {

  test("light command accepts the rgb override field plus state and brightness", () => {

    const cmd: CommandFor<typeof ENTITY_SCHEMAS["light"]> = {

      brightness: 0.8,
      rgb: { b: 100, g: 200, r: 255 },
      state: true
    };

    assert.equal(cmd.state, true);
    assert.equal(cmd.brightness, 0.8);
  });

  test("light command accepts the rgb override field shape (b/g/r object) at the type level", () => {

    // The CommandOverrides table for light maps the four flat wire fields (red/green/blue/hasRgb) to a single ergonomic `rgb: { b, g, r }` object.
    // Verify the override-derived shape by constructing one directly.
    const cmd: CommandFor<typeof ENTITY_SCHEMAS["light"]> = { rgb: { b: 100, g: 200, r: 50 } };

    assert.deepEqual(cmd.rgb, { b: 100, g: 200, r: 50 });
  });

  test("switch command accepts state: boolean", () => {

    const cmd: CommandFor<typeof ENTITY_SCHEMAS["switch"]> = { state: true };

    assert.equal(cmd.state, true);
  });

  test("rejects passing a light command to a switch command-typed binding", () => {

    const lightCmd: CommandFor<typeof ENTITY_SCHEMAS["light"]> = { state: true };

    // @ts-expect-error - cross-entity command shapes are not assignable; switch and light have different field sets.
    const _bad: CommandFor<typeof ENTITY_SCHEMAS["switch"]> = { rgb: { b: 0, g: 0, r: 0 }, state: true };

    void _bad;
    void lightCmd;
    assert.equal(typeof lightCmd, "object");
  });
});

describe("EntityFor<S> distinction", () => {

  test("light entity has type='light'", () => {

    const ent: EntityFor<typeof ENTITY_SCHEMAS["light"]> = {

      key: 1,
      name: "Kitchen Lamp",
      objectId: "kitchen_lamp",
      type: "light"
    };

    const _t: "light" = ent.type;

    void _t;
    assert.equal(ent.type, "light");
  });

  test("rejects assigning a switch entity to a light entity", () => {

    const switchEntity: EntityFor<typeof ENTITY_SCHEMAS["switch"]> = {

      key: 2,
      name: "Front Door",
      objectId: "front_door",
      type: "switch"
    };

    // @ts-expect-error - entity tags exclude cross-type assignment.
    const _bad: EntityFor<typeof ENTITY_SCHEMAS["light"]> = switchEntity;

    void _bad;
    assert.equal(switchEntity.type, "switch");
  });
});
