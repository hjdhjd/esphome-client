/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * adapters.test.ts: Unit tests for the COMMAND_ADAPTERS runtime mirror table.
 */
import { describe, test } from "node:test";
import { COMMAND_ADAPTERS } from "./adapters.ts";
import assert from "node:assert/strict";

describe("COMMAND_ADAPTERS.light", () => {

  const light = COMMAND_ADAPTERS.light;

  test("is defined", () => {

    assert.notEqual(light, undefined, "light adapter must exist (rgb expansion is required for the wire shape)");
  });

  test("expands rgb: { r, g, b } into flat red/green/blue/hasRgb wire fields", () => {

    const out = light!({ rgb: { b: 80, g: 100, r: 255 }, state: true });

    assert.equal(out["red"], 255);
    assert.equal(out["green"], 100);
    assert.equal(out["blue"], 80);
    assert.equal(out["hasRgb"], true);
  });

  test("drops the rgb key after expansion so the encoder doesn't see it", () => {

    const out = light!({ rgb: { b: 0, g: 0, r: 0 } });

    assert.equal(("rgb" in out), false, "rgb must not appear in the encoded options");
  });

  test("preserves other keys verbatim", () => {

    const out = light!({ brightness: 0.5, rgb: { b: 0, g: 0, r: 0 }, state: true, transitionLength: 1000 });

    assert.equal(out["brightness"], 0.5);
    assert.equal(out["state"], true);
    assert.equal(out["transitionLength"], 1000);
  });

  test("returns the input unchanged when rgb is absent", () => {

    const out = light!({ brightness: 0.8, state: true });

    assert.equal(("rgb" in out), false);
    assert.equal(("hasRgb" in out), false, "hasRgb must NOT be set when rgb was not supplied - the consumer didn't ask for color change");
    assert.equal(out["brightness"], 0.8);
  });

  test("does not mutate the input object", () => {

    const input = { rgb: { b: 1, g: 2, r: 3 }, state: true };
    const inputBefore = JSON.stringify(input);

    light!(input);

    assert.equal(JSON.stringify(input), inputBefore, "adapter must produce a fresh object - input must remain pristine");
  });
});

describe("COMMAND_ADAPTERS.siren", () => {

  const siren = COMMAND_ADAPTERS.siren;

  test("is defined", () => {

    assert.notEqual(siren, undefined);
  });

  test("rounds a fractional duration to the nearest integer", () => {

    assert.equal(siren!({ duration: 1.4 })["duration"], 1);
    assert.equal(siren!({ duration: 1.5 })["duration"], 2, "0.5 rounds up per Math.round");
    assert.equal(siren!({ duration: 2.99 })["duration"], 3);
  });

  test("preserves an already-integer duration unchanged", () => {

    assert.equal(siren!({ duration: 5 })["duration"], 5);
  });

  test("preserves other keys verbatim", () => {

    const out = siren!({ duration: 1.5, state: true, tone: "fire", volume: 0.8 });

    assert.equal(out["state"], true);
    assert.equal(out["tone"], "fire");
    assert.equal(out["volume"], 0.8);
  });

  test("returns the input unchanged when duration is absent", () => {

    const out = siren!({ state: false });

    assert.equal(("duration" in out), false);
    assert.equal(out["state"], false);
  });

  test("does not mutate the input object", () => {

    const input = { duration: 1.5, state: true };
    const before = JSON.stringify(input);

    siren!(input);

    assert.equal(JSON.stringify(input), before);
  });
});

describe("COMMAND_ADAPTERS - other entity types", () => {

  test("does NOT have an adapter for switch (no public-vs-wire divergence)", () => {

    assert.equal(COMMAND_ADAPTERS.switch, undefined, "switch's wire shape matches the public API directly; no adapter needed");
  });

  test("does NOT have an adapter for cover", () => {

    assert.equal(COMMAND_ADAPTERS.cover, undefined);
  });

  test("does NOT have an adapter for fan", () => {

    assert.equal(COMMAND_ADAPTERS.fan, undefined);
  });
});
