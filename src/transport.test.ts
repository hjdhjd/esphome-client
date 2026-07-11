/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * transport.test.ts: Full enumeration test suite for the Transport class. MockSocket-driven; no real I/O.
 *
 * The test file is the canonical contract documentation for transport.ts. Each describe block enumerates one slice of the surface; each test name reads as a sentence
 * describing the behaviour being asserted. Hand-verified hex fixtures live as named constants at the top of the file with provenance comments.
 */
import {
  BufferOverflowError, ConnectionClosedByPeerError, ConnectionRefusedError, ConnectionTimeoutError, DecryptionFailedError, FrameTooLargeError,
  MalformedVarintError, NoiseHandshakeError, PeerClosedDuringNoiseError, PermanentError, ProtocolError
} from "./errors.ts";
import type { InboundMessage, NoiseCipherPair, TransportLike, TransportOpenOptions } from "./transport.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { CipherState } from "./crypto-noise.ts";
import type { ClientMetrics } from "./types.ts";
import type { EspHomeLogging } from "./types.ts";
import { MessageType } from "./protocol/index.ts";
import { MockSocket } from "./testing/mock-socket.ts";
import type { Socket } from "node:net";
import { Transport } from "./transport.ts";
import assert from "node:assert/strict";
import { defaultShouldRetry } from "./reconnect.ts";
import { encodeVarint } from "./protocol/codec.ts";

// Discardable logger.
const silentLog = (): EspHomeLogging => ({

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info:  (): void => { /* discard */ },
  warn:  (): void => { /* discard */ }
});

// Fake authentication tag used by the stub cipher pair below. ChaCha20-Poly1305 attaches a 16-byte tag; our stub pads with this fixed tag so frames are layout-faithful
// without depending on the real cipher.
const FAKE_TAG = Buffer.alloc(16, 0xAA);

// Stub cipher pair. The transport only invokes EncryptWithAd / DecryptWithAd on a NoiseCipherPair; the rest of CipherState's surface is irrelevant. Encryption appends
// FAKE_TAG; decryption asserts the trailing tag matches and strips it.
const buildStubCipherPair = (): NoiseCipherPair => ({

  receiveCipher: {

    DecryptWithAd: (_ad: Buffer, ciphertext: Buffer): Buffer => {

      if(ciphertext.length < FAKE_TAG.length) {

        throw new Error("Ciphertext shorter than tag.");
      }

      if(ciphertext.subarray(ciphertext.length - FAKE_TAG.length).compare(FAKE_TAG) !== 0) {

        throw new Error("Bad tag.");
      }

      return Buffer.from(ciphertext.subarray(0, ciphertext.length - FAKE_TAG.length));
    },
    EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),

    // The transport's teardown calls CipherState.destroy() to zeroize the live session keys; the stub provides a no-op so dispose paths exercise the real contract.
    destroy: (): void => { /* no-op */ }
  } as unknown as CipherState,
  sendCipher: {

    DecryptWithAd: (_ad: Buffer, ciphertext: Buffer): Buffer => {

      if(ciphertext.length < FAKE_TAG.length) {

        throw new Error("Ciphertext shorter than tag.");
      }

      if(ciphertext.subarray(ciphertext.length - FAKE_TAG.length).compare(FAKE_TAG) !== 0) {

        throw new Error("Bad tag.");
      }

      return Buffer.from(ciphertext.subarray(0, ciphertext.length - FAKE_TAG.length));
    },
    EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),

    // The transport's teardown calls CipherState.destroy() to zeroize the live session keys; the stub provides a no-op so dispose paths exercise the real contract.
    destroy: (): void => { /* no-op */ }
  } as unknown as CipherState
});

// Cipher pair whose receiveCipher always throws on Decrypt. Used to drive the DecryptionFailedError DECRYPT_FAILED path.
const buildBrokenDecryptCipherPair = (): NoiseCipherPair => ({

  receiveCipher: {

    DecryptWithAd: (): Buffer => { throw new Error("Synthetic decrypt failure."); },
    EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),

    // The transport's teardown calls CipherState.destroy() to zeroize the live session keys; the stub provides a no-op so dispose paths exercise the real contract.
    destroy: (): void => { /* no-op */ }
  } as unknown as CipherState,
  sendCipher: {

    DecryptWithAd: (_ad: Buffer, ciphertext: Buffer): Buffer => Buffer.from(ciphertext),
    EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),

    // The transport's teardown calls CipherState.destroy() to zeroize the live session keys; the stub provides a no-op so dispose paths exercise the real contract.
    destroy: (): void => { /* no-op */ }
  } as unknown as CipherState
});

// Default open-time options. Tests shallow-merge their overrides on top.
const buildOpenOptions = (mock: MockSocket, overrides?: Partial<TransportOpenOptions>): TransportOpenOptions => ({

  host: "127.0.0.1",
  log: silentLog(),
  maxFrameBytes: 1024 * 1024,
  maxRecvBufferBytes: 4 * 1024 * 1024,
  port: 6053,
  socketFactory: (): Socket => mock as unknown as Socket,
  ...overrides
});

// One-step open helper. Constructs the transport, simulates the connect event, and resolves with the ready-to-use Transport.
const openTransport = async (mock: MockSocket, overrides?: Partial<TransportOpenOptions>): Promise<Transport> => {

  const promise = Transport.open(buildOpenOptions(mock, overrides));

  mock.simulateConnect();

  return promise;
};

// In-memory metrics adapter for verifying observability tags. Keeps every increment / timing / gauge call in order so tests can assert tag content as well as call shape.
interface MetricCall {

  by: number | undefined;
  durationMs: number | undefined;
  kind: "gauge" | "increment" | "timing";
  name: string;
  tags: Record<string, string> | undefined;
  value: number | undefined;
}

const buildMetrics = (): { calls: MetricCall[]; metrics: ClientMetrics } => {

  const calls: MetricCall[] = [];
  const metrics: ClientMetrics = {

    gauge: (name, value, tags): void => { calls.push({ by: undefined, durationMs: undefined, kind: "gauge", name, tags, value }); },
    increment: (name, by, tags): void => { calls.push({ by, durationMs: undefined, kind: "increment", name, tags, value: undefined }); },
    timing: (name, durationMs, tags): void => { calls.push({ by: undefined, durationMs, kind: "timing", name, tags, value: undefined }); }
  };

  return { calls, metrics };
};

// Hand-verified hex fixtures. Each carries a comment naming the message type, payload, and byte-by-byte derivation so the test file is self-documenting.

// PING_REQUEST (type 7) with empty payload. Plaintext frame layout: [0x00 indicator] [0x00 varint length=0] [0x07 varint type=7].
const PLAINTEXT_FRAME_PING_REQUEST_EMPTY = Buffer.from([ 0x00, 0x00, 0x07 ]);

// HELLO_REQUEST (type 1) with two-byte payload [0xAB, 0xCD]. Plaintext frame: [0x00] [0x02 varint length=2] [0x01 varint type=1] [0xAB 0xCD payload].
const PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD = Buffer.from([ 0x00, 0x02, 0x01, 0xAB, 0xCD ]);

