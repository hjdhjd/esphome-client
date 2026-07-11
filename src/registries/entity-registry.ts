/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-registry.ts: Single source of truth for entity identity.
 */

import type { ENTITY_SCHEMAS, Entity, EntityType } from "../schemas/index.ts";
import type { EspHomeLogging, Nullable } from "../types.ts";
import type { EntityFor } from "../schemas/derived.ts";
import type { EntityId } from "../entity-id.ts";
import { entityId as mintEntityId } from "../entity-id.ts";

/**
 * Distributing return type for {@link EntityRegistry.byId}. When `T` is a specific entity type, this resolves to that type's narrowed
 * {@link EntityFor} shape; when `T` is the unconstrained {@link EntityType} union (the case when consumers pass an unbranded
 * `EntityId`), the mapped type distributes over every member and the indexed access returns the full {@link Entity} discriminated union. Same
 * pattern the public {@link Entity} alias uses for its own union construction.
 */
export type EntityForBranded<T extends EntityType> = { [K in T]: EntityFor<typeof ENTITY_SCHEMAS[K]> }[T];

/**
 * Authoritative store for entity identity, lookup, and grouping.
 *
 * @remarks The registry is the single source of truth for the bidirectional map between branded {@link EntityId}s and the numeric protocol keys ESPHome uses on the
 * wire. It also owns the wire-side device-id overlay populated from state messages, and the discovery-time entity records the host emits to consumers. The lookup
 * surfaces are consolidated here behind a coherent surface keyed to one concept ("entity identity") with O(1) lookups by both id and key.
 *
 * The host composes a single `private readonly registry: EntityRegistry` field; every entity-related public method on the host becomes a one-line delegate. The
 * registry holds no host-specific state and exposes nothing beyond what the host or its tests need - methods like {@link byId} and {@link availableIds} answer real
 * consumer questions, and storage details (which Map indexes the key, where the device-id overlay merges with the discovery record) stay private.
 *
 * @module registries/entity-registry
 */

/**
 * Host seam consumed by the registry. The registry needs the host's logger for the per-entity debug line emitted at registration time and for the warn-level dump in
 * {@link EntityRegistry.logAll}; nothing else flows across this seam.
 */
export interface EntityRegistryHost {

  readonly log: EspHomeLogging;
}

/**
 * Bidirectional entity identity index. Owns the {@link Entity} record, the branded id <-> protocol key bijection, and the device-id overlay populated by state messages.
 *
 */
export class EntityRegistry {

  private readonly deviceIdsByKey: Map<number, number>;
  // Set whenever the entity set changes ({@link register} appends, {@link clear} resets); cleared by {@link snapshotChanges}. Lets the host emit `entities` exactly when
  // the registry has actually changed since the last read - both at end-of-discovery (always changed, since discovery just populated the registry from empty) and on
  // mid-session `LIST_ENTITIES_DONE_RESPONSE` (changed only when device-pushed list-entities messages preceded the DONE).
  private dirty: boolean;
  private entities: Entity[];
  private readonly entitiesByKey: Map<number, Entity>;
  private readonly host: EntityRegistryHost;
  // Reverse of {@link keysById}: the branded id pre-minted at {@link register} time, keyed by protocol key. The registry is the single mint site, so warm consumers
  // (the per-state-event latest-cache write) read the precomputed id from here instead of re-minting it (two `toLowerCase` + a concat) on every telemetry frame.
  private readonly idsByKey: Map<number, EntityId>;
  private readonly keysById: Map<EntityId, number>;

  /**
   * Construct a registry bound to a host seam. Every internal index starts empty; subsequent {@link register} calls populate them in lock-step.
   *
   * @param host - The host seam (logger only).
   */
  public constructor(host: EntityRegistryHost) {

    this.deviceIdsByKey = new Map<number, number>();
    this.dirty = false;
    this.entities = [];
    this.entitiesByKey = new Map<number, Entity>();
    this.host = host;
    this.idsByKey = new Map<number, EntityId>();
    this.keysById = new Map<EntityId, number>();
  }

