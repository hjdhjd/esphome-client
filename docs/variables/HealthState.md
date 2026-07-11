[**esphome-client**](../README.md)

***

[Home](../README.md) / HealthState

# Variable: HealthState

```ts
const HealthState: {
  CONNECTED: "connected";
  DISCONNECTED: "disconnected";
  RECONNECTING: "reconnecting";
  STALLED: "stalled";
};
```

Connection-health states. Modeled as an `as const` object so the type narrows to a literal union without an enum.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-connected"></a> `CONNECTED` | `"connected"` | `"connected"` |
| <a id="property-disconnected"></a> `DISCONNECTED` | `"disconnected"` | `"disconnected"` |
| <a id="property-reconnecting"></a> `RECONNECTING` | `"reconnecting"` | `"reconnecting"` |
| <a id="property-stalled"></a> `STALLED` | `"stalled"` | `"stalled"` |
