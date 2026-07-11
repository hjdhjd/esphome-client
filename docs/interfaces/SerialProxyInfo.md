[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyInfo

# Interface: SerialProxyInfo

Per-instance metadata for a serial-proxy port advertised by the device. The array index in [DeviceInfo.serialProxies](DeviceInfo.md#serialproxies) is the `instance`
number used in every subsequent serial-proxy wire message. Empty (or undefined) when the device firmware was not compiled with `USE_SERIAL_PROXY`.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `readonly` | `string` | Human-readable port name (e.g., "uart_0"). |
| <a id="porttype"></a> `portType` | `readonly` | [`SerialProxyPortType`](../type-aliases/SerialProxyPortType.md) | Port type discriminant - mirrors [SerialProxyPortType](../variables/SerialProxyPortType.md). |
