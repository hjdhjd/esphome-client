/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-transport.test.ts: Helper-coverage-parity tests for the MockTransport test helper.
 */
import { MockTransport, MockTransportPhase, mockNoiseHandshakeExchange } from "./mock-transport.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";

describe("MockTransport phase transitions", () => {

  test("starts in plaintext phase", () => {

    const t = new MockTransport();

    assert.equal(t.phase, MockTransportPhase.PLAINTEXT);
    assert.equal(t.isEncrypted, false);
  });

  test("enterNoiseHandshake transitions to noise-handshake", () => {

    const t = new MockTransport();

    t.enterNoiseHandshake();

    assert.equal(t.phase, MockTransportPhase.NOISE_HANDSHAKE);
    assert.equal(t.isEncrypted, false, "noise-handshake is not yet encrypted");
  });

  test("installCipher transitions to noise-data and sets isEncrypted", () => {

    const t = new MockTransport();
    const cipher = { receiveCipher: { k: Buffer.alloc(32), n: 0n } as never, sendCipher: { k: Buffer.alloc(32), n: 0n } as never };

    t.installCipher(cipher);

    assert.equal(t.phase, MockTransportPhase.NOISE_DATA);
    assert.equal(t.isEncrypted, true);
    assert.equal(t.cipher, cipher);
  });

});

describe("MockTransport outbound capture", () => {

  test("captures send() calls in order", async () => {

    const t = new MockTransport();

    await t.send(1, Buffer.from([0x01]));
    await t.send(2, Buffer.from([ 0x02, 0x03 ]));

    assert.equal(t.outboundFrames.length, 2);
    assert.equal(t.outboundFrames[0]?.type, 1);
    assert.deepEqual(t.outboundFrames[0]?.payload, Buffer.from([0x01]));
    assert.equal(t.outboundFrames[0]?.encrypted, false, "plaintext phase -> encrypted=false");
    assert.equal(t.outboundFrames[1]?.type, 2);
  });

  test("send() in noise-data phase tags captured frames as encrypted", async () => {

    const t = new MockTransport();

    t.installCipher({ receiveCipher: {} as never, sendCipher: {} as never });
    await t.send(7, Buffer.from([0xff]));

    assert.equal(t.outboundFrames[0]?.encrypted, true);
  });

  test("captures sendNoiseHandshakeFrame separately from send", async () => {

    const t = new MockTransport();

    await t.sendNoiseHandshakeFrame(Buffer.from([0xaa]));

    assert.equal(t.outboundHandshakeFrames.length, 1);
    assert.deepEqual(t.outboundHandshakeFrames[0], Buffer.from([0xaa]));
    assert.equal(t.outboundFrames.length, 0, "handshake frames are not captured in the typed outbound list");
  });
});

describe("MockTransport inbound queueing", () => {

  test("pushInbound enqueues a message that the iterator yields", async () => {

    const t = new MockTransport();

    t.pushInbound(1, Buffer.from([0x42]));

    const it = t[Symbol.asyncIterator]();
    const result = await it.next();

    assert.equal(result.done, false);
    assert.equal(result.value?.type, 1);
    assert.deepEqual(result.value?.payload, Buffer.from([0x42]));
  });

  test("pushFirstByte enqueues a byte that firstByte() resolves with", async () => {

    const t = new MockTransport();

    t.pushFirstByte(0x00);

    assert.equal(await t.firstByte(), 0x00);
  });

  test("pushNoiseHandshakeFrame enqueues a frame that nextNoiseHandshakeFrame resolves with", async () => {

    const t = new MockTransport();

    t.pushNoiseHandshakeFrame(Buffer.from([ 0x01, 0x02 ]));

    assert.deepEqual(await t.nextNoiseHandshakeFrame(), Buffer.from([ 0x01, 0x02 ]));
  });

  test("firstByte parks an awaiter when no byte is queued yet", async () => {

    const t = new MockTransport();
    const promise = t.firstByte();

    setImmediate(() => t.pushFirstByte(0x01));

    assert.equal(await promise, 0x01);
  });

  test("nextNoiseHandshakeFrame parks an awaiter when no frame is queued yet", async () => {

    const t = new MockTransport();
    const promise = t.nextNoiseHandshakeFrame();

    setImmediate(() => t.pushNoiseHandshakeFrame(Buffer.from([0xee])));

    assert.deepEqual(await promise, Buffer.from([0xee]));
  });

  test("iterator parks when no message is queued yet, resolves on push", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    setImmediate(() => t.pushInbound(5, Buffer.from([0x99])));

    const result = await promise;

    assert.equal(result.done, false);
    assert.equal(result.value?.type, 5);
  });
});

