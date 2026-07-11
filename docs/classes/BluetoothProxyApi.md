[**esphome-client**](../README.md)

***

[Home](../README.md) / BluetoothProxyApi

# Class: BluetoothProxyApi

Bluetooth-proxy sub-API. Single instance per client; created lazily on first access via [EspHomeClient.bluetooth](EspHomeClient.md#bluetooth).

## Implements

- `SubscriptionLifecycle`

## Accessors

### available

#### Get Signature

```ts
get available(): boolean;
```

Whether the connected device advertises Bluetooth-proxy support. Reads `bluetoothProxyFeatureFlags` from the latest [DeviceInfo](../interfaces/DeviceInfo.md); returns
`false` when discovery has not completed or when the device firmware was not compiled with `USE_BLUETOOTH_PROXY`. Any nonzero feature-flag bitmask reads as `true`;
the individual bit semantics are upstream concerns not surfaced here.

Usage:

```ts
export function bluetoothAvailabilityExample(client: EspHomeClient): void {

  if(!client.bluetooth.available) {

    // The device does not expose a Bluetooth proxy. Surface a friendly capability gate instead of attempting an advertisement subscription that will yield nothing.
    void "this device firmware does not include the Bluetooth proxy component";

    return;
  }

  void "Bluetooth proxy is available; we can subscribe to advertisements and set the scanner mode";
}
```

##### Returns

`boolean`

## Methods

### advertisements()

```ts
advertisements(options?): AsyncIterable<BluetoothLERawAdvertisement>;
```

Backpressured async-iterable view of inbound BLE advertisements. First iterator issues a wire-side `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` with `flags: 0`;
the last iterator to detach issues `UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST`. Concurrent iterators share the wire-side subscription (only one SUBSCRIBE is
sent regardless of consumer count). The subscription survives reconnect via [reissueOnReconnect](#reissueonreconnect).

Each yielded [BluetoothLERawAdvertisement](../interfaces/BluetoothLERawAdvertisement.md) is a single advertisement. The device batches multiple ads into one wire message
(`BluetoothLERawAdvertisementsResponse.advertisements`); the handler fans them out before they reach the iterator so consumers filter / count / aggregate
per-advertisement, not per-batch.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("bluetoothAdvertisement", options)`. |

#### Returns

`AsyncIterable`\<[`BluetoothLERawAdvertisement`](../interfaces/BluetoothLERawAdvertisement.md)\>

An `AsyncIterable<BluetoothLERawAdvertisement>` that yields ads until the consumer aborts, the connection drops, or the stream completes.

#### Remarks

The wire-side `flags` field is documented as `uint32` in `api.proto` without further specification; we pass `0` which matches the upstream firmware's
default-subscription behavior. If a future ESPHome release documents flag bits, plumbing them through becomes an additive option.

Usage:

```ts
export async function bluetoothAdvertisementsExample(client: EspHomeClient): Promise<void> {

  const targetAddress = 0xaabbccddeeffn;
  const controller = new AbortController();
  let observations = 0;

  for await (const advertisement of client.bluetooth.advertisements({ signal: controller.signal })) {

    if(advertisement.address !== targetAddress) {

      continue;
    }

    observations++;

    void advertisement.rssi;
    void advertisement.data;

    if(observations >= 10) {

      // We've seen enough; the iterator's finally closes the wire-side subscription on the next loop iteration.
      controller.abort();

      break;
    }
  }
}
```

***

### clearCache()

```ts
clearCache(address, options?): Promise<void>;
```

Clear the GATT cache for a peripheral. Sends `BluetoothDeviceRequest(CLEAR_CACHE)` and awaits `BluetoothDeviceClearCacheResponse`. Useful after a peripheral
firmware upgrade changes its GATT layout - clearing the cache forces a fresh service discovery on the next connect.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_CLEAR_CACHE_FAILED"` when the device reports `success=false` or a nonzero `error` field.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_CLEAR_CACHE_IN_FLIGHT"` when another clearCache for the same address is already pending.

***

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state. Called by the host at disconnect and again at connect-top. Rejects every pending GATT Correlator with an `AbortError`
(in-flight request/response state cannot outlive the connection it was issued on), clears the connection-scoped caches and accumulators (scanner-state,
connections-free, connection-state, inflight-services), and clears each subscription's connection-scoped wire cache (the device starts every fresh connection with no
subscription). The consumer
subscriber ledgers are PRESERVED: iterators alive across the reconnect cycle stay live, and the host's [reissueOnReconnect](#reissueonreconnect) call after the new connection is up
re-issues SUBSCRIBE (advertisement, connections-free) and NOTIFY(enable=1) (notify) for the surviving consumers.

Notes for callers:

- In-flight `connect`, `disconnect`, `pair`, `unpair`, `clearCache`, `read`, `write`, `setNotify`, `getServices`, `setConnectionParams` awaits all reject with
  `DOMException("AbortError")` so callers see a uniform abort signal regardless of which Correlator was holding them.
- `connectionStateCache` is cleared so [isConnected](#isconnected) reports `false` for every previously-connected address. Consumers that want to reconnect must
  call [connect](#connect) again; we do NOT auto-reconnect peripherals across a host-level reconnect because the consumer's intent for each address is application-level
  policy, not library-level policy.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

### connect()

```ts
connect(address, options?): Promise<ConnectionStateData>;
```

Connect to a peripheral. Sends `BluetoothDeviceRequest(CONNECT_V3_WITH_CACHE | CONNECT_V3_WITHOUT_CACHE)` and awaits `BluetoothDeviceConnectionResponse` with the
`connected=true` discriminator. The deprecated `CONNECT=0` variant is never used - this client uses the V3 variants unconditionally; the cached/uncached choice is
the caller's via the `useCache` option.

Usage:

```ts
export async function bluetoothConnectExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  // Connect with the GATT cache enabled (the default). Pass `useCache: false` to bypass the cache.
  const state = await client.bluetooth.connect(address, { timeoutMs: 30000 });

  void state.mtu;

  // Synchronous probe: returns true between connect and disconnect, false otherwise.
  if(client.bluetooth.isConnected(address)) {

    // Issue a read against a known handle (acquired from an earlier getServices call in real workflows).
    const value = await client.bluetooth.readCharacteristic(address, 0x002a);

    void value;
  }

  await client.bluetooth.disconnect(address);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address as a bigint. |
| `options?` | \{ `addressType?`: `number`; `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; `useCache?`: `boolean`; \} | Optional `addressType`, `signal`, `timeoutMs`, and `useCache` (default true). |
| `options.addressType?` | `number` | - |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |
| `options.useCache?` | `boolean` | - |

#### Returns

`Promise`\<[`ConnectionStateData`](../interfaces/ConnectionStateData.md)\>

The resolved [ConnectionStateData](../interfaces/ConnectionStateData.md).

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_CONNECT_FAILED"` when the device reports `connected=false` with a nonzero `error` field.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_CONNECT_IN_FLIGHT"` when another connect for the same address is already pending.

***

### connectionsFree()

```ts
connectionsFree(options?): AsyncIterable<ConnectionsFreeData>;
```

Backpressured async-iterable view of connection-slot capacity changes. First iterator issues `SubscribeBluetoothConnectionsFreeRequest`; the iterator yields every
push the device sends thereafter. The wire-side subscription is shared across iterators and survives reconnect via [reissueOnReconnect](#reissueonreconnect).

Usage:

```ts
export async function bluetoothConnectionsFreeExample(client: EspHomeClient): Promise<void> {

  const controller = new AbortController();

  for await (const update of client.bluetooth.connectionsFree({ signal: controller.signal })) {

    void update.free;
    void update.limit;
    void update.allocated;

    if(update.free === 0) {

      // Back off until a slot frees up.
      continue;
    }

    controller.abort();

    break;
  }

  // Synchronous snapshot for callers that want the current state without iterating.
  const snapshot = client.bluetooth.lastConnectionsFree();

  void snapshot;
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`ConnectionsFreeData`](../interfaces/ConnectionsFreeData.md)\>

An `AsyncIterable<ConnectionsFreeData>`.

***

### connectionState()

```ts
connectionState(address): Nullable<ConnectionStateData>;
```

Synchronous accessor for the cached [ConnectionStateData](../interfaces/ConnectionStateData.md) for an address, or `null` if no connection-state push has been observed for that address on the
current connection. For the streaming view, see [connectionStates](#connectionstates).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`ConnectionStateData`](../interfaces/ConnectionStateData.md)\>

The cached state, or `null`.

***

### connectionStates()

```ts
connectionStates(options?): AsyncIterable<ConnectionStateData>;
```

Backpressured async-iterable view of every connection-state transition. The iterator yields one entry per `BluetoothDeviceConnectionResponse` push the device
sends - typically one connected-true at successful connect, one connected-false at clean disconnect, plus extras for unexpected device-side disconnects.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`ConnectionStateData`](../interfaces/ConnectionStateData.md)\>

An `AsyncIterable<ConnectionStateData>`.

***

### disconnect()

```ts
disconnect(address, options?): Promise<void>;
```

Disconnect from a peripheral. Sends `BluetoothDeviceRequest(DISCONNECT)` and awaits `BluetoothDeviceConnectionResponse` with `connected=false`.

Usage:

```ts
export async function bluetoothConnectExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  // Connect with the GATT cache enabled (the default). Pass `useCache: false` to bypass the cache.
  const state = await client.bluetooth.connect(address, { timeoutMs: 30000 });

  void state.mtu;

  // Synchronous probe: returns true between connect and disconnect, false otherwise.
  if(client.bluetooth.isConnected(address)) {

    // Issue a read against a known handle (acquired from an earlier getServices call in real workflows).
    const value = await client.bluetooth.readCharacteristic(address, 0x002a);

    void value;
  }

  await client.bluetooth.disconnect(address);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_DISCONNECT_IN_FLIGHT"` when another disconnect for the same address is already pending.

***

### getServices()

```ts
getServices(address, options?): Promise<BluetoothGATTService[]>;
```

Discover services on a connected peripheral. Sends `BluetoothGATTGetServicesRequest` and accumulates streamed `BluetoothGATTGetServicesResponse` frames until the
matching `BluetoothGATTGetServicesDoneResponse` sentinel arrives.

Usage:

```ts
export async function bluetoothGetServicesExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const services = await client.bluetooth.getServices(address);

  for(const service of services) {

    void service.handle;
    void service.uuid;
    void service.shortUuid;

    for(const characteristic of service.characteristics) {

      void characteristic.handle;
      // The properties bitmask encodes Read (0x02), Write (0x08), Notify (0x10), etc. - bit-test to gate UI affordances.
      void characteristic.properties;

      for(const descriptor of characteristic.descriptors) {

        void descriptor.handle;
      }
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<[`BluetoothGATTService`](../interfaces/BluetoothGATTService.md)[]\>

The full service list as an array, preserving wire-order.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_GET_SERVICES_IN_FLIGHT"` when another getServices for the same address is already pending.

***

### isConnected()

```ts
isConnected(address): boolean;
```

Synchronous probe of the connection state for a given address. Returns `true` only when a `BluetoothDeviceConnectionResponse(connected=true)` has been observed
for the address and no subsequent `connected=false` has overwritten it on the current connection.

Usage:

```ts
export async function bluetoothConnectExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  // Connect with the GATT cache enabled (the default). Pass `useCache: false` to bypass the cache.
  const state = await client.bluetooth.connect(address, { timeoutMs: 30000 });

  void state.mtu;

  // Synchronous probe: returns true between connect and disconnect, false otherwise.
  if(client.bluetooth.isConnected(address)) {

    // Issue a read against a known handle (acquired from an earlier getServices call in real workflows).
    const value = await client.bluetooth.readCharacteristic(address, 0x002a);

    void value;
  }

  await client.bluetooth.disconnect(address);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |

#### Returns

`boolean`

`true` if cached as connected, `false` otherwise.

***

### lastConnectionsFree()

```ts
lastConnectionsFree(): Nullable<ConnectionsFreeData>;
```

Synchronous snapshot of the most recent connections-free push, or `null` when none has arrived on this connection. Pair with [connectionsFree](#connectionsfree) for the live
stream.

Usage:

```ts
export async function bluetoothConnectionsFreeExample(client: EspHomeClient): Promise<void> {

  const controller = new AbortController();

  for await (const update of client.bluetooth.connectionsFree({ signal: controller.signal })) {

    void update.free;
    void update.limit;
    void update.allocated;

    if(update.free === 0) {

      // Back off until a slot frees up.
      continue;
    }

    controller.abort();

    break;
  }

  // Synchronous snapshot for callers that want the current state without iterating.
  const snapshot = client.bluetooth.lastConnectionsFree();

  void snapshot;
}
```

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`ConnectionsFreeData`](../interfaces/ConnectionsFreeData.md)\>

The cached [ConnectionsFreeData](../interfaces/ConnectionsFreeData.md), or `null`.

***

### lastScannerState()

```ts
lastScannerState(): Nullable<BluetoothScannerStateData>;
```

The most recent scanner-state push received from the device on this connection, or `null` if none has arrived yet (or after a [clearConnectionState](#clearconnectionstate)). The full
stream of state pushes is available via [scannerState](#scannerstate); this accessor is the synchronous-snapshot counterpart for consumers that want the current state without
iterating.

Usage:

```ts
export async function bluetoothScannerStateExample(client: EspHomeClient): Promise<void> {

  client.bluetooth.setScannerMode(BluetoothScannerMode.ACTIVE);

  for await (const state of client.bluetooth.scannerState()) {

    if((state.mode === BluetoothScannerMode.ACTIVE) && (state.state === BluetoothScannerState.RUNNING)) {

      void "scanner is now in active mode and running; safe to depend on scan-response data";

      break;
    }
  }

  // Synchronous snapshot of the cached state without iterating; null if no push has been observed on the current connection.
  const snapshot = client.bluetooth.lastScannerState();

  void snapshot;
}
```

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`BluetoothScannerStateData`](../interfaces/BluetoothScannerStateData.md)\>

The cached [BluetoothScannerStateData](../interfaces/BluetoothScannerStateData.md), or `null` when no push has been observed on the current connection.

***

### notify()

```ts
notify(
   address, 
   handle, 
options?): AsyncIterable<NotifyDataChunk>;
```

Iterate notification data for a (address, handle) pair. The iterator filters the global `bluetoothNotifyData` bus event so each consumer only sees notifications
for the handle they care about. Multiple concurrent iterators on the same (address, handle) all receive every push.

Note that [setNotify](#setnotify) and [notify](#notify) are intentionally separate. `setNotify(enable=true)` issues the wire-side enable and awaits its response; `notify()`
is purely a client-side iterator over the resulting bus events. This mirrors how a BLE programmer thinks: "enable notify on this handle, then iterate the stream."
If the consumer iterates without calling setNotify first, the iterator parks - the device is not pushing data. If the consumer calls setNotify(false) while
iterating, the iterator stays open (no new data arrives, but the AsyncIterable's lifetime is the consumer's, not the device's).

Usage:

```ts
export async function bluetoothNotifyExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const handle = 0x002c;

  // Step 1: enable the device-side notifications.
  await client.bluetooth.setNotify(address, handle, true);

  // Step 2: iterate the resulting stream. The iterator filters by (address, handle) so only matching notifications are yielded.
  const controller = new AbortController();
  let chunks = 0;

  for await (const chunk of client.bluetooth.notify(address, handle, { signal: controller.signal })) {

    void chunk.data;

    if(++chunks >= 10) {

      controller.abort();

      break;
    }
  }

  // Step 3: stop the device-side push. Independent of the iterator above; the iterator could have ended without disabling notifications and the device would keep
  // pushing them, but the iterator's bus subscription is gone so the chunks would land on the floor.
  await client.bluetooth.setNotify(address, handle, false);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Characteristic handle (matching what was passed to [setNotify](#setnotify)). |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`NotifyDataChunk`](../interfaces/NotifyDataChunk.md)\>

An `AsyncIterable<NotifyDataChunk>`.

***

### notifySubscriberSnapshot()

```ts
notifySubscriberSnapshot(): Map<string, number>;
```

Test affordance: snapshot the current notify-subscriber map as `Map<makeGattKey(address, handle) -> live-subscriber count>`. Reconstructed from the notify
subscription's live-subscriber ledger via the primitive's `activeKeys` and `count` LEDGER-view reads (see `ReissuableSubscription`).
The result is a fresh `Map` built per call, so the defensive-copy guarantee is intact - test mutation cannot affect internal state. The counts are unchanged by
[clearConnectionState](#clearconnectionstate) (the ledger survives the reconnect cycle).

#### Returns

`Map`\<`string`, `number`\>

A fresh `Map<string, number>` keyed by `(address, handle)` with each key's live-subscriber count.

***

### pair()

```ts
pair(address, options?): Promise<void>;
```

Initiate pairing with a peripheral. Sends `BluetoothDeviceRequest(PAIR)` and awaits `BluetoothDevicePairingResponse`.

Usage:

```ts
export async function bluetoothPairUnpairExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  try {

    await client.bluetooth.pair(address);

  } catch(error) {

    if((error instanceof ConnectionError) && (error.code === "GATT_PAIR_FAILED")) {

      void "pairing rejected by the device or the peripheral";

      return;
    }

    throw error;
  }

  // Later, in a teardown workflow:
  await client.bluetooth.unpair(address);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_PAIR_FAILED"` when the device reports `paired=false` or a nonzero `error` field.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_PAIR_IN_FLIGHT"` when another pair for the same address is already pending.

***

### readCharacteristic()

```ts
readCharacteristic(
   address, 
   handle, 
options?): Promise<Buffer<ArrayBufferLike>>;
```

Read a characteristic value. Sends `BluetoothGATTReadRequest` and awaits the matching `BluetoothGATTReadResponse`. A `BluetoothGATTErrorResponse` for the same
(address, handle) rejects the await with `code="GATT_ERROR"`.

Usage:

```ts
export async function bluetoothReadWriteExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const valueHandle = 0x002a;

  // Read with the default 10s timeout.
  const current = await client.bluetooth.readCharacteristic(address, valueHandle);

  void current;

  // Write a fresh value and await the write acknowledgment.
  await client.bluetooth.writeCharacteristic(address, valueHandle, Buffer.from([ 0x01, 0x02, 0x03 ]), { response: true });

  // Fire-and-forget write (no acknowledgment).
  await client.bluetooth.writeCharacteristic(address, valueHandle, Buffer.from([0x04]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Characteristic value handle (from [getServices](#getservices)). |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

The characteristic value bytes.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_READ_IN_FLIGHT"` when another read for the same (address, handle) is already pending.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_ERROR"` when the device returns an error for the operation.

***

### readDescriptor()

```ts
readDescriptor(
   address, 
   handle, 
options?): Promise<Buffer<ArrayBufferLike>>;
```

Read a descriptor value. Sends `BluetoothGATTReadDescriptorRequest` and awaits the matching `BluetoothGATTReadResponse` (shared with characteristic reads at the
wire level).

Usage:

```ts
export async function bluetoothDescriptorsExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const cccdHandle = 0x002b;

  // Read the current CCCD value.
  const current = await client.bluetooth.readDescriptor(address, cccdHandle);

  void current;

  // Write a new value - here, enable notifications by writing 0x01 0x00 to the CCCD.
  await client.bluetooth.writeDescriptor(address, cccdHandle, Buffer.from([ 0x01, 0x00 ]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Descriptor handle. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

The descriptor value bytes.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_READ_IN_FLIGHT"` when another read for the same (address, handle) is already pending.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_ERROR"` when the device returns an error.

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Re-establish wire-side subscriptions on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to each subscription's
`ReissuableSubscription.reissueOnReconnect`, which replays the surviving consumers' desired state onto the new transport:

- Advertisement: re-issues `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` when at least one [advertisements](#advertisements) iterator is alive (via the subscription's
  on-change hook).
- Connections-free: re-issues `SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST` when at least one [connectionsFree](#connectionsfree) iterator is alive.
- Notify: re-issues `BLUETOOTH_GATT_NOTIFY_REQUEST(enable=1)` for each (address, handle) with a surviving [notify](#notify) iterator (via the subscription's on-reissue
  hook, since acquire / release on the notify ledger are wire-silent).

Each dimension is a pure no-op when no consumer survives - keys with no live subscribers are skipped during reissue, so a subscription whose consumers all left does
not resurrect. Connection state itself is NOT auto-restored. A peripheral is dropped by the device when the proxy disconnects, so attempting to `connect()` for the
user without the user asking is a footgun. Consumers reconnect their peripherals explicitly after the host-level `connect` event fires.

#### Returns

`void`

#### Remarks

[clearConnectionState](#clearconnectionstate) resets only the wire caches as part of disconnect cleanup; the subscriber ledgers survive, so this method finds the surviving
consumers and re-arms their keys. The iterator's `for await` continues running across the cycle and its first `bus.stream` yield resumes naturally once the wire-side
subscription re-issues. Mirrors `LogSubscriptionManager.reissueOnReconnect`.

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

***

### scannerState()

```ts
scannerState(options?): AsyncIterable<BluetoothScannerStateData>;
```

Backpressured async-iterable view of scanner-state changes. The device pushes a new state whenever the scanner transitions (e.g., after [setScannerMode](#setscannermode)).
Does NOT issue any subscribe/unsubscribe at the wire level - scanner-state pushes are unsolicited.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("bluetoothScannerState", options)`. |

#### Returns

`AsyncIterable`\<[`BluetoothScannerStateData`](../interfaces/BluetoothScannerStateData.md)\>

An `AsyncIterable<BluetoothScannerStateData>`.

#### Remarks

The iterator yields only future pushes - historical state is not replayed. Consumers that want the current state synchronously read [lastScannerState](#lastscannerstate); those that want the next transition iterate this stream and break on the first yield.

Usage:

```ts
export async function bluetoothScannerStateExample(client: EspHomeClient): Promise<void> {

  client.bluetooth.setScannerMode(BluetoothScannerMode.ACTIVE);

  for await (const state of client.bluetooth.scannerState()) {

    if((state.mode === BluetoothScannerMode.ACTIVE) && (state.state === BluetoothScannerState.RUNNING)) {

      void "scanner is now in active mode and running; safe to depend on scan-response data";

      break;
    }
  }

  // Synchronous snapshot of the cached state without iterating; null if no push has been observed on the current connection.
  const snapshot = client.bluetooth.lastScannerState();

  void snapshot;
}
```

***

### setConnectionParams()

```ts
setConnectionParams(
   address, 
   params, 
options?): Promise<void>;
```

Set per-link connection parameters on a connected peripheral. Sends `BluetoothSetConnectionParamsRequest` and awaits `BluetoothSetConnectionParamsResponse`.

Usage:

```ts
export async function bluetoothConnectionParamsExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  // 30-50 ms connection interval, no slave latency, 4-second supervision timeout. Reasonable defaults for an interactive workflow.
  await client.bluetooth.setConnectionParams(address, {

    latency: 0,
    maxInterval: 40,
    minInterval: 24,
    timeout: 400
  });
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `params` | [`ConnectionParams`](../interfaces/ConnectionParams.md) | Connection-interval bounds, slave latency, and supervision timeout. See [ConnectionParams](../interfaces/ConnectionParams.md) for units. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_SET_CONNECTION_PARAMS_FAILED"` when the device returns a nonzero `error` field.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_SET_CONNECTION_PARAMS_IN_FLIGHT"` when another setConnectionParams for the same address is already pending.

***

### setNotify()

```ts
setNotify(
   address, 
   handle, 
   enable, 
options?): Promise<void>;
```

Enable or disable device-side notifications for a (address, handle) pair. Sends `BluetoothGATTNotifyRequest` and awaits `BluetoothGATTNotifyResponse`. This sets up
the wire-side subscription; the actual notification data flows on a separate stream consumers iterate via [notify](#notify).

Usage:

```ts
export async function bluetoothNotifyExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const handle = 0x002c;

  // Step 1: enable the device-side notifications.
  await client.bluetooth.setNotify(address, handle, true);

  // Step 2: iterate the resulting stream. The iterator filters by (address, handle) so only matching notifications are yielded.
  const controller = new AbortController();
  let chunks = 0;

  for await (const chunk of client.bluetooth.notify(address, handle, { signal: controller.signal })) {

    void chunk.data;

    if(++chunks >= 10) {

      controller.abort();

      break;
    }
  }

  // Step 3: stop the device-side push. Independent of the iterator above; the iterator could have ended without disabling notifications and the device would keep
  // pushing them, but the iterator's bus subscription is gone so the chunks would land on the floor.
  await client.bluetooth.setNotify(address, handle, false);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Characteristic handle (the value handle, not the CCCD - the device handles CCCD writes internally). |
| `enable` | `boolean` | `true` to enable notifications, `false` to disable. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_NOTIFY_SETUP_IN_FLIGHT"` when another setNotify for the same (address, handle) is already pending.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_ERROR"` when the device returns an error.

***

### setScannerMode()

```ts
setScannerMode(mode): void;
```

Set the BLE scanner mode. Fire-and-forget at the wire level; the device confirms the mode change via the next [scannerState](#scannerstate) push. To synchronously await
the confirmed change, iterate [scannerState](#scannerstate) and break when both `state.mode === mode` and `state.state === BluetoothScannerState.RUNNING`.

Usage:

```ts
export function bluetoothScannerModeExample(client: EspHomeClient): void {

  // Switch to ACTIVE for high-fidelity device discovery, then drop back to PASSIVE for steady-state presence detection.
  client.bluetooth.setScannerMode(BluetoothScannerMode.ACTIVE);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mode` | [`BluetoothScannerMode`](../type-aliases/BluetoothScannerMode.md) | The desired scanner mode. [BluetoothScannerMode.PASSIVE](../variables/BluetoothScannerMode.md#property-passive) listens for broadcasts only; [BluetoothScannerMode.ACTIVE](../variables/BluetoothScannerMode.md#property-active) additionally elicits scan-response data from advertisers. |

#### Returns

`void`

***

### subscriberCount()

```ts
subscriberCount(): number;
```

Read the current advertisement-subscriber count. Primarily a test affordance plus a debug aid via the `util.inspect` hook. Reads the subscription's live-subscriber
ledger size, which is unchanged by [clearConnectionState](#clearconnectionstate) (the ledger survives the reconnect cycle while only the wire cache resets).

#### Returns

`number`

The number of active iterators currently attached.

***

### unpair()

```ts
unpair(address, options?): Promise<void>;
```

Remove pairing with a peripheral. Sends `BluetoothDeviceRequest(UNPAIR)` and awaits `BluetoothDeviceUnpairingResponse`.

Usage:

```ts
export async function bluetoothPairUnpairExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;

  try {

    await client.bluetooth.pair(address);

  } catch(error) {

    if((error instanceof ConnectionError) && (error.code === "GATT_PAIR_FAILED")) {

      void "pairing rejected by the device or the peripheral";

      return;
    }

    throw error;
  }

  // Later, in a teardown workflow:
  await client.bluetooth.unpair(address);
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_UNPAIR_FAILED"` when the device reports `success=false` or a nonzero `error` field.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_UNPAIR_IN_FLIGHT"` when another unpair for the same address is already pending.

***

### writeCharacteristic()

```ts
writeCharacteristic(
   address, 
   handle, 
   data, 
options?): Promise<void>;
```

Write a characteristic value. By default fire-and-forget at the wire level (`response=false`); pass `options.response=true` to await
`BluetoothGATTWriteResponse`.

Usage:

```ts
export async function bluetoothReadWriteExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const valueHandle = 0x002a;

  // Read with the default 10s timeout.
  const current = await client.bluetooth.readCharacteristic(address, valueHandle);

  void current;

  // Write a fresh value and await the write acknowledgment.
  await client.bluetooth.writeCharacteristic(address, valueHandle, Buffer.from([ 0x01, 0x02, 0x03 ]), { response: true });

  // Fire-and-forget write (no acknowledgment).
  await client.bluetooth.writeCharacteristic(address, valueHandle, Buffer.from([0x04]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Characteristic value handle. |
| `data` | `Buffer` | The bytes to write. |
| `options?` | \{ `response?`: `boolean`; `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional `response` (default false), cancellation signal, and timeout. |
| `options.response?` | `boolean` | - |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_WRITE_IN_FLIGHT"` when `response=true` and another write for the same (address, handle) is already pending.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_ERROR"` when `response=true` and the device returns an error.

***

### writeDescriptor()

```ts
writeDescriptor(
   address, 
   handle, 
   data, 
options?): Promise<void>;
```

Write a descriptor value. Sends `BluetoothGATTWriteDescriptorRequest` and awaits the matching `BluetoothGATTWriteResponse` (shared with characteristic writes).

Usage:

```ts
export async function bluetoothDescriptorsExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const cccdHandle = 0x002b;

  // Read the current CCCD value.
  const current = await client.bluetooth.readDescriptor(address, cccdHandle);

  void current;

  // Write a new value - here, enable notifications by writing 0x01 0x00 to the CCCD.
  await client.bluetooth.writeDescriptor(address, cccdHandle, Buffer.from([ 0x01, 0x00 ]));
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `address` | `bigint` | Device BLE address. |
| `handle` | `number` | Descriptor handle. |
| `data` | `Buffer` | The bytes to write. |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional cancellation signal and timeout. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |
| `options.timeoutMs?` | `number` | - |

#### Returns

`Promise`\<`void`\>

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_WRITE_IN_FLIGHT"` when another write for the same (address, handle) is already pending.

#### Throws

[ConnectionError](ConnectionError.md) with code `"GATT_ERROR"` when the device returns an error.
