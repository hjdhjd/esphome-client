[**esphome-client**](../README.md)

***

[Home](../README.md) / LockEntity

# Type Alias: LockEntity

```ts
type LockEntity = EntityFor<typeof ENTITY_SCHEMAS["lock"]>;
```

The `lock` entity type: lock / unlock / open with an optional code and a current lock state.

Usage:

```ts
export async function lockCommandExample(client: EspHomeClient): Promise<LockEvent> {

  const frontDoor = entityId("lock", "front_door_deadbolt");

  // Subscribe to lock telemetry. Narrowing on LockState.* keeps the handler readable and survives future ESPHome wire-enum additions; the alternative is comparing
  // against magic numbers (1 / 2 / 3) and re-deriving their meaning at every call site. The schema's state-side enumMappings narrows event.state from plain `number` to
  // the LockState literal-union, so the exhaustive switch below is verified at compile time - forgetting a rail makes the `_exhaustive: never` assignment in default
  // fail to type-check.
  using subscription = client.on("lock", (event) => {

    if(event.state === undefined) {

      return;
    }

    switch(event.state) {

      case LockState.NONE: {

        // No state reported yet. Treat as 'unknown' and wait for the next update.
        break;
      }

      case LockState.LOCKED: {

        // The lock is secured. Update the UI badge accordingly.
        break;
      }

      case LockState.UNLOCKED: {

        // The lock is unlocked (latch retracted) but the door may still be physically closed. Clear the secured badge.
        break;
      }

      case LockState.OPEN: {

        // The door is physically open. Distinct from UNLOCKED, which only means the latch is retracted. Emitted only by firmware that advertises API minor 14 or
        // higher with the lock-open extension; pre-extension firmware never emits this value. Gate via `client.capabilities().lockOpenStates` if UI logic needs to
        // short-circuit pre-extension devices.
        break;
      }

      case LockState.JAMMED: {

        // Hardware fault. Surface an alert so the user can intervene physically.
        break;
      }

      case LockState.LOCKING:
      case LockState.UNLOCKING:
      case LockState.OPENING: {

        // Transitional state. Show a spinner; the next event will be a terminal LOCKED / UNLOCKED / OPEN / JAMMED. `OPENING` is emitted alongside `OPEN` by
        // firmware that advertises API minor 14 or higher with the lock-open extension; firmware without it uses `UNLOCKING` for the same transition.
        break;
      }

      default: {

        // Compile-time exhaustiveness sentinel. Adding a new LockState rail upstream and forgetting to update this switch becomes a tsc error here, not a silent fall-
        // through. If a future ESPHome wire-enum extension surfaces a value not in the current LockState union, the runtime falls into this branch and we can route it
        // through whatever fallback the consumer prefers (typically logging the unknown numeric value for diagnosis).
        const _exhaustive: never = event.state;

        void _exhaustive;
      }
    }
  });

  // Discard the Disposable explicitly so the type-checker stops complaining about an unused binding. The `using` keyword above does the real disposal at scope exit.
  void subscription;

  // Unlock with a code, then await the next state event the device emits. We `await` here so the `using` subscription above stays installed across the round-trip; the
  // ESLint rule that enforces `return await` in a using-scope confirms this is the canonical shape.
  return await client.commandAndAwait(frontDoor, { code: process.env["DOOR_CODE"] ?? "", command: LockCommand.UNLOCK });
}
```
