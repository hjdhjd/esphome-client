/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * voice-assistant.class.test.ts: Unit tests for the VoiceAssistantApi class methods (separate from the dispatcher tests in voice-assistant.test.ts).
 */
import { ConnectionError, ConnectionLostError, NotConnectedError } from "./errors.ts";
import { MockTransport, pushHandshake } from "./testing/mock-transport.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { ConnectionScope } from "./connection-scope.ts";
import { EspHomeClient } from "./esphome-client.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { Nullable } from "./types.ts";
import type { TestContext } from "node:test";
import { VoiceAssistantApi } from "./voice-assistant.ts";
import type { VoiceAssistantHost } from "./voice-assistant.ts";
import assert from "node:assert/strict";
import { connectionLostError } from "./connection-scope.ts";
import { decodeProtobuf } from "./protocol/codec.ts";
import { inspect } from "node:util";

interface CapturedFrame {

  payload: Buffer;
  type: number;
}

// The connection lives in a closure, starting attached, so a test aborts it to stand for a teardown, sets it to `null` to stand for no transport, and installs a fresh
// controller for the next connection; a spread copy of the host reads the same controller.
function makeHost(): VoiceAssistantHost & { bus: EventBus<ClientEventsMap>; sent: CapturedFrame[]; setConnection: (controller: Nullable<AbortController>) => void } {

  const bus = new EventBus<ClientEventsMap>();
  const sent: CapturedFrame[] = [];
  let connection: Nullable<AbortController> = new AbortController();

  return {

    bus,
    connectionScope: (): ConnectionScope => ((connection === null) ? { kind: "none" } : { kind: "attached", signal: connection.signal }),
    log: { debug: (): void => { /* */ }, error: (): void => { /* */ }, info: (): void => { /* */ }, warn: (): void => { /* */ } },
    send: (type: number, payload: Buffer): void => { sent.push({ payload, type }); },
    sent,
    setConnection: (controller: Nullable<AbortController>): void => { connection = controller; }
  };
}

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

describe("VoiceAssistantApi.subscribe / unsubscribe / isSubscribed", () => {

  test("isSubscribed is false initially", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    assert.equal(api.isSubscribed(), false);
  });

  test("subscribe sends SUBSCRIBE_VOICE_ASSISTANT_REQUEST and flips the flag", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe();

    assert.equal(host.sent.length, 1);
    assert.equal(host.sent[0]?.type, MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST);
    assert.equal(api.isSubscribed(), true);
  });

  test("subscribe encodes the supplied flags into field 2", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe(7 as never);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 1, "subscribe=1 in field 1");
    assert.equal(fields[2]?.[0], 7, "flags in field 2");
  });

  test("unsubscribe sends a fresh SUBSCRIBE_VOICE_ASSISTANT_REQUEST with subscribe=0 and clears the flag", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe();
    api.unsubscribe();

    assert.equal(api.isSubscribed(), false);
    assert.equal(host.sent.length, 2);

    const fields = decodeProtobuf(host.sent[1]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 0, "subscribe=0 to unsubscribe");
  });
});

