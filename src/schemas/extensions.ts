/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * extensions.ts: Schema extension API for out-of-spec entity types.
 */

/**
 * Helpers and types for registering additional entity schemas at construction time. Some ESPHome firmware or vendor integrations expose entity types outside the
 * standard set, or want an upstream type surfaced under a distinct tag for their own dispatch. Consumers who integrate with those devices register them via
 * the `extraSchemas` option on the client; the schema-driven encoder/decoder consults the merged registry without requiring a fork of this library.
 *
 * @remarks The {@link aliasOf} helper covers the common case where a custom type's wire shape mirrors an upstream type with a different name. The {@link extending}
 * helper composes when the custom type adds fields beyond the base. Direct schema construction is supported but documented as power-user territory; consult
 * `entity-schemas.ts` for the full shape if neither helper fits.
 *
 * The {@link buildSchemasTable} builder fuses the canonical {@link ENTITY_SCHEMAS} floor with a consumer-supplied {@link ExtraSchemaSet} into a single per-instance
 * lookup target. Every downstream subsystem (run-phase dispatch, command encoder, discovery decoder, telemetry decoder) consults this per-instance table rather than
 * the module-level constant, so two clients with disjoint extras never see each other's registrations.
 *
 * @module schemas/extensions
 */
import { ConfigurationError } from "../errors.ts";
import { ENTITY_SCHEMAS } from "./entity-schemas.ts";
import type { EntitySchema } from "./entity-schemas.ts";
import type { EntityType } from "./entity-types.ts";
import { MessageType } from "../protocol/message-types.ts";

/**
 * A typed registry of additional schemas keyed by entity type. Each key becomes a valid `EntityType` for the client instance it's registered on; commands, telemetry,
 * and entity discovery for that type pass through the same schema-driven machinery as built-in types.
 */
export type ExtraSchemaSet = Readonly<Record<string, EntitySchema>>;

/**
 * The typed entity-type union for a client parameterized by an {@link ExtraSchemaSet}. Resolves to the union of the built-in {@link EntityType} keys and the extras
 * keys, so an `EspHomeClient<{ door_cover: ... }>` accepts `"door_cover"` everywhere `EntityType` is accepted on the public surface.
 *
 * @typeParam Extras - The {@link ExtraSchemaSet} threaded through the client instance.
 */
export type ExtendedEntityType<Extras extends ExtraSchemaSet> = EntityType | (keyof Extras & string);

/**
 * Resolve an entity-type string to its {@link EntitySchema} type by consulting either the built-in {@link ENTITY_SCHEMAS} or the supplied {@link ExtraSchemaSet}.
 * Drives the type-level threading on the public surface: `latest<T>()`, `command<T>()`, `commandAndAwait<T>()`, `snapshotFor<T>()`, `telemetryFor<T>()`, and
 * `telemetryForId<T>()` all index through this helper so an extras-keyed entity type narrows to its declared schema's entity / event / command shape.
 *
 * @typeParam T - The entity-type string. Must be a member of {@link ExtendedEntityType}<`Extras`>.
 * @typeParam Extras - The {@link ExtraSchemaSet} threaded through the client instance.
 */
export type SchemaForExtended<T extends string, Extras extends ExtraSchemaSet> =
  T extends EntityType ? typeof ENTITY_SCHEMAS[T] :
    T extends keyof Extras ? Extras[T] :
      never;

/**
 * Per-instance schemas table. The runtime SSOT every downstream consumer (run-phase dispatcher, command encoder, discovery decoder, telemetry decoder) consults for
 * schema lookups. Built once at client construction by {@link buildSchemasTable} as the union of {@link ENTITY_SCHEMAS} and the consumer's optional
 * {@link ExtraSchemaSet}; immutable afterwards. Keyed by entity-type string for O(1) `getSchema()` access.
 *
 * @internal
 */
export type SchemasTable = Readonly<Record<string, EntitySchema>>;

/**
 * Build a per-instance schemas table by merging extras over the built-in floor. The resulting table is the single lookup target for every downstream consumer; the
 * module-level {@link ENTITY_SCHEMAS} constant is left unchanged so two clients with disjoint extras never cross-pollinate.
 *
 * @remarks Conflict policy: builtin types are the floor and cannot be silently shadowed. When `extras` declares a key that already exists in {@link ENTITY_SCHEMAS},
 * the builder throws {@link ConfigurationError} with code `EXTRA_SCHEMA_OVERRIDES_BUILTIN`. Callers who want to extend a builtin should pick a distinct key
 * (`door_cover` instead of `cover`); callers who legitimately need to redefine a builtin's wire shape should fork the library.
 *
 * @param base - The canonical schema registry (always {@link ENTITY_SCHEMAS}).
 * @param extras - The consumer-supplied extras, or `undefined` when no extras were provided.
 * @returns A merged table keyed by entity-type string. With no extras, the table reduces to a frozen view over the base.
 * @throws {@link ConfigurationError} when an extras key collides with a builtin entity-type key.
 * @internal
 */
