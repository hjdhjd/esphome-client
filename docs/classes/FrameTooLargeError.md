[**esphome-client**](../README.md)

***

[Home](../README.md) / FrameTooLargeError

# Class: FrameTooLargeError

Inbound frame exceeded [EspHomeClientOpenOptions.maxFrameBytes](../interfaces/EspHomeClientOpenOptions.md#maxframebytes). Hard limit protects against malformed length-prefixes from a buggy or
hostile device.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new FrameTooLargeError(
   message, 
   code?, 
   options?): FrameTooLargeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`FrameTooLargeError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
