/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reissuable-subscription.test.ts: Unit tests for the ReissuableSubscription primitive, simulating every streaming sub-API consumer shape.
 */
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

/*
 * Each test below SIMULATES one of the streaming sub-API consumer shapes the primitive must serve, recording wire effects through a mock `onChange` / `onReissue`.
 * The test groups, and the consumer shape or protocol behavior each exercises:
 *
 *   1. Global-key presence with unsubscribe  -> Z-Wave / Bluetooth advertisement (K = constant, V = unit, reduce = any-present -> SUBSCRIBED, empty -> EMPTY).
 *   2. Global-key, no-unsubscribe             -> Bluetooth connections-free / Log-on-empty (onChange ignores EMPTY).
 *   3. retainOnEmpty: true                    -> no-unsubscribe protocol where the cache persists on empty rather than clearing.
 *   4. Per-instance keyed                     -> Serial (K = number, independent per-instance SUBSCRIBE / UNSUBSCRIBE).
 *   5. Ledger-view reads                      -> count / activeKeys introspection accessors over the live subscriber ledger.
 *   6. Level-aggregation                      -> Log (K = global, V = LogLevel number, reduce = Math.max).
 *   7. Per-(address, handle) reissue-only     -> Bluetooth notify (onChange omitted; reissueOnReconnect replays onReissue per live key).
 *   8. Reconnect continuity                   -> the must-fix core (clearConnectionState preserves subscribers, reissueOnReconnect replays).
 *   9. Dispose-after-reconnect correctness    -> the survivor's post-reconnect release still drives the correct UNSUBSCRIBE.
 *  10. Safe double-release / EMPTY paths / custom equals.
 *
 * A wire effect is recorded as a { key, desired } tuple where `desired` is either the concrete desired-state or the EMPTY sentinel. A small recorder helper lets each
 * test read as "do X, assert the recorded wire effects are Y".
 */

// A presence marker used by the unit-valued consumers (Z-Wave, Serial, Bluetooth). `SUBSCRIBED` is the single concrete desired-state; the absence of subscribers reduces
// to the EMPTY sentinel instead.
const SUBSCRIBED = "SUBSCRIBED" as const;

// The single constant wire key the global-scope consumers (Z-Wave, Bluetooth advertisement / connections-free, Log) group under. Its actual value is irrelevant; what
// matters is that every subscriber shares the same key so they aggregate into one wire subscription.
const GLOBAL = 0;

// A typed record of a single wire effect: the key it fired for and the desired-state (or EMPTY) it carried.
interface WireEffect<K, D> {

  desired: D | typeof EMPTY;
  key: K;
}

// A recorder paired with an onChange / onReissue hook that appends each invocation to it. We return both so a test can assert against the recorded effects and, where it
// needs the same recorder to back both hooks, share one array.
interface Recorder<K, D> {

  effects: WireEffect<K, D>[];
  record: (key: K, desired: D | typeof EMPTY) => void;
}

// Build a fresh recorder. The `record` closure pushes each invocation onto the `effects` array so a test reads the wire effects in the order they fired.
function makeRecorder<K, D>(): Recorder<K, D> {

  const effects: WireEffect<K, D>[] = [];

  const record = (key: K, desired: D | typeof EMPTY): void => {

    effects.push({ desired, key });
  };

  return { effects, record };
}

