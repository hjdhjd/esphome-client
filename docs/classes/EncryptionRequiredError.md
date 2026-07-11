[**esphome-client**](../README.md)

***

[Home](../README.md) / EncryptionRequiredError

# Class: EncryptionRequiredError

The server sent the noise-protocol indicator while the client was in plaintext mode (no PSK configured). Consumer must supply a PSK.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new EncryptionRequiredError(
   message, 
   code?, 
   options?): EncryptionRequiredError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`EncryptionRequiredError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
