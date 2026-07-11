[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerState

# Variable: MediaPlayerState

```ts
const MediaPlayerState: {
  ANNOUNCING: 4;
  IDLE: 1;
  NONE: 0;
  OFF: 5;
  ON: 6;
  PAUSED: 3;
  PLAYING: 2;
};
```

Media player state values reported by ESPHome media player entities on telemetry. Mirrors `api.proto` `MediaPlayerState`. Use this constant for narrowing on
`MediaPlayerEvent.state` instead of raw numeric literals.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-announcing"></a> `ANNOUNCING` | `4` | `4` |
| <a id="property-idle"></a> `IDLE` | `1` | `1` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-off"></a> `OFF` | `5` | `5` |
| <a id="property-on"></a> `ON` | `6` | `6` |
| <a id="property-paused"></a> `PAUSED` | `3` | `3` |
| <a id="property-playing"></a> `PLAYING` | `2` | `2` |
