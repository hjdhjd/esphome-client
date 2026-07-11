[**esphome-client**](../README.md)

***

[Home](../README.md) / EncryptionKeyInvalidError

# Class: EncryptionKeyInvalidError

The supplied PSK is the wrong length, malformed, or rejected by the device. Consumer must provide the correct key.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new EncryptionKeyInvalidError(
   message, 
   code?, 
   options?): EncryptionKeyInvalidError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`EncryptionKeyInvalidError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
