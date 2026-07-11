[**esphome-client**](../README.md)

***

[Home](../README.md) / StreamBackpressureMode

# Type Alias: StreamBackpressureMode

```ts
type StreamBackpressureMode = "dropNewest" | "dropOldest" | "throw";
```

Backpressure policy for stream consumers that fall behind.

- `dropOldest` (default) - when the queue reaches `highWaterMark`, drop items from the head before pushing the new one. Optimized for "I want a recent sample, not
  every sample ever" - the dominant telemetry consumer pattern.
- `dropNewest` - drop the incoming item without enqueuing. Optimized for "the first N samples are the relevant ones" - rarer, but useful for one-shot capture loops.
- `throw` - throw [BackpressureError](../classes/BackpressureError.md) into the iterator on its next iteration past the high-water mark. Optimized for "fail loudly when I fall behind."