describe("VoiceAssistantApi - subscription lifecycle (SubscriptionLifecycle contract)", () => {

  test("subscribe(flags) records the intent and sends SUBSCRIBE with those flag bits; isSubscribed() is true", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe(5 as never);

    assert.equal(api.isSubscribed(), true, "intent recorded -> isSubscribed() true");
    assert.equal(host.sent.length, 1);
    assert.equal(host.sent[0]?.type, MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 1, "subscribe=1 in field 1");
    assert.equal(fields[2]?.[0], 5, "the requested flag bits land in field 2");
  });

  // A reconnect cycle must re-arm the device with the ORIGINALLY-requested flags, and the intent must survive the connection-scoped reset, so isSubscribed() stays
  // true across clearConnectionState and reissueOnReconnect replays the original flags on the fresh transport.
  test("subscribe(flags) -> clearConnectionState() -> reissueOnReconnect() re-sends SUBSCRIBE with the SAME flags and isSubscribed() stays true", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe(6 as never);

    // The connection-scoped reset the host calls at connect-top. It must NOT drop the consumer's subscription intent.
    api.clearConnectionState();

    assert.equal(api.isSubscribed(), true, "subscription intent must survive clearConnectionState across a reconnect");

    // The reissue the host calls at connect-bottom once the fresh transport is up. It must replay the originally-requested flags.
    host.sent.length = 0;
    api.reissueOnReconnect();

    assert.equal(host.sent.length, 1, "reissueOnReconnect re-sends exactly one SUBSCRIBE for the surviving subscription");
    assert.equal(host.sent[0]?.type, MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 1, "subscribe=1 on the replayed frame");
    assert.equal(fields[2]?.[0], 6, "the replayed SUBSCRIBE carries the ORIGINAL flags, not the zero-flag default");
  });

  test("clearConnectionState() clears cachedConfig (a later configuration() re-requests) but preserves the desired intent", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe(2 as never);
    host.bus.emit("voiceAssistantConfiguration", { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 0 });

    assert.notEqual(api.lastConfiguration(), null, "configuration cached before reset");

    api.clearConnectionState();

    assert.equal(api.lastConfiguration(), null, "clearConnectionState clears the cached configuration");
    assert.equal(api.isSubscribed(), true, "clearConnectionState preserves the desired subscription intent");

    // The cache is gone, so a fresh configuration() must issue a wire request rather than resolve synchronously from cache.
    host.sent.length = 0;

    const promise = api.configuration({ timeoutMs: 1000 });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST, "a re-read after reset re-issues the configuration request");

    host.bus.emit("voiceAssistantConfiguration", { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 0 });
    await promise;
  });

  test("unsubscribe() sets desired null (isSubscribed() false) and sends subscribe=0; a following reissueOnReconnect() sends nothing", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.subscribe(3 as never);
    host.sent.length = 0;

    api.unsubscribe();

    assert.equal(api.isSubscribed(), false, "unsubscribe drops the desired intent");
    assert.equal(host.sent.length, 1);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 0, "subscribe=0 to unsubscribe");

    // With no desired intent, the reissue path is a pure no-op - the consumer no longer wants the subscription.
    host.sent.length = 0;
    api.reissueOnReconnect();

    assert.equal(host.sent.length, 0, "reissueOnReconnect after unsubscribe sends nothing");
  });

  test("reissueOnReconnect() with no prior subscribe() is a pure no-op", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.reissueOnReconnect();

    assert.equal(api.isSubscribed(), false);
    assert.equal(host.sent.length, 0, "no subscription desired -> nothing replayed");
  });
});

describe("VoiceAssistantApi.sendAudio", () => {

  test("sends VOICE_ASSISTANT_AUDIO with data and end=false by default", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.sendAudio(Buffer.from([ 0xab, 0xcd ]));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_AUDIO);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });
    const data = fields[1]?.[0];

    assert.equal(Buffer.isBuffer(data) && data.equals(Buffer.from([ 0xab, 0xcd ])), true);
    assert.equal(fields[2]?.[0], 0, "end defaults to false -> 0");
  });

  test("sends end=true when explicitly requested", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.sendAudio(Buffer.from([0x01]), true);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[2]?.[0], 1, "end=true -> 1");
  });
});

describe("VoiceAssistantApi.sendEvent", () => {

  test("sends VOICE_ASSISTANT_EVENT_RESPONSE with the event-type tag", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    // Use any numeric eventType - the helper does not validate against a specific union at runtime.
    api.sendEvent(0);

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_EVENT_RESPONSE);
  });

  test("encodes optional event-data entries as nested messages", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.sendEvent(1, [ { name: "foo", value: "bar" }, { name: "baz", value: "qux" } ]);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[2]?.length, 2, "two repeated nested messages");
  });
});

describe("VoiceAssistantApi.sendTimerEvent", () => {

  test("sends VOICE_ASSISTANT_TIMER_EVENT_RESPONSE with all timer fields", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.sendTimerEvent({

      eventType: 0,
      isActive: true,
      name: "Tea",
      secondsLeft: 60,
      timerId: "t1",
      totalSeconds: 180
    });

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_TIMER_EVENT_RESPONSE);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });
    const timerIdBuf = fields[2]?.[0];
    const nameBuf = fields[3]?.[0];

    assert.equal(Buffer.isBuffer(timerIdBuf) && timerIdBuf.toString("utf8"), "t1");
    assert.equal(Buffer.isBuffer(nameBuf) && nameBuf.toString("utf8"), "Tea");
    assert.equal(fields[4]?.[0], 180);
    assert.equal(fields[5]?.[0], 60);
    assert.equal(fields[6]?.[0], 1, "isActive=true -> 1");
  });
});

