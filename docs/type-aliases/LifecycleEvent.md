[**esphome-client**](../README.md)

***

[Home](../README.md) / LifecycleEvent

# Type Alias: LifecycleEvent

```ts
type LifecycleEvent = 
  | {
  encrypted: boolean;
  kind: "connect";
}
  | {
  cause?: EspHomeError;
  kind: "disconnect";
};
```

Discriminated lifecycle event. Stalls and reconnect cycles surface on the [ConnectionHealth](ConnectionHealth.md) stream rather than here, by design - lifecycle is the
boundary signal (we connected; we disconnected); health is the live observability surface.