describe("ReissuableSubscription - global-key presence with unsubscribe (Z-Wave / Bluetooth advertisement shape)", () => {

  // Z-Wave and Bluetooth advertisement subscribe with a single SUBSCRIBE on the first consumer and a single UNSUBSCRIBE when the last leaves. The wire key is a constant,
  // the intent is a unit, and the reduction is "any present -> SUBSCRIBED, empty -> EMPTY". The onChange hook treats EMPTY as a wire UNSUBSCRIBE.
  function makeZwave(): { effects: WireEffect<number, typeof SUBSCRIBED>[]; sub: ReissuableSubscription<number, void, typeof SUBSCRIBED> } {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    return { effects, sub };
  }

  test("first acquire emits SUBSCRIBE; second acquire does not re-emit", () => {

    const { effects, sub } = makeZwave();

    const first = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the first subscriber must emit a single SUBSCRIBE");

    const second = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the second subscriber must not re-emit; the device is already subscribed");
    assert.equal(sub.size, 2);
    assert.equal(sub.peek(GLOBAL), SUBSCRIBED);
    assert.equal(typeof first, "symbol");
    assert.equal(typeof second, "symbol");
  });

  test("first release does not emit; last release emits UNSUBSCRIBE (EMPTY)", () => {

    const { effects, sub } = makeZwave();
    const first = sub.acquire(GLOBAL, undefined);
    const second = sub.acquire(GLOBAL, undefined);

    // Drain the SUBSCRIBE the first acquire produced so the assertions below only see release-driven effects.
    effects.length = 0;

    sub.release(first);

    assert.deepEqual(effects, [], "releasing a non-last subscriber must not emit; another subscriber still holds the key");

    sub.release(second);

    assert.deepEqual(effects, [{ desired: EMPTY, key: GLOBAL }], "releasing the last subscriber must emit a single UNSUBSCRIBE (EMPTY)");
    assert.equal(sub.size, 0);
    assert.equal(sub.peek(GLOBAL), undefined, "the cache entry must be removed once the key has no subscribers");
  });
});

describe("ReissuableSubscription - global-key, no-unsubscribe (Bluetooth connections-free / Log-on-empty shape)", () => {

  // Bluetooth connections-free and Log subscribe on the first consumer but have no unsubscribe frame on the wire. The primitive still fires onChange(EMPTY) on the last
  // release; the consumer's onChange simply ignores it. This proves the EMPTY transition is the consumer's decision, not the primitive's.
  test("last release emits nothing when onChange ignores EMPTY", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: (key, desired): void => {

        // The connections-free / log shape has no unsubscribe frame, so we swallow the EMPTY transition and only record a concrete SUBSCRIBE.
        if(desired === EMPTY) {

          return;
        }

        record(key, desired);
      },
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const handle = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the first subscriber must emit SUBSCRIBE");

    sub.release(handle);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the last release must emit nothing on the wire when the consumer ignores EMPTY");
    assert.equal(sub.size, 0);
    assert.equal(sub.peek(GLOBAL), undefined, "the cache entry is still removed even though no wire frame was sent");
  });
});

