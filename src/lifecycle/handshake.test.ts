/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle/handshake.test.ts: Unit tests for the connect-phase handshake helpers.
 */
import type { ApiMajorRange, ClientApiVersion } from "./handshake.ts";
import type { ClientMetrics, EspHomeLogging, NoiseServerHello, PskResolver } from "../types.ts";
import {
  ConnectionClosedByPeerError, EncryptionKeyInvalidError, EncryptionKeyMissingError, EncryptionRequiredError, NegotiationFailedError, NoiseHandshakeError,
  PermanentError, ProtocolError
} from "../errors.ts";
import { MessageType, WireType } from "../protocol/index.ts";
import { applyHelloResponse, authenticateIfNeeded, parseServerHello, performDiscovery, performNoiseHandshake, performPlaintextHandshake } from "./handshake.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClockFn } from "../heartbeat.ts";
import { MessageReceiver } from "../message-receiver.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import type { NoiseCipherPair } from "../transport.ts";
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

// Build a frame from space-separated hex octets, so each fixture below reads byte for byte against its source.
const hexFrame = (hex: string): Buffer => Buffer.from(hex.replaceAll(" ", ""), "hex");

// Byte-exact Noise server hellos captured from live devices, each the frame body the transport hands the handshake after stripping the `[0x01][be16 size]` wire
// header. The first is the capture published with esphome/esphome pull request 8551, which added the MAC segment; the second was read from a production ratgdo.
const LIVE_HELLOS = [

  {

    expected: { macAddress: "24:4C:AB:06:49:9C", name: "poolhouse81proxy" },
    frame: hexFrame("01 70 6f 6f 6c 68 6f 75 73 65 38 31 70 72 6f 78 79 00 32 34 34 63 61 62 30 36 34 39 39 63 00")
  },
  {

    expected: { macAddress: "D8:13:2A:CE:00:EC", name: "ratgdo-north" },
    frame: hexFrame("01 72 61 74 67 64 6f 2d 6e 6f 72 74 68 00 64 38 31 33 32 61 63 65 30 30 65 63 00")
  }
] as const;

const [POOLHOUSE_HELLO] = LIVE_HELLOS;

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

// The optional inputs a noise-handshake test may override; startNoise supplies the rest.
interface NoiseTestArgs {

  expectedServerName?: string;
  metrics?: ClientMetrics;
  now?: ClockFn;
  resolvePsk?: PskResolver;
  signal?: AbortSignal;
}

// Drive performNoiseHandshake with a short-named option bag so test lines stay under the 170-char wrap. The key resolver defaults to one returning VALID_PSK, and the
// clock defaults to the wall clock because only the duration-metric test reads it.
const startNoise = async (args: NoiseTestArgs & { transport: MockTransport }): Promise<void> => {

  await performNoiseHandshake({

    expectedServerName: args.expectedServerName ?? null,
    log: silentLog(),
    metrics: args.metrics,
    now: args.now ?? Date.now,
    resolvePsk: args.resolvePsk ?? ((): string => VALID_PSK),
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

      performNoiseHandshake({

        expectedServerName: null, log: silentLog(), metrics: undefined, now: Date.now, resolvePsk: null, signal: AbortSignal.timeout(50), transport
      }),
      { code: "ENCRYPTION_KEY_MISSING", constructor: EncryptionKeyMissingError }
    );
  });
});

describe("performNoiseHandshake - server-hello validation", () => {

  test("rejects server hello whose chosen-proto byte is not 1", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(Buffer.from([99]));

    await assert.rejects(promise, { code: "UNSUPPORTED_TOKEN", constructor: NoiseHandshakeError });
  });

  test("rejects empty server-hello frame", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(Buffer.alloc(0));

    await assert.rejects(promise, { code: "UNSUPPORTED_TOKEN", constructor: NoiseHandshakeError });
  });

  test("rejects when the announced server name does not match expectedServerName", async () => {

    const transport = new MockTransport();
    const promise = startNoise({ expectedServerName: "expected-name", transport });

    // server hello: [proto=1][server-name\x00][...]
    const helloFrame = Buffer.concat([ Buffer.from([1]), Buffer.from("wrong-name\x00", "utf8") ]);

    transport.pushNoiseHandshakeFrame(helloFrame);

    await assert.rejects(promise, { code: "SERVER_NAME_MISMATCH", constructor: NoiseHandshakeError });
  });
});

