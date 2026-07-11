[**esphome-client**](../README.md)

***

[Home](../README.md) / NegotiationFailedError

# Class: NegotiationFailedError

API version negotiation found no overlap between the client's supported range and the device's announced range. Permanent without consumer intervention.

## Remarks

Carries a documented `code` so consumers can pattern-match the specific negotiation failure mode without parsing the message string. The single throw
site lives in `applyHelloResponse`; the supported range is the `SUPPORTED_API_MAJORS` constant in the host class.

Code table:

- `API_MAJOR_OUT_OF_RANGE` - The device announced an API major version outside the client's supported range. The error message names the negotiated major and the
  supported range so a consumer hitting this in production can debug device-firmware mismatch.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new NegotiationFailedError(
   message, 
   code?, 
   options?): NegotiationFailedError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`NegotiationFailedError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
