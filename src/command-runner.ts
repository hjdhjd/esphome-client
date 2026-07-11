/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-runner.ts: Single source of truth for command dispatch.
 */

/**
 * Authoritative implementation of the command-dispatch entry points. Owns the orchestration logic behind {@link EspHomeClient.command} and
 * {@link EspHomeClient.commandAndAwait}; the host's two public methods are one-line delegates with their JSDoc preserved for IDE hover.
 *
 * @remarks Two named runners, one shared narrow seam. {@link runCommand} extracts the entity type from the branded id, applies the matching {@link COMMAND_ADAPTERS}
 * runtime adapter (light's RGB flatten, siren's duration round), runs the schema-driven {@link encodeEntityCommand} pipeline, frames-and-sends through the seam, and
 * emits the `entity.commands.sent` metric. {@link runCommandAndAwait} composes that runner with a pre-subscription stage (open the bus stream *before* the command
 * sends), an `AbortSignal.any` composition (timeout plus the caller's optional signal), and a predicate-match loop normalized through {@link Promise.try} so sync and
 * async predicates collapse to one rejection path.
 *
 * The narrow seam pattern mirrors {@link RunPhaseHost} and {@link LogSubscriptionManagerHost}: a small read surface
 * plus a handful of method seams for behavior the host owns. The seam carries only state-bearing primitives - the bus the runner subscribes to for state events, the
 * logger, the metrics sink, the registry's id <-> key bijection (`keyForId`), the registry's device-id overlay (`deviceIdForKey`), and the framing-and-send hook.
 * Pure-function imports ({@link COMMAND_ADAPTERS}, {@link encodeEntityCommand}, {@link reportUnrecognizedOptions}) are not seam members because they have no
 * host-state dependency.
 *
 * The error-surface asymmetry between the two runners is intentional. {@link runCommand} is fire-and-forget: a malformed branded id, an unknown entity id, an entity
 * type without a command schema all warn-and-drop. The contract is one-shot lossy semantics: consumer code calling fire-and-forget `command()` already accepts the
 * possibility of a dropped send. {@link runCommandAndAwait} returns a Promise; consumers expect typed failure rather than silent drop, so the same conditions throw a
 * {@link ConfigurationError} with a named code. Both behaviors are tested in both directions.
 *
 * The pre-subscribe ordering rule is the architectural keystone of {@link runCommandAndAwait}. The bus stream is opened *before* the command sends, so a fast device
 * cannot race ahead of the listener. The internal `BackpressureStream` attaches its `EventEmitter` listener synchronously in its constructor, so the moment
 * `host.bus.stream(...)` returns we are listening; subsequent `host.send(...)` cannot lose a state response that arrives between the two.
 *
 * @module command-runner
 */
import type { ClientMetrics, EspHomeLogging, Nullable } from "./types.ts";
import type { CommandFor, StateEventFor } from "./schemas/derived.ts";
import type { ENTITY_SCHEMAS, EntitySchema, EntityType } from "./schemas/index.ts";
import { encodeEntityCommand, reportUnrecognizedOptions } from "./command-pipeline.ts";
import type { Buffer } from "node:buffer";
import { COMMAND_ADAPTERS } from "./schemas/index.ts";
import type { ClientEventsMap } from "./esphome-client.ts";
import { ConfigurationError } from "./errors.ts";
import type { EntityId } from "./entity-id.ts";
import type { EventBus } from "./event-bus.ts";

/**
 * Default timeout (in milliseconds) {@link runCommandAndAwait} applies when the caller does not supply `awaitOptions.timeoutMs`. Sized at 2000ms - long enough that
 * a healthy device responds well within the window, short enough that a hung device does not stall consumer code by more than the typical request latency budget.
 */
export const DEFAULT_COMMAND_AWAIT_TIMEOUT_MS = 2000;

/**
 * Type-level constraint on the entity types {@link runCommandAndAwait} accepts. Excludes the read-only, stateless, and non-key-bearing entity types whose state
 * schemas do not respond to commands - calling `commandAndAwait` against them would hang until timeout. The exclusion is kept in sync with the host method's own
 * type-level constraint.
 *
 * @remarks `binary_sensor`, `sensor`, and `text_sensor` are read-only - they emit state but no command surface exists. `button` is stateless on the wire (the device
 * acknowledges with no telemetry). `camera` is excluded because its schema declares no `command` block, so a generic entity command can never be encoded for it;
 * its state event still carries the numeric `key` field (preserved by the schema's event-shape override) - it simply has no command surface to invoke. `infrared`
 * and `radio_frequency` are excluded because they emit raw-timing receive events (no key-bearing state response) and use a transmit RPC rather than a key-targeted
 * command.
 */
