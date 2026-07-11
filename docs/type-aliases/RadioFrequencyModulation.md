[**esphome-client**](../README.md)

***

[Home](../README.md) / RadioFrequencyModulation

# Type Alias: RadioFrequencyModulation

```ts
type RadioFrequencyModulation = typeof RadioFrequencyModulation[keyof typeof RadioFrequencyModulation];
```

Radio-frequency modulation values accepted on transmit requests and reported (as a bitmask) in `ListEntitiesRadioFrequencyResponse.supported_modulations`. The
`supported_modulations` bitmask uses bit N to indicate that modulation value N is supported by the entity. Mirrors ESPHome's
`esphome/components/radio_frequency/radio_frequency.h::RadioFrequencyModulation` enum.

Only OOK (on-off keying, value 0) is canonically defined in `api.proto`; other ESPHome firmware headers (FSK, GFSK, ASK, ...) may exist but are not yet exported here
because the upstream `api.proto` does not enumerate them. Additional values should be added once they can be verified against an authoritative ESPHome source; the
decoder passes through any modulation number unchanged so forward-compatibility is preserved at runtime.
