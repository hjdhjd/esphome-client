[**esphome-client**](../README.md)

***

[Home](../README.md) / SensorStateClass

# Type Alias: SensorStateClass

```ts
type SensorStateClass = typeof SensorStateClass[keyof typeof SensorStateClass];
```

State-class classification for sensor entities, surfaced on `ListEntitiesSensorResponse` (`state_class` field). Mirrors `api.proto` `SensorStateClass`. The class
tells the consumer how to interpret a numeric sensor reading over time (instantaneous measurement vs. monotonically increasing total vs. resetting total vs. angular
measurement).
