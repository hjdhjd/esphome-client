/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * derived-packed-bits.types.ts: Type-level guarantees for the schema-derived packed-bits projection.
 */

/**
 * Compile-time guarantees for the packed-bits projection declared in `derived.ts` - the {@link PackedBitNamesOf} and {@link ApplyPackedBitsFields} pair that turns a
 * schema role's `packedBitsFields` record into the optional booleans a consumer reads off an entity or writes into a command. The projection is the only path by which
 * a named bit inside a packed uint32 wire field reaches the public surface, and the registry exercises both of its input variants: the inbound bit-spec record
 * (climate's `listEntities` role, water heater's `state` role) and the command bit-spec record whose entries carry the extra `hasFieldBit` (water heater's `command`
 * role). Asserting the computed output for real registry entries holds the consumer-facing key set, its optionality, and the neutral `unknown` result for a role that
 * declares no packed bits fixed against any change to the projection's declaration.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.json`, NOT by
 * `node --test`. Each guarantee is a sentinel-assertion type alias (`Assert<Equal<A, B>>`) whose declaration site fails to compile when the claim is false. Two
 * altitudes are covered deliberately: the aliases applied directly to a schema role's record, and the `infer P` conditional written exactly as `derived.ts` writes it
 * at its own call sites, because those call sites are what the public entity, state-event, and command types are assembled from.
 *
 * @module schemas/derived-packed-bits.types
 */
import type { ApplyPackedBitsFields, PackedBitNamesOf } from "./derived.ts";
import type { Assert, Equal } from "../internal/type-assertions.ts";
import type { ENTITY_SCHEMAS, PackedBitsRecord } from "./entity-schemas.ts";

/**
 * The climate discovery role's packed-bits record, the inbound variant of the projection's input. Its bits are the ESPHome 1.14+ `feature_flags` capability set.
 */
type ClimateListEntitiesPackedBits = typeof ENTITY_SCHEMAS["climate"]["listEntities"]["packedBitsFields"];

/**
 * The water-heater command role's packed-bits record, the command variant whose bit specs additionally carry a `hasFieldBit`. That extra slot is encoder bookkeeping
 * and must never reach the projected consumer shape.
 */
type WaterHeaterCommandPackedBits = typeof ENTITY_SCHEMAS["water_heater"]["command"]["packedBitsFields"];

/**
 * The water-heater state role's packed-bits record. It names the same two bits as the command record above, which is what makes the pair a usable check that the two
 * input variants project identically.
 */
type WaterHeaterStatePackedBits = typeof ENTITY_SCHEMAS["water_heater"]["state"]["packedBitsFields"];

/**
 * The consumer-facing bit names climate's `feature_flags` field carries. Spelled once here and reused by the assertions below so the expected key set has a single
 * spelling in this file.
 */
type ClimateBitNames = "requiresTwoPointTargetTemperature" | "supportsAction" | "supportsCurrentHumidity" | "supportsCurrentTemperature" | "supportsTargetHumidity" |
  "supportsTwoPointTargetTemperature";

/**
 * The consumer-facing bit names the water-heater packed `state` field carries on both the inbound and the command side.
 */
type WaterHeaterBitNames = "awayState" | "onState";

/**
 * `PackedBitNamesOf` flattens a role's record into the union of every bit name across all of its packed fields, dropping each packed field's own name. Climate
 * declares a single packed field, so the union is exactly that field's six bits.
 */
type ClimateBitNamesProject = Assert<Equal<PackedBitNamesOf<ClimateListEntitiesPackedBits>, ClimateBitNames>>;

/**
 * Every bit name becomes an optional `boolean`. The optionality is the contract: pre-1.14 firmware omits the packed field entirely, so a consumer must not be promised
 * a value the decoder may never write.
 */
type ClimateBitsProject = Assert<Equal<ApplyPackedBitsFields<ClimateListEntitiesPackedBits>, Partial<Record<ClimateBitNames, boolean>>>>;

/**
 * `PackedBitNamesOf` reads the command variant through the same path, so the command-only `hasFieldBit` slot changes nothing about which names it extracts.
 */
type WaterHeaterCommandBitNamesProject = Assert<Equal<PackedBitNamesOf<WaterHeaterCommandPackedBits>, WaterHeaterBitNames>>;

/**
 * The command variant projects to the same optional-boolean shape as the inbound variant...`hasFieldBit` is consumed by the encoder and never surfaces as a key.
 */
type WaterHeaterCommandBitsProject = Assert<Equal<ApplyPackedBitsFields<WaterHeaterCommandPackedBits>, Partial<Record<WaterHeaterBitNames, boolean>>>>;

/**
 * The inbound water-heater record projects to that same shape, so a consumer reads back exactly the keys it is able to write.
 */
type WaterHeaterStateBitsProject = Assert<Equal<ApplyPackedBitsFields<WaterHeaterStatePackedBits>, Partial<Record<WaterHeaterBitNames, boolean>>>>;

/**
 * The projection as `derived.ts` actually reaches it: an `infer P` conditional over the schema role, whose result is intersected into the derived entity shape. This
 * is the altitude the public types are assembled at, so it is asserted alongside the direct application above.
 */
type ClimateCallSiteProject = Assert<Equal<typeof ENTITY_SCHEMAS["climate"]["listEntities"] extends { packedBitsFields: infer P extends PackedBitsRecord } ?
  ApplyPackedBitsFields<P> : unknown, Partial<Record<ClimateBitNames, boolean>>>>;

/**
 * The same call-site form over the command role, which is where the command bit-spec variant reaches the projection through `infer P`.
 */
type WaterHeaterCommandCallSiteProject = Assert<Equal<typeof ENTITY_SCHEMAS["water_heater"]["command"] extends { packedBitsFields: infer P extends PackedBitsRecord } ?
  ApplyPackedBitsFields<P> : unknown, Partial<Record<WaterHeaterBitNames, boolean>>>>;

/**
 * A role that declares no `packedBitsFields` takes the conditional's false branch and contributes `unknown`, the neutral element of the intersection that assembles
 * the derived shape. Switch's state role is one such role, so its derived shape gains no key from the projection.
 */
type SwitchCallSiteProject = Assert<Equal<typeof ENTITY_SCHEMAS["switch"]["state"] extends { packedBitsFields: infer P extends PackedBitsRecord } ?
  ApplyPackedBitsFields<P> : unknown, unknown>>;

// The aliases above are never read at runtime; this module is typecheck-only and is not discovered by the test runner. Collecting them as members of the tuple type
// below keeps them referenced so the unused-locals lint stays quiet, while the assertions do their real work at their own declaration sites.
export type DerivedPackedBitsGuarantees = [ ClimateBitNamesProject, ClimateBitsProject, ClimateCallSiteProject, SwitchCallSiteProject,
  WaterHeaterCommandBitNamesProject, WaterHeaterCommandBitsProject, WaterHeaterCommandCallSiteProject, WaterHeaterStateBitsProject ];
