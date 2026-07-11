[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialDataChunk

# Interface: SerialDataChunk

One inbound serial-data chunk emitted on the `serialData` bus event. The `instance` field correlates with the [SerialProxyInfo](SerialProxyInfo.md) index used at subscribe time so
a single bus listener can route across multiple instances.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="data"></a> `data` | `readonly` | `Buffer` | Raw bytes received from the UART. The buffer is yielded verbatim - no decoding, no trimming. |
| <a id="instance"></a> `instance` | `readonly` | `number` | Zero-based instance index identifying the source UART port. |
