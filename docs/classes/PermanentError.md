[**esphome-client**](../README.md)

***

[Home](../README.md) / PermanentError

# Abstract Class: PermanentError

Marker class for errors that auto-reconnect should not retry.

## Remarks

The default reconnect supervisor filters with `!(error instanceof PermanentError)`. The subclasses the library throws cover encryption misconfigurations
and version-negotiation failures. Adding a new permanent failure mode is one new subclass and the filter picks it up automatically.

Abstract on purpose: the marker is meaningful only when applied to a concrete subclass.

Usage:

```ts
export async function permanentVsTransientExample(): Promise<EspHomeClient> {

  const maxAttempts = 10;
  let attempts = 0;
  let lastError: unknown;

  while(attempts < maxAttempts) {

    try {

      // The connect attempt is intentionally sequential inside the retry loop - parallelism would defeat the backoff that ramps after each failure.
      // eslint-disable-next-line no-await-in-loop
      const client = await openEspHomeClient({ host: "lab.local", psk: null });

      log.info("The device accepted the connection.", client.isEncrypted);

      return client;

    } catch(error) {

      if(error instanceof PermanentError) {

        // Permanent failure: bubble up, the situation will not improve by retrying.
        throw error;
      }

      lastError = error;
      attempts++;

      // The final attempt skips the backoff, because no attempt follows it to wait for.
      if(attempts < maxAttempts) {

        // The retry loop is intentionally sequential because each attempt must observe the result of the previous one before deciding whether to back off.
        // eslint-disable-next-line no-await-in-loop
        await delay(500 * (2 ** attempts));
      }
    }
  }

  // Every attempt failed transiently, so the last failure propagates and the caller sees its real cause.
  throw lastError;
}
```

## Extends

- [`EspHomeError`](EspHomeError.md)

## Extended by

- [`EncryptionKeyInvalidError`](EncryptionKeyInvalidError.md)
- [`EncryptionKeyMissingError`](EncryptionKeyMissingError.md)
- [`EncryptionRequiredError`](EncryptionRequiredError.md)
- [`NegotiationFailedError`](NegotiationFailedError.md)

## Constructors

### Constructor

```ts
new PermanentError(
   message, 
   code?, 
   options?
): PermanentError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`PermanentError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
