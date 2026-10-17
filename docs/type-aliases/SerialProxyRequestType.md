[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyRequestType

# Type Alias: SerialProxyRequestType

```ts
type SerialProxyRequestType = typeof SerialProxyRequestType[keyof typeof SerialProxyRequestType];
```

Serial-proxy request-type tag carried on `SerialProxyRequest` (subscribe / unsubscribe the inbound data stream, or flush the device-side TX buffer). Mirrors
`api.proto` `SerialProxyRequestType` (§api.proto, `SerialProxyRequest.type`). FLUSH is the only request type that produces a matching `SerialProxyRequestResponse`;
SUBSCRIBE and UNSUBSCRIBE are fire-and-forget at the wire level.
