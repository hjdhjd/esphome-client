[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerState

# Type Alias: MediaPlayerState

```ts
type MediaPlayerState = typeof MediaPlayerState[keyof typeof MediaPlayerState];
```

Media player state values reported by ESPHome media player entities on telemetry. Mirrors `api.proto` `MediaPlayerState`. Use this constant for narrowing on
`MediaPlayerEvent.state` instead of raw numeric literals.