describe("VoiceAssistantApi.respondToRequest", () => {

  test("sends VOICE_ASSISTANT_RESPONSE with port=0, error=0 by default (no arguments)", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest();

    assert.equal(host.sent.length, 1);
    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_RESPONSE);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 0, "port defaults to 0");
    assert.equal(fields[2]?.[0], 0, "error defaults to false -> 0");
  });

  test("respondToRequest({}) produces the same default frame as the no-args call", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({});

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 0);
    assert.equal(fields[2]?.[0], 0);
  });

  test("respondToRequest({ port: 12345 }) encodes port and leaves error=false", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ port: 12345 });

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 12345);
    assert.equal(fields[2]?.[0], 0);
  });

  test("respondToRequest({ error: true }) encodes error=1 and leaves port=0", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ error: true });

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 0);
    assert.equal(fields[2]?.[0], 1, "error=true -> 1");
  });

  test("respondToRequest({ port: N, error: true }) encodes both - the method does not enforce semantic constraints", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ error: true, port: 12345 });

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 12345);
    assert.equal(fields[2]?.[0], 1);
  });

  test("respondToRequest({ port: 100000 }) round-trips a port value above 65535 (non-IP / testing range)", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ port: 100000 });

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.[0], 100000, "ports above the IPv4 max round-trip intact");
    assert.equal(fields[2]?.[0], 0);
  });

  test("respondToRequest({ port: 0xFFFFFFFF }) emits the canonical 5-byte uint32-max varint on the wire (encoder boundary check)", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ port: 0xFFFFFFFF });

    // We inspect the wire bytes directly rather than round-tripping through `decodeProtobuf`, because the codec's `readVarint` accumulates into a signed 32-bit slot
    // and surfaces 0xFFFFFFFF as -1; that is the decoder's edge case, not an encoder bug. The contract under test here is that the encoder emits the canonical
    // five-byte varint encoding of `uint32::MAX` without silently truncating or rejecting.
    const payload = host.sent[0]?.payload ?? Buffer.alloc(0);

    // Tag for field 1 (varint): (1 << 3) | 0 = 0x08. Then 0xFFFFFFFF as varint: 0xff 0xff 0xff 0xff 0x0f (five bytes, MSB continuation for the first four).
    // Tag for field 2 (varint): (2 << 3) | 0 = 0x10. Value 0 as varint: 0x00. Total: 1 + 5 + 1 + 1 = 8 bytes.
    assert.deepEqual([...payload], [ 0x08, 0xff, 0xff, 0xff, 0xff, 0x0f, 0x10, 0x00 ]);
  });

  test("respondToRequest({ error: false }) and an explicit { port: 0 } both produce the default frame", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.respondToRequest({ error: false });
    api.respondToRequest({ port: 0 });

    assert.equal(host.sent.length, 2);

    for(const frame of host.sent) {

      const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 100 });

      assert.equal(fields[1]?.[0], 0);
      assert.equal(fields[2]?.[0], 0);
    }
  });

  test("respondToRequest works without a prior subscribe() - encodes-and-sends regardless of subscription state", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    assert.equal(api.isSubscribed(), false);
    assert.doesNotThrow(() => api.respondToRequest());

    assert.equal(host.sent.length, 1);
    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_RESPONSE);
  });

  test("respondToRequest returns void (fire-and-forget; no correlation response on the wire)", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    const result = api.respondToRequest();

    assert.equal(result, undefined);
  });
});

describe("VoiceAssistantApi.setActiveWakeWords", () => {

  test("sends VOICE_ASSISTANT_SET_CONFIGURATION with one entry per id", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.setActiveWakeWords([ "ok-jarvis", "alexa-clone" ]);

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_SET_CONFIGURATION);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });

    assert.equal(fields[1]?.length, 2);
  });

  test("sends an empty payload when ids is empty (clears all active wake words)", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    api.setActiveWakeWords([]);

    assert.equal(host.sent[0]?.payload.length, 0, "empty ids list produces an empty body");
  });
});

