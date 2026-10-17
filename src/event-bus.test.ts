/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.test.ts: Unit tests for the typed EventBus primitive.
 */
import { describe, test } from "node:test";
import { EventBus } from "./event-bus.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

interface TestMap {

  greet: string;
  number: number;
  obj: { a: number };
  tick: undefined;
}

/*
 * A map whose keys deliberately collide with names that carry special meaning on the underlying `node:events.EventEmitter`. The facade namespaces every channel, so
 * these must behave as ordinary user events. "error" is the consequential one: node:events throws synchronously on emit("error") with no listener. "__bus.dispose__"
 * carries no special meaning to the bus - disposal is signaled through an internal Symbol channel that cannot collide with any string a consumer could choose - so
 * this map proves an arbitrary string, including this one, is treated as an ordinary user event.
 */
interface ReservedNameMap {

  "__bus.dispose__": string;
  error: string;
  newListener: number;
  removeListener: number;
}

describe("EventBus.on", () => {

  test("invokes the callback with the emitted payload", () => {

    using bus = new EventBus<TestMap>();
    const received: string[] = [];

    using _sub = bus.on("greet", (payload) => { received.push(payload); });

    bus.emit("greet", "hello");

    assert.deepEqual(received, ["hello"]);
  });

  test("delivers every emit while the subscription is alive", () => {

    using bus = new EventBus<TestMap>();
    const received: number[] = [];

    using _sub = bus.on("number", (n) => { received.push(n); });

    bus.emit("number", 1);
    bus.emit("number", 2);
    bus.emit("number", 3);

    assert.deepEqual(received, [ 1, 2, 3 ]);
  });

  test("dispose tears down the subscription so subsequent emits are not received", () => {

    using bus = new EventBus<TestMap>();
    const received: number[] = [];

    const sub = bus.on("number", (n) => { received.push(n); });

    bus.emit("number", 1);
    sub[Symbol.dispose]();
    bus.emit("number", 2);

    assert.deepEqual(received, [1], "after dispose, the listener must NOT receive subsequent emits");
  });

  test("returns a no-op Disposable when bus is already disposed", () => {

    const bus = new EventBus<TestMap>();

    bus.dispose();

    const sub = bus.on("greet", () => { /* should never fire */ });

    // The disposable must not throw on dispose, even though the bus is already torn down.
    assert.doesNotThrow(() => sub[Symbol.dispose]());
  });

  test("listenerCount reflects the active callback count", () => {

    using bus = new EventBus<TestMap>();

    assert.equal(bus.listenerCount("greet"), 0);

    using _a = bus.on("greet", () => { /* */ });

    assert.equal(bus.listenerCount("greet"), 1);

    using _b = bus.on("greet", () => { /* */ });

    assert.equal(bus.listenerCount("greet"), 2);
  });
});

