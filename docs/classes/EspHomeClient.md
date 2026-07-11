[**esphome-client**](../README.md)

***

[Home](../README.md) / EspHomeClient

# Class: EspHomeClient\<Extras\>

The ESPHome native-API client. The single high-level entry point for ESP8266/ESP32 devices running ESPHome firmware.

The host class composes - never inherits - the carved subsystems that own the client surface end-to-end: a `Transport` for the wire (framing, cipher install,
socket lifetime); a run-phase `MessageReceiver` for the inbound dispatch pump; an `EventBus` for typed event delivery; a typed [EspHomeError](EspHomeError.md)
hierarchy for failures; the schema-derived encode/decode pipeline for entity payloads; an `EntityRegistry` and a
`ServiceRegistry` as the single sources of truth for entity and service identity; a `LogSubscriptionManager` for
refcounted device-log subscriptions; a [HomeAssistantApi](HomeAssistantApi.md) for the
ESPHome `homeassistant.*` action / state-import surface; the run-phase handler table built by `buildRunPhaseHandlers`; the command
runners exported from `command-runner.ts` for [EspHomeClient.command](#command) and [EspHomeClient.commandAndAwait](#commandandawait); a `HeartbeatScheduler` for keepalive
and stall detection; a `LatestStateCache` for synchronous latest-state reads; and a [ClientCapabilities](../interfaces/ClientCapabilities.md) record built from the negotiated session.

The client is event-driven via composition - it does **not** extend `EventEmitter`. Subscribe with [EspHomeClient.on](#on) (returns `Disposable`),
[EspHomeClient.once](#once) (returns `Promise<payload>`), or [EspHomeClient.stream](#stream) (returns `AsyncIterable<payload>` with backpressure). Subscriptions survive
reconnects: a handle issued before `connect()` keeps firing across disconnect/reconnect cycles unless the consumer disposes or aborts.

## Construction

Two construction paths:

- **[openEspHomeClient](../functions/openEspHomeClient.md)** (preferred) - async factory with bounded retry on transient errors and an `AbortSignal`-aware open. Resolves with a connected client.
- **`new EspHomeClient(options)`** then `await client.connect()` - explicit two-step construction when the consumer needs to attach subscriptions before connect.

## Connection lifecycle

`connect()` runs the linear handshake: TCP connect, `HelloRequest`/`HelloResponse`, optional Noise NNpsk0 handshake (with plaintext fallback when the peer closes
mid-noise or returns a plaintext frame), `ConnectRequest`/`ConnectResponse`, `DeviceInfoRequest`, `ListEntitiesRequest`, `SubscribeStatesRequest`. Failures surface
as typed errors from [EspHomeError](EspHomeError.md) subclasses. Auto-reconnect is on by default with `PermanentError`-filtered retry; pass `reconnect: false` to opt out. Lazy
heartbeat (30s idle / 60s stall) is on by default; pass `keepAlive: false` to opt out. Live state is observable via [EspHomeClient.health](#health),
[EspHomeClient.onHealthChange](#onhealthchange), [EspHomeClient.healthStream](#healthstream), and the typed [EspHomeClient.lifecycle](#lifecycle) stream.

## Entity model

Entities are identified by branded [EntityId](../type-aliases/EntityId.md)<T> values shaped `${type}-${objectId}`. Mint with [entityId](../functions/entityId.md), narrow untrusted input with
[parseEntityId](../functions/parseEntityId.md) or [isEntityId](../functions/isEntityId.md). Send commands with [EspHomeClient.command](#command)<T>(id, options) or
[EspHomeClient.commandAndAwait](#commandandawait)<T>(id, options, awaitOptions); read latest cached state with [EspHomeClient.latest](#latest)<T>; enumerate snapshots with
[EspHomeClient.snapshot](#snapshot) / [EspHomeClient.snapshotFor](#snapshotfor). Multi-device parents enumerate sub-devices via [EspHomeClient.subDevices](#subdevices) and filter the
entity list with [EspHomeClient.entitiesByDevice](#entitiesbydevice).

## Sub-APIs

- **[EspHomeClient.voiceAssistant](#voiceassistant)** - lazy single-instance voice-assistant API ([VoiceAssistantApi](VoiceAssistantApi.md)).
- **[EspHomeClient.camera](#camera)**(id) - per-id camera API ([CameraApi](CameraApi.md)) with image buffering owned by the sub-API.

The Home-Assistant integration surface lives under [EspHomeClient.homeAssistant](#homeassistant) as a sub-API matching the pattern used by camera, voice-assistant,
bluetooth, serial, and zwave. The sub-API owns the outbound subscribe-and-respond surface (`subscribeServices`, `subscribeStates`, `sendState`,
`respondToAction`) and the memoized inbound-dispatcher context the run-phase dispatcher consumes for HA-bridge frames.

## Disposal

Both `Symbol.dispose` and `Symbol.asyncDispose` are implemented. `using client = await openEspHomeClient(...)` binds sync disposal (immediate teardown);
`await using client = await openEspHomeClient(...)` binds async disposal (graceful path - sends `DISCONNECT_REQUEST` and awaits the response within the configured
timeout, then falls through to immediate teardown).

Usage examples are kept exclusively in `src/examples/showcase.ts` so this docstring stays a single source of truth on **what the class is** and the showcase file
stays the single source of truth on **how to use it**. Regions in the showcase are type-checked against the live public API, so renames or signature changes break
the build before they ship.

Usage:

```ts
export async function connectThenConstructExample(
  client: EspHomeClient,
  predicate: (entity: Entity) => boolean,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<ReadonlyMap<EntityId, TelemetryEvent>> {

  const { signal, timeoutMs = 5000 } = options;

  // Resolve the expected set once via the entityId() SSOT. Manual `type + "-" + objectId` concatenation would bypass the lowercasing the brand-mint applies, drifting
  // the example's keys from the cache's actual key format. Entities discovered mid-session via late-discovery are NOT in this set; the caller decides whether to
  // restart the wait on the `entities` event or accept the snapshot at gate-resolution time as "constructed".
  const expected = new Set<EntityId>(client.entitiesByDevice(0).filter(predicate).map((entity) => entityId(entity.type, entity.objectId)));

  // Compose caller signal over the internal timeout - mirrors the convention used by camera, serial-proxy, voice-assistant, and the run-phase handshake.
  const composedSignal = signal ? AbortSignal.any([ signal, AbortSignal.timeout(timeoutMs) ]) : AbortSignal.timeout(timeoutMs);

  const matchesExpected = (snapshot: ReadonlyMap<EntityId, TelemetryEvent>): boolean => expected.values().every((id) => snapshot.has(id));

  // Already-complete fast path. An empty expected set (vacuously true) and a re-call after reconnect both resolve synchronously without attaching a listener.
  if(matchesExpected(client.snapshot())) {

    return client.snapshot();
  }

  const { promise, resolve, reject } = Promise.withResolvers<ReadonlyMap<EntityId, TelemetryEvent>>();
  const sub = client.on("telemetry", () => {

    if(matchesExpected(client.snapshot())) {

      resolve(client.snapshot());
    }
  });

  // AbortSignal.reason is `unknown` because callers can pass any value to controller.abort(reason); the cast preserves the original cause through to the rejection
  // rather than wrapping it in a synthetic Error that would hide the abort reason.
  composedSignal.addEventListener("abort", () => reject(composedSignal.reason as Error), { once: true });

  return promise.finally((): void => sub[Symbol.dispose]());
}
```

## See

 - [openEspHomeClient](../functions/openEspHomeClient.md)
 - [entityId](../functions/entityId.md)
 - [VoiceAssistantApi](VoiceAssistantApi.md)
 - [CameraApi](CameraApi.md)
 - [ConnectionHealth](../type-aliases/ConnectionHealth.md)
 - [LifecycleEvent](../type-aliases/LifecycleEvent.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Extras` *extends* [`ExtraSchemaSet`](../type-aliases/ExtraSchemaSet.md) | \{ \} |

## Constructors

### Constructor

```ts
new EspHomeClient<Extras>(options): EspHomeClient<Extras>;
```

Construct a client without connecting. Prefer [openEspHomeClient](../functions/openEspHomeClient.md), the async factory that constructs, connects with bounded retry, and resolves with a
ready-to-use instance; reach for `new EspHomeClient(options)` only when the consumer must attach subscriptions before the first `connect()` so events fired during
the handshake are not missed.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EspHomeClientOptions`](../interfaces/EspHomeClientOptions.md)\<`Extras`\> | Configuration options. See [EspHomeClientOptions](../interfaces/EspHomeClientOptions.md) for the full surface. |

#### Returns

`EspHomeClient`\<`Extras`\>

#### Remarks

Every option is optional except `host`. When `psk` is supplied the client attempts the Noise NNpsk0 handshake first and falls back to plaintext ONLY when
the device demonstrably does not speak encryption - it responded in plaintext or closed the socket during the noise exchange. A bad encryption key (a rejected PSK or
a malformed/low-order peer key) fails closed with a permanent [EncryptionKeyInvalidError](EncryptionKeyInvalidError.md) rather than silently downgrading to plaintext. The full
options surface (transport injection, metrics sink, keep-alive, reconnect, frame/buffer/field caps, handshake and connect timeouts) is documented on
[EspHomeClientOptions](../interfaces/EspHomeClientOptions.md); consult that type rather than this docstring for a complete listing.

Usage:

```ts
export async function manualConstructionExample(): Promise<EspHomeClient> {

  const client = new EspHomeClient({

    clientId: "my-esphome-app",
    host: "garage.local",
    psk: process.env["ESPHOME_PSK"] ?? null
  });

  // Subscriptions installed before connect() fire on the discovery handshake too.
  using deviceSub = client.on("deviceInfo", (info) => {

    void info.name;
  });

  await client.connect({ signal: AbortSignal.timeout(15000) });

  void deviceSub;

  return client;
}
```

## Accessors

### bluetooth

#### Get Signature

```ts
get bluetooth(): BluetoothProxyApi;
```

Bluetooth-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).

##### Remarks

Owns the global advertisement-subscription refcount and the cached scanner-state push. Re-issues the device-side advertisement subscription on every
successful reconnect so iterators alive across the cycle see a continuous stream. The module owns both the scanning surface and the `Correlator`-driven GATT
request/response operations (connect, pair, unpair, service discovery, characteristic and descriptor read/write, notify).

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

[`BluetoothProxyApi`](BluetoothProxyApi.md)

The Bluetooth-proxy sub-API instance.

***

### homeAssistant

#### Get Signature

```ts
get homeAssistant(): HomeAssistantApi;
```

Home Assistant integration sub-API. Exposes the outbound subscribe-and-respond surface for the two HA-bridge feeds:

  - `subscribeServices()` - subscribe to inbound `homeassistant.action` / `homeassistant.service` calls from the device. Receives `homeassistantService` events.
  - `subscribeStates()` - subscribe to inbound state-import requests. Receives `homeassistantStateRequest` events.
  - `sendState(entityId, state, attribute?)` - respond with a Home Assistant entity's current state. Pair with `subscribeStates()`.
  - `respondToAction(callId, options)` - acknowledge an inbound action with a `callId` and `wantsResponse: true`. Firmware enabling
    `USE_API_HOMEASSISTANT_ACTION_RESPONSES` surfaces these fields on the `homeassistantService` event.

All four methods are connection-scoped on the wire; ESPHome has no unsubscribe message, so subscriptions live until the connection drops. Re-call subscribe
after each reconnect (typically from a `lifecycle`-stream `connect` handler) when the consumer wants the subscription to span the new session.

Usage:

```ts
export function homeAssistantServicesExample(client: EspHomeClient): void {

  client.homeAssistant.subscribeServices();

  using sub = client.on("homeassistantService", (event) => {

    void event.service;
    void event.data;
    void event.dataTemplate;
    void event.variables;
    void event.isEvent;
  });

  void sub;
}
```

##### Returns

[`HomeAssistantApi`](HomeAssistantApi.md)

The [HomeAssistantApi](HomeAssistantApi.md) instance bound to this client.

***

### isEncrypted

#### Get Signature

```ts
get isEncrypted(): boolean;
```

Whether the active transport is operating in noise-data phase. Mirrors `Transport.isEncrypted`.

##### Returns

`boolean`

`true` when an encrypted session is established, `false` otherwise (including when disconnected).

***

### serial

#### Get Signature

```ts
get serial(): SerialProxyApi;
```

Serial-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).

##### Remarks

Composes two `Correlator` instances (flush + getModemPins, keyed by instance) with a refcounted per-instance subscriber map for the data-stream
iterators. Re-issues the device-side subscriptions on every successful reconnect so consumer-held iterators see a continuous stream across the disconnect.

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

##### Returns

[`SerialProxyApi`](SerialProxyApi.md)

The serial-proxy sub-API instance.

***

### services

#### Get Signature

```ts
get services(): UserServicesApi;
```

User-defined services sub-API. Exposes the discovered service catalog and the two execution paths:

  - `list()` - enumerate the user-defined services discovered on the current connection (shallow copy in discovery order).
  - `execute(key, args?)` - execute a service by its numeric key (the lower-level entry point when the key is cached).
  - `executeByName(name, args?)` - look the service up by name in the discovery registry and dispatch.

Devices that opt into `USE_API_USER_DEFINED_ACTION_RESPONSES` emit an `EXECUTE_SERVICE_RESPONSE` correlated via `callId`; consumers receive these via the
client's `serviceCallResult` event. Older firmware treats `execute()` as fire-and-forget and never produces the response message.

Usage:

```ts
export function serviceExecutionExample(client: EspHomeClient): void {

  // Enumerate the discovered services.
  for(const service of client.services.list()) {

    void service.key;
    void service.name;
    void service.args;
  }

  // Argument shape mirrors the service definition - one of bool, int, float, string, or their array equivalents per slot.
  const args: ExecuteServiceArgumentValue[] = [

    { stringValue: "front_door" },
    { intValue: 30 },
    { boolArray: [ true, false, true ] }
  ];

  // Two execution rails - the by-name rail looks up the key from the registry first.
  client.services.execute(12345, args);
  client.services.executeByName("notify_user", args);
}
```

##### Returns

[`UserServicesApi`](UserServicesApi.md)

The [UserServicesApi](UserServicesApi.md) instance bound to this client. The instance is lazy-built on first access and cached for the client's lifetime.

***

### voiceAssistant

#### Get Signature

```ts
get voiceAssistant(): VoiceAssistantApi;
```

Voice-assistant sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).

Usage:

```ts
export async function voiceAssistantExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  for await (const audio of va.audio({ signal: AbortSignal.timeout(30000) })) {

    void audio.data;
    void audio.end;
  }

  await va.announce({ text: "Doorbell rang" }, { timeoutMs: 5000 });
}
```

##### Returns

[`VoiceAssistantApi`](VoiceAssistantApi.md)

The voice-assistant sub-API instance.

***

### zwave

#### Get Signature

```ts
get zwave(): ZWaveProxyApi;
```

Z-Wave-proxy sub-API. Lazy-instantiated on first access. Single instance per client, persistent across reconnects (consumer-held references stay valid).

##### Remarks

This sub-API is a transparent byte pipe to the device's Z-Wave radio Serial API. It does NOT parse Z-Wave Serial API frames, command classes, or security
envelopes. Consumers route the inbound frame stream into a Z-Wave-aware library (e.g., `zwave-js`) and write back via [ZWaveProxyApi.send](ZWaveProxyApi.md#send). The
module shape mirrors [bluetooth](#bluetooth) simplified for the single-subscription case: a single-integer refcount, a cached home id, and no `Correlator` instances
(there is no request/response correlation in this subsystem - frames flow asynchronously in both directions and home-id changes are unsolicited pushes).

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

##### Returns

[`ZWaveProxyApi`](ZWaveProxyApi.md)

The Z-Wave-proxy sub-API instance.

## Methods

### \[asyncDispose\]()

```ts
asyncDispose: Promise<void>;
```

Symbol.asyncDispose hook for `await using` scopes. Performs the graceful disconnect handshake - sends DISCONNECT_REQUEST and awaits the matching response up to
[EspHomeClientOptions.gracefulDisconnectTimeoutMs](../interfaces/EspHomeClientOptions.md#gracefuldisconnecttimeoutms), then tears down. Suitable for daemon-style consumers that want a clean shutdown.

Usage:

```ts
export async function disconnectAndCleanupExample(client: EspHomeClient): Promise<void> {

  // Sync teardown: the device sees a TCP close. Suitable for crash paths and short-lived scripts where graceful is unnecessary.
  client.disconnect();

  // Async teardown: the graceful path. Returns when the response arrives or the timeout falls through; never blocks indefinitely.
  await client.disconnectAsync();

  // The Symbol.dispose hook is wired to disconnect(); the Symbol.asyncDispose hook is wired to disconnectAsync(). Use them via `using` / `await using`.
  client[Symbol.dispose]();
  await client[Symbol.asyncDispose]();
}
```

#### Returns

`Promise`\<`void`\>

***

### \[dispose\]()

```ts
dispose: void;
```

`Symbol.dispose` hook for `using` scopes. Aliased to [EspHomeClient.disconnect](#disconnect) - tears down synchronously, the device sees a TCP close, no
`DISCONNECT_REQUEST` is sent. Suitable for crash paths and short-lived scripts.

Usage:

```ts
export async function disconnectAndCleanupExample(client: EspHomeClient): Promise<void> {

  // Sync teardown: the device sees a TCP close. Suitable for crash paths and short-lived scripts where graceful is unnecessary.
  client.disconnect();

  // Async teardown: the graceful path. Returns when the response arrives or the timeout falls through; never blocks indefinitely.
  await client.disconnectAsync();

  // The Symbol.dispose hook is wired to disconnect(); the Symbol.asyncDispose hook is wired to disconnectAsync(). Use them via `using` / `await using`.
  client[Symbol.dispose]();
  await client[Symbol.asyncDispose]();
}
```

#### Returns

`void`

***

### camera()

```ts
camera(id): CameraApi;
```

Camera sub-API. Returns a per-id instance cached for the lifetime of the client; repeated calls with the same id return the same object, so a single
`const cam = client.camera(id)` stays coherent across call sites.

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

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`"camera"`\> | Branded camera id. |

#### Returns

[`CameraApi`](CameraApi.md)

The camera sub-API instance.

***

### capabilities()

```ts
capabilities(): ClientCapabilities;
```

Read the structured capability record for the current connection. Built from the negotiated API minor version, the encrypted-transport flag, and the device's
[DeviceInfo](../interfaces/DeviceInfo.md) response. Returns the disconnected placeholder before the first successful connect.

#### Returns

[`ClientCapabilities`](../interfaces/ClientCapabilities.md)

A point-in-time copy of the structured capability record.

#### Remarks

Consumers should gate behavior on named capabilities rather than version numbers or raw bitfields. Adding a new capability is one entry in the type
definition plus one parser case; the consumer-visible API stays stable as the underlying flag layout evolves. Returns a deep boundary copy (deepening the
[deviceInfo](#deviceinfo) shallow-copy idiom because the capability record nests one level) so a consumer mutating the snapshot cannot corrupt the host's cached record -
which [isEncrypted](#isencrypted) reads internally.

Usage:

```ts
export function capabilitiesExample(client: EspHomeClient): void {

  const caps = client.capabilities();

  if(caps.voiceAssistant.supported && caps.voiceAssistant.apiAudio) {

    // Voice-assistant API audio routing is supported.
  }

  if(caps.bluetoothProxy.rawAdvertisements) {

    // Raw BLE advertisements are surfaced.
  }
}
```

***

### command()

```ts
command<T>(id, options): void;
```

Generic, type-safe command entry point. The single canonical way to issue any entity command.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `string` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`T`\> | The branded entity id. Use the [entityId](../functions/entityId.md) mint or [parseEntityId](../functions/parseEntityId.md) / [isEntityId](../functions/isEntityId.md) predicates to obtain one from an untrusted string. |
| `options` | [`CommandFor`](../type-aliases/CommandFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\> | Type-narrowed command options for the entity type. |

#### Returns

`void`

#### Remarks

`T` is inferred from the branded id, which narrows `options` automatically: `command(lightId, { state: true, brightness: 0.5 })` typechecks; passing
`position` for a light is a compile error. The runtime adapter table (`COMMAND_ADAPTERS` from `./schemas/adapters.ts`) handles wire-vs-API divergences (light's
`rgb: { r, g, b }` flattening, siren's duration rounding) before the schema-driven encoder runs.

Fire-and-forget at the consumer level: encode failures and unknown ids are warned via the configured logger and dropped rather than thrown, so the call site
stays linear. To await a matching state event, use [EspHomeClient.commandAndAwait](#commandandawait).

Usage:

```ts
export async function commandAndAwaitExample(client: EspHomeClient): Promise<void> {

  const lampId = entityId("light", "office_lamp");

  const result = await client.commandAndAwait(lampId, { brightness: 0.6, state: true });

  void result.brightness;
}
```

***

### commandAndAwait()

```ts
commandAndAwait<T>(
   id, 
   options, 
awaitOptions?): Promise<StateEventFor<SchemaForExtended<T, Extras>>>;
```

Send a command and resolve with the next matching state event for the same entity. Useful for "set the light, await confirmation" patterns where the caller
wants the post-command state in one await rather than wiring up a separate subscription.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | Entity type discriminant carried by the branded id. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`T`\> | Branded entity id. |
| `options` | [`CommandFor`](../type-aliases/CommandFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\> | Type-narrowed command options for the entity type. |
| `awaitOptions?` | `CommandAndAwaitOptions`\<`T` & \| `"number"` \| `"alarm_control_panel"` \| `"climate"` \| `"cover"` \| `"date"` \| `"datetime"` \| `"event"` \| `"fan"` \| `"light"` \| `"lock"` \| `"media_player"` \| `"select"` \| `"siren"` \| `"switch"` \| `"text"` \| `"time"` \| `"update"` \| `"valve"` \| `"water_heater"`\> | Optional cancellation signal, custom timeout, and predicate that further narrows the matching state event. |

#### Returns

`Promise`\<[`StateEventFor`](../type-aliases/StateEventFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\>\>

The first state event for the entity that matches the predicate.

#### Remarks

Type-level constraint excludes entity types with no state response - `button` (stateless), `sensor`, `binary_sensor`, and `text_sensor` (read-only),
`camera` (multi-packet image events lack the numeric key the predicate-match loop compares against), and `infrared` / `radio_frequency` (transmit is
fire-and-forget; the receive event is an unsolicited inbound signal, not a command acknowledgement). Calling `commandAndAwait` against any of those is a compile
error, not a runtime hang.

The stream subscription opens *before* the command is sent, so the device cannot win the race by responding before we listen. The default 2000ms timeout and the
caller's optional signal are composed via `AbortSignal.any`; either trigger rejects the await and tears down the subscription.

Usage:

```ts
export async function commandAndAwaitExample(client: EspHomeClient): Promise<void> {

  const lampId = entityId("light", "office_lamp");

  const result = await client.commandAndAwait(lampId, { brightness: 0.6, state: true });

  void result.brightness;
}
```

#### Throws

(`MALFORMED_ENTITY_ID`) when the supplied id is not a valid `${type}-${objectId}` brand.

#### Throws

(`UNKNOWN_ENTITY_ID`) when the id parses but the entity has not been discovered on the current connection.

#### Throws

(`AWAIT_STREAM_CLOSED`) when the underlying telemetry stream ends before a matching state event arrives - typically because the
connection dropped while the await was pending.

#### Throws

(`AbortError` / `TimeoutError`) when the caller's signal aborts or the default 2000ms deadline elapses.

***

### connect()

```ts
connect(options?): Promise<void>;
```

Connect to the ESPHome device and start communication. If an encryption key was provided, this attempts an encrypted connection first and falls back to plaintext if
the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.

Usage:

```ts
export async function manualConstructionExample(): Promise<EspHomeClient> {

  const client = new EspHomeClient({

    clientId: "my-esphome-app",
    host: "garage.local",
    psk: process.env["ESPHOME_PSK"] ?? null
  });

  // Subscriptions installed before connect() fire on the discovery handshake too.
  using deviceSub = client.on("deviceInfo", (info) => {

    void info.name;
  });

  await client.connect({ signal: AbortSignal.timeout(15000) });

  void deviceSub;

  return client;
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); \} | Optional configuration. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional AbortSignal to cancel the connect attempt. Aborting tears down any in-progress handshake and rejects the returned promise. |

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connection is established and ready, or rejects with a typed [EspHomeError](EspHomeError.md) subclass.

***

### deviceInfo()

```ts
deviceInfo(): Nullable<DeviceInfo>;
```

Return the device information of the connected ESPHome device if available. Returns a shallow copy so external code cannot mutate the cached record.

Usage:

```ts
export function deviceInfoExample(client: EspHomeClient): void {

  const info = client.deviceInfo();

  if(info) {

    void info.name;
    void info.esphomeVersion;
    void info.macAddress;
    void info.apiEncryptionSupported;
  }
}
```

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`DeviceInfo`](../interfaces/DeviceInfo.md)\>

The device information if available, or `null` if not yet received.

***

### disconnect()

```ts
disconnect(): void;
```

Synchronous disconnect: tear down the transport immediately so the device observes a TCP close. Cancels any in-flight reconnect loop and marks the client as
explicitly closed so auto-reconnect does not pick the connection up again. Idempotent. Use [EspHomeClient.disconnectAsync](#disconnectasync) when a graceful
`DISCONNECT_REQUEST`/`DISCONNECT_RESPONSE` handshake is preferable.

Usage:

```ts
export async function disconnectAndCleanupExample(client: EspHomeClient): Promise<void> {

  // Sync teardown: the device sees a TCP close. Suitable for crash paths and short-lived scripts where graceful is unnecessary.
  client.disconnect();

  // Async teardown: the graceful path. Returns when the response arrives or the timeout falls through; never blocks indefinitely.
  await client.disconnectAsync();

  // The Symbol.dispose hook is wired to disconnect(); the Symbol.asyncDispose hook is wired to disconnectAsync(). Use them via `using` / `await using`.
  client[Symbol.dispose]();
  await client[Symbol.asyncDispose]();
}
```

#### Returns

`void`

***

### disconnectAsync()

```ts
disconnectAsync(): Promise<void>;
```

Graceful asynchronous disconnect. Sends DISCONNECT_REQUEST and awaits DISCONNECT_RESPONSE up to [EspHomeClientOptions.gracefulDisconnectTimeoutMs](../interfaces/EspHomeClientOptions.md#gracefuldisconnecttimeoutms) (default
1000ms), then tears down the transport. On timeout, falls through to immediate teardown - the consumer is never blocked indefinitely. Marks the client explicitly
closed and cancels any in-flight reconnect loop (mirroring [EspHomeClient.disconnect](#disconnect)), so a graceful disconnect stays disconnected rather than
auto-reconnecting.

Usage:

```ts
export async function disconnectAndCleanupExample(client: EspHomeClient): Promise<void> {

  // Sync teardown: the device sees a TCP close. Suitable for crash paths and short-lived scripts where graceful is unnecessary.
  client.disconnect();

  // Async teardown: the graceful path. Returns when the response arrives or the timeout falls through; never blocks indefinitely.
  await client.disconnectAsync();

  // The Symbol.dispose hook is wired to disconnect(); the Symbol.asyncDispose hook is wired to disconnectAsync(). Use them via `using` / `await using`.
  client[Symbol.dispose]();
  await client[Symbol.asyncDispose]();
}
```

#### Returns

`Promise`\<`void`\>

A promise that resolves when teardown completes (either after the response handshake or after the timeout falls through).

***

### entitiesByDevice()

```ts
entitiesByDevice(deviceId): Entity[];
```

Filter the discovered entity list by parent device. Pass a positive sub-device id to scope to that sub-device, `0` to scope to the parent ESP, or `undefined`
to return every entity regardless of device.

Usage:

```ts
export function subDeviceEnumerationExample(client: EspHomeClient): void {

  for(const subDevice of client.subDevices()) {

    void subDevice.id;
    void subDevice.name;
    void subDevice.areaId;

    // Entities scoped to this sub-device. Single-device configurations report subDevices() as an empty array, so the loop body never runs.
    const entities = client.entitiesByDevice(subDevice.id);

    void entities.length;
  }

  // The parent ESP itself is device id 0 when sub-devices exist.
  const parentEntities = client.entitiesByDevice(0);

  void parentEntities.length;
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `deviceId` | `number` \| `undefined` | The device id to filter on, or `undefined` to return every entity. |

#### Returns

[`Entity`](../type-aliases/Entity.md)[]

A new array of matching entities. The original entity records are not copied; consumers should treat them as read-only.

***

### getAvailableEntityIds()

```ts
getAvailableEntityIds(): Record<string, string[]>;
```

Snapshot every discovered entity id, grouped by entity type. Convenient for "what can I control on this device?" UIs that don't need the per-entity metadata.

Usage:

```ts
export async function discoveryWalkthroughExample(client: EspHomeClient): Promise<void> {

  // Wait for the next discovery batch. After connect() resolves, the `entities` event has typically already fired; on subsequent reconnects, the event re-fires.
  const entities = await client.once("entities", { signal: AbortSignal.timeout(10000) });

  void entities.length;

  // Group-by-type snapshot keyed by entity type, useful for menu construction.
  const grouped = client.getAvailableEntityIds();

  for(const lightIdString of grouped["light"] ?? []) {

    const id = lightIdString as EntityId<"light">;
    const entity = client.getEntityById(id);

    if(entity?.type === "light") {

      void entity.effects;
    }
  }
}
```

#### Returns

`Record`\<`string`, `string`[]\>

A plain record keyed by entity type, each value an array of branded id strings in discovery order.

***

### getEntitiesWithIds()

```ts
getEntitiesWithIds(): Entity & {
  id: string;
}[];
```

Snapshot every discovered entity record with its branded id stamped in as the `id` field. Useful when a consumer needs both the typed metadata and the routable
id together (for example to populate a UI list keyed by id).

Usage:

```ts
export async function discoveryWalkthroughExample(client: EspHomeClient): Promise<void> {

  // Wait for the next discovery batch. After connect() resolves, the `entities` event has typically already fired; on subsequent reconnects, the event re-fires.
  const entities = await client.once("entities", { signal: AbortSignal.timeout(10000) });

  void entities.length;

  // Group-by-type snapshot keyed by entity type, useful for menu construction.
  const grouped = client.getAvailableEntityIds();

  for(const lightIdString of grouped["light"] ?? []) {

    const id = lightIdString as EntityId<"light">;
    const entity = client.getEntityById(id);

    if(entity?.type === "light") {

      void entity.effects;
    }
  }
}
```

#### Returns

[`Entity`](../type-aliases/Entity.md) & \{
  `id`: `string`;
\}[]

A new array of entity records with `id` derived from the registry's reverse index. Mutating the array does not affect the registry.

***

### getEntityById()

```ts
getEntityById(id): Nullable<Entity>;
```

Get entity information by ID. This retrieves full entity details given its branded id. Use [entityId](../functions/entityId.md) to mint the brand or
[parseEntityId](../functions/parseEntityId.md) to narrow an untrusted string before calling.

Usage:

```ts
export async function discoveryWalkthroughExample(client: EspHomeClient): Promise<void> {

  // Wait for the next discovery batch. After connect() resolves, the `entities` event has typically already fired; on subsequent reconnects, the event re-fires.
  const entities = await client.once("entities", { signal: AbortSignal.timeout(10000) });

  void entities.length;

  // Group-by-type snapshot keyed by entity type, useful for menu construction.
  const grouped = client.getAvailableEntityIds();

  for(const lightIdString of grouped["light"] ?? []) {

    const id = lightIdString as EntityId<"light">;
    const entity = client.getEntityById(id);

    if(entity?.type === "light") {

      void entity.effects;
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md) | The branded entity id to look up. |

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`Entity`](../type-aliases/Entity.md)\>

The entity information or `null` if not found.

***

### getEntityKey()

```ts
getEntityKey(id): Nullable<number>;
```

Get entity key by ID. This looks up the numeric key for an entity given its branded id. Use [entityId](../functions/entityId.md) to mint the brand or
[parseEntityId](../functions/parseEntityId.md) to narrow an untrusted string before calling.

Usage:

```ts
export function entityKeyResolutionExample(client: EspHomeClient, lightId: EntityId<"light">): void {

  const key = client.getEntityKey(lightId);

  if(key !== null) {

    void key;
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md) | The branded entity id to look up. |

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<`number`\>

The entity key or `null` if not found.

***

### hasEntity()

```ts
hasEntity(id): boolean;
```

Check if an entity ID exists. This is the one entity-lookup method that explicitly accepts both branded ids and plain strings - the question "is this a known
id at all" is the boundary where untrusted input is allowed.

Usage:

```ts
export function entityIdNarrowingExample(client: EspHomeClient, untrusted: string): void {

  // Path 1: "I expect a light id". The predicate narrows the string to EntityId<"light">.
  if(isEntityId(untrusted, "light") && client.hasEntity(untrusted)) {

    client.command(untrusted, { state: true });

    return;
  }

  // Path 2: "I don't know which type". Parse first, then dispatch on the discriminant. The id field is EntityId<EntityType> at this stage; switch on `type` to narrow
  // to a specific id brand if the next call site needs it.
  const parsed = parseEntityId(untrusted);

  if(parsed && client.hasEntity(parsed.id)) {

    switch(parsed.type) {

      case "light":

        client.command(parsed.id as EntityId<"light">, { state: true });

        break;

      case "switch":

        client.command(parsed.id as EntityId<"switch">, { state: true });

        break;
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` \| [`EntityId`](../type-aliases/EntityId.md) | The entity id to check, branded or plain. |

#### Returns

`boolean`

`true` if the entity exists, `false` otherwise.

***

### health()

```ts
health(): ConnectionHealth;
```

Synchronous read of the live [ConnectionHealth](../type-aliases/ConnectionHealth.md) record. Uptime is not stored on the record; derive it from the returned snapshot via [connectionUptimeMs](../functions/connectionUptimeMs.md), which reads `connectedAtMs` while the socket is up and `0` while it is down.

Usage:

```ts
export async function lifecycleAndHealthExample(client: EspHomeClient): Promise<void> {

  const health = client.health();

  if(health.state === "connected") {

    // Iterate lifecycle events; each entry is a discriminated union narrowable on .kind.
    for await (const event of client.lifecycle({ signal: AbortSignal.timeout(60000) })) {

      switch(event.kind) {

        case "connect":

          void event.encrypted;

          break;

        case "disconnect":

          void event.cause;

          break;
      }
    }
  }
}
```

#### Returns

[`ConnectionHealth`](../type-aliases/ConnectionHealth.md)

The current health record.

***

### healthStream()

```ts
healthStream(options?): AsyncIterable<ConnectionHealth>;
```

Async-iterable view of health-state transitions.

Usage:

```ts
export async function healthStreamExample(client: EspHomeClient): Promise<void> {

  // Callback rail: the Disposable removes the listener on `using` scope exit.
  using sub = client.onHealthChange((health) => {

    if(health.state === "stalled") {

      void health.consecutiveStalls;
    }
  });

  void sub;

  // Stream rail: same data, async-iterable shape for `for await` consumption.
  for await (const health of client.healthStream({ signal: AbortSignal.timeout(30000) })) {

    void health.lastPingRttMs;

    // Uptime is derived from the snapshot via the free helper, which reads `connectedAtMs` while the socket is up (connected or stalled) and returns 0 while it is down.
    void connectionUptimeMs(health);
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`ConnectionHealth`](../type-aliases/ConnectionHealth.md)\>

An `AsyncIterable<ConnectionHealth>`.

***

### latest()

```ts
latest<T>(id): Nullable<StateEventFor<SchemaForExtended<T, Extras>>>;
```

Read the most recent state event for an entity, narrowed to the entity's type.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | Entity type discriminant carried by the branded id. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`T`\> | Branded entity id. |

#### Returns

[`Nullable`](../type-aliases/Nullable.md)\<[`StateEventFor`](../type-aliases/StateEventFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\>\>

The state event, or `null` when no state has been recorded since the most recent [EspHomeClient.connect](#connect).

#### Remarks

Cache contract: the latest-state cache is updated **before** listeners are notified. A `client.latest(id)` read from inside an `on("telemetry")` or
per-type listener sees the event that fired the listener. The same invariant holds for the [snapshot](#snapshot) and [snapshotFor](#snapshotfor) views.

Usage:

```ts
export function latestStateLookupExample(client: EspHomeClient, lightId: EntityId<"light">): void {

  const latest = client.latest(lightId);

  if(latest?.state === true) {

    // The entity's last-known on/off state. brightness, colorTemperature, rgb fields are typed against the schema.
    void latest.brightness;
    void latest.effect;
  }
}
```

***

### lifecycle()

```ts
lifecycle(options?): AsyncIterable<LifecycleEvent>;
```

Async-iterable view of connect/disconnect transitions. Each event is the typed [LifecycleEvent](../type-aliases/LifecycleEvent.md) discriminated union; consumers gate on
`event.kind === "connect" | "disconnect"` and pattern-match the disconnect cause against the typed error hierarchy.

Usage:

```ts
export async function lifecycleAndHealthExample(client: EspHomeClient): Promise<void> {

  const health = client.health();

  if(health.state === "connected") {

    // Iterate lifecycle events; each entry is a discriminated union narrowable on .kind.
    for await (const event of client.lifecycle({ signal: AbortSignal.timeout(60000) })) {

      switch(event.kind) {

        case "connect":

          void event.encrypted;

          break;

        case "disconnect":

          void event.cause;

          break;
      }
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`LifecycleEvent`](../type-aliases/LifecycleEvent.md)\>

An `AsyncIterable<LifecycleEvent>`.

***

### lifecycleReadable()

```ts
lifecycleReadable(options?): ReadableStream<LifecycleEvent>;
```

Web Streams adapter for [lifecycle](#lifecycle).

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

`ReadableStream`\<[`LifecycleEvent`](../type-aliases/LifecycleEvent.md)\>

A `ReadableStream<LifecycleEvent>`.

***

### logAllEntityIds()

```ts
logAllEntityIds(): void;
```

Emit a structured debug-level log of every registered entity, grouped by type, with names and numeric keys. Diagnostic helper - not for consumer-facing UI.

#### Returns

`void`

***

### logs()

```ts
logs(level, options?): AsyncIterable<LogEventData>;
```

Refcounted async-iterable view of device log messages at the requested level. The first iterator opened sends `SUBSCRIBE_LOGS_REQUEST(level)` on the wire;
opening a second iterator at a higher verbosity upgrades the device-side subscription. ESPHome has no unsubscribe path, so the subscription persists at the
highest level any iterator has requested for the lifetime of the connection (downgrades on the last close are a best-effort re-subscribe at the new maximum).

Usage:

```ts
export async function logSubscriptionExample(client: EspHomeClient): Promise<void> {

  for await (const log of client.logs(LogLevel.DEBUG, { signal: AbortSignal.timeout(60000) })) {

    if(log.level <= LogLevel.WARN) {

      void log.message;
    }
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | [`LogLevel`](../type-aliases/LogLevel.md) | The minimum log level to subscribe to. |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`LogEventData`](../interfaces/LogEventData.md)\>

An `AsyncIterable<LogEventData>`.

***

### logsReadable()

```ts
logsReadable(level, options?): ReadableStream<LogEventData>;
```

Web Streams adapter for [logs](#logs). Subscription refcounting and level-upgrade semantics are inherited from the underlying AsyncIterable.

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
| `level` | [`LogLevel`](../type-aliases/LogLevel.md) | The minimum log level to subscribe to. |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`ReadableStream`\<[`LogEventData`](../interfaces/LogEventData.md)\>

A `ReadableStream<LogEventData>`.

***

### on()

```ts
on<K>(event, handler): Disposable;
```

Subscribe a callback to an event. Returns a `Disposable` whose `[Symbol.dispose]` removes the listener; per the explicit-resource-management proposal,
`using sub = client.on("telemetry", cb)` automatically removes the listener on scope exit.

Usage:

```ts
export async function typedEventBusExample(client: EspHomeClient): Promise<void> {

  // Disposable callback. The `using` keyword removes the listener on scope exit.
  using sub = client.on("deviceInfo", (info) => { void info.name; });

  // One-shot Promise. Resolves on the next emission; rejects on caller signal abort.
  const services = await client.once("services", { signal: AbortSignal.timeout(5000) });

  // AsyncIterable stream with backpressure policy. Each call produces an independent subscription.
  for await (const event of client.stream("entities", { signal: AbortSignal.timeout(60000) })) {

    void event.length;
  }

  void sub;
  void services;
}
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ClientEventsMap`](../interfaces/ClientEventsMap.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event name. Narrowed to keys of [ClientEventsMap](../interfaces/ClientEventsMap.md). |
| `handler` | (`payload`) => `void` | The callback. The payload parameter type is inferred from the event name. |

#### Returns

`Disposable`

A `Disposable` that removes the listener.

***

### once()

```ts
once<K>(event, options?): Promise<ClientEventsMap[K]>;
```

Resolve on the next emission of `event`. Returns a `Promise`-shaped one-shot; the optional signal argument cancels the await, and rejection propagates through
the returned promise.

Usage:

```ts
export async function typedEventBusExample(client: EspHomeClient): Promise<void> {

  // Disposable callback. The `using` keyword removes the listener on scope exit.
  using sub = client.on("deviceInfo", (info) => { void info.name; });

  // One-shot Promise. Resolves on the next emission; rejects on caller signal abort.
  const services = await client.once("services", { signal: AbortSignal.timeout(5000) });

  // AsyncIterable stream with backpressure policy. Each call produces an independent subscription.
  for await (const event of client.stream("entities", { signal: AbortSignal.timeout(60000) })) {

    void event.length;
  }

  void sub;
  void services;
}
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ClientEventsMap`](../interfaces/ClientEventsMap.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event name. Narrowed to keys of [ClientEventsMap](../interfaces/ClientEventsMap.md). |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); \} | Optional cancellation signal. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | - |

#### Returns

`Promise`\<[`ClientEventsMap`](../interfaces/ClientEventsMap.md)\[`K`\]\>

A `Promise` that resolves with the next payload.

***

### onHealthChange()

```ts
onHealthChange(handler): Disposable;
```

Subscribe a callback to health-state transitions. Returns a `Disposable` that removes the listener on dispose.

Usage:

```ts
export async function healthStreamExample(client: EspHomeClient): Promise<void> {

  // Callback rail: the Disposable removes the listener on `using` scope exit.
  using sub = client.onHealthChange((health) => {

    if(health.state === "stalled") {

      void health.consecutiveStalls;
    }
  });

  void sub;

  // Stream rail: same data, async-iterable shape for `for await` consumption.
  for await (const health of client.healthStream({ signal: AbortSignal.timeout(30000) })) {

    void health.lastPingRttMs;

    // Uptime is derived from the snapshot via the free helper, which reads `connectedAtMs` while the socket is up (connected or stalled) and returns 0 while it is down.
    void connectionUptimeMs(health);
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `handler` | (`health`) => `void` | The callback. Receives the current health record on every transition. |

#### Returns

`Disposable`

A `Disposable` that removes the listener.

***

### sendPing()

```ts
sendPing(): void;
```

Send a `PING_REQUEST` frame on demand. The keep-alive supervisor drives heartbeat automatically when `keepAlive` is enabled; this method is for consumers that
want to force an immediate liveness probe (e.g., after a long idle period before issuing a critical command).

#### Returns

`void`

***

### setNoiseEncryptionKey()

```ts
setNoiseEncryptionKey(key, options?): Promise<boolean>;
```

Set a new Noise encryption key on the device. This allows changing the encryption key used for future connections.

**Concurrency:** this method is NOT safe to call concurrently. The protocol carries no correlation ID for the key-set request, so the response can only be matched
to a single in-flight call. A second invocation while the first is still pending rejects rather than silently leaving the first promise hanging.

Usage:

```ts
export async function connectionWithNoiseExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "secure.local",
    psk: process.env["ESPHOME_PSK"] ?? null,
    serverName: "secure"
  });

  // Rotate the device-side PSK without bouncing the connection. The matching response carries a success flag; the device will require the new PSK on the next
  // reconnect, so the consumer is responsible for updating any persisted configuration.
  const rotated = await client.setNoiseEncryptionKey(process.env["ESPHOME_NEW_PSK"] ?? "", { signal: AbortSignal.timeout(10000) });

  void rotated;
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The new encryption key (base64 encoded, must decode to exactly 32 bytes). |
| `options?` | \{ `signal?`: [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal); `timeoutMs?`: `number`; \} | Optional configuration. |
| `options.signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional AbortSignal to cancel the request. Aborting settles the returned promise to `false` immediately rather than waiting for the timeout. |
| `options.timeoutMs?` | `number` | Optional bound on the request/response round-trip; defaults to 5000 ms. On elapse the promise settles to `false`. |

#### Returns

`Promise`\<`boolean`\>

A promise that resolves to true if the key was successfully set, false otherwise (timeout, abort, or device-reported failure). The returned promise rejects
when another invocation is already pending - see the `@throws` clause below for details.

#### Throws

(`KEY_SET_IN_FLIGHT`) when another `setNoiseEncryptionKey` call is already pending - the protocol carries no correlation id and cannot
multiplex concurrent requests.

***

### snapshot()

```ts
snapshot(): ReadonlyMap<EntityId, TelemetryEvent>;
```

Read-only snapshot of the entire latest-state cache. One [TelemetryEvent](../type-aliases/TelemetryEvent.md) per entity, keyed by branded id. Useful for "rehydrate UI from current state on
(re)connect" patterns.

#### Returns

[`ReadonlyMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<[`EntityId`](../type-aliases/EntityId.md), [`TelemetryEvent`](../type-aliases/TelemetryEvent.md)\>

A read-only view of every entity's most recent state.

#### Remarks

Cache contract: the returned map is a live view, and the cache is updated **before** listeners are notified. A `client.snapshot()` iteration inside an
`on("telemetry")` or per-type listener already includes the event that fired the listener. The map reflects only the state events received so far - it is a live view
of the cache, not a guaranteed-complete point-in-time snapshot, because ESPHome's `SubscribeStates` stream has no "initial states complete" marker.

Usage:

```ts
export function snapshotExample(client: EspHomeClient): void {

  // Full snapshot: every entity that has emitted at least one state event since the most recent connect.
  const all = client.snapshot();

  void all.size;

  // Type-narrowed snapshot: only light entities, returned as a fresh `Map<EntityId<"light">, StateEventFor<typeof ENTITY_SCHEMAS["light"]>>`.
  const lights = client.snapshotFor("light");

  void lights.size;
}
```

***

### snapshotFor()

```ts
snapshotFor<T>(type): ReadonlyMap<EntityId<T>, StateEventFor<SchemaForExtended<T, Extras>>>;
```

Read-only snapshot of the latest-state cache, narrowed to one entity type.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | Entity type discriminant. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The entity type to filter on. |

#### Returns

[`ReadonlyMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)\<[`EntityId`](../type-aliases/EntityId.md)\<`T`\>, [`StateEventFor`](../type-aliases/StateEventFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\>\>

A read-only map of entity ids to their state events, narrowed to entries of type `T`.

#### Remarks

Cache contract: same as [snapshot](#snapshot) - the cache is updated **before** listeners are notified, so an `on("telemetry")` or per-type listener that
calls `snapshotFor(type)` sees the event that fired the listener.

Usage:

```ts
export function snapshotExample(client: EspHomeClient): void {

  // Full snapshot: every entity that has emitted at least one state event since the most recent connect.
  const all = client.snapshot();

  void all.size;

  // Type-narrowed snapshot: only light entities, returned as a fresh `Map<EntityId<"light">, StateEventFor<typeof ENTITY_SCHEMAS["light"]>>`.
  const lights = client.snapshotFor("light");

  void lights.size;
}
```

***

### stream()

```ts
stream<K>(event, options?): AsyncIterable<ClientEventsMap[K]>;
```

Async-iterable view of every emission of `event` for the lifetime of the iteration. Applies the backpressure policy from [StreamOptions](../interfaces/StreamOptions.md). Each call
produces an independent subscription; multiple concurrent iterators of the same event each receive every emission.

Usage:

```ts
export async function typedEventBusExample(client: EspHomeClient): Promise<void> {

  // Disposable callback. The `using` keyword removes the listener on scope exit.
  using sub = client.on("deviceInfo", (info) => { void info.name; });

  // One-shot Promise. Resolves on the next emission; rejects on caller signal abort.
  const services = await client.once("services", { signal: AbortSignal.timeout(5000) });

  // AsyncIterable stream with backpressure policy. Each call produces an independent subscription.
  for await (const event of client.stream("entities", { signal: AbortSignal.timeout(60000) })) {

    void event.length;
  }

  void sub;
  void services;
}
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ClientEventsMap`](../interfaces/ClientEventsMap.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The event name. Narrowed to keys of [ClientEventsMap](../interfaces/ClientEventsMap.md). |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`ClientEventsMap`](../interfaces/ClientEventsMap.md)\[`K`\]\>

An `AsyncIterable<ClientEventsMap[event]>`.

***

### subDevices()

```ts
subDevices(): readonly SubDevice[];
```

Enumerate the parent ESP's sub-devices. Single-device configurations return an empty array; multi-device parents return one record per addressable sub-device
(the parent itself, `device_id` 0, is not included).

Usage:

```ts
export function subDeviceEnumerationExample(client: EspHomeClient): void {

  for(const subDevice of client.subDevices()) {

    void subDevice.id;
    void subDevice.name;
    void subDevice.areaId;

    // Entities scoped to this sub-device. Single-device configurations report subDevices() as an empty array, so the loop body never runs.
    const entities = client.entitiesByDevice(subDevice.id);

    void entities.length;
  }

  // The parent ESP itself is device id 0 when sub-devices exist.
  const parentEntities = client.entitiesByDevice(0);

  void parentEntities.length;
}
```

#### Returns

readonly [`SubDevice`](../interfaces/SubDevice.md)[]

A read-only list of [SubDevice](../interfaces/SubDevice.md) records.

***

### subscribeToLogs()

```ts
subscribeToLogs(level?, dumpConfig?): void;
```

Request the device-side log subscription at the supplied level. Pairs with `client.on("log", ...)` for callback-style consumption; for an `AsyncIterable` view with
refcounted level upgrades, use [EspHomeClient.logs](#logs) instead.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `level` | [`LogLevel`](../type-aliases/LogLevel.md) | `LogLevel.INFO` | The minimum log level to subscribe to. Defaults to `LogLevel.INFO`. |
| `dumpConfig` | `boolean` | `false` | When `true`, the device prepends a one-shot dump of its configuration to the log stream. Defaults to `false`. |

#### Returns

`void`

#### Remarks

ESPHome has no unsubscribe path on the wire, so subsequent calls at a more verbose level upgrade the device-side subscription but a less verbose call
does not downgrade it for the lifetime of the connection. Reissued automatically on every reconnect.

Usage:

```ts
export async function logSubscriptionExample(client: EspHomeClient): Promise<void> {

  for await (const log of client.logs(LogLevel.DEBUG, { signal: AbortSignal.timeout(60000) })) {

    if(log.level <= LogLevel.WARN) {

      void log.message;
    }
  }
}
```

***

### telemetry()

```ts
telemetry(options?): AsyncIterable<TelemetryEvent>;
```

Async-iterable view of every state update across every entity. Yields the discriminated [TelemetryEvent](../type-aliases/TelemetryEvent.md) union; consumers narrow on the event's `type`
discriminant.

Usage:

```ts
export async function telemetryStreamExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetry({ signal: AbortSignal.timeout(60000) })) {

    void event.type;
    void event.entity;
  }
}
```

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`TelemetryEvent`](../type-aliases/TelemetryEvent.md)\>

An `AsyncIterable<TelemetryEvent>`.

***

### telemetryFor()

```ts
telemetryFor<T>(type, options?): AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>>;
```

Async-iterable view of state updates for one entity type. Filters the generic [telemetry](#telemetry) stream to events of the requested type.

Usage:

```ts
export async function telemetryStreamPerTypeExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetryFor("light", { signal: AbortSignal.timeout(60000) })) {

    // Each event is a LightEvent; the discriminated-union narrowing happens at the channel boundary.
    void event.brightness;
    void event.effect;
    void event.state;
  }
}
```

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | Entity type discriminant. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The entity type to filter on. |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`StateEventFor`](../type-aliases/StateEventFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\>\>

An `AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>`.

***

### telemetryForId()

```ts
telemetryForId<T>(id, options?): AsyncIterable<StateEventFor<SchemaForExtended<T, Extras>>>;
```

Async-iterable view of state updates for one specific entity. Filters [telemetryFor](#telemetryfor) on the entity's numeric key (resolved from the branded id at
iteration start so the filter is O(1) per event).

Usage:

```ts
export async function telemetryStreamPerIdExample(client: EspHomeClient): Promise<void> {

  const sensor = entityId("sensor", "living_room_temperature");

  for await (const event of client.telemetryForId(sensor, { signal: AbortSignal.timeout(60000) })) {

    void event.state;
    void event.missingState;
  }
}
```

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `string` | Entity type discriminant carried by the branded id. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`T`\> | Branded entity id. |
| `options?` | [`StreamOptions`](../interfaces/StreamOptions.md) | Optional backpressure policy and cancellation signal. |

#### Returns

`AsyncIterable`\<[`StateEventFor`](../type-aliases/StateEventFor.md)\<[`SchemaForExtended`](../type-aliases/SchemaForExtended.md)\<`T`, `Extras`\>\>\>

An `AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>`.

***

### telemetryReadable()

```ts
telemetryReadable(options?): ReadableStream<TelemetryEvent>;
```

Web Streams adapter for [telemetry](#telemetry). Same data, different surface; backpressure parity comes from the underlying AsyncIterable. Construction is one line
because `ReadableStream.from` is a stable platform method in Node 22.6+.

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

`ReadableStream`\<[`TelemetryEvent`](../type-aliases/TelemetryEvent.md)\>

A `ReadableStream<TelemetryEvent>`.

***

### transmitRawTimings()

```ts
transmitRawTimings<T>(id, options): void;
```

Transmit raw mark/space timings on an infrared or radio-frequency entity. Issues `INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` (id 136) on the wire; the device drives
its LED or RF transmitter to reproduce the supplied pattern. Accepts either `EntityId<"infrared">` or `EntityId<"radio_frequency">`, since the wire message and
field layout are shared across both physical layers.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` *extends* `"infrared"` \| `"radio_frequency"` | The branded entity-type discriminant; must resolve to `"infrared"` or `"radio_frequency"`. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityId`](../type-aliases/EntityId.md)\<`T`\> | The branded entity id. The brand carries the entity type at the type level so consumers cannot transmit through a non-IR/RF entity by accident. |
| `options` | [`CommandFor`](../type-aliases/CommandFor.md)\<\{ `alarm_control_panel`: \{ `command`: \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `command`: \{ `arm_away`: `1`; `arm_custom_bypass`: `5`; `arm_home`: `2`; `arm_night`: `3`; `arm_vacation`: `4`; `disarm`: `0`; `trigger`: `6`; \}; \}; `fields`: \{ `code`: \{ `fieldNumber`: `3`; `valueType`: `"string"`; `wireType`: `2`; \}; `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `96`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `requiresCodeToArm`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportedFeatures`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `94`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `ARMED_AWAY`: `2`; `ARMED_CUSTOM_BYPASS`: `5`; `ARMED_HOME`: `1`; `ARMED_NIGHT`: `3`; `ARMED_VACATION`: `4`; `ARMING`: `7`; `DISARMED`: `0`; `DISARMING`: `8`; `PENDING`: `6`; `TRIGGERED`: `9`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `95`; \}; `type`: `"alarm_control_panel"`; \}; `binary_sensor`: \{ `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `isStatusBinarySensor`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `12`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `21`; \}; `type`: `"binary_sensor"`; \}; `button`: \{ `command`: \{ `deviceIdFieldNumber`: `2`; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `62`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `61`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `0`; `fields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `0`; \}; `type`: `"button"`; \}; `camera`: \{ `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `43`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `data`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; `done`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `44`; \}; `type`: `"camera"`; \}; `climate`: \{ `command`: \{ `deviceIdFieldNumber`: `24`; `enumMappings`: \{ `fanMode`: \{ `auto`: `2`; `diffuse`: `8`; `focus`: `7`; `high`: `5`; `low`: `3`; `medium`: `4`; `middle`: `6`; `off`: `1`; `on`: `0`; `quiet`: `9`; \}; `mode`: \{ `auto`: `6`; `cool`: `2`; `dry`: `5`; `fan_only`: `4`; `heat`: `3`; `heat_cool`: `1`; `off`: `0`; \}; `preset`: \{ `activity`: `7`; `away`: `2`; `boost`: `3`; `comfort`: `4`; `eco`: `5`; `home`: `1`; `none`: `0`; `sleep`: `6`; \}; `swingMode`: \{ `both`: `1`; `horizontal`: `3`; `off`: `0`; `vertical`: `2`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `customFanMode`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `48`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `26`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedFanModes`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `supportedModes`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `supportedPresets`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `supportedSwingModes`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `18`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `20`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsAction`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentHumidity`: \{ `fieldNumber`: `22`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentTemperature`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTargetHumidity`: \{ `fieldNumber`: `23`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTwoPointTargetTemperature`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `temperatureUnit`: \{ `fieldNumber`: `28`; `valueType`: `"enum"`; `wireType`: `0`; \}; `visualCurrentTemperatureStep`: \{ `fieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxHumidity`: \{ `fieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinHumidity`: \{ `fieldNumber`: `24`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualTargetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `46`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `packedBitsFields`: \{ `featureFlags`: \{ `bits`: \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `27`; `wireType`: `0`; \}; \}; `repeatedFields`: \{ `supportedCustomFanModes`: \{ `fieldNumber`: `15`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedCustomPresets`: \{ `fieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedFanModes`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedModes`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedPresets`: \{ `fieldNumber`: `16`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedSwingModes`: \{ `fieldNumber`: `14`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `action`: \{ `COOLING`: `2`; `DRYING`: `5`; `FAN`: `6`; `HEATING`: `3`; `IDLE`: `4`; `OFF`: `0`; \}; `fanMode`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `mode`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `preset`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `swingMode`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; \}; `fields`: \{ `action`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `currentHumidity`: \{ `fieldNumber`: `14`; `valueType`: `"float"`; `wireType`: `5`; \}; `currentTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `customFanMode`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `fieldNumber`: `15`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `47`; \}; `type`: `"climate"`; \}; `cover`: \{ `command`: \{ `deviceIdFieldNumber`: `9`; `fields`: \{ `stop`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `30`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTilt`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `13`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `22`; \}; `type`: `"cover"`; \}; `date`: \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `day`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `102`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `100`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `day`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `101`; \}; `type`: `"date"`; \}; `datetime`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `2`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `114`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `112`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `3`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `113`; \}; `type`: `"datetime"`; \}; `event`: \{ `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `107`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `eventTypes`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `eventType`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `108`; \}; `type`: `"event"`; \}; `fan`: \{ `command`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `direction`: \{ `forward`: `0`; `reverse`: `1`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `direction`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `31`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedSpeedCount`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `supportsDirection`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOscillation`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsSpeed`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `14`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedPresetModes`: \{ `fieldNumber`: `12`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `direction`: \{ `FORWARD`: `0`; `REVERSE`: `1`; \}; \}; `fields`: \{ `direction`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `23`; \}; `type`: `"fan"`; \}; `infrared`: \{ `command`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `receiverFrequency`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `135`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \}; `type`: `"infrared"`; \}; `light`: \{ `command`: \{ `deviceIdFieldNumber`: `28`; `fields`: \{ `blue`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `green`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `hasRgb`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `red`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ `brightness`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `hasFieldNumber`: `24`; `valueFieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `flashLength`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `transitionLength`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"varint"`; `wireType`: `0`; \}; `warmWhite`: \{ `hasFieldNumber`: `26`; `valueFieldNumber`: `27`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `32`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedColorModes`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `13`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `14`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxMireds`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `minMireds`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `15`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `effects`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedColorModes`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `colorMode`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `blue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `brightness`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `fieldNumber`: `12`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `green`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `red`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `warmWhite`: \{ `fieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `24`; \}; `type`: `"light"`; \}; `lock`: \{ `command`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `command`: \{ `lock`: `1`; `open`: `2`; `unlock`: `0`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `code`: \{ `hasFieldNumber`: `3`; `valueFieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `60`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `codeFormat`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOpen`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `58`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `JAMMED`: `3`; `LOCKED`: `1`; `LOCKING`: `4`; `NONE`: `0`; `OPEN`: `7`; `OPENING`: `6`; `UNLOCKED`: `2`; `UNLOCKING`: `5`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `59`; \}; `type`: `"lock"`; \}; `media_player`: \{ `command`: \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `announcement`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `command`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mediaUrl`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `65`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `featureFlags`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPause`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `63`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedMessageFields`: \{ `supportedFormats`: \{ `enumMappings`: \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \}; `fieldNumber`: `9`; `fields`: \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `state`: \{ `ANNOUNCING`: `4`; `IDLE`: `1`; `NONE`: `0`; `OFF`: `5`; `ON`: `6`; `PAUSED`: `3`; `PLAYING`: `2`; \}; \}; `fields`: \{ `muted`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `volume`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `64`; \}; `type`: `"media_player"`; \}; `number`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `51`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `AUTO`: `0`; `BOX`: `1`; `SLIDER`: `2`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxValue`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; `minValue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `step`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `49`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `50`; \}; `type`: `"number"`; \}; `radio_frequency`: \{ `command`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `frequencyMax`: \{ `fieldNumber`: `10`; `valueType`: `"varint"`; `wireType`: `0`; \}; `frequencyMin`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedModulations`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `148`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \}; `type`: `"radio_frequency"`; \}; `select`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `54`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `52`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `options`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `53`; \}; `type`: `"select"`; \}; `sensor`: \{ `listEntities`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `stateClass`: \{ `MEASUREMENT`: `1`; `MEASUREMENT_ANGLE`: `4`; `NONE`: `0`; `TOTAL`: `3`; `TOTAL_INCREASING`: `2`; \}; \}; `fields`: \{ `accuracyDecimals`: \{ `fieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `forceUpdate`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `stateClass`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `16`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `25`; \}; `type`: `"sensor"`; \}; `siren`: \{ `command`: \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `duration`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `tone`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `57`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsDuration`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsVolume`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `55`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `tones`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `56`; \}; `type`: `"siren"`; \}; `switch`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `33`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `17`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `26`; \}; `type`: `"switch"`; \}; `text`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `99`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `PASSWORD`: `1`; `TEXT`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxLength`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minLength`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `pattern`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `97`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `98`; \}; `type`: `"text"`; \}; `text_sensor`: \{ `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `18`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `27`; \}; `type`: `"text_sensor"`; \}; `time`: \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `hour`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `105`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `103`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `hour`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `104`; \}; `type`: `"time"`; \}; `update`: \{ `command`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `command`: \{ `check`: `2`; `none`: `0`; `update`: `1`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `118`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `116`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `11`; `fields`: \{ `currentVersion`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; `hasProgress`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `inProgress`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `latestVersion`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `progress`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `releaseSummary`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `releaseUrl`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `title`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `117`; \}; `type`: `"update"`; \}; `valve`: \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `stop`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `111`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `11`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `109`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `110`; \}; `type`: `"valve"`; \}; `water_heater`: \{ `command`: \{ `bitmaskFieldNumber`: `2`; `bitmaskFields`: \{ `mode`: \{ `bit`: `1`; `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `bit`: `2`; `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `bit`: `16`; `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `bit`: `8`; `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `eco`: `1`; `electric`: `2`; `gas`: `6`; `heat_pump`: `5`; `high_demand`: `4`; `off`: `0`; `performance`: `3`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `134`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedModes`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `minTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `supportedFeatures`: \{ `fieldNumber`: `12`; `valueType`: `"varint"`; `wireType`: `0`; \}; `targetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `temperatureUnit`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `132`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedModes`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; \}; `fields`: \{ `currentTemperature`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `133`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \}; `type`: `"water_heater"`; \}; \}\[`T`\]\> | Transmit parameters. `carrierFrequency` (Hz) drives the IR carrier or RF carrier; `repeatCount` is the number of times the entire pattern is transmitted (1 = once); `timings` is the mark/space pattern in microseconds where positive values are mark (LED/TX on) and negative values are space (LED/TX off); `modulation` is the [RadioFrequencyModulation](../type-aliases/RadioFrequencyModulation.md) enum value (ignored for IR entities per the proto, but accepted for consumer simplicity - passing through whatever the consumer supplies is the safer choice than silently rewriting it). |

#### Returns

`void`

#### Remarks

This is the only consumer-facing entry point for the shared transmit RPC. Unlike [command](#command), the call surfaces typed failure for unknown or
non-transmitter entities instead of warn-and-drop, because an IR/RF transmit silently dropped is invisible to the consumer (no acknowledged completion event arrives,
so a missing transmission cannot be detected after the fact). Capability gating is centralized here so callers do not need to bit-test against
[InfraredCapabilityFlags](../variables/InfraredCapabilityFlags.md) themselves before every transmit. The capability flag bit positions are identical between [InfraredCapabilityFlags](../variables/InfraredCapabilityFlags.md) and
[RadioFrequencyCapabilityFlags](../type-aliases/RadioFrequencyCapabilityFlags.md), so the same `TRANSMITTER` constant covers both branches.

Usage (infrared):

```ts
export function infraredTransmitExample(client: EspHomeClient): void {

  const tvPower = entityId("infrared", "ir_blaster");

  client.transmitRawTimings(tvPower, {

    carrierFrequency: 38000,
    repeatCount: 1,
    timings: [ 9000, -4500, 560, -560, 560, -1690, 560, -560, 560, -1690 ]
  });
}
```

Usage (radio frequency):

```ts
export function radioFrequencyTransmitExample(client: EspHomeClient): void {

  const remote = entityId("radio_frequency", "rf_module");

  client.transmitRawTimings(remote, {

    carrierFrequency: 433920000,
    modulation: RadioFrequencyModulation.OOK,
    repeatCount: 3,
    timings: [ 350, -1050, 1050, -350, 350, -1050, 1050, -350 ]
  });
}
```

#### Throws

with code `ENTITY_NOT_FOUND` when no entity is registered for `id` on the current connection.

#### Throws

with code `ENTITY_NOT_TRANSMITTER` when the entity exists but its `capabilities` bitmask does not include the transmitter bit. Receive-only
hardware cannot fulfill a transmit request, so failing eagerly surfaces the configuration mismatch.
