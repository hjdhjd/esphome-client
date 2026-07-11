/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * reissuable-subscription.ts: Keyed multiset subscription primitive whose per-wire-key desired state survives reconnect.
 */

/**
 * Single source of truth for the reset/reissue subscription-continuity mechanic the streaming sub-APIs need.
 *
 * @remarks A {@link ReissuableSubscription} generalizes {@link LogSubscriptionManager}'s two-lifetime split into a single primitive that every streaming sub-API
 * shares instead of each hand-rolling its own. A naive design using one shared refcount integer, incremented outside the async generator and zeroed by `reset()`,
 * would leave a consumer iterator parked in `for await` across a reconnect permanently deaf, because the `releaseSubscription` "count still > 0" guard would swallow
 * the survivor's post-reconnect unsubscribe. This primitive avoids that whole class of bug by keeping the two state lifetimes in physically separate stores: a
 * reconnect-surviving subscriber ledger and a connection-scoped wire cache.
 *
 * Two state lifetimes, two backing maps:
 *
 * - **Consumer-scoped** subscriber intent (the `subscribers` ledger) - keyed by a per-`acquire` unique `Symbol`, MUST survive reconnect
 *   because parked iterators are still open. Register (`acquire`) and release (`release`) pair by symbol identity, so a post-reconnect dispose deletes exactly the right
 *   entry and re-derives the wire state correctly even though the ledger was never cleared. This is the main insight: a shared refcount cannot do this, because
 *   it has no way to know which of N indistinguishable increments the survivor owns. The symbol-identity key is what makes delete-by-identity reconnect-stable.
 *
 * - **Connection-scoped** "what we last told the device per wire key" cache (the `cache`) - MUST reset on connect, because ESPHome starts
 *   every fresh connection with no subscription. {@link ReissuableSubscription.clearConnectionState} clears ONLY this cache and nothing else; the subscriber ledger is
 *   intentionally preserved (this is the whole point of the primitive).
 *
 * The wire key `K` is the device-subscription granularity. Global-scope consumers (Z-Wave, Bluetooth advertisement / connections-free, Log) pass a single constant key;
 * per-instance consumers (Serial) pass a number; per-(address, handle) consumers (Bluetooth notify) pass a string. The per-subscriber intent `V` is the desired value
 * each consumer contributes (a `LogLevel`; or a unit value for presence-only subscriptions). The reduced desired wire-state `D` is what a key's live intents collapse to.
 * When a key has no live subscribers, {@link ReissuableSubscriptionOptions.reduce} returns the {@link EMPTY} sentinel, and the consumer decides whether that maps to a
 * wire unsubscribe (Serial, Z-Wave, Bluetooth advertisement) or to a no-op (Log, Bluetooth connections-free - neither has an unsubscribe frame).
 *
 * @example
 * ```ts
 * // Log shape: a single global wire key, per-iterator LogLevel intents, reduced by Math.max. No wire unsubscribe (ESPHome has no unsubscribe frame for logs), so the
 * // onChange hook simply ignores the EMPTY sentinel.
 * const GLOBAL = 0;
 * const logs = new ReissuableSubscription<number, LogLevel, LogLevel>({
 *
 *   onChange: (_key, desired) => {
 *
 *     if(desired === EMPTY) {
 *
 *       return;
 *     }
 *
 *     sendSubscribeLogs(desired);
 *   },
 *   reduce: (intents) => intents.length === 0 ? EMPTY : Math.max(...intents) as LogLevel
 * });
 *
 * const handle = logs.acquire(GLOBAL, LogLevel.DEBUG);
 * // ... later, on the iterator's finally block ...
 * logs.release(handle);
 * ```
 *
 * @module reissuable-subscription
 */
import type { Nullable } from "./types.ts";

/**
 * Module-level sentinel meaning "this wire key has no live subscribers and therefore no desired wire-state." {@link ReissuableSubscriptionOptions.reduce} returns this
 * when the intent list it is handed is empty; the recompute chokepoint then removes the key from the cache and fires `onChange(key, EMPTY)` so the consumer can decide
 * whether to emit a wire unsubscribe or treat the empty transition as a no-op.
 */
