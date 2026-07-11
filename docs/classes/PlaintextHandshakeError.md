[**esphome-client**](../README.md)

***

[Home](../README.md) / PlaintextHandshakeError

# Class: PlaintextHandshakeError

Failure during the plaintext handshake exchange (HelloRequest/HelloResponse, or ConnectRequest/ConnectResponse for password-authenticated devices).

## Extends

- [`HandshakeError`](HandshakeError.md)

## Constructors

### Constructor

```ts
new PlaintextHandshakeError(
   message, 
   code?, 
   options?): PlaintextHandshakeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`PlaintextHandshakeError`

#### Inherited from

[`HandshakeError`](HandshakeError.md).[`constructor`](HandshakeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`HandshakeError`](HandshakeError.md).[`code`](HandshakeError.md#code) |
