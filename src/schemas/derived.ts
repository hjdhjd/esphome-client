/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * derived.ts: Schema-derived public types for entities, telemetry events, and commands.
 */

/**
 * Mapped types that derive every public entity-related shape from {@link ENTITY_SCHEMAS}.
 *
 * @remarks This module is the architectural keystone for the SSOT principle: every public type the consumer touches (Entity, TelemetryEvent, command options) is
 * derived from the schema registry rather than hand-maintained alongside it. Adding a new entity type is one entry in `ENTITY_SCHEMAS`; the type system, the
 * dispatcher, the encoder, and the decoder all pick it up automatically.
 *
 * The wire shape and the public API shape diverge in a handful of places where ergonomics or runtime quirks demand it (light's flat red/green/blue vs the
 * `rgb: { r, g, b }` ergonomic, climate's wire-float-or-runtime-string fallback, button's synthesized `pressed: true`). Those divergences are themselves typed - see
 * the {@link EntityOverrides}, {@link EventOverrides}, and {@link CommandOverrides} tables in `./overrides.ts`. The override layer is the second SSOT: any divergence
 * is a typed entry, not a hand-written interface.
 *
 * @module schemas/derived
 */
import type { BitmaskField, CommandPackedBitsField, ENTITY_SCHEMAS, EntitySchema, FieldSpec, HasPatternField, InboundPackedBitsField, RepeatedFieldSpec,
  RepeatedMessageFieldSpec } from "./entity-schemas.ts";
import type { CommandOverrides, EntityOverrides, EventOverrides } from "./overrides.ts";

/**
 * Maps a single {@link FieldSpec}'s `valueType` to its TypeScript wire type. Bool fields surface as `boolean`, string fields as `string`, all numeric variants
 * (varint, sint32, fixed32, float, enum) collapse to `number`. Anything outside the known set falls back to `unknown` so the type system surfaces the gap.
 *
 * @internal
 */
export type WireFieldOutput<F extends FieldSpec> =
  F["valueType"] extends "bool" ? boolean :
    F["valueType"] extends "string" ? string :
      F["valueType"] extends "enum" | "fixed32" | "float" | "sint32" | "varint" ? number :
        F["valueType"] extends "sint32-packed" ? number[] :
          unknown;

/**
 * Same projection as {@link WireFieldOutput} for repeated fields.
 *
 * @internal
 */
export type WireRepeatedFieldOutput<F extends RepeatedFieldSpec> =
  F["valueType"] extends "string" ? string[] :
    F["valueType"] extends "enum" | "varint" ? number[] :
      unknown[];

/**
 * Same projection as {@link WireFieldOutput} for command has-pattern fields. The has-pattern pair (hasField boolean + valueField scalar) collapses to the value-side
 * type at the public surface; the boolean is implicit from "value is present."
 *
 * @internal
 */
export type WireHasPatternFieldOutput<F extends HasPatternField> =
  F["valueType"] extends "bool" ? boolean :
    F["valueType"] extends "string" ? string :
      F["valueType"] extends "enum" | "fixed32" | "float" | "sint32" | "varint" ? number :
        F["valueType"] extends "sint32-packed" ? number[] :
          unknown;

/**
 * Same projection as {@link WireFieldOutput} for command bitmask-has fields. The bit position is implicit from presence; the consumer-facing type is the value-side
 * scalar.
 *
 * @internal
 */
export type WireBitmaskFieldOutput<F extends BitmaskField> =
  F["valueType"] extends "bool" ? boolean :
    F["valueType"] extends "string" ? string :
      F["valueType"] extends "enum" | "fixed32" | "float" | "sint32" | "varint" ? number :
        F["valueType"] extends "sint32-packed" ? number[] :
          unknown;

/**
 * Extracts the literal-union of numeric values from one entry of a schema's `enumMappings` record. Given `{ LOCKED: 1, UNLOCKED: 2, ... }`, produces the union
 * `1 | 2 | ...`. The inbound narrowing helpers below consume this; command-side consumers read the parallel key-union (`keyof M`) instead since the encoder accepts
 * string aliases on input.
 *
 * @internal
 */
