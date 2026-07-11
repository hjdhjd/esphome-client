[**esphome-client**](../README.md)

***

[Home](../README.md) / LightEntity

# Type Alias: LightEntity

```ts
type LightEntity = EntityFor<typeof ENTITY_SCHEMAS["light"]>;
```

The `light` entity type: on/off, brightness, color (RGB / white / color-temperature in mireds), and effects.

Usage:

```ts
export async function lightCommandExample(client: EspHomeClient): Promise<void> {

  const livingRoom = entityId("light", "living_room_lamp");

  // RGB plus brightness plus an effect, all in one command. The transitionLength field is in milliseconds.
  client.command(livingRoom, {

    brightness: 0.8,
    effect: "Slow Pulse",
    rgb: { b: 0.2, g: 0.5, r: 1.0 },
    state: true,
    transitionLength: 1000
  });

  // Color-temperature mode. The colorTemperature field is in mireds (1000000 / Kelvin).
  await client.commandAndAwait(livingRoom, { brightness: 0.5, colorTemperature: 250, state: true });
}
```
