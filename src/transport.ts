/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * transport.ts: TCP socket framing and cipher install for ESPHome's plaintext + noise wire protocols.
 */

/**
 * Wire-level transport for the ESPHome native API. Owns the TCP socket, the inbound receive buffer, plaintext and noise framing, and the `installCipher` entry point.
 *
 * @remarks `Transport` is the I/O floor. It knows about the indicator bytes (`0x00` plaintext, `0x01` noise), about varint length prefixes (plaintext)
 * and 16-bit big-endian length prefixes (noise), and about the inner `[type_high][type_low][len_high][len_low][payload]` shape inside an encrypted noise frame. It does
 * NOT know about message types, dispatch, handshake state, or auto-reconnect; those live in `message-receiver` and `esphome-client`.
 *
 * The transport progresses through the following phases:
 *
 * | Phase | Inbound framing | Outbound framing | Cipher |
 * |---|---|---|---|
 * | `plaintext` | `[0x00][len-varint][type-varint][payload]` | same | none |
 * | `noise-handshake` | `[0x01][size-be16][raw-handshake-frame]` | same | none (raw bytes) |
 * | `noise-data` | `[0x01][size-be16][cipher.Decrypt(...)]` -> `[type-be16][len-be16][payload]` | mirror | sendCipher / receiveCipher |
 *
 * Phase transitions happen via {@link Transport.enterNoiseHandshake} and {@link Transport.installCipher}; both are one-way for the lifetime of the transport. A Transport
 * owns exactly one TCP socket from {@link Transport.open} to dispose; there is no in-place reset. To recover from a noise -> plaintext fallback (or any other failure)
 * the caller disposes the failed Transport and constructs a fresh one in `plaintext` phase. This single-shot lifetime is what lets every consumer (notably
 * {@link MessageReceiver}) treat the transport as a monotonic `AsyncIterable<InboundMessage>` and rely on terminal state being permanent.
 *
 * @module transport
 */
import {
  BufferOverflowError, ConnectionClosedByPeerError, ConnectionError, ConnectionRefusedError, ConnectionTimeoutError, DecryptionFailedError, FrameTooLargeError,
  NoiseHandshakeError, PeerClosedDuringNoiseError, ProtocolError
} from "./errors.ts";
import type { ClientMetrics, EspHomeLogging, Nullable } from "./types.ts";
import { createConnection, isIPv6 } from "node:net";
import { encodeVarint, readVarint } from "./protocol/codec.ts";
import { Buffer } from "node:buffer";
import type { CipherState } from "./crypto-noise.ts";
import { NOISE_MAX_MESSAGE_LEN } from "./crypto-noise.ts";
import type { Socket } from "node:net";
import { messageTypeName } from "./protocol/message-types.ts";

/**
 * Indicator bytes that prefix every wire frame. `0x00` introduces a plaintext frame; `0x01` introduces a noise frame. Exported so capture/replay tooling and tests can
 * reference the protocol indicator by name rather than restating the raw byte.
 */
export const ProtocolByte = {

  NOISE: 0x01,
  PLAINTEXT: 0x00
} as const;

/**
 * Shared empty associated-data buffer for the noise AEAD. ESPHome data-phase frames carry no AD, so a single immutable empty buffer is reused for every
 * EncryptWithAd/DecryptWithAd call instead of allocating a throwaway `Buffer.alloc(0)` per encrypted frame.
 */
const EMPTY_AD = Buffer.alloc(0);

/**
 * Phase tag for the transport's framing/cipher state.
 */
const Phase = {

  NOISE_DATA: "noise-data",
  NOISE_HANDSHAKE: "noise-handshake",
  PLAINTEXT: "plaintext"
} as const;

type Phase = typeof Phase[keyof typeof Phase];

/**
 * Construction options for `Transport.open`.
 */
export interface TransportOpenOptions {

  /**
   * Hostname or IP address of the ESPHome device.
   */
  host: string;

  /**
   * Logging adapter for diagnostic output.
   */
  log: EspHomeLogging;

  /**
   * Maximum frame size in bytes. Frames larger than this are rejected with {@link FrameTooLargeError} before any allocation.
   */
  maxFrameBytes: number;

  /**
   * Maximum total bytes in the receive buffer. Exceeding this triggers {@link BufferOverflowError} and tears down the transport. Protects against peers that send
   * partial frames forever.
   */
  maxRecvBufferBytes: number;

  /**
   * Optional metrics adapter. The transport emits `frames.received`, `frames.sent`, and `frames.dropped` counters. No-overhead when undefined.
   */
  metrics?: ClientMetrics;

  /**
   * TCP port. ESPHome's default is `6053`.
   */
  port: number;

  /**
   * Optional cancellation signal scoped to the open attempt only. After connection is established, the signal has no further effect; the caller manages the transport's
   * lifetime explicitly via dispose.
   */
  signal?: AbortSignal;

  /**
   * Optional socket factory. Tests inject a mock socket here; production omits it to use Node's
   * [net.createConnection](https://nodejs.org/api/net.html#netcreateconnectionoptions-connectlistener). The factory must return a
   * [net.Socket](https://nodejs.org/api/net.html#class-netsocket)-compatible duplex stream that emits `connect`, `data`, `end`, `error`, and `close` events.
   */
  socketFactory?: (params: { host: string; port: number }) => Socket;
}

/**
 * One inbound typed message. The async iterator over a `Transport` yields entries of this shape during the `plaintext` and `noise-data` phases.
 */
export interface InboundMessage {

  /**
   * The decrypted inner payload after noise frame decryption (`noise-data` phase) or the raw frame body (`plaintext` phase). In both phases this carries plaintext.
   */
  payload: Buffer;

  /**
   * The numeric message type identifier.
   */
  type: number;
}

/**
 * Cipher state pair installed via `Transport.installCipher`.
 */
export interface NoiseCipherPair {

  /**
   * Cipher used to decrypt inbound frames.
   */
  receiveCipher: CipherState;

  /**
   * Cipher used to encrypt outbound frames.
   */
  sendCipher: CipherState;
}

