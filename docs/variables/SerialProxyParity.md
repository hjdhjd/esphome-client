[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyParity

# Variable: SerialProxyParity

```ts
const SerialProxyParity: {
  EVEN: 1;
  NONE: 0;
  ODD: 2;
};
```

Serial-proxy parity values accepted on `SerialProxyConfigureRequest`. Mirrors `api.proto` `SerialProxyParity` (§api.proto, `SerialProxyConfigureRequest.parity`). The
three values are the only ones the upstream firmware accepts; ESPHome's serial-proxy component rejects any other value.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-even"></a> `EVEN` | `1` | `1` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-odd"></a> `ODD` | `2` | `2` |
