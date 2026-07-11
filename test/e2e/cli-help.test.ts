/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * cli-help.test.ts: Subprocess-invocation tests for the espc CLI's help and parsing surface, plus the bin-entry contract that the binary actually starts up under
 * every invocation path npm uses (direct, symlink). The latter forever forecloses the symlink-invocation failure mode that the old self-detecting `argv[1] ===
 * fileURLToPath(import.meta.url)` pattern silently broke on; the entry/library split in espc-bin.ts vs espc.ts makes that bug structurally impossible, but the test
 * stays as a regression guard against any future change that re-introduces a path-comparison entry check.
 */
import { describe, test } from "node:test";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "..", "..", "dist", "util", "espc-bin.js");

function runCli(args: readonly string[], cliPath: string = CLI_PATH): { stdout: string; stderr: string; status: number } {

  try {

    const stdout = execFileSync("node", [ cliPath, ...args ], { encoding: "utf8", stdio: [ "ignore", "pipe", "pipe" ] });

    return { status: 0, stderr: "", stdout };

  } catch(err) {

    // execFileSync throws on non-zero exit; capture status + streams.
    const e = err as { status?: number | null; stderr?: string | Buffer; stdout?: string | Buffer };

    return {

      status: e.status ?? 1,
      stderr: typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString("utf8") ?? ""),
      stdout: typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString("utf8") ?? "")
    };
  }
}

describe("CLI help-path coverage (subprocess invocation against dist/util/espc-bin.js)", () => {

  test("dist/util/espc-bin.js exists - run npm run build first if this fails", () => {

    assert.equal(existsSync(CLI_PATH), true, "CLI binary must be built before subprocess tests run");
  });

  test("--help renders without error", () => {

    const { status, stdout } = runCli([ "--help" ]);

    assert.equal(status, 0, "--help must exit 0");
    assert.match(stdout, /espc - ESPHome Client CLI Utility/, "help banner present");
    assert.match(stdout, /Global Options:/, "global options section present");
    assert.match(stdout, /Commands:/, "commands section present");
  });

  test("--help lists every CLI command", () => {

    const { stdout } = runCli([ "--help" ]);

    for(const cmd of [ "capabilities", "control", "devices", "info", "interactive", "list", "monitor", "record", "replay", "snapshot", "watch" ]) {

      assert.match(stdout, new RegExp("^\\s+" + cmd + "\\s", "m"), "help output must list command: " + cmd);
    }
  });

  test("invocation with no command renders help and exits 0", () => {

    const { status, stdout } = runCli([]);

    assert.equal(status, 0, "no-command invocation falls back to help with exit 0");
    assert.match(stdout, /espc - ESPHome Client CLI Utility/);
  });

  test("unknown command exits non-zero with a helpful message", () => {

    const { status, stderr } = runCli([ "nonsensecommand" ]);

    assert.notEqual(status, 0, "unknown command must exit non-zero");
    assert.match(stderr, /Unknown command/, "stderr must mention the unknown command");
  });

  test("info command without --host fails with a clear --host error", () => {

    const { status, stderr } = runCli([ "info" ]);

    assert.notEqual(status, 0);
    assert.match(stderr, /--host/, "missing --host must be surfaced");
  });

  test("watch command points at a closed loopback port and fails with a clear error", () => {

    const { status, stderr } = runCli([ "-h", "127.0.0.1", "watch", "light-anything" ]);

    assert.notEqual(status, 0);
    assert.match(stderr, /connection refused|connect|failed/i, "missing TCP listener must be surfaced");
  });

  test("record command without --host fails clearly", () => {

    const { status, stderr } = runCli([ "record" ]);

    assert.notEqual(status, 0);
    assert.match(stderr, /--host option is required|record requires/i);
  });

  test("replay command with a missing file fails clearly", () => {

    const { status, stderr } = runCli([ "replay", "/nonexistent/path.bin" ]);

    assert.notEqual(status, 0);
    assert.match(stderr, /Capture file not found|not found/i);
  });

  test("replay command with a basic-discovery capture exits 0", () => {

    // Because the simulator is the corpus single source of truth, this subprocess test synthesizes its own capture in a temp directory: an empty `.bin` plus a sibling
    // `.json` metadata file the replay command renders. An empty capture renders the metadata block and exits 0.
    const directory = mkdtempSync(join(tmpdir(), "espc-cli-replay-"));
    const binPath = join(directory, "basic-discovery.bin");
    const metadataPath = join(directory, "basic-discovery.json");

    writeFileSync(binPath, "");
    writeFileSync(metadataPath, JSON.stringify({ scenario: "basic-discovery", schemaVersion: "v1.0.0", source: "synthesized" }));

    try {

      const { status, stdout } = runCli([ "replay", binPath ]);

      assert.equal(status, 0);
      assert.match(stdout, /Replay scenario: basic-discovery/);
      assert.match(stdout, /synthesized/);
    } finally {

      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("--help short flag aliases work (-h is sugar for --host, -i for --interactive, -v for --verbose, -p for --port, -k for --psk)", () => {

    // We render --help and assert the help text documents every short-flag alias (-h, -i, -v, -p, -k) alongside its long form, so the aliases stay discoverable.
    const { status, stdout } = runCli([ "--help" ]);

    assert.equal(status, 0);
    assert.match(stdout, /-h, --host/);
    assert.match(stdout, /-i, --interactive/);
    assert.match(stdout, /-v, --verbose/);
    assert.match(stdout, /-p, --port/);
    assert.match(stdout, /-k, --psk/);
  });
});

// The bin-entry contract: invoking the CLI through a symlink to the built file must produce byte-identical output to invoking the file directly. npm's bin installation,
// npx, and `npm link` all install a package's `bin` field as a PATH symlink, so this test models the exact invocation shape end users encounter and pins the
// symlink-vs-direct output-parity contract that the entry/library split in espc-bin.ts upholds by construction.
describe("CLI bin entry is invocable through a symlink (npm bin / npx / npm link parity)", () => {

  test("invoking the bin through a symlink produces the same --help output as direct invocation", () => {

    // Stage a symlink in a fresh tmp directory so the test is hermetic (no stale state, no pollution of dist/, parallel-test-safe). The symlink mimics what npm
    // creates under node_modules/.bin or under the global PATH directory when a package's `bin` field is installed.
    const tmpDir = mkdtempSync(join(tmpdir(), "espc-symlink-"));
    const linkPath = join(tmpDir, "espc");

    try {

      symlinkSync(CLI_PATH, linkPath);

      const direct = runCli([ "--help" ]);
      const viaLink = runCli([ "--help" ], linkPath);

      assert.equal(viaLink.status, 0, "invocation through symlink must exit 0 (regression guard against argv[1]-vs-import.meta.url symlink mismatch)");
      assert.equal(viaLink.stdout, direct.stdout, "symlink invocation must produce byte-identical output to direct invocation");
    } finally {

      rmSync(tmpDir, { force: true, recursive: true });
    }
  });
});
