/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-runner.ts: Single source of truth for command dispatch.
 */

/**
 * Authoritative implementation of the command-dispatch entry points. Owns the orchestration logic behind {@link EspHomeClient.command} and
 * {@link EspHomeClient.commandAndAwait}; the host's two public methods are one-line delegates with their JSDoc preserved for IDE hover.
 *
 * @remarks Two named runners, one shared host interface. {@link runCommand} extracts the entity type from the branded id, applies the matching {@link COMMAND_ADAPTERS}
 * runtime adapter (light's RGB flatten, siren's duration round), runs the schema-driven {@link encodeEntityCommand} pipeline, frames-and-sends through the host, and
 * emits the `entity.commands.sent` metric. {@link runCommandAndAwait} shares that runner's encode and send, and adds a pre-subscription stage (open the bus stream
 * *before* the command sends), an `AbortSignal.any` composition (timeout plus the caller's optional signal), and a predicate-match loop normalized through
 * {@link Promise.try} so sync and async predicates collapse to one rejection path.
 *
 * The narrow `CommandHost` interface mirrors {@link RunPhaseHost} and {@link LogSubscriptionManagerHost}: a small read surface
 * plus a handful of methods for behavior the host owns. The interface carries only state-bearing primitives - the bus the runner subscribes to for state events, the
 * logger, the metrics sink, the registry's id <-> key bijection (`keyForId`), the registry's device-id overlay (`deviceIdForKey`), and the framing-and-send hook.
 * Pure-function imports ({@link COMMAND_ADAPTERS}, {@link encodeEntityCommand}, {@link reportUnrecognizedOptions}) are not interface members because they have no
 * host-state dependency.
 *
 * The error-surface asymmetry between the two runners is intentional. {@link runCommand} is fire-and-forget: a malformed branded id, an unknown entity id, an entity
 * type without a command schema all warn-and-drop. The contract is one-shot lossy semantics: consumer code calling fire-and-forget `command()` already accepts the
 * possibility of a dropped send. {@link runCommandAndAwait} returns a Promise; consumers expect typed failure rather than silent drop, so a malformed or unknown id
 * and an encode refusal (a type without a command schema, an unknown enum alias, an out-of-range value) each throw a {@link ConfigurationError} with a named code
 * before anything subscribes or sends. Both behaviors are tested in both directions.
 *
 * The pre-subscribe ordering rule is the architectural keystone of {@link runCommandAndAwait}. The bus stream is opened *before* the command sends, so a fast device
 * cannot race ahead of the listener. The internal `BackpressureStream` attaches its `EventEmitter` listener synchronously in its constructor, so the moment
 * `host.bus.stream(...)` returns we are listening; subsequent `host.send(...)` cannot lose a state response that arrives between the two.
 *
 * @module command-runner
 */
import type { BaseEntity, ENTITY_SCHEMAS, EntitySchema, EntityType } from "./schemas/index.ts";
import type { ClientMetrics, EspHomeLogging, Nullable } from "./types.ts";
import type { CommandFor, StateEventFor } from "./schemas/derived.ts";
import { ConfigurationError, ConnectionError } from "./errors.ts";
import type { EncodeFailureReason, EncodeResult } from "./command-pipeline.ts";
import { encodeEntityCommand, reportUnrecognizedOptions } from "./command-pipeline.ts";
import type { Buffer } from "node:buffer";
import { COMMAND_ADAPTERS } from "./schemas/index.ts";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { ConfigurationErrorCode } from "./errors.ts";
import type { EntityId } from "./entity-id.ts";
import type { EventBus } from "./event-bus.ts";
import { InfraredCapabilityFlags } from "./api-constants.ts";

/**
 * Default timeout (in milliseconds) {@link runCommandAndAwait} applies when the caller does not supply `awaitOptions.timeoutMs`. Sized at 2000ms - long enough that
 * a healthy device responds well within the window, short enough that a hung device does not stall consumer code by more than the typical request latency budget.
 */
export const DEFAULT_COMMAND_AWAIT_TIMEOUT_MS = 2000;

