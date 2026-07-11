/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.ts: Typed error hierarchy for the ESPHome client library.
 */

/**
 * Typed error hierarchy used across the ESPHome client.
 *
 * @remarks Every distinct failure mode has its own class. Consumers can `instanceof`-check and pattern-match without parsing log strings. The {@link PermanentError}
 * marker classifies errors that the auto-reconnect supervisor should not retry; subclasses extending it (encryption errors, authentication failures, version
 * mismatches) are filtered out of the default retry path.
 *
 * Every catch-and-rethrow site preserves the underlying cause via the standard `Error.cause` chain, so consumers can drill down without losing context.
 *
 *
 * @module errors
 */

/**
 * Base class for every library-emitted error.
 *
 * @remarks Carries an optional machine-readable {@link code} alongside the human-readable message so consumers can `switch` on the code for exhaustive handling.
 * Subclasses narrow the code to a tagged string union where appropriate. The class name is automatically copied from `this.constructor.name`, which keeps
 * stack traces and `util.inspect` output readable.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#error-class-enumeration}
 */
export class EspHomeError extends Error {

  /**
   * Optional machine-readable error code. Subclasses narrow this to tagged string unions.
   */
  public readonly code: string | undefined;

  /**
   * Creates a new EspHomeError.
   *
   * @param message - Human-readable error description.
   * @param code - Optional machine-readable error code. Subclasses narrow this to tagged string unions.
   * @param options - Standard ErrorOptions; pass `{ cause }` to preserve an underlying error.
   */
  constructor(message: string, code?: string, options?: ErrorOptions) {

    super(message, options);

    this.code = code;
    this.name = this.constructor.name;
  }
}

/**
 * Marker class for errors that auto-reconnect should not retry.
 *
 * @remarks The default reconnect supervisor filters with `!(error instanceof PermanentError)`. Subclasses include encryption misconfigurations, authentication
 * failures, and major-version mismatches. Adding a new permanent failure mode is one new subclass and the filter picks it up automatically.
 *
 * Abstract on purpose: the marker is meaningful only when applied to a concrete subclass.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#permanent-vs-transient}
 *
 */
export abstract class PermanentError extends EspHomeError {}

// Connection lifecycle.

/**
 * Generic connection-lifecycle failure. Parent class for transport-level errors that aren't more specifically classified.
 */
export class ConnectionError extends EspHomeError {}

/**
 * Failure during the protocol handshake (plaintext or noise).
 *
 * @remarks Narrowing parent. The library does not throw this class directly - every handshake failure surfaces a more specific subclass
 * ({@link NoiseHandshakeError}, {@link NoiseHandshakeTimeoutError}, {@link PeerClosedDuringNoiseError}, {@link PlaintextHandshakeError}). Consumers can
 * `instanceof HandshakeError` to catch the whole family.
 */
export class HandshakeError extends ConnectionError {}

