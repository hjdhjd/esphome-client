[**esphome-client**](../README.md)

***

[Home](../README.md) / InboundPackedBitsField

# Interface: InboundPackedBitsField

Inbound (state / listEntities) packed-bits field. Defines a single proto uint32 wire field that packs multiple consumer-facing booleans into its bits. The decoder
reads the packed field and surfaces each named bit as a boolean on the entity/state object. The interface intentionally constrains its `bits` record to
[InboundPackedBitSpec](InboundPackedBitSpec.md) so a misplaced `hasFieldBit` (command-only) on a state or listEntities schema is a compile error rather than dead code.

Bit semantics are sourced from the firmware enum (e.g. ESPHome's `ClimateFeatures` in `climate_mode.h`) when the proto does not enumerate them. The matching
named-constant in `api-constants.ts` is the SSOT for consumer-facing label names; the schema's `bits` record maps each named label to its bit position.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="bits"></a> `bits` | `Record`\<`string`, [`InboundPackedBitSpec`](InboundPackedBitSpec.md)\> |
| <a id="fieldnumber"></a> `fieldNumber` | `number` |
| <a id="wiretype"></a> `wireType` | `WireType` |
