[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandFor

# Type Alias: CommandFor\<S\>

```ts
type CommandFor<S> = ApplyOverride<WireCommandFor<S>, S["type"] & string, CommandOverrides>;
```

Public command-options shape for a schema. Wire shape minus omitted fields plus added fields per the `CommandOverrides` entry.

## Type Parameters

| Type Parameter |
| ------ |
| `S` *extends* [`EntitySchema`](../interfaces/EntitySchema.md) |
