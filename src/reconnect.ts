/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reconnect.ts: Auto-reconnect supervisor and withReconnect helper.
 */

/**
 * Auto-reconnect supervisor.
 *
 * @remarks Reconnect is on by default - the consumer who never configures reconnection gets battle-tested defaults: 500ms initial delay, 2x backoff, 30s cap, 20%
 * jitter, unlimited attempts. Permanent errors ({@link PermanentError} subclasses) are skipped automatically because the error hierarchy classifies them as such; pass
 * `reconnect: false` to disable entirely.
 *
 * @module reconnect
 */
import type { ConnectionHealth } from "./health.ts";
import type { EspHomeError } from "./errors.ts";
import { HealthState } from "./health.ts";
import type { LifecycleEvent } from "./lifecycle.ts";
import type { Nullable } from "./types.ts";
import { PermanentError } from "./errors.ts";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Auto-reconnect configuration. Every field has a sensible default; the empty object `{}` is the recommended way to opt in with defaults.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#reconnect-with-permanent-error}
 */
export interface ReconnectConfig {

  /**
   * Multiplier applied to each successive delay. Default 2 (doubling backoff).
   */
  backoffMultiplier?: number;

  /**
   * Initial backoff in milliseconds before the first retry. Default 500.
   */
  initialDelayMs?: number;

  /**
   * Random jitter factor in [0, 1] applied to each delay. Default 0.2 (+/-20%). Prevents thundering-herd reconnects across multiple clients.
   */
  jitter?: number;

  /**
   * Maximum number of attempts. Default `undefined` (unlimited).
   */
  maxAttempts?: number;

  /**
   * Upper bound on a single delay in milliseconds. Default 30000.
   */
  maxDelayMs?: number;

  /**
   * Called before each attempt. Useful for logging and metrics integration.
   */
  onAttempt?: (attempt: number, delayMs: number) => void;

  /**
   * Predicate determining whether to retry. Default: `!(error instanceof PermanentError)` - skip permanent errors (encryption, auth, version mismatch).
   *
   * @param error - The error from the most recent failed attempt.
   * @param attempts - Number of attempts so far.
   * @returns `true` to retry, `false` to give up.
   */
  shouldRetry?: (error: EspHomeError, attempts: number) => boolean;
}

/**
 * Default predicate. Skip permanent errors; retry everything else.
 *
 * @internal
 */
export function defaultShouldRetry(error: EspHomeError): boolean {

  return !(error instanceof PermanentError);
}

/**
 * Resolved (defaults applied) reconnect config. Mirrors {@link ReconnectConfig} field-for-field with every default already applied by {@link resolveReconnectConfig},
 * so each field below carries the same semantics as its optional counterpart there; see that interface for the full rationale behind each default.
 *
 * @internal
 */
export interface ResolvedReconnectConfig {

  /**
   * Multiplier applied to each successive delay. See {@link ReconnectConfig.backoffMultiplier}.
   */
  backoffMultiplier: number;

  /**
   * Initial backoff in milliseconds before the first retry. See {@link ReconnectConfig.initialDelayMs}.
   */
  initialDelayMs: number;

  /**
   * Random jitter factor in [0, 1] applied to each delay. See {@link ReconnectConfig.jitter}.
   */
  jitter: number;

  /**
   * Maximum number of attempts, or `undefined` for unlimited. See {@link ReconnectConfig.maxAttempts}.
   */
  maxAttempts: number | undefined;

  /**
   * Upper bound on a single delay in milliseconds. See {@link ReconnectConfig.maxDelayMs}.
   */
  maxDelayMs: number;

  /**
   * Called before each attempt, or `undefined` if the caller didn't supply one. See {@link ReconnectConfig.onAttempt}.
   */
  onAttempt: ((attempt: number, delayMs: number) => void) | undefined;

  /**
   * Predicate determining whether to retry. See {@link ReconnectConfig.shouldRetry}.
   */
  shouldRetry: (error: EspHomeError, attempts: number) => boolean;
}

/**
 * Resolve {@link ReconnectConfig} defaults.
 *
 * @param config - The user-supplied config, or `undefined` for full defaults.
 * @returns A resolved config with every field populated.
 *
 * @internal
 */
export function resolveReconnectConfig(config: ReconnectConfig | undefined): ResolvedReconnectConfig {

  return {

    backoffMultiplier: config?.backoffMultiplier ?? 2,
    initialDelayMs: config?.initialDelayMs ?? 500,
    jitter: config?.jitter ?? 0.2,
    maxAttempts: config?.maxAttempts,
    maxDelayMs: config?.maxDelayMs ?? 30000,
    onAttempt: config?.onAttempt,
    shouldRetry: config?.shouldRetry ?? defaultShouldRetry
  };
}

