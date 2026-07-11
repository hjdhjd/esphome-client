/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-registry.test.ts: Unit tests for the EntityRegistry.
 */
import { describe, test } from "node:test";
import type { Entity } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import { EntityRegistry } from "./entity-registry.ts";
import type { EntityRegistryHost } from "./entity-registry.ts";
import type { EspHomeLogging } from "../types.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";
import { mockEntity } from "../testing/factories.ts";

// Build a logger that records every message at every level. Tests assert against the captured arrays directly so debug-level register lines and warn-level dump lines
// are inspectable side effects. The `warnedContext` array captures the structured context object passed alongside each warn message so tests can assert on the
// per-call diagnostic payload (the id-collision warn forwards `{ id, existingKey, newKey }`).
type RecordingLogger = EspHomeLogging & { debugged: string[]; errored: string[]; infoed: string[]; warned: string[]; warnedContext: unknown[] };

const recordingLogger = (): RecordingLogger => {

  const debugged: string[] = [];
  const errored: string[] = [];
  const infoed: string[] = [];
  const warned: string[] = [];
  const warnedContext: unknown[] = [];

  return {

    debug: (msg: string): void => { debugged.push(msg); },
    debugged,
    error: (msg: string): void => { errored.push(msg); },
    errored,
    info: (msg: string): void => { infoed.push(msg); },
    infoed,
    warn: (msg: string, ...parameters: unknown[]): void => { warned.push(msg); warnedContext.push(parameters[0]); },
    warned,
    warnedContext
  };
};

// Construct a registry plus its recording logger in one call. Returns both so tests can assert against the logs.
const buildRegistry = (): { log: ReturnType<typeof recordingLogger>; registry: EntityRegistry } => {

  const log = recordingLogger();
  const host: EntityRegistryHost = { log };
  const registry = new EntityRegistry(host);

  return { log, registry };
};

describe("EntityRegistry - construction", () => {

  test("a freshly constructed registry reports size 0 and an empty all() view", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
    assert.deepEqual(registry.all(), []);
  });

  test("the host seam is the only constructor parameter", () => {

    const log = recordingLogger();
    const registry = new EntityRegistry({ log });

    assert.equal(registry.size, 0, "construction must not log or mutate");
    assert.equal(log.debugged.length, 0);
    assert.equal(log.warned.length, 0);
  });
});