describe("EventBus listener isolation", () => {

  test("a throwing listener is reported with its event name, and neither blocks a sibling listener nor escapes emit", () => {

    const faults: { error: unknown; event: string }[] = [];

    using bus = new EventBus<TestMap>({ onListenerError: (error, event): void => { faults.push({ error, event }); } });
    const fault = new Error("listener fault");
    const received: string[] = [];

    using _throwing = bus.on("greet", () => { throw fault; });
    using _sibling = bus.on("greet", (payload) => { received.push(payload); });

    assert.doesNotThrow(() => bus.emit("greet", "hello"), "a listener's fault must not propagate out of emit");
    assert.deepEqual(received, ["hello"], "the sibling registered after the throwing listener must still receive the emission");
    assert.deepEqual(faults, [{ error: fault, event: "greet" }], "the fault must reach the callback once with the logical event name");
  });

  test("an async listener's rejection reaches the callback and never surfaces as an unhandled rejection", async () => {

    const faults: { error: unknown; event: string }[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };

    using bus = new EventBus<TestMap>({ onListenerError: (error, event): void => { faults.push({ error, event }); } });
    const fault = new Error("async listener fault");

    process.on("unhandledRejection", onUnhandled);

    try {

      using _async = bus.on("number", async () => { await Promise.resolve(); throw fault; });

      bus.emit("number", 1);

      // An unhandled rejection is reported after the microtask queue drains, so a macrotask turn is the earliest point the sentinel could have seen one.
      await delay(10);

      assert.deepEqual(faults, [{ error: fault, event: "number" }], "the rejection must reach the callback with the logical event name");
      assert.deepEqual(unhandled, [], "the rejection must not escape as an unhandled rejection");

    } finally {

      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("a bus built without a callback rethrows a listener's fault on a later tick, after the emit has reached every listener", async () => {

    using bus = new EventBus<TestMap>();
    const fault = new Error("unreported listener fault");
    const received: string[] = [];
    const { promise: reported, resolve } = Promise.withResolvers<unknown>();
    const onUncaught = (error: unknown): void => { resolve(error); };

    // The test runner fails any test whose code raises `uncaughtException`, so its own listeners stand aside while this test observes the default report path.
    const runnerListeners = process.listeners("uncaughtException");

    process.removeAllListeners("uncaughtException");
    process.once("uncaughtException", onUncaught);

    try {

      using _throwing = bus.on("greet", () => { throw fault; });
      using _sibling = bus.on("greet", (payload) => { received.push(payload); });

      assert.doesNotThrow(() => bus.emit("greet", "hello"), "the default sink must not throw synchronously out of emit");
      assert.deepEqual(received, ["hello"], "the sibling must receive the emission before the fault is reported");
      assert.equal(await Promise.race([ reported, delay(1000, "never reported") ]), fault, "the fault must reach uncaughtException on a later tick");

    } finally {

      process.off("uncaughtException", onUncaught);

      for(const listener of runnerListeners) {

        process.on("uncaughtException", listener);
      }
    }
  });
});

describe("EventBus.once", () => {

  test("resolves with the next emission", async () => {

    using bus = new EventBus<TestMap>();
    const promise = bus.once("greet");

    bus.emit("greet", "hi");

    assert.equal(await promise, "hi");
  });

  test("rejects when the abort signal fires before any emission", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    const promise = bus.once("greet", { signal: controller.signal });

    controller.abort();

    await assert.rejects(promise, { name: "AbortError" }, "abort must reject the once promise");
  });

  test("rejects when bus is already disposed", async () => {

    const bus = new EventBus<TestMap>();

    bus.dispose();

    await assert.rejects(bus.once("greet"), /disposed/i, "dispose-then-once must reject with a meaningful error");
  });

  test("does not consume the event for other subscribers", async () => {

    using bus = new EventBus<TestMap>();
    const oncePromise = bus.once("greet");
    const observed: string[] = [];

    using _sub = bus.on("greet", (payload) => { observed.push(payload); });

    bus.emit("greet", "shared");

    assert.equal(await oncePromise, "shared");
    assert.deepEqual(observed, ["shared"], "the on() listener also receives the emission");
  });

  test("settles (rejects) a pending once() with no signal when the bus is disposed", async () => {

    const bus = new EventBus<TestMap>();

    // A once() awaiter registered WITHOUT a signal. Node's events.once does not settle on removeAllListeners, so before the dispose AbortController fix this promise
    // hangs forever after dispose(). We race it against a short timer; if the promise has not settled by then, the timer wins and the test fails deterministically
    // rather than hanging the whole run.
    const oncePromise = bus.once("greet");
    const settled = Symbol("settled");
    const timedOut = Symbol("timed-out");
    const guard = new Promise<typeof timedOut>((resolve) => { setTimeout(() => resolve(timedOut), 1000); });

    bus.dispose();

    const outcome = await Promise.race([ oncePromise.then(() => settled, () => settled), guard ]);

    assert.equal(outcome, settled, "dispose() must settle the pending once() promise rather than leave it hanging");
    await assert.rejects(oncePromise, { name: "AbortError" });
  });
});

describe("EventBus.stream", () => {

  test("yields every emission in order", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number");
    const collected: number[] = [];

    bus.emit("number", 1);
    bus.emit("number", 2);
    bus.emit("number", 3);

    setImmediate(() => bus.dispose());

    for await (const n of stream) {

      collected.push(n);
    }

    assert.deepEqual(collected, [ 1, 2, 3 ]);
  });

  test("delivers buffered undefined payloads instead of dropping them as an empty sentinel", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("tick");
    let delivered = 0;

    // Emit several undefined-payload items BEFORE the consumer parks, so they buffer in the queue. A positive queue length guarantees a real buffered item, including a
    // legitimate undefined payload, so the drain gates on queue length rather than on the value itself - a channel whose payload is always undefined (heartbeat) or
    // sometimes undefined (sync disconnect) still has every buffered item delivered.
    bus.emit("tick", undefined);
    bus.emit("tick", undefined);
    bus.emit("tick", undefined);

    setImmediate(() => bus.dispose());

    for await (const value of stream) {

      assert.equal(value, undefined);
      delivered++;
    }

    assert.equal(delivered, 3, "every buffered undefined payload must be delivered, not dropped as an empty sentinel");
  });

  test("ends on signal abort", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    const stream = bus.stream("number", { signal: controller.signal });

    setImmediate(() => controller.abort());

    await assert.rejects(async () => {

      for await (const _ of stream) {

        /* never reached */
      }
    }, { name: "AbortError" });
  });

  test("ends cleanly when bus disposes", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number");

    setImmediate(() => bus.dispose());

    const collected: number[] = [];

    for await (const n of stream) {

      collected.push(n);
    }

    assert.deepEqual(collected, [], "stream ends without yielding when bus disposes immediately");
  });

  test("a stream created after dispose ends immediately rather than parking forever", async () => {

    using bus = new EventBus<TestMap>();

    bus.dispose();

    // A stream requested AFTER dispose ends on its own: EventBus.stream() checks the disposed flag and returns an already-ended iterable instead of constructing a
    // BackpressureStream, which would otherwise attach a listener for the one-shot DISPOSE_CHANNEL that has already fired and park in next() forever. We race the drain
    // against a short timer so a regression fails deterministically rather than hanging the run.
    const settled = Symbol("settled");
    const timedOut = Symbol("timed-out");
    const collected: number[] = [];

    const drain = (async (): Promise<void> => {

      for await (const n of bus.stream("number")) {

        collected.push(n);
      }
    })();

    const guard = new Promise<typeof timedOut>((resolve) => { setTimeout(() => resolve(timedOut), 1000); });
    const outcome = await Promise.race([ drain.then(() => settled), guard ]);

    assert.equal(outcome, settled, "a post-dispose stream must end immediately, not hang");
    assert.deepEqual(collected, [], "a post-dispose stream yields nothing");
  });

  test("with backpressure dropOldest, drops the oldest items when overrun", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number", { backpressure: "dropOldest", highWaterMark: 2 });

    // Emit 5 items synchronously without consumer pulling. With highWaterMark=2 and dropOldest, the queue should retain only the last 2 items (4, 5).
    bus.emit("number", 1);
    bus.emit("number", 2);
    bus.emit("number", 3);
    bus.emit("number", 4);
    bus.emit("number", 5);

    setImmediate(() => bus.dispose());

    const collected: number[] = [];

    for await (const n of stream) {

      collected.push(n);
    }

    assert.deepEqual(collected, [ 4, 5 ], "dropOldest retains the most recent items past the high-water mark");
  });

  test("with backpressure dropNewest, drops incoming items past the high-water mark", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number", { backpressure: "dropNewest", highWaterMark: 2 });

    bus.emit("number", 1);
    bus.emit("number", 2);
    bus.emit("number", 3);
    bus.emit("number", 4);
    bus.emit("number", 5);

    setImmediate(() => bus.dispose());

    const collected: number[] = [];

    for await (const n of stream) {

      collected.push(n);
    }

    assert.deepEqual(collected, [ 1, 2 ], "dropNewest retains the first items and drops incoming overflow");
  });

  test("with backpressure throw, raises BackpressureError on overrun", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number", { backpressure: "throw", highWaterMark: 2 });

    bus.emit("number", 1);
    bus.emit("number", 2);
    bus.emit("number", 3);

    await assert.rejects(async () => {

      for await (const _ of stream) {

        /* will throw before completing */
      }
    }, { name: "BackpressureError" });
  });

  test("two concurrent streams of the same event each receive every emission", async () => {

    using bus = new EventBus<TestMap>();

    const aResults: number[] = [];
    const bResults: number[] = [];

    const aIt = bus.stream("number")[Symbol.asyncIterator]();
    const bIt = bus.stream("number")[Symbol.asyncIterator]();

    bus.emit("number", 1);
    bus.emit("number", 2);

    aResults.push((await aIt.next()).value as number);
    bResults.push((await bIt.next()).value as number);
    aResults.push((await aIt.next()).value as number);
    bResults.push((await bIt.next()).value as number);

    bus.dispose();

    assert.deepEqual(aResults, [ 1, 2 ]);
    assert.deepEqual(bResults, [ 1, 2 ]);
  });
});

