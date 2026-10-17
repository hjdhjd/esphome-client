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

This is the pure baseline and carries no `lastPingRttMs` and zero stalls. A transition out of a session builds its down record through `downHealth`, which
overlays the diagnostics the previous record carries forward onto this baseline...this helper and that overlay are layers of one design, not a contradiction.
