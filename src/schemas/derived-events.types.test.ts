/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * derived-events.types.test.ts: Type-level tests for the unified ApplyOverride generic and the schema-derived ClientEventsMap inheritance.
 */
import type { ApplyOverride, StateEventFor } from "./derived.ts";
import type { Assert, Equal } from "../internal/type-assertions.ts";
import { describe, test } from "node:test";
import type { Buffer } from "node:buffer";
import type { ClientEventsMap } from "../esphome-client.ts";
import type { ENTITY_SCHEMAS } from "./entity-schemas.ts";
import type { EntityType } from "./entity-types.ts";
import assert from "node:assert/strict";

// Local interfaces used by the ApplyOverride synthetic test cases. The lint rule prefers `interface` over `type` for plain object shapes, so we declare the
// per-suite wire shapes here once and reference them by name from the test bodies.

interface OneField {

  a: 1;
}

interface TwoFields {

  a: 1;
  c: 3;
}

interface ThreeFields {

  a: 1;
  c: 3;
  d: 4;
}

describe("ApplyOverride - intersection entry shape", () => {

  test("merges a plain object-literal entry into the wire shape via &", () => {

    // The entry has no omit+add tag, so the generic falls through to the refining branch `Omit<Wire, keyof Table[T]> & Table[T]`. Here the entry adds a
    // brand-new key `b`, so the `Omit` removes nothing and the result is equivalent to a plain intersection. We construct a value and round-trip its fields through
    // narrowed bindings to prove every member of both sides survives the merge.
    const r: ApplyOverride<OneField, "x", { x: { b: 2 } }> = { a: 1, b: 2 };
    const _a: 1 = r.a;
    const _b: 2 = r.b;

    assert.deepEqual(r, { a: 1, b: 2 });
  });
});

describe("ApplyOverride - refining entry shape (override wins over the wire key)", () => {

  test("re-declaring a wire key with a wider type widens it rather than collapsing back to the wire type", () => {

    // The entry RE-DECLARES `a` (already on the wire shape) with a wider type. ApplyOverride computes `Omit<Wire, keyof Table[T]> & Table[T]`, so the wire
    // side's `a` is omitted before the intersection runs and the override's type wins outright rather than being intersected against the wire type. The
    // result `a` is the override's `1 | 2`, so a value of `2` is assignable.
    const r: ApplyOverride<OneField, "x", { x: { a: 1 | 2 } }> = { a: 2 };
    const _a: 1 | 2 = r.a;

    assert.deepEqual(r, { a: 2 });
  });

  test("a refining entry tightens an array to readonly so it is not assignable to a mutable array", () => {

    // EntityOverrides.light tightens `effects`/`supportedColorModes` to readonly arrays for runtime-mutation prevention. Because the wire side's `effects` key
    // is omitted before the intersection runs, the override's readonly type wins outright rather than being intersected against the wire's mutable `string[]`,
    // so the field is not assignable to a mutable `string[]` target (which is what would let a caller push). The assertion below is non-executing - it assigns
    // the reference, never mutating - so the `@ts-expect-error` pins the compile-time contract without a runtime side effect. If the override ever failed to
    // win, the field would remain a mutable `string[]`, the assignment would compile, and the `@ts-expect-error` would be UNSATISFIED (itself a type error) -
    // the test fails closed against a regression.
    const r: ApplyOverride<{ effects: string[] }, "x", { x: { effects: readonly string[] } }> = { effects: ["a"] };

    // @ts-expect-error - the override tightened `effects` to a readonly array, so it is not assignable to a mutable `string[]`.
    const _mutable: string[] = r.effects;

    assert.deepEqual(r.effects, ["a"]);
  });
});

describe("ApplyOverride - omit+add entry shape", () => {

  test("strips wire keys named in `omit` and intersects in `add`", () => {

    // Construct the result without `c` - the override strips it. The `a` and `b` fields are required.
    const r: ApplyOverride<TwoFields, "x", { x: { add: { b: 2 }; omit: "c" } }> = { a: 1, b: 2 };
    const _a: 1 = r.a;
    const _b: 2 = r.b;

    // @ts-expect-error - the `c` field is omitted by the override and must not appear on the public shape.
    const _c: number = r.c;

    assert.deepEqual(r, { a: 1, b: 2 });
  });

  test("strips every key when `omit` is a union of strings, not just one branch", () => {

    // The `[Omitted] extends [string]` tuple-wrap in ApplyOverride prevents distribution. A naked `Omitted extends string` would distribute the conditional over the
    // union and produce `Omit<Wire, "c"> | Omit<Wire, "d">` - the union would then accept either `c` or `d` on the public shape because each member retains the other.
    // This test pins the correct behavior: BOTH `c` and `d` are stripped in one pass.
    const r: ApplyOverride<ThreeFields, "x", { x: { add: { b: 2 }; omit: "c" | "d" } }> = { a: 1, b: 2 };

    // @ts-expect-error - the `c` field is omitted by the override.
    const _c: number = r.c;

    // @ts-expect-error - the `d` field is omitted by the override.
    const _d: number = r.d;

    assert.deepEqual(r, { a: 1, b: 2 });
  });
});

