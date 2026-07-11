/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * latest-state-cache.ts: Per-entity latest-state cache for telemetry.
 */

/**
 * Latest-state cache.
 *
 * @remarks Holds the most recent {@link TelemetryEvent} for every entity, keyed by branded {@link EntityId}. The host writes the cache
 * inside the run-phase telemetry handler **before** notifying listeners on the `telemetry` and per-type bus channels, so any listener that reads via
 * {@link EspHomeClient.latest}, {@link EspHomeClient.snapshot}, or {@link EspHomeClient.snapshotFor} from inside a
 * callback sees the event that fired the callback. Cleared on every {@link EspHomeClient.connect} reset so a fresh session starts with no inherited
 * state...stale entries from a prior connection never surface.
 *
 * Reads and writes are O(1). Memory is bounded - one entry per discovered entity. The full map is exposed as a {@link ReadonlyMap} from {@link LatestStateCache.entries}
 * so consumers can iterate without copying; the type-narrowed {@link LatestStateCache.entriesFor} variant allocates because the filter must produce a new map.
 *
 * @module latest-state-cache
 */
import type { ENTITY_SCHEMAS, EntityType, StateEventFor, TelemetryEvent } from "./schemas/index.ts";
import type { EntityId } from "./entity-id.ts";
import type { Nullable } from "./types.ts";

/**
 * Latest-state cache. `Map<EntityId, TelemetryEvent>` with a type-narrowed read API.
 */
export class LatestStateCache {

  /**
   * Backing store. Keys are branded {@link EntityId}; values are the most recent {@link TelemetryEvent} for the entity.
   */
  private readonly cache = new Map<EntityId, TelemetryEvent>();

  /**
   * Record the most recent state event for an entity. Overwrites any prior entry.
   *
   * @param id - Branded entity id.
   * @param event - The state event to record.
   */
  public set(id: EntityId, event: TelemetryEvent): void {

    this.cache.set(id, event);
  }

  /**
   * Read the most recent state event for an entity, narrowed to the entity's type.
   *
   * @param id - Branded entity id.
   * @returns The state event, or `null` when no state has been recorded since the most recent connect.
   */
  public get<T extends EntityType>(id: EntityId<T>): Nullable<StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    const event = this.cache.get(id);

    if(!event) {

      return null;
    }

    // The map is keyed by the branded id; an entry for `EntityId<T>` is - by construction at the call site - a state event of type `T`. We narrow at the boundary so the
    // public surface returns the type-specific event shape rather than the discriminated union top type.
    return event as StateEventFor<typeof ENTITY_SCHEMAS[T]>;
  }

  /**
   * Drop every entry. Called by {@link EspHomeClient.connect} so a fresh session starts clean.
   */
  public clear(): void {

    this.cache.clear();
  }

  /**
   * Read-only view of the entire cache. Same `Map` reference, exposed via {@link ReadonlyMap} so consumers cannot mutate it.
   *
   * @returns A read-only view of the cache.
   */
  public entries(): ReadonlyMap<EntityId, TelemetryEvent> {

    return this.cache;
  }

  /**
   * Read-only filtered view of the cache, narrowed to one entity type. Allocates because the filter must produce a new map.
   *
   * @param type - The entity type to filter on.
   * @returns A read-only map of entity ids to their state events, narrowed to entries of type `T`.
   */
  public entriesFor<T extends EntityType>(type: T): ReadonlyMap<EntityId<T>, StateEventFor<typeof ENTITY_SCHEMAS[T]>> {

    const out = new Map<EntityId<T>, StateEventFor<typeof ENTITY_SCHEMAS[T]>>();

    for(const [ id, event ] of this.cache) {

      if(event.type === type) {

        // The `event.type === type` guard above runtime-justifies the event cast, but the `id as EntityId<T>` brand cast rests on the same set()-time by-construction
        // guarantee get() documents: a key of brand `EntityId<T>` was paired with a state event of type `T` at the call site, so the local guard does not narrow the
        // key's brand.
        out.set(id as EntityId<T>, event as StateEventFor<typeof ENTITY_SCHEMAS[T]>);
      }
    }

    return out;
  }
}