  /**
   * Number of registered entities. Backs `inspect.custom` and the discovery-phase counter.
   */
  public get size(): number {

    return this.entities.length;
  }

  /**
   * Read every entity record. The returned array is the registry's internal storage exposed as a readonly view; consumers that need a mutable copy should spread or
   * slice. Iteration order matches discovery order.
   *
   * @returns Read-only view of every registered entity.
   */
  public all(): readonly Entity[] {

    return this.entities;
  }

  /**
   * List every available entity id grouped by entity type. Returns the public-API shape (`Record<string, string[]>`) directly so the host's `getAvailableEntityIds`
   * is a one-line delegate. Each call returns fresh arrays, so consumer mutation cannot leak back into the registry's internal state.
   *
   * @returns Object keyed by entity-type with arrays of branded ids (typed as `string[]` at the public surface).
   */
  public availableIds(): Record<string, string[]> {

    const result: Record<string, string[]> = {};

    for(const [ type, entities ] of this.groupByType()) {

      result[type] = entities.map((entity) => mintEntityId(entity.type, entity.objectId));
    }

    return result;
  }

  /**
   * Filter the registered entities by parent device id. `undefined` returns a fresh copy of every entity; a numeric id filters to entries whose effective device id
   * matches.
   *
   * @remarks The effective device id for an entity is the discovery-time `entity.deviceId` field when present, otherwise the wire-side device id last reported on a
   * state message (overlay populated via {@link recordDeviceId}), otherwise `0` (the parent ESP). The ordering is intentional: discovery-time wins over state-time
   * wins over the parent default.
   *
   * @param deviceId - The device id to filter on, or `undefined` to return every entity.
   * @returns A fresh array of matching entities. The entity records themselves are shared with the registry; consumers should treat them as read-only.
   */
  public byDevice(deviceId: number | undefined): Entity[] {

    if(deviceId === undefined) {

      return this.entities.slice();
    }

    return this.entities.filter((entity) => {

      const recordedId = this.deviceIdsByKey.get(entity.key);
      const effectiveDeviceId = entity.deviceId ?? recordedId ?? 0;

      return effectiveDeviceId === deviceId;
    });
  }

  /**
   * Resolve a branded entity id to its full {@link Entity} record. The brand `T` carries the entity type at the type level so the return narrows automatically: passing
   * `EntityId<"light">` yields `Nullable<EntityFor<typeof ENTITY_SCHEMAS["light"]>>`. Passing the bare `EntityId` (no specific brand) yields `Nullable<Entity>`, matching
   * the narrowing pattern used by `EspHomeClient.latest`.
   *
   * @typeParam T - Entity type tag carried by the branded id.
   * @param id - The branded entity id to look up.
   * @returns The matching entity record, or `null` when the id is not registered.
   */
  public byId<T extends EntityType>(id: EntityId<T>): Nullable<EntityForBranded<T>> {

    const key = this.keysById.get(id);

    if(key === undefined) {

      return null;
    }

    const entity = this.entitiesByKey.get(key);

    if(!entity) {

      return null;
    }

    // The brand `T` carries the entity type at the type level; at register time we mint the canonical id from `entity.type`, so an id resolving to a key in `keysById`
    // necessarily points at an entity whose `.type === T`. Cast the wide `Entity` union to the narrowed shape at this boundary.
    return entity as EntityForBranded<T>;
  }

  /**
   * Resolve a numeric protocol key to its full {@link Entity} record. The state-message dispatcher receives the key on the wire and uses this lookup to recover the
   * branded id and the entity's type label.
   *
   * @param key - The numeric protocol key.
   * @returns The matching entity record, or `null` when the key is unknown.
   */
  public byKey(key: number): Nullable<Entity> {

    return this.entitiesByKey.get(key) ?? null;
  }