/**
 * Tagged codes for noise-handshake failure modes that consumers can pattern-match on.
 *
 * @remarks Each code names a specific failure mode the consumer can pattern-match on. The throw sites live in `crypto-noise.ts` (low-level cipher / handshake state),
 * `lifecycle/handshake.ts` (orchestration), and `transport.ts` (the two `PEER_*_NOISE` codes carried by the {@link PeerClosedDuringNoiseError} subclass).
 *
 * Code table:
 *
 * - `AUTH_FAILED` - ChaCha20-Poly1305 authentication tag verification failed during decryption (`crypto-noise.ts`). Wrong PSK or tampered ciphertext.
 * - `CT_TOO_SHORT` - Inbound ciphertext was shorter than the 16-byte AEAD tag (`crypto-noise.ts`). Malformed inbound noise frame.
 * - `HANDSHAKE_COMPLETE` - A handshake-state operation was attempted after the handshake already completed (`crypto-noise.ts`). Library-internal lifecycle bug.
 * - `HANDSHAKE_TIMEOUT` - The per-step handshake timeout elapsed (`lifecycle/handshake.ts`). Carried by {@link NoiseHandshakeTimeoutError}.
 * - `INVALID_PSK_LENGTH` - The PSK is not exactly 32 bytes (`crypto-noise.ts`). Consumer-supplied configuration error.
 * - `INVALID_REMOTE_KEY` - The remote ephemeral public key was malformed or a low-order point, so X25519 key agreement failed (`crypto-noise.ts`). The `diffieHellman`
 *   primitive rejected the peer key; the connect-flow handshake re-tags this into a permanent {@link EncryptionKeyInvalidError}.
 * - `MISSING_KEYS` - A Diffie-Hellman or post-handshake step required keys that were not yet initialized (`crypto-noise.ts`, `lifecycle/handshake.ts`).
 * - `MSG_TOO_LONG` - Outbound noise message exceeded the 65535-byte protocol limit (`crypto-noise.ts`). Indicates an oversized payload.
 * - `NONCE_EXHAUSTED` - The ChaCha20-Poly1305 nonce reached the reserved maximum 2^64 - 1 (`crypto-noise.ts`). Per Noise §5.1 that nonce is reserved for rekey and must
 *   never encrypt or decrypt a transport message; physically unreachable in practice (it would require 2^64 messages on one connection).
 * - `NOT_INITIALIZED` - Reserved for future use; no current throw site constructs this code. Kept in the union for forward compatibility.
 * - `PEER_CLOSED_NOISE` - The peer closed the TCP socket while a noise handshake was in flight (`transport.ts`). Carried by {@link PeerClosedDuringNoiseError}.
 * - `PEER_PLAINTEXT_DURING_NOISE` - The peer responded with the plaintext indicator byte (0x00) during the noise handshake (`transport.ts`). Triggers fallback to
 *   plaintext when the consumer has not insisted on encryption. Carried by {@link PeerClosedDuringNoiseError}.
 * - `TRUNCATED_E` - The ephemeral public key segment in an inbound handshake message was shorter than 32 bytes (`crypto-noise.ts`, `lifecycle/handshake.ts`).
 * - `UNSUPPORTED_TOKEN` - The device's noise-handshake server-hello frame selected a protocol byte other than 1 (`lifecycle/handshake.ts`). Indicates the peer
 *   negotiated a noise protocol variant this client does not support.
 */
export type NoiseHandshakeErrorCode = "AUTH_FAILED" | "CT_TOO_SHORT" | "HANDSHAKE_COMPLETE" | "HANDSHAKE_TIMEOUT" | "INVALID_PSK_LENGTH" | "INVALID_REMOTE_KEY" |
  "MISSING_KEYS" | "MSG_TOO_LONG" | "NONCE_EXHAUSTED" | "NOT_INITIALIZED" | "PEER_CLOSED_NOISE" | "PEER_PLAINTEXT_DURING_NOISE" | "TRUNCATED_E" | "UNSUPPORTED_TOKEN";

/**
 * Failure during the Noise NNpsk0 handshake itself. Carries a narrowed {@link NoiseHandshakeErrorCode} for precise dispatch.
 */
export class NoiseHandshakeError extends HandshakeError {

  /**
   * Narrowed handshake error code. Overrides the base class's optional `code` to make it required and narrowed.
   */
  public override readonly code: NoiseHandshakeErrorCode;

  /**
   * Creates a new NoiseHandshakeError.
   *
   * @param message - Human-readable error description.
   * @param code - Narrowed handshake error code.
   * @param options - Standard ErrorOptions; pass `{ cause }` to preserve an underlying error.
   */
  constructor(message: string, code: NoiseHandshakeErrorCode, options?: ErrorOptions) {

    super(message, code, options);

    this.code = code;
  }
}

/**
 * Noise handshake aborted because the per-step timeout elapsed.
 */
export class NoiseHandshakeTimeoutError extends NoiseHandshakeError {}

/**
 * Peer (the device) closed the socket while the noise handshake was still in flight. Triggers fallback to plaintext when applicable.
 */
