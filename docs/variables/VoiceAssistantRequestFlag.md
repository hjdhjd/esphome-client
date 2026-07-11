[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantRequestFlag

# Variable: VoiceAssistantRequestFlag

```ts
const VoiceAssistantRequestFlag: {
  NONE: 0;
  USE_VAD: 1;
  USE_WAKE_WORD: 2;
};
```

Voice assistant request flags carried as a bitmask on `VoiceAssistantRequest.flags`, the server-to-client message that starts an assistant run. Mirrors `api.proto`
`VoiceAssistantRequestFlag`. `USE_VAD` tells the client to apply voice-activity detection to end the utterance automatically; `USE_WAKE_WORD` tells the client the
run was triggered by a wake word rather than a manual start.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-none"></a> `NONE` | `0` | `0` |
| <a id="property-use_vad"></a> `USE_VAD` | `1` | `1` |
| <a id="property-use_wake_word"></a> `USE_WAKE_WORD` | `2` | `2` |
