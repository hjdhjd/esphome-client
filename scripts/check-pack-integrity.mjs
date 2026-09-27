#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * check-pack-integrity.mjs: Lint that verifies the published tarball carries the sources its maps name, and carries nothing else under src/.
 */

/*
 * The package publishes its compiled output together with the TypeScript that produced it, so a consumer's "go to definition" and debugger step-into land on real
 * source. That promise holds only when the tarball and the maps agree in both directions: every source a shipped map names has to be present in the tarball, and
 * every source present in the tarball has to be named by some shipped map. A failure in the first direction hands the consumer a map pointing at a file they did
 * not receive; a failure in the second ships development scaffolding that no map references and no consumer reads.
 *
 * The check derives the required set from the artifact rather than from a second hand-kept list of publish globs that someone has to remember whenever the build's
 * exclusions change. It asks npm for the exact file list it would pack, reads every shipped map as JSON, and compares the two directions. A new dev-only file
 * shape, a renamed module, or a publish glob that drifts away from the build configuration surfaces here as a named path rather than as a defect in a release.
 *
 * It also confirms that declarations ship at all. A compiler profile that emits none leaves the package promising types in its exports map that it does not
 * deliver, which every other gate in the pipeline reports as success.
 *
 * Run via `npm run lint:pack`, after `npm run build`. Exit code 0 on clean, 1 on any violation.
 */
import { dirname, posix, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourcePrefix = "src/";

// Ask npm for the list of files it would place in the tarball. The dry run writes nothing and, because the package declares neither a `prepack` nor a `prepare`
// script, triggers no lifecycle work of its own. The reporter answers with one entry per packed tarball, and packing this package yields exactly one.
function packedPaths() {

  let raw;

  try {

    raw = execFileSync("npm", [ "pack", "--dry-run", "--json" ], { cwd: repoRoot, encoding: "utf8" });
  } catch(error) {

    console.error("[lint:pack] `npm pack --dry-run --json` failed: " + (error.message ?? "(unknown)"));
    process.exit(1);
  }

  try {

    const [report] = JSON.parse(raw);

    return report.files.map((entry) => entry.path);
  } catch(error) {

    console.error("[lint:pack] Could not read the file list from `npm pack --dry-run --json`: " + (error.message ?? "(unknown)"));
    console.error("");
    console.error("  Fix: run `npm pack --dry-run --json` by hand and check that it prints a JSON array whose single entry carries a `files` array.");
    process.exit(1);
  }
}

function main() {

  // Everything this check reads comes out of the build, so an absent dist means there is nothing to judge rather than a violation to report.
  if(!existsSync(resolve(repoRoot, "dist"))) {

    console.error("[lint:pack] There is no dist directory, so the tarball would carry no compiled output and there is nothing to verify.");
    console.error("");
    console.error("  Fix: run `npm run build` first, then re-run `npm run lint:pack`.");
    process.exit(1);
  }

  const paths = packedPaths();
  const packed = new Set(paths);
  const maps = paths.filter((path) => path.endsWith(".map"));
  const declarations = paths.filter((path) => path.endsWith(".d.ts"));
  const declarationMaps = paths.filter((path) => path.endsWith(".d.ts.map"));
  const shippedSources = paths.filter((path) => path.startsWith(sourcePrefix));

  /* Declarations are what the package's exports map promises, and a compiler profile that emits none turns every consumer import into an untyped one. Requiring a
   * declaration map here also guarantees the resolution rules below have at least one map to examine, so they cannot pass by finding nothing.
   */
  if((declarations.length === 0) || (declarationMaps.length === 0)) {

    console.error("[lint:pack] The tarball carries " + declarations.length + " declaration file(s) and " + declarationMaps.length + " declaration map(s); the " +
      "package's exports map promises types, so both counts must be greater than zero.");
    console.error("");
    console.error("  Fix: confirm `tsconfig.build.json` extends the homebridge-plugin-utils library profile, which turns declaration and declaration map emit on, " +
      "then rebuild.");
    process.exit(1);
  }

  const referenced = new Set();
  const dangling = [];
  let sourceReferences = 0;

  for(const mapPath of maps) {

    let map;

    try {

      map = JSON.parse(readFileSync(resolve(repoRoot, mapPath), "utf8"));
    } catch(error) {

      console.error("[lint:pack] " + mapPath + " ships in the tarball but could not be read as JSON: " + (error.message ?? "(unknown)"));
      console.error("");
      console.error("  Fix: run `npm run build` to regenerate the maps, then re-run `npm run lint:pack`.");
      process.exit(1);
    }

    // A map names its sources relative to its own location, after the sourceRoot prefix, which is how a debugger resolves them inside the installed package.
    const mapDirectory = posix.dirname(mapPath);
    const sourceRoot = map.sourceRoot ?? "";

    for(const source of map.sources ?? []) {

      sourceReferences++;

      const resolved = posix.join(mapDirectory, sourceRoot, source);

      if(!packed.has(resolved)) {

        dangling.push("  " + mapPath + " names " + source + ", which resolves to " + resolved + ", and that path is not in the tarball.");

        continue;
      }

      referenced.add(resolved);
    }
  }

  /* A run that examined no source references proves nothing, and it would report every shipped source as unreferenced, which points the reader at the publish list
   * when the maps are what went wrong. Answering the vacuous case first keeps the diagnosis honest.
   */
  if(sourceReferences === 0) {

    console.error("[lint:pack] The " + maps.length + " shipped map(s) name no sources at all, so the resolution rules below would pass without examining anything.");
    console.error("");
    console.error("  Fix: confirm the build emits maps with a populated `sources` array, then rebuild.");
    process.exit(1);
  }

  const unreferenced = shippedSources.filter((path) => !referenced.has(path));

  if((dangling.length > 0) || (unreferenced.length > 0)) {

    if(dangling.length > 0) {

      console.error("[lint:pack] " + dangling.length + " map source(s) do not resolve to a file inside the tarball:");

      for(const line of dangling) {

        console.error(line);
      }

      console.error("");
      console.error("  Fix: publish the missing source by allowing it in `.npmignore`, or stop shipping the map that names it.");
    }

    if(unreferenced.length > 0) {

      console.error("[lint:pack] " + unreferenced.length + " shipped path(s) under " + sourcePrefix + " are named by no shipped map:");

      for(const path of unreferenced) {

        console.error("  " + path);
      }

      console.error("");
      console.error("  Fix: re-ignore the path in `.npmignore`. Anything under " + sourcePrefix + " that the build does not compile has no reader in the tarball.");
    }

    process.exit(1);
  }

  console.log("[lint:pack] " + paths.length + " packed file(s): " + declarations.length + " declaration(s), " + declarationMaps.length + " declaration map(s), " +
    maps.length + " map(s) naming " + sourceReferences + " source reference(s) that all resolve inside the tarball, and " + shippedSources.length +
    " shipped source(s) each named by a map.");
}

main();
