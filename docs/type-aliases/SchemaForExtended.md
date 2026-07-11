[**esphome-client**](../README.md)

***

[Home](../README.md) / SchemaForExtended

# Type Alias: SchemaForExtended\<T, Extras\>

```ts
type SchemaForExtended<T, Extras> = T extends EntityType ? typeof ENTITY_SCHEMAS[T] : T extends keyof Extras ? Extras[T] : never;
```

Resolve an entity-type string to its [EntitySchema](../interfaces/EntitySchema.md) type by consulting either the built-in [ENTITY\_SCHEMAS](../variables/ENTITY_SCHEMAS.md) or the supplied [ExtraSchemaSet](ExtraSchemaSet.md).
Drives the type-level threading on the public surface: `latest<T>()`, `command<T>()`, `commandAndAwait<T>()`, `snapshotFor<T>()`, `telemetryFor<T>()`, and
`telemetryForId<T>()` all index through this helper so an extras-keyed entity type narrows to its declared schema's entity / event / command shape.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | The entity-type string. Must be a member of [ExtendedEntityType](ExtendedEntityType.md)<`Extras`>. |
| `Extras` *extends* [`ExtraSchemaSet`](ExtraSchemaSet.md) | The [ExtraSchemaSet](ExtraSchemaSet.md) threaded through the client instance. |
