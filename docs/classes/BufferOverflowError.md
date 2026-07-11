[**esphome-client**](../README.md)

***

[Home](../README.md) / BufferOverflowError

# Class: BufferOverflowError

The receive buffer accumulated more bytes than [EspHomeClientOpenOptions.maxRecvBufferBytes](../interfaces/EspHomeClientOpenOptions.md#maxrecvbufferbytes) without producing a complete frame. The peer is
sending garbage or has stalled mid-frame.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new BufferOverflowError(
   message, 
   code?, 
   options?): BufferOverflowError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`BufferOverflowError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
