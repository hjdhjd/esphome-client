[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionLostError

# Class: ConnectionLostError

The connection a request was issued on ended before the request completed. A pending request rejects with it when that connection is torn down, and a manual
connect that a disconnect cuts short rejects with it too.

## Remarks

Carries the code `CONNECTION_LOST`, and every wait one teardown ends rejects with the same instance. When the teardown knew what ended the connection (a
transport fault, a heartbeat stall, a connect that failed after its transport attached), `cause` carries it; an explicit disconnect, a device's own disconnect
request, and a superseding connect leave `cause` unset. It is distinct from the `CONNECTION_DROPPED` [ConnectionError](ConnectionError.md) the reconnect supervisor's
`shouldRetry` predicate receives for a disconnect with no typed cause: that error describes the end of the session to the supervisor, while this one is what a
request still waiting on the session receives.

## Extends

- [`ConnectionError`](ConnectionError.md)

## Constructors

### Constructor

```ts
new ConnectionLostError(
   message, 
   code?, 
   options?
): ConnectionLostError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConnectionLostError`

#### Inherited from

[`ConnectionError`](ConnectionError.md).[`constructor`](ConnectionError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`ConnectionError`](ConnectionError.md).[`code`](ConnectionError.md#code) |
