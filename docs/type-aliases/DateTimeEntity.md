[**esphome-client**](../README.md)

***

[Home](../README.md) / DateTimeEntity

# Type Alias: DateTimeEntity

```ts
type DateTimeEntity = EntityFor<typeof ENTITY_SCHEMAS["datetime"]>;
```

The `datetime` entity type: a combined date-and-time value.

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
