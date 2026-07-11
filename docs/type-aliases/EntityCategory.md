[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityCategory

# Type Alias: EntityCategory

```ts
type EntityCategory = typeof EntityCategory[keyof typeof EntityCategory];
```

Entity-category classification reported on every `ListEntities*Response` payload (`entity_category` field). Mirrors `api.proto` `EntityCategory`. Use for filtering
UI display lists ("show config entities separately from diagnostics") and for narrowing on `entity.entityCategory` rather than comparing against magic numbers.