export const EMPTY: unique symbol = Symbol("reissuable-subscription-empty");

/**
 * The uniform reset/reissue subscription-continuity contract every streaming sub-API implements: {@link LogSubscriptionManager},
 * {@link VoiceAssistantApi}, {@link SerialProxyApi}, {@link BluetoothProxyApi}, and
 * {@link ZWaveProxyApi}.
 *
 * @remarks The host drives both methods around the transport lifecycle. It calls {@link clearConnectionState} on every participant at the disconnect boundary (the
 * primary reset) and again at connect-top (a repeatable safety net for a `connect()` issued over a still-active connection) - resetting each manager's connection-scoped
 * wire/cache state while PRESERVING the consumer subscriber ledgers / desired intent that must outlive a reconnect. At connect-bottom, after the fresh transport is
 * up, it calls {@link reissueOnReconnect} on every participant - replaying the surviving subscriptions onto the new transport so parked consumer iterators keep
 * receiving without re-subscribing by hand.
 *
 * Two structurally-distinct implementations satisfy this one contract. The multiset-backed sub-APIs (Serial, Bluetooth, Z-Wave, and Log) own a
 * {@link ReissuableSubscription} - itself a participant whose `clearConnectionState` / `reissueOnReconnect` ARE this contract - and delegate to it. The voice-assistant
 * sub-API has no per-iterator multiset (its request / audio streams are decoupled bus pass-throughs), so it satisfies the contract DIRECTLY with a single preserved
 * desired-intent rather than a keyed ledger. Both shapes present the same two methods to the host, which is the entire point of naming the contract: the host loops over
 * a homogeneous list of `SubscriptionLifecycle` participants and need not know which shape each one is.
 */
export interface SubscriptionLifecycle {

  /**
   * Reset ONLY the connection-scoped wire/cache state, called by the host when a connection ends (at the disconnect boundary) and again at connect-top as a
   * repeatable safety net. The consumer subscriber ledger / desired intent is PRESERVED - clearing it here is the precise reconnect-drops-the-subscription bug the
   * contract exists to prevent. ESPHome starts every fresh connection with no subscription, so the wire-side cache must be invalidated; what survives is the record of
   * who wants what, so {@link reissueOnReconnect} can replay it.
   */
  clearConnectionState(): void;

  /**
   * Replay the surviving subscriptions onto the fresh transport, called from the host's `connect()` at connect-bottom after the new transport is up. Re-arms the device
   * for every consumer still subscribed at the moment of reconnect; a pure no-op when nothing is desired.
   */
  reissueOnReconnect(): void;
}

/**
 * A keyed multiset of consumer subscribers whose per-wire-key reduced desired-state survives reconnect.
 *
 * @typeParam K - The wire key: the device-subscription granularity used to group subscribers and key the connection-scoped cache. Must be usable as a `Map` key (its
 * `===` / SameValueZero identity is how subscribers are grouped). Global-scope consumers pass a single constant; per-instance consumers pass a number; per-(address,
 * handle) consumers pass a string.
 * @typeParam V - The per-subscriber intent value (e.g. a `LogLevel`; or a unit value for presence-only subscriptions).
 * @typeParam D - The reduced desired wire-state for a key (e.g. the aggregate `LogLevel`; or a unit / boolean presence marker).
 */
export class ReissuableSubscription<K, V, D> {

  /**
   * The connection-scoped "what we last told the device per wire key" cache. Keyed by the wire key `K`. This is the ONLY thing {@link clearConnectionState} clears - the
   * device starts every fresh connection with no subscription, so this cache must be invalidated on connect, while the `subscribers` ledger is preserved. Entry
   * presence is the source of truth for "we have an outstanding wire subscription for this key"; the recompute chokepoint diffs the freshly-reduced desired-state against
   * this cache to suppress redundant emits.
   */
  private readonly cache = new Map<K, D>();

