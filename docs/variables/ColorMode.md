[**esphome-client**](../README.md)

***

[Home](../README.md) / ColorMode

# Variable: ColorMode

```ts
const ColorMode: {
  BRIGHTNESS: 3;
  COLD_WARM_WHITE: 19;
  COLOR_TEMPERATURE: 11;
  ON_OFF: 1;
  RGB: 35;
  RGB_COLD_WARM_WHITE: 51;
  RGB_COLOR_TEMPERATURE: 47;
  RGB_WHITE: 39;
  UNKNOWN: 0;
  WHITE: 7;
};
```

Color modes supported by ESPHome light entities. These define the color control capabilities of lights. The numeric values are an upstream capability bitfield
(`ColorMode` in `api.proto`): each entry ORs together the capability bits its mode requires, which is why the sequence is sparse (0, 1, 3, 7, 11, 19, 35, 39, 47, 51)
rather than contiguous. The deprecated `COLOR_MODE_LEGACY_BRIGHTNESS = 2` is intentionally not exported - it was superseded by `BRIGHTNESS` (3).

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-brightness"></a> `BRIGHTNESS` | `3` | `3` |
| <a id="property-cold_warm_white"></a> `COLD_WARM_WHITE` | `19` | `19` |
| <a id="property-color_temperature"></a> `COLOR_TEMPERATURE` | `11` | `11` |
| <a id="property-on_off"></a> `ON_OFF` | `1` | `1` |
| <a id="property-rgb"></a> `RGB` | `35` | `35` |
| <a id="property-rgb_cold_warm_white"></a> `RGB_COLD_WARM_WHITE` | `51` | `51` |
| <a id="property-rgb_color_temperature"></a> `RGB_COLOR_TEMPERATURE` | `47` | `47` |
| <a id="property-rgb_white"></a> `RGB_WHITE` | `39` | `39` |
| <a id="property-unknown"></a> `UNKNOWN` | `0` | `0` |
| <a id="property-white"></a> `WHITE` | `7` | `7` |