  /**
   * Reset the registry. Drops every entity record, every id <-> key mapping, and the device-id overlay. Called from the host's `connect()` so a fresh session starts with
   * no stale state from a previous connection.
   */
  public clear(): void {

    this.deviceIdsByKey.clear();
    this.entities = [];
    this.entitiesByKey.clear();
    this.idsByKey.clear();
    this.keysById.clear();
    this.dirty = true;
  }

  /**
   * Read the wire-side device-id overlay for an entity key. Returns `undefined` when no device id has been recorded for the key (entity belongs to the parent ESP or
   * has not yet been observed on a state message). Backs the host's command pipeline, which stamps the device id on outbound command frames when present.
   *
   * @param key - The numeric protocol key.
   * @returns The recorded device id, or `undefined` when none has been observed.
   */
  public deviceIdForKey(key: number): number | undefined {

    return this.deviceIdsByKey.get(key);
  }

  /**
   * Membership check accepting both branded ids and plain strings. This is the entity-lookup boundary where untrusted input is allowed: the question itself is
   * "is this a known id at all" before further narrowing flows downstream.
   *
   * @param id - The candidate entity id, branded or plain.
   * @returns `true` when the id is registered, `false` otherwise.
   */
  public hasId(id: EntityId | string): boolean {

    // The internal map is `Map<EntityId, number>`; the brand is purely compile-time, so the runtime structure accepts any string at the .has boundary. Widening the map
    // view to `ReadonlyMap<string, number>` keeps the boundary structurally honest without an unsafe cast on the input.
    return (this.keysById as ReadonlyMap<string, number>).has(id);
  }

  /**
   * Resolve a numeric protocol key to its pre-minted branded id. The registry mints the canonical id once at {@link register} time, so warm consumers read it from here
   * rather than re-minting it per event. Returns `null` when the key is not registered.
   *
   * @param key - The numeric protocol key.
   * @returns The pre-minted branded id, or `null` when the key is not registered.
   */
  public idByKey(key: number): Nullable<EntityId> {

    return this.idsByKey.get(key) ?? null;
  }

  /**
   * Resolve a branded entity id to its numeric protocol key.
   *
   * @param id - The branded entity id.
   * @returns The matching key, or `null` when the id is not registered.
   */
  public keyForId(id: EntityId): Nullable<number> {

    return this.keysById.get(id) ?? null;
  }

  /**
   * Emit a warn-level dump of every registered entity, grouped by type. Diagnostic helper invoked by the host's `logAllEntityIds` method.
   */
  public logAll(): void {

    this.host.log.warn("Registered Entity IDs:");

    for(const [ type, entities ] of this.groupByType()) {

      this.host.log.warn("  " + type + ":");

      for(const entity of entities) {

        const id = mintEntityId(entity.type, entity.objectId);

        this.host.log.warn("    " + id + " => " + entity.name + " (key: " + String(entity.key) + ")");
      }
    }
  }

  /**
   * Record the wire-side device id reported on a state message. Called from the run-phase telemetry handler when the message type carries a device-id field; the
   * overlay value flows back out through {@link deviceIdForKey} when the host stamps outbound commands.
   *
   * @remarks Deliberately does NOT set the dirty flag. The flag tracks entity-set membership changes (so consumers re-render their entity list); device-id overlays
   * are per-state-message metadata and would emit `entities` on every state update, which is prohibitively noisy. State changes are surfaced through the per-type
   * telemetry events instead.
   *
   * @param key - The numeric protocol key the state message arrived for.
   * @param deviceId - The wire-side device id reported in the state payload.
   */
  public recordDeviceId(key: number, deviceId: number): void {

    this.deviceIdsByKey.set(key, deviceId);
  }