  /**
   * Desired-state equality predicate used to suppress redundant emits during recompute. Defaults to `Object.is`. Consumers whose `D` is a structural value (rather than a
   * primitive) supply their own so two structurally-equal desired states do not produce a spurious wire send.
   */
  private readonly equals: (a: D, b: D) => boolean;

  /**
   * Wire hook fired when a key's reduced desired-state CHANGES during {@link acquire} / {@link release} (diffed against the `cache`). Receives {@link EMPTY} when
   * the last subscriber for a key leaves UNLESS {@link retainOnEmpty} is set, in which case the empty transition is wire-silent and `EMPTY` never arrives. Optional: a
   * reissue-only ledger (Bluetooth notify, whose wire enable is driven externally) omits it entirely, so acquire / release have no wire effect. The consumer decides
   * whether `EMPTY` emits a wire unsubscribe or is a no-op.
   */
  private readonly onChange: Nullable<(key: K, desired: D | typeof EMPTY) => void>;

  /**
   * Reissue hook fired for EACH key with live subscribers during {@link reissueOnReconnect}, to replay the desired state onto the fresh transport. Receives only
   * non-{@link EMPTY} desired states (keys with no subscribers are skipped, so there is nothing empty to replay). Defaults to invoking {@link onChange} when omitted,
   * which is correct for every consumer whose reissue path is identical to its on-change path; a reissue-only ledger supplies its own to replay state that has no
   * on-change wire effect.
   */
  private readonly onReissue: Nullable<(key: K, desired: D) => void>;

  /**
   * Collapse all live intents for ONE wire key into the desired wire-state, or {@link EMPTY} when the key has no subscribers. The recompute chokepoint hands this every
   * live intent currently registered for the key it is recomputing; the consumer reduces them (Log uses `Math.max` over levels; presence consumers return a constant `D`
   * when non-empty and `EMPTY` when empty).
   */
  private readonly reduce: (intents: readonly V[]) => D | typeof EMPTY;

  /**
   * Whether the connection-scoped cache PERSISTS when a key loses its last subscriber, rather than being cleared. Defaults to `false`. This distinguishes the two wire
   * protocols the primitive serves: protocols WITH an unsubscribe frame (Serial, Z-Wave, Bluetooth advertisement) want the default `false` - emptying a key clears the
   * cache and fires `onChange(key, EMPTY)` so the consumer tears the subscription down on the wire. Protocols with NO unsubscribe frame (Log, Bluetooth connections-free)
   * set this `true` - the device keeps firing until the connection drops, so there is nothing to send and nothing to forget on the empty transition; the cache (and thus
   * {@link peek}) must persist so a re-acquire at the same level after an idle gap stays wire-silent and {@link peek} keeps reporting the level the device is still at.
   */
  private readonly retainOnEmpty: boolean;

  /**
   * The consumer-scoped subscriber ledger, keyed by a per-{@link acquire} unique `Symbol`. Each entry pairs the wire key the subscriber grouped under with the intent it
   * contributed. The symbol identity is required here: register (`acquire`) and release (`release`) pair by identity, so a post-reconnect dispose deletes exactly the
   * right entry. This ledger MUST survive {@link clearConnectionState} - parked consumer iterators are still open across the reconnect cycle and rely on subscription
   * continuity. This is the field whose preservation is the entire reason the primitive exists.
   */
  private readonly subscribers = new Map<symbol, { key: K; intent: V }>();

  /**
   * Construct a reissuable subscription bound to a reducer and optional wire hooks. Both backing maps start empty; subsequent {@link acquire} calls populate the ledger
   * and drive the cache.
   *
   * @param options - The reducer, optional equality predicate, and optional on-change / on-reissue wire hooks. See {@link ReissuableSubscriptionOptions}.
   */
  public constructor(options: ReissuableSubscriptionOptions<K, V, D>) {

    this.equals = options.equals ?? ((a: D, b: D): boolean => Object.is(a, b));
    this.onChange = options.onChange ?? null;
    this.onReissue = options.onReissue ?? null;
    this.reduce = options.reduce;
    this.retainOnEmpty = options.retainOnEmpty ?? false;
  }