/**
 * Internal pending awaiter shape for queue parking.
 */
interface Awaiter<T> {

  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
  signal: AbortSignal | undefined;
  signalListener?: () => void;
}

/**
 * Structural interface mirroring the public surface of `Transport`. Both the real `Transport` and the test-only `MockTransport` (from
 * `esphome-client/testing`) implement this so {@link EspHomeClient} can drive either with no concrete-class coupling. Consumers who never write
 * tests can ignore this interface; only the host class and the test infrastructure reference it.
 */
export interface TransportLike extends AsyncDisposable, Disposable, AsyncIterable<InboundMessage> {

  /**
   * Whether the transport is operating in `noise-data` phase (encrypted).
   */
  readonly isEncrypted: boolean;

  /**
   * Send one outbound message. Routes through the active phase's framing.
   *
   * @param type - Message type identifier.
   * @param payload - Encoded message body.
   */
  send(type: number, payload: Buffer): Promise<void>;

  /**
   * Send one raw noise handshake frame. Only valid in `noise-handshake` phase.
   *
   * @param frame - Raw handshake bytes.
   */
  sendNoiseHandshakeFrame(frame: Buffer): Promise<void>;

  /**
   * Transition from `plaintext` to `noise-handshake`. One-way for the lifetime of the open transport.
   */
  enterNoiseHandshake(): void;

  /**
   * Transition from `noise-handshake` to `noise-data`. Installs the cipher pair used to encrypt and decrypt subsequent frames.
   *
   * @param cipher - The receive/send cipher pair from the completed Noise handshake.
   * @throws The fault that ended the transport, or a `TRANSPORT_CLOSED` error after a dispose without one, when the transport has already ended; the cipher pair
   *   is not stored and stays the caller's to destroy.
   */
  installCipher(cipher: NoiseCipherPair): void;

  /**
   * Read the indicator byte at the head of the receive buffer (`0x00` plaintext or `0x01` noise) without consuming it.
   *
   * @param signal - Optional cancellation signal.
   * @returns The indicator byte.
   */
  firstByte(signal?: AbortSignal): Promise<typeof ProtocolByte.NOISE | typeof ProtocolByte.PLAINTEXT>;

  /**
   * Read the next noise handshake frame from the inbound queue. Only valid in `noise-handshake` phase.
   *
   * @param signal - Optional cancellation signal.
   * @returns The raw handshake frame bytes.
   */
  nextNoiseHandshakeFrame(signal?: AbortSignal): Promise<Buffer>;
}

/**
 * Render a host and a port as one piece of display text. An IPv6 literal is wrapped in square brackets (`[2001:db8::5]:6053`); a hostname or an IPv4 address is
 * joined to the port by a plain colon (`garage.local:6053`).
 *
 * An IPv6 literal carries colons of its own, so the plain join yields text a reader cannot split back into a host and a port...`2001:db8::5` on port 6053 reads as
 * `2001:db8::5:6053`, whose last group could be either. Square brackets are the URI authority convention that resolves exactly that ambiguity. `node:net`'s
 * `isIPv6` decides which hosts need them, because it is the platform's own answer and accepts zone-suffixed literals such as `fe80::1%en0` that a hand-rolled
 * colon test would have to special-case. This is display only: the host reaches the socket as a separate field and is never rewritten.
 *
 * @param host - A hostname, an IPv4 address, or an IPv6 literal.
 * @param port - The TCP port.
 * @returns The host and port as display text.
 *
 * @internal
 */
export function formatHostPort(host: string, port: number): string {

  if(isIPv6(host)) {

    return "[" + host + "]:" + String(port);
  }

  return host + ":" + String(port);
}

/**
 * Remove one surrounding pair of square brackets from a host. `[2001:db8::5]` yields `2001:db8::5`; a hostname, an IPv4 address, and a bare IPv6 literal pass through
 * untouched. This is the input-side counterpart of {@link formatHostPort}.
 *
 * Brackets are accepted because they are the URL notation for an IPv6 address a user already has on hand...it is the spelling a browser address bar shows, and it is
 * the spelling {@link formatHostPort} produces for this library's own display text, so text copied back out of a log or an inspect summary arrives bracketed. What the
 * socket and the formatter both want is the bare literal: `node:net` resolves `::1` and treats `[::1]` as a hostname that never resolves, and `isIPv6` reads a
 * bracketed literal as false, which leaves the formatter passing a user's own punctuation through instead of deciding for itself when an address needs brackets.
 * Nothing checks that the brackets wrap an IPv6 literal before they come off, because brackets around any other host never named something reachable, and the
 * platform owns the verdict on host syntax.
 *
 * @param host - A hostname, an IPv4 address, or an IPv6 literal, optionally wrapped in the square brackets of URL notation.
 * @returns The host with one surrounding pair of square brackets removed, or the host unchanged when it carries no such pair.
 *
 * @internal
 */
export function unbracketHost(host: string): string {

  if(host.startsWith("[") && host.endsWith("]")) {

    return host.slice(1, -1);
  }

  return host;
}

/**
 * Wire-level TCP transport. See module docs for the phase model.
 */
export class Transport implements TransportLike {

  /**
   * Options resolved at open time.
   */
  private readonly options: TransportOpenOptions;

  /**
   * Active TCP socket. Set once in {@link Transport.connect}; null only after dispose.
   */
  private socket: Nullable<Socket> = null;

  /**
   * Inbound bytes not yet parsed, held as the chunks the socket delivered, in arrival order. Together with {@link Transport.recvBytes} this is the receive accumulator,
   * mirroring `CameraApi`'s reassembly: a chunk is appended by reference, and {@link Transport.drainInbound} concatenates the list once when a frame can be complete,
   * so a frame split across many chunks is copied once rather than once per chunk. The list never holds an empty chunk, and a drain leaves at most the one unparsed
   * remainder in it.
   */
  private recvChunks: Buffer[] = [];

  /**
   * Running byte total of {@link Transport.recvChunks}, maintained in lockstep so the receive-buffer bound and the frame-coverage check cost O(1) per chunk.
   */
  private recvBytes = 0;

