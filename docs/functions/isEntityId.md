[**esphome-client**](../README.md)

***

[Home](../README.md) / isEntityId

# Function: isEntityId()

```ts
function isEntityId<T>(value, type): value is EntityId<T>;
```

Runtime predicate for narrowing an untrusted string into a branded entity id of a specific type. The predicate matches when the string starts with `${type}-`; we
do not validate that the entity actually exists at this point - that's a separate runtime check via [EspHomeClient.hasEntity](../classes/EspHomeClient.md#hasentity) after the type
narrowing.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `string` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The untrusted string to test. |
| `type` | `T` | The expected entity type. |

## Returns

`value is EntityId<T>`

True if `value` is a branded entity id of `type`.

## Remarks

Case-sensitive by design. As a type guard it narrows `value` to `EntityId<T>` WITHOUT transforming it, so it can only soundly accept the canonical
lower-cased form [entityId](entityId.md) mints - accepting a mixed-case string would brand a non-canonical id that then fails to match the registry. For lenient, normalizing
parsing of mixed-case input, use [parseEntityId](parseEntityId.md), which lower-cases as it parses. (The strict-guard vs lenient-parser split mirrors `Number.isInteger` vs
`parseInt`.)