  /**
   * Total number of currently-live subscribers across every wire key. Each {@link acquire} that has not yet been {@link release}d is one entry. Primarily a test
   * affordance and a continuity assertion.
   *
   * @remarks This is a LEDGER-view read, like {@link count} and {@link activeKeys}: it reports who is subscribed, derived from the `subscribers` ledger, so it is
   * UNCHANGED by {@link clearConnectionState} (the ledger survives the reconnect cycle). Contrast the CACHE-view read {@link peek}, which reports what we last told the
   * device per wire key and is cleared by {@link clearConnectionState}. The two views diverge precisely across a reconnect: a survivor stays in the ledger (so `size`,
   * `count`, and `activeKeys` are unaffected) while the cache is emptied (so `peek` becomes `undefined` until {@link reissueOnReconnect} re-arms it).
   *
   * @returns The number of live subscribers.
   */
  public get size(): number {

    return this.subscribers.size;
  }

  /**
   * Register a fresh subscriber for `key` contributing `intent`, then recompute the key's desired wire-state. The returned symbol is the consumer's release token - hold
   * it and pass it to {@link release} when the subscriber goes away (typically from an async generator's `finally` block).
   *
   * @remarks The fresh symbol is minted per call so register / release pair by identity. The recompute runs synchronously here so the cache reflects the new aggregate
   * immediately; if the new subscriber changes the key's reduced desired-state, `onChange(key, desired)` fires.
   *
   * @param key - The wire key this subscriber groups under.
   * @param intent - The per-subscriber intent this subscriber contributes to the key's reduction.
   *
   * @returns A unique `Symbol` release token.
   */
  public acquire(key: K, intent: V): symbol {

    const handle = Symbol("reissuable-subscriber");

    this.subscribers.set(handle, { intent, key });
    this.recompute(key);

    return handle;
  }

  /**
   * The distinct wire keys that currently have at least one live subscriber.
   *
   * @remarks A LEDGER-view read, like {@link size} and {@link count}: it reports which keys are subscribed, derived from the `subscribers` ledger, so it is
   * UNCHANGED by {@link clearConnectionState} (the ledger survives the reconnect cycle). Contrast the CACHE-view read {@link peek}, which reflects what we last told the
   * device and is cleared by {@link clearConnectionState}. This is a cold-path scan over the live-subscriber ledger (subscribe / unsubscribe / inspect only, never the
   * inbound-frame or command hot paths), deduplicating keys through a `Set` for the same reason `recompute` scans the ledger directly rather than maintaining a
   * second per-key index. A key drops out of the result as soon as its last subscriber is {@link release}d.
   *
   * @returns The distinct keys with one or more live subscribers, in no particular order.
   */
  public activeKeys(): K[] {

    const keys = new Set<K>();

    for(const entry of this.subscribers.values()) {

      keys.add(entry.key);
    }

    return [...keys];
  }

  /**
   * Reset ONLY the connection-scoped wire cache. Called from the host's `connect()` when the previous connection's state is being torn down. ESPHome starts every fresh
   * connection with no subscription, so the cache must be invalidated - but the `subscribers` ledger is intentionally NOT cleared, exactly as
   * {@link LogSubscriptionManager.clearConnectionState} preserves its per-iterator subscriber map. Consumer iterators are still open across
   * the reconnect cycle and rely on subscription continuity; clearing the ledger here is the precise bug this primitive exists to prevent.
   */
  public clearConnectionState(): void {

    this.cache.clear();
  }

