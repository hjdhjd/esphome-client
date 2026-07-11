/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * showcase.ts: Numbered example regions for the esphome-client public API.
 */

/*
 * Showcase examples that double as documentation. Each region between `// #region <slug>` and `// #endregion <slug>` is a self-contained snippet of client usage.
 * The file is type-checked against the published API; renaming a public symbol or changing a signature breaks the build here, surfacing the doc rot before it ships.
 *
 * Examples are wrapped in functions so the file does not produce side effects on import. The README links to this file as the runnable-example companion for
 * every workflow named in its own contents list.
 *
 * Every region demonstrates a distinct workflow: construction, disposal, entity discovery, per-type commands, telemetry streaming, error handling, sub-API
 * consumption (voice assistant, camera), Home Assistant bridging, capability gating, custom logging, schema extension, and consumer-side testing patterns. The
 * `check:example-refs` lint script fails the build when a referenced region is missing.
 *
 * @module examples/showcase
 */
import { AlarmControlPanelCommand, AlarmControlPanelState, ClimateMode, CoverOperation, EspHomeClient, LockCommand, LockState, LogLevel, MediaPlayerCommand,
  MediaPlayerState, RadioFrequencyModulation, SerialProxyLineStateFlags, SerialProxyParity, SerialProxyPortType, SerialProxyStatus,
  openEspHomeClient } from "../esphome-client.ts";
import type { AlarmControlPanelEvent, ClientEventsMap, ClimateEvent, CoverEvent, DeviceInfo, EspHomeClientOptions, ExecuteServiceArgumentValue,
  FanEvent, LockEvent, MediaPlayerEvent, SirenEvent, SwitchEvent } from "../esphome-client.ts";
import { BackpressureError, BufferOverflowError, CameraStreamClosedError, ConfigurationError, ConnectionClosedByPeerError, ConnectionError, ConnectionRefusedError,
  ConnectionTimeoutError, EncryptionKeyInvalidError, EncryptionKeyMissingError, EncryptionRequiredError, EspHomeError, FrameTooLargeError, HandshakeError,
  HeartbeatStalledError, NegotiationFailedError, NoiseHandshakeError, NoiseHandshakeTimeoutError, PeerClosedDuringNoiseError, PermanentError,
  PlaintextHandshakeError, ProtocolError } from "../errors.ts";
import { BluetoothScannerMode, BluetoothScannerState } from "../api-constants.ts";
import type { Entity, TelemetryEvent } from "../schemas/index.ts";
import type { EspHomeLogging, Nullable } from "../types.ts";
import { VoiceAssistantEvent, VoiceAssistantSubscribeFlag } from "../api-constants.ts";
import { aliasOf, extending } from "../schemas/index.ts";
import { createESPHomeHandshake, createHandshake } from "../crypto-noise.ts";
import { entityId, isEntityId, parseEntityId } from "../entity-id.ts";
import { mockDeviceInfo, mockEntityDiscovery, mockHealth, mockStateMessage } from "../testing/factories.ts";
import { Buffer } from "node:buffer";
import type { EntityId } from "../entity-id.ts";
import type { ExtraSchemaSet } from "../schemas/index.ts";
import { MockClient } from "../testing/mock-client.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import type { ReadableStream } from "node:stream/web";
import { WireType } from "../protocol/index.ts";
import { connectionUptimeMs } from "../health.ts";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";
import { withReconnect } from "../reconnect.ts";

/**
 * Construct a client via the async factory and bind it to an `await using` scope so the transport tears down automatically on scope exit. The factory applies
 * bounded retry on transient errors; permanent errors (encryption, auth, version mismatch) reject immediately.
 */
// #region open-and-dispose
export async function openAndDisposeExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "office-controller.local",
    psk: process.env["ESPHOME_PSK"] ?? null
  });

  // The async-dispose path sends DISCONNECT_REQUEST and awaits the matching response; if the server doesn't respond within `gracefulDisconnectTimeoutMs` (default
  // 1000ms), the client falls through to immediate teardown.
  void client;
}
// #endregion open-and-dispose

/**
 * Two-step manual construction. Useful when the consumer needs to attach `on`/`stream` subscriptions before the connect handshake fans out the discovery events,
 * or when the connect call itself needs a custom AbortSignal lifetime that the factory's `signal` option does not cover.
 */
// #region manual-construction
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
// #endregion manual-construction

/**
 * Encrypted connection with a Noise NNpsk0 pre-shared key. The PSK is base64-encoded and must decode to exactly 32 bytes; the constructor logs and discards a
 * malformed key, falling back to plaintext. A live PSK rotation uses {@link EspHomeClient.setNoiseEncryptionKey} after the session is up.
 */
// #region connection-with-noise
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
// #endregion connection-with-noise

/**
 * The three teardown paths. `disconnect()` is sync (immediate TCP close); `disconnectAsync()` is graceful (sends DISCONNECT_REQUEST and awaits the response up to
 * `gracefulDisconnectTimeoutMs`, then tears down). The two `Symbol.*` hooks let `using` and `await using` scopes pick the matching path automatically.
 */
// #region disconnect-and-cleanup
export async function disconnectAndCleanupExample(client: EspHomeClient): Promise<void> {

  // Sync teardown: the device sees a TCP close. Suitable for crash paths and short-lived scripts where graceful is unnecessary.
  client.disconnect();

  // Async teardown: the graceful path. Returns when the response arrives or the timeout falls through; never blocks indefinitely.
  await client.disconnectAsync();

  // The Symbol.dispose hook is wired to disconnect(); the Symbol.asyncDispose hook is wired to disconnectAsync(). Use them via `using` / `await using`.
  client[Symbol.dispose]();
  await client[Symbol.asyncDispose]();
}
// #endregion disconnect-and-cleanup

/**
 * Run a body callback once per successful connect. The body's signal aborts on the next disconnect so re-entrant operations (`commandAndAwait`, streams) wind down
 * before the next connect attempt. The body's first parameter is the structural `WithReconnectClient` seam (health + lifecycle); to reach the full surface (sub-APIs,
 * command, telemetry stream), close over the outer `client` reference.
 */
// #region with-reconnect
export async function withReconnectExample(client: EspHomeClient): Promise<void> {

  await withReconnect(client, async (_, signal) => {

    client.voiceAssistant.subscribe();

    for await (const audio of client.voiceAssistant.audio({ signal })) {

      void audio;
    }
  }, { signal: AbortSignal.timeout(60000) });
}
// #endregion with-reconnect

/**
 * The auto-reconnect supervisor's `shouldRetry` predicate filters out {@link PermanentError} subclasses by default - encryption misconfigurations, authentication
 * failures, and version mismatches stop the loop instead of consuming the retry budget. Override the predicate for additional bespoke filtering.
 */
// #region reconnect-with-permanent-error
export async function reconnectWithPermanentErrorExample(): Promise<void> {

  await using client = await openEspHomeClient({

    host: "flaky.local",
    psk: process.env["ESPHOME_PSK"] ?? null,
    reconnect: {

      initialDelayMs: 500,
      maxDelayMs: 30000,
      onAttempt: (attempt, delayMs): void => {

        void attempt;
        void delayMs;
      },

      // Default predicate: skip permanent errors. Layer additional filtering by calling the default first, then your own check.
      shouldRetry: (error, attempts): boolean => !(error instanceof PermanentError) && (attempts < 50)
    }
  });

  void client;
}
// #endregion reconnect-with-permanent-error

/**
 * Observe connect / disconnect transitions via the typed lifecycle stream and read the live `ConnectionHealth` snapshot from `client.health()`.
 */
// #region lifecycle-and-health
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
// #endregion lifecycle-and-health

/**
 * Two health-observation rails: a callback registered via {@link EspHomeClient.onHealthChange} and an async-iterable stream from
 * {@link EspHomeClient.healthStream}. Both fire on every state transition (connected -> stalled -> reconnecting -> disconnected). The synchronous {@link
 * EspHomeClient.health} read returns the live record at any point; uptime is derived from `connectedAtMs` via {@link connectionUptimeMs} rather than stored.
 */
// #region health-stream
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
// #endregion health-stream

/**
 * Read the structured capability record built from the negotiated API minor version, the device-info response, and the encrypted-transport flag. Consumers should
 * gate behavior on named capabilities rather than version numbers or raw bitfields.
 */
// #region capabilities
export function capabilitiesExample(client: EspHomeClient): void {

  const caps = client.capabilities();

  if(caps.voiceAssistant.supported && caps.voiceAssistant.apiAudio) {

    // Voice-assistant API audio routing is supported.
  }

  if(caps.bluetoothProxy.rawAdvertisements) {

    // Raw BLE advertisements are surfaced.
  }
}
// #endregion capabilities

/**
 * Production gating pattern. Two kinds of capability flow through {@link ClientCapabilities}; consumer code uses them differently:
 *
 *   - **Outbound-action gates.** The client wants to send a request that not every device understands. Demonstrated below: `voiceAssistant.supported` gates the
 *     subscribe call; `noiseKeyRotation` gates the key-set request. Sending the request to a device without support is wasted bytes (silent no-op or `success: false`
 *     after a round-trip), so the gate trades a capability lookup for the round-trip.
 *   - **Informational flags.** The decoder already handles forward-compatible wire-level features transparently...new optional fields decode automatically; new
 *     enum values pass through; new audio channels surface on the existing event when present. The capability flag documents the protocol generation the device
 *     speaks so application code can adapt rendering and allocation in advance:
 *       - `caps.voiceAssistant.stereoAudio` - pre-allocate two-channel buffers in the audio pipeline; the decoder surfaces `data2` on `voiceAssistantAudio` when
 *         the wire carries it.
 *       - `caps.lockOpenStates` - include `LockState.OPENING` / `LockState.OPEN` cases in the lock UI's state machine; pre-extension firmware never emits them.
 *       - `caps.climateTemperatureUnit` - read `entity.temperatureUnit` when true; treat as celsius otherwise (the field is absent from `ListEntitiesClimateResponse`
 *         on firmware without the extension).
 *       - `caps.clientDerivedObjectId` - documents that the server omits `object_id` and the decoder derives it client-side. The resulting `entity.objectId` is
 *         byte-identical to what an older device would have sent, so this flag is informational only - no consumer code needs to branch on it.
 *
 *     Informational flags do NOT gate the decoder itself...consumers narrow on the optional fields' presence (e.g., `entity.temperatureUnit !== undefined`) regardless
 *     of the flag's value.
 *
 * Version-gated capabilities derive from a single declarative table at `src/api-feature-versions.ts`. Subsystem-flag capabilities (`bluetoothProxy.*`,
 * `voiceAssistant.{announcements, apiAudio, speaker, ...}`) derive from `DeviceInfoResponse` feature-flag bits. The consumer code below treats both sources
 * identically...both are facts about the connected device, not implementation details to inspect version numbers for.
 */
