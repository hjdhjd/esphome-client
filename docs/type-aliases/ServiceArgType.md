[**esphome-client**](../README.md)

***

[Home](../README.md) / ServiceArgType

# Type Alias: ServiceArgType

```ts
type ServiceArgType = typeof ServiceArgType[keyof typeof ServiceArgType];
```

Service argument types supported by ESPHome user-defined services. Carved here so the discovery module can decode service entities without depending on the host.
