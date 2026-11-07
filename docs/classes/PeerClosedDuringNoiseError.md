[**esphome-client**](../README.md)

***

[Home](../README.md) / PeerClosedDuringNoiseError

# Class: PeerClosedDuringNoiseError

Peer (the device) ended the connection, whether as a close, a reset or a failed write, during the noise handshake before sending a Noise frame (`PEER_CLOSED_NOISE`),
or answered the handshake with the plaintext indicator byte (`PEER_PLAINTEXT_DURING_NOISE`). Triggers fallback to plaintext when applicable.

## Extends

- [`NoiseHandshakeError`](NoiseHandshakeError.md)

## Constructors

### Constructor

```ts
new PeerClosedDuringNoiseError(
   message, 
   code, 
   options?
): PeerClosedDuringNoiseError;
```

Creates a new NoiseHandshakeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`PeerClosedDuringNoiseError`

#### Inherited from

[`NoiseHandshakeError`](NoiseHandshakeError.md).[`constructor`](NoiseHandshakeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `public readonly` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. Overrides the base class's optional `code` to make it required and narrowed. | [`NoiseHandshakeError`](NoiseHandshakeError.md).[`code`](NoiseHandshakeError.md#code) |
