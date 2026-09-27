#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * check-test-file-globs.mjs: CI lint that verifies the test-file pattern SSOT is honored by every config that enumerates it.
 *
 * The canonical pattern list lives in `scripts/test-file-patterns.mjs`. `eslint.config.mjs` imports it directly (single SSOT for the eslint side). `tsconfig.build.json`
 * cannot import a JS module, so it duplicates the patterns in its literal `exclude` array. This check enforces that the tsconfig's literal copy stays in sync with
 * the SSOT: every canonical pattern must appear in tsconfig's `exclude`, and tsconfig must not omit any. The check reads the tsconfig through TypeScript's own config
 * parser rather than `JSON.parse`, because the file carries comments.
 *
 * A structural CI check stands in for remembering to update both configs when a pattern is added: a future contributor adding a new file extension to the SSOT (or
 * to tsconfig.build.json) gets a lint failure naming the missing entry.
 *
 * Run via `npm run lint:test-file-globs`. Exit code 0 on clean, 1 on any divergence.
 */
import { dirname, resolve } from "node:path";
import { BUILD_EXCLUDED_PATTERNS } from "./test-file-patterns.mjs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const tsconfigBuildPath = resolve(repoRoot, "tsconfig.build.json");

function main() {

  const { config, error } = ts.readConfigFile(tsconfigBuildPath, ts.sys.readFile);

  if(error !== undefined) {

    console.error("[lint:test-file-globs] TypeScript's config parser could not read tsconfig.build.json.");
    console.error("  " + ts.flattenDiagnosticMessageText(error.messageText, "\n"));
    process.exit(1);
  }

  const excludes = Array.isArray(config?.exclude) ? config.exclude : [];
  const excludeSet = new Set(excludes);
  const missing = [];

  for(const pattern of BUILD_EXCLUDED_PATTERNS) {

    if(!excludeSet.has(pattern)) {

      missing.push(pattern);
    }
  }

  // The tsconfig may legitimately exclude additional patterns beyond the canonical test-file set (e.g., the `src/internal/` directory is excluded for a different
  // reason). Only flag patterns missing FROM tsconfig that are present IN the SSOT - extras in tsconfig are fine.
  if(missing.length > 0) {

    console.error("[lint:test-file-globs] " + missing.length + " canonical pattern(s) missing from tsconfig.build.json's exclude array:");

    for(const p of missing) {

      console.error("  - " + p);
    }

    console.error("");
    console.error("  Fix: add the missing pattern(s) to `tsconfig.build.json` `exclude`. The SSOT is `scripts/test-file-patterns.mjs`; the tsconfig must mirror it.");
    process.exit(1);
  }

  console.log("[lint:test-file-globs] " + BUILD_EXCLUDED_PATTERNS.length + " canonical pattern(s) all present in tsconfig.build.json. No divergence.");
}

main();
