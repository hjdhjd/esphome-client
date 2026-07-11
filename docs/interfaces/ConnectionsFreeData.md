[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionsFreeData

# Interface: ConnectionsFreeData

Snapshot of the device's connection-slot capacity, pushed via `BluetoothConnectionsFreeResponse` (id 81). The device pushes this on subscribe and on every change so
consumers can adapt to slot pressure dynamically (e.g., back off a probe loop when `free === 0`).

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="allocated"></a> `allocated` | `readonly` | readonly `bigint`[] | Addresses currently using a slot. Uint64 on the wire; bigint here. |
| <a id="free"></a> `free` | `readonly` | `number` | Number of unused slots available for new connections. |
| <a id="limit"></a> `limit` | `readonly` | `number` | Total slot count. `free + allocated.length === limit` in well-formed pushes. |