  /**
   * Total wire length of the frame at the head of the accumulator once its header has been read and validated, or zero while that length is unknown. Parsing waits
   * while the accumulator holds fewer bytes than this, because no frame can complete before then. Cleared when the frame is consumed and when the framing changes.
   */
  private recvFrameBytes = 0;

  /**
   * Current phase. Starts at `plaintext`. Transitions one-way to `noise-handshake` then `noise-data` for the lifetime of the transport.
   */
  private phase: Phase = Phase.PLAINTEXT;

  /**
   * Installed cipher pair. Populated by {@link Transport.installCipher}; required for `noise-data` phase send/receive.
   */
  private cipher: Nullable<NoiseCipherPair> = null;

  /**
   * Queue of inbound typed messages (`plaintext` and `noise-data` phases). Drained by `[Symbol.asyncIterator]`.
   */
  private readonly messageQueue: InboundMessage[] = [];

  /**
   * Queue of inbound noise handshake frames (`noise-handshake` phase). Drained by {@link Transport.nextNoiseHandshakeFrame}.
   */
  private readonly handshakeFrameQueue: Buffer[] = [];

  /**
   * Awaiter parked in `[Symbol.asyncIterator].next()` waiting for the next typed message.
   */
  private messageAwaiter: Nullable<Awaiter<IteratorResult<InboundMessage>>> = null;

  /**
   * Awaiter parked in {@link Transport.nextNoiseHandshakeFrame} waiting for the next handshake frame.
   */
  private handshakeAwaiter: Nullable<Awaiter<Buffer>> = null;

  /**
   * Awaiter parked in {@link Transport.firstByte}.
   */
  private firstByteAwaiter: Nullable<Awaiter<number>> = null;

  /**
   * Whether the transport has reached a terminal state. Set on dispose, fatal error, or socket close. Pending awaiters are settled, and a read hands out what its
   * queue already holds before it reports the end: once the queue is empty, `next()` resolves `done` and the handshake and first-byte reads throw.
   */
  private terminated = false;

  /**
   * Pending fatal error. The message iterator and the handshake read hand out the frames already queued before they throw it, because those frames arrived before
   * the connection ended. The first-byte read throws it before it reads, and the sends and the cipher install throw it on a terminated transport.
   */
  private terminationError: Nullable<Error> = null;

  /**
   * Whether the device has sent a Noise handshake frame on this transport. The plaintext fallback follows only a device that has not spoken the encrypted protocol, and
   * a device that has sent a Noise frame has, so a close during the handshake counts as the fallback's error only while this is unset. A transport serves one connect
   * attempt and the fallback opens a new one, so nothing resets it.
   */
  private receivedNoiseFrame = false;

  private constructor(options: TransportOpenOptions) {

    this.options = options;
  }

  /**
   * Connect to the ESPHome device and return a transport in `plaintext` phase. Rejects on connection failure, timeout, or signal abort.
   *
   * @param options - Open-time configuration.
   * @returns A {@link Transport} ready for plaintext send/receive.
   */
  public static async open(options: TransportOpenOptions): Promise<Transport> {

    const transport = new Transport(options);

    await transport.connect(options.signal);

    return transport;
  }

  /**
   * Send a typed message. Routes to plaintext framing in `plaintext` phase or to encrypted noise framing in `noise-data` phase. Throws when called during the
   * `noise-handshake` phase - use {@link Transport.sendNoiseHandshakeFrame} for raw handshake frames.
   *
   * A failed socket write ends the transport: the send rejects with a {@link ConnectionError} coded `SOCKET_WRITE_FAILED` whose cause is the socket's own error, and
   * every parked awaiter and the message iterator reject with that same error. A write that fails after an earlier fault has ended the transport rejects with that
   * fault's error instead, and a send on a transport that has already ended rejects with the fault that ended it, so every send reports one cause. A send on a
   * transport disposed without a fault rejects with a {@link ConnectionClosedByPeerError} coded `TRANSPORT_CLOSED`.
   *
   * @param type - Numeric message type.
   * @param payload - Message payload bytes (encoded protobuf body).
   */
  public async send(type: number, payload: Buffer): Promise<void> {

    // A send on an ended transport reports the fault that ended it, as a write in flight does, so the send and every observer name one cause.
    if(this.terminated || !this.socket || this.socket.destroyed) {

      throw this.terminationError ?? new ConnectionClosedByPeerError("Transport is closed; cannot send.", "TRANSPORT_CLOSED");
    }

    const typeTag = messageTypeName(type);

    switch(this.phase) {

      case Phase.PLAINTEXT: {

        // [0x00][len-varint][type-varint][payload]
        const header = Buffer.concat([ Buffer.from([ProtocolByte.PLAINTEXT]), encodeVarint(payload.length), encodeVarint(type) ]);

        await this.writeToSocket(Buffer.concat([ header, payload ]));
        this.options.metrics?.increment("frames.sent", 1, { encrypted: "false", type: typeTag });

        return;
      }

      case Phase.NOISE_DATA: {

        if(!this.cipher) {

          throw new ProtocolError("Noise data phase entered without a cipher pair.", "CIPHER_UNAVAILABLE");
        }

        // Bound the payload against the noise message limit before writing it into the inner envelope's 16-bit length field. Without this guard, a payload of 65536 bytes
        // or more overflows `inner.writeUInt16BE(payload.length, 2)` and throws a raw, untyped RangeError ahead of the crypto layer's own MSG_TOO_LONG guard, leaking a
        // non-contract error on the fire-and-forget send path. We reuse the existing NOISE_MAX_MESSAGE_LEN bound and the same typed MSG_TOO_LONG contract the crypto
        // guard raises for the adjacent oversized band, so every oversized outbound noise payload surfaces one consistent typed error.
        if(payload.length > NOISE_MAX_MESSAGE_LEN) {

          this.options.metrics?.increment("frames.dropped", 1, { reason: "msg_too_long" });

          throw new NoiseHandshakeError("Outbound noise payload exceeds the 65535-byte message limit.", "MSG_TOO_LONG");
        }

        // Inner message: [type-be16][len-be16][payload]
        const inner = Buffer.alloc(4 + payload.length);

        inner.writeUInt16BE(type, 0);
        inner.writeUInt16BE(payload.length, 2);
        payload.copy(inner, 4);

        // EncryptWithAd returns a freshly-allocated, exclusively-owned Buffer on the keyed path (the no-key early-return is unreachable here - NOISE_DATA is guarded by
        // the cipher check above), and writeNoiseFrame only reads it, so no defensive copy is needed before handing the ciphertext to the frame writer.
        const ciphertext = this.cipher.sendCipher.EncryptWithAd(EMPTY_AD, inner);

        await this.writeNoiseFrame(ciphertext);
        this.options.metrics?.increment("frames.sent", 1, { encrypted: "true", type: typeTag });

        return;
      }

      case Phase.NOISE_HANDSHAKE:

        throw new ProtocolError("send() is not valid during the noise-handshake phase. Use sendNoiseHandshakeFrame() instead.", "BAD_TRANSPORT_PHASE");
    }
  }

