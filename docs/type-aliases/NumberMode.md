[**esphome-client**](../README.md)

***

[Home](../README.md) / NumberMode

# Type Alias: NumberMode

```ts
type NumberMode = typeof NumberMode[keyof typeof NumberMode];
```

Number-entity input mode, surfaced on `ListEntitiesNumberResponse` (`mode` field). Mirrors `api.proto` `NumberMode`. The mode tells the consumer how to render
the number input - free-form auto, exact numeric box, or bounded slider.
