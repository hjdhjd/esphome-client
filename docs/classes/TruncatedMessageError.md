[**esphome-client**](../README.md)

***

[Home](../README.md) / TruncatedMessageError

# Class: TruncatedMessageError

A fixed-width or length-delimited field declared a width that runs past the end of the message body. Indicates a truncated or malformed inbound message - a field
tag claims more bytes than the buffer holds.

## Remarks

Raised by `decodeProtobuf` when a FIXED32, FIXED64, or LENGTH_DELIMITED read would overrun the remaining buffer, so the decoder
surfaces one typed error for the truncation condition instead of silently clamping (FIXED32 / LENGTH_DELIMITED) or throwing an untyped `RangeError` (FIXED64).
Like every [DecodingError](DecodingError.md), it is contained: the run-phase receiver catches it and drops the single malformed frame rather than tearing down the connection.
The need-more-bytes seam the transport relies on for frame-boundary detection lives in `readVarint` / `tryDrainPlaintextFrame`, not here, so this typed error does
not perturb framing.

## Extends

- [`DecodingError`](DecodingError.md)

## Constructors

### Constructor

```ts
new TruncatedMessageError(
   message, 
   code?, 
   options?): TruncatedMessageError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`TruncatedMessageError`

#### Inherited from

[`DecodingError`](DecodingError.md).[`constructor`](DecodingError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`DecodingError`](DecodingError.md).[`code`](DecodingError.md#code) |
