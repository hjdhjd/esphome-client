[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantApi

# Class: VoiceAssistantApi

Voice-assistant sub-API. Single instance per client; created lazily on first access.

## Implements

- `SubscriptionLifecycle`

## Methods

### announce()

```ts
announce(options, awaitOptions?): Promise<boolean>;
```

Trigger a TTS announcement on the device. Resolves with the success flag from the matching `voiceAssistantAnnounceFinished` event, or rejects on
timeout/abort.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`VoiceAssistantAnnounceOptions`](../interfaces/VoiceAssistantAnnounceOptions.md) | The announce request fields. |
| `awaitOptions?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and custom timeout (default 5000ms). |
| `awaitOptions.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `awaitOptions.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`boolean`\>

A promise that resolves with the success flag from the device's response.

#### Remarks

Pre-subscribes to the matching response event before issuing the wire request so a fast device cannot beat the listener. The default timeout is 5000ms;
supply `awaitOptions.timeoutMs` to override. The composed signal layers the caller's optional `AbortSignal` over the timeout via [AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).

Usage:

```ts
export async function voiceAssistantAnnounceExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  const success = await va.announce({

    conversationId: "doorbell-2026-05-08",
    preannounceMediaId: "https://media.example.com/chime.mp3",
    startConversation: false,
    text: "Someone is at the front door"
  }, { signal: AbortSignal.timeout(8000) });

  void success;
}
```

#### Throws

DOMException named `AbortError` (code `ABORT_ERR`) on timeout or caller-signal abort. The originating reason is carried as the error's `cause`: a
`TimeoutError` when the [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) elapses, or the caller signal's abort reason.

***

### audio()

```ts
audio(options?): AsyncIterable<VoiceAssistantAudioData>;
```

Async-iterable view of inbound `voiceAssistantAudio` events. Each entry is one audio chunk; the `end` flag marks the last chunk in a stream.

Usage:

```ts
export async function voiceAssistantExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  for await (const audio of va.audio({ signal: AbortSignal.timeout(30000) })) {

    void audio.data;
    void audio.end;
  }

  await va.announce({ text: "Doorbell rang" }, { timeoutMs: 5000 });
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`VoiceAssistantAudioData`](../interfaces/VoiceAssistantAudioData.md)\>

An `AsyncIterable<VoiceAssistantAudioData>`.

***

### audioReadable()

```ts
audioReadable(options?): ReadableStream<VoiceAssistantAudioData>;
```

