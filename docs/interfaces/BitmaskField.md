[**esphome-client**](../README.md)

***

[Home](../README.md) / BitmaskField

# Interface: BitmaskField

Defines a field that participates in a bitmask-aggregated has-pattern. Used by entity types where the wire format collapses every per-field "has" indicator into a
single uint32 bitmask field instead of emitting one boolean per option (compare [HasPatternField](HasPatternField.md)). The encoder ORs each present option's `bit` into a running
mask, emits the value fields, then writes the aggregated mask under the schema's `bitmaskFieldNumber`.

Water heater commands use this shape, and any entity type whose wire format carries the same aggregated bitmask can adopt it.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bit"></a> `bit` | `number` |
| <a id="fieldnumber"></a> `fieldNumber` | `number` |
| <a id="valuetype"></a> `valueType` | [`ValueType`](../type-aliases/ValueType.md) |
| <a id="wiretype"></a> `wireType` | [`WireType`](../type-aliases/WireType.md) |
