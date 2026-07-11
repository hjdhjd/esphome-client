[**esphome-client**](../README.md)

***

[Home](../README.md) / InboundPackedBitSpec

# Interface: InboundPackedBitSpec

One named bit within an [InboundPackedBitsField](InboundPackedBitsField.md) (state or listEntities role). Carries the bit position only; the encoder's `hasFieldBit` contribution is
not meaningful on inbound roles, so the type structurally excludes it.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bit"></a> `bit` | `number` |
