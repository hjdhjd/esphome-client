[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandSchema

# Interface: CommandSchema

Defines the command message structure for an entity type.

## Remarks

Three encoding pathways coexist on the same schema, picked per entity type:

- [CommandSchema.fields](#fields) - plain protobuf fields, written when the consumer supplies the matching key.
- [CommandSchema.hasPatternFields](#haspatternfields) - per-field `has_*`/value pairs (climate, fan, light, cover, ...).
- [CommandSchema.bitmaskFields](#bitmaskfields) + [CommandSchema.bitmaskFieldNumber](#bitmaskfieldnumber) - bitmask-aggregated has-flags written as a single uint32 plus value fields (water
  heater).

An entity type uses whichever subset of the three matches its proto definition; the schema-driven encoder in `command-pipeline.ts` walks all three on every command.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bitmaskfieldnumber"></a> `bitmaskFieldNumber?` | `number` |
| <a id="bitmaskfields"></a> `bitmaskFields?` | `Record`\<`string`, [`BitmaskField`](BitmaskField.md)\> |
| <a id="deviceidfieldnumber"></a> `deviceIdFieldNumber` | `number` |
| <a id="enummappings"></a> `enumMappings?` | `Record`\<`string`, [`EnumMapping`](../type-aliases/EnumMapping.md)\> |
| <a id="fields"></a> `fields` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
| <a id="haspatternfields"></a> `hasPatternFields` | `Record`\<`string`, [`HasPatternField`](HasPatternField.md)\> |
| <a id="keyfieldnumber"></a> `keyFieldNumber` | `number` |
| <a id="messagetype"></a> `messageType` | `number` |
| <a id="packedbitsfields"></a> `packedBitsFields?` | `Record`\<`string`, [`CommandPackedBitsField`](CommandPackedBitsField.md)\> |
