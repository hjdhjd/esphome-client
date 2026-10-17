/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * message-receiver.test.ts: Unit tests for the run-phase MessageReceiver demultiplexer.
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { ConnectionClosedByPeerError } from "./errors.ts";
import type { EspHomeLogging } from "./types.ts";
import { MessageReceiver } from "./message-receiver.ts";
import { MessageType } from "./protocol/message-types.ts";
import { MockTransport } from "./testing/mock-transport.ts";
import assert from "node:assert/strict";

/**
 * One captured warn record: the message string the receiver logged plus the structured context object it attached.
 */
interface CapturedWarn {

  context: unknown;
  message: string;
}

/**
 * Minimal {@link EspHomeLogging} that records every `warn` call into an array and no-ops the other levels. The receiver's diagnostics logger emits exclusively at
 * the `warn` level, so this lets a test assert exactly what was surfaced (and that nothing else was) without a real logger.
 */
function createCapturingLog(): { log: EspHomeLogging; warns: CapturedWarn[] } {

  const warns: CapturedWarn[] = [];

  const log: EspHomeLogging = {

    debug: (): void => { /* no-op: the receiver does not log at debug. */ },
    error: (): void => { /* no-op: the receiver does not log at error. */ },
    info: (): void => { /* no-op: the receiver does not log at info. */ },
    warn: (message: string, context?: unknown): void => { warns.push({ context, message }); }
  };

  return { log, warns };
}

// The size of a same-type burst, chosen far past the setup buffer's per-type mark so a capped type is certain to lose entries to that mark.
const SAME_TYPE_BURST_SIZE = 40;

describe("MessageReceiver.waitFor", () => {

  test("resolves with the next inbound message of the requested type", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    transport.pushInbound(42, Buffer.from([0xde]));

    const message = await promise;

    assert.equal(message.type, 42);
    assert.deepEqual(message.payload, Buffer.from([0xde]));
  });

  test("ignores other inbound messages while waiting", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    // Push an unrelated message - it must NOT resolve the awaiter.
    transport.pushInbound(7, Buffer.from([0x77]));

    // Now push the matching message.
    transport.pushInbound(42, Buffer.from([0xee]));

    const message = await promise;

    assert.equal(message.type, 42);
  });

  test("resolves with whichever of the listed types arrives first", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([ 1, 2, 3 ]);

    transport.pushInbound(2, Buffer.from([0xab]));

    const message = await promise;

    assert.equal(message.type, 2);
  });

  test("rejects with a string reason as it is when the abort signal fires", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const controller = new AbortController();
    const promise = receiver.waitFor([42], { signal: controller.signal });

    controller.abort("wait-cancelled");

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason);
  });

  test("rejects when the receiver is disposed before any message arrives", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    receiver[Symbol.dispose]();

    await assert.rejects(promise, { code: "RECEIVER_DISPOSED", constructor: ConnectionClosedByPeerError });
  });

  test("buffers messages of the requested type that arrive before waitFor is called", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    // Establish the pump.
    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    transport.pushInbound(42, Buffer.from([0x11]));

    // Yield so the pump processes the inbound message.
    await new Promise((resolve) => setImmediate(resolve));

    // Now register the awaiter - the buffered message should resolve it.
    const message = await receiver.waitFor([42]);

    assert.equal(message.type, 42);
    assert.deepEqual(message.payload, Buffer.from([0x11]));
  });

  test("returns the earliest-arrived buffered message among the wanted types, whatever order the types are listed in", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    // Type 7 arrives before type 42, and the wanted list names 42 first, so a scan in wanted order would hand back 42 ahead of the message that arrived before it.
    transport.pushInbound(7, Buffer.from([0x01]));
    transport.pushInbound(42, Buffer.from([0x02]));

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal((await receiver.waitFor([ 42, 7 ])).type, 7, "the earlier arrival must return first");
    assert.equal((await receiver.waitFor([ 42, 7 ])).type, 42);
  });
});

