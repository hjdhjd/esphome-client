/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.ts: Typed error hierarchy for the ESPHome client library.
 */

/**
 * Typed error hierarchy used across the ESPHome client.
 *
 * @remarks Every distinct failure mode has its own class. Consumers can `instanceof`-check and pattern-match without parsing log strings. The {@link PermanentError}
 * marker classifies errors that the auto-reconnect supervisor should not retry; subclasses extending it (encryption misconfigurations and version-negotiation
 * failures) are filtered out of the default retry path.
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
 * @remarks The default reconnect supervisor filters with `!(error instanceof PermanentError)`. The subclasses the library throws cover encryption misconfigurations
 * and version-negotiation failures. Adding a new permanent failure mode is one new subclass and the filter picks it up automatically.
 *
 * Abstract on purpose: the marker is meaningful only when applied to a concrete subclass.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#permanent-vs-transient}
 */
export abstract class PermanentError extends EspHomeError {}

// Connection lifecycle.

/**
 * Generic connection-lifecycle failure. Parent class for transport-level errors that aren't more specifically classified.
 */
export class ConnectionError extends EspHomeError {}

/**
 * Failure of the Noise handshake, or of the cipher state it establishes.
 *
 * @remarks Narrowing parent. The library does not throw this class directly - these failures surface as its more specific subclasses ({@link NoiseHandshakeError}
 * and {@link PeerClosedDuringNoiseError}). Consumers can `instanceof HandshakeError` to catch the whole family. On the client's own connection, an inbound frame that
 * fails to decrypt once the handshake has completed surfaces as {@link DecryptionFailedError}, a {@link ProtocolError} outside the family; the exported `CipherState`
 * primitive, driven directly, raises {@link NoiseHandshakeError} for its own inbound failures. The HELLO exchange's refusals, {@link EncryptionRequiredError} when the
 * device requires encryption and {@link NegotiationFailedError} when version negotiation fails, are {@link PermanentError} subclasses outside the family, as are the key
 * errors the Noise handshake raises ({@link EncryptionKeyMissingError} and {@link EncryptionKeyInvalidError}).
 */
export class HandshakeError extends ConnectionError {}

/**
 * Tagged codes for noise-handshake failure modes that consumers can pattern-match on.
 *
 * @remarks Each code names a specific failure mode the consumer can pattern-match on. The throw sites live in `crypto-noise.ts` (low-level cipher / handshake state),
 * `lifecycle/handshake.ts` (orchestration), and `transport.ts` (the frame writer's `MSG_TOO_LONG` guard and every `PEER_*_NOISE` code, each carried by the
 * {@link PeerClosedDuringNoiseError} subclass).
 *
 * Code table:
 *
 * - `AUTH_FAILED` - ChaCha20-Poly1305 authentication tag verification failed during decryption (`crypto-noise.ts`). Wrong PSK or tampered ciphertext; the
 *   connect-flow handshake re-tags this into a permanent {@link EncryptionKeyInvalidError} coded `NOISE_HANDSHAKE_FAILED`.
 * - `CT_TOO_SHORT` - Inbound ciphertext was shorter than the 16-byte AEAD tag (`crypto-noise.ts`). Malformed inbound noise frame.
 * - `HANDSHAKE_COMPLETE` - A handshake-state operation was attempted after the handshake already completed (`crypto-noise.ts`). Library-internal lifecycle bug.
 * - `HANDSHAKE_REJECTED` - The device rejected the handshake in-band for a reason other than a wrong key, such as a malformed or unexpected handshake frame
 *   (`lifecycle/handshake.ts`). The message carries the device's reason text. Not a key problem, so it stays transient; a wrong key is reported instead as a permanent
 *   {@link EncryptionKeyInvalidError}.
 * - `INVALID_PSK_LENGTH` - The PSK, or a cipher key installed through `CipherState.InitializeKey`, is not exactly 32 bytes (`crypto-noise.ts`). Consumer-supplied
 *   configuration error; the connect-flow handshake re-tags the PSK case into a permanent {@link EncryptionKeyInvalidError}.
 * - `INVALID_REMOTE_KEY` - The remote ephemeral public key was malformed or a low-order point, so X25519 key agreement failed (`crypto-noise.ts`). The `diffieHellman`
 *   primitive rejected the peer key; the connect-flow handshake re-tags this into a permanent {@link EncryptionKeyInvalidError}.
 * - `MISSING_KEYS` - A Diffie-Hellman or post-handshake step required keys that were not yet initialized (`crypto-noise.ts`, `lifecycle/handshake.ts`).
 * - `MSG_TOO_LONG` - Outbound noise message exceeded the 65535-byte protocol limit, `NOISE_MAX_MESSAGE_LEN`, which the frame writer (`transport.ts`) and the cipher
 *   (`crypto-noise.ts`) enforce. Indicates an oversized payload.
 * - `NONCE_EXHAUSTED` - The ChaCha20-Poly1305 nonce reached the reserved maximum 2^64 - 1 (`crypto-noise.ts`). Per Noise §5.1 that nonce is reserved for rekey and must
 *   never encrypt or decrypt a transport message; physically unreachable in practice (it would require 2^64 messages on one connection).
 * - `NOT_INITIALIZED` - Reserved for future use; no current throw site constructs this code. Kept in the union for forward compatibility.
 * - `PEER_CLOSED_NOISE` - The peer ended the TCP connection, whether as a close, a reset or a failed write, during the noise handshake before it had sent any Noise frame
 *   (`transport.ts`); an ending after the device has spoken Noise is an ordinary {@link ConnectionClosedByPeerError}. Carried by {@link PeerClosedDuringNoiseError}.
 * - `PEER_PLAINTEXT_DURING_NOISE` - The peer responded with the plaintext indicator byte (0x00) during the noise handshake (`transport.ts`). Triggers fallback to
 *   plaintext when the consumer has not insisted on encryption. Carried by {@link PeerClosedDuringNoiseError}.
 * - `SERVER_NAME_MISMATCH` - The device's noise-handshake server hello announced a server name other than the one the client's `serverName` option expects
 *   (`lifecycle/handshake.ts`). The check runs before any key is in use.
 * - `TRUNCATED_E` - The ephemeral public key segment in an inbound handshake message was shorter than 32 bytes (`crypto-noise.ts`, `lifecycle/handshake.ts`).
 * - `UNSUPPORTED_TOKEN` - The device's noise-handshake server-hello frame selected a protocol byte other than 1 (`lifecycle/handshake.ts`). Indicates the peer
 *   negotiated a noise protocol variant this client does not support.
 */
