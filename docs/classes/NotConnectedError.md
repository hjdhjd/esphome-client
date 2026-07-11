[**esphome-client**](../README.md)

***

[Home](../README.md) / NotConnectedError

# Class: NotConnectedError

A command was issued before the client connected, or after it disconnected. Indicates a lifecycle ordering bug in consumer code.

## Remarks

Reserved as a forward-compat slot. The current host class returns `false` from `command()` and rejects with [ConfigurationError](ConfigurationError.md)
`UNKNOWN_ENTITY_ID` from [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) when an entity has not been discovered, rather than throwing this class. Available to
consumer-supplied wrappers that want stricter pre-flight enforcement.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new NotConnectedError(
   message, 
   code?, 
   options?): NotConnectedError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`NotConnectedError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