  /**
   * Send a raw noise handshake frame (no encryption). Valid only during the `noise-handshake` phase. A failed socket write ends the transport and rejects exactly as it
   * does for {@link Transport.send}.
   *
   * @param frame - The handshake frame bytes (e.g., the noise client's `writeMessage()` output, or the empty initial frame).
   */
  public async sendNoiseHandshakeFrame(frame: Buffer): Promise<void> {

    // A send on an ended transport reports the fault that ended it, as a write in flight does, so the handshake step and every observer name one cause.
    if(this.terminated || !this.socket || this.socket.destroyed) {

      throw this.terminationError ?? new ConnectionClosedByPeerError("Transport is closed; cannot send.", "TRANSPORT_CLOSED");
    }

    if(this.phase !== Phase.NOISE_HANDSHAKE) {

      throw new ProtocolError("sendNoiseHandshakeFrame() called outside the noise-handshake phase (current: " + this.phase + ").", "BAD_TRANSPORT_PHASE");
    }

    await this.writeNoiseFrame(frame);
    this.options.metrics?.increment("frames.sent", 1, { encrypted: "false", type: "noise.handshake" });
  }

  /**
   * Switch to the `noise-handshake` phase. Inbound noise frames now route to {@link Transport.nextNoiseHandshakeFrame}; the typed-message iterator pauses producing.
   * Safe to call more than once.
   */
  public enterNoiseHandshake(): void {

    if(this.phase === Phase.PLAINTEXT) {

      this.phase = Phase.NOISE_HANDSHAKE;

      // A frame length read under plaintext framing means nothing under noise framing, so the next chunk re-reads the head of the accumulator under the new phase.
      this.recvFrameBytes = 0;
    }
  }

  /**
   * Install the cipher pair and switch to the `noise-data` phase. Subsequent sends encrypt; subsequent inbound noise frames decrypt and yield typed messages.
   * One-way for the lifetime of the transport - to revert, dispose this transport and construct a fresh one in `plaintext` phase.
   *
   * @param cipher - The send/receive cipher pair from a completed noise handshake.
   * @throws The fault that ended the transport, or a {@link ConnectionClosedByPeerError} coded `TRANSPORT_CLOSED` after a dispose without one, when the transport
   *   has already ended; the cipher pair is not stored and stays the caller's to destroy.
   */
  public installCipher(cipher: NoiseCipherPair): void {

    if(this.phase !== Phase.NOISE_HANDSHAKE) {

      throw new ProtocolError("installCipher() called outside the noise-handshake phase (current: " + this.phase + ").", "BAD_TRANSPORT_PHASE");
    }

    // Teardown has already run its one cipher destroy on a terminated transport, so a cipher stored now would never be destroyed. Refuse it with the error a send
    // throws here, and the caller's failure path destroys the pair it still holds.
    if(this.terminated) {

      throw this.terminationError ?? new ConnectionClosedByPeerError("Transport is closed; cannot install the cipher.", "TRANSPORT_CLOSED");
    }

    this.cipher = cipher;
    this.phase = Phase.NOISE_DATA;

    // Drain any handshake frames still queued - they're stale once the cipher is installed; the application data path is now in effect.
    this.handshakeFrameQueue.length = 0;

    // Re-drive inbound parsing in case bytes have already arrived ahead of the cipher install.
    this.drainInbound();
  }

  /**
   * Resolve with the first indicator byte the peer sends. The byte is NOT consumed - it stays in the receive buffer for normal frame parsing.
   *
   * @param signal - Optional cancellation signal.
   * @returns `0x00` (plaintext indicator) or `0x01` (noise indicator).
   */
  public async firstByte(signal?: AbortSignal): Promise<typeof ProtocolByte.NOISE | typeof ProtocolByte.PLAINTEXT> {

    // This read reports a stored fault before it reads, unlike the queued reads, because it peeks the unparsed accumulator, which after a fault still holds the
    // bytes that caused it.
    if(this.terminationError) {

      throw this.terminationError;
    }

    const head = this.recvChunks[0];

    if(head !== undefined) {

      const byte = head.readUInt8(0);

      return this.assertIndicator(byte);
    }

    // Match the guard in nextNoiseHandshakeFrame and nextMessage. Without this, a firstByte() call after dispose parks an awaiter that never resolves because dispose
    // already drained the awaiter slot before this call arrived.
    if(this.terminated) {

      throw new ConnectionClosedByPeerError("Transport closed while waiting for the first byte.", "TRANSPORT_CLOSED");
    }

    signal?.throwIfAborted();

    const result = await this.park<number>((awaiter) => { this.firstByteAwaiter = awaiter; }, signal);

    return this.assertIndicator(result);
  }

