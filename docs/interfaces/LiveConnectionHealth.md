[**esphome-client**](../README.md)

***

[Home](../README.md) / LiveConnectionHealth

# Interface: LiveConnectionHealth

Health of a record whose socket is up (connected or stalled). Carries `connectedAtMs` - the SSOT for "when this connection began" - from which live uptime is derived
via [connectionUptimeMs](../functions/connectionUptimeMs.md). Both `connected` and `stalled` are "socket up" states, so uptime stays live through a stall.

## Extends

- `ConnectionHealthBase`

## Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="connectedatms"></a> `connectedAtMs` | `number` | Timestamp of the most recent successful connect in epoch milliseconds. The single source of truth for connection uptime; derive it via [connectionUptimeMs](../functions/connectionUptimeMs.md). | - |
| <a id="consecutivestalls"></a> `consecutiveStalls` | `number` | Number of consecutive ping stalls. Resets to 0 on successful inbound activity. | `ConnectionHealthBase.consecutiveStalls` |
| <a id="encrypted"></a> `encrypted` | `boolean` | Whether the current session's transport is encrypted. False during reconnecting and disconnected states. | `ConnectionHealthBase.encrypted` |
| <a id="lastinboundactivityat"></a> `lastInboundActivityAt` | `number` | Timestamp of the most recent inbound message in epoch milliseconds. `0` before the first inbound message. | `ConnectionHealthBase.lastInboundActivityAt` |
| <a id="lastpingrttms"></a> `lastPingRttMs?` | `number` | Round-trip time of the most recent successful ping in milliseconds. Undefined until the first ping completes. | `ConnectionHealthBase.lastPingRttMs` |
| <a id="state"></a> `state` | `"connected"` \| `"stalled"` | Current health state - the "socket up" subset of [HealthState](../variables/HealthState.md). | - |
