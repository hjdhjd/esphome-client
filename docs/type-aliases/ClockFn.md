[**esphome-client**](../README.md)

***

[Home](../README.md) / ClockFn

# Type Alias: ClockFn

```ts
type ClockFn = () => number;
```

An injectable clock. The scheduler and the client read every elapsed-time measurement through this function, so deterministic tests can advance time without
`setTimeout`.

## Returns

`number`
