/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle/handshake.test.ts: Unit tests for the connect-phase handshake helpers.
 */
import type { ApiMajorRange, ClientApiVersion } from "./handshake.ts";
import {
  EncryptionKeyInvalidError, EncryptionKeyMissingError, EncryptionRequiredError, NegotiationFailedError,
  NoiseHandshakeError, NoiseHandshakeTimeoutError, PlaintextHandshakeError, ProtocolError
} from "../errors.ts";
import { MessageType, WireType } from "../protocol/index.ts";
import { applyHelloResponse, authenticateIfNeeded, performDiscovery, performNoiseHandshake, performPlaintextHandshake } from "./handshake.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { EspHomeLogging } from "../types.ts";
import { MessageReceiver } from "../message-receiver.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import assert from "node:assert/strict";
import { createESPHomeHandshake } from "../crypto-noise.ts";
import { encodeProtoFields } from "../protocol/codec.ts";

const silentLog = (): EspHomeLogging => ({

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info:  (): void => { /* discard */ },
  warn:  (): void => { /* discard */ }
});

const recordingLog = (): EspHomeLogging & { warn: (m: string) => void; warned: string[] } => {

  const warned: string[] = [];

  return {

    debug: (): void => { /* discard */ },
    error: (): void => { /* discard */ },
    info:  (): void => { /* discard */ },
    warn:  (msg: string): void => { warned.push(msg); },
    warned
  };
};

const SUPPORTED_API_MAJORS: ApiMajorRange = { max: 1, min: 1 };
const CLIENT_API_VERSION: ClientApiVersion = { major: 1, minor: 12 };
// Validly-shaped 32-byte base64 PSK. Shape passes the length check; never authenticates against a real device.
const VALID_PSK = Buffer.alloc(32, 1).toString("base64");

const buildHelloPayload = (args: { major: number; minor: number; serverInfo?: string; deviceName?: string }): Buffer => {

  const fields = [
    { fieldNumber: 1, value: args.major, wireType: WireType.VARINT },
    { fieldNumber: 2, value: args.minor, wireType: WireType.VARINT }
  ];

  if(args.serverInfo) {

    fields.push({ fieldNumber: 3, value: Buffer.from(args.serverInfo, "utf8"), wireType: WireType.LENGTH_DELIMITED } as never);
  }

  if(args.deviceName) {

    fields.push({ fieldNumber: 4, value: Buffer.from(args.deviceName, "utf8"), wireType: WireType.LENGTH_DELIMITED } as never);
  }

  return encodeProtoFields(fields);
};

// Drive performNoiseHandshake with a short-named option bag so test lines stay under the 170-char wrap.
const startNoise = async (args: { transport: MockTransport; expectedServerName?: string; signal?: AbortSignal }): Promise<void> => {

  await performNoiseHandshake({

    expectedServerName: args.expectedServerName ?? null,
    log: silentLog(),
    metrics: undefined,
    psk: VALID_PSK,
    signal: args.signal ?? AbortSignal.timeout(2000),
    transport: args.transport
  });
};

// Drive applyHelloResponse with concise arguments. The setter callback defaults to a discard.
const applyHello = (args: { payload: Buffer; log?: EspHomeLogging; setMinor?: (m: number) => void }): void => {

  applyHelloResponse({

    clientApiVersion: CLIENT_API_VERSION,
    log: args.log ?? silentLog(),
    maxFieldsPerMessage: 64,
    payload: args.payload,
    setApiMinorVersion: args.setMinor ?? ((): void => { /* discard */ }),
    supportedApiMajors: SUPPORTED_API_MAJORS
  });
};

describe("performNoiseHandshake - input validation", () => {

  test("missing PSK throws EncryptionKeyMissingError", async () => {

    const transport = new MockTransport();

    await assert.rejects(

      performNoiseHandshake({ expectedServerName: null, log: silentLog(), metrics: undefined, psk: null, signal: AbortSignal.timeout(50), transport }),
      (err: unknown) => (err instanceof EncryptionKeyMissingError) && (err.code === "ENCRYPTION_KEY_MISSING")
    );
  });
});

