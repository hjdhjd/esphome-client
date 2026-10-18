[**esphome-client**](../README.md)

***

[Home](../README.md) / withReconnect

# Function: withReconnect()

```ts
function withReconnect(
   client, 
   body, 
   options?
): Promise<void>;
```

Run a body callback once per successful connect. The helper subscribes to [WithReconnectClient.lifecycle](../interfaces/WithReconnectClient.md#lifecycle), fires the body on the first observed `connect`
event (or immediately if the client is already connected when the helper starts), and re-fires on every subsequent `connect` after a `disconnect`. When the
connection drops, the teardown rejects the body's awaiting calls (a command wait, a snapshot, a sub-API request) with [ConnectionLostError](../classes/ConnectionLostError.md) first, and the
body's signal then aborts on the matching `disconnect`, which ends the body's stream iterators. The `lost` and `recovered` verdicts describe an outage whose
`disconnect` already ended the body's session, so they start or end no per-session work. A body tells a disconnect apart from another failure by
`instanceof ConnectionLostError`, or by its signal's `aborted` flag after awaiting, never by comparing the rejection with its signal's reason, which those calls do
not carry.

Typical use: work bound to a single connection, such as a one-shot request whose answer can change between sessions or a command sequence that must restart
from its first step after a reconnect. Sub-API subscriptions (the voice assistant, logs, Home Assistant, camera streams, and the Bluetooth, serial, and Z-Wave
proxies) need no helper: the host reissues them after every reconnect, before the `connect` event that fires the body. The EventBus and its subscriptions,
telemetry subscriptions included, survive reconnects and need no helper - the host preserves them automatically. The latest-state cache does not: every connect
clears it, and it is rebuilt one entity at a time from the new session's state events.

Usage:

```ts
export async function withReconnectExample(client: EspHomeClient): Promise<void> {

  // The host reissues the voice-assistant subscription after every reconnect, so it is taken once, outside the helper.
  client.voiceAssistant.subscribe();

  const deadline = AbortSignal.timeout(60000);

  try {

    await withReconnect(client, async (_, signal) => {

      // A device can come back from a reboot or a reflash with different wake words, so each connection asks it for a fresh configuration. A connection that drops
      // first rejects the request with the connection-lost error, which ends this connection's body; the next connect runs it again.
      const configuration = await client.voiceAssistant.configuration({ refresh: true, signal });

      log.info("The device reported its voice-assistant configuration for this connection.", configuration);
    }, { signal: deadline });

  } catch(error) {

    // The helper rejects with the outer signal's own reason when our deadline ends it, so we tell that planned end apart from a failure by identity.
    if(error !== deadline.reason) {

      throw error;
    }
  }
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

A promise that resolves when the lifecycle stream ends, and rejects with the outer signal's reason when that signal aborts.