/**
 * The entity types whose command is a raw-timings transmit. Their consumer entry point is {@link EspHomeClient.transmitRawTimings}, which refuses an entity whose
 * capabilities lack the transmitter bit, so {@link EspHomeClient.command} excludes these types at the type level and a transmit cannot reach the wire without that
 * check. {@link NonAwaitableEntityType} includes them because a transmit has no state response to await.
 */
export type TransmitEntityType = "infrared" | "radio_frequency";

/**
 * The entity types {@link EspHomeClient.commandAndAwait} excludes at the type level: the read-only, stateless, and non-key-bearing entity types whose state
 * schemas do not respond to commands - calling `commandAndAwait` against them would hang until timeout. The exclusion is kept in sync with the host method's own
 * type-level constraint.
 *
 * @remarks `binary_sensor`, `sensor`, and `text_sensor` are read-only - they emit state but no command surface exists. `button` is stateless on the wire (the device
 * acknowledges with no telemetry). `camera` is excluded because its schema declares no `command` block, so a generic entity command can never be encoded for it;
 * its state event still carries the numeric `key` field (preserved by the schema's event-shape override) - it simply has no command surface to invoke. The
 * {@link TransmitEntityType} members are excluded because they emit raw-timing receive events (no key-bearing state response) and use a transmit RPC rather than a
 * key-targeted command.
 */
export type NonAwaitableEntityType = "binary_sensor" | "button" | "camera" | "sensor" | "text_sensor" | TransmitEntityType;

/**
 * Entity types accepted by {@link EspHomeClient.commandAndAwait}. The complement of {@link NonAwaitableEntityType} relative to the canonical {@link EntityType} set.
 */
export type CommandAndAwaitable = Exclude<EntityType, NonAwaitableEntityType>;

/**
 * Per-call options for {@link EspHomeClient.commandAndAwait}. All fields are optional; defaults: 2000ms timeout, no caller signal, predicate accepts any state event
 * for the entity.
 *
 * @typeParam T - Entity type tag carried by the branded id.
 */
export interface CommandAndAwaitOptions<T extends CommandAndAwaitable> {

  /**
   * Optional acceptance predicate. Called with each candidate state event whose `key` matches the resolved target; the runner returns the first event for which the
   * predicate resolves to `true`. Sync `boolean` and async `Promise<boolean>` are both accepted; both are normalized through {@link Promise.try} so a sync `throw` and
   * an async `reject` collapse to the same rejection path. The default (no predicate supplied) accepts any state event for the resolved target key.
   *
   * @param state - The candidate state event, narrowed to the entity type's {@link StateEventFor} shape.
   * @returns `true` to resolve the await with this event; `false` to keep waiting.
   */
  predicate?: (state: StateEventFor<typeof ENTITY_SCHEMAS[T]>) => boolean | Promise<boolean>;

  /**
   * Optional caller-supplied {@link AbortSignal}. Composed with the timeout signal via {@link AbortSignal.any}; either source aborts the await and tears the bus
   * subscription down. A pre-aborted signal rejects immediately; a mid-stream abort tears down between iterations.
   */
  signal?: AbortSignal;

  /**
   * Optional override for the await timeout, in milliseconds. Defaults to 2000ms.
   */
  timeoutMs?: number;
}

/**
 * Narrow interface {@link runCommand} and {@link runCommandAndAwait} consume from the host. Mirrors {@link RunPhaseHost} - a small read surface
 * (bus, logger, optional metrics sink), a few methods that delegate into the host's registry and transport, and nothing else. Pure-function imports
 * ({@link COMMAND_ADAPTERS}, {@link encodeEntityCommand}, {@link reportUnrecognizedOptions}) live as direct module imports inside the runner because they have no
 * host-state dependency.
 *
 * @remarks Two design decisions hold the interface at this width. First, the encode pipeline lives in {@link encodeEntityCommand}; the runner consumes
 * it directly rather than routing through the host, because the encoder is a pure function over the schema registry plus the (key, deviceId, options) inputs. Second,
 * {@link COMMAND_ADAPTERS} is a const-object lookup; routing it through the host would let tests substitute adapter behavior, but no test scenario calls for
 * substituting the adapter table - the table itself is the SSOT for wire-vs-API divergences and is tested in {@link COMMAND_ADAPTERS}'s own test file.
 */
