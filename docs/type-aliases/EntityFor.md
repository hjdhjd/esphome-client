[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityFor

# Type Alias: EntityFor\<S\>

```ts
type EntityFor<S> = ApplyOverride<WireEntityFor<S>, S["type"] & string, EntityOverrides>;
```

Public entity shape for a schema. Combines the wire shape with any override entry for the entity type. Most entities have no override; the override layer is the
exhaustive list of intentional wire-vs-API divergences.

## Type Parameters

| Type Parameter |
| ------ |
| `S` *extends* [`EntitySchema`](../interfaces/EntitySchema.md) |