export type NonAwaitableEntityType = "binary_sensor" | "button" | "camera" | "infrared" | "radio_frequency" | "sensor" | "text_sensor";

/**
 * Entity types accepted by {@link runCommandAndAwait}. The complement of {@link NonAwaitableEntityType} relative to the canonical {@link EntityType} set.
 */
export type CommandAndAwaitable = Exclude<EntityType, NonAwaitableEntityType>;

/**
 * Per-call options for {@link runCommandAndAwait}. All fields are optional; defaults: 2000ms timeout, no caller signal, predicate accepts any state event for the entity.
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
   * Optional override for the await timeout. Defaults to {@link DEFAULT_COMMAND_AWAIT_TIMEOUT_MS} (2000ms).
   */
  timeoutMs?: number;
}

/**
 * Narrow seam {@link runCommand} and {@link runCommandAndAwait} consume from the host. Mirrors {@link RunPhaseHost} - a small read surface
 * (bus, logger, optional metrics sink), a few method seams that delegate into the host's registry and transport, and nothing else. Pure-function imports
 * ({@link COMMAND_ADAPTERS}, {@link encodeEntityCommand}, {@link reportUnrecognizedOptions}) live as direct module imports inside the runner because they have no
 * host-state dependency.
 *
 * @remarks Two design decisions hold the seam at this width. First, the encode pipeline lives in {@link encodeEntityCommand}; the runner consumes
 * it directly rather than routing through the seam, because the encoder is a pure function over the schema registry plus the (key, deviceId, options) inputs. Second,
 * {@link COMMAND_ADAPTERS} is a const-object lookup; routing it through the seam would let tests substitute adapter behavior, but no test scenario calls for
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
 * trusts the brand at the type level - by the time a malformed id reaches here, the caller has unsafe-cast across the brand boundary.
 *
 * @param id - The branded entity id.
 * @returns The entity-type string slice or `null` when the id is malformed.
 */
function entityTypeFromId(id: EntityId): Nullable<string> {

  const dash = id.indexOf("-");

  if(dash <= 0) {

    return null;
  }

  return id.slice(0, dash);
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
 * @param host - The command-dispatch seam.
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

  // Stage 2: apply the runtime adapter for any wire-vs-API divergence (light's rgb expansion, siren's duration round). Adapters return a freshly-shaped record without
  // mutating the input. When no adapter exists the wire shape and the public shape are identical.
  const adapter = COMMAND_ADAPTERS[entityType as EntityType];
  const wireOptions = adapter ? adapter(options as Record<string, unknown>) : (options as Record<string, unknown>);

  // Stage 3: resolve the entity key through the registry seam. The encoder accepts `undefined` and reports `key_not_found` when the lookup miss happens; we do not
  // pre-throw because the failure path needs the same warn-and-drop treatment as schema_unknown / command_unsupported.
  const key = host.keyForId(id) ?? undefined;

  host.log.debug("sendEntityCommand - type: " + entityType + " | ID: " + id + " | KEY: " + String(key) + " | options: " + JSON.stringify(wireOptions));

  // Stage 4: encode through the schema-driven pipeline. The encoder is pure - it does not touch host state - so the runner consumes it as a direct import rather than
  // through the seam. The per-instance schema resolver flows through the seam so extras-registered entity types resolve correctly.
  const result = encodeEntityCommand({

    deviceId: (key !== undefined) ? host.deviceIdForKey(key) : undefined,
    id,
    key,
    options: wireOptions,
    resolveSchema: (entityTypeArg: string): EntitySchema | undefined => host.resolveSchema(entityTypeArg)
  });

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

      default:

        return;
    }
  }

  // Stage 6: report unrecognized option keys at debug level, frame-and-send the wire payload, increment the metrics counter. The metric tag is the entity type so
  // dashboards can break command throughput out per type.
  reportUnrecognizedOptions({ entityType, log: host.log, options: wireOptions, processedKeys: result.processedKeys });
  host.send(result.value.messageType, result.value.payload);
  host.metrics?.increment("entity.commands.sent", 1, { type: entityType });
}

