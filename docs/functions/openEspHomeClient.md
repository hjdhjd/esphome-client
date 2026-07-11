[**esphome-client**](../README.md)

***

[Home](../README.md) / openEspHomeClient

# Function: openEspHomeClient()

```ts
function openEspHomeClient<Extras>(options): Promise<EspHomeClient<Extras>>;
```

Factory function. Creates a new [EspHomeClient](../classes/EspHomeClient.md), connects, and resolves the connected client. Permanent errors ([PermanentError](../classes/PermanentError.md) subclasses) reject
immediately; transient errors retry up to [EspHomeClientOpenOptions.maxConstructionRetries](../interfaces/EspHomeClientOpenOptions.md#maxconstructionretries) times with backoff.

Usage:

```ts
export async function openAndDisposeExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "office-controller.local",
    psk: process.env["ESPHOME_PSK"] ?? null
  });

  // The async-dispose path sends DISCONNECT_REQUEST and awaits the matching response; if the server doesn't respond within `gracefulDisconnectTimeoutMs` (default
  // 1000ms), the client falls through to immediate teardown.
  void client;
}
```

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Extras` *extends* `Readonly`\<`Record`\<`string`, [`EntitySchema`](../interfaces/EntitySchema.md)\>\> | \{ \} |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EspHomeClientOpenOptions`](../interfaces/EspHomeClientOpenOptions.md)\<`Extras`\> | Client construction options plus open-time retry configuration. |

## Returns

`Promise`\<[`EspHomeClient`](../classes/EspHomeClient.md)\<`Extras`\>\>

A `Promise<EspHomeClient>` that resolves to a connected client.
