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
import type { CommandAndAwaitOptions, CommandHost, NonAwaitableEntityType, TransmitEntityType } from "../command-runner.ts";
import type { CommandFor, Entity, EntitySchema, EntityType, StateEventFor, TelemetryEvent } from "../schemas/index.ts";
import type { EspHomeLogging, Nullable } from "../types.ts";
import { EventBus, endedAsyncIterable } from "../event-bus.ts";
import { HealthState, connectedHealth, disconnectedHealth, downHealth } from "../health.ts";
import { MOCK, createRecordingMock } from "./recording-mock.ts";
import { assertTransmitter, encodeCommand, runCommandAndAwait } from "../command-runner.ts";
import { BluetoothProxyApi } from "../bluetooth-proxy.ts";
import { CameraApi } from "../camera.ts";
import type { ClientCapabilities } from "../capabilities.ts";
import { ConnectionError } from "../errors.ts";
import type { ConnectionHealth } from "../health.ts";
import type { ConnectionScope } from "../connection-scope.ts";
import { ENTITY_SCHEMAS } from "../schemas/entity-schemas.ts";
import type { EncodeResult } from "../command-pipeline.ts";
import type { EntityId } from "../entity-id.ts";
import { HomeAssistantApi } from "../home-assistant.ts";
import type { LifecycleEvent } from "../lifecycle.ts";
import type { LogLevel } from "../api-constants.ts";
import type { MockController } from "./recording-mock.ts";
import { ReadableStream } from "node:stream/web";
import { SerialProxyApi } from "../serial-proxy.ts";
import type { StreamOptions } from "../event-bus.ts";
import type { SubDevice } from "../sub-device.ts";
import { UserServicesApi } from "../user-services.ts";
import { VoiceAssistantApi } from "../voice-assistant.ts";
import { ZWaveProxyApi } from "../zwave-proxy.ts";
import { connectionLostError } from "../connection-scope.ts";
import { disconnectedCapabilities } from "../capabilities.ts";
import { entityId } from "../entity-id.ts";
import { getSchemaIn } from "../schemas/extensions.ts";

