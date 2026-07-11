/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.ts: Typed callback subscriptions, one-shot promises, and async-iterable streams over a curated EventEmitter facade.
 */

/**
 * Typed event bus with three subscription rails: Disposable callbacks, one-shot Promises, and AsyncIterable streams with a configurable backpressure policy.
 *
 * @remarks Composes with `node:events.EventEmitter` internally rather than extending it. Consumers see a curated typed facade, not the platform's full inherited surface.
 * The platform handles emit, listener bookkeeping, listener-error propagation, and reentrancy edge cases; this layer adds three things on top: typed event/payload
 * mapping, `Disposable` subscription handles for `using`-style automatic teardown, and the per-stream backpressure policy that the platform's `events.on` lacks.
 *
 * One subtlety the facade hides: `node:events` reserves certain event names - notably "error", which it throws on when emitted with no listener. To keep every
 * `keyof EventMap` uniform, the facade translates each logical name to a namespaced channel before it touches the emitter (see `CHANNEL_PREFIX`). Disposal rides
 * a separate `Symbol` channel (`DISPOSE_CHANNEL`) so an internal control signal can never collide with a user event.
 *
 * The three rails map cleanly to the three signal kinds in the client's consumption model:
 *
 * | Signal kind | Method | Returns |
 * |---|---|---|
 * | Long-lived signal subscription | {@link EventBus.on} | `Disposable` callback handle |
 * | One-shot operation | {@link EventBus.once} | `Promise<payload>` |
 * | Stream of events | {@link EventBus.stream} | `AsyncIterable<payload>` |
 *
 * Internally, all three share a single `EventEmitter` so emitting a payload drives every active subscription (callback, pending once, every open stream) in one call.
 *
 * @module event-bus
 */
import { EventEmitter, once as eventsOnce } from "node:events";
import { BackpressureError } from "./errors.ts";
import type { Nullable } from "./types.ts";

/**
 * Backpressure policy for stream consumers that fall behind.
 *
 * - `dropOldest` (default) - when the queue reaches `highWaterMark`, drop items from the head before pushing the new one. Optimized for "I want a recent sample, not
 *   every sample ever" - the dominant telemetry consumer pattern.
 * - `dropNewest` - drop the incoming item without enqueuing. Optimized for "the first N samples are the relevant ones" - rarer, but useful for one-shot capture loops.
 * - `throw` - throw {@link BackpressureError} into the iterator on its next iteration past the high-water mark. Optimized for "fail loudly when I fall behind."
 */
export type StreamBackpressureMode = "dropNewest" | "dropOldest" | "throw";

/**
 * Per-stream configuration for the async-iterable stream rails.
 */
export interface StreamOptions {

  /**
   * Backpressure policy. Default `"dropOldest"`.
   */
  backpressure?: StreamBackpressureMode;

  /**
   * Maximum number of buffered items before the backpressure policy engages. Default `256`.
   */
  highWaterMark?: number;

  /**
   * Optional cancellation signal. Aborting causes the iterator to throw the abort reason on its next iteration and triggers cleanup of the underlying listener.
   */
  signal?: AbortSignal;
}

/**
 * Defaults for {@link StreamOptions} resolved when callers omit individual fields.
 */
const DEFAULT_BACKPRESSURE: StreamBackpressureMode = "dropOldest";
const DEFAULT_HIGH_WATER_MARK = 256;

/**
 * Physical channel namespace for user-facing events.
 *
 * The facade exposes a logical keyspace - every `keyof EventMap` - and promises uniform semantics for each name. The underlying `node:events.EventEmitter` does not
 * share that uniformity: it reserves a handful of names with special semantics, most consequentially "error", which the platform throws on synchronously whenever it
 * is emitted with no listener attached. Were a logical event name to land on one of those reserved names, the facade's contract would silently leak the platform's
 * behavior at exactly the moment a consumer expected the documented one.
 *
 * We close that gap at the boundary rather than hope the EventMap never contains a reserved name: every logical name is translated to a namespaced channel (see
 * {@link EventBus.channel}) before it ever reaches the emitter, so the facade's keyspace is disjoint from the platform's reserved names by construction. The
 * two-segment shape mirrors the convention used across the wider library family, which keeps raw-emitter channel names recognizable when debugging any of them.
 */
