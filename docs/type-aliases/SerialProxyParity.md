[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyParity

# Type Alias: SerialProxyParity

```ts
type SerialProxyParity = typeof SerialProxyParity[keyof typeof SerialProxyParity];
```

Serial-proxy parity values accepted on `SerialProxyConfigureRequest`. Mirrors `api.proto` `SerialProxyParity` (§api.proto, `SerialProxyConfigureRequest.parity`). The
three values are the only ones the upstream firmware accepts; ESPHome's serial-proxy component rejects any other value.