export class PeerClosedDuringNoiseError extends NoiseHandshakeError {}

/**
 * Failure during the plaintext handshake exchange (HelloRequest/HelloResponse, or ConnectRequest/ConnectResponse for password-authenticated devices).
 */
export class PlaintextHandshakeError extends HandshakeError {}

/**
 * Authentication failed: device rejected the supplied password. Permanent because retrying the same wrong password will not succeed.
 *
 * @remarks This class is part of the public hierarchy but no current library throw site constructs it - modern ESPHome firmware (API >= 1.11) does not require a
 * password handshake, and the legacy CONNECT_REQUEST/CONNECT_RESPONSE path in `authenticateIfNeeded` does not inspect the
 * `invalid_password` field of the response. Available to consumer-supplied wrappers that authenticate against a custom transport.
 */
export class AuthenticationError extends PermanentError {}

/**
 * Connection attempt timed out before the device responded. Transient: typically the device is rebooting or briefly unreachable.
 */
export class ConnectionTimeoutError extends ConnectionError {}

/**
 * Underlying TCP connection refused (device not listening yet, port closed). Transient: device may be booting.
 */
export class ConnectionRefusedError extends ConnectionError {}

/**
 * Peer closed the connection cleanly or unexpectedly mid-session.
 */
export class ConnectionClosedByPeerError extends ConnectionError {}

/**
 * Heartbeat liveness check exhausted its stall budget without inbound activity. The connection is presumed dead.
 */
export class HeartbeatStalledError extends ConnectionError {}

/**
 * Device announced an API major version outside the client's supported range. Permanent because no protocol exchange will resolve it.
 *
 * @remarks The actual major-version-out-of-range check in `applyHelloResponse` throws {@link NegotiationFailedError} with code
 * `API_MAJOR_OUT_OF_RANGE` rather than this class. Kept in the public hierarchy for backwards-compatibility with consumers that may have written
 * `instanceof IncompatibleApiVersionError` against the v1 surface; new code should narrow on `NegotiationFailedError`.
 */
export class IncompatibleApiVersionError extends PermanentError {}

/**
 * A command was issued before the client connected, or after it disconnected. Indicates a lifecycle ordering bug in consumer code.
 *
 * @remarks Reserved as a forward-compat slot. The current host class returns `false` from `command()` and rejects with {@link ConfigurationError}
 * `UNKNOWN_ENTITY_ID` from {@link EspHomeClient.commandAndAwait} when an entity has not been discovered, rather than throwing this class. Available to
 * consumer-supplied wrappers that want stricter pre-flight enforcement.
 */
export class NotConnectedError extends EspHomeError {}

// Encryption-specific permanent errors.

/**
 * The device requires encryption but no PSK was provided in the client options. Consumer must configure the encryption key.
 */
export class EncryptionKeyMissingError extends PermanentError {}

/**
 * The supplied PSK is the wrong length, malformed, or rejected by the device. Consumer must provide the correct key.
 */
export class EncryptionKeyInvalidError extends PermanentError {}

/**
 * The server sent the noise-protocol indicator while the client was in plaintext mode (no PSK configured). Consumer must supply a PSK.
 */
export class EncryptionRequiredError extends PermanentError {}

// Protocol / encoding.

/**
 * Generic wire-protocol error. Parent class for framing, encoding, and decoding failures.
 */
export class ProtocolError extends EspHomeError {}

/**
 * A single inbound noise frame failed the ChaCha20-Poly1305 tag check on an already-handshaked session.
 *
 * @remarks This is transient: a corrupted or glitched frame desyncs the cipher nonce, and the correct recovery is a full reconnect (a fresh handshake re-establishes
 * the cipher state). It is deliberately distinct from handshake-time {@link EncryptionKeyInvalidError}, which is a permanent key misconfiguration the consumer must
 * fix. Because it extends {@link ProtocolError} (not {@link PermanentError}), the default reconnect supervisor retries it rather than giving up.
 */
export class DecryptionFailedError extends ProtocolError {}

