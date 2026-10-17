/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * connection-scope.test.ts: Unit tests for the connection scope's admission decision, its composed request signal, and its connection-lost error.
 */
import { ConnectionLostError, NotConnectedError } from "./errors.ts";
import { composeRequestSignal, connectionLostError, requireConnection } from "./connection-scope.ts";
import { describe, test } from "node:test";
import { getEventListeners, once } from "node:events";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";

// Capture every signal `AbortSignal.timeout` builds during the test, delegating to the platform so each captured signal fires as a real one would. The test's mock
// context restores the platform method when the test ends.
function captureTimeoutSignals(t: TestContext): AbortSignal[] {

  const captured: AbortSignal[] = [];
  const platformTimeout = AbortSignal.timeout.bind(AbortSignal);

  t.mock.method(AbortSignal, "timeout", (milliseconds: number): AbortSignal => {

    const signal = platformTimeout(milliseconds);

    captured.push(signal);

    return signal;
  });

  return captured;
}

describe("composeRequestSignal", () => {

  test("aborts with the reason of whichever source aborts first: the caller's, the timeout's own TimeoutError, or the connection's, by identity", async (t) => {

    const captured = captureTimeoutSignals(t);
    const callerReason = new Error("The caller gave up.");
    const connectionReason = connectionLostError();
    const callerFirst = { caller: new AbortController(), connection: new AbortController() };
    const timeoutFirst = { caller: new AbortController(), connection: new AbortController() };
    const connectionFirst = { caller: new AbortController(), connection: new AbortController() };

    using byCaller = composeRequestSignal(callerFirst.connection.signal, { signal: callerFirst.caller.signal, timeoutMs: 60000 });

    callerFirst.caller.abort(callerReason);
    callerFirst.connection.abort(connectionReason);

    assert.equal(byCaller.signal.reason, callerReason, "the caller's abort must reach the composite synchronously with the caller's own reason");

    const start = performance.now();

    using byTimeout = composeRequestSignal(timeoutFirst.connection.signal, { signal: timeoutFirst.caller.signal, timeoutMs: 10 });

    await once(byTimeout.signal, "abort");

    const elapsed = performance.now() - start;
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the composite must build its timeout through AbortSignal.timeout");
    assert.equal(byTimeout.signal.reason, timeoutSignal.reason, "the composite must carry the timeout signal's own reason");
    assert.equal((byTimeout.signal.reason as DOMException).name, "TimeoutError");

    // The identity above holds for a timeout of any duration, so this bound is what ties the abort to the timeout the composite asked for: it leaves far more room
    // than scheduling jitter needs, and a timeout built with a duration above it fails the row.
    assert.ok(elapsed < 500, "the requested timeout, not a slower one, must abort the composite - observed " + String(elapsed) + " ms");

    using byConnection = composeRequestSignal(connectionFirst.connection.signal, { signal: connectionFirst.caller.signal, timeoutMs: 60000 });

    connectionFirst.connection.abort(connectionReason);
    connectionFirst.caller.abort(callerReason);

    assert.equal(byConnection.signal.reason, connectionReason, "the connection's abort must reach the composite with the connection-lost error itself");
  });

  test("built over a connection already aborted, is aborted at once with that reason", () => {

    const connection = new AbortController();
    const lost = connectionLostError();

    connection.abort(lost);

    using request = composeRequestSignal(connection.signal, { signal: new AbortController().signal });

    assert.equal(request.signal.aborted, true, "a composite over an aborted connection must start aborted");
    assert.equal(request.signal.reason, lost);
  });

  test("built over an aborted caller and an aborted connection, is aborted at once with the caller's reason", () => {

    const caller = new AbortController();
    const connection = new AbortController();
    const a = new Error("Caller reason.");
    const b = connectionLostError();

    caller.abort(a);
    connection.abort(b);

    using request = composeRequestSignal(connection.signal, { signal: caller.signal, timeoutMs: 60000 });

    assert.equal(request.signal.reason, a, "the caller precedes the connection, so its reason wins when each was already aborted as the composite was built");
  });

  test("hands a falsy reason through as it is, from a source that aborts later or one already aborted", () => {

    const caller = new AbortController();
    const connection = new AbortController();

    using following = composeRequestSignal(connection.signal, { signal: caller.signal });

    caller.abort(0);

    assert.equal(following.signal.aborted, true);
    assert.equal(following.signal.reason, 0, "a source aborted with 0 must hand the composite 0");

    using prebuilt = composeRequestSignal(AbortSignal.abort(0));

    assert.equal(prebuilt.signal.reason, 0, "a connection already aborted with 0 must hand the composite 0");
  });

  test("after dispose, leaves no listener on any source and no longer follows them", (t) => {

    const captured = captureTimeoutSignals(t);
    const caller = new AbortController();
    const connection = new AbortController();
    const request = composeRequestSignal(connection.signal, { signal: caller.signal, timeoutMs: 60000 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the composite must build its timeout through AbortSignal.timeout");
    assert.equal(getEventListeners(caller.signal, "abort").length, 1, "the composite follows the caller's signal while it is held");
    assert.equal(getEventListeners(connection.signal, "abort").length, 1, "the composite follows the connection while it is held");
    assert.equal(getEventListeners(timeoutSignal, "abort").length, 1, "the composite follows its timeout while it is held");

    request[Symbol.dispose]();

    assert.equal(getEventListeners(caller.signal, "abort").length, 0, "dispose must remove the listener from the caller's signal");
    assert.equal(getEventListeners(connection.signal, "abort").length, 0, "dispose must remove the listener from the connection's signal");
    assert.equal(getEventListeners(timeoutSignal, "abort").length, 0, "dispose must remove the listener from the timeout signal");

    connection.abort(connectionLostError());
    caller.abort(new Error("Late caller abort."));

    assert.equal(request.signal.aborted, false, "a disposed composite must not follow a source that aborts afterward");
  });
});

describe("connectionLostError", () => {

  test("sets the code, the one message, and the given cause", () => {

    const fault = new Error("Synthetic transport fault.");
    const err = connectionLostError(fault);

    assert.ok(err instanceof ConnectionLostError);
    assert.equal(err.code, "CONNECTION_LOST");
    assert.equal(err.message, "The connection ended before the request completed.");
    assert.equal(err.cause, fault);
  });

  test("carries no cause when given none", () => {

    const err = connectionLostError();

    assert.equal(err.code, "CONNECTION_LOST");
    assert.equal(Object.hasOwn(err, "cause"), false, "a teardown that knew no cause must leave the error without an own cause");
  });
});

describe("requireConnection", () => {

  test("returns an attached scope's signal by identity", () => {

    const connection = new AbortController();

    assert.equal(requireConnection({ kind: "attached", signal: connection.signal }, "probe.request()"), connection.signal);
  });

  test("refuses a connect in progress with NotConnectedError coded CONNECT_IN_PROGRESS, naming the request", () => {

    assert.throws((): AbortSignal => requireConnection({ kind: "connecting" }, "probe.request()"),
      { code: "CONNECT_IN_PROGRESS", constructor: NotConnectedError, message: /^probe\.request\(\) was issued during a connect, so nothing was sent;/ });
  });

  test("refuses no connection with NotConnectedError coded NOT_CONNECTED, naming the request", () => {

    assert.throws((): AbortSignal => requireConnection({ kind: "none" }, "probe.request()"),
      { code: "NOT_CONNECTED", constructor: NotConnectedError, message: /^probe\.request\(\) was issued with no connection to the device, so nothing was sent\.$/ });
  });
});