export type EnumValueUnionFromMapping<M> = M extends Record<string, number> ? M[keyof M] : never;

/**
 * Project a schema's scalar field record (`fields: Record<string, FieldSpec>`) into a TypeScript shape, narrowing each field key that also appears in the schema's
 * `enumMappings` to the literal-union of the mapping's numeric values. Fields without a mapping entry (or schemas that omit `enumMappings` entirely) keep the
 * {@link WireFieldOutput} projection.
 *
 * @remarks The inbound narrowing pattern is shared by state events and discovery records...both surface raw wire enum values to consumers, and both should narrow
 * to numeric-literal unions when the schema declares the mapping. Extracting the helper keeps `WireStateEventFor` and `WireEntityFor` consistent and DRYs out the
 * nested conditional that would otherwise be duplicated.
 *
 * @internal
 */
export type ApplyEnumMappingToFields<F, EM> =
  F extends Record<string, FieldSpec> ?
    EM extends Record<string, Record<string, number>> ?
      { [K in keyof F]?: K extends keyof EM ? EnumValueUnionFromMapping<EM[K]> : WireFieldOutput<F[K] & FieldSpec> } :
      { [K in keyof F]?: WireFieldOutput<F[K] & FieldSpec> } :
    unknown;

/**
 * Project a schema's repeated field record (`repeatedFields: Record<string, RepeatedFieldSpec>`) into a TypeScript shape, narrowing each field key that also
 * appears in the schema's `enumMappings` to an array of the mapping's numeric-value literal-union. Fields without a mapping entry keep the
 * {@link WireRepeatedFieldOutput} projection (typically `number[]` for repeated enums).
 *
 * @remarks Discovery-side `repeatedFields` carry the entity's capability declarations (`supportedFanModes`, `supportedModes`, etc.) which are most useful when
 * narrowed against the matching named constants. Without this projection, `entity.supportedFanModes: number[]` requires consumers to cast or compare against
 * magic numbers; with it, the type is `ClimateFanMode[]` (the literal-union array) and consumers iterate against the constant directly.
 *
 * @internal
 */
export type ApplyEnumMappingToRepeatedFields<R, EM> =
  R extends Record<string, RepeatedFieldSpec> ?
    EM extends Record<string, Record<string, number>> ?
      { [K in keyof R]?: K extends keyof EM ? EnumValueUnionFromMapping<EM[K]>[] : WireRepeatedFieldOutput<R[K] & RepeatedFieldSpec> } :
      { [K in keyof R]?: WireRepeatedFieldOutput<R[K] & RepeatedFieldSpec> } :
    unknown;

/**
 * Project a single {@link RepeatedMessageFieldSpec}'s inner field map to a TypeScript record shape. Reuses {@link ApplyEnumMappingToFields} so an inner enum field
 * declared in the spec's nested `enumMappings` narrows to the literal-union of the mapping's numeric values - exactly as the outer message's enum fields narrow.
 *
 * @internal
 */
export type RepeatedMessageRecordFor<F extends RepeatedMessageFieldSpec> =
  ApplyEnumMappingToFields<F["fields"], F extends { enumMappings: infer EM } ? EM : undefined>;

/**
 * Extract the union of every bit-name across all entries in a `packedBitsFields` record. Accepts either inbound or command-side packed-bits records since both have
 * the same `bits: Record<string, {...}>` shape - the `bit-names` projection is uniform across both variants.
 *
 * Given `{ featureFlags: { bits: { a: ..., b: ... } }, state: { bits: { c: ... } } }`, produces `"a" | "b" | "c"`.
 *
 * @internal
 */
export type PackedBitNamesOf<P> =
  P extends Record<string, InboundPackedBitsField | CommandPackedBitsField> ?
    { [K in keyof P]: P[K] extends { bits: infer B } ? keyof B : never }[keyof P] :
    never;

