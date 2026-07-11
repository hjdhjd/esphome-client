[**esphome-client**](../README.md)

***

[Home](../README.md) / ProtocolError

# Class: ProtocolError

Generic wire-protocol error. Parent class for framing, encoding, and decoding failures.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Extended by

- [`DecryptionFailedError`](DecryptionFailedError.md)
- [`DecodingError`](DecodingError.md)
- [`EncodingError`](EncodingError.md)
- [`UnknownEntityTypeError`](UnknownEntityTypeError.md)
- [`UnknownMessageTypeError`](UnknownMessageTypeError.md)
- [`FrameTooLargeError`](FrameTooLargeError.md)
- [`BufferOverflowError`](BufferOverflowError.md)

## Constructors

### Constructor

```ts
new ProtocolError(
   message, 
   code?, 
   options?): ProtocolError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ProtocolError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