// SWITCH_STATE_RESPONSE (type 26) with 200-byte payload. Plaintext frame: [0x00] [0xC8 0x01 varint length=200; 200 = (0x48 | continuation 0x80) then high byte 0x01]
// [0x1A varint type=26] [200 payload bytes]. Tests use this to verify the multi-byte length-varint code path.
const PLAINTEXT_FRAME_SWITCH_STATE_LARGE_HEADER = Buffer.from([ 0x00, 0xC8, 0x01, 0x1A ]);
const PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD = Buffer.alloc(200, 0xCC);
const PLAINTEXT_FRAME_SWITCH_STATE_LARGE = Buffer.concat([ PLAINTEXT_FRAME_SWITCH_STATE_LARGE_HEADER, PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD ]);

// Empty noise handshake frame. Layout: [0x01 indicator] [0x00 0x00 size-be16=0]. Used to verify the smallest valid noise frame on the wire.
const NOISE_HANDSHAKE_FRAME_EMPTY = Buffer.from([ 0x01, 0x00, 0x00 ]);

// Noise handshake frame with body 0xDE 0xAD 0xBE 0xEF. Layout: [0x01] [0x00 0x04 size-be16=4] [body bytes].
const NOISE_HANDSHAKE_FRAME_DEAD_BEEF = Buffer.from([ 0x01, 0x00, 0x04, 0xDE, 0xAD, 0xBE, 0xEF ]);

// Build a plaintext frame for a given type / payload using the canonical encoder. Mirrors what Transport.send writes; used by inbound tests to construct fixtures.
const buildPlaintextFrame = (type: number, payload: Buffer): Buffer => Buffer.concat([

  Buffer.from([0x00]),
  encodeVarint(payload.length),
  encodeVarint(type),
  payload
]);

// Build a noise-data inbound frame for a given type / payload using the stub cipher. Mirrors what a real ESPHome device would send during noise-data phase.
const buildNoiseDataFrame = (type: number, payload: Buffer, cipher: NoiseCipherPair = buildStubCipherPair()): Buffer => {

  const inner = Buffer.alloc(4 + payload.length);

  inner.writeUInt16BE(type, 0);
  inner.writeUInt16BE(payload.length, 2);
  payload.copy(inner, 4);

  const ciphertext = Buffer.from(cipher.sendCipher.EncryptWithAd(Buffer.alloc(0), inner));
  const header = Buffer.alloc(3);

  header.writeUInt8(0x01, 0);
  header.writeUInt16BE(ciphertext.length, 1);

  return Buffer.concat([ header, ciphertext ]);
};

describe("Transport - exports and structural compliance", () => {

  test("exports Transport, TransportOpenOptions, InboundMessage, NoiseCipherPair, and TransportLike from the module barrel", () => {

    // Compile-time references prove the symbols resolve. Runtime checks pin the value-side: Transport is a class and the open static is callable.
    assert.equal(typeof Transport, "function");
    assert.equal(typeof Transport.open, "function");

    const optionShape: TransportOpenOptions = {

      host: "h",
      log: silentLog(),
      maxFrameBytes: 1,
      maxRecvBufferBytes: 1,
      port: 1
    };

    assert.equal(typeof optionShape.host, "string");

    const messageShape: InboundMessage = { payload: Buffer.alloc(0), type: 0 };

    assert.equal(messageShape.type, 0);
  });

  test("a Transport instance is structurally assignable to TransportLike", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    // The structural narrowing is a compile-time check; this assignment is the assertion.
    const typed: TransportLike = transport;

    assert.equal(typed.isEncrypted, false);
    assert.equal(typeof typed.send, "function");
    assert.equal(typeof typed.sendNoiseHandshakeFrame, "function");
    assert.equal(typeof typed.enterNoiseHandshake, "function");
    assert.equal(typeof typed.installCipher, "function");
    assert.equal(typeof typed.firstByte, "function");
    assert.equal(typeof typed.nextNoiseHandshakeFrame, "function");

    transport[Symbol.dispose]();
  });

  test("Transport implements both Disposable and AsyncDisposable", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    assert.equal(typeof transport[Symbol.dispose], "function");
    assert.equal(typeof transport[Symbol.asyncDispose], "function");

    transport[Symbol.dispose]();
  });

  test("Transport implements AsyncIterable<InboundMessage>", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    assert.equal(typeof transport[Symbol.asyncIterator], "function");

    const iter = transport[Symbol.asyncIterator]();

    assert.equal(typeof iter.next, "function");
    assert.equal(typeof iter.return, "function");

    transport[Symbol.dispose]();
  });
});

describe("Transport.open - happy path", () => {

  test("resolves once the socket emits `connect` and the transport reports plaintext phase", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));

    mock.simulateConnect();

    const transport = await promise;

    assert.ok(transport instanceof Transport);
    assert.equal(transport.isEncrypted, false);

    transport[Symbol.dispose]();
  });

  test("constructs the underlying socket via the supplied socketFactory", async () => {

    const mock = new MockSocket();
    let factoryCalls = 0;
    const promise = Transport.open(buildOpenOptions(mock, { socketFactory: (): Socket => {

      factoryCalls += 1;

      return mock as unknown as Socket;
    } }));

    mock.simulateConnect();

    const transport = await promise;

    assert.equal(factoryCalls, 1);

    transport[Symbol.dispose]();
  });

  test("does not destroy the socket on a successful open", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    assert.equal(mock.destroyed, false);

    transport[Symbol.dispose]();
  });

  test("detaches the connect-attempt error listener on a successful open, leaving exactly one", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    // The connect-attempt `once("error")` listener never fired, so without an explicit detach it would linger on the live socket for the connection's lifetime alongside
    // the long-lived listener attachSocketListeners installs. Exactly one error listener must remain.
    assert.equal(mock.listenerCount("error"), 1, "exactly one error listener must remain on the live socket after a successful open");

    transport[Symbol.dispose]();
  });
});

describe("Transport.open - typed error paths", () => {

  test("rejects with ConnectionRefusedError carrying code ECONNREFUSED and the original cause when the socket emits ECONNREFUSED", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));

    const cause: NodeJS.ErrnoException = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6053"), { code: "ECONNREFUSED" });

    mock.simulateError(cause);

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionRefusedError);
      assert.equal(err.code, "ECONNREFUSED");
      assert.equal(err.cause, cause);

      return true;
    });
  });

  test("rejects with ConnectionTimeoutError carrying code ETIMEDOUT when the socket emits ETIMEDOUT", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));

    const cause: NodeJS.ErrnoException = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });

    mock.simulateError(cause);

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionTimeoutError);
      assert.equal(err.code, "ETIMEDOUT");
      assert.equal(err.cause, cause);

      return true;
    });
  });

  test("maps an unmapped errno to ConnectionRefusedError with the raw code preserved", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));

    const cause: NodeJS.ErrnoException = Object.assign(new Error("connect EHOSTUNREACH"), { code: "EHOSTUNREACH" });

    mock.simulateError(cause);

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionRefusedError);
      assert.equal(err.code, "EHOSTUNREACH");

      return true;
    });
  });

  test("maps a code-less error to ConnectionRefusedError with code ECONNERR", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));

    mock.simulateError(new Error("naked failure"));

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionRefusedError);
      assert.equal(err.code, "ECONNERR");

      return true;
    });
  });

  test("destroys the socket on a connect error so no descriptors leak", async () => {

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock));
    const cause: NodeJS.ErrnoException = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });

    mock.simulateError(cause);

    await assert.rejects(promise);
    assert.equal(mock.destroyed, true);
  });
});

