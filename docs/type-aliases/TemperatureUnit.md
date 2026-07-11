[**esphome-client**](../README.md)

***

[Home](../README.md) / TemperatureUnit

# Type Alias: TemperatureUnit

```ts
type TemperatureUnit = typeof TemperatureUnit[keyof typeof TemperatureUnit];
```

Temperature units reported by climate and water-heater entities on `ListEntities*Response`. Mirrors `api.proto` `TemperatureUnit`. Carried by ESPHome firmware
that advertises API minor 14 or higher with the temperature-unit extension; firmware that does not omits the field, and consumers should treat the unit as
celsius by default in that case. Capability gate: `client.capabilities().climateTemperatureUnit`.
