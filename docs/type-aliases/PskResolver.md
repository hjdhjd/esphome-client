[**esphome-client**](../README.md)

***

[Home](../README.md) / PskResolver

# Type Alias: PskResolver

```ts
type PskResolver = (hello) => Nullable<string>;
```

Selects the Noise encryption key for a device from what its server hello announces. Pass one as the `psk` client option when the key depends on which device
answers, for example a consumer that stores keys under each device's MAC address and connects to an address before it knows which device is there.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `hello` | [`NoiseServerHello`](../interfaces/NoiseServerHello.md) |

## Returns

[`Nullable`](Nullable.md)\<`string`\>

## Remarks

The client calls the resolver synchronously on every connection attempt, reconnects included, after it reads the server hello and after the expected
server-name check, and before any key material is used. Return the base64-encoded key, or `null` when there is none. A `null` or empty return fails the connection
with [EncryptionKeyMissingError](../classes/EncryptionKeyMissingError.md), and a key that does not decode to 32 bytes fails it with [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md). An exception the resolver
throws fails the connection attempt: `connect()` rejects with it as thrown when it is an [EspHomeError](../classes/EspHomeError.md), and otherwise with a [ConnectionError](../classes/ConnectionError.md)
(`CONNECT_FAILED`) that carries it as `cause`. A device that does not speak encryption falls back to plaintext without the resolver being called.

Usage:

```ts
export async function pskResolverExample(keysByMac: ReadonlyMap<string, string>): Promise<void> {

  // Firmware before ESPHome 2025.4.0 announces no MAC address. Returning null then fails the connection with EncryptionKeyMissingError.
  const psk: PskResolver = (hello): Nullable<string> => (hello.macAddress === undefined) ? null : (keysByMac.get(hello.macAddress) ?? null);

  await using client = await openEspHomeClient({ host: "192.168.1.50", psk });

  // The announced MAC address is unauthenticated, so admit the device under the one the encrypted connection itself delivers.
  log.info("The device connected with its own key.", client.deviceInfo()?.macAddress);
}
```