describe("MessageReceiver.onInterleave", () => {

  test("invokes the handler synchronously when a matching message arrives", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const received: number[] = [];

    receiver.onInterleave(7, (msg) => { received.push(msg.type); });

    transport.pushInbound(7, Buffer.from([0x07]));

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(received, [7]);
  });

  test("does not interfere with concurrent waitFor on a different type", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const interleaveCalls: number[] = [];

    receiver.onInterleave(7, () => { interleaveCalls.push(7); });

    const waitPromise = receiver.waitFor([42]);

    transport.pushInbound(7, Buffer.from([0x77]));
    transport.pushInbound(42, Buffer.from([0x42]));

    const result = await waitPromise;

    assert.equal(result.type, 42);
    assert.deepEqual(interleaveCalls, [7], "the interleave handler must fire for the type-7 message");
  });

  test("returns a Disposable that detaches the handler", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const calls: number[] = [];

    const handle = receiver.onInterleave(5, () => { calls.push(5); });

    transport.pushInbound(5, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    handle[Symbol.dispose]();

    transport.pushInbound(5, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 1, "the second message must NOT fire after the handle is disposed");
  });
});

describe("MessageReceiver.startDrain", () => {

  test("routes inbound messages through the drain handler map after fire", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const received: number[] = [];

    receiver.startDrain({

      [42]: (msg): void => { received.push(msg.type); },
      [7]: (msg): void => { received.push(msg.type); }
    }, () => { /* terminal escalation is irrelevant to this routing test */ });

    transport.pushInbound(42, Buffer.alloc(0));
    transport.pushInbound(7, Buffer.alloc(0));

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(received, [ 42, 7 ]);
  });

  test("calls the default handler for unmapped types", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const captured: number[] = [];

    receiver.startDrain({

      default: (msg): void => { captured.push(msg.type); }
    }, () => { /* terminal escalation is irrelevant to this routing test */ });

    transport.pushInbound(99, Buffer.alloc(0));
    transport.pushInbound(101, Buffer.alloc(0));

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(captured, [ 99, 101 ]);
  });

  test("hands buffered setup-phase messages to the drain handlers in arrival order across types", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const received: string[] = [];

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    transport.pushInbound(42, Buffer.from([0]));
    transport.pushInbound(7, Buffer.from([1]));
    transport.pushInbound(42, Buffer.from([2]));

    await new Promise((resolve) => setImmediate(resolve));

    receiver.startDrain({

      [42]: (msg): void => { received.push("42:" + String(msg.payload.readUInt8(0))); },
      [7]: (msg): void => { received.push("7:" + String(msg.payload.readUInt8(0))); }
    }, () => { /* terminal escalation is irrelevant to this ordering test */ });

    assert.deepEqual(received, [ "42:0", "7:1", "42:2" ], "the hand-off must replay the buffer in the order the device sent it");
  });

  test("waitFor rejects after startDrain fires", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    receiver.startDrain({}, () => { /* terminal escalation is irrelevant to this waitFor-rejection test */ });

    await assert.rejects(receiver.waitFor([42]), { code: "RECEIVER_DRAINING", constructor: ConnectionClosedByPeerError });
  });

  test("interleave registrations stop firing after startDrain", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const interleaveCalls: number[] = [];
    const drainCalls: number[] = [];

    receiver.onInterleave(7, () => { interleaveCalls.push(1); });

    receiver.startDrain({

      [7]: (): void => { drainCalls.push(7); }
    }, () => { /* terminal escalation is irrelevant to this interleave-teardown test */ });

    transport.pushInbound(7, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(interleaveCalls.length, 0, "interleave must NOT fire after startDrain");
    assert.equal(drainCalls.length, 1, "drain handler must fire");
  });

  test("a run-phase peer death fires onTerminal exactly once with the real typed cause", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const causes: Error[] = [];

    receiver.startDrain({}, (cause) => { causes.push(cause); });

    // Let the pump park on the iterator's next() so the fault rejects the parked awaiter rather than being queued.
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate a passive transport death: the iterator rejects with a typed cause (peer RST/FIN, mid-session decrypt failure, oversized frame).
    const peerDeath = new ConnectionClosedByPeerError("Synthetic peer death.", "TRANSPORT_CLOSED");

    transport.fail(peerDeath);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(causes.length, 1, "onTerminal must fire exactly once on a run-phase peer death");
    assert.equal(causes[0], peerDeath, "onTerminal must receive the real typed cause the iterator rejected with");
  });

  test("a host-initiated dispose during the run phase does NOT fire onTerminal, and onTerminal is single-fire", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const disposeCauses: Error[] = [];

    receiver.startDrain({}, (cause) => { disposeCauses.push(cause); });

    await new Promise((resolve) => setImmediate(resolve));

    // Host-initiated teardown disposes the receiver BEFORE the transport. Disposing the receiver sets `disposed`, so the subsequent clean iterator end is suppressed by
    // the disposed guard in settleTerminal - only a peer death (where `disposed === false`) escalates.
    receiver[Symbol.dispose]();
    transport[Symbol.dispose]();

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(disposeCauses.length, 0, "a host-initiated dispose during the run phase must NOT fire onTerminal");

    // Single-fire: a peer death followed by a transport close (two terminal triggers) must drive onTerminal exactly once.
    const singleFireTransport = new MockTransport();
    const singleFireReceiver = new MessageReceiver(singleFireTransport);
    const singleFireCauses: Error[] = [];

    singleFireReceiver.startDrain({}, (cause) => { singleFireCauses.push(cause); });

    await new Promise((resolve) => setImmediate(resolve));

    singleFireTransport.fail(new ConnectionClosedByPeerError("First terminal trigger.", "TRANSPORT_CLOSED"));

    await new Promise((resolve) => setImmediate(resolve));

    // The transport is already terminated; a second close is a no-op for the pump, and the terminalFired guard would suppress any further escalation regardless.
    singleFireTransport[Symbol.dispose]();

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(singleFireCauses.length, 1, "onTerminal must fire exactly once across two terminal triggers");
  });

  // A device's disconnect request during setup is refused by its interleave handler, and the refusal is stored. When no setup wait is parked and the next wanted frame
  // is already buffered, a late waitFor takes that frame and never reads the refusal, so the hand-off is the last place it can surface.
  test("startDrain throws the stored interleave refusal when a wanted frame was buffered behind it, and installs no handlers", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const refusal = new Error("The device asked to disconnect during setup.");
    const drained: number[] = [];
    const causes: Error[] = [];

    receiver.onInterleave(MessageType.DISCONNECT_REQUEST, () => { throw refusal; });

    transport.pushInbound(MessageType.DISCONNECT_REQUEST, Buffer.alloc(0));
    transport.pushInbound(42, Buffer.from([1]));
    await transport.whenIdle();

    assert.throws(() => receiver.startDrain({ default: (msg): void => { drained.push(msg.type); } }, (cause) => { causes.push(cause); }),
      (err: unknown): boolean => err === refusal);

    // Nothing was installed: a later frame is not handed to the drain handlers, and a later fault reaches no terminal callback.
    transport.pushInbound(42, Buffer.from([2]));
    await transport.whenIdle();
    transport.fail(new ConnectionClosedByPeerError("Synthetic peer death after the refused hand-off.", "PEER_CLOSED"));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(drained, [], "the refused hand-off must hand no frame to the drain handlers, the buffered one included");
    assert.deepEqual(causes, [], "the refused hand-off must install no terminal callback");
  });

  test("startDrain throws the stored transport fault from before the hand-off", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const fault = new ConnectionClosedByPeerError("Synthetic setup-phase peer death.", "PEER_CLOSED");
    const causes: Error[] = [];

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    await new Promise((resolve) => setImmediate(resolve));

    transport.fail(fault);
    await new Promise((resolve) => setImmediate(resolve));

    assert.throws(() => receiver.startDrain({}, (cause) => { causes.push(cause); }), (err: unknown): boolean => err === fault);
    assert.deepEqual(causes, [], "a fault before the hand-off is thrown, never escalated through the terminal callback");
  });

  test("startDrain throws the stored clean end from before the hand-off as TRANSPORT_CLOSED", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    await new Promise((resolve) => setImmediate(resolve));

    transport[Symbol.dispose]();
    await new Promise((resolve) => setImmediate(resolve));

    assert.throws(() => receiver.startDrain({}, () => { /* the hand-off throws before installing this */ }),
      { code: "TRANSPORT_CLOSED", constructor: ConnectionClosedByPeerError });
  });

  test("startDrain throws the stored failure at the hand-off only: a second call after a run-phase fault returns without a throw", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const fault = new ConnectionClosedByPeerError("Synthetic run-phase peer death.", "PEER_CLOSED");
    const causes: Error[] = [];

    receiver.startDrain({}, (cause) => { causes.push(cause); });
    await new Promise((resolve) => setImmediate(resolve));

    transport.fail(fault);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(causes, [fault], "the run-phase fault escalates through the terminal callback");
    assert.doesNotThrow(() => receiver.startDrain({}, () => { /* a repeat call installs nothing */ }), "a repeat call after the hand-off is a no-op");
  });
});