describe("ApplyOverride - branching edge cases", () => {

  test("an entry with only `omit` (no `add`) does NOT trigger the omit+add path - it intersects verbatim", () => {

    // The entry lacks `add` so branching falls through to the intersection branch. The result intersects the entry onto the wire shape verbatim - the wire's `a`
    // survives and the entry's `omit: "z"` survives as a literal field on the result. This is the safety check that prevents an `{ omit: ... }`-only entry from
    // silently stripping a wire field.
    const r: ApplyOverride<OneField, "x", { x: { omit: "z" } }> = { a: 1, omit: "z" };
    const _a: 1 = r.a;
    const _omit: "z" = r.omit;

    assert.deepEqual(r, { a: 1, omit: "z" });
  });

  test("returns the wire shape unchanged when T is not a key of Table", () => {

    const r: ApplyOverride<OneField, "y", { x: { b: 2 } }> = { a: 1 };
    const _a: 1 = r.a;

    assert.deepEqual(r, { a: 1 });
  });
});

describe("ClientEventsMap - schema-derived equivalence per entity type", () => {

  // Adding a new entity type to ENTITY_SCHEMAS automatically extends ClientEventsMap via the SchemaEvents inheritance; these assertions hold the equivalence between
  // the bus payload type for each entity key and the schema-derived StateEventFor shape fixed, so a future divergence (e.g., a hand-shaped per-entity alias
  // accidentally rewritten) surfaces as a compile error here. Each claim is one `Assert<Equal<A, B>>` alias: `Equal` is stricter than assignability in both
  // directions, so it also rejects an accidental `any` on either side rather than accepting it silently.

  test("alarm_control_panel", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["alarm_control_panel"], StateEventFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>>>;

    assert.ok(true);
  });

  test("binary_sensor", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["binary_sensor"], StateEventFor<typeof ENTITY_SCHEMAS["binary_sensor"]>>>;

    assert.ok(true);
  });

  test("button", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["button"], StateEventFor<typeof ENTITY_SCHEMAS["button"]>>>;

    assert.ok(true);
  });

  test("camera - mutual assignability with the override-derived shape", () => {

    // Camera is the only entry in EventOverrides that uses the omit+add branching. The post-reassembly event drops the per-chunk wire plumbing
    // (data/done/deviceId) and adds image+name; the base tags type/entity/key survive so the camera arm of TelemetryEvent narrows uniformly with every other
    // arm. This test holds the consumer-visible shape fixed against the schema-derived StateEventFor projection.
    type _Equivalent = Assert<Equal<ClientEventsMap["camera"], StateEventFor<typeof ENTITY_SCHEMAS["camera"]>>>;

    assert.ok(true);
  });

  test("camera - public shape carries the five required fields and excludes wire-only fields", () => {

    type CameraPayload = ClientEventsMap["camera"];

    // The five fields a consumer must see on a post-reassembly camera event. Constructing the literal directly is the strongest check the type system offers because
    // the structural assignment verifies every required field is present and well-typed.
    const sample: CameraPayload = {

      entity: "camera-front",
      image: null as unknown as Buffer,
      key: 1,
      name: "Front Door",
      type: "camera"
    };

    // The five surviving fields narrow to their schema-derived types.
    const _entity: string = sample.entity;
    const _image: Buffer = sample.image;
    const _key: number = sample.key;
    const _name: string = sample.name;
    const _type: "camera" = sample.type;

    // The wire-only fields stripped by EventOverrides["camera"].omit must not appear on the consumer-facing camera event. Reading any of them would surface as a
    // compile error - the @ts-expect-error annotations hold the absence of each stripped key fixed.
    // @ts-expect-error - `data` is wire-only per-chunk plumbing and must not appear on the consumer-facing camera event.
    const _data: string = sample.data;

    // @ts-expect-error - `done` is wire-only per-chunk plumbing and must not appear on the consumer-facing camera event.
    const _done: boolean = sample.done;

    // @ts-expect-error - `deviceId` is wire-only routing metadata and must not appear on the consumer-facing camera event.
    const _deviceId: number | undefined = sample.deviceId;

    assert.ok(true);
  });

  test("climate", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["climate"], StateEventFor<typeof ENTITY_SCHEMAS["climate"]>>>;

    assert.ok(true);
  });

  test("cover", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["cover"], StateEventFor<typeof ENTITY_SCHEMAS["cover"]>>>;

    assert.ok(true);
  });

  test("date", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["date"], StateEventFor<typeof ENTITY_SCHEMAS["date"]>>>;

    assert.ok(true);
  });

  test("datetime", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["datetime"], StateEventFor<typeof ENTITY_SCHEMAS["datetime"]>>>;

    assert.ok(true);
  });

  test("event", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["event"], StateEventFor<typeof ENTITY_SCHEMAS["event"]>>>;

    assert.ok(true);
  });

  test("fan", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["fan"], StateEventFor<typeof ENTITY_SCHEMAS["fan"]>>>;

    assert.ok(true);
  });

  test("infrared (auto-extension proof: ClientEventsMap['infrared'] tracks the schema with no hand-edit)", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["infrared"], StateEventFor<typeof ENTITY_SCHEMAS["infrared"]>>>;

    assert.ok(true);
  });

  test("light", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["light"], StateEventFor<typeof ENTITY_SCHEMAS["light"]>>>;

    assert.ok(true);
  });

  test("lock", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["lock"], StateEventFor<typeof ENTITY_SCHEMAS["lock"]>>>;

    assert.ok(true);
  });

  test("media_player", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["media_player"], StateEventFor<typeof ENTITY_SCHEMAS["media_player"]>>>;

    assert.ok(true);
  });

  test("number", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["number"], StateEventFor<typeof ENTITY_SCHEMAS["number"]>>>;

    assert.ok(true);
  });

  test("radio_frequency (auto-extension proof: ClientEventsMap['radio_frequency'] tracks the schema with no hand-edit)", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["radio_frequency"], StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]>>>;

    assert.ok(true);
  });

  test("select", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["select"], StateEventFor<typeof ENTITY_SCHEMAS["select"]>>>;

    assert.ok(true);
  });

  test("sensor", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["sensor"], StateEventFor<typeof ENTITY_SCHEMAS["sensor"]>>>;

    assert.ok(true);
  });

  test("siren", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["siren"], StateEventFor<typeof ENTITY_SCHEMAS["siren"]>>>;

    assert.ok(true);
  });

  test("switch", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["switch"], StateEventFor<typeof ENTITY_SCHEMAS["switch"]>>>;

    assert.ok(true);
  });

  test("text", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["text"], StateEventFor<typeof ENTITY_SCHEMAS["text"]>>>;

    assert.ok(true);
  });

  test("text_sensor", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["text_sensor"], StateEventFor<typeof ENTITY_SCHEMAS["text_sensor"]>>>;

    assert.ok(true);
  });

  test("time", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["time"], StateEventFor<typeof ENTITY_SCHEMAS["time"]>>>;

    assert.ok(true);
  });

  test("update", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["update"], StateEventFor<typeof ENTITY_SCHEMAS["update"]>>>;

    assert.ok(true);
  });

  test("valve", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["valve"], StateEventFor<typeof ENTITY_SCHEMAS["valve"]>>>;

    assert.ok(true);
  });

  test("water_heater", () => {

    type _Equivalent = Assert<Equal<ClientEventsMap["water_heater"], StateEventFor<typeof ENTITY_SCHEMAS["water_heater"]>>>;

    assert.ok(true);
  });
});

describe("ClientEventsMap - SchemaEvents inheritance is exhaustive over ENTITY_SCHEMAS", () => {

  test("every EntityType key is a key of ClientEventsMap", () => {

    // If a future contributor adds a new entity type to ENTITY_SCHEMAS, the SchemaEvents mapped type extends ClientEventsMap automatically. This assertion pins the
    // rule: `EntityType extends keyof ClientEventsMap` must hold. A typo or accidental removal of the `extends SchemaEvents` clause would surface here as the
    // generic function failing to accept a value whose entity-type tag flows through to a bus channel.
    const subscribeOnce = <K extends EntityType>(_event: K, _payload: ClientEventsMap[K]): void => { /* discard */ };

    subscribeOnce("light", null as unknown as ClientEventsMap["light"]);
    subscribeOnce("camera", null as unknown as ClientEventsMap["camera"]);
    subscribeOnce("water_heater", null as unknown as ClientEventsMap["water_heater"]);

    assert.ok(true);
  });
});
