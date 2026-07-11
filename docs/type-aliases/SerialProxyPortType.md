[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyPortType

# Type Alias: SerialProxyPortType

```ts
type SerialProxyPortType = typeof SerialProxyPortType[keyof typeof SerialProxyPortType];
```

Serial-proxy port-type discriminant carried on each `SerialProxyInfo` entry advertised by the device in `DeviceInfoResponse.serial_proxies`. Mirrors `api.proto`
`SerialProxyPortType` (§api.proto, `SerialProxyInfo.port_type`). The numeric value distinguishes the wiring topology so consumers can adapt timing or DTR/RTS use; the
client is otherwise indifferent to the value.
