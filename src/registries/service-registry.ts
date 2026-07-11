/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * service-registry.ts: Single source of truth for user-defined-service identity.
 */

import type { EspHomeLogging, Nullable, ServiceEntity } from "../types.ts";

/**
 * Authoritative store for user-defined-service identity, lookup, and enumeration.
 *
 * @remarks The registry is the single source of truth for the user-defined services an ESPHome device exposes during discovery. Two lookup-shaped fields are coordinated
 * here behind a coherent surface keyed to one concept ("service identity"): an ordered `services: ServiceEntity[]` list (consumer-facing enumeration order) and a
 * `servicesByKey: Map<number, ServiceEntity>` by-key index (O(1) execution lookup). Name lookup is a linear scan, intentional given ESPHome's per-device service count
 * is typically in the single digits.
 *
 * The host composes a single `private readonly serviceRegistry: ServiceRegistry` field; every service-related lookup on the host becomes a one-line delegate. The
 * registry holds no host-specific state and exposes nothing beyond what the host or its tests need - methods like {@link byKey}, {@link byName}, and {@link all}
 * answer real consumer questions, and the storage layout (which Map indexes the key, where the ordered list lives) stays private. The registry owns identity and
 * lookup only - service execution (encoding `ExecuteServiceRequest`, framing, transport) and the `serviceDiscovered` / `services` event coordination remain the host's
 * responsibility because they are transport / event-bus concerns, not registry concerns.
 *
 * @module registries/service-registry
 */

/**
 * Host seam consumed by the registry. The registry needs the host's logger for the per-service debug line emitted at registration time; nothing else flows across this
 * seam. Mirrors the {@link EntityRegistryHost} shape so the two registries share a uniform composition pattern.
 */
export interface ServiceRegistryHost {

  readonly log: EspHomeLogging;
}

/**
 * User-defined-service identity index. Owns the {@link ServiceEntity} record, the by-key index used for {@link byKey} lookups, and the discovery-ordered list returned
 * from {@link all}.
 */
export class ServiceRegistry {

  // Set whenever the service set changes ({@link register} appends, {@link clear} resets); cleared by {@link snapshotChanges}. Mirrors the equivalent flag on
  // {@link EntityRegistry} so the host emits `services` exactly when the registry has actually changed since the last read.
  private dirty: boolean;
  private readonly host: ServiceRegistryHost;
  private services: ServiceEntity[];
  private readonly servicesByKey: Map<number, ServiceEntity>;

  /**
   * Construct a registry bound to a host seam. Every internal index starts empty; subsequent {@link register} calls populate them in lock-step.
   *
   * @param host - The host seam (logger only).
   */
  public constructor(host: ServiceRegistryHost) {

    this.dirty = false;
    this.host = host;
    this.services = [];
    this.servicesByKey = new Map<number, ServiceEntity>();
  }

  /**
   * Number of registered services. Backs the discovery-phase counter (`countServices`) consumed by `performDiscovery`.
   */
  public get size(): number {

    return this.services.length;
  }

  /**
   * Read every service record. The returned array is the registry's internal storage exposed as a readonly view; consumers that need a mutable copy should spread or
   * slice. Iteration order matches discovery order.
   *
   * @returns Read-only view of every registered service.
   */
  public all(): readonly ServiceEntity[] {

    return this.services;
  }

  /**
   * Resolve a numeric service key to its full {@link ServiceEntity} record. Backs the host's `executeService(key, args)` lookup at the start of the execute pipeline.
   *
   * @param key - The numeric service key.
   * @returns The matching service record, or `null` when the key is unknown.
   */
  public byKey(key: number): Nullable<ServiceEntity> {

    return this.servicesByKey.get(key) ?? null;
  }

  /**
   * Resolve a service name to its full {@link ServiceEntity} record. Backs the host's `executeServiceByName(name, args)` lookup.
   *
   * @remarks Implementation is a linear scan over the ordered discovery list. ESPHome's user-defined-service count is typically in the single digits per device (the
   * wire protocol enumerates them one at a time during discovery and most firmwares define <=10), so the O(n) scan is materially indistinguishable from a hash lookup at
   * realistic counts and avoids the cost of maintaining a second index. When two services share a name (an unlikely but legal configuration), the first one in
   * discovery order wins.
   *
   * @param name - The service name to look up.
   * @returns The matching service record, or `null` when no service with that name is registered.
   */
  public byName(name: string): Nullable<ServiceEntity> {

    return this.services.find((service) => service.name === name) ?? null;
  }

  /**
   * Reset the registry. Drops every service record and the by-key index. Called from the host's `connect()` so a fresh session starts with no stale state from a
   * previous connection.
   */
  public clear(): void {

    this.services = [];
    this.servicesByKey.clear();
    this.dirty = true;
  }

  /**
   * Membership check by service key. Returns `true` when the key resolves to a registered service, `false` otherwise. Provided for symmetry with the by-key lookup so
   * call sites that only care about presence (e.g., diagnostic guards) can avoid materialising the record.
   *
   * @param key - The numeric service key.
   * @returns `true` when the key is registered, `false` otherwise.
   */
  public has(key: number): boolean {

    return this.servicesByKey.has(key);
  }

  /**
   * Register a discovered service. Updates every internal index in lock-step: the by-key map for O(1) execution lookup, and the ordered list the host emits to
   * consumers via the `services` event.
   *
   * @remarks Re-registering the same key (e.g., a duplicate `LIST_ENTITIES_SERVICES_RESPONSE` from a misbehaving device) replaces the prior entry in the by-key index
   * but appends a duplicate entry to the ordered list - the host treats discovery as monotonic, so duplicates remain observable for diagnostics. The debug log line
   * mirrors the per-entity log emitted by {@link EntityRegistry.register} so service and entity discovery have a uniform diagnostic shape.
   *
   * @param service - The decoded service record from `decodeServiceEntity`.
   */
  public register(service: ServiceEntity): void {

    this.services.push(service);
    this.servicesByKey.set(service.key, service);
    this.dirty = true;

    this.host.log.debug("Registered service: [" + String(service.key) + "] " + service.name + " with " + String(service.args.length) + " arguments");
  }

  /**
   * Atomically read whether the registry has changed since the last `snapshotChanges` (or construction) and capture a snapshot of the current contents. Clears the
   * dirty flag as a side effect.
   *
   * @remarks Mirrors {@link EntityRegistry.snapshotChanges}; the host's `LIST_ENTITIES_DONE_RESPONSE` handler reads both registries'
   * snapshots in symmetric blocks and emits the matching event (`entities` / `services`) only when the corresponding registry's `changed` is `true`. Connect-time
   * discovery uses the same primitive so the registries are the single source of truth for both the membership and the change-detection.
   *
   * @returns `{ changed, services }` - the dirty bit before clearing, and the current service list as a fresh array.
   */
  public snapshotChanges(): { changed: boolean; services: ServiceEntity[] } {

    const changed = this.dirty;

    this.dirty = false;

    return { changed, services: this.services.slice() };
  }
}
