/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * type-assertions.ts: Compile-time assertion helpers for *.types.ts files.
 */

/**
 * Shared compile-time assertion helpers consumed by the `*.types.ts` files that encode structural-equality or assignability guarantees (the lone exception,
 * `testing/recording-mock.types.ts`, pins its guarantee with the `@ts-expect-error` excess-property pattern instead and imports none of these). These types have no
 * runtime footprint - they exist purely to encode type-level guarantees that fail to compile when violated, giving the typecheck step a strong signal for "the schema
 * engine still has the structural shape it claims to have."
 *
 * @remarks This module lives in `src/internal/` (a directory whose name signals "project-internal infrastructure, not part of any public surface"). The exports
 * map in `package.json` gates the package's public API through `dist/index.js` and `dist/testing/index.js` barrels; nothing in `src/internal/` is reachable from
 * outside the package because nothing re-exports it through those barrels. The directory placement is the structural signal; the build's tsconfig also excludes
 * `src/internal/` from `dist/` entirely so even the compiled artifacts are absent.
 *
 * @module internal/type-assertions
 */

/**
 * Type-level boolean sentinel. Compilation succeeds only when the type argument resolves to the literal `true`. Used to encode guarantees as type aliases whose
 * declaration fails to compile when the underlying claim is false (e.g. `type _Test = Assert<Equal<MyShape, ExpectedShape>>`).
 */
export type Assert<X extends true> = X;

/**
 * Any-safe type-level equality. Two types `A` and `B` are considered equal exactly when their identity-function signatures (`<_Probe>() =>
 * _Probe extends A ? 1 : 2` and the analogous signature for `B`) are structurally assignable in both directions.
 *
 * @remarks The textbook implementation `[A] extends [B] ? ([B] extends [A] ? true : false) : false` has a well-known blind spot: `Equal<any, number>` returns
 * `true` (because `any` extends `number` AND `number` extends `any`), and `Equal<any, any>` returns `true` trivially. The higher-kinded form below catches this
 * because TypeScript compares the inner conditional types literally - `T extends any ? 1 : 2` is NOT the same type as `T extends number ? 1 : 2`, even though both
 * conditional types would reduce identically for any concrete `T`. Schema-engine guarantees where an accidental `any` would be a real regression need this stricter
 * check. The trick is documented at https://github.com/microsoft/TypeScript/issues/27024 (the canonical issue exploring type-level equality strategies).
 *
 * The inner generic function's type parameter is named `_Probe` to communicate to a reader that it serves to tell the two signatures apart in the
 * structural comparison rather than to carry a value. TypeScript compares `<_Probe>() => _Probe extends A ? 1 : 2` symbolically against the
 * analogous signature for `B` - the function signatures are equal only when `A` and `B` are literally the same type; the conditional inside the function body
 * is NOT reduced.
 *
 * The `@typescript-eslint/no-unnecessary-type-parameters` rule correctly flags type parameters used exactly once in general, but the once-per-signature usage IS
 * the entire mechanism here. The disable block below is scoped tightly to the declaration that needs it; the matching `eslint-enable` follows the type alias.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
export type Equal<A, B> =
  (<_Probe>() => _Probe extends A ? 1 : 2) extends
  (<_Probe>() => _Probe extends B ? 1 : 2) ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

/**
 * `Extends<A, B>` evaluates to `true` when `A` is assignable to `B`. Used for one-directional guarantees where the claim is "shape A satisfies contract B" rather
 * than "A and B are identical." Use {@link Equal} when both directions matter.
 */
export type Extends<A, B> = A extends B ? true : false;

/**
 * `MutuallyAssignable<A, B>` evaluates to `true` when `A` and `B` are each assignable to the other...i.e. they are interchangeable at a use site. It sits deliberately
 * between the other two helpers. It is STRICTER than {@link Extends}: a one-directional check accepts a `B` that is looser than `A` (a wider function parameter is
 * contravariantly assignable), whereas this rejects it. It is more TOLERANT than {@link Equal}: assignability reduces conditional types, so two differently-spelled but
 * interchangeable types match here, where `Equal` - which compares symbolically WITHOUT reducing conditionals - reports them unequal. Reach for it on "these two
 * surfaces are interchangeable for a consumer" guarantees, such as a test double whose generic methods write out in reduced form the type machinery the real class
 * threads through a generic parameter.
 *
 * @remarks Because assignability treats `any` as assignable in both directions, `MutuallyAssignable<any, T>` is `true` for every `T` - an `any` on either side is not
 * caught here. Use {@link Equal} when rejecting an accidental `any` is the point; this helper's job is interchangeability, not identity.
 */
export type MutuallyAssignable<A, B> = Extends<A, B> extends true ? Extends<B, A> : false;
