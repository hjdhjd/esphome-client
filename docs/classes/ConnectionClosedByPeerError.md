[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionClosedByPeerError

# Class: ConnectionClosedByPeerError

Peer closed the connection cleanly or unexpectedly mid-session.

## Extends

- [`ConnectionError`](ConnectionError.md)

## Constructors

### Constructor

```ts
new ConnectionClosedByPeerError(
   message, 
   code?, 
   options?): ConnectionClosedByPeerError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConnectionClosedByPeerError`

#### Inherited from

[`ConnectionError`](ConnectionError.md).[`constructor`](ConnectionError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ConnectionError`](ConnectionError.md).[`code`](ConnectionError.md#code) |
