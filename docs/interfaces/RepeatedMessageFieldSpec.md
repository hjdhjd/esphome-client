[**esphome-client**](../README.md)

***

[Home](../README.md) / RepeatedMessageFieldSpec

# Interface: RepeatedMessageFieldSpec

Defines the wire format for a repeated protobuf field containing multiple sub-messages of the same shape. The wire bytes for each occurrence are decoded as their own
protobuf message using [RepeatedMessageFieldSpec.fields](#fields), and the resulting structured record is appended to the entity's surfaced array. Use this slot for
fields like `MediaPlayerSupportedFormat` where the proto declares `repeated <NestedMessage>` and consumers need every nested scalar exposed without re-parsing raw
bytes.

`enumMappings` mirrors the same slot on the parent role: when an inner field key appears here, the schema-derived type narrows that key from plain `number` to the
literal-union of the mapping's numeric values, exactly as the parent-level `enumMappings` does for the outer message.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="enummappings"></a> `enumMappings?` | `Record`\<`string`, [`EnumMapping`](../type-aliases/EnumMapping.md)\> |
| <a id="fieldnumber"></a> `fieldNumber` | `number` |
| <a id="fields"></a> `fields` | `Record`\<`string`, [`FieldSpec`](FieldSpec.md)\> |
| <a id="wiretype"></a> `wireType` | `WireType` |
