[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityId

# Type Alias: EntityId\<T\>

```ts
type EntityId<T> = string & {
  __entityType: T;
};
```

Branded entity-id type. The phantom type parameter `T` carries the entity type at the type level only - no runtime cost. `EntityId<"light">` and `EntityId<"switch">`
are distinct types that the type checker refuses to assign across, eliminating "passed wrong id to wrong API" bugs at compile time.

## Type Declaration

| Name | Type |
| ------ | ------ |
| `__entityType` | `T` |

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* `string` | [`EntityType`](EntityType.md) |

## Remarks

The constraint is `T extends string` (not `T extends EntityType`) so callers using [ExtraSchemaSet](ExtraSchemaSet.md)-registered entity types can
mint branded ids for them - `EntityId<"door_cover">` is a valid brand even though `"door_cover"` is not a built-in entity-type key. The default parameter remains
[EntityType](EntityType.md) so existing call sites that index `EntityId` without a type argument continue to resolve to the canonical built-in union.