  /**
   * Read the next noise handshake frame. Valid only during the `noise-handshake` phase. A frame already queued is returned first, even after the transport has
   * ended; with the queue empty, the read throws the stored fault, then a `TRANSPORT_CLOSED` error on a transport disposed without one, then an aborted signal's
   * reason, and otherwise waits for the next frame.
   *
   * @param signal - Optional cancellation signal.
   * @returns The next frame's body bytes (already deframed).
   */
  public async nextNoiseHandshakeFrame(signal?: AbortSignal): Promise<Buffer> {

    if(this.phase !== Phase.NOISE_HANDSHAKE) {

      throw new ProtocolError("nextNoiseHandshakeFrame() called outside the noise-handshake phase (current: " + this.phase + ").", "BAD_TRANSPORT_PHASE");
    }

    // A frame the transport already parsed was received before the connection ended, so the caller gets it before the fault, as the message iterator's caller does.
    const queued = this.handshakeFrameQueue.shift();

    if(queued !== undefined) {

      return queued;
    }

    if(this.terminationError) {

      throw this.terminationError;
    }

    if(this.terminated) {

      throw new ConnectionClosedByPeerError("Transport closed while waiting for a noise handshake frame.", "TRANSPORT_CLOSED");
    }

    signal?.throwIfAborted();

    return this.park<Buffer>((awaiter) => { this.handshakeAwaiter = awaiter; }, signal);
  }

  /**
   * Async iterator over inbound typed messages. Yields entries during `plaintext` and `noise-data` phases; pauses during `noise-handshake`. Terminates on transport
   * dispose, socket close, or fatal framing error.
   */
  public [Symbol.asyncIterator](): AsyncIterator<InboundMessage, void> {

    return {

      next: async (): Promise<IteratorResult<InboundMessage, void>> => this.nextMessage(),
      return: async (): Promise<IteratorResult<InboundMessage, void>> => {

        // Consumer break out of `for await` - we leave the transport open (the caller may still want to send) but settle the parked awaiter cleanly.
        if(this.messageAwaiter) {

          const awaiter = this.messageAwaiter;

          this.messageAwaiter = null;
          awaiter.resolve({ done: true, value: undefined });
        }

        return { done: true, value: undefined };
      }
    };
  }

  /**
   * Async dispose - sends nothing, just tears down the socket. Graceful disconnect is a higher-level concept implemented in `esphome-client.ts` on top of this.
   */
  public async [Symbol.asyncDispose](): Promise<void> {

    this.dispose();
  }

  /**
   * Sync dispose - immediate teardown without any further IO.
   */
  public [Symbol.dispose](): void {

    this.dispose();
  }

  /**
   * Whether the transport is currently in the `noise-data` phase.
   */
  public get isEncrypted(): boolean {

    return this.phase === Phase.NOISE_DATA;
  }

  /**
   * Internal teardown - settles every awaiter cleanly and destroys the socket. Safe to call more than once.
   */
  private dispose(): void {

    if(this.terminated) {

      return;
    }

    this.terminated = true;

    this.tearDownSocket();
    this.settleAwaiters(this.terminationError ?? new ConnectionClosedByPeerError("Transport disposed.", "TRANSPORT_DISPOSED"));
  }

