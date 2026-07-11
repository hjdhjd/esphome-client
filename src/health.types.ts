/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * health.types.ts: Type-level rules pinning the ConnectionHealth discriminated union's "illegal states unrepresentable" guarantees.
 */

/**
 * Compile-time rules for the {@link ConnectionHealth} discriminated union. The union models the connection-health record as two mutually-exclusive
 * variants - {@link LiveConnectionHealth} (socket up, carries the `connectedAtMs` epoch) and {@link DownConnectionHealth} (socket down, forbids the
 * epoch and narrows `encrypted` to `false`). This file pins, structurally, that the illegal states the union is designed to forbid genuinely fail to compile: a down
 * record with an epoch, a down record on an encrypted wire, a live record missing its epoch, and an un-narrowed read of the epoch. A regression that loosened any of
 * these would either drop a `@ts-expect-error` (turning the directive itself into an error) or break a sentinel assertion, so CI catches it.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`, NOT by
 * `node --test` (the runner globs `*.test.ts`). Two patterns coexist, matching `schemas/packed-bits.types.ts`:
 *
 *   1. **Sentinel-assertion type aliases** (`Assert<Equal<A, B>>` / `Assert<Extends<A, B>>`) - capture structural rules. A failed assertion produces a typecheck
 *      error at the alias's declaration site.
 *
 *   2. **Top-level constants with `@ts-expect-error`** - capture excess-property and required-property checks. Pure type-level conditional types can't express
 *      excess-property checking (structural assignability is permissive; the check only fires on object literals at construction sites), so a deliberately misconfigured
 *      object literal wrapped in a typecheck-only constant + `@ts-expect-error` is the canonical way to pin those rules.
 *
 * @module health/health.types
 */
import type { Assert, Extends } from "./internal/type-assertions.ts";
import type { ConnectionHealth, DownConnectionHealth, LiveConnectionHealth } from "./health.ts";
import { HealthState, isConnectionLive } from "./health.ts";

/**
 * Both variants are assignable to the public {@link ConnectionHealth} union - the union is exactly their sum, so neither variant has drifted out of it.
 */
type LiveExtendsUnion = Assert<Extends<LiveConnectionHealth, ConnectionHealth>>;

/**
 * The down variant is likewise a member of the union.
 */
type DownExtendsUnion = Assert<Extends<DownConnectionHealth, ConnectionHealth>>;

/**
 * The live variant's `state` is exactly the "socket up" subset of {@link HealthState} - connected or stalled - so a down state can never carry the epoch.
 */
type LiveStateIsSocketUp = Assert<Extends<LiveConnectionHealth["state"], typeof HealthState.CONNECTED | typeof HealthState.STALLED>>;

/**
 * The down variant's `state` is exactly the "socket down" subset of {@link HealthState} - disconnected or reconnecting.
 */
type DownStateIsSocketDown = Assert<Extends<DownConnectionHealth["state"], typeof HealthState.DISCONNECTED | typeof HealthState.RECONNECTING>>;

/**
 * A valid live record: carries the connect epoch and a socket-up state. The directive-free construction must compile, pinning the positive case alongside the negative
 * ones below (a regression that made `connectedAtMs` accidentally forbidden everywhere would break this).
 */
const validLive: LiveConnectionHealth = {

  connectedAtMs: 1000,
  consecutiveStalls: 0,
  encrypted: true,
  lastInboundActivityAt: 0,
  state: HealthState.CONNECTED
};

/**
 * A valid down record: no connect epoch, `encrypted: false`, a socket-down state. The directive-free construction must compile.
 */
const validDown: DownConnectionHealth = {

  consecutiveStalls: 0,
  encrypted: false,
  lastInboundActivityAt: 0,
  state: HealthState.DISCONNECTED
};

/**
 * Illegal: a down record may NOT carry `connectedAtMs`. The `?: never` on {@link DownConnectionHealth} makes the connect epoch unrepresentable on a down record, so the
 * object literal fails the excess-property / never-assignability check. Removing the directive turns this construction into a real typecheck error.
 */
const downWithEpoch: DownConnectionHealth = {

  // @ts-expect-error - connectedAtMs is forbidden on a down record by `connectedAtMs?: never`; a stale connect epoch can never leak onto a down record.
  connectedAtMs: 1000,
  consecutiveStalls: 0,
  encrypted: false,
  lastInboundActivityAt: 0,
  state: HealthState.DISCONNECTED
};

/**
 * Illegal: a down record may NOT be on an encrypted wire. {@link DownConnectionHealth} narrows `encrypted` to the literal `false`, so `encrypted: true` is not
 * assignable.
 */
const downEncrypted: DownConnectionHealth = {

  consecutiveStalls: 0,
  // @ts-expect-error - encrypted is narrowed to the literal `false` on a down record; a disconnected/reconnecting record is never on an encrypted wire.
  encrypted: true,
  lastInboundActivityAt: 0,
  state: HealthState.DISCONNECTED
};

/**
 * Illegal: a live record REQUIRES `connectedAtMs`. Omitting it leaves the required property unsatisfied, so the construction fails to compile.
 */
// @ts-expect-error - connectedAtMs is required on a live record; omitting it leaves the live variant's epoch SSOT unsatisfied.
const liveMissingEpoch: LiveConnectionHealth = {

  consecutiveStalls: 0,
  encrypted: true,
  lastInboundActivityAt: 0,
  state: HealthState.CONNECTED
};

/**
 * Reading `.connectedAtMs` as a clean `number` requires narrowing to the live variant first. On the un-narrowed {@link ConnectionHealth} the property is typed
 * `number | undefined` (the down variant's `connectedAtMs?: never` collapses to `undefined` in the union), so assigning the un-narrowed read to a `number` fails - the
 * epoch is not safely usable until {@link isConnectionLive} narrows the union. After narrowing, the read is a plain `number` and assigns cleanly.
 */
function epochAccessRequiresNarrowing(health: ConnectionHealth): void {

  // @ts-expect-error - on the un-narrowed union connectedAtMs is `number | undefined`; assigning it to a `number` fails because the down variant cannot supply the epoch.
  const unguarded: number = health.connectedAtMs;

  void unguarded;

  if(isConnectionLive(health)) {

    // After narrowing to the live variant, the epoch is a plain `number` and reads cleanly.
    const epoch: number = health.connectedAtMs;

    void epoch;
  }
}

// Export every sentinel-assertion type alias and reference the typecheck-only constants and function so neither the unused-locals lint nor any future tree-shaking
// optimization elides them. None of these are consumed at runtime; their value is purely the compile-time validation they trigger.
export type {

  DownExtendsUnion,
  DownStateIsSocketDown,
  LiveExtendsUnion,
  LiveStateIsSocketUp
};

void downEncrypted;
void downWithEpoch;
void epochAccessRequiresNarrowing;
void liveMissingEpoch;
void validDown;
void validLive;