/**
 * Compute the next backoff delay for a reconnect attempt. The base delay is a deterministic exponential backoff - `initialDelayMs * backoffMultiplier^(attempt - 1)`,
 * capped at `maxDelayMs`. The returned value then applies up to +/- `config.jitter` of random jitter via `Math.random()`, so it is deterministic given the inputs only
 * when `config.jitter` is 0... otherwise repeated calls with the same arguments return different values by design, since the jitter spreads reconnect storms across
 * many clients rather than synchronizing them.
 *
 * @param attempt - 1-based attempt index.
 * @param config - Resolved config.
 * @returns The delay in milliseconds to wait before the next attempt.
 *
 * @internal
 */
export function nextBackoffDelay(attempt: number, config: ResolvedReconnectConfig): number {

  const baseDelay = Math.min(config.initialDelayMs * (config.backoffMultiplier ** (attempt - 1)), config.maxDelayMs);
  const jitterFactor = 1 + (((Math.random() * 2) - 1) * config.jitter);

  return Math.max(0, Math.floor(baseDelay * jitterFactor));
}

/**
 * Sleep for the given number of milliseconds, honoring an abort signal. A thin wrapper around `node:timers/promises` `setTimeout` that pins a fixed `(ms, signal)`
 * signature so the supervisor doesn't have to thread the native `(delay, value, options)` shape directly.
 *
 * @param ms - The delay in milliseconds.
 * @param signal - Optional cancellation signal.
 *
 * @internal
 */
export async function reconnectDelay(ms: number, signal?: AbortSignal): Promise<void> {

  await delay(ms, undefined, { signal });
}

/**
 * Narrow seam {@link withReconnect} drives. The host implements both `lifecycle()` (typed-iterable view of every connect/disconnect transition) and `health()` (the
 * live snapshot - the helper reads it once at start to know whether a connect has already happened, in which case the body runs immediately rather than waiting for
 * the next connect transition).
 */
export interface WithReconnectClient {

  health(): ConnectionHealth;
  lifecycle(options?: { signal?: AbortSignal }): AsyncIterable<LifecycleEvent>;
}

/**
 * Options accepted by {@link withReconnect}.
 */
export interface WithReconnectOptions {

  /**
   * Cancellation signal. Aborting drains the iterator and returns from the helper.
   */
  signal?: AbortSignal;
}

/**
 * Run a body callback once per successful connect. The helper subscribes to {@link WithReconnectClient.lifecycle}, fires the body on the first observed `connect`
 * event (or immediately if the client is already connected when the helper starts), and re-fires on every subsequent `connect` after a `disconnect`. The body's
 * abort signal aborts the moment the matching `disconnect` arrives so re-entrant operations (`commandAndAwait`, `client.stream(...)` iterators) can wind down cleanly.
 *
 * Typical use: re-issue protocol-level operations whose lifetime is bound to a single connect (e.g. `client.voiceAssistant.subscribe()`, `subscribeToLogs`,
 * `client.camera(id).stream()`). For state that survives reconnects (the EventBus, telemetry subscriptions, latest-state cache), no helper is needed - the host
 * preserves them automatically.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#with-reconnect}
 *
 * @param client - Any object exposing a `lifecycle()` async-iterable view and a `health()` snapshot returning a {@link ConnectionHealth} record (typically an
 * {@link EspHomeClient} but can be any compatible test harness).
 * @param body - Callback invoked on every successful connect. Receives the client and an `AbortSignal` that fires on the next disconnect; should respect it.
 * @param options - Optional outer cancellation signal.
 * @returns A promise that resolves when the outer signal aborts or the lifecycle stream ends.
 */
export async function withReconnect(client: WithReconnectClient, body: (client: WithReconnectClient, signal: AbortSignal) => Promise<void> | void,
  options?: WithReconnectOptions): Promise<void> {

  // Holder used as a mutable cell so the inner signal can be aborted across closures without TypeScript narrowing the variable to `null` mid-flow.
  const state: { controller: Nullable<AbortController>; promise: Nullable<Promise<void>> } = { controller: null, promise: null };

  // Invoke the body inside its own AbortController-scoped signal. The latest controller is kept on `state` so the next `disconnect` event can abort it. Errors from
  // the body are the body's responsibility - the helper only tracks lifecycle transitions and surfaces nothing. The controller is captured into a local const before
  // entering the Promise.try closure so the closure doesn't depend on flow narrowing of the mutable `state.controller` cell.
  const runBody = (): void => {

    state.controller?.abort();

    const controller = new AbortController();

    state.controller = controller;
    state.promise = Promise.try(() => body(client, controller.signal)).catch((): void => { /* body errors are the body's responsibility */ });
  };

  // Run immediately if the client is already connected - the lifecycle iterator only fires on transitions, not on the current state.
  if(client.health().state === HealthState.CONNECTED) {

    runBody();
  }

  try {

    for await (const event of client.lifecycle({ ...(options?.signal ? { signal: options.signal } : {}) })) {

      if(event.kind === "connect") {

        runBody();

        continue;
      }

      // event.kind === "disconnect": abort the body so its in-flight operations wind down before the next connect attempt.
      state.controller?.abort();
    }

  } finally {

    state.controller?.abort();

    // Wait for the in-flight body to settle so the helper's promise never resolves while the body is still running.
    if(state.promise) {

      await state.promise;
    }
  }
}