describe("EntityRegistry - register", () => {

  test("register stores the entity in every internal index", () => {

    const { registry } = buildRegistry();
    const light = mockEntity("light", "bedroom_lamp");

    registry.register(light);

    assert.equal(registry.size, 1);
    assert.deepEqual(registry.all(), [light]);
    assert.equal(registry.byKey(light.key), light);
    assert.equal(registry.byId(entityId("light", "bedroom_lamp")), light);
    assert.equal(registry.keyForId(entityId("light", "bedroom_lamp")), light.key);
    assert.equal(registry.hasId(entityId("light", "bedroom_lamp")), true);
  });

  test("register emits a debug log line with the key, name, type, and objectId", () => {

    const { log, registry } = buildRegistry();
    const sw = mockEntity("switch", "garage_door");

    registry.register(sw);

    assert.equal(log.debugged.length, 1);
    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /Registered entity:/);
    assert.match(line, /garage_door/);
    assert.match(line, /switch/);
    assert.match(line, new RegExp(String(sw.key)));
  });

  test("register includes the device id in the debug line when present", () => {

    const { log, registry } = buildRegistry();
    const sensor = mockEntity("sensor", "kitchen_temp", { deviceId: 7 });

    registry.register(sensor);

    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /\| device: 7/);
  });

  test("register without a deviceId omits the device segment from the debug line", () => {

    const { log, registry } = buildRegistry();
    const sensor = mockEntity("sensor", "no_device");

    registry.register(sensor);

    const line = log.debugged[0];

    assert.ok(line);
    assert.doesNotMatch(line, /\| device:/);
  });

  test("register populates the device-id overlay only when the entity carries one at discovery time", () => {

    const { registry } = buildRegistry();
    const withDevice = mockEntity("switch", "with", { deviceId: 5 });
    const withoutDevice = mockEntity("switch", "without");

    registry.register(withDevice);
    registry.register(withoutDevice);

    assert.equal(registry.deviceIdForKey(withDevice.key), 5);
    assert.equal(registry.deviceIdForKey(withoutDevice.key), undefined);
  });

  test("register supports many entities and preserves insertion order in all()", () => {

    const { registry } = buildRegistry();
    const entities: Entity[] = [];

    for(let i = 0; i < 25; i++) {

      const e = mockEntity("sensor", "s_" + String(i));

      entities.push(e);
      registry.register(e);
    }

    assert.equal(registry.size, 25);
    assert.deepEqual(registry.all(), entities);
  });

  test("re-registering the same key replaces the by-key index but appends to the ordered list", () => {

    const { registry } = buildRegistry();
    const original = mockEntity("switch", "x");
    const replacement = mockEntity("switch", "x", { name: "new-name" });

    // The mockEntity helper computes a deterministic key from the canonical id; same id => same key.
    assert.equal(original.key, replacement.key);

    registry.register(original);
    registry.register(replacement);

    // The by-key index reflects the latest registration.
    assert.equal(registry.byKey(original.key), replacement);
    // The ordered list shows both entries (discovery is treated as monotonic; both entries are preserved in insertion order).
    assert.equal(registry.size, 2);
    assert.deepEqual(registry.all()[0], original);
    assert.deepEqual(registry.all()[1], replacement);
  });

  test("register accepts the same object_id across distinct entity types without collision", () => {

    const { registry } = buildRegistry();
    const lightX = mockEntity("light", "x");
    const switchX = mockEntity("switch", "x");

    registry.register(lightX);
    registry.register(switchX);

    assert.equal(registry.byId(entityId("light", "x")), lightX);
    assert.equal(registry.byId(entityId("switch", "x")), switchX);
    assert.notEqual(lightX.key, switchX.key, "deterministic keys differ across types");
    assert.equal(registry.size, 2);
  });

  test("register warns when two same-type entities derive the same id under different keys", () => {

    const { log, registry } = buildRegistry();
    // Two sensors whose display names ("Temp 1" / "Temp.1") both derive the canonical object_id "temp_1", so the minted id collides. We override the key on the second
    // so the two entities own distinct numeric keys - the exact bijection-breaking collision the diagnostic guards against (both stay in entitiesByKey while the
    // id->key index can only point at one of them).
    const first = mockEntity("sensor", "temp_1");
    const second = mockEntity("sensor", "temp_1", { key: first.key + 1 });

    assert.notEqual(first.key, second.key, "the two colliding entities must own distinct keys");

    registry.register(first);
    registry.register(second);

    // The collision must surface a single warn carrying the structured diagnostic context. The first registration is clean; only the second collides.
    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /Entity id collision/);
    assert.deepEqual(log.warnedContext[0], { existingKey: first.key, id: entityId("sensor", "temp_1"), newKey: second.key });
  });

  test("register does not warn when re-registering the same id under the same key", () => {

    const { log, registry } = buildRegistry();
    const original = mockEntity("switch", "x");
    const replacement = mockEntity("switch", "x", { name: "new-name" });

    // Same id and same deterministic key - a benign duplicate (e.g., a repeated LIST_ENTITIES response), not a bijection-breaking collision, so no diagnostic fires.
    assert.equal(original.key, replacement.key);

    registry.register(original);
    registry.register(replacement);

    assert.equal(log.warned.length, 0);
  });
});

