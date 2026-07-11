[**esphome-client**](../README.md)

***

[Home](../README.md) / InfraredCapabilityFlags

# Variable: InfraredCapabilityFlags

```ts
const InfraredCapabilityFlags: {
  RECEIVER: number;
  TRANSMITTER: number;
};
```

Infrared entity capability bitmask flags. The wire-side `ListEntitiesInfraredResponse.capabilities` field is a bitwise OR of these values. Consumers bit-test against
this constant to gate UI affordances (transmitter-only entities have no receiver pipeline; receiver-only entities cannot accept transmit commands).

The flag values mirror ESPHome's `esphome/components/infrared/infrared.h::InfraredCapabilityFlags`. Bit 0 marks transmitter capability, bit 1 marks receiver
capability. Unlike [RadioFrequencyCapabilityFlags](RadioFrequencyCapabilityFlags.md), whose bit positions `api.proto` documents inline, the Infrared bit positions here are inferred by parity
with the RF flags and from the upstream `infrared.h` header, and assumed to remain stable across firmware revisions.

## Type Declaration

| Name | Type |
| ------ | ------ |
| <a id="property-receiver"></a> `RECEIVER` | `number` |
| <a id="property-transmitter"></a> `TRANSMITTER` | `number` |
