[**esphome-client**](../README.md)

***

[Home](../README.md) / ServiceCallResult

# Interface: ServiceCallResult

Result of a user-defined service execution. Emitted via the `serviceCallResult` event when the device reports back via `EXECUTE_SERVICE_RESPONSE` (only sent by
firmwares that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES`; older firmwares treat `executeService` as fire-and-forget and never produce this event).

Consumers correlate results to their `executeService` calls via [callId](#callid); the call id is supplied by the device-side service definition.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="callid"></a> `callId` | `number` | The numeric call id, matching the `call_id` carried on the originating `EXECUTE_SERVICE_REQUEST`. |
| <a id="errormessage"></a> `errorMessage?` | `string` | Human-readable error string when `success` is `false`. Absent on success. |
| <a id="responsedata"></a> `responseData?` | `Buffer`\<`ArrayBufferLike`\> | Optional opaque response bytes (typically JSON-encoded) when the device-side service was defined with `USE_API_USER_DEFINED_ACTION_RESPONSES_JSON`. |
| <a id="success"></a> `success` | `boolean` | Whether the device-side service handler ran successfully. |