/**
 * Decoder failed to parse an inbound message. Usually indicates a protocol bug, malformed device firmware output, or a wire-format change we don't support yet.
 *
 * @remarks Narrowing parent. The library does not throw this class directly - decoder failures surface as the more specific subclasses {@link MalformedVarintError},
 * {@link MessageTooManyFieldsError}, and {@link TruncatedMessageError}. Consumers can `instanceof DecodingError` to catch the whole family.
 */
export class DecodingError extends ProtocolError {}

/**
 * Encoder failed to serialize an outbound message. Indicates a bug or out-of-range field value.
 */
export class EncodingError extends ProtocolError {}

/**
 * The client received a message referencing an entity type the schema registry doesn't know about.
 *
 * @remarks Reserved as a forward-compat slot. The discovery dispatcher uses warn-and-drop semantics (logged via the structured logger; entry skipped) for unknown
 * entity types so a newer device with an entity type this client does not recognize still discovers the rest of its surface. Available to consumer-supplied wrappers
 * or strict-mode configurations that want to fail closed.
 */
export class UnknownEntityTypeError extends ProtocolError {}

/**
 * The client received a message type the dispatcher doesn't recognize. Often a forward-compat scenario: a newer device sent a message this client didn't expect.
 *
 * @remarks Reserved as a forward-compat slot. Today the run-phase dispatcher uses warn-and-drop semantics (logged + `metrics.messages.unknown_type`) so an unknown
 * message type does not tear down the connection. Available to consumer-supplied wrappers or strict-mode configurations that want to fail closed.
 */
export class UnknownMessageTypeError extends ProtocolError {}

/**
 * Inbound frame exceeded {@link EspHomeClientOpenOptions.maxFrameBytes}. Hard limit protects against malformed length-prefixes from a buggy or
 * hostile device.
 */
export class FrameTooLargeError extends ProtocolError {}

/**
 * The receive buffer accumulated more bytes than {@link EspHomeClientOpenOptions.maxRecvBufferBytes} without producing a complete frame. The peer is
 * sending garbage or has stalled mid-frame.
 */
export class BufferOverflowError extends ProtocolError {}

/**
 * A protobuf message contained more fields than {@link EspHomeClientOpenOptions.maxFieldsPerMessage}. Bounds the decoder's allocation so a hostile or
 * buggy device cannot exhaust memory.
 */
export class MessageTooManyFieldsError extends DecodingError {}

/**
 * A varint exceeded the 10-byte stop-bit limit (the 64-bit varint maximum). Indicates malformed input.
 */
export class MalformedVarintError extends DecodingError {}

/**
 * A fixed-width or length-delimited field declared a width that runs past the end of the message body. Indicates a truncated or malformed inbound message - a field
 * tag claims more bytes than the buffer holds.
 *
 * @remarks Raised by `decodeProtobuf` when a FIXED32, FIXED64, or LENGTH_DELIMITED read would overrun the remaining buffer, so the decoder
 * surfaces one typed error for the truncation condition instead of silently clamping (FIXED32 / LENGTH_DELIMITED) or throwing an untyped `RangeError` (FIXED64).
 * Like every {@link DecodingError}, it is contained: the run-phase receiver catches it and drops the single malformed frame rather than tearing down the connection.
 * The need-more-bytes seam the transport relies on for frame-boundary detection lives in `readVarint` / `tryDrainPlaintextFrame`, not here, so this typed error does
 * not perturb framing.
 */
export class TruncatedMessageError extends DecodingError {}

// Backpressure / streams.

/**
 * Emitted into a stream operating in `backpressure: "throw"` mode when the high-water mark is exceeded. Carries the dropped-item count for diagnostics.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#backpressure-policy}
 */
export class BackpressureError extends EspHomeError {

  /**
   * Number of items the stream dropped before the high-water-mark throw fired.
   */
  public readonly dropped: number;

