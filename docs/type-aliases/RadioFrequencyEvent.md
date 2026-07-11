[**esphome-client**](../README.md)

***

[Home](../README.md) / RadioFrequencyEvent

# Type Alias: RadioFrequencyEvent

```ts
type RadioFrequencyEvent = StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
```

The telemetry event for a `radio_frequency` entity: a decoded inbound RF transmission received from the device.

Usage:

```ts
export async function radioFrequencyReceiveExample(client: EspHomeClient): Promise<void> {

  const remote = entityId("radio_frequency", "rf_module");
  const targetKey = client.getEntityKey(remote);

  for await (const event of client.telemetryFor("radio_frequency")) {

    if(event.key !== targetKey) {

      continue;
    }

    const samples = event.timings?.length ?? 0;

    void samples;

    break;
  }
}
```
