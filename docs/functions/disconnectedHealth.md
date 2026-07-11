[**esphome-client**](../README.md)

***

[Home](../README.md) / disconnectedHealth

# Function: disconnectedHealth()

```ts
function disconnectedHealth(): DownConnectionHealth;
```

Returns the "disconnected" health record. Used as the initial value before the first successful connect, and after every clean teardown.

## Returns

[`DownConnectionHealth`](../interfaces/DownConnectionHealth.md)

A [DownConnectionHealth](../interfaces/DownConnectionHealth.md) snapshot in the disconnected baseline (state `disconnected`, `encrypted: false`, no connect epoch, zero stalls, no inbound
activity, no last ping RTT).

## Remarks

This is the pure baseline and carries no `lastPingRttMs`. On a live disconnect the host deliberately overlays the most recent `lastPingRttMs` onto this
baseline as a "last seen latency" diagnostic (the `disconnect` path in `esphome-client.ts`). The `disconnected` state
and the absent connect epoch (so [connectionUptimeMs](connectionUptimeMs.md) reads `0`) are themselves the staleness signal that the RTT was measured against the prior connection, so
the carry-forward is intentional... this helper and the host's overlay are two layers of one design, not a contradiction.
