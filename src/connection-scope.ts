/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection-scope.ts: The connection scope an awaiting request reads, its admission decision, its composed signal, and the connection errors.
 */

/**
 * The connection scope every awaiting request composes into its wait.
 *
 * @remarks The host owns one abort signal per attached transport and aborts it, with one {@link ConnectionLostError}, when it tears that transport down. Each awaiting
 * call reads the scope once through its host interface, before it registers or sends anything: {@link requireConnection} refuses the call when no connection is
 * attached and otherwise hands back the scope's signal, which {@link composeRequestSignal} folds into the wait beside the caller's signal and the call's timeout. One
 * abort then ends every wait the connection carried, each with the reason of whichever source ended it. This module holds no controller of its own, because the host
 * owns the scope; it decides, composes, and builds the errors, so the host, the mock client, and every test fake report a fact and none of them decides.
 *
 * @internal
 * @module connection-scope
 */
import { ConnectionLostError, NotConnectedError } from "./errors.ts";

/**
 * The connection a request issued at this moment would travel on. `attached` carries the connection's signal, which the host aborts with the
 * {@link ConnectionLostError} its teardown builds when that connection is torn down; `connecting` means a manual connect has not yet settled or the automatic
 * reconnect is active; `none` means neither is running and no connection is attached. Each reading describes the moment it was taken and forecasts nothing about
 * whether a connection follows.
 *
 * @internal
 */
export type ConnectionScope = { readonly kind: "attached"; readonly signal: AbortSignal } | { readonly kind: "connecting" } | { readonly kind: "none" };

/**
 * A request's composed signal and the release of the listeners that feed it. An awaiting call binds it with `using` and awaits its wait inside that block, so the
 * listeners leave every source the moment the wait settles.
 *
 * @internal
 */
export interface RequestSignal extends Disposable {

  /**
   * The signal the call hands its wait. It aborts with the reason of the first source that aborts.
   */
  readonly signal: AbortSignal;
}

// Every connection-lost error carries this one message. The error's `cause`, not its message, says what ended the connection.
const CONNECTION_LOST_MESSAGE = "The connection ended before the request completed.";

// A composed signal built while a source was already aborted registered no listener, so its release has nothing to remove.
const RELEASE_NOTHING = (): void => { /* Nothing was registered. */ };

/**
 * Build the error a teardown aborts the connection scope with. This is the one place a {@link ConnectionLostError} is constructed, so every wait a teardown ends and
 * a manual connect a disconnect cuts short all reject with an error of the same message and code.
 *
 * @param cause - What ended the connection, when the teardown knows it. The error carries a `cause` only when it is given one.
 *
 * @returns The connection-lost error, coded `CONNECTION_LOST`.
 *
 * @internal
 */
export function connectionLostError(cause?: unknown): ConnectionLostError {

  return new ConnectionLostError(CONNECTION_LOST_MESSAGE, "CONNECTION_LOST", (cause === undefined) ? undefined : { cause });
}

/**
 * Decide whether an awaiting request is admitted. This is the not-connected rule's one decision and the one place a {@link NotConnectedError} is constructed: a call
 * reads its connection scope once, as the statement after its already-aborted check, and passes it here before it registers, claims, opens, or sends anything.
 *
 * @param scope - The connection scope the call read from its host.
 * @param request - The call's public call path, such as `"setNoiseEncryptionKey()"`, which the refusal's message names.
 *
 * @returns The attached connection's signal, which the call composes into its wait.
 *
 * @throws {NotConnectedError} coded `CONNECT_IN_PROGRESS` when a manual connect had not yet settled or the automatic reconnect was active, and `NOT_CONNECTED` when no
 * connection was attached and neither was running.
 *
 * @internal
 */
export function requireConnection(scope: ConnectionScope, request: string): AbortSignal {

  // The switch carries no default, so a scope kind added later is a compile error here rather than a call that slips through admission.
  switch(scope.kind) {

    case "attached": {

      return scope.signal;
    }

    case "connecting": {

      throw new NotConnectedError(request + " was issued during a connect, so nothing was sent; issue it from a connect or lifecycle listener.", "CONNECT_IN_PROGRESS");
    }

    case "none": {

      throw new NotConnectedError(request + " was issued with no connection to the device, so nothing was sent.", "NOT_CONNECTED");
    }
  }
}

/**
 * Compose the signal an awaiting request hands its wait. The composite aborts with the reason of whichever source aborts first: the caller's signal, the call's
 * timeout, or the connection.
 *
 * @remarks Each source is followed through an `abort` listener that the returned object's `[Symbol.dispose]()` removes, rather than through `AbortSignal.any`. On the
 * Node 22 line this package supports, a composite built by `AbortSignal.any` stays registered on each source until that source is collected, so a connection that
 * lives for days, or a caller's long-lived signal, would retain one composite per request; the listener form leaves nothing behind once the call's `using` block
 * exits. A composite built while a source is already aborted is aborted at once with the first such source's reason, in the order caller, timeout, connection, and has
 * nothing to release, so a call never parks on a signal that already fired.
 *
 * @param connection - The connection's signal, as {@link requireConnection} returned it.
 * @param options - The call's other sources.
 * @param options.signal - The caller's signal, when the caller passed one.
 * @param options.timeoutMs - The call's timeout in milliseconds. A bus wait passes its resolved default here; a correlator wait keeps its timeout on the correlator.
 *
 * @returns The composed signal and the release of its listeners.
 *
 * @internal
 */
export function composeRequestSignal(connection: AbortSignal, options: { signal?: AbortSignal | undefined; timeoutMs?: number } = {}): RequestSignal {

  const sources: AbortSignal[] = [];

  if(options.signal !== undefined) {

    sources.push(options.signal);
  }

  if(options.timeoutMs !== undefined) {

    sources.push(AbortSignal.timeout(options.timeoutMs));
  }

  sources.push(connection);

  const aborted = sources.find((source) => source.aborted);

  if(aborted !== undefined) {

    return { [Symbol.dispose]: RELEASE_NOTHING, signal: AbortSignal.abort(aborted.reason) };
  }

  const controller = new AbortController();
  const followers = sources.map((source) => {

    const follow = (): void => { controller.abort(source.reason); };

    source.addEventListener("abort", follow, { once: true });

    return { follow, source };
  });

  return {

    [Symbol.dispose]: (): void => {

      for(const { follow, source } of followers) {

        source.removeEventListener("abort", follow);
      }
    },
    signal: controller.signal
  };
}