describe("MessageReceiver.dispose", () => {

  test("Symbol.dispose tears down active awaiters", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    receiver[Symbol.dispose]();

    await assert.rejects(promise, { code: "RECEIVER_DISPOSED", constructor: ConnectionClosedByPeerError });
  });

  test("Symbol.asyncDispose tears down active awaiters", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    await receiver[Symbol.asyncDispose]();
    await assert.rejects(promise, { code: "RECEIVER_DISPOSED", constructor: ConnectionClosedByPeerError });
  });

  test("dispose is safe to call more than once", () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    receiver[Symbol.dispose]();

    assert.doesNotThrow(() => receiver[Symbol.dispose]());
  });
});

describe("MessageReceiver edge cases", () => {

  test("waitFor with a pre-aborted signal rejects immediately", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(receiver.waitFor([42], { signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason,
      "pre-aborted signal must reject the awaiter");
  });

  test("transport iterator error propagates to pending awaiters", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([42]);

    transport.fail(new Error("simulated transport failure"));

    await assert.rejects(promise, /simulated transport failure/);
  });

  // The signal bounds the wait so a receiver that kept no record of the clean end fails this row on its assertion, with the signal's TimeoutError, rather than hanging.
  test("a waitFor after the transport's stream ended cleanly rejects at once with TRANSPORT_CLOSED", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    await new Promise((resolve) => setImmediate(resolve));

    transport[Symbol.dispose]();
    await new Promise((resolve) => setImmediate(resolve));

    await assert.rejects(receiver.waitFor([42], { signal: AbortSignal.timeout(1000) }), { code: "TRANSPORT_CLOSED", constructor: ConnectionClosedByPeerError });
  });

  test("multiple parallel awaiters on different types resolve independently", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const a = receiver.waitFor([1]);
    const b = receiver.waitFor([2]);

    transport.pushInbound(2, Buffer.from([0xbb]));

    const second = await b;

    assert.equal(second.type, 2);

    transport.pushInbound(1, Buffer.from([0xaa]));

    const first = await a;

    assert.equal(first.type, 1);
  });

  test("waitFor accepting any of N types resolves on whichever arrives first", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const promise = receiver.waitFor([ 100, 200, 300 ]);

    transport.pushInbound(200, Buffer.alloc(0));

    const message = await promise;

    assert.equal(message.type, 200);
  });

  test("interleave registrations are NOT called from the run-phase drain", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const interleaveSeen: number[] = [];
    const drainSeen: number[] = [];

    receiver.onInterleave(7, (msg) => { interleaveSeen.push(msg.type); });
    receiver.startDrain({ default: (msg): void => { drainSeen.push(msg.type); } }, () => { /* terminal escalation is irrelevant to this interleave-isolation test */ });

    transport.pushInbound(7, Buffer.alloc(0));
    transport.pushInbound(99, Buffer.alloc(0));

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(interleaveSeen.length, 0, "after startDrain, interleave handlers must not fire");
    assert.deepEqual(drainSeen.sort(), [ 7, 99 ], "drain catches every inbound message");
  });

  test("an interleave handler can be detached during run-phase drain without effect on dispatched messages", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const seen: number[] = [];

    const handle = receiver.onInterleave(5, () => { seen.push(5); });

    receiver.startDrain({ [5]: (): void => { /* drain ate it */ } }, () => { /* terminal escalation is irrelevant to this interleave-detach test */ });

    handle[Symbol.dispose]();

    transport.pushInbound(5, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(seen.length, 0, "interleave handler doesn't fire post-drain even before its own dispose");
  });

  test("a throwing interleave handler is fatal: it rejects pending waitFors and stores a sticky pumpError", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const boom = new Error("interleave decided the connection cannot proceed");

    // A throw from an interleave handler is the setup-phase analogue of a DISCONNECT_REQUEST mid-handshake (the fatal-interleave path in dispatch()): dispatch
    // catches it, stores it as pumpError, and failPending rejects every pending awaiter - the deliberate opposite of the run-phase drain handler's log-and-continue
    // policy. We hold a waitFor on a DIFFERENT type so we can observe the fatal failPending, then confirm a LATE waitFor sees the same sticky pumpError synchronously
    // (the sticky pumpError early-throw in waitFor()).
    receiver.onInterleave(7, () => { throw boom; });

    const pending = receiver.waitFor([42]);

    transport.pushInbound(7, Buffer.alloc(0));

    await assert.rejects(pending, (err) => {

      assert.equal(err, boom);

      return true;
    }, "the interleave throw must reject the pending waitFor with the thrown error");

    await assert.rejects(receiver.waitFor([1]), (err) => {

      assert.equal(err, boom);

      return true;
    }, "a late waitFor must see the stored pumpError synchronously");
  });

  test("waitFor with an empty types array throws TypeError (the empty-input boundary)", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    await assert.rejects(receiver.waitFor([]), TypeError, "an empty types array is a programming error and must reject with TypeError");
  });
});

