<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![esphome-client: ESPHome Client API](https://raw.githubusercontent.com/hjdhjd/esphome-client/main/esphome-logo.svg)](https://github.com/hjdhjd/esphome-client)

# ESPHome Client API

[![Downloads](https://img.shields.io/npm/dt/esphome-client?color=%2318BCF2&logo=icloud&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)
[![Version](https://img.shields.io/npm/v/esphome-client?color=%2318BCF2&label=ESPHome%20Client%20API&logo=esphome&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)
[![License](https://img.shields.io/npm/l/esphome-client?color=%2318BCF2&logo=open%20source%20initiative&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/blob/main/LICENSE.md)
[![Build Status](https://img.shields.io/github/actions/workflow/status/hjdhjd/esphome-client/ci.yml?branch=main&color=%2318BCF2&logo=github-actions&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/actions?query=workflow%3A%22Continuous+Integration%22)

## A complete Node-native ESPHome API client implementation with full protocol support.
</DIV>
</SPAN>

[ESPHome](https://esphome.io) is the open-source firmware platform for ESP8266/ESP32 microcontrollers that defines its own native API protocol for control and observation. `esphome-client` is a TypeScript-first Node 22+ library that speaks that API end-to-end against ESPHome 2025.10+ firmware. It is zero-dependency, ESM-only, and ships a complete Noise Protocol Framework implementation (`Noise_NNpsk0_25519_ChaChaPoly_SHA256`) using only Node's built-in `crypto` and `net` modules. The library is the runtime for `homebridge-ratgdo` and other Homebridge plugins that bridge ESPHome devices into HomeKit; its v2 surface was shaped against that real-world consumer.

## Contents

- [Why v2](#why-v2)
- [Install](#install)
- [Quick start](#quick-start)
- [Common patterns](#common-patterns) — task-oriented entry points
- [Core model](#core-model) — entities, commands, telemetry, errors
- [Runtime](#runtime) — lifecycle, health, auto-reconnect, latest-state cache, capabilities, logs
- [Sub-APIs](#sub-apis) — camera, voice, serial, Bluetooth, Z-Wave, Home Assistant, user-services
- [CLI](#cli) — `espc` interactive tool
- [Testing](#testing) — `MockClient`, `MockTransport`, factory helpers
- [Schema extensions](#schema-extensions) — `aliasOf`, `extending`
- [Protocol reference](#protocol-reference)
- [Versioning and license](#versioning-and-license)

Runnable examples for every workflow named below live in [`src/examples/showcase.ts`](./src/examples/showcase.ts).

## Why v2

v2.0 is a clean break from v1 designed for modern TypeScript consumers. The surface composes rather than inherits, every wire identity is typed at compile time, and every async path is cancellable and reconnect-aware.

- **Composition over inheritance.** `EspHomeClient` no longer extends `EventEmitter`. Subscriptions return `Disposable` callbacks, one-shot `Promise`s, or `AsyncIterable` streams with explicit backpressure policy. Sub-APIs (`client.voiceAssistant`, `client.camera(id)`, ...) compose through narrow seams.
- **Typed safety.** Branded `EntityId<T>` carries the entity type tag at compile time - passing a switch id to a light command is a type error. The error hierarchy is a typed `EspHomeError` tree with `cause` chains and a `PermanentError` marker the auto-reconnect loop filters on. State-event enum fields narrow to literal unions (e.g., `LockState`, `CoverOperation`, `MediaPlayerState`) rather than plain `number`.
- **Zero-allocation streams.** `client.telemetry()`, `client.logs()`, `client.lifecycle()`, `client.voiceAssistant.audio()`, and `client.camera(id).stream()` are async iterables with `AbortSignal` cancellation; each has a Web Streams adapter (`telemetryReadable()`, `logsReadable()`, `lifecycleReadable()`, `voiceAssistant.audioReadable()`, and `camera(id).readable()`) that bridges into the pipeline (`pipeThrough`, `tee`, `pipeTo`).

See the [changelog](./docs/Changelog.md) for the full list of breaking changes, additions, and fixes against v1.

## Install

```bash
npm install esphome-client
```

Requires Node.js 22.20 or later and an ESPHome 2025.10+ device. The library is Node-only - browsers cannot satisfy the `net` and `crypto` dependencies.

## Quick start

A complete working example: connect to a device with a Noise pre-shared key, lock a deadbolt, await the matching state event, and dispose cleanly on scope exit.

```ts
import { LockCommand, LockState, entityId, openEspHomeClient } from "esphome-client";

await using client = await openEspHomeClient({

  host: "front-door.local",
  psk: process.env["ESPHOME_PSK"] ?? null
});

using deviceSub = client.on("deviceInfo", (info) => {

  console.info("Connected to", info.name, info.esphomeVersion);
});

const frontDoor = entityId("lock", "front_door_deadbolt");

using lockSub = client.on("lock", (event) => {

  if(event.state === LockState.LOCKED) {

    console.info("Deadbolt is secured.");
  }
});

const lockState = await client.commandAndAwait(frontDoor, { command: LockCommand.LOCK });

console.info("Lock command settled:", lockState);
```

The factory resolves once the handshake, device-info exchange, and entity discovery have completed; the `await using` binding ensures the graceful `DISCONNECT_REQUEST` round-trip runs at scope exit.

The `lockSub` listener is illustrative — `commandAndAwait` pre-subscribes internally, so the awaited round-trip works without it. The callback rail is shown so an unrelated consumer's pattern (observing lock state independently of command-and-await) is visible in the same snippet.

## Common patterns

A few task-oriented entry points into the rest of the doc:

- **Monitor every state change** — the [Telemetry](#telemetry) rails (`client.on`, `client.stream`, `client.telemetry()`).
- **Send a command and confirm it landed** — [`client.commandAndAwait`](#commands).
- **Read latest known state without subscribing** — the [Latest-state cache](#latest-state-cache) (`client.latest`, `client.snapshot`).
- **Re-run setup work each time the connection comes up** — [`withReconnect`](#auto-reconnect).
- **Probe a feature before using it** — [`client.capabilities()`](#capabilities).
- **Wait until a known set of entities has reported state, then construct** — compose `client.on("telemetry")`, `client.snapshot()`, `client.entitiesByDevice()`, and `AbortSignal.any`. v2 deliberately omits a built-in `waitForInitialState` helper because the right completion predicate is consumer-specific (some entity types are stateless, some legitimately suppress a first state response under specific configurations).
- **Test consumer code against the client** — the [Testing](#testing) subpath (`MockClient` + factory helpers).

## Core model

### Entities

- Addressed by branded `EntityId<T>` values shaped `${type}-${objectId}`.
- Mint with `entityId(type, objectId)`; narrow untrusted input (CLI args, network responses, configuration files) with `isEntityId(value, type)` or `parseEntityId(value)`.
- The brand is compile-time only - `EntityId<"light">` and `EntityId<"switch">` are distinct types but share the same lowercase-string runtime representation, so the brand has zero allocation cost.
- The built-in entity types are: `alarm_control_panel`, `binary_sensor`, `button`, `camera`, `climate`, `cover`, `date`, `datetime`, `event`, `fan`, `infrared`, `light`, `lock`, `media_player`, `number`, `radio_frequency`, `select`, `sensor`, `siren`, `switch`, `text`, `text_sensor`, `time`, `update`, `valve`, `water_heater`.

`infrared` and `radio_frequency` expose a raw-timings transmit primitive (`client.transmitRawTimings(id, options)`) plus inbound receive events surfaced on the `infrared` / `radio_frequency` telemetry channels, keyed by entity. Higher-level codecs (NEC, RC5, Sony, Pronto Hex on the IR side; OOK encoders on the RF side) are downstream concerns.

Some ESPHome nodes advertise multiple logical **sub-devices** under one connection. `client.subDevices()` returns the advertised `SubDevice` records (`{ id, name?, areaId? }`), and `client.entitiesByDevice(deviceId)` scopes the discovered entities to a sub-device id (`0` for the parent ESP, `undefined` for every entity). Nodes without sub-devices report an empty list.

### Commands

- `client.command<T>(id, options)` is fire-and-forget. It logs and drops on encoder failures or unknown ids.
- `client.commandAndAwait<T>(id, options, awaitOptions?)` subscribes to the matching state-event channel before sending the command frame (avoiding the fast-device race) and resolves with the first event matching the optional `predicate`. Rejects with `DOMException("TimeoutError")` after the default 2000ms or the consumer's `AbortSignal`.
- Read-only, stateless, and transmit-only entity types (`binary_sensor`, `button`, `camera`, `infrared`, `radio_frequency`, `sensor`, `text_sensor`) are excluded from `commandAndAwait` at the type level - awaiting a state echo is meaningless for them.

### Telemetry

Three subscription rails over the typed `ClientEventsMap`:

- `client.on(event, handler)` returns a `Disposable` callback.
- `client.once(event, options?)` returns a `Promise` that resolves on the next emission.
- `client.stream(event, options?)` returns an `AsyncIterable` with `dropOldest` / `dropNewest` / `throw` backpressure policy.

Higher-level wrappers narrow on `event.type` and emit type-narrowed payloads:

- `client.telemetry()` - every state event.
- `client.telemetryFor("light")` - one entity type.
- `client.telemetryForId(id)` - one entity.

State-event fields with wire-level enums narrow to literal unions automatically: `event.state` on a lock-channel event is typed as `LockState`, not `number`. Exhaustive `switch` over the literal-union rails is verified at compile time.

### Errors

Failures surface as typed subclasses of `EspHomeError`:

- **Encryption** (all `PermanentError`) - `EncryptionKeyMissingError`, `EncryptionKeyInvalidError`, `EncryptionRequiredError`.
- **Negotiation** (`PermanentError`) - `NegotiationFailedError`, raised when API-version negotiation finds no overlap.
- **Handshake** - `NoiseHandshakeError` (with a tagged `code`), `NoiseHandshakeTimeoutError`, `PeerClosedDuringNoiseError`, `PlaintextHandshakeError`.
- **Connection** - `ConnectionRefusedError`, `ConnectionTimeoutError`, `ConnectionClosedByPeerError`, `HeartbeatStalledError`.
- **Protocol** - `FrameTooLargeError`, `BufferOverflowError`, `DecodingError`, `EncodingError`.
- **Operational** - `BackpressureError` (with dropped-item count), `CameraStreamClosedError` (with branded `cameraId`).
- **Configuration** - `ConfigurationError` (with `code` one of `MALFORMED_ENTITY_ID`, `UNKNOWN_ENTITY_ID`, `AWAIT_STREAM_CLOSED`, `EXTRA_SCHEMA_OVERRIDES_BUILTIN`).

The auto-reconnect supervisor's default `shouldRetry` predicate filters out every `PermanentError` subclass automatically. Consumers can `instanceof`-check for precise dispatch.

## Runtime

### Construction and disposal

Two construction paths cover the consumer surface:

- **`openEspHomeClient(options)`** (canonical) - async factory with bounded retry on transient errors (default three retries with exponential backoff and jitter) and short-circuit on `PermanentError` subclasses.
- **`new EspHomeClient(options)` + `await client.connect({ signal })`** - explicit two-step construction for consumers who need to attach subscriptions before the discovery handshake fans out.

Disposal flows through `Symbol.dispose` (sync, immediate teardown) and `Symbol.asyncDispose` (graceful: sends `DISCONNECT_REQUEST` and awaits the matching response within `gracefulDisconnectTimeoutMs`, then falls through). The two `using` keywords pick the matching path; consumers not using explicit resource management call the same paths imperatively as `client.disconnect()` (sync) and `client.disconnectAsync()` (graceful).

### Lifecycle and health observability

- `client.health()` returns a synchronous `ConnectionHealth` snapshot - a discriminated union over `state` whose common fields are `encrypted`, `consecutiveStalls`, `lastInboundActivityAt`, and optional `lastPingRttMs`; the live (`connected` / `stalled`) variant additionally carries `connectedAtMs`. Narrow with the `isConnectionLive(health)` type guard and derive uptime with `connectionUptimeMs(health)`. Disconnect reasons live on `lifecycle()`, not on the health record.
- `client.onHealthChange(callback)` returns a `Disposable` callback over health transitions.
- `client.healthStream({ signal })` returns an `AsyncIterable` over health transitions.
- `client.lifecycle({ signal })` emits `LifecycleEvent`s tagged by `event.kind` (`connect`, carrying `encrypted`; `disconnect`, carrying an optional typed `cause`) - the canonical observation path for disconnect reasons. Reconnect activity surfaces through the `ReconnectConfig.onAttempt` callback and the health stream; the separate `noiseKeySet` boolean event reports a noise-key rotation.

The legacy `disconnect: string | undefined` event remains on the bus for backwards compatibility but is no longer the structured path.

### Auto-reconnect

On by default with `PermanentError`-filtered retry, exponential backoff (500ms initial, 2x, 30s cap, 20% jitter, unlimited attempts), and consumer subscriptions that survive each cycle. Pass `reconnect: false` to disable.

`withReconnect(client, body, options)` re-runs a body callback once per successful connect with a disconnect-aware `AbortSignal` - the canonical "do this work for each connection" supervisor pattern.

### Heartbeat

A lazy keep-alive guards against a silently dead socket, on by default. After `intervalMs` of inbound silence (default 30s) the client sends a `PING_REQUEST`; if no inbound activity follows within `stallTimeoutMs` (default 60s) the connection is declared stalled - a `HeartbeatStalledError` surfaces, the transport is torn down, and auto-reconnect takes over when enabled. Ping round-trip time and the running stall count surface on the health record as `lastPingRttMs` and `consecutiveStalls`. Pass `keepAlive: false` to disable, or `keepAlive: { intervalMs, stallTimeoutMs }` to tune the thresholds.

### Latest-state cache

- `client.latest(id)` returns the most recent state event for a branded entity id, or `undefined` if none has arrived since the most recent connect.
- `client.snapshot()` and `client.snapshotFor(type)` return type-narrowed `Map`s of every cached entity state.

The cache is updated **before** listeners are notified, so a `client.latest(id)` / `client.snapshot()` read from inside an `on("telemetry")` or per-type listener sees the event that fired the listener. The cache is cleared on every reconnect.

### Capabilities

`client.capabilities()` returns a structured `ClientCapabilities` record describing API minor version, encryption status, voice-assistant feature flags, Bluetooth proxy support, serial proxy, Z-Wave proxy, modern handshake, and noise-key rotation (`client.setNoiseEncryptionKey(key, options?)` performs the rotation when that capability is present). Feature gating consults this record rather than parsing version-number strings.

### Logs

`client.logs(level, options?)` returns an `AsyncIterable<LogEventData>` with the same `StreamOptions` shape (signal, backpressure policy) as the other streaming methods, plus refcounted device-side level upgrade: opening a second iterator at a higher verbosity upgrades the device subscription. ESPHome has no unsubscribe path, so the highest level any open iterator has requested persists for the connection's lifetime.

## Sub-APIs

Each sub-API is a lazy single-instance namespace reached through a property on the client. The instance persists across reconnects and any consumer subscriptions survive each cycle.

### Camera

`client.camera(id)` returns a per-id `CameraApi` (cached for the lifetime of the client).

- `snapshot({ signal })` - single image, awaits the next complete frame.
- `stream({ signal })` - continuous async iterable of complete frames.
- `readable({ signal })` - Web Streams adapter over `stream()`.

Multi-packet image reassembly lives in the sub-API. Operational failures surface through `CameraStreamClosedError` (transport disconnected mid-snapshot) and `DOMException("TimeoutError" | "AbortError")`.

### Voice assistant

`client.voiceAssistant` exposes the bidirectional audio + control surface:

- **Streaming** - `audio({ signal })` inbound, `sendAudio(buffer, end)` outbound.
- **Control** - `subscribe()`, `sendEvent(eventType, data?)`, `sendTimerEvent(timer)`.
- **Pipeline** - `requests({ signal })` iterates the device's inbound pipeline-run requests; `respondToRequest(options?)` acknowledges each one (a start request left unacknowledged stalls the device-side pipeline).
- **Announce** - `announce(options, awaitOptions?)` for synchronous TTS playback.
- **Configuration** - `configuration({ signal, refresh? })`, `setActiveWakeWords(ids)`.

### Serial proxy

`client.serial` bridges the device's UART instances (advertised on `DeviceInfo.serialProxies`):

- **Discovery** - `list()`.
- **Configuration** - `configure(instance, options)`, `setModemPins(instance, lineStates)`, `getModemPins(instance, awaitOptions?)`.
- **Data** - `write(instance, data)`, `data(instance, { signal })` (refcounted iterable), `flush(instance, awaitOptions?)`.

Subscriptions are refcounted per-instance.

### Bluetooth proxy

`client.bluetooth` is the BLE proxy surface. The Bluetooth Core spec's GATT model addresses a remote device by its MAC address and an attribute handle - a small integer pointing into the device's attribute table; reads, writes, and notifications target a specific `(address, handle)` pair. The proxy exposes that surface as typed RPC, plus advertisement scanning and connection-lifecycle management.

- **Availability** - `available` (boolean gate; the device's `bluetoothProxyFeatureFlags` must declare the proxy).
- **Advertisement scanning** - `advertisements({ signal })`, `setScannerMode`, `scannerState({ signal })`, `lastScannerState()`.
- **GATT** - `connect`, `disconnect`, `getServices`, `readCharacteristic`, `writeCharacteristic`, `readDescriptor`, `writeDescriptor`, `setNotify` / `notify({ signal })`.
- **Pairing** - `pair`, `unpair`, `clearCache`.
- **Connection management** - `setConnectionParams`, `connectionsFree({ signal })` / `lastConnectionsFree()`, plus the connection-state surface `isConnected(address)`, `connectionState(address)`, `connectionStates({ signal })`.

### Z-Wave proxy

`client.zwave` is a deliberately thin transparent byte pipe to the device's Z-Wave radio Serial API. The shape is unusual enough relative to the other sub-APIs that it gets its own contract.

**What it does NOT do.** The Z-Wave proxy is not a Z-Wave protocol stack. The library does NOT parse Z-Wave Serial API frames, handle command classes, manage S0 / S2 security envelopes, route messages, associate nodes, or manage the Z-Wave network. There are no helpers for inclusion / exclusion, no key exchange, no scene management, no association groups. None of that surface exists by design.

**What it does provide.** A transparent bidirectional byte pipe (`client.zwave.send(frame)` outbound, `client.zwave.frames({ signal })` inbound), feature-flag gated availability (`client.zwave.available`), home-id awareness (`client.zwave.homeId()` synchronous snapshot plus `client.zwave.homeIdChanges({ signal })` push stream), and the usual reconnect-aware lifecycle.

**What consumers need on top.** A library that speaks Z-Wave - [`zwave-js`](https://github.com/zwave-js/node-zwave-js) is the canonical choice. The typical integration routes the inbound `client.zwave.frames()` stream into the Z-Wave library's serial-API ingest and writes the library's outbound frames back via `client.zwave.send(buffer)`:

```ts
if(client.zwave.available) {

  for await (const frame of client.zwave.frames({ signal })) {

    // Route the raw Z-Wave Serial API frame into a Z-Wave-aware library. The buffer is passed unchanged - validation and parsing are the library's job.
    zwaveDriver.serialApi.write(frame);
  }
}
```

**Contrast with the Bluetooth proxy.** `client.bluetooth` is GATT-level RPC: the BLE Core spec carries a typed attribute table the client addresses directly via `(address, handle)` pairs with typed reads / writes / notifications. `client.zwave` is byte-pipe: opaque frames flow in both directions because the Z-Wave Serial API is a stream the radio's host stack must interpret. Both shapes are correct for their respective protocols; the parity asymmetry is deliberate, not an oversight.

### Home Assistant

`client.homeAssistant` exposes the ESPHome-to-HA bridging surface:

- `subscribeServices()`, `subscribeStates()` - opt into inbound HA event streams.
- `sendState(entityId, state, attribute?)` - push an HA entity's current state to the device.
- `respondToAction(callId, options)` - reply to an HA action call when the device's firmware enables action responses.

### User-defined services

`client.services` exposes ESPHome's user-defined service catalog:

- `list()` - enumerate the discovered services.
- `execute(key, args?)`, `executeByName(name, args?)` - invoke by numeric key or name.

A `serviceCallResult` bus event surfaces `EXECUTE_SERVICE_RESPONSE` when the device enables action responses (`{ callId, success, errorMessage?, responseData? }`).

## CLI

The package ships an `espc` binary for interactive device exploration:

```bash
espc -h front-door.local info
espc -h front-door.local list --type light
espc -h front-door.local control switch-front_door on
espc -h front-door.local monitor --duration 60
espc -h front-door.local -i
```

The CLI supports every entity type the schema registry exposes, accepts Noise PSKs via `-k`, and switches into a REPL with `-i`. Run `espc --help` for the complete flag and command reference.

## Testing

Test helpers ship under the `esphome-client/testing` conditional subpath, separate from the production entry point:

```ts
import { MockClient, MockTransport, mockEntity, mockStateMessage } from "esphome-client/testing";
```

- **`MockClient`** - consumer-facing test harness. Mirrors the real `EspHomeClient` surface so production code under test runs unchanged. Drive state via `populate*` / `set*` / `emit*` methods; assert on a `commands` log capturing every issued command. Every sub-API on `MockClient` is a `Proxy`-backed recording mock; address its recorded calls and stage return values through the exported `MOCK` symbol (`mock.bluetooth[MOCK]` exposes a `MockController`).
- **`MockTransport`** - integration-level seam. Return it from `EspHomeClientOptions.transportFactory` (a factory yielding a fresh transport per connect, e.g. `transportFactory: () => transport`) to exercise the real client's handshake / decoder / dispatcher pipelines against a scripted byte sequence rather than a device. Script that sequence with the exported `push*` fixture-injection helpers.
- **Factory helpers** - `mockEntity`, `mockEntityDiscovery`, `mockStateMessage`, `mockDeviceInfo`, `mockHealth`, `mockNoiseHandshakeExchange`.

## Schema extensions

Downstream consumers integrating vendor firmware that exposes entity types outside the standard set can register additional entity-type schemas at construction time via the `extraSchemas` option. Two helpers cover the common cases:

- `aliasOf("cover")` registers a custom type that mirrors an upstream entity type with a different type tag (encode + decode passes are byte-equal to the upstream).
- `extending("switch", { addedListEntitiesFields, addedStateFields })` adds read-side fields to an upstream entity type. The command-side spec is preserved verbatim by design - `extending()` is read-side only, locking the encoder to the upstream so a vendor-extended type stays byte-compatible with its parent.

Built-in entity-type keys cannot be silently shadowed; a collision throws `ConfigurationError("EXTRA_SCHEMA_OVERRIDES_BUILTIN")` at construction. The surface exists so a consumer like [`homebridge-ratgdo`](https://github.com/hjdhjd/homebridge-ratgdo) can teach the client about entity types a vendor's firmware exposes outside the standard set - the flexibility that lets it support hardware variants without the library needing to know about them. (The `door_cover` alias in the examples is an illustrative custom type; a real garage door, Konnected or otherwise, is a standard `cover`.)

## Protocol reference

The client advertises ESPHome API 1.14 in `HelloRequest` and accepts any major-1 device. Firmware floor for regression-tested support is ESPHome 2025.10; older firmwares may negotiate and work but are not part of v2's test matrix. Feature gating consults the `ClientCapabilities` record, which derives boolean flags from a single declarative table at `src/api-feature-versions.ts`. Adding support for a new minor is a small, additive change.

`object_id` is derived client-side from `name` via the upstream `sanitize(snake_case(name))` algorithm on firmware 1.14+ that omits the wire field; older firmware sends `object_id` and the discovery decoder uses the wire value. Both paths produce byte-identical canonical ids.

The canonical ESPHome protocol reference is [`src/api.proto`](./src/api.proto); a CI lint (`npm run lint:proto`) keeps `ENTITY_SCHEMAS` in sync with it, and `npm run check:proto-drift` compares the local snapshot against upstream's `dev` branch. Contributors should read the source modules in [`src/`](./src/) directly - every public symbol carries its own module-level and per-symbol JSDoc, and the [generated API reference](./docs/) is the rendered view.

## Versioning and license

This library follows semantic versioning. The current major (v2) is a clean break from v1 - see the [changelog](./docs/Changelog.md) for the full release notes including the v2.0.0 breaking changes. The library is ISC-licensed.

For a real-world v2 consumer pattern, [`homebridge-ratgdo`](https://github.com/hjdhjd/homebridge-ratgdo) integrates this library into a Homebridge plugin and exercises the entire surface (sub-APIs, schema extensions, auto-reconnect, lifecycle observation).