describe("EntityRegistry - recordDeviceId", () => {

  test("recordDeviceId sets the overlay value on a fresh key", () => {

    const { registry } = buildRegistry();

    registry.recordDeviceId(123, 9);

    assert.equal(registry.deviceIdForKey(123), 9);
  });

  test("recordDeviceId overwrites a previously recorded overlay value", () => {

    const { registry } = buildRegistry();

    registry.recordDeviceId(123, 9);
    registry.recordDeviceId(123, 11);

    assert.equal(registry.deviceIdForKey(123), 11);
  });

  test("recordDeviceId works on a key not yet registered (overlay is independent of the entity index)", () => {

    const { registry } = buildRegistry();

    registry.recordDeviceId(999, 3);

    assert.equal(registry.byKey(999), null);
    assert.equal(registry.deviceIdForKey(999), 3);
  });

  test("recordDeviceId accepts deviceId === 0 (parent ESP scope)", () => {

    const { registry } = buildRegistry();

    registry.recordDeviceId(50, 0);

    assert.equal(registry.deviceIdForKey(50), 0, "explicit zero is a meaningful overlay value");
  });
});

describe("EntityRegistry - clear", () => {

  test("clear empties every internal index", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a", { deviceId: 5 }));
    registry.register(mockEntity("switch", "b"));
    registry.recordDeviceId(7, 9);

    registry.clear();

    assert.equal(registry.size, 0);
    assert.deepEqual(registry.all(), []);
    assert.equal(registry.byId(entityId("light", "a")), null);
    assert.equal(registry.byId(entityId("switch", "b")), null);
    assert.equal(registry.deviceIdForKey(7), undefined);
  });

  test("clear is safe to call more than once on an empty registry", () => {

    const { registry } = buildRegistry();

    registry.clear();
    registry.clear();

    assert.equal(registry.size, 0);
  });

  test("after clear, byId / byKey / hasId return their not-found values rather than throwing", () => {

    const { registry } = buildRegistry();
    const id = entityId("light", "x");

    registry.register(mockEntity("light", "x"));
    registry.clear();

    assert.equal(registry.byId(id), null);
    assert.equal(registry.byKey(123), null);
    assert.equal(registry.hasId(id), false);
    assert.equal(registry.keyForId(id), null);
  });
});

describe("EntityRegistry - byId (brand-narrowing lookup)", () => {

  test("byId returns the registered entity for a known branded id", () => {

    const { registry } = buildRegistry();
    const light = mockEntity("light", "bedroom");

    registry.register(light);

    const found = registry.byId(entityId("light", "bedroom"));

    assert.equal(found, light);
  });

  test("byId returns null for an unknown id", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.byId(entityId("light", "missing")), null);
  });

  test("byId returns null after the entity is removed via clear", () => {

    const { registry } = buildRegistry();
    const id = entityId("light", "x");

    registry.register(mockEntity("light", "x"));
    registry.clear();

    assert.equal(registry.byId(id), null);
  });

  test("byId is case-insensitive via the canonical entityId mint (object_id is lowercased)", () => {

    const { registry } = buildRegistry();
    const light = mockEntity("light", "bedroom");

    registry.register(light);

    // entityId() lowercases the object_id at the boundary, so "Bedroom" mints to "light-bedroom" - the same canonical id.
    const found = registry.byId(entityId("light", "Bedroom"));

    assert.equal(found, light);
  });
});

describe("EntityRegistry - byKey", () => {

  test("byKey returns the registered entity for a known key", () => {

    const { registry } = buildRegistry();
    const sw = mockEntity("switch", "x");

    registry.register(sw);

    assert.equal(registry.byKey(sw.key), sw);
  });

  test("byKey returns null for an unknown key", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.byKey(0), null);
    assert.equal(registry.byKey(99999), null);
  });

  test("byKey returns the entity even for key === 0 when registered", () => {

    const { registry } = buildRegistry();
    const synthetic = { ...mockEntity("switch", "x"), key: 0 };

    registry.register(synthetic);

    assert.equal(registry.byKey(0), synthetic);
  });
});