const CHANNEL_PREFIX = "esphome:event:";

/**
 * Internal control channel for teardown notification.
 *
 * Disposal is an out-of-band signal, not a member of the public `EventMap`, so it rides a `Symbol` rather than a string. A Symbol is structurally incapable of
 * colliding with any translated user channel or with any string a consumer might register, which is a stronger guarantee than a reserved-string sentinel could offer
 * and the correct primitive for a signal that is private to the bus.
 */
const DISPOSE_CHANNEL = Symbol("EventBus.dispose");

/**
 * Typed event bus. The generic `EventMap` parameter declares the supported event names and payload shapes; the type system then narrows every `on`/`once`/`stream`/
 * `emit` call to the corresponding payload.
 *
 * @typeParam EventMap - An object type mapping event names to their payload types. Interfaces work; the bound is intentionally permissive (`object`) so consumers can
 * pass either a `type` alias or an `interface` without wrestling with the `Record<string, unknown>` index-signature constraint that interfaces do not satisfy by
 * default.
 */
export class EventBus<EventMap extends object> {

  /**
   * Underlying emitter. `setMaxListeners(0)` disables the default 10-listener warning - we curate subscriptions ourselves and do not benefit from the heuristic.
   */
  private readonly emitter: EventEmitter;

  /**
   * Disposed flag. Once true, every subscription rail rejects/closes; new subscriptions resolve immediately to nothing.
   */
  private disposed = false;

  /**
   * Dispose controller. {@link dispose} aborts this controller so every pending {@link once} awaiter settles deterministically. Node's `events.once` promise only
   * settles on the event firing or on a forwarded `AbortSignal` - `removeAllListeners` alone leaves it hanging. We forward this controller's signal into every
   * `once` call (composed with the caller's optional signal via `AbortSignal.any`), so dispose rejects every otherwise-orphaned awaiter rather than wedging it.
   */
  private readonly disposeController: AbortController;

  /**
   * Memoized logical-to-physical channel names. The keyspace is bounded by `keyof EventMap` (small, fixed), so this cache stays small and stable for the bus's lifetime;
   * it lets {@link channel} hand the emitter a stable interned string per channel instead of rebuilding the concatenation on every call (the hottest rail, `emit`, calls
   * it ~2 times per telemetry frame - once for the generic channel and once for the per-type channel).
   */
  private readonly channels = new Map<string, string>();

  /**
   * Constructs a new event bus.
   */
  public constructor() {

    this.disposeController = new AbortController();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
  }

  /**
   * Translate a logical event name to its physical emitter channel. This is the single definition of the logical-to-physical mapping: every rail (`on`, `once`,
   * `stream`, `emit`, `listenerCount`) routes through it, so the namespace is applied in exactly one place and no rail can drift out of step. See `CHANNEL_PREFIX`
   * for why the namespace exists.
   *
   * @param event - The logical event name.
   * @returns The namespaced channel name handed to the underlying emitter.
   */
  private channel(event: string): string {

    let resolved = this.channels.get(event);

    if(resolved === undefined) {

      resolved = CHANNEL_PREFIX + event;
      this.channels.set(event, resolved);
    }

    return resolved;
  }

  /**
   * Subscribe a callback. The returned `Disposable` removes the listener when disposed; per the explicit-resource-management proposal, `using sub = bus.on(...)`
   * automatically tears the listener down on scope exit.
   *
   * @param event - The event name. Narrowed to keys of `EventMap`.
   * @param handler - The callback. The payload parameter type is inferred from `EventMap[event]`.
   * @returns A `Disposable` that removes the listener.
   *
   * @example
   * ```ts
   * using sub = bus.on("telemetry", (event) => { handle(event); });
   * // Subscription torn down automatically on scope exit.
   * ```
   */
  public on<K extends keyof EventMap & string>(event: K, handler: (payload: EventMap[K]) => void): Disposable {

    if(this.disposed) {

      return { [Symbol.dispose]: (): void => { /* no-op for already-disposed bus */ } };
    }

    const channel = this.channel(event);
    const wrapped = (payload: unknown): void => { handler(payload as EventMap[K]); };

    this.emitter.on(channel, wrapped);

    return { [Symbol.dispose]: (): void => { this.emitter.off(channel, wrapped); } };
  }