describe("MockTransport whenIdle", () => {

  test("resolves once the consumer drains every pushed frame and parks", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const consumed: number[] = [];

    // Background consumer pulls frames until the transport is disposed; it parks whenever the queue is empty.
    const consumer = (async (): Promise<void> => {

      for(;;) {

        const result = await it.next();

        if(result.done) {

          break;
        }

        consumed.push(result.value.type);
      }
    })();

    t.pushInbound(1, Buffer.from([0]));
    t.pushInbound(2, Buffer.from([0]));
    t.pushInbound(3, Buffer.from([0]));

    await t.whenIdle();

    // whenIdle resolved only after the consumer pulled all three frames and parked - deterministic, no timer.
    assert.deepEqual(consumed, [ 1, 2, 3 ]);

    t[Symbol.dispose]();
    await consumer;
  });

  test("resolves immediately when the consumer is already parked on an empty queue", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const pending = it.next();

    await t.whenIdle();

    t.pushInbound(7, Buffer.from([0]));

    const result = await pending;

    assert.equal(result.value?.type, 7);
  });

  test("resolves after disposal (a terminated transport consumes nothing further)", async () => {

    const t = new MockTransport();

    t[Symbol.dispose]();

    await t.whenIdle();
  });
});

describe("MockTransport abort handling", () => {

  test("firstByte rejects when the abort signal fires", async () => {

    const t = new MockTransport();
    const controller = new AbortController();
    const promise = t.firstByte(controller.signal);

    controller.abort();

    await assert.rejects(promise, "abort signal must reject the parked firstByte awaiter");
  });

  test("nextNoiseHandshakeFrame rejects when the abort signal fires", async () => {

    const t = new MockTransport();
    const controller = new AbortController();
    const promise = t.nextNoiseHandshakeFrame(controller.signal);

    controller.abort();

    await assert.rejects(promise);
  });

  test("firstByte called with a pre-aborted signal rejects synchronously", async () => {

    const t = new MockTransport();
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(t.firstByte(controller.signal), { name: "AbortError" });
  });
});

describe("MockTransport.fail (simulating fatal transport error)", () => {

  test("makes pending firstByte awaiters reject with the supplied error", async () => {

    const t = new MockTransport();
    const promise = t.firstByte();

    t.fail(new Error("peer reset"));

    await assert.rejects(promise, /peer reset/);
  });

  test("makes pending iterator awaiters reject with the supplied error", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    t.fail(new Error("transport down"));

    await assert.rejects(promise, /transport down/);
  });

  test("subsequent send() calls reject with the same error", async () => {

    const t = new MockTransport();

    t.fail(new Error("dead"));

    await assert.rejects(t.send(1, Buffer.alloc(0)), /dead/);
    await assert.rejects(t.sendNoiseHandshakeFrame(Buffer.alloc(0)), /dead/);
  });

  test("fail is safe to call more than once - calling twice does not throw", () => {

    const t = new MockTransport();

    t.fail(new Error("first"));

    assert.doesNotThrow(() => t.fail(new Error("second")));
  });
});

describe("MockTransport disposal", () => {

  test("Symbol.dispose terminates pending awaiters cleanly", async () => {

    const t = new MockTransport();
    const it = t[Symbol.asyncIterator]();
    const promise = it.next();

    t[Symbol.dispose]();

    const result = await promise;

    assert.equal(result.done, true, "iterator must end cleanly on dispose");
  });

  test("Symbol.asyncDispose calls Symbol.dispose synchronously", async () => {

    const t = new MockTransport();

    await t[Symbol.asyncDispose]();

    // After async dispose, push should be a no-op.
    t.pushInbound(1, Buffer.alloc(0));

    const it = t[Symbol.asyncIterator]();
    const result = await it.next();

    assert.equal(result.done, true, "after dispose, the iterator yields done immediately");
  });

  test("dispose is safe to call more than once", () => {

    const t = new MockTransport();

    t[Symbol.dispose]();

    assert.doesNotThrow(() => t[Symbol.dispose]());
  });
});

describe("mockNoiseHandshakeExchange factory", () => {

  test("returns the placeholder shape for a valid 32-byte PSK", () => {

    const psk = Buffer.alloc(32, 0x42).toString("base64");
    const result = mockNoiseHandshakeExchange(psk);

    assert.equal(Buffer.isBuffer(result.serverHello), true);
    assert.equal(Buffer.isBuffer(result.serverHandshake), true);
  });

  test("throws on a PSK shorter than 32 bytes", () => {

    const shortPsk = Buffer.alloc(16, 0).toString("base64");

    assert.throws(() => mockNoiseHandshakeExchange(shortPsk), /32-byte/);
  });

  test("throws on a PSK longer than 32 bytes", () => {

    const longPsk = Buffer.alloc(64, 0).toString("base64");

    assert.throws(() => mockNoiseHandshakeExchange(longPsk), /32-byte/);
  });

  test("throws on an empty string", () => {

    assert.throws(() => mockNoiseHandshakeExchange(""), /32-byte/);
  });
});

describe("MockTransportPhase const-object", () => {

  test("declares the three phase values", () => {

    assert.equal(MockTransportPhase.PLAINTEXT, "plaintext");
    assert.equal(MockTransportPhase.NOISE_HANDSHAKE, "noise-handshake");
    assert.equal(MockTransportPhase.NOISE_DATA, "noise-data");
  });

  test("the three values are pairwise distinct", () => {

    assert.equal(new Set(Object.values(MockTransportPhase)).size, 3);
  });
});
