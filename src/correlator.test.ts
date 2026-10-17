/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * correlator.test.ts: Unit tests for the Correlator request/response correlation primitive.
 */
import { describe, test } from "node:test";
import { ConnectionError } from "./errors.ts";
import { Correlator } from "./correlator.ts";
import assert from "node:assert/strict";
import { captureTimeoutSignals } from "./timeout-signals.helpers.ts";
import { setTimeout as delay } from "node:timers/promises";
import { getEventListeners } from "node:events";

describe("Correlator - basic correlation", () => {

  test("await resolves with the value passed to resolve", async () => {

    const correlator = new Correlator<string>();
    const promise = correlator.await("key");

    assert.equal(correlator.resolve("key", "hello"), true, "resolve must report that a pending await was settled");
    assert.equal(await promise, "hello");
  });

  test("resolve returns false when no await is pending", () => {

    const correlator = new Correlator<string>();

    assert.equal(correlator.resolve("absent", "value"), false);
    assert.equal(correlator.size, 0);
  });

  test("reject rejects the await with the supplied reason", async () => {

    const correlator = new Correlator<string>();
    const promise = correlator.await("key");
    const reason = new Error("custom rejection reason");

    assert.equal(correlator.reject("key", reason), true);
    await assert.rejects(promise, (err: unknown) => err === reason, "the reason must be propagated verbatim");
  });

  test("reject returns false when no await is pending", () => {

    const correlator = new Correlator<string>();

    assert.equal(correlator.reject("absent", new Error("ignored")), false);
  });

  test("size tracks pending awaits", async () => {

    const correlator = new Correlator<number>();

    assert.equal(correlator.size, 0);

    const p1 = correlator.await("a");
    const p2 = correlator.await("b");

    assert.equal(correlator.size, 2);

    correlator.resolve("a", 1);
    assert.equal(correlator.size, 1);

    correlator.resolve("b", 2);
    assert.equal(correlator.size, 0);

    assert.equal(await p1, 1);
    assert.equal(await p2, 2);
  });

  test("pending reflects whether a key has an in-flight await", async () => {

    const correlator = new Correlator<number>();

    assert.equal(correlator.pending("a"), false);

    const p = correlator.await("a");

    assert.equal(correlator.pending("a"), true);
    assert.equal(correlator.pending("b"), false);

    correlator.resolve("a", 42);
    assert.equal(correlator.pending("a"), false);

    assert.equal(await p, 42);
  });

  test("two independent keys settle independently", async () => {

    const correlator = new Correlator<string>();
    const pA = correlator.await("a");
    const pB = correlator.await("b");

    correlator.resolve("a", "alpha");
    correlator.resolve("b", "beta");

    assert.equal(await pA, "alpha");
    assert.equal(await pB, "beta");
  });
});

describe("Correlator - in-flight guard", () => {

  test("a second await for the same key rejects with CORRELATOR_KEY_IN_FLIGHT", async () => {

    const correlator = new Correlator<string>();
    const first = correlator.await("k");

    await assert.rejects(correlator.await("k"), (err: unknown) => {

      assert.ok(err instanceof ConnectionError);
      assert.equal((err).code, "CORRELATOR_KEY_IN_FLIGHT");

      return true;
    });

    correlator.resolve("k", "done");
    assert.equal(await first, "done");
  });

  test("the in-flight slot is released after the first await settles", async () => {

    const correlator = new Correlator<number>();
    const p1 = correlator.await("k");

    correlator.resolve("k", 1);
    assert.equal(await p1, 1);

    // The slot must be free now; a second await must not throw.
    const p2 = correlator.await("k");

    correlator.resolve("k", 2);
    assert.equal(await p2, 2);
  });
});