describe("MessageReceiver diagnostics logger", () => {

  test("a run-phase handler throw is logged and the connection is NOT torn down; the pump continues", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log });

    // onTerminal is the teardown escalation. A handler throw must NOT route here - if it flips, the policy regressed from log-and-continue to teardown.
    let terminalFired = false;
    const subsequentSeen: number[] = [];

    receiver.startDrain({

      // Type 42's handler throws on every frame of that type. Type 7's handler is well-behaved; it proves the pump kept dispatching after the throw.
      [42]: (): void => { throw new Error("consumer listener bug"); },
      [7]: (msg): void => { subsequentSeen.push(msg.type); }
    }, () => { terminalFired = true; });

    // Drive the throwing frame through the pump first, then a well-behaved frame of a different mapped type.
    transport.pushInbound(42, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    transport.pushInbound(7, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    // (a) Exactly one warn, and it names the handler-throw condition.
    assert.equal(warns.length, 1, "the handler throw must produce exactly one warn");

    const handlerThrowWarn = warns[0];

    assert.ok(handlerThrowWarn, "the handler throw must produce a captured warn");
    assert.match(handlerThrowWarn.message, /handler threw/, "the warn message must describe the handler throw");

    // (b) The connection was kept alive - the terminal escalation did NOT fire.
    assert.equal(terminalFired, false, "a handler throw must NOT tear the connection down");

    // (c) A subsequent frame of a different, non-throwing mapped type still dispatched - proof the pump continued past the throw.
    assert.deepEqual(subsequentSeen, [7], "the pump must keep dispatching after a handler throw");
  });

  test("a setup-phase buffer-overflow drop emits a warn naming the high-water mark", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log });

    // Prime the pump in setup phase without awaiting type 42, mirroring the buffered-message test above: an interleave registration on an unrelated type starts the pump
    // so the type-42 frames have nowhere to go but the per-type buffer.
    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    // MAX_BUFFERED_PER_TYPE is 8; push 9 frames of an un-awaited type so the 9th overflows the buffer and triggers the drop-and-warn.
    for(let i = 0; i < 9; i++) {

      transport.pushInbound(42, Buffer.from([i]));
    }

    // Yield so the pump drains the queue, dispatching all nine frames into the per-type buffer in order.
    await new Promise((resolve) => setImmediate(resolve));

    const overflowWarn = warns.find((w) => w.message.includes("high-water mark"));

    assert.ok(overflowWarn, "the buffer-overflow drop must emit a warn naming the high-water mark");
  });

  test("a per-type overflow drops that type's oldest entry and leaves an earlier entry of another type in place", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log });

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    // The lone type-7 frame is the oldest entry in the whole buffer, so only a drop that picks the overflowing type's oldest entry leaves it in place.
    transport.pushInbound(7, Buffer.from([0xaa]));

    for(let i = 0; i < 9; i++) {

      transport.pushInbound(42, Buffer.from([i]));
    }

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(warns.length, 1, "the ninth type-42 frame must trip exactly one drop");
    assert.deepEqual((await receiver.waitFor([7], { signal: AbortSignal.timeout(500) })).payload, Buffer.from([0xaa]), "the type-7 entry must survive");

    // Type 42 lost only its oldest frame (payload 0); the other eight remain in arrival order.
    for(let i = 1; i < 9; i++) {

      assert.equal((await receiver.waitFor([42], { signal: AbortSignal.timeout(500) })).payload.readUInt8(0), i);
    }
  });

  test("a per-type buffer filled to exactly the high-water mark neither drops nor warns (the boundary below overflow)", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log });

    // MAX_BUFFERED_PER_TYPE is 8 (module-private). The overflow test above pushes 9 to trip the drop-and-warn; this pushes EXACTLY 8 - one below the threshold - so the
    // buffer fills to its high-water mark with nothing dropped. Prime the pump with an interleave registration on an unrelated type so the type-42 frames have nowhere to
    // go but the per-type buffer (mirrors the overflow test's setup).
    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    for(let i = 0; i < 8; i++) {

      transport.pushInbound(42, Buffer.from([i]));
    }

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(warns.length, 0, "filling to exactly the high-water mark must not warn or drop");

    // All 8 frames are retained in arrival order: drain them through 8 sequential waitFor calls and confirm each yields the next byte 0..7 with none dropped.
    for(let i = 0; i < 8; i++) {

      const message = await receiver.waitFor([42]);

      assert.equal(message.payload.readUInt8(0), i, "buffered frames must be retained in arrival order with none dropped");
    }
  });
});

