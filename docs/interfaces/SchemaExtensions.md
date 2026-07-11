[**esphome-client**](../README.md)

***

[Home](../README.md) / SchemaExtensions

# Interface: SchemaExtensions

Schema extension shape supplied to [extending](../functions/extending.md). Allows the consumer to add scalar fields to listEntities or state without rewriting the upstream schema.

## Remarks

This interface deliberately carries no `addedCommandFields` slot. The omission is the encoder-stability invariant documented in [extending](../functions/extending.md)'s
`@remarks`...command encoding stays anchored to the upstream's pristine `command.fields` map, so consumers can swap an extending-built type for its upstream
sibling without changing encode-side logic. Read-side additions only.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="addedlistentitiesfields"></a> `addedListEntitiesFields?` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
| <a id="addedstatefields"></a> `addedStateFields?` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