describe("Correlator - timeout and abort", () => {

  test("await rejects with the timeout signal's own TimeoutError when the timeout elapses", async (t) => {

    const captured = captureTimeoutSignals(t);
    const correlator = new Correlator<string>();
    const start = performance.now();
    const promise = correlator.await("k", { timeoutMs: 20 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the await must build its timeout through AbortSignal.timeout");

    await assert.rejects(promise, (err: unknown): boolean => err === timeoutSignal.reason);

    const elapsed = performance.now() - start;

    assert.equal((timeoutSignal.reason as DOMException).name, "TimeoutError", "the reason is the platform's own TimeoutError");

    // The identity above holds for a timeout of any duration, so this bound is what ties the rejection to the timeout the await asked for: it leaves far more room
    // than scheduling jitter needs, and a timeout built with a duration above it fails the row.
    assert.ok(elapsed < 500, "the requested timeout, not a slower one, must end the wait - observed " + String(elapsed) + " ms");

    // The slot must be released so a subsequent await is permitted.
    assert.equal(correlator.pending("k"), false);
  });

  test("await rejects with the user signal's reason on abort", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal });

    controller.abort();

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason);
    assert.equal(correlator.pending("k"), false);
  });

  test("await rejects with a caller's string reason as it is", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal, timeoutMs: 1000 });

    controller.abort("caller-string");

    await assert.rejects(promise, (err: unknown): boolean => err === "caller-string");
  });

  test("an entry settled by resolve, by reject, by a caller abort, or by its timeout leaves no listener on its caller's signal or its timeout signal", async (t) => {

    const captured = captureTimeoutSignals(t);
    const correlator = new Correlator<string>();
    const settles: readonly (readonly [string, (controller: AbortController) => void])[] = [

      [ "resolve", (): void => { correlator.resolve("k", "value"); } ],
      [ "reject", (): void => { correlator.reject("k", new Error("Rejected.")); } ],
      [ "caller abort", (controller: AbortController): void => { controller.abort(); } ],
      [ "timeout", (): void => { /* The 20 ms timeout settles the entry. */ } ]
    ];

    for(const [ label, settle ] of settles) {

      const controller = new AbortController();
      const promise = correlator.await("k", { signal: controller.signal, timeoutMs: (label === "timeout") ? 20 : 60000 });
      const timeoutSignal = captured.at(-1);

      assert.ok(timeoutSignal, label + ": the await must build its timeout through AbortSignal.timeout");
      assert.equal(getEventListeners(controller.signal, "abort").length, 1, label + ": a pending entry follows its caller's signal");
      assert.equal(getEventListeners(timeoutSignal, "abort").length, 1, label + ": a pending entry follows its timeout signal");

      settle(controller);
      await promise.catch((): void => undefined);

      assert.equal(getEventListeners(controller.signal, "abort").length, 0, label + ": a settled entry must leave no listener on its caller's signal");
      assert.equal(getEventListeners(timeoutSignal, "abort").length, 0, label + ": a settled entry must leave no listener on its timeout signal");
    }
  });

  test("await propagates a custom abort reason from AbortController.abort(reason)", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal });
    const customReason = new Error("user-specified reason");

    controller.abort(customReason);

    await assert.rejects(promise, (err: unknown) => err === customReason, "the custom abort reason must be propagated verbatim");
  });

  test("await rejects synchronously when the user signal is already aborted at call time", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();

    controller.abort();

    // throwIfAborted runs in the synchronous prelude; assert.rejects sees the synchronous throw via the promise-returning wrapper.
    await assert.rejects(correlator.await("k", { signal: controller.signal }), { name: "AbortError" });
    assert.equal(correlator.pending("k"), false, "synchronous reject must not have created a Map entry");
  });

  test("resolve still works after a pre-aborted-call attempt", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(correlator.await("k", { signal: controller.signal }));

    const p = correlator.await("k");

    correlator.resolve("k", "done");
    assert.equal(await p, "done");
  });

  test("await with both timeout and signal honours whichever fires first", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal, timeoutMs: 1000 });

    setImmediate(() => controller.abort(new Error("user-driven abort")));

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof Error);
      assert.equal((err).message, "user-driven abort");

      return true;
    });
  });

  test("await with no timeout and no signal waits indefinitely for an out-of-band settle", async () => {

    const correlator = new Correlator<string>();
    const promise = correlator.await("k");

    // Give the event loop plenty of opportunity to settle if some hidden timer was wired up.
    await delay(30);
    assert.equal(correlator.pending("k"), true);

    correlator.resolve("k", "late");
    assert.equal(await promise, "late");
  });
});

