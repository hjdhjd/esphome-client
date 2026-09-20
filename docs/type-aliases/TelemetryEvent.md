[**esphome-client**](../README.md)

***

[Home](../README.md) / TelemetryEvent

# Type Alias: TelemetryEvent

```ts
type TelemetryEvent = { [K in keyof typeof ENTITY_SCHEMAS]: StateEventFor<typeof ENTITY_SCHEMAS[K]> }[keyof typeof ENTITY_SCHEMAS];
```

Discriminated union of every telemetry-event variant in [ENTITY\_SCHEMAS](../variables/ENTITY_SCHEMAS.md). Same SSOT story as [Entity](Entity.md): derived directly from the schema registry, no
parallel union to maintain.

Usage:

```ts
export async function telemetryEventNarrowingExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetry({ signal: AbortSignal.timeout(60000) })) {

    switch(event.type) {

      case "light":

        log.debug("A light changed state.", event.brightness, event.effect);

        break;

      case "climate":

        log.debug("A thermostat changed state.", event.currentTemperature, event.mode);

        break;

      case "binary_sensor":

        log.debug("A binary sensor changed state.", event.state);

        break;

      case "camera":

        // Camera state events surface the reassembled multi-packet image: `image` is the concatenated payload, `name` is the friendly entity name. The wire-level
        // chunk fields (`data`, `done`) are stripped by the EventOverrides table since consumers receive only the assembled result.
        log.debug("A camera delivered an image.", event.image, event.name);

        break;
    }
  }
}
```