// #region capability-feature-gating
export async function capabilityFeatureGatingExample(client: EspHomeClient): Promise<void> {

  const caps = client.capabilities();

  // Feature: voice-assistant subscribe. The handshake sends SUBSCRIBE_VOICE_ASSISTANT_REQUEST; sending it to a device without VA support is a silent no-op on the
  // wire but a confusing dead path for the consumer. Gate it.
  if(caps.voiceAssistant.supported) {

    client.voiceAssistant.subscribe();
  }

  // Feature: noise-key rotation. Devices below the rotation gate do not understand the request; the response would be `success: false` after a wasted round-trip.
  // Gate it. The version comparison is invisible here - `caps.noiseKeyRotation` is the named fact about the device, derived once at capability construction.
  if(caps.noiseKeyRotation && (process.env["ESPHOME_NEW_PSK"] !== undefined)) {

    await client.setNoiseEncryptionKey(process.env["ESPHOME_NEW_PSK"]);
  }
}
// #endregion capability-feature-gating

/**
 * Mint a branded entity id with {@link entityId}. The first argument is the entity type tag (one of the keys in `ENTITY_SCHEMAS`); the second is the
 * ESPHome object id (typically the YAML key). The mint lowercases the object id and produces an `EntityId<"light">` (or whichever type) the type system carries
 * through every command and telemetry surface.
 */
// #region entity-id-construction
export function entityIdConstructionExample(client: EspHomeClient): void {

  // Brand mint - the type carries through to client.command's options narrowing.
  const bedroomLamp = entityId("light", "bedroom_lamp");
  const frontDoor = entityId("switch", "front_door");
  const livingRoomTemp = entityId("sensor", "living_room_temperature");

  client.command(bedroomLamp, { state: true });
  client.command(frontDoor, { state: false });

  // Sensor entities have no command surface (read-only); referencing the brand at the right call site keeps the type checker honest.
  void client.latest(livingRoomTemp);
}
// #endregion entity-id-construction

/**
 * Narrow an untrusted string into a branded id. {@link parseEntityId} returns the parsed `{ type, id }` pair when the string is well-formed, or `null` otherwise.
 * {@link isEntityId} is a type predicate for the "I know which type I expect" path. Use {@link EspHomeClient.hasEntity} after the brand narrowing
 * to confirm the entity is registered on the current connection.
 */