describe("Correlator - composite keys via keyToString", () => {

  test("two structurally-equal tuples hash to the same slot", async () => {

    const correlator = new Correlator<string, [bigint, number]>({

      keyToString: ([ address, handle ]): string => address.toString(16) + ":" + String(handle)
    });

    const p = correlator.await([ 0x123n, 7 ]);

    // A structurally-equal tuple must collide with the in-flight key.
    await assert.rejects(correlator.await([ 0x123n, 7 ]), (err: unknown) => {

      assert.ok(err instanceof ConnectionError);
      assert.equal((err).code, "CORRELATOR_KEY_IN_FLIGHT");

      return true;
    });

    // Resolving via a structurally-equal tuple must settle the pending await.
    assert.equal(correlator.resolve([ 0x123n, 7 ], "matched"), true);
    assert.equal(await p, "matched");
  });

  test("structurally-distinct tuples hash to distinct slots", async () => {

    const correlator = new Correlator<string, [bigint, number]>({

      keyToString: ([ address, handle ]): string => address.toString(16) + ":" + String(handle)
    });

    const pA = correlator.await([ 0x123n, 7 ]);
    const pB = correlator.await([ 0x123n, 8 ]);

    correlator.resolve([ 0x123n, 7 ], "seven");
    correlator.resolve([ 0x123n, 8 ], "eight");

    assert.equal(await pA, "seven");
    assert.equal(await pB, "eight");
  });

  test("default key serialiser stringifies numbers correctly", async () => {

    const correlator = new Correlator<string, number>();
    const p = correlator.await(42);

    assert.equal(correlator.pending(42), true);
    assert.equal(correlator.resolve(42, "answer"), true);
    assert.equal(await p, "answer");
  });
});

describe("Correlator - listener cleanup", () => {

  test("resolving a pending await detaches the abort listener so a subsequent signal abort does not throw", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal, timeoutMs: 1000 });

    correlator.resolve("k", "done");
    assert.equal(await promise, "done");

    // The abort comes after the entry has been resolved; the detached listener must not throw "Promise already resolved" or any unhandled rejection.
    assert.doesNotThrow(() => controller.abort());

    // Give the microtask queue a chance to flush any unhandled rejection.
    await delay(5);
  });

  test("rejecting a pending await detaches the abort listener", async () => {

    const correlator = new Correlator<string>();
    const controller = new AbortController();
    const promise = correlator.await("k", { signal: controller.signal, timeoutMs: 1000 });

    correlator.reject("k", new Error("dispatcher reject"));
    await assert.rejects(promise);

    // After the entry was rejected by `reject`, the abort listener must already be detached.
    assert.doesNotThrow(() => controller.abort());
    await delay(5);
  });
});

describe("Correlator - util.inspect hook", () => {

  test("inspect output names the class and shows the pending count", () => {

    const correlator = new Correlator<string>();
    const stylize = (text: string): string => text;
    const inspector = (correlator as unknown as Record<symbol, (depth: number, options: { stylize: typeof stylize }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: typeof stylize }) => string;
    const empty = inspector.call(correlator, 0, { stylize });

    assert.match(empty, /Correlator/);
    assert.match(empty, /"pending":0/);

    // Attach catch handlers so the pending awaits do not surface as unhandled rejections when the cleanup at the end of the test rejects them.
    correlator.await("a").catch((): void => { /* swallowed for inspection-only test */ });
    correlator.await("b").catch((): void => { /* swallowed for inspection-only test */ });

    const populated = inspector.call(correlator, 0, { stylize });

    assert.match(populated, /"pending":2/);
    assert.match(populated, /"a"/);
    assert.match(populated, /"b"/);

    // Clear the pending awaits so the test does not leave dangling promises.
    correlator.reject("a", new Error("test cleanup"));
    correlator.reject("b", new Error("test cleanup"));
  });

  test("inspect output truncates the keys list past eight entries", () => {

    const correlator = new Correlator<string>();
    const stylize = (text: string): string => text;
    const inspector = (correlator as unknown as Record<symbol, (depth: number, options: { stylize: typeof stylize }) => string>)[
      Symbol.for("nodejs.util.inspect.custom")] as (depth: number, options: { stylize: typeof stylize }) => string;

    for(let i = 0; i < 12; i++) {

      correlator.await("k" + String(i)).catch((): void => { /* swallowed for inspection-only test */ });
    }

    const output = inspector.call(correlator, 0, { stylize });

    assert.match(output, /"pending":12/);
    assert.match(output, /\+4 more/);

    for(let i = 0; i < 12; i++) {

      correlator.reject("k" + String(i), new Error("test cleanup"));
    }
  });
});
