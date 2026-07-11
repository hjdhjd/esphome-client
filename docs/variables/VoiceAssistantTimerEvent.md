[**esphome-client**](../README.md)

***

[Home](../README.md) / VoiceAssistantTimerEvent

# Variable: VoiceAssistantTimerEvent

```ts
const VoiceAssistantTimerEvent: {
  CANCELLED: 2;
  FINISHED: 3;
  STARTED: 0;
  UPDATED: 1;
};
```

Voice assistant timer lifecycle events reported by the client on `VoiceAssistantTimerEventResponse.event_type`, alongside the affected `timer_id`. Mirrors
`api.proto` `VoiceAssistantTimerEvent`. Consumers use this to track assistant-set timers (e.g. "set a timer for five minutes") from creation through completion or
cancellation.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-cancelled"></a> `CANCELLED` | `2` | `2` |
| <a id="property-finished"></a> `FINISHED` | `3` | `3` |
| <a id="property-started"></a> `STARTED` | `0` | `0` |
| <a id="property-updated"></a> `UPDATED` | `1` | `1` |