describe("ReissuableSubscription - retainOnEmpty: true (no-unsubscribe protocol; cache persists on empty)", () => {

  // Protocols with NO unsubscribe frame (Log, Bluetooth connections-free) keep firing until the connection drops. retainOnEmpty: true makes the empty transition wire-
  // silent AND retains the cache, so peek keeps reporting the level the device is still at and a same-level re-acquire after an idle gap does not re-issue a redundant
  // subscribe. The wire key is a constant, the intent is a unit, and the reduction is "any present -> SUBSCRIBED, empty -> EMPTY".
  function makeRetained(): { effects: WireEffect<number, typeof SUBSCRIBED>[]; sub: ReissuableSubscription<number, void, typeof SUBSCRIBED> } {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED,
      retainOnEmpty: true
    });

    return { effects, sub };
  }

  test("last release does NOT fire onChange and peek STILL returns the desired-state (the cache persists)", () => {

    const { effects, sub } = makeRetained();
    const handle = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the first subscriber must emit SUBSCRIBE");

    sub.release(handle);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "the last release must NOT fire onChange - there is no unsubscribe frame and nothing to forget");
    assert.equal(sub.size, 0, "the ledger empties even though the cache is retained");
    assert.equal(sub.peek(GLOBAL), SUBSCRIBED, "the cache PERSISTS on the empty transition so peek keeps reporting the level the device is still at");
  });

  test("re-acquiring at the SAME level after the set emptied is wire-SILENT (no redundant onChange)", () => {

    const { effects, sub } = makeRetained();
    const first = sub.acquire(GLOBAL, undefined);

    sub.release(first);

    // Drain the initial SUBSCRIBE so the assertion below only sees the re-acquire's effects.
    effects.length = 0;

    const second = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [], "a same-level re-acquire after the retained-empty gap must be silent - the device is still subscribed at that level");
    assert.equal(sub.peek(GLOBAL), SUBSCRIBED);
    assert.equal(typeof second, "symbol");
  });

  test("re-acquiring at a DIFFERENT level after the set emptied DOES fire onChange", () => {

    const { effects, record } = makeRecorder<number, number>();

    // A Math.max reducer over numeric levels: the retained cache holds the prior level, so a re-acquire at a HIGHER level changes the desired-state and must emit.
    const sub = new ReissuableSubscription<number, number, number>({

      onChange: record,
      reduce: (intents): number | typeof EMPTY => intents.length === 0 ? EMPTY : Math.max(...intents),
      retainOnEmpty: true
    });

    const low = sub.acquire(GLOBAL, 3);

    sub.release(low);

    // The cache retained level 3. Re-acquiring at level 5 changes the desired-state, so onChange must fire for the new level.
    effects.length = 0;

    sub.acquire(GLOBAL, 5);

    assert.deepEqual(effects, [{ desired: 5, key: GLOBAL }], "a re-acquire at a different level after the retained-empty gap must emit the new level");
    assert.equal(sub.peek(GLOBAL), 5);
  });

  test("clearConnectionState still clears the persisted cache (a fresh connection starts with no subscription)", () => {

    const { sub } = makeRetained();
    const handle = sub.acquire(GLOBAL, undefined);

    sub.release(handle);

    // The cache persisted across the empty transition...
    assert.equal(sub.peek(GLOBAL), SUBSCRIBED);

    sub.clearConnectionState();

    // ...but clearConnectionState clears it unconditionally, because the device genuinely starts every fresh connection with no subscription.
    assert.equal(sub.peek(GLOBAL), undefined, "retainOnEmpty persists the cache on empty, but clearConnectionState still wipes it on connect");
  });

  test("retained empty followed by a live re-acquire then a real reconnect re-arms only via live subscribers", () => {

    const { effects, sub } = makeRetained();
    const handle = sub.acquire(GLOBAL, undefined);

    // Drop the only subscriber: the cache is retained but the ledger is empty.
    sub.release(handle);
    effects.length = 0;

    // A reconnect clears the cache and replays only keys that still have live subscribers. With zero live subscribers, nothing is replayed - the retained cache does not
    // resurrect a subscription the device no longer has on a fresh connection.
    sub.reissueOnReconnect();

    assert.deepEqual(effects, [], "a reconnect with no live subscribers must not replay the retained-but-emptied key");
    assert.equal(sub.peek(GLOBAL), undefined, "reissueOnReconnect clears the retained cache and replays nothing for an emptied key");
  });
});

describe("ReissuableSubscription - per-instance keyed (Serial shape)", () => {

  // Serial subscribes per UART instance: each instance number is its own wire key, with its own SUBSCRIBE / UNSUBSCRIBE lifecycle. One instance's subscribers must not
  // affect another instance's wire state.
  function makeSerial(): { effects: WireEffect<number, typeof SUBSCRIBED>[]; sub: ReissuableSubscription<number, void, typeof SUBSCRIBED> } {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    return { effects, sub };
  }

  test("SUBSCRIBE / UNSUBSCRIBE fire per-instance independently", () => {

    const { effects, sub } = makeSerial();

    const instanceOne = sub.acquire(1, undefined);
    const instanceTwo = sub.acquire(2, undefined);

    assert.deepEqual(effects, [ { desired: SUBSCRIBED, key: 1 }, { desired: SUBSCRIBED, key: 2 } ], "each instance must emit its own independent SUBSCRIBE");

    effects.length = 0;

    sub.release(instanceOne);

    assert.deepEqual(effects, [{ desired: EMPTY, key: 1 }], "releasing instance 1 must emit UNSUBSCRIBE for key 1 only");
    assert.equal(sub.peek(1), undefined);
    assert.equal(sub.peek(2), SUBSCRIBED, "instance 2 must remain subscribed - it is an independent wire key");

    sub.release(instanceTwo);

    assert.deepEqual(effects, [ { desired: EMPTY, key: 1 }, { desired: EMPTY, key: 2 } ], "releasing instance 2 must then emit UNSUBSCRIBE for key 2");
  });

  test("a second subscriber on the same instance does not re-emit; that instance's wire state is one subscription", () => {

    const { effects, sub } = makeSerial();

    const a = sub.acquire(7, undefined);
    const b = sub.acquire(7, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: 7 }], "two subscribers on the same instance produce a single SUBSCRIBE");

    effects.length = 0;

    sub.release(a);

    assert.deepEqual(effects, [], "releasing one of two subscribers on the instance does not unsubscribe");

    sub.release(b);

    assert.deepEqual(effects, [{ desired: EMPTY, key: 7 }], "releasing the last subscriber on the instance unsubscribes it");
  });
});