describe("parseServerHello - the facts a Noise server hello announces", () => {

  for(const { expected, frame } of LIVE_HELLOS) {

    test("parses the live " + expected.name + " hello into its node name and normalized MAC address", () => {

      assert.deepEqual(parseServerHello(frame), expected);
    });
  }

  // Each row is a frame and the exact parse it must produce. An absent member must be omitted entirely, never present as undefined, and the strict deep-equal here
  // tells those apart.
  const cases: readonly { expected: NoiseServerHello; frame: Buffer; label: string }[] = [

    { expected: {}, frame: Buffer.from([1]), label: "a hello carrying only the chosen-proto byte announces nothing" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00", "latin1"), label: "a hello from firmware before ESPHome 2025.4.0 announces only its name" },
    { expected: { macAddress: "24:4C:AB:06:49:9C" }, frame: Buffer.from("\x01\x00244cab06499c\x00", "latin1"), label: "an empty name segment is absent" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00\x00", "latin1"), label: "an empty MAC segment is absent" },
    { expected: {}, frame: Buffer.from("\x01garage", "latin1"), label: "an unterminated name segment is ignored" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00244cab06499c", "latin1"), label: "an unterminated MAC segment is ignored" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00244cab06499\x00", "latin1"), label: "a MAC segment one digit short is absent" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00244cab06499cc\x00", "latin1"), label: "a MAC segment one digit long is absent" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x0024:4c:ab:06:49:9c\x00", "latin1"), label: "a MAC segment with separators is absent" },
    { expected: { name: "garage" }, frame: Buffer.from("\x01garage\x00244cab06499g\x00", "latin1"), label: "a MAC segment with a non-hex digit is absent" },
    { expected: { macAddress: "24:4C:AB:06:49:9C", name: "garage" }, frame: Buffer.from("\x01garage\x00244CAB06499C\x00", "latin1"),
      label: "an uppercase MAC segment normalizes the same way" }
  ];

  for(const { expected, frame, label } of cases) {

    test(label, () => {

      assert.deepEqual(parseServerHello(frame), expected);
    });
  }
});