/**
 * Project a schema's packed-bits record (`packedBitsFields: Record<string, InboundPackedBitsField | CommandPackedBitsField>`) into a TypeScript shape. The
 * packed-field NAME itself never surfaces - each named bit inside `bits` becomes an optional `boolean` on the wire shape, flattened across every packed field's
 * bits. State / listEntities consumers read
 * `entity.supportsAction: boolean`; command consumers write `client.command(id, { supportsAction: true })`. The packed `featureFlags: number` (or analogous wire
 * field) is invisible to consumers.
 *
 * Across schema roles a name collision is intentional: climate's `listEntities.fields.supportsAction` (the deprecated boolean) and
 * `listEntities.packedBitsFields.featureFlags.bits.supportsAction` (the new bit) produce the same consumer-facing key. The decoder writes the newer source last, so
 * 1.14+ firmware data wins when both arrive; older firmware data sticks when only the boolean field is present.
 *
 * @internal
 */
export type ApplyPackedBitsFields<P> =
  PackedBitNamesOf<P> extends never ? unknown :
    PackedBitNamesOf<P> extends string ? Partial<Record<PackedBitNamesOf<P>, boolean>> :
      unknown;

/**
 * Project a schema's repeated nested-message record (`repeatedMessageFields: Record<string, RepeatedMessageFieldSpec>`) into a TypeScript shape. Each entry's value
 * type becomes an array of {@link RepeatedMessageRecordFor} - the structured records the decoder emits per wire occurrence.
 *
 * @remarks Repeated nested-message fields surface structured per-occurrence records (consumer's `entity.supportedFormats: Array<{ format, sampleRate, ... }>`) rather
 * than raw bytes. Inner enum-typed fields narrow to the literal-union of the spec's nested `enumMappings`, matching the outer-level narrowing semantics. Fields that
 * declare no inner enum mapping keep their wire-derived numeric/string types.
 *
 * @internal
 */
export type ApplyRepeatedMessageFields<R> =
  R extends Record<string, RepeatedMessageFieldSpec> ?
    { [K in keyof R]?: RepeatedMessageRecordFor<R[K] & RepeatedMessageFieldSpec>[] } :
    unknown;

/**
 * Extract the `enumMappings` block from a schema-role record, falling back to `undefined` when the role does not declare one. Lets the projection helpers above
 * take a single uniform input regardless of whether the schema has an enum mapping.
 *
 * @internal
 */
export type EnumMappingOf<X> = X extends { enumMappings: infer EM } ? EM : undefined;

/**
 * Wire shape of a state-response message for the given schema. Strictly derived from `S["state"].fields` plus the standard base properties (type, key, entity, optional
 * deviceId). Internal - the public-facing {@link StateEventFor} composes this with the {@link EventOverrides} layer.
 *
 * @remarks State-side narrowing uses {@link ApplyEnumMappingToFields} - the same helper that powers the discovery-side narrowing in {@link WireEntityFor}. Both
 * inbound schemas thread through the same enum-mapping logic so the consumer-facing type behavior is symmetric.
 *
 * @internal
 */
export type WireStateEventFor<S extends EntitySchema> = {

  deviceId?: number;
  entity: string;
  key: number;
  type: S["type"];
} & ApplyEnumMappingToFields<S["state"]["fields"], EnumMappingOf<S["state"]>> &
  (S["state"] extends { packedBitsFields: infer P } ? ApplyPackedBitsFields<P> : unknown);

/**
 * Wire shape of a list-entities message for the given schema. Strictly derived from `S["listEntities"].fields` plus `repeatedFields` plus the base discovery fields
 * (type, key, name, objectId, optional deviceId). Internal - the public-facing {@link EntityFor} composes this with the {@link EntityOverrides} layer.
 *
 * @remarks Discovery-side narrowing uses {@link ApplyEnumMappingToFields} for scalar enum fields (e.g. `entityCategory`, `climate.temperatureUnit`) and
 * {@link ApplyEnumMappingToRepeatedFields} for repeated enum fields (e.g. `climate.supportedModes`, `light.supportedColorModes`). The narrowing is symmetric with
 * state-side: when the schema's listEntities block declares an `enumMappings` entry for a field key, the field's type is the literal-union of the mapping's
 * numeric values rather than plain `number`.
 *
 * @internal
 */
