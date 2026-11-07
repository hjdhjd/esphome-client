[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionError

# Class: ConnectionError

Generic connection-lifecycle failure. Parent class for transport-level errors that aren't more specifically classified.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Extended by

- [`ConnectionClosedByPeerError`](ConnectionClosedByPeerError.md)
- [`ConnectionLostError`](ConnectionLostError.md)
- [`ConnectionRefusedError`](ConnectionRefusedError.md)
- [`ConnectionTimeoutError`](ConnectionTimeoutError.md)
- [`HandshakeError`](HandshakeError.md)
- [`HeartbeatStalledError`](HeartbeatStalledError.md)

## Constructors

### Constructor

```ts
new ConnectionError(
   message, 
   code?, 
   options?
): ConnectionError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConnectionError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `public readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
