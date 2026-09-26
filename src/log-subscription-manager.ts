/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * log-subscription-manager.ts: Refcounted log-stream coordinator and wire-protocol mediator.
 */

/**
 * Authoritative coordinator for `SUBSCRIBE_LOGS_REQUEST` wire-protocol traffic and the refcounted async-iterable consumer surface.
 *
 * @remarks There is exactly ONE physical resource here: the device-side log level (a single `SUBSCRIBE_LOGS_REQUEST` level field). Its correct value is the `max` over
 * every level-desire, and sources feed that one reduction - the ordinary `client.logs(level)` async-iterators (acquire / release subscribers) and the imperative
 * `subscribeToLogs(level)` host method (delegated to {@link LogSubscriptionManager.requestDeviceLevel}). The imperative path is NOT a second writer to a shared cache; it
 * is a single managed "pin" subscriber the manager holds in the SAME {@link ReissuableSubscription} ledger as the iterators, so it participates
 * in the `max` and survives reconnect exactly like an iterator does. This single-authority model upholds these guarantees: the imperative level is a floor that
 * participates in the `max` and is never silently overridden or downgraded by iterators (never a transient downgrade), and it survives reconnect (a callback-style
 * `client.on("log", cb)` plus `subscribeToLogs(level)` consumer keeps receiving messages across reconnect).
 *
 * The aggregate algorithm is the architectural keystone, implemented in the primitive's reduce hook. Each open iterator (and the pin) contributes its requested
 * level to the active set; the device-side level is the maximum verbosity across the set (higher number == more verbose in ESPHome's enumeration). Opening a new
 * subscriber at or below the existing maximum is a no-wire-send because the device is already firing every relevant message. Opening a new subscriber above the existing
 * maximum upgrades the device-side level via a follow-up `SUBSCRIBE_LOGS_REQUEST(newLevel)`; closing the highest subscriber downgrades back to the next-highest level the
 * same way. ESPHome has NO unsubscribe message in the protocol, so dropping the last subscriber reduces to {@link EMPTY}, which the on-change
 * hook deliberately treats as a no-op - the device keeps firing at the last level until the connection drops.
 *
 * `dumpConfig` is an INDEPENDENT one-shot side-channel: a config-dump request carried by a `SUBSCRIBE_LOGS_REQUEST` frame. It is not subscription state, does not
 * influence the reduction, and does not survive reconnect - it is a deliberate, distinct send fired at the authoritative level so a dump never downgrades the device
 * below what the iterators (or the pin) need.
 *
 * The we-do-not-double-send guarantee holds at these boundaries for the iterator path: opening a duplicate-level iterator is silent on the wire, closing a non-max
 * iterator is silent on the wire, and a recompute whose aggregate matches the cached wire-state is suppressed. These guarantees live inside the primitive's recompute
 * chokepoint; each still has a dedicated negative test in `log-subscription-manager.test.ts`.
 *
 * Backpressure lives in the {@link EventBus} - this module does not duplicate the queue / `dropOldest` / `dropNewest` / `throw` policy.
 * {@link LogSubscriptionManager.subscribe} returns the `bus.stream("log", ...)` iterator itself, handing the bus a per-view level filter and the view's release; the
 * EventBus handles the high-water mark, the consumer signal's effect on the stream, and running the release once on every terminal path. The manager's
 * responsibility is purely subscription + wire coordination.
 *
 * @module log-subscription-manager
 */
import type { ClientEventsMap, LogEventData } from "./esphome-client.ts";
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import type { Buffer } from "node:buffer";
import type { LogLevel } from "./api-constants.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { ProtoField } from "./protocol/codec.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";
import { WireType } from "./protocol/wire-types.ts";
import { encodeProtoFields } from "./protocol/codec.ts";
import { logLevelName } from "./api-constants.ts";

/**
 * The single constant wire key every log subscriber - both the `client.logs(level)` iterators and the imperative pin - groups under. The device-side log level is a
 * device-wide subscription (one `SUBSCRIBE_LOGS_REQUEST` level field), so every subscriber shares this one key and they aggregate into a single
 * {@link ReissuableSubscription} reduction. The actual value is irrelevant; what matters is that all subscribers share it.
 */
