/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * test-file-patterns.mjs: Single source of truth for the file-pattern lists consumed by the project's tool configs.
 */

/**
 * Single source of truth for the project's dev-only file-pattern lists. Two separate constants are exported, one per consuming concern. Each list names every dev-only
 * file shape under `src/` (runtime tests, mixed type+runtime tests, pure type-level tests, fixtures, helpers), because each of those shapes needs BOTH the
 * loose-rule eslint override AND the build exclusion. The ESLint list also covers the standalone `test/` tree, which the build never compiles and so has nothing to
 * exclude. The constants are deliberately separate arrays rather than one shared reference, so a pattern that belongs to only one concern is a one-line edit to the
 * relevant constant, not a structural split.
 *
 * Consumed by:
 *
 *   - {@link ESLINT_LOOSE_PATTERNS}: imported by `eslint.config.mjs` to apply the test-infrastructure override (looser rules for non-null assertions, unnecessary
 *     conditions, unsafe assignments / member access, confusing void expressions, and await-in-loop). These rules disable noise that's appropriate for test
 *     fixtures but undesirable in production source.
 *
 *   - {@link BUILD_EXCLUDED_PATTERNS}: mirrored by `tsconfig.build.json`'s `exclude` array. Validated structurally at CI time by `scripts/check-test-file-globs.mjs`,
 *     which reads both and fails the build if any canonical pattern is missing from the tsconfig copy. The tsconfig legitimately excludes ADDITIONAL paths (the
 *     `dist/`, `node_modules/`, and `src/internal/` directories) that aren't part of this SSOT - those exclusions are unrelated
 *     concerns; the SSOT is specifically for the dev-only file SHAPES.
 *
 * @module scripts/test-file-patterns
 */

/**
 * File patterns that receive the loose-rules eslint override. Each `src/` pattern targets one of the dev-only file shapes documented in the project guide's
 * "Type-level tests vs runtime tests" section, and the `test/` pattern covers the standalone test tree whole.
 */
export const ESLINT_LOOSE_PATTERNS = Object.freeze([

  "src/**/*.test.ts",
  "src/**/*.fixtures.ts",
  "src/**/*.helpers.ts",
  "src/**/*.types.test.ts",
  "src/**/*.types.ts",
  "test/**/*.ts"
]);

/**
 * File patterns that `tsconfig.build.json` must exclude from `dist/`. Dev-only artifacts (tests, fixtures, type-level guarantee files) should never ship in the
 * published package. Validated at CI time by `scripts/check-test-file-globs.mjs`.
 */
export const BUILD_EXCLUDED_PATTERNS = Object.freeze([

  "src/**/*.test.ts",
  "src/**/*.fixtures.ts",
  "src/**/*.helpers.ts",
  "src/**/*.types.test.ts",
  "src/**/*.types.ts"
]);
