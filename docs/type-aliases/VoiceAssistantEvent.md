[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantEvent

# Type Alias: VoiceAssistantEvent

```ts
type VoiceAssistantEvent = typeof VoiceAssistantEvent[keyof typeof VoiceAssistantEvent];
```

Voice assistant pipeline-progress events reported by the client on `VoiceAssistantEventResponse.event_type` as an assistant run advances. Mirrors `api.proto`
`VoiceAssistantEvent`. The values fall into paired start/end brackets for each pipeline stage (STT, intent, TTS, wake word, VAD) plus a standalone `ERROR` and the
higher-numbered `TTS_STREAM_START` / `TTS_STREAM_END` / `INTENT_PROGRESS` additions used for streamed responses.
