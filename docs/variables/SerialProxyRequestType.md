[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyRequestType

# Variable: SerialProxyRequestType

```ts
const SerialProxyRequestType: {
  FLUSH: 2;
  SUBSCRIBE: 0;
  UNSUBSCRIBE: 1;
};
```

Serial-proxy request-type tag carried on `SerialProxyRequest` (subscribe / unsubscribe the inbound data stream, or flush the device-side TX buffer). Mirrors
`api.proto` `SerialProxyRequestType` (§api.proto, `SerialProxyRequest.type`). FLUSH is the only request type that produces a matching `SerialProxyRequestResponse`;
SUBSCRIBE and UNSUBSCRIBE are fire-and-forget at the wire level.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-flush"></a> `FLUSH` | `2` | `2` |
| <a id="property-subscribe"></a> `SUBSCRIBE` | `0` | `0` |
| <a id="property-unsubscribe"></a> `UNSUBSCRIBE` | `1` | `1` |
