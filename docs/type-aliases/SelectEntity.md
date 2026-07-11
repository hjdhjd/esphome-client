[**esphome-client**](../README.md)

***

[Home](../README.md) / SelectEntity

# Type Alias: SelectEntity

```ts
type SelectEntity = EntityFor<typeof ENTITY_SCHEMAS["select"]>;
```

The `select` entity type: a single choice from a fixed set of options.

Usage:

```ts
export async function numberSelectTextCommandExample(client: EspHomeClient): Promise<void> {

  const setpoint = entityId("number", "boiler_setpoint");
  const mode = entityId("select", "thermostat_mode");
  const greeting = entityId("text", "wake_word_response");
  const wakeAt = entityId("datetime", "next_alarm");

  client.command(setpoint, { state: 21.5 });
  client.command(mode, { state: "Eco" });
  client.command(greeting, { state: "Welcome home" });
  client.command(wakeAt, { epochSeconds: Math.floor(Date.now() / 1000) + 3600 });

  await client.commandAndAwait(setpoint, { state: 22.0 });
}
```
