/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * correlator.ts: Per-key request/response correlation primitive with abort, timeout, and in-flight-guard semantics.
 */

import { ConnectionError } from "./errors.ts";

/**
 * Single source of truth for "issue a request, await its correlated response with timeout and abort" across the ESPHome client.
 *
 * @remarks A {@link Correlator} owns a `Map` of pending awaits keyed by a serialised form of `K`. This primitive is the single source of truth for issuing,
 * awaiting, resolving, timing out, and aborting correlated requests across the library. The Map entry's presence is the source of truth for whether an await
 * is in flight - there is no separate `settled` flag, because the moment a key is settled (resolve, reject, timeout, abort, or {@link Correlator.rejectAll})
 * the entry is deleted.
 *
 * Three semantic guarantees the primitive provides that ad-hoc resolvers do not:
 *
 * 1. **Listener cleanup is automatic.** Every await composes its abort sources (`AbortSignal.any` over the optional timeout and the optional user signal) and detaches
 *    the abort listener the moment the entry settles via any path. No listener-on-long-lived-signal leaks.
 * 2. **In-flight guard is uniform.** A second {@link Correlator.await} for the same key throws {@link ConnectionError} with code `"CORRELATOR_KEY_IN_FLIGHT"`. Hosts
 *    that want their own error code call {@link Correlator.pending} first and throw the host-specific error before invoking `await`.
 * 3. **Stray responses are observable.** {@link Correlator.resolve} and {@link Correlator.reject} return a boolean indicating whether a pending await was settled. A
 *    host that needs to handle "response arrived after the await already timed out and gave up" can branch on the return value.
 *
 * @typeParam T - The value type produced on successful correlation. The {@link Correlator.resolve} method narrows on `T`.
 * @typeParam K - The key type. Defaults to `string`. For composite keys (tuples, branded types) supply {@link CorrelatorOptions.keyToString} so two structurally-equal
 * keys hash to the same slot.
 *
 * @example
 * ```ts
 * // Single-slot case: a graceful-disconnect handshake that races a server response against a timeout.
 * const correlator = new Correlator<void>();
 *
 * transport.send(MessageType.DISCONNECT_REQUEST, Buffer.alloc(0));
 *
 * try {
 *
 *   await correlator.await("graceful", { timeoutMs: 1000 });
 *
 * } catch(err) {
 *
 *   if((err instanceof DOMException) && (err.name === "AbortError")) {
 *
 *     log.debug("Graceful disconnect timed out; tearing down anyway.");
 *
 *   } else {
 *
 *     throw err;
 *   }
 * }
 *
 * // Elsewhere, in the dispatcher that receives DISCONNECT_RESPONSE:
 * correlator.resolve("graceful", undefined);
 * ```
 *
 * @example
 * ```ts
 * // Keyed case: a BLE GATT subsystem awaiting reads keyed by [address, handle]. The keyToString function serialises the tuple deterministically so two structurally-
 * // equal tuples hash to the same slot.
 * const gattReads = new Correlator<Buffer, [bigint, number]>({ keyToString: ([address, handle]) => address.toString(16) + ":" + handle });
 *
 * const value = await gattReads.await([address, handle], { signal: userSignal, timeoutMs: 5000 });
 * ```
 */
export class Correlator<T, K = string> {

  /**
   * Backing store. Maps the serialised key form to its in-flight {@link PendingEntry}. Entry presence is the source of truth for whether an await is pending; settling
   * removes the entry.
   */
  private readonly entries = new Map<string, PendingEntry<T>>();

  /**
   * Key serialiser. Defaults to `String(key)`; consumers supply their own via {@link CorrelatorOptions.keyToString} when `K` is a composite that needs deterministic
   * stringification.
   */
  private readonly serialise: (key: K) => string;

  /**
   * Constructs a new correlator.
   *
   * @param options - Optional configuration. The only supported option today is {@link CorrelatorOptions.keyToString}.
   */
  public constructor(options?: CorrelatorOptions<K>) {

    this.serialise = options?.keyToString ?? ((key: K): string => String(key));
  }

  /**
   * Number of currently-pending awaits. Primarily a test affordance plus a debug aid via the `util.inspect` hook.
   */
  public get size(): number {

    return this.entries.size;
  }