export interface CommandHost {

  /**
   * Bus the {@link runCommandAndAwait} subscription opens against. Typed against {@link ClientEventsMap} so the entity-type channel selection is type-checked at the
   * call site. The runner does not emit through this bus; it only opens streams (the per-entity-type state channel) and consumes events.
   */
  readonly bus: EventBus<ClientEventsMap>;

  /**
   * Resolve the wire-side `device_id` overlay for an entity key. Mirrors {@link EntityRegistry.deviceIdForKey}; the runner forwards the
   * value into {@link encodeEntityCommand}'s `deviceId` slot so the encoder can stamp the command's `device_id` field when the entity belongs to a sub-device.
   *
   * @param key - The numeric entity key.
   * @returns The device id, or `undefined` when no overlay has been recorded for this key (the typical single-device case).
   */
  deviceIdForKey(key: number): number | undefined;

  /**
   * Resolve the numeric protocol key for a branded entity id. Mirrors {@link EntityRegistry.keyForId}; the runner forwards the value into
   * {@link encodeEntityCommand}'s `key` slot and uses it as the predicate-loop's match target inside {@link runCommandAndAwait}.
   *
   * @param id - The branded entity id.
   * @returns The numeric key, or `null` when no entity has been registered under this id.
   */
  keyForId(id: EntityId): Nullable<number>;

  /**
   * Logger interface used for the malformed-id warn (fire-and-forget runner only), the `sendEntityCommand` debug line, the encode-failure warns
   * (`schema_unknown` / `command_unsupported` / `key_not_found`), and the unrecognized-options debug emitted by {@link reportUnrecognizedOptions}.
   */
  readonly log: EspHomeLogging;

  /**
   * Optional structured-metrics sink. The runner increments `entity.commands.sent` with `{ type: <entityType> }` once per successful encode-and-send. Absent
   * (`undefined`) means zero-cost emit - every emit site uses optional chaining.
   */
  readonly metrics: ClientMetrics | undefined;

  /**
   * Send a wire frame fire-and-forget. The host's private `frameAndSend` routes through the active transport, picks plaintext vs. noise framing, and surfaces transport-
   * level errors via the disconnect path.
   *
   * @param type - The outbound message-type identifier produced by {@link encodeEntityCommand}.
   * @param payload - The encoded protobuf-payload bytes produced by {@link encodeEntityCommand}.
   */
  send(type: number, payload: Buffer): void;

  /**
   * Resolve an entity-type string to its {@link EntitySchema} via the host's per-instance
   * {@link SchemasTable}. The runner forwards this into {@link encodeEntityCommand} so an extras-registered entity type's command shape
   * (`door_cover` aliased onto `cover`'s wire format, an `extending(...)`-derived custom switch) resolves through the same code path as a built-in.
   *
   * @param entityType - The entity-type string slice from the branded id's prefix.
   * @returns The matching {@link EntitySchema}, or `undefined` when no schema is registered for that type on this client instance.
   */
  resolveSchema(entityType: string): EntitySchema | undefined;
}

/**
 * Extract the entity type prefix from a branded entity id. Returns `null` when the id is malformed (no `-` separator or the dash is at index 0). The runtime extraction
 * trusts the brand at the type level - by the time a malformed id reaches here, the caller has unsafe-cast across the brand boundary. The testing
 * `MockClient.commandAndAwait` reads the prefix through this function as well, so the mock treats exactly the ids the client treats as malformed.
 *
 * @param id - The branded entity id.
 * @returns The entity-type string slice or `null` when the id is malformed.
 * @internal
 */
export function entityTypeFromId(id: EntityId): Nullable<string> {

  const dash = id.indexOf("-");

  if(dash <= 0) {

    return null;
  }

  return id.slice(0, dash);
}

