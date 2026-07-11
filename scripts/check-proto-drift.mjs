#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * check-proto-drift.mjs: Check whether the local src/api.proto matches the upstream ESPHome dev branch.
 *
 * The wire protocol this library implements is defined by upstream ESPHome's api.proto. The local snapshot at src/api.proto must stay in sync with upstream so the
 * schema-driven decoder sees every field upstream sends...drift silently drops new fields. This script is the forcing function: it fetches upstream and compares,
 * exiting non-zero on any difference.
 *
 * Operating modes:
 *   - Default (check): read-only. Exit 1 on drift, 0 on clean. Useful for ad-hoc local checks.
 *   - `--write`:       refresh src/api.proto with the upstream content on drift. Exit 0 in both cases. Invoked manually via `npm run refresh:proto`
 *                      when a drift check reports a change that should be picked up locally.
 *
 * The upstream URL points at the dev branch by default; override via PROTO_DRIFT_URL for testing or to pin to a tagged release.
 *
 * Run via:
 *   node scripts/check-proto-drift.mjs           - check only
 *   node scripts/check-proto-drift.mjs --write   - refresh on drift
 *   npm run check:proto-drift                    - check only (package.json shortcut)
 *   npm run refresh:proto                        - refresh on drift (package.json shortcut)
 */
import { dirname, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_UPSTREAM_URL = "https://raw.githubusercontent.com/esphome/esphome/refs/heads/dev/esphome/components/api/api.proto";
const PROCESS_EXIT_OK = 0;
const PROCESS_EXIT_DRIFT = 1;
const PROCESS_EXIT_FAIL = 2;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const protoPath = resolve(repoRoot, "src/api.proto");
const upstreamUrl = process.env.PROTO_DRIFT_URL ?? DEFAULT_UPSTREAM_URL;
const writeMode = process.argv.includes("--write");

// Fetch the upstream proto. Uses Node's global fetch (>= Node 22). Surfaces network errors with a typed-ish message so CI logs are debuggable. The 30-second timeout
// is a defensive cap...the raw.githubusercontent.com endpoint is normally < 1s.
async function fetchUpstream(url) {

  const timeoutSignal = AbortSignal.timeout(30000);

  try {

    const response = await fetch(url, { signal: timeoutSignal });

    if(!response.ok) {

      throw new Error("Upstream fetch failed with HTTP " + String(response.status) + " (" + response.statusText + ") for " + url + ".");
    }

    return await response.text();

  } catch(err) {

    if(err instanceof Error) {

      throw new Error("Upstream proto fetch failed: " + err.message, { cause: err });
    }

    throw err;
  }
}

async function readLocal(path) {

  try {

    return await readFile(path, "utf8");

  } catch(err) {

    if(err instanceof Error) {

      throw new Error("Local proto read failed at " + path + ": " + err.message, { cause: err });
    }

    throw err;
  }
}

async function main() {

  const [ upstream, local ] = await Promise.all([ fetchUpstream(upstreamUrl), readLocal(protoPath) ]);

  if(upstream === local) {

    console.log("api.proto is in sync with upstream (" + upstreamUrl + ").");

    return PROCESS_EXIT_OK;
  }

  // Drift detected. Print a tight summary; the human (or the CI workflow) can read the unified diff via `git diff src/api.proto` after the refresh, which is the
  // universal diff tool we already have available.
  const upstreamLines = upstream.split("\n").length;
  const localLines = local.split("\n").length;

  console.log("Drift detected between local src/api.proto and upstream.");
  console.log("  Upstream: " + upstreamUrl);
  console.log("  Local lines:    " + String(localLines));
  console.log("  Upstream lines: " + String(upstreamLines));

  if(!writeMode) {

    console.log("");
    console.log("Re-run with --write to refresh the local file; then `git diff src/api.proto` to inspect.");

    return PROCESS_EXIT_DRIFT;
  }

  await writeFile(protoPath, upstream, "utf8");
  console.log("");
  console.log("Refreshed src/api.proto from upstream. Inspect changes with `git diff src/api.proto`.");

  return PROCESS_EXIT_OK;
}

try {

  process.exit(await main());

} catch(err) {

  console.error("check-proto-drift failed:", err instanceof Error ? err.message : err);
  process.exit(PROCESS_EXIT_FAIL);
}
