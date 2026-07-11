[**esphome-client**](../README.md)

***

[Home](../README.md) / isConnectionLive

# Function: isConnectionLive()

```ts
function isConnectionLive(health): health is LiveConnectionHealth;
```

Type guard narrowing a [ConnectionHealth](../type-aliases/ConnectionHealth.md) to the live variant (socket up: connected or stalled), which carries [LiveConnectionHealth.connectedAtMs](../interfaces/LiveConnectionHealth.md#connectedatms).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `health` | [`ConnectionHealth`](../type-aliases/ConnectionHealth.md) |

## Returns

`health is LiveConnectionHealth`