  /**
   * Begin awaiting a correlated response for `key`. The returned promise resolves when {@link Correlator.resolve} is later called for the matching key, and rejects on
   * timeout, abort, {@link Correlator.reject}, or {@link Correlator.rejectAll}.
   *
   * @param key - The correlation key. Serialised via {@link CorrelatorOptions.keyToString} for the Map lookup.
   * @param options - Optional timeout and user-supplied abort signal. When neither is supplied, the await waits indefinitely for a {@link Correlator.resolve} or
   * {@link Correlator.reject} from outside.
   *
   * @returns A promise that resolves with the value passed to {@link Correlator.resolve}.
   *
   * @throws Immediately - the returned promise rejects in the synchronous prelude (before any timeout is armed), via `signal.throwIfAborted()`, when `options.signal`
   * is already aborted at call time, mirroring the platform's `events.once` contract.
   * @throws Immediately - the returned promise rejects in the synchronous prelude with a {@link ConnectionError} carrying code `"CORRELATOR_KEY_IN_FLIGHT"` when
   * another await for the same serialised key is still pending. Hosts that want a host-specific code call {@link Correlator.pending} first and throw their own error
   * before invoking this method.
   * @throws Asynchronously - a `DOMException` with `name === "AbortError"` when the timeout elapses. When the user signal aborts, the promise rejects with
   * `signal.reason` (typically an `AbortError`, or the custom reason passed to `AbortController.abort(reason)`).
   * @throws Asynchronously - the reason supplied to {@link Correlator.reject} or {@link Correlator.rejectAll}.
   */
  public async await(key: K, options?: CorrelatorAwaitOptions): Promise<T> {

    options?.signal?.throwIfAborted();

    const serialKey = this.serialise(key);

    if(this.entries.has(serialKey)) {

      throw new ConnectionError("Correlator key " + JSON.stringify(serialKey) + " already has a pending await; settle it before issuing another.",
        "CORRELATOR_KEY_IN_FLIGHT");
    }

    const { promise, reject, resolve } = Promise.withResolvers<T>();

    // Compose every available abort source so a single listener observes whichever fires first. We track the user signal separately because we propagate its `reason`
    // verbatim on user-driven aborts; the timeout case manufactures its own AbortError so the message is precise about the duration.
    const userSignal = options?.signal;
    const timeoutMs = options?.timeoutMs;
    const signals: AbortSignal[] = [];

    if(timeoutMs !== undefined) {

      signals.push(AbortSignal.timeout(timeoutMs));
    }

    if(userSignal !== undefined) {

      signals.push(userSignal);
    }

    // No abort source - the await waits forever for an out-of-band settle. We still need a PendingEntry so resolve/reject can find us.
    if(signals.length === 0) {

      this.entries.set(serialKey, { reject, resolve });

      return promise;
    }

    // We always run the inputs through `AbortSignal.any` even when there is only one. The composite is a fresh signal we own, so any internal listener cleanup never
    // touches the long-lived signal the caller supplied; it also keeps the abort path uniform across single- and multi-source cases.
    const composedSignal = AbortSignal.any(signals);

    const onAbort = (): void => {

      // Map presence is the source of truth. If we are no longer in the map, another path (resolve, reject, rejectAll) already settled the promise.
      if(this.entries.get(serialKey) !== entry) {

        return;
      }

      this.entries.delete(serialKey);

      if(userSignal?.aborted) {

        reject(userSignal.reason);

        return;
      }

      reject(new DOMException("Correlator await for key " + JSON.stringify(serialKey) + " timed out after " + String(timeoutMs) + " ms.", "AbortError"));
    };

    composedSignal.addEventListener("abort", onAbort, { once: true });

    // The entry's resolve/reject wrappers detach the abort listener so the composed signal becomes GC-eligible the moment the entry settles via any path.
    const entry: PendingEntry<T> = {

      reject: (reason: unknown): void => {

        composedSignal.removeEventListener("abort", onAbort);
        reject(reason);
      },
      resolve: (value: T): void => {

        composedSignal.removeEventListener("abort", onAbort);
        resolve(value);
      }
    };

    this.entries.set(serialKey, entry);

    return promise;
  }