describe("EventBus.stream view hooks", () => {

  test("aborting a never-iterated stream runs onClose once and detaches its listener, and a later return() does not run it again", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    let closes = 0;
    const iter = bus.stream("number", { onClose: (): void => { closes++; }, signal: controller.signal })[Symbol.asyncIterator]();

    assert.equal(bus.listenerCount("number"), 1, "the listener must be attached when stream() returns");

    controller.abort();

    assert.equal(closes, 1, "the abort alone must close a stream that was never iterated");
    assert.equal(bus.listenerCount("number"), 0);

    await iter.return!();

    assert.equal(closes, 1, "a later return() must not run onClose a second time");
  });

  test("return() on a never-iterated stream runs onClose once and detaches its listener", async () => {

    using bus = new EventBus<TestMap>();
    let closes = 0;
    const iter = bus.stream("number", { onClose: (): void => { closes++; } })[Symbol.asyncIterator]();

    await iter.return!();
    await iter.return!();

    assert.equal(closes, 1);
    assert.equal(bus.listenerCount("number"), 0);
  });

  test("bus dispose runs onClose once for a live stream, and a stream requested after dispose runs it at once", () => {

    const bus = new EventBus<TestMap>();
    let liveCloses = 0;
    let lateCloses = 0;

    bus.stream("number", { onClose: (): void => { liveCloses++; } });
    bus.dispose();
    bus.stream("number", { onClose: (): void => { lateCloses++; } });

    assert.equal(liveCloses, 1, "dispose must close the live stream once");
    assert.equal(lateCloses, 1, "a stream requested after dispose is already ended, so it closes at once");
  });

  test("a backpressure throw runs onClose once", async () => {

    using bus = new EventBus<TestMap>();
    let closes = 0;
    const iter = bus.stream("number", { backpressure: "throw", highWaterMark: 1, onClose: (): void => { closes++; } })[Symbol.asyncIterator]();

    bus.emit("number", 1);
    bus.emit("number", 2);

    assert.equal(closes, 1);
    assert.deepEqual(await iter.next(), { done: false, value: 1 }, "items queued before the overrun still drain first");
    await assert.rejects(iter.next(), { name: "BackpressureError" });
  });

  test("a selector maps each kept payload and skips the rest before they reach the queue, so skipped payloads never count toward highWaterMark", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number", {

      backpressure: "dropNewest",
      highWaterMark: 2,
      select: (n: number): string | undefined => ((n % 2) === 0) ? String(n * 10) : undefined
    });

    // Odd payloads are skipped, so the even payloads alone fill the queue to its high-water mark, and only an even payload arriving after that is discarded.
    for(const n of [ 1, 3, 2, 5, 7, 4, 9, 6 ]) {

      bus.emit("number", n);
    }

    bus.dispose();

    const collected: string[] = [];

    for await (const value of stream) {

      collected.push(value);
    }

    assert.deepEqual(collected, [ "20", "40" ]);
  });
});