  /**
   * The number of live subscribers currently registered for `key`.
   *
   * @remarks A LEDGER-view read, like {@link size} and {@link activeKeys}: it reports how many consumers are subscribed to `key`, derived from the `subscribers`
   * ledger, so it is UNCHANGED by {@link clearConnectionState} (the ledger survives the reconnect cycle). Contrast the CACHE-view read {@link peek}, which reports what
   * we last told the device for `key` and is cleared by {@link clearConnectionState}. This is a cold-path O(live-subscribers) scan over the ledger (subscribe /
   * unsubscribe / inspect only, never the inbound-frame or command hot paths), filtered with `Object.is` for identity consistency with `recompute`. The count
   * decrements as subscribers {@link release} and reaches zero when the last subscriber for `key` leaves.
   *
   * @param key - The wire key to count live subscribers for.
   *
   * @returns The number of live subscribers grouped under `key`. Zero when the key has no live subscribers.
   */
  public count(key: K): number {

    let total = 0;

    for(const entry of this.subscribers.values()) {

      if(Object.is(entry.key, key)) {

        total++;
      }
    }

    return total;
  }

  /**
   * Read the current cached desired wire-state for `key`, or `undefined` when the key has no outstanding wire subscription (never set, or cleared by
   * {@link clearConnectionState}).
   *
   * @remarks A CACHE-view read: it reflects the `cache` (what we last told the device per wire key), NOT the `subscribers` ledger. It is therefore cleared by
   * {@link clearConnectionState} and re-armed by {@link reissueOnReconnect}, in deliberate contrast to the LEDGER-view reads {@link size}, {@link count}, and
   * {@link activeKeys}, which report who is subscribed and survive the reconnect cycle. A minimal read affordance for consumers and tests.
   *
   * @param key - The wire key to peek.
   *
   * @returns The cached desired wire-state, or `undefined` when none is outstanding.
   */
  public peek(key: K): D | undefined {

    return this.cache.get(key);
  }

  /**
   * Re-establish every live key's subscription on a fresh connection. Called from the host's `connect()` after the new transport is up. Clears the connection-scoped
   * cache (via {@link clearConnectionState}) and then, for every distinct wire key that still has live subscribers, recomputes the reduction and - if it is not
   * {@link EMPTY} - sets the cache and invokes the reissue hook (or `onChange`) with the desired state.
   *
   * @remarks Because the cache was just cleared, every live key re-emits its desired state (there is nothing cached to diff against, so the replay is unconditional for
   * live keys). Keys with no live subscribers are skipped - there is nothing to replay - so a key whose subscribers all left does not resurrect. With zero subscribers
   * this method is a pure no-op: the cache is cleared and nothing is replayed. The reissue hook is what re-arms the device so a parked consumer iterator keeps receiving.
   */
  public reissueOnReconnect(): void {

    this.clearConnectionState();

    // Gather each distinct wire key that still has at least one live subscriber, along with that key's live intents. We accumulate the intent lists in a single pass over
    // the ledger so we reduce each key exactly once below, rather than rescanning the ledger per key.
    const intentsByKey = new Map<K, V[]>();

    for(const { intent, key } of this.subscribers.values()) {

      const intents = intentsByKey.get(key);

      if(intents === undefined) {

        intentsByKey.set(key, [intent]);

        continue;
      }

      intents.push(intent);
    }

    for(const [ key, intents ] of intentsByKey) {

      const desired = this.reduce(intents);

      // A live key whose reduction is EMPTY has nothing to replay; this is defensive - a correct reducer returns non-EMPTY whenever it is handed a non-empty intent list,
      // but we honor the sentinel rather than assume the reducer never contradicts the ledger.
      if(desired === EMPTY) {

        continue;
      }

      this.cache.set(key, desired);

      // Prefer the dedicated reissue hook; fall back to onChange when the consumer did not supply one (the common case, where reissue and on-change wire effects are
      // identical). A reissue-only ledger supplies onReissue without onChange so acquire / release stay wire-silent while reconnect still replays.
      if(this.onReissue !== null) {

        this.onReissue(key, desired);

        continue;
      }

      this.onChange?.(key, desired);
    }
  }

