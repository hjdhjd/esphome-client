/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * noise-responder.ts: Synthetic Noise NNpsk0 responder (the device side) for driving a real encrypted session through the production transport + client.
 */

/*
 * Synthetic Noise responder. This is the reusable device-side counterpart to the production client's initiator handshake: a real `HandshakeState(role:"responder")`
 * sharing the client's PSK and the ESPHome prologue, wired onto a write-intercepting {@link MockSocket} so it completes the NNpsk0 handshake against the production
 * initiator and then encrypts the discovery responses with the genuine post-handshake cipher pair.
 *
 * The coordination mechanism is a thin write-intercepting subclass of {@link MockSocket}: each captured outbound wire frame fires the responder's state machine, which
 * pushes the matching inbound bytes back through the socket. The two handshake frames the client writes (the empty initial frame, then its NNpsk0 msg1) drive the two
 * responder replies (server-hello, then server-handshake msg2). The encrypted discovery frames are pushed only when the client emits its FIRST data-phase write (its
 * encrypted HELLO_REQUEST): that write is the client's own proof it has installed the cipher and entered the noise-data phase, so gating the discovery push on it
 * eliminates the microtask-gap race where a data frame pushed too eagerly would be parsed while the transport is still in the noise-handshake phase, queued as a stale
 * handshake frame, and then discarded by `installCipher`. Inbound pushes are deferred to the microtask queue so the responder never re-enters the transport's framing
 * layer synchronously while the client is still inside its own `write` callback.
 *
 * This is a plain non-`.test.ts` module: the e2e runner globs only the `.test.ts` files under `test/e2e`, so this helper is imported by the encrypted-session test
 * (whose handshake, frame-corruption, and bad-key fail-closed cases all drive it) rather than discovered standalone.
 *
 * @module test/simulator/noise-responder
 */
import { Buffer } from "node:buffer";
import type { CipherState } from "../../src/crypto-noise.ts";
import type { InboundMessage } from "../../src/transport.ts";
import { MockSocket } from "../../src/testing/mock-socket.ts";
import { createESPHomeHandshake } from "../../src/crypto-noise.ts";

/**
 * Associated data for every data-phase frame. ESPHome's noise-data envelope authenticates an empty AD, matching {@link "transport".Transport} which passes a shared
 * zero-length buffer to every `EncryptWithAd` / `DecryptWithAd` call.
 */
const EMPTY_AD = Buffer.alloc(0);

/**
 * The wire indicator byte prefixing every noise frame (handshake and data). Mirrors the transport's `ProtocolByte.NOISE`.
 */
const NOISE_INDICATOR = 0x01;

/**
 * The chosen-protocol byte the device announces in its server-hello and the SUCCESS header byte prefixing the server handshake reply. The production initiator requires
 * the chosen-protocol byte to be exactly `0x01` ({@link "lifecycle/handshake".performNoiseHandshake} step 2) and treats a non-zero handshake-reply header as an
 * authentication failure (step 4).
 */
const NOISE_PROTO_ID = 0x01;
const NOISE_SUCCESS_HEADER = 0x00;

/**
 * Build a raw noise wire frame: `[0x01 indicator][size-be16][body]`. Mirrors {@link "transport".Transport.writeNoiseFrame} (file-local there) so the responder's frames
 * parse identically to a real device's.
 *
 * @param body - The frame body (a handshake message, or an encrypted data payload).
 * @returns The complete on-the-wire frame.
 */
const buildNoiseWireFrame = (body: Buffer): Buffer => {

  const header = Buffer.alloc(3);

  header.writeUInt8(NOISE_INDICATOR, 0);
  header.writeUInt16BE(body.length, 1);

  return Buffer.concat([ header, body ]);
};

/**
 * Discrete steps of the responder handshake state machine. The responder advances exactly once per inbound handshake frame the client writes: `AWAIT_INITIAL` consumes
 * the client's empty initial frame and replies with the server-hello; `AWAIT_MSG1` consumes the client's NNpsk0 msg1, replies with msg2, and splits the cipher pair;
 * `AWAIT_FIRST_DATA` waits for the client's first encrypted write (its proof the cipher is installed) and pushes the discovery frames; `DATA` is terminal - further
 * client writes are encrypted requests the test inspects directly, not drive signals.
 */
const ResponderStep = {

  AWAIT_FIRST_DATA: "await-first-data",
  AWAIT_INITIAL:    "await-initial",
  AWAIT_MSG1:       "await-msg1",
  DATA:             "data"
} as const;

type ResponderStep = typeof ResponderStep[keyof typeof ResponderStep];

/**
 * Inputs to {@link createNoiseResponder}.
 */
