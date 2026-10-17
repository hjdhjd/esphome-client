[**esphome-client**](../README.md)

***

[Home](../README.md) / EspHomeError

# Class: EspHomeError

Base class for every library-emitted error.

## Remarks

Carries an optional machine-readable [code](#code) alongside the human-readable message so consumers can `switch` on the code for exhaustive handling.
Subclasses narrow the code to a tagged string union where appropriate. The class name is automatically copied from `this.constructor.name`, which keeps
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

      // The PSK is the wrong length, or the device rejected it as the wrong key.
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

    // Noise-handshake-specific failures. Order matters: the peer-closed subclass must come before the NoiseHandshakeError parent so its tagged `code`
    // (PEER_CLOSED_NOISE / PEER_PLAINTEXT_DURING_NOISE) does not collapse into the parent branch.
    if(error instanceof PeerClosedDuringNoiseError) {

      // Peer ended the connection mid-handshake or sent a plaintext indicator byte.
      log.error("The peer abandoned the noise handshake.", error.code);

      return;
    }

    if(error instanceof NoiseHandshakeError) {

      // Generic noise-protocol failure; inspect `code` for the specific cause, such as SERVER_NAME_MISMATCH when the device announced a server name other than the
      // configured `serverName`.
      log.error("The noise handshake failed.", error.code);

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

    if(error instanceof ConnectionLostError) {

      // The connection a request was issued on was torn down before the request completed, or a disconnect cut a manual connect short. `cause` carries what ended
      // the connection when the teardown knew it.
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

      log.error("A stream subscriber fell behind and dropped events.", error.dropped);

      return;
    }

    // An awaiting request issued with no connection to carry it, so nothing was sent. `code` is CONNECT_IN_PROGRESS when a connect was running as the call was
    // issued, so the call can be issued again from a connect listener, and NOT_CONNECTED otherwise.
    if(error instanceof NotConnectedError) {

      log.error("The request was issued with no connection to carry it.", error.code);

      return;
    }

    // Library-level catch-all. Any EspHomeError subclass not narrowed above (ConfigurationError from a misuse path, etc.) falls here.
    if(error instanceof EspHomeError) {

      return;
    }

    // The library's connect or handshake timeout elapsed. The open was given no signal of its own, so a platform TimeoutError here can only be the library's; the
    // step it elapsed in is logged at debug level.
    if((error instanceof DOMException) && (error.name === "TimeoutError")) {

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

- [`BackpressureError`](BackpressureError.md)
- [`ConfigurationError`](ConfigurationError.md)
- [`ConnectionError`](ConnectionError.md)
- [`NotConnectedError`](NotConnectedError.md)
- [`PermanentError`](PermanentError.md)
- [`ProtocolError`](ProtocolError.md)
- [`UnsupportedCapabilityError`](UnsupportedCapabilityError.md)

## Constructors

### Constructor

```ts
new EspHomeError(
   message, 
   code?, 
   options?
): EspHomeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
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
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
