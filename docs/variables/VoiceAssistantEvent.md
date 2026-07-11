[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantEvent

# Variable: VoiceAssistantEvent

```ts
const VoiceAssistantEvent: {
  ERROR: 0;
  INTENT_END: 6;
  INTENT_PROGRESS: 100;
  INTENT_START: 5;
  RUN_END: 2;
  RUN_START: 1;
  STT_END: 4;
  STT_START: 3;
  STT_VAD_END: 12;
  STT_VAD_START: 11;
  TTS_END: 8;
  TTS_START: 7;
  TTS_STREAM_END: 99;
  TTS_STREAM_START: 98;
  WAKE_WORD_END: 10;
  WAKE_WORD_START: 9;
};
```

Voice assistant pipeline-progress events reported by the client on `VoiceAssistantEventResponse.event_type` as an assistant run advances. Mirrors `api.proto`
`VoiceAssistantEvent`. The values fall into paired start/end brackets for each pipeline stage (STT, intent, TTS, wake word, VAD) plus a standalone `ERROR` and the
higher-numbered `TTS_STREAM_START` / `TTS_STREAM_END` / `INTENT_PROGRESS` additions used for streamed responses.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-error"></a> `ERROR` | `0` | `0` |
| <a id="property-intent_end"></a> `INTENT_END` | `6` | `6` |
| <a id="property-intent_progress"></a> `INTENT_PROGRESS` | `100` | `100` |
| <a id="property-intent_start"></a> `INTENT_START` | `5` | `5` |
| <a id="property-run_end"></a> `RUN_END` | `2` | `2` |
| <a id="property-run_start"></a> `RUN_START` | `1` | `1` |
| <a id="property-stt_end"></a> `STT_END` | `4` | `4` |
| <a id="property-stt_start"></a> `STT_START` | `3` | `3` |
| <a id="property-stt_vad_end"></a> `STT_VAD_END` | `12` | `12` |
| <a id="property-stt_vad_start"></a> `STT_VAD_START` | `11` | `11` |
| <a id="property-tts_end"></a> `TTS_END` | `8` | `8` |
| <a id="property-tts_start"></a> `TTS_START` | `7` | `7` |
| <a id="property-tts_stream_end"></a> `TTS_STREAM_END` | `99` | `99` |
| <a id="property-tts_stream_start"></a> `TTS_STREAM_START` | `98` | `98` |
| <a id="property-wake_word_end"></a> `WAKE_WORD_END` | `10` | `10` |
| <a id="property-wake_word_start"></a> `WAKE_WORD_START` | `9` | `9` |
