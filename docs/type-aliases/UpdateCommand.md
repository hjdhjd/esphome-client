[**esphome-client**](../README.md)

***

[Home](../README.md) / UpdateCommand

# Type Alias: UpdateCommand

```ts
type UpdateCommand = typeof UpdateCommand[keyof typeof UpdateCommand];
```

Update commands accepted by ESPHome update entities. Mirrors `api.proto` `UpdateCommand`. The schema's command `enumMappings` also accepts the string keys (`"none"` /
`"update"` / `"check"`); this constant gives consumers a named alternative that survives wire-enum additions.
