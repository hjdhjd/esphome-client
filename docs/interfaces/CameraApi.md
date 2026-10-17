[**esphome-client**](../README.md)

***

[Home](../README.md) / CameraApi

# Interface: CameraApi

Camera sub-API. Per-id instance.

## Implements

- `SubscriptionLifecycle`

## Methods

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state. Called by the host on every disconnect and again at the top of every connect attempt. Drops the in-flight image reassembly and
clears the stream subscription's connection-scoped wire cache (the device starts every fresh connection with no stream). The open [stream](#stream) views are
PRESERVED, so the host's [reissueOnReconnect](#reissueonreconnect) call after the new connection is up sends the stream request again for them.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

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

  // Drive the stream into a sink that handles each event as it arrives. The pipeTo promise is deliberately discarded because this example returns
  // synchronously...a consumer that needs to observe the pipeline's completion or failure awaits it instead.
  void stream.pipeTo(new WritableStream({

    write: (event: TelemetryEvent): void => log.debug("Received a state event through the Web Streams pipeline.", event)
  }));

  // Lifecycle, logs, voice-assistant audio, and per-camera images all expose matching readable adapters.
  void client.lifecycleReadable();
  void client.logsReadable(LogLevel.INFO);
  void client.voiceAssistant.audioReadable();
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`ReadableStream`\<`Buffer`\<`ArrayBufferLike`\>\>

A `ReadableStream<Buffer>`.

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Re-establish the device-side stream on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the stream subscription's
`ReissuableSubscription.reissueOnReconnect`, which sends `CAMERA_IMAGE_REQUEST(stream=true)` iff at least one [stream](#stream) view is still open, and is a pure no-op
when none is.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

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
`options.timeoutMs` to override. The wait follows the caller's optional `AbortSignal`, the timeout, and the connection the request was issued on, and rejects
with the reason of whichever ends it first.

Usage:

```ts
export async function cameraSnapshotExample(client: EspHomeClient): Promise<Nullable<Buffer>> {

  const camId = entityId("camera", "front_door");
  const cam = client.camera(camId);

  try {

    return await cam.snapshot({ signal: AbortSignal.timeout(8000) });

  } catch(error) {

    if(error instanceof ConnectionLostError) {

      // The connection dropped mid-snapshot. Every request it carried rejects with the same error, whose `cause` says what ended the connection when known.
      log.error("The connection ended before the snapshot arrived.", camId);

      return null;
    }

    if((error instanceof DOMException) && (error.name === "TimeoutError")) {

      // The snapshot's 5000ms timeout or our own 8000ms deadline elapsed. Each rejects with a TimeoutError, and this example handles them alike.
      return null;
    }

    if(error instanceof NotConnectedError) {

      // No connection could carry the request, so nothing was sent.
      return null;
    }

    throw error;
  }
}
```

#### Throws

(`CONNECT_IN_PROGRESS`) when the call is issued while a manual connect has not yet settled or the automatic reconnect is active, and
(`NOT_CONNECTED`) when it is issued with no connection otherwise. No stream opens and nothing is sent.

#### Throws

when the connection the request was issued on is torn down before an image arrives.

#### Throws

The signal's reason, as it is, when `options.signal` aborts, including when it was already aborted at call time, and the timeout's `TimeoutError` when no
image arrives within `options.timeoutMs`.

#### Throws

Error when the event bus ends the wait before an image arrives, which the client's own connection lifecycle never causes: the bus lives as long as the
client.

***

### stream()

```ts
stream(options?): AsyncIterable<Buffer<ArrayBufferLike>>;
```

Stream images continuously, yielding each reassembled image as it arrives. Iteration ends on signal abort or when the consumer breaks out of the `for await`.

The views open on one camera share a single device-side stream: the first view sends `CAMERA_IMAGE_REQUEST(stream=true)`, and a reconnect sends it again while any
view is open. Each view releases its share once, on whichever ends it first: the signal aborting, the iterator's `return()` or `throw()` (including a `break` out of
`for await`), or the bus ending the stream. The last view to release sends the request with the stream flag cleared. A view abandoned before it is ever iterated
still releases when its signal aborts or its `return()` runs.

Usage:

```ts
export async function cameraStreamExample(client: EspHomeClient): Promise<void> {

  const camId = entityId("camera", "front_door");
  const cam = client.camera(camId);

  let frameCount = 0;

  for await (const image of cam.stream({ signal: AbortSignal.timeout(30000) })) {

    log.debug("Received a camera frame.", image.byteLength);

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
| `options?` | [`StreamOptions`](StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<`Buffer`\<`ArrayBufferLike`\>\>

An `AsyncIterable<Buffer>`.
