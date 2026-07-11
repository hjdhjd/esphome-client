[**esphome-client**](../README.md)

***

[Home](../README.md) / UpdateCommand

# Variable: UpdateCommand

```ts
const UpdateCommand: {
  CHECK: 2;
  NONE: 0;
  UPDATE: 1;
};
```

Update commands accepted by ESPHome update entities. Mirrors `api.proto` `UpdateCommand`. The schema's command `enumMappings` also accepts the string keys (`"none"` /
`"update"` / `"check"`); this constant gives consumers a named alternative that survives wire-enum additions.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-check"></a> `CHECK` | `2` | `2` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-update"></a> `UPDATE` | `1` | `1` |
