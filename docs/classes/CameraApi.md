[**esphome-client**](../README.md)

***

[Home](../README.md) / CameraApi

# Class: CameraApi

Camera sub-API. Per-id instance.

## Methods

### readable()

```ts
readable(options?): ReadableStream<Buffer<ArrayBufferLike>>;
```

Web Streams adapter for [stream](#stream).

Usage:

```ts
export function webStreamsInteropExample(client: EspHomeClient): void {

  // Telemetry as a ReadableStream consumable by any Web Streams pipeline (compression, batching, fan-out via tee()).
  const stream: ReadableStream = client.telemetryReadable({ backpressure: "dropOldest", highWaterMark: 256 });

  void stream;

  // Lifecycle, logs, voice-assistant audio, and per-camera images all expose matching readable adapters.
  void client.lifecycleReadable();
  void client.logsReadable(LogLevel.INFO);
  void client.voiceAssistant.audioReadable();
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`ReadableStream`\<`Buffer`\<`ArrayBufferLike`\>\>

A `ReadableStream<Buffer>`.

***

### snapshot()

```ts
snapshot(options?): Promise<Buffer<ArrayBufferLike>>;
```

Capture one image. Sends `CAMERA_IMAGE_REQUEST(single=true)` and resolves with the reassembled image when the device replies.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and custom timeout (default 5000ms). |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

A promise that resolves with the captured image as a Buffer.

#### Remarks

Subscribes to the `camera` bus channel before sending the request so a fast device cannot beat the listener. The default timeout is 5000ms; supply
`options.timeoutMs` to override. The composed signal layers the caller's optional `AbortSignal` over the timeout via [AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).

Usage:

```ts
export async function cameraSnapshotExample(client: EspHomeClient): Promise<Nullable<Buffer>> {

  const camId = entityId("camera", "front_door");
  const cam = client.camera(camId);

  try {

    return await cam.snapshot({ signal: AbortSignal.timeout(8000) });

  } catch(error) {

    if(error instanceof CameraStreamClosedError) {

      // Transport disconnected mid-snapshot. The `code` discriminant is `STREAM_CLOSED`; `cameraId` names the failing camera for log correlation.
      void error.code;
      void error.cameraId;

      return null;
    }

    if((error instanceof DOMException) && ((error.name === "AbortError") || (error.name === "TimeoutError"))) {

      // Timeout elapsed or the caller aborted.
      return null;
    }

    throw error;
  }
}
```

#### Throws

Asynchronously - a `DOMException` with name `TimeoutError` when [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) fires. When the caller's `options.signal` aborts, the promise
rejects with the signal's reason verbatim (typically an `AbortError` DOMException, or the custom reason passed to `AbortController.abort(reason)`).

#### Throws

[CameraStreamClosedError](CameraStreamClosedError.md) with code `STREAM_CLOSED` when the bus stream closes without yielding an image for this camera (typically the
transport disconnected mid-snapshot). The error carries the branded [CameraStreamClosedError.cameraId](CameraStreamClosedError.md#cameraid) so consumers awaiting multiple cameras can
correlate the rejection.

***

### stream()

```ts
stream(options?): AsyncIterable<Buffer<ArrayBufferLike>>;
```

Stream images continuously. Sends `CAMERA_IMAGE_REQUEST(stream=true)` and yields each reassembled image as it arrives. Iteration ends on signal abort or when the
consumer breaks out of the `for await`.

Usage:

```ts
export async function cameraStreamExample(client: EspHomeClient): Promise<void> {

  const camId = entityId("camera", "front_door");
  const cam = client.camera(camId);

  let frameCount = 0;

  for await (const image of cam.stream({ signal: AbortSignal.timeout(30000) })) {

    void image.byteLength;
    frameCount++;

    if(frameCount >= 30) {

      break;
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<`Buffer`\<`ArrayBufferLike`\>\>

An `AsyncIterable<Buffer>`.
