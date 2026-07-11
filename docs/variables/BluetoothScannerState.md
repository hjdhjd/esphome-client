[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothScannerState

# Variable: BluetoothScannerState

```ts
const BluetoothScannerState: {
  FAILED: 3;
  IDLE: 0;
  RUNNING: 2;
  STARTING: 1;
  STOPPED: 5;
  STOPPING: 4;
};
```

Bluetooth-proxy scanner state values pushed by the device on `BluetoothScannerStateResponse`. The state machine transitions through IDLE -> STARTING -> RUNNING when
scanning is activated, and RUNNING -> STOPPING -> STOPPED when deactivated. FAILED indicates the device's scanner refused to start (typically due to BT
controller-level errors). Mirrors `api.proto` `BluetoothScannerState` (§api.proto, `BluetoothScannerStateResponse.state`).

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-failed"></a> `FAILED` | `3` | `3` |
| <a id="property-idle"></a> `IDLE` | `0` | `0` |
| <a id="property-running"></a> `RUNNING` | `2` | `2` |
| <a id="property-starting"></a> `STARTING` | `1` | `1` |
| <a id="property-stopped"></a> `STOPPED` | `5` | `5` |
| <a id="property-stopping"></a> `STOPPING` | `4` | `4` |
