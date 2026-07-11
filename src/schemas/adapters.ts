/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * adapters.ts: Runtime mirrors for command-options overrides.
 */

/**
 * Runtime adapters that mirror the type-level {@link CommandOverrides} entries. Whenever a public-API command shape diverges from the wire shape,
 * the type override declares the divergence and the runtime adapter rewrites the consumer-supplied options into the wire-shaped object the schema-driven encoder
 * expects.
 *
 * @remarks A CommandOverrides entry always implies a runtime adapter - if the type-level table declares a divergence, the consumer's options need to be rewritten
 * before encoding. The converse does not hold: an adapter may exist purely for runtime normalization (rounding a numeric field, for example) with no corresponding
 * CommandOverrides entry, when the public and wire shapes are already identical and no type-level override is needed.
 *
 * @module schemas/adapters
 */
import type { ENTITY_SCHEMAS } from "./entity-schemas.ts";

/**
 * The shape returned by an adapter is a Record<string, unknown> that the schema-driven encoder consumes. Adapters are pure - they take the consumer's options object
 * and return a freshly-shaped object without mutating the input.
 *
 * @internal
 */
export type CommandAdapter = (options: Record<string, unknown>) => Record<string, unknown>;

/**
 * The runtime mirror of {@link CommandOverrides}. Keys are entity types; values are pure functions that rewrite consumer options into wire-shaped
 * fields.
 *
 * @remarks An entry that mirrors a type-level divergence must agree with the corresponding `CommandOverrides` entry. If `CommandOverrides["light"]` declares
 * `omit: "red" | "green" | "blue" | "hasRgb"` and `add: { rgb }`, the runtime adapter for light must accept the `rgb` key and emit the four flat keys. Adding a new
 * type-level override is two coordinated entries: the type table in `overrides.ts` and the runtime function here. Not every adapter has a matching override entry,
 * though - an adapter may exist purely for runtime normalization (see `siren`, which rounds a numeric field with no corresponding `CommandOverrides` entry).
 *
 * @internal
 */
export const COMMAND_ADAPTERS: { [K in keyof typeof ENTITY_SCHEMAS]?: CommandAdapter } = {

  // Light's wire shape uses flat red/green/blue/hasRgb; the public API takes `rgb: { r, g, b }`. We expand the object into the four flat fields and drop the rgb key
  // before the encoder sees it.
  light: (options: Record<string, unknown>): Record<string, unknown> => {

    const { rgb, ...rest } = options as { rgb?: { b: number; g: number; r: number } } & Record<string, unknown>;

    if(rgb !== undefined) {

      return { ...rest, blue: rgb.b, green: rgb.g, hasRgb: true, red: rgb.r };
    }

    return rest;
  },

  // Siren's `duration` field is varint (uint32 seconds); consumers may pass a fractional number. We round before encoding so devices receive a consistent integer. We
  // bracket-index the options Record because the strict tsconfig forbids dot-access on index-signature types.
  siren: (options: Record<string, unknown>): Record<string, unknown> => {

    if(options["duration"] !== undefined) {

      return { ...options, duration: Math.round(options["duration"] as number) };
    }

    return options;
  }
};
