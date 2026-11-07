[**esphome-client**](../README.md)

***

[Home](../README.md) / NotConnectedError

# Class: NotConnectedError

An awaiting request was issued while no connection could carry it, so nothing was sent and no wait was registered.

## Remarks

The code describes the moment the call was issued:

- `CONNECT_IN_PROGRESS` - A manual connect had not yet settled, or the automatic reconnect was active (backing off, attempting, or announcing that it gave up). It
  does not promise that a connection follows, so a call issued again from a `connect` or lifecycle `connect` listener runs only if one does.
- `NOT_CONNECTED` - Neither was running: before the first connect, after a disconnect once any connect it cut short has settled, and inside the announcement of a
  lost connection, whose listeners run before the client decides whether to reconnect, so an automatic reconnect can still begin right after.

Subscriptions and fire-and-forget sends are not refused: the client records their intent or drops their frame.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new NotConnectedError(
   message, 
   code?, 
   options?
): NotConnectedError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`NotConnectedError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `public readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