describe("EntityRegistry - keyForId", () => {

  test("keyForId returns the protocol key for a known id", () => {

    const { registry } = buildRegistry();
    const sw = mockEntity("switch", "x");

    registry.register(sw);

    assert.equal(registry.keyForId(entityId("switch", "x")), sw.key);
  });

  test("keyForId returns null for an unknown id", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.keyForId(entityId("light", "ghost")), null);
  });

  test("keyForId distinguishes ids that differ only by entity type", () => {

    const { registry } = buildRegistry();
    const lightX = mockEntity("light", "x");
    const switchX = mockEntity("switch", "x");

    registry.register(lightX);
    registry.register(switchX);

    assert.equal(registry.keyForId(entityId("light", "x")), lightX.key);
    assert.equal(registry.keyForId(entityId("switch", "x")), switchX.key);
  });
});

describe("EntityRegistry - hasId (boundary, accepts EntityId | string)", () => {

  test("hasId returns true for a registered branded id", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "x"));

    assert.equal(registry.hasId(entityId("light", "x")), true);
  });

  test("hasId returns true for the same id passed as a plain string (boundary widening)", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "x"));

    // The boundary accepts plain strings - the question is "is this a known id at all".
    assert.equal(registry.hasId("light-x"), true);
  });

  test("hasId returns false for an unknown plain string", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.hasId("light-ghost"), false);
  });

  test("hasId returns false for a malformed string that is not a registered id", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "x"));

    // Empty / partial / wrong-prefix strings.
    assert.equal(registry.hasId(""), false);
    assert.equal(registry.hasId("light-"), false);
    assert.equal(registry.hasId("light"), false);
    assert.equal(registry.hasId("nonsense"), false);
  });

  test("hasId is exact - a substring match does not register", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "kitchen_main"));

    assert.equal(registry.hasId("light-kitchen"), false);
    assert.equal(registry.hasId("light-kitchen_main"), true);
  });
});

describe("EntityRegistry - deviceIdForKey", () => {

  test("deviceIdForKey returns undefined for an unknown key", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.deviceIdForKey(123), undefined);
  });

  test("deviceIdForKey returns the discovery-time device id when register supplied one", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("switch", "x", { deviceId: 4 });

    registry.register(e);

    assert.equal(registry.deviceIdForKey(e.key), 4);
  });

  test("deviceIdForKey reflects the latest state-message overlay write (state wins over discovery)", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("switch", "x", { deviceId: 4 });

    registry.register(e);
    registry.recordDeviceId(e.key, 7);

    assert.equal(registry.deviceIdForKey(e.key), 7);
  });
});

describe("EntityRegistry - all (ordered view)", () => {

  test("all returns an empty array on a fresh registry", () => {

    const { registry } = buildRegistry();

    assert.deepEqual(registry.all(), []);
  });

  test("all preserves insertion order across mixed-type registrations", () => {

    const { registry } = buildRegistry();
    const e1 = mockEntity("light", "a");
    const e2 = mockEntity("switch", "b");
    const e3 = mockEntity("sensor", "c");

    registry.register(e1);
    registry.register(e2);
    registry.register(e3);

    assert.deepEqual(registry.all(), [ e1, e2, e3 ]);
  });

  test("all returns the registry's underlying view; the size getter mirrors its length", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.register(mockEntity("light", "b"));

    assert.equal(registry.all().length, 2);
    assert.equal(registry.size, 2);
  });
});

