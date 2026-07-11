[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantRequestFlag

# Type Alias: VoiceAssistantRequestFlag

```ts
type VoiceAssistantRequestFlag = typeof VoiceAssistantRequestFlag[keyof typeof VoiceAssistantRequestFlag];
```

Voice assistant request flags carried as a bitmask on `VoiceAssistantRequest.flags`, the server-to-client message that starts an assistant run. Mirrors `api.proto`
`VoiceAssistantRequestFlag`. `USE_VAD` tells the client to apply voice-activity detection to end the utterance automatically; `USE_WAKE_WORD` tells the client the
run was triggered by a wake word rather than a manual start.
