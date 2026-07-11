/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle.ts: Tagged lifecycle event.
 */

/**
 * Tagged lifecycle event.
 *
 * @remarks A typed, tag-narrowable shape carrying connect/disconnect transitions. The `lifecycle` event on the EventBus carries this discriminated union;
 * consumers narrow it on `event.kind === "connect" | "disconnect"`, and the disconnect cause is instanceof-checkable against the typed error hierarchy.
 *
 * The string-shaped `connect` (boolean) and `disconnect` (string | undefined) events also stay on the bus for callers that prefer the loose shape; the typed
 * lifecycle stream is the canonical path.
 *
 * @module lifecycle
 */
import type { EspHomeError } from "./errors.ts";

/**
 * Tagged lifecycle event. Stalls and reconnect cycles surface on the {@link ConnectionHealth} stream rather than here, by design - lifecycle is the
 * boundary signal (we connected; we disconnected); health is the live observability surface.
 */
export type LifecycleEvent =
  | { kind: "connect"; encrypted: boolean } |
  { cause?: EspHomeError; kind: "disconnect" };
