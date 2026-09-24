[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseServerHello

# Interface: NoiseServerHello

The facts a device announces in its Noise server hello, the first frame it sends on an encrypted connection and the only one it sends before any key is used.

## Remarks

The hello is unauthenticated: any peer can announce any name or MAC address. Supplying a key in answer to it never reveals the key, because the device
receives only a handshake message sealed with it and an impostor without the key cannot complete the handshake. The MAC address a consumer admits a device under
should be the authenticated [DeviceInfo.macAddress](DeviceInfo.md#macaddress) the client delivers after the encrypted connection completes, not the one announced here.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="macaddress"></a> `macAddress?` | `readonly` | `string` | The device's MAC address in the library's public form, uppercase and colon-separated (`"24:4C:AB:06:49:9C"`), the same form [DeviceInfo.macAddress](DeviceInfo.md#macaddress) carries. Absent on firmware before ESPHome 2025.4.0, which announces only the node name. |
| <a id="name"></a> `name?` | `readonly` | `string` | The device's node name. |