  /**
   * Creates a new BackpressureError.
   *
   * @param message - Human-readable description.
   * @param dropped - Number of items dropped before the throw fired.
   * @param options - Standard ErrorOptions.
   */
  constructor(message: string, dropped: number, options?: ErrorOptions) {

    super(message, "BACKPRESSURE_EXCEEDED", options);

    this.dropped = dropped;
  }
}

/**
 * Tagged codes for {@link CameraStreamClosedError}.
 *
 * @remarks The type is a discriminated union so additional codes can be added without breaking consumer `switch` statements that already pattern-match on the
 * code. Mirrors the {@link NoiseHandshakeErrorCode} forward-compat shape.
 *
 * Code table:
 *
 * - `STREAM_CLOSED` - The bus stream the snapshot awaits closed (typically because the transport disconnected) before any matching `CAMERA_IMAGE_RESPONSE` arrived
 *   for the requested camera id. Carried by {@link CameraStreamClosedError}.
 */
export type CameraStreamClosedErrorCode = "STREAM_CLOSED";

/**
 * Operational failure: the bus stream backing {@link CameraApi.snapshot} closed before any image arrived for the requested camera id.
 *
 * @remarks Standalone subclass of {@link EspHomeError} rather than a {@link ConfigurationError} code: this is not consumer misuse, it is an operational event
 * (typically the transport disconnected mid-snapshot). Follows the {@link BackpressureError} precedent for operational standalones. The
 * {@link CameraStreamClosedError.cameraId} property carries the branded id of the camera that failed so a consumer awaiting multiple cameras can correlate the
 * rejection.
 *
 */
export class CameraStreamClosedError extends EspHomeError {

  /**
   * Branded camera id (the `${type}-${objectId}` form) whose snapshot was awaiting an image when the bus stream closed.
   */
  public readonly cameraId: string;

  /**
   * Narrowed code. Overrides the base class's optional `code` to make it required and narrowed.
   */
  public override readonly code: CameraStreamClosedErrorCode;

  /**
   * Creates a new CameraStreamClosedError.
   *
   * @param message - Human-readable description.
   * @param code - Narrowed code (currently always `STREAM_CLOSED`).
   * @param cameraId - The branded camera id whose snapshot was awaiting an image.
   * @param options - Standard ErrorOptions; pass `{ cause }` to preserve an underlying error.
   */
  constructor(message: string, code: CameraStreamClosedErrorCode, cameraId: string, options?: ErrorOptions) {

    super(message, code, options);

    this.cameraId = cameraId;
    this.code = code;
  }
}

// User-facing / negotiation.

/**
 * Construction-time misconfiguration: bad PSK length, missing host, conflicting options, etc. Caught at the boundary so internal code can trust validated structures.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#command-error-handling}
 *
 */
export class ConfigurationError extends EspHomeError {}

/**
 * API version negotiation found no overlap between the client's supported range and the device's announced range. Permanent without consumer intervention.
 *
 * @remarks Carries a documented `code` so consumers can pattern-match the specific negotiation failure mode without parsing the message string. The single throw
 * site lives in `applyHelloResponse`; the supported range is the `SUPPORTED_API_MAJORS` constant in the host class.
 *
 * Code table:
 *
 * - `API_MAJOR_OUT_OF_RANGE` - The device announced an API major version outside the client's supported range. The error message names the negotiated major and the
 *   supported range so a consumer hitting this in production can debug device-firmware mismatch.
 *
 */
export class NegotiationFailedError extends PermanentError {}

/**
 * A command was issued for a capability the device does not expose (e.g., voice-assistant operation against a device without the voice-assistant feature flag).
 *
 * @remarks Reserved as a forward-compat slot. Today the sub-API getters (`client.voiceAssistant`, `client.camera(id)`) are unconditionally available and
 * capability gating is the consumer's responsibility - the canonical pattern is `if(client.capabilities().voiceAssistant.supported) { ... }`. Available to
 * consumer-supplied wrappers that want to gate sub-API calls strictly.
 */
export class UnsupportedCapabilityError extends EspHomeError {}