  /**
   * Resolve on the next emission of `event`, reject when `options.signal` is aborted, or reject when the bus is disposed. Delegates to the platform's `events.once()`
   * which handles signal composition and listener cleanup natively; we compose the caller's optional signal with the bus's internal dispose signal so a pending awaiter
   * settles on dispose rather than hanging.
   *
   * @param event - The event name. Narrowed to keys of `EventMap`.
   * @param options - Optional cancellation signal.
   * @returns A `Promise` that resolves with the next payload.
   *
   * @example
   * ```ts
   * const info = await bus.once("deviceInfo", { signal: AbortSignal.timeout(5000) });
   * ```
   */
  public async once<K extends keyof EventMap & string>(event: K, options?: { signal?: AbortSignal }): Promise<EventMap[K]> {

    if(this.disposed) {

      throw new Error("EventBus is disposed.");
    }

    // We forward the dispose signal alongside the caller's optional signal. Node's events.once settles only on the event firing or on a forwarded AbortSignal aborting -
    // removeAllListeners does NOT settle it - so composing the dispose signal here is what lets dispose() reject an otherwise-orphaned awaiter. AbortSignal.any rejects
    // with the reason of whichever signal aborts first, so a caller-supplied abort still surfaces its own reason and a dispose surfaces the typed dispose reason.
    const signal = (options?.signal !== undefined) ? AbortSignal.any([ options.signal, this.disposeController.signal ]) : this.disposeController.signal;
    const args = await eventsOnce(this.emitter, this.channel(event), { signal });

    return args[0] as EventMap[K];
  }

  /**
   * Async-iterable view of every emission of `event` for the lifetime of the iteration. Applies the backpressure policy from {@link StreamOptions}.
   *
   * The iterator ends on:
   * - `options.signal` abort (rejects with the abort reason)
   * - {@link EventBus.dispose} (resolves cleanly)
   * - the consumer breaking out of `for await` (the `return()` path tears down the listener)
   *
   * Each call to {@link EventBus.stream} produces an independent subscription. Two concurrent iterators of the same event each receive every emission.
   *
   * @param event - The event name. Narrowed to keys of `EventMap`.
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<EventMap[K]>`.
   *
   * @example
   * ```ts
   * for await (const event of bus.stream("telemetry", { backpressure: "dropOldest", highWaterMark: 128, signal })) {
   *   handle(event);
   * }
   * ```
   */
  public stream<K extends keyof EventMap & string>(event: K, options: StreamOptions = {}): AsyncIterable<EventMap[K]> {

    if(this.disposed) {

      // After dispose the one-shot DISPOSE_CHANNEL has already fired, so a freshly constructed BackpressureStream would attach a dispose listener that never settles and
      // park in next() forever. We mirror the defensive on()/once() dispose handling by returning an already-ended iterable, so a post-dispose stream ends cleanly.
      return endedAsyncIterable<EventMap[K]>();
    }

    return new BackpressureStream<EventMap[K]>(this.emitter, this.channel(event), {

      backpressure: options.backpressure ?? DEFAULT_BACKPRESSURE,
      highWaterMark: options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK,
      signal: options.signal
    });
  }