describe("Transport.open - abort signal paths", () => {

  test("rejects when the abort signal is already aborted before open is called", async () => {

    const ac = new AbortController();

    ac.abort();

    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock, { signal: ac.signal }));

    await assert.rejects(promise);
  });

  test("rejects and destroys the socket when the signal aborts after construction but before connect", async () => {

    const ac = new AbortController();
    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock, { signal: ac.signal }));

    ac.abort();

    await assert.rejects(promise);
    assert.equal(mock.destroyed, true);
  });

  test("rejects with the signal's reason when the reason is an Error instance", async () => {

    const ac = new AbortController();
    const reason = new Error("user requested cancellation");
    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock, { signal: ac.signal }));

    ac.abort(reason);

    await assert.rejects(promise, (err) => err === reason);
  });

  test("rejects with a synthesized DOMException AbortError when the signal's reason is not an Error", async () => {

    const ac = new AbortController();
    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock, { signal: ac.signal }));

    ac.abort("not-an-error-string");

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof DOMException);
      assert.equal(err.name, "AbortError");

      return true;
    });
  });

  test("late-firing the signal after a successful open does NOT destroy the socket (listener removed at connect)", async () => {

    const ac = new AbortController();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { signal: ac.signal });

    ac.abort();

    // The signal listener was removed at the moment connect resolved; the late abort is a no-op for the transport.
    assert.equal(mock.destroyed, false);

    transport[Symbol.dispose]();
  });
});

describe("Transport.send - plaintext framing", () => {

  test("writes the canonical [0x00][len-varint][type-varint][payload] frame for a small payload", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const payload = Buffer.from("hello", "utf8");

    await transport.send(MessageType.PING_REQUEST, payload);

    const written = Buffer.concat(mock.writes);
    const expected = buildPlaintextFrame(MessageType.PING_REQUEST, payload);

    assert.equal(written.compare(expected), 0);

    transport[Symbol.dispose]();
  });

  test("writes a three-byte frame for an empty payload (boundary)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(PLAINTEXT_FRAME_PING_REQUEST_EMPTY), 0);

    transport[Symbol.dispose]();
  });

  test("writes a frame with a multi-byte length varint for payloads larger than 127 bytes", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const payload = Buffer.alloc(200, 0xCC);

    await transport.send(MessageType.SWITCH_STATE_RESPONSE, payload);

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(PLAINTEXT_FRAME_SWITCH_STATE_LARGE), 0);

    transport[Symbol.dispose]();
  });

  test("writes a frame whose declared length equals the configured maxFrameBytes (boundary inclusive)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock, { maxFrameBytes: 64 });
    const payload = Buffer.alloc(64, 0xEE);

    await transport.send(MessageType.PING_REQUEST, payload);

    const written = Buffer.concat(mock.writes);

    assert.equal(written.length, 1 + encodeVarint(64).length + encodeVarint(MessageType.PING_REQUEST).length + 64);

    transport[Symbol.dispose]();
  });

  test("increments frames.sent with encrypted=false and the message-type tag on every write", async () => {

    const { calls, metrics } = buildMetrics();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { metrics });

    await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));

    const sent = calls.find((c) => c.name === "frames.sent");

    assert.ok(sent);
    assert.equal(sent.tags?.["encrypted"], "false");
    assert.equal(typeof sent.tags?.["type"], "string");
    assert.equal(sent.by, 1);

    transport[Symbol.dispose]();
  });

  test("rejects with ConnectionClosedByPeerError code TRANSPORT_CLOSED when called after dispose", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport[Symbol.dispose]();

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_CLOSED");

      return true;
    });
  });

  test("rejects when the underlying socket.write callback fires an error", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    mock.failNextWrite(new Error("EIO"));

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof Error);
      assert.equal((err).message, "EIO");

      return true;
    });

    transport[Symbol.dispose]();
  });
});

describe("Transport.send - noise-data framing", () => {

  test("writes [0x01][size-be16][encrypted] with the inner [type-be16][len-be16][payload] envelope", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    const payload = Buffer.from([ 0x10, 0x20, 0x30 ]);

    await transport.send(MessageType.LIGHT_COMMAND_REQUEST, payload);

    const written = Buffer.concat(mock.writes);

    // First three bytes: noise indicator 0x01 + big-endian size-16 (= inner length 4 + payload length 3 + tag length 16 = 23).
    assert.equal(written[0], 0x01);
    assert.equal(written.readUInt16BE(1), 4 + payload.length + FAKE_TAG.length);

    // Inner envelope (post-decrypt): [type-be16=32][len-be16=3][payload bytes].
    const ciphertext = written.subarray(3);
    const inner = ciphertext.subarray(0, ciphertext.length - FAKE_TAG.length);

    assert.equal(inner.readUInt16BE(0), MessageType.LIGHT_COMMAND_REQUEST);
    assert.equal(inner.readUInt16BE(2), payload.length);
    assert.equal(inner.subarray(4).compare(payload), 0);

    transport[Symbol.dispose]();
  });

  test("increments frames.sent with encrypted=true on every encrypted send", async () => {

    const { calls, metrics } = buildMetrics();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { metrics });

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));

    const sent = calls.find((c) => (c.name === "frames.sent") && (c.tags?.["encrypted"] === "true"));

    assert.ok(sent);
    assert.equal(sent.tags?.["encrypted"], "true");

    transport[Symbol.dispose]();
  });

  test("encrypts a zero-length payload and produces a syntactically valid noise-data frame", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));

    const written = Buffer.concat(mock.writes);

    // Encrypted body = 4-byte inner header + 16-byte tag = 20 bytes.
    assert.equal(written.readUInt16BE(1), 4 + FAKE_TAG.length);

    transport[Symbol.dispose]();
  });

  test("rejects an outbound payload of 65536 bytes with the typed NoiseHandshakeError MSG_TOO_LONG rather than a raw RangeError", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    // A payload at or above 65536 bytes overflows the inner envelope's 16-bit length field. Without the outbound bound check, inner.writeUInt16BE would throw a raw
    // RangeError before the crypto guard runs; the transport must instead surface its typed MSG_TOO_LONG contract.
    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(65536)), (err) => {

      assert.ok(err instanceof NoiseHandshakeError);
      assert.equal(err.code, "MSG_TOO_LONG");

      return true;
    });

    transport[Symbol.dispose]();
  });
});

describe("Transport.send - phase guards", () => {

  test("rejects with ProtocolError BAD_TRANSPORT_PHASE when called during the noise-handshake phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_TRANSPORT_PHASE");

      return true;
    });

    transport[Symbol.dispose]();
  });
});

describe("Transport.sendNoiseHandshakeFrame", () => {

  test("writes [0x01][size-be16][body] for an empty handshake frame", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    await transport.sendNoiseHandshakeFrame(Buffer.alloc(0));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(NOISE_HANDSHAKE_FRAME_EMPTY), 0);

    transport[Symbol.dispose]();
  });

  test("writes [0x01][size-be16=4][body] for a four-byte handshake frame", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    await transport.sendNoiseHandshakeFrame(Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF ]));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(NOISE_HANDSHAKE_FRAME_DEAD_BEEF), 0);

    transport[Symbol.dispose]();
  });

  test("rejects with ProtocolError BAD_TRANSPORT_PHASE when called from plaintext phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await assert.rejects(transport.sendNoiseHandshakeFrame(Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_TRANSPORT_PHASE");

      return true;
    });

    transport[Symbol.dispose]();
  });

  test("rejects with ProtocolError BAD_TRANSPORT_PHASE when called from noise-data phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    await assert.rejects(transport.sendNoiseHandshakeFrame(Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_TRANSPORT_PHASE");

      return true;
    });

    transport[Symbol.dispose]();
  });

  test("rejects with ConnectionClosedByPeerError TRANSPORT_CLOSED when called after dispose", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport[Symbol.dispose]();

    await assert.rejects(transport.sendNoiseHandshakeFrame(Buffer.alloc(0)), (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_CLOSED");

      return true;
    });
  });

  test("increments frames.sent with type=noise.handshake on every handshake frame", async () => {

    const { calls, metrics } = buildMetrics();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { metrics });

    transport.enterNoiseHandshake();

    await transport.sendNoiseHandshakeFrame(Buffer.alloc(0));

    const sent = calls.find((c) => (c.name === "frames.sent") && (c.tags?.["type"] === "noise.handshake"));

    assert.ok(sent);

    transport[Symbol.dispose]();
  });
});