const LOG_CHANNEL = 0;

/**
 * Narrow seam the manager consumes from the host. Mirrors {@link CameraHost} / {@link VoiceAssistantHost} - the bus and logger flow in, plus
 * a synchronous frame-send hook. The manager never reads or writes host private state directly.
 */
export interface LogSubscriptionManagerHost {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;
  send(type: number, payload: Buffer): void;
}

/**
 * Refcounted log-subscription coordinator. Owns the reissuable subscription ledger (iterators plus the imperative pin), the single managed pin handle, and the encoding
 * of `SUBSCRIBE_LOGS_REQUEST` frames.
 */
export class LogSubscriptionManager implements SubscriptionLifecycle {

  /**
   * Narrow host seam (bus, logger, frame-send hook). Set in the constructor and never reassigned.
   */
  private readonly host: LogSubscriptionManagerHost;

  /**
   * The single managed handle of the imperative pin subscriber, or `null` when no imperative level has been requested on this manager. The pin is at most one entry in
   * the {@link logSubscription} ledger - {@link requestDeviceLevel} acquires a fresh pin and then releases the prior one (acquire-then-release) so the imperative level
   * is always a single floor that participates in the `max`. Unlike the connection-scoped wire cache, the pin handle is part of the surviving subscriber ledger: it
   * persists across a reconnect so {@link reissueOnReconnect} re-arms the imperative level alongside the iterators.
   */
  private logPin: Nullable<symbol> = null;

  /**
   * The single authority for the device-side log level. Both consumer paths feed it: every `client.logs(level)` iterator acquires a subscriber under the one
   * {@link LOG_CHANNEL} key, and the imperative pin ({@link logPin}) is one more subscriber under the same key. The reduction is `Math.max` over all live level intents;
   * an empty subscriber set reduces to {@link EMPTY}, which the on-change hook treats as a no-op because ESPHome has no unsubscribe-logs frame.
   *
   * Built on {@link ReissuableSubscription} so the consumer subscriber ledger (iterators AND the pin) survives reconnect while the
   * connection-scoped wire cache resets. A consumer iterator parked in `for await` across a reconnect stays live, and the imperative pin re-arms too:
   * {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect} replays the aggregate over every surviving subscriber.
   */
  private readonly logSubscription: ReissuableSubscription<number, LogLevel, LogLevel>;

  /**
   * Construct a manager bound to a host seam. The subscription ledger starts empty and the pin starts unset; subsequent {@link subscribe} or {@link requestDeviceLevel}
   * calls populate them.
   *
   * @param host - The host seam (bus, logger, frame-send hook).
   */
  public constructor(host: LogSubscriptionManagerHost) {

    this.host = host;

    // The single device-wide log level is reduced as Math.max over every live level intent (iterators plus the imperative pin), all grouped under the one LOG_CHANNEL
    // key. A non-empty subscriber set reduces to the aggregate level (which onChange sends as a SUBSCRIBE_LOGS_REQUEST). ESPHome has NO unsubscribe-logs frame, so we set
    // retainOnEmpty: true - dropping the last subscriber is wire-silent and the cached level PERSISTS (the device keeps firing until the connection drops). That makes
    // activeLevel keep reporting the last level after the final iterator disposes (matching the reference) and keeps a same-level re-subscribe after an idle gap silent,
    // rather than re-issuing a redundant SUBSCRIBE_LOGS_REQUEST. The primitive preserves the subscriber ledger across reconnect so parked iterators and the pin survive,
    // while the connection-scoped wire cache resets via clearConnectionState. onReissue is omitted so reissue replays the aggregate through the same onChange send path.
    this.logSubscription = new ReissuableSubscription<number, LogLevel, LogLevel>({

      onChange: (_key: number, desired: LogLevel | typeof EMPTY): void => {

        // With retainOnEmpty: true the EMPTY transition never reaches onChange, so this guard is purely type-safety - EMPTY simply never arrives. A concrete aggregate
        // level (a first attach, an upgrade, a downgrade to the next-highest, or a reconnect replay) is sent as a SUBSCRIBE_LOGS_REQUEST at that level.
        if(desired !== EMPTY) {

          this.sendSubscribeLogsFrame(desired);
        }
      },
      reduce: (levels: readonly LogLevel[]): LogLevel | typeof EMPTY => (levels.length === 0) ? EMPTY : (Math.max(...levels) as LogLevel),
      retainOnEmpty: true
    });
  }