export function buildSchemasTable(base: typeof ENTITY_SCHEMAS, extras: ExtraSchemaSet | undefined): SchemasTable {

  if(!extras) {

    return base;
  }

  for(const key of Object.keys(extras)) {

    if(key in base) {

      throw new ConfigurationError("extraSchemas key '" + key + "' overrides a built-in entity type. Pick a distinct name; built-in types are the floor.",
        "EXTRA_SCHEMA_OVERRIDES_BUILTIN");
    }
  }

  return { ...base, ...extras };
}

/**
 * Derive the set of inbound wire-message-types that carry entity-discovery payloads from a {@link SchemasTable}. The host calls this once at construction; the
 * resulting set drives both the setup-phase discovery awaiter (`performDiscovery`) and the run-phase default-dispatcher's late-discovery routing.
 *
 * @param table - The per-instance schemas table.
 * @returns A read-only (by type) set of `LIST_ENTITIES_*_RESPONSE` message-type identifiers (plus `LIST_ENTITIES_SERVICES_RESPONSE`).
 * @internal
 */
export function buildListEntitiesMessageTypes(table: SchemasTable): ReadonlySet<number> {

  const set = new Set<number>();

  for(const schema of Object.values(table)) {

    set.add(schema.listEntities.messageType);
  }

  // The user-defined-services list is a non-entity discovery message special-cased here alongside the entity-derived types, so the host has one set to consult.
  set.add(MessageType.LIST_ENTITIES_SERVICES_RESPONSE);

  return set;
}

/**
 * Derive the set of inbound wire-message-types that carry telemetry-state updates from a {@link SchemasTable}. Drives the run-phase default-dispatcher's
 * telemetry-routing decision in `defaultRunPhaseHandler`.
 *
 * @remarks `BUTTON_COMMAND_REQUEST` is special-cased because buttons are stateless on the wire and the client re-emits their command echoes through the telemetry
 * pipeline so consumers see a uniform state shape per entity.
 *
 * @param table - The per-instance schemas table.
 * @returns A read-only (by type) set of `*_STATE_RESPONSE` (and the button-echo) message-type identifiers.
 * @internal
 */
export function buildStateMessageTypes(table: SchemasTable): ReadonlySet<number> {

  const set = new Set<number>();

  for(const schema of Object.values(table)) {

    set.add(schema.state.messageType);
  }

  set.add(MessageType.BUTTON_COMMAND_REQUEST);

  return set;
}

/**
 * Look up an entity schema in a {@link SchemasTable} by its state-response wire-message-type. Mirrors the module-level
 * {@link findSchemaByStateMessageType} but consults the per-instance table so extras-registered entity types resolve correctly.
 *
 * @remarks Extras-wins-on-collision: when an extras schema aliases a built-in wire-message-type (the {@link aliasOf} case - the consumer wants every `cover`-wire
 * frame to surface as `door_cover` on this client instance), the iteration prefers the last matching schema in the table. Built-ins iterate first because
 * {@link buildSchemasTable} composes as `{ ...base, ...extras }`, so the last-match preference makes extras shadow the built-in for routing decisions while leaving
 * the {@link ENTITY_SCHEMAS} constant untouched.
 *
 * @param table - The per-instance schemas table.
 * @param messageType - The state-response wire-message-type to look up.
 * @returns The matching {@link EntitySchema}, or `undefined` when no schema in the table declares that state message-type.
 * @internal
 */
export function findSchemaByStateMessageTypeIn(table: SchemasTable, messageType: number): EntitySchema | undefined {

  // findLast expresses the extras-wins-on-collision rule structurally - Object.values preserves insertion order with extras last - and short-circuits from the end rather
  // than scanning the whole table to keep the last match.
  return Object.values(table).findLast((schema) => schema.state.messageType === messageType);
}

/**
 * Look up an entity schema in a {@link SchemasTable} by its list-entities wire-message-type. Mirrors the module-level
 * {@link findSchemaByListEntitiesMessageType} but consults the per-instance table. Same extras-wins-on-collision rule as
 * {@link findSchemaByStateMessageTypeIn}.
 *
 * @param table - The per-instance schemas table.
 * @param messageType - The list-entities wire-message-type to look up.
 * @returns The matching {@link EntitySchema}, or `undefined` when no schema in the table declares that list-entities message-type.
 * @internal
 */
export function findSchemaByListEntitiesMessageTypeIn(table: SchemasTable, messageType: number): EntitySchema | undefined {

  // findLast: same extras-wins-on-collision, short-circuit-from-the-end rationale as findSchemaByStateMessageTypeIn.
  return Object.values(table).findLast((schema) => schema.listEntities.messageType === messageType);
}

