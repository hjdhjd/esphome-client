/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * eslint.config.mjs: Linting defaults for the ESPHome client library. Inherits the homebridge-plugin-utils baseline as-is. Most rule exceptions live next to
 * the code that needs them - either an in-file `eslint-disable` / `eslint-enable` block for a contiguous file region, or a per-line `eslint-disable-next-line`
 * with a rationale comment for one-off exceptions. A blanket exception below covers rules whose violations in test files are not bugs but the *purpose* of
 * the test (probing async-runner behavior, mock seams, type-system edges), where per-site disables would be absurd in volume and the pattern is structurally
 * test-only.
 */
import { ESLINT_LOOSE_PATTERNS } from "./scripts/test-file-patterns.mjs";
import hbPluginUtils from "homebridge-plugin-utils/eslint";

const baseConfig = hbPluginUtils({

  allowDefaultProject: ["eslint.config.mjs"],
  js: ["eslint.config.mjs"],
  ts: ["src/**/*.ts"]
});

export default [

  ...baseConfig,
  {

    // Test-only blanket overrides. Each rule listed below was verified against the actual violation set: every hit was a legitimate test pattern, not a real
    // bug. Counts at the time of approval are noted so a future contributor can sanity-check whether the override still pulls its weight.
    files: [...ESLINT_LOOSE_PATTERNS],

    rules: {

      // 7 hits. Type-level tests probe void-typed function-return shapes (`(): void => fn()` patterns asserting signatures).
      "@typescript-eslint/no-confusing-void-expression": "off",

      // 2438 hits. Every `test(...)` and `describe(...)` call in `node:test` returns a promise the runner manages; we never await them. Disable-per-call would
      // put a directive above every test.
      "@typescript-eslint/no-floating-promises": "off",

      // 234 hits. Test fixtures use `!` to assert known-good shape of test-built data; narrowing alternatives balloon test code without adding signal.
      "@typescript-eslint/no-non-null-assertion": "off",

      // 113 hits. Tests deliberately probe defensive branches the type-checker has narrowed away - the "always falsy/truthy" warning fires on the tests that
      // exist to verify those branches.
      "@typescript-eslint/no-unnecessary-condition": "off",

      // 10 hits. Tests assign `any`-typed mock values.
      "@typescript-eslint/no-unsafe-assignment": "off",

      // 31 hits. Tests reach into `any`-typed mock objects to inject scenarios.
      "@typescript-eslint/no-unsafe-member-access": "off",

      // 15 hits. Tests drive scripted async scenarios sequentially. Same pattern as the production reconnect loop (which uses per-site disables); the
      // production count was small enough for per-site, the test count is not.
      "no-await-in-loop": "off"
    }
  }
];