  /**
   * Resolve the pending await for `key`, if any.
   *
   * @param key - The correlation key.
   * @param value - The value to resolve the await's promise with.
   *
   * @returns `true` if a pending await was settled, `false` if no await was pending for that key. The boolean lets dispatchers branch on stray responses.
   */
  public resolve(key: K, value: T): boolean {

    const serialKey = this.serialise(key);
    const entry = this.entries.get(serialKey);

    if(!entry) {

      return false;
    }

    this.entries.delete(serialKey);
    entry.resolve(value);

    return true;
  }

  /**
   * Reject the pending await for `key`, if any.
   *
   * @param key - The correlation key.
   * @param reason - The rejection reason. Propagated verbatim to the awaiter.
   *
   * @returns `true` if a pending await was rejected, `false` if no await was pending for that key.
   */
  public reject(key: K, reason: unknown): boolean {

    const serialKey = this.serialise(key);
    const entry = this.entries.get(serialKey);

    if(!entry) {

      return false;
    }

    this.entries.delete(serialKey);
    entry.reject(reason);

    return true;
  }

  /**
   * Reject every pending await. Hosts call this at lifecycle boundaries (transport teardown, connection reset) so an in-flight correlator cannot leak across
   * connection epochs.
   *
   * @param reason - The rejection reason. Propagated verbatim to every awaiter.
   */
  public rejectAll(reason: unknown): void {

    if(this.entries.size === 0) {

      return;
    }

    // Snapshot entries before iteration: each `entry.reject` runs synchronously and would not normally mutate the map (we delete first), but a snapshot is the safer
    // pattern for any future evolution where the rejector closure touches the map.
    const snapshot = Array.from(this.entries.values());

    this.entries.clear();

    for(const entry of snapshot) {

      entry.reject(reason);
    }
  }

  /**
   * Peek at whether a key has a pending await without changing state. Used by hosts that want to throw a host-specific in-flight error before invoking
   * {@link Correlator.await}.
   *
   * @param key - The correlation key.
   *
   * @returns `true` when an await is pending for the serialised form of `key`, `false` otherwise.
   */
  public pending(key: K): boolean {

    return this.entries.has(this.serialise(key));
  }

  /**
   * Custom inspector for `console.log(correlator)` output. Shows the pending count plus up to eight serialised keys.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    const keys = Array.from(this.entries.keys());

    // The threshold of eight keys below is an arbitrary console-readability cap for `util.inspect` output, not a protocol or correctness constraint.
    const truncated = (keys.length > 8) ? keys.slice(0, 8).concat(["... +" + String(keys.length - 8) + " more"]) : keys;

    return options.stylize("Correlator", "special") + " " + JSON.stringify({ keys: truncated, pending: this.entries.size });
  }
}

/**
 * Constructor options for {@link Correlator}.
 *
 * @typeParam K - The correlator's key type. Drives the {@link CorrelatorOptions.keyToString} parameter shape.
 */
export interface CorrelatorOptions<K> {

  /**
   * Key serialiser. Defaults to `String(key)`. Supply this for composite keys (tuples, branded types) so structurally-equal keys hash to the same Map slot.
   *
   * @remarks The internal store is a `Map<string, ...>`. Two keys are "the same" when their serialised forms compare equal. For primitive keys (`string`, `number`,
   * `bigint`, `boolean`) the default `String(key)` is correct. For tuples, `String([a, b])` invokes `Array.prototype.toString` which joins with `,` - usable when the
   * tuple elements do not themselves contain commas, otherwise supply a custom serialiser (e.g., `([a, b]) => a + ":" + b`).
   *
   * @param key - The key to serialise.
   *
   * @returns The string form used as the Map slot.
   */
  keyToString?: (key: K) => string;
}

/**
 * Per-await options for {@link Correlator.await}.
 */
export interface CorrelatorAwaitOptions {

  /**
   * Optional user abort signal. When aborted, the await rejects with `signal.reason`.
   */
  signal?: AbortSignal;

  /**
   * Optional timeout in milliseconds. When elapsed, the await rejects with a `DOMException` of `name === "AbortError"`.
   */
  timeoutMs?: number;
}

/**
 * Internal pending-entry shape. Wraps the `Promise.withResolvers` settlers so resolve/reject paths can detach the abort listener before settling.
 *
 * @internal
 */
interface PendingEntry<T> {

  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
}
