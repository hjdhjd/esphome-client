[**esphome-client**](../README.md)

***

[Home](../README.md) / SirenEntity

# Type Alias: SirenEntity

```ts
type SirenEntity = EntityFor<typeof ENTITY_SCHEMAS["siren"]>;
```

The `siren` entity type: on/off with optional tone, duration, and volume.

Usage:

```ts
export async function sirenCommandExample(client: EspHomeClient): Promise<SirenEvent> {

  const siren = entityId("siren", "yard_siren");

  return client.commandAndAwait(siren, {

    duration: 5,
    state: true,
    tone: "alarm",
    volume: 1.0
  });
}
```
