[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyConfigureOptions

# Interface: SerialProxyConfigureOptions

Options accepted by [SerialProxyApi.configure](../classes/SerialProxyApi.md#configure). Mirrors the wire-side `SerialProxyConfigureRequest` (field numbers per `api.proto`): `baudrate` (2),
`flowControl` (3), `parity` (4), `stopBits` (5), `dataSize` (6).

Both `dataSize` and `stopBits` are validated client-side before the wire send. The wire accepts arbitrary integers but the device silently rejects out-of-range values;
surfacing the rejection at the call site is strictly better than a debug log nobody reads.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="baudrate"></a> `baudrate` | `readonly` | `number` | UART baud rate in bits-per-second. The device imposes its own upper bound; consult firmware docs for the specific platform. |
| <a id="datasize"></a> `dataSize` | `readonly` | `number` | Data-bits per character. Must be in the inclusive range 5-8; values outside this range throw [ConnectionError](../classes/ConnectionError.md) with code `INVALID_SERIAL_CONFIG`. |
| <a id="flowcontrol"></a> `flowControl?` | `readonly` | `boolean` | Whether to enable hardware flow control. Defaults to `false` (no flow control). |
| <a id="parity"></a> `parity?` | `readonly` | [`SerialProxyParity`](../type-aliases/SerialProxyParity.md) | Parity selection. Defaults to [SerialProxyParity.NONE](../variables/SerialProxyParity.md#property-none). |
| <a id="stopbits"></a> `stopBits?` | `readonly` | `number` | Stop bits. Must be 1 or 2; values outside this range throw [ConnectionError](../classes/ConnectionError.md) with code `INVALID_SERIAL_CONFIG`. Defaults to 1. |
