[**esphome-client**](../README.md)

***

[Home](../README.md) / ConstructionRetryConfig

# Interface: ConstructionRetryConfig

Backoff configuration for the [openEspHomeClient](../functions/openEspHomeClient.md) factory's bounded construction-retry loop.

## Remarks

Construction retry is separate from runtime auto-reconnect by design: construction retry is bounded (default 3 retries after the initial attempt) so
misconfigurations surface quickly; runtime reconnect is unbounded so transient drops recover invisibly once the consumer has a working client.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="backoffmultiplier"></a> `backoffMultiplier?` | `number` | Multiplier applied to each successive delay. Default 2 (doubling backoff). |
| <a id="initialdelayms"></a> `initialDelayMs?` | `number` | Initial backoff in milliseconds before the first retry. Default 500. |
| <a id="jitter"></a> `jitter?` | `number` | Random jitter factor in [0, 1] applied to each delay. Default 0.2 (+/-20%). Prevents thundering-herd reconnects across multiple clients. |
| <a id="maxdelayms"></a> `maxDelayMs?` | `number` | Upper bound on a single delay in milliseconds. Default 5000. |
