[**esphome-client**](../README.md)

***

[Home](../README.md) / ReconnectConfig

# Interface: ReconnectConfig

Auto-reconnect configuration. Every field has a sensible default; the empty object `{}` is the recommended way to opt in with defaults.

Usage:

```ts
export async function reconnectWithPermanentErrorExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "flaky.local",
    psk: process.env["ESPHOME_PSK"] ?? null,
    reconnect: {

      initialDelayMs: 500,
      maxDelayMs: 30000,
      onAttempt: (attempt, delayMs): void => {

        void attempt;
        void delayMs;
      },

      // Default predicate: skip permanent errors. Layer additional filtering by calling the default first, then your own check.
      shouldRetry: (error, attempts): boolean => !(error instanceof PermanentError) && (attempts < 50)
    }
  });

  void client;
}
```

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="backoffmultiplier"></a> `backoffMultiplier?` | `number` | Multiplier applied to each successive delay. Default 2 (doubling backoff). |
| <a id="initialdelayms"></a> `initialDelayMs?` | `number` | Initial backoff in milliseconds before the first retry. Default 500. |
| <a id="jitter"></a> `jitter?` | `number` | Random jitter factor in [0, 1] applied to each delay. Default 0.2 (+/-20%). Prevents thundering-herd reconnects across multiple clients. |
| <a id="maxattempts"></a> `maxAttempts?` | `number` | Maximum number of attempts. Default `undefined` (unlimited). |
| <a id="maxdelayms"></a> `maxDelayMs?` | `number` | Upper bound on a single delay in milliseconds. Default 30000. |
| <a id="onattempt"></a> `onAttempt?` | (`attempt`, `delayMs`) => `void` | Called before each attempt. Useful for logging and metrics integration. |
| <a id="shouldretry"></a> `shouldRetry?` | (`error`, `attempts`) => `boolean` | Predicate determining whether to retry. Default: `!(error instanceof PermanentError)` - skip permanent errors (encryption, auth, version mismatch). |
