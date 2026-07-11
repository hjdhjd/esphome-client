/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * derived-events.types.test.ts: Type-level tests for the unified ApplyOverride generic and the schema-derived ClientEventsMap inheritance.
 */
import type { ApplyOverride, StateEventFor } from "./derived.ts";
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

    void _a;
    void _b;
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

    void _a;
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
    const mutable: string[] = r.effects;

    void mutable;
    assert.deepEqual(r.effects, ["a"]);
  });
});

describe("ApplyOverride - omit+add entry shape", () => {

  test("strips wire keys named in `omit` and intersects in `add`", () => {

    // Construct the result without `c` - the override strips it. The `a` and `b` fields are required.
    const r: ApplyOverride<TwoFields, "x", { x: { add: { b: 2 }; omit: "c" } }> = { a: 1, b: 2 };
    const _a: 1 = r.a;
    const _b: 2 = r.b;

    void _a;
    void _b;

    // @ts-expect-error - the `c` field is omitted by the override and must not appear on the public shape.
    const _c: number = r.c;

    void _c;
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

    void _c;
    void _d;
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

    void _a;
    void _omit;
    assert.deepEqual(r, { a: 1, omit: "z" });
  });

  test("returns the wire shape unchanged when T is not a key of Table", () => {

    const r: ApplyOverride<OneField, "y", { x: { b: 2 } }> = { a: 1 };
    const _a: 1 = r.a;

    void _a;
    assert.deepEqual(r, { a: 1 });
  });
});

