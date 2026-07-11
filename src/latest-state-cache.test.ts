/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * latest-state-cache.test.ts: Unit tests for the per-entity latest-state cache.
 */
import { describe, test } from "node:test";
import type { EntityId } from "./entity-id.ts";
import { LatestStateCache } from "./latest-state-cache.ts";
import type { TelemetryEvent } from "./schemas/index.ts";
import assert from "node:assert/strict";
import { entityId } from "./entity-id.ts";

// Construct a tagged TelemetryEvent fixture. The cache treats events as opaque values keyed by id; we only need a minimum-viable shape with the matching `type`
// tag so `entriesFor` filters correctly. The double cast is the standard test-fixture seam.
function makeEvent(id: EntityId, type: string, fields: Record<string, unknown> = {}): TelemetryEvent {

  return { entity: id, key: 0, type, ...fields } as unknown as TelemetryEvent;
}

describe("LatestStateCache.set / get", () => {

  test("returns null for an entity that has never been set", () => {

    const cache = new LatestStateCache();
    const id = entityId("light", "kitchen");

    assert.equal(cache.get(id), null, "unset entity must return null");
  });

  test("returns the recorded event after set", () => {

    const cache = new LatestStateCache();
    const id = entityId("light", "kitchen");
    const event = makeEvent(id, "light", { state: true });

    cache.set(id, event);

    assert.deepEqual(cache.get(id), event, "get must return the event recorded by set");
  });

  test("overwrites a prior entry on a second set", () => {

    const cache = new LatestStateCache();
    const id = entityId("sensor", "temperature");
    const first = makeEvent(id, "sensor", { value: 20.5 });
    const second = makeEvent(id, "sensor", { value: 21.0 });

    cache.set(id, first);
    cache.set(id, second);

    assert.deepEqual(cache.get(id), second, "the second set must overwrite the first");
  });

  test("keeps separate entries for two ids of the same type", () => {

    const cache = new LatestStateCache();
    const a = entityId("switch", "front_door");
    const b = entityId("switch", "back_door");

    cache.set(a, makeEvent(a, "switch", { state: true }));
    cache.set(b, makeEvent(b, "switch", { state: false }));

    assert.equal(cache.get(a)?.entity, a, "id a must be keyed independently");
    assert.equal(cache.get(b)?.entity, b, "id b must be keyed independently");
  });

  test("keeps separate entries for the same objectId across different entity types", () => {

    const cache = new LatestStateCache();
    const lightId = entityId("light", "kitchen");
    const switchId = entityId("switch", "kitchen");

    cache.set(lightId, makeEvent(lightId, "light"));
    cache.set(switchId, makeEvent(switchId, "switch"));

    assert.notEqual(cache.get(lightId), null, "light entry must exist");
    assert.notEqual(cache.get(switchId), null, "switch entry must exist");
    assert.notEqual(cache.get(lightId)?.type, cache.get(switchId)?.type, "the two entries must be distinct");
  });
});

describe("LatestStateCache.clear", () => {

  test("clears every entry", () => {

    const cache = new LatestStateCache();
    const id = entityId("light", "kitchen");

    cache.set(id, makeEvent(id, "light"));
    cache.clear();

    assert.equal(cache.get(id), null, "get after clear must return null");
    assert.equal(cache.entries().size, 0, "entries() after clear must be empty");
  });

  test("clear on an empty cache is a no-op", () => {

    const cache = new LatestStateCache();

    cache.clear();

    assert.equal(cache.entries().size, 0, "clear on an empty cache must not throw");
  });
});

describe("LatestStateCache.entries", () => {

  test("returns the full map", () => {

    const cache = new LatestStateCache();
    const a = entityId("light", "kitchen");
    const b = entityId("switch", "front");

    cache.set(a, makeEvent(a, "light"));
    cache.set(b, makeEvent(b, "switch"));

    const entries = cache.entries();

    assert.equal(entries.size, 2, "entries must include every recorded id");
    assert.notEqual(entries.get(a), undefined, "entries must include id a");
    assert.notEqual(entries.get(b), undefined, "entries must include id b");
  });

  test("returns the live cache reference - subsequent mutations are visible", () => {

    const cache = new LatestStateCache();
    const id = entityId("light", "kitchen");
    const view = cache.entries();

    cache.set(id, makeEvent(id, "light"));

    assert.equal(view.size, 1, "entries returns a live view; new sets are visible without re-reading");
  });
});

describe("LatestStateCache.entriesFor", () => {

  test("returns only entries of the requested type", () => {

    const cache = new LatestStateCache();
    const lightA = entityId("light", "a");
    const lightB = entityId("light", "b");
    const switchC = entityId("switch", "c");

    cache.set(lightA, makeEvent(lightA, "light"));
    cache.set(lightB, makeEvent(lightB, "light"));
    cache.set(switchC, makeEvent(switchC, "switch"));

    const lights = cache.entriesFor("light");

    assert.equal(lights.size, 2, "entriesFor('light') must include both light entries");
    assert.notEqual(lights.get(lightA), undefined, "lightA must be present");
    assert.notEqual(lights.get(lightB), undefined, "lightB must be present");
  });

  test("returns an empty map when no entries match the requested type", () => {

    const cache = new LatestStateCache();
    const id = entityId("light", "kitchen");

    cache.set(id, makeEvent(id, "light"));

    const sensors = cache.entriesFor("sensor");

    assert.equal(sensors.size, 0, "entriesFor('sensor') must be empty when no sensor entries exist");
  });

  test("returns an empty map for an empty cache", () => {

    assert.equal(new LatestStateCache().entriesFor("light").size, 0, "entriesFor on an empty cache must be empty");
  });

  test("entriesFor returns a new map - subsequent cache mutations are NOT visible", () => {

    const cache = new LatestStateCache();
    const a = entityId("light", "a");

    cache.set(a, makeEvent(a, "light"));

    const snapshot = cache.entriesFor("light");

    cache.set(entityId("light", "b"), makeEvent(entityId("light", "b"), "light"));

    assert.equal(snapshot.size, 1, "entriesFor returns a frozen snapshot; later writes do not leak in");
  });
});
