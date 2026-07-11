[**esphome-client**](../README.md)

***

[Home](../README.md) / LockState

# Variable: LockState

```ts
const LockState: {
  JAMMED: 3;
  LOCKED: 1;
  LOCKING: 4;
  NONE: 0;
  OPEN: 7;
  OPENING: 6;
  UNLOCKED: 2;
  UNLOCKING: 5;
};
```

Lock state values reported by ESPHome lock entities on telemetry. Mirrors `api.proto` `LockState`. Use this constant for narrowing on `LockEvent.state` instead of raw
numeric literals so call sites stay readable and survive future ESPHome wire-enum additions.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-jammed"></a> `JAMMED` | `3` | `3` |
| <a id="property-locked"></a> `LOCKED` | `1` | `1` |
| <a id="property-locking"></a> `LOCKING` | `4` | `4` |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-open"></a> `OPEN` | `7` | `7` |
| <a id="property-opening"></a> `OPENING` | `6` | `6` |
| <a id="property-unlocked"></a> `UNLOCKED` | `2` | `2` |
| <a id="property-unlocking"></a> `UNLOCKING` | `5` | `5` |
