[**esphome-client**](../README.md)

***

[Home](../README.md) / WithReconnectOptions

# Interface: WithReconnectOptions

Options accepted by [withReconnect](../functions/withReconnect.md).

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Cancellation signal. Aborting ends the lifecycle stream, aborts the running body's signal, and rejects the helper's promise with this signal's reason once the body has settled. |
