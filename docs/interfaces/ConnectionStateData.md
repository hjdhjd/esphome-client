[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionStateData

# Interface: ConnectionStateData

Connection-state snapshot pushed by the device via `BluetoothDeviceConnectionResponse` (id 69). One message shape covers both the connect-completed and
disconnect-completed transitions; the `connected` boolean is the discriminant. `mtu` carries the negotiated GATT MTU (only meaningful on `connected=true`); `error`
carries a nonzero firmware-level error code when the transition failed (typical on `connected=false` for a failed connection attempt).

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="address"></a> `address` | `readonly` | `bigint` | Device BLE address. uint64 on the wire; bigint here for end-to-end precision. |
| <a id="connected"></a> `connected` | `readonly` | `boolean` | Whether the device is currently connected (true) or disconnected (false) after this transition. |
| <a id="error"></a> `error` | `readonly` | `number` | Firmware-level error code. Zero on success; nonzero on a failed transition. The numeric value is a passthrough from the upstream ESPHome BLE proxy component. |
| <a id="mtu"></a> `mtu` | `readonly` | `number` | Negotiated GATT MTU for the connected session. Zero on disconnect transitions. |