// The logger the mock hands the real client's encoder and runner. The mock has no reader for their log lines, so every level discards them.
const discard = (): void => { /* The mock has no reader for the line. */ };
const DISCARD_LOG: EspHomeLogging = { debug: discard, error: discard, info: discard, warn: discard };

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
 * Teardown: {@link MockClient.disconnect} and {@link MockClient.setConnected} with `false` end the session the way the real client's teardown does. A pending
 * {@link MockClient.commandAndAwait} rejects with the connection-lost error the teardown builds, the session's device info, capabilities, encryption flag, and
 * sub-devices return to their disconnected values, and a connected mock announces the end on `healthChange`, `lifecycle`, and `disconnect`, in the real client's
 * order. A connect installs a connected health record of its own, as the real client's does, so a test seeds a health record after {@link MockClient.setConnected}
 * with `true`, and a test that connects again seeds the next session's records again, as a real device reports them on every connect. An awaiting call follows the
 * connection, not the health record: {@link MockClient.commandAndAwait} on a mock that is not connected rejects with `NotConnectedError` coded `NOT_CONNECTED`, so a
 * test calls {@link MockClient.setConnected} with `true` before it awaits a command.
 *
 * Sub-API mocks: every sub-API the real client exposes is mirrored on MockClient via {@link createRecordingMock}. Tests address each sub-API's recorded-call log
 * under the {@link MOCK} symbol: `mock.bluetooth[MOCK].calls`, `mock.services[MOCK].stub("list", () => services)`, etc. The reflection-driven factory enumerates
 * each sub-API class's prototype on construction so the mock surface tracks the real class without hand-stubbing every method.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#mock-client-pattern}
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
  private healthRecord: ConnectionHealth = Object.freeze(disconnectedHealth());
  private encrypted = false;

  // The mock's connection scope, which exists exactly while the mock is connected, as the real client's scope exists exactly while a transport is attached. Its abort
  // at teardown ends every pending command wait with one connection-lost error.
  private connection: Nullable<AbortController> = null;

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
   * automatically driven (tests should explicitly call {@link MockClient.emitState} when they want to simulate the device's response). Infrared and radio-frequency
   * ids are a compile error here, as on the real client; a transmit goes through {@link transmitRawTimings}.
   *
   * @remarks Only a command the real client would send is recorded. The real client drops a command for an id it has not discovered, so a command for an id the test
   * never passed to {@link populateEntities} is dropped here too and never reaches the command log. The command is then encoded through the real client's encoder,
   * and a value that encoder refuses (an unknown enum alias or an out-of-range number) is dropped and not recorded. A recorded command keeps the caller's own
   * options object, not the encoded form.
   *
   * @param id - The branded entity id.
   * @param options - The command options.
   */
  public command<T extends Exclude<EntityType, TransmitEntityType>>(id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void {

    const entity = this.entityRegistry.get(id);

    if(!entity || !this.encode(entity, id, options).ok) {

      return;
    }

    this.recordedCommands.push({ id, options, timestamp: Date.now() });
  }

  /**
   * Record an infrared or radio-frequency transmit without executing wire-level work. Mirrors {@link EspHomeClient.transmitRawTimings}: the call is appended to
   * {@link MockClient.commands} the same way {@link command} records, because the real transmit sends the entity's command message on the wire. The call goes through
   * the real client's refusals in the real client's order, so an id the test never registered and a registered receive-only entity are each refused and nothing is
   * recorded. A transmit that passes those checks is encoded through the real client's encoder, and a value that encoder refuses (a timing outside the signed 32-bit
   * range, for example) is dropped and not recorded, as the real client drops it.
   *
   * @param id - The branded infrared or radio-frequency entity id.
   * @param options - The transmit parameters.
   *
   * @throws {ConnectionError} with code `ENTITY_NOT_FOUND` when no entity is registered for `id`.
   * @throws {ConnectionError} with code `ENTITY_NOT_TRANSMITTER` when the entity's `capabilities` bitmask lacks the transmitter bit.
   */
  public transmitRawTimings<T extends TransmitEntityType>(id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void {

    const entity = this.entityRegistry.get(id);

    if(!entity) {

      throw new ConnectionError("No entity is registered for " + id + ".", "ENTITY_NOT_FOUND");
    }

    assertTransmitter(entity, id);

    if(!this.encode(entity, id, options).ok) {

      return;
    }

    this.recordedCommands.push({ id, options, timestamp: Date.now() });
  }

  /**
   * Record a command and resolve with the entity's next matching state event. Mirrors {@link EspHomeClient.commandAndAwait} by running the real client's runner over
   * the mock: the command is encoded and recorded as {@link command} records it, then the returned promise parks until a test drives the matching state through
   * {@link emitState}...the deterministic analogue of the real client awaiting the device's correlated response. The checks, their order, their errors, and their
   * codes are the runner's own: a caller's signal already aborted rejects with its reason, a mock that is not connected refuses the call, and a malformed id, an
   * unregistered id, and a command the client's encoder refuses each reject at once, before anything subscribes or is recorded. The optional `predicate`, `signal`,
   * and `timeoutMs` honour the real await contract, and a teardown rejects a pending call with the connection-lost error.
   *
   * @param id - The branded entity id; its type must be command-and-awaitable (sensors, buttons, cameras, and IR/RF are excluded at compile time).
   * @param options - The command options.
   * @param awaitOptions - Optional acceptance predicate, cancellation signal, and timeout override (the default {@link CommandAndAwaitOptions.timeoutMs} states).
   *
   * @throws {NotConnectedError} with code `NOT_CONNECTED` when the mock is not connected. Nothing is recorded.
   * @throws {ConfigurationError} with code `MALFORMED_ENTITY_ID` when `id` is not a valid `${type}-${objectId}` brand.
   * @throws {ConfigurationError} with code `UNKNOWN_ENTITY_ID` when no entity is registered for `id`.
   * @throws {ConfigurationError} with the real runner's refusal code (`ENUM_VALUE_UNKNOWN` or `VALUE_OUT_OF_RANGE`, for example) when the client's encoder refuses
   * the command.
   * @throws {ConnectionLostError} when {@link disconnect}, {@link setConnected} with `false`, or a dispose tears the mock's connection down first.
   * @throws The signal's reason, as it is, when `awaitOptions.signal` aborts, and the timeout's `TimeoutError` when no matching state arrives in time.
   */
  public async commandAndAwait<T extends Exclude<EntityType, NonAwaitableEntityType>>(
    id: EntityId<T>,
    options: CommandFor<typeof ENTITY_SCHEMAS[T]>,
    awaitOptions?: CommandAndAwaitOptions<T>
  ): Promise<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    // The mock hands the runner a host built for this call, so the runner's own admission, validation, encode, composition, and match loop run unchanged. Its lookups
    // answer from the registered entry the id names, its connection is the mock's scope, and its send records the command after the runner has opened the state
    // stream, the pre-subscribe order the real client relies on. It logs nowhere and counts no metric, as the mock has no reader for its log lines or its metrics.
    const entity = this.entityRegistry.get(id);
    const connection = this.connection;
    const host: CommandHost = {

      bus: this.bus,
      connectionScope: (): ConnectionScope => (connection === null) ? { kind: "none" } : { kind: "attached", signal: connection.signal },
      deviceIdForKey: (): number | undefined => entity?.deviceId,
      keyForId: (): Nullable<number> => entity?.key ?? null,
      log: DISCARD_LOG,
      metrics: undefined,
      resolveSchema: (entityType: string): EntitySchema | undefined => getSchemaIn(ENTITY_SCHEMAS, entityType),
      send: (): void => { this.recordedCommands.push({ id, options, timestamp: Date.now() }); }
    };

    return await runCommandAndAwait(host, id, options, awaitOptions);
  }

  /**
   * Encode one command through the real client's encoder, so the mock refuses exactly the commands the client refuses. The encoder's host lookups answer from the
   * registered entity: its key, its discovery-time device id, and the built-in schema table the client resolves through when it has no extra schemas. The mock has
   * no reader for the encoder's per-command debug line, so that log discards it.
   *
   * @param entity - The registered entity the command targets.
   * @param id - The branded entity id.
   * @param options - The caller's command options in their public shape.
   * @returns The encoder's result: the encoded frame, or the reason the encoder refused the command.
   */
  private encode(entity: Entity, id: EntityId, options: unknown): EncodeResult {

    return encodeCommand({

      entityType: entity.type,
      host: {

        deviceIdForKey: (): number | undefined => entity.deviceId,
        keyForId: (): number => entity.key,
        log: DISCARD_LOG,
        resolveSchema: (entityType: string): EntitySchema | undefined => getSchemaIn(ENTITY_SCHEMAS, entityType)
      },
      id,
      options
    }).result;
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
   * Set the cached device info record and announce it on the `deviceInfo` event, as the real client does for each device-info response. The mock stores a frozen copy
   * of `info`, its serial-proxy list and entries frozen too, so {@link MockClient.deviceInfo} and the event carry the same read-only record the real client hands out,
   * while the caller's own object stays writable. A later call replaces the record whole.
   */
  public setDeviceInfo(info: DeviceInfo): void {

    // We copy before freezing so a test can keep editing its own fixture. The nested entries are copied and frozen as well, because freezing the record alone would
    // leave the serial-proxy list it shares with the caller writable through the record.
    const serialProxies = info.serialProxies && Object.freeze(info.serialProxies.map((proxy) => Object.freeze({ ...proxy })));
    const record = Object.freeze({ ...info, ...(serialProxies && { serialProxies }) });

    this.deviceInfoRecord = record;
    this.bus.emit("deviceInfo", record);
  }

  /**
   * Set the encrypted flag returned by {@link MockClient.isEncrypted}. Default is `false`. The next connect reads the flag for its `connect` event and its health
   * record, so on a connected mock `health().encrypted` keeps the value the connect read until the mock connects again.
   */
  public setEncrypted(encrypted: boolean): void {

    this.encrypted = encrypted;
  }

  /**
   * Set the connected flag. A transition to connected goes through the real client's connect: the mock installs a connected health record built from the current
   * one, with the encryption flag {@link setEncrypted} set, and then announces `connect`, that record on `healthChange`, and `lifecycle`, in the real client's order,
   * so a listener of each reads the connected record from {@link health}. The record replaces whatever record the mock held, a seeded one included, so a test seeds a
   * health record after connecting. A transition to disconnected is the device dropping the session, and it goes through the same teardown as {@link disconnect}: the
   * session's device info, capabilities, encryption flag, and sub-devices return to their disconnected values, and the mock announces the end with the disconnected
   * health record on `healthChange`, a `lifecycle` event of kind `disconnect`, and then `disconnect` carrying `reason`, in the real client's order. The entity
   * registry, the command log, and the sub-API call logs survive a dropped session, as the real client keeps its registry across one. Setting the state the mock
   * already holds does nothing.
   *
   * @param connected - The connection state to move to.
   * @param reason - The reason the `disconnect` event carries on a transition to disconnected.
   */
  public setConnected(connected: boolean, reason?: string): void {

    if(connected === this.isConnected) {

      return;
    }

    if(connected) {

      // Connect in the real client's order: the connection scope and the connected record go in silently before any announcement, so every listener below reads them,
      // and `healthChange` follows `connect` carrying the record current at that moment. One wall-clock read supplies the connect epoch and the first inbound
      // activity, as the real client seeds its heartbeat from its connect epoch. The announcements carry the encryption flag read here, as the real client's carry
      // the flag of the session they announce, so a `connect` listener that disconnects the mock does not change what the later announcements report.
      const encrypted = this.encrypted;
      const now = Date.now();

      this.connection = new AbortController();
      this.setHealthRecord(connectedHealth(this.healthRecord, { connectedAtMs: now, encrypted, lastInboundActivityAt: now }));
      this.bus.emit("connect", encrypted);
      this.bus.emit("healthChange", this.healthRecord);
      this.bus.emit("lifecycle", { encrypted, kind: "connect" });

      return;
    }

    this.disconnectInternal(reason);
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
   * Override the cached capability record. Subsequent {@link capabilities} calls return the supplied record until a teardown resets it.
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
   * Synchronous read of the live health record. Mirrors {@link EspHomeClient.health}: the record is frozen and is the same object the most recent `healthChange` event
   * carried. A connect and a teardown install the records the real client's do, and tests seed any other record via {@link setHealth}; before the first of these it is
   * the frozen disconnected record.
   */
  public health(): ConnectionHealth {

    return this.healthRecord;
  }

  /**
   * Override the cached health record and emit it on `healthChange`, so consumer code reacts as it would for a real transition. The mock stores a frozen copy of
   * `health`, so {@link health} and the event carry the same read-only record the real client hands out, while the caller's own object stays writable. A later call
   * replaces the record whole.
   */
  public setHealth(health: ConnectionHealth): void {

    this.setHealthRecord({ ...health });
    this.bus.emit("healthChange", this.healthRecord);
  }

  /**
   * Install the next health record without announcing it, mirroring the real client's split between a silent install and an announced one. The record is frozen here,
   * the only place the field is written after construction, so the object {@link health} returns is one no reader can mutate. The connect installs through here ahead
   * of its announcements; every other transition goes through {@link setHealth}.
   *
   * @param next - The record that replaces the current one.
   */
  private setHealthRecord(next: ConnectionHealth): void {

    this.healthRecord = Object.freeze(next);
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
   * Async-iterable view of state updates for one specific entity, filtered by its resolved key. Mirrors {@link EspHomeClient.telemetryForId}...like the real client, an
   * id that is not registered when the view is requested yields a view that ends at once, so subscribing before {@link populateEntities} yields an empty stream rather
   * than a fabricated match. A view that is never iterated still detaches its bus listener when its signal aborts or its `return()` runs.
   */
  public telemetryForId<T extends EntityType>(id: EntityId<T>, options?: StreamOptions): AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    // Mirror the real client: pre-resolve the target key once and hand back an already-ended view when the entity is unknown, rather than fabricating a match against a
    // key we lack or attaching a bus listener that no event can ever satisfy.
    const targetKey = this.entityRegistry.get(id)?.key;

    if(targetKey === undefined) {

      return endedAsyncIterable();
    }

    const dash = id.indexOf("-");
    const entityType = ((dash > 0) ? id.slice(0, dash) : id) as EntityType;

    // The selector matches on the numeric `key` every entity state event carries, camera's included. It reaches the field through a structural cast and skips every
    // other entity's events as they are emitted, so they never occupy the view's queue.
    return this.bus.stream(entityType, {

      ...options,
      select: (event: ClientEventsMap[EntityType]): typeof event | undefined => ((event as unknown as { key: number }).key === targetKey) ? event : undefined
    }) as AsyncIterable<StateEventFor<typeof ENTITY_SCHEMAS[T]>>;
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
   * Returns the cached device info record, or `null` before {@link MockClient.setDeviceInfo} seeds one and after a teardown clears it. Mirrors
   * {@link EspHomeClient.deviceInfo}: the record is frozen and is the same object the most recent `deviceInfo` event carried.
   */
  public deviceInfo(): Nullable<DeviceInfo> {

    return this.deviceInfoRecord;
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

    return this.connection !== null;
  }

  /**
   * Synchronous teardown. Mirrors {@link EspHomeClient.disconnect}: the session's device info, capabilities, encryption flag, and sub-devices return to their
   * disconnected values, and when the mock was connected it announces the end as the real client does, with the disconnected health record on `healthChange`, a
   * `lifecycle` event of kind `disconnect`, and then `disconnect` with no reason. The disconnected health record is built from the current one by the builder the
   * real client's teardown uses. The mock then clears the entity registry, the command log, and every sub-API call log. The event bus lives as long as the mock, as
   * the real client's does, so a subscription taken before a connect keeps firing after a disconnect and the next connect. Safe to call more than once: a call on a
   * disconnected mock announces nothing and leaves the health record as it stands, as on the real client.
   */
  public disconnect(): void {

    this.disconnectInternal(undefined);

    // The registry and the command log clear after the announcement, so a listener reacting to the disconnect reads the entities as it would on the real client, which
    // keeps its registry through a disconnect.
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
   * The teardown behind {@link disconnect} and {@link setConnected}, mirroring the real client's disconnect path. The session's facts reset on every call, as the real
   * client's teardown does, and the end is announced only when the mock was connected, so a repeat call announces nothing and leaves the health record as it stands.
   *
   * @param reason - The reason the `disconnect` event carries, or `undefined` for a teardown with no reason.
   */
  private disconnectInternal(reason: string | undefined): void {

    // The mock is live while it holds a connection scope. We take the scope, clear the field, and abort the scope in one step, ahead of every reset and announcement,
    // so each pending command wait rejects with this one connection-lost error before anything is announced, as on the real client.
    const connection = this.connection;

    this.connection = null;
    connection?.abort(connectionLostError());

    // The session's reported facts end with it, so `deviceInfo()`, `capabilities()`, `isEncrypted`, and `subDevices()` read the disconnected values rather than the
    // last session's seeded ones. The real client resets its encryption flag through its capability record; the mock keeps the flag apart, so it resets both.
    this.capabilitiesRecord = disconnectedCapabilities();
    this.deviceInfoRecord = null;
    this.encrypted = false;
    this.subDeviceList.length = 0;

    if(!connection) {

      return;
    }

    // Announce the end in the real client's order: the health transition, the typed lifecycle event, then the string-payload `disconnect` event. The disconnected
    // record comes from the down builder the real client's teardown uses, and setHealth freezes it and emits it on `healthChange`.
    this.setHealth(downHealth(this.healthRecord, HealthState.DISCONNECTED));
    this.bus.emit("lifecycle", { kind: "disconnect" });
    this.bus.emit("disconnect", reason);
  }

  /**
   * Async teardown. Mirrors {@link EspHomeClient.disconnectAsync} with no graceful handshake to perform: it runs the {@link disconnect} teardown, announcement
   * included, and resolves once that completes, so `await using mock = new MockClient()` works.
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
