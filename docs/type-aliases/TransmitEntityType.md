[**esphome-client**](../README.md)

***

[Home](../README.md) / TransmitEntityType

# Type Alias: TransmitEntityType

```ts
type TransmitEntityType = "infrared" | "radio_frequency";
```

The entity types whose command is a raw-timings transmit. Their consumer entry point is [EspHomeClient.transmitRawTimings](../classes/EspHomeClient.md#transmitrawtimings), which refuses an entity whose
capabilities lack the transmitter bit, so [EspHomeClient.command](../classes/EspHomeClient.md#command) excludes these types at the type level and a transmit cannot reach the wire without that
check. [NonAwaitableEntityType](NonAwaitableEntityType.md) includes them because a transmit has no state response to await.
