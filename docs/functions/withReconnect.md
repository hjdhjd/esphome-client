[**esphome-client**](../README.md)

***

[Home](../README.md) / withReconnect

# Function: withReconnect()

```ts
function withReconnect(
   client, 
   body, 
options?): Promise<void>;
```

Run a body callback once per successful connect. The helper subscribes to [WithReconnectClient.lifecycle](../interfaces/WithReconnectClient.md#lifecycle), fires the body on the first observed `connect`
event (or immediately if the client is already connected when the helper starts), and re-fires on every subsequent `connect` after a `disconnect`. The body's
abort signal aborts the moment the matching `disconnect` arrives so re-entrant operations (`commandAndAwait`, `client.stream(...)` iterators) can wind down cleanly.

Typical use: re-issue protocol-level operations whose lifetime is bound to a single connect (e.g. `client.voiceAssistant.subscribe()`, `subscribeToLogs`,
`client.camera(id).stream()`). For state that survives reconnects (the EventBus, telemetry subscriptions, latest-state cache), no helper is needed - the host
preserves them automatically.

Usage:

```ts
export async function withReconnectExample(client: EspHomeClient): Promise<void> {

  await withReconnect(client, async (_, signal) => {

    client.voiceAssistant.subscribe();

    for await (const audio of client.voiceAssistant.audio({ signal })) {

      void audio;
    }
  }, { signal: AbortSignal.timeout(60000) });
}
```

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `client` | [`WithReconnectClient`](../interfaces/WithReconnectClient.md) | Any object exposing a `lifecycle()` async-iterable view and a `health()` snapshot returning a [ConnectionHealth](../type-aliases/ConnectionHealth.md) record (typically an [EspHomeClient](../classes/EspHomeClient.md) but can be any compatible test harness). |
| `body` | (`client`, `signal`) => `void` \| `Promise`\<`void`\> | Callback invoked on every successful connect. Receives the client and an `AbortSignal` that fires on the next disconnect; should respect it. |
| `options?` | [`WithReconnectOptions`](../interfaces/WithReconnectOptions.md) | Optional outer cancellation signal. |

## Returns

`Promise`\<`void`\>

A promise that resolves when the outer signal aborts or the lifecycle stream ends.
