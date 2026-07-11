/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * transport.ts: TCP socket framing and cipher install for ESPHome's plaintext + noise wire protocols.
 */

/**
 * Wire-level transport for the ESPHome native API. Owns the TCP socket, the inbound receive buffer, plaintext and noise framing, and the cipher install seam.
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
  BufferOverflowError, ConnectionClosedByPeerError, ConnectionRefusedError, ConnectionTimeoutError, DecryptionFailedError, FrameTooLargeError,
  NoiseHandshakeError, PeerClosedDuringNoiseError, ProtocolError
} from "./errors.ts";
import type { ClientMetrics, EspHomeLogging, Nullable } from "./types.ts";
import { encodeVarint, readVarint } from "./protocol/codec.ts";
import { Buffer } from "node:buffer";
import type { CipherState } from "./crypto-noise.ts";
import { NOISE_MAX_MESSAGE_LEN } from "./crypto-noise.ts";
import type { Socket } from "node:net";
import { createConnection } from "node:net";
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
 * Construction options for {@link Transport.open}.
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
 * One inbound typed message. The async iterator over a {@link Transport} yields entries of this shape during the `plaintext` and `noise-data` phases.
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
 * Cipher state pair installed via {@link Transport.installCipher}.
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
 * Structural interface mirroring the public surface of {@link Transport}. Both the real {@link Transport} and the test-only `MockTransport` (from
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
   * Accumulator for inbound bytes. Drained by {@link Transport.drainInbound} every time the socket emits data.
   */
  private recvBuffer: Buffer = Buffer.alloc(0);

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
   * Whether the transport has reached a terminal state. Set on dispose, fatal error, or socket close. New `next()` calls resolve `done`; pending awaiters are settled.
   */
  private terminated = false;

  /**
   * Pending fatal error. When set, awaiters reject with this rather than yielding from their queues.
   */
  private terminationError: Error | null = null;

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
   * @param type - Numeric message type.
   * @param payload - Message payload bytes (encoded protobuf body).
   */
  public async send(type: number, payload: Buffer): Promise<void> {

    if(this.terminated || !this.socket || this.socket.destroyed) {

      throw new ConnectionClosedByPeerError("Transport is closed; cannot send.", "TRANSPORT_CLOSED");
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
   * Send a raw noise handshake frame (no encryption). Valid only during the `noise-handshake` phase.
   *
   * @param frame - The handshake frame bytes (e.g., the noise client's `writeMessage()` output, or the empty initial frame).
   */
  public async sendNoiseHandshakeFrame(frame: Buffer): Promise<void> {

    if(this.terminated || !this.socket || this.socket.destroyed) {

      throw new ConnectionClosedByPeerError("Transport is closed; cannot send.", "TRANSPORT_CLOSED");
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
    }
  }

  /**
   * Install the cipher pair and switch to the `noise-data` phase. Subsequent sends encrypt; subsequent inbound noise frames decrypt and yield typed messages.
   * One-way for the lifetime of the transport - to revert, dispose this transport and construct a fresh one in `plaintext` phase.
   *
   * @param cipher - The send/receive cipher pair from a completed noise handshake.
   */
  public installCipher(cipher: NoiseCipherPair): void {

    if(this.phase !== Phase.NOISE_HANDSHAKE) {

      throw new ProtocolError("installCipher() called outside the noise-handshake phase (current: " + this.phase + ").", "BAD_TRANSPORT_PHASE");
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

    if(this.terminationError) {

      throw this.terminationError;
    }

    if(this.recvBuffer.length > 0) {

      const byte = this.recvBuffer.readUInt8(0);

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
   * Read the next noise handshake frame. Valid only during the `noise-handshake` phase.
   *
   * @param signal - Optional cancellation signal.
   * @returns The next frame's body bytes (already deframed).
   */
  public async nextNoiseHandshakeFrame(signal?: AbortSignal): Promise<Buffer> {

    if(this.phase !== Phase.NOISE_HANDSHAKE) {

      throw new ProtocolError("nextNoiseHandshakeFrame() called outside the noise-handshake phase (current: " + this.phase + ").", "BAD_TRANSPORT_PHASE");
    }

    if(this.terminationError) {

      throw this.terminationError;
    }

    const queued = this.handshakeFrameQueue.shift();

    if(queued !== undefined) {

      return queued;
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
   * Establish the TCP connection. Called once by {@link Transport.open}.
   */
  private async connect(signal?: AbortSignal): Promise<void> {

    signal?.throwIfAborted();

    return new Promise<void>((resolve, reject) => {

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

        this.options.log.debug("Transport connected to " + this.options.host + ":" + String(this.options.port) + ".");
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
        const message = "Connection to " + this.options.host + ":" + String(this.options.port) + " failed";

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

        const reason = signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");

        reject(reason);
      };

      socket.once("connect", onConnect);
      socket.once("error", onError);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
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

        // During noise handshake, a peer-initiated close means the device closed mid-noise - usually it does not support encryption. Translate so the connect path can
        // fall back without inspecting socket internals.
        if(this.phase === Phase.NOISE_HANDSHAKE) {

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

    // Bound-check the projected accumulator size before allocating, so a hostile burst is rejected without first growing recvBuffer past the limit by one chunk. The
    // check runs against the sum of the current buffer length and the incoming chunk length, rejecting the chunk before it is ever concatenated.
    if((this.recvBuffer.length + chunk.length) > this.options.maxRecvBufferBytes) {

      this.options.metrics?.increment("frames.dropped", 1, { reason: "buffer_overflow" });

      this.fail(new BufferOverflowError("Receive buffer exceeded " + String(this.options.maxRecvBufferBytes) +
        " bytes; peer is sending garbage or stalled mid-frame.", "RECV_BUFFER_OVERFLOW"));

      return;
    }

    // Empty-accumulator fast path: in steady state drainInbound consumes every complete frame and leaves recvBuffer fully drained, so the common case would concatenate
    // an empty buffer with the chunk - a full byte-copy producing a buffer identical to chunk. Adopt the chunk directly instead. Node hands a fresh Buffer per data event
    // and recvBuffer is only ever read / subarray'd (delivered payloads are copied out via Buffer.from), so taking ownership of the chunk is safe.
    this.recvBuffer = (this.recvBuffer.length === 0) ? chunk : Buffer.concat([ this.recvBuffer, chunk ]);

    // Settle the firstByte awaiter on the very first byte we observe; the byte stays in recvBuffer for normal parsing.
    if(this.firstByteAwaiter && (this.recvBuffer.length > 0)) {

      const byte = this.recvBuffer.readUInt8(0);
      const awaiter = this.firstByteAwaiter;

      this.firstByteAwaiter = null;
      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.resolve(byte);
    }

    this.drainInbound();
  }

  /**
   * Parse frames from `recvBuffer` per the current phase, routing each to the matching queue or awaiter. Loops until no further progress is possible.
   */
  private drainInbound(): void {

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

    if(this.recvBuffer.length < 3) {

      return false;
    }

    const indicator = this.recvBuffer.readUInt8(0);

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

      [ length, lenBytes ] = readVarint(this.recvBuffer, 1);
      [ type, typeBytes ] = readVarint(this.recvBuffer, 1 + lenBytes);

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

    if(this.recvBuffer.length < (headerSize + length)) {

      return false;
    }

    const payload = this.recvBuffer.subarray(headerSize, headerSize + length);

    this.recvBuffer = this.recvBuffer.subarray(headerSize + length);

    this.options.metrics?.increment("frames.received", 1, { encrypted: "false" });
    this.deliverMessage({ payload: Buffer.from(payload), type });

    return true;
  }

  /**
   * Attempt to extract one noise-framed message. Returns `true` if one was extracted, `false` if more bytes are needed.
   */
  private tryDrainNoiseFrame(): boolean {

    if(this.recvBuffer.length < 3) {

      return false;
    }

    const indicator = this.recvBuffer.readUInt8(0);

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

    const frameSize = this.recvBuffer.readUInt16BE(1);

    if(frameSize > this.options.maxFrameBytes) {

      this.options.metrics?.increment("frames.dropped", 1, { reason: "size_exceeded" });
      this.fail(new FrameTooLargeError("Noise frame size " + String(frameSize) + " bytes exceeds maxFrameBytes (" +
        String(this.options.maxFrameBytes) + ").", "FRAME_TOO_LARGE"));

      return false;
    }

    const frameEnd = 3 + frameSize;

    if(this.recvBuffer.length < frameEnd) {

      return false;
    }

    const frame = Buffer.from(this.recvBuffer.subarray(3, frameEnd));

    this.recvBuffer = this.recvBuffer.subarray(frameEnd);

    if(this.phase === Phase.NOISE_HANDSHAKE) {

      // Raw handshake frame - hand to the awaiter or queue.
      this.options.metrics?.increment("frames.received", 1, { encrypted: "false" });

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

    const reason = awaiter.signal?.reason instanceof Error ? awaiter.signal.reason : new DOMException("Aborted", "AbortError");

    if((this.firstByteAwaiter as unknown) === awaiter) {

      this.firstByteAwaiter = null;
    }

    if((this.handshakeAwaiter as unknown) === awaiter) {

      this.handshakeAwaiter = null;
    }

    if((this.messageAwaiter as unknown) === awaiter) {

      this.messageAwaiter = null;
    }

    awaiter.reject(reason);
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
   * Write raw bytes to the socket. Resolves once the socket's `write` callback fires (or rejects on error).
   */
  private async writeToSocket(bytes: Buffer): Promise<void> {

    return new Promise<void>((resolve, reject) => {

      const socket = this.socket;

      if(!socket || socket.destroyed) {

        reject(new ConnectionClosedByPeerError("Socket is destroyed; cannot write.", "TRANSPORT_CLOSED"));

        return;
      }

      socket.write(bytes, (err: Error | null | undefined) => {

        if(err) {

          reject(err);

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
