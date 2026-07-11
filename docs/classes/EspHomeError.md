[**esphome-client**](../README.md)

***

[Home](../README.md) / EspHomeError

# Class: EspHomeError

Base class for every library-emitted error.

## Remarks

Carries an optional machine-readable [code](#code) alongside the human-readable message so consumers can `switch` on the code for exhaustive handling.
Subclasses narrow the code to a discriminated string union where appropriate. The class name is automatically copied from `this.constructor.name`, which keeps
stack traces and `util.inspect` output readable.

Usage:

```ts
export async function errorClassEnumerationExample(): Promise<void> {

  try {

    await openEspHomeClient({ host: "unreachable.local", psk: null });

  } catch(error) {

    // Permanent encryption-configuration mistakes. Each extends PermanentError; auto-reconnect skips them by default.
    if(error instanceof EncryptionKeyMissingError) {

      // Device requires encryption but no PSK was supplied.
      return;
    }

    if(error instanceof EncryptionKeyInvalidError) {

      // PSK is the wrong length or the device rejected it.
      return;
    }

    if(error instanceof EncryptionRequiredError) {

      // Server requires noise but the client opted into plaintext.
      return;
    }

    if(error instanceof NegotiationFailedError) {

      // Device announced an API major version outside the client's supported range.
      return;
    }

    // Noise-handshake-specific failures. Order matters: the timeout and peer-closed subclasses must come before the NoiseHandshakeError parent so the discriminated
    // `code` field on those subclasses (HANDSHAKE_TIMEOUT / PEER_CLOSED_NOISE / PEER_PLAINTEXT_DURING_NOISE) does not collapse into the parent branch.
    if(error instanceof NoiseHandshakeTimeoutError) {

      // Per-step handshake timeout elapsed.
      return;
    }

    if(error instanceof PeerClosedDuringNoiseError) {

      // Peer closed mid-handshake or sent a plaintext indicator byte.
      void error.code;

      return;
    }

    if(error instanceof NoiseHandshakeError) {

      // Generic noise-protocol failure; inspect `code` for the specific cause.
      void error.code;

      return;
    }

    if(error instanceof PlaintextHandshakeError) {

      // Plaintext handshake (server-name mismatch, unexpected response).
      return;
    }

    // Transport-level transient failures. Each extends ConnectionError; auto-reconnect retries them by default.
    if(error instanceof ConnectionRefusedError) {

      // TCP refused (device offline or port closed).
      return;
    }

    if(error instanceof ConnectionTimeoutError) {

      // TCP did not establish before the deadline.
      return;
    }

    if(error instanceof HeartbeatStalledError) {

      // Inbound activity stopped past the stall budget; connection presumed dead.
      return;
    }

    if(error instanceof ConnectionClosedByPeerError) {

      // Peer closed the socket cleanly or unexpectedly mid-session.
      return;
    }

    if(error instanceof HandshakeError) {

      // Catch-all for any handshake subclass not enumerated above (forward-compat).
      return;
    }

    if(error instanceof ConnectionError) {

      // Catch-all for any connection-family subclass not enumerated above. Auto-reconnect handles the recovery when enabled.
      return;
    }

    // Wire-protocol failures. Each extends ProtocolError; typically indicates malformed device firmware output.
    if(error instanceof FrameTooLargeError) {

      // Inbound frame exceeded `maxFrameBytes`.
      return;
    }

    if(error instanceof BufferOverflowError) {

      // Receive buffer accumulated more than `maxRecvBufferBytes` without producing a complete frame.
      return;
    }

    if(error instanceof ProtocolError) {

      // Catch-all for any protocol-family subclass not enumerated above (decode errors, unknown indicator bytes, etc.).
      return;
    }

    // Backpressure on a stream subscriber operating in `backpressure: "throw"` mode. Carries `dropped` for diagnostics.
    if(error instanceof BackpressureError) {

      void error.dropped;

      return;
    }

    // Operational stream-closed: the bus stream backing `camera(id).snapshot()` ended (transport dropped) before an image arrived. Carries the branded `cameraId`
    // and the discriminated `STREAM_CLOSED` code so a consumer awaiting multiple cameras can correlate which snapshot failed.
    if(error instanceof CameraStreamClosedError) {

      void error.cameraId;
      void error.code;

      return;
    }

    // Library-level catch-all. Any EspHomeError subclass not narrowed above (ConfigurationError from a misuse path, etc.) falls here.
    if(error instanceof EspHomeError) {

      return;
    }

    // Not from this library.
    throw error;
  }
}
```

## Extends

- `Error`

## Extended by

- [`PermanentError`](PermanentError.md)
- [`ConnectionError`](ConnectionError.md)
- [`NotConnectedError`](NotConnectedError.md)
- [`ProtocolError`](ProtocolError.md)
- [`BackpressureError`](BackpressureError.md)
- [`CameraStreamClosedError`](CameraStreamClosedError.md)
- [`ConfigurationError`](ConfigurationError.md)
- [`UnsupportedCapabilityError`](UnsupportedCapabilityError.md)

## Constructors

### Constructor

```ts
new EspHomeError(
   message, 
   code?, 
   options?): EspHomeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`EspHomeError`

#### Overrides

```ts
Error.constructor
```

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. |
