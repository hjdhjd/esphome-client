[**esphome-client**](../README.md)

***

[Home](../README.md) / HandshakeError

# Class: HandshakeError

Failure of the Noise handshake, or of the cipher state it establishes.

## Remarks

Narrowing parent. The library does not throw this class directly - these failures surface as its more specific subclasses ([NoiseHandshakeError](NoiseHandshakeError.md)
and [PeerClosedDuringNoiseError](PeerClosedDuringNoiseError.md)). Consumers can `instanceof HandshakeError` to catch the whole family. On the client's own connection, an inbound frame that
fails to decrypt once the handshake has completed surfaces as [DecryptionFailedError](DecryptionFailedError.md), a [ProtocolError](ProtocolError.md) outside the family; the exported `CipherState`
primitive, driven directly, raises [NoiseHandshakeError](NoiseHandshakeError.md) for its own inbound failures. The HELLO exchange's refusals, [EncryptionRequiredError](EncryptionRequiredError.md) when the
device requires encryption and [NegotiationFailedError](NegotiationFailedError.md) when version negotiation fails, are [PermanentError](PermanentError.md) subclasses outside the family, as are the key
errors the Noise handshake raises ([EncryptionKeyMissingError](EncryptionKeyMissingError.md) and [EncryptionKeyInvalidError](EncryptionKeyInvalidError.md)).

## Extends

- [`ConnectionError`](ConnectionError.md)

## Extended by

- [`NoiseHandshakeError`](NoiseHandshakeError.md)

## Constructors

### Constructor

```ts
new HandshakeError(
   message, 
   code?, 
   options?
): HandshakeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`HandshakeError`

#### Inherited from

[`ConnectionError`](ConnectionError.md).[`constructor`](ConnectionError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `public readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`ConnectionError`](ConnectionError.md).[`code`](ConnectionError.md#code) |