describe("ClientEventsMap - schema-derived equivalence per entity type", () => {

  // Adding a new entity type to ENTITY_SCHEMAS automatically extends ClientEventsMap via the SchemaEvents inheritance; these assertions pin the equivalence between
  // the bus payload type for each entity key and the schema-derived StateEventFor shape, so a future divergence (e.g., a hand-shaped per-entity alias accidentally
  // rewritten) surfaces as a compile error here. We assert mutual assignability via paired `const _l: A = b; const _r: B = a;` so both directions are exercised.

  test("alarm_control_panel", () => {

    const l: ClientEventsMap["alarm_control_panel"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]> = null as unknown as ClientEventsMap["alarm_control_panel"];

    void l;
    void r;
    assert.ok(true);
  });

  test("binary_sensor", () => {

    const l: ClientEventsMap["binary_sensor"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["binary_sensor"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["binary_sensor"]> = null as unknown as ClientEventsMap["binary_sensor"];

    void l;
    void r;
    assert.ok(true);
  });

  test("button", () => {

    const l: ClientEventsMap["button"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["button"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["button"]> = null as unknown as ClientEventsMap["button"];

    void l;
    void r;
    assert.ok(true);
  });

  test("camera - mutual assignability with the override-derived shape", () => {

    // Camera is the only entry in EventOverrides that uses the omit+add branching. The post-reassembly event drops the per-chunk wire plumbing
    // (data/done/deviceId) and adds image+name; the base tags type/entity/key survive so the camera arm of TelemetryEvent narrows uniformly with every other
    // arm. This test pins the consumer-visible shape against the schema-derived StateEventFor projection.
    const l: ClientEventsMap["camera"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["camera"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["camera"]> = null as unknown as ClientEventsMap["camera"];

    void l;
    void r;
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

    void _entity;
    void _image;
    void _key;
    void _name;
    void _type;

    // The wire-only fields stripped by EventOverrides["camera"].omit must not appear on the consumer-facing camera event. Reading any of them would surface as a
    // compile error - the @ts-expect-error annotations pin the absence of each stripped key.
    // @ts-expect-error - `data` is wire-only per-chunk plumbing and must not appear on the consumer-facing camera event.
    const _data: string = sample.data;

    // @ts-expect-error - `done` is wire-only per-chunk plumbing and must not appear on the consumer-facing camera event.
    const _done: boolean = sample.done;

    // @ts-expect-error - `deviceId` is wire-only routing metadata and must not appear on the consumer-facing camera event.
    const _deviceId: number | undefined = sample.deviceId;

    void _data;
    void _done;
    void _deviceId;
    assert.ok(true);
  });

  test("climate", () => {

    const l: ClientEventsMap["climate"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["climate"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["climate"]> = null as unknown as ClientEventsMap["climate"];

    void l;
    void r;
    assert.ok(true);
  });

  test("cover", () => {

    const l: ClientEventsMap["cover"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["cover"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["cover"]> = null as unknown as ClientEventsMap["cover"];

    void l;
    void r;
    assert.ok(true);
  });

  test("date", () => {

    const l: ClientEventsMap["date"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["date"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["date"]> = null as unknown as ClientEventsMap["date"];

    void l;
    void r;
    assert.ok(true);
  });

  test("datetime", () => {

    const l: ClientEventsMap["datetime"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["datetime"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["datetime"]> = null as unknown as ClientEventsMap["datetime"];

    void l;
    void r;
    assert.ok(true);
  });

  test("event", () => {

    const l: ClientEventsMap["event"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["event"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["event"]> = null as unknown as ClientEventsMap["event"];

    void l;
    void r;
    assert.ok(true);
  });

  test("fan", () => {

    const l: ClientEventsMap["fan"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["fan"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["fan"]> = null as unknown as ClientEventsMap["fan"];

    void l;
    void r;
    assert.ok(true);
  });

  test("infrared (auto-extension proof: ClientEventsMap['infrared'] tracks the schema with no hand-edit)", () => {

    const l: ClientEventsMap["infrared"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["infrared"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["infrared"]> = null as unknown as ClientEventsMap["infrared"];

    void l;
    void r;
    assert.ok(true);
  });

  test("light", () => {

    const l: ClientEventsMap["light"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["light"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["light"]> = null as unknown as ClientEventsMap["light"];

    void l;
    void r;
    assert.ok(true);
  });

  test("lock", () => {

    const l: ClientEventsMap["lock"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["lock"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["lock"]> = null as unknown as ClientEventsMap["lock"];

    void l;
    void r;
    assert.ok(true);
  });

  test("media_player", () => {

    const l: ClientEventsMap["media_player"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["media_player"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["media_player"]> = null as unknown as ClientEventsMap["media_player"];

    void l;
    void r;
    assert.ok(true);
  });

  test("number", () => {

    const l: ClientEventsMap["number"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["number"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["number"]> = null as unknown as ClientEventsMap["number"];

    void l;
    void r;
    assert.ok(true);
  });

  test("radio_frequency (auto-extension proof: ClientEventsMap['radio_frequency'] tracks the schema with no hand-edit)", () => {

    const l: ClientEventsMap["radio_frequency"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]> = null as unknown as ClientEventsMap["radio_frequency"];

    void l;
    void r;
    assert.ok(true);
  });

  test("select", () => {

    const l: ClientEventsMap["select"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["select"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["select"]> = null as unknown as ClientEventsMap["select"];

    void l;
    void r;
    assert.ok(true);
  });

  test("sensor", () => {

    const l: ClientEventsMap["sensor"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["sensor"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["sensor"]> = null as unknown as ClientEventsMap["sensor"];

    void l;
    void r;
    assert.ok(true);
  });

  test("siren", () => {

    const l: ClientEventsMap["siren"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["siren"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["siren"]> = null as unknown as ClientEventsMap["siren"];

    void l;
    void r;
    assert.ok(true);
  });

  test("switch", () => {

    const l: ClientEventsMap["switch"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["switch"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["switch"]> = null as unknown as ClientEventsMap["switch"];

    void l;
    void r;
    assert.ok(true);
  });

  test("text", () => {

    const l: ClientEventsMap["text"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["text"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["text"]> = null as unknown as ClientEventsMap["text"];

    void l;
    void r;
    assert.ok(true);
  });

  test("text_sensor", () => {

    const l: ClientEventsMap["text_sensor"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["text_sensor"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["text_sensor"]> = null as unknown as ClientEventsMap["text_sensor"];

    void l;
    void r;
    assert.ok(true);
  });

  test("time", () => {

    const l: ClientEventsMap["time"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["time"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["time"]> = null as unknown as ClientEventsMap["time"];

    void l;
    void r;
    assert.ok(true);
  });

  test("update", () => {

    const l: ClientEventsMap["update"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["update"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["update"]> = null as unknown as ClientEventsMap["update"];

    void l;
    void r;
    assert.ok(true);
  });

  test("valve", () => {

    const l: ClientEventsMap["valve"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["valve"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["valve"]> = null as unknown as ClientEventsMap["valve"];

    void l;
    void r;
    assert.ok(true);
  });

  test("water_heater", () => {

    const l: ClientEventsMap["water_heater"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["water_heater"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["water_heater"]> = null as unknown as ClientEventsMap["water_heater"];

    void l;
    void r;
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