describe("MessageReceiver uncapped message types", () => {

  // Push a same-type burst whose payloads carry each frame's arrival index.
  const pushBurst = (transport: MockTransport, type: number): void => {

    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      transport.pushInbound(type, Buffer.from([i]));
    }
  };

  // The drop warning reports the mark in its context object, so a row reads the mark there and asserts the extent of a drop without restating the mark's value.
  const reportedMark = (warns: readonly CapturedWarn[]): number => {

    const mark = (warns[0]?.context as { highWaterMark?: unknown } | undefined)?.highWaterMark;

    assert.ok(typeof mark === "number", "a drop must have been warned with the mark in its context");

    return mark;
  };

  // Assert that a capped type's burst lost exactly its oldest frames to the mark: one warning per dropped frame, each naming the type and the mark, and the newest
  // frames left for waitFor in arrival order.
  const assertOldestDropped = async (receiver: MessageReceiver, warns: readonly CapturedWarn[], type: number): Promise<void> => {

    const mark = reportedMark(warns);

    assert.equal(warns.length, SAME_TYPE_BURST_SIZE - mark, "each frame past the mark must drop one entry and warn once");

    for(const warn of warns) {

      assert.match(warn.message, /high-water mark/, "each drop must warn naming the high-water mark");
      assert.deepEqual(warn.context, { highWaterMark: mark, messageType: type }, "each drop warning must carry the mark and the capped type");
    }

    for(let i = SAME_TYPE_BURST_SIZE - mark; i < SAME_TYPE_BURST_SIZE; i++) {

      assert.equal((await receiver.waitFor([type], { signal: AbortSignal.timeout(500) })).payload.readUInt8(0), i, "the newest frames must survive in arrival order");
    }
  };

  test("an uncapped type buffered far past the per-type mark keeps every frame in arrival order and logs no warning", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log, uncappedMessageTypes: new Set([MessageType.LIST_ENTITIES_SENSOR_RESPONSE]) });

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    pushBurst(transport, MessageType.LIST_ENTITIES_SENSOR_RESPONSE);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(warns.length, 0, "an uncapped type must never trip the drop warning");

    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      assert.equal((await receiver.waitFor([MessageType.LIST_ENTITIES_SENSOR_RESPONSE], { signal: AbortSignal.timeout(500) })).payload.readUInt8(0), i,
        "every frame of an uncapped type must return to waitFor in arrival order");
    }
  });

  test("a capped type still drops its oldest past the mark, with the warning, on a receiver that holds uncapped types", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log, uncappedMessageTypes: new Set([MessageType.LIST_ENTITIES_SENSOR_RESPONSE]) });

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    // The uncapped and capped bursts interleave frame by frame, so only a decision made per type spares the one and caps the other.
    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      transport.pushInbound(MessageType.LIST_ENTITIES_SENSOR_RESPONSE, Buffer.from([i]));
      transport.pushInbound(MessageType.SENSOR_STATE_RESPONSE, Buffer.from([i]));
    }

    await new Promise((resolve) => setImmediate(resolve));

    await assertOldestDropped(receiver, warns, MessageType.SENSOR_STATE_RESPONSE);

    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      assert.equal((await receiver.waitFor([MessageType.LIST_ENTITIES_SENSOR_RESPONSE], { signal: AbortSignal.timeout(500) })).payload.readUInt8(0), i,
        "the uncapped type beside the capped one must keep every frame in arrival order");
    }
  });

  test("a receiver constructed without uncapped types drops a list-entities burst's oldest past the mark, with the warning", async () => {

    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log });

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    pushBurst(transport, MessageType.LIST_ENTITIES_SENSOR_RESPONSE);

    await new Promise((resolve) => setImmediate(resolve));

    await assertOldestDropped(receiver, warns, MessageType.LIST_ENTITIES_SENSOR_RESPONSE);
  });

  test("an uncapped set holding a type no built-in schema uses is honored", async () => {

    // A type id past every message type the protocol defines, so only the set the receiver was given can exempt it.
    const vendorType = Math.max(...Object.values(MessageType)) + 1;
    const transport = new MockTransport();
    const { log, warns } = createCapturingLog();
    const receiver = new MessageReceiver(transport, { log, uncappedMessageTypes: new Set([vendorType]) });

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });
    pushBurst(transport, vendorType);

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(warns.length, 0, "a type the set names must never trip the drop warning");

    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      assert.equal((await receiver.waitFor([vendorType], { signal: AbortSignal.timeout(500) })).payload.readUInt8(0), i,
        "every frame of a type the set names must return to waitFor in arrival order");
    }
  });

  test("the drain hand-off replays uncapped frames in arrival order among frames of other types", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport, { uncappedMessageTypes: new Set([MessageType.LIST_ENTITIES_SENSOR_RESPONSE]) });
    const sent: string[] = [];
    const received: string[] = [];

    // Push one frame and record its label, so the expected replay is the arrival order itself.
    const push = (type: number, index: number): void => {

      transport.pushInbound(type, Buffer.from([index]));
      sent.push(String(type) + ":" + String(index));
    };

    receiver.onInterleave(99, () => { /* noop, just primes the pump */ });

    // One frame of each other type sits before, inside and after the uncapped burst, so no capped type comes near the mark.
    push(MessageType.SENSOR_STATE_RESPONSE, 0);

    for(let i = 0; i < SAME_TYPE_BURST_SIZE; i++) {

      push(MessageType.LIST_ENTITIES_SENSOR_RESPONSE, i);

      if(i === (SAME_TYPE_BURST_SIZE / 2)) {

        push(MessageType.BINARY_SENSOR_STATE_RESPONSE, 0);
      }
    }

    push(MessageType.SWITCH_STATE_RESPONSE, 0);

    await new Promise((resolve) => setImmediate(resolve));

    receiver.startDrain({

      default: (msg): void => { received.push(String(msg.type) + ":" + String(msg.payload.readUInt8(0))); }
    }, () => { /* terminal escalation is irrelevant to this ordering test */ });

    assert.deepEqual(received, sent, "the hand-off must replay uncapped frames among the other types in the order the device sent them");
  });
});