  /**
   * Read the authoritative device-side log level: the `max` over every live level-desire, including the imperative pin. Returns `null` before the first wire send and
   * after {@link clearConnectionState} - the device is at whatever default state the protocol leaves it in; ESPHome's default is "no log subscription," so `null`
   * semantically means "no logs flowing." Otherwise returns the aggregate level the manager last told the device, which PERSISTS after the final iterator disposes
   * because ESPHome has no unsubscribe-logs frame and the device keeps firing at that level until the connection drops (the subscription uses `retainOnEmpty: true`).
   *
   * @remarks This is a CACHE-view read: it reflects what we last told the device (the {@link ReissuableSubscription} wire cache), so it is
   * cleared by {@link clearConnectionState} and re-armed by {@link reissueOnReconnect}.
   *
   * @returns The cached device-side aggregate level, or `null` when no wire send has happened (or it has been invalidated by a reconnect).
   */
  public get activeLevel(): Nullable<LogLevel> {

    return this.logSubscription.peek(LOG_CHANNEL) ?? null;
  }

  /**
   * Read the count of currently open iterator subscribers, EXCLUDING the internal imperative pin. Each `client.logs(level)` view is one entry from the moment
   * {@link subscribe} returns it until it releases (its signal aborts, its `return()` or `throw()` runs, or its stream ends), whether or not it has been iterated; the
   * imperative pin held by {@link requestDeviceLevel} is an internal subscriber that participates in the device-level `max` but is not a consumer iterator, so it is
   * subtracted out here.
   *
   * @returns The number of open iterator subscribers.
   */
  public get subscriberCount(): number {

    return this.logSubscription.size - ((this.logPin !== null) ? 1 : 0);
  }

  /**
   * Reset ONLY the connection-scoped wire cache. Called from the host's `connect()` when the previous connection's state is being torn down. The device starts every
   * fresh connection with no subscription, so the cached device-side level must be invalidated; the subscriber ledger - the iterators AND the imperative pin - is
   * intentionally PRESERVED, because consumer iterators are still open across the reconnect cycle and the imperative level is a first-class surviving desire. Delegates
   * to the subscription's {@link ReissuableSubscription.clearConnectionState}.
   */
  public clearConnectionState(): void {

    this.logSubscription.clearConnectionState();
  }

  /**
   * Forward a decoded inbound log event to consumers. Called from the run-phase `SUBSCRIBE_LOGS_RESPONSE` dispatcher with the already-decoded {@link LogEventData}; the
   * manager fans the event out via the {@link EventBus} (which drives every active `client.on("log", cb)` listener and every open `client.logs(...)` iterator) and emits
   * a per-message diagnostic line at debug level. Decoding stays on the host because it is a protocol/codec concern, not a subscription concern.
   *
   * @param event - The decoded log event ready to fan out.
   */
  public dispatch(event: LogEventData): void {

    this.host.bus.emit("log", event);
    this.host.log.debug("ESPHome Log [" + logLevelName(event.level) + "]: " + event.message);
  }

