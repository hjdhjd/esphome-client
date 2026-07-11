[**esphome-client**](../README.md)

***

[Home](../README.md) / SwitchEntity

# Type Alias: SwitchEntity

```ts
type SwitchEntity = EntityFor<typeof ENTITY_SCHEMAS["switch"]>;
```

The `switch` entity type: a simple boolean on/off control.

Usage:

```ts
export async function switchCommandExample(client: EspHomeClient): Promise<SwitchEvent> {

  const frontDoor = entityId("switch", "front_door_relay");

  return client.commandAndAwait(frontDoor, { state: true });
}
```
