[**esphome-client**](../README.md)

***

[Home](../README.md) / RadioFrequencyCapabilityFlags

# Variable: RadioFrequencyCapabilityFlags

```ts
const RadioFrequencyCapabilityFlags: {
  RECEIVER: number;
  TRANSMITTER: number;
};
```

Radio-frequency entity capability bitmask flags. The wire-side `ListEntitiesRadioFrequencyResponse.capabilities` field is a bitwise OR of these values. The two bits
map identically to [InfraredCapabilityFlags](InfraredCapabilityFlags.md): bit 0 = transmitter, bit 1 = receiver, per the comment at `api.proto`
§ListEntitiesRadioFrequencyResponse.capabilities.

Mirrors ESPHome's `esphome/components/radio_frequency/radio_frequency.h::RadioFrequencyCapabilityFlags`.

## Type Declaration

| Name | Type |
| ------ | ------ |
| <a id="property-receiver"></a> `RECEIVER` | `number` |
| <a id="property-transmitter"></a> `TRANSMITTER` | `number` |
