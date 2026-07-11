[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothScannerMode

# Type Alias: BluetoothScannerMode

```ts
type BluetoothScannerMode = typeof BluetoothScannerMode[keyof typeof BluetoothScannerMode];
```

Bluetooth-proxy scanner-mode values accepted on `BluetoothScannerSetModeRequest` and reported on `BluetoothScannerStateResponse`. PASSIVE listens for advertisements
without sending scan requests; ACTIVE additionally sends scan requests to elicit scan-response data from advertisers. Mirrors `api.proto` `BluetoothScannerMode`
(§api.proto, `BluetoothScannerSetModeRequest.mode`).
