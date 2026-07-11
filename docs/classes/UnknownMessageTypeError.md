[**esphome-client**](../README.md)

***

[Home](../README.md) / UnknownMessageTypeError

# Class: UnknownMessageTypeError

The client received a message type the dispatcher doesn't recognize. Often a forward-compat scenario: a newer device sent a message this client didn't expect.

## Remarks

Reserved as a forward-compat slot. Today the run-phase dispatcher uses warn-and-drop semantics (logged + `metrics.messages.unknown_type`) so an unknown
message type does not tear down the connection. Available to consumer-supplied wrappers or strict-mode configurations that want to fail closed.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new UnknownMessageTypeError(
   message, 
   code?, 
   options?): UnknownMessageTypeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`UnknownMessageTypeError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
