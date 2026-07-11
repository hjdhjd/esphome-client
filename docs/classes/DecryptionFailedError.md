[**esphome-client**](../README.md)

***

[Home](../README.md) / DecryptionFailedError

# Class: DecryptionFailedError

A single inbound noise frame failed the ChaCha20-Poly1305 tag check on an already-handshaked session.

## Remarks

This is transient: a corrupted or glitched frame desyncs the cipher nonce, and the correct recovery is a full reconnect (a fresh handshake re-establishes
the cipher state). It is deliberately distinct from handshake-time [EncryptionKeyInvalidError](EncryptionKeyInvalidError.md), which is a permanent key misconfiguration the consumer must
fix. Because it extends [ProtocolError](ProtocolError.md) (not [PermanentError](PermanentError.md)), the default reconnect supervisor retries it rather than giving up.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new DecryptionFailedError(
   message, 
   code?, 
   options?): DecryptionFailedError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`DecryptionFailedError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