describe("performNoiseHandshake - key resolution", () => {

  test("calls the resolver once with the parsed hello, after the name check, and handshakes with the key it returns", async () => {

    const transport = new MockTransport();
    const hellos: NoiseServerHello[] = [];

    // A key distinct from every other fixture, so only a handshake that used the resolver's own key authenticates against it below.
    const resolvedKey = Buffer.alloc(32, 0x3c);

    const promise = startNoise({

      expectedServerName: POOLHOUSE_HELLO.expected.name,
      resolvePsk: (hello): string => {

        hellos.push(hello);

        return resolvedKey.toString("base64");
      },
      transport
    });

    // Queue the live hello and then an empty reply. The client handshakes up to its NNpsk0 msg1 and then fails on the empty reply, which ends the attempt promptly.
    transport.pushNoiseHandshakeFrame(POOLHOUSE_HELLO.frame);
    transport.pushNoiseHandshakeFrame(Buffer.alloc(0));

    await assert.rejects(promise, { code: "TRUNCATED_E", constructor: NoiseHandshakeError });

    assert.deepEqual(hellos, [POOLHOUSE_HELLO.expected], "the resolver must be called exactly once, with the parsed server hello");

    const clientMsg1Frame = transport.outboundHandshakeFrames[1];

    assert.ok(clientMsg1Frame, "the client must have sent its NNpsk0 msg1 after resolving the key");

    // A responder holding the resolver's key authenticates msg1 only when the client sealed it with that same key.
    const responder = createESPHomeHandshake({ psk: Buffer.from(resolvedKey), role: "responder" });

    assert.doesNotThrow(() => { responder.readMessage(clientMsg1Frame.subarray(1)); }, "msg1 must be sealed with the key the resolver returned");
  });

  for(const missingKey of [ null, "" ]) {

    test("a resolver returning " + JSON.stringify(missingKey) + " throws EncryptionKeyMissingError before any handshake message is sent", async () => {

      const transport = new MockTransport();
      const promise = startNoise({ resolvePsk: (): typeof missingKey => missingKey, transport });

      transport.pushNoiseHandshakeFrame(POOLHOUSE_HELLO.frame);

      await assert.rejects(promise, { code: "ENCRYPTION_KEY_MISSING", constructor: EncryptionKeyMissingError });
      assert.equal(transport.outboundHandshakeFrames.length, 1, "only the empty initial frame may be sent - never a handshake message");
    });
  }

  test("a wrong-length key throws EncryptionKeyInvalidError caused by the primitive's check, sends no handshake message, and zeroes the decoded key", async (t) => {

    const transport = new MockTransport();
    const shortKey = Buffer.alloc(16, 0x77).toString("base64");

    // Observe the handshake's own decode of the key. The spy calls through to the real Buffer.from and records each result, so the decoded buffer the handshake owned
    // can be inspected after it rejects. The test context restores the method when the test ends.
    const bufferFrom = t.mock.method(Buffer, "from");
    const promise = startNoise({ resolvePsk: (): string => shortKey, transport });

    transport.pushNoiseHandshakeFrame(POOLHOUSE_HELLO.frame);

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "a wrong-length key must fail with the permanent EncryptionKeyInvalidError");
      assert.equal(err.code, "INVALID_PSK_LENGTH");
      assert.ok(err.cause instanceof NoiseHandshakeError, "the primitive's own length check must be preserved on the cause chain");
      assert.equal(err.cause.code, "INVALID_PSK_LENGTH");

      return true;
    });

    assert.equal(transport.outboundHandshakeFrames.length, 1, "only the empty initial frame may be sent - never a handshake message");

    const decode = bufferFrom.mock.calls.find((call) => call.arguments[0] === shortKey);

    assert.ok(decode?.result, "the handshake must decode the resolved key");
    assert.equal(decode.result.length, 16);
    assert.ok(decode.result.every((byte) => byte === 0), "the decoded key the handshake still owned must be zeroed");
  });

  test("an exception the resolver throws reaches the caller as the same object, before any handshake message is sent", async () => {

    const transport = new MockTransport();
    const thrown = new Error("The key store is unavailable.");
    const promise = startNoise({ resolvePsk: (): string => { throw thrown; }, transport });

    transport.pushNoiseHandshakeFrame(POOLHOUSE_HELLO.frame);

    await assert.rejects(promise, (err: unknown) => err === thrown);
    assert.equal(transport.outboundHandshakeFrames.length, 1, "only the empty initial frame may be sent - never a handshake message");
  });

  test("a server-name mismatch throws before the resolver is called", async () => {

    const transport = new MockTransport();
    let resolverCalls = 0;

    const promise = startNoise({

      expectedServerName: "expected-name",
      resolvePsk: (): string => {

        resolverCalls++;

        return VALID_PSK;
      },
      transport
    });

    transport.pushNoiseHandshakeFrame(POOLHOUSE_HELLO.frame);

    await assert.rejects(promise, { code: "SERVER_NAME_MISMATCH", constructor: NoiseHandshakeError });
    assert.equal(resolverCalls, 0, "the resolver must not see a hello from a device that failed the name check");
  });

  test("an expected server name does not reject a hello that announces no name", async () => {

    const transport = new MockTransport();
    const hellos: NoiseServerHello[] = [];

    const promise = startNoise({

      expectedServerName: "expected-name",
      resolvePsk: (hello): string => {

        hellos.push(hello);

        return VALID_PSK;
      },
      transport
    });

    // Queue a hello carrying only the chosen-proto byte, which announces no name, and then an empty reply. An absent name gives the check nothing to compare, so the
    // resolver sees the empty hello and the attempt ends on the empty reply rather than on a name mismatch.
    transport.pushNoiseHandshakeFrame(Buffer.from([1]));
    transport.pushNoiseHandshakeFrame(Buffer.alloc(0));

    await assert.rejects(promise, { code: "TRUNCATED_E", constructor: NoiseHandshakeError });
    assert.deepEqual(hellos, [{}], "a hello that announces no name must pass the name check and reach the resolver exactly once");
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

    await assert.rejects(promise, { code: "TRUNCATED_E", constructor: NoiseHandshakeError });
  });

  // An in-band rejection is a non-zero header followed by the device's reason text. The rows are ESPHome's wrong-key reason, the framing and protocol faults its
  // firmware reports, a reason no firmware sends yet, and a near miss that differs from the wrong-key reason only by trailing punctuation. Only the exact wrong-key
  // reason is a key rejection.
  const rejections: readonly { keyRejected: boolean; reason: string }[] = [

    { keyRejected: true, reason: "Handshake MAC failure" },
    { keyRejected: false, reason: "Handshake error" },
    { keyRejected: false, reason: "Bad indicator byte" },
    { keyRejected: false, reason: "Bad handshake packet len" },
    { keyRejected: false, reason: "Empty handshake message" },
    { keyRejected: false, reason: "Bad handshake error byte" },
    { keyRejected: false, reason: "A reason no firmware sends yet" },
    { keyRejected: false, reason: "Handshake MAC failure." }
  ];

  for(const { keyRejected, reason } of rejections) {

    test("an in-band rejection for " + JSON.stringify(reason) + " is " + (keyRejected ? "a permanent key rejection" : "a transient handshake rejection"), async () => {

      const transport = new MockTransport();
      const promise = startNoise({ transport });

      transport.pushNoiseHandshakeFrame(goodHello);
      await Promise.resolve();
      transport.pushNoiseHandshakeFrame(Buffer.concat([ Buffer.from([1]), Buffer.from(reason, "utf8") ]));

      await assert.rejects(promise, (err: unknown) => {

        if(keyRejected) {

          assert.ok(err instanceof EncryptionKeyInvalidError, "ESPHome's wrong-key reason must fail with EncryptionKeyInvalidError");
          assert.equal(err.code, "NOISE_HANDSHAKE_FAILED", "the key rejection keeps the code consumers already match on");
          assert.ok(err instanceof PermanentError, "a rejected key must be permanent so the default reconnect predicate gives up");

          return true;
        }

        assert.ok(err instanceof NoiseHandshakeError, "any other reason must fail with NoiseHandshakeError");
        assert.equal(err.code, "HANDSHAKE_REJECTED");
        assert.equal(err instanceof PermanentError, false, "a protocol fault must stay transient so the reconnect supervisor may retry it");
        assert.ok(err.message.includes(reason), "the device's reason must be carried in the message");

        return true;
      });
    });
  }
});

