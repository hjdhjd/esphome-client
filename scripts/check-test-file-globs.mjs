#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * check-test-file-globs.mjs: CI lint that verifies the test-file pattern SSOT is honored by every config that enumerates it.
 *
 * The canonical pattern list lives in `scripts/test-file-patterns.mjs`. `eslint.config.mjs` imports it directly (single SSOT for the eslint side). `tsconfig.build.json`
 * cannot import JS modules - its `exclude` array is literal JSON - so it duplicates the patterns. This check enforces that the tsconfig's literal copy stays in
 * sync with the SSOT: every canonical pattern must appear in tsconfig's `exclude`, and tsconfig must not omit any.
 *
 * Replaces the "remember to update both configs when adding a new pattern" discipline with a structural CI check. A future contributor adding a new file extension
 * to the SSOT (or to tsconfig.build.json) gets a lint failure naming the missing entry.
 *
 * Run via `npm run lint:test-file-globs`. Exit code 0 on clean, 1 on any divergence.
 */
import { dirname, resolve } from "node:path";
import { BUILD_EXCLUDED_PATTERNS } from "./test-file-patterns.mjs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const tsconfigBuildPath = resolve(repoRoot, "tsconfig.build.json");

async function main() {

  const raw = await readFile(tsconfigBuildPath, "utf8");
  const parsed = JSON.parse(raw);
  const excludes = Array.isArray(parsed?.exclude) ? parsed.exclude : [];
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

await main();
