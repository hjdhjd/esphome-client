[**esphome-client**](../README.md)

***

[Home](../README.md) / FanEntity

# Type Alias: FanEntity

```ts
type FanEntity = EntityFor<typeof ENTITY_SCHEMAS["fan"]>;
```

The `fan` entity type: on/off, speed level, oscillation, direction, and preset mode.

Usage:

```ts
export async function fanCommandExample(client: EspHomeClient): Promise<FanEvent> {

  const ceilingFan = entityId("fan", "bedroom_ceiling");

  return client.commandAndAwait(ceilingFan, {

    direction: "forward",
    oscillating: true,
    presetMode: "summer",
    speedLevel: 3,
    state: true
  });
}
```
