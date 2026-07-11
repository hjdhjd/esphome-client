[**esphome-client**](../README.md)

***

[Home](../README.md) / UnknownEntityTypeError

# Class: UnknownEntityTypeError

The client received a message referencing an entity type the schema registry doesn't know about.

## Remarks

Reserved as a forward-compat slot. The discovery dispatcher uses warn-and-drop semantics (logged via the structured logger; entry skipped) for unknown
entity types so a newer device with an entity type this client does not recognize still discovers the rest of its surface. Available to consumer-supplied wrappers
or strict-mode configurations that want to fail closed.

## Extends

- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

```ts
new UnknownEntityTypeError(
   message, 
   code?, 
   options?): UnknownEntityTypeError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`UnknownEntityTypeError`

#### Inherited from

[`ProtocolError`](ProtocolError.md).[`constructor`](ProtocolError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`ProtocolError`](ProtocolError.md).[`code`](ProtocolError.md#code) |