export type WireEntityFor<S extends EntitySchema> = {

  deviceId?: number;
  key: number;
  name: string;
  objectId: string;
  type: S["type"];
} & ApplyEnumMappingToFields<S["listEntities"]["fields"], EnumMappingOf<S["listEntities"]>> &
  (S["listEntities"] extends { repeatedFields: infer R } ?
    ApplyEnumMappingToRepeatedFields<R, EnumMappingOf<S["listEntities"]>> :
    unknown) &
  (S["listEntities"] extends { repeatedMessageFields: infer M } ?
    ApplyRepeatedMessageFields<M> :
    unknown) &
  (S["listEntities"] extends { packedBitsFields: infer P } ?
    ApplyPackedBitsFields<P> :
    unknown);

/**
 * Wire shape of a command-request message for the given schema. Combines the schema's `command.fields` (flat fields), `command.hasPatternFields` (has-pattern pairs),
 * and `command.enumMappings` (string aliases for numeric enum values). Resolves to `unknown` when the schema has no command (read-only entities), matching the
 * conditional's false branch.
 *
 * @remarks When a key appears in both the `fields` / `hasPatternFields` projection and `enumMappings` (the standard pattern for enum-typed fields - the field declares
 * the wire type, the enum mapping declares the string aliases), the `enumMappings` projection wins. Otherwise the field's `valueType: "enum"` would collapse to plain
 * `number` and the intersection with the enum-key union would erase the string aliases. We exclude such keys from the field, has-pattern, and bitmask projections so
 * the enum-key union is the sole contributor.
 *
 * @internal
 */
export type WireCommandFor<S extends EntitySchema> =
  S["command"] extends { enumMappings?: infer EM; fields: infer F; hasPatternFields: infer HP } ?
    (EM extends Record<string, Record<string, number>> ?
      (F extends Record<string, FieldSpec> ? { [K in keyof F as K extends keyof EM ? never : K]?: WireFieldOutput<F[K] & FieldSpec> } : unknown) &
        (HP extends Record<string, HasPatternField> ?
          { [K in keyof HP as K extends keyof EM ? never : K]?: WireHasPatternFieldOutput<HP[K] & HasPatternField> } : unknown) &
        (S["command"] extends { bitmaskFields: infer BM } ?
          (BM extends Record<string, BitmaskField> ?
            { [K in keyof BM as K extends keyof EM ? never : K]?: WireBitmaskFieldOutput<BM[K] & BitmaskField> } : unknown) : unknown) &
        (S["command"] extends { packedBitsFields: infer P } ? ApplyPackedBitsFields<P> : unknown) &
        { [K in keyof EM]?: keyof EM[K] | number } :
      (F extends Record<string, FieldSpec> ? { [K in keyof F]?: WireFieldOutput<F[K] & FieldSpec> } : unknown) &
        (HP extends Record<string, HasPatternField> ? { [K in keyof HP]?: WireHasPatternFieldOutput<HP[K] & HasPatternField> } : unknown) &
        (S["command"] extends { bitmaskFields: infer BM } ?
          (BM extends Record<string, BitmaskField> ? { [K in keyof BM]?: WireBitmaskFieldOutput<BM[K] & BitmaskField> } : unknown) : unknown) &
        (S["command"] extends { packedBitsFields: infer P } ? ApplyPackedBitsFields<P> : unknown)) :
    unknown;