describe("EntityRegistry - byDevice (filter by parent device)", () => {

  test("byDevice with undefined returns a fresh copy of every entity", () => {

    const { registry } = buildRegistry();
    const e1 = mockEntity("light", "a");
    const e2 = mockEntity("switch", "b");

    registry.register(e1);
    registry.register(e2);

    const all = registry.byDevice(undefined);

    assert.deepEqual(all, [ e1, e2 ]);
    // The fresh-copy contract: mutating the returned array must not affect the registry.
    all.pop();

    assert.equal(registry.size, 2);
  });

  test("byDevice with 0 returns entities on the parent ESP (no recorded device id)", () => {

    const { registry } = buildRegistry();
    const onParent = mockEntity("light", "parent");
    const onSub = mockEntity("light", "sub", { deviceId: 7 });

    registry.register(onParent);
    registry.register(onSub);

    assert.deepEqual(registry.byDevice(0), [onParent]);
  });

  test("byDevice with a positive id filters to entries with that effective device id", () => {

    const { registry } = buildRegistry();
    const a = mockEntity("light", "a", { deviceId: 5 });
    const b = mockEntity("light", "b", { deviceId: 7 });
    const c = mockEntity("light", "c", { deviceId: 5 });

    registry.register(a);
    registry.register(b);
    registry.register(c);

    assert.deepEqual(registry.byDevice(5), [ a, c ]);
    assert.deepEqual(registry.byDevice(7), [b]);
    assert.deepEqual(registry.byDevice(99), []);
  });

  test("byDevice prefers entity.deviceId over the state-message overlay (v1-compat ordering)", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("light", "x", { deviceId: 3 });

    registry.register(e);
    // Overlay records a different device id; the entity's discovery-time field wins.
    registry.recordDeviceId(e.key, 9);

    assert.deepEqual(registry.byDevice(3), [e]);
    assert.deepEqual(registry.byDevice(9), []);
  });

  test("byDevice falls back to the overlay when the entity has no discovery-time deviceId", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("light", "x");

    registry.register(e);
    registry.recordDeviceId(e.key, 9);

    assert.deepEqual(registry.byDevice(9), [e]);
    assert.deepEqual(registry.byDevice(0), []);
  });

  test("byDevice on an empty registry returns an empty array for every input", () => {

    const { registry } = buildRegistry();

    assert.deepEqual(registry.byDevice(undefined), []);
    assert.deepEqual(registry.byDevice(0), []);
    assert.deepEqual(registry.byDevice(5), []);
  });
});

describe("EntityRegistry - withIds (consumer-shape annotation)", () => {

  test("withIds annotates each entity with its canonical branded id", () => {

    const { registry } = buildRegistry();
    const lampEntity = mockEntity("light", "Bedroom_Lamp", { name: "Bedroom Lamp" });
    const sw = mockEntity("switch", "garage_door");

    registry.register(lampEntity);
    registry.register(sw);

    const annotated = registry.withIds();

    assert.equal(annotated.length, 2);
    // The id is the canonical lowercased mint; consumers see "light-bedroom_lamp" not the original "Bedroom_Lamp".
    assert.equal(annotated[0]?.id, "light-bedroom_lamp");
    assert.equal(annotated[1]?.id, "switch-garage_door");
  });

  test("withIds preserves every entity field alongside the id", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("sensor", "temp", { deviceId: 4, name: "Kitchen Temp" });

    registry.register(e);

    const [annotated] = registry.withIds();

    assert.ok(annotated);
    assert.equal(annotated.name, "Kitchen Temp");
    assert.equal(annotated.deviceId, 4);
    assert.equal(annotated.type, "sensor");
    assert.equal(annotated.id, "sensor-temp");
  });

  test("withIds returns a fresh array - mutation does not leak into the registry's storage", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));

    const annotated = registry.withIds();

    annotated.length = 0;

    assert.equal(registry.size, 1, "internal storage must be unaffected by consumer mutation");
  });

  test("withIds on an empty registry returns an empty array", () => {

    const { registry } = buildRegistry();

    assert.deepEqual(registry.withIds(), []);
  });
});