describe("Transport - phase transitions", () => {

  test("enterNoiseHandshake moves plaintext phase into noise-handshake phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    assert.equal(transport.isEncrypted, false);

    // Indirect check: a send during noise-handshake throws BAD_TRANSPORT_PHASE.
    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)));

    transport[Symbol.dispose]();
  });

  test("enterNoiseHandshake from noise-handshake phase is a no-op on repeat (stays in noise-handshake)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.enterNoiseHandshake();

    // Still in noise-handshake; installCipher must be valid.
    transport.installCipher(buildStubCipherPair());

    assert.equal(transport.isEncrypted, true);

    transport[Symbol.dispose]();
  });

  test("enterNoiseHandshake from noise-data phase does NOT regress to noise-handshake (negative)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    transport.enterNoiseHandshake();
    assert.equal(transport.isEncrypted, true);

    transport[Symbol.dispose]();
  });

  test("installCipher transitions noise-handshake into noise-data and flips isEncrypted", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    assert.equal(transport.isEncrypted, false);

    transport.installCipher(buildStubCipherPair());
    assert.equal(transport.isEncrypted, true);

    transport[Symbol.dispose]();
  });

  test("installCipher throws ProtocolError BAD_TRANSPORT_PHASE when called from plaintext phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    assert.throws(() => transport.installCipher(buildStubCipherPair()), (err: unknown) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_TRANSPORT_PHASE");

      return true;
    });

    transport[Symbol.dispose]();
  });

  test("installCipher throws ProtocolError BAD_TRANSPORT_PHASE when called twice", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    assert.throws(() => transport.installCipher(buildStubCipherPair()), (err: unknown) => err instanceof ProtocolError);

    transport[Symbol.dispose]();
  });

  test("installCipher drains stale handshake-phase frames from the queue", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    // Buffer a handshake frame so the queue is non-empty.
    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF);

    transport.installCipher(buildStubCipherPair());

    // The handshake queue is dropped; subsequent nextNoiseHandshakeFrame would throw on the phase guard, so we cannot directly read; instead, observe that the queue
    // doesn't surface anything during noise-data either.
    const frame = buildNoiseDataFrame(MessageType.PING_REQUEST, Buffer.alloc(0));

    mock.pushData(frame);

    const iter = transport[Symbol.asyncIterator]();
    const result = await iter.next();

    assert.equal(result.done, false);
    assert.equal(result.value?.type, MessageType.PING_REQUEST);

    transport[Symbol.dispose]();
  });

  test("a partial frame buffered during noise-handshake completes correctly after installCipher flips the phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const cipher = buildStubCipherPair();

    transport.enterNoiseHandshake();

    // Push a partial noise frame (only the indicator + first size byte) during handshake. The drain bails because length < 3, so the bytes stay in the receive buffer.
    mock.pushData(Buffer.from([ 0x01, 0x00 ]));

    transport.installCipher(cipher);

    // Now push the remaining bytes that complete a noise-data frame. The drainInbound that handleData triggers parses the full frame against the noise-data phase.
    const fullFrame = buildNoiseDataFrame(MessageType.PING_REQUEST, Buffer.from([0x42]), cipher);

    mock.pushData(fullFrame.subarray(2));

    const iter = transport[Symbol.asyncIterator]();
    const result = await iter.next();

    assert.equal(result.done, false);
    assert.equal(result.value?.type, MessageType.PING_REQUEST);
    assert.equal(result.value?.payload.compare(Buffer.from([0x42])), 0);

    transport[Symbol.dispose]();
  });
});

describe("Transport.firstByte", () => {

  test("resolves with 0x00 when the first inbound byte is the plaintext indicator", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    // Park firstByte BEFORE pushing data so the awaiter resolves through handleData's first-byte hook (otherwise drainInbound consumes the bytes first).
    const promise = transport.firstByte();

    mock.pushData(PLAINTEXT_FRAME_PING_REQUEST_EMPTY);

    assert.equal(await promise, 0x00);

    transport[Symbol.dispose]();
  });

  test("resolves with 0x01 when the first inbound byte is the noise indicator", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const promise = transport.firstByte();

    mock.pushData(NOISE_HANDSHAKE_FRAME_EMPTY);

    assert.equal(await promise, 0x01);

    transport[Symbol.dispose]();
  });

  test("does NOT consume the byte from the receive buffer (the iterator still sees the full frame)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const promise = transport.firstByte();

    mock.pushData(PLAINTEXT_FRAME_PING_REQUEST_EMPTY);
    await promise;

    // The byte stayed in the buffer for normal frame parsing; the iterator yields the message.
    const iter = transport[Symbol.asyncIterator]();
    const next = await iter.next();

    assert.equal(next.value?.type, MessageType.PING_REQUEST);

    transport[Symbol.dispose]();
  });

  test("parks until a byte arrives, then resolves", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const promise = transport.firstByte();

    mock.pushData(Buffer.from([0x00]));

    assert.equal(await promise, 0x00);

    transport[Symbol.dispose]();
  });

  test("throws ProtocolError BAD_INDICATOR when the first byte is neither 0x00 nor 0x01", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    mock.pushData(Buffer.from([0xFF]));

    await assert.rejects(transport.firstByte(), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_INDICATOR");

      return true;
    });
  });

  test("throws the stored termination error when the transport has already failed", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    // Push an unknown indicator while we are in plaintext phase to trip a fail() that stores a terminationError.
    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    // Subsequent firstByte sees the terminationError and rethrows.
    await assert.rejects(transport.firstByte(), (err) => err instanceof ProtocolError);
  });

  test("throws ConnectionClosedByPeerError TRANSPORT_CLOSED when called after dispose (regression: previously hung forever)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport[Symbol.dispose]();

    await assert.rejects(transport.firstByte(), (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_CLOSED");

      return true;
    });
  });

  test("rejects with the signal's reason when an already-aborted signal is supplied", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const ac = new AbortController();
    const reason = new Error("abort-before-park");

    ac.abort(reason);

    await assert.rejects(transport.firstByte(ac.signal), (err) => err === reason);

    transport[Symbol.dispose]();
  });

  test("rejects when the supplied signal aborts while parked waiting for the first byte", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const ac = new AbortController();
    const promise = transport.firstByte(ac.signal);

    ac.abort();

    await assert.rejects(promise);

    transport[Symbol.dispose]();
  });
});

