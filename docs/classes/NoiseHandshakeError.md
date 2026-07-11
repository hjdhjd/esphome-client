[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseHandshakeError

# Class: NoiseHandshakeError

Failure during the Noise NNpsk0 handshake itself. Carries a narrowed [NoiseHandshakeErrorCode](../type-aliases/NoiseHandshakeErrorCode.md) for precise dispatch.

## Extends

- [`HandshakeError`](HandshakeError.md)

## Extended by

- [`NoiseHandshakeTimeoutError`](NoiseHandshakeTimeoutError.md)
- [`PeerClosedDuringNoiseError`](PeerClosedDuringNoiseError.md)

## Constructors

### Constructor

```ts
new NoiseHandshakeError(
   message, 
   code, 
   options?): NoiseHandshakeError;
```

Creates a new NoiseHandshakeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`NoiseHandshakeError`

#### Overrides

[`HandshakeError`](HandshakeError.md).[`constructor`](HandshakeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. Overrides the base class's optional `code` to make it required and discriminated. | [`HandshakeError`](HandshakeError.md).[`code`](HandshakeError.md#code) |
