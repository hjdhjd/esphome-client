[**esphome-client**](../README.md)

***

[Home](../README.md) / ColorMode

# Type Alias: ColorMode

```ts
type ColorMode = typeof ColorMode[keyof typeof ColorMode];
```

Color modes supported by ESPHome light entities. These define the color control capabilities of lights. The numeric values are an upstream capability bitfield
(`ColorMode` in `api.proto`): each entry ORs together the capability bits its mode requires, which is why the sequence is sparse (0, 1, 3, 7, 11, 19, 35, 39, 47, 51)
rather than contiguous. The deprecated `COLOR_MODE_LEGACY_BRIGHTNESS = 2` is intentionally not exported - it was superseded by `BRIGHTNESS` (3).