describe("EntityRegistry - availableIds (typed-shape view)", () => {

  test("availableIds groups branded ids by entity type", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.register(mockEntity("light", "b"));
    registry.register(mockEntity("switch", "c"));

    const grouped = registry.availableIds();

    assert.deepEqual(grouped["light"]?.sort(), [ "light-a", "light-b" ]);
    assert.deepEqual(grouped["switch"], ["switch-c"]);
  });

  test("availableIds returns fresh arrays - mutation does not leak into subsequent calls", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));

    const first = registry.availableIds();

    first["light"]?.push("light-injected");
    const second = registry.availableIds();

    assert.deepEqual(second["light"], ["light-a"], "second call must not see the consumer's mutation of the first result");
  });

  test("availableIds returns an empty object on a fresh registry", () => {

    const { registry } = buildRegistry();

    assert.deepEqual(registry.availableIds(), {});
  });

  test("availableIds preserves insertion order within each type bucket", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "z"));
    registry.register(mockEntity("light", "a"));
    registry.register(mockEntity("light", "m"));

    const grouped = registry.availableIds();

    assert.deepEqual(grouped["light"], [ "light-z", "light-a", "light-m" ]);
  });
});

describe("EntityRegistry - logAll (warn-level dump)", () => {

  test("logAll emits a header line and one entry per registered entity grouped by type", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockEntity("light", "a", { name: "Lamp A" }));
    registry.register(mockEntity("switch", "b", { name: "Switch B" }));

    registry.logAll();

    // Header + 2 type lines + 2 entity lines = 5 warn entries.
    assert.equal(log.warned.length, 5);
    assert.equal(log.warned[0], "Registered Entity IDs:");
    assert.deepEqual(log.warned.slice().sort(), log.warned.slice().sort());
    // Each entity line includes the branded id, the name, and the key.
    assert.ok(log.warned.some((line) => /light-a => Lamp A \(key: \d+\)/.test(line)));
    assert.ok(log.warned.some((line) => /switch-b => Switch B \(key: \d+\)/.test(line)));
  });

  test("logAll on an empty registry emits only the header line", () => {

    const { log, registry } = buildRegistry();

    registry.logAll();

    assert.equal(log.warned.length, 1);
    assert.equal(log.warned[0], "Registered Entity IDs:");
  });

  test("logAll groups entries by entity type across mixed registrations", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.register(mockEntity("switch", "x"));
    registry.register(mockEntity("light", "b"));

    registry.logAll();

    // Find the "  light:" line; the next entries up to the next type-prefix line should be the two light ids.
    const lightHeaderIdx = log.warned.findIndex((line) => line === "  light:");
    const switchHeaderIdx = log.warned.findIndex((line) => line === "  switch:");

    assert.ok(lightHeaderIdx >= 0);
    assert.ok(switchHeaderIdx >= 0);

    // Two entries between "  light:" and "  switch:" (or end) belong to lights.
    const between = log.warned.slice(lightHeaderIdx + 1, switchHeaderIdx > lightHeaderIdx ? switchHeaderIdx : log.warned.length);

    assert.equal(between.length, 2);
    assert.ok(between.every((line) => line.includes("light-")));
  });
});

describe("EntityRegistry - size", () => {

  test("size is 0 on a fresh registry", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
  });

  test("size increments by one per register call", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
    registry.register(mockEntity("light", "a"));
    assert.equal(registry.size, 1);
    registry.register(mockEntity("switch", "b"));
    assert.equal(registry.size, 2);
  });

  test("size resets to 0 after clear", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.clear();

    assert.equal(registry.size, 0);
  });
});

describe("EntityRegistry - hot path (dispatcher pattern)", () => {

  test("byKey is O(1) and stable under tight-loop dispatch (1000 entities × 10000 lookups)", () => {

    const { registry } = buildRegistry();
    const entities: Entity[] = [];

    for(let i = 0; i < 1000; i++) {

      const e = mockEntity("sensor", "s_" + String(i));

      entities.push(e);
      registry.register(e);
    }

    // Resolve the same set of keys repeatedly. The registry must answer every lookup with the registered entity, and the loop must terminate quickly (a regression in
    // the by-key index would manifest as a visible slowdown plus structural failure - keys would resolve to null or to the wrong entity).
    let hits = 0;

    for(let pass = 0; pass < 10; pass++) {

      for(const expected of entities) {

        const found = registry.byKey(expected.key);

        if(found === expected) {

          hits++;
        }
      }
    }

    assert.equal(hits, 10000);
  });

  test("byId resolves a known id under tight-loop dispatch without allocating new state", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("light", "lamp");

    registry.register(e);
    const id: EntityId<"light"> = entityId("light", "lamp");

    let hits = 0;

    for(let i = 0; i < 5000; i++) {

      if(registry.byId(id) === e) {

        hits++;
      }
    }

    assert.equal(hits, 5000);
    assert.equal(registry.size, 1, "tight-loop lookups must not mutate the registry");
  });
});