Web Streams adapter for [audio](#audio).

Usage:

```ts
export function webStreamsInteropExample(client: EspHomeClient): void {

  // Telemetry as a ReadableStream consumable by any Web Streams pipeline (compression, batching, fan-out via tee()).
  const stream: ReadableStream = client.telemetryReadable({ backpressure: "dropOldest", highWaterMark: 256 });

  void stream;

  // Lifecycle, logs, voice-assistant audio, and per-camera images all expose matching readable adapters.
  void client.lifecycleReadable();
  void client.logsReadable(LogLevel.INFO);
  void client.voiceAssistant.audioReadable();
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`ReadableStream`\<[`VoiceAssistantAudioData`](../interfaces/VoiceAssistantAudioData.md)\>

A `ReadableStream<VoiceAssistantAudioData>`.

***

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state. Called by the host at the disconnect boundary and again at connect-top via the `SubscriptionLifecycle` contract. Clears
the cached configuration the device re-pushes on a fresh connection. It deliberately does NOT touch `desired`: the consumer subscription intent (including
its flags) is PRESERVED across the reconnect cycle so [reissueOnReconnect](#reissueonreconnect) re-arms the device with the originally-requested flags. Clearing the intent here
would be the precise reconnect-drops-the-subscription bug this split exists to prevent.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

### configuration()

```ts
configuration(options?): Promise<VoiceAssistantConfiguration>;
```

Read the device's voice-assistant configuration. Returns the cached value when `options.refresh` is false (the default) and a configuration has been received;
otherwise issues a fresh `VoiceAssistantConfigurationRequest` and resolves on the matching response.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | \{ `refresh?`: `boolean`; `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal, custom timeout (default 5000ms), and `refresh` flag (default `false`). |
| `options.refresh?` | `boolean` | - |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<[`VoiceAssistantConfiguration`](../interfaces/VoiceAssistantConfiguration.md)\>

A promise that resolves with the configuration record.

#### Remarks

The cache is populated by the inbound `voiceAssistantConfiguration` event listener installed in the constructor, so any prior request (or an unsolicited
configuration push from the device) seeds the cache. Pass `refresh: true` to force a fresh request even when a cached value exists. The default timeout is 5000ms;
the composed signal layers the caller's optional `AbortSignal` over the timeout via [AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).

Usage:

```ts
export async function voiceAssistantConfigurationExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;
  const config = await va.configuration({ signal: AbortSignal.timeout(5000) });

  for(const wakeWord of config.availableWakeWords) {

    void wakeWord.id;
    void wakeWord.wakeWord;
    void wakeWord.trainedLanguages;
  }

  // Activate at most `maxActiveWakeWords` ids. An empty array clears all active wake words.
  va.setActiveWakeWords(config.availableWakeWords.slice(0, config.maxActiveWakeWords).map((w) => w.id));
}
```

#### Throws

DOMException with name `AbortError` (timeout or caller signal) when no cached value is available and the await aborts.

***

### isSubscribed()

```ts
isSubscribed(): boolean;
```

Whether a device-side subscription is currently desired. Backed by the preserved `desired` intent, so it stays `true` across [clearConnectionState](#clearconnectionstate)
(a reconnect does not drop the subscription) and only returns to `false` after an [unsubscribe](#unsubscribe).

#### Returns

`boolean`

***

### lastConfiguration()

```ts
lastConfiguration(): Nullable<VoiceAssistantConfiguration>;
```

Last-known configuration record. Returns `null` when no configuration has been received since connect.

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`VoiceAssistantConfiguration`](../interfaces/VoiceAssistantConfiguration.md)\>

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Replay the preserved desired subscription onto the fresh transport. Called by the host on `connect()` at connect-bottom via the `SubscriptionLifecycle`
contract, after the new transport is up. Re-sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with the originally-requested flags when a subscription is desired, mirroring
the other sub-APIs' reissue path; a pure no-op when no subscription is desired (`desired` is `null`).

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

***

### requests()

```ts
requests(options?): AsyncIterable<VoiceAssistantRequest>;
```

Async-iterable view of inbound `voiceAssistantRequest` events. Yields one entry per device-side request (wake-word activation, conversation start, etc).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`VoiceAssistantRequest`](../interfaces/VoiceAssistantRequest.md)\>

An `AsyncIterable<VoiceAssistantRequest>`.

#### Remarks

Each `start=true` request expects an outbound acknowledgement via [VoiceAssistantApi.respondToRequest](#respondtorequest). The consumer decides per-request whether
to accept the pipeline (default, API audio), accept with UDP audio on a consumer-owned port, or decline.

Usage:

```ts
export async function voiceAssistantRespondExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe(VoiceAssistantSubscribeFlag.API_AUDIO);

  // Inbound: drain audio in parallel. Audio reception is independent of the request/respond handshake.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Handshake: for each start request, accept with API audio (the default and most common path). The no-args call mirrors `{ port: 0, error: false }`.
  for await (const request of va.requests({ signal: AbortSignal.timeout(60000) })) {

    if(!request.start) {

      continue;
    }

    va.respondToRequest();

    // Alternative shapes for completeness - uncomment to use the UDP-audio path (the consumer must open the listener separately via `node:dgram`):
    //   va.respondToRequest({ port: 12345 });
    //
    // ...or decline the pipeline (transient capacity, policy rejection, configuration mismatch):
    //   va.respondToRequest({ error: true });
  }
}
```

***

### respondToRequest()

```ts
respondToRequest(options?): void;
```

Respond to an inbound [VoiceAssistantRequest](../interfaces/VoiceAssistantRequest.md) by sending `VoiceAssistantResponse` (wire id 91) to the device. The device sends a request with `start=true`
when it wants to begin a voice pipeline; the device expects the client to acknowledge before proceeding. Three semantic forms:

- **Accept with API audio (default).** Pass no arguments. Equivalent to `{ port: 0, error: false }`. The device routes audio over the API channel (wire message
  `VoiceAssistantAudio`, id 106), which [VoiceAssistantApi.audio](#audio) iterates. This is the path most consumers take and matches the `API_AUDIO` subscribe flag.
- **Accept with UDP audio.** Pass `{ port: N }`. The device sends audio packets to UDP port N. This library is the transport for the ESPHome API only and
  does not receive UDP audio; the consumer implements the UDP listener separately (e.g., via `node:dgram`).
- **Decline.** Pass `{ error: true }`. The device aborts the pipeline; no audio is streamed in either direction. Use this when the client cannot (or chooses not
  to) handle the request - transient capacity, policy rejection, configuration mismatch, etc.

The method does not enforce semantic constraints on the wire frame - `{ port: N, error: true }` encodes both. It also does not gate on subscription state;
calling without a prior [subscribe](#subscribe) encodes-and-sends, and the device discards unsolicited responses.

Usage:

```ts
export async function voiceAssistantRespondExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe(VoiceAssistantSubscribeFlag.API_AUDIO);

  // Inbound: drain audio in parallel. Audio reception is independent of the request/respond handshake.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Handshake: for each start request, accept with API audio (the default and most common path). The no-args call mirrors `{ port: 0, error: false }`.
  for await (const request of va.requests({ signal: AbortSignal.timeout(60000) })) {

    if(!request.start) {

      continue;
    }

    va.respondToRequest();

    // Alternative shapes for completeness - uncomment to use the UDP-audio path (the consumer must open the listener separately via `node:dgram`):
    //   va.respondToRequest({ port: 12345 });
    //
    // ...or decline the pipeline (transient capacity, policy rejection, configuration mismatch):
    //   va.respondToRequest({ error: true });
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | \{ `error?`: `boolean`; `port?`: `number`; \} | Optional response shape; defaults to `{ port: 0, error: false }` (the API-audio acceptance case). |
| `options.error?` | `boolean` | - |
| `options.port?` | `number` | - |

#### Returns

`void`

***

### sendAudio()

```ts
sendAudio(audioData, end?): void;
```

Send a single audio chunk to the device. Mirrors the wire-side `VoiceAssistantAudio` message.

Usage:

```ts
export async function voiceAssistantStreamingExample(client: EspHomeClient, generator: AsyncIterable<{ data: Buffer; end: boolean }>): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  // Inbound: drain device audio into your STT pipeline.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Outbound: pipe synthesized audio back to the device.
  for await (const chunk of generator) {

    va.sendAudio(chunk.data, chunk.end);
  }

  // Pipeline events let the device update its UI (wake-word LED, processing indicator, error state) in lockstep with the assistant's state machine.
  va.sendEvent(VoiceAssistantEvent.RUN_START);
}
```

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `audioData` | `Buffer` | `undefined` | The audio bytes to send. |
| `end` | `boolean` | `false` | Whether this is the last chunk in the stream. |

#### Returns

`void`

***

### sendEvent()

```ts
sendEvent(eventType, data?): void;
```

Send a voice-assistant pipeline event back to the device. Mirrors the wire-side `VoiceAssistantEventResponse` message.

Usage:

```ts
export async function voiceAssistantStreamingExample(client: EspHomeClient, generator: AsyncIterable<{ data: Buffer; end: boolean }>): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  // Inbound: drain device audio into your STT pipeline.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Outbound: pipe synthesized audio back to the device.
  for await (const chunk of generator) {

    va.sendAudio(chunk.data, chunk.end);
  }

  // Pipeline events let the device update its UI (wake-word LED, processing indicator, error state) in lockstep with the assistant's state machine.
  va.sendEvent(VoiceAssistantEvent.RUN_START);
}
```

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `eventType` | [`VoiceAssistantEvent`](../type-aliases/VoiceAssistantEvent.md) | `undefined` | The pipeline event kind. |
| `data` | [`VoiceAssistantEventData`](../interfaces/VoiceAssistantEventData.md)[] | `[]` | Optional event data payload. |

#### Returns

`void`

***

### sendTimerEvent()

```ts
sendTimerEvent(timerData): void;
```

Send a voice-assistant timer event to the device. Mirrors the wire-side `VoiceAssistantTimerEventResponse` message.

Usage:

```ts
export function voiceAssistantTimerExample(client: EspHomeClient): void {

  client.voiceAssistant.sendTimerEvent({

    eventType: 0,
    isActive: true,
    name: "Tea timer",
    secondsLeft: 180,
    timerId: "tea-2026-05-08",
    totalSeconds: 180
  });
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `timerData` | [`VoiceAssistantTimerEventData`](../interfaces/VoiceAssistantTimerEventData.md) | The timer event data. |

#### Returns

`void`

***

### setActiveWakeWords()

```ts
setActiveWakeWords(ids): void;
```

Push a new active-wake-word list to the device. Mirrors the wire-side `VoiceAssistantSetConfiguration` message.

Usage:

```ts
export async function voiceAssistantConfigurationExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;
  const config = await va.configuration({ signal: AbortSignal.timeout(5000) });

  for(const wakeWord of config.availableWakeWords) {

    void wakeWord.id;
    void wakeWord.wakeWord;
    void wakeWord.trainedLanguages;
  }

  // Activate at most `maxActiveWakeWords` ids. An empty array clears all active wake words.
  va.setActiveWakeWords(config.availableWakeWords.slice(0, config.maxActiveWakeWords).map((w) => w.id));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ids` | readonly `string`[] | The wake-word ids to activate. Pass an empty list to clear all active wake words. |

#### Returns

`void`

***

### subscribe()

```ts
subscribe(flags?): void;
```

Subscribe to voice-assistant requests at the device. Sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with `subscribe=1` plus the supplied flag bits.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `flags` | [`VoiceAssistantSubscribeFlag`](../type-aliases/VoiceAssistantSubscribeFlag.md) | `0` | Subscription flags. Defaults to 0 (no audio routing). |

#### Returns

`void`

#### Remarks

After subscribing, the device may send `VoiceAssistantRequest` frames with `start=true` to begin a pipeline. The client must respond to each one via
[VoiceAssistantApi.respondToRequest](#respondtorequest) - either accepting the pipeline (default, API audio) or declining. Pipelines may stall on the device side if the
response is not sent.

Usage:

```ts
export async function voiceAssistantExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  for await (const audio of va.audio({ signal: AbortSignal.timeout(30000) })) {

    void audio.data;
    void audio.end;
  }

  await va.announce({ text: "Doorbell rang" }, { timeoutMs: 5000 });
}
```

***

### unsubscribe()

```ts
unsubscribe(): void;
```

Unsubscribe from voice-assistant requests. Sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with `subscribe=0` and clears the preserved `desired` intent so a
subsequent [reissueOnReconnect](#reissueonreconnect) is a no-op (the consumer no longer wants the subscription).

#### Returns

`void`
