# scripts/

Build-time and CI utilities. Two file extensions coexist by deliberate choice:

## `.ts` — when typed imports matter

Use TypeScript (`.ts`) for scripts that import from the project's source tree (e.g. `import { ENTITY_SCHEMAS } from "../src/schemas/entity-schemas.ts"`). The
TypeScript compiler validates the import contract; refactors in `src/` break the script surface at typecheck time rather than at runtime.

Invocation pattern: `node --strip-types scripts/<name>.ts`. Node's native type stripping (enabled by default on the project's Node 22.20+ floor) runs the TypeScript
source directly without a build step, and because relative imports across the codebase carry `.ts` extensions, Node resolves them natively - no loader hook required.

Current consumers:

- `lint-proto-sync.ts` — imports `ENTITY_SCHEMAS` to diff against `api.proto`.
- `lint-types-test-files.ts` — imports the classifier helper from `src/internal/`.

## `.mjs` — when typed imports don't matter

Use plain ESM JavaScript (`.mjs`) for scripts that operate on configuration files, do filesystem walks, or hold only string/number constants. No TypeScript types
to enforce; the strip-types runtime requirement isn't worth carrying.

Invocation pattern: `node scripts/<name>.mjs`. No flags.

Current consumers:

- `test-file-patterns.mjs` — exports `ESLINT_LOOSE_PATTERNS` and `BUILD_EXCLUDED_PATTERNS` constants (consumed by `eslint.config.mjs` and the cross-config check).
- `check-test-file-globs.mjs` — reads `tsconfig.build.json` as JSON and compares against the SSOT.
- `check-example-references.mjs` — validates the JSDoc `@includeCode` showcase-region references against `src/examples/showcase.ts`.
- `check-proto-drift.mjs` — fetches upstream `api.proto` and diffs.

## Decision rule

When adding a new script, ask: does it import any TypeScript module from `src/`? If yes, write `.ts`. If no (it operates on JSON / config / strings / shell), write
`.mjs`. The boundary keeps the strip-types runtime requirement constrained to scripts that genuinely benefit from typed imports; scripts that don't need types
stay simple ESM.