describe("ReissuableSubscription - ledger-view reads (count / activeKeys)", () => {

  // The ledger-view reads (size / count / activeKeys) report who is subscribed and are sourced from the subscriber ledger; they must survive clearConnectionState while
  // the cache-view read (peek) is cleared by it. This is the precise ledger-vs-cache distinction the primitive exists to keep correct.
  function makeSerial(): ReissuableSubscription<number, void, typeof SUBSCRIBED> {

    return new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });
  }

  test("count(key) returns N for N concurrent subscribers on the same key and is independent across keys", () => {

    const sub = makeSerial();

    sub.acquire(0, undefined);
    sub.acquire(0, undefined);
    sub.acquire(0, undefined);
    sub.acquire(1, undefined);

    assert.equal(sub.count(0), 3, "three concurrent subscribers on key 0 must count as 3");
    assert.equal(sub.count(1), 1, "key 1 must count its own single subscriber, independent of key 0");
    assert.equal(sub.count(2), 0, "a key with no subscribers must count 0");
  });

  test("count and activeKeys are UNCHANGED by clearConnectionState (ledger survives) while peek becomes undefined (cache cleared)", () => {

    const sub = makeSerial();

    sub.acquire(0, undefined);
    sub.acquire(0, undefined);
    sub.acquire(5, undefined);

    // Before clearConnectionState: the cache view (peek) and the ledger views (count / activeKeys) agree that keys 0 and 5 are subscribed.
    assert.equal(sub.peek(0), SUBSCRIBED);
    assert.equal(sub.peek(5), SUBSCRIBED);
    assert.equal(sub.count(0), 2);
    assert.equal(sub.count(5), 1);
    assert.deepEqual([...sub.activeKeys()].sort((a, b): number => a - b), [ 0, 5 ]);

    sub.clearConnectionState();

    // After clearConnectionState the views diverge: peek (cache) is cleared, but count / activeKeys (ledger) are untouched - the survivors are still subscribed.
    assert.equal(sub.peek(0), undefined, "clearConnectionState must clear the cache, so peek is undefined");
    assert.equal(sub.peek(5), undefined, "clearConnectionState must clear the cache, so peek is undefined");
    assert.equal(sub.count(0), 2, "count is a ledger-view read and must survive clearConnectionState");
    assert.equal(sub.count(5), 1, "count is a ledger-view read and must survive clearConnectionState");
    assert.deepEqual([...sub.activeKeys()].sort((a, b): number => a - b), [ 0, 5 ], "activeKeys is a ledger-view read and must survive clearConnectionState");
  });

  test("count decrements on release and reaches 0 when the last subscriber for a key leaves", () => {

    const sub = makeSerial();

    const a = sub.acquire(3, undefined);
    const b = sub.acquire(3, undefined);

    assert.equal(sub.count(3), 2);

    sub.release(a);

    assert.equal(sub.count(3), 1, "releasing one of two subscribers decrements the count to 1");

    sub.release(b);

    assert.equal(sub.count(3), 0, "releasing the last subscriber for the key reaches 0");
  });

  test("activeKeys lists exactly the keys with at least one live subscriber and drops a key when its last subscriber leaves", () => {

    const sub = makeSerial();

    const zero = sub.acquire(0, undefined);
    const oneA = sub.acquire(1, undefined);
    const oneB = sub.acquire(1, undefined);

    assert.deepEqual([...sub.activeKeys()].sort((a, b): number => a - b), [ 0, 1 ], "activeKeys must list every key with a live subscriber, deduplicated");

    // Release one of the two key-1 subscribers: key 1 still has a live subscriber, so it stays in activeKeys.
    sub.release(oneA);

    assert.deepEqual([...sub.activeKeys()].sort((a, b): number => a - b), [ 0, 1 ], "a key with a remaining subscriber must stay in activeKeys");

    // Release the last key-1 subscriber: key 1 drops out.
    sub.release(oneB);

    assert.deepEqual([...sub.activeKeys()], [0], "a key drops out of activeKeys when its last subscriber leaves");

    sub.release(zero);

    assert.deepEqual([...sub.activeKeys()], [], "activeKeys is empty when no key has a live subscriber");
  });
});

