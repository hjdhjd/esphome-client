[**esphome-client**](../README.md)

***

[Home](../README.md) / openEspHomeClient

# Function: openEspHomeClient()

```ts
function openEspHomeClient<Extras>(options): Promise<EspHomeClient<Extras>>;
```

Factory function. Creates a new [EspHomeClient](../classes/EspHomeClient.md), connects, and resolves the connected client. Permanent errors ([PermanentError](../classes/PermanentError.md) subclasses) reject
immediately; transient errors retry up to [EspHomeClientOpenOptions.maxConstructionRetries](../interfaces/EspHomeClientOpenOptions.md#maxconstructionretries) times with backoff. Every rejection disposes the client before
the error reaches the caller, so a failed construction leaves nothing to clean up. A caller-supplied [EspHomeClientOpenOptions.signal](../interfaces/EspHomeClientOpenOptions.md#signal) rejects with the
signal's own reason and settles promptly whichever phase the abort interrupts - before an attempt, during a connect, or during a backoff. The one exception is an
attempt that fails permanently as the abort lands: the permanent error is reported, because it names a misconfiguration the abort reason would hide. An attempt
that runs out the library's connect or handshake timeout rejects with the platform `TimeoutError`, which carries no step or host, so a consumer that wraps the open
in a try beside its own `AbortSignal.timeout` tells its own timeout apart by identity, `error === mySignal.reason`, never by `name === "TimeoutError"`.

Usage:

```ts
export async function openAndDisposeExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "office-controller.local",
    psk: process.env["ESPHOME_PSK"] ?? null
  });

  // The async-dispose path sends DISCONNECT_REQUEST and awaits the matching response; if the server doesn't respond within `gracefulDisconnectTimeoutMs` (default
  // 1000ms), the client falls through to immediate teardown.
}
```

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-extras"></a> `Extras` *extends* `Readonly`\<`Record`\<`string`, [`EntitySchema`](../interfaces/EntitySchema.md)\>\> | \{ \} |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EspHomeClientOpenOptions`](../interfaces/EspHomeClientOpenOptions.md)\<`Extras`\> | Client construction options plus open-time retry configuration. |

## Returns

`Promise`\<[`EspHomeClient`](../classes/EspHomeClient.md)\<`Extras`\>\>

A `Promise<EspHomeClient>` that resolves to a connected client.
