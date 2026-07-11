[**esphome-client**](../README.md)

***

[Home](../README.md) / SerialProxyApi

# Class: SerialProxyApi

Serial-proxy sub-API. Single instance per client; created lazily on first access via [EspHomeClient.serial](EspHomeClient.md#serial).

## Implements

- `SubscriptionLifecycle`

## Methods

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state. Called by the host on `connect()`. Rejects every pending [flush](#flush) and [getModemPins](#getmodempins) await with an `AbortError`
(in-flight request/response state cannot outlive the connection it was issued on) and clears the data subscription's connection-scoped wire cache (the device starts
every fresh connection with no subscription). The subscriber ledger is PRESERVED: iterators alive across the reconnect cycle stay live, and the host's
[reissueOnReconnect](#reissueonreconnect) call after the new connection is up re-issues SUBSCRIBE for each instance with surviving subscribers.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

### configure()

```ts
configure(instance, options): void;
```

Configure UART parameters for an instance. Sends `SerialProxyConfigureRequest`; fire-and-forget at the wire level.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `options` | [`SerialProxyConfigureOptions`](../interfaces/SerialProxyConfigureOptions.md) | UART parameters. See [SerialProxyConfigureOptions](../interfaces/SerialProxyConfigureOptions.md). |

#### Returns

`void`

#### Remarks

Validates `dataSize` in 5..8 and `stopBits` in 1..2 before the wire send. Out-of-range values throw [ConnectionError](ConnectionError.md) with code
`INVALID_SERIAL_CONFIG` synchronously - the wire accepts arbitrary values but the device rejects silently, so the client-side guard is the only way the caller
sees the misconfiguration.

Usage:

```ts
export function serialConfigureExample(client: EspHomeClient): void {

  client.serial.configure(0, {

    baudrate: 115200,
    dataSize: 8,
    flowControl: false,
    parity: SerialProxyParity.NONE,
    stopBits: 1
  });
}
```

#### Throws

ConnectionError with code `INVALID_SERIAL_CONFIG` when `dataSize` or `stopBits` is out of range.

***

### data()

```ts
data(instance, options?): AsyncIterable<SerialDataChunk>;
```

Backpressured async-iterable view of inbound data from a specific instance. Mirrors `LogSubscriptionManager.subscribe` -
refcounted-subscription pattern keyed by instance.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("serialData", options)`. |

#### Returns

`AsyncIterable`\<[`SerialDataChunk`](../interfaces/SerialDataChunk.md)\>

An `AsyncIterable<SerialDataChunk>` that yields chunks until the consumer aborts, the connection drops, or the stream completes.

#### Remarks

The first iterator on an instance issues a wire-side `SerialProxyRequest(SUBSCRIBE)`; the last iterator to detach issues `SerialProxyRequest(UNSUBSCRIBE)`.
Concurrent iterators on the same instance share the wire-side subscription (only one SUBSCRIBE is sent regardless of consumer count). The subscription survives
reconnect via [reissueOnReconnect](#reissueonreconnect).

Per-instance filtering happens in the wrapper generator: the `serialData` bus emits chunks for every instance, and the generator yields only those whose `instance`
matches the iterator's argument. Two iterators on different instances do not see each other's chunks.

Usage:

```ts
export async function serialDataStreamExample(client: EspHomeClient): Promise<void> {

  const controller = new AbortController();
  let totalBytes = 0;

  for await (const chunk of client.serial.data(0, { signal: controller.signal })) {

    totalBytes += chunk.data.byteLength;

    if(totalBytes >= 4096) {

      // We've seen enough; let the iterator's finally close the wire-side subscription.
      controller.abort();

      break;
    }
  }
}
```

***

### flush()

```ts
flush(instance, options?): Promise<SerialProxyFlushResult>;
```

Flush the TX buffer for an instance. Sends `SerialProxyRequest(FLUSH)` and awaits the matching `SerialProxyRequestResponse`, correlated by the `instance` index.
Blocks until the device confirms drain (status `OK` / `ASSUMED_SUCCESS`) or fails out (`ERROR` / `TIMEOUT` / `NOT_SUPPORTED`).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `options?` | [`SerialProxyAwaitOptions`](../interfaces/SerialProxyAwaitOptions.md) | Optional cancellation signal and custom timeout (default 5000ms). |

#### Returns

`Promise`\<[`SerialProxyFlushResult`](../interfaces/SerialProxyFlushResult.md)\>

A promise that resolves with the [SerialProxyFlushResult](../interfaces/SerialProxyFlushResult.md). Consumers switch on `status` to discriminate success from failure.

#### Remarks

Concurrent calls for the same instance throw [ConnectionError](ConnectionError.md) with code `FLUSH_IN_FLIGHT`. The composed signal layers the caller's optional
`AbortSignal` over the timeout via `AbortSignal.any`; the default timeout is 5000ms.

Usage:

```ts
export async function serialFlushExample(client: EspHomeClient): Promise<void> {

  const result = await client.serial.flush(0, { timeoutMs: 10000 });

  switch(result.status) {

    case SerialProxyStatus.OK:
    case SerialProxyStatus.ASSUMED_SUCCESS: {

      // The device confirms the TX buffer drained successfully. Safe to issue the next write.
      void "drained";

      break;
    }

    case SerialProxyStatus.ERROR: {

      void result.errorMessage;

      break;
    }

    case SerialProxyStatus.TIMEOUT: {

      void "device-side drain timed out; retry or back off";

      break;
    }

    case SerialProxyStatus.NOT_SUPPORTED: {

      void "this device cannot drain its TX buffer on demand; treat writes as best-effort";

      break;
    }
  }
}
```

#### Throws

ConnectionError with code `FLUSH_IN_FLIGHT` when another await for the same instance is still pending.

#### Throws

DOMException with name `AbortError` on either timeout or caller-signal abort. `Correlator.await` manufactures the timeout error itself; it
does not propagate [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)'s native `TimeoutError`.

***

### getModemPins()

```ts
getModemPins(instance, options?): Promise<number>;
```

Read the current RTS / DTR modem-control line states for an instance. Sends `SerialProxyGetModemPinsRequest` and awaits the matching response, correlated by the
`instance` index.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `options?` | [`SerialProxyAwaitOptions`](../interfaces/SerialProxyAwaitOptions.md) | Optional cancellation signal and custom timeout (default 5000ms). |

#### Returns

`Promise`\<`number`\>

A promise that resolves with the line-states bitmask. Decode against [SerialProxyLineStateFlags](../type-aliases/SerialProxyLineStateFlags.md).

#### Remarks

Concurrent calls for the same instance throw [ConnectionError](ConnectionError.md) with code `MODEM_PINS_IN_FLIGHT`. The composed signal layers the caller's optional
`AbortSignal` over the timeout via `AbortSignal.any`; the default timeout is 5000ms.

Usage:

```ts
export async function serialModemPinsExample(client: EspHomeClient): Promise<void> {

  // Pulse DTR low to reset a connected modem: raise both lines, read back, then drop DTR.
  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR);

  const lineStates = await client.serial.getModemPins(0, { timeoutMs: 1000 });
  const dtrAsserted = (lineStates & SerialProxyLineStateFlags.DTR) !== 0;

  void dtrAsserted;

  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS);
}
```

#### Throws

ConnectionError with code `MODEM_PINS_IN_FLIGHT` when another await for the same instance is still pending.

#### Throws

DOMException with name `AbortError` on either timeout or caller-signal abort. `Correlator.await` manufactures the timeout error itself; it
does not propagate [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)'s native `TimeoutError`.

***

### list()

```ts
list(): readonly SerialProxyInfo[];
```

Read the device-info `serial_proxies` advertisement. Returns an empty array when discovery has not completed or when the device firmware was not compiled with
`USE_SERIAL_PROXY`. The returned view is `readonly`; callers cannot mutate the cached record.

Usage:

```ts
export function serialListExample(client: EspHomeClient): void {

  for(const proxy of client.serial.list()) {

    void proxy.name;

    switch(proxy.portType) {

      case SerialProxyPortType.TTL: {

        void "ttl-only port; no modem-control pins to fuss with";

        break;
      }

      case SerialProxyPortType.RS232: {

        void "rs232 - RTS / DTR available via setModemPins / getModemPins";

        break;
      }

      case SerialProxyPortType.RS485: {

        void "rs485 - half-duplex; manage the transceiver enable line as needed";

        break;
      }
    }
  }
}
```

#### Returns

readonly [`SerialProxyInfo`](../interfaces/SerialProxyInfo.md)[]

The list of [SerialProxyInfo](../interfaces/SerialProxyInfo.md) entries, in declaration order.

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Re-establish device-side subscriptions on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the data subscription's
`ReissuableSubscription.reissueOnReconnect`, which re-issues a `SerialProxyRequest(SUBSCRIBE)` for every instance with surviving
subscribers so the new device starts streaming `SerialProxyDataReceived` again, and is a pure no-op when no instance has live subscribers. Mirrors
`LogSubscriptionManager.reissueOnReconnect`.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

***

### setModemPins()

```ts
setModemPins(instance, lineStates): void;
```

Set the RTS / DTR modem-control line states for an instance. Sends `SerialProxySetModemPinsRequest`; fire-and-forget at the wire level.

Usage:

```ts
export async function serialModemPinsExample(client: EspHomeClient): Promise<void> {

  // Pulse DTR low to reset a connected modem: raise both lines, read back, then drop DTR.
  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR);

  const lineStates = await client.serial.getModemPins(0, { timeoutMs: 1000 });
  const dtrAsserted = (lineStates & SerialProxyLineStateFlags.DTR) !== 0;

  void dtrAsserted;

  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `lineStates` | `number` | Bitmask of [SerialProxyLineStateFlags](../type-aliases/SerialProxyLineStateFlags.md). Compose flags via bitwise OR (e.g., `RTS | DTR`). |

