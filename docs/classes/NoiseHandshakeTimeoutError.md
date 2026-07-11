[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseHandshakeTimeoutError

# Class: NoiseHandshakeTimeoutError

Noise handshake aborted because the per-step timeout elapsed.

## Extends

- [`NoiseHandshakeError`](NoiseHandshakeError.md)

## Constructors

### Constructor

```ts
new NoiseHandshakeTimeoutError(
   message, 
   code, 
   options?): NoiseHandshakeTimeoutError;
```

Creates a new NoiseHandshakeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`NoiseHandshakeTimeoutError`

#### Inherited from

[`NoiseHandshakeError`](NoiseHandshakeError.md).[`constructor`](NoiseHandshakeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | [`NoiseHandshakeErrorCode`](../type-aliases/NoiseHandshakeErrorCode.md) | Narrowed handshake error code. Overrides the base class's optional `code` to make it required and discriminated. | [`NoiseHandshakeError`](NoiseHandshakeError.md).[`code`](NoiseHandshakeError.md#code) |