  /**
   * Emit a payload. Type-narrowed against `EventMap` so a typo in the event name or a payload-shape mismatch is a compile error.
   *
   * @param event - The event name.
   * @param payload - The payload value, narrowed to `EventMap[event]`.
   * @returns `true` if any listener received the event, mirroring `EventEmitter.emit`.
   */
  public emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): boolean {

    if(this.disposed) {

      return false;
    }

    return this.emitter.emit(this.channel(event), payload);
  }

  /**
   * Returns the number of listeners registered on `event`. This counts both `on()` callback subscriptions and any active `stream()` iterators, because each stream
   * attaches one listener to the same channel for the lifetime of its iteration. The count therefore reflects every live delivery target, not callbacks alone - which
   * is why a stream's listener detaching on consumer-side break drops the count back to zero.
   *
   * @param event - The event name.
   * @returns The listener count.
   */
  public listenerCount(event: keyof EventMap & string): number {

    return this.emitter.listenerCount(this.channel(event));
  }

  /**
   * Tears down every active subscription, callback, pending once, and stream attached to this bus. Safe to call more than once.
   *
   * @remarks After dispose, `on`/`once`/`stream` all behave defensively: a NEW `on` returns a no-op handle, a NEW `once` rejects synchronously, a NEW `stream` ends.
   * Subscriptions that are already in flight at dispose time are settled deterministically: a pending `once()` awaiter rejects with a `DOMException("EventBus disposed.",
   * "AbortError")` because dispose aborts the internal dispose controller whose signal every `once` forwards (a plain `removeAllListeners` would leave a signal-less
   * awaiter hanging forever, which is the bug this composition fixes); an active `stream()` iterator resolves cleanly (`done: true`) via the `DISPOSE_CHANNEL`
   * control signal; and an `on()` callback simply stops receiving emissions once its listener is removed.
   */
  public dispose(): void {

    if(this.disposed) {

      return;
    }

    this.disposed = true;

    // Aborting the dispose controller settles every pending `once()` awaiter: each forwarded its signal via AbortSignal.any, so the abort rejects the awaiter with the
    // typed dispose reason below. This is the part removeAllListeners alone cannot do - Node's events.once promise does not settle when its listener is removed, only
    // when the event fires or a forwarded signal aborts. Active streams instead see the DISPOSE_CHANNEL control signal and resolve cleanly through their own teardown.
    this.disposeController.abort(new DOMException("EventBus disposed.", "AbortError"));
    this.emitter.emit(DISPOSE_CHANNEL);
    this.emitter.removeAllListeners();
  }

  /**
   * Symbol.dispose hook - lets `using bus = new EventBus<...>()` tear the bus down on scope exit.
   */
  public [Symbol.dispose](): void {

    this.dispose();
  }
}

/**
 * An already-ended async-iterable - a `for await` over it completes immediately, yielding nothing. {@link EventBus.stream} returns this after dispose so a stream created
 * post-dispose ends cleanly (mirroring the defensive `on`/`once` handling) rather than parking forever: the one-shot `DISPOSE_CHANNEL` has already fired, so a freshly
 * constructed {@link BackpressureStream} would attach a dispose listener that never settles.
 */
function endedAsyncIterable<T>(): AsyncIterable<T> {

  return { [Symbol.asyncIterator]: (): AsyncIterator<T> => ({ next: (): Promise<IteratorResult<T>> => Promise.resolve({ done: true, value: undefined }) }) };
}

/**
 * AsyncIterableIterator implementation backing {@link EventBus.stream}. Owns a per-stream queue with the configured high-water mark and backpressure policy; attaches
 * one listener to the parent emitter for the lifetime of the iteration.
 *
 * @internal
 */
class BackpressureStream<T> implements AsyncIterableIterator<T> {

  /**
   * Items waiting to be yielded, in arrival order.
   */
  private readonly queue: T[] = [];

  /**
   * Resolver for the awaiter that is currently parked in `next()`. Set when a consumer awaits and the queue is empty; cleared as soon as we resolve it.
   */
  private resolveNext: Nullable<(result: IteratorResult<T>) => void> = null;

  /**
   * Reject for the awaiter that is currently parked in `next()`. Used when the stream errors (signal abort or backpressure throw) while a consumer is parked.
   */
  private rejectNext: Nullable<(reason: unknown) => void> = null;

  /**
   * Count of items the stream has dropped under the configured backpressure policy. Reported in {@link BackpressureError} payload when `backpressure: "throw"` fires.
   */
  private dropped = 0;

  /**
   * True once the stream has reached a terminal state (signal abort, dispose, consumer return). New `next()` calls resolve `done`.
   */
  private closed = false;

  /**
   * Pending error. When set, the next `next()` call throws this rather than yielding from the queue. Used by signal abort and backpressure throw modes.
   */
  private error: Error | null = null;

  /**
   * Listener cleanup. Runs once on first terminal state; safe to call more than once through the `closed` guard.
   */
  private readonly cleanup: () => void;

  /**
   * Resolved (no defaults applied) stream options.
   */
  private readonly options: { backpressure: StreamBackpressureMode; highWaterMark: number; signal: AbortSignal | undefined };