const goodHello = Buffer.concat([ Buffer.from([1]), Buffer.from("device\x00", "utf8") ]);

// Drive performNoiseHandshake to the point where the client has emitted its NNpsk0 msg1, then build a REAL responder msg2 against that exact msg1 so the client's
// readMessage processes a genuine reply. The returned `msg2` is the raw responder handshake message (NOT yet prefixed with the success header byte); a caller either
// pushes it untouched to complete the handshake or mutates it to provoke a specific readMessage failure code, then prefixes the `0x00` success header and pushes it as
// the server-handshake reply. The PSK matches VALID_PSK so the shared-secret derivation lines up. We poll the transport's captured outbound frames until the client's
// msg1 (the second handshake frame; the first is the empty initial) is present, rather than guessing a fixed number of microtask hops.
const driveToServerHandshakeReply = async (transport: MockTransport, args: NoiseTestArgs = {}): Promise<{ msg2: Buffer; promise: Promise<void> }> => {

  const promise = startNoise({ ...args, transport });

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

// A device that answers the client's handshake message and then closes its socket. On the client's second handshake frame the mock captures it through the base
// method, queues the answer the row builds from the raw handshake message, and then fails with the ordinary peer close the real transport stores once the device has
// spoken Noise, so the step's next read meets a queued frame behind a stored fault. The install is observed so a row can inspect the cipher pair the step offered.
const answerThenClose = (answer: (clientMessage: Buffer) => Buffer): { offered: NoiseCipherPair[]; peerClose: ConnectionClosedByPeerError; transport: MockTransport } => {

  const transport = new MockTransport();
  const offered: NoiseCipherPair[] = [];
  const peerClose = new ConnectionClosedByPeerError("Peer closed the socket.", "PEER_CLOSED");
  const install = transport.installCipher.bind(transport);
  const send = transport.sendNoiseHandshakeFrame.bind(transport);

  transport.installCipher = (cipher: NoiseCipherPair): void => {

    offered.push(cipher);
    install(cipher);
  };

  transport.sendNoiseHandshakeFrame = async (frame: Buffer): Promise<void> => {

    await send(frame);

    // The client prefixes its handshake message with a single zero header byte, so the answer reads the message after it.
    if(transport.outboundHandshakeFrames.length === 2) {

      transport.pushNoiseHandshakeFrame(answer(frame.subarray(1)));
      transport.fail(peerClose);
    }
  };

  return { offered, peerClose, transport };
};

describe("performNoiseHandshake - a reply queued behind the device's close", () => {

  test("an in-band key rejection the device closes behind is the permanent key rejection, not the close", async () => {

    const { transport } = answerThenClose((): Buffer => Buffer.concat([ Buffer.from([1]), Buffer.from("Handshake MAC failure", "utf8") ]));
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);

    await assert.rejects(promise, (err: unknown) => {

      assert.ok(err instanceof EncryptionKeyInvalidError, "the rejection the device sent before it closed must reach the step ahead of the close");
      assert.equal(err.code, "NOISE_HANDSHAKE_FAILED");
      assert.ok(err instanceof PermanentError, "a rejected key must be permanent so the default reconnect predicate gives up");

      return true;
    });
  });

  test("a valid reply the device closes behind is read, the install refuses the closed transport, and the failure path destroys the offered pair", async () => {

    const { offered, peerClose, transport } = answerThenClose((clientMessage: Buffer): Buffer => {

      const responder = createESPHomeHandshake({ psk: Buffer.from(VALID_PSK, "base64"), role: "responder" });

      responder.readMessage(clientMessage);

      return Buffer.concat([ Buffer.from([0]), Buffer.from(responder.writeMessage(Buffer.from("server-hello", "utf8"))) ]);
    });
    const promise = startNoise({ transport });

    transport.pushNoiseHandshakeFrame(goodHello);

    await assert.rejects(promise, (err: unknown): boolean => err === peerClose);

    const [cipher] = offered;

    assert.equal(offered.length, 1, "the step must read the reply queued before the close and offer its cipher pair to the install");
    assert.ok(cipher);
    assert.equal(cipher.sendCipher.HasKey(), false, "the refused send cipher must hold no key once the step's failure path has run");
    assert.equal(cipher.receiveCipher.HasKey(), false, "the refused receive cipher must hold no key once the step's failure path has run");
  });
});

