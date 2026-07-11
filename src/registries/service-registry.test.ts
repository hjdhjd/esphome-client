/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * service-registry.test.ts: Unit tests for the ServiceRegistry.
 */
import type { ServiceArgument, ServiceEntity } from "../types.ts";
import { describe, test } from "node:test";
import type { EspHomeLogging } from "../types.ts";
import { ServiceArgType } from "../types.ts";
import { ServiceRegistry } from "./service-registry.ts";
import type { ServiceRegistryHost } from "./service-registry.ts";
import assert from "node:assert/strict";

// Build a logger that records every message at every level. Tests assert against the captured arrays directly so the debug-level register lines emitted by the registry
// are inspectable as side effects.
type RecordingLogger = EspHomeLogging & { debugged: string[]; errored: string[]; infoed: string[]; warned: string[] };

const recordingLogger = (): RecordingLogger => {

  const debugged: string[] = [];
  const errored: string[] = [];
  const infoed: string[] = [];
  const warned: string[] = [];

  return {

    debug: (msg: string): void => { debugged.push(msg); },
    debugged,
    error: (msg: string): void => { errored.push(msg); },
    errored,
    info: (msg: string): void => { infoed.push(msg); },
    infoed,
    warn: (msg: string): void => { warned.push(msg); },
    warned
  };
};

// Construct a registry plus its recording logger in one call. Returns both so tests can assert against the logs.
const buildRegistry = (): { log: ReturnType<typeof recordingLogger>; registry: ServiceRegistry } => {

  const log = recordingLogger();
  const host: ServiceRegistryHost = { log };
  const registry = new ServiceRegistry(host);

  return { log, registry };
};

// Inline mock-service factory. Services are simple value objects (key + name + args), so a small inline factory beats promoting a factories.ts helper for a single
// consumer; future tests that need shared service fixtures can promote this then.
const mockService = (overrides: Partial<ServiceEntity> & { key?: number; name?: string } = {}): ServiceEntity => ({

  args: overrides.args ?? [],
  key: overrides.key ?? Math.floor(Math.random() * 1_000_000),
  name: overrides.name ?? "test_service"
});

const mockArg = (name: string, type: ServiceArgType): ServiceArgument => ({ name, type });

describe("ServiceRegistry - construction", () => {

  test("a freshly constructed registry reports size 0 and an empty all() view", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
    assert.deepEqual(registry.all(), []);
  });

  test("the host seam is the only constructor parameter", () => {

    const log = recordingLogger();
    const registry = new ServiceRegistry({ log });

    assert.equal(registry.size, 0, "construction must not log or mutate");
    assert.equal(log.debugged.length, 0);
    assert.equal(log.warned.length, 0);
  });

  test("construction does not invoke any logger method", () => {

    const log = recordingLogger();

    new ServiceRegistry({ log });

    assert.equal(log.debugged.length, 0);
    assert.equal(log.errored.length, 0);
    assert.equal(log.infoed.length, 0);
    assert.equal(log.warned.length, 0);
  });
});

