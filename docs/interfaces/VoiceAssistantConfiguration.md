[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantConfiguration

# Interface: VoiceAssistantConfiguration

Voice assistant configuration response.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="activewakewords"></a> `activeWakeWords` | `string`[] | List of currently active wake word IDs. |
| <a id="availablewakewords"></a> `availableWakeWords` | [`VoiceAssistantWakeWord`](VoiceAssistantWakeWord.md)[] | List of available wake words. |
| <a id="maxactivewakewords"></a> `maxActiveWakeWords` | `number` | Maximum number of wake words that can be active. |
