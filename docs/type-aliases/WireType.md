[**esphome-client**](../README.md)

***

[Home](../README.md) / WireType

# Type Alias: WireType

```ts
type WireType = typeof WireType[keyof typeof WireType];
```

Wire types used in protobuf encoding. These define how data is encoded on the wire in the protocol buffer format.

## Remarks

`WireType` is an `as const` object paired with a type of the same name: the object carries the named values such as `WireType.VARINT` and `WireType.FIXED32`,
and the type is the union of their numeric literals. We chose this form over an `enum` because it is plain JavaScript once its types are erased, so it compiles under
TypeScript's `erasableSyntaxOnly` mode and runs unchanged through build pipelines that strip types rather than transform them.
