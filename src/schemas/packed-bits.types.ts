/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * packed-bits.types.ts: Type-level rules for the role-specific packed-bits field types.
 */

/**
 * Compile-time rules for the role-specific packed-bits field types: `hasFieldBit` is structurally allowed on the command-side `CommandPackedBitsField` and
 * structurally rejected on the inbound (state / listEntities) `InboundPackedBitsField`. The runtime engine treats `hasFieldBit` as a no-op on inbound roles; this
 * type-level constraint surfaces a misconfiguration at compile time so the no-op never silently ships.
 *
 * @remarks This file holds **type-level assertions only**. The file lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`,
 * NOT by `node --test`. The patterns below coexist:
 *
 *   1. **Sentinel-assertion type aliases** (`Assert<Equal<A, B>>`) - capture structural-equality rules. A failed assertion produces a typecheck error at the
 *      alias's declaration site.
 *
 *   2. **Top-level constants with `@ts-expect-error`** - capture excess-property-check rules. Pure type-level conditional types CAN'T express excess-property
 *      checking (structural assignability is permissive between types; the check only fires on object literals at construction sites). Wrapping a deliberately
 *      misconfigured object literal in a typecheck-only constant + `@ts-expect-error` is the canonical way to pin this kind of rule.
 *
 * @module schemas/packed-bits.types
 */
import type { Assert, Equal, Extends } from "../internal/type-assertions.ts";
import type { CommandPackedBitsField, InboundPackedBitsField } from "./entity-schemas.ts";
import { WireType } from "../protocol/index.ts";

/**
 * The inbound bit spec is exactly `{ bit: number }` - no `hasFieldBit` field. Anything wider would let a misconfigured state/listEntities schema slip a
 * no-op `hasFieldBit` through unnoticed.
 */
type InboundBitSpecShape = Assert<Equal<InboundPackedBitsField["bits"][string], { bit: number }>>;

/**
 * The command bit spec adds an optional `hasFieldBit` on top of the inbound shape. The `?` is structural - omitting it ships fine.
 */
type CommandBitSpecShape = Assert<Equal<CommandPackedBitsField["bits"][string], { bit: number; hasFieldBit?: number }>>;

/**
 * The inbound shape is structurally narrower than the command shape - every inbound spec is a valid command spec (the command spec's `hasFieldBit` is optional, so
 * omitting it satisfies the command type). Pins the "command is a structural superset" relationship so a future refactor that breaks this assignability also
 * breaks the test.
 */
type InboundExtendsCommand = Assert<Extends<InboundPackedBitsField["bits"][string], CommandPackedBitsField["bits"][string]>>;

/**
 * Excess-property rule: a literal `{ bit, hasFieldBit }` may NOT be assigned to an `InboundPackedBitsField["bits"][string]` slot via an object-literal
 * construction site. Pure type-level conditional types can't capture this (structural assignability is permissive); a `@ts-expect-error` annotation on a literal
 * construction is the only way to pin it. The constant below is never read at runtime - the .types.ts module is typecheck-only and not picked up by the test
 * runner.
 */
const excessPropertyCheckInbound: InboundPackedBitsField = {

  bits: {

    // @ts-expect-error - hasFieldBit is forbidden on inbound by TypeScript's excess-property check on object literals.
    away: { bit: 1, hasFieldBit: 64 }
  },
  fieldNumber: 6,
  wireType: WireType.VARINT
};

/**
 * Positive excess-property case: a literal `{ bit, hasFieldBit }` IS valid on a `CommandPackedBitsField["bits"][string]` slot. Pinning the positive case alongside
 * the negative one above catches "we accidentally made `hasFieldBit` forbidden everywhere" regressions - the directive-free assignment must compile.
 */
const excessPropertyCheckCommand: CommandPackedBitsField = {

  bits: {

    awayState: { bit: 1, hasFieldBit: 64 },
    onState:   { bit: 2 }
  },
  fieldNumber: 6,
  wireType: WireType.VARINT
};

// Export every sentinel-assertion type alias and reference the typecheck-only constants so neither the unused-locals lint nor any future tree-shaking optimization
// elides them. None of these are consumed at runtime; their value is purely the compile-time validation they trigger.
export type {

  CommandBitSpecShape,
  InboundBitSpecShape,
  InboundExtendsCommand
};

void excessPropertyCheckCommand;
void excessPropertyCheckInbound;
