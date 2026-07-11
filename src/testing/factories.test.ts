/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * factories.test.ts: Helper-coverage-parity tests for the testing/factories module.
 */
import { describe, test } from "node:test";
import { mockDeviceInfo, mockEntity, mockEntityDiscovery, mockHealth, mockStateMessage } from "./factories.ts";
import { HealthState } from "../health.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";

describe("mockEntity", () => {

  test("returns an entity with the canonical branded id and friendly default name", () => {

    const ent = mockEntity("light", "bedroom_lamp");

    assert.equal(ent.type, "light");
    assert.equal(ent.objectId, "bedroom_lamp");
    assert.equal(ent.name, "bedroom lamp", "default name replaces underscores with spaces");
    assert.equal(typeof ent.key, "number");
  });

  test("respects an explicit name override", () => {

    const ent = mockEntity("switch", "front_door", { name: "Custom Name" });

    assert.equal(ent.name, "Custom Name");
  });

  test("returns deterministic keys - two calls with the same type+id produce the same key", () => {

    const a = mockEntity("light", "kitchen");
    const b = mockEntity("light", "kitchen");

    assert.equal(a.key, b.key, "same type+id must produce the same deterministic key");
  });

  test("different object ids produce different keys", () => {

    const a = mockEntity("light", "kitchen");
    const b = mockEntity("light", "bedroom");

    assert.notEqual(a.key, b.key);
  });

  test("different entity types with the same object id produce different keys", () => {

    const light = mockEntity("light", "x");
    const sw = mockEntity("switch", "x");

    assert.notEqual(light.key, sw.key, "type distinction must propagate into the key");
  });

  test("merges overrides onto the synthesized base", () => {

    const ent = mockEntity("sensor", "temperature", { deviceClass: "temperature", unitOfMeasurement: "°C" });

    assert.equal((ent as Record<string, unknown>)["unitOfMeasurement"], "°C");
    assert.equal((ent as Record<string, unknown>)["deviceClass"], "temperature");
  });
});

describe("mockEntityDiscovery", () => {

  test("returns an empty array for an empty spec", () => {

    assert.deepEqual(mockEntityDiscovery({}), []);
  });

  test("synthesizes one entity per object id", () => {

    const entities = mockEntityDiscovery({ light: [ "a", "b", "c" ] });

    assert.equal(entities.length, 3);
    assert.equal(entities[0]?.type, "light");
    assert.equal(entities[2]?.objectId, "c");
  });

  test("handles multiple types in one spec", () => {

    const entities = mockEntityDiscovery({ light: ["a"], switch: [ "b", "c" ] });
    const types = entities.map((e) => e.type);

    assert.equal(types.includes("light"), true);
    assert.equal(types.includes("switch"), true);
    assert.equal(entities.length, 3);
  });

  test("skips entries with undefined ids array (defensive against unknown-shape input)", () => {

    // The helper guards against a type-cast spec that contains undefined values. We construct that path through `as` to exercise the guard without violating
    // exactOptionalPropertyTypes at the call site.
    const malformedSpec = { light: undefined } as unknown as Parameters<typeof mockEntityDiscovery>[0];
    const entities = mockEntityDiscovery(malformedSpec);

    assert.deepEqual(entities, []);
  });
});

describe("mockStateMessage", () => {

  test("returns an event with the entity, key, and type fields", () => {

    const id = entityId("light", "kitchen");
    const event = mockStateMessage(id, { state: true });

    assert.equal((event as Record<string, unknown>)["entity"], id);
    assert.equal((event as Record<string, unknown>)["type"], "light");
    assert.equal((event as Record<string, unknown>)["state"], true);
    assert.equal(typeof (event as Record<string, unknown>)["key"], "number");
  });

  test("merges per-type state fields onto the base", () => {

    const id = entityId("light", "x");
    const event = mockStateMessage(id, { brightness: 0.5, colorTemperature: 4000, state: true });

    assert.equal((event as Record<string, unknown>)["brightness"], 0.5);
    assert.equal((event as Record<string, unknown>)["colorTemperature"], 4000);
  });

  test("derives the type tag from the id prefix", () => {

    const id = entityId("sensor", "temp");
    const event = mockStateMessage(id, { state: 21.5 });

    assert.equal((event as Record<string, unknown>)["type"], "sensor");
  });
});

describe("mockDeviceInfo", () => {

  test("returns a complete DeviceInfo record with deterministic defaults", () => {

    const info = mockDeviceInfo();

    assert.equal(info.name, "test-device");
    assert.equal(info.macAddress, "AA:BB:CC:DD:EE:FF");
    assert.equal(info.manufacturer, "esphome");
    assert.equal(info.apiEncryptionSupported, false);
    assert.equal(info.voiceAssistantFeatureFlags, 0);
  });

  test("merges overrides onto the base", () => {

    const info = mockDeviceInfo({ apiEncryptionSupported: true, name: "custom-name", voiceAssistantFeatureFlags: 0xff });

    assert.equal(info.name, "custom-name");
    assert.equal(info.apiEncryptionSupported, true);
    assert.equal(info.voiceAssistantFeatureFlags, 0xff);
    assert.equal(info.manufacturer, "esphome", "non-overridden fields stay at the default");
  });

  test("returns a fresh object on each call", () => {

    const a = mockDeviceInfo();
    const b = mockDeviceInfo();

    a.name = "mutated";

    assert.equal(b.name, "test-device", "mutation must not leak across calls");
  });
});

describe("mockHealth", () => {

  test("returns a connected record stamped near now()", () => {

    const before = Date.now();
    const health = mockHealth();
    const after = Date.now();

    assert.equal(health.state, HealthState.CONNECTED);
    assert.equal(health.encrypted, false);
    assert.ok(health.lastInboundActivityAt >= before, "activity timestamp must be >= now");
    assert.ok(health.lastInboundActivityAt <= after, "activity timestamp must be <= now");
  });

  test("respects state override", () => {

    const health = mockHealth({ consecutiveStalls: 2, state: HealthState.STALLED });

    assert.equal(health.state, HealthState.STALLED);
    assert.equal(health.consecutiveStalls, 2);
  });

  test("respects encrypted override", () => {

    const health = mockHealth({ encrypted: true });

    assert.equal(health.encrypted, true);
  });
});
