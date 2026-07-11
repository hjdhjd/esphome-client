[**esphome-client**](../README.md)

***

[Home](../README.md) / Nullable

# Type Alias: Nullable\<T\>

```ts
type Nullable<T> = T | null;
```

Utility type that allows a value to be either the given type or `null`.

This type is used to explicitly indicate that a variable, property, or return value may be either a specific type or `null`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The type to make nullable. |

## Example

```ts
let id: Nullable<string> = null;

// Later...
id = "device-001";
```
