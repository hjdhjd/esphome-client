/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle.ts: Tagged lifecycle event.
 */

/**
 * Tagged lifecycle event.
 *
 * @remarks A typed, tag-narrowable shape carrying the client's discrete lifecycle transitions. The `lifecycle` event on the EventBus carries this discriminated union;
 * consumers narrow it on `event.kind`, one of `connect`, `disconnect`, `lost`, and `recovered`, and the disconnect and lost causes are instanceof-checkable against
 * the typed error hierarchy.
 *
 * The string-shaped `connect` (boolean) and `disconnect` (string | undefined) events also stay on the bus for callers that prefer the loose shape; the typed
 * lifecycle stream is the canonical path.
 *
 * @module lifecycle
 */
import type { EspHomeError } from "./errors.ts";

/**
 * Tagged lifecycle event. Lifecycle carries the discrete transitions: the session boundary (`connect`, `disconnect`) and the reachability verdict (`lost`,
 * `recovered`). `lost` is raised once per outage when the first attempt to re-establish a session after a fault fails, a reconnect loop attempt or a manual
 * connect alike, and carries that attempt's typed error. `recovered` is raised after the `connect` of a session re-established while a `lost` stands. A fault
 * healed on the first attempt raises neither. No verdict follows a fault when no attempt runs: with `reconnect: false`, for a session never reported live, or
 * when the retry predicate refuses the fault's own cause. Stalls and the per-attempt reconnect cycle surface on the {@link ConnectionHealth} stream.
 */
export type LifecycleEvent =
  | { kind: "connect"; encrypted: boolean } |
  { cause?: EspHomeError; kind: "disconnect" } |
  { cause: EspHomeError; kind: "lost" } |
  { kind: "recovered" };
