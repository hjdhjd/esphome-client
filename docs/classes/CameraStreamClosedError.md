[**esphome-client**](../README.md)

***

[Home](../README.md) / CameraStreamClosedError

# Class: CameraStreamClosedError

Operational failure: the bus stream backing [CameraApi.snapshot](CameraApi.md#snapshot) closed before any image arrived for the requested camera id.

## Remarks

Standalone subclass of [EspHomeError](EspHomeError.md) rather than a [ConfigurationError](ConfigurationError.md) code: this is not consumer misuse, it is an operational event
(typically the transport disconnected mid-snapshot). Follows the [BackpressureError](BackpressureError.md) precedent for operational standalones. The
[CameraStreamClosedError.cameraId](#cameraid) property carries the branded id of the camera that failed so a consumer awaiting multiple cameras can correlate the
rejection.

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new CameraStreamClosedError(
   message, 
   code, 
   cameraId, 
   options?): CameraStreamClosedError;
```

Creates a new CameraStreamClosedError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable description. |
| `code` | `"STREAM_CLOSED"` | Narrowed code (currently always `STREAM_CLOSED`). |
| `cameraId` | `string` | The branded camera id whose snapshot was awaiting an image. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`CameraStreamClosedError`

#### Overrides

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="cameraid"></a> `cameraId` | `readonly` | `string` | Branded camera id (the `${type}-${objectId}` form) whose snapshot was awaiting an image when the bus stream closed. | - |
| <a id="code"></a> `code` | `readonly` | `"STREAM_CLOSED"` | Narrowed code. Overrides the base class's optional `code` to make it required and discriminated. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
