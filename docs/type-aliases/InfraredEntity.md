[**esphome-client**](../README.md)

***

[Home](../README.md) / InfraredEntity

# Type Alias: InfraredEntity

```ts
type InfraredEntity = EntityFor<typeof ENTITY_SCHEMAS["infrared"]>;
```

The `infrared` entity type: transmits a raw mark/space timing pattern to a connected IR blaster.

Usage:

```ts
export function infraredTransmitExample(client: EspHomeClient): void {

  const tvPower = entityId("infrared", "ir_blaster");

  client.transmitRawTimings(tvPower, {

    carrierFrequency: 38000,
    repeatCount: 1,
    timings: [ 9000, -4500, 560, -560, 560, -1690, 560, -560, 560, -1690 ]
  });
}
```
