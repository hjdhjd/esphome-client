[**esphome-client**](../README.md)

***

[Home](../README.md) / CommandPackedBitSpec

# Interface: CommandPackedBitSpec

One named bit within a [CommandPackedBitsField](CommandPackedBitsField.md) (command role). Adds the optional `hasFieldBit` that the encoder ORs into the role's has-bitmask carrier
when the consumer touches this named bit. Inbound `PackedBitSpec` deliberately omits this field so a misconfigured state/listEntities schema fails to compile
rather than carrying a silently-ignored slot.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bit"></a> `bit` | `number` |
| <a id="hasfieldbit"></a> `hasFieldBit?` | `number` |
