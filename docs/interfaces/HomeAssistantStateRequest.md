[**esphome-client**](../README.md)

***

[Home](../README.md) / HomeAssistantStateRequest

# Interface: HomeAssistantStateRequest

Home Assistant state request event data. Emitted as the `homeassistantStateRequest` event when an ESPHome device requests the state of a Home Assistant entity,
typically when ESPHome has an `on_value` trigger that references Home Assistant state.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="attribute"></a> `attribute` | `string` | The specific attribute being requested (empty string if requesting the main state). |
| <a id="entityid"></a> `entityId` | `string` | The Home Assistant entity ID being requested. |
| <a id="once"></a> `once` | `boolean` | Whether this is a one-time request (true) or a subscription (false). |
