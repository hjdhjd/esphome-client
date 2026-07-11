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

        void event.brightness;
        void event.effect;

        break;

      case "climate":

        void event.currentTemperature;
        void event.mode;

        break;

      case "binary_sensor":

        void event.state;

        break;

      case "camera":

        // Camera state events surface the reassembled multi-packet image: `image` is the concatenated payload, `name` is the friendly entity name. The wire-level
        // chunk fields (`data`, `done`) are stripped by the EventOverrides table since consumers receive only the assembled result.
        void event.image;
        void event.name;

        break;
    }
  }
}
```
