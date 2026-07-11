[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantAudioData

# Interface: VoiceAssistantAudioData

Voice assistant audio data for streaming audio.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="data"></a> `data` | `Buffer` | The audio data bytes (primary channel; mono on pre-1.14 firmware, left channel on stereo-capable firmware). |
| <a id="data2"></a> `data2?` | `Buffer`\<`ArrayBufferLike`\> | The second channel of a stereo audio stream (right channel). Present only when the device firmware supports the stereo audio extension; check `client.capabilities().voiceAssistant.stereoAudio` to know whether the connected device can send it. Always `undefined` on mono streams and pre-1.14 firmware. |
| <a id="end"></a> `end` | `boolean` | Whether this is the last audio packet. |
