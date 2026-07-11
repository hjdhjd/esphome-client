[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyStatus

# Type Alias: SerialProxyStatus

```ts
type SerialProxyStatus = typeof SerialProxyStatus[keyof typeof SerialProxyStatus];
```

Serial-proxy status code carried on `SerialProxyRequestResponse.status`. Mirrors `api.proto` `SerialProxyStatus` (§api.proto, `SerialProxyRequestResponse.status`). OK
and ASSUMED_SUCCESS both indicate the requested operation completed (ASSUMED_SUCCESS is used when the device cannot verify completion but has no reason to suspect
failure); ERROR, TIMEOUT, and NOT_SUPPORTED are the failure variants.
