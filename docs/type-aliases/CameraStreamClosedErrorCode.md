[**esphome-client**](../README.md)

***

[Home](../README.md) / CameraStreamClosedErrorCode

# Type Alias: CameraStreamClosedErrorCode

```ts
type CameraStreamClosedErrorCode = "STREAM_CLOSED";
```

Discriminated codes for [CameraStreamClosedError](../classes/CameraStreamClosedError.md).

## Remarks

The type is a discriminated union so additional codes can be added without breaking consumer `switch` statements that already pattern-match on the
code. Mirrors the [NoiseHandshakeErrorCode](NoiseHandshakeErrorCode.md) forward-compat shape.

Code table:

- `STREAM_CLOSED` - The bus stream the snapshot awaits closed (typically because the transport disconnected) before any matching `CAMERA_IMAGE_RESPONSE` arrived
  for the requested camera id. Carried by [CameraStreamClosedError](../classes/CameraStreamClosedError.md).