export interface NoiseResponderOptions {

  /**
   * Optional crypto-anti-vacuity hook. When set, the responder flips one byte of the ciphertext of the FIRST discovery frame whose `type` matches before pushing it -
   * leaving the AEAD tag and every other frame intact. A genuine cipher MUST reject the tampered frame: the client's `receiveCipher.DecryptWithAd` fails its tag check
   * and the in-flight `connect()` rejects. Used by the mutation-check to prove the client genuinely decrypts rather than rubber-stamping the green path. MUST target a
   * SETUP-phase frame (DEVICE_INFO_RESPONSE / LIST_ENTITIES_*_RESPONSE / LIST_ENTITIES_DONE_RESPONSE) - a run-phase frame would decrypt-fail only after `connect()` has
   * already resolved, masking the corruption.
   */
  readonly corruptType?: number;

  /**
   * The discovery frames the responder encrypts and pushes (in order) once the handshake completes. Each is encrypted with the responder's post-split `sendCipher`, so
   * the per-frame nonce advances in lockstep with the client's `receiveCipher`. Supply the exact `[type, payload]` sequence the in-flight connect expects to consume
   * (HELLO_RESPONSE through the trailing run-phase state).
   */
  readonly frames: readonly InboundMessage[];

  /**
   * The 32-byte pre-shared key. MUST be a fresh buffer the client does not also hold: the initiator's success path zeroizes its own PSK buffer, so a shared buffer would
   * be wiped out from under the responder mid-handshake.
   */
  readonly psk: Buffer;

  /**
   * Optional bad-key anti-vacuity hook driving the header=0-UNDECRYPTABLE path. When set, the responder still emits the `0x00` SUCCESS header (so the client treats the
   * reply as a non-rejection and proceeds into its `readMessage` - this is the path the in-band header != 0 reject does NOT exercise) but corrupts the responder
   * ephemeral in msg2 so the client cannot complete the handshake:
   *
   * - `"low-order"` overwrites the responder ephemeral with the all-zeros low-order X25519 point, so the client's `ee` Diffie-Hellman rejects it -> `INVALID_REMOTE_KEY`.
   * - `"auth-failed"` overwrites it with 0xFF (a DH-accepted but wrong point), so the DH succeeds
   *   with a wrong shared secret and the payload AEAD tag check fails -> `AUTH_FAILED`.
   *
   * Both codes are the genuine bad-key codes the connect-flow handshake re-tags into the permanent {@link "errors".EncryptionKeyInvalidError}, so the in-flight
   * `connect()` must fail closed (reject, never encrypted, no plaintext fallback). Used by the e2e bad-key test to drive the readMessage-wrap + gate path end-to-end.
   */
  readonly undecryptableMode?: "auth-failed" | "low-order";
}

/**
 * A live synthetic responder bound to a {@link MockSocket}. The test passes {@link socket} to the client's `socketFactory`, drives `connect()`, and after the handshake
 * reads {@link sendCipher} / {@link receiveCipher} to prove both cipher directions interoperate with the production initiator.
 */
export interface NoiseResponder {

  /**
   * The client's first data-phase wire frame (its encrypted HELLO_REQUEST), captured the moment the responder observed it. `undefined` until the client emits its first
   * encrypted write. The bidirectional-decrypt assertion strips its `[0x01][be16]` header and decrypts the ciphertext under {@link receiveCipher} to prove the
   * client->responder direction round-trips - reading this exact frame avoids the test guessing a write index.
   */
  readonly firstDataWrite: () => Buffer | undefined;

  /**
   * The post-handshake receive cipher. Decrypts what the CLIENT encrypts (the client's `sendCipher` <-> the responder's `receiveCipher`). `undefined` until the
   * handshake completes; the bidirectional-decrypt assertion narrows it after `connect()`.
   */
  readonly receiveCipher: () => CipherState | undefined;

  /**
   * The post-handshake send cipher. Encrypts what the CLIENT decrypts (the responder's `sendCipher` <-> the client's `receiveCipher`). `undefined` until the handshake
   * completes.
   */
  readonly sendCipher: () => CipherState | undefined;

  /**
   * The mock socket the responder drives. Hand this to the client's `socketFactory`; its captured `writes` are the client's outbound wire frames.
   */
  readonly socket: MockSocket;

  /**
   * Fire the socket's `connect` event so the in-flight `Transport.open` resolves and the handshake begins. Call once, after kicking off the client open (and a tick so
   * the transport's connect listener is attached).
   */
  readonly start: () => void;
}

