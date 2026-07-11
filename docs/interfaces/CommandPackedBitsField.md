[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandPackedBitsField

# Interface: CommandPackedBitsField

Command-side packed-bits field. Mirrors [InboundPackedBitsField](InboundPackedBitsField.md) but allows each named bit to carry an optional `hasFieldBit` that the encoder ORs into the
role's `bitmaskFieldNumber` (the has-bitmask carrier) when the consumer supplies the named boolean - signaling the firmware that the corresponding packed bit is
meaningful regardless of whether the consumer set it true or false.

Used by the water-heater command schema today, where `awayState`/`onState` map both to bits in the packed `state` wire field (field 6) AND to the
`HAS_AWAY_STATE`/`HAS_ON_STATE` bits in the `has_fields` carrier (field 2).

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bits"></a> `bits` | `Record`\<`string`, [`CommandPackedBitSpec`](CommandPackedBitSpec.md)\> |
| <a id="fieldnumber"></a> `fieldNumber` | `number` |
| <a id="wiretype"></a> `wireType` | `WireType` |
