/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * voice-assistant.class.test.ts: Unit tests for the VoiceAssistantApi class methods (separate from the dispatcher tests in voice-assistant.test.ts).
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import { VoiceAssistantApi } from "./voice-assistant.ts";
import type { VoiceAssistantHost } from "./voice-assistant.ts";
import assert from "node:assert/strict";
import { decodeProtobuf } from "./protocol/codec.ts";

interface CapturedFrame {

  payload: Buffer;
  type: number;
}

function makeHost(): VoiceAssistantHost & { bus: EventBus<ClientEventsMap>; sent: CapturedFrame[] } {

  const bus = new EventBus<ClientEventsMap>();
  const sent: CapturedFrame[] = [];

  return {

    bus,
    log: { debug: (): void => { /* */ }, error: (): void => { /* */ }, info: (): void => { /* */ }, warn: (): void => { /* */ } },
    send: (type: number, payload: Buffer): void => { sent.push({ payload, type }); },
    sent
  };
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

    // Yield so the announce subscribes to voiceAssistantAnnounceFinished before we emit.
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

    // Yield so the announce subscribes and sends before we inspect the captured frame.
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

    // Resolve the outstanding once-promise so the test does not leak an open handle.
    host.bus.emit("voiceAssistantAnnounceFinished", true);
    await announcePromise;
  });

  test("rejects when timeout fires before the finished event arrives", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);

    await assert.rejects(api.announce({ text: "hi" }, { timeoutMs: 10 }), { name: "AbortError" });
  });

  test("rejects with AbortError when the caller-supplied signal aborts before the finished event", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    // A long timeout ensures the rejection comes from the CALLER's signal layered in via AbortSignal.any, not from the timeout source.
    const promise = api.announce({ text: "hi" }, { signal: controller.signal, timeoutMs: 10000 });

    controller.abort();

    await assert.rejects(promise, { name: "AbortError" }, "the caller's aborted signal rejects the announce");
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

  test("rejects with AbortError when the caller-supplied signal aborts the wire-request path", async () => {

    const host = makeHost();
    const api = new VoiceAssistantApi(host);
    const controller = new AbortController();

    // No cache is seeded, so configuration() takes the wire-request path. A long timeout ensures the rejection comes from the CALLER's signal, not the timeout source.
    const promise = api.configuration({ signal: controller.signal, timeoutMs: 10000 });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(host.sent[0]?.type, MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST, "the wire-request path issues a configuration request before awaiting");

    controller.abort();

    await assert.rejects(promise, { name: "AbortError" }, "the caller's aborted signal rejects the configuration read");
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
