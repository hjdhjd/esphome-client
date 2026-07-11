/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reconnect.test.ts: Unit tests for the reconnect supervisor primitives and the withReconnect helper.
 */
import { HealthState, disconnectedHealth } from "./health.ts";
import { defaultShouldRetry, nextBackoffDelay, reconnectDelay, resolveReconnectConfig, withReconnect } from "./reconnect.ts";
import { describe, test } from "node:test";
import { AuthenticationError } from "./errors.ts";
import { ConnectionError } from "./errors.ts";
import type { ConnectionHealth } from "./health.ts";
import type { LifecycleEvent } from "./lifecycle.ts";
import type { Nullable } from "./types.ts";
import type { WithReconnectClient } from "./reconnect.ts";
import assert from "node:assert/strict";
import { mockHealth } from "./testing/factories.ts";

describe("resolveReconnectConfig", () => {

  test("applies the documented defaults when given undefined", () => {

    const cfg = resolveReconnectConfig(undefined);

    assert.equal(cfg.backoffMultiplier, 2);
    assert.equal(cfg.initialDelayMs, 500);
    assert.equal(cfg.jitter, 0.2);
    assert.equal(cfg.maxAttempts, undefined, "default maxAttempts is unlimited");
    assert.equal(cfg.maxDelayMs, 30000);
    assert.equal(cfg.shouldRetry, defaultShouldRetry, "default predicate is defaultShouldRetry");
    assert.equal(cfg.onAttempt, undefined);
  });

  test("preserves user-supplied values verbatim", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 3, initialDelayMs: 100, jitter: 0, maxAttempts: 5, maxDelayMs: 1000 });

    assert.equal(cfg.backoffMultiplier, 3);
    assert.equal(cfg.initialDelayMs, 100);
    assert.equal(cfg.jitter, 0);
    assert.equal(cfg.maxAttempts, 5);
    assert.equal(cfg.maxDelayMs, 1000);
  });

  test("preserves a user-supplied shouldRetry predicate", () => {

    const custom = (): boolean => false;
    const cfg = resolveReconnectConfig({ shouldRetry: custom });

    assert.equal(cfg.shouldRetry, custom);
  });

  test("preserves a user-supplied onAttempt callback", () => {

    const onAttempt = (): void => { /* noop */ };
    const cfg = resolveReconnectConfig({ onAttempt });

    assert.equal(cfg.onAttempt, onAttempt);
  });
});

describe("defaultShouldRetry", () => {

  test("returns true for a non-permanent error", () => {

    assert.equal(defaultShouldRetry(new ConnectionError("transient")), true);
  });

  test("returns false for a PermanentError subclass", () => {

    assert.equal(defaultShouldRetry(new AuthenticationError("auth failed")), false);
  });
});

describe("nextBackoffDelay", () => {

  test("attempt 1 returns approximately initialDelayMs", () => {

    // jitter: 0 fixes the result to exactly initialDelayMs.
    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 500, jitter: 0, maxDelayMs: 30000 });

    assert.equal(nextBackoffDelay(1, cfg), 500);
  });

  test("attempt 2 returns initialDelayMs * backoffMultiplier with no jitter", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 500, jitter: 0, maxDelayMs: 30000 });

    assert.equal(nextBackoffDelay(2, cfg), 1000);
  });

  test("attempt 3 returns initialDelayMs * backoffMultiplier^2 with no jitter", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 500, jitter: 0, maxDelayMs: 30000 });

    assert.equal(nextBackoffDelay(3, cfg), 2000);
  });

  test("clamps at maxDelayMs", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 1000, jitter: 0, maxDelayMs: 5000 });

    // attempt 10: 1000 * 2^9 = 512000, clamped to 5000.
    assert.equal(nextBackoffDelay(10, cfg), 5000);
  });

  test("never returns a negative delay even at very high jitter", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 100, jitter: 0.99, maxDelayMs: 30000 });

    for(let i = 0; i < 100; i++) {

      assert.equal(nextBackoffDelay(1, cfg) >= 0, true, "delay must always be non-negative");
    }
  });

  test("with jitter, results vary across calls", () => {

    const cfg = resolveReconnectConfig({ backoffMultiplier: 2, initialDelayMs: 1000, jitter: 0.5, maxDelayMs: 30000 });
    const results = new Set<number>();

    for(let i = 0; i < 50; i++) {

      results.add(nextBackoffDelay(1, cfg));
    }

    assert.equal(results.size > 1, true, "non-zero jitter must produce varying delays");
  });
});

describe("reconnectDelay", () => {

  test("resolves after the requested delay (with abort signal honored)", async () => {

    const controller = new AbortController();

    setImmediate(() => controller.abort());

    await assert.rejects(reconnectDelay(60000, controller.signal), { name: "AbortError" }, "abort during reconnect delay must reject");
  });

  test("resolves cleanly when no abort signal is supplied", async () => {

    await reconnectDelay(0);
  });
});

