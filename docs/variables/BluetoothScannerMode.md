[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothScannerMode

# Variable: BluetoothScannerMode

```ts
const BluetoothScannerMode: {
  ACTIVE: 1;
  PASSIVE: 0;
};
```

Bluetooth-proxy scanner-mode values accepted on `BluetoothScannerSetModeRequest` and reported on `BluetoothScannerStateResponse`. PASSIVE listens for advertisements
without sending scan requests; ACTIVE additionally sends scan requests to elicit scan-response data from advertisers. Mirrors `api.proto` `BluetoothScannerMode`
(§api.proto, `BluetoothScannerSetModeRequest.mode`).

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-active"></a> `ACTIVE` | `1` | `1` |
| <a id="property-passive"></a> `PASSIVE` | `0` | `0` |
