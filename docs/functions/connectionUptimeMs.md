[**esphome-client**](../README.md)

***

[Home](../README.md) / connectionUptimeMs

# Function: connectionUptimeMs()

```ts
function connectionUptimeMs(health, now?): number;
```

Derive live connection uptime in milliseconds from a [ConnectionHealth](../type-aliases/ConnectionHealth.md) record. Returns `now - connectedAtMs` while the socket is up (connected or stalled) and
`0` while it is down - so uptime stays live through a stall and is structurally `0` when there is no connection. This is the single derivation of uptime from the
`connectedAtMs` SSOT; callers pass `now` only in tests.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `health` | [`ConnectionHealth`](../type-aliases/ConnectionHealth.md) | The health record to derive uptime from. |
| `now` | `number` | The reference "now" in epoch milliseconds; defaults to `Date.now()`. |

## Returns

`number`

Milliseconds the current connection has been up, or `0` when not connected.