describe("ReissuableSubscription - level-aggregation (Log shape)", () => {

  // Log subscribes globally but aggregates per-iterator LogLevel intents via Math.max - the device-side level is the most verbose any open iterator asked for. Raising
  // the max emits the new level; a lower second subscriber does not change the wire level; removing the max-level subscriber re-emits the new (lower) max.
  function makeLog(): { effects: WireEffect<number, number>[]; sub: ReissuableSubscription<number, number, number> } {

    const { effects, record } = makeRecorder<number, number>();

    const sub = new ReissuableSubscription<number, number, number>({

      onChange: (key, desired): void => {

        // Log has no unsubscribe frame; the last release fires EMPTY which we ignore. Only concrete levels reach the recorder.
        if(desired === EMPTY) {

          return;
        }

        record(key, desired);
      },
      reduce: (intents): number | typeof EMPTY => intents.length === 0 ? EMPTY : Math.max(...intents)
    });

    return { effects, sub };
  }

  test("raising the level emits the new max; a lower second subscriber does not change the wire level; removing the max re-emits the lower max", () => {

    const { effects, sub } = makeLog();

    // Subscribe at level 3 (say INFO). The aggregate is 3.
    const info = sub.acquire(GLOBAL, 3);

    assert.deepEqual(effects, [{ desired: 3, key: GLOBAL }], "the first subscriber sets the wire level to its own level");

    // Subscribe at level 5 (say VERY_VERBOSE). The aggregate rises to 5; the wire upgrades.
    const verbose = sub.acquire(GLOBAL, 5);

    assert.deepEqual(effects, [ { desired: 3, key: GLOBAL }, { desired: 5, key: GLOBAL } ], "raising the max must upgrade the wire level");

    // Subscribe at level 2 (below the current max). The aggregate stays 5; no wire change.
    const low = sub.acquire(GLOBAL, 2);

    assert.deepEqual(effects, [ { desired: 3, key: GLOBAL }, { desired: 5, key: GLOBAL } ], "a lower-level subscriber must not change the wire level");
    assert.equal(sub.peek(GLOBAL), 5);

    effects.length = 0;

    // Remove the max-level subscriber. The aggregate drops back to 3 (the next-highest remaining); the wire downgrades.
    sub.release(verbose);

    assert.deepEqual(effects, [{ desired: 3, key: GLOBAL }], "removing the max-level subscriber must re-emit the new (lower) max");
    assert.equal(sub.peek(GLOBAL), 3);

    // Cleanup the remaining subscribers; the final release fires EMPTY which Log ignores.
    sub.release(info);
    sub.release(low);

    assert.equal(sub.size, 0);
    assert.equal(sub.peek(GLOBAL), undefined);
  });
});

