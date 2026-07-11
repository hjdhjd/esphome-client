[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothScannerState

# Type Alias: BluetoothScannerState

```ts
type BluetoothScannerState = typeof BluetoothScannerState[keyof typeof BluetoothScannerState];
```

Bluetooth-proxy scanner state values pushed by the device on `BluetoothScannerStateResponse`. The state machine transitions through IDLE -> STARTING -> RUNNING when
scanning is activated, and RUNNING -> STOPPING -> STOPPED when deactivated. FAILED indicates the device's scanner refused to start (typically due to BT
controller-level errors). Mirrors `api.proto` `BluetoothScannerState` (§api.proto, `BluetoothScannerStateResponse.state`).
