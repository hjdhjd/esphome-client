[**esphome-client**](../README.md)

***

[Home](../README.md) / TelemetryEventOf

# Type Alias: TelemetryEventOf\<T\>

```ts
type TelemetryEventOf<T> = StateEventFor<typeof ENTITY_SCHEMAS[T]>;
```

Convenience for narrowing a [TelemetryEvent](TelemetryEvent.md) to one entity type at the type level.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof *typeof* [`ENTITY_SCHEMAS`](../variables/ENTITY_SCHEMAS.md) |
