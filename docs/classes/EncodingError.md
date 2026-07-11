[**esphome-client**](../README.md)

***

[Home](../README.md) / EncodingError

# Class: EncodingError

Encoder failed to serialize an outbound message. Indicates a bug or out-of-range field value.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new EncodingError(
   message, 
   code?, 
   options?): EncodingError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`EncodingError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