describe("EventBus.stream terminal contract", () => {

  test("after an abort the first next() rejects with the abort reason and every later next() resolves done", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    const iter = bus.stream("number", { signal: controller.signal })[Symbol.asyncIterator]();

    controller.abort();

    await assert.rejects(iter.next(), { name: "AbortError" });
    assert.deepEqual(await iter.next(), { done: true, value: undefined });
    assert.deepEqual(await iter.next(), { done: true, value: undefined });
  });

  test("an abort that rejects a parked next() is not surfaced again by the next call", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    const iter = bus.stream("number", { signal: controller.signal })[Symbol.asyncIterator]();
    const parked = iter.next();

    controller.abort();

    await assert.rejects(parked, { name: "AbortError" });
    assert.deepEqual(await iter.next(), { done: true, value: undefined });
  });

  test("throw() runs onClose once, rejects with the supplied error, and leaves the stream ended", async () => {

    using bus = new EventBus<TestMap>();
    let closes = 0;
    const iter = bus.stream("number", { onClose: (): void => { closes++; } })[Symbol.asyncIterator]();
    const failure = new Error("consumer failure");

    bus.emit("number", 1);

    await assert.rejects(iter.throw!(failure), (error: unknown): boolean => error === failure);

    assert.equal(closes, 1);
    assert.equal(bus.listenerCount("number"), 0);
    assert.deepEqual(await iter.next(), { done: true, value: undefined }, "throw() must discard the queued item");
  });

  test("return() discards queued items and any pending error, so every later next() resolves done", async () => {

    using bus = new EventBus<TestMap>();
    const controller = new AbortController();
    const iter = bus.stream("number", { signal: controller.signal })[Symbol.asyncIterator]();

    bus.emit("number", 1);
    controller.abort();

    assert.deepEqual(await iter.return!(), { done: true, value: undefined });
    assert.deepEqual(await iter.next(), { done: true, value: undefined });
  });
});

