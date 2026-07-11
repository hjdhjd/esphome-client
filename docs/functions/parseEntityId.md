[**esphome-client**](../README.md)

***

[Home](../README.md) / parseEntityId

# Function: parseEntityId()

```ts
function parseEntityId(value): Nullable<{
  id: EntityId;
  type:   | "number"
     | "alarm_control_panel"
     | "binary_sensor"
     | "button"
     | "camera"
     | "climate"
     | "cover"
     | "date"
     | "datetime"
     | "event"
     | "fan"
     | "infrared"
     | "light"
     | "lock"
     | "media_player"
     | "radio_frequency"
     | "select"
     | "sensor"
     | "siren"
     | "switch"
     | "text"
     | "text_sensor"
     | "time"
     | "update"
     | "valve"
     | "water_heater";
}>;
```

Convenience for parsing an arbitrary string when the consumer doesn't yet know which entity type it points at. Returns the parsed `{ type, id }` pair when the prefix
matches a known entity type, or `null` otherwise.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The string to parse. |

## Returns

[`Nullable`](../type-aliases/Nullable.md)\<\{
  `id`: [`EntityId`](../type-aliases/EntityId.md);
  `type`:   \| `"number"`
     \| `"alarm_control_panel"`
     \| `"binary_sensor"`
     \| `"button"`
     \| `"camera"`
     \| `"climate"`
     \| `"cover"`
     \| `"date"`
     \| `"datetime"`
     \| `"event"`
     \| `"fan"`
     \| `"infrared"`
     \| `"light"`
     \| `"lock"`
     \| `"media_player"`
     \| `"radio_frequency"`
     \| `"select"`
     \| `"sensor"`
     \| `"siren"`
     \| `"switch"`
     \| `"text"`
     \| `"text_sensor"`
     \| `"time"`
     \| `"update"`
     \| `"valve"`
     \| `"water_heater"`;
\}\>

The parsed entity reference or null if the string is malformed or its prefix isn't a known entity type.

## Remarks

This is the lenient, normalizing counterpart to the strict [isEntityId](isEntityId.md) guard. It lower-cases the type prefix before matching - and returns the id
lower-cased - mirroring [entityId](entityId.md)'s minting convention, so a mixed-case input like `"Cover-Front"` normalizes to `{ id: "cover-front", type: "cover" }` rather
than being rejected. Validation is shape-only: the prefix must be a known entity type with a dash following it, but an empty object_id (e.g. `"cover-"`) parses
successfully - whether an entity by that id actually exists is the separate [EspHomeClient.hasEntity](../classes/EspHomeClient.md#hasentity) check, by design.
