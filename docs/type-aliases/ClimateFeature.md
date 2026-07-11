[**esphome-client**](../README.md)

***

[Home](../README.md) / ClimateFeature

# Type Alias: ClimateFeature

```ts
type ClimateFeature = typeof ClimateFeature[keyof typeof ClimateFeature];
```

Climate capability bits packed into the `feature_flags` field on `ListEntitiesClimateResponse` (ESPHome API 1.14+). Mirrors the upstream firmware enum
`ClimateFeatures` in `esphome/components/climate/climate_mode.h`. The schema's `packedBitsFields` declaration uses these bit values to surface each capability as a
named boolean on the climate entity (`entity.supportsAction: boolean` etc.), with the deprecated per-capability boolean fields (proto fields 5, 6, 12, 22, 23)
acting as fallbacks when `feature_flags` is absent on older firmware.

The `REQUIRES_TWO_POINT_TARGET_TEMPERATURE` bit has no pre-1.14 boolean counterpart; it only surfaces on firmware that emits `feature_flags`.
