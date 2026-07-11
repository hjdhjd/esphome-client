[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothScannerStateData

# Interface: BluetoothScannerStateData

One inbound scanner-state push. The device emits the wire-level `BluetoothScannerStateResponse` frame whenever the scanner transitions through its state machine
(IDLE -> STARTING -> RUNNING when activated, RUNNING -> STOPPING -> STOPPED when deactivated, FAILED on controller-level error). Pushes are unsolicited at the wire
level - the client does not subscribe; the device emits whenever a transition happens.

`mode` reflects the scanner's currently active mode; `configuredMode` reflects the mode the consumer asked for via [BluetoothProxyApi.setScannerMode](../classes/BluetoothProxyApi.md#setscannermode). These
usually agree once the scanner reaches RUNNING; they may temporarily diverge during a mode-change transition.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="configuredmode"></a> `configuredMode` | `readonly` | [`BluetoothScannerMode`](../type-aliases/BluetoothScannerMode.md) | Mode the consumer last requested via [BluetoothProxyApi.setScannerMode](../classes/BluetoothProxyApi.md#setscannermode). |
| <a id="mode"></a> `mode` | `readonly` | [`BluetoothScannerMode`](../type-aliases/BluetoothScannerMode.md) | Mode the scanner is currently operating in. |
| <a id="state"></a> `state` | `readonly` | [`BluetoothScannerState`](../type-aliases/BluetoothScannerState.md) | Current scanner state. |