describe("performNoiseHandshake - server-hello validation", () => {

  test("rejects server hello whose chosen-proto byte is not 1", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(Buffer.from([99]));

    await assert.rejects(promise, (err: unknown) => (err instanceof NoiseHandshakeError) && (err.code === "UNSUPPORTED_TOKEN"));
  });

  test("rejects empty server-hello frame", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(Buffer.alloc(0));

    await assert.rejects(promise, (err: unknown) => (err instanceof NoiseHandshakeError) && (err.code === "UNSUPPORTED_TOKEN"));
  });

  test("rejects when the announced server name does not match expectedServerName", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ expectedServerName: "expected-name", transport });

    // server hello: [proto=1][server-name\x00][...]
    const helloFrame = Buffer.concat([ Buffer.from([1]), Buffer.from("wrong-name\x00", "utf8") ]);

    transport.pushNoiseHandshakeFrame(helloFrame);

    await assert.rejects(promise, (err: unknown) => (err instanceof PlaintextHandshakeError) && (err.code === "SERVER_NAME_MISMATCH"));
  });
});

describe("performNoiseHandshake - server-handshake reply validation", () => {

  const goodHello = Buffer.concat([ Buffer.from([1]), Buffer.from("device\x00", "utf8") ]);

  test("rejects empty server-handshake reply", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);
    // Ensure the writeMessage send completes before the next frame is queued.
    await Promise.resolve();
    transport.pushNoiseHandshakeFrame(Buffer.alloc(0));

    await assert.rejects(promise, (err: unknown) => (err instanceof NoiseHandshakeError) && (err.code === "TRUNCATED_E"));
  });

  test("rejects server-handshake reply with non-zero header (PSK auth failure)", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);
    await Promise.resolve();
    transport.pushNoiseHandshakeFrame(Buffer.concat([ Buffer.from([1]), Buffer.from("auth failed", "utf8") ]));

    await assert.rejects(promise, (err: unknown) => (err instanceof EncryptionKeyInvalidError) && (err.code === "NOISE_HANDSHAKE_FAILED"));
  });
});

