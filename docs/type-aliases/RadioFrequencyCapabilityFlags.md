[**esphome-client**](../README.md)

***

[Home](../README.md) / RadioFrequencyCapabilityFlags

# Type Alias: RadioFrequencyCapabilityFlags

```ts
type RadioFrequencyCapabilityFlags = typeof RadioFrequencyCapabilityFlags[keyof typeof RadioFrequencyCapabilityFlags];
```

Radio-frequency entity capability bitmask flags. The wire-side `ListEntitiesRadioFrequencyResponse.capabilities` field is a bitwise OR of these values. The two bits
map identically to [InfraredCapabilityFlags](../variables/InfraredCapabilityFlags.md): bit 0 = transmitter, bit 1 = receiver, per the comment at `api.proto`
§ListEntitiesRadioFrequencyResponse.capabilities.

Mirrors ESPHome's `esphome/components/radio_frequency/radio_frequency.h::RadioFrequencyCapabilityFlags`.