  /**
   * Re-establish the subscription on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the subscription's
   * {@link ReissuableSubscription.reissueOnReconnect}, which clears the connection-scoped cache and then replays the aggregate `max` over every
   * surviving subscriber - the open iterators AND the imperative pin - as a fresh `SUBSCRIBE_LOGS_REQUEST`, so the new device starts firing log messages at the right
   * verbosity.
   *
   * @remarks The subscription-continuity contract guarantees that iterators open at the moment of disconnect remain open across the reconnect; their ledger entries
   * survived, as did the imperative pin's. Re-arming the pin here is what keeps the imperative level alive across reconnect: because the pin is a real subscriber in the
   * ledger, the reissue replays it alongside the iterators, so a callback-plus-`subscribeToLogs` consumer keeps receiving messages across reconnect. With zero surviving
   * subscribers this method is a no-op (the cache is cleared and nothing is replayed). The one-shot `dumpConfig` side-channel is NOT subscription state and is
   * deliberately not replayed here.
   */
  public reissueOnReconnect(): void {

    this.logSubscription.reissueOnReconnect();
  }

  /**
   * Set the imperative device-level desire and, optionally, fire a one-shot configuration dump. Public so the host's `subscribeToLogs(level, dumpConfig)` method (a
   * stable public signature) can delegate to it.
   *
   * @remarks The imperative level is a single managed "pin" subscriber the manager holds in the same ledger as the `client.logs(level)` iterators - NOT a second writer
   * to a shared cache. It participates in the device-level `max`: it raises the device level when `level` exceeds the current aggregate, and is wire-silent when
   * `level` is at or below the current aggregate (the pin is a floor, never a transient downgrade). The pin is at most one entry; this method acquires a fresh pin and
   * then releases the prior one (acquire-then-release) so the imperative desire is always exactly one floor. The order matters because the ledger fires `onChange` only
   * when the aggregate changes: holding both pins across the two recomputes keeps the aggregate from dipping below the higher of the prior pin and the surviving
   * iterators, so every replacement sends at most one frame - an upgrade on the acquire, or a downgrade on the release when the prior pin held the maximum alone. Because
   * the pin is a real subscriber, it survives reconnect and re-arms via {@link reissueOnReconnect}, alongside the iterators.
   *
   * `dumpConfig` is an INDEPENDENT one-shot side-channel, not part of the subscription. When set, it fires a distinct config-dump request at the AUTHORITATIVE level (the
   * current aggregate, falling back to `level`) so a dump never downgrades the device below what iterators or the pin need. The dump frame does NOT survive reconnect -
   * it is a fire-and-forget operation, not stored desire.
   *
   * @param level - The imperative log level to pin. Higher values are more verbose.
   * @param dumpConfig - When `true`, fires a one-shot configuration-dump request at the authoritative level alongside the pin update. Defaults to `false`.
   */
  public requestDeviceLevel(level: LogLevel, dumpConfig = false): void {

    // Replace the single managed pin through the ONE reduction, acquiring the new pin before releasing the prior one. The acquire raises the device level when `level`
    // exceeds the current max and is silent otherwise; the release then lowers it only when the prior pin held the max alone. Releasing first would let the aggregate dip
    // to the surviving iterators between the two recomputes and send a transient downgrade followed by a re-upgrade.
    const priorPin = this.logPin;

    this.logPin = this.logSubscription.acquire(LOG_CHANNEL, level);

    if(priorPin !== null) {

      this.logSubscription.release(priorPin);
    }

    // The config dump is a deliberate, distinct side-channel send - the dump operation is not the level-set. We fire it at the authoritative level (the current
    // aggregate, which now includes the pin we just acquired, falling back to `level` defensively) so a dump never downgrades the device below what the live subscribers
    // need. It is a one-shot and is not stored, so it does not survive reconnect.
    if(dumpConfig) {

      this.sendSubscribeLogsFrame(this.logSubscription.peek(LOG_CHANNEL) ?? level, true);
    }
  }

