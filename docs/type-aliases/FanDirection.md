[**esphome-client**](../README.md)

***

[Home](../README.md) / FanDirection

# Type Alias: FanDirection

```ts
type FanDirection = typeof FanDirection[keyof typeof FanDirection];
```

Fan direction values reported by ESPHome fan entities and accepted on fan commands. Mirrors `api.proto` `FanDirection`. The command path also accepts the string keys
(`"forward"` / `"reverse"`) per the schema's command `enumMappings`; consumers reading telemetry receive the numeric value and should narrow against this constant.