/**
 * Construct a synthetic Noise responder over a fresh {@link MockSocket}. The returned object exposes the socket (for the client's `socketFactory`), a `start()` to fire
 * the connect event, and accessors for the post-handshake cipher pair. The responder runs a genuine `HandshakeState(role:"responder")` - an INDEPENDENT instance from
 * the client's initiator - so a green handshake proves the two ciphers genuinely interoperate, not that a stub agreed with itself.
 *
 * @param options - The PSK (fresh buffer) and the ordered discovery frames to encrypt after the handshake.
 * @returns A live {@link NoiseResponder}.
 */
export function createNoiseResponder(options: NoiseResponderOptions): NoiseResponder {

  const { corruptType, frames, psk, undecryptableMode } = options;

  // The responder's handshake. A real responder-role HandshakeState; both sides OMIT additionalPrologueData, so the prologue is ESPHome's fixed "NoiseAPIInit\x00\x00".
  const responder = createESPHomeHandshake({ psk, role: "responder" });

  // Tracks whether the one-shot ciphertext corruption has been applied, so only the first matching frame is tampered.
  let corrupted = false;

  // The write-intercepting socket. Each captured outbound frame fires `onClientWrite`; the base class still records it in `writes` for the test to inspect.
  const socket = new InterceptingMockSocket((frame) => { onClientWrite(frame); });

  let step: ResponderStep = ResponderStep.AWAIT_INITIAL;

  // The responder's post-split send cipher, captured once the handshake completes and consumed when the discovery frames are pushed.
  let dataSendCipher: CipherState | undefined;

  // The client's first data-phase wire frame, captured for the bidirectional-decrypt assertion.
  let firstDataWrite: Buffer | undefined;

  // Defer an inbound push to the microtask queue. Pushing synchronously inside the client's write callback would re-enter the transport's framing layer while the client
  // is still parked mid-`writeToSocket`; deferring keeps the drive single-threaded and deterministic without changing frame order.
  const pushSoon = (bytes: Buffer): void => {

    queueMicrotask((): void => { socket.pushData(bytes); });
  };

  // Advance the responder one step per inbound frame the client writes.
  const onClientWrite = (frame: Buffer): void => {

    switch(step) {

      case ResponderStep.AWAIT_INITIAL: {

        // The client's first write is the empty initial handshake frame `[0x01][0x00 0x00]`. Reply with the server-hello `[0x01][be16 1][0x01]`: a single chosen-proto
        // byte, no server name (so the client leaves `expectedServerName` unchecked).
        pushSoon(buildNoiseWireFrame(Buffer.from([ NOISE_PROTO_ID ])));
        step = ResponderStep.AWAIT_MSG1;

        break;
      }

      case ResponderStep.AWAIT_MSG1: {

        dataSendCipher = completeHandshake(frame);
        step = ResponderStep.AWAIT_FIRST_DATA;

        break;
      }

      case ResponderStep.AWAIT_FIRST_DATA: {

        // The client's first data-phase write (its encrypted HELLO_REQUEST) proves it has installed the cipher and entered the noise-data phase. Capture it for the
        // bidirectional-decrypt assertion, then push the encrypted discovery frames. Only now is it safe to push them - pushing earlier risks a frame being parsed during
        // the noise-handshake phase and discarded by installCipher. Each frame advances `sendCipher`'s nonce in lockstep with the client's `receiveCipher`; the transport
        // buffers them until the in-flight connect awaits each in order.
        firstDataWrite = frame;

        if(!dataSendCipher) {

          throw new Error("Responder reached the data phase without a send cipher.");
        }

        for(const discoveryFrame of frames) {

          const wireFrame = encryptDataFrame(dataSendCipher, discoveryFrame);

          // One-shot crypto-anti-vacuity corruption: flip one ciphertext byte of the first frame whose type matches. The wire layout is `[0x01][be16][ciphertext]`, so
          // offset 3 is the first ciphertext byte; XOR-ing it invalidates the AEAD tag and forces the client's real decrypt to fail.
          if((corruptType !== undefined) && !corrupted && (discoveryFrame.type === corruptType)) {

            wireFrame.writeUInt8(wireFrame.readUInt8(3) ^ 0xFF, 3);
            corrupted = true;
            pushSoon(wireFrame);

            // Stop after the tampered frame. The client's decrypt of it fails the transport while the discovery loop is parked on its `waitFor`, so the rejection
            // surfaces as the decrypt failure rather than racing a later send/push against the torn-down transport. Pushing the remaining frames into a now-dead socket
            // would only add dangling microtasks. (The happy path - no corruptType - pushes the full sequence and reaches steady state.)
            break;
          }

          pushSoon(wireFrame);
        }

        step = ResponderStep.DATA;

        break;
      }

      case ResponderStep.DATA: {

        // Terminal: subsequent encrypted requests do not drive the responder.
        break;
      }
    }
  };

  // Consume the client's NNpsk0 msg1, emit msg2, split the cipher pair, and return the responder's send cipher for the data phase.
  const completeHandshake = (msg1Frame: Buffer): CipherState => {

    // Strip the wire header `[0x01][be16 size]` (3 bytes) and the leading `0x00` body byte the initiator prefixes to its handshake message (handshake.ts step 3). What
    // remains is the raw NNpsk0 msg1 the responder reads.
    const msg1 = msg1Frame.subarray(4);

    responder.readMessage(msg1);

    // Responder writes msg2. The responder splits its cipher pair on this write (responder splits after writing the final NNpsk0 message).
    const msg2 = Buffer.from(responder.writeMessage());

    // Header=0-UNDECRYPTABLE bad-key drive: keep the SUCCESS header but corrupt the responder ephemeral (the first 32 bytes of msg2) so the client's readMessage fails.
    // "low-order" -> the all-zeros low-order X25519 point the client's DH rejects (INVALID_REMOTE_KEY); "auth-failed" -> 0xFF, a DH-accepted wrong point whose payload
    // AEAD tag check then fails (AUTH_FAILED). Both re-tag to a permanent EncryptionKeyInvalidError in the connect flow, so the in-flight connect fails closed.
    if(undecryptableMode !== undefined) {

      Buffer.alloc(32, (undecryptableMode === "low-order") ? 0x00 : 0xff).copy(msg2, 0);
    }

    // Emit the server-handshake reply: a `0x00` SUCCESS header then msg2. The client strips the one header byte then `readMessage(msg2)` and installs the cipher.
    pushSoon(buildNoiseWireFrame(Buffer.concat([ Buffer.from([ NOISE_SUCCESS_HEADER ]), msg2 ])));

    // Narrow the post-split ciphers (typed `CipherState | undefined`) before any data frame is encrypted.
    if(!responder.sendCipher || !responder.receiveCipher) {

      throw new Error("Responder cipher pair missing after a successful handshake.");
    }

    return responder.sendCipher;
  };

  return {

    firstDataWrite: (): Buffer | undefined => firstDataWrite,
    receiveCipher: (): CipherState | undefined => responder.receiveCipher,
    sendCipher: (): CipherState | undefined => responder.sendCipher,
    socket,
    start: (): void => { socket.simulateConnect(); }
  };
}

