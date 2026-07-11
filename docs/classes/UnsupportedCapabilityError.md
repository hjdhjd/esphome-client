[**esphome-client**](../README.md)

***

[Home](../README.md) / UnsupportedCapabilityError

# Class: UnsupportedCapabilityError

A command was issued for a capability the device does not expose (e.g., voice-assistant operation against a device without the voice-assistant feature flag).

## Remarks

Reserved as a forward-compat slot. Today the sub-API getters (`client.voiceAssistant`, `client.camera(id)`) are unconditionally available and
capability gating is the consumer's responsibility - the canonical pattern is `if(client.capabilities().voiceAssistant.supported) { ... }`. Available to
consumer-supplied wrappers that want to gate sub-API calls strictly.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new UnsupportedCapabilityError(
   message, 
   code?, 
   options?): UnsupportedCapabilityError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`UnsupportedCapabilityError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
