[**esphome-client**](../README.md)

***

[Home](../README.md) / PermanentError

# Abstract Class: PermanentError

Marker class for errors that auto-reconnect should not retry.

## Remarks

The default reconnect supervisor filters with `!(error instanceof PermanentError)`. Subclasses include encryption misconfigurations, authentication
failures, and major-version mismatches. Adding a new permanent failure mode is one new subclass and the filter picks it up automatically.

Abstract on purpose: the marker is meaningful only when applied to a concrete subclass.

Usage:

```ts
export async function permanentVsTransientExample(): Promise<void> {

  let attempts = 0;

  while(attempts < 10) {

    try {

      // The connect attempt is intentionally sequential inside the retry loop - parallelism would defeat the backoff that ramps after each failure.
      // eslint-disable-next-line no-await-in-loop
      const client = await openEspHomeClient({ host: "lab.local", psk: null });

      void client;

      return;

    } catch(error) {

      if(error instanceof PermanentError) {

        // Permanent failure: bubble up, the situation will not improve by retrying.
        throw error;
      }

      attempts++;

      // The retry loop is intentionally sequential because each attempt must observe the result of the previous one before deciding whether to back off.
      // eslint-disable-next-line no-await-in-loop
      await delay(500 * (2 ** attempts));
    }
  }
}
```

## Extends

- [`EspHomeError`](EspHomeError.md)

## Extended by

- [`AuthenticationError`](AuthenticationError.md)
- [`IncompatibleApiVersionError`](IncompatibleApiVersionError.md)
- [`EncryptionKeyMissingError`](EncryptionKeyMissingError.md)
- [`EncryptionKeyInvalidError`](EncryptionKeyInvalidError.md)
- [`EncryptionRequiredError`](EncryptionRequiredError.md)
- [`NegotiationFailedError`](NegotiationFailedError.md)

## Constructors

### Constructor

```ts
new PermanentError(
   message, 
   code?, 
   options?): PermanentError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`PermanentError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
