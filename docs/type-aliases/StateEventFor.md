[**esphome-client**](../README.md)

***

[Home](../README.md) / StateEventFor

# Type Alias: StateEventFor\<S\>

```ts
type StateEventFor<S> = ApplyOverride<WireStateEventFor<S>, S["type"] & string, EventOverrides>;
```

Public state-event shape for a schema. Combines the wire shape with any override entry for the entity type.

## Type Parameters

| Type Parameter |
| ------ |
| `S` *extends* [`EntitySchema`](../interfaces/EntitySchema.md) |