describe("performNoiseHandshake - readMessage failure re-tagging", () => {

  const goodHello = Buffer.concat([ Buffer.from([1]), Buffer.from("device\x00", "utf8") ]);

  // Drive performNoiseHandshake to the point where the client has emitted its NNpsk0 msg1, then build a REAL responder msg2 against that exact msg1 so the client's
  // readMessage processes a genuine reply. The returned `msg2` is the raw responder handshake message (NOT yet prefixed with the success header byte); each caller
  // mutates it to provoke a specific readMessage failure code, prefixes the `0x00` success header, and pushes it as the server-handshake reply. The PSK matches VALID_PSK
  // so the shared-secret derivation lines up. We poll the transport's captured outbound frames until the client's msg1 (the second handshake frame; the first is the
  // empty initial) is present, rather than guessing a fixed number of microtask hops.
  const driveToServerHandshakeReply = async (transport: MockTransport): Promise<{ msg2: Buffer; promise: Promise<void> }> => {

    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);

    // Wait for the client's writeMessage + sendNoiseHandshakeFrame to land its msg1 into the captured outbound frames.
    for(let i = 0; (i < 50) && (transport.outboundHandshakeFrames.length < 2); i++) {

      await Promise.resolve();
    }

    const clientMsg1Frame = transport.outboundHandshakeFrames[1];

    assert.ok(clientMsg1Frame, "the client must have emitted its NNpsk0 msg1 before the server replies");

    // The client prefixes its handshake message with a single zero header byte (handshake.ts step 3); strip it to recover the raw NNpsk0 msg1 the responder reads.
    const responder = createESPHomeHandshake({ psk: Buffer.from(VALID_PSK, "base64"), role: "responder" });

    responder.readMessage(clientMsg1Frame.subarray(1));

    const msg2 = Buffer.from(responder.writeMessage(Buffer.from("server-hello", "utf8")));

    return { msg2, promise };
  };

  // Push a server-handshake reply: the `0x00` success header followed by the (possibly tampered) msg2 body. Mirrors the responder's on-wire success reply.
  const pushReply = (transport: MockTransport, msg2: Buffer): void => {

    transport.pushNoiseHandshakeFrame(Buffer.concat([ Buffer.from([0]), msg2 ]));
  };

  test("re-tags a local AEAD AUTH_FAILED into EncryptionKeyInvalidError preserving the cause code", async () => {

    const transport = new MockTransport();
    const { msg2, promise } = await driveToServerHandshakeReply(transport);

    // Overwrite the responder ephemeral with 0xFF: X25519 ACCEPTS it (non-low-order) so the DH succeeds, but the derived secret is wrong, so the payload decrypt fails
    // the AEAD tag check inside readMessage with AUTH_FAILED.
    Buffer.alloc(32, 0xff).copy(msg2, 0);
    pushReply(transport, msg2);

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "an AUTH_FAILED from readMessage must re-tag to EncryptionKeyInvalidError");
      assert.equal(err.code, "NOISE_HANDSHAKE_FAILED", "the consolidated connect-flow error reuses NOISE_HANDSHAKE_FAILED");
      assert.ok(err.cause instanceof NoiseHandshakeError, "the granular noise error must be preserved on the cause chain");
      assert.equal(err.cause.code, "AUTH_FAILED", "the cause must carry the granular AUTH_FAILED code so the AEAD path stays distinguishable from the DH path");

      return true;
    });
  });

  test("re-tags an INVALID_REMOTE_KEY DH failure into EncryptionKeyInvalidError preserving the cause code", async () => {

    const transport = new MockTransport();
    const { msg2, promise } = await driveToServerHandshakeReply(transport);

    // Overwrite the responder ephemeral with the all-zeros low-order point: the X25519 DH rejects it at key-agreement, so readMessage throws INVALID_REMOTE_KEY.
    Buffer.alloc(32, 0x00).copy(msg2, 0);
    pushReply(transport, msg2);

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "an INVALID_REMOTE_KEY from readMessage must re-tag to EncryptionKeyInvalidError");
      assert.equal(err.code, "NOISE_HANDSHAKE_FAILED", "the consolidated connect-flow error reuses NOISE_HANDSHAKE_FAILED");
      assert.ok(err.cause instanceof NoiseHandshakeError, "the granular noise error must be preserved on the cause chain");
      assert.equal(err.cause.code, "INVALID_REMOTE_KEY", "the cause must carry the granular INVALID_REMOTE_KEY code so the DH path stays distinct from the AEAD path");

      return true;
    });
  });

  test("does NOT re-tag a framing TRUNCATED_E from readMessage - it propagates as NoiseHandshakeError", async () => {

    const transport = new MockTransport();
    const { promise } = await driveToServerHandshakeReply(transport);

    // A header=0 reply whose body is non-empty but shorter than the 32-byte ephemeral makes readMessage's "e" token throw TRUNCATED_E - a framing failure, NOT a key
    // problem. The distinguishing wrap must let it pass through unchanged so the fallback gate fails it closed while leaving it transient (the reconnect supervisor may
    // retry a one-off garble). A 10-byte body sits between the empty-reply guard (handshake.ts step 4) and the 32-byte ephemeral floor.
    pushReply(transport, Buffer.alloc(10, 0x01));

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof NoiseHandshakeError, "a TRUNCATED_E from readMessage must NOT be re-tagged - it stays a NoiseHandshakeError");
      assert.equal(err instanceof EncryptionKeyInvalidError, false, "a framing failure must never masquerade as a permanent bad-key EncryptionKeyInvalidError");
      assert.equal(err.code, "TRUNCATED_E", "the framing failure keeps its own granular code");

      return true;
    });
  });

  test("the in-band header != 0 server rejection still throws EncryptionKeyInvalidError", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);
    await Promise.resolve();
    transport.pushNoiseHandshakeFrame(Buffer.concat([ Buffer.from([1]), Buffer.from("auth failed", "utf8") ]));

    await assert.rejects(promise, (err: unknown) => (err instanceof EncryptionKeyInvalidError) && (err.code === "NOISE_HANDSHAKE_FAILED"));
  });
});

describe("performNoiseHandshake - abort handling", () => {

  test("translates AbortSignal.timeout into NoiseHandshakeTimeoutError", async () => {

    const transport = new MockTransport();
    const ac = new AbortController();
    const promise = startNoise({ signal: ac.signal, transport });

    setImmediate(() => ac.abort());

    await assert.rejects(promise, (err: unknown) => (err instanceof NoiseHandshakeTimeoutError) && (err.code === "HANDSHAKE_TIMEOUT"));
  });
});

