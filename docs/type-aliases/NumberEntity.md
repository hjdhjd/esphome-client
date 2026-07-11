[**esphome-client**](../README.md)

***

[Home](../README.md) / NumberEntity

# Type Alias: NumberEntity

```ts
type NumberEntity = EntityFor<typeof ENTITY_SCHEMAS["number"]>;
```

The `number` entity type: a bounded numeric value set within its min / max / step range.

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
