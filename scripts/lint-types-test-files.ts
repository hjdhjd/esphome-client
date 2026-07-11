#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lint-types-test-files.ts: CI lint that enforces the runtime-assertion contract on *.types.test.ts files.
 *
 * The codebase distinguishes three test-file extensions per the project guide: `*.test.ts` (runtime only), `*.types.test.ts` (mixed type-level + meaningful runtime),
 * and `*.types.ts` (pure type-level). The masterclass rule for the mixed extension: every `*.types.test.ts` file must contain at least one runtime assertion
 * that exercises a real value (computed expression, captured variable, property access, function call) rather than only literal-true placeholders. A file with no
 * non-trivial runtime assertion is functionally pure-type-level and should be renamed to `*.types.ts`; this lint catches the drift at CI time so the convention
 * stays prescriptive rather than aspirational.
 *
 * Architecture:
 *
 *   - Filesystem walk: this script enumerates every `*.types.test.ts` file under `src/`.
 *   - Classification: the pure logic (which assertion calls count as meaningful vs trivial) lives in `src/internal/types-test-classifier.ts` and is unit-tested in
 *     `src/internal/types-test-classifier.test.ts`. The classifier handles every form of literal argument (boolean / numeric / string / null / undefined / template
 *     with no substitutions, possibly parenthesized or unary-prefixed); anything else (identifier reads, member access, calls, typeof, binary expressions) marks
 *     the argument as non-literal and the assertion as meaningful.
 *   - Reporting: a per-file classification record is produced; files with zero meaningful assertions are reported as violations.
 *
 * Known blind spot (documented as a structural trade-off): the classifier inspects `assert.*` call arguments only - not the surrounding test body. A test that
 * does real runtime work via patterns like `if(x !== expected) throw new Error(...)` followed by a token `assert.ok(true)` would fail this lint despite having
 * meaningful validation. In practice the codebase uses `assert.*` consistently and the codebase convention is to express runtime rules AS assert calls, so
 * the blind spot has zero incidence today; the rule prescribes the convention rather than tolerating an alternative one.
 *
 * Runtime requirement: invoked as `node scripts/lint-types-test-files.ts`, relying on Node's native type stripping (default on the project's Node 22.20+
 * floor). Relative imports carry `.ts` extensions, so Node resolves them without a loader. Same dependency as `lint-proto-sync.ts`.
 *
 * Run via `npm run lint:types-test-files`. Exit code 0 on clean, 1 on any violation.
 */
import { classifyAssertionsInFile } from "../src/internal/types-test-classifier.ts";
import { dirname, relative, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const srcRoot = resolve(repoRoot, "src");

/**
 * Recursively enumerate every `*.types.test.ts` file under `src/`.
 */
async function findTypesTestFiles(dir: string): Promise<string[]> {

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for(const entry of entries) {

    const full = resolve(dir, entry.name);

    if(entry.isDirectory()) {

      const nested = await findTypesTestFiles(full);

      files.push(...nested);

    } else if(entry.isFile() && entry.name.endsWith(".types.test.ts")) {

      files.push(full);
    }
  }

  return files;
}

interface FileResult {

  meaningful: number;
  path: string;
  total: number;
  trivial: number;
}

async function analyzeFile(path: string): Promise<FileResult> {

  const source = await readFile(path, "utf8");
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classification = classifyAssertionsInFile(sf);

  return { ...classification, path };
}

async function main(): Promise<void> {

  const files = await findTypesTestFiles(srcRoot);
  const results = await Promise.all(files.map((f) => analyzeFile(f)));
  const violations = results.filter((r) => r.meaningful === 0);

  if(violations.length > 0) {

    console.error("[lint:types-test-files] " + violations.length + " file(s) violate the mixed-extension contract:");

    for(const v of violations) {

      const rel = relative(repoRoot, v.path);

      if(v.total === 0) {

        console.error("  - " + rel + " has zero `assert.*` calls. Rename to `*.types.ts` and convert any type-level assertions to sentinel form.");
      } else {

        console.error("  - " + rel + " has " + v.total + " `assert.*` call(s), all with literal-only arguments (placeholders like `assert.ok(true)`). Either " +
          "add a meaningful runtime assertion or rename to `*.types.ts`.");
      }
    }

    process.exit(1);
  }

  const totalAssertions = results.reduce((sum, r) => sum + r.total, 0);
  const totalMeaningful = results.reduce((sum, r) => sum + r.meaningful, 0);

  console.log("[lint:types-test-files] " + files.length + " file(s) checked. " + totalMeaningful + " meaningful / " + totalAssertions + " total `assert.*` calls. " +
    "No violations.");
}

await main();