/**
 * Send a command and resolve with the next matching state event for the same entity. Body of the host's {@link EspHomeClient.commandAndAwait} method.
 *
 * @remarks Stages: extract entity type (typed throw on malformed id), resolve target key (typed throw on unknown id), compose abort sources, pre-subscribe to the
 * entity's state stream, send the command via {@link runCommand}, run the predicate-match loop. The pre-subscribe stage (#4) runs before the send (#5) so a fast
 * device cannot beat the listener; the BackpressureStream attaches its emitter listener synchronously in its constructor, so the listener is live the moment
 * `host.bus.stream(...)` returns.
 *
 * Predicate normalization. Supports sync `boolean` and async `Promise<boolean>` predicates - both go through {@link Promise.try}, which collapses sync throws and
 * async rejects to a single Promise rejection that propagates out of the await. The default (no predicate) accepts any state event whose key matches the resolved
 * target.
 *
 * Error surface. Throws {@link ConfigurationError} with code `MALFORMED_ENTITY_ID` when the branded id has no `-` separator (consumer-side unsafe cast
 * across the brand boundary), `UNKNOWN_ENTITY_ID` when the key resolution misses (consumer issued a command before discovery completed, or for an entity that no
 * longer exists),
 * or `AWAIT_STREAM_CLOSED` when the bus is disposed without a matching event arriving. Timeout and signal-abort propagate as the standard `AbortError`
 * {@link AbortSignal.any} surfaces.
 *
 * @typeParam T - Entity type tag carried by the branded id; constrained to the {@link CommandAndAwaitable} subset.
 * @param host - The command-dispatch seam.
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

  // Stage 2: resolve the target key for the predicate-match loop. We need the key here (not just inside runCommand) because the predicate matches by `key === targetKey`;
  // sending a command for an unregistered entity would also fail downstream, but throwing here surfaces the misuse as a typed error rather than a silent timeout.
  const targetKey = host.keyForId(id) ?? undefined;

  if(targetKey === undefined) {

    throw new ConfigurationError("commandAndAwait(): unknown entity id '" + id + "'.", "UNKNOWN_ENTITY_ID");
  }

  // Stage 3: compose the abort sources. The timeout always fires; the caller's signal is layered on when supplied. AbortSignal.any returns a single composite that
  // aborts on any source - the BackpressureStream attaches a one-shot listener and rejects parked iterators with the timeout's TimeoutError or the caller's own
  // abort reason, whichever source fired first.
  const sources: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];

  if(awaitOptions?.signal) {

    sources.push(awaitOptions.signal);
  }

  const composedSignal = AbortSignal.any(sources);

  /* Stage 4 (architectural keystone): pre-subscribe to the entity's state stream BEFORE the command sends. The bus.stream() constructor attaches its EventEmitter
   * listener synchronously, so the moment this line returns we are listening for state events. Stage 5's runCommand then sends the wire frame; any state response the
   * device emits between this line and the for-await consumption queues into the BackpressureStream's internal buffer and surfaces on the first iterator pull. Reordering
   * stages 4 and 5 would re-introduce a race where a fast device can beat the listener and the await hangs until timeout.
   */
  const stream = host.bus.stream(entityType as T, { signal: composedSignal });

  // Stage 5: send the command. runCommand's fire-and-forget contract means a malformed id at this point would warn-and-drop rather than throw - but stages 1 and 2
  // already validated the id, so the runner reaches the encode-and-send path. If runCommand silently drops (e.g., command_unsupported for an entity type without a
  // command schema), the await still hangs on the open stream until the timeout fires; the caller sees an AbortError, which is the correct surface for "command was
  // accepted but the device produced no response."
  runCommand(host, id, options);

  // Stage 6: run the predicate-match loop. Iterate the stream until we see a state event whose key matches the resolved target and whose predicate accepts. Predicate
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
  // the timeout path raises AbortError before we reach here.
  throw new ConfigurationError("commandAndAwait(): stream ended before a matching state event arrived.", "AWAIT_STREAM_CLOSED");
}
