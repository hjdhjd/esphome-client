[**esphome-client**](../README.md)

***

[Home](../README.md) / ClimateAction

# Variable: ClimateAction

```ts
const ClimateAction: {
  COOLING: 2;
  DRYING: 5;
  FAN: 6;
  HEATING: 3;
  IDLE: 4;
  OFF: 0;
};
```

Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing. Wire value 1 is intentionally
absent: `api.proto` aligns action values with the matching `ClimateMode` values "for readability", and mode value 1 (`HEAT_COOL`) has no activity counterpart, so the
sequence jumps from `OFF` (0) to `COOLING` (2). The upstream proto additionally defines `CLIMATE_ACTION_DEFROSTING = 7`, which this table does not yet enumerate; a
device reporting that action therefore falls outside the named set surfaced through the climate schema's `action` enum mapping.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-cooling"></a> `COOLING` | `2` | `2` |
| <a id="property-drying"></a> `DRYING` | `5` | `5` |
| <a id="property-fan"></a> `FAN` | `6` | `6` |
| <a id="property-heating"></a> `HEATING` | `3` | `3` |
| <a id="property-idle"></a> `IDLE` | `4` | `4` |
| <a id="property-off"></a> `OFF` | `0` | `0` |
