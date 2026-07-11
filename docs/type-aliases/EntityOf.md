[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityOf

# Type Alias: EntityOf\<T\>

```ts
type EntityOf<T> = EntityFor<typeof ENTITY_SCHEMAS[T]>;
```

Convenience for narrowing an [Entity](Entity.md) to one entity type at the type level.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof *typeof* [`ENTITY_SCHEMAS`](../variables/ENTITY_SCHEMAS.md) |