describe("ServiceRegistry - register", () => {

  test("register stores the service in both internal indexes", () => {

    const { registry } = buildRegistry();
    const service = mockService({ key: 42, name: "my_service" });

    registry.register(service);

    assert.equal(registry.size, 1);
    assert.deepEqual(registry.all(), [service]);
    assert.equal(registry.byKey(42), service);
    assert.equal(registry.byName("my_service"), service);
    assert.equal(registry.has(42), true);
  });

  test("register emits a debug log line with the key, name, and argument count", () => {

    const { log, registry } = buildRegistry();
    const service = mockService({

      args: [ mockArg("x", ServiceArgType.STRING), mockArg("y", ServiceArgType.INT) ],
      key: 7,
      name: "two_arg_service"
    });

    registry.register(service);

    assert.equal(log.debugged.length, 1);
    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /Registered service:/);
    assert.match(line, /two_arg_service/);
    assert.match(line, /\[7\]/);
    assert.match(line, /with 2 arguments/);
  });

  test("register emits the debug line with zero arguments when the service takes none", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "no_args" }));

    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /with 0 arguments/);
  });

  test("register supports many services and preserves insertion order in all()", () => {

    const { registry } = buildRegistry();
    const services: ServiceEntity[] = [];

    for(let i = 0; i < 25; i++) {

      const s = mockService({ key: i, name: "service_" + String(i) });

      services.push(s);
      registry.register(s);
    }

    assert.equal(registry.size, 25);
    assert.deepEqual(registry.all(), services);
  });

  test("re-registering the same key replaces the by-key index but appends to the ordered list", () => {

    const { registry } = buildRegistry();
    const original = mockService({ key: 7, name: "original" });
    const replacement = mockService({ key: 7, name: "replacement" });

    registry.register(original);
    registry.register(replacement);

    // The by-key index reflects the latest registration.
    assert.equal(registry.byKey(7), replacement);
    // The ordered list shows both entries (discovery is treated as monotonic; both entries are preserved in insertion order).
    assert.equal(registry.size, 2);
    assert.deepEqual(registry.all()[0], original);
    assert.deepEqual(registry.all()[1], replacement);
  });

  test("register accepts services with the same name but distinct keys (legal but unusual)", () => {

    const { registry } = buildRegistry();
    const a = mockService({ key: 1, name: "shared" });
    const b = mockService({ key: 2, name: "shared" });

    registry.register(a);
    registry.register(b);

    // Both records exist independently in the by-key index.
    assert.equal(registry.byKey(1), a);
    assert.equal(registry.byKey(2), b);
    // byName returns the first discovered (insertion-order semantics).
    assert.equal(registry.byName("shared"), a);
    assert.equal(registry.size, 2);
  });

  test("register accepts a service with key === 0 (boundary value)", () => {

    const { registry } = buildRegistry();
    const service = mockService({ key: 0, name: "zero_key" });

    registry.register(service);

    assert.equal(registry.byKey(0), service);
    assert.equal(registry.has(0), true);
    assert.equal(registry.byName("zero_key"), service);
  });
});

describe("ServiceRegistry - clear", () => {

  test("clear empties both internal indexes", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));
    registry.register(mockService({ key: 2, name: "b" }));

    registry.clear();

    assert.equal(registry.size, 0);
    assert.deepEqual(registry.all(), []);
    assert.equal(registry.byKey(1), null);
    assert.equal(registry.byKey(2), null);
    assert.equal(registry.byName("a"), null);
    assert.equal(registry.has(1), false);
  });

  test("clear is safe to call more than once on an empty registry", () => {

    const { registry } = buildRegistry();

    registry.clear();
    registry.clear();

    assert.equal(registry.size, 0);
  });

  test("after clear, byKey / byName / has return their not-found values rather than throwing", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 5, name: "x" }));
    registry.clear();

    assert.equal(registry.byKey(5), null);
    assert.equal(registry.byName("x"), null);
    assert.equal(registry.has(5), false);
  });

  test("registering after clear restores normal lookup behavior", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "old" }));
    registry.clear();
    registry.register(mockService({ key: 2, name: "new" }));

    assert.equal(registry.size, 1);
    assert.equal(registry.byKey(1), null, "old key must not survive clear");
    assert.equal(registry.byKey(2)?.name, "new");
    assert.equal(registry.byName("old"), null);
    assert.equal(registry.byName("new")?.key, 2);
  });
});

describe("ServiceRegistry - byKey", () => {

  test("byKey returns the registered service for a known key", () => {

    const { registry } = buildRegistry();
    const service = mockService({ key: 99, name: "known" });

    registry.register(service);

    assert.equal(registry.byKey(99), service);
  });

  test("byKey returns null for an unknown key", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.byKey(0), null);
    assert.equal(registry.byKey(99999), null);
  });

  test("byKey returns the service even for key === 0 when registered (zero is a valid key)", () => {

    const { registry } = buildRegistry();
    const service = mockService({ key: 0, name: "zero" });

    registry.register(service);

    assert.equal(registry.byKey(0), service);
  });

  test("byKey returns null for a negative key (defensive lookup, never registered)", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "x" }));

    assert.equal(registry.byKey(-1), null);
  });
});