describe("ReissuableSubscription - per-(address, handle) reissue-only ledger (Bluetooth notify shape)", () => {

  // Bluetooth notify enables a GATT notification per (address, handle) via a caller-driven setNotify frame; the primitive does NOT send that frame on acquire / release.
  // It is a reissue-only ledger: onChange is omitted entirely (so acquire / release are wire-silent), and onReissue replays the NOTIFY enable per live key on reconnect.
  test("acquire / release emit nothing; reissueOnReconnect replays onReissue per live key", () => {

    const { effects, record } = makeRecorder<string, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<string, void, typeof SUBSCRIBED>({

      // No onChange: the wire enable is caller-driven, so acquire / release have no wire effect through the primitive.
      onReissue: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const handleA = sub.acquire("aa:bb:cc:1", undefined);
    const handleB = sub.acquire("aa:bb:cc:2", undefined);

    assert.deepEqual(effects, [], "a reissue-only ledger must emit nothing on acquire (the wire enable is caller-driven)");
    assert.equal(sub.size, 2);

    sub.reissueOnReconnect();

    assert.deepEqual(effects, [ { desired: SUBSCRIBED, key: "aa:bb:cc:1" }, { desired: SUBSCRIBED, key: "aa:bb:cc:2" } ],
      "reissueOnReconnect must replay onReissue for every live key");

    effects.length = 0;

    // Releasing one key, then reconnecting again, must replay only the surviving key - the released key is not resurrected.
    sub.release(handleA);
    sub.reissueOnReconnect();

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: "aa:bb:cc:2" }], "after releasing one key, reissue replays only the surviving key");

    effects.length = 0;
    sub.release(handleB);

    assert.deepEqual(effects, [], "releasing the last subscriber must emit nothing (reissue-only ledger has no onChange)");
    assert.equal(sub.size, 0);
  });
});

describe("ReissuableSubscription - reconnect continuity (the must-fix core)", () => {

  // The core continuity guarantee: clearConnectionState clears the connection-scoped cache but preserves the subscriber ledger, and reissueOnReconnect replays every live
  // key's desired state exactly once while replaying nothing for keys with no subscribers.
  test("clearConnectionState clears the cache but preserves subscribers; reissueOnReconnect replays each live key exactly once", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    // Acquire across three distinct keys; key 1 has two subscribers, keys 2 and 3 have one each.
    const oneA = sub.acquire(1, undefined);
    const oneB = sub.acquire(1, undefined);
    const two = sub.acquire(2, undefined);
    const three = sub.acquire(3, undefined);

    // Release every subscriber for key 3, so it has no live subscribers at reconnect time and must NOT replay.
    sub.release(three);

    assert.equal(sub.peek(1), SUBSCRIBED);
    assert.equal(sub.peek(2), SUBSCRIBED);
    assert.equal(sub.peek(3), undefined);

    const sizeBeforeReconnect = sub.size;

    effects.length = 0;

    sub.clearConnectionState();

    // The cache is cleared for every key...
    assert.equal(sub.peek(1), undefined, "clearConnectionState must clear the cache");
    assert.equal(sub.peek(2), undefined, "clearConnectionState must clear the cache");

    // ...but the subscriber ledger is untouched.
    assert.equal(sub.size, sizeBeforeReconnect, "clearConnectionState must preserve the subscriber ledger");
    assert.deepEqual(effects, [], "clearConnectionState must not emit any wire effect on its own");

    sub.reissueOnReconnect();

    // Every live key replays exactly once; key 3 (no live subscribers) replays nothing. Replay order follows ledger insertion order: key 1 (first inserted), then key 2.
    assert.deepEqual(effects, [ { desired: SUBSCRIBED, key: 1 }, { desired: SUBSCRIBED, key: 2 } ],
      "reissueOnReconnect must replay each live key exactly once and skip keys with no subscribers");
    assert.equal(sub.peek(1), SUBSCRIBED, "the cache must be re-populated for live keys");
    assert.equal(sub.peek(2), SUBSCRIBED);
    assert.equal(sub.peek(3), undefined, "a key with no subscribers must not be replayed or re-cached");

    // The two surviving key-1 handles are still distinct and still live.
    assert.equal(typeof oneA, "symbol");
    assert.equal(typeof oneB, "symbol");
    assert.equal(typeof two, "symbol");
  });

  test("reissueOnReconnect with zero subscribers is a pure no-op", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    sub.reissueOnReconnect();

    assert.deepEqual(effects, [], "reissueOnReconnect with no subscribers must replay nothing");
    assert.equal(sub.size, 0);
  });
});

