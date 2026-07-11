[**esphome-client**](../README.md)

***

[Home](../README.md) / CoverEntity

# Type Alias: CoverEntity

```ts
type CoverEntity = EntityFor<typeof ENTITY_SCHEMAS["cover"]>;
```

The `cover` entity type: position, tilt, and open / close / stop operation with a current-operation state.

Usage:

```ts
export async function coverCommandExample(client: EspHomeClient): Promise<CoverEvent> {

  const garage = entityId("cover", "garage_door");

  // Subscribe to operation transitions with an exhaustive switch. The narrowed event.currentOperation accepts only CoverOperation members; adding a new rail upstream
  // and forgetting to update this switch becomes a tsc error at the `_exhaustive: never` assignment.
  using subscription = client.on("cover", (event) => {

    if(event.currentOperation === undefined) {

      return;
    }

    switch(event.currentOperation) {

      case CoverOperation.IDLE: {

        // Motion finished. Update the UI to the resting state.
        break;
      }

      case CoverOperation.IS_OPENING: {

        // Cover is opening. Show the opening indicator.
        break;
      }

      case CoverOperation.IS_CLOSING: {

        // Cover is closing. Show the closing indicator.
        break;
      }

      default: {

        const _exhaustive: never = event.currentOperation;

        void _exhaustive;
      }
    }
  });

  void subscription;

  // Drive to half-open, then await the IDLE state event that signals motion completion. We compare against the named CoverOperation.IDLE constant rather than the raw
  // wire number so the predicate stays readable and survives future ESPHome wire-enum additions.
  client.command(garage, { position: 0.5 });

  return await client.commandAndAwait(garage, { position: 0.5 }, {

    predicate: (event): boolean => event.currentOperation === CoverOperation.IDLE,
    timeoutMs: 30000
  });
}
```
