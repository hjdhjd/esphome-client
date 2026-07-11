[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyPortType

# Variable: SerialProxyPortType

```ts
const SerialProxyPortType: {
  RS232: 1;
  RS485: 2;
  TTL: 0;
};
```

Serial-proxy port-type discriminant carried on each `SerialProxyInfo` entry advertised by the device in `DeviceInfoResponse.serial_proxies`. Mirrors `api.proto`
`SerialProxyPortType` (§api.proto, `SerialProxyInfo.port_type`). The numeric value distinguishes the wiring topology so consumers can adapt timing or DTR/RTS use; the
client is otherwise indifferent to the value.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-rs232"></a> `RS232` | `1` | `1` |
| <a id="property-rs485"></a> `RS485` | `2` | `2` |
| <a id="property-ttl"></a> `TTL` | `0` | `0` |
