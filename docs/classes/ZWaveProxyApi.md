[**esphome-client**](../README.md)

***

[Home](../README.md) / ZWaveProxyApi

# Class: ZWaveProxyApi

Z-Wave-proxy sub-API. Single instance per client; created lazily on first access via [EspHomeClient.zwave](EspHomeClient.md#zwave).

## Implements

- `SubscriptionLifecycle`

## Accessors

### available

#### Get Signature

```ts
get available(): boolean;
```

Whether the connected device advertises Z-Wave-proxy support. Reads `zwaveProxyFeatureFlags` from the latest [DeviceInfo](../interfaces/DeviceInfo.md); returns `false`
when discovery has not completed or when the device firmware was not compiled with `USE_ZWAVE_PROXY`. Any nonzero feature-flag bitmask reads as `true`; the
individual bit semantics are upstream concerns not surfaced here.

##### Returns

`boolean`

## Methods

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state. Called by the host on `connect()`. Clears the cached home id (a fresh connection re-derives it from the new device-info) and the
frame subscription's connection-scoped wire cache (the device starts every fresh connection with no subscription). The subscriber ledger is PRESERVED: iterators
alive across the reconnect cycle stay live, and the host's [reissueOnReconnect](#reissueonreconnect) call after the new connection is up re-issues SUBSCRIBE for them.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

### frames()

```ts
frames(options?): AsyncIterable<Buffer<ArrayBufferLike>>;
```

Backpressured async-iterable view of inbound Z-Wave Serial API frames from the device's Z-Wave radio. The first iterator issues a wire-side
`ZWaveProxyRequest(SUBSCRIBE)`; the last iterator to detach issues `ZWaveProxyRequest(UNSUBSCRIBE)`. Concurrent iterators share the wire-side subscription (only one
SUBSCRIBE is sent regardless of consumer count). The subscription survives reconnect via [reissueOnReconnect](#reissueonreconnect).

Each yielded `Buffer` is one frame as received from the device's Z-Wave radio Serial API; this library does not validate, parse, or modify the contents. Consumers
route the stream into a Z-Wave-aware library (e.g., `zwave-js`) for protocol-level handling.

Usage:

```ts
export async function zwaveBytePipeExample(client: EspHomeClient): Promise<void> {

  // Capability gate: surface a friendly skip rather than attempting a frame subscription that will yield nothing.
  if(!client.zwave.available) {

    void "this device firmware does not include the Z-Wave proxy component";

    return;
  }

  // The home id is seeded from `DeviceInfo.zwaveHomeId` at discovery and updated when the device pushes a HOME_ID_CHANGE. `null` means no network is currently joined.
  const initialHomeId = client.zwave.homeId();

  void initialHomeId;

  // Stream inbound frames as a backpressured async iterable. The first iterator issues SUBSCRIBE on the wire; the last to detach issues UNSUBSCRIBE. Concurrent iterators
  // share one wire-side subscription. The subscription survives reconnect; iterators alive across the cycle resume yielding once the new connection is up.
  const controller = new AbortController();

  // Observe home-id changes in parallel - the device emits these unsolicited when the radio joins, leaves, or re-keys a network.
  void (async (): Promise<void> => {

    for await (const homeId of client.zwave.homeIdChanges({ signal: controller.signal })) {

      // Route the change into a Z-Wave-aware library, or log it for diagnostics.
      void homeId;
    }
  })();

  let observations = 0;

  for await (const frame of client.zwave.frames({ signal: controller.signal })) {

    // The frame buffer is the raw Z-Wave Serial API frame as received from the radio. Hand it to a Z-Wave-aware library:
    //
    //   import { Driver } from "zwave-js";
    //   const driver = new Driver({ ... });
    //   driver.serialApi.write(frame); // or however the library's bridge surface is wired
    //
    // The library produces outbound frames; route them back via client.zwave.send(buffer).
    void frame;

    observations++;

    if(observations >= 100) {

      controller.abort();

      break;
    }
  }

  // Send a raw Z-Wave Serial API frame outbound. The buffer is passed unchanged - the library does not validate, parse, or modify it. The consumer is responsible for
  // producing well-formed frames; here we synthesize the canonical NAK byte (0x15) for illustration only.
  client.zwave.send(Buffer.from([0x15]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("zwaveFrame", options)`. |

#### Returns

`AsyncIterable`\<`Buffer`\<`ArrayBufferLike`\>\>

An `AsyncIterable<Buffer>` that yields frames until the consumer aborts, the connection drops, or the stream completes.

***

### homeId()

```ts
homeId(): Nullable<number>;
```

The Z-Wave home id reported by the device. On first read after discovery, falls back to [DeviceInfo.zwaveHomeId](../interfaces/DeviceInfo.md#zwavehomeid); subsequent reads return the
cached value updated by the most recent `HOME_ID_CHANGE` push. Returns `null` when no Z-Wave network is joined (home id zero) or when the device does not advertise
Z-Wave proxy support.

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<`number`\>

The numeric home id, or `null` when none is currently joined.

***

### homeIdChanges()

```ts
homeIdChanges(options?): AsyncIterable<number>;
```

Backpressured async-iterable view of home-id change notifications. The device pushes `HOME_ID_CHANGE` unsolicited when the radio joins, leaves, or re-keys a Z-Wave
network. Each yielded `number` is the new home id (or `0` when the network is left).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("zwaveHomeIdChange", options)`. |

#### Returns

`AsyncIterable`\<`number`\>

An `AsyncIterable<number>`.

#### Remarks

Consumers do not need to subscribe separately - the device pushes these as part of the normal proxy lifecycle whenever they occur. The iterator yields
only future pushes; historical state is not replayed. For the most-recent value as a synchronous snapshot, read [homeId](#homeid).

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Re-establish the wire-side subscription on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the frame
subscription's `ReissuableSubscription.reissueOnReconnect`, which re-issues `ZWaveProxyRequest(SUBSCRIBE)` iff at least one
[frames](#frames) subscriber is still alive at the moment of reconnect, and is a pure no-op when none is.

#### Returns

`void`

#### Remarks

Mirrors [BluetoothProxyApi.reissueOnReconnect](BluetoothProxyApi.md#reissueonreconnect) for the advertisement-subscription case - the same shape applied to the single
device-wide Z-Wave frame channel.

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

***

### send()

```ts
send(frame): void;
```

Send a raw Z-Wave Serial API frame to the device's Z-Wave radio. The `frame` buffer is passed unchanged - this library does not validate, parse, or modify it.
Consumers are responsible for producing well-formed Z-Wave Serial API frames; see the module-level documentation for context.

Usage:

```ts
export async function zwaveBytePipeExample(client: EspHomeClient): Promise<void> {

  // Capability gate: surface a friendly skip rather than attempting a frame subscription that will yield nothing.
  if(!client.zwave.available) {

    void "this device firmware does not include the Z-Wave proxy component";

    return;
  }

  // The home id is seeded from `DeviceInfo.zwaveHomeId` at discovery and updated when the device pushes a HOME_ID_CHANGE. `null` means no network is currently joined.
  const initialHomeId = client.zwave.homeId();

  void initialHomeId;

  // Stream inbound frames as a backpressured async iterable. The first iterator issues SUBSCRIBE on the wire; the last to detach issues UNSUBSCRIBE. Concurrent iterators
  // share one wire-side subscription. The subscription survives reconnect; iterators alive across the cycle resume yielding once the new connection is up.
  const controller = new AbortController();

  // Observe home-id changes in parallel - the device emits these unsolicited when the radio joins, leaves, or re-keys a network.
  void (async (): Promise<void> => {

    for await (const homeId of client.zwave.homeIdChanges({ signal: controller.signal })) {

      // Route the change into a Z-Wave-aware library, or log it for diagnostics.
      void homeId;
    }
  })();

  let observations = 0;

  for await (const frame of client.zwave.frames({ signal: controller.signal })) {

    // The frame buffer is the raw Z-Wave Serial API frame as received from the radio. Hand it to a Z-Wave-aware library:
    //
    //   import { Driver } from "zwave-js";
    //   const driver = new Driver({ ... });
    //   driver.serialApi.write(frame); // or however the library's bridge surface is wired
    //
    // The library produces outbound frames; route them back via client.zwave.send(buffer).
    void frame;

    observations++;

    if(observations >= 100) {

      controller.abort();

      break;
    }
  }

  // Send a raw Z-Wave Serial API frame outbound. The buffer is passed unchanged - the library does not validate, parse, or modify it. The consumer is responsible for
  // producing well-formed frames; here we synthesize the canonical NAK byte (0x15) for illustration only.
  client.zwave.send(Buffer.from([0x15]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `frame` | `Buffer` | The raw Z-Wave Serial API frame bytes to transmit. Length-delimited on the wire; arbitrary-content buffers (including null bytes, high bytes, and the Z-Wave SOF byte 0x01) are transmitted verbatim. |

#### Returns

`void`

***

### subscriberCount()

```ts
subscriberCount(): number;
```

Read the current frame-subscriber count. Primarily a test affordance plus a debug aid via the `util.inspect` hook. Reads the subscription's live-subscriber ledger
size, which is unchanged by [clearConnectionState](#clearconnectionstate) (the ledger survives the reconnect cycle).

#### Returns

`number`

The number of active [frames](#frames) iterators currently attached.