// #region entity-id-narrowing
export function entityIdNarrowingExample(client: EspHomeClient, untrusted: string): void {

  // Path 1: "I expect a light id". The predicate narrows the string to EntityId<"light">.
  if(isEntityId(untrusted, "light") && client.hasEntity(untrusted)) {

    client.command(untrusted, { state: true });

    return;
  }

  // Path 2: "I don't know which type". Parse first, then dispatch on the tag. The id field is EntityId<EntityType> at this stage; switch on `type` to narrow
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
// #endregion entity-id-narrowing

/**
 * The three discovery rails. The `entities` event fires once per connect, after `LIST_ENTITIES_DONE_RESPONSE`.
 * {@link EspHomeClient.getAvailableEntityIds} groups the discovered ids by type for "what can I control?" UIs.
 * {@link EspHomeClient.getEntityById} resolves a branded id to the full {@link Entity} record (carrying type-specific metadata like
 * a light's `effects` list or a number's `min`/`max`/`step`).
 */
// #region discovery-walkthrough
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
// #endregion discovery-walkthrough

/**
 * Resolve a branded id to the protocol-level numeric key. Most consumer code never needs this; the key is only relevant for protocol-level integrations that bridge
 * directly to the ESPHome wire format (custom encoders, packet captures, low-level telemetry filtering).
 */
// #region entity-key-resolution
export function entityKeyResolutionExample(client: EspHomeClient, lightId: EntityId<"light">): void {

  const key = client.getEntityKey(lightId);

  if(key !== null) {

    void key;
  }
}
// #endregion entity-key-resolution

/**
 * Read the device's metadata via {@link EspHomeClient.deviceInfo}. The record is null until the discovery handshake completes; afterwards it stays
 * valid for the lifetime of the session and refreshes on every reconnect. The returned object is a shallow copy - mutating it does not affect the client's internal
 * state.
 */
// #region device-info
export function deviceInfoExample(client: EspHomeClient): void {

  const info = client.deviceInfo();

  if(info) {

    void info.name;
    void info.esphomeVersion;
    void info.macAddress;
    void info.apiEncryptionSupported;
  }
}
// #endregion device-info

/**
 * Multi-device parents host a fleet of sub-devices addressed by `device_id` on the wire. {@link EspHomeClient.subDevices} enumerates them; {@link
 * EspHomeClient.entitiesByDevice} filters the entity list by parent. Pass `0` to scope to the parent ESP, a positive id to scope to a sub-device, or `undefined` to
 * return everything regardless of device.
 */
// #region sub-device-enumeration
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
// #endregion sub-device-enumeration

/**
 * Read the cached most-recent state for one entity. The cache is updated **before** listeners are notified, so a `client.latest(id)` read from inside an
 * `on("telemetry")` or per-type listener sees the event that fired the listener. Returns null when no state has been recorded since the most recent connect.
 */
// #region latest-state-lookup
export function latestStateLookupExample(client: EspHomeClient, lightId: EntityId<"light">): void {

  const latest = client.latest(lightId);

  if(latest?.state === true) {

    // The entity's last-known on/off state. brightness, colorTemperature, rgb fields are typed against the schema.
    void latest.brightness;
    void latest.effect;
  }
}
// #endregion latest-state-lookup

/**
 * Read the latest-state cache as a snapshot at any point. The snapshot is a live view; the cache is updated **before** listeners are notified, so a
 * `client.snapshot()` iteration inside an `on("telemetry")` or per-type listener already includes the event that fired the listener.
 */
// #region snapshot
export function snapshotExample(client: EspHomeClient): void {

  // Full snapshot: every entity that has emitted at least one state event since the most recent connect.
  const all = client.snapshot();

  void all.size;

  // Type-narrowed snapshot: only light entities, returned as a fresh `Map<EntityId<"light">, StateEventFor<typeof ENTITY_SCHEMAS["light"]>>`.
  const lights = client.snapshotFor("light");

  void lights.size;
}
// #endregion snapshot

/**
 * Compose the public primitives (`on("telemetry")`, `snapshot()`, `entitiesByDevice()`, `AbortSignal.any`) into a deterministic "wait until a chosen entity set has
 * produced state" gate. This library does not ship a `waitForInitialState` method because the right completion predicate is consumer-specific: button entities
 * are stateless, event entities only fire on real events, and some schemas declare `missingState` so the firmware may legitimately suppress a first state response
 * under some configurations. The caller is the only party that knows which subset must report before "constructed" is meaningful, which is why `predicate` is
 * required rather than defaulted.
 *
 * The cache contract (mutate-then-notify; see {@link EspHomeClient.snapshot}) is what makes the predicate check inside the listener correct...the
 * just-emitted event is already in the snapshot when the listener runs, so a same-tick read returns the up-to-date view without needing a microtask hop.
 *
 * The listener must outlive the function's synchronous setup block, so its lifetime is managed via `Promise.withResolvers()` + a single `.finally(...)` cleanup
 * site. A `using` declaration would not work here...`using` disposes at declaring-function exit, which fires before any asynchronous telemetry event can reach the
 * handler.
 *
 * @param client - The connected ESPHome client.
 * @param predicate - Required filter over the parent-device entities (`entitiesByDevice(0)`); every matching entity must produce a state event before the gate resolves.
 * @param options - Optional `signal` (composed with the internal timeout via `AbortSignal.any`) and `timeoutMs` (default 5000).
 * @returns A read-only snapshot at the moment every expected entity has produced state.
 * @throws DOMException with `name` `"TimeoutError"` when `timeoutMs` elapses, or `"AbortError"` when the caller's signal aborts.
 */
// #region connect-then-construct
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
// #endregion connect-then-construct

/**
 * Send a typed command to a light entity and await the matching state-event response. `command<T>` is the canonical entry point; `commandAndAwait<T>` adds a default
 * 2000ms deadline and reuses the entity-id brand to narrow the options shape.
 */
// #region command-and-await
export async function commandAndAwaitExample(client: EspHomeClient): Promise<void> {

  const lampId = entityId("light", "office_lamp");

  const result = await client.commandAndAwait(lampId, { brightness: 0.6, state: true });

  void result.brightness;
}
// #endregion command-and-await

/**
 * Light command surface. The schema's `rgb: { r, g, b }` ergonomic flattens to wire `red`/`green`/`blue`/`hasRgb` via the runtime adapter; the consumer never
 * touches the flat fields. Brightness, color temperature (Kelvin -> mireds is the consumer's responsibility), color modes, and effects are scalar fields on the same
 * options object.
 */
// #region light-command
export async function lightCommandExample(client: EspHomeClient): Promise<void> {

  const livingRoom = entityId("light", "living_room_lamp");

  // RGB plus brightness plus an effect, all in one command. The transitionLength field is in milliseconds.
  client.command(livingRoom, {

    brightness: 0.8,
    effect: "Slow Pulse",
    rgb: { b: 0.2, g: 0.5, r: 1.0 },
    state: true,
    transitionLength: 1000
  });

  // Color-temperature mode. The colorTemperature field is in mireds (1000000 / Kelvin).
  await client.commandAndAwait(livingRoom, { brightness: 0.5, colorTemperature: 250, state: true });
}
// #endregion light-command

/**
 * Switch entities are simple boolean controls. The await-form returns the matching state event after the device confirms.
 */
// #region switch-command
export async function switchCommandExample(client: EspHomeClient): Promise<SwitchEvent> {

  const frontDoor = entityId("switch", "front_door_relay");

  return client.commandAndAwait(frontDoor, { state: true });
}
// #endregion switch-command

/**
 * Cover entities support absolute position (0.0 closed -> 1.0 fully open), tilt (where supported), and explicit stop. Mid-motion `currentOperation` surfaces on the
 * state event as `IS_OPENING` / `IS_CLOSING` / `IDLE` and narrows to the {@link CoverOperation} literal-union via the schema's state-side enumMappings.
 */
// #region cover-command
export async function coverCommandExample(client: EspHomeClient): Promise<CoverEvent> {

  const garage = entityId("cover", "garage_door");

  // Subscribe to operation transitions with an exhaustive switch. The narrowed event.currentOperation accepts only CoverOperation members; adding a new rail upstream
  // and forgetting to update this switch becomes a tsc error at the `_exhaustive: never` assignment.
  using subscription = client.on("cover", (event) => {

    if(event.currentOperation === undefined) {

      return;
    }

    switch(event.currentOperation) {

      case CoverOperation.IDLE: {

        // Motion finished. Update the UI to the resting state.
        break;
      }

      case CoverOperation.IS_OPENING: {

        // Cover is opening. Show the opening indicator.
        break;
      }

      case CoverOperation.IS_CLOSING: {

        // Cover is closing. Show the closing indicator.
        break;
      }

      default: {

        const _exhaustive: never = event.currentOperation;

        void _exhaustive;
      }
    }
  });

  void subscription;

  // Drive to half-open, then await the IDLE state event that signals motion completion. We compare against the named CoverOperation.IDLE constant rather than the raw
  // wire number so the predicate stays readable and survives future ESPHome wire-enum additions.
  client.command(garage, { position: 0.5 });

  return await client.commandAndAwait(garage, { position: 0.5 }, {

    predicate: (event): boolean => event.currentOperation === CoverOperation.IDLE,
    timeoutMs: 30000
  });
}
// #endregion cover-command

/**
 * Climate command surface. Modes accept either the {@link ClimateMode} numeric constant or the matching string key from the schema's enum mapping ("auto", "cool",
 * "heat", "off", etc.). Two-point setpoints (`targetTemperatureLow` / `targetTemperatureHigh`) drive heat-cool mode; the single `targetTemperature` drives every
 * other mode.
 */
// #region climate-command
export async function climateCommandExample(client: EspHomeClient): Promise<ClimateEvent> {

  const thermostat = entityId("climate", "main_floor");

  return client.commandAndAwait(thermostat, {

    fanMode: "auto",
    mode: ClimateMode.HEAT_COOL,
    preset: "home",
    swingMode: "off",
    targetTemperatureHigh: 24,
    targetTemperatureLow: 20
  });
}
// #endregion climate-command

/**
 * Fan entities accept boolean state, integer speed levels (`speedLevel`), oscillation, direction, and string preset modes. Direction values come from the schema's
 * enum mapping ("forward" | "reverse").
 */
// #region fan-command
export async function fanCommandExample(client: EspHomeClient): Promise<FanEvent> {

  const ceilingFan = entityId("fan", "bedroom_ceiling");

  return client.commandAndAwait(ceilingFan, {

    direction: "forward",
    oscillating: true,
    presetMode: "summer",
    speedLevel: 3,
    state: true
  });
}
// #endregion fan-command

/**
 * Media player commands enumerate via {@link MediaPlayerCommand}: PLAY / PAUSE / STOP / MUTE / UNMUTE / TOGGLE / VOLUME_UP / VOLUME_DOWN / etc. Volume is a 0.0-1.0
 * float; `mediaUrl` plays a URL; `announcement: true` flags a TTS announcement so the player ducks/restores prior playback. The companion {@link MediaPlayerState}
 * constant narrows inbound `event.state` against the schema's state-side enumMappings so an exhaustive switch over playback state is verified at compile time.
 */
// #region media-player-command
export async function mediaPlayerCommandExample(client: EspHomeClient): Promise<MediaPlayerEvent> {

  const speaker = entityId("media_player", "kitchen_speaker");

  using subscription = client.on("media_player", (event) => {

    if(event.state === undefined) {

      return;
    }

    switch(event.state) {

      case MediaPlayerState.NONE:
      case MediaPlayerState.IDLE: {

        // Stopped or no media loaded. Show the idle UI.
        break;
      }

      case MediaPlayerState.PLAYING: {

        // Active playback. Update the play/pause toggle to "playing".
        break;
      }

      case MediaPlayerState.PAUSED: {

        // Paused. Update the play/pause toggle to "paused".
        break;
      }

      case MediaPlayerState.ANNOUNCING: {

        // TTS announcement in progress. Suppress unrelated UI changes until the next state.
        break;
      }

      case MediaPlayerState.OFF:
      case MediaPlayerState.ON: {

        // Power-state transitions on speakers that surface them. Reflect the badge.
        break;
      }

      default: {

        const _exhaustive: never = event.state;

        void _exhaustive;
      }
    }
  });

  void subscription;

  // Play a URL at half volume.
  client.command(speaker, {

    command: MediaPlayerCommand.PLAY,
    mediaUrl: "https://stream.example.com/playlist.m3u8",
    volume: 0.5
  });

  // Mute and await the matching state.
  return await client.commandAndAwait(speaker, { command: MediaPlayerCommand.MUTE });
}
// #endregion media-player-command

/**
 * Lock entities accept lock/unlock/open commands via {@link LockCommand} (or the matching string keys), with an optional unlock code for code-protected locks. The
 * companion {@link LockState} constant covers the inbound state values so callers can narrow telemetry without redeclaring the wire enum.
 */
// #region lock-command
export async function lockCommandExample(client: EspHomeClient): Promise<LockEvent> {

  const frontDoor = entityId("lock", "front_door_deadbolt");

  // Subscribe to lock telemetry. Narrowing on LockState.* keeps the handler readable and survives future ESPHome wire-enum additions; the alternative is comparing
  // against magic numbers (1 / 2 / 3) and re-deriving their meaning at every call site. The schema's state-side enumMappings narrows event.state from plain `number` to
  // the LockState literal-union, so the exhaustive switch below is verified at compile time - forgetting a rail makes the `_exhaustive: never` assignment in default
  // fail to type-check.
  using subscription = client.on("lock", (event) => {

    if(event.state === undefined) {

      return;
    }

    switch(event.state) {

      case LockState.NONE: {

        // No state reported yet. Treat as 'unknown' and wait for the next update.
        break;
      }

      case LockState.LOCKED: {

        // The lock is secured. Update the UI badge accordingly.
        break;
      }

      case LockState.UNLOCKED: {

        // The lock is unlocked (latch retracted) but the door may still be physically closed. Clear the secured badge.
        break;
      }

      case LockState.OPEN: {

        // The door is physically open. Distinct from UNLOCKED, which only means the latch is retracted. Emitted only by firmware that advertises API minor 14 or
        // higher with the lock-open extension; pre-extension firmware never emits this value. Gate via `client.capabilities().lockOpenStates` if UI logic needs to
        // short-circuit pre-extension devices.
        break;
      }

      case LockState.JAMMED: {

        // Hardware fault. Surface an alert so the user can intervene physically.
        break;
      }

      case LockState.LOCKING:
      case LockState.UNLOCKING:
      case LockState.OPENING: {

        // Transitional state. Show a spinner; the next event will be a terminal LOCKED / UNLOCKED / OPEN / JAMMED. `OPENING` is emitted alongside `OPEN` by
        // firmware that advertises API minor 14 or higher with the lock-open extension; firmware without it uses `UNLOCKING` for the same transition.
        break;
      }

      default: {

        // Compile-time exhaustiveness sentinel. Adding a new LockState rail upstream and forgetting to update this switch becomes a tsc error here, not a silent fall-
        // through. If a future ESPHome wire-enum extension surfaces a value not in the current LockState union, the runtime falls into this branch and we can route it
        // through whatever fallback the consumer prefers (typically logging the unknown numeric value for diagnosis).
        const _exhaustive: never = event.state;

        void _exhaustive;
      }
    }
  });

  // Discard the Disposable explicitly so the type-checker stops complaining about an unused binding. The `using` keyword above does the real disposal at scope exit.
  void subscription;

  // Unlock with a code, then await the next state event the device emits. We `await` here so the `using` subscription above stays installed across the round-trip; the
  // ESLint rule that enforces `return await` in a using-scope confirms this is the canonical shape.
  return await client.commandAndAwait(frontDoor, { code: process.env["DOOR_CODE"] ?? "", command: LockCommand.UNLOCK });
}
// #endregion lock-command

/**
 * Alarm-control-panel commands accept {@link AlarmControlPanelCommand} enum values (or the matching string keys: "arm_away", "arm_home", "arm_night", "disarm",
 * "trigger", etc.) plus an optional code for code-protected panels. The await-form here additionally narrows the response state through
 * {@link AlarmControlPanelState} so the predicate compares against a named rail rather than a wire-numeric magic value.
 */
// #region alarm-control-panel-command
export async function alarmControlPanelCommandExample(client: EspHomeClient): Promise<AlarmControlPanelEvent> {

  const panel = entityId("alarm_control_panel", "house_alarm");

  return client.commandAndAwait(panel, {

    code: process.env["ALARM_CODE"] ?? "",
    command: AlarmControlPanelCommand.ARM_AWAY
  }, {

    // The schema's state-side enumMappings narrows event.state to the AlarmControlPanelState literal-union, so this comparison is a typed compile-time check rather
    // than a stringly-numeric guess. Forgetting which numeric value corresponds to "armed away" is no longer a thing the consumer has to remember.
    predicate: (event): boolean => event.state === AlarmControlPanelState.ARMED_AWAY,
    timeoutMs: 30000
  });
}
// #endregion alarm-control-panel-command

/**
 * Siren entities accept boolean state, an optional tone string, an integer duration in seconds (the runtime adapter rounds floats), and a 0.0-1.0 volume.
 */
// #region siren-command
export async function sirenCommandExample(client: EspHomeClient): Promise<SirenEvent> {

  const siren = entityId("siren", "yard_siren");

  return client.commandAndAwait(siren, {

    duration: 5,
    state: true,
    tone: "alarm",
    volume: 1.0
  });
}
// #endregion siren-command

/**
 * Buttons are stateless triggers. {@link EspHomeClient.command} sends BUTTON_COMMAND_REQUEST; there is no matching state response, so {@link
 * EspHomeClient.commandAndAwait} would not type-check (the entity type is excluded by design).
 */
// #region button-command
export function buttonCommandExample(client: EspHomeClient): void {

  const reboot = entityId("button", "reboot_now");

  client.command(reboot, {});
}
// #endregion button-command

/**
 * Simple value entities. Number takes a float, select takes one of the discovered options strings, text takes a free-form string. Date/datetime/time take their
 * respective field-shaped values; missingState on the inbound side flags an "unset" entity.
 */
// #region number-select-text-command
export async function numberSelectTextCommandExample(client: EspHomeClient): Promise<void> {

  const setpoint = entityId("number", "boiler_setpoint");
  const mode = entityId("select", "thermostat_mode");
  const greeting = entityId("text", "wake_word_response");
  const wakeAt = entityId("datetime", "next_alarm");

  client.command(setpoint, { state: 21.5 });
  client.command(mode, { state: "Eco" });
  client.command(greeting, { state: "Welcome home" });
  client.command(wakeAt, { epochSeconds: Math.floor(Date.now() / 1000) + 3600 });

  await client.commandAndAwait(setpoint, { state: 22.0 });
}
// #endregion number-select-text-command

/**
 * Iterate every state event the client receives. The stream survives reconnects; the `signal` aborts the iterator cleanly and tears down the underlying
 * subscription.
 */
// #region telemetry-stream
export async function telemetryStreamExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetry({ signal: AbortSignal.timeout(60000) })) {

    void event.type;
    void event.entity;
  }
}
// #endregion telemetry-stream

