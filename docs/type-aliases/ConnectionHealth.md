[**esphome-client**](../README.md)

***

[Home](../README.md) / ConnectionHealth

# Type Alias: ConnectionHealth

```ts
type ConnectionHealth = 
  | DownConnectionHealth
  | LiveConnectionHealth;
```

Live connection-health snapshot. A discriminated union over [HealthState](../variables/HealthState.md): [LiveConnectionHealth](../interfaces/LiveConnectionHealth.md) carries the connect epoch (`connectedAtMs`) while the
socket is up; [DownConnectionHealth](../interfaces/DownConnectionHealth.md) forbids it while the socket is down. Uptime is never stored; it is derived from `connectedAtMs` via
[connectionUptimeMs](../functions/connectionUptimeMs.md).
