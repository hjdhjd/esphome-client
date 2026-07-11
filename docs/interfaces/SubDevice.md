[**esphome-client**](../README.md)

***

[Home](../README.md) / SubDevice

# Interface: SubDevice

One sub-device on a multi-device parent ESP. Returned in order from [EspHomeClient.subDevices](../classes/EspHomeClient.md#subdevices).

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="areaid"></a> `areaId?` | `number` | Optional area id, when the device declares itself in an area. Pulled from the proto's `area_id` field. |
| <a id="id"></a> `id` | `number` | Numeric `device_id` from the protocol. Always positive for sub-devices; the parent device is `0` and not enumerated here. |
| <a id="name"></a> `name?` | `string` | Optional human-readable name. Pulled from the proto's `name` field; absent when the device declares no name. |
