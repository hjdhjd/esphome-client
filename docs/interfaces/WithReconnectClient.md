[**esphome-client**](../README.md)

***

[Home](../README.md) / WithReconnectClient

# Interface: WithReconnectClient

Narrow seam [withReconnect](../functions/withReconnect.md) drives. The host implements both `lifecycle()` (typed-iterable view of every connect/disconnect transition) and `health()` (the
live snapshot - the helper reads it once at start to know whether a connect has already happened, in which case the body runs immediately rather than waiting for
the next connect transition).

## Methods

### health()

```ts
health(): ConnectionHealth;
```

#### Returns

[`ConnectionHealth`](../type-aliases/ConnectionHealth.md)

***

### lifecycle()

```ts
lifecycle(options?): AsyncIterable<LifecycleEvent>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); \} |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) |

#### Returns

`AsyncIterable`\<[`LifecycleEvent`](../type-aliases/LifecycleEvent.md)\>
