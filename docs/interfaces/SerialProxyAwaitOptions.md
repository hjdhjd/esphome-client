[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyAwaitOptions

# Interface: SerialProxyAwaitOptions

Per-await options accepted by [SerialProxyApi.flush](SerialProxyApi.md#flush) and [SerialProxyApi.getModemPins](SerialProxyApi.md#getmodempins). The wait follows the caller's optional `AbortSignal`, the
timeout, and the connection the request was issued on, and rejects with the reason of whichever ends it first.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional user abort signal. When aborted, the await rejects with `signal.reason`. |
| <a id="timeoutms"></a> `timeoutMs?` | `number` | Optional timeout in milliseconds. Defaults to 5000ms. When elapsed, the await rejects with the timeout signal's own `DOMException(name: "TimeoutError")`. |