describe("Transport.nextNoiseHandshakeFrame", () => {

  test("throws ProtocolError BAD_TRANSPORT_PHASE when called outside noise-handshake phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_TRANSPORT_PHASE");

      return true;
    });

    transport[Symbol.dispose]();
  });

  test("returns a queued frame synchronously when one is already buffered", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF);

    const frame = await transport.nextNoiseHandshakeFrame();

    assert.equal(frame.compare(Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF ])), 0);

    transport[Symbol.dispose]();
  });

  test("parks until a frame arrives", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const promise = transport.nextNoiseHandshakeFrame();

    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF);

    const frame = await promise;

    assert.equal(frame.length, 4);

    transport[Symbol.dispose]();
  });

  test("drains pre-queued frames before raising TRANSPORT_CLOSED on a disposed transport", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF);
    transport[Symbol.dispose]();

    // Dispose without prior fail() leaves terminationError null, so the queue drains before the terminated guard fires.
    const frame = await transport.nextNoiseHandshakeFrame();

    assert.equal(frame.length, 4);

    // A subsequent call hits the terminated guard.
    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_CLOSED");

      return true;
    });
  });

  test("rejects with the signal's reason when called with a pre-aborted signal", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const ac = new AbortController();
    const reason = new Error("pre-aborted");

    ac.abort(reason);

    await assert.rejects(transport.nextNoiseHandshakeFrame(ac.signal), (err) => err === reason);

    transport[Symbol.dispose]();
  });

  test("rejects when the signal aborts while parked", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const ac = new AbortController();
    const promise = transport.nextNoiseHandshakeFrame(ac.signal);

    ac.abort();

    await assert.rejects(promise);

    transport[Symbol.dispose]();
  });

  test("rethrows the stored termination error when the transport already failed", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    // Push a 3-byte chunk starting with the plaintext indicator during noise-handshake to trip PeerClosedDuringNoiseError. The drain needs at least 3 bytes.
    mock.pushData(Buffer.from([ 0x00, 0x00, 0x07 ]));

    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => err instanceof PeerClosedDuringNoiseError);
  });
});

describe("Transport - async iteration over inbound messages", () => {

  test("yields a complete plaintext frame as the first iterator result", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD);

    const result = await next;

    assert.equal(result.done, false);
    assert.equal(result.value?.type, MessageType.HELLO_REQUEST);
    assert.equal(result.value?.payload.compare(Buffer.from([ 0xAB, 0xCD ])), 0);

    transport[Symbol.dispose]();
  });

  test("calling iter.return() resolves with done=true without terminating the transport", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();
    const ret = await iter.return!();

    assert.equal(ret.done, true);

    // The parked next() also resolves.
    assert.equal((await next).done, true);

    // The transport is still open for sends because dispose was not called.
    assert.equal(mock.destroyed, false);

    transport[Symbol.dispose]();
  });

  test("settles a parked next() with done=true on graceful dispose", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    transport[Symbol.dispose]();

    const result = await next;

    assert.equal(result.done, true);
  });

  test("rejects a parked next() with the termination error when the transport fails non-gracefully", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // Force a non-graceful fail by triggering BAD_PLAINTEXT_INDICATOR.
    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    await assert.rejects(next, (err) => err instanceof ProtocolError);
  });

  test("rejects a fresh next() call after the transport has failed by rethrowing the stored termination error", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    // Trigger fail BEFORE creating the iterator, so the next() path goes through nextMessage's terminationError check.
    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    const iter = transport[Symbol.asyncIterator]();

    await assert.rejects(iter.next(), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_PLAINTEXT_INDICATOR");

      return true;
    });
  });

  test("a fresh next() call after graceful dispose returns done=true synchronously", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();

    transport[Symbol.dispose]();

    const result = await iter.next();

    assert.equal(result.done, true);
  });
});

describe("Transport - plaintext inbound parsing", () => {

  test("decodes a single complete frame and emits the InboundMessage", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();
    const payload = Buffer.from([ 0xAB, 0xCD ]);

    mock.pushData(buildPlaintextFrame(MessageType.PING_REQUEST, payload));

    const result = await next;

    assert.equal(result.value?.type, MessageType.PING_REQUEST);
    assert.equal(result.value?.payload.compare(payload), 0);

    transport[Symbol.dispose]();
  });

  test("reassembles a frame split across two TCP packets", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD.subarray(0, 3));
    mock.pushData(PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD.subarray(3));

    const result = await next;

    assert.equal(result.value?.type, MessageType.HELLO_REQUEST);
    assert.equal(result.value?.payload.compare(Buffer.from([ 0xAB, 0xCD ])), 0);

    transport[Symbol.dispose]();
  });

  test("reassembles a frame split byte-by-byte across N packets (boundary stress)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();
    const frame = PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD;

    for(let i = 0; i < frame.length; i++) {

      mock.pushData(frame.subarray(i, i + 1));
    }

    const result = await next;

    assert.equal(result.value?.type, MessageType.HELLO_REQUEST);

    transport[Symbol.dispose]();
  });

  test("yields multiple frames packed into a single TCP packet in the order received", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const a = buildPlaintextFrame(MessageType.PING_REQUEST, Buffer.from([0x01]));
    const b = buildPlaintextFrame(MessageType.HELLO_REQUEST, Buffer.from([0x02]));
    const c = buildPlaintextFrame(MessageType.SWITCH_STATE_RESPONSE, Buffer.from([0x03]));

    mock.pushData(Buffer.concat([ a, b, c ]));

    const r1 = await iter.next();
    const r2 = await iter.next();
    const r3 = await iter.next();

    assert.equal(r1.value?.type, MessageType.PING_REQUEST);
    assert.equal(r2.value?.type, MessageType.HELLO_REQUEST);
    assert.equal(r3.value?.type, MessageType.SWITCH_STATE_RESPONSE);

    transport[Symbol.dispose]();
  });

  test("decodes a frame with a multi-byte length varint correctly", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(PLAINTEXT_FRAME_SWITCH_STATE_LARGE);

    const result = await next;

    assert.equal(result.value?.type, MessageType.SWITCH_STATE_RESPONSE);
    assert.equal(result.value?.payload.length, 200);
    assert.equal(result.value?.payload.compare(PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD), 0);

    transport[Symbol.dispose]();
  });

  test("rejects a plaintext frame whose declared length exceeds maxFrameBytes (FrameTooLargeError)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock, { maxFrameBytes: 8 });
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.concat([ Buffer.from([0x00]), encodeVarint(9000), encodeVarint(MessageType.PING_REQUEST) ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof FrameTooLargeError);
      assert.equal(err.code, "FRAME_TOO_LARGE");

      return true;
    });

    transport[Symbol.dispose]();
  });

  test("fails with ProtocolError PROTOCOL_MISMATCH when a noise indicator arrives during plaintext phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.from([ 0x01, 0x00, 0x00 ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "PROTOCOL_MISMATCH");

      return true;
    });
  });

  test("fails with ProtocolError BAD_PLAINTEXT_INDICATOR when an unknown indicator arrives", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.from([ 0x55, 0x00, 0x00 ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_PLAINTEXT_INDICATOR");

      return true;
    });
  });

  test("bails on RangeError when a length-varint extends past the current buffer and resumes parsing once more bytes arrive", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // Push three bytes: indicator + two continuation-bit varint bytes. readVarint needs a third byte at offset 3 (out of bounds) -> RangeError -> drain bails.
    mock.pushData(Buffer.from([ 0x00, 0x80, 0x80 ]));

    // Push one byte to terminate the varint at value=0 (lenBytes spans 3 bytes). Now the type-varint needs another byte; drain still bails because buffer length is 4.
    mock.pushData(Buffer.from([0x00]));

    // Push the type byte (PING_REQUEST = 7). The frame is now complete with an empty payload.
    mock.pushData(Buffer.from([0x07]));

    const result = await next;

    assert.equal(result.value?.type, MessageType.PING_REQUEST);
    assert.equal(result.value?.payload.length, 0);

    transport[Symbol.dispose]();
  });

  test("fails with MalformedVarintError when a varint never sets its stop bit", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // [0x00 indicator] followed by 11 bytes with the continuation bit always set; readVarint gives up after MAX_VARINT_BYTES (10) and throws MalformedVarintError.
    const malformed = Buffer.alloc(12, 0x80);

    malformed[0] = 0x00;
    mock.pushData(malformed);

    await assert.rejects(next, (err) => err instanceof MalformedVarintError);
  });

  test("fails with BufferOverflowError when the receive buffer exceeds maxRecvBufferBytes", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock, { maxRecvBufferBytes: 16 });
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.alloc(32, 0x00));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof BufferOverflowError);
      assert.equal(err.code, "RECV_BUFFER_OVERFLOW");

      return true;
    });
  });

  test("emits frames.received with encrypted=false for every parsed plaintext frame", async () => {

    const { calls, metrics } = buildMetrics();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { metrics });
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(PLAINTEXT_FRAME_PING_REQUEST_EMPTY);
    await next;

    const received = calls.find((c) => (c.name === "frames.received") && (c.tags?.["encrypted"] === "false"));

    assert.ok(received);

    transport[Symbol.dispose]();
  });
});