  /**
   * Release a previously-acquired subscriber by its handle, then recompute its key's desired wire-state. A double-release (or a release of an unknown handle)
   * is a safe no-op, because handle presence in the ledger is the source of truth for whether the subscriber is still live.
   *
   * @remarks When this is the last subscriber for its key, the recompute reduces to {@link EMPTY}, the cache entry is removed, and `onChange(key, EMPTY)` fires so the
   * consumer can emit a wire unsubscribe (or treat the empty transition as a no-op). Because the ledger survives {@link clearConnectionState}, a survivor's
   * post-reconnect release still drives the correct on-change - the hazard where a shared-refcount guard swallowed the survivor's unsubscribe cannot occur here.
   *
   * @param handle - The release token returned by {@link acquire}.
   */
  public release(handle: symbol): void {

    const entry = this.subscribers.get(handle);

    // A double-release is a safe no-op: the handle is already gone, so there is nothing to release and no recompute to run.
    if(entry === undefined) {

      return;
    }

    this.subscribers.delete(handle);
    this.recompute(entry.key);
  }

  /**
   * The recompute chokepoint shared by {@link acquire} and {@link release}: gather the live intents for `key`, reduce them, and reconcile the result against the
   * connection-scoped cache, firing `onChange` only on an actual change.
   *
   * @remarks This is a COLD-PATH operation - it runs only on subscribe / unsubscribe / reconnect, never on the inbound-frame or command hot paths. An
   * O(live-subscribers) scan of the ledger per acquire / release is therefore acceptable, and it keeps the internal state a single ledger `Map` rather than a second
   * per-key intent index that would have to be kept consistent. A future reader should not "optimize" this scan into a second index without a measured hot-path reason:
   * there is none here.
   *
   * The reconciliation has two arms. When the reduction is {@link EMPTY} (no live subscribers for the key), behavior depends on {@link retainOnEmpty}. With the default
   * `retainOnEmpty: false` (the protocol HAS an unsubscribe frame), we remove any cache entry and fire `onChange(key, EMPTY)` only if the key was actually cached - so
   * the empty transition emits exactly once, on the release that drops the last subscriber, and the consumer tears the subscription down on the wire. With
   * `retainOnEmpty: true` (the protocol has NO unsubscribe frame, so the device keeps firing until the connection drops), the empty transition does NOTHING: the cache
   * persists and `onChange` is not fired, because there is nothing to send and nothing to forget - and the persisted cache is exactly what makes a re-acquire at the
   * same level after an idle gap stay wire-silent while {@link peek} keeps reporting the level the device is still at. Otherwise the reduction is a concrete
   * desired-state, and we fire `onChange(key, desired)` only when it differs from the cached value (via {@link equals}) or when the key was absent from cache.
   *
   * @param key - The wire key to recompute.
   */
  private recompute(key: K): void {

    // Gather every live intent currently registered for this key. We scan the whole ledger because the subscriber map is keyed by symbol identity (not by wire key); the
    // wire key lives in each entry's value. See the cold-path rationale above for why this scan is intentional rather than an index to be optimized away.
    const intents: V[] = [];

    for(const entry of this.subscribers.values()) {

      if(Object.is(entry.key, key)) {

        intents.push(entry.intent);
      }
    }

    const desired = this.reduce(intents);

    // No live subscribers for this key.
    if(desired === EMPTY) {

      // The protocol has no unsubscribe frame, so the device keeps firing until the connection drops. We retain the cache and fire nothing: there is nothing to send and
      // nothing to forget. The persisted cache keeps a same-level re-acquire after an idle gap wire-silent and keeps `peek` reporting the level the device is still at.
      if(this.retainOnEmpty) {

        return;
      }

      // The protocol has an unsubscribe frame. Remove any outstanding wire subscription and notify the consumer once - but only if we actually had a cache entry, so the
      // empty transition fires exactly on the release that drops the last subscriber, not on every subsequent release of an already-empty key.
      if(this.cache.has(key)) {

        this.cache.delete(key);
        this.onChange?.(key, EMPTY);
      }

      return;
    }

    const cached = this.cache.get(key);

    // The key already had this exact desired-state cached, so the wire is already correct; suppress the redundant emit.
    if((cached !== undefined) && this.equals(cached, desired)) {

      return;
    }

    this.cache.set(key, desired);
    this.onChange?.(key, desired);
  }
}

