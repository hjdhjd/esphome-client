/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-client.ts: High-level in-memory test double for the EspHomeClient public surface.
 */

/**
 * High-level in-memory test double mirroring the public {@link EspHomeClient} surface. Bytes never enter the picture; tests populate state and emit
 * events through the controlled API and assert on consumer-code reactions.
 *
 * @remarks Use this layer for the dominant consumer-test case: "did my plugin react correctly to a state event / disconnect / discovery?" The MockClient implements
 * the same `on`/`once`/`stream`/`command`/`entity*`/lifecycle methods as the real client, backed by an in-memory event bus and entity registry.
 *
 * This surface follows the same SemVer commitment as the main entry point: breaking changes are listed in the changelog.
 *
 * @module testing/mock-client
 */
import type { ClientEventsMap, DeviceInfo, LogEventData } from "../esphome-client.ts";
import type { CommandAndAwaitOptions, NonAwaitableEntityType } from "../command-runner.ts";
import type { CommandFor, Entity, EntityType, StateEventFor, TelemetryEvent } from "../schemas/index.ts";
import { BluetoothProxyApi } from "../bluetooth-proxy.ts";
import { CameraApi } from "../camera.ts";
import type { ClientCapabilities } from "../capabilities.ts";
import { ConfigurationError } from "../errors.ts";
import type { ConnectionHealth } from "../health.ts";
import { DEFAULT_COMMAND_AWAIT_TIMEOUT_MS } from "../command-runner.ts";
import type { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import { EventBus } from "../event-bus.ts";
import { HomeAssistantApi } from "../home-assistant.ts";
import type { LifecycleEvent } from "../lifecycle.ts";
import type { LogLevel } from "../api-constants.ts";
import { MOCK } from "./recording-mock.ts";
import type { MockController } from "./recording-mock.ts";
import type { Nullable } from "../types.ts";
import { ReadableStream } from "node:stream/web";
import { SerialProxyApi } from "../serial-proxy.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { SubDevice } from "../sub-device.ts";
import { UserServicesApi } from "../user-services.ts";
import { VoiceAssistantApi } from "../voice-assistant.ts";
import { ZWaveProxyApi } from "../zwave-proxy.ts";
import { createRecordingMock } from "./recording-mock.ts";
import { disconnectedCapabilities } from "../capabilities.ts";
import { disconnectedHealth } from "../health.ts";
import { entityId } from "../entity-id.ts";

/**
 * One recorded {@link MockClient.command} call, captured for later assertion.
 */
export interface RecordedCommand<T extends EntityType = EntityType> {

  /**
   * The branded id passed to `command()`.
   */
  id: EntityId<T>;

  /**
   * The options object passed to `command()`. Stored as the original reference; tests should not mutate.
   */
  options: CommandFor<typeof ENTITY_SCHEMAS[T]>;

  /**
   * Wall-clock timestamp at the time the call was recorded. Useful for ordering assertions.
   */
  timestamp: number;
}

/**
 * In-memory test double for {@link EspHomeClient}. Implements the public consumption surface; tests drive state via {@link MockClient.populateEntities},
 * {@link MockClient.setDeviceInfo}, and {@link MockClient.emit}, and assert on consumer behavior via {@link MockClient.commands} and the `on`/`stream` rails.
 *
 * Sub-API mocks: every sub-API the real client exposes is mirrored on MockClient via {@link createRecordingMock}. Tests address each sub-API's recorded-call log
 * under the {@link MOCK} symbol: `mock.bluetooth[MOCK].calls`, `mock.services[MOCK].stub("list", () => services)`, etc. The reflection-driven factory enumerates
 * each sub-API class's prototype on construction so the mock surface tracks the real class without hand-stubbing every method.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#mock-client-pattern}
 *
 */
export class MockClient {

  private readonly bluetoothMock = createRecordingMock<BluetoothProxyApi>(BluetoothProxyApi, {

    // The byte-streaming sub-APIs surface accessor properties whose declared TypeScript type is non-undefined. Provide construction-time defaults for the ones tests
    // are most likely to read uninstrumented so consumer code reading `client.bluetooth.available` against the mock sees a meaningful value rather than `undefined`.
    available: false,
    isConnected: () => false
  });

  private readonly bus: EventBus<ClientEventsMap>;
  private readonly cameraMocks = new Map<EntityId<"camera">, CameraApi & { readonly [MOCK]: MockController }>();
  private readonly entityRegistry = new Map<EntityId, Entity>();
  private readonly homeAssistantMock = createRecordingMock<HomeAssistantApi>(HomeAssistantApi);
  private readonly recordedCommands: RecordedCommand[] = [];
  private readonly serialMock = createRecordingMock<SerialProxyApi>(SerialProxyApi, {

    list: () => []
  });

  private readonly servicesMock = createRecordingMock<UserServicesApi>(UserServicesApi, {

    list: () => []
  });

  private readonly stateMap = new Map<EntityId, TelemetryEvent>();
  private readonly subDeviceList: SubDevice[] = [];
  private readonly voiceAssistantMock = createRecordingMock<VoiceAssistantApi>(VoiceAssistantApi);
  private readonly zwaveMock = createRecordingMock<ZWaveProxyApi>(ZWaveProxyApi, {

    available: false
  });

  private deviceInfoRecord: Nullable<DeviceInfo> = null;
  private capabilitiesRecord: ClientCapabilities = disconnectedCapabilities();
  private healthRecord: ConnectionHealth = disconnectedHealth();
  private encrypted = false;
  private connected = false;

  /**
   * Constructs a fresh MockClient with an empty registry, no recorded commands, and a disconnected state. Tests typically call {@link populateEntities} and
   * {@link setDeviceInfo} immediately afterward.
   */
  public constructor() {

    this.bus = new EventBus<ClientEventsMap>();
  }

  /**
   * Subscribe a callback to an event. Mirrors {@link EspHomeClient.on}.
   */
  public on<K extends keyof ClientEventsMap>(event: K, handler: (payload: ClientEventsMap[K]) => void): Disposable {

    return this.bus.on(event, handler);
  }

  /**
   * Resolve on the next emission of `event`. Mirrors {@link EspHomeClient.once}.
   */
  public async once<K extends keyof ClientEventsMap>(event: K, options?: { signal?: AbortSignal }): Promise<ClientEventsMap[K]> {

    return this.bus.once(event, options);
  }

  /**
   * Async-iterable view of every emission of `event`. Mirrors {@link EspHomeClient.stream}.
   */
  public stream<K extends keyof ClientEventsMap>(event: K, options?: StreamOptions): AsyncIterable<ClientEventsMap[K]> {

    return this.bus.stream(event, options);
  }

  /**
   * Record a command without executing wire-level work. The call is appended to {@link MockClient.commands} for assertion; the matching state-event channel is NOT
   * automatically driven (tests should explicitly call {@link MockClient.emitState} when they want to simulate the device's response).
   *
   * @param id - The branded entity id.
   * @param options - The command options.
   */
  public command<T extends EntityType>(id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void {

    this.recordedCommands.push({ id, options, timestamp: Date.now() });
  }

  /**
   * Record a command and resolve with the entity's next matching state event. Mirrors {@link EspHomeClient.commandAndAwait}: the command is recorded exactly as
   * {@link command} does, then the returned promise parks until a test drives the matching state through {@link emitState}...the deterministic analogue of the real
   * client awaiting the device's correlated response. The optional `predicate`, `signal`, and `timeoutMs` honour the real await contract; on timeout or abort the
   * promise rejects with the abort reason, and an unregistered entity id throws synchronously before any await.
   *
   * @param id - The branded entity id; its type must be command-and-awaitable (sensors, buttons, cameras, and IR/RF are excluded at compile time).
   * @param options - The command options.
   * @param awaitOptions - Optional acceptance predicate, cancellation signal, and timeout override (default 2000 ms).
   */
  public async commandAndAwait<T extends Exclude<EntityType, NonAwaitableEntityType>>(
    id: EntityId<T>,
    options: CommandFor<typeof ENTITY_SCHEMAS[T]>,
    awaitOptions?: CommandAndAwaitOptions<T>
  ): Promise<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    const dash = id.indexOf("-");
    const entityType = ((dash > 0) ? id.slice(0, dash) : id) as EntityType;
    const targetKey = this.entityRegistry.get(id)?.key;

    // Surface an unregistered id as a typed throw rather than a silent timeout, exactly as the real runner does...a command awaiting a state from an entity that was
    // never registered is caller misuse, and failing eagerly reads more clearly than hanging until the timeout fires.
    if(targetKey === undefined) {

      throw new ConfigurationError("commandAndAwait(): unknown entity id '" + id + "'.", "UNKNOWN_ENTITY_ID");
    }

    // Compose the abort sources as the real client does: the timeout always fires and the caller's signal layers on when supplied. We subscribe to the state stream
    // BEFORE recording the command so a synchronous emitState in the test cannot beat the listener, the same pre-subscribe ordering the real runner relies on.
    const sources: AbortSignal[] = [AbortSignal.timeout(awaitOptions?.timeoutMs ?? DEFAULT_COMMAND_AWAIT_TIMEOUT_MS)];

    if(awaitOptions?.signal) {

      sources.push(awaitOptions.signal);
    }

    const stream = this.bus.stream(entityType, { signal: AbortSignal.any(sources) }) as AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>;
    const predicate = awaitOptions?.predicate;

    this.command(id, options);

    for await (const event of stream) {

      // Match the resolved key, then the optional predicate. Promise.try normalizes a sync boolean, an async boolean, a sync throw, and an async reject into one path.
      if(((event as unknown as { key: number }).key === targetKey) && (await Promise.try(() => predicate?.(event) ?? true))) {

        return event;
      }
    }

    // Reached only if the bus stream ends cleanly without a match (a disposed bus); the timeout and caller-abort paths reject via the iterator's throw before here.
    // Surfacing a typed error mirrors the real runner rather than hanging or returning undefined.
    throw new ConfigurationError("commandAndAwait(): stream ended before a matching state event arrived.", "AWAIT_STREAM_CLOSED");
  }

  /**
   * Returns the recorded command log in arrival order. The returned array is a snapshot - tests can `.find`, `.filter`, `.length`-check against it without mutating
   * the underlying log.
   */
  public get commands(): readonly RecordedCommand[] {

    return [...this.recordedCommands];
  }

  /**
   * Clear the recorded command log. Useful for arrange-act-assert blocks where setup commands should not pollute the assertion phase.
   */
  public clearCommands(): void {

    this.recordedCommands.length = 0;
  }

  /**
   * Seed the entity registry. Subsequent {@link MockClient.entities}, {@link MockClient.getEntityById}, and {@link MockClient.hasEntity} reflect the entries.
   *
   * @param entities - Entities to register. Each entity's `id` field becomes the registry key; existing entries with the same id are replaced.
   */
  public populateEntities(entities: readonly Entity[]): void {

    for(const entity of entities) {

      // Entities are keyed by their canonical branded id, computed via the same `{type}-{objectId}` rule (both segments lower-cased) the real client uses in
      // `getEntitiesWithIds`. We compute it here rather than reading `entity.id` because the schema-derived Entity type does not carry a top-level id field.
      const id = entityId(entity.type, entity.objectId);

      this.entityRegistry.set(id, entity);
    }
  }

  /**
   * Set the cached device info record. Subsequent {@link MockClient.deviceInfo} returns this record (or a copy of it).
   */
  public setDeviceInfo(info: DeviceInfo): void {

    this.deviceInfoRecord = info;
  }

  /**
   * Set the encrypted flag returned by {@link MockClient.isEncrypted}. Default is `false`.
   */
  public setEncrypted(encrypted: boolean): void {

    this.encrypted = encrypted;
  }

  /**
   * Set the connected flag. When toggled, the mock fires the matching `connect`/`disconnect` lifecycle event for any consumer waiting on it.
   */
  public setConnected(connected: boolean, reason?: string): void {

    if(connected === this.connected) {

      return;
    }

    this.connected = connected;

    if(connected) {

      this.bus.emit("connect", this.encrypted);
      this.bus.emit("lifecycle", { encrypted: this.encrypted, kind: "connect" });

      return;
    }

    this.bus.emit("disconnect", reason);
    this.bus.emit("lifecycle", { kind: "disconnect" });
  }

  /**
   * Emit an event into the bus. Drives every active subscription, pending once awaiter, and open stream. Tests use this to simulate device-pushed events.
   *
   * @param event - The event name.
   * @param payload - The payload, narrowed to the event's type.
   */
  public emit<K extends keyof ClientEventsMap>(event: K, payload: ClientEventsMap[K]): void {

    this.bus.emit(event, payload);
  }

  /**
   * Convenience for emitting a state event. Drives both the per-type channel (e.g., `light`, `switch`) and the generic `telemetry` channel, mirroring the real
   * client's behavior. Also updates the latest-state cache that {@link latest} and {@link snapshot} read from.
   *
   * @remarks Cache contract mirrors the real client: the latest-state cache is updated **before** listeners are notified, so a `mock.latest(id)` / `mock.snapshot()`
   * read from inside an `on("telemetry")` or per-type listener sees the event that fired the listener.
   */
  public emitState<T extends EntityType>(state: StateEventFor<typeof ENTITY_SCHEMAS[T]>): void {

    // Maintain the latest-state cache so MockClient.latest()/snapshot() reads stay live. Update before notifying listeners to match the real client's mutate-then-emit
    // observer convention - the test double must encode the same cache-vs-listener ordering rule or tests written against the mock will silently diverge.
    // T is generic at this call site, so `StateEventFor<typeof ENTITY_SCHEMAS[T]>` never resolves to a concrete member and TypeScript will not permit reading
    // `state.entity` directly off it. Casting through a minimal `{ entity?: string }` shape reaches the field without asserting a member the generic type cannot
    // structurally prove exists; the optional marker also lets this guard tolerate a test caller who hand-builds a state object without going through the schema
    // encoder, where `entity` may legitimately be absent.
    const idCandidate = (state as { entity?: string }).entity;

    if(idCandidate) {

      this.stateMap.set(idCandidate as EntityId, state as TelemetryEvent);
    }

    // Both emits cast at the boundary because the per-type channel's payload type is the matching variant of the discriminated union; TypeScript cannot prove the
    // tag alignment through a generic emit signature. The brand on `state.type` (a string entity-type literal) is also a valid event-name key.
    const eventName = state.type as keyof ClientEventsMap;

    this.bus.emit(eventName, state as ClientEventsMap[typeof eventName]);
    this.bus.emit("telemetry", state as TelemetryEvent);
  }

  /**
   * Read the most recent state event for an entity. Mirrors {@link EspHomeClient.latest}.
   */
  public latest<T extends EntityType>(id: EntityId<T>): Nullable<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    return (this.stateMap.get(id) ?? null) as Nullable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>;
  }

  /**
   * Read-only snapshot of the latest-state cache. Mirrors {@link EspHomeClient.snapshot}.
   */
  public snapshot(): ReadonlyMap<EntityId, TelemetryEvent> {

    return this.stateMap;
  }

  /**
   * Read-only snapshot narrowed to one entity type. Mirrors {@link EspHomeClient.snapshotFor}.
   */
  public snapshotFor<T extends EntityType>(type: T): ReadonlyMap<EntityId<T>, StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    const out = new Map<EntityId<T>, StateEventFor<typeof ENTITY_SCHEMAS[T]>>();

    for(const [ id, event ] of this.stateMap) {

      if(event.type === type) {

        out.set(id as EntityId<T>, event as StateEventFor<typeof ENTITY_SCHEMAS[T]>);
      }
    }

    return out;
  }

  /**
   * Structured capability record. Mirrors {@link EspHomeClient.capabilities}; tests seed the record via {@link setCapabilities}.
   */
  public capabilities(): ClientCapabilities {

    return this.capabilitiesRecord;
  }

  /**
   * Override the cached capability record. Subsequent {@link capabilities} calls return the supplied record.
   */
  public setCapabilities(capabilities: ClientCapabilities): void {

    this.capabilitiesRecord = capabilities;
  }

  /**
   * Enumerate sub-devices. Mirrors {@link EspHomeClient.subDevices}; tests seed the list via {@link setSubDevices}.
   */
  public subDevices(): readonly SubDevice[] {

    return this.subDeviceList;
  }

  /**
   * Override the sub-device list.
   */
  public setSubDevices(subDevices: readonly SubDevice[]): void {

    this.subDeviceList.length = 0;
    this.subDeviceList.push(...subDevices);
  }

  /**
   * Filter entities by parent device. Mirrors {@link EspHomeClient.entitiesByDevice}.
   */
  public entitiesByDevice(deviceId: number | undefined): Entity[] {

    if(deviceId === undefined) {

      return this.entities();
    }

    return this.entities().filter((entity) => (entity.deviceId ?? 0) === deviceId);
  }

  /**
   * Synchronous read of the live health record. Mirrors {@link EspHomeClient.health}; tests seed the record via {@link setHealth}.
   */
  public health(): ConnectionHealth {

    return this.healthRecord;
  }

  /**
   * Override the cached health record. Emits a `healthChange` event so consumer code reacts as it would for a real transition.
   */
  public setHealth(health: ConnectionHealth): void {

    this.healthRecord = health;
    this.bus.emit("healthChange", health);
  }

  /**
   * Subscribe a callback to health-state transitions. Mirrors {@link EspHomeClient.onHealthChange}.
   */
  public onHealthChange(handler: (health: ConnectionHealth) => void): Disposable {

    return this.bus.on("healthChange", handler);
  }

  /**
   * Async-iterable view of health-state transitions. Mirrors {@link EspHomeClient.healthStream}.
   */
  public healthStream(options?: StreamOptions): AsyncIterable<ConnectionHealth> {

    return this.bus.stream("healthChange", options);
  }

  /**
   * Async-iterable view of lifecycle events. Mirrors {@link EspHomeClient.lifecycle}.
   */
  public lifecycle(options?: StreamOptions): AsyncIterable<LifecycleEvent> {

    return this.bus.stream("lifecycle", options);
  }

  /**
   * Async-iterable view of every state update. Mirrors {@link EspHomeClient.telemetry}.
   */
  public telemetry(options?: StreamOptions): AsyncIterable<TelemetryEvent> {

    return this.bus.stream("telemetry", options);
  }

  /**
   * Async-iterable view of state updates for one entity type. Mirrors {@link EspHomeClient.telemetryFor}.
   */
  public telemetryFor<T extends EntityType>(type: T, options?: StreamOptions): AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    return this.bus.stream(type, options) as AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>;
  }

  /**
   * Async-iterable view of state updates for one specific entity, filtered by its resolved key. Mirrors {@link EspHomeClient.telemetryForId}...like the real client it
   * drops every event until the entity is registered, so subscribing before {@link populateEntities} yields an empty stream rather than a fabricated match.
   */
  public telemetryForId<T extends EntityType>(id: EntityId<T>, options?: StreamOptions): AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    const dash = id.indexOf("-");
    const entityType = ((dash > 0) ? id.slice(0, dash) : id) as EntityType;
    const targetKey = this.entityRegistry.get(id)?.key;
    const stream = this.bus.stream(entityType, options) as AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>;

    return (async function *(): AsyncGenerator<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

      // Mirror the real client: pre-resolve the target key once and yield nothing when the entity is unknown, rather than fabricating a match against a key we lack.
      if(targetKey === undefined) {

        return;
      }

      for await (const event of stream) {

        // Camera state events carry no `key`; every other entity event does. Reach the field through a structural cast and yield only this entity's events.
        if((event as unknown as { key: number }).key === targetKey) {

          yield event;
        }
      }
    })();
  }

  /**
   * Async-iterable view of log messages. Mirrors {@link EspHomeClient.logs} but without the wire-level subscription refcount (no protocol traffic
   * in mocks).
   */
  public logs(_level: LogLevel, options?: StreamOptions): AsyncIterable<LogEventData> {

    return this.bus.stream("log", options);
  }

  /**
   * Web Streams adapter for {@link telemetry}.
   */
  public telemetryReadable(options?: StreamOptions): ReadableStream<TelemetryEvent> {

    return ReadableStream.from(this.telemetry(options));
  }

  /**
   * Web Streams adapter for {@link lifecycle}.
   */
  public lifecycleReadable(options?: StreamOptions): ReadableStream<LifecycleEvent> {

    return ReadableStream.from(this.lifecycle(options));
  }

  /**
   * Web Streams adapter for {@link logs}. Mirrors {@link EspHomeClient.logsReadable}.
   */
  public logsReadable(level: LogLevel, options?: StreamOptions): ReadableStream<LogEventData> {

    return ReadableStream.from(this.logs(level, options));
  }

  /**
   * Convenience for emitting a log event. Drives the `log` channel.
   */
  public emitLog(data: LogEventData): void {

    this.bus.emit("log", data);
  }

  /**
   * Snapshot of the registered entities, returned as bare entity records with no id attached. See {@link getEntitiesWithIds} for the variant that stamps the
   * registry key in as an `id` field.
   */
  public entities(): Entity[] {

    return [...this.entityRegistry.values()];
  }

  /**
   * Mirror of {@link EspHomeClient.getEntitiesWithIds}: snapshot every registered entity record with its branded id stamped in as the `id` field.
   * Useful for consumers (notably the CLI) that need both the typed metadata and the routable id together.
   *
   * @returns A new array of entity records with `id` set to the registry key. Mutating the array does not affect the registry.
   */
  public getEntitiesWithIds(): (Entity & { id: string })[] {

    const result: (Entity & { id: string })[] = [];

    for(const [ id, entity ] of this.entityRegistry) {

      // Mirror the real client's `withIds()` semantics so consumers can read `entry.id` without re-deriving from objectId.
      result.push({ ...entity, id });
    }

    return result;
  }

  /**
   * Discovery summary mapping each registered entity type to its object ids. Mirrors {@link EspHomeClient.getAvailableEntityIds}.
   *
   * @returns A fresh record keyed by entity type; each value is the list of object ids registered for that type. Mutating the result does not affect the registry.
   */
  public getAvailableEntityIds(): Record<string, string[]> {

    const result: Record<string, string[]> = {};

    for(const entity of this.entityRegistry.values()) {

      (result[entity.type] ??= []).push(entity.objectId);
    }

    return result;
  }

  /**
   * Lookup an entity by branded id. Returns `null` when no registration matches.
   */
  public getEntityById(id: EntityId): Nullable<Entity> {

    return this.entityRegistry.get(id) ?? null;
  }

  /**
   * The numeric protocol key for a branded id, or `null` when no registration matches. Mirrors {@link EspHomeClient.getEntityKey}.
   */
  public getEntityKey(id: EntityId): Nullable<number> {

    return this.entityRegistry.get(id)?.key ?? null;
  }

  /**
   * Whether an entity with the given id is registered. Accepts both branded and plain strings.
   */
  public hasEntity(id: EntityId | string): boolean {

    return this.entityRegistry.has(id as EntityId);
  }

  /**
   * Returns the cached device info record (or `null` if {@link MockClient.setDeviceInfo} was never called).
   */
  public deviceInfo(): Nullable<DeviceInfo> {

    return this.deviceInfoRecord ? { ...this.deviceInfoRecord } : null;
  }

  /**
   * Whether the mock is in the "encrypted session" state.
   */
  public get isEncrypted(): boolean {

    return this.encrypted;
  }

  /**
   * Bluetooth proxy sub-API mock. Mirrors {@link EspHomeClient.bluetooth}. Tests access the recording controller via `mock.bluetooth[MOCK]`.
   */
  public get bluetooth(): BluetoothProxyApi & { readonly [MOCK]: MockController } {

    return this.bluetoothMock;
  }

  /**
   * Home-Assistant integration sub-API mock. Mirrors {@link EspHomeClient.homeAssistant}. Tests address recorded calls via
   * `mock.homeAssistant[MOCK].calls`.
   */
  public get homeAssistant(): HomeAssistantApi & { readonly [MOCK]: MockController } {

    return this.homeAssistantMock;
  }

  /**
   * Serial proxy sub-API mock. Mirrors {@link EspHomeClient.serial}. Tests address recorded calls via `mock.serial[MOCK].calls`.
   */
  public get serial(): SerialProxyApi & { readonly [MOCK]: MockController } {

    return this.serialMock;
  }

  /**
   * User-services sub-API mock. Mirrors {@link EspHomeClient.services}. Tests stage the discovered-service catalog via
   * `mock.services[MOCK].stub("list", () => services)` and assert on recorded calls via `mock.services[MOCK].calls`.
   */
  public get services(): UserServicesApi & { readonly [MOCK]: MockController } {

    return this.servicesMock;
  }

  /**
   * Voice-assistant sub-API mock. Mirrors {@link EspHomeClient.voiceAssistant}. Tests address recorded calls via `mock.voiceAssistant[MOCK].calls`.
   */
  public get voiceAssistant(): VoiceAssistantApi & { readonly [MOCK]: MockController } {

    return this.voiceAssistantMock;
  }

  /**
   * Z-Wave proxy sub-API mock. Mirrors {@link EspHomeClient.zwave}. Tests address recorded calls via `mock.zwave[MOCK].calls`.
   */
  public get zwave(): ZWaveProxyApi & { readonly [MOCK]: MockController } {

    return this.zwaveMock;
  }

  /**
   * Camera sub-API mock. Mirrors `client.camera(id)` with full per-id semantics: each unique branded id gets its own recording-mock instance the first time
   * `camera(id)` is called, and subsequent calls with the same id return the same reference. Tests that rely on `mock.camera(idA) !== mock.camera(idB)` (and the
   * inverse reference equality across repeated calls with the same id) match the real client's behavior.
   *
   * @param id - The branded camera entity id.
   */
  public camera(id: EntityId<"camera">): CameraApi & { readonly [MOCK]: MockController } {

    const cached = this.cameraMocks.get(id);

    if(cached) {

      return cached;
    }

    const fresh = createRecordingMock<CameraApi>(CameraApi);

    this.cameraMocks.set(id, fresh);

    return fresh;
  }

  /**
   * Whether the mock is in the "connected" state.
   */
  public get isConnected(): boolean {

    return this.connected;
  }

  /**
   * Synchronous teardown. Disposes the underlying event bus and clears registries. Safe to call multiple times.
   */
  public disconnect(): void {

    this.connected = false;
    this.bus.dispose();
    this.entityRegistry.clear();
    this.recordedCommands.length = 0;

    // Reset every sub-API mock's recording log so a reused client starts each scenario clean. The per-id camera mocks are reset in place (not discarded) so test code
    // that captured a reference to a specific `client.camera(id)` instance keeps observing the same recorder across the reconnect boundary.
    this.bluetoothMock[MOCK].clearCalls();
    this.homeAssistantMock[MOCK].clearCalls();
    this.serialMock[MOCK].clearCalls();
    this.servicesMock[MOCK].clearCalls();
    this.voiceAssistantMock[MOCK].clearCalls();
    this.zwaveMock[MOCK].clearCalls();

    for(const cameraMock of this.cameraMocks.values()) {

      cameraMock[MOCK].clearCalls();
    }
  }

  /**
   * Async teardown. Mirrors {@link EspHomeClient.disconnectAsync} (no graceful handshake to perform; just the synchronous teardown wrapped in a
   * resolved Promise so `await using mock = new MockClient()` works).
   */
  public async disconnectAsync(): Promise<void> {

    this.disconnect();
  }

  /**
   * Symbol.dispose hook for `using` scopes.
   */
  public [Symbol.dispose](): void {

    this.disconnect();
  }

  /**
   * Symbol.asyncDispose hook for `await using` scopes.
   */
  public async [Symbol.asyncDispose](): Promise<void> {

    return this.disconnectAsync();
  }
}
