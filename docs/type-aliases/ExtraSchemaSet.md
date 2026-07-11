[**esphome-client**](../README.md)

***

[Home](../README.md) / ExtraSchemaSet

# Type Alias: ExtraSchemaSet

```ts
type ExtraSchemaSet = Readonly<Record<string, EntitySchema>>;
```

A typed registry of additional schemas keyed by entity type. Each key becomes a valid `EntityType` for the client instance it's registered on; commands, telemetry,
and entity discovery for that type pass through the same schema-driven machinery as built-in types.
