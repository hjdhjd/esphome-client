/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-id.ts: Branded entity-id type, mint helper, and runtime narrowing predicates.
 */

/**
 * Branded entity-id type and the helpers that mint, narrow, and parse it.
 *
 * @remarks Entity IDs follow the canonical `{type}-{object_id}` format ("light-bedroom_lamp", "switch-front_door"). The entity type is carried at the type level via a
 * phantom-typed brand: `EntityId<"light">` and `EntityId<"switch">` are distinct types that share the same runtime representation, eliminating "passed wrong id to
 * wrong API" bugs at compile time. The brand erases at runtime so there is zero allocation cost; everything is just a string.
 *
 * Validation happens at the boundary - CLI input, configuration files, network responses cross from `string` into `EntityId<T>` via {@link isEntityId} or
 * {@link parseEntityId}. Past that checkpoint, internal code traffics in branded types and trusts them.
 *
 * @module entity-id
 */
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EntityType } from "./schemas/index.ts";
import type { Nullable } from "./types.ts";

// Module-level UTF-8 encoder for {@link deriveObjectId}. `TextEncoder` is stateless, so a single shared instance avoids the per-call allocation across the
// discovery burst (hundreds of entities on large devices). Cheap operation regardless; the singleton is the elegance argument, not a perf one.
const utf8Encoder = new TextEncoder();

/**
 * Branded entity-id type. The phantom type parameter `T` carries the entity type at the type level only - no runtime cost. `EntityId<"light">` and `EntityId<"switch">`
 * are distinct types that the type checker refuses to assign across, eliminating "passed wrong id to wrong API" bugs at compile time.
 *
 * @remarks The constraint is `T extends string` (not `T extends EntityType`) so callers using {@link ExtraSchemaSet}-registered entity types can
 * mint branded ids for them - `EntityId<"door_cover">` is a valid brand even though `"door_cover"` is not a built-in entity-type key. The default parameter remains
 * {@link EntityType} so existing call sites that index `EntityId` without a type argument continue to resolve to the canonical built-in union.
 */
export type EntityId<T extends string = EntityType> = string & {

  readonly __entityType: T;
};

/**
 * Canonical constructor - the only sanctioned way to mint an EntityId. Encapsulates the `{type}-{object_id}` format rule and the lowercasing convention so every code
 * path produces the same string for the same entity.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#entity-id-construction}
 *
 * @param type - The entity type tag. Accepts any string (not just built-in {@link EntityType} members) so callers using extras-registered schemas can mint
 * branded ids for them; the type-system narrowing carries the literal through, so a typo's brand still fails to assign to a method expecting the correct brand.
 * @param objectId - The ESPHome object identifier (typically the YAML key).
 * @returns A branded entity id.
 *
 */
export function entityId<T extends string>(type: T, objectId: string): EntityId<T> {

  return (type.toLowerCase() + "-" + objectId.toLowerCase()) as EntityId<T>;
}

/**
 * Derive the canonical `object_id` from an entity's display `name`. Byte-for-byte mirror of the ESPHome server-side algorithm: `EntityBase::write_object_id_to`
 * (defined in `esphome/core/entity_base.cpp`) iterates the bytes of `name` and pipes each one through `to_snake_case_char` (space becomes underscore, uppercase
 * A-Z becomes lowercase a-z, everything else passes through) and then `to_sanitized_char` (keep `[a-zA-Z0-9_-]`, replace everything else with underscore) - both
 * of those byte-transform helpers are defined in `esphome/core/helpers.h`.
 *
 * @remarks ESPHome API 1.14 removed `object_id` from `ListEntities*Response` payloads for clients that advertise 1.14 or higher, on the grounds that the value is
 * always derivable from `name` and shipping it on the wire is duplicate information. The discovery decoder consumes this function as a fallback when the wire
 * `object_id` is missing or empty (the 1.14+ shape), preserving compatibility with pre-1.14 devices that still send the wire value. See
 * {@link API_FEATURE_VERSIONS.clientDerivedObjectId} for the version gate.
 *
 * We iterate the UTF-8 byte encoding of `name` (not its UTF-16 code units or its Unicode code points) so the output matches upstream byte-for-byte. ESPHome names
 * are conventionally ASCII; for non-ASCII inputs each UTF-8 continuation byte falls to the underscore branch, matching upstream's signed-or-unsigned-`char` byte
 * loop. A naive code-point iteration would emit one underscore per non-ASCII code point instead of one per byte and would diverge from the upstream-derived value
 * `EntityBase::get_object_id_to()` produces for the same name - that accessor is a thin wrapper that calls `write_object_id_to()` and returns the result as a
 * `StringRef`.
 *
 * @param name - The entity's display name (the `name` field of `ListEntities*Response`).
 * @returns The canonical `object_id` string. Empty input produces empty output.
 * @internal
 */