describe("VoiceAssistantApi.announce", () => {

  test("sends VOICE_ASSISTANT_ANNOUNCE_REQUEST and resolves on the matching finished event", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    const announcePromise = api.announce({ mediaId: "alert.mp3" }, { timeoutMs: 1000 });

    // Yield so the announce claims its pending slot before we emit.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_ANNOUNCE_REQUEST);

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    const result = await announcePromise;

    assert.equal(result, true);
  });

  test("includes preannounceMediaId, startConversation, and conversationId on the wire when supplied", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    const announcePromise = api.announce(
      { conversationId: "conv-7", mediaId: "alert.mp3", preannounceMediaId: "ding.mp3", startConversation: true }, { timeoutMs: 1000 });

    // Yield so the announce claims its slot and sends before we inspect the captured frame.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_ANNOUNCE_REQUEST);

    const fields = decodeProtobuf(host.sent[0]?.payload ?? Buffer.alloc(0), { maxFieldsPerMessage: 100 });
    const mediaIdBuf = fields[1]?.[0];
    const preannounceBuf = fields[3]?.[0];
    const conversationIdBuf = fields[5]?.[0];

    assert.equal(Buffer.isBuffer(mediaIdBuf) && mediaIdBuf.toString("utf8"), "alert.mp3", "field 1 carries the mediaId");
    assert.equal(Buffer.isBuffer(preannounceBuf) && preannounceBuf.toString("utf8"), "ding.mp3", "field 3 carries the preannounceMediaId");
    assert.equal(fields[4]?.[0], 1, "field 4 carries startConversation=true -> 1");
    assert.equal(Buffer.isBuffer(conversationIdBuf) && conversationIdBuf.toString("utf8"), "conv-7", "field 5 carries the conversationId");

    // Resolve the outstanding announce so the test does not leak an open handle.
    host.bus.emit("voiceAssistantAnnounceFinished", true);
    await announcePromise;
  });

  test("rejects when timeout fires before the finished event arrives", async (t) => {

    const captured = captureTimeoutSignals(t);
    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const start = performance.now();
    const promise = api.announce({ text: "hi" }, { timeoutMs: 10 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the announcement's wait must build its timeout through AbortSignal.timeout");

    await assert.rejects(promise, (err: unknown): boolean => err === timeoutSignal.reason);

    // The identity holds for a timeout of any duration, so this bound is what ties the rejection to the timeout the call asked for.
    assert.ok((performance.now() - start) < 500, "the requested timeout, not a slower one, must end the wait");
  });

  test("rejects with the caller's reason when the caller-supplied signal aborts before the finished event", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    // A long timeout ensures the rejection comes from the caller's signal, not from the timeout source.
    const promise = api.announce({ text: "hi" }, { signal: controller.signal, timeoutMs: 10000 });

    controller.abort();

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason, "the caller's aborted signal rejects the announce");
  });

  test("a second overlapping announce throws ANNOUNCE_IN_FLIGHT and the first resolves with its own reply", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const first = api.announce({ text: "first" }, { timeoutMs: 1000 });

    await assert.rejects(api.announce({ text: "second" }, { timeoutMs: 1000 }), { code: "ANNOUNCE_IN_FLIGHT", constructor: ConnectionError });

    assert.equal(host.sent.length, 1, "the refused announce sends no request");

    // A false reply shows the first call resolves with the value its reply carried rather than a fixed success flag.
    host.bus.emit("voiceAssistantAnnounceFinished", false);

    assert.equal(await first, false, "the first announce resolves with the reply to its own request");
  });

  test("an announce after a timed-out announce is admitted and resolves", async (t) => {

    const captured = captureTimeoutSignals(t);
    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const timedOut = api.announce({ text: "first" }, { timeoutMs: 10 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the announcement's wait must build its timeout through AbortSignal.timeout");

    await assert.rejects(timedOut, (err: unknown): boolean => err === timeoutSignal.reason);

    const next = api.announce({ text: "second" }, { timeoutMs: 1000 });

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    assert.equal(await next, true, "the timeout releases the slot for the next announce");
    assert.equal(host.sent.length, 2, "each announce sends its own request");
  });

  test("the connection's abort rejects a pending announce with the connection-lost error, and the next connection admits a new announce", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const connection = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // A long timeout ensures the rejection comes from the connection's abort, not the timeout source.
    const pending = api.announce({ text: "hi" }, { timeoutMs: 10000 });

    connection.abort(lost);

    await assert.rejects(pending, (err: unknown): boolean => err === lost);

    // The abort releases the slot, so an announce on the next connection is admitted.
    host.setConnection(new AbortController());

    const next = api.announce({ text: "again" }, { timeoutMs: 1000 });

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    assert.equal(await next, true);
  });

  test("a timeout rejects with the timeout signal's own TimeoutError, unwrapped", async (t) => {

    const captured = captureTimeoutSignals(t);
    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const start = performance.now();
    const promise = api.announce({ text: "hi" }, { timeoutMs: 10 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the announcement's wait must build its timeout through AbortSignal.timeout");

    await assert.rejects(promise, (err: unknown): boolean => err === timeoutSignal.reason);

    assert.equal((timeoutSignal.reason as DOMException).name, "TimeoutError", "the reason is the platform's own TimeoutError");

    // The identity holds for a timeout of any duration, so this bound is what ties the rejection to the timeout the call asked for.
    assert.ok((performance.now() - start) < 500, "the requested timeout, not a slower one, must end the wait");
  });

  test("a caller abort with a custom reason rejects with that reason itself", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller gave up on the announcement.");

    // A long timeout ensures the rejection comes from the caller's signal, not the timeout source.
    const promise = api.announce({ text: "hi" }, { signal: controller.signal, timeoutMs: 10000 });

    controller.abort(reason);

    await assert.rejects(promise, (err: unknown): boolean => err === reason);
  });

  test("a reply delivered synchronously inside the send resolves the announce", async () => {

    const host = makeHost();

    // The reply reaches the bus before send returns, so it only settles the call when the pending slot was claimed ahead of the send.
    const api = new VoiceAssistantApi({

      ...host,
      send: (type: number, payload: Buffer): void => {

        host.send(type, payload);
        host.bus.emit("voiceAssistantAnnounceFinished", true);
      }
    });

    assert.equal(await api.announce({ text: "hi" }, { timeoutMs: 1000 }), true);
  });

  test("a late reply after a timed-out announce is logged at debug and still reaches bus consumers once", async (t) => {

    const captured = captureTimeoutSignals(t);
    const host = makeHost();
    const debugLines: string[] = [];
    const api = new VoiceAssistantApi({ ...host, log: { ...host.log, debug: (message: string): void => { debugLines.push(message); } } });
    let delivered = 0;

    host.bus.on("voiceAssistantAnnounceFinished", (): void => { delivered++; });

    const timedOut = api.announce({ text: "hi" }, { timeoutMs: 10 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the announcement's wait must build its timeout through AbortSignal.timeout");

    await assert.rejects(timedOut, (err: unknown): boolean => err === timeoutSignal.reason);

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    assert.equal(delivered, 1, "the late reply reaches bus consumers exactly once");
    assert.equal(debugLines.length, 1, "the late reply is noted once at debug");
    assert.match(debugLines[0] ?? "", /no announcement in flight/);
  });

  test("an announce whose caller signal is already aborted rejects with that reason and sends nothing", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller cancelled before the announcement was issued.");

    controller.abort(reason);

    await assert.rejects(api.announce({ text: "hi" }, { signal: controller.signal, timeoutMs: 1000 }), (err: unknown): boolean => err === reason);

    assert.equal(host.sent.length, 0, "a pre-aborted announce puts nothing on the wire");
  });

  test("a pre-aborted announce rejects as cancelled rather than in flight while another announcement is pending", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const first = api.announce({ text: "first" }, { timeoutMs: 1000 });
    const controller = new AbortController();

    controller.abort();

    await assert.rejects(api.announce({ text: "second" }, { signal: controller.signal, timeoutMs: 1000 }), (err: unknown): boolean => err === controller.signal.reason);

    assert.equal(host.sent.length, 1, "only the pending announcement reached the wire");

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    assert.equal(await first, true, "the pending announcement still settles on its own reply");
  });

  test("the connection's abort reaches the caller as issued rather than rewrapped as a timeout or caller abort", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const connection = new AbortController();
    const caller = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // A long timeout and a caller signal that never aborts keep every other source quiet, so only the connection's abort can settle the call.
    const pending = api.announce({ text: "hi" }, { signal: caller.signal, timeoutMs: 10000 });

    connection.abort(lost);

    await assert.rejects(pending, (err: unknown): boolean => err === lost);
  });

  test("with no connection an announce rejects NOT_CONNECTED, claims no slot, and sends nothing, after the already-aborted check", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller cancelled before the announcement was issued.");

    host.setConnection(null);

    await assert.rejects(api.announce({ text: "hi" }, { timeoutMs: 1000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });

    // A signal the caller already aborted is honored first, so the caller's own reason comes back rather than the refusal.
    controller.abort(reason);

    await assert.rejects(api.announce({ text: "hi" }, { signal: controller.signal, timeoutMs: 1000 }), (err: unknown): boolean => err === reason);

    assert.equal(host.sent.length, 0, "a refused announce puts nothing on the wire");

    // The refusal claimed no slot, so an announce on the next connection is admitted rather than refused as in flight, and it sends.
    host.setConnection(new AbortController());

    const next = api.announce({ text: "again" }, { timeoutMs: 1000 });

    assert.equal(host.sent.length, 1, "the admitted announce sends its request");

    host.bus.emit("voiceAssistantAnnounceFinished", true);

    assert.equal(await next, true);
  });
});

