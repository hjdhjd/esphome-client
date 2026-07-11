[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionParams

# Interface: ConnectionParams

Per-link connection parameters carried on `BluetoothSetConnectionParamsRequest` (id 145).

- `minInterval` / `maxInterval` are connection-interval bounds in units of 1.25 ms (BLE spec convention).
- `latency` is the slave-latency count - the peripheral may skip this many consecutive connection events without consequence.
- `timeout` is the supervision timeout in units of 10 ms.

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="latency"></a> `latency` | `readonly` | `number` |
| <a id="maxinterval"></a> `maxInterval` | `readonly` | `number` |
| <a id="mininterval"></a> `minInterval` | `readonly` | `number` |
| <a id="timeout"></a> `timeout` | `readonly` | `number` |