export type NoiseHandshakeErrorCode = "AUTH_FAILED" | "CT_TOO_SHORT" | "HANDSHAKE_COMPLETE" | "HANDSHAKE_REJECTED" | "INVALID_PSK_LENGTH" | "INVALID_REMOTE_KEY" |
  "MISSING_KEYS" | "MSG_TOO_LONG" | "NONCE_EXHAUSTED" | "NOT_INITIALIZED" | "PEER_CLOSED_NOISE" | "PEER_PLAINTEXT_DURING_NOISE" | "SERVER_NAME_MISMATCH" | "TRUNCATED_E" |
  "UNSUPPORTED_TOKEN";

/**
 * Failure during the Noise NNpsk0 handshake, or in the cipher state it establishes. Carries a narrowed {@link NoiseHandshakeErrorCode} for precise dispatch.
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
 * Peer (the device) ended the connection, whether as a close, a reset or a failed write, during the noise handshake before sending a Noise frame (`PEER_CLOSED_NOISE`),
 * or answered the handshake with the plaintext indicator byte (`PEER_PLAINTEXT_DURING_NOISE`). Triggers fallback to plaintext when applicable.
 */
export class PeerClosedDuringNoiseError extends NoiseHandshakeError {}

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
 * The connection a request was issued on ended before the request completed. A pending request rejects with it when that connection is torn down, and a manual
 * connect that a disconnect cuts short rejects with it too.
 *
 * @remarks Carries the code `CONNECTION_LOST`, and every wait one teardown ends rejects with the same instance. When the teardown knew what ended the connection (a
 * transport fault, a heartbeat stall, a connect that failed after its transport attached), `cause` carries it; an explicit disconnect, a device's own disconnect
 * request, and a superseding connect leave `cause` unset. It is distinct from the `CONNECTION_DROPPED` {@link ConnectionError} the reconnect supervisor's
 * `shouldRetry` predicate receives for a disconnect with no typed cause: that error describes the end of the session to the supervisor, while this one is what a
 * request still waiting on the session receives.
 */
export class ConnectionLostError extends ConnectionError {}

/**
 * An awaiting request was issued while no connection could carry it, so nothing was sent and no wait was registered.
 *
 * @remarks The code describes the moment the call was issued:
 *
 * - `CONNECT_IN_PROGRESS` - A manual connect had not yet settled, or the automatic reconnect was active (backing off, attempting, or announcing that it gave up). It
 *   does not promise that a connection follows, so a call issued again from a `connect` or lifecycle `connect` listener runs only if one does.
 * - `NOT_CONNECTED` - Neither was running: before the first connect, after a disconnect once any connect it cut short has settled, and inside the announcement of a
 *   lost connection, whose listeners run before the client decides whether to reconnect, so an automatic reconnect can still begin right after.
 *
 * Subscriptions and fire-and-forget sends are not refused: the client records their intent or drops their frame.
 */
