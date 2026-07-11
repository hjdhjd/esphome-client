[**esphome-client**](../README.md)

***

[Home](../README.md) / FanDirection

# Variable: FanDirection

```ts
const FanDirection: {
  FORWARD: 0;
  REVERSE: 1;
};
```

Fan direction values reported by ESPHome fan entities and accepted on fan commands. Mirrors `api.proto` `FanDirection`. The command path also accepts the string keys
(`"forward"` / `"reverse"`) per the schema's command `enumMappings`; consumers reading telemetry receive the numeric value and should narrow against this constant.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-forward"></a> `FORWARD` | `0` | `0` |
| <a id="property-reverse"></a> `REVERSE` | `1` | `1` |
