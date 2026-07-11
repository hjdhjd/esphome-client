#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * check-example-references.mjs: Lint script that verifies every JSDoc @includeCode reference resolves to a real region in src/examples/showcase.ts.
 */

/*
 * Scans every `.ts` source file (excluding the showcase itself and test/fixture/helper files) for JSDoc `@includeCode` references of the form
 * `{@includeCode ../examples/showcase.ts#<slug>}`. For each reference, verifies that the slug appears in `src/examples/showcase.ts` as a `// #region <slug>`
 * marker (TypeDoc's required region format). Mismatches fail the lint gate.
 *
 * TypeDoc's build-docs step inlines the referenced region and errors when a region is missing; this script is the fast dedicated pre-check that enforces the same
 * contract as `@includeCode` references are added across the public surface.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SHOWCASE_PATH = join(ROOT, "src", "examples", "showcase.ts");

function walk(dir, out = []) {

  for(const entry of readdirSync(dir)) {

    const path = join(dir, entry);
    const stat = statSync(path);

    if(stat.isDirectory()) {

      // Skip dependency, generated, and showcase trees that contain no @includeCode references (node_modules, dist, examples).
      if((entry === "node_modules") || (entry === "dist") || (entry === "examples")) {

        continue;
      }

      walk(path, out);

      continue;
    }

    if(path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith(".fixtures.ts") && !path.endsWith(".helpers.ts")) {

      out.push(path);
    }
  }

  return out;
}

// Collect every `// #region <slug>` slug from the showcase file.
let availableRegions = new Set();

try {

  const showcaseSource = readFileSync(SHOWCASE_PATH, "utf8");
  const regionRe = /\/\/\s*#region\s+([A-Za-z0-9_-]+)/g;

  for(const m of showcaseSource.matchAll(regionRe)) {

    availableRegions.add(m[1]);
  }

} catch(err) {

  console.error("Could not read showcase: " + (err.message ?? "(unknown)"));
  process.exit(1);
}

console.log("Showcase regions detected: " + String(availableRegions.size));

// Scan source files for `@includeCode ...#<slug>` references in JSDoc.
const sourceFiles = walk(join(ROOT, "src"));
const referenceRe = /@includeCode\s+\S+#([A-Za-z0-9_-]+)/g;
const violations = [];

for(const file of sourceFiles) {

  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  for(let i = 0; i < lines.length; i++) {

    const line = lines[i];

    if(!line.includes("@includeCode")) {

      continue;
    }

    for(const m of line.matchAll(referenceRe)) {

      const slug = m[1];

      if(!availableRegions.has(slug)) {

        violations.push({ file: file.slice(ROOT.length + 1), line: i + 1, slug });
      }
    }
  }
}

if(violations.length > 0) {

  console.error("");
  console.error("Example-reference violations:");

  for(const v of violations) {

    console.error("  " + v.file + ":" + String(v.line) + " @includeCode references unknown region: \"" + String(v.slug) + "\"");
  }

  console.error("");
  console.error("Add the missing `// #region <slug>` to src/examples/showcase.ts, or correct the @includeCode reference.");
  process.exit(1);
}

console.log("All example references resolved.");
