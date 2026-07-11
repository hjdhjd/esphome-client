/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * factories.ts: Typed factory helpers for synthesizing entity, state, and device-info fixtures.
 */

/**
 * Typed factory helpers for building entity, state, and device-info fixtures consumed by {@link MockClient.populateEntities} and related test
 * surfaces.
 *
 * @remarks Each factory produces a structurally valid value that satisfies the schema-derived public type. Optional fields are conditionally included so the resulting
 * object matches `exactOptionalPropertyTypes`. Tests can override individual fields via each factory's overrides parameter; unset fields fall back to deterministic
 * defaults documented per factory.
 *
 * @module testing/factories
 */
import type { CommandFor, Entity, EntityFor, EntityType, StateEventFor } from "../schemas/index.ts";
import type { DeviceInfo } from "../esphome-client.ts";
import type { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import { HealthState } from "../health.ts";
import type { LiveConnectionHealth } from "../health.ts";
import { entityId } from "../entity-id.ts";

/**
 * Build a typed entity fixture for the given type. The `objectId` becomes the second segment of the entity's branded id; the entity's `name` defaults to the same
 * value with underscores replaced by spaces.
 *
 * @param type - The entity type tag.
 * @param objectId - The ESPHome object identifier.
 * @param overrides - Optional field overrides merged onto the synthesized entity.
 * @returns A typed entity fixture.
 *
 */
export function mockEntity<T extends EntityType>(type: T, objectId: string, overrides: Partial<EntityFor<typeof ENTITY_SCHEMAS[T]>> = {}): Entity {

  const id: EntityId = entityId(type, objectId);

  // We read overrides through a permissive view for the default computation: the override shape is the schema-derived partial (so callers get compile-time checking on
  // the input), but inside the body we just need the optional `name` to compute the default display label.
  const overrideRecord = overrides as Partial<Record<string, unknown>>;
  const base = {

    key: deterministicKey(id),
    name: overrideRecord["name"] !== undefined ? overrideRecord["name"] : objectId.replace(/_/g, " "),
    objectId,
    type
  };

  // The cast at the boundary is sound by construction: `type` selects the matching branch of the discriminated union, and the remaining fields are partials honored by
  // every variant via the optional-field mapped type. Public consumers never see this cast - the return type is the strict {@link Entity} union.
  return { ...base, ...overrides } as unknown as Entity;
}

/**
 * Build a list of entities from a compact discovery spec. Each key is an entity type; each value is an array of object ids.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#factory-pattern}
 *
 * @param spec - Map from entity type to object ids.
 * @returns The synthesized entity list.
 *
 */
export function mockEntityDiscovery(spec: Partial<Record<EntityType, readonly string[]>>): Entity[] {

  const entities: Entity[] = [];

  for(const type of Object.keys(spec) as EntityType[]) {

    const ids = spec[type];

    if(!ids) {

      continue;
    }

    for(const objectId of ids) {

      entities.push(mockEntity(type, objectId));
    }
  }

  return entities;
}

/**
 * Build a typed state-event fixture for an entity. The `id` argument is the branded entity id; the `fields` argument is the per-entity-type state shape (e.g., `{ state:
 * true, brightness: 0.8 }` for a light).
 *
 * @param id - The branded entity id.
 * @param fields - Per-type state fields.
 * @returns A typed state-event fixture suitable for emit on a {@link MockClient}'s telemetry channel.
 *
 */
export function mockStateMessage<T extends EntityType>(id: EntityId<T>, fields: Partial<StateEventFor<typeof ENTITY_SCHEMAS[T]>>):
StateEventFor<typeof ENTITY_SCHEMAS[T]> {

  const dash = id.indexOf("-");
  const type = id.slice(0, dash);

  return {

    entity: id,
    key: deterministicKey(id),
    type,
    ...fields
  // The schema-derived `StateEventFor` type carves a unique discriminated union variant per `EntityType`. The `fields` input is checked against the per-type partial
  // `Partial<StateEventFor<typeof ENTITY_SCHEMAS[T]>>`, so callers get compile-time rejection of typo'd or wrong-typed fields, but proving the assembled object
  // satisfies the exact narrowed variant from a generic `T` would require the call site to enumerate the full union - exactly the boilerplate factories exist to avoid.
  // The double cast is the structurally honest seam on the assembled RETURN object: the input surface gains checking while the output trusts the caller's shape. This is
  // one of the documented `as unknown as` boundary casts in the codebase.
  } as unknown as StateEventFor<typeof ENTITY_SCHEMAS[T]>;
}

/**
 * Build a typed device-info fixture. Used by {@link MockClient.setDeviceInfo} to seed the cached device record before consumer code reads it.
 *
 * @param overrides - Optional field overrides merged onto a deterministic baseline.
 * @returns A {@link DeviceInfo} fixture.
 *
 */
export function mockDeviceInfo(overrides: Partial<DeviceInfo> = {}): DeviceInfo {

  const base: DeviceInfo = {

    apiEncryptionSupported: false,
    bluetoothMacAddress: "AA:BB:CC:DD:EE:FF",
    bluetoothProxyFeatureFlags: 0,
    compilationTime: "2026-01-01 00:00:00",
    esphomeVersion: "2026.1.0",
    friendlyName: "test-device",
    hasDeepSleep: false,
    macAddress: "AA:BB:CC:DD:EE:FF",
    manufacturer: "esphome",
    model: "test-model",
    name: "test-device",
    projectName: "",
    projectVersion: "",
    suggestedArea: "",
    usesPassword: false,
    voiceAssistantFeatureFlags: 0,
    webserverPort: 0
  };

  return { ...base, ...overrides };
}

/**
 * Build a typed {@link LiveConnectionHealth} fixture. Defaults to a fresh `connected` record whose connect epoch and last-inbound activity are stamped at the call time.
 * The overrides are constrained to the live variant, so a `connected` or `stalled` state plus any base field (consecutiveStalls, encrypted, lastPingRttMs, ...) is
 * ergonomic; for a down ({@link DownConnectionHealth}) fixture use {@link disconnectedHealth} instead, which is the canonical disconnected baseline.
 *
 * @param overrides - Optional live-record field overrides merged onto the default record.
 * @returns A {@link LiveConnectionHealth} fixture.
 *
 */
export function mockHealth(overrides: Partial<LiveConnectionHealth> = {}): LiveConnectionHealth {

  const now = Date.now();

  const base: LiveConnectionHealth = {

    connectedAtMs: now,
    consecutiveStalls: 0,
    encrypted: false,
    lastInboundActivityAt: now,
    state: HealthState.CONNECTED
  };

  return { ...base, ...overrides };
}

/**
 * Type alias for the partial command shape associated with an entity type. Consumers passing options to {@link MockClient.command} narrow
 * naturally via the schema registry.
 */
export type MockCommand<T extends EntityType> = CommandFor<typeof ENTITY_SCHEMAS[T]>;

/**
 * Compute a deterministic numeric key from a branded id. Two calls with the same id return the same key; different ids return different keys with overwhelming
 * probability across realistic id sets. Stable across test runs.
 */
function deterministicKey(id: string): number {

  // 32-bit FNV-1a is sufficient: tests use a handful of entities, the chance of collision is vanishingly small, and the implementation is a few lines of
  // straightforward bit math.
  let hash = 0x811c9dc5;

  for(let i = 0; i < id.length; i++) {

    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
