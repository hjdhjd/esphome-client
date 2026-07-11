[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityCategory

# Variable: EntityCategory

```ts
const EntityCategory: {
  CONFIG: 1;
  DIAGNOSTIC: 2;
  NONE: 0;
};
```

Entity-category classification reported on every `ListEntities*Response` payload (`entity_category` field). Mirrors `api.proto` `EntityCategory`. Use for filtering
UI display lists ("show config entities separately from diagnostics") and for narrowing on `entity.entityCategory` rather than comparing against magic numbers.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-config"></a> `CONFIG` | `1` | `1` |
| <a id="property-diagnostic"></a> `DIAGNOSTIC` | `2` | `2` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
