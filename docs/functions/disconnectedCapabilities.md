[**esphome-client**](../README.md)

***

[Home](../README.md) / disconnectedCapabilities

# Function: disconnectedCapabilities()

```ts
function disconnectedCapabilities(): ClientCapabilities;
```

Returns the "disconnected" capability record. Used as the initial value in [EspHomeClient.capabilities](../classes/EspHomeClient.md#capabilities) before the first successful
connect, and as the result during a connect-failure window where `deviceInfo` is null.

## Returns

[`ClientCapabilities`](../interfaces/ClientCapabilities.md)

A capability record where every flag is false and `api` is `{ major: 0, minor: 0 }`.