describe("VoiceAssistantApi.configuration", () => {

  test("returns the cached config without re-issuing a request when not refreshed", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const config = { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 4 };

    host.bus.emit("voiceAssistantConfiguration", config);

    const result = await api.configuration();

    assert.deepEqual(result, config);
    assert.equal(host.sent.length, 0, "cached path must not send a wire request");
  });

  test("refreshes when refresh: true even if cached", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const cached = { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 4 };

    host.bus.emit("voiceAssistantConfiguration", cached);

    const promise = api.configuration({ refresh: true, timeoutMs: 1000 });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST);

    const fresh = { activeWakeWords: ["alexa"], availableWakeWords: [], maxActiveWakeWords: 4 };

    host.bus.emit("voiceAssistantConfiguration", fresh);

    assert.deepEqual(await promise, fresh);
  });

  test("issues a wire request when no cached config exists yet", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const promise = api.configuration({ timeoutMs: 1000 });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST);

    host.bus.emit("voiceAssistantConfiguration", { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 0 });

    await promise;
  });

  test("rejects with the caller's reason when the caller-supplied signal aborts the wire-request path", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    // No cache is seeded, so configuration() takes the wire-request path. A long timeout ensures the rejection comes from the caller's signal, not the timeout source.
    const promise = api.configuration({ signal: controller.signal, timeoutMs: 10000 });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST, "the wire-request path issues a configuration request before awaiting");

    controller.abort();

    await assert.rejects(promise, (err: unknown): boolean => err === controller.signal.reason, "the caller's aborted signal rejects the configuration read");
  });

  test("a timeout rejects with the timeout signal's own TimeoutError, unwrapped", async (t) => {

    const captured = captureTimeoutSignals(t);
    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const start = performance.now();
    const promise = api.configuration({ timeoutMs: 10 });
    const timeoutSignal = captured.at(-1);

    assert.ok(timeoutSignal, "the configuration read's wait must build its timeout through AbortSignal.timeout");

    await assert.rejects(promise, (err: unknown): boolean => err === timeoutSignal.reason);

    assert.equal((timeoutSignal.reason as DOMException).name, "TimeoutError", "the reason is the platform's own TimeoutError");

    // The identity holds for a timeout of any duration, so this bound is what ties the rejection to the timeout the call asked for.
    assert.ok((performance.now() - start) < 500, "the requested timeout, not a slower one, must end the wait");
  });

  test("a caller abort with a custom reason rejects with that reason itself", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller gave up on the configuration read.");

    // A long timeout ensures the rejection comes from the caller's signal, not the timeout source.
    const promise = api.configuration({ signal: controller.signal, timeoutMs: 10000 });

    controller.abort(reason);

    await assert.rejects(promise, (err: unknown): boolean => err === reason);
  });

  test("a caller abort mid-flight with a string reason rejects with that string", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    // A long timeout ensures the rejection comes from the caller's signal, not the timeout source.
    const promise = api.configuration({ signal: controller.signal, timeoutMs: 10000 });

    controller.abort("caller-string");

    await assert.rejects(promise, (err: unknown): boolean => err === "caller-string");
  });

  test("a configuration read whose caller signal is already aborted rejects with that reason and sends nothing", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller cancelled before the configuration read.");

    controller.abort(reason);

    await assert.rejects(api.configuration({ signal: controller.signal, timeoutMs: 1000 }), (err: unknown): boolean => err === reason);

    assert.equal(host.sent.length, 0, "a pre-aborted configuration read puts nothing on the wire");
  });

  test("a pre-aborted configuration read rejects even when a cached configuration could answer it", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    host.bus.emit("voiceAssistantConfiguration", { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 4 });
    controller.abort();

    await assert.rejects(api.configuration({ signal: controller.signal }), (err: unknown): boolean => err === controller.signal.reason);

    assert.equal(host.sent.length, 0, "the cached path sends nothing either way");
  });

  test("with no connection a configuration read rejects NOT_CONNECTED ahead of the cache and sends nothing, after the already-aborted check", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();
    const reason = new Error("The caller cancelled before the configuration read.");

    // A cached configuration would answer a read that is not refreshed, so the refusal of that read shows the check runs ahead of the cache.
    host.bus.emit("voiceAssistantConfiguration", { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 4 });
    host.setConnection(null);

    await assert.rejects(api.configuration(), { code: "NOT_CONNECTED", constructor: NotConnectedError });
    await assert.rejects(api.configuration({ refresh: true, timeoutMs: 1000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });

    // A signal the caller already aborted is honored first, so the caller's own reason comes back rather than the refusal.
    controller.abort(reason);

    await assert.rejects(api.configuration({ signal: controller.signal }), (err: unknown): boolean => err === reason);

    assert.equal(host.sent.length, 0, "a refused configuration read puts nothing on the wire");
  });

  test("the connection's abort rejects a pending configuration read at once with the connection-lost error", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const connection = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // A long timeout ensures the rejection comes from the connection's abort, not the timeout source.
    const pending = api.configuration({ timeoutMs: 10000 });

    connection.abort(lost);

    await assert.rejects(pending, (err: unknown): boolean => err === lost);
  });

  test("a configuration read issued after a teardown settles on a later reply, and the teardown settles only the read issued before it", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const config = { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 2 };
    const connection = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // A long timeout keeps the earlier read pending until the teardown settles it.
    const earlier = api.configuration({ timeoutMs: 10000 });

    connection.abort(lost);
    host.setConnection(new AbortController());

    const later = api.configuration({ timeoutMs: 1000 });

    // One reply reaches every read still waiting, so it would settle the earlier read too had the teardown left it pending.
    host.bus.emit("voiceAssistantConfiguration", config);

    await assert.rejects(earlier, (err: unknown): boolean => err === lost, "the read issued before the teardown is settled by it rather than by the later reply");
    assert.deepEqual(await later, config, "the read issued after the teardown resolves from the later reply");
  });

  test("the connection's abort rejects every overlapping pending configuration read with the one connection-lost error", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const connection = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // Long timeouts keep the reads pending until the teardown settles them.
    const first = api.configuration({ timeoutMs: 10000 });
    const second = api.configuration({ timeoutMs: 10000 });

    assert.equal(host.sent.length, 2, "each overlapping read sends its own request");

    connection.abort(lost);

    await Promise.all([ assert.rejects(first, (err: unknown): boolean => err === lost), assert.rejects(second, (err: unknown): boolean => err === lost) ]);
  });

  test("a teardown inside the send settles the read it interrupts with the teardown's own rejection", async () => {

    const host = makeHost();
    const connection = new AbortController();
    const lost = connectionLostError();

    host.setConnection(connection);

    // The connection drops while the request goes out, and the next connection's controller is in place before the read starts waiting. The read still belongs to
    // the connection it was issued on.
    const api = new VoiceAssistantApi({

      ...host,
      send: (type: number, payload: Buffer): void => {

        host.send(type, payload);
        connection.abort(lost);
        host.setConnection(new AbortController());
      }
    });

    await assert.rejects(api.configuration({ timeoutMs: 10000 }), (err: unknown): boolean => err === lost);
  });

  test("a read settles in the shape of the source that ended it when a caller abort and a teardown land in the same tick", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const connection = new AbortController();
    const abortedFirst = new AbortController();
    const tornDownFirst = new AbortController();
    const reason = new Error("The caller gave up on the configuration read.");
    const lost = connectionLostError();

    host.setConnection(connection);

    const callerRead = api.configuration({ signal: abortedFirst.signal, timeoutMs: 10000 });
    const teardownRead = api.configuration({ signal: tornDownFirst.signal, timeoutMs: 10000 });

    // Every source aborts before either rejection is observed, so only the order in which the sources fired tells the reads apart.
    abortedFirst.abort(reason);
    connection.abort(lost);
    tornDownFirst.abort();

    await Promise.all([
      assert.rejects(callerRead, (err: unknown): boolean => err === reason),
      assert.rejects(teardownRead, (err: unknown): boolean => err === lost)
    ]);
  });
});

