[**esphome-client**](../README.md)

***

[Home](../README.md) / HealthState

# Type Alias: HealthState

```ts
type HealthState = typeof HealthState[keyof typeof HealthState];
```

Connection-health states. Modeled as an `as const` object so the type narrows to a literal union without an enum.
