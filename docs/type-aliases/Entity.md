[**esphome-client**](../README.md)

***

[Home](../README.md) / Entity

# Type Alias: Entity

```ts
type Entity = { [K in keyof typeof ENTITY_SCHEMAS]: EntityFor<typeof ENTITY_SCHEMAS[K]> }[keyof typeof ENTITY_SCHEMAS];
```

Discriminated union of every entity in [ENTITY\_SCHEMAS](../variables/ENTITY_SCHEMAS.md). Adding a new entity type to the schema registry extends this union automatically with no parallel
declaration to maintain.