describe("VoiceAssistantApi - the connection scope", () => {

  test("clearConnectionState() leaves a pending announcement and a pending configuration read pending", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const config = { activeWakeWords: [], availableWakeWords: [], maxActiveWakeWords: 2 };

    // Long timeouts keep each wait pending, so only a reply or the reset could settle it.
    const announcement = api.announce({ text: "hi" }, { timeoutMs: 10000 });
    const read = api.configuration({ timeoutMs: 10000 });

    api.clearConnectionState();

    // The reset ends no wait, so each reply that follows it still settles the wait it answers.
    host.bus.emit("voiceAssistantAnnounceFinished", true);
    host.bus.emit("voiceAssistantConfiguration", config);

    assert.equal(await announcement, true, "the announcement outlives the reset and settles on its reply");
    assert.deepEqual(await read, config, "the configuration read outlives the reset and settles on its reply");
  });

  test("on a real client, disconnect() rejects a pending announcement and configuration read with one connection-lost error, and refuses later calls", async () => {

    const transport = new MockTransport();
    const logger = { debug: (): void => undefined, error: (): void => undefined, info: (): void => undefined, warn: (): void => undefined };
    const client = new EspHomeClient({ host: "test.local", logger, reconnect: false, transportFactory: (): MockTransport => transport });

    pushHandshake(transport);
    await client.connect({ signal: AbortSignal.timeout(2000) });

    const api = client.voiceAssistant;

    // The scope the sub-API's host object hands out carries the signal the client's teardown aborts, read through the instance's private `host` field.
    const scope = (api as unknown as { host: VoiceAssistantHost }).host.connectionScope();

    if(scope.kind !== "attached") {

      assert.fail("The connected client's voice-assistant host must read an attached connection, but it reads " + scope.kind + ".");
    }

    // The default timeouts keep each wait pending far past the bound below, so only the teardown can settle it inside that bound.
    const announcement = api.announce({ text: "hi" });
    const read = api.configuration();
    const sentTypes = transport.outboundFrames.map((frame): number => frame.type);

    assert.ok(sentTypes.includes(MessageType.VOICE_ASSISTANT_ANNOUNCE_REQUEST), "the announcement must reach the transport");
    assert.ok(sentTypes.includes(MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST), "the configuration read must reach the transport");

    const disconnectAt = Date.now();

    client.disconnect();

    const lost: unknown = scope.signal.reason;

    await assert.rejects(announcement, (err: unknown): boolean => {

      assert.ok(err instanceof ConnectionLostError, "the announcement must reject with a connection-lost error");
      assert.equal(err, lost, "the announcement must reject with the object the connection was aborted with");

      return true;
    });
    await assert.rejects(read, (err: unknown): boolean => err === lost);
    assert.ok((Date.now() - disconnectAt) < 250, "the teardown must end each wait at once rather than at its timeout");

    await assert.rejects(api.announce({ text: "again" }, { timeoutMs: 1000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });
    await assert.rejects(api.configuration({ timeoutMs: 1000 }), { code: "NOT_CONNECTED", constructor: NotConnectedError });
  });
});