/**
 * Iterate state events for one entity type. The result is type-narrowed to the matching {@link StateEventFor} variant - light events expose
 * `brightness` / `colorTemperature` / `effect`; switch events expose just `state`; etc.
 */
// #region telemetry-stream-per-type
export async function telemetryStreamPerTypeExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetryFor("light", { signal: AbortSignal.timeout(60000) })) {

    // Each event is a LightEvent; the discriminated union narrowing happens at the channel boundary.
    void event.brightness;
    void event.effect;
    void event.state;
  }
}
// #endregion telemetry-stream-per-type

/**
 * Iterate state events for one specific entity. The branded id resolves to a numeric key once at iteration start; the per-event filter is O(1).
 */
// #region telemetry-stream-per-id
export async function telemetryStreamPerIdExample(client: EspHomeClient): Promise<void> {

  const sensor = entityId("sensor", "living_room_temperature");

  for await (const event of client.telemetryForId(sensor, { signal: AbortSignal.timeout(60000) })) {

    void event.state;
    void event.missingState;
  }
}
// #endregion telemetry-stream-per-id

/**
 * Web Streams adapters for the protocol-level streams (telemetry, logs, lifecycle, voice-assistant audio, camera images). Each is a `ReadableStream.from(...)` over
 * the matching async-iterable; the underlying backpressure policy carries through the adapter.
 */
// #region web-streams-interop
export function webStreamsInteropExample(client: EspHomeClient): void {

  // Telemetry as a ReadableStream consumable by any Web Streams pipeline (compression, batching, fan-out via tee()).
  const stream: ReadableStream = client.telemetryReadable({ backpressure: "dropOldest", highWaterMark: 256 });

  void stream;

  // Lifecycle, logs, voice-assistant audio, and per-camera images all expose matching readable adapters.
  void client.lifecycleReadable();
  void client.logsReadable(LogLevel.INFO);
  void client.voiceAssistant.audioReadable();
}
// #endregion web-streams-interop

/**
 * Stream backpressure policy controls what happens when a slow consumer falls behind the producer. `dropOldest` (the default) keeps the freshest sample. `dropNewest`
 * keeps the earliest sample. `throw` raises {@link BackpressureError} carrying the dropped-item count - useful when correctness depends on no events being lost.
 */
// #region backpressure-policy
export async function backpressurePolicyExample(client: EspHomeClient): Promise<void> {

  // Default: drop the oldest item under load. Optimized for "I want a recent sample, not the full backlog."
  for await (const event of client.telemetry({ backpressure: "dropOldest", highWaterMark: 64 })) {

    void event;
  }

  // Throw on overflow. Pair with a try/catch that responds to BackpressureError specifically.
  try {

    for await (const event of client.telemetry({ backpressure: "throw", highWaterMark: 32 })) {

      void event;
    }

  } catch(error) {

    void error;
  }
}
// #endregion backpressure-policy

/**
 * Subscribe to device log messages at a chosen verbosity. The first iterator opened sends `SUBSCRIBE_LOGS_REQUEST(level)` on the wire; opening a second iterator at
 * a higher verbosity upgrades the device-side subscription. ESPHome has no unsubscribe path, so the subscription persists at the highest level any iterator has
 * requested for the lifetime of the connection.
 */
// #region log-subscription
export async function logSubscriptionExample(client: EspHomeClient): Promise<void> {

  for await (const log of client.logs(LogLevel.DEBUG, { signal: AbortSignal.timeout(60000) })) {

    if(log.level <= LogLevel.WARN) {

      void log.message;
    }
  }
}
// #endregion log-subscription

/**
 * The typed error hierarchy lets consumers `instanceof`-check without parsing log strings. Every distinct failure mode has its own class; subclasses carry
 * narrowed code unions ({@link NoiseHandshakeError.code}, {@link BackpressureError.dropped}) for precise dispatch.
 *
 * The narrowing chain below progresses from most-specific to most-general. Encryption errors (all extending {@link PermanentError}) come first because they signal
 * configuration mistakes the auto-reconnect loop should not retry. Noise-handshake subclasses come next so the timeout / peer-closed cases can branch separately
 * from the generic noise failure. The structural families ({@link HandshakeError}, {@link ConnectionError}, {@link ProtocolError}) are the catch-all rails - any
 * subclass not enumerated above falls into the appropriate family branch. {@link EspHomeError} is the final library-level rail before the bare-`Error` re-throw.
 */
// #region error-class-enumeration
export async function errorClassEnumerationExample(): Promise<void> {

  try {

    await openEspHomeClient({ host: "unreachable.local", psk: null });

  } catch(error) {

    // Permanent encryption-configuration mistakes. Each extends PermanentError; auto-reconnect skips them by default.
    if(error instanceof EncryptionKeyMissingError) {

      // Device requires encryption but no PSK was supplied.
      return;
    }

    if(error instanceof EncryptionKeyInvalidError) {

      // PSK is the wrong length or the device rejected it.
      return;
    }

    if(error instanceof EncryptionRequiredError) {

      // Server requires noise but the client opted into plaintext.
      return;
    }

    if(error instanceof NegotiationFailedError) {

      // Device announced an API major version outside the client's supported range.
      return;
    }

    // Noise-handshake-specific failures. Order matters: the timeout and peer-closed subclasses must come before the NoiseHandshakeError parent so the tagged
    // `code` field on those subclasses (HANDSHAKE_TIMEOUT / PEER_CLOSED_NOISE / PEER_PLAINTEXT_DURING_NOISE) does not collapse into the parent branch.
    if(error instanceof NoiseHandshakeTimeoutError) {

      // Per-step handshake timeout elapsed.
      return;
    }

    if(error instanceof PeerClosedDuringNoiseError) {

      // Peer closed mid-handshake or sent a plaintext indicator byte.
      void error.code;

      return;
    }

    if(error instanceof NoiseHandshakeError) {

      // Generic noise-protocol failure; inspect `code` for the specific cause.
      void error.code;

      return;
    }

    if(error instanceof PlaintextHandshakeError) {

      // Plaintext handshake (server-name mismatch, unexpected response).
      return;
    }

    // Transport-level transient failures. Each extends ConnectionError; auto-reconnect retries them by default.
    if(error instanceof ConnectionRefusedError) {

      // TCP refused (device offline or port closed).
      return;
    }

    if(error instanceof ConnectionTimeoutError) {

      // TCP did not establish before the deadline.
      return;
    }

    if(error instanceof HeartbeatStalledError) {

      // Inbound activity stopped past the stall budget; connection presumed dead.
      return;
    }

    if(error instanceof ConnectionClosedByPeerError) {

      // Peer closed the socket cleanly or unexpectedly mid-session.
      return;
    }

    if(error instanceof HandshakeError) {

      // Catch-all for any handshake subclass not enumerated above (forward-compat).
      return;
    }

    if(error instanceof ConnectionError) {

      // Catch-all for any connection-family subclass not enumerated above. Auto-reconnect handles the recovery when enabled.
      return;
    }

    // Wire-protocol failures. Each extends ProtocolError; typically indicates malformed device firmware output.
    if(error instanceof FrameTooLargeError) {

      // Inbound frame exceeded `maxFrameBytes`.
      return;
    }

    if(error instanceof BufferOverflowError) {

      // Receive buffer accumulated more than `maxRecvBufferBytes` without producing a complete frame.
      return;
    }

    if(error instanceof ProtocolError) {

      // Catch-all for any protocol-family subclass not enumerated above (decode errors, unknown indicator bytes, etc.).
      return;
    }

    // Backpressure on a stream subscriber operating in `backpressure: "throw"` mode. Carries `dropped` for diagnostics.
    if(error instanceof BackpressureError) {

      void error.dropped;

      return;
    }

    // Operational stream-closed: the bus stream backing `camera(id).snapshot()` ended (transport dropped) before an image arrived. Carries the branded `cameraId`
    // and the tagged `STREAM_CLOSED` code so a consumer awaiting multiple cameras can correlate which snapshot failed.
    if(error instanceof CameraStreamClosedError) {

      void error.cameraId;
      void error.code;

      return;
    }

    // Library-level catch-all. Any EspHomeError subclass not narrowed above (ConfigurationError from a misuse path, etc.) falls here.
    if(error instanceof EspHomeError) {

      return;
    }

    // Not from this library.
    throw error;
  }
}
// #endregion error-class-enumeration

