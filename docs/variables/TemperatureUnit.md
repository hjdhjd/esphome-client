[**esphome-client**](../README.md)

***

[Home](../README.md) / TemperatureUnit

# Variable: TemperatureUnit

```ts
const TemperatureUnit: {
  CELSIUS: 0;
  FAHRENHEIT: 1;
  KELVIN: 2;
};
```

Temperature units reported by climate and water-heater entities on `ListEntities*Response`. Mirrors `api.proto` `TemperatureUnit`. Carried by ESPHome firmware
that advertises API minor 14 or higher with the temperature-unit extension; firmware that does not omits the field, and consumers should treat the unit as
celsius by default in that case. Capability gate: `client.capabilities().climateTemperatureUnit`.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-celsius"></a> `CELSIUS` | `0` | `0` |
| <a id="property-fahrenheit"></a> `FAHRENHEIT` | `1` | `1` |
| <a id="property-kelvin"></a> `KELVIN` | `2` | `2` |
