[**esphome-client**](../README.md)

***

[Home](../README.md) / NumberMode

# Variable: NumberMode

```ts
const NumberMode: {
  AUTO: 0;
  BOX: 1;
  SLIDER: 2;
};
```

Number-entity input mode, surfaced on `ListEntitiesNumberResponse` (`mode` field). Mirrors `api.proto` `NumberMode`. The mode tells the consumer how to render
the number input - free-form auto, exact numeric box, or bounded slider.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-auto"></a> `AUTO` | `0` | `0` |
| <a id="property-box"></a> `BOX` | `1` | `1` |
| <a id="property-slider"></a> `SLIDER` | `2` | `2` |