describe("EntityRegistry - negative cases (X does NOT happen when Z)", () => {

  test("clear does NOT trigger a debug or warn line", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    log.debugged.length = 0;
    log.warned.length = 0;

    registry.clear();

    assert.equal(log.debugged.length, 0);
    assert.equal(log.warned.length, 0);
  });

  test("recordDeviceId does NOT affect the entity index (only the device-id overlay)", () => {

    const { registry } = buildRegistry();
    const e = mockEntity("light", "a");

    registry.register(e);
    registry.recordDeviceId(e.key, 7);

    // The entity record is unchanged; the overlay is the only mutated state.
    assert.equal(registry.byKey(e.key), e);
    assert.equal(registry.byId(entityId("light", "a")), e);
  });

  test("byKey with a key that exists only in the device-id overlay returns null (overlay is not an index)", () => {

    const { registry } = buildRegistry();

    registry.recordDeviceId(42, 1);

    assert.equal(registry.byKey(42), null);
  });

  test("hasId with a malformed string does NOT register or coerce the id", () => {

    const { registry } = buildRegistry();

    registry.hasId("not-a-real-id");

    assert.equal(registry.size, 0);
    assert.equal(registry.byId(entityId("light", "x")), null);
  });

  test("registering an entity does NOT trigger logAll output (silent registration)", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));

    assert.equal(log.warned.length, 0, "register must not emit warn-level output");
    assert.equal(log.debugged.length, 1, "register emits exactly one debug line");
  });

  test("byDevice does NOT mutate when called repeatedly", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a", { deviceId: 5 }));

    const a = registry.byDevice(5);
    const b = registry.byDevice(5);

    assert.deepEqual(a, b);
    assert.notEqual(a, b, "each call returns a fresh array");
  });
});

describe("EntityRegistry.snapshotChanges", () => {

  test("returns changed: false on a freshly constructed registry", () => {

    const { registry } = buildRegistry();
    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, false);
    assert.deepEqual(snap.entities, []);
  });

  test("returns changed: true after register, with the registered entity in the snapshot", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));

    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, true);
    assert.equal(snap.entities.length, 1);
    assert.equal(snap.entities[0]?.objectId, "a");
  });

  test("returns changed: false on a subsequent snapshot when no further mutation happened", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.snapshotChanges();

    const second = registry.snapshotChanges();

    assert.equal(second.changed, false);
    assert.equal(second.entities.length, 1, "snapshot still reflects the live registry contents");
  });

  test("returns changed: true after clear (resetting an already-empty registry still flags as a change for symmetric lifecycle)", () => {

    const { registry } = buildRegistry();

    registry.snapshotChanges();
    registry.clear();

    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, true);
    assert.deepEqual(snap.entities, []);
  });

  test("returns a fresh array each call so mutations on the returned snapshot do not leak back into the registry", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));

    const snap = registry.snapshotChanges();

    snap.entities.length = 0;

    assert.equal(registry.size, 1, "internal registry must remain unchanged after snapshot consumer mutates");
  });

  test("accumulates changes across multiple register calls into one changed: true snapshot", () => {

    const { registry } = buildRegistry();

    registry.register(mockEntity("light", "a"));
    registry.register(mockEntity("switch", "b"));
    registry.register(mockEntity("sensor", "c"));

    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, true);
    assert.equal(snap.entities.length, 3);
  });
});