describe("VoiceAssistantApi - util.inspect output", () => {

  test("util.inspect reports the pending announcement count beside the cache and subscription flags", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    assert.equal(inspect(api), "VoiceAssistantApi {\"hasConfig\":false,\"pendingAnnouncements\":0,\"subscribed\":false}");

    const pending = api.announce({ text: "hi" }, { timeoutMs: 1000 });

    assert.equal(inspect(api), "VoiceAssistantApi {\"hasConfig\":false,\"pendingAnnouncements\":1,\"subscribed\":false}", "a pending announcement shows in the count");

    host.bus.emit("voiceAssistantAnnounceFinished", true);
    await pending;

    assert.equal(inspect(api), "VoiceAssistantApi {\"hasConfig\":false,\"pendingAnnouncements\":0,\"subscribed\":false}", "a settled announcement leaves the count");
  });
});

describe("VoiceAssistantApi - stream rails (requests, audio, audioReadable)", () => {

  test("requests() returns an AsyncIterable", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    assert.equal(typeof api.requests()[Symbol.asyncIterator], "function");
  });

  test("audio() returns an AsyncIterable", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    assert.equal(typeof api.audio()[Symbol.asyncIterator], "function");
  });

  test("audioReadable() returns a ReadableStream", () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const readable = api.audioReadable();

    assert.equal(readable.locked, false);
  });
});