/**
 * Refuse a transmit through an entity whose capabilities lack the transmitter bit. {@link EspHomeClient.transmitRawTimings} calls this after its entity lookup and
 * the testing `MockClient` calls it on a registered entity, so the capability rule and its error are stated once and a consumer test against the mock sees the same
 * refusal the real client raises.
 *
 * @param entity - The registered entity the transmit targets. Typed as the entity base shape so the client's branded lookup and the mock's registry lookup pass it
 * without a cast.
 * @param id - The branded entity id, named in the error message.
 *
 * @throws {ConnectionError} with code `ENTITY_NOT_TRANSMITTER` when the entity's `capabilities` bitmask does not include the transmitter bit.
 */
export function assertTransmitter(entity: BaseEntity, id: EntityId): void {

  // The capability bitmask values for IR and RF use the same bit positions (bit 0 = transmitter), so a bit test against either constant produces the same result and the
  // check does not need to branch on entity type. The `capabilities` field is declared on the infrared and radio-frequency schemas but not on the base shape, so we read
  // it through a structural view as `number | undefined` (a wire-missing field surfaces as undefined). Treat missing as "no transmitter bit set" - we cannot transmit
  // through a device that did not advertise the capability.
  const capabilities = ((entity as { capabilities?: number }).capabilities) ?? 0;

  if((capabilities & InfraredCapabilityFlags.TRANSMITTER) === 0) {

    throw new ConnectionError("Entity " + id + " is not a transmitter (capabilities bitmask: " + String(capabilities) + ").", "ENTITY_NOT_TRANSMITTER");
  }
}

/**
 * The one place an encode refusal becomes a {@link ConfigurationError} code: {@link runCommandAndAwait} and the testing `MockClient.commandAndAwait` reject a
 * refused command with the code its reason maps to. The map is exhaustive over {@link EncodeFailureReason}, so a new refusal reason fails the typecheck here until it
 * is given a code. A missing key maps to `UNKNOWN_ENTITY_ID` because an entity with no registered key is an unknown entity id.
 *
 * @internal
 */
export const ENCODE_REFUSAL_CODES = {

  "command_unsupported": "COMMAND_UNSUPPORTED",
  "enum_value_unknown": "ENUM_VALUE_UNKNOWN",
  "key_not_found": "UNKNOWN_ENTITY_ID",
  "schema_unknown": "SCHEMA_UNKNOWN",
  "value_out_of_range": "VALUE_OUT_OF_RANGE"
} as const satisfies Record<EncodeFailureReason, ConfigurationErrorCode>;

/**
 * Inputs for {@link encodeCommand}.
 */
interface EncodeCommandInput {

  /**
   * The entity type the calling runner extracted from the id's prefix.
   */
  readonly entityType: string;

  /**
   * The host the key, device-id, and schema lookups and the debug trace go through, narrowed to the members {@link encodeCommand} reads: every {@link CommandHost}
   * passes, and the testing `MockClient` passes a view over its own entity registry.
   */
  readonly host: Pick<CommandHost, "deviceIdForKey" | "keyForId" | "resolveSchema"> & { readonly log: Pick<EspHomeLogging, "debug"> };

  /**
   * The branded entity id.
   */
  readonly id: EntityId;

  /**
   * The caller's command options in their public shape.
   */
  readonly options: unknown;
}

/**
 * The outcome of {@link encodeCommand}: the encoder's result and the wire-shaped options the adapter produced, which the send reports unrecognized keys against.
 */
interface CommandEncoding {

  readonly result: EncodeResult;
  readonly wireOptions: Record<string, unknown>;
}

/**
 * Adapt, key, and encode one command. Both runners encode through this function exactly once per command, so the fire-and-forget send and the awaited send put the
 * same bytes on the wire and refuse the same inputs. The testing `MockClient` encodes through it as well, so a consumer test against the mock sees the same refusals
 * the real client applies.
 *
 * @param input - The {@link EncodeCommandInput} bag.
 * @returns The encode result paired with the adapted wire options.
 * @internal
 */