describe("applyHelloResponse - version negotiation", () => {

  test("stamps the api minor version through the supplied setter", () => {

    let captured = -1;

    applyHello({ payload: buildHelloPayload({ major: 1, minor: 12 }), setMinor: (m): void => { captured = m; } });

    assert.equal(captured, 12);
  });

  test("rejects an out-of-range major version with NegotiationFailedError", () => {

    assert.throws(

      (): void => applyHello({ payload: buildHelloPayload({ major: 2, minor: 0 }) }),
      (err: unknown) => (err instanceof NegotiationFailedError) && (err.code === "API_MAJOR_OUT_OF_RANGE")
    );
  });

  test("warns when the device omits its api version fields", () => {

    const log = recordingLog();
    const payload = encodeProtoFields([{ fieldNumber: 3, value: Buffer.from("server", "utf8"), wireType: WireType.LENGTH_DELIMITED }]);

    applyHello({ log, payload });

    assert.equal(log.warned.length, 1);
    assert.match(log.warned[0]!, /Device did not provide API version information/);
  });

  test("accepts an older minor version and continues in compatibility mode", () => {

    applyHello({ payload: buildHelloPayload({ deviceName: "test-device", major: 1, minor: 5, serverInfo: "esphome 2025.10" }) });
  });

  test("accepts a newer minor version and logs at debug level", () => {

    applyHello({ payload: buildHelloPayload({ major: 1, minor: 99 }) });
  });

  test("rejects a major below the supported range", () => {

    assert.throws(

      (): void => applyHello({ payload: buildHelloPayload({ major: 0, minor: 0 }) }),
      (err: unknown) => (err instanceof NegotiationFailedError) && (err.code === "API_MAJOR_OUT_OF_RANGE")
    );
  });
});

describe("performPlaintextHandshake - wire I/O", () => {

  test("sends HELLO_REQUEST and consumes HELLO_RESPONSE", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    let captured = -1;

    const promise = performPlaintextHandshake({

      clientApiVersion: CLIENT_API_VERSION,
      clientId: "test-client",
      log: silentLog(),
      maxFieldsPerMessage: 64,
      psk: null,
      receiver,
      setApiMinorVersion: (m): void => { captured = m; },
      signal: AbortSignal.timeout(2000),
      supportedApiMajors: SUPPORTED_API_MAJORS,
      transport
    });

    transport.pushInbound(MessageType.HELLO_RESPONSE, buildHelloPayload({ major: 1, minor: 12 }));

    await promise;

    assert.equal(transport.outboundFrames.length, 1);
    assert.equal(transport.outboundFrames[0]!.type, MessageType.HELLO_REQUEST);
    assert.equal(captured, 12);

    receiver[Symbol.dispose]();
  });

  test("translates PROTOCOL_MISMATCH from the receiver into EncryptionRequiredError when PSK is null", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const promise = performPlaintextHandshake({

      clientApiVersion: CLIENT_API_VERSION,
      clientId: "test-client",
      log: silentLog(),
      maxFieldsPerMessage: 64,
      psk: null,
      receiver,
      setApiMinorVersion: (): void => { /* discard */ },
      signal: AbortSignal.timeout(2000),
      supportedApiMajors: SUPPORTED_API_MAJORS,
      transport
    });

    setImmediate(() => transport.fail(new ProtocolError("Server returned noise indicator byte.", "PROTOCOL_MISMATCH")));

    await assert.rejects(promise, (err: unknown) => err instanceof EncryptionRequiredError);

    receiver[Symbol.dispose]();
  });

  test("re-throws other errors unchanged when PSK is null", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const promise = performPlaintextHandshake({

      clientApiVersion: CLIENT_API_VERSION,
      clientId: "test-client",
      log: silentLog(),
      maxFieldsPerMessage: 64,
      psk: null,
      receiver,
      setApiMinorVersion: (): void => { /* discard */ },
      signal: AbortSignal.timeout(2000),
      supportedApiMajors: SUPPORTED_API_MAJORS,
      transport
    });

    setImmediate(() => transport.fail(new Error("socket closed")));

    await assert.rejects(promise, (err: unknown) => (err instanceof Error) && (err.message === "socket closed"));

    receiver[Symbol.dispose]();
  });
});

describe("authenticateIfNeeded - version-gated send", () => {

  test("is a no-op for API >= 1.11", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    await authenticateIfNeeded({ apiMinorVersion: 11, log: silentLog(), receiver, signal: AbortSignal.timeout(2000), transport });

    assert.equal(transport.outboundFrames.length, 0, "API >= 1.11 must not send CONNECT_REQUEST");

    receiver[Symbol.dispose]();
  });

  test("sends CONNECT_REQUEST and awaits CONNECT_RESPONSE for API < 1.11", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const promise = authenticateIfNeeded({ apiMinorVersion: 10, log: silentLog(), receiver, signal: AbortSignal.timeout(2000), transport });

    transport.pushInbound(MessageType.CONNECT_RESPONSE, Buffer.alloc(0));

    await promise;

    assert.equal(transport.outboundFrames.length, 1);
    assert.equal(transport.outboundFrames[0]!.type, MessageType.CONNECT_REQUEST);

    receiver[Symbol.dispose]();
  });
});

