[**esphome-client**](../README.md)

***

[Home](../README.md) / MessageTooManyFieldsError

# Class: MessageTooManyFieldsError

A protobuf message contained more fields than [EspHomeClientOpenOptions.maxFieldsPerMessage](../interfaces/EspHomeClientOpenOptions.md#maxfieldspermessage). Bounds the decoder's allocation so a hostile or
buggy device cannot exhaust memory.

## Extends

- [`DecodingError`](DecodingError.md)

## Constructors

### Constructor

```ts
new MessageTooManyFieldsError(
   message, 
   code?, 
   options?): MessageTooManyFieldsError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`MessageTooManyFieldsError`

#### Inherited from

[`DecodingError`](DecodingError.md).[`constructor`](DecodingError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`DecodingError`](DecodingError.md).[`code`](DecodingError.md#code) |
