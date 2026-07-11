[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyAwaitOptions

# Interface: SerialProxyAwaitOptions

Per-await options accepted by [SerialProxyApi.flush](../classes/SerialProxyApi.md#flush) and [SerialProxyApi.getModemPins](../classes/SerialProxyApi.md#getmodempins). The composed signal layers the caller's optional `AbortSignal`
over the timeout via `AbortSignal.any`, mirroring the [VoiceAssistantApi.announce](../classes/VoiceAssistantApi.md#announce) contract.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional user abort signal. When aborted, the await rejects with `signal.reason`. |
| <a id="timeoutms"></a> `timeoutMs?` | `number` | Optional timeout in milliseconds. Defaults to 5000ms. When elapsed, the await rejects with `DOMException(name: "AbortError")`. |