describe("performDiscovery - discovery loop", () => {

  test("drains list-entities responses, fires deviceInfo, and ends on LIST_ENTITIES_DONE_RESPONSE", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const events: string[] = [];
    let deviceInfoApplied = 0;
    let listEntitiesApplied = 0;
    let listServiceApplied = 0;

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { deviceInfoApplied += 1; },
      applyListEntity: (): void => { listEntitiesApplied += 1; },
      applyListServiceEntity: (): void => { listServiceApplied += 1; },
      countEntities: (): number => 2,
      countServices: (): number => 1,
      emitDeviceInfo: (): void => { events.push("deviceInfo"); },
      emitEntities: (): void => { events.push("entities"); },
      emitServices: (): void => { events.push("services"); },
      listEntitiesMessageTypes: new Set([
        MessageType.LIST_ENTITIES_LIGHT_RESPONSE, MessageType.LIST_ENTITIES_SWITCH_RESPONSE, MessageType.LIST_ENTITIES_SERVICES_RESPONSE
      ]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(2000),
      transport
    });

    // Yield between pushes so the receiver's pump dispatches each message to a fresh awaiter rather than batching them into per-type buffers (the buffered drain
    // iterates in wanted-Set order, which would surface DONE before SERVICES and exit the loop early).
    const yieldTick = async (): Promise<void> => { await new Promise<void>((resolve): void => { setImmediate(resolve); }); };

    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));
    await yieldTick();
    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, Buffer.alloc(0));
    await yieldTick();
    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, Buffer.alloc(0));
    await yieldTick();
    transport.pushInbound(MessageType.LIST_ENTITIES_SERVICES_RESPONSE, Buffer.alloc(0));
    await yieldTick();
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));

    await promise;

    assert.equal(deviceInfoApplied, 1);
    assert.equal(listEntitiesApplied, 2);
    assert.equal(listServiceApplied, 1);
    assert.deepEqual(events, [ "deviceInfo", "entities", "services" ]);

    // Discovery should have sent LIST_ENTITIES_REQUEST + DEVICE_INFO_REQUEST + SUBSCRIBE_STATES_REQUEST.
    assert.equal(transport.outboundFrames.length, 3);
    assert.equal(transport.outboundFrames[0]!.type, MessageType.LIST_ENTITIES_REQUEST);
    assert.equal(transport.outboundFrames[1]!.type, MessageType.DEVICE_INFO_REQUEST);
    assert.equal(transport.outboundFrames[2]!.type, MessageType.SUBSCRIBE_STATES_REQUEST);

    receiver[Symbol.dispose]();
  });

  test("invokes both emitEntities and emitServices unconditionally so host callbacks can clear registry dirty bits even with no services discovered", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const events: string[] = [];

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { /* discard */ },
      applyListEntity: (): void => { /* discard */ },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 0,
      countServices: (): number => 0,
      emitDeviceInfo: (): void => { events.push("deviceInfo"); },
      emitEntities: (): void => { events.push("entities"); },
      emitServices: (): void => { events.push("services"); },
      listEntitiesMessageTypes: new Set([MessageType.LIST_ENTITIES_LIGHT_RESPONSE]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(2000),
      transport
    });

    // The device always answers DEVICE_INFO_REQUEST; discovery completes only when both that response and the done sentinel have arrived, so push DeviceInfo first.
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));

    await promise;

    // The discovery routine itself invokes both callbacks; the host's emitServices callback owns the conditional-emit decision (it only forwards to the public bus
    // when the service-registry snapshot has services). Calling emitServices here is what clears the dirty bit at connect-end. The leading "deviceInfo" is the
    // required device-info response that discovery waits for before completing - emitDeviceInfo fires for it just as it does in the full ordering test above.
    assert.deepEqual(events, [ "deviceInfo", "entities", "services" ]);

    receiver[Symbol.dispose]();
  });

  test("emits the discovery.entities_found and discovery.services_found gauges through the supplied metrics", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const gauges: { name: string; value: number }[] = [];
    const metrics = {

      gauge: (name: string, value: number): void => { gauges.push({ name, value }); },
      increment: (): void => { /* discard */ },
      timing: (): void => { /* discard */ }
    };

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { /* discard */ },
      applyListEntity: (): void => { /* discard */ },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 7,
      countServices: (): number => 3,
      emitDeviceInfo: (): void => { /* discard */ },
      emitEntities: (): void => { /* discard */ },
      emitServices: (): void => { /* discard */ },
      listEntitiesMessageTypes: new Set([MessageType.LIST_ENTITIES_LIGHT_RESPONSE]),
      metrics,
      receiver,
      signal: AbortSignal.timeout(2000),
      transport
    });

    // The device always answers DEVICE_INFO_REQUEST; discovery completes only when both that response and the done sentinel have arrived, so push DeviceInfo first.
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));

    await promise;

    assert.equal(gauges.length, 2);
    assert.deepEqual(gauges.find((g): boolean => g.name === "discovery.entities_found"), { name: "discovery.entities_found", value: 7 });
    assert.deepEqual(gauges.find((g): boolean => g.name === "discovery.services_found"), { name: "discovery.services_found", value: 3 });

    receiver[Symbol.dispose]();
  });

  test("completes when DEVICE_INFO_RESPONSE arrives AFTER LIST_ENTITIES_DONE_RESPONSE - the adverse ordering the gate must tolerate", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const events: string[] = [];
    let deviceInfoApplied = 0;

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { deviceInfoApplied += 1; },
      applyListEntity: (): void => { /* discard */ },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 1,
      countServices: (): number => 0,
      emitDeviceInfo: (): void => { events.push("deviceInfo"); },
      emitEntities: (): void => { events.push("entities"); },
      emitServices: (): void => { events.push("services"); },
      listEntitiesMessageTypes: new Set([MessageType.LIST_ENTITIES_LIGHT_RESPONSE]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(2000),
      transport
    });

    const yieldTick = async (): Promise<void> => { await new Promise<void>((resolve): void => { setImmediate(resolve); }); };

    // The adverse ordering that the convenient DeviceInfo-first fixtures above never exercised: the device answers its entity stream and the DONE sentinel BEFORE the
    // device-info response. The both-required gate must keep waiting until device-info also arrives, rather than resolving with device-info never applied.
    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, Buffer.alloc(0));
    await yieldTick();
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));
    await yieldTick();

    // DONE has arrived but DeviceInfo has not, so discovery must still be pending.
    let settled = false;

    void promise.then((): void => { settled = true; }, (): void => { settled = true; });
    await yieldTick();
    assert.equal(settled, false, "discovery must not complete on DONE alone - it must wait for DEVICE_INFO_RESPONSE");

    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));
    await promise;

    assert.equal(deviceInfoApplied, 1, "device-info must be applied even when it arrives after DONE");
    assert.deepEqual(events, [ "deviceInfo", "entities", "services" ]);

    receiver[Symbol.dispose]();
  });

  test("rejects with the typed timeout when DEVICE_INFO_RESPONSE arrives but LIST_ENTITIES_DONE_RESPONSE never does", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { /* discard */ },
      applyListEntity: (): void => { /* discard */ },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 0,
      countServices: (): number => 0,
      emitDeviceInfo: (): void => { /* discard */ },
      emitEntities: (): void => { /* discard */ },
      emitServices: (): void => { /* discard */ },
      listEntitiesMessageTypes: new Set([MessageType.LIST_ENTITIES_LIGHT_RESPONSE]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(50),
      transport
    });

    // DeviceInfo arrives but the DONE sentinel never does. The gate must NOT resolve on DeviceInfo alone; it blocks until the composed signal times out, surfacing a loud
    // typed timeout rather than a half-complete discovery. This is the symmetric proof that the gate waits for DONE, not just DeviceInfo.
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));

    await assert.rejects(promise, (err: unknown): boolean => (err instanceof DOMException) && (err.name === "TimeoutError"));

    receiver[Symbol.dispose]();
  });

  test("rejects with the typed timeout when LIST_ENTITIES_DONE_RESPONSE arrives but DEVICE_INFO_RESPONSE never does", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { /* discard */ },
      applyListEntity: (): void => { /* discard */ },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 0,
      countServices: (): number => 0,
      emitDeviceInfo: (): void => { /* discard */ },
      emitEntities: (): void => { /* discard */ },
      emitServices: (): void => { /* discard */ },
      listEntitiesMessageTypes: new Set([MessageType.LIST_ENTITIES_LIGHT_RESPONSE]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(50),
      transport
    });

    // The DONE sentinel arrives but the device-info response never does. The gate must block until the composed signal times out rather than resolving a
    // discovery with null device-info; the loud typed timeout is what a future regression to DONE-alone completion would fail to produce.
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));

    await assert.rejects(promise, (err: unknown): boolean => (err instanceof DOMException) && (err.name === "TimeoutError"));

    receiver[Symbol.dispose]();
  });
});