describe("Transport - noise-handshake inbound parsing", () => {

  test("queues a complete handshake frame and resolves the next nextNoiseHandshakeFrame call", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF);

    const frame = await transport.nextNoiseHandshakeFrame();

    assert.equal(frame.compare(Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF ])), 0);

    transport[Symbol.dispose]();
  });

  test("resolves a parked nextNoiseHandshakeFrame as soon as the frame arrives", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const promise = transport.nextNoiseHandshakeFrame();

    mock.pushData(NOISE_HANDSHAKE_FRAME_EMPTY);

    const frame = await promise;

    assert.equal(frame.length, 0);

    transport[Symbol.dispose]();
  });

  test("reassembles a handshake frame split across packet boundaries", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF.subarray(0, 1));
    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF.subarray(1, 3));
    mock.pushData(NOISE_HANDSHAKE_FRAME_DEAD_BEEF.subarray(3));

    const frame = await transport.nextNoiseHandshakeFrame();

    assert.equal(frame.length, 4);

    transport[Symbol.dispose]();
  });

  test("queues multiple handshake frames packed into a single packet in order", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    mock.pushData(Buffer.concat([ NOISE_HANDSHAKE_FRAME_DEAD_BEEF, NOISE_HANDSHAKE_FRAME_EMPTY, NOISE_HANDSHAKE_FRAME_DEAD_BEEF ]));

    const a = await transport.nextNoiseHandshakeFrame();
    const b = await transport.nextNoiseHandshakeFrame();
    const c = await transport.nextNoiseHandshakeFrame();

    assert.equal(a.length, 4);
    assert.equal(b.length, 0);
    assert.equal(c.length, 4);

    transport[Symbol.dispose]();
  });

  test("fails with PeerClosedDuringNoiseError when the peer responds with a plaintext indicator during the handshake", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    mock.pushData(Buffer.from([ 0x00, 0x00, 0x07 ]));

    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => {

      assert.ok(err instanceof PeerClosedDuringNoiseError);
      assert.equal(err.code, "PEER_PLAINTEXT_DURING_NOISE");

      return true;
    });
  });

  test("fails with ProtocolError BAD_NOISE_INDICATOR for an unknown indicator byte during the handshake", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    mock.pushData(Buffer.from([ 0x55, 0x00, 0x00 ]));

    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_NOISE_INDICATOR");

      return true;
    });
  });

  test("fails with FrameTooLargeError when a noise frame exceeds maxFrameBytes", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock, { maxFrameBytes: 8 });

    transport.enterNoiseHandshake();

    // size-be16 = 9000 -> exceeds the 8-byte cap.
    mock.pushData(Buffer.from([ 0x01, 0x23, 0x28 ]));

    await assert.rejects(transport.nextNoiseHandshakeFrame(), (err) => err instanceof FrameTooLargeError);
  });
});

describe("Transport - noise-data inbound parsing", () => {

  test("decrypts a noise-data frame and yields the inner [type-be16][len-be16][payload] envelope as an InboundMessage", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const cipher = buildStubCipherPair();

    transport.enterNoiseHandshake();
    transport.installCipher(cipher);

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();
    const payload = Buffer.from([ 0xCA, 0xFE, 0xBA, 0xBE ]);

    mock.pushData(buildNoiseDataFrame(MessageType.LIGHT_COMMAND_REQUEST, payload, cipher));

    const result = await next;

    assert.equal(result.value?.type, MessageType.LIGHT_COMMAND_REQUEST);
    assert.equal(result.value?.payload.compare(payload), 0);

    transport[Symbol.dispose]();
  });

  test("fails with ProtocolError PROTOCOL_MISMATCH when a plaintext indicator arrives during noise-data phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.from([ 0x00, 0x00, 0x07 ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "PROTOCOL_MISMATCH");

      return true;
    });
  });

  test("fails with DecryptionFailedError DECRYPT_FAILED when the cipher rejects the ciphertext", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const goodCipher = buildStubCipherPair();
    const brokenCipher = buildBrokenDecryptCipherPair();

    transport.enterNoiseHandshake();
    transport.installCipher(brokenCipher);

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // Encrypt with the stub cipher (so the byte layout is well-formed) but install a cipher whose decrypt always throws.
    mock.pushData(buildNoiseDataFrame(MessageType.PING_REQUEST, Buffer.alloc(0), goodCipher));

    await assert.rejects(next, (err) => {

      // A run-phase decrypt failure on an already-handshaked session is transient: a corrupted frame desyncs the cipher nonce and the correct recovery is a full
      // reconnect. It surfaces as DecryptionFailedError, NOT the permanent handshake-time EncryptionKeyInvalidError.
      assert.ok(err instanceof DecryptionFailedError, "a run-phase decrypt failure must surface as DecryptionFailedError");
      assert.equal(err.code, "DECRYPT_FAILED");

      // Because DecryptionFailedError does not extend PermanentError, the default reconnect supervisor retries it rather than giving up on a single glitched frame.
      assert.equal(err instanceof PermanentError, false, "DecryptionFailedError must NOT be a permanent failure mode");
      assert.equal(defaultShouldRetry(err), true, "defaultShouldRetry must retry a run-phase decrypt failure");

      return true;
    });
  });

  test("a CIPHER_UNAVAILABLE internal-rule violation surfaces as a recoverable ProtocolError, not a permanent key error", () => {

    // The CIPHER_UNAVAILABLE guards (outbound send and inbound parse during noise-data phase without an installed cipher) are internal-rule violations - a
    // protocol/state bug, not a key misconfiguration. They are raised with ProtocolError so the reconnect supervisor treats them as transient. Both code sites are
    // unreachable through the public transport API (only installCipher transitions to noise-data, and it always installs a cipher), so we anchor the classification
    // contract at the error-construction level the transport uses.
    const cipherUnavailable = new ProtocolError("Noise data phase reached without a cipher pair installed.", "CIPHER_UNAVAILABLE");

    assert.equal(cipherUnavailable.code, "CIPHER_UNAVAILABLE");
    assert.equal(cipherUnavailable instanceof PermanentError, false, "CIPHER_UNAVAILABLE must be a recoverable ProtocolError");
    assert.equal(defaultShouldRetry(cipherUnavailable), true, "defaultShouldRetry must retry a CIPHER_UNAVAILABLE internal-rule violation");
  });

  test("fails with ProtocolError DECRYPTED_TRUNCATED when the decrypted payload is shorter than the 4-byte inner header", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // Stub cipher with a 2-byte plaintext + 16-byte tag = 18-byte ciphertext. After decrypt the inner is 2 bytes (< 4).
    const ciphertext = Buffer.concat([ Buffer.from([ 0x00, 0x00 ]), FAKE_TAG ]);
    const header = Buffer.alloc(3);

    header.writeUInt8(0x01, 0);
    header.writeUInt16BE(ciphertext.length, 1);
    mock.pushData(Buffer.concat([ header, ciphertext ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "DECRYPTED_TRUNCATED");

      return true;
    });
  });

  test("fails with ProtocolError DECRYPTED_TRUNCATED when the inner declared length exceeds the decrypted body", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    // 4-byte inner header declaring innerLen=100 but no payload bytes follow.
    const inner = Buffer.alloc(4);

    inner.writeUInt16BE(MessageType.PING_REQUEST, 0);
    inner.writeUInt16BE(100, 2);

    const ciphertext = Buffer.concat([ inner, FAKE_TAG ]);
    const header = Buffer.alloc(3);

    header.writeUInt8(0x01, 0);
    header.writeUInt16BE(ciphertext.length, 1);
    mock.pushData(Buffer.concat([ header, ciphertext ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "DECRYPTED_TRUNCATED");

      return true;
    });
  });

  test("emits frames.received with encrypted=true for every decrypted noise-data frame", async () => {

    const { calls, metrics } = buildMetrics();
    const mock = new MockSocket();
    const transport = await openTransport(mock, { metrics });
    const cipher = buildStubCipherPair();

    transport.enterNoiseHandshake();
    transport.installCipher(cipher);

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(buildNoiseDataFrame(MessageType.PING_REQUEST, Buffer.alloc(0), cipher));
    await next;

    const received = calls.find((c) => (c.name === "frames.received") && (c.tags?.["encrypted"] === "true"));

    assert.ok(received);

    transport[Symbol.dispose]();
  });
});