  /**
   * Register a discovered entity. Updates every internal index in lock-step: the branded-id-to-key map, the key-to-entity map, the device-id overlay (when the entity
   * carries a discovery-time device id), and the ordered entity list the host emits to consumers.
   *
   * @remarks The registry uses the canonical `entityId(entity.type, entity.objectId)` mint to compute the branded id, so every code path produces the same string for
   * the same entity. Re-registering the same key (e.g., a duplicate `LIST_ENTITIES_*_RESPONSE` from a misbehaving device) replaces the prior entity record in every
   * index but appends a duplicate entry to the ordered list - the host treats discovery as monotonic, so duplicates are observable for diagnostics.
   *
   * @param entity - The decoded entity record from `decodeEntityFromSchema`.
   */
  public register(entity: Entity): void {

    const id = mintEntityId(entity.type, entity.objectId);

    // Detect an id collision before overwriting the id->key index. `deriveObjectId` is lossy and ESPHome does not enforce within-type name uniqueness, so two distinct
    // entities (distinct numeric keys) can mint the same branded id (e.g., names "Temp 1" and "Temp.1" both derive object_id "temp_1"). When that happens the later
    // registration wins for id-based lookups while both entities remain reachable by key, so `byId`/`latest`/`availableIds` silently degrade. Core telemetry routing is
    // key-based and unaffected; we preserve last-writer-wins and emit a diagnostic so the misconfiguration is observable rather than silent. A benign re-registration of
    // the same key (a repeated LIST_ENTITIES response) is not a collision and stays quiet.
    const existingKey = this.keysById.get(id);

    if((existingKey !== undefined) && (existingKey !== entity.key)) {

      this.host.log.warn("Entity id collision: two entities derive the same id; the later registration wins for id-based lookups.",
        { existingKey, id, newKey: entity.key });
    }

    this.entities.push(entity);
    this.entitiesByKey.set(entity.key, entity);
    this.keysById.set(id, entity.key);
    this.idsByKey.set(entity.key, id);
    this.dirty = true;

    if(entity.deviceId !== undefined) {

      this.deviceIdsByKey.set(entity.key, entity.deviceId);
    }

    this.host.log.debug("Registered entity: [" + String(entity.key) + "] " + entity.objectId + " (" + entity.name + ") | type: " + entity.type +
      ((entity.deviceId !== undefined) ? " | device: " + String(entity.deviceId) : ""));
  }

  /**
   * Atomically read whether the registry has changed since the last `snapshotChanges` (or construction) and capture a snapshot of the current contents. Clears the
   * dirty flag as a side effect.
   *
   * @remarks This is the single primitive both connect-time discovery and the run-phase `LIST_ENTITIES_DONE_RESPONSE` handler use to decide whether to emit the
   * `entities` event. Connect-time always sees `changed: true` on the post-discovery call (the registry was just populated from empty); run-time sees `changed: true`
   * only when the device pushed list-entities messages between the last snapshot and the current `LIST_ENTITIES_DONE_RESPONSE` (the additive-batch case), and
   * `changed: false` when the `DONE` arrived stale (no preceding entity messages). Centralising the change-detection here keeps the host's emit logic mechanical and
   * eliminates the "did anyone register an entity since I last looked?" coordination from the dispatcher.
   *
   * @returns `{ changed, entities }` - the dirty bit before clearing, and the current entity list as a fresh array (consumers may safely retain or mutate).
   */
  public snapshotChanges(): { changed: boolean; entities: Entity[] } {

    const changed = this.dirty;

    this.dirty = false;

    return { changed, entities: this.entities.slice() };
  }

  /**
   * View every entity annotated with its canonical branded id as the `id` field. Backs the host's `getEntitiesWithIds` consumer-shape API.
   *
   * @returns A fresh array of entity records, each augmented with its canonical id under the `id` key.
   */
  public withIds(): (Entity & { id: string })[] {

    return this.entities.map((entity) => ({ ...entity, id: mintEntityId(entity.type, entity.objectId) }));
  }

  /**
   * Internal helper - group the registered entities by their type tag. Both {@link availableIds} and {@link logAll} consume the same grouping; centralising
   * the iteration here keeps every consumer of this grouping consistent and lets each derive the projection it needs (branded ids vs. entity records) without
   * re-implementing the bucketing.
   */
  private groupByType(): Map<EntityType, Entity[]> {

    return Map.groupBy(this.entities, (entity) => entity.type);
  }
}
