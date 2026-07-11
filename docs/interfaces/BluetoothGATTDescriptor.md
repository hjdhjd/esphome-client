[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothGATTDescriptor

# Interface: BluetoothGATTDescriptor

GATT descriptor metadata. Carried inside [BluetoothGATTCharacteristic.descriptors](BluetoothGATTCharacteristic.md#descriptors); surfaced from [BluetoothProxyApi.getServices](../classes/BluetoothProxyApi.md#getservices). The wire fields are
(`uuid: repeated uint64`, `handle`, `short_uuid`) - 128-bit UUIDs arrive as two-element uint64 arrays; shorter assigned-number UUIDs arrive on `shortUuid`.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="handle"></a> `handle` | `readonly` | `number` | Descriptor handle. |
| <a id="shortuuid"></a> `shortUuid?` | `readonly` | `number` | 16-bit or 32-bit assigned-number UUID. Set when `uuid` is unset. |
| <a id="uuid"></a> `uuid?` | `readonly` | readonly `bigint`[] | 128-bit UUID as two `uint64` halves (little end first). Set when `shortUuid` is unset. |
