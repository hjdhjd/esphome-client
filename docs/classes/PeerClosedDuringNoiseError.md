[**esphome-client**](../README.md)

***

[Home](../README.md) / PeerClosedDuringNoiseError

# Class: PeerClosedDuringNoiseError

Peer (the device) closed the socket while the noise handshake was still in flight. Triggers fallback to plaintext when applicable.

## Extends

- [`NoiseHandshakeError`](NoiseHandshakeError.md)

## Constructors

### Constructor

```ts
new PeerClosedDuringNoiseError(
   message, 
   code, 
   options?): PeerClosedDuringNoiseError;
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
| <a id="code"></a> `code` | `readonly` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. Overrides the base class's optional `code` to make it required and discriminated. | [`NoiseHandshakeError`](NoiseHandshakeError.md).[`code`](NoiseHandshakeError.md#code) |