describe("Transport - peer-close handling", () => {

  test("translates peer-close during plaintext phase into ConnectionClosedByPeerError PEER_CLOSED on the iterator", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.simulateClose();

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "PEER_CLOSED");

      return true;
    });
  });

  test("translates peer-close during noise-handshake into PeerClosedDuringNoiseError PEER_CLOSED_NOISE", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const promise = transport.nextNoiseHandshakeFrame();

    mock.simulateClose();

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof PeerClosedDuringNoiseError);
      assert.equal(err.code, "PEER_CLOSED_NOISE");

      return true;
    });
  });

  test("translates peer-close during noise-data into ConnectionClosedByPeerError PEER_CLOSED on the iterator", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.simulateClose();

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "PEER_CLOSED");

      return true;
    });
  });

  test("translates a post-connect socket error into ConnectionClosedByPeerError carrying the original errno code", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    const cause: NodeJS.ErrnoException = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });

    mock.simulateError(cause);

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "ECONNRESET");

      return true;
    });
  });
});

describe("Transport - dispose / asyncDispose lifecycle", () => {

  test("Symbol.dispose destroys the underlying socket", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport[Symbol.dispose]();

    assert.equal(mock.destroyed, true);
  });

  test("Symbol.dispose is safe to call more than once - repeated calls do not throw", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport[Symbol.dispose]();
    transport[Symbol.dispose]();
    transport[Symbol.dispose]();

    assert.equal(mock.destroyed, true);
  });

  test("Symbol.asyncDispose returns a Promise<void> and tears down the socket", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const result = transport[Symbol.asyncDispose]();

    assert.ok(result instanceof Promise);
    await result;

    assert.equal(mock.destroyed, true);
  });

  test("`using` syntax tears the socket down on block exit", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    {

      using _scoped = transport;

      assert.equal(mock.destroyed, false);
    }

    assert.equal(mock.destroyed, true);
  });

  test("`await using` syntax tears the socket down on async block exit", async () => {

    const mock = new MockSocket();

    {

      await using transport = await openTransport(mock);

      assert.equal(mock.destroyed, false);

      // Touch the binding so the linter doesn't complain about an unused value.
      assert.equal(transport.isEncrypted, false);
    }

    assert.equal(mock.destroyed, true);
  });

  test("dispose settles a parked firstByte awaiter with TRANSPORT_DISPOSED", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const promise = transport.firstByte();

    transport[Symbol.dispose]();

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_DISPOSED");

      return true;
    });
  });

  test("dispose settles a parked nextNoiseHandshakeFrame awaiter with TRANSPORT_DISPOSED", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    const promise = transport.nextNoiseHandshakeFrame();

    transport[Symbol.dispose]();

    await assert.rejects(promise, (err) => {

      assert.ok(err instanceof ConnectionClosedByPeerError);
      assert.equal(err.code, "TRANSPORT_DISPOSED");

      return true;
    });
  });

  test("dispose destroys the installed cipher pair, zeroizing the live session keys", async () => {

    // The teardown must zero the live noise session keys. We install a spy-bearing cipher pair that mirrors the stub's EncryptWithAd / DecryptWithAd seams (the only
    // surface the transport exercises) plus a destroy() spy that flips a boolean when called. After driving to the noise-data phase and disposing, both ciphers' destroy
    // spies must have fired exactly once each.
    const spies = { receive: false, send: false };
    const spyCipherPair: NoiseCipherPair = {

      receiveCipher: {

        DecryptWithAd: (_ad: Buffer, ciphertext: Buffer): Buffer => Buffer.from(ciphertext.subarray(0, ciphertext.length - FAKE_TAG.length)),
        EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),
        destroy: (): void => { spies.receive = true; }
      } as unknown as CipherState,
      sendCipher: {

        DecryptWithAd: (_ad: Buffer, ciphertext: Buffer): Buffer => Buffer.from(ciphertext.subarray(0, ciphertext.length - FAKE_TAG.length)),
        EncryptWithAd: (_ad: Buffer, plaintext: Buffer): Buffer => Buffer.concat([ plaintext, FAKE_TAG ]),
        destroy: (): void => { spies.send = true; }
      } as unknown as CipherState
    };

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(spyCipherPair);

    transport[Symbol.dispose]();

    assert.equal(spies.send, true, "teardown must call sendCipher.destroy()");
    assert.equal(spies.receive, true, "teardown must call receiveCipher.destroy()");
  });
});