#### Returns

`void`

***

### subscriberCount()

```ts
subscriberCount(instance): number;
```

Read the count of currently-active subscribers for an instance. Primarily a test and introspection affordance; the `util.inspect` hook surfaces
subscriber instances via `activeKeys()` rather than calling this accessor for per-instance counts.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |

#### Returns

`number`

The number of active iterators currently attached to that instance. Zero when the instance has no live subscribers.

#### Remarks

Delegates to the data subscription's `ReissuableSubscription.count`, a LEDGER-view read: it returns the true number of live
[data](#data) iterators grouped under `instance`, derived from the subscriber ledger, so it survives [clearConnectionState](#clearconnectionstate) (the ledger is preserved across the
reconnect cycle while only the wire cache resets). It is not the cached wire-state - a survivor still counts after a reconnect even before [reissueOnReconnect](#reissueonreconnect)
re-arms the device.

***

### write()

```ts
write(instance, data): void;
```

Write raw bytes to an instance. Sends `SerialProxyWriteRequest`; fire-and-forget at the wire level.

Usage:

```ts
export function serialWriteExample(client: EspHomeClient): void {

  // Example: send a NEMA-0183-style sentence to a connected GPS.
  client.serial.write(0, Buffer.from("$PMTK220,1000*1F\r\n", "ascii"));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `instance` | `number` | Zero-based instance index. |
| `data` | `Buffer` | Raw bytes to send. Length-delimited on the wire; arbitrary-content buffers (including null bytes, high bytes, and UTF-8-invalid sequences) are transmitted verbatim. |

#### Returns

`void`
