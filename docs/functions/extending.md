[**esphome-client**](../README.md)

***

[Home](../README.md) / extending

# Function: extending()

```ts
function extending(base, additions): EntitySchema;
```

Builds a schema that extends an upstream entity type with additional scalar fields. Returns a new schema with the upstream's listEntities and state field maps
merged with the supplied additions. Field number collisions are not detected at compile time; the consumer is responsible for picking field numbers that don't
conflict with the upstream schema.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `base` | \| `"number"` \| `"alarm_control_panel"` \| `"binary_sensor"` \| `"button"` \| `"camera"` \| `"climate"` \| `"cover"` \| `"date"` \| `"datetime"` \| `"event"` \| `"fan"` \| `"infrared"` \| `"light"` \| `"lock"` \| `"media_player"` \| `"radio_frequency"` \| `"select"` \| `"sensor"` \| `"siren"` \| `"switch"` \| `"text"` \| `"text_sensor"` \| `"time"` \| `"update"` \| `"valve"` \| `"water_heater"` | The upstream entity type to extend. |
| `additions` | [`SchemaExtensions`](../interfaces/SchemaExtensions.md) | Additional fields to merge into listEntities or state. |

## Returns

[`EntitySchema`](../interfaces/EntitySchema.md)

A new EntitySchema with the merged shape. The `command` spec is the upstream's command spec unchanged.

## Remarks

`extending()` is **read-side-only by design**. The [SchemaExtensions](../interfaces/SchemaExtensions.md) interface deliberately exposes only `addedListEntitiesFields` and
`addedStateFields`...the upstream command spec is preserved verbatim and there is no `addedCommandFields` slot. Discovery decoding (`decodeEntityFromSchema`)
and telemetry decoding (`decodeStateFromSchema`) walk the merged `fields` maps, so any additions surface on the decoded entity record and on every emitted state
event for the extending-built type. Command encoding consults the upstream's pristine `command.fields` map unchanged, so commands for an `extending("switch", ...)`
registered type produce the exact same wire bytes as commands for the upstream `switch` type. The architectural reason is encoder-stability: a vendor that adds
read-side metadata (firmware revision, power-watts telemetry, ...) almost never needs to extend the outbound command shape, and locking the command spec to the
upstream means future consumers can swap an extending-built type for its upstream sibling without changing any encode-side logic.

A byte-equality test in `src/esphome-client.test.ts` is the canonical runtime anti-regression assertion for this contract: it byte-equals the emitted
`SWITCH_COMMAND_REQUEST` payload for an `extending`-built vendor switch against the upstream switch's two-field encoding, so any future change that accidentally
threads `addedCommandFields` through the encode path fails loudly at test time.

If you need to extend the command spec for a vendor type, fork the schema directly rather than threading a third slot through [SchemaExtensions](../interfaces/SchemaExtensions.md)...the
read-side-only constraint is load-bearing for the encoder-stability guarantee.

Usage:

```ts
export async function schemaExtensionExample(): Promise<void> {

  // As an illustrative custom type, we alias "cover" to a distinct "door_cover" discriminant - the pattern a consumer reaches for when it wants an upstream type
  // routed under its own type key for its own dispatch. (A real garage door, Konnected included, exposes a standard "cover"; this is a teaching example, not a
  // required registration.) Quoted keys keep the entity-type strings honest to ESPHome's snake_case convention without tripping the camelCase identifier rule.
  const extras = {

    "door_cover": { ...aliasOf("cover"), type: "door_cover" },
    "extended_switch": extending("switch", {

      addedStateFields: {

        surgeCount: { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT }
      }
    })
  } satisfies ExtraSchemaSet;

  // Consumers hand the extras object to the factory at construction. The factory's type parameter threads the extras keys through the public surface, so commands,
  // telemetry, and discovery for an extras-keyed entity type narrow exactly like a built-in. Throws ConfigurationError("EXTRA_SCHEMA_OVERRIDES_BUILTIN") if any key
  // collides with a built-in type.
  const client = await openEspHomeClient<typeof extras>({ extraSchemas: extras, host: "vendor-device.local", reconnect: false });

  // Mint a branded id for an extras-keyed entity type. The type parameter on entityId() carries the literal "door_cover" through to the EntityId<"door_cover"> brand,
  // so the subsequent client.command() call narrows options against the door_cover schema.
  client.command(entityId("door_cover", "garage"), { position: 0.75 });
  client.disconnect();
}
```