export function encodeCommand(input: EncodeCommandInput): CommandEncoding {

  const { entityType, host, id, options } = input;

  // Stage 2: apply the runtime adapter for any wire-vs-API divergence (light's rgb expansion, siren's duration round). Adapters return a freshly-shaped record without
  // mutating the input. When no adapter exists the wire shape and the public shape are identical.
  const adapter = COMMAND_ADAPTERS[entityType as EntityType];
  const wireOptions = adapter ? adapter(options as Record<string, unknown>) : (options as Record<string, unknown>);

  // Stage 3: resolve the entity key through the host's registry. The encoder accepts `undefined` and reports `key_not_found` when the lookup misses; we do not
  // pre-throw because the fire-and-forget runner gives that refusal the same warn-and-drop treatment as schema_unknown / command_unsupported.
  const key = host.keyForId(id) ?? undefined;

  host.log.debug("sendEntityCommand - type: " + entityType + " | ID: " + id + " | KEY: " + String(key) + " | options: " + JSON.stringify(wireOptions));

  // Stage 4: encode through the schema-driven pipeline. The encoder is pure - it does not touch host state - so the runner consumes it as a direct import rather than
  // through the host. The per-instance schema resolver goes through the host so extras-registered entity types resolve correctly.
  const result = encodeEntityCommand({

    deviceId: (key !== undefined) ? host.deviceIdForKey(key) : undefined,
    id,
    key,
    options: wireOptions,
    resolveSchema: (entityTypeArg: string): EntitySchema | undefined => host.resolveSchema(entityTypeArg)
  });

  return { result, wireOptions };
}

/**
 * Send one encoded command: report any option keys the encoder did not consume, frame-and-send the payload, and count the send. Both runners send through this
 * function once the encode succeeds.
 *
 * @param host - The command-dispatch host.
 * @param encoded - The successful encode result, which carries the entity type the metric is tagged with.
 * @param wireOptions - The adapted wire options the encode consumed.
 */
function sendEncodedCommand(host: CommandHost, encoded: Extract<EncodeResult, { ok: true }>, wireOptions: Record<string, unknown>): void {

  // Stage 6: report unrecognized option keys at debug level, frame-and-send the wire payload, increment the metrics counter. The metric tag is the entity type so
  // dashboards can break command throughput out per type.
  reportUnrecognizedOptions({ entityType: encoded.entityType, log: host.log, options: wireOptions, processedKeys: encoded.processedKeys });
  host.send(encoded.value.messageType, encoded.value.payload);
  host.metrics?.increment("entity.commands.sent", 1, { type: encoded.entityType });
}

/**
 * Single canonical command-dispatch entry point. Body of the host's {@link EspHomeClient.command} method.
 *
 * @remarks Named stages, top-to-bottom: extract entity type, run wire-vs-API adapter, resolve entity key, encode through the schema-driven pipeline, handle encode
 * failure, send and emit the metric. Each stage is small and individually testable; the body reads as documentation for the command path.
 *
 * Fire-and-forget contract: a malformed branded id, an unknown entity, or an entity type that does not declare a command schema all warn-and-drop. The runner does not
 * throw. {@link runCommandAndAwait} layers typed throws over this same path when its consumer needs the failure surfaced.
 *
 * @typeParam T - Entity type tag carried by the branded id.
 * @param host - The command-dispatch host interface.
 * @param id - The branded entity id.
 * @param options - Type-narrowed command options for the entity type.
 */
