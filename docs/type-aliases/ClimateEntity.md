[**esphome-client**](../README.md)

***

[Home](../README.md) / ClimateEntity

# Type Alias: ClimateEntity

```ts
type ClimateEntity = EntityFor<typeof ENTITY_SCHEMAS["climate"]>;
```

The `climate` entity type: HVAC mode, target setpoint(s), fan mode, preset, and swing.

Usage:

```ts
export async function climateCommandExample(client: EspHomeClient): Promise<ClimateEvent> {

  const thermostat = entityId("climate", "main_floor");

  return client.commandAndAwait(thermostat, {

    fanMode: "auto",
    mode: ClimateMode.HEAT_COOL,
    preset: "home",
    swingMode: "off",
    targetTemperatureHigh: 24,
    targetTemperatureLow: 20
  });
}
```