export function deriveObjectId(name: string): string {

  const bytes = utf8Encoder.encode(name);
  let result = "";

  for(const byte of bytes) {

    // String.fromCharCode interprets the byte as a Latin-1 code unit, which keeps the comparison ranges in `toSnakeCaseChar` and `toSanitizedChar` equivalent to the
    // upstream C++ byte comparisons. ASCII bytes (0x00-0x7F) round-trip cleanly; bytes 0x80-0xFF (UTF-8 continuation and lead bytes for non-ASCII characters) fall
    // outside every allowed range and are sanitized to underscore, matching upstream's behavior on raw `char` bytes.
    result += toSanitizedChar(toSnakeCaseChar(String.fromCharCode(byte)));
  }

  return result;
}

// Lowercase a single byte (represented as a length-1 string) following ESPHome's `to_snake_case_char` semantics: space becomes underscore, uppercase A-Z becomes
// lowercase a-z, everything else passes through unchanged. Composed with `toSanitizedChar` to produce the canonical `object_id` byte-for-byte.
function toSnakeCaseChar(c: string): string {

  if(c === " ") {

    return "_";
  }

  if((c >= "A") && (c <= "Z")) {

    return c.toLowerCase();
  }

  return c;
}

// Replace anything outside the `[a-zA-Z0-9_-]` set with underscore. The full byte range (0x00-0xFF) flows through here; bytes inside the allowed ASCII ranges pass
// through, all others (including UTF-8 multi-byte sequences) become underscore.
function toSanitizedChar(c: string): string {

  const allowed = (c === "-") || (c === "_") || ((c >= "0") && (c <= "9")) || ((c >= "a") && (c <= "z")) || ((c >= "A") && (c <= "Z"));

  return allowed ? c : "_";
}

/**
 * Runtime predicate for narrowing an untrusted string into a branded entity id of a specific type. The predicate matches when the string starts with `${type}-`; we
 * do not validate that the entity actually exists at this point - that's a separate runtime check via {@link EspHomeClient.hasEntity} after the type
 * narrowing.
 *
 * @remarks Case-sensitive by design. As a type guard it narrows `value` to `EntityId<T>` WITHOUT transforming it, so it can only soundly accept the canonical
 * lower-cased form {@link entityId} mints - accepting a mixed-case string would brand a non-canonical id that then fails to match the registry. For lenient, normalizing
 * parsing of mixed-case input, use {@link parseEntityId}, which lower-cases as it parses. (The strict-guard vs lenient-parser split mirrors `Number.isInteger` vs
 * `parseInt`.)
 *
 * @param value - The untrusted string to test.
 * @param type - The expected entity type.
 * @returns True if `value` is a branded entity id of `type`.
 *
 */
export function isEntityId<T extends string>(value: string, type: T): value is EntityId<T> {

  return value.startsWith(type + "-");
}

/**
 * Convenience for parsing an arbitrary string when the consumer doesn't yet know which entity type it points at. Returns the parsed `{ type, id }` pair when the prefix
 * matches a known entity type, or `null` otherwise.
 *
 * @remarks This is the lenient, normalizing counterpart to the strict {@link isEntityId} guard. It lower-cases the type prefix before matching - and returns the id
 * lower-cased - mirroring {@link entityId}'s minting convention, so a mixed-case input like `"Cover-Front"` normalizes to `{ id: "cover-front", type: "cover" }` rather
 * than being rejected. Validation is shape-only: the prefix must be a known entity type with a dash following it, but an empty object_id (e.g. `"cover-"`) parses
 * successfully - whether an entity by that id actually exists is the separate {@link EspHomeClient.hasEntity} check, by design.
 *
 * @param value - The string to parse.
 * @returns The parsed entity reference or null if the string is malformed or its prefix isn't a known entity type.
 *
 */
export function parseEntityId(value: string): Nullable<{ id: EntityId; type: EntityType }> {

  const dash = value.indexOf("-");

  if(dash <= 0) {

    return null;
  }

  // Normalize the type prefix to lower case before matching, mirroring `entityId`'s minting convention (which lower-cases both halves). Without this a mixed-case prefix
  // the minter would accept is rejected here - an internal inconsistency, since the returned id is already lower-cased below.
  const type = value.slice(0, dash).toLowerCase();

  if(!(type in ENTITY_SCHEMAS)) {

    return null;
  }

  return { id: value.toLowerCase() as EntityId, type: type as EntityType };
}
