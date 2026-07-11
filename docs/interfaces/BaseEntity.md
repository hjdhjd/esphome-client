[**esphome-client**](../README.md)

***

[Home](../README.md) / BaseEntity

# Interface: BaseEntity

Base entity interface containing fields common to all ESPHome entity types. Carries the same fields as the schema-derived shape under a conventional name for
ergonomic consumer use.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="deviceid"></a> `deviceId?` | `number` |
| <a id="disabledbydefault"></a> `disabledByDefault?` | `boolean` |
| <a id="entitycategory"></a> `entityCategory?` | [`EntityCategory`](../type-aliases/EntityCategory.md) |
| <a id="icon"></a> `icon?` | `string` |
| <a id="key"></a> `key` | `number` |
| <a id="name"></a> `name` | `string` |
| <a id="objectid"></a> `objectId` | `string` |
| <a id="type"></a> `type` | \| `"number"` \| `"alarm_control_panel"` \| `"binary_sensor"` \| `"button"` \| `"camera"` \| `"climate"` \| `"cover"` \| `"date"` \| `"datetime"` \| `"event"` \| `"fan"` \| `"infrared"` \| `"light"` \| `"lock"` \| `"media_player"` \| `"radio_frequency"` \| `"select"` \| `"sensor"` \| `"siren"` \| `"switch"` \| `"text"` \| `"text_sensor"` \| `"time"` \| `"update"` \| `"valve"` \| `"water_heater"` |