describe("ReissuableSubscription - dispose-after-reconnect correctness", () => {

  // The hazard the old shared-refcount design hit: a survivor parked across the reconnect, then disposed, must still drive the correct final UNSUBSCRIBE. Because the
  // ledger survives clearConnectionState and the handle is keyed by Symbol identity, the survivor's release deletes its own entry and re-derives the wire state on the
  // CURRENT transport - the "count already 0" guard that swallowed the survivor's unsubscribe cannot occur here.
  test("a surviving handle's release after a reconnect still drives the final UNSUBSCRIBE", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    // A single survivor acquires before the reconnect.
    const survivor = sub.acquire(GLOBAL, undefined);

    // Simulate the host's connect() sequence: clear connection state at the top, reissue at the bottom.
    sub.clearConnectionState();
    sub.reissueOnReconnect();

    assert.equal(sub.peek(GLOBAL), SUBSCRIBED, "the survivor must be re-subscribed on the fresh transport");

    effects.length = 0;

    // The survivor now disposes on the new transport. Its release must drive the final UNSUBSCRIBE - it is the last subscriber.
    sub.release(survivor);

    assert.deepEqual(effects, [{ desired: EMPTY, key: GLOBAL }], "the survivor's post-reconnect release must drive the final UNSUBSCRIBE");
    assert.equal(sub.size, 0);
    assert.equal(sub.peek(GLOBAL), undefined);
  });

  test("a double reconnect followed by the survivor's release still unsubscribes exactly once", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const survivor = sub.acquire(GLOBAL, undefined);

    sub.reissueOnReconnect();
    sub.reissueOnReconnect();

    effects.length = 0;
    sub.release(survivor);

    assert.deepEqual(effects, [{ desired: EMPTY, key: GLOBAL }], "two reconnects must not desynchronize the ledger; the final release unsubscribes exactly once");
  });
});

