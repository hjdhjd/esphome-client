[**esphome-client**](../README.md)

***

[Home](../README.md) / MalformedVarintError

# Class: MalformedVarintError

A varint exceeded the 10-byte stop-bit limit (the 64-bit varint maximum). Indicates malformed input.

## Extends

- [`DecodingError`](DecodingError.md)

## Constructors

### Constructor

```ts
new MalformedVarintError(
   message, 
   code?, 
   options?): MalformedVarintError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`MalformedVarintError`

#### Inherited from

[`DecodingError`](DecodingError.md).[`constructor`](DecodingError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`DecodingError`](DecodingError.md).[`code`](DecodingError.md#code) |