/**
 * {@link EspHomeClient.commandAndAwait} surfaces a handful of distinct rejection paths: {@link ConfigurationError} codes (`MALFORMED_ENTITY_ID`,
 * `UNKNOWN_ENTITY_ID`, `AWAIT_STREAM_CLOSED`) for id and discovery failures, plus {@link DOMException} for the abort/timeout cases. The fire-and-forget
 * {@link EspHomeClient.command} never throws - it logs and drops on encoder failures and unknown ids.
 */
// #region command-error-handling
export async function commandErrorHandlingExample(client: EspHomeClient, lightId: EntityId<"light">): Promise<void> {

  try {

    await client.commandAndAwait(lightId, { state: true }, { signal: AbortSignal.timeout(2000) });

  } catch(error) {

    if(error instanceof ConfigurationError) {

      switch(error.code) {

        case "MALFORMED_ENTITY_ID":

          // The supplied id was not a valid `${type}-${objectId}` brand.
          break;

        case "UNKNOWN_ENTITY_ID":

          // The id parses but the entity is not registered on the current connection - typically discovery has not completed.
          break;

        case "AWAIT_STREAM_CLOSED":

          // The connection dropped before the matching state event arrived.
          break;
      }

      return;
    }

    if((error instanceof DOMException) && ((error.name === "AbortError") || (error.name === "TimeoutError"))) {

      // Caller signal aborted or the 2000ms default deadline elapsed.
      return;
    }

    throw error;
  }
}
// #endregion command-error-handling

/**
 * The {@link PermanentError} marker classifies errors that auto-reconnect should not retry. The library currently throws these PermanentError subclasses:
 * {@link EncryptionKeyMissingError}, {@link EncryptionKeyInvalidError}, {@link EncryptionRequiredError}, and {@link NegotiationFailedError}. Two further subclasses
 * are part of the public hierarchy without a current throw site: {@link AuthenticationError} is available to consumer-supplied wrappers that authenticate
 * against a custom transport, and {@link IncompatibleApiVersionError} is retained for backward compatibility with consumers that narrowed on it before
 * {@link NegotiationFailedError} existed. Consumer-supplied retry logic should mirror the same split: stop on permanent, back off on transient.
 */
// #region permanent-vs-transient
export async function permanentVsTransientExample(): Promise<void> {

  let attempts = 0;

  while(attempts < 10) {

    try {

      // The connect attempt is intentionally sequential inside the retry loop - parallelism would defeat the backoff that ramps after each failure.
      // eslint-disable-next-line no-await-in-loop
      const client = await openEspHomeClient({ host: "lab.local", psk: null });

      void client;

      return;

    } catch(error) {

      if(error instanceof PermanentError) {

        // Permanent failure: bubble up, the situation will not improve by retrying.
        throw error;
      }

      attempts++;

      // The retry loop is intentionally sequential because each attempt must observe the result of the previous one before deciding whether to back off.
      // eslint-disable-next-line no-await-in-loop
      await delay(500 * (2 ** attempts));
    }
  }
}
// #endregion permanent-vs-transient

/**
 * Subscribe to voice-assistant requests, stream audio chunks back, and trigger a TTS announcement. The sub-API is lazily instantiated via `client.voiceAssistant`;
 * its lifetime is the client's, surviving reconnects.
 */
// #region voice-assistant
export async function voiceAssistantExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  for await (const audio of va.audio({ signal: AbortSignal.timeout(30000) })) {

    void audio.data;
    void audio.end;
  }

  await va.announce({ text: "Doorbell rang" }, { timeoutMs: 5000 });
}
// #endregion voice-assistant

/**
 * The canonical request/respond handshake. When the device sends `VoiceAssistantRequest` with `start=true`, it expects the client to acknowledge via
 * `VoiceAssistantResponse` (wire id 91) before streaming audio. The consumer chooses per-request whether to accept the pipeline (default, API audio), accept with
 * UDP audio on a consumer-owned port, or decline.
 *
 * The two `for await` loops run independently: the request loop drives the handshake, the audio loop drains inbound chunks. The library never auto-acknowledges -
 * the explicit `respondToRequest()` call is the protocol contract surfaced at the call site.
 */
// #region voice-assistant-respond
export async function voiceAssistantRespondExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe(VoiceAssistantSubscribeFlag.API_AUDIO);

  // Inbound: drain audio in parallel. Audio reception is independent of the request/respond handshake.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Handshake: for each start request, accept with API audio (the default and most common path). The no-args call mirrors `{ port: 0, error: false }`.
  for await (const request of va.requests({ signal: AbortSignal.timeout(60000) })) {

    if(!request.start) {

      continue;
    }

    va.respondToRequest();

    // Alternative shapes for completeness - uncomment to use the UDP-audio path (the consumer must open the listener separately via `node:dgram`):
    //   va.respondToRequest({ port: 12345 });
    //
    // ...or decline the pipeline (transient capacity, policy rejection, configuration mismatch):
    //   va.respondToRequest({ error: true });
  }
}
// #endregion voice-assistant-respond

/**
 * Bidirectional audio streaming. Inbound audio arrives as `VoiceAssistantAudioData` chunks via {@link VoiceAssistantApi.audio}; outbound audio
 * goes back via {@link VoiceAssistantApi.sendAudio}. The `end` flag marks the last chunk in either direction.
 */
// #region voice-assistant-streaming
export async function voiceAssistantStreamingExample(client: EspHomeClient, generator: AsyncIterable<{ data: Buffer; end: boolean }>): Promise<void> {

  const va = client.voiceAssistant;

  va.subscribe();

  // Inbound: drain device audio into your STT pipeline.
  void (async (): Promise<void> => {

    for await (const chunk of va.audio({ signal: AbortSignal.timeout(60000) })) {

      void chunk.data;
      void chunk.end;
    }
  })();

  // Outbound: pipe synthesized audio back to the device.
  for await (const chunk of generator) {

    va.sendAudio(chunk.data, chunk.end);
  }

  // Pipeline events let the device update its UI (wake-word LED, processing indicator, error state) in lockstep with the assistant's state machine.
  va.sendEvent(VoiceAssistantEvent.RUN_START);
}
// #endregion voice-assistant-streaming

/**
 * Trigger a TTS announcement. The await resolves with the success flag from the device's `voiceAssistantAnnounceFinished` response; the default 5000ms timeout is
 * configurable via `awaitOptions.timeoutMs`. Pre-subscribes to the matching response event before issuing the wire request so a fast device cannot beat the listener.
 */
// #region voice-assistant-announce
export async function voiceAssistantAnnounceExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;

  const success = await va.announce({

    conversationId: "doorbell-2026-05-08",
    preannounceMediaId: "https://media.example.com/chime.mp3",
    startConversation: false,
    text: "Someone is at the front door"
  }, { signal: AbortSignal.timeout(8000) });

  void success;
}
// #endregion voice-assistant-announce

/**
 * Forward Home Assistant timer events to the device so the speaker UI shows running timers. This is an outbound-only surface; the client does not expose a
 * corresponding inbound timer event.
 */
// #region voice-assistant-timer
export function voiceAssistantTimerExample(client: EspHomeClient): void {

  client.voiceAssistant.sendTimerEvent({

    eventType: 0,
    isActive: true,
    name: "Tea timer",
    secondsLeft: 180,
    timerId: "tea-2026-05-08",
    totalSeconds: 180
  });
}
// #endregion voice-assistant-timer

/**
 * Read the device's voice-assistant configuration (available + active wake words, max active count). The first call issues the wire request; subsequent calls return
 * the cached value unless `refresh: true` is supplied. Push a new active-wake-word list with {@link VoiceAssistantApi.setActiveWakeWords}.
 */
// #region voice-assistant-configuration
export async function voiceAssistantConfigurationExample(client: EspHomeClient): Promise<void> {

  const va = client.voiceAssistant;
  const config = await va.configuration({ signal: AbortSignal.timeout(5000) });

  for(const wakeWord of config.availableWakeWords) {

    void wakeWord.id;
    void wakeWord.wakeWord;
    void wakeWord.trainedLanguages;
  }

  // Activate at most `maxActiveWakeWords` ids. An empty array clears all active wake words.
  va.setActiveWakeWords(config.availableWakeWords.slice(0, config.maxActiveWakeWords).map((w) => w.id));
}
// #endregion voice-assistant-configuration

/**
 * Capture one image. The await composes the caller's optional signal with a 5000ms timeout; multi-packet reassembly is owned by the sub-API. Repeated `client.camera(id)`
 * calls return the same instance for the lifetime of the client.
 *
 * Two operational rejection paths the consumer narrows on: {@link DOMException} (timeout or caller abort) and {@link CameraStreamClosedError} (the transport
 * disconnected before any image arrived for this camera id - the typed error carries `code: "STREAM_CLOSED"` and the branded `cameraId` so consumers awaiting multiple
 * cameras can correlate the rejection).
 */
