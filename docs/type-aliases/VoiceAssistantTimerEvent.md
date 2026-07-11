[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantTimerEvent

# Type Alias: VoiceAssistantTimerEvent

```ts
type VoiceAssistantTimerEvent = typeof VoiceAssistantTimerEvent[keyof typeof VoiceAssistantTimerEvent];
```

Voice assistant timer lifecycle events reported by the client on `VoiceAssistantTimerEventResponse.event_type`, alongside the affected `timer_id`. Mirrors
`api.proto` `VoiceAssistantTimerEvent`. Consumers use this to track assistant-set timers (e.g. "set a timer for five minutes") from creation through completion or
cancellation.