describe("ReissuableSubscription - edge cases", () => {

  // Double-release: releasing the same handle twice (or releasing an unknown handle) is a safe no-op.
  test("double release of the same handle is a safe no-op", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const handle = sub.acquire(GLOBAL, undefined);

    effects.length = 0;
    sub.release(handle);

    assert.deepEqual(effects, [{ desired: EMPTY, key: GLOBAL }], "the first release emits the UNSUBSCRIBE");

    effects.length = 0;

    // A second release of the same handle must do nothing.
    sub.release(handle);

    assert.deepEqual(effects, [], "the second release of the same handle must be a no-op");
    assert.equal(sub.size, 0);
  });

  test("releasing an unknown handle is a no-op", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    // A symbol that was never registered with this instance.
    sub.release(Symbol("never-acquired"));

    assert.deepEqual(effects, [], "releasing a handle that was never acquired must do nothing");
    assert.equal(sub.size, 0);
  });

  // clearConnectionState followed by acquire: the new subscriber recomputes against an empty cache and emits.
  test("acquire after clearConnectionState recomputes against the empty cache and emits", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const first = sub.acquire(GLOBAL, undefined);

    sub.clearConnectionState();

    effects.length = 0;

    // After the cache was cleared, a fresh acquire on the same key must emit because there is nothing cached to diff against - even though a subscriber already existed.
    const second = sub.acquire(GLOBAL, undefined);

    assert.deepEqual(effects, [{ desired: SUBSCRIBED, key: GLOBAL }], "an acquire after clearConnectionState must emit against the empty cache");
    assert.equal(typeof first, "symbol");
    assert.equal(typeof second, "symbol");
  });

  // A key whose subscribers all leave: onChange(EMPTY) fires once, the cache entry is removed, and a later reissueOnReconnect does not replay it.
  test("a fully-drained key fires EMPTY once and is not replayed on a later reconnect", () => {

    const { effects, record } = makeRecorder<number, typeof SUBSCRIBED>();

    const sub = new ReissuableSubscription<number, void, typeof SUBSCRIBED>({

      onChange: record,
      reduce: (intents): typeof SUBSCRIBED | typeof EMPTY => intents.length === 0 ? EMPTY : SUBSCRIBED
    });

    const handle = sub.acquire(GLOBAL, undefined);

    effects.length = 0;
    sub.release(handle);

    assert.deepEqual(effects, [{ desired: EMPTY, key: GLOBAL }], "draining the last subscriber fires EMPTY exactly once");

    effects.length = 0;
    sub.reissueOnReconnect();

    assert.deepEqual(effects, [], "a fully-drained key must not be replayed on a later reconnect");
    assert.equal(sub.peek(GLOBAL), undefined);
  });

  // A custom equals predicate suppressing a redundant emit: two structurally-equal desired states must not produce a spurious wire send.
  test("a custom equals predicate suppresses a redundant emit on a structurally-equal desired state", () => {

    interface Desired {

      flags: number;
    }

    const { effects, record } = makeRecorder<number, Desired>();

    const sub = new ReissuableSubscription<number, number, Desired>({

      // Two desired states are equal when their flags match, regardless of object identity.
      equals: (a, b): boolean => a.flags === b.flags,
      onChange: record,
      // Reduce to the OR of all intent flag bits; an empty intent list reduces to EMPTY.
      reduce: (intents): Desired | typeof EMPTY => intents.length === 0 ? EMPTY : { flags: intents.reduce((acc, bit) => acc | bit, 0) }
    });

    const a = sub.acquire(GLOBAL, 0b01);

    assert.deepEqual(effects, [{ desired: { flags: 0b01 }, key: GLOBAL }], "the first subscriber emits its desired flags");

    // A second subscriber whose intent contributes no new flag bits yields a structurally-equal desired state (same flags), so the custom equals must suppress the emit.
    const b = sub.acquire(GLOBAL, 0b01);

    assert.deepEqual(effects, [{ desired: { flags: 0b01 }, key: GLOBAL }], "a structurally-equal desired state must be suppressed by the custom equals predicate");

    effects.length = 0;

    // A third subscriber adds a new flag bit, changing the reduced flags; the emit must now fire.
    const c = sub.acquire(GLOBAL, 0b10);

    assert.deepEqual(effects, [{ desired: { flags: 0b11 }, key: GLOBAL }], "a genuinely different desired state must emit");

    sub.release(a);
    sub.release(b);
    sub.release(c);

    assert.equal(sub.size, 0);
  });

  // The default equals (Object.is) suppresses a redundant emit for a primitive desired state that does not change across two acquires.
  test("the default Object.is equals suppresses a redundant primitive emit", () => {

    const { effects, record } = makeRecorder<number, number>();

    const sub = new ReissuableSubscription<number, number, number>({

      onChange: record,
      reduce: (intents): number | typeof EMPTY => intents.length === 0 ? EMPTY : Math.max(...intents)
    });

    const a = sub.acquire(GLOBAL, 4);
    const b = sub.acquire(GLOBAL, 4);

    assert.deepEqual(effects, [{ desired: 4, key: GLOBAL }], "two subscribers at the same level produce a single emit via the default Object.is equals");

    sub.release(a);
    sub.release(b);
  });

  // The EMPTY sentinel is a distinct unique symbol, observably different from any concrete desired-state and from undefined.
  test("EMPTY is a unique symbol distinct from any concrete desired-state", () => {

    const sentinel: unknown = EMPTY;

    assert.equal(typeof EMPTY, "symbol");
    assert.notEqual(sentinel, SUBSCRIBED);
    assert.notEqual(sentinel, undefined);
  });
});