/**
 * Encrypt one typed message into a noise-data wire frame: inner `[type-be16][len-be16][payload]` -> `sendCipher.EncryptWithAd(EMPTY_AD, inner)` -> wire
 * `[0x01][be16 ct.len][ct]`. Byte-identical to {@link "transport".Transport} inbound noise-data parsing (and to the transport test's file-local `buildNoiseDataFrame`),
 * so the production transport decrypts and routes it as a real device's frame.
 *
 * @param cipher - The responder's post-handshake send cipher.
 * @param message - The typed message to encrypt.
 * @returns The complete encrypted wire frame.
 */
const encryptDataFrame = (cipher: CipherState, message: InboundMessage): Buffer => {

  const inner = Buffer.alloc(4 + message.payload.length);

  inner.writeUInt16BE(message.type, 0);
  inner.writeUInt16BE(message.payload.length, 2);
  message.payload.copy(inner, 4);

  const ciphertext = Buffer.from(cipher.EncryptWithAd(EMPTY_AD, inner));

  return buildNoiseWireFrame(ciphertext);
};

/**
 * A {@link MockSocket} that fires a hook after each captured outbound write. The base class records the write in `writes` and invokes the optional flush callback; the
 * subclass additionally hands the captured frame to the responder so it can advance its state machine. Each client `write` is one whole wire frame (the transport writes
 * a frame in a single `socket.write`), so the hook sees exactly one frame per call.
 */
class InterceptingMockSocket extends MockSocket {

  private readonly onWrite: (frame: Buffer) => void;

  /**
   * @param onWrite - Hook invoked with each captured outbound wire frame, after the base class records it.
   */
  public constructor(onWrite: (frame: Buffer) => void) {

    super();
    this.onWrite = onWrite;
  }

  /**
   * Capture the write through the base class (which records it in `writes` and fires the flush callback), then notify the responder. We snapshot the just-pushed buffer
   * from `writes` rather than re-normalizing `data` so the hook sees exactly what the test inspects.
   */
  public override write(data: Buffer | string, callback?: (err?: Error) => void): boolean {

    const accepted = super.write(data, callback);
    const frame = this.writes[this.writes.length - 1];

    if(accepted && frame) {

      this.onWrite(frame);
    }

    return accepted;
  }
}
