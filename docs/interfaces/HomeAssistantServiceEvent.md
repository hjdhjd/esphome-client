[**esphome-client**](../README.md)

***

[Home](../README.md) / HomeAssistantServiceEvent

# Interface: HomeAssistantServiceEvent

Home Assistant service call event data. Emitted as the `homeassistantService` event when an ESPHome device triggers a `homeassistant.action` or
`homeassistant.service` call expecting Home Assistant to execute the action.

The optional `callId` field is populated when the device firmware enables the `USE_API_HOMEASSISTANT_ACTION_RESPONSES` preprocessor flag, while `wantsResponse` and
`responseTemplate` are populated when the firmware enables `USE_API_HOMEASSISTANT_ACTION_RESPONSES_JSON` (matching the `field_ifdef` annotations on `call_id`,
`wants_response`, and `response_template` in api.proto). When `wantsResponse` is `true`, the consumer is expected to call [HomeAssistantApi.respondToAction](../classes/HomeAssistantApi.md#respondtoaction)
with the matching `callId` so the device receives the action result. Older firmwares omit these fields; legacy consumers that ignore them remain correct.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="callid"></a> `callId?` | `number` | Numeric correlation id for [HomeAssistantApi.respondToAction](../classes/HomeAssistantApi.md#respondtoaction). Present only when the device firmware enables action responses. |
| <a id="data"></a> `data` | `Record`\<`string`, `string`\> | Key-value data for the service call. |
| <a id="datatemplate"></a> `dataTemplate` | `Record`\<`string`, `string`\> | Templated key-value data for the service call. |
| <a id="isevent"></a> `isEvent` | `boolean` | Whether this is an event (true) or a service call (false). |
| <a id="responsetemplate"></a> `responseTemplate?` | `string` | Optional rendering template the device expects the response to follow. Present only when the device firmware enables JSON action responses. |
| <a id="service"></a> `service` | `string` | The service being called (e.g., "notify.html5"). |
| <a id="variables"></a> `variables` | `Record`\<`string`, `string`\> | Variables for template rendering. |
| <a id="wantsresponse"></a> `wantsResponse?` | `boolean` | When `true`, the device expects a `HOMEASSISTANT_ACTION_RESPONSE` keyed by `callId`. Absent on legacy firmwares. |
