[**esphome-client**](../README.md)

***

[Home](../README.md) / LockState

# Type Alias: LockState

```ts
type LockState = typeof LockState[keyof typeof LockState];
```

Lock state values reported by ESPHome lock entities on telemetry. Mirrors `api.proto` `LockState`. Use this constant for narrowing on `LockEvent.state` instead of raw
numeric literals so call sites stay readable and survive future ESPHome wire-enum additions.
