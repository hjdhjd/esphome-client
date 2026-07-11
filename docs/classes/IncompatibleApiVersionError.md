[**esphome-client**](../README.md)

***

[Home](../README.md) / IncompatibleApiVersionError

# Class: IncompatibleApiVersionError

Device announced an API major version outside the client's supported range. Permanent because no protocol exchange will resolve it.

## Remarks

The actual major-version-out-of-range check in `applyHelloResponse` throws [NegotiationFailedError](NegotiationFailedError.md) with code
`API_MAJOR_OUT_OF_RANGE` rather than this class. Kept in the public hierarchy for backwards-compatibility with consumers that may have written
`instanceof IncompatibleApiVersionError` against the v1 surface; new code should narrow on `NegotiationFailedError`.

## Extends

- [`PermanentError`](PermanentError.md)

## Constructors

### Constructor

```ts
new IncompatibleApiVersionError(
   message, 
   code?, 
   options?): IncompatibleApiVersionError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`IncompatibleApiVersionError`

#### Inherited from

[`PermanentError`](PermanentError.md).[`constructor`](PermanentError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`PermanentError`](PermanentError.md).[`code`](PermanentError.md#code) |