// #region camera-snapshot
export async function cameraSnapshotExample(client: EspHomeClient): Promise<Nullable<Buffer>> {

  const camId = entityId("camera", "front_door");
  const cam = client.camera(camId);

  try {

    return await cam.snapshot({ signal: AbortSignal.timeout(8000) });

  } catch(error) {

    if(error instanceof CameraStreamClosedError) {

      // Transport disconnected mid-snapshot. The `code` tag is `STREAM_CLOSED`; `cameraId` names the failing camera for log correlation.
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
// #endregion camera-snapshot

/**
 * Stream images continuously. The async iterator self-terminates when the consumer breaks; the device-side stream is kept alive only while at least one consumer is
 * iterating. Use {@link CameraApi.readable} for the matching Web Streams adapter.
 */
// #region camera-stream
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
// #endregion camera-stream

/**
 * Subscribe to inbound Home Assistant action calls. The device fires `homeassistantService` events whenever its YAML configuration triggers a `homeassistant.action`
 * or `homeassistant.service` block. The subscription is connection-scoped; re-call after every reconnect.
 */
// #region home-assistant-services
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
// #endregion home-assistant-services

/**
 * Bridge ESPHome's Home-Assistant-state-import requests. The device fires `homeassistantStateRequest` when it wants the current value of a Home Assistant entity
 * (typically a sensor or template the YAML imports). The consumer answers via `client.homeAssistant.sendState`. The subscription is connection-scoped;
 * re-issue on every reconnect (typically inside a `withReconnect` body or a lifecycle-stream `connect` handler).
 */
// #region home-assistant-state-bridge
export function homeAssistantStateBridgeExample(client: EspHomeClient, lookup: (entity: string, attribute: string) => string): void {

  client.homeAssistant.subscribeStates();

  using sub = client.on("homeassistantStateRequest", (request) => {

    const value = lookup(request.entityId, request.attribute);

    client.homeAssistant.sendState(request.entityId, value, request.attribute);
  });

  void sub;
}
// #endregion home-assistant-state-bridge

/**
 * Execute a user-defined service. Resolve by numeric key when the consumer already has it, or by name when it is more ergonomic.
 * {@link UserServicesApi.list} (reached via `client.services`) enumerates the discovered service surface; the matching argument types come from each
 * {@link ServiceEntity.args} declaration.
 */
// #region service-execution
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
// #endregion service-execution

/**
 * Inject a structured logger that satisfies the {@link EspHomeLogging} contract. The four levels (`debug`, `error`, `info`, `warn`) match Homebridge's logger surface
 * and any other backend exposing the same shape. Default behavior (when `logger` is omitted) routes info / warn / error to the console; debug is suppressed.
 */
// #region custom-logger-injection
export async function customLoggerInjectionExample(): Promise<void> {

  const logger: EspHomeClientOptions["logger"] = {

    debug: (message, ...args): void => { void message; void args; },
    error: (message, ...args): void => { void message; void args; },
    info: (message, ...args): void => { void message; void args; },
    warn: (message, ...args): void => { void message; void args; }
  };

  await using client = await openEspHomeClient({

    host: "tracked.local",
    logger,
    psk: null
  });

  void client;
}
// #endregion custom-logger-injection

/**
 * Drive consumer-code tests against an in-memory {@link MockClient} from `esphome-client/testing`. Bytes never enter the picture; tests populate state via
 * `populate*` / `set*` methods, drive events via `emit*`, and assert on consumer reactions via `commands` / the subscription rails. The MockClient mirrors the real
 * {@link EspHomeClient} surface so production code under test runs unchanged.
 */
// #region mock-client-pattern
export function mockClientPatternExample(): void {

  using mock = new MockClient();

  mock.populateEntities(mockEntityDiscovery({ light: ["kitchen_lamp"], switch: ["front_door"] }));
  mock.setDeviceInfo(mockDeviceInfo({ esphomeVersion: "2026.5.0", name: "test-device" }));
  mock.setHealth(mockHealth({ state: "connected" }));
  mock.setConnected(true);

  // Drive a state event into the bus; consumer-code subscriptions react as if a real device sent it.
  mock.emitState(mockStateMessage(entityId("light", "kitchen_lamp"), { brightness: 0.5, state: true }));

  // The recorded-command log captures every `command()` call for assertion.
  mock.command(entityId("switch", "front_door"), { state: true });

  void mock.commands.length;
}
// #endregion mock-client-pattern

/**
 * Drive integration tests against the real {@link EspHomeClient} class with a {@link MockTransport} in place of the network. Useful when the test surface needs to
 * exercise the real handshake / decoder / dispatcher pipelines but should not touch a device. Inject via {@link EspHomeClientOptions.transportFactory}.
 *
 * The factory is called once per handshake attempt (including the noise -> plaintext fallback retry). Tests that only care about the first attempt return the same
 * instance every call; tests that exercise fallback construct a fresh {@link MockTransport} on each invocation and capture references in an array if introspection
 * across attempts is needed.
 */
// #region mock-transport-pattern
export async function mockTransportPatternExample(): Promise<void> {

  const transport = new MockTransport();

  // Stage the byte sequence the transport plays back during the handshake. Real tests use the helper exports from `esphome-client/testing` to synthesize the bytes
  // for the hello/connect/discovery exchange.
  void transport;

  await using client = await openEspHomeClient({

    host: "test.local",
    psk: null,
    transportFactory: (): MockTransport => transport
  });

  void client;
}
// #endregion mock-transport-pattern

/**
 * Build typed test fixtures with the factories exposed under `esphome-client/testing`. Each factory accepts an `overrides` object so tests state only the fields
 * that matter for the scenario; the remaining fields fall back to deterministic defaults sized for the schema.
 */
// #region factory-pattern
export function factoryPatternExample(): void {

  const lightId = entityId("light", "kitchen");
  const event = mockStateMessage(lightId, { brightness: 0.75, state: true });
  const entities = mockEntityDiscovery({ light: [ "kitchen", "dining" ] });
  const info: DeviceInfo = mockDeviceInfo({ name: "fixture-device" });
  const health = mockHealth({ encrypted: true });

  void event;
  void entities;
  void info;
  void health;
}
// #endregion factory-pattern

/**
 * Register additional entity schemas at construction time for vendor-specific extensions. {@link aliasOf} is the common case (custom type that mirrors an upstream
 * type with a different name); {@link extending} composes when the custom type adds fields beyond the base. Direct schema construction is supported but documented as
 * power-user territory.
 */
// #region schema-extension
export async function schemaExtensionExample(): Promise<void> {

  // As an illustrative custom type, we alias "cover" to a distinct "door_cover" tag - the pattern a consumer reaches for when it wants an upstream type
  // routed under its own type key for its own dispatch. (A real garage door, Konnected included, exposes a standard "cover"; this is a teaching example, not a
  // required registration.) Quoted keys keep the entity-type strings honest to ESPHome's snake_case convention without tripping the camelCase identifier rule.
  const extras = {

    "door_cover": { ...aliasOf("cover"), type: "door_cover" },
    "extended_switch": extending("switch", {

      addedStateFields: {

        surgeCount: { fieldNumber: 99, valueType: "varint", wireType: WireType.VARINT }
      }
    })
  } satisfies ExtraSchemaSet;

  // Consumers hand the extras object to the factory at construction. The factory's type parameter threads the extras keys through the public surface, so commands,
  // telemetry, and discovery for an extras-keyed entity type narrow exactly like a built-in. Throws ConfigurationError("EXTRA_SCHEMA_OVERRIDES_BUILTIN") if any key
  // collides with a built-in type.
  const client = await openEspHomeClient<typeof extras>({ extraSchemas: extras, host: "vendor-device.local", reconnect: false });

  // Mint a branded id for an extras-keyed entity type. The type parameter on entityId() carries the literal "door_cover" through to the EntityId<"door_cover"> brand,
  // so the subsequent client.command() call narrows options against the door_cover schema.
  client.command(entityId("door_cover", "garage"), { position: 0.75 });
  client.disconnect();
}
// #endregion schema-extension

/**
 * Discriminated union narrowing on the generic telemetry channel. Switch on `event.type` and the type system narrows to the matching
 * {@link StateEventFor} variant - each branch typechecks against only the fields the schema declares for that entity type.
 */
// #region telemetry-event-narrowing
export async function telemetryEventNarrowingExample(client: EspHomeClient): Promise<void> {

  for await (const event of client.telemetry({ signal: AbortSignal.timeout(60000) })) {

    switch(event.type) {

      case "light":

        void event.brightness;
        void event.effect;

        break;

      case "climate":

        void event.currentTemperature;
        void event.mode;

        break;

      case "binary_sensor":

        void event.state;

        break;

      case "camera":

        // Camera state events surface the reassembled multi-packet image: `image` is the concatenated payload, `name` is the friendly entity name. The wire-level
        // chunk fields (`data`, `done`) are stripped by the EventOverrides table since consumers receive only the assembled result.
        void event.image;
        void event.name;

        break;
    }
  }
}
// #endregion telemetry-event-narrowing

/**
 * The three subscription rails on {@link EspHomeClient}: callback (`on` returns Disposable), one-shot Promise (`once`), and async-iterable stream (`stream`). All
 * three are typed against {@link ClientEventsMap}; the payload type is inferred from the event name.
 */
// #region typed-event-bus
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
// #endregion typed-event-bus

/**
 * Run the canonical NNpsk0 handshake locally. Two parties share a 32-byte pre-shared key and exchange the two-message pattern; on completion both sides hold cipher
 * states for bidirectional encryption.
 */
// #region crypto-noise-handshake-basic
export function cryptoNoiseHandshakeBasicExample(): void {

  // The pre-shared key must be exactly 32 bytes and known to both sides.
  const psk = randomBytes(32);

  // Initialize the initiator and responder with their respective roles.
  const initiator = createHandshake({ psk, role: "initiator" });
  const responder = createHandshake({ psk, role: "responder" });

  // First message: the initiator sends its ephemeral key.
  responder.readMessage(initiator.writeMessage());

  // Second message: the responder replies, completing the handshake.
  initiator.readMessage(responder.writeMessage());

  // Once the handshake is complete, sendCipher / receiveCipher are populated on both sides. Narrow against undefined before use.
  const { sendCipher: initiatorSend, receiveCipher: initiatorReceive } = initiator;
  const { sendCipher: responderSend, receiveCipher: responderReceive } = responder;

  if(!initiatorSend || !initiatorReceive || !responderSend || !responderReceive) {

    throw new Error("Handshake did not complete.");
  }

  const encrypted = initiatorSend.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello World"));
  const decrypted = responderReceive.DecryptWithAd(Buffer.alloc(0), encrypted);

  void decrypted;

  // The responder can reply through its sendCipher.
  const response = responderSend.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello back!"));
  const responseDecrypted = initiatorReceive.DecryptWithAd(Buffer.alloc(0), response);

  void responseDecrypted;
}
// #endregion crypto-noise-handshake-basic

/**
 * Construct the ESPHome variant of the handshake. {@link createESPHomeHandshake} stamps the device's `"NoiseAPIInit"` prologue automatically so the resulting
 * {@link HandshakeState} can be driven against a real device socket. The example shows the shape - drive `writeMessage` / `readMessage` against the
 * wire frames the transport layer carries.
 */
// #region crypto-noise-esphome-connection
export function cryptoNoiseEsphomeConnectionExample(psk: Buffer): void {

  const handshake = createESPHomeHandshake({ psk, role: "initiator" });

  // First wire frame the client sends after the TCP connect: the ephemeral-key carrying handshake message.
  const clientHello = handshake.writeMessage();

  void clientHello;

  // The transport feeds the device's response back into readMessage; once isComplete becomes true, send/receive ciphers are ready for the API layer.
  // handshake.readMessage(deviceResponse);
  // const { sendCipher } = handshake;
  // const encrypted = sendCipher?.EncryptWithAd(Buffer.alloc(0), apiPayload);
}
// #endregion crypto-noise-esphome-connection

/**
 * Authenticate a header alongside an encrypted payload. The associated data is hashed into the auth tag but transmitted in the clear; the receiver must supply the
 * same bytes or {@link CipherState.DecryptWithAd} fails. Common uses: sequence numbers, protocol headers, anti-replay counters.
 */
// #region crypto-noise-associated-data
export function cryptoNoiseAssociatedDataExample(): void {

  const psk = randomBytes(32);
  const initiator = createHandshake({ psk, role: "initiator" });
  const responder = createHandshake({ psk, role: "responder" });

  responder.readMessage(initiator.writeMessage());
  initiator.readMessage(responder.writeMessage());

  // Build a four-byte little-endian sequence number to authenticate alongside the payload.
  const sequenceNumber = Buffer.alloc(4);

  sequenceNumber.writeUInt32LE(1, 0);

  const { sendCipher } = initiator;
  const { receiveCipher } = responder;

  if(!sendCipher || !receiveCipher) {

    throw new Error("Handshake did not complete.");
  }

  const encrypted = sendCipher.EncryptWithAd(sequenceNumber, Buffer.from("payload"));
  const decrypted = receiveCipher.DecryptWithAd(sequenceNumber, encrypted);

  void decrypted;
}
// #endregion crypto-noise-associated-data

/**
 * Catch {@link NoiseHandshakeError}. Common codes include `AUTH_FAILED` (auth-tag verification failed), `INVALID_PSK_LENGTH` (PSK is not 32 bytes),
 * `HANDSHAKE_COMPLETE` (a `writeMessage` / `readMessage` call after completion), and `MISSING_KEYS` (a DH operation lacked one of its inputs).
 */
// #region crypto-noise-error-handling
export function cryptoNoiseErrorHandlingExample(psk: Buffer, incoming: Buffer): void {

  const handshake = createESPHomeHandshake({ psk, role: "initiator" });

  try {

    handshake.readMessage(incoming);

  } catch(error) {

    if(error instanceof NoiseHandshakeError) {

      void error.code;
      void error.message;
    }

    throw error;
  }
}
// #endregion crypto-noise-error-handling

/**
 * Inject an {@link EspHomeLogging}-shaped logger to trace handshake state. The handshake emits per-step debug entries describing key exchanges, hash updates, and
 * cipher transitions; the error rail surfaces unrecoverable conditions. Default behavior (omit `logger`) silences all output.
 */
// #region crypto-noise-with-logging
export function cryptoNoiseWithLoggingExample(psk: Buffer): void {

  const logger: EspHomeLogging = {

    debug: (message): void => { void message; },
    error: (message): void => { void message; },
    info: (message): void => { void message; },
    warn: (message): void => { void message; }
  };

  const handshake = createESPHomeHandshake({ logger, psk, role: "initiator" });

  void handshake;
}
// #endregion crypto-noise-with-logging

/**
 * Transmit a raw infrared mark/space pattern. The example encodes a single NEC-style frame: the 9000 / -4500 microsecond header followed by representative bit cells.
 * The `carrierFrequency` (Hz) drives the IR LED's PWM carrier; `repeatCount` of 1 sends the pattern once. The capability guard inside
 * {@link EspHomeClient.transmitRawTimings} rejects entities whose `capabilities` bitmask does not include the
 * {@link InfraredCapabilityFlags.TRANSMITTER} bit, so a misconfigured RX-only entity surfaces as a typed {@link ConnectionError} rather than silently
 * dropping the request.
 */
// #region infrared-transmit
export function infraredTransmitExample(client: EspHomeClient): void {

  const tvPower = entityId("infrared", "ir_blaster");

  client.transmitRawTimings(tvPower, {

    carrierFrequency: 38000,
    repeatCount: 1,
    timings: [ 9000, -4500, 560, -560, 560, -1690, 560, -560, 560, -1690 ]
  });
}
// #endregion infrared-transmit

/**
 * Stream received IR signals as raw timing arrays. The receive event is unsolicited - it arrives whenever the device's IR receiver detects an edge - so consumers
 * subscribe and react. The `timings` array carries microsecond mark/space periods; positive values are mark (IR carrier on), negative values are space (carrier off).
 * Downstream consumers can feed the array into higher-level codecs (NEC / RC5 / Pronto) to recover the original button code.
 */
// #region infrared-receive
export async function infraredReceiveExample(client: EspHomeClient): Promise<void> {

  const blaster = entityId("infrared", "ir_blaster");
  const targetKey = client.getEntityKey(blaster);

  for await (const event of client.telemetryFor("infrared")) {

    if(event.key !== targetKey) {

      continue;
    }

    // event.timings is the schema-typed `number[]` decoded from the packed sint32 wire payload.
    const samples = event.timings?.length ?? 0;

    void samples;

    break;
  }
}
// #endregion infrared-receive

/**
 * Transmit a raw 433.92 MHz OOK pattern through a radio-frequency entity. The transmit RPC is shared with infrared (`INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` at id
 * 136), so the call surface and options shape are identical - only the branded id's type tag and the `carrierFrequency` value change. `modulation` selects
 * the RF modulation scheme; consumers typically pass {@link RadioFrequencyModulation.OOK} for the most common ASK / OOK garage remotes.
 */
// #region radio-frequency-transmit
export function radioFrequencyTransmitExample(client: EspHomeClient): void {

  const remote = entityId("radio_frequency", "rf_module");

  client.transmitRawTimings(remote, {

    carrierFrequency: 433920000,
    modulation: RadioFrequencyModulation.OOK,
    repeatCount: 3,
    timings: [ 350, -1050, 1050, -350, 350, -1050, 1050, -350 ]
  });
}
// #endregion radio-frequency-transmit

/**
 * Stream received RF signals as raw timing arrays. Symmetric with {@link infraredReceiveExample}: the wire event is the same (id 137), but the schema-driven
 * disambiguation in `handleTelemetry` routes it to the `radio_frequency` channel when the registered entity's type matches. Subscribers on the IR channel do not see
 * these events.
 */
// #region radio-frequency-receive
export async function radioFrequencyReceiveExample(client: EspHomeClient): Promise<void> {

  const remote = entityId("radio_frequency", "rf_module");
  const targetKey = client.getEntityKey(remote);

  for await (const event of client.telemetryFor("radio_frequency")) {

    if(event.key !== targetKey) {

      continue;
    }

    const samples = event.timings?.length ?? 0;

    void samples;

    break;
  }
}
// #endregion radio-frequency-receive

/**
 * Read the device-info advertisement to discover every serial-proxy port the device exposes. Each entry's array index is the `instance` number used in every
 * subsequent serial-proxy wire message; the {@link SerialProxyPortType} tag lets consumers adapt their handling (TTL ports skip DTR/RTS handling that RS232
 * lines need, etc.).
 */
// #region serial-list
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
// #endregion serial-list

/**
 * Set UART parameters for a serial-proxy instance. The wire-side `SerialProxyConfigureRequest` is fire-and-forget; the device applies the configuration on receipt.
 * `dataSize` must be 5..8 and `stopBits` must be 1 or 2; out-of-range values throw {@link ConnectionError} with code `INVALID_SERIAL_CONFIG` before the wire send so a
 * misconfiguration is caught at the call site rather than silently dropped.
 */
// #region serial-configure
export function serialConfigureExample(client: EspHomeClient): void {

  client.serial.configure(0, {

    baudrate: 115200,
    dataSize: 8,
    flowControl: false,
    parity: SerialProxyParity.NONE,
    stopBits: 1
  });
}
// #endregion serial-configure

/**
 * Stream inbound bytes from a serial-proxy instance as a backpressured async iterable. The first iterator on a given instance issues a wire-side SUBSCRIBE; the last
 * iterator to detach issues an UNSUBSCRIBE. Concurrent iterators on the same instance share the wire-side subscription, so the device only sends the per-instance
 * stream once regardless of consumer count. Aborting via the supplied `AbortSignal` tears down the iterator cleanly and decrements the refcount.
 */
// #region serial-data-stream
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
// #endregion serial-data-stream

/**
 * Write raw bytes to a serial-proxy instance. The wire frame carries the buffer verbatim - null bytes, high bytes, and UTF-8-invalid sequences pass through unchanged.
 * The call is fire-and-forget; pair with {@link SerialProxyApi.flush} when the consumer needs to know the TX buffer has drained on the device.
 */
// #region serial-write
export function serialWriteExample(client: EspHomeClient): void {

  // Example: send a NEMA-0183-style sentence to a connected GPS.
  client.serial.write(0, Buffer.from("$PMTK220,1000*1F\r\n", "ascii"));
}
// #endregion serial-write

/**
 * Block until the device confirms the TX buffer has drained. `SerialProxyStatus.OK` and `ASSUMED_SUCCESS` both indicate successful drain; the three failure variants
 * (`ERROR`, `TIMEOUT`, `NOT_SUPPORTED`) carry an optional `errorMessage` from the device. The default timeout is 5000ms; pass `timeoutMs` for a different bound or
 * `signal` to cancel cooperatively.
 */
// #region serial-flush
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
// #endregion serial-flush

/**
 * Read and set the RTS / DTR modem-control lines for an RS232 instance. Compose flags via bitwise OR; the response is a bitmask the consumer decodes against the same
 * {@link SerialProxyLineStateFlags} constants. The two methods are connection-scoped; concurrent reads for the same instance are rejected with
 * {@link ConnectionError} code `MODEM_PINS_IN_FLIGHT`.
 */
// #region serial-modem-pins
export async function serialModemPinsExample(client: EspHomeClient): Promise<void> {

  // Pulse DTR low to reset a connected modem: raise both lines, read back, then drop DTR.
  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR);

  const lineStates = await client.serial.getModemPins(0, { timeoutMs: 1000 });
  const dtrAsserted = (lineStates & SerialProxyLineStateFlags.DTR) !== 0;

  void dtrAsserted;

  client.serial.setModemPins(0, SerialProxyLineStateFlags.RTS);
}
// #endregion serial-modem-pins

/**
 * Gate consumer code on the device's Bluetooth-proxy advertisement, surfaced via `client.bluetooth.available`. The accessor reads `bluetoothProxyFeatureFlags` from
 * the latest device-info record; any nonzero bitmask means the device firmware was compiled with `USE_BLUETOOTH_PROXY`. Returns `false` before discovery completes,
 * so consumers can call it eagerly without checking the connection state separately.
 */
// #region bluetooth-availability
export function bluetoothAvailabilityExample(client: EspHomeClient): void {

  if(!client.bluetooth.available) {

    // The device does not expose a Bluetooth proxy. Surface a friendly capability gate instead of attempting an advertisement subscription that will yield nothing.
    void "this device firmware does not include the Bluetooth proxy component";

    return;
  }

  void "Bluetooth proxy is available; we can subscribe to advertisements and set the scanner mode";
}
// #endregion bluetooth-availability

/**
 * Stream inbound BLE advertisements as a backpressured async iterable. The first iterator on `client.bluetooth.advertisements()` issues a wire-side SUBSCRIBE with
 * `flags: 0`; the last iterator to detach issues UNSUBSCRIBE. Concurrent iterators share the wire-side subscription. Each yielded record is a single advertisement;
 * the device batches multiple ads into one wire message, and the host fans them out before they reach the iterator so consumers filter / count / aggregate at
 * single-ad granularity.
 *
 * The example below filters for a single device address (a passive-presence-detection workflow). Aborting via the supplied `AbortSignal` tears down the iterator
 * cleanly and decrements the refcount.
 */
// #region bluetooth-advertisements
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
// #endregion bluetooth-advertisements

/**
 * Switch the scanner between PASSIVE (listen for broadcasts only) and ACTIVE (additionally elicit scan-response data from advertisers). The call is fire-and-forget at
 * the wire level; the device confirms the change via the next scanner-state push, which consumers observe via {@link BluetoothProxyApi.scannerState}.
 */
// #region bluetooth-scanner-mode
export function bluetoothScannerModeExample(client: EspHomeClient): void {

  // Switch to ACTIVE for high-fidelity device discovery, then drop back to PASSIVE for steady-state presence detection.
  client.bluetooth.setScannerMode(BluetoothScannerMode.ACTIVE);
}
// #endregion bluetooth-scanner-mode

/**
 * Observe scanner-state transitions. The device pushes a new state whenever the scanner machine transitions through IDLE / STARTING / RUNNING / STOPPING / STOPPED
 * (plus FAILED on controller-level error). The stream yields every push; `client.bluetooth.lastScannerState()` returns the most recent synchronous snapshot.
 *
 * Pairs with `setScannerMode` - to synchronously await a confirmed mode change, iterate the stream and break when both `state.mode` matches the requested value and
 * `state.state` is RUNNING.
 */
// #region bluetooth-scanner-state
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
// #endregion bluetooth-scanner-state

/**
 * Connect to a BLE peripheral, read a single characteristic, then disconnect. The `connect` call resolves with the negotiated MTU and the peripheral's connection
 * state; `disconnect` resolves once the device confirms the peripheral has been released. `useCache: false` forces a fresh service discovery on the peripheral
 * (typically required after a peripheral firmware upgrade changes its GATT layout).
 */
// #region bluetooth-connect
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
// #endregion bluetooth-connect

/**
 * Discover services on a connected peripheral. The device streams services across multiple wire frames terminated by a sentinel; `getServices` returns the full
 * accumulated list once the sentinel arrives. Each service carries its characteristics and each characteristic carries its descriptors.
 */
// #region bluetooth-get-services
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
// #endregion bluetooth-get-services

/**
 * Round-trip a characteristic value: read it, modify it, write it back. The `response: true` write awaits acknowledgment from the device; the default `response:
 * false` is fire-and-forget at the wire level (the device acknowledges every write but the current API does not surface the response when the caller opts out).
 */
// #region bluetooth-read-write
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
// #endregion bluetooth-read-write

/**
 * Read or write a descriptor. Descriptor operations share the underlying response messages with characteristic reads / writes, so the API surfaces them as parallel
 * methods (`readDescriptor`, `writeDescriptor`). The caller knows which kind of attribute the handle points at; the wire format is identical.
 */
// #region bluetooth-descriptors
export async function bluetoothDescriptorsExample(client: EspHomeClient): Promise<void> {

  const address = 0xaabbccddeeffn;
  const cccdHandle = 0x002b;

  // Read the current CCCD value.
  const current = await client.bluetooth.readDescriptor(address, cccdHandle);

  void current;

  // Write a new value - here, enable notifications by writing 0x01 0x00 to the CCCD.
  await client.bluetooth.writeDescriptor(address, cccdHandle, Buffer.from([ 0x01, 0x00 ]));
}
// #endregion bluetooth-descriptors

/**
 * Subscribe to characteristic notifications. `setNotify(true)` issues the wire-side enable and awaits its acknowledgment; `notify()` is the consumer-side iterator
 * over the resulting bus events. The two are intentionally separate so the BLE programmer can enable the device-side push before or after attaching the iterator,
 * and so multiple iterators on the same handle all receive every push.
 *
 * Tear-down happens on iterator exit; calling `setNotify(false)` independently stops the device-side push but leaves the iterator's bus subscription open until the
 * consumer breaks the loop.
 */
// #region bluetooth-notify
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
// #endregion bluetooth-notify

/**
 * Tune the connection parameters of a connected peripheral. Useful for power-vs-latency trade-offs - shorter intervals burn radio power but yield lower latency.
 * The interval bounds are in units of 1.25 ms; the supervision timeout is in units of 10 ms.
 */
// #region bluetooth-connection-params
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
// #endregion bluetooth-connection-params

/**
 * Observe BLE connection-slot capacity. The device pushes a snapshot on subscribe and on every change; consumers iterate the stream and adapt to slot pressure
 * dynamically (e.g., back off a probe loop when `free === 0`).
 */
// #region bluetooth-connections-free
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
// #endregion bluetooth-connections-free

/**
 * Pair with a peripheral, then later unpair. Pairing is a wire-level request to the proxy; the device handles the BLE-level dance. `pair` rejects with
 * `code="GATT_PAIR_FAILED"` if the device reports `paired=false` or a nonzero error.
 */
// #region bluetooth-pair-unpair
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
// #endregion bluetooth-pair-unpair

/**
 * Z-Wave proxy: a deliberately thin transparent byte pipe to the device's Z-Wave radio Serial API.
 *
 * **Byte-pipe contract.** This sub-API does NOT parse Z-Wave Serial API frames, command classes, or security envelopes (S0 / S2). It does NOT manage the Z-Wave network,
 * routing, association, or pairing. Frames sent via `client.zwave.send(frame)` are passed unchanged to the device's Z-Wave radio; frames yielded by
 * `client.zwave.frames()` are the radio's output passed unchanged to the consumer.
 *
 * Consumers route the inbound `frames()` stream into a Z-Wave-aware library (e.g., `zwave-js`) for protocol-level handling, and write back through `send(frame)`.
 * Without such a library, the byte-pipe surface is suitable for protocol research, frame logging, and replay scenarios.
 *
 * Compare with `client.bluetooth`: the Bluetooth proxy exposes GATT-level RPC (typed reads/writes/notifies on characteristic handles); the Z-Wave proxy exposes
 * opaque-byte transport. Both are deliberate - the Bluetooth Core spec carries a typed attribute table the client can address directly, while Z-Wave Serial API frames
 * are a stream the radio's host stack must interpret. The shapes differ because the protocols differ.
 */
// #region zwave-byte-pipe
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
// #endregion zwave-byte-pipe

// Re-exports for type-checking only. The compiler verifies these symbols continue to resolve from the public surface as the codebase evolves.
export type { ClientEventsMap, EspHomeClient, EspHomeClientOptions };