  /**
   * @param emitter - Parent emitter.
   * @param eventName - The already-namespaced channel to subscribe to. The bus translates the logical event name via {@link EventBus.channel} before constructing the
   *   stream, so this value is the physical emitter channel, not the logical event name.
   * @param options - Resolved (no defaults applied) stream options. The caller resolves defaults before constructing.
   */
  public constructor(emitter: EventEmitter, eventName: string,
    options: { backpressure: StreamBackpressureMode; highWaterMark: number; signal: AbortSignal | undefined }) {

    this.options = options;

    const onPayload = (payload: unknown): void => { this.push(payload as T); };
    const onAbort = (): void => {

      const reason = options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("Aborted", "AbortError");

      this.fail(reason);
    };
    const onDispose = (): void => { this.finish(); };

    emitter.on(eventName, onPayload);
    emitter.on(DISPOSE_CHANNEL, onDispose);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    this.cleanup = (): void => {

      emitter.off(eventName, onPayload);
      emitter.off(DISPOSE_CHANNEL, onDispose);
      options.signal?.removeEventListener("abort", onAbort);
    };

    if(options.signal?.aborted) {

      onAbort();
    }
  }

  /**
   * Push a payload into the queue, applying the backpressure policy when the queue is full.
   */
  private push(value: T): void {

    if(this.closed) {

      return;
    }

    // Park-resolution fast path: if a consumer is awaiting, hand the item directly without going through the queue.
    if(this.resolveNext) {

      const resolve = this.resolveNext;

      this.resolveNext = null;
      this.rejectNext = null;
      resolve({ done: false, value });

      return;
    }

    if(this.queue.length >= this.options.highWaterMark) {

      switch(this.options.backpressure) {

        case "dropOldest":

          this.queue.shift();
          this.queue.push(value);
          this.dropped++;

          return;

        case "dropNewest":

          this.dropped++;

          return;

        case "throw":

          this.dropped++;
          this.fail(new BackpressureError("Stream high-water mark exceeded after dropping " + String(this.dropped) + " item(s).", this.dropped));

          return;
      }
    }

    this.queue.push(value);
  }

  /**
   * Mark the stream as failed. Any parked consumer is rejected with `reason`; future `next()` calls also throw `reason`.
   */
  private fail(reason: Error): void {

    if(this.closed) {

      return;
    }

    this.closed = true;
    this.error = reason;

    if(this.rejectNext) {

      const reject = this.rejectNext;

      this.resolveNext = null;
      this.rejectNext = null;
      reject(reason);
    }

    this.cleanup();
  }

  /**
   * Mark the stream as cleanly finished. Any parked consumer resolves done.
   */
  private finish(): void {

    if(this.closed) {

      return;
    }

    this.closed = true;

    if(this.resolveNext) {

      const resolve = this.resolveNext;

      this.resolveNext = null;
      this.rejectNext = null;
      resolve({ done: true, value: undefined });
    }

    this.cleanup();
  }

  /**
   * Returns the next item, or throws/closes per the stream's terminal state.
   */
  public async next(): Promise<IteratorResult<T>> {

    // Drain the queue first so we never lose items already in flight.
    if(this.queue.length > 0) {

      // The queue can legitimately hold an `undefined` payload - the `heartbeat` channel's payload is always undefined and `disconnect` is `string | undefined`. A
      // positive length guarantees a real buffered item, so we narrow the shift result structurally: the value IS the payload, never an absence signal. Gating on
      // `value !== undefined` here would instead drop those legitimate undefined payloads and park as if the queue were empty, stalling the consumer.
      const value = this.queue.shift() as T;

      return { done: false, value };
    }

    if(this.error) {

      throw this.error;
    }

    if(this.closed) {

      return { done: true, value: undefined };
    }

    const { promise, resolve, reject } = Promise.withResolvers<IteratorResult<T>>();

    this.resolveNext = resolve;
    this.rejectNext = reject;

    return promise;
  }

  /**
   * Consumer-initiated termination via `for await` break/throw. Tears down the listener and resolves the iterator.
   */
  public async return(): Promise<IteratorResult<T>> {

    this.finish();

    return { done: true, value: undefined };
  }

  /**
   * AsyncIterable hook. Returns this iterator unchanged so a single stream is single-consumer (multiple consumers each call `bus.stream()` separately).
   */
  public [Symbol.asyncIterator](): this {

    return this;
  }
}
