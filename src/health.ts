/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * health.ts: ConnectionHealth observable.
 */

/**
 * Connection-health observability.
 *
 * @remarks A discriminated union describing the connection's recent activity timestamp, ping round-trip time, stall count, and encryption flag. The "socket up" variant
 * ({@link LiveConnectionHealth}, connected or stalled) additionally carries `connectedAtMs` - the single source of truth for "when this connection began" - from which
 * live uptime is derived via {@link connectionUptimeMs} rather than stored. The "socket down" variant ({@link DownConnectionHealth}, disconnected or reconnecting) cannot
 * carry the connect epoch at all, so "uptime when not connected" is unrepresentable. Consumers who want UI updates subscribe via `client.onHealthChange(...)` or iterate
 * `client.healthStream(...)`, and call {@link connectionUptimeMs} on the snapshot when they need uptime.
 *
 * @module health
 */

/**
 * Connection-health states. Modeled as an `as const` object so the type narrows to a literal union without an enum.
 */
export const HealthState = {

  CONNECTED:    "connected",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
  STALLED:      "stalled"
} as const;

export type HealthState = typeof HealthState[keyof typeof HealthState];

/**
 * Fields common to every health record, live or down.
 */
interface ConnectionHealthBase {

  /**
   * Number of consecutive ping stalls. Resets to 0 on successful inbound activity.
   */
  readonly consecutiveStalls: number;

  /**
   * Whether the current session's transport is encrypted. False during reconnecting and disconnected states.
   */
  readonly encrypted: boolean;

  /**
   * Timestamp of the most recent inbound message in epoch milliseconds. `0` before the first inbound message.
   */
  readonly lastInboundActivityAt: number;

  /**
   * Round-trip time of the most recent successful ping in milliseconds. Undefined until the first ping completes.
   */
  readonly lastPingRttMs?: number;
}

/**
 * Health of a record whose socket is up (connected or stalled). Carries `connectedAtMs` - the SSOT for "when this connection began" - from which live uptime is derived
 * via {@link connectionUptimeMs}. Both `connected` and `stalled` are "socket up" states, so uptime stays live through a stall.
 */
export interface LiveConnectionHealth extends ConnectionHealthBase {

  /**
   * Timestamp of the most recent successful connect in epoch milliseconds. The single source of truth for connection uptime; derive it via {@link connectionUptimeMs}.
   */
  readonly connectedAtMs: number;

  /**
   * Current health state - the "socket up" subset of {@link HealthState}.
   */
  readonly state: typeof HealthState.CONNECTED | typeof HealthState.STALLED;
}

/**
 * Health of a record whose socket is down (disconnected or reconnecting). `connectedAtMs` is forbidden via `?: never` so a stale connect epoch can never leak onto a
 * down record through an object spread - a transition that tried to would fail to compile. `encrypted` is narrowed to `false`: a down record is never on an encrypted
 * wire.
 */
export interface DownConnectionHealth extends ConnectionHealthBase {

  /**
   * Forbidden on a down record. The connect epoch is a property of the live state only; `?: never` makes spreading a live record's epoch onto a down variant a compile
   * error.
   */
  readonly connectedAtMs?: never;

  /**
   * Always `false` on a down record - a disconnected or reconnecting record is never on an encrypted wire.
   */
  readonly encrypted: false;

  /**
   * Current health state - the "socket down" subset of {@link HealthState}.
   */
  readonly state: typeof HealthState.DISCONNECTED | typeof HealthState.RECONNECTING;
}

/**
 * Live connection-health snapshot. A discriminated union over {@link HealthState}: {@link LiveConnectionHealth} carries the connect epoch (`connectedAtMs`) while the
 * socket is up; {@link DownConnectionHealth} forbids it while the socket is down. Uptime is never stored; it is derived from `connectedAtMs` via
 * {@link connectionUptimeMs}.
 */
export type ConnectionHealth = DownConnectionHealth | LiveConnectionHealth;

/**
 * Type guard narrowing a {@link ConnectionHealth} to the live variant (socket up: connected or stalled), which carries {@link LiveConnectionHealth.connectedAtMs}.
 */
export function isConnectionLive(health: ConnectionHealth): health is LiveConnectionHealth {

  return (health.state === HealthState.CONNECTED) || (health.state === HealthState.STALLED);
}

