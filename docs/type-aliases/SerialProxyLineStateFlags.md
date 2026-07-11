[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyLineStateFlags

# Type Alias: SerialProxyLineStateFlags

```ts
type SerialProxyLineStateFlags = typeof SerialProxyLineStateFlags[keyof typeof SerialProxyLineStateFlags];
```

Modem-control line bitmask flags used by `SerialProxySetModemPinsRequest` and `SerialProxyGetModemPinsResponse`. RTS is bit 0, DTR is bit 1 - the standard UART
modem-control set. Mirrors ESPHome's `SerialProxyLineStateFlags` enum (upstream header location not yet pinned down; the bit positions follow the standard UART
convention used by every comparable driver). Consumers compose flags via bitwise OR (e.g., `SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR`) and read
the response value as a bitmask.
