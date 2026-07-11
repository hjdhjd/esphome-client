[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantRequest

# Interface: VoiceAssistantRequest

Voice assistant request event data.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="audiosettings"></a> `audioSettings?` | [`VoiceAssistantAudioSettings`](VoiceAssistantAudioSettings.md) | The audio settings for the request. |
| <a id="conversationid"></a> `conversationId?` | `string` | The unique identifier for the conversation. |
| <a id="flags"></a> `flags` | `number` | The voice assistant request flags. |
| <a id="start"></a> `start` | `boolean` | Whether this is the start of a new request. |
| <a id="wakewordphrase"></a> `wakeWordPhrase?` | `string` | The detected wake word phrase, if any. |
