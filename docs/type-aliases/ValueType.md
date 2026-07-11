[**esphome-client**](../README.md)

***

[Home](../README.md) / ValueType

# Type Alias: ValueType

```ts
type ValueType = 
  | "bool"
  | "enum"
  | "fixed32"
  | "float"
  | "sint32"
  | "sint32-packed"
  | "string"
  | "varint";
```

Value types that describe how to interpret and encode/decode field data.

## Remarks

The scalar value types collapse a wire-encoded field to a single TypeScript value (number, boolean, or string). The `"sint32-packed"` variant is the lone
outlier - it surfaces a length-delimited body containing back-to-back zigzag-encoded varints as a `number[]` to consumers. Today only the infrared and radio-frequency
schemas use it (for their `timings` arrays), so the projection only needs to support `WireType.LENGTH_DELIMITED`; future packed-repeated additions slot in alongside.
