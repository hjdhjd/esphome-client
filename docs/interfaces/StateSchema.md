[**esphome-client**](../README.md)

***

[Home](../README.md) / StateSchema

# Interface: StateSchema

Defines the state response message structure for an entity type.

## Remarks

`enumMappings` mirrors the [CommandSchema](CommandSchema.md) slot of the same name on the state side. When declared, each entry maps a state-field name to a record
of named labels and their wire-numeric values; the schema-derived [StateEventFor](../type-aliases/StateEventFor.md) type narrows that field from plain `number` to the
literal-union of the mapping's values. Drift between the schema's mapping and the corresponding named constant in `api-constants.ts` is a type bug; the dual-write
is the architectural cost of the refinement and is verified by per-entity-type consistency tests in `entity-schemas.test.ts`. Forward-compat is preserved at
runtime - the decoder does not validate against the mapping, so wire-enum members that ESPHome adds in future releases pass through as raw numbers.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="deviceidfieldnumber"></a> `deviceIdFieldNumber` | `number` |
| <a id="enummappings"></a> `enumMappings?` | `Record`\<`string`, [`EnumMapping`](../type-aliases/EnumMapping.md)\> |
| <a id="fields"></a> `fields` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
| <a id="keyfieldnumber"></a> `keyFieldNumber` | `number` |
| <a id="messagetype"></a> `messageType` | `number` |
| <a id="packedbitsfields"></a> `packedBitsFields?` | `Record`\<`string`, [`InboundPackedBitsField`](InboundPackedBitsField.md)\> |