  /**
   * Open a refcounted async-iterable view of device log events at the requested level. Implements the consumer-facing contract behind the host's `client.logs(level,
   * options)` method. The first iterator at any given level upgrades the device-side subscription; subsequent iterators at the same or lower level attach silently;
   * disposing the highest iterator downgrades back to the next-highest level held by any remaining subscriber (iterator or pin).
   *
   * @remarks Each call returns an independent iterator with its own filter level; the iterator acquires its subscriber synchronously at call time (not lazily on first
   * iteration) so the device-side aggregate reflects the new level immediately, matching the {@link reissueOnReconnect} contract for in-flight iterators. The view is
   * the EventBus stream itself, and the release is its close hook, which the bus runs exactly once on the first terminal path: the consumer `signal` aborting (at once
   * when it is already aborted), the iterator's `return()` or `throw()` (including a `break` out of `for await`), a backpressure failure, or the bus ending the stream.
   * The bus attaches that hook when this method returns, so a view that is never iterated still gives its level back when its signal aborts or its `return()` runs.
   * The single-awaiter contract of {@link EventBus.stream} applies: drive one view from one loop.
   *
   * Per-message filtering is intentional: when iterator A is at INFO and iterator B is at DEBUG, the device-side level is DEBUG, so the bus emits every DEBUG-and-above
   * message. Iterator A's selector skips anything strictly more verbose than INFO so consumers asking for INFO see only INFO. The wire-side level filter and the
   * client-side per-iterator filter compose correctly, and a skipped message never occupies a slot in the view's queue.
   *
   * @param level - The minimum log level the iterator wants to see. Higher values are more verbose; messages with `event.level <= level` are yielded.
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("log", ...)`.
   * @returns An `AsyncIterable<LogEventData>` that yields events until the consumer aborts, returns, or throws, or the underlying EventBus stream ends. A reconnect
   *   does not end it: the subscriber survives in the ledger and {@link reissueOnReconnect} re-arms its level on the new connection.
   */
  public subscribe(level: LogLevel, options?: StreamOptions): AsyncIterable<LogEventData> {

    // Acquire a subscriber synchronously at call time so concurrent attaches are race-free. The first acquire on LOG_CHANNEL drives the reduction from EMPTY to the
    // level, firing the wire-side SUBSCRIBE; an acquire at or below the existing aggregate is silent (the reduction is unchanged, so onChange is suppressed).
    const handle = this.logSubscription.acquire(LOG_CHANNEL, level);

    // The bus runs the close hook exactly once, so the hook releases the handle directly and the ledger sees one release for its one acquire. The primitive pairs
    // release to acquire by symbol identity, so the last release drives the reduction back to EMPTY (a silent no-op for logs) and a post-reconnect release is correct
    // as-is - the ledger survived the reconnect and the wire cache was re-armed by reissueOnReconnect. The selector applies the per-view level filter: the device fires
    // at the aggregate maximum across every subscriber, so a view asking for INFO skips the DEBUG messages another view (or the imperative pin) raised the device to.
    return this.host.bus.stream("log", {

      ...options,
      onClose: (): void => { this.logSubscription.release(handle); },
      select: (event: LogEventData): LogEventData | undefined => (event.level <= level) ? event : undefined
    });
  }

  /**
   * Encode and send a `SUBSCRIBE_LOGS_REQUEST` at the given level with the given `dumpConfig` bit. The single wire-frame chokepoint both the subscription's on-change
   * hook (with `dumpConfig` defaulting false) and the imperative {@link requestDeviceLevel} dump path call, so the frame encoding lives in exactly one place.
   *
   * @remarks This is purely the wire-send: it carries no cache assignment of its own (the {@link ReissuableSubscription} owns the
   * connection-scoped wire cache). The `dumpConfig` flag is an ESPHome-side one-shot request that dumps the device configuration into the log stream alongside the
   * subscription frame; it is part of the wire frame, not part of the subscription state.
   *
   * @param level - The log level to send to the device.
   * @param dumpConfig - When `true`, sets the wire-frame dump bit (field 2 = 1) requesting a one-shot configuration dump. Defaults to `false`.
   */
  private sendSubscribeLogsFrame(level: LogLevel, dumpConfig = false): void {

    this.host.log.debug("Subscribing to logs at level: " + logLevelName(level) + ", dump config: " + String(dumpConfig));

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: level, wireType: WireType.VARINT },
      { fieldNumber: 2, value: dumpConfig ? 1 : 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SUBSCRIBE_LOGS_REQUEST, encodeProtoFields(fields));
  }
}