/**
 * Derive live connection uptime in milliseconds from a {@link ConnectionHealth} record. Returns `now - connectedAtMs` while the socket is up (connected or stalled) and
 * `0` while it is down - so uptime stays live through a stall and is structurally `0` when there is no connection. This is the single derivation of uptime from the
 * `connectedAtMs` SSOT; callers pass `now` only in tests.
 *
 * @param health - The health record to derive uptime from.
 * @param now - The reference "now" in epoch milliseconds; defaults to `Date.now()`.
 * @returns Milliseconds the current connection has been up, or `0` when not connected.
 */
export function connectionUptimeMs(health: ConnectionHealth, now: number = Date.now()): number {

  return isConnectionLive(health) ? now - health.connectedAtMs : 0;
}

/**
 * Returns the "disconnected" health record. Used as the initial value before the first successful connect, and after every clean teardown.
 *
 * @remarks This is the pure baseline and carries no `lastPingRttMs` and zero stalls. A transition out of a session builds its down record through `downHealth`, which
 * overlays the diagnostics the previous record carries forward onto this baseline...this helper and that overlay are layers of one design, not a contradiction.
 *
 * @returns A {@link DownConnectionHealth} snapshot in the disconnected baseline (state `disconnected`, `encrypted: false`, no connect epoch, zero stalls, no inbound
 * activity, no last ping RTT).
 */
export function disconnectedHealth(): DownConnectionHealth {

  return {

    consecutiveStalls: 0,
    encrypted: false,
    lastInboundActivityAt: 0,
    state: HealthState.DISCONNECTED
  };
}

/**
 * Returns the down health record a transition out of a session installs: the {@link disconnectedHealth} baseline in the given down state, carrying the previous record's
 * `consecutiveStalls` and, when it has one, its `lastPingRttMs`.
 *
 * @remarks The stall count survives the teardown between a stall and the reconnect because only inbound activity resets it. The round-trip time stays as a last-seen
 * latency diagnostic, and the down state itself marks it stale: the record's state and its absent connect epoch (so {@link connectionUptimeMs} reads `0`) say it was
 * measured against a connection that has ended. Every other field is the baseline's, whatever the previous record holds: a down record is never on an encrypted wire and
 * carries no connect epoch and no inbound-activity time, even when it follows a live record.
 *
 * @param previous - The record the transition leaves.
 * @param state - The down state to enter.
 * @returns A {@link DownConnectionHealth} snapshot in `state`.
 */
export function downHealth(previous: ConnectionHealth, state: DownConnectionHealth["state"]): DownConnectionHealth {

  return {

    ...disconnectedHealth(),
    consecutiveStalls: previous.consecutiveStalls,
    ...((previous.lastPingRttMs !== undefined) && { lastPingRttMs: previous.lastPingRttMs }),
    state
  };
}

/**
 * The new session's facts a connected record takes from its caller. Each is a field of {@link LiveConnectionHealth}, so its meaning is the one that field documents.
 */
type ConnectedHealthOptions = Pick<LiveConnectionHealth, "connectedAtMs" | "encrypted" | "lastInboundActivityAt">;

/**
 * Returns the connected health record a successful connect installs: the given connect epoch, encryption flag, and inbound-activity time in the connected state,
 * carrying the previous record's `consecutiveStalls` and no `lastPingRttMs`.
 *
 * @remarks A new connection has measured no round trip, so a round-trip time from the previous record would describe a connection that has ended. The stall count
 * carries because only inbound activity resets it, so a device that stalls again right after reconnecting keeps counting until its first inbound message proves it live.
 *
 * @param previous - The record the transition leaves.
 * @param options - The new session's connect epoch, encryption flag, and inbound-activity time.
 * @returns A {@link LiveConnectionHealth} snapshot in the connected state.
 */
export function connectedHealth(previous: ConnectionHealth, options: ConnectedHealthOptions): LiveConnectionHealth {

  const { connectedAtMs, encrypted, lastInboundActivityAt } = options;

  return {

    connectedAtMs,
    consecutiveStalls: previous.consecutiveStalls,
    encrypted,
    lastInboundActivityAt,
    state: HealthState.CONNECTED
  };
}
