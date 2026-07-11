/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * recording-mock.types.ts: Type-level guarantees for the createRecordingMock construction-site typing.
 */

/**
 * Compile-time guarantees for {@link createRecordingMock}'s defaults map. The `MockDefaults<T>` shape constrains keys to `keyof T`; this file pins that constraint
 * against both construction patterns - inline object literals (which engage TypeScript's excess-property check directly) and reference-passed variables (which
 * engage the check only when the variable is explicitly annotated as `MockDefaults<T>`).
 *
 * @remarks This file holds **type-level assertions only**. The file lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`,
 * NOT by `node --test`. Excess-property checking can't be expressed via pure conditional types (structural assignability is permissive between types; the check
 * only fires on object literals at construction sites). Wrapping a deliberately misconfigured construction in a typecheck-only constant + `@ts-expect-error` is
 * the canonical way to pin this kind of guarantee.
 *
 * @module testing/recording-mock.types
 */
import { BluetoothProxyApi } from "../bluetooth-proxy.ts";
import type { MockDefaults } from "./recording-mock.ts";
import { createRecordingMock } from "./recording-mock.ts";

/**
 * Positive case: inline-literal construction with valid keys succeeds. Pinning the positive case alongside the negative cases below catches "we accidentally made
 * the type uninstantiable" regressions - the directive-free construction must compile.
 */
const validInlineLiteral = createRecordingMock(BluetoothProxyApi, {

  available:   false,
  isConnected: () => false
});

/**
 * Inline-literal excess-property rule: a typo (`availabel` instead of `available`) at the construction site is caught by TypeScript's excess-property check.
 * If a future refactor loosens `MockDefaults<T>` so unknown keys slip through, the `@ts-expect-error` directive becomes unused and this file fails to typecheck
 * with "Unused @ts-expect-error directive."
 */
const invalidInlineLiteral = createRecordingMock(BluetoothProxyApi, {

  // @ts-expect-error - typo (`availabel` instead of `available`) must be caught at compile time.
  availabel: false
});

/**
 * Reference-passed excess-property rule: variables annotated as `MockDefaults<T>` engage the same excess-property check that inline literals get. Pinning the
 * annotated-reference path verifies the doc claim in `MockDefaults<T>` that "the annotation re-engages the strict check at the variable's declaration site."
 */
const annotatedRejectsTypo: MockDefaults<BluetoothProxyApi> = {

  // @ts-expect-error - typo caught at the variable declaration site because MockDefaults<T> constrains keys to `keyof T`. The deliberately-misspelled key happens
  // to sort alphabetically before `available` ("availabel" < "available"), so the natural ordering also places the directive adjacent to the bad line.
  availabel:   false,
  available:   false,
  isConnected: () => false
};

// Reference each typecheck-only constant so neither the unused-locals lint nor any future tree-shaking optimization elides them. None are consumed at runtime; their
// value is purely the compile-time validation they trigger.
void annotatedRejectsTypo;
void invalidInlineLiteral;
void validInlineLiteral;
