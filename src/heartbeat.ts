/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * heartbeat.ts: Lazy heartbeat scheduler.
 */

import type { EspHomeLogging, Nullable } from "./types.ts";
import { HeartbeatStalledError } from "./errors.ts";

/**
 * Heartbeat scheduling.
 *
 * @remarks The scheduler owns the timer that detects inbound silence on the connection. It tracks the most recent inbound activity timestamp, sends `PING_REQUEST`
 * when idle past the configured interval, and surfaces a typed {@link HeartbeatStalledError} when no inbound activity follows within the stall timeout. The
 * scheduler is intentionally agnostic to the host's health-state machine - the host updates the cached {@link ConnectionHealth}'s `lastInboundActivityAt`
 * field on every stamp, but only emits `healthChange` on a genuine state transition (`STALLED` -> `CONNECTED`) or a stall, not on every stamp.
 *
 * @module heartbeat
 */

/**
 * Resolved heartbeat configuration. The host normalises raw `keepAlive` options to this shape; `null` means heartbeat is disabled.
 */
export interface HeartbeatConfig {

  /**
   * Idle threshold in milliseconds. Once `(now - lastActivityAt) >= intervalMs` and no ping is in-flight, the scheduler invokes the host's `onSendPing` callback.
   */
  readonly intervalMs: number;

  /**
   * Stall budget in milliseconds. Once `(now - lastActivityAt) >= stallTimeoutMs`, the scheduler invokes `onStall` with a typed
   * {@link HeartbeatStalledError} and stops the timer; the host is expected to tear down the connection (auto-reconnect, when enabled, picks up from there).
   */
  readonly stallTimeoutMs: number;
}

/**
 * Host seam consumed by the scheduler. Decouples timer logic from the host's health-state machine, transport, and disconnect path.
 */
export interface HeartbeatHost {

  /**
   * Logging interface used for the supervisory warn line emitted on stalls.
   */
  readonly log: EspHomeLogging;

  /**
   * Invoked when the scheduler decides to send a heartbeat ping. The host frames and writes `PING_REQUEST` on the wire; the scheduler stamps `pingSentAt` before
   * the call so that {@link HeartbeatScheduler.consumePingRtt} sees the same monotonic instant the timer used.
   */
  onSendPing(): void;

  /**
   * Invoked exactly once per stall detection. The scheduler stops its own timer before calling, so this callback is free to schedule a teardown synchronously.
   *
   * @param cause - Pre-constructed {@link HeartbeatStalledError} ready for the host to thread through `disconnectInternal`.
   * @param idleMs - Elapsed milliseconds since the most recent inbound message.
   */
  onStall(cause: HeartbeatStalledError, idleMs: number): void;
}

/**
 * Optional injection seam for tests. The scheduler reads the wall clock through this function so deterministic tests can advance time without `setTimeout`.
 */
export type ClockFn = () => number;

/**
 * Lazy heartbeat scheduler. Holds the timer state, last-activity timestamp, and in-flight ping marker; transitions are surfaced to the host via the seam.
 *
 */
export class HeartbeatScheduler {

  private readonly clock: ClockFn;
  private readonly config: Nullable<HeartbeatConfig>;
  private readonly host: HeartbeatHost;
  private lastActivityAtMs: number;
  private pingSentAtMs: number;
  private running: boolean;
  private timer: Nullable<ReturnType<typeof setInterval>>;

  /**
   * Construct a scheduler bound to a host seam.
   *
   * @param host - The host seam (logger + send-ping + stall callbacks).
   * @param config - Resolved {@link HeartbeatConfig} when heartbeat is enabled; `null` to disable. A disabled scheduler short-circuits `start` and `tick`; `stamp`
   * and `lastActivityAt` keep running regardless, since the host reuses them for general inbound-activity tracking independent of the heartbeat ping/stall feature.
   * @param clock - Optional clock function. Defaults to `Date.now`. Tests pass a controlled function to drive deterministic ticks.
   */
  public constructor(host: HeartbeatHost, config: Nullable<HeartbeatConfig>, clock: ClockFn = Date.now) {

    this.clock = clock;
    this.config = config;
    this.host = host;
    this.lastActivityAtMs = 0;
    this.pingSentAtMs = 0;
    this.running = false;
    this.timer = null;
  }

  /**
   * Whether heartbeat is enabled for this scheduler instance. False when constructed with `null` config (corresponding to `keepAlive: false`).
   */
  public get enabled(): boolean {

    return this.config !== null;
  }