describe("MessageReceiver - hot path", () => {

  test("drains 10,000 run-phase frames through the handler map in arrival order", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const N = 10000;
    let dispatched = 0;
    let firstOutOfOrder = -1;

    // The receiver is hot path #1 (inbound frame dispatch). Each frame carries its own index in a 4-byte payload, so we assert not just the total dispatched count but
    // that arrival order is preserved across the entire burst - the pump must dispatch frames in the exact sequence the transport yielded them.
    receiver.startDrain({

      [42]: (msg): void => {

        if((firstOutOfOrder === -1) && (msg.payload.readUInt32LE(0) !== dispatched)) {

          firstOutOfOrder = dispatched;
        }

        dispatched++;
      }
    }, () => { /* terminal escalation is irrelevant to this throughput test */ });

    for(let i = 0; i < N; i++) {

      const payload = Buffer.alloc(4);

      payload.writeUInt32LE(i, 0);
      transport.pushInbound(42, payload);
    }

    // One macrotask yield drains the entire queued burst: the pump's for-await pulls each queued frame through a microtask chain that completes before this setImmediate.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(dispatched, N, "every run-phase frame must dispatch through the drain handler");
    assert.equal(firstOutOfOrder, -1, "frames must dispatch in arrival order across the entire burst");
  });
});
