[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyStatus

# Variable: SerialProxyStatus

```ts
const SerialProxyStatus: {
  ASSUMED_SUCCESS: 1;
  ERROR: 2;
  NOT_SUPPORTED: 4;
  OK: 0;
  TIMEOUT: 3;
};
```

Serial-proxy status code carried on `SerialProxyRequestResponse.status`. Mirrors `api.proto` `SerialProxyStatus` (§api.proto, `SerialProxyRequestResponse.status`). OK
and ASSUMED_SUCCESS both indicate the requested operation completed (ASSUMED_SUCCESS is used when the device cannot verify completion but has no reason to suspect
failure); ERROR, TIMEOUT, and NOT_SUPPORTED are the failure variants.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-assumed_success"></a> `ASSUMED_SUCCESS` | `1` | `1` |
| <a id="property-error"></a> `ERROR` | `2` | `2` |
| <a id="property-not_supported"></a> `NOT_SUPPORTED` | `4` | `4` |
| <a id="property-ok"></a> `OK` | `0` | `0` |
| <a id="property-timeout"></a> `TIMEOUT` | `3` | `3` |
