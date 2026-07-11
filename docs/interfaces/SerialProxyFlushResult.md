[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyFlushResult

# Interface: SerialProxyFlushResult

Result of [SerialProxyApi.flush](../classes/SerialProxyApi.md#flush). The numeric `status` discriminates success (`OK` or `ASSUMED_SUCCESS`) from failure (`ERROR`, `TIMEOUT`, `NOT_SUPPORTED`); the
optional `errorMessage` accompanies failure variants when the device supplies one. The `type` field always echoes `SerialProxyRequestType.FLUSH` for results
surfaced by this method; it is included so the result shape parallels future request-types that may share the same response message.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="errormessage"></a> `errorMessage?` | `readonly` | `string` | Optional human-readable error message supplied by the device. Absent on success and on most failure variants. |
| <a id="instance"></a> `instance` | `readonly` | `number` | Zero-based instance index identifying the UART port. |
| <a id="status"></a> `status` | `readonly` | [`SerialProxyStatus`](../type-aliases/SerialProxyStatus.md) | Wire-level completion status. See [SerialProxyStatus](../variables/SerialProxyStatus.md). |
| <a id="type"></a> `type` | `readonly` | `2` | Echoed request type. Always `SerialProxyRequestType.FLUSH` for results surfaced by [SerialProxyApi.flush](../classes/SerialProxyApi.md#flush). |
