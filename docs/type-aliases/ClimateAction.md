[**esphome-client**](../README.md)

***

[Home](../README.md) / ClimateAction

# Type Alias: ClimateAction

```ts
type ClimateAction = typeof ClimateAction[keyof typeof ClimateAction];
```

Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing. Wire value 1 is intentionally
absent: `api.proto` aligns action values with the matching `ClimateMode` values "for readability", and mode value 1 (`HEAT_COOL`) has no activity counterpart, so the
sequence jumps from `OFF` (0) to `COOLING` (2). The upstream proto additionally defines `CLIMATE_ACTION_DEFROSTING = 7`, which this table does not yet enumerate; a
device reporting that action therefore falls outside the named set surfaced through the climate schema's `action` enum mapping.