describe("EventBus.emit", () => {

  test("returns true when at least one listener received the event", () => {

    using bus = new EventBus<TestMap>();

    using _sub = bus.on("greet", () => { /* */ });

    assert.equal(bus.emit("greet", "x"), true);
  });

  test("returns false when no listener is attached", () => {

    using bus = new EventBus<TestMap>();

    assert.equal(bus.emit("greet", "x"), false);
  });

  test("returns false on a disposed bus without throwing", () => {

    const bus = new EventBus<TestMap>();

    bus.dispose();

    assert.equal(bus.emit("greet", "x"), false);
  });
});

describe("EventBus.dispose", () => {

  test("is safe to call more than once", () => {

    const bus = new EventBus<TestMap>();

    bus.dispose();

    assert.doesNotThrow(() => bus.dispose());
  });

  test("Symbol.dispose calls dispose()", () => {

    const bus = new EventBus<TestMap>();

    bus[Symbol.dispose]();

    assert.equal(bus.emit("greet", "x"), false, "after Symbol.dispose, the bus is in disposed state");
  });

  test("active streams end when the bus disposes mid-iteration", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number");
    const it = stream[Symbol.asyncIterator]();

    bus.emit("number", 1);

    const first = await it.next();

    assert.equal(first.value, 1);

    setImmediate(() => bus.dispose());

    const second = await it.next();

    assert.equal(second.done, true, "stream ends after bus disposes");
  });
});

