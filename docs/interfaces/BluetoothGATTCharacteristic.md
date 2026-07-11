[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothGATTCharacteristic

# Interface: BluetoothGATTCharacteristic

GATT characteristic metadata. The `properties` bitmask encodes the characteristic-properties bits (Read = 0x02, Write = 0x08, Notify = 0x10, etc.) as defined in the
Bluetooth Core spec; this surface passes the value through unchanged for the consumer to bit-test.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="descriptors"></a> `descriptors` | `readonly` | readonly [`BluetoothGATTDescriptor`](BluetoothGATTDescriptor.md)[] | Descriptors associated with this characteristic. |
| <a id="handle"></a> `handle` | `readonly` | `number` | Characteristic value handle. Pass this handle to [BluetoothProxyApi.readCharacteristic](../classes/BluetoothProxyApi.md#readcharacteristic) / [BluetoothProxyApi.writeCharacteristic](../classes/BluetoothProxyApi.md#writecharacteristic). |
| <a id="properties"></a> `properties` | `readonly` | `number` | BLE Core characteristic-properties bitmask. Consumers bit-test to gate UI affordances. |
| <a id="shortuuid"></a> `shortUuid?` | `readonly` | `number` | 16-bit or 32-bit assigned-number UUID. Set when `uuid` is unset. |
| <a id="uuid"></a> `uuid?` | `readonly` | readonly `bigint`[] | 128-bit UUID as two `uint64` halves. |