export class NotConnectedError extends EspHomeError {}

// Encryption-specific permanent errors.

/**
 * The device requires encryption but no key is available for it: none was provided in the client options, or the configured {@link PskResolver} returned
 * none for the device. Consumer must configure the encryption key.
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
 * A single inbound noise frame failed to decrypt on an already-handshaked session: the ChaCha20-Poly1305 tag check failed, the frame was shorter than the tag, or the
 * receive nonce was exhausted, each raised by the receive cipher and wrapped here.
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
 * @remarks Raised by `decodeProtobuf` when a FIXED32, FIXED64, or LENGTH_DELIMITED read would overrun the remaining buffer, and by `readLengthDelimited`, the
 * length-delimited reader the codec shares with the hand-written payload decoders, when a declared body would. Either way the decoder surfaces one typed error for the
 * truncation condition instead of silently clamping (FIXED32 / LENGTH_DELIMITED) or throwing an untyped `RangeError` (FIXED64).
 * Like every {@link DecodingError}, it is contained: the run-phase receiver catches it and drops the single malformed frame rather than tearing down the connection.
 * The need-more-bytes signal the transport relies on for frame-boundary detection lives in `readVarint` / `tryDrainPlaintextFrame`, not here, so this typed error does
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

// User-facing / negotiation.

/**
 * Tagged codes for {@link ConfigurationError}. The code table lives on the class.
 */
export type ConfigurationErrorCode = "COMMAND_UNSUPPORTED" | "ENUM_VALUE_UNKNOWN" | "EXTRA_SCHEMA_OVERRIDES_BUILTIN" | "MALFORMED_ENTITY_ID" |
  "SCHEMA_MISSING_DECODE_CALLBACK" | "SCHEMA_UNKNOWN" | "UNKNOWN_ENTITY_ID" | "VALUE_OUT_OF_RANGE";

/**
 * Construction-time misconfiguration: missing host, conflicting options, etc. Caught at the boundary so internal code can trust validated structures.
 *
 * @remarks Carries a required {@link ConfigurationErrorCode} so consumers can pattern-match the specific misuse without parsing the message string.
 *
 * Code table:
 *
 * - `COMMAND_UNSUPPORTED` - {@link EspHomeClient.commandAndAwait} was called for an entity type whose schema declares no command. Nothing is sent.
 * - `ENUM_VALUE_UNKNOWN` - A {@link EspHomeClient.commandAndAwait} command field received a string that is not one of the field's enum aliases. The message names the
 *   field and the value. Nothing is sent.
 * - `EXTRA_SCHEMA_OVERRIDES_BUILTIN` - A key in the client's `extraSchemas` option names a built-in entity type. Raised at client construction.
 * - `MALFORMED_ENTITY_ID` - {@link EspHomeClient.commandAndAwait} received an id that is not a valid `${type}-${objectId}` brand.
 * - `SCHEMA_MISSING_DECODE_CALLBACK` - An entity schema declares repeated message fields but the discovery decoder was given no nested-message decoder for them.
 * - `SCHEMA_UNKNOWN` - {@link EspHomeClient.commandAndAwait} was called for an entity type no schema is registered for. Nothing is sent.
 * - `UNKNOWN_ENTITY_ID` - {@link EspHomeClient.commandAndAwait} was called for an id that has not been discovered on the current connection. Nothing is sent.
 * - `VALUE_OUT_OF_RANGE` - A {@link EspHomeClient.commandAndAwait} command field received a value outside the integer domain its wire type carries. The message
 *   names the field and the value. Nothing is sent.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#command-error-handling}
 */
export class ConfigurationError extends EspHomeError {

  /**
   * Narrowed configuration error code. Overrides the base class's optional `code` to make it required and narrowed.
   */
  public override readonly code: ConfigurationErrorCode;

  /**
   * Creates a new ConfigurationError.
   *
   * @param message - Human-readable error description.
   * @param code - Narrowed configuration error code.
   * @param options - Standard ErrorOptions; pass `{ cause }` to preserve an underlying error.
   */
  constructor(message: string, code: ConfigurationErrorCode, options?: ErrorOptions) {

    super(message, code, options);

    this.code = code;
  }
}

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
