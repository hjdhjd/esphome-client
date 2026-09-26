[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandAndAwaitable

# Type Alias: CommandAndAwaitable

```ts
type CommandAndAwaitable = Exclude<EntityType, NonAwaitableEntityType>;
```

Entity types accepted by [EspHomeClient.commandAndAwait](../classes/EspHomeClient.md#commandandawait). The complement of [NonAwaitableEntityType](NonAwaitableEntityType.md) relative to the canonical [EntityType](EntityType.md) set.
