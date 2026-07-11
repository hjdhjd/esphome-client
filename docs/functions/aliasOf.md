[**esphome-client**](../README.md)

***

[Home](../README.md) / aliasOf

# Function: aliasOf()

```ts
function aliasOf(base): EntitySchema;
```

Builds a schema that aliases an existing entity type under a different name. The returned schema is a fresh shallow copy that reuses the upstream type's wire
format verbatim and keeps the upstream `type` discriminant unchanged; the caller overrides the `type` field at registration time when the alias should surface
under a new name (as the extras examples and routing tests do).

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

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `base` | \| `"number"` \| `"alarm_control_panel"` \| `"binary_sensor"` \| `"button"` \| `"camera"` \| `"climate"` \| `"cover"` \| `"date"` \| `"datetime"` \| `"event"` \| `"fan"` \| `"infrared"` \| `"light"` \| `"lock"` \| `"media_player"` \| `"radio_frequency"` \| `"select"` \| `"sensor"` \| `"siren"` \| `"switch"` \| `"text"` \| `"text_sensor"` \| `"time"` \| `"update"` \| `"valve"` \| `"water_heater"` | The upstream entity type to alias. Must be a key of [ENTITY\_SCHEMAS](../variables/ENTITY_SCHEMAS.md). |

## Returns

[`EntitySchema`](../interfaces/EntitySchema.md)

A new EntitySchema reusing the upstream wire format with the original type discriminant. Consumers should override the type field at registration time if
they need it to surface as the alias name.
