[**esphome-client**](../README.md)

***

[Home](../README.md) / WireType

# Variable: WireType

```ts
const WireType: {
  FIXED32: 5;
  FIXED64: 1;
  LENGTH_DELIMITED: 2;
  VARINT: 0;
};
```

Wire types used in protobuf encoding. These define how data is encoded on the wire in the protocol buffer format.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-fixed32"></a> `FIXED32` | `5` | `5` |
| <a id="property-fixed64"></a> `FIXED64` | `1` | `1` |
| <a id="property-length_delimited"></a> `LENGTH_DELIMITED` | `2` | `2` |
| <a id="property-varint"></a> `VARINT` | `0` | `0` |

## Remarks

`WireType` is an `as const` object paired with a type of the same name: the object carries the named values such as `WireType.VARINT` and `WireType.FIXED32`,
and the type is the union of their numeric literals. We chose this form over an `enum` because it is plain JavaScript once its types are erased, so it compiles under
TypeScript's `erasableSyntaxOnly` mode and runs unchanged through build pipelines that strip types rather than transform them.
