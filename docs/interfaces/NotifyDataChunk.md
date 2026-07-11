[**esphome-client**](../README.md)

***

[Home](../README.md) / NotifyDataChunk

# Interface: NotifyDataChunk

One inbound GATT notify chunk. Emitted on the `bluetoothNotifyData` bus event whenever the device pushes a `BluetoothGATTNotifyDataResponse` (id 79); the
[BluetoothProxyApi.notify](../classes/BluetoothProxyApi.md#notify) iterator filters by `(address, handle)` so consumers see only the notifications they subscribed to.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="address"></a> `address` | `readonly` | `bigint` | Device BLE address. |
| <a id="data"></a> `data` | `readonly` | `Buffer` | Notification payload bytes. |
| <a id="handle"></a> `handle` | `readonly` | `number` | Characteristic handle the notification fires for. |