  /**
   * Establish the TCP connection. Called once by {@link Transport.open}. An abort rejects with the signal's reason as it is, whatever its type.
   */
  private async connect(signal?: AbortSignal): Promise<void> {

    signal?.throwIfAborted();

    const { promise, resolve, reject }: PromiseWithResolvers<void> = Promise.withResolvers();
    const factory = this.options.socketFactory ?? ((p): Socket => createConnection({ host: p.host, port: p.port }));
    const socket = factory({ host: this.options.host, port: this.options.port });
    let settled = false;

    const onConnect = (): void => {

      if(settled) {

        return;
      }

      settled = true;
      signal?.removeEventListener("abort", onAbort);

      // Detach the connect-attempt error listener before installing the long-lived listeners. It is a `.once` that never fired, so without this it would linger on the
      // live socket for the connection's lifetime alongside the error listener attachSocketListeners adds - two error listeners for one socket. Symmetric with the
      // abort-listener removal above; tearDownSocket's removeAllListeners is the backstop, but a set-once-never-cleared listener is the hygiene defect we avoid.
      socket.removeListener("error", onError);

      this.socket = socket;
      this.attachSocketListeners(socket);

      this.options.log.debug("Transport connected to " + formatHostPort(this.options.host, this.options.port) + ".");
      resolve();
    };

    const onError = (err: NodeJS.ErrnoException): void => {

      if(settled) {

        return;
      }

      settled = true;
      socket.destroy();
      signal?.removeEventListener("abort", onAbort);

      // Map well-known errno codes to typed errors with cause chain.
      const message = "Connection to " + formatHostPort(this.options.host, this.options.port) + " failed";

      switch(err.code) {

        case "ECONNREFUSED":

          reject(new ConnectionRefusedError(message + ": connection refused.", "ECONNREFUSED", { cause: err }));

          return;

        case "ETIMEDOUT":

          reject(new ConnectionTimeoutError(message + ": connection timed out.", "ETIMEDOUT", { cause: err }));

          return;

        default:

          reject(new ConnectionRefusedError(message + ": " + (err.code ?? err.message) + ".", err.code ?? "ECONNERR", { cause: err }));

          return;
      }
    };

    const onAbort = (): void => {

      if(settled) {

        return;
      }

      settled = true;
      socket.destroy();
      reject(signal?.reason);
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    return promise;
  }

  /**
   * Wire up data/error/close listeners on the open socket.
   */
  private attachSocketListeners(socket: Socket): void {

    socket.on("data", (chunk: Buffer) => { this.handleData(chunk); });

    socket.once("error", (err: NodeJS.ErrnoException) => {

      this.options.log.debug("Transport socket error: " + (err.code ?? err.message) + ".");

      const cause = err;

      this.fail(new ConnectionClosedByPeerError("Transport socket error: " + (err.code ?? err.message) + ".", err.code ?? "ESOCKET", { cause }));
    });

    socket.once("close", () => {

      // If we've already terminated for a more specific reason, keep that. Otherwise surface a generic peer-closed.
      if(!this.terminated) {

        // A peer close during the noise handshake from a device that has not sent a Noise frame means it does not speak the encrypted protocol, so translate it for the
        // connect path to fall back without inspecting socket internals. A device that has sent a Noise frame speaks the protocol, so its close is an ordinary one.
        if((this.phase === Phase.NOISE_HANDSHAKE) && !this.receivedNoiseFrame) {

          this.fail(new PeerClosedDuringNoiseError("Peer closed the socket during the noise handshake.", "PEER_CLOSED_NOISE"));

          return;
        }

        this.fail(new ConnectionClosedByPeerError("Peer closed the socket.", "PEER_CLOSED"));
      }
    });
  }

  /**
   * Append inbound bytes and drain any complete frames.
   */
  private handleData(chunk: Buffer): void {

    // Bound-check the projected accumulator size before accepting the chunk, so a hostile burst is rejected without first growing the accumulator past the limit by one
    // chunk. The check runs against the running byte count plus the incoming chunk length, rejecting the chunk before it is ever appended.
    if((this.recvBytes + chunk.length) > this.options.maxRecvBufferBytes) {

      this.options.metrics?.increment("frames.dropped", 1, { reason: "buffer_overflow" });

      this.fail(new BufferOverflowError("Receive buffer exceeded " + String(this.options.maxRecvBufferBytes) +
        " bytes; peer is sending garbage or stalled mid-frame.", "RECV_BUFFER_OVERFLOW"));

      return;
    }

    // The chunk joins the accumulator by reference, with no copy. Node hands a fresh Buffer per data event and the accumulator is only ever read and subarrayed
    // (delivered payloads are copied out through Buffer.from), so holding the socket's chunk is safe. An empty chunk is never appended, which keeps the first chunk's
    // first byte the next unparsed byte of the stream.
    if(chunk.length > 0) {

      this.recvChunks.push(chunk);
      this.recvBytes += chunk.length;
    }

    // Settle the firstByte awaiter on the very first byte we observe; the byte stays in the accumulator for normal parsing.
    const head = this.recvChunks[0];

    if(this.firstByteAwaiter && (head !== undefined)) {

      const byte = head.readUInt8(0);
      const awaiter = this.firstByteAwaiter;

      this.firstByteAwaiter = null;
      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.resolve(byte);
    }

    this.drainInbound();
  }

  /**
   * Parse frames from the receive accumulator per the current phase, routing each to the matching queue or awaiter. Loops until no further progress is possible.
   */
  private drainInbound(): void {

    // While the head frame's known length is not yet covered, the chunks wait in the list uncopied. Deferring changes no outcome: the header behind a known length has
    // already passed every check a parse would repeat, and the framing is unchanged since it was read, so until the frame is covered a parse could only report that it
    // needs more bytes. An unknown length is zero and never defers.
    if(this.recvBytes < this.recvFrameBytes) {

      return;
    }

    // Join the accumulator into one buffer here, once, rather than on every chunk. Past the check above, either the head frame can be complete or its length is still
    // unknown. Apart from the reset at a framing change, an unknown length means the accumulator held at most a partial header before the latest chunk, so that join
    // copies only those few bytes along with the chunk. The frame parsers below read the single joined chunk.
    if(this.recvChunks.length > 1) {

      this.recvChunks = [Buffer.concat(this.recvChunks, this.recvBytes)];
    }

    let progressed = true;

    while(progressed && !this.terminated) {

      progressed = false;

      switch(this.phase) {

        case Phase.PLAINTEXT:

          progressed = this.tryDrainPlaintextFrame();

          break;

        case Phase.NOISE_HANDSHAKE:
        case Phase.NOISE_DATA:

          progressed = this.tryDrainNoiseFrame();

          break;
      }
    }
  }

  /**
   * Attempt to extract one plaintext frame. Returns `true` if one was extracted, `false` if more bytes are needed.
   */
  private tryDrainPlaintextFrame(): boolean {

    const buffer = this.recvChunks[0];

    if((buffer === undefined) || (buffer.length < 3)) {

      return false;
    }

    const indicator = buffer.readUInt8(0);

    if(indicator === ProtocolByte.NOISE) {

      // The peer is speaking noise but we are in plaintext phase. The connect-time decision logic surfaces this via `firstByte()`; if we got here, the higher layer
      // chose to keep us in plaintext and the byte arrived after that decision. Translate to a typed fatal error rather than silently mis-decoding.
      this.fail(new ProtocolError("Plaintext phase received a noise indicator byte (0x01); peer/client protocol disagreement.", "PROTOCOL_MISMATCH"));

      return false;
    }

    if(indicator !== ProtocolByte.PLAINTEXT) {

      this.fail(new ProtocolError("Plaintext phase received unknown indicator byte 0x" + indicator.toString(16) + ".", "BAD_PLAINTEXT_INDICATOR"));

      return false;
    }

    let length: number;
    let lenBytes: number;
    let type: number;
    let typeBytes: number;

    try {

      [ length, lenBytes ] = readVarint(buffer, 1);
      [ type, typeBytes ] = readVarint(buffer, 1 + lenBytes);

    } catch(err) {

      // Insufficient bytes for a varint look like a RangeError from Buffer.readUInt8; bound check via length below avoids that, but a malformed varint (no stop bit
      // within MAX_VARINT_BYTES) surfaces here as MalformedVarintError.
      if(err instanceof RangeError) {

        return false;
      }

      this.fail(err instanceof Error ? err : new Error(String(err), { cause: err }));

      return false;
    }

    if(length > this.options.maxFrameBytes) {

      this.options.metrics?.increment("frames.dropped", 1, { reason: "size_exceeded" });
      this.fail(new FrameTooLargeError("Plaintext frame size " + String(length) + " bytes exceeds maxFrameBytes (" +
        String(this.options.maxFrameBytes) + ").", "FRAME_TOO_LARGE"));

      return false;
    }

    const headerSize = 1 + lenBytes + typeBytes;
    const frameBytes = headerSize + length;

    if(buffer.length < frameBytes) {

      this.recvFrameBytes = frameBytes;

      return false;
    }

    const payload = buffer.subarray(headerSize, frameBytes);

    this.consumeFrame(buffer, frameBytes);

    this.options.metrics?.increment("frames.received", 1, { encrypted: "false" });
    this.deliverMessage({ payload: Buffer.from(payload), type });

    return true;
  }

  /**
   * Attempt to extract one noise-framed message. Returns `true` if one was extracted, `false` if more bytes are needed.
   */
  private tryDrainNoiseFrame(): boolean {

    const buffer = this.recvChunks[0];

    if((buffer === undefined) || (buffer.length < 3)) {

      return false;
    }

    const indicator = buffer.readUInt8(0);

    if(indicator === ProtocolByte.PLAINTEXT) {

      // Peer responded with a plaintext frame while we were in a noise phase. During noise-handshake, this typically means the device does not support encryption -
      // surface so the connect path can fall back. During noise-data this is a fatal protocol violation.
      if(this.phase === Phase.NOISE_HANDSHAKE) {

        this.fail(new PeerClosedDuringNoiseError("Peer responded with a plaintext indicator byte (0x00) during the noise handshake; the device may not support" +
          " encryption.", "PEER_PLAINTEXT_DURING_NOISE"));

        return false;
      }

      this.fail(new ProtocolError("Plaintext indicator byte (0x00) received during noise-data phase; cipher disagreement.", "PROTOCOL_MISMATCH"));

      return false;
    }

    if(indicator !== ProtocolByte.NOISE) {

      this.fail(new ProtocolError("Noise phase received unknown indicator byte 0x" + indicator.toString(16) + ".", "BAD_NOISE_INDICATOR"));

      return false;
    }

    const frameSize = buffer.readUInt16BE(1);

    if(frameSize > this.options.maxFrameBytes) {

      this.options.metrics?.increment("frames.dropped", 1, { reason: "size_exceeded" });
      this.fail(new FrameTooLargeError("Noise frame size " + String(frameSize) + " bytes exceeds maxFrameBytes (" +
        String(this.options.maxFrameBytes) + ").", "FRAME_TOO_LARGE"));

      return false;
    }

    const frameEnd = 3 + frameSize;

    if(buffer.length < frameEnd) {

      this.recvFrameBytes = frameEnd;

      return false;
    }

    const frame = Buffer.from(buffer.subarray(3, frameEnd));

    this.consumeFrame(buffer, frameEnd);

    if(this.phase === Phase.NOISE_HANDSHAKE) {

      // Raw handshake frame - hand to the awaiter or queue.
      this.options.metrics?.increment("frames.received", 1, { encrypted: "false" });
      this.receivedNoiseFrame = true;

      if(this.handshakeAwaiter) {

        const awaiter = this.handshakeAwaiter;

        this.handshakeAwaiter = null;
        awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
        awaiter.resolve(frame);

      } else {

        this.handshakeFrameQueue.push(frame);
      }

      return true;
    }

    // NOISE_DATA: decrypt and parse inner [type-be16][len-be16][payload] envelope.
    if(!this.cipher) {

      this.fail(new ProtocolError("Noise data phase reached without a cipher pair installed.", "CIPHER_UNAVAILABLE"));

      return false;
    }

    let decrypted: Buffer;

    try {

      // DecryptWithAd returns a freshly-allocated, exclusively-owned Buffer on the keyed path (the no-key early-return is unreachable here - the cipher is guarded
      // above), and the inner-envelope parse below only reads / subarrays it, so no defensive copy is needed before parsing the decrypted frame.
      decrypted = this.cipher.receiveCipher.DecryptWithAd(EMPTY_AD, frame);

    } catch(err) {

      this.fail(new DecryptionFailedError("Failed to decrypt inbound noise frame.", "DECRYPT_FAILED", { cause: err instanceof Error ? err : undefined }));

      return false;
    }

    if(decrypted.length < 4) {

      this.fail(new ProtocolError("Decrypted noise message shorter than 4-byte header.", "DECRYPTED_TRUNCATED"));

      return false;
    }

    const type = decrypted.readUInt16BE(0);
    const innerLen = decrypted.readUInt16BE(2);

    if(decrypted.length < (4 + innerLen)) {

      this.fail(new ProtocolError("Decrypted noise message shorter than declared inner length.", "DECRYPTED_TRUNCATED"));

      return false;
    }

    const payload = Buffer.from(decrypted.subarray(4, 4 + innerLen));

    this.options.metrics?.increment("frames.received", 1, { encrypted: "true" });
    this.deliverMessage({ payload, type });

    return true;
  }

  /**
   * Remove a parsed frame from the front of the accumulator and clear the recorded frame length. A drain has already joined the accumulator into its one chunk, so the
   * remainder is a view into that chunk and costs no copy, and a fully parsed chunk leaves the list empty rather than holding an empty buffer.
   */
  private consumeFrame(buffer: Buffer, frameBytes: number): void {

    this.recvBytes -= frameBytes;
    this.recvFrameBytes = 0;

    if(this.recvBytes === 0) {

      this.recvChunks.length = 0;

      return;
    }

    this.recvChunks[0] = buffer.subarray(frameBytes);
  }

  /**
   * Deliver an inbound typed message to the iterator or its parked awaiter.
   */
  private deliverMessage(message: InboundMessage): void {

    if(this.messageAwaiter) {

      const awaiter = this.messageAwaiter;

      this.messageAwaiter = null;
      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.resolve({ done: false, value: message });

      return;
    }

    this.messageQueue.push(message);
  }

  /**
   * Implementation of `[Symbol.asyncIterator]().next()`.
   */
  private async nextMessage(): Promise<IteratorResult<InboundMessage, void>> {

    const queued = this.messageQueue.shift();

    if(queued !== undefined) {

      return { done: false, value: queued };
    }

    if(this.terminationError) {

      throw this.terminationError;
    }

    if(this.terminated) {

      return { done: true, value: undefined };
    }

    return this.park<IteratorResult<InboundMessage>>((awaiter) => { this.messageAwaiter = awaiter; }, undefined);
  }

  /**
   * Park an awaiter for later resolution. The setter callback receives the constructed awaiter and stores it in the appropriate slot.
   */
  private async park<T>(setter: (awaiter: Awaiter<T>) => void, signal: AbortSignal | undefined): Promise<T> {

    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const awaiter: Awaiter<T> = { reject, resolve, signal };

    if(signal) {

      const onAbort = (): void => {

        // Clear all slots that this awaiter could be parked in - the setter mutates one of them, but we don't track which here. Awaiters that were already settled
        // won't see this callback because we removed the listener at settle time.
        this.cancelAwaiter(awaiter);
      };

      awaiter.signalListener = onAbort;
      signal.addEventListener("abort", onAbort, { once: true });

      if(signal.aborted) {

        onAbort();

        return promise;
      }
    }

    setter(awaiter);

    return promise;
  }

  /**
   * Drop the given awaiter from whichever slot it occupies, then reject it with the signal's reason.
   */
  private cancelAwaiter<T>(awaiter: Awaiter<T>): void {

    if((this.firstByteAwaiter as unknown) === awaiter) {

      this.firstByteAwaiter = null;
    }

    if((this.handshakeAwaiter as unknown) === awaiter) {

      this.handshakeAwaiter = null;
    }

    if((this.messageAwaiter as unknown) === awaiter) {

      this.messageAwaiter = null;
    }

    awaiter.reject(awaiter.signal?.reason);
  }

  /**
   * Mark the transport as failed, settling every parked awaiter with `error` and closing the socket. A no-op on repeat through the `terminated` guard.
   */
  private fail(error: Error): void {

    if(this.terminated) {

      return;
    }

    this.terminated = true;
    this.terminationError = error;

    this.tearDownSocket();
    this.settleAwaiters(error);
  }

  /**
   * Reject every parked awaiter with the given error and close the message-iterator's done state.
   */
  private settleAwaiters(error: unknown): void {

    if(this.firstByteAwaiter) {

      const a = this.firstByteAwaiter;

      this.firstByteAwaiter = null;
      a.signal?.removeEventListener("abort", a.signalListener as () => void);
      a.reject(error);
    }

    if(this.handshakeAwaiter) {

      const a = this.handshakeAwaiter;

      this.handshakeAwaiter = null;
      a.signal?.removeEventListener("abort", a.signalListener as () => void);
      a.reject(error);
    }

    if(this.messageAwaiter) {

      const a = this.messageAwaiter;

      this.messageAwaiter = null;
      a.signal?.removeEventListener("abort", a.signalListener as () => void);

      // For the message iterator we resolve `done` rather than rejecting on graceful close; only reject on non-clean errors.
      if((error instanceof ConnectionClosedByPeerError) && (error.code === "TRANSPORT_DISPOSED")) {

        a.resolve({ done: true, value: undefined });

      } else {

        a.reject(error);
      }
    }
  }

  /**
   * Validate that a byte is a known protocol indicator.
   */
  private assertIndicator(byte: number): typeof ProtocolByte.NOISE | typeof ProtocolByte.PLAINTEXT {

    if((byte === ProtocolByte.PLAINTEXT) || (byte === ProtocolByte.NOISE)) {

      return byte;
    }

    throw new ProtocolError("Unknown protocol indicator byte 0x" + byte.toString(16) + ".", "BAD_INDICATOR");
  }

  /**
   * Write a noise-framed payload to the socket: `[0x01][size-be16][body]`.
   */
  private async writeNoiseFrame(body: Buffer): Promise<void> {

    const header = Buffer.alloc(3);

    header.writeUInt8(ProtocolByte.NOISE, 0);
    header.writeUInt16BE(body.length, 1);

    await this.writeToSocket(Buffer.concat([ header, body ]));
  }

  /**
   * Write raw bytes to the socket. Resolves once the socket's `write` callback fires. A callback error ends the transport through {@link Transport.fail} with a
   * {@link ConnectionError} coded `SOCKET_WRITE_FAILED` that carries the socket's error as its cause, and the write rejects with that same error. When an earlier fault
   * has already ended the transport, the write rejects with that fault's error instead.
   */
  private async writeToSocket(bytes: Buffer): Promise<void> {

    return new Promise<void>((resolve, reject) => {

      const socket = this.socket;

      if(!socket || socket.destroyed) {

        reject(new ConnectionClosedByPeerError("Socket is destroyed; cannot write.", "TRANSPORT_CLOSED"));

        return;
      }

      socket.write(bytes, (err: NodeJS.ErrnoException | null | undefined) => {

        if(err) {

          // A failed write ends the transport here rather than waiting for a socket `error` event, because the socket contract does not promise one follows a failed
          // write...without this, the parked awaiters and the message iterator would never learn of the fault. A write that fails after an earlier fault reuses that
          // fault's error, so the send, every observer, and every concurrent in-flight write report one cause, and the second fail() is a no-op behind its guard.
          const error = this.terminationError ?? new ConnectionError("Transport socket write failed: " + (err.code ?? err.message) + ".", "SOCKET_WRITE_FAILED",
            { cause: err });

          this.fail(error);
          reject(error);

          return;
        }

        resolve();
      });
    });
  }

  /**
   * Destroy the underlying socket. Safe to call more than once.
   */
  private tearDownSocket(): void {

    if(this.socket) {

      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    // Zeroize the live noise session keys at teardown. The post-handshake cipher pair holds the ChaCha20 transport keys as plaintext Buffers; without this they linger in
    // memory until GC after every disconnect/reconnect. Both terminal paths (dispose and fail) route here behind the `terminated` guard, and CipherState.destroy() is
    // safe to call more than once, so this runs cleanly exactly once. Best-effort, as Node Buffer zeroization cannot guarantee the GC made no prior copy.
    if(this.cipher) {

      this.cipher.sendCipher.destroy();
      this.cipher.receiveCipher.destroy();
      this.cipher = null;
    }
  }
}