describe("ServiceRegistry - byName", () => {

  test("byName returns the registered service for a known name", () => {

    const { registry } = buildRegistry();
    const service = mockService({ key: 1, name: "my_service" });

    registry.register(service);

    assert.equal(registry.byName("my_service"), service);
  });

  test("byName returns null for an unknown name", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.byName("ghost"), null);
  });

  test("byName returns null on an empty registry", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.byName(""), null);
    assert.equal(registry.byName("any"), null);
  });

  test("byName is case-sensitive (exact match)", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "MyService" }));

    assert.equal(registry.byName("MyService")?.name, "MyService");
    assert.equal(registry.byName("myservice"), null);
    assert.equal(registry.byName("MYSERVICE"), null);
  });

  test("byName returns the first match in discovery order when names collide", () => {

    const { registry } = buildRegistry();
    const first = mockService({ key: 1, name: "duplicate" });
    const second = mockService({ key: 2, name: "duplicate" });

    registry.register(first);
    registry.register(second);

    // First-discovered wins (linear scan returns the first match).
    assert.equal(registry.byName("duplicate"), first);
  });

  test("byName accepts an empty string but returns null when no service has an empty name", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "real" }));

    assert.equal(registry.byName(""), null);
  });
});

describe("ServiceRegistry - has", () => {

  test("has returns true for a registered key", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 42, name: "x" }));

    assert.equal(registry.has(42), true);
  });

  test("has returns false for an unknown key", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.has(42), false);
  });

  test("has returns true for key === 0 when registered (zero is a valid key)", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 0, name: "zero" }));

    assert.equal(registry.has(0), true);
  });

  test("has returns false after the service is removed via clear", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 5, name: "x" }));
    registry.clear();

    assert.equal(registry.has(5), false);
  });
});

describe("ServiceRegistry - all (ordered view)", () => {

  test("all returns an empty array on a fresh registry", () => {

    const { registry } = buildRegistry();

    assert.deepEqual(registry.all(), []);
  });

  test("all preserves insertion order across mixed registrations", () => {

    const { registry } = buildRegistry();
    const a = mockService({ key: 1, name: "a" });
    const b = mockService({ key: 2, name: "b" });
    const c = mockService({ key: 3, name: "c" });

    registry.register(a);
    registry.register(b);
    registry.register(c);

    assert.deepEqual(registry.all(), [ a, b, c ]);
  });

  test("all returns a stable view; the size getter mirrors its length", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));
    registry.register(mockService({ key: 2, name: "b" }));

    assert.equal(registry.all().length, 2);
    assert.equal(registry.size, 2);
  });
});

describe("ServiceRegistry - size", () => {

  test("size is 0 on a fresh registry", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
  });

  test("size increments by one per register call", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.size, 0);
    registry.register(mockService({ key: 1, name: "a" }));
    assert.equal(registry.size, 1);
    registry.register(mockService({ key: 2, name: "b" }));
    assert.equal(registry.size, 2);
  });

  test("size increments even when the same key is re-registered (ordered list grows)", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "first" }));
    registry.register(mockService({ key: 1, name: "second" }));

    assert.equal(registry.size, 2);
  });

  test("size resets to 0 after clear", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));
    registry.clear();

    assert.equal(registry.size, 0);
  });
});

