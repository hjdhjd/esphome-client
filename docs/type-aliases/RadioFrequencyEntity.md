[**esphome-client**](../README.md)

***

[Home](../README.md) / RadioFrequencyEntity

# Type Alias: RadioFrequencyEntity

```ts
type RadioFrequencyEntity = EntityFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
```

The `radio_frequency` entity type: transmits a raw 433.92 MHz OOK timing pattern to a connected RF module.

Usage:

```ts
export function radioFrequencyTransmitExample(client: EspHomeClient): void {

  const remote = entityId("radio_frequency", "rf_module");

  client.transmitRawTimings(remote, {

    carrierFrequency: 433920000,
    modulation: RadioFrequencyModulation.OOK,
    repeatCount: 3,
    timings: [ 350, -1050, 1050, -350, 350, -1050, 1050, -350 ]
  });
}
```
