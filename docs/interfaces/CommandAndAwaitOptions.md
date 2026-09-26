[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandAndAwaitOptions

# Interface: CommandAndAwaitOptions\<T\>

Per-call options for [EspHomeClient.commandAndAwait](../classes/EspHomeClient.md#commandandawait). All fields are optional; defaults: 2000ms timeout, no caller signal, predicate accepts any state event
for the entity.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* [`CommandAndAwaitable`](../type-aliases/CommandAndAwaitable.md) | Entity type tag carried by the branded id. |

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="predicate"></a> `predicate?` | (`state`) => `boolean` \| `Promise`\<`boolean`\> | Optional acceptance predicate. Called with each candidate state event whose `key` matches the resolved target; the runner returns the first event for which the predicate resolves to `true`. Sync `boolean` and async `Promise<boolean>` are both accepted; both are normalized through [Promise.try](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try) so a sync `throw` and an async `reject` collapse to the same rejection path. The default (no predicate supplied) accepts any state event for the resolved target key. |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional caller-supplied [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). Composed with the timeout signal via [AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static); either source aborts the await and tears the bus subscription down. A pre-aborted signal rejects immediately; a mid-stream abort tears down between iterations. |
| <a id="timeoutms"></a> `timeoutMs?` | `number` | Optional override for the await timeout, in milliseconds. Defaults to 2000ms. |
