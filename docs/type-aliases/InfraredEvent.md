[**esphome-client**](../README.md)

***

[Home](../README.md) / InfraredEvent

# Type Alias: InfraredEvent

```ts
type InfraredEvent = StateEventFor<typeof ENTITY_SCHEMAS["infrared"]>;
```

The telemetry event for an `infrared` entity: a decoded inbound remote-control code received from the device.

Usage:

```ts
export async function infraredReceiveExample(client: EspHomeClient): Promise<void> {

  const blaster = entityId("infrared", "ir_blaster");
  const targetKey = client.getEntityKey(blaster);

  for await (const event of client.telemetryFor("infrared")) {

    if(event.key !== targetKey) {

      continue;
    }

    // event.timings is the schema-typed `number[]` decoded from the packed sint32 wire payload.
    const samples = event.timings?.length ?? 0;

    void samples;

    break;
  }
}
```
