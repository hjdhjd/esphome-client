[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionRefusedError

# Class: ConnectionRefusedError

Underlying TCP connection refused (device not listening yet, port closed). Transient: device may be booting.

## Extends

- [`ConnectionError`](ConnectionError.md)

## Constructors

### Constructor

```ts
new ConnectionRefusedError(
   message, 
   code?, 
   options?): ConnectionRefusedError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConnectionRefusedError`

#### Inherited from

[`ConnectionError`](ConnectionError.md).[`constructor`](ConnectionError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ConnectionError`](ConnectionError.md).[`code`](ConnectionError.md#code) |
