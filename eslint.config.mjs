/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * eslint.config.mjs: Linting defaults for the ESPHome client library. Inherits the homebridge-plugin-utils baseline as-is. Most rule exceptions live next to
 * the code that needs them - either an in-file `eslint-disable` / `eslint-enable` block for a contiguous file region, or a per-line `eslint-disable-next-line`
 * with a rationale comment for one-off exceptions. A blanket exception below covers rules whose violations in test files are not bugs but the *purpose* of
 * the test (probing async-runner behavior, mock injection points, type-system edges), where per-site disables would be absurd in volume and the pattern is structurally
 * test-only. A second blanket exception below turns `no-console` off for the scripts, which are command-line tools whose console output is their interface.
 *
 * `tsconfig.json` claims this file through `allowJs`, so it lints under a real project and needs no `allowDefaultProject` fallback.
 */
import { ESLINT_LOOSE_PATTERNS } from "./scripts/test-file-patterns.mjs";
import hbPluginUtils from "homebridge-plugin-utils/eslint";

const baseConfig = hbPluginUtils({

  js: [ "eslint.config.mjs", "scripts/**/*.mjs" ],

  // This config file and the scripts run under Node rather than in a browser, so they take Node's globals. The test-file relaxation of floating promises comes
  // from the preset's `tests` default, which already names this repository's test, fixture, and helper files.
  node: [ "eslint.config.mjs", "scripts/**/*.mjs" ],
  ts: [ "bench/**/*.ts", "scripts/**/*.ts", "src/**/*.ts", "test/**/*.ts" ]
});

export default [

  ...baseConfig,
  {

    // Test-only blanket overrides. Each rule listed below was verified against the actual violation set: every hit was a legitimate test pattern, not a real bug.
    files: [...ESLINT_LOOSE_PATTERNS],

    rules: {

      // Type-level tests probe void-typed function-return shapes (`(): void => fn()` patterns asserting signatures).
      "@typescript-eslint/no-confusing-void-expression": "off",

      // Test fixtures use `!` to assert known-good shape of test-built data; narrowing alternatives balloon test code without adding signal.
      "@typescript-eslint/no-non-null-assertion": "off",

      // Tests deliberately probe defensive branches the type-checker has narrowed away - the "always falsy/truthy" warning fires on the tests that exist to verify
      // those branches.
      "@typescript-eslint/no-unnecessary-condition": "off",

      // Tests assign `any`-typed mock values.
      "@typescript-eslint/no-unsafe-assignment": "off",

      // Tests reach into `any`-typed mock objects to inject scenarios.
      "@typescript-eslint/no-unsafe-member-access": "off",

      // Tests drive scripted async scenarios sequentially. Same pattern as the production reconnect loop (which uses per-site disables); the production count was
      // small enough for per-site, the test count is not.
      "no-await-in-loop": "off"
    }
  },
  {

    // The scripts are command-line tools whose console output is their interface.
    files: ["scripts/**/*.@(mjs|ts)"],

    rules: {

      "no-console": "off"
    }
  }
];
