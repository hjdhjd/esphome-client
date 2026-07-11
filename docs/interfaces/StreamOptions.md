[**esphome-client**](../README.md)

***

[Home](../README.md) / StreamOptions

# Interface: StreamOptions

Per-stream configuration for the async-iterable stream rails.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="backpressure"></a> `backpressure?` | [`StreamBackpressureMode`](../type-aliases/StreamBackpressureMode.md) | Backpressure policy. Default `"dropOldest"`. |
| <a id="highwatermark"></a> `highWaterMark?` | `number` | Maximum number of buffered items before the backpressure policy engages. Default `256`. |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional cancellation signal. Aborting causes the iterator to throw the abort reason on its next iteration and triggers cleanup of the underlying listener. |
