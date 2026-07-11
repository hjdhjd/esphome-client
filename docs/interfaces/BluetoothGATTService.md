[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothGATTService

# Interface: BluetoothGATTService

GATT service metadata. Surfaced from [BluetoothProxyApi.getServices](../classes/BluetoothProxyApi.md#getservices) as an array of services; the device streams services across multiple wire frames terminated
by a sentinel, and the sub-API accumulates them transparently.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="characteristics"></a> `characteristics` | `readonly` | readonly [`BluetoothGATTCharacteristic`](BluetoothGATTCharacteristic.md)[] | Characteristics owned by this service. |
| <a id="handle"></a> `handle` | `readonly` | `number` | Service handle (the start of the service's attribute range). |
| <a id="shortuuid"></a> `shortUuid?` | `readonly` | `number` | 16-bit or 32-bit assigned-number UUID. |
| <a id="uuid"></a> `uuid?` | `readonly` | readonly `bigint`[] | 128-bit UUID as two `uint64` halves. |
