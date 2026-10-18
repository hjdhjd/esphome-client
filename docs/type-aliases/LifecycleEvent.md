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
}
  | {
  cause: EspHomeError;
  kind: "lost";
}
  | {
  kind: "recovered";
};
```

Tagged lifecycle event. Lifecycle carries the discrete transitions: the session boundary (`connect`, `disconnect`) and the reachability verdict (`lost`,
`recovered`). `lost` is raised once per outage when the first attempt to re-establish a session after a fault fails, a reconnect loop attempt or a manual
connect alike, and carries that attempt's typed error. `recovered` is raised after the `connect` of a session re-established while a `lost` stands. A fault
healed on the first attempt raises neither. No verdict follows a fault when no attempt runs: with `reconnect: false`, for a session never reported live, or
when the retry predicate refuses the fault's own cause. Stalls and the per-attempt reconnect cycle surface on the [ConnectionHealth](ConnectionHealth.md) stream.
