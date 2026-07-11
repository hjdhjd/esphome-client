[**esphome-client**](../README.md)

***

[Home](../README.md) / ClimateFeature

# Variable: ClimateFeature

```ts
const ClimateFeature: {
  REQUIRES_TWO_POINT_TARGET_TEMPERATURE: 4;
  SUPPORTS_ACTION: 32;
  SUPPORTS_CURRENT_HUMIDITY: 8;
  SUPPORTS_CURRENT_TEMPERATURE: 1;
  SUPPORTS_TARGET_HUMIDITY: 16;
  SUPPORTS_TWO_POINT_TARGET_TEMPERATURE: 2;
};
```

Climate capability bits packed into the `feature_flags` field on `ListEntitiesClimateResponse` (ESPHome API 1.14+). Mirrors the upstream firmware enum
`ClimateFeatures` in `esphome/components/climate/climate_mode.h`. The schema's `packedBitsFields` declaration uses these bit values to surface each capability as a
named boolean on the climate entity (`entity.supportsAction: boolean` etc.), with the deprecated per-capability boolean fields (proto fields 5, 6, 12, 22, 23)
acting as fallbacks when `feature_flags` is absent on older firmware.

The `REQUIRES_TWO_POINT_TARGET_TEMPERATURE` bit has no pre-1.14 boolean counterpart; it only surfaces on firmware that emits `feature_flags`.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-requires_two_point_target_temperature"></a> `REQUIRES_TWO_POINT_TARGET_TEMPERATURE` | `4` | `4` |
| <a id="property-supports_action"></a> `SUPPORTS_ACTION` | `32` | `32` |
| <a id="property-supports_current_humidity"></a> `SUPPORTS_CURRENT_HUMIDITY` | `8` | `8` |
| <a id="property-supports_current_temperature"></a> `SUPPORTS_CURRENT_TEMPERATURE` | `1` | `1` |
| <a id="property-supports_target_humidity"></a> `SUPPORTS_TARGET_HUMIDITY` | `16` | `16` |
| <a id="property-supports_two_point_target_temperature"></a> `SUPPORTS_TWO_POINT_TARGET_TEMPERATURE` | `2` | `2` |