describe("performNoiseHandshake - duration metric", () => {

  test("reports noise.handshake.duration_ms from the injected clock, so time the clock advances between the hello and the finish is what it records", async () => {

    const transport = new MockTransport();
    const timings: { durationMs: number; name: string }[] = [];
    const metrics: ClientMetrics = {

      gauge: (): void => { /* discard */ },
      increment: (): void => { /* discard */ },
      timing: (name: string, durationMs: number): void => { timings.push({ durationMs, name }); }
    };
    let clockMs = 1000;
    const { msg2, promise } = await driveToServerHandshakeReply(transport, { metrics, now: (): number => clockMs });

    // The wall clock barely moves while the test runs, so only a duration read through the injected clock can report this span.
    clockMs += 4321;
    pushReply(transport, msg2);

    await promise;

    assert.deepEqual(timings, [{ durationMs: 4321, name: "noise.handshake.duration_ms" }]);
    assert.ok(transport.cipher, "the handshake must have completed and installed its cipher pair");
  });
});

describe("performNoiseHandshake - readMessage failure re-tagging", () => {

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
});

describe("performNoiseHandshake - abort handling", () => {

  test("rethrows the timeout signal's own TimeoutError unchanged", async () => {

    // The server hello never arrives, so the handshake parks until the signal's timeout fires; the rejection must be that signal's reason itself, not a relabelled
    // library error.
    const transport = new MockTransport();
    const signal = AbortSignal.timeout(10);
    const promise = startNoise({ signal, transport });

    await assert.rejects(promise, (err: unknown): boolean => err === signal.reason);
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
      { code: "API_MAJOR_OUT_OF_RANGE", constructor: NegotiationFailedError }
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
      { code: "API_MAJOR_OUT_OF_RANGE", constructor: NegotiationFailedError }
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
      pskConfigured: false,
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
      pskConfigured: false,
      receiver,
      setApiMinorVersion: (): void => { /* discard */ },
      signal: AbortSignal.timeout(2000),
      supportedApiMajors: SUPPORTED_API_MAJORS,
      transport
    });

    setImmediate(() => transport.fail(new ProtocolError("Server returned noise indicator byte.", "PROTOCOL_MISMATCH")));

    await assert.rejects(promise, EncryptionRequiredError);

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
      pskConfigured: false,
      receiver,
      setApiMinorVersion: (): void => { /* discard */ },
      signal: AbortSignal.timeout(2000),
      supportedApiMajors: SUPPORTED_API_MAJORS,
      transport
    });

    setImmediate(() => transport.fail(new Error("socket closed")));

    await assert.rejects(promise, { constructor: Error, message: "socket closed" });

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

    // Yield between pushes so the receiver's pump hands each message to a parked awaiter. The burst test below covers the buffered path, where the receiver hands
    // messages over in arrival order.
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

  test("applies every entity response of a burst that arrives ahead of the done sentinel before the entities event fires", async () => {

    const transport = new MockTransport();
    const receiver = new MessageReceiver(transport);
    const events: string[] = [];

    const promise = performDiscovery({

      applyDeviceInfo: (): void => { /* discard */ },
      applyListEntity: (type: number): void => { events.push("entity " + String(type)); },
      applyListServiceEntity: (): void => { /* discard */ },
      countEntities: (): number => 2,
      countServices: (): number => 0,
      emitDeviceInfo: (): void => { events.push("deviceInfo"); },
      emitEntities: (): void => { events.push("entities"); },
      emitServices: (): void => { /* discard */ },
      listEntitiesMessageTypes: new Set([ MessageType.LIST_ENTITIES_LIGHT_RESPONSE, MessageType.LIST_ENTITIES_SWITCH_RESPONSE ]),
      metrics: undefined,
      receiver,
      signal: AbortSignal.timeout(2000),
      transport
    });

    // Settle the device info first, so discovery is parked on its next wait when the burst lands.
    transport.pushInbound(MessageType.DEVICE_INFO_RESPONSE, Buffer.alloc(0));
    await new Promise<void>((resolve): void => { setImmediate(resolve); });

    // The whole burst arrives before discovery resumes: the light response settles the parked wait and the switch response and the done sentinel wait in the buffer.
    // The switch response arrived first, so it must reach discovery before the sentinel ends the loop.
    transport.pushInbound(MessageType.LIST_ENTITIES_LIGHT_RESPONSE, Buffer.alloc(0));
    transport.pushInbound(MessageType.LIST_ENTITIES_SWITCH_RESPONSE, Buffer.alloc(0));
    transport.pushInbound(MessageType.LIST_ENTITIES_DONE_RESPONSE, Buffer.alloc(0));

    await promise;

    assert.deepEqual(events, [
      "deviceInfo", "entity " + String(MessageType.LIST_ENTITIES_LIGHT_RESPONSE), "entity " + String(MessageType.LIST_ENTITIES_SWITCH_RESPONSE), "entities"
    ]);

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

    await assert.rejects(promise, { constructor: DOMException, name: "TimeoutError" });

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

    await assert.rejects(promise, { constructor: DOMException, name: "TimeoutError" });

    receiver[Symbol.dispose]();
  });
});