describe("ServiceRegistry - hot path (execute pipeline)", () => {

  test("byKey is O(1) and stable under tight-loop dispatch (10 services × 5000 lookups)", () => {

    const { registry } = buildRegistry();
    const services: ServiceEntity[] = [];

    for(let i = 0; i < 10; i++) {

      const s = mockService({ key: i, name: "svc_" + String(i) });

      services.push(s);
      registry.register(s);
    }

    let hits = 0;

    for(let pass = 0; pass < 500; pass++) {

      for(const expected of services) {

        const found = registry.byKey(expected.key);

        if(found === expected) {

          hits++;
        }
      }
    }

    assert.equal(hits, 5000);
  });

  test("byName scales linearly but stays correct at the realistic upper bound (100 services × 100 lookups)", () => {

    const { registry } = buildRegistry();
    const services: ServiceEntity[] = [];

    // 100 services - well above the typical ESPHome firmware's count, but a deliberate stress on the linear scan to surface any structural regression.
    for(let i = 0; i < 100; i++) {

      const s = mockService({ key: i, name: "name_" + String(i) });

      services.push(s);
      registry.register(s);
    }

    let hits = 0;

    for(let i = 0; i < 100; i++) {

      const expected = services[i];

      assert.ok(expected);

      if(registry.byName(expected.name) === expected) {

        hits++;
      }
    }

    assert.equal(hits, 100);
    assert.equal(registry.size, 100, "tight-loop lookups must not mutate the registry");
  });
});

describe("ServiceRegistry - negative cases (X does NOT happen when Z)", () => {

  test("clear does NOT trigger any log line", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));
    log.debugged.length = 0;

    registry.clear();

    assert.equal(log.debugged.length, 0);
    assert.equal(log.warned.length, 0);
    assert.equal(log.errored.length, 0);
    assert.equal(log.infoed.length, 0);
  });

  test("byKey on an unknown key does NOT mutate the registry", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));

    registry.byKey(99);
    registry.byKey(99);

    assert.equal(registry.size, 1);
  });

  test("byName on an unknown name does NOT mutate the registry", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));

    registry.byName("ghost");

    assert.equal(registry.size, 1);
    assert.equal(registry.byName("a")?.key, 1);
  });

  test("registering a service does NOT emit a warn or error log line (debug only)", () => {

    const { log, registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));

    assert.equal(log.warned.length, 0);
    assert.equal(log.errored.length, 0);
    assert.equal(log.infoed.length, 0);
    assert.equal(log.debugged.length, 1, "register emits exactly one debug line");
  });

  test("has does NOT register or coerce the queried key", () => {

    const { registry } = buildRegistry();

    assert.equal(registry.has(99), false);
    // The key was not magically inserted by the membership check.
    assert.equal(registry.size, 0);
    assert.equal(registry.byKey(99), null);
  });

  test("all() does NOT return a fresh array per call (the readonly view is stable)", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "a" }));

    // Both calls return the same underlying storage view; consumers needing a mutable copy must spread or slice. This is the same contract EntityRegistry.all() exposes.
    assert.equal(registry.all(), registry.all());
  });
});

describe("ServiceRegistry.snapshotChanges", () => {

  test("returns changed: false on a freshly constructed registry", () => {

    const { registry } = buildRegistry();
    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, false);
    assert.deepEqual(snap.services, []);
  });

  test("returns changed: true after register, with the registered service in the snapshot", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "ring" }));

    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, true);
    assert.equal(snap.services.length, 1);
    assert.equal(snap.services[0]?.name, "ring");
  });

  test("returns changed: false on a subsequent snapshot when no further mutation happened", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "ring" }));
    registry.snapshotChanges();

    const second = registry.snapshotChanges();

    assert.equal(second.changed, false);
    assert.equal(second.services.length, 1);
  });

  test("returns changed: true after clear (resetting an already-empty registry still flags as a change for symmetric lifecycle)", () => {

    const { registry } = buildRegistry();

    registry.snapshotChanges();
    registry.clear();

    const snap = registry.snapshotChanges();

    assert.equal(snap.changed, true);
    assert.deepEqual(snap.services, []);
  });

  test("returns a fresh array each call so mutations on the returned snapshot do not leak back into the registry", () => {

    const { registry } = buildRegistry();

    registry.register(mockService({ key: 1, name: "ring" }));

    const snap = registry.snapshotChanges();

    snap.services.length = 0;

    assert.equal(registry.size, 1);
  });
});
