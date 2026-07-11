[**esphome-client**](../README.md)

***

[Home](../README.md) / HandshakeError

# Class: HandshakeError

Failure during the protocol handshake (plaintext or noise).

## Remarks

Narrowing parent. The library does not throw this class directly - every handshake failure surfaces a more specific subclass
([NoiseHandshakeError](NoiseHandshakeError.md), [NoiseHandshakeTimeoutError](NoiseHandshakeTimeoutError.md), [PeerClosedDuringNoiseError](PeerClosedDuringNoiseError.md), [PlaintextHandshakeError](PlaintextHandshakeError.md)). Consumers can
`instanceof HandshakeError` to catch the whole family.

## Extends

- [`ConnectionError`](ConnectionError.md)

## Extended by

- [`NoiseHandshakeError`](NoiseHandshakeError.md)
- [`PlaintextHandshakeError`](PlaintextHandshakeError.md)

## Constructors

### Constructor

```ts
new HandshakeError(
   message, 
   code?, 
   options?): HandshakeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`HandshakeError`

#### Inherited from

[`ConnectionError`](ConnectionError.md).[`constructor`](ConnectionError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ConnectionError`](ConnectionError.md).[`code`](ConnectionError.md#code) |