// Lightweight test fixture for WithReconnectClient. Drives a manual lifecycle stream and a configurable health snapshot so the helper's transition logic is testable.
function makeFakeClient(initialHealth: ConnectionHealth = disconnectedHealth()): WithReconnectClient & {
  push(event: LifecycleEvent): void;
  end(): void;
  setHealth(state: HealthState): void;
} {

  let currentHealth = initialHealth;
  const queue: LifecycleEvent[] = [];
  let pendingResolve: Nullable<(value: IteratorResult<LifecycleEvent>) => void> = null;
  let ended = false;

  return {

    end: (): void => {

      ended = true;
      pendingResolve?.({ done: true, value: undefined });
      pendingResolve = null;
    },
    health: (): ConnectionHealth => currentHealth,
    lifecycle: (): AsyncIterable<LifecycleEvent> => ({

      [Symbol.asyncIterator]: (): AsyncIterator<LifecycleEvent> => ({

        next: async (): Promise<IteratorResult<LifecycleEvent>> => {

          const queued = queue.shift();

          if(queued) {

            return { done: false, value: queued };
          }

          if(ended) {

            return { done: true, value: undefined };
          }

          return new Promise<IteratorResult<LifecycleEvent>>((resolve) => {

            pendingResolve = resolve;
          });
        }
      })
    }),
    push: (event: LifecycleEvent): void => {

      if(pendingResolve) {

        pendingResolve({ done: false, value: event });
        pendingResolve = null;

        return;
      }

      queue.push(event);
    },
    setHealth: (state: HealthState): void => {

      // Rebuild the snapshot for the target state, honoring the discriminated union: a "socket up" state (connected or stalled) carries the connect epoch, while a
      // "socket down" state (disconnected or reconnecting) forbids it. We carry the current base diagnostics forward in both directions.
      const live = (state === HealthState.CONNECTED) || (state === HealthState.STALLED);

      currentHealth = live ? {

        connectedAtMs: currentHealth.connectedAtMs ?? Date.now(),
        consecutiveStalls: currentHealth.consecutiveStalls,
        encrypted: currentHealth.encrypted,
        lastInboundActivityAt: currentHealth.lastInboundActivityAt,
        state
      } : {

        consecutiveStalls: currentHealth.consecutiveStalls,
        encrypted: false,
        lastInboundActivityAt: currentHealth.lastInboundActivityAt,
        state
      };
    }
  };
}

describe("withReconnect", () => {

  test("runs body immediately when the client starts connected", async () => {

    const fake = makeFakeClient(mockHealth());
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, () => {

      bodyCalled++;
    });

    // Give the helper a tick to schedule body and start iterating.
    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 1, "body must run once for the existing connect");
  });

  test("does NOT run body when the client starts disconnected and no connect arrives", async () => {

    const fake = makeFakeClient();
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, () => { bodyCalled++; });

    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 0, "body must NOT run when the client never connects");
  });

  test("runs body on each connect transition", async () => {

    const fake = makeFakeClient();
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, () => { bodyCalled++; });

    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.push({ kind: "disconnect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 2, "body must run once per connect transition");
  });

  test("aborts the body's signal on disconnect", async () => {

    const fake = makeFakeClient();
    let abortFired = false;

    const helperPromise = withReconnect(fake, async (_, signal) => {

      signal.addEventListener("abort", () => { abortFired = true; });

      // Hold open until aborted.
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
    });

    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.push({ kind: "disconnect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(abortFired, true, "the body's signal must abort on disconnect");
  });

  test("returns when the outer signal aborts", async () => {

    const fake = makeFakeClient();
    const controller = new AbortController();
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, () => { bodyCalled++; }, { signal: controller.signal });

    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    controller.abort();

    // The fake's lifecycle iterator ignores the abort signal, so `fake.end()` is what terminates the loop and lets the helper observe the loop end after the outer abort.
    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 1, "body ran once before the outer abort fired");
  });

  // The helper's contract: "Errors from the body are the body's responsibility - the helper only tracks lifecycle transitions and surfaces nothing." Both failure modes
  // (sync throw, async reject) must be absorbed identically so the lifecycle loop survives the next connect transition.
  test("swallows synchronous throws from the body and keeps iterating lifecycle events", async () => {

    const fake = makeFakeClient(mockHealth());
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, () => {

      bodyCalled++;
      throw new Error("body sync failure");
    });

    // Drive a disconnect/reconnect cycle so the body fires twice. If the sync throw had escaped, the helper would reject before the second connect could even fire.
    await new Promise((resolve) => setImmediate(resolve));
    fake.push({ kind: "disconnect" });
    await new Promise((resolve) => setImmediate(resolve));
    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 2, "body must have fired on both the initial connect and the post-disconnect reconnect despite each invocation throwing");
  });

  test("swallows asynchronous rejections from the body and keeps iterating lifecycle events", async () => {

    const fake = makeFakeClient(mockHealth());
    let bodyCalled = 0;

    const helperPromise = withReconnect(fake, async () => {

      bodyCalled++;

      return Promise.reject(new Error("body async failure"));
    });

    await new Promise((resolve) => setImmediate(resolve));
    fake.push({ kind: "disconnect" });
    await new Promise((resolve) => setImmediate(resolve));
    fake.push({ encrypted: false, kind: "connect" });
    await new Promise((resolve) => setImmediate(resolve));

    fake.end();
    await helperPromise;

    assert.equal(bodyCalled, 2, "body must have fired on both the initial connect and the post-disconnect reconnect despite each invocation rejecting");
  });
});
