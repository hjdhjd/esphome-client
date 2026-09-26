[**esphome-client**](../README.md)

***

[Home](../README.md) / NonAwaitableEntityType

# Type Alias: NonAwaitableEntityType

```ts
type NonAwaitableEntityType = 
  | "binary_sensor"
  | "button"
  | "camera"
  | "sensor"
  | "text_sensor"
  | TransmitEntityType;
```

The entity types [EspHomeClient.commandAndAwait](../classes/EspHomeClient.md#commandandawait) excludes at the type level: the read-only, stateless, and non-key-bearing entity types whose state
schemas do not respond to commands - calling `commandAndAwait` against them would hang until timeout. The exclusion is kept in sync with the host method's own
type-level constraint.

## Remarks

`binary_sensor`, `sensor`, and `text_sensor` are read-only - they emit state but no command surface exists. `button` is stateless on the wire (the device
acknowledges with no telemetry). `camera` is excluded because its schema declares no `command` block, so a generic entity command can never be encoded for it;
its state event still carries the numeric `key` field (preserved by the schema's event-shape override) - it simply has no command surface to invoke. The
[TransmitEntityType](TransmitEntityType.md) members are excluded because they emit raw-timing receive events (no key-bearing state response) and use a transmit RPC rather than a
key-targeted command.
