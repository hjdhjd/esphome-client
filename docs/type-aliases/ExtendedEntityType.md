[**esphome-client**](../README.md)

***

[Home](../README.md) / ExtendedEntityType

# Type Alias: ExtendedEntityType\<Extras\>

```ts
type ExtendedEntityType<Extras> = EntityType | keyof Extras & string;
```

The typed entity-type union for a client parameterized by an [ExtraSchemaSet](ExtraSchemaSet.md). Resolves to the union of the built-in [EntityType](EntityType.md) keys and the extras
keys, so an `EspHomeClient<{ door_cover: ... }>` accepts `"door_cover"` everywhere `EntityType` is accepted on the public surface.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `Extras` *extends* [`ExtraSchemaSet`](ExtraSchemaSet.md) | The [ExtraSchemaSet](ExtraSchemaSet.md) threaded through the client instance. |
