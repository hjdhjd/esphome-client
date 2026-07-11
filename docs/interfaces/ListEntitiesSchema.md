[**esphome-client**](../README.md)

***

[Home](../README.md) / ListEntitiesSchema

# Interface: ListEntitiesSchema

Defines the list entities response message structure for an entity type.

## Remarks

`enumMappings` mirrors the [StateSchema](StateSchema.md) slot of the same name on the discovery side. When declared, each entry maps a listEntities-field name to
a record of named labels and their wire-numeric values; the schema-derived [EntityFor](../type-aliases/EntityFor.md) type narrows that field from plain `number` (or
`number[]` for repeated fields) to the literal-union of the mapping's numeric values. This brings listEntities enum narrowing into parity with state-side
narrowing - both
inbound schemas now produce numeric-literal-union types for enum fields, and consumers gain compile-time exhaustiveness on discovery-side enum comparisons just
as they already have on state-side. Drift between a listEntities-side mapping and the corresponding named constant in `api-constants.ts` is a type bug; the
dual-write is verified by per-entity-type consistency tests in `entity-schemas.test.ts`. Forward-compat is preserved at runtime - the decoder reads raw numeric
wire values, so members ESPHome adds in future releases pass through as plain numbers.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="deviceidfieldnumber"></a> `deviceIdFieldNumber` | `number` |
| <a id="enummappings"></a> `enumMappings?` | `Record`\<`string`, [`EnumMapping`](../type-aliases/EnumMapping.md)\> |
| <a id="fields"></a> `fields` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
| <a id="keyfieldnumber"></a> `keyFieldNumber` | `number` |
| <a id="messagetype"></a> `messageType` | `number` |
| <a id="namefieldnumber"></a> `nameFieldNumber` | `number` |
| <a id="objectidfieldnumber"></a> `objectIdFieldNumber` | `number` |
| <a id="packedbitsfields"></a> `packedBitsFields?` | `Record`\<`string`, [`InboundPackedBitsField`](InboundPackedBitsField.md)\> |
| <a id="repeatedfields"></a> `repeatedFields?` | `Record`\<`string`, [`RepeatedFieldSpec`](RepeatedFieldSpec.md)\> |
| <a id="repeatedmessagefields"></a> `repeatedMessageFields?` | `Record`\<`string`, [`RepeatedMessageFieldSpec`](RepeatedMessageFieldSpec.md)\> |