/**
 * Apply an override entry from `Table[T]` to a base wire shape. One generic, three entry shapes - the {@link EntityOverrides}, {@link EventOverrides}, and
 * {@link CommandOverrides} tables all flow through here so there is exactly one place that knows how a typed override interacts with the wire-derived shape.
 *
 * @remarks Telling the three shapes apart is structural. The conditional first checks for both `omit` and `add` keys present...if both are inferable, the
 * entry is the omit+add variant and the result is `Omit<Wire, entry.omit> & entry.add`. Otherwise the entry is a refining partial and the result is
 * `Omit<Wire, keyof Table[T]> & Table[T]` - the override's keys are omitted from the wire shape BEFORE intersecting, so a key the entry re-declares WINS over the wire
 * type rather than collapsing into it. The omit is required here: a plain `Wire & Table[T]` intersects `number & (number | string)` back to `number` and `string[] &
 * readonly string[]` back to `string[]`, silently erasing a refining override (the firmware-emits-string-encoded-float widenings on `climate`/`valve`, the readonly
 * tightening on `light`). For an add-only entry that introduces a brand-new key, the `Omit` removes nothing, so it stays equivalent to a plain intersection. When the
 * tag `T` is not a key of `Table`, the wire shape passes through unchanged. The narrowing requires both `omit` and `add` to be present together - an entry like
 * `{ omit?: ... }` alone does not trigger the omit+add path, so a future override that legitimately uses either name in isolation does not collide.
 *
 * The `[Omitted] extends [string]` tuple-wrap prevents the conditional from distributing over an `Omitted` union: an entry declaring `omit: "a" | "b"` strips both
 * keys in one pass rather than fanning out into a union of partial omits (one branch per omitted key) - the latter would silently accept any single omitted field as a
 * member of the result union, which is exactly the bug a naked `Omitted extends string` would introduce here.
 *
 * Adding a new override is a one-line edit to the relevant table; the application generic handles the entry shape automatically.
 *
 * @internal
 */
export type ApplyOverride<Wire, T extends string, Table> =
  T extends keyof Table ?
    Table[T] extends { add: infer Added; omit: infer Omitted } ?
      [Omitted] extends [string] ? Omit<Wire, Omitted> & Added : Omit<Wire, keyof Added> & Added :
      Omit<Wire, keyof Table[T]> & Table[T] :
    Wire;

/**
 * Public entity shape for a schema. Combines the wire shape with any override entry for the entity type. Most entities have no override; the override layer is the
 * exhaustive list of intentional wire-vs-API divergences.
 */
export type EntityFor<S extends EntitySchema> = ApplyOverride<WireEntityFor<S>, S["type"] & string, EntityOverrides>;

/**
 * Public state-event shape for a schema. Combines the wire shape with any override entry for the entity type.
 */
export type StateEventFor<S extends EntitySchema> = ApplyOverride<WireStateEventFor<S>, S["type"] & string, EventOverrides>;

/**
 * Public command-options shape for a schema. Wire shape minus omitted fields plus added fields per the `CommandOverrides` entry.
 */
export type CommandFor<S extends EntitySchema> = ApplyOverride<WireCommandFor<S>, S["type"] & string, CommandOverrides>;

/**
 * Discriminated union of every entity in {@link ENTITY_SCHEMAS}. Adding a new entity type to the schema registry extends this union automatically with no parallel
 * declaration to maintain.
 */
export type Entity = { [K in keyof typeof ENTITY_SCHEMAS]: EntityFor<typeof ENTITY_SCHEMAS[K]> }[keyof typeof ENTITY_SCHEMAS];

/**
 * Discriminated union of every telemetry-event variant in {@link ENTITY_SCHEMAS}. Same SSOT story as {@link Entity}: derived directly from the schema registry, no
 * parallel union to maintain.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#telemetry-event-narrowing}
 */
export type TelemetryEvent = { [K in keyof typeof ENTITY_SCHEMAS]: StateEventFor<typeof ENTITY_SCHEMAS[K]> }[keyof typeof ENTITY_SCHEMAS];

/**
 * Convenience for narrowing a {@link TelemetryEvent} to one entity type at the type level.
 */
export type TelemetryEventOf<T extends keyof typeof ENTITY_SCHEMAS> = StateEventFor<typeof ENTITY_SCHEMAS[T]>;

/**
 * Convenience for narrowing an {@link Entity} to one entity type at the type level.
 */
export type EntityOf<T extends keyof typeof ENTITY_SCHEMAS> = EntityFor<typeof ENTITY_SCHEMAS[T]>;