  /**
   * Whether a heartbeat ping is currently in flight (a `PING_REQUEST` was sent and the matching `PING_RESPONSE` has not yet been observed).
   */
  public get isPingInFlight(): boolean {

    return this.pingSentAtMs > 0;
  }

  /**
   * Most-recent inbound activity timestamp in epoch milliseconds. `0` before {@link HeartbeatScheduler.start} runs.
   */
  public get lastActivityAt(): number {

    return this.lastActivityAtMs;
  }

  /**
   * Start the supervisory timer. The interval timer is created at most once - re-entering while it is already running does not spawn a second timer. Re-entry is not a
   * full no-op, however... each call re-seeds the last-activity baseline to `initialActivityAtMs` and sets the running flag before the timer guard, so a second call
   * re-arms the idle detector from a fresh timestamp. The sole production caller invokes it once per connect with the connect-start timestamp, so this only matters to a
   * future caller that re-arms the scheduler. No-op when the scheduler is disabled.
   *
   * The tick interval is half the configured `intervalMs` (floored at 1000 ms) so idle is detected slightly past the threshold without sleeping a full interval
   * past it.
   *
   * @param initialActivityAtMs - Activity timestamp to seed the supervisor with. Typically the connect-start timestamp.
   */
  public start(initialActivityAtMs: number): void {

    if(!this.config) {

      return;
    }

    this.lastActivityAtMs = initialActivityAtMs;
    this.running = true;

    if(this.timer) {

      return;
    }

    const tickMs = Math.max(1000, Math.floor(this.config.intervalMs / 2));

    this.timer = setInterval((): void => { this.tick(); }, tickMs);

    // Allow the process to exit even if the timer is alive. The heartbeat is supervisory, not required for liveness.
    this.timer.unref();
  }

  /**
   * Stop the supervisory timer. Safe to call more than once. Clears the in-flight ping marker so a subsequent `start` begins from a clean slate.
   */
  public stop(): void {

    if(this.timer) {

      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.pingSentAtMs = 0;
  }

  /**
   * Record an inbound activity timestamp. Called from the host's per-message tap in the run-phase dispatch table. The host is responsible for transitioning the
   * health record (e.g. `STALLED` -> `CONNECTED`) after the call - the scheduler itself is health-agnostic.
   *
   * @param atMs - Optional explicit timestamp; defaults to the scheduler's clock. Used in tests to drive deterministic activity timelines.
   */
  public stamp(atMs?: number): void {

    this.lastActivityAtMs = atMs ?? this.clock();
  }

  /**
   * Consume the in-flight ping marker. Returns the elapsed milliseconds since the ping was sent and clears the marker. Returns `undefined` if no ping is in flight.
   * Called from the host's `PING_RESPONSE` handler to update {@link LiveConnectionHealth.lastPingRttMs}.
   */
  public consumePingRtt(): number | undefined {

    if(this.pingSentAtMs === 0) {

      return undefined;
    }

    const rtt = this.clock() - this.pingSentAtMs;

    this.pingSentAtMs = 0;

    return rtt;
  }

  /**
   * Run a single supervisory tick. Public so tests can drive the scheduler deterministically without waiting for the real timer. The internal `setInterval` calls
   * this same method.
   *
   * Tick logic:
   *
   * - When idle past `stallTimeoutMs`, build a {@link HeartbeatStalledError}, stop the timer, and invoke `onStall`. The host tears down from there.
   * - When idle past `intervalMs` and no ping is already in flight, stamp `pingSentAt` and invoke `onSendPing`.
   * - Otherwise, no-op.
   */
  public tick(): void {

    if(!this.config || !this.running) {

      return;
    }

    const now = this.clock();
    const idleMs = now - this.lastActivityAtMs;

    if(idleMs >= this.config.stallTimeoutMs) {

      const cause = new HeartbeatStalledError("Heartbeat stalled.", "HEARTBEAT_STALLED");

      this.host.log.warn("Heartbeat stalled after " + String(idleMs) + " ms of inbound silence; tearing down for reconnect.");
      this.stop();
      this.host.onStall(cause, idleMs);

      return;
    }

    if((idleMs >= this.config.intervalMs) && (this.pingSentAtMs === 0)) {

      this.pingSentAtMs = now;
      this.host.onSendPing();
    }
  }
}
