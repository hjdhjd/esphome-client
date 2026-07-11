[**esphome-client**](../README.md)

***

[Home](../README.md) / DecodingError

# Class: DecodingError

Decoder failed to parse an inbound message. Usually indicates a protocol bug, malformed device firmware output, or a wire-format change we don't support yet.

## Remarks

Narrowing parent. The library does not throw this class directly - decoder failures surface as the more specific subclasses [MalformedVarintError](MalformedVarintError.md),
[MessageTooManyFieldsError](MessageTooManyFieldsError.md), and [TruncatedMessageError](TruncatedMessageError.md). Consumers can `instanceof DecodingError` to catch the whole family.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Extended by

- [`MessageTooManyFieldsError`](MessageTooManyFieldsError.md)
- [`MalformedVarintError`](MalformedVarintError.md)
- [`TruncatedMessageError`](TruncatedMessageError.md)

## Constructors

### Constructor

```ts
new DecodingError(
   message, 
   code?, 
   options?): DecodingError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`DecodingError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
