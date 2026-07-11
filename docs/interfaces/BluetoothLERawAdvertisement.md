[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothLERawAdvertisement

# Interface: BluetoothLERawAdvertisement

One inbound BLE advertisement record. Fanned out from a batched `BluetoothLERawAdvertisementsResponse` so consumers see ads at single-ad granularity. The wire shape
is the nested `BluetoothLERawAdvertisement` message defined in `api.proto` §`BluetoothLERawAdvertisementsResponse`.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="address"></a> `address` | `readonly` | `bigint` | Device BLE address as a `bigint`. The wire field is `uint64`, which exceeds the JavaScript safe-integer range; modelling the value as `bigint` preserves the wire shape exactly and forward-compatibly. BLE addresses themselves are 48 bits so they fit in a JavaScript number today, but addresses are routinely indexed by tools that compose them with other 64-bit ids - keeping the public surface as `bigint` removes a precision pitfall before it surfaces. Display convention: format as the conventional 12-hex `aa:bb:cc:dd:ee:ff` colon-separated string when rendering for humans; keep the raw `bigint` as the lookup key. |
| <a id="addresstype"></a> `addressType` | `readonly` | `number` | Address-type discriminant (0-4) per Bluetooth Core 4.0+: 0 = public, 1 = random, 2 = public identity, 3 = random static identity, 4 = anonymous advertiser. The client passes the value through unchanged; consumers narrow against the Core-spec values as needed. |
| <a id="data"></a> `data` | `readonly` | `Buffer` | Raw advertisement payload bytes. The wire field is `bytes` with a documented `fixed_array_size` of 62 - the BLE 4.x advertisement-data upper bound. Consumers parse the buffer against the AD-structure format documented in BLE Core (length-prefixed type-tagged sub-records). |
| <a id="rssi"></a> `rssi` | `readonly` | `number` | Received-signal strength indicator, in dBm. The wire field is `sint32` (zigzag-encoded), so the decoded value is the canonical signed dBm reading - negative, typically in the -30 (very close) to -100 (range edge) span. Decoder applies `zigzagDecode` after the varint pass. |