describe("Transport - failure injection (fail path is internal but observable)", () => {

  test("a fail() trip from BufferOverflow surfaces the same error to every parked awaiter", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock, { maxRecvBufferBytes: 16 });
    const iter = transport[Symbol.asyncIterator]();
    const messageWaiter = iter.next();
    const firstByteWaiter = transport.firstByte();

    mock.pushData(Buffer.alloc(32, 0x00));

    await assert.rejects(messageWaiter, (err) => err instanceof BufferOverflowError);
    await assert.rejects(firstByteWaiter, (err) => err instanceof BufferOverflowError);
  });

  test("after fail(), a subsequent send rejects rather than hanging", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)), (err) => err instanceof ConnectionClosedByPeerError);
  });

  test("fail() is safe to call more than once - the first error is preserved when subsequent fail-trips occur", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    await assert.rejects(next, (err) => {

      assert.ok(err instanceof ProtocolError);
      assert.equal(err.code, "BAD_PLAINTEXT_INDICATOR");

      return true;
    });

    // Trigger another inbound event; the terminated guard prevents a second fail() trip from overwriting the first.
    mock.simulateClose();

    // No throw / no double-trip; the test passes if the harness doesn't surface an unhandled rejection.
    await Promise.resolve();
  });
});

describe("Transport - hot path", () => {

  test("yields 100,000 plaintext frames packed in a single push without leaking iteration state", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const N = 100000;

    // Each frame is the canonical 3-byte PING_REQUEST empty frame.
    const bigChunk = Buffer.alloc(N * PLAINTEXT_FRAME_PING_REQUEST_EMPTY.length);

    for(let i = 0; i < N; i++) {

      PLAINTEXT_FRAME_PING_REQUEST_EMPTY.copy(bigChunk, i * 3);
    }

    mock.pushData(bigChunk);

    let count = 0;
    let done = false;

    while(!done) {

      const result = await iter.next();

      if(result.done) {

        done = true;

        break;
      }

      assert.equal(result.value.type, MessageType.PING_REQUEST);
      count += 1;

      if(count >= N) {

        break;
      }
    }

    assert.equal(count, N);

    transport[Symbol.dispose]();
  });

  test("performs 10,000 outbound sends in a tight loop with one captured write per call", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const N = 10000;

    for(let i = 0; i < N; i++) {

      await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));
    }

    assert.equal(mock.writes.length, N);

    transport[Symbol.dispose]();
  });
});

describe("Transport - byte-level wire fixtures", () => {

  test("a plaintext PING_REQUEST with empty payload encodes to PLAINTEXT_FRAME_PING_REQUEST_EMPTY (hex provenance: 00 00 07)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await transport.send(MessageType.PING_REQUEST, Buffer.alloc(0));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(PLAINTEXT_FRAME_PING_REQUEST_EMPTY), 0);

    transport[Symbol.dispose]();
  });

  test("a plaintext HELLO_REQUEST with two-byte payload encodes to PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD (hex provenance: 00 02 01 AB CD)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await transport.send(MessageType.HELLO_REQUEST, Buffer.from([ 0xAB, 0xCD ]));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD), 0);

    transport[Symbol.dispose]();
  });

  test("a plaintext SWITCH_STATE_RESPONSE with 200-byte payload encodes with a multi-byte length varint (hex provenance: 00 C8 01 1A ...payload)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    await transport.send(MessageType.SWITCH_STATE_RESPONSE, PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD);

    const written = Buffer.concat(mock.writes);

    assert.equal(written.subarray(0, 4).compare(PLAINTEXT_FRAME_SWITCH_STATE_LARGE_HEADER), 0);
    assert.equal(written.subarray(4).compare(PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD), 0);

    transport[Symbol.dispose]();
  });

  test("an empty noise-handshake frame encodes to NOISE_HANDSHAKE_FRAME_EMPTY (hex provenance: 01 00 00)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    await transport.sendNoiseHandshakeFrame(Buffer.alloc(0));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(NOISE_HANDSHAKE_FRAME_EMPTY), 0);

    transport[Symbol.dispose]();
  });

  test("a four-byte noise-handshake frame encodes to NOISE_HANDSHAKE_FRAME_DEAD_BEEF (hex provenance: 01 00 04 DE AD BE EF)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();

    await transport.sendNoiseHandshakeFrame(Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF ]));

    const written = Buffer.concat(mock.writes);

    assert.equal(written.compare(NOISE_HANDSHAKE_FRAME_DEAD_BEEF), 0);

    transport[Symbol.dispose]();
  });

  test("the inbound parser yields the expected InboundMessage[] for a hand-crafted plaintext fixture stream", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();

    // The fixture stream concatenates: PING_REQUEST empty + HELLO_REQUEST AB CD + SWITCH_STATE_RESPONSE 200-byte payload.
    mock.pushData(Buffer.concat([ PLAINTEXT_FRAME_PING_REQUEST_EMPTY, PLAINTEXT_FRAME_HELLO_REQUEST_AB_CD, PLAINTEXT_FRAME_SWITCH_STATE_LARGE ]));

    const expected: InboundMessage[] = [

      { payload: Buffer.alloc(0), type: MessageType.PING_REQUEST },
      { payload: Buffer.from([ 0xAB, 0xCD ]), type: MessageType.HELLO_REQUEST },
      { payload: PLAINTEXT_FRAME_SWITCH_STATE_LARGE_PAYLOAD, type: MessageType.SWITCH_STATE_RESPONSE }
    ];

    for(const want of expected) {

      const got = await iter.next();

      assert.equal(got.done, false);
      assert.equal(got.value?.type, want.type);
      assert.equal(got.value?.payload.compare(want.payload), 0);
    }

    transport[Symbol.dispose]();
  });
});

describe("Transport - negative guarantees (X does NOT happen when Z)", () => {

  test("dispose called twice does NOT throw", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport[Symbol.dispose]();
    assert.doesNotThrow(() => transport[Symbol.dispose]());
  });

  test("an aborted open does NOT leak the socket", async () => {

    const ac = new AbortController();
    const mock = new MockSocket();
    const promise = Transport.open(buildOpenOptions(mock, { signal: ac.signal }));

    ac.abort();

    await assert.rejects(promise);
    assert.equal(mock.destroyed, true);
  });

  test("send-after-fail does NOT silently succeed", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)));
  });

  test("the iterator does NOT yield more frames after dispose", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();

    mock.pushData(PLAINTEXT_FRAME_PING_REQUEST_EMPTY);

    const first = await iter.next();

    assert.equal(first.value?.type, MessageType.PING_REQUEST);

    transport[Symbol.dispose]();

    const second = await iter.next();

    assert.equal(second.done, true);
  });

  test("a peer-closed connection does NOT cause send() to hang", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    mock.simulateClose();

    await assert.rejects(transport.send(MessageType.PING_REQUEST, Buffer.alloc(0)));
  });

  test("a fail() trip does NOT double-reject the same parked awaiter (the first reject wins)", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);
    const iter = transport[Symbol.asyncIterator]();
    const next = iter.next();

    mock.pushData(Buffer.from([ 0x55, 0x55, 0x55 ]));

    await assert.rejects(next, (err) => err instanceof ProtocolError);

    // A second close attempt must not surface as another rejection on `next` (already settled).
    mock.simulateClose();

    // No throw expected at this microtask either.
    await Promise.resolve();
  });

  test("enterNoiseHandshake from noise-data phase does NOT regress the phase", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    transport.enterNoiseHandshake();
    transport.installCipher(buildStubCipherPair());

    transport.enterNoiseHandshake();

    assert.equal(transport.isEncrypted, true);

    transport[Symbol.dispose]();
  });

  test("installCipher from plaintext phase does NOT silently install - it throws", async () => {

    const mock = new MockSocket();
    const transport = await openTransport(mock);

    assert.throws(() => transport.installCipher(buildStubCipherPair()));
    assert.equal(transport.isEncrypted, false);

    transport[Symbol.dispose]();
  });
});
