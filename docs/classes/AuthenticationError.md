[**esphome-client**](../README.md)

***

[Home](../README.md) / AuthenticationError

# Class: AuthenticationError

Authentication failed: device rejected the supplied password. Permanent because retrying the same wrong password will not succeed.

## Remarks

This class is part of the public hierarchy but no current library throw site constructs it - modern ESPHome firmware (API >= 1.11) does not require a
password handshake, and the legacy CONNECT_REQUEST/CONNECT_RESPONSE path in `authenticateIfNeeded` does not inspect the
`invalid_password` field of the response. Available to consumer-supplied wrappers that authenticate against a custom transport.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new AuthenticationError(
   message, 
   code?, 
   options?): AuthenticationError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`AuthenticationError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