describe("EventBus reserved-name insulation", () => {

  test("emitting a user event named \"error\" with no listener does not throw", () => {

    using bus = new EventBus<ReservedNameMap>();

    // node:events throws synchronously on emit("error") with no listener attached. The facade namespaces channels, so the platform's reserved-name special-case can
    // never fire and the documented emit contract (return false when nothing received the event) holds for "error" like any other name.
    assert.doesNotThrow(() => bus.emit("error", "boom"));
    assert.equal(bus.emit("error", "boom"), false, "with no listener attached, emit must report false rather than throwing");
  });

  test("a user event named \"error\" round-trips to its listener through the namespace", () => {

    using bus = new EventBus<ReservedNameMap>();
    const received: string[] = [];

    using _sub = bus.on("error", (payload) => { received.push(payload); });

    assert.equal(bus.emit("error", "delivered"), true, "with a listener attached, the namespaced \"error\" channel delivers normally");
    assert.deepEqual(received, ["delivered"]);
  });

  test("once() resolves for a user event named \"error\"", async () => {

    using bus = new EventBus<ReservedNameMap>();
    const promise = bus.once("error");

    bus.emit("error", "one-shot");

    assert.equal(await promise, "one-shot");
  });

  test("a user event named \"newListener\" does not fire when unrelated subscriptions are added", () => {

    using bus = new EventBus<ReservedNameMap>();
    const received: number[] = [];

    using _sub = bus.on("newListener", (n) => { received.push(n); });

    // On a raw EventEmitter, a "newListener" listener is a meta-hook the platform invokes whenever ANY listener is added. Namespacing makes "newListener" an ordinary
    // channel, so registering an unrelated subscription must not invoke it - the meta-hook hijack is structurally impossible.
    using _other = bus.on("error", () => { /* its registration must not trip the "newListener" listener */ });

    assert.deepEqual(received, [], "adding a subscription must not trigger a user \"newListener\" listener");

    bus.emit("newListener", 7);

    assert.deepEqual(received, [7], "the \"newListener\" channel delivers only on an explicit emit");
  });

  test("a user event named \"removeListener\" does not fire when unrelated subscriptions are removed", () => {

    using bus = new EventBus<ReservedNameMap>();
    const received: number[] = [];

    using _sub = bus.on("removeListener", (n) => { received.push(n); });

    // Symmetric to the "newListener" case: the platform's "removeListener" meta-hook fires on any listener removal. Namespacing makes it an ordinary channel, so
    // disposing an unrelated subscription must not invoke it.
    const other = bus.on("error", () => { /* its removal must not trip the "removeListener" listener */ });

    other[Symbol.dispose]();

    assert.deepEqual(received, [], "removing a subscription must not trigger a user \"removeListener\" listener");

    bus.emit("removeListener", 9);

    assert.deepEqual(received, [9], "the \"removeListener\" channel delivers only on an explicit emit");
  });

  test("a user event named \"__bus.dispose__\" is an ordinary channel and does not tear down the bus", () => {

    using bus = new EventBus<ReservedNameMap>();
    const received: string[] = [];

    using _sentinel = bus.on("__bus.dispose__", (payload) => { received.push(payload); });
    using _probe = bus.on("error", () => { /* liveness probe */ });

    bus.emit("__bus.dispose__", "not-a-control-signal");

    assert.deepEqual(received, ["not-a-control-signal"], "\"__bus.dispose__\" must be an ordinary user channel");

    // The bus must still be alive: a subsequent emit to a live listener returns true, proving the emit above disposed nothing because teardown uses a Symbol.
    assert.equal(bus.emit("error", "still-alive"), true, "emitting \"__bus.dispose__\" must not dispose the bus");
  });
});

describe("EventBus integration patterns", () => {

  test("once() inside a callback chain works synchronously", async () => {

    using bus = new EventBus<TestMap>();
    const promise = bus.once("greet");

    // Microtask schedule the emit so once's listener attaches first.
    queueMicrotask(() => bus.emit("greet", "hi"));

    assert.equal(await promise, "hi");
  });

  test("stream cleanup runs on early break", async () => {

    using bus = new EventBus<TestMap>();
    const stream = bus.stream("number");

    bus.emit("number", 1);
    bus.emit("number", 2);

    let count = 0;

    for await (const _ of stream) {

      count++;

      if(count >= 2) {

        break;
      }
    }

    // After the break, the stream listener should be cleaned up. Verify by emitting again - listener count for "number" stays at 0 (the stream's listener detached on
    // return).
    await delay(10);
    assert.equal(bus.listenerCount("number"), 0, "stream's listener must detach on consumer-side break");
  });
});