/**
 * Look up an entity schema in a {@link SchemasTable} by its runtime entity-type string. Mirrors {@link getEntitySchema} but consults the
 * per-instance table; the schema-driven command encoder calls this through the `CommandHost` seam so extras-registered entity types resolve
 * correctly during command dispatch.
 *
 * @param table - The per-instance schemas table.
 * @param type - The entity-type string (e.g. `"light"`, `"door_cover"`).
 * @returns The matching {@link EntitySchema}, or `undefined` when no schema is registered for that type.
 * @internal
 */
export function getSchemaIn(table: SchemasTable, type: string): EntitySchema | undefined {

  return table[type];
}

/**
 * Builds a schema that aliases an existing entity type under a different name. The returned schema is a fresh shallow copy that reuses the upstream type's wire
 * format verbatim and keeps the upstream `type` tag unchanged; the caller overrides the `type` field at registration time when the alias should surface
 * under a new name (as the extras examples and routing tests do).
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#schema-extension}
 *
 * @param base - The upstream entity type to alias. Must be a key of {@link ENTITY_SCHEMAS}.
 * @returns A new EntitySchema reusing the upstream wire format with the original type tag. Consumers should override the type field at registration time if
 * they need it to surface as the alias name.
 *
 */
export function aliasOf(base: keyof typeof ENTITY_SCHEMAS): EntitySchema {

  const upstream = ENTITY_SCHEMAS[base];

  // Copy the listEntities and state field maps one level deep so a consumer can mutate the alias's field set without leaking back into the upstream registry. The
  // individual field-spec leaf objects are shared rather than deep-copied because the runtime treats them as immutable.
  return {

    ...upstream,
    listEntities: { ...upstream.listEntities, fields: { ...upstream.listEntities.fields } },
    state: { ...upstream.state, fields: { ...upstream.state.fields } },
    type: upstream.type
  };
}

/**
 * Schema extension shape supplied to {@link extending}. Allows the consumer to add scalar fields to listEntities or state without rewriting the upstream schema.
 *
 * @remarks This interface deliberately carries no `addedCommandFields` slot. The omission is the encoder-stability guarantee documented in {@link extending}'s
 * `@remarks`...command encoding stays anchored to the upstream's pristine `command.fields` map, so consumers can swap an extending-built type for its upstream
 * sibling without changing encode-side logic. Read-side additions only.
 */
export interface SchemaExtensions {

  addedListEntitiesFields?: EntitySchema["listEntities"]["fields"];
  addedStateFields?: EntitySchema["state"]["fields"];
}

/**
 * Builds a schema that extends an upstream entity type with additional scalar fields. Returns a new schema with the upstream's listEntities and state field maps
 * merged with the supplied additions. Field number collisions are not detected at compile time; the consumer is responsible for picking field numbers that don't
 * conflict with the upstream schema.
 *
 * @remarks `extending()` is **read-side-only by design**. The {@link SchemaExtensions} interface deliberately exposes only `addedListEntitiesFields` and
 * `addedStateFields`...the upstream command spec is preserved verbatim and there is no `addedCommandFields` slot. Discovery decoding (`decodeEntityFromSchema`)
 * and telemetry decoding (`decodeStateFromSchema`) walk the merged `fields` maps, so any additions surface on the decoded entity record and on every emitted state
 * event for the extending-built type. Command encoding consults the upstream's pristine `command.fields` map unchanged, so commands for an `extending("switch", ...)`
 * registered type produce the exact same wire bytes as commands for the upstream `switch` type. The architectural reason is encoder-stability: a vendor that adds
 * read-side metadata (firmware revision, power-watts telemetry, ...) almost never needs to extend the outbound command shape, and locking the command spec to the
 * upstream means future consumers can swap an extending-built type for its upstream sibling without changing any encode-side logic.
 *
 * A byte-equality test in `src/esphome-client.test.ts` is the canonical runtime anti-regression assertion for this contract: it byte-equals the emitted
 * `SWITCH_COMMAND_REQUEST` payload for an `extending`-built vendor switch against the upstream switch's two-field encoding, so any future change that accidentally
 * threads `addedCommandFields` through the encode path fails loudly at test time.
 *
 * If you need to extend the command spec for a vendor type, fork the schema directly rather than threading a third slot through {@link SchemaExtensions}...the
 * read-side-only constraint is required for the encoder-stability guarantee.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#schema-extension}
 *
 * @param base - The upstream entity type to extend.
 * @param additions - Additional fields to merge into listEntities or state.
 * @returns A new EntitySchema with the merged shape. The `command` spec is the upstream's command spec unchanged.
 *
 */
export function extending(base: keyof typeof ENTITY_SCHEMAS, additions: SchemaExtensions): EntitySchema {

  const upstream = ENTITY_SCHEMAS[base];

  return {

    ...upstream,
    listEntities: {

      ...upstream.listEntities,
      fields: { ...upstream.listEntities.fields, ...additions.addedListEntitiesFields }
    },
    state: {

      ...upstream.state,
      fields: { ...upstream.state.fields, ...additions.addedStateFields }
    }
  };
}