/**
 * Constructor options for {@link ReissuableSubscription}.
 *
 * @typeParam K - The wire key type.
 * @typeParam V - The per-subscriber intent type.
 * @typeParam D - The reduced desired wire-state type.
 */
export interface ReissuableSubscriptionOptions<K, V, D> {

  /**
   * Desired-state equality predicate used to suppress redundant emits during recompute. Defaults to `Object.is`. Supply this when `D` is a structural value so two
   * structurally-equal desired states do not produce a spurious wire send.
   *
   * @param a - The cached desired-state.
   * @param b - The freshly-reduced desired-state.
   *
   * @returns `true` when the two desired states are equal (and the emit should be suppressed), `false` otherwise.
   */
  equals?: (a: D, b: D) => boolean;

  /**
   * Wire hook fired when a key's reduced desired-state CHANGES during `acquire` / `release` (diffed against the connection-scoped cache). Receives {@link EMPTY} when the
   * last subscriber for a key leaves. Omit it for a reissue-only ledger whose wire effect is driven externally (e.g. Bluetooth notify, whose enable frame is sent by the
   * caller). The consumer decides whether `EMPTY` emits a wire unsubscribe (Serial, Z-Wave, Bluetooth advertisement) or is a no-op (Log, Bluetooth connections-free).
   *
   * @param key - The wire key whose desired-state changed.
   * @param desired - The new reduced desired-state, or {@link EMPTY} when the key lost its last subscriber.
   */
  onChange?: (key: K, desired: D | typeof EMPTY) => void;

  /**
   * Reissue hook fired for EACH key with live subscribers during `reissueOnReconnect`, to replay the desired state onto the fresh transport. Receives only
   * non-{@link EMPTY} desired states. Defaults to invoking {@link onChange} when omitted, which is correct whenever the reissue path is identical to the on-change path;
   * supply your own for a reissue-only ledger that replays state which has no on-change wire effect.
   *
   * @param key - The wire key with live subscribers.
   * @param desired - The reduced desired-state to replay onto the fresh transport.
   */
  onReissue?: (key: K, desired: D) => void;

  /**
   * Collapse all live intents for ONE wire key into the desired wire-state, or {@link EMPTY} when the key has no subscribers. The recompute chokepoint hands this every
   * live intent registered for the key being recomputed. Log uses `Math.max` over levels; presence consumers return a constant `D` when the list is non-empty and
   * {@link EMPTY} when it is empty.
   *
   * @param intents - The live intents for the key being reduced. Empty when the key has no live subscribers.
   *
   * @returns The reduced desired wire-state, or {@link EMPTY} when there are no live subscribers.
   */
  reduce: (intents: readonly V[]) => D | typeof EMPTY;

  /**
   * Whether the connection-scoped cache PERSISTS when a key loses its last subscriber, rather than being cleared and signalled. Defaults to `false`. Set this per the
   * wire protocol's unsubscribe semantics:
   *
   * - `false` (default) - the protocol HAS an unsubscribe frame (Serial, Z-Wave, Bluetooth advertisement). Emptying a key clears its cache entry and fires
   *   `onChange(key, EMPTY)` so the consumer tears the subscription down on the wire.
   * - `true` - the protocol has NO unsubscribe frame (Log, Bluetooth connections-free). The device keeps firing until the connection drops, so the empty transition is
   *   wire-silent: the cache (and therefore {@link ReissuableSubscription.peek}) persists, `onChange` is not fired, and a re-acquire at the
   *   same level after an idle gap stays silent instead of re-issuing a redundant subscribe.
   *   {@link ReissuableSubscription.clearConnectionState} still clears the persisted cache on connect, because a fresh connection genuinely
   *   starts with no subscription.
   */
  retainOnEmpty?: boolean;
}