export function runCommand<T extends EntityType>(host: CommandHost, id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void {

  // Stage 1: extract the entity type from the branded id's prefix. Trust the brand because the type system enforced it upstream; the only way a malformed id reaches
  // here is via an unsafe cast at the call site.
  const entityType = entityTypeFromId(id);

  if(entityType === null) {

    host.log.warn("command(): malformed entity id '" + id + "'.");

    return;
  }

  // Stages 2 through 4: adapt, key, and encode.
  const { result, wireOptions } = encodeCommand({ entityType, host, id, options });

  // Stage 5: handle encode failure. Each failure reason has a distinct warn message so operators can see why a command was dropped at the host's debug log.
  if(!result.ok) {

    switch(result.reason) {

      case "schema_unknown":

        host.log.warn("Unknown entity type: " + entityType + ".");

        return;

      case "command_unsupported":

        host.log.warn("Entity type " + entityType + " does not support commands.");

        return;

      case "key_not_found":

        host.log.warn("Entity key not found for ID: " + id + ".");

        return;

      case "enum_value_unknown":

        host.log.warn("Command for " + entityType + " dropped: " + (result.detail ?? "a command field received an unknown enum value") + ".");

        return;

      case "value_out_of_range":

        host.log.warn("Command for " + entityType + " dropped: " + (result.detail ?? "a command field received an out-of-range value") + ".");

        return;

      default:

        return;
    }
  }

  // Stage 6: send the encoded command.
  sendEncodedCommand(host, result, wireOptions);
}

/**
 * Send a command and resolve with the next matching state event for the same entity. Body of the host's {@link EspHomeClient.commandAndAwait} method.
 *
 * @remarks Stages: extract entity type (typed throw on malformed id), resolve target key (typed throw on unknown id), encode the command (typed throw on an encode
 * refusal), compose abort sources, pre-subscribe to the entity's state stream, send the encoded command, run the predicate-match loop. The command is encoded once,
 * before anything subscribes, so a refused command rejects at once and opens no stream. The pre-subscribe stage (#5) runs before the send (#6) so a fast device
 * cannot beat the listener; the BackpressureStream attaches its emitter listener synchronously in its constructor, so the listener is live the moment
 * `host.bus.stream(...)` returns.
 *
 * Predicate normalization. Supports sync `boolean` and async `Promise<boolean>` predicates - both go through {@link Promise.try}, which collapses sync throws and
 * async rejects to a single Promise rejection that propagates out of the await. The default (no predicate) accepts any state event whose key matches the resolved
 * target.
 *
 * Error surface. Throws {@link ConfigurationError} with code `MALFORMED_ENTITY_ID` when the branded id has no `-` separator (consumer-side unsafe cast
 * across the brand boundary), `UNKNOWN_ENTITY_ID` when the key resolution misses (consumer issued a command before discovery completed, or for an entity that is not
 * on the current connection), `SCHEMA_UNKNOWN`, `COMMAND_UNSUPPORTED`, `ENUM_VALUE_UNKNOWN`, or `VALUE_OUT_OF_RANGE` when the encoder refuses the command (nothing
 * is sent), or `AWAIT_STREAM_CLOSED` when the bus is disposed without a matching event arriving. The timeout surfaces as the `TimeoutError` of
 * {@link AbortSignal.timeout}, and a caller's abort surfaces as that signal's reason when the reason is an `Error` and as an `AbortError` otherwise.
 *
 * @typeParam T - Entity type tag carried by the branded id; constrained to the {@link CommandAndAwaitable} subset.
 * @param host - The command-dispatch host interface.
 * @param id - The branded entity id.
 * @param options - Type-narrowed command options for the entity type.
 * @param awaitOptions - Optional cancellation signal, custom timeout, and predicate.
 * @returns The first state event for the entity that matches the predicate.
 */
export async function runCommandAndAwait<T extends CommandAndAwaitable>(
  host: CommandHost,
  id: EntityId<T>,
  options: CommandFor<typeof ENTITY_SCHEMAS[T]>,
  awaitOptions?: CommandAndAwaitOptions<T>
): Promise<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

  const timeoutMs = awaitOptions?.timeoutMs ?? DEFAULT_COMMAND_AWAIT_TIMEOUT_MS;

  // Stage 1: extract the entity type. Mirrors runCommand's stage 1 but throws instead of warn-and-drop; consumers awaiting a Promise expect failures surfaced rather than
  // silently swallowed.
  const entityType = entityTypeFromId(id);

  if(entityType === null) {

    throw new ConfigurationError("commandAndAwait(): malformed entity id '" + id + "'.", "MALFORMED_ENTITY_ID");
  }

  // Stage 2: resolve the target key for the predicate-match loop. We need the key here (not just inside the encode) because the predicate matches by
  // `key === targetKey`; the encode would refuse an unregistered entity too, but throwing here surfaces the misuse as the unknown-id error before anything else runs.
  const targetKey = host.keyForId(id) ?? undefined;

  if(targetKey === undefined) {

    throw new ConfigurationError("commandAndAwait(): unknown entity id '" + id + "'.", "UNKNOWN_ENTITY_ID");
  }

  // Stage 3: encode the command before anything subscribes or sends. A refused command (a type without a command schema, an unknown enum alias, an out-of-range
  // value) rejects at once with its refusal code rather than sending nothing and waiting out the timeout.
  const { result, wireOptions } = encodeCommand({ entityType, host, id, options });

  if(!result.ok) {

    const code = ENCODE_REFUSAL_CODES[result.reason];

    throw new ConfigurationError("commandAndAwait(): command for " + id + " refused before sending (" + code + ")" +
      ((result.detail === undefined) ? "." : ": " + result.detail + "."), code);
  }

  // Stage 4: compose the abort sources. The timeout always fires; the caller's signal is layered on when supplied. AbortSignal.any returns a single composite that
  // aborts on any source - the BackpressureStream attaches a one-shot listener and rejects parked iterators with the timeout's TimeoutError or the caller's own
  // abort reason, whichever source fired first.
  const sources: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];

  if(awaitOptions?.signal) {

    sources.push(awaitOptions.signal);
  }

  const composedSignal = AbortSignal.any(sources);

  /* Stage 5 (architectural keystone): pre-subscribe to the entity's state stream BEFORE the command sends. The bus.stream() constructor attaches its EventEmitter
   * listener synchronously, so the moment this line returns we are listening for state events. Stage 6 then sends the wire frame; any state response the device
   * emits between this line and the for-await consumption queues into the BackpressureStream's internal buffer and surfaces on the first iterator pull. Reordering
   * stages 5 and 6 would re-introduce a race where a fast device can beat the listener and the await hangs until timeout.
   */
  const stream = host.bus.stream(entityType as T, { signal: composedSignal });

  // Stage 6: send the command stage 3 encoded. An accepted command the device never answers waits out the timeout, and the caller sees its TimeoutError.
  sendEncodedCommand(host, result, wireOptions);

  // Stage 7: run the predicate-match loop. Iterate the stream until we see a state event whose key matches the resolved target and whose predicate accepts. Predicate
  // normalization through Promise.try handles sync boolean, async boolean, sync throw, and async reject in one path.
  for await (const event of stream) {

    // Camera is excluded at the type level because its schema declares no command block, not because its event lacks `key` - camera's state event carries `key` just
    // like every other narrowed event type. The cast widens the union to a structural shape that exposes `key` so we can compare against the resolved target key.
    const keyed = event as { key: number };

    if(keyed.key !== targetKey) {

      continue;
    }

    // The compile-time bound `T extends CommandAndAwaitable` excludes camera from the input set, so at runtime every yielded event is a non-camera variant whose
    // structural shape is captured by `StateEventFor<typeof ENTITY_SCHEMAS[T]>`. The bus.stream value type widens to the schema-derived union over `T`, which the
    // compiler cannot prove is the same StateEventFor specialization once camera's omit+add divergence enters the picture; the `unknown` intermediate documents the
    // boundary cast.
    const typed = event as unknown as StateEventFor<typeof ENTITY_SCHEMAS[T]>;
    const predicate = awaitOptions?.predicate;
    const accept = predicate ? await Promise.try(() => predicate(typed)) : true;

    if(accept) {

      return typed;
    }
  }

  // Fallthrough only happens when the stream ends cleanly (EventBus disposed) without a matching event. Surface a typed error rather than hanging or returning undefined;
  // the timeout and abort paths reject from the iterator before we reach here.
  throw new ConfigurationError("commandAndAwait(): stream ended before a matching state event arrived.", "AWAIT_STREAM_CLOSED");
}
