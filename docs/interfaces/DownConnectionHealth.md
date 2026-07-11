[**esphome-client**](../README.md)

***

[Home](../README.md) / DownConnectionHealth

# Interface: DownConnectionHealth

Health of a record whose socket is down (disconnected or reconnecting). `connectedAtMs` is forbidden via `?: never` so a stale connect epoch can never leak onto a
down record through an object spread - a transition that tried to would fail to compile. `encrypted` is narrowed to `false`: a down record is never on an encrypted
wire.

## Extends

- `ConnectionHealthBase`

## Properties

| Property | Type | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="connectedatms"></a> `connectedAtMs?` | `undefined` | Forbidden on a down record. The connect epoch is a property of the live state only; `?: never` makes spreading a live record's epoch onto a down variant a compile error. | - | - |
| <a id="consecutivestalls"></a> `consecutiveStalls` | `number` | Number of consecutive ping stalls. Resets to 0 on successful inbound activity. | - | `ConnectionHealthBase.consecutiveStalls` |
| <a id="encrypted"></a> `encrypted` | `false` | Always `false` on a down record - a disconnected or reconnecting record is never on an encrypted wire. | `ConnectionHealthBase.encrypted` | - |
| <a id="lastinboundactivityat"></a> `lastInboundActivityAt` | `number` | Timestamp of the most recent inbound message in epoch milliseconds. `0` before the first inbound message. | - | `ConnectionHealthBase.lastInboundActivityAt` |
| <a id="lastpingrttms"></a> `lastPingRttMs?` | `number` | Round-trip time of the most recent successful ping in milliseconds. Undefined until the first ping completes. | - | `ConnectionHealthBase.lastPingRttMs` |
| <a id="state"></a> `state` | `"disconnected"` \| `"reconnecting"` | Current health state - the "socket down" subset of [HealthState](../variables/HealthState.md). | - | - |
