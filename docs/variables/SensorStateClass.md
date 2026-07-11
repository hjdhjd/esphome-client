[**esphome-client**](../README.md)

***

[Home](../README.md) / SensorStateClass

# Variable: SensorStateClass

```ts
const SensorStateClass: {
  MEASUREMENT: 1;
  MEASUREMENT_ANGLE: 4;
  NONE: 0;
  TOTAL: 3;
  TOTAL_INCREASING: 2;
};
```

State-class classification for sensor entities, surfaced on `ListEntitiesSensorResponse` (`state_class` field). Mirrors `api.proto` `SensorStateClass`. The class
tells the consumer how to interpret a numeric sensor reading over time (instantaneous measurement vs. monotonically increasing total vs. resetting total vs. angular
measurement).

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-measurement"></a> `MEASUREMENT` | `1` | `1` |
| <a id="property-measurement_angle"></a> `MEASUREMENT_ANGLE` | `4` | `4` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-total"></a> `TOTAL` | `3` | `3` |
| <a id="property-total_increasing"></a> `TOTAL_INCREASING` | `2` | `2` |
