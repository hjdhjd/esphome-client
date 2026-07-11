[**esphome-client**](../README.md)

***

[Home](../README.md) / EncryptionKeyMissingError

# Class: EncryptionKeyMissingError

The device requires encryption but no PSK was provided in the client options. Consumer must configure the encryption key.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new EncryptionKeyMissingError(
   message, 
   code?, 
   options?): EncryptionKeyMissingError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`EncryptionKeyMissingError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
