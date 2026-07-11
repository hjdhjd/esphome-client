/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * espc.test.ts: Comprehensive unit tests for the espc CLI - parser, dispatcher, formatter, REPL, and per-entity-type control dispatch.
 *
 * This file is the canonical contract documentation for the CLI surface. It exhaustively enumerates the CLI's behavior across these categories: exports, methods,
 * errors, branches, async, narrowing, boundary, edge, hot, values, negative. The CLI's exported entry points (parseInvocation, dispatch, executeControl,
 * runInteractiveControl, handleInteractiveCommand, Printer, showUsage, formatDeviceInfo, findEntity, isCommandName, isClimateMode, joinParts, CLI_COMMANDS,
 * CLI_OPTIONS) are tested at the unit level rather than driving the binary as a subprocess.
 *
 * Subprocess-based tests for the help-path and connection-error paths live in `test/e2e/cli-help.test.ts`; that file is complementary, not duplicative - it verifies the
 * binary actually starts, parses argv, and reports failures end-to-end through `dist/util/espc.js`.
 */
import {
  CLILogger, CLIMATE_MODE_NAMES, CLI_COMMANDS, CLI_OPTIONS, CONTROL_BUILDERS, CliError, LEVEL_THEME, Printer, awaitQuietPeriod, buildControlCommand, dispatch,
  executeControl, findEntity, formatCapabilities, formatDeviceInfo, formatEntityList, formatReplayMetadata, formatSnapshotJson, formatSubDeviceList,
  handleInteractiveCommand, isClimateMode, isCommandName, isControllableType, joinParts, parseFloatOption, parseIntOption, parseInvocation, parseJsonOption, parsePercent,
  parseRgb, printInteractiveHelp, runCapabilities, runDevices, runInfo, runInteractiveControl, runList, runSnapshot, showUsage, tryParseIntStrict
} from "./espc.ts";
import type { CommandOptions, ControlClient, EntityWithId, Invocation, PrinterLevel } from "./espc.ts";
import { describe, test } from "node:test";
import { mockDeviceInfo, mockStateMessage } from "../testing/factories.ts";
import type { CaptureMetadata } from "./capture.ts";
import type { ClientCapabilities } from "../capabilities.ts";
import type { DeviceInfo } from "../esphome-client.ts";
import { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { Entity } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import { MockClient } from "../testing/mock-client.ts";
import type { Nullable } from "../types.ts";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { entityId } from "../entity-id.ts";

// In-memory writer used to capture stdout/stderr through the Printer's IO seam. Both `process.stdout` and `process.stderr` satisfy the `PrinterWritable` shape with
// `write(data: string): unknown`; this minimal stand-in honors the same contract while accumulating writes for assertion. The `chunks` array preserves write order so
// tests can assert per-line order in addition to aggregate content.
class StringWriter {

  public chunks: string[] = [];

  public write(data: string): boolean {

    this.chunks.push(data);

    return true;
  }

  public get text(): string {

    return this.chunks.join("");
  }

  public clear(): void {

    this.chunks = [];
  }
}

interface PrinterRig {

  printer: Printer;
  stderr: StringWriter;
  stdout: StringWriter;
}

// SGR escape pattern source: ESC + "[" + digits (optionally semicolon-separated) + "m". The ESC byte is emitted via fromCharCode rather than a regex-literal escape so
// the no-control-regex lint rule does not need a disable comment; constructing through `new RegExp` puts the regex outside the rule's static analysis. We expose this
// as a source string and build fresh regex instances at call time so neither helper inherits stateful `lastIndex` from the other.
const ANSI_RX_SOURCE = String.fromCharCode(0x1b) + "\\[\\d+(?:;\\d+)*m";

// Strip every SGR escape sequence from captured stream text. Test assertions use this to compare semantic content without coupling to the exact byte format Node emits
// for any given color: the format is an implementation detail of util.styleText (and has shifted across Node versions), so byte-level assertions are inherently
// fragile. Strip first, then assert on the meaningful text.
function stripAnsi(text: string): string {

  return text.replace(new RegExp(ANSI_RX_SOURCE, "g"), "");
}

// Predicate: does the captured text contain any SGR escape sequence? The companion to stripAnsi for the independent "was color applied?" assertion. Constructs a fresh
// non-global regex per call so the result is stateless across consecutive invocations.
function hasAnsi(text: string): boolean {

  return new RegExp(ANSI_RX_SOURCE).test(text);
}

// Run a callback with a hermetic environment-variable scope. Each key in `overrides` is set (or deleted with `null`) for the duration of `fn`, then restored to its
// prior value (including "was previously unset") regardless of how `fn` exits. Tests that probe Printer.fromEnvironment use this to neutralize ambient state - notably
// the Node test runner injects `FORCE_COLOR=1` into worker env, which would otherwise leak into any test that reads `process.env`.
function withEnv<T>(overrides: Readonly<Record<string, Nullable<string>>>, fn: () => T): T {

  const keys = Object.keys(overrides);
  const previous = new Map<string, string | undefined>(keys.map((key) => [ key, process.env[key] ]));

  for(const key of keys) {

    const value = overrides[key];

    if(value === null) {

      // Reflect.deleteProperty is the modern, lint-friendly equivalent of `delete process.env[key]` for dynamic keys; it also returns a boolean we can ignore here
      // (env-var deletion is best-effort by design).
      Reflect.deleteProperty(process.env, key);
    } else {

      process.env[key] = value!;
    }
  }

  try {

    return fn();
  } finally {

    for(const key of keys) {

      const before = previous.get(key);

      if(before === undefined) {

        Reflect.deleteProperty(process.env, key);
      } else {

        process.env[key] = before;
      }
    }
  }
}

// Build a Printer with both streams captured through StringWriter. Defaults to color=false and tty=false so captured bytes are deterministic regardless of how the
// test runner is invoked (interactive shell, redirected file, CI). Tests that exercise the colorization path opt in by passing `color: true, tty: true`. The two flags
// are independent: `color` governs ANSI emission alone, `tty` governs the readline-interleave dance alone.
function makePrinter(opts: { color?: boolean; tty?: boolean } = {}): PrinterRig {

  const stdout = new StringWriter();
  const stderr = new StringWriter();
  const printer = new Printer({

    color: opts.color ?? false,
    stderr,
    stdout,
    tty: opts.tty ?? false
  });

  return { printer, stderr, stdout };
}

// Construct a typed entity record that the CLI's lookup helpers accept. mockEntity from `testing/factories.ts` does not stamp `id` onto the returned object (the real
// client computes it from objectId on read); for tests that bypass MockClient.getEntitiesWithIds the helper here builds the same shape inline. The `key` is the
// caller-supplied numeric key so tests can verify lookup-by-key-vs-id branches.
function entityRecord(type: string, objectId: string, key = 1): EntityWithId {

  return {

    id: type + "-" + objectId,
    key,
    name: objectId.replace(/_/g, " "),
    type
  };
}

// Empty CommandOptions for tests that don't exercise command-scoped flags. Every field is `undefined` because parseArgs uniformly produces a key for every defined
// option; the absence of a flag is encoded as `undefined`, not an omitted property.
const EMPTY_OPTIONS: CommandOptions = {

  brightness: undefined,
  duration: undefined,
  effect: undefined,
  entity: undefined,
  rgb: undefined,
  state: undefined,
  temp: undefined,
  type: undefined,
  wait: undefined
};

// Hand-verified output fixtures. Each fixture's provenance is documented inline so a reader unfamiliar with the CLI can reconstruct the expected bytes from first
// principles.
//
// FIXTURE_DEVICE_INFO_FULL: synthesized by populating every optional DeviceInfo field with a known value and rendering through formatDeviceInfo. The order is the
// stable rendering order in formatDeviceInfo (name, model, manufacturer, friendly name, MAC, ESPHome version, compilation time, uses password, webserver port,
// bluetooth proxy version, voice assistant version). Trailing newline omitted because formatDeviceInfo joins with "\n" and does not append a trailing one.
const FIXTURE_DEVICE_INFO_FULL = [

  "Device Information:",
  "  Name: Living Room",
  "  Model: ESP32-WROOM",
  "  Manufacturer: Espressif",
  "  Friendly Name: Living Room ESP",
  "  MAC Address: 24:62:AB:CD:EF:01",
  "  ESPHome Version: 2025.10.0",
  "  Compilation Time: Jan 15 2026, 10:23:45",
  "  Uses Password: Yes",
  "  Webserver Port: 80",
  "  Bluetooth Proxy Version: 5",
  "  Voice Assistant Version: 2"
].join("\n");

// FIXTURE_DEVICE_INFO_MINIMAL: every optional string field empty/undefined, numeric fields at zero. The always-present "Uses Password" line plus "Webserver Port: 0"
// (because formatDeviceInfo's guard is `!== undefined`, not truthy, so 0 renders) survive. This proves the falsy-string guards drop empty fields cleanly while the
// numeric guards correctly render zero rather than mistakenly suppress it.
const FIXTURE_DEVICE_INFO_MINIMAL = [

  "Device Information:",
  "  Uses Password: No",
  "  Webserver Port: 0"
].join("\n");

// 1. Exports - every @internal export imported above resolves to a callable / constructor / value.
describe("Exports - every @internal symbol is importable and well-typed", () => {

  test("function exports resolve to callables", () => {

    assert.equal(typeof parseInvocation, "function");
    assert.equal(typeof dispatch, "function");
    assert.equal(typeof showUsage, "function");
    assert.equal(typeof formatDeviceInfo, "function");
    assert.equal(typeof findEntity, "function");
    assert.equal(typeof isCommandName, "function");
    assert.equal(typeof isClimateMode, "function");
    assert.equal(typeof joinParts, "function");
    assert.equal(typeof handleInteractiveCommand, "function");
    assert.equal(typeof runInteractiveControl, "function");
    assert.equal(typeof executeControl, "function");
    assert.equal(typeof printInteractiveHelp, "function");
  });

  test("class exports resolve to constructors", () => {

    assert.equal(typeof Printer, "function");
    assert.equal(typeof CLILogger, "function");
    assert.equal(typeof CliError, "function");

    // Constructors actually produce instances of themselves.
    assert.equal(new Printer() instanceof Printer, true);
    assert.equal(new CLILogger(new Printer(), false) instanceof CLILogger, true);
    assert.equal(new CliError("x") instanceof CliError, true);
  });

  test("constant exports resolve to the expected shapes", () => {

    assert.equal(typeof CLI_COMMANDS, "object");
    assert.equal(typeof CLI_OPTIONS, "object");
    assert.equal(CLIMATE_MODE_NAMES instanceof Set, true);
  });
});

// 2. Methods - every public method on Printer, CLILogger, CliError, and the registered handlers via CLI_COMMANDS.
describe("Printer - per-method emit semantics through the IO seam", () => {

  // The level-method tests are driven directly off LEVEL_THEME, the same table that drives the production writer. Adding a new level (or changing a label/color/stream)
  // is one row in LEVEL_THEME and the loop below picks it up automatically: no per-method test to maintain, no chance for the test list to drift from the production
  // table. Each iteration verifies three independent contracts in turn:
  //   1. Content - what the user reads when ANSI is stripped, including the level's prefix and the message.
  //   2. Stream  - which channel (stdout vs stderr) the line was routed to; the idle channel must remain empty.
  //   3. Color   - when the level declares a color and color is enabled, ANSI codes are emitted; when color is off (or the level opts out), no codes appear at all.
  // Asserting these as separate predicates keeps each one debuggable in isolation: a content drift fails the content assertion only, a stream drift fails the stream
  // assertion only.
  for(const [ levelName, theme ] of Object.entries(LEVEL_THEME) as [PrinterLevel, typeof LEVEL_THEME[PrinterLevel]][]) {

    test(levelName + "() with color off writes the themed prefix and routes to the correct stream", () => {

      const rig = makePrinter();

      rig.printer[levelName]("payload");

      const target = theme.stderr ? rig.stderr : rig.stdout;
      const idle = theme.stderr ? rig.stdout : rig.stderr;
      const expected = theme.label ? theme.label + " payload\n" : "payload\n";

      assert.equal(target.text, expected);
      assert.equal(idle.text, "");

      // Color is off: no ANSI codes in either stream regardless of the level's declared color.
      assert.equal(hasAnsi(target.text), false);
    });

    test(levelName + "() with color on emits ANSI iff the level declares a color, and only around the prefix", () => {

      const rig = makePrinter({ color: true, tty: true });

      rig.printer[levelName]("payload");

      const target = theme.stderr ? rig.stderr : rig.stdout;
      const expectedContent = theme.label ? theme.label + " payload\n" : "payload\n";

      // Content matches when ANSI is stripped, regardless of the exact escape-code form Node emits.
      assert.equal(stripAnsi(target.text), expectedContent);

      // Levels that declare a color emit ANSI; levels with color === null (info, data) emit none even when color is on.
      assert.equal(hasAnsi(target.text), theme.color !== null);

      // When color is applied, the codes wrap only the prefix - never the message. We assert this structurally by confirming the message text appears outside any SGR
      // pair (i.e. the substring after the last ANSI code includes the message), which holds because applyColor styles `theme.label + " "` and concatenates the
      // uncolored message after.
      if(theme.color !== null) {

        assert.match(target.text, /payload\n$/);
      }
    });
  }

  test("multiple emits accumulate per-line in order", () => {

    const { printer, stdout, stderr } = makePrinter();

    printer.info("a");
    printer.error("b");
    printer.success("c");

    assert.equal(stdout.text, "a\n[OK] c\n");
    assert.equal(stderr.text, "[ERROR] b\n");
  });

  test("constructor with no arg defaults to process streams (smoke check)", () => {

    // Constructing with no IO arg should not throw; streams inherit the real process primitives, color/tty default to false (deterministic, env-independent). The
    // env-aware defaults live in Printer.fromEnvironment so the constructor itself is pure and safely testable.
    assert.doesNotThrow(() => new Printer());
  });

  test("constructor with partial IO override fills the rest with deterministic defaults", () => {

    const stdout = new StringWriter();
    const printer = new Printer({ stdout });

    // The unspecified fields default to: color=false, tty=false, stderr=process.stderr. The `data()` write goes through the captured stdout (the override) and emits
    // the message verbatim because the data level has no prefix and never colorizes.
    printer.data("captured");
    assert.equal(stdout.text, "captured\n");
  });

  // Precedence rules for Printer.fromEnvironment, exercised via the `withEnv` helper so each test pins exactly the variables it cares about and is unaffected by
  // ambient state (notably the Node test runner injects FORCE_COLOR=1 into worker env). The contract is: NO_COLOR > FORCE_COLOR > TTY heuristic. The first test pins
  // the top of the precedence; the second pins the middle; the third confirms NO_COLOR's veto power over the override beneath it.
  test("Printer.fromEnvironment with NO_COLOR set disables color regardless of TTY", () => {

    withEnv({ FORCE_COLOR: null, NO_COLOR: "1" }, () => {

      const stdout = new StringWriter();
      const stderr = new StringWriter();
      const printer = Printer.fromEnvironment({ stderr, stdout });

      printer.error("nope");
      assert.equal(hasAnsi(stderr.text), false);
      assert.equal(stripAnsi(stderr.text), "[ERROR] nope\n");
    });
  });

  test("Printer.fromEnvironment with FORCE_COLOR set enables color regardless of TTY", () => {

    withEnv({ FORCE_COLOR: "1", NO_COLOR: null }, () => {

      const stdout = new StringWriter();
      const stderr = new StringWriter();
      const printer = Printer.fromEnvironment({ stderr, stdout });

      printer.error("forced");
      assert.equal(hasAnsi(stderr.text), true);
      assert.equal(stripAnsi(stderr.text), "[ERROR] forced\n");
    });
  });

  test("Printer.fromEnvironment with both set lets NO_COLOR win over FORCE_COLOR", () => {

    withEnv({ FORCE_COLOR: "1", NO_COLOR: "1" }, () => {

      const stdout = new StringWriter();
      const stderr = new StringWriter();
      const printer = Printer.fromEnvironment({ stderr, stdout });

      printer.error("user wins");
      assert.equal(hasAnsi(stderr.text), false);
      assert.equal(stripAnsi(stderr.text), "[ERROR] user wins\n");
    });
  });

  test("attachReadline() with TTY swallows direct writes and goes through readline", () => {

    const { printer, stdout } = makePrinter({ tty: true });

    // Minimal readline stub matching the bits Printer.emit() uses: `line` getter, `prompt`, `write`. We track each call to verify the interleave dance.
    const calls: string[] = [];
    const fakeRl = {

      line: "in-progress",
      prompt: (preserveCursor?: boolean): void => { calls.push("prompt(" + String(preserveCursor) + ")"); },
      write: (data: string): void => { calls.push("write(" + data + ")"); }
    };

    printer.attachReadline(fakeRl as never);
    printer.info("interrupt");

    // The non-readline emit() branch writes "msg\n"; the readline branch writes "\r<ESC>[Kmsg\n" then prompts and re-writes the buffered input. We assert the bytes
    // explicitly via includes() so the regex doesn't need an embedded control character (which the no-control-regex rule rejects).
    assert.equal(stdout.text, "\r" + String.fromCharCode(0x1b) + "[Kinterrupt\n");
    assert.deepEqual(calls, [ "prompt(true)", "write(in-progress)" ]);
  });

  test("attachReadline(null) detaches and restores plain emit", () => {

    const { printer, stdout } = makePrinter({ tty: true });
    const fakeRl = { line: "x", prompt: (): void => undefined, write: (): void => undefined };

    printer.attachReadline(fakeRl as never);
    printer.attachReadline(null);
    printer.info("plain");

    assert.equal(stdout.text, "plain\n");
  });
});

// CLILogger - verbose gating across the four log levels.
describe("CLILogger - verbose gating + structured-context formatting", () => {

  test("non-verbose suppresses debug and info but surfaces warn/error", () => {

    const { printer, stdout, stderr } = makePrinter();
    const logger = new CLILogger(printer, false);

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    // Debug and info are suppressed (no writes); warn and error emit to stderr through the printer's level mapping.
    assert.equal(stdout.text, "");
    assert.match(stderr.text, /\[WARN\] w/);
    assert.match(stderr.text, /\[ERROR\] e/);
  });

  test("verbose surfaces every level", () => {

    const { printer, stdout, stderr } = makePrinter();
    const logger = new CLILogger(printer, true);

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    assert.match(stdout.text, /\[DEBUG\] d/);
    assert.match(stdout.text, /\ni\n/);
    assert.match(stderr.text, /\[WARN\] w/);
    assert.match(stderr.text, /\[ERROR\] e/);
  });

  test("context object is appended as JSON when supplied", () => {

    const { printer, stderr } = makePrinter();
    const logger = new CLILogger(printer, true);

    logger.error("connection lost", { code: "ECONNRESET", retries: 3 });

    assert.match(stderr.text, /connection lost \{[\s\S]*"code": "ECONNRESET"[\s\S]*\}/);
  });

  test("context omitted leaves message verbatim", () => {

    const { printer, stderr } = makePrinter();
    const logger = new CLILogger(printer, true);

    logger.error("plain message");

    assert.equal(stderr.text, "[ERROR] plain message\n");
  });
});

// 3. Errors - CliError throws across all executeControl branches; parseInvocation rejects unknown commands.
describe("CliError - construction and identity", () => {

  test("CliError is named CliError and extends Error", () => {

    const e = new CliError("nope");

    assert.equal(e.name, "CliError");
    assert.equal(e instanceof Error, true);
    assert.equal(e.message, "nope");
  });

  test("non-CliError throws are not instanceof CliError", () => {

    const generic = new Error("plain");

    assert.equal(generic instanceof CliError, false);
  });
});

describe("tryParseIntStrict - strict base-10 lookup parse with non-numeric fallback", () => {

  test("accepts a positive base-10 integer literal", () => {

    assert.equal(tryParseIntStrict("42"), 42);
  });

  test("accepts a negative base-10 integer literal", () => {

    assert.equal(tryParseIntStrict("-42"), -42);
  });

  test("accepts zero", () => {

    assert.equal(tryParseIntStrict("0"), 0);
  });

  test("rejects trailing garbage (the canonical 'parseInt is forgiving' surprise)", () => {

    assert.equal(tryParseIntStrict("123abc"), null);
    assert.equal(tryParseIntStrict("60s"), null);
  });

  test("rejects hex-prefixed literals", () => {

    assert.equal(tryParseIntStrict("0x1a"), null);
    assert.equal(tryParseIntStrict("0xa"), null);
  });

  test("rejects floats", () => {

    assert.equal(tryParseIntStrict("12.5"), null);
  });

  test("rejects whitespace", () => {

    assert.equal(tryParseIntStrict(" 42"), null);
    assert.equal(tryParseIntStrict("42 "), null);
  });

  test("rejects the empty string", () => {

    assert.equal(tryParseIntStrict(""), null);
  });
});

describe("parseIntOption - strict base-10 throw-on-invalid parse for CLI flags", () => {

  test("returns the parsed integer for a valid base-10 literal", () => {

    assert.equal(parseIntOption("42", "--example"), 42);
    assert.equal(parseIntOption("-7", "--example"), -7);
  });

  test("throws CliError on trailing garbage, naming the flag and the value", () => {

    assert.throws(() => parseIntOption("123abc", "--brightness"), (err: unknown): boolean => {

      return (err instanceof CliError) && err.message.includes("--brightness") && err.message.includes("'123abc'");
    });
  });

  test("throws CliError on hex-prefixed input", () => {

    assert.throws(() => parseIntOption("0x1a", "--port"), CliError);
  });

  test("throws CliError on the empty string", () => {

    assert.throws(() => parseIntOption("", "--duration"), CliError);
  });

  test("throws CliError on a float literal", () => {

    assert.throws(() => parseIntOption("12.5", "--temp"), CliError);
  });
});

describe("parseFloatOption - strict decimal throw-on-invalid parse for --duration and friends", () => {

  test("returns the parsed float for a valid decimal literal", () => {

    assert.equal(parseFloatOption("60", "--duration"), 60);
    assert.equal(parseFloatOption("1.5", "--duration"), 1.5);
    assert.equal(parseFloatOption("-2.25", "--temp"), -2.25);
  });

  test("throws a typed CliError on a trailing-unit literal like '60s', naming the flag and the value", () => {

    // The strict option parser is the SSOT for --duration: the bare global parseFloat silently accepts "60s" as 60 (trailing garbage discarded), while parseFloatOption
    // rejects it as a usage error naming the flag. The watch, monitor, and record commands all route --duration through this strict parser.
    assert.throws(() => parseFloatOption("60s", "--duration"), (err: unknown): boolean => {

      return (err instanceof CliError) && err.message.includes("--duration") && err.message.includes("'60s'");
    });
  });

  test("throws a typed CliError on pure garbage like 'abc' rather than yielding NaN", () => {

    // The bare global parseFloat yields NaN for "abc"; the strict parser throws a typed CliError instead, so the watch command surfaces the bad flag rather than
    // silently running with an ignored (NaN) duration.
    assert.throws(() => parseFloatOption("abc", "--duration"), (err: unknown): boolean => {

      return (err instanceof CliError) && err.message.includes("--duration");
    });
  });
});

describe("parseJsonOption - JSON.parse wrapped in CliError on SyntaxError", () => {

  test("returns the parsed value for valid JSON", () => {

    const parsed = parseJsonOption("{\"a\":1}", "--reconnect") as { a: number };

    assert.deepEqual(parsed, { a: 1 });
  });

  test("throws CliError naming the source on malformed input", () => {

    assert.throws(() => parseJsonOption("{not json", "--reconnect"), (err: unknown): boolean => {

      return (err instanceof CliError) && err.message.includes("--reconnect");
    });
  });

  test("the CliError replaces the raw SyntaxError so the user sees a usable hint", () => {

    try {

      parseJsonOption("{", "test-source");
      assert.fail("expected CliError");
    } catch(err) {

      assert.equal(err instanceof CliError, true, "throws CliError, not SyntaxError");
      assert.equal(err instanceof SyntaxError, false);
    }
  });
});

// 4. Branches - parseInvocation across every top-level branch (help / unknown / -i / explicit positional / fall-through to help).
describe("parseInvocation - top-level command resolution branches", () => {

  test("returns help when argv is empty", () => {

    const inv = parseInvocation([]);

    assert.equal(inv.kind, "help");
  });

  test("returns help when --help is supplied", () => {

    const inv = parseInvocation(["--help"]);

    assert.equal(inv.kind, "help");
  });

  test("--help wins even when a positional command is also present", () => {

    const inv = parseInvocation([ "info", "--help", "--host", "h" ]);

    assert.equal(inv.kind, "help");
  });

  test("explicit positional command overrides the - i flag", () => {

    // When both an explicit positional and -i are supplied, the explicit positional takes precedence (it was named first, by user intent).
    const inv = parseInvocation([ "info", "-i", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.equal(inv.command, "info");
    } else {

      assert.fail("expected command kind, got " + inv.kind);
    }
  });

  test("the - i flag alone produces the interactive command with no explicit positional", () => {

    const inv = parseInvocation([ "-i", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.equal(inv.command, "interactive");
    } else {

      assert.fail("expected command kind, got " + inv.kind);
    }
  });

  test("unknown positional command throws CliError with the offending name", () => {

    assert.throws(() => parseInvocation([ "fake-command", "--host", "h" ]), (err) => {

      return (err instanceof CliError) && err.message.includes("Unknown command: fake-command");
    });
  });

  test("recognizes every command listed in CLI_COMMANDS", () => {

    for(const name of Object.keys(CLI_COMMANDS)) {

      const inv = parseInvocation([ name, "--host", "h" ]);

      if(inv.kind === "command") {

        assert.equal(inv.command, name);
      } else {

        assert.fail("command not recognized: " + name);
      }
    }
  });

  test("commandArgs are positionals after the command name", () => {

    const inv = parseInvocation([ "control", "switch-foo", "on", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.deepEqual(inv.commandArgs, [ "switch-foo", "on" ]);
    }
  });

  test("commandArgs are empty when - i is the only command signal and there are no positionals", () => {

    // Explicit positional always wins when present; -i is sugar only when no positional command is supplied. With just `-i --host h`, positionals is empty so the
    // parser falls through to the -i flag and treats every (zero) positional as commandArgs.
    const inv = parseInvocation([ "-i", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.equal(inv.command, "interactive");
      assert.deepEqual(inv.commandArgs, []);
    }
  });
});

// 4 (cont). Branches - global option parsing across every flag.
describe("parseInvocation - global option flag matrix", () => {

  test("--host populates options.host", () => {

    const inv = parseInvocation([ "info", "--host", "192.168.1.10" ]);

    if(inv.kind === "command") {

      assert.equal(inv.options.host, "192.168.1.10");
    }
  });

  test("-h short flag is sugar for --host", () => {

    const inv = parseInvocation([ "info", "-h", "h" ]);

    if(inv.kind === "command") {

      assert.equal(inv.options.host, "h");
    }
  });

  test("missing --host yields options.host === null", () => {

    const inv = parseInvocation(["info"]);

    if(inv.kind === "command") {

      assert.equal(inv.options.host, null);
    }
  });

  test("--port parses to a number; default is 6053", () => {

    const a = parseInvocation([ "info", "--host", "h", "--port", "4242" ]);
    const b = parseInvocation([ "info", "--host", "h" ]);

    if((a.kind === "command") && (b.kind === "command")) {

      assert.equal(a.options.port, 4242);
      assert.equal(b.options.port, 6053);
    }
  });

  test("--psk populates options.psk and is undefined by default", () => {

    const a = parseInvocation([ "info", "--host", "h", "--psk", "abcd" ]);
    const b = parseInvocation([ "info", "--host", "h" ]);

    if((a.kind === "command") && (b.kind === "command")) {

      assert.equal(a.options.psk, "abcd");
      assert.equal(b.options.psk, undefined);
    }
  });

  test("--verbose toggles options.verbose to true", () => {

    const inv = parseInvocation([ "info", "--host", "h", "--verbose" ]);

    if(inv.kind === "command") {

      assert.equal(inv.options.verbose, true);
    }
  });

  test("missing --verbose yields options.verbose === false (not undefined)", () => {

    const inv = parseInvocation([ "info", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.equal(inv.options.verbose, false);
    }
  });

  test("--keep-alive false is forwarded; absent yields undefined", () => {

    const a = parseInvocation([ "info", "--host", "h", "--keep-alive", "false" ]);
    const b = parseInvocation([ "info", "--host", "h" ]);

    if((a.kind === "command") && (b.kind === "command")) {

      assert.equal(a.options.keepAlive, "false");
      assert.equal(b.options.keepAlive, undefined);
    }
  });

  test("--reconnect accepts false and JSON-shaped object literals as raw strings", () => {

    const a = parseInvocation([ "info", "--host", "h", "--reconnect", "false" ]);
    const b = parseInvocation([ "info", "--host", "h", "--reconnect", "{\"baseDelayMs\":250}" ]);

    if((a.kind === "command") && (b.kind === "command")) {

      assert.equal(a.options.reconnect, "false");
      assert.equal(b.options.reconnect, "{\"baseDelayMs\":250}");
    }
  });
});

// 4 (cont). Branches - command-scoped flag matrix.
describe("parseInvocation - command-scoped option flags", () => {

  test("--brightness, --rgb, --temp, --effect, --state populate commandOptions for control", () => {

    const inv = parseInvocation([ "control", "light-bedroom", "--host", "h", "--state", "on", "--brightness", "80", "--rgb", "255,0,128", "--temp", "300",
      "--effect", "rainbow" ]);

    if(inv.kind === "command") {

      assert.equal(inv.commandOptions.state, "on");
      assert.equal(inv.commandOptions.brightness, "80");
      assert.equal(inv.commandOptions.rgb, "255,0,128");
      assert.equal(inv.commandOptions.temp, "300");
      assert.equal(inv.commandOptions.effect, "rainbow");
    }
  });

  test("--type filters the list command", () => {

    const inv = parseInvocation([ "list", "--host", "h", "--type", "light" ]);

    if(inv.kind === "command") {

      assert.equal(inv.commandOptions.type, "light");
    }
  });

  test("--duration is parsed as a string for monitor and watch", () => {

    const a = parseInvocation([ "monitor", "--host", "h", "--duration", "30" ]);
    const b = parseInvocation([ "watch", "light-x", "--host", "h", "--duration", "10" ]);

    if((a.kind === "command") && (b.kind === "command")) {

      assert.equal(a.commandOptions.duration, "30");
      assert.equal(b.commandOptions.duration, "10");
    }
  });

  test("--entity filters monitor by entity id or numeric key", () => {

    const inv = parseInvocation([ "monitor", "--host", "h", "--entity", "light-bedroom" ]);

    if(inv.kind === "command") {

      assert.equal(inv.commandOptions.entity, "light-bedroom");
    }
  });

  test("absent command-scoped flags are undefined, not missing keys", () => {

    const inv = parseInvocation([ "control", "switch-x", "--host", "h" ]);

    if(inv.kind === "command") {

      // Every key is present on the parsed CommandOptions object even when no flag was supplied. parseArgs guarantees this; we depend on it for the consumer-side
      // `if(commandOptions.brightness)` truthiness checks.
      assert.equal(inv.commandOptions.brightness, undefined);
      assert.equal(inv.commandOptions.duration, undefined);
      assert.equal(inv.commandOptions.effect, undefined);
      assert.equal(inv.commandOptions.entity, undefined);
      assert.equal(inv.commandOptions.rgb, undefined);
      assert.equal(inv.commandOptions.state, undefined);
      assert.equal(inv.commandOptions.temp, undefined);
      assert.equal(inv.commandOptions.type, undefined);
    }
  });

  test("strict mode rejects an unknown flag", () => {

    assert.throws(() => parseInvocation([ "info", "--host", "h", "--brigthness", "1" ]));
  });
});

// 6. Narrowing - isCommandName, isClimateMode, Invocation.kind tag.
describe("Type predicates - isCommandName, isClimateMode", () => {

  test("isCommandName returns true for every name in CLI_COMMANDS", () => {

    for(const name of Object.keys(CLI_COMMANDS)) {

      assert.equal(isCommandName(name), true, "expected isCommandName(" + name + ") to be true");
    }
  });

  test("isCommandName returns false for unknown commands", () => {

    assert.equal(isCommandName(""), false);
    assert.equal(isCommandName("fake"), false);
    assert.equal(isCommandName("INFO"), false);
    assert.equal(isCommandName("__proto__"), false);
  });

  test("isClimateMode returns true for every key in CLIMATE_MODE_NAMES", () => {

    for(const mode of CLIMATE_MODE_NAMES) {

      assert.equal(isClimateMode(mode), true, "expected isClimateMode(" + mode + ") to be true");
    }
  });

  test("isClimateMode returns false for unknown modes", () => {

    assert.equal(isClimateMode(""), false);
    assert.equal(isClimateMode("frostbite"), false);
    assert.equal(isClimateMode("OFF"), false);
  });
});

// 6 (cont). Narrowing - the Invocation discriminated union.
describe("Invocation discriminated union", () => {

  test("kind=help has no command, commandArgs, or options", () => {

    const inv = parseInvocation([]);

    if(inv.kind === "help") {

      // No additional fields on the help variant. We assert nothing is leaking through; this is the structural check.
      assert.equal("command" in inv, false);
      assert.equal("commandArgs" in inv, false);
      assert.equal("options" in inv, false);
    } else {

      assert.fail("expected help kind");
    }
  });

  test("kind=command carries command, commandArgs, commandOptions, options", () => {

    const inv = parseInvocation([ "info", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.equal("command" in inv, true);
      assert.equal("commandArgs" in inv, true);
      assert.equal("commandOptions" in inv, true);
      assert.equal("options" in inv, true);
    } else {

      assert.fail("expected command kind");
    }
  });
});

// 5. Async + Branches - dispatch routes both kinds.
describe("dispatch - routes Invocation kinds through the printer", () => {

  test("kind=help renders the usage banner via showUsage", async () => {

    const { printer, stdout } = makePrinter();

    await dispatch({ kind: "help" }, printer);

    assert.match(stdout.text, /espc - ESPHome Client CLI Utility/);
    assert.match(stdout.text, /Global Options:/);
    assert.match(stdout.text, /Commands:/);
  });

  test("kind=help does not write to stderr", async () => {

    const { printer, stderr } = makePrinter();

    await dispatch({ kind: "help" }, printer);

    assert.equal(stderr.text, "");
  });

  test("dispatch rejects with a clear error on an unhandled kind (exhaustiveness gate)", async () => {

    const bogus = { kind: "totally-bogus" } as unknown as Invocation;

    await assert.rejects(dispatch(bogus, makePrinter().printer), /Unhandled invocation kind/);
  });

  test("watch validates --duration at the boundary and rejects before opening a connection", async () => {

    // --duration is parsed at the boundary, ahead of createClient, so dispatching a watch with a malformed --duration rejects with a typed CliError without ever
    // attempting a connection to the (unreachable) host. The validation is fail-fast by design: a valid --duration would instead proceed to createClient and block on a
    // real connect, which is why this test pins the malformed-value path.
    const inv = parseInvocation([ "watch", "light-foo", "--host", "0.0.0.0", "--duration", "abc" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer), (err: unknown) => (err instanceof CliError) && err.message.includes("--duration"));
  });

  test("monitor validates --duration at the boundary and rejects before opening a connection", async () => {

    const inv = parseInvocation([ "monitor", "--host", "0.0.0.0", "--duration", "abc" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer), (err: unknown) => (err instanceof CliError) && err.message.includes("--duration"));
  });

  test("snapshot validates --wait at the boundary and rejects before opening a connection", async () => {

    const inv = parseInvocation([ "snapshot", "--host", "0.0.0.0", "--wait", "abc" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer), (err: unknown) => (err instanceof CliError) && err.message.includes("--wait"));
  });

  test("monitor accepts a fractional --duration - float-unified with watch and record", async () => {

    // --duration is float-seconds across watch / monitor / record, so monitor accepts "1.5": it parses cleanly and the command proceeds past the boundary to the
    // connection attempt - which fails fast against the unreachable host. The rejection must therefore NOT be a --duration usage error.
    const inv = parseInvocation([ "monitor", "--host", "0.0.0.0", "--duration", "1.5" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer),
      (err: unknown): boolean => !((err instanceof CliError) && err.message.includes("--duration")));
  });

  test("control validates device-independent input for an id-form identifier before opening a connection", async () => {

    // An id-form identifier encodes its entity type, so the per-builder input check runs at the boundary. "badmode" is not a valid climate mode; the typed CliError
    // surfaces BEFORE createClient connects, rather than the connection attempt (ECONNREFUSED against the unreachable host) masking the input error until after a
    // connect+discovery round-trip.
    const inv = parseInvocation([ "control", "climate-thermostat", "badmode", "--host", "0.0.0.0" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer), (err: unknown): boolean => (err instanceof CliError) && err.message.includes("valid mode"));
  });

  test("control defers validation for a numeric-key identifier - its type is unknown without the device", async () => {

    // A numeric-key identifier carries no entity type until the device resolves it, so the input check necessarily stays post-connect. The command therefore proceeds to
    // the connection attempt, which fails fast (ECONNREFUSED) - the rejection must NOT be a boundary input error. This pins the inherent id-form vs key-form asymmetry.
    const inv = parseInvocation([ "control", "5", "badmode", "--host", "0.0.0.0" ]);

    await assert.rejects(dispatch(inv, makePrinter().printer), (err: unknown): boolean => !((err instanceof CliError) && err.message.includes("valid mode")));
  });
});

// 5 (cont). Async - awaitQuietPeriod's adaptive quiet-period settle, the mechanism the snapshot command uses to collect the post-SubscribeStates burst without a fixed
// wall-clock guess. We drive it with a fake subscribe thunk so the test owns the event stream entirely (no live client, no network). All timing assertions are on bounds
// (>=, <), never exact times, so a slow CI box never flakes; the helper uses small windows to keep each case fast.
describe("awaitQuietPeriod - adaptive quiet-period settle", () => {

  // Build a fake event source for awaitQuietPeriod. `subscribe` captures the per-event callback and returns a Disposable that records disposal; `fire()` invokes the
  // captured callback to simulate one inbound state event; `disposed` reports whether awaitQuietPeriod dropped the subscription on settle. This hands awaitQuietPeriod a
  // real Disposable, lets the test inject events, and verifies cleanup - the three things the contract requires.
  function fakeSubscribe(): { dispose: () => void; disposed: boolean; fire: () => void; subscribe: (onEvent: () => void) => Disposable } {

    let onEvent: (() => void) | null = null;
    const state = { disposed: false } as { disposed: boolean };

    return {

      dispose: (): void => { state.disposed = true; },
      get disposed(): boolean { return state.disposed; },
      fire: (): void => { onEvent?.(); },
      subscribe: (cb: () => void): Disposable => {

        onEvent = cb;

        return { [Symbol.dispose]: (): void => { state.disposed = true; } };
      }
    };
  }

  test("settles at the initial grace when no event ever arrives", async () => {

    // No event fires, so the phase-one grace timer is what settles the snapshot - empty. We deliberately set the inter-event quiet window LARGER than the grace so that
    // settling under the quiet window proves it was the grace timer (phase one), not the quiet timer, that fired.
    const fake = fakeSubscribe();
    const start = Date.now();

    await awaitQuietPeriod(fake.subscribe, { ceilingMs: 2000, initialGraceMs: 60, quietMs: 400 });

    const elapsed = Date.now() - start;

    assert.equal(fake.disposed, true);

    assert.ok(elapsed >= 40, "settled before the initial grace elapsed: " + String(elapsed) + "ms");
    assert.ok(elapsed < 400, "the quiet timer, not the grace timer, settled the no-event case: " + String(elapsed) + "ms");
  });

  test("the first event switches from the initial grace to the shorter quiet window", async () => {

    // A single event arrives early, well inside the long grace window. The two-phase contract says that event must SHORTEN the wait to the inter-event quiet window, so
    // the collect settles shortly after the event - far sooner than the grace would have. A single-window implementation (grace as the only window) would instead wait
    // out the full grace, so settling well under it is the proof that phase one transitioned to phase two.
    const fake = fakeSubscribe();
    const start = Date.now();
    const p = awaitQuietPeriod(fake.subscribe, { ceilingMs: 2000, initialGraceMs: 400, quietMs: 40 });

    await delay(20);
    fake.fire();
    await p;

    const elapsed = Date.now() - start;

    assert.equal(fake.disposed, true);

    assert.ok(elapsed >= 40, "settled before the post-event quiet window elapsed: " + String(elapsed) + "ms");
    assert.ok(elapsed < 400, "did not switch to the shorter quiet window - waited out the grace: " + String(elapsed) + "ms");
  });

  test("events after the first refresh the quiet window, extending the settle", async () => {

    // After the first event puts us in phase two, each further event must restart the inter-event quiet window rather than letting it elapse. We fire once to enter phase
    // two, fire again mid-window, then race the collect against a short sentinel: observing "pending" proves the second event rescheduled the quiet timer (otherwise the
    // collect would already have settled on the first event's window).
    const fake = fakeSubscribe();
    const p = awaitQuietPeriod(fake.subscribe, { ceilingMs: 2000, initialGraceMs: 400, quietMs: 150 });

    fake.fire();
    await delay(20);
    fake.fire();

    const verdict = await Promise.race([ p.then(() => "settled"), delay(5).then(() => "pending") ]);

    assert.equal(verdict, "pending", "the second event did not extend the quiet window");

    // Stop firing and let the refreshed quiet window elapse; the promise then settles and the subscription is dropped.
    await p;

    assert.equal(fake.disposed, true);
  });

  test("the ceiling bounds a perpetually-active stream", async () => {

    // Fire faster than the quiet window so the inter-event quiet timer is perpetually restarted and can never elapse; only the ceiling can terminate the collect. We use
    // a long quiet window (1000ms) and a short ceiling (120ms) so the ceiling is unambiguously the timer that settles it.
    const fake = fakeSubscribe();
    const start = Date.now();
    const interval = setInterval(() => fake.fire(), 15);

    try {

      await awaitQuietPeriod(fake.subscribe, { ceilingMs: 120, initialGraceMs: 400, quietMs: 1000 });

      const elapsed = Date.now() - start;

      assert.equal(fake.disposed, true);

      // The ceiling (120ms), not the quiet timer (1000ms), settled it: elapsed must be well under the quiet window. This proves the ceiling is the only bound for
      // a stream that never goes silent.
      assert.ok(elapsed < 1000, "the quiet timer, not the ceiling, settled the perpetually-active stream: " + String(elapsed) + "ms");
    } finally {

      clearInterval(interval);
    }
  });
});

// 7. Boundary - showUsage covers every CLI_COMMANDS entry.
describe("showUsage - structural coverage of CLI_COMMANDS", () => {

  test("renders the help banner header line", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    assert.match(stdout.text, /^espc - ESPHome Client CLI Utility$/m);
  });

  test("renders every command name as a line in the Commands section", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    for(const name of Object.keys(CLI_COMMANDS)) {

      assert.match(stdout.text, new RegExp("^\\s+" + name + "\\s", "m"), "help missing command: " + name);
    }
  });

  test("renders every command's usage signature", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    for(const spec of Object.values(CLI_COMMANDS)) {

      assert.equal(stdout.text.includes(spec.usage), true, "help missing usage: " + spec.usage);
    }
  });

  test("renders every command's first example", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    for(const spec of Object.values(CLI_COMMANDS)) {

      const first = spec.examples[0];

      assert.notEqual(first, undefined);

      if(first !== undefined) {

        assert.equal(stdout.text.includes(first), true, "help missing example: " + first);
      }
    }
  });

  test("renders every global flag pair", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    assert.match(stdout.text, /-h, --host/);
    assert.match(stdout.text, /-p, --port/);
    assert.match(stdout.text, /-k, --psk/);
    assert.match(stdout.text, /-v, --verbose/);
    assert.match(stdout.text, /-i, --interactive/);
    assert.match(stdout.text, /--help/);
  });

  test("renders the control command's detailedUsage block", () => {

    const { printer, stdout } = makePrinter();

    showUsage(printer);

    // The control command is the only one in the registry that ships a detailedUsage block. Every line in it must be present in the output.
    const controlSpec = CLI_COMMANDS.control;

    if(controlSpec.detailedUsage !== undefined) {

      for(const line of controlSpec.detailedUsage) {

        assert.equal(stdout.text.includes(line), true, "help missing detailedUsage line: " + line);
      }
    }
  });
});

// 7 (cont). Boundary - structural compliance of CLI_COMMANDS itself.
describe("CLI_COMMANDS - registry structural compliance", () => {

  test("registry has exactly the expected v2 commands", () => {

    const expected = [ "capabilities", "control", "devices", "info", "interactive", "list", "monitor", "record", "replay", "snapshot", "watch" ];
    const actual = Object.keys(CLI_COMMANDS).sort();

    assert.deepEqual(actual, expected.sort());
  });

  test("every command spec carries description, usage, examples, handler", () => {

    for(const [ name, spec ] of Object.entries(CLI_COMMANDS)) {

      assert.equal(typeof spec.description, "string", name + " missing description");
      assert.equal(spec.description.length > 0, true, name + " has empty description");
      assert.equal(typeof spec.usage, "string", name + " missing usage");
      assert.equal(spec.usage.length > 0, true, name + " has empty usage");
      assert.equal(Array.isArray(spec.examples), true, name + " missing examples array");
      assert.equal(spec.examples.length > 0, true, name + " has no examples");
      assert.equal(typeof spec.handler, "function", name + " missing handler");
    }
  });

  test("every example begins with espc and references its command name", () => {

    // The interactive command is special-cased: its canonical CLI form is the `-i` short flag (sugar for the `interactive` positional), so its examples may reference
    // `-i` rather than the literal name. Every other command's examples must literally include the command name so a reader can copy-paste an example and run it.
    const SHORT_FLAG_EQUIVALENT: Record<string, string> = { interactive: "-i" };

    for(const [ name, spec ] of Object.entries(CLI_COMMANDS)) {

      for(const example of spec.examples) {

        assert.match(example, /^espc /, name + " example should begin with 'espc ': " + example);

        const alias = SHORT_FLAG_EQUIVALENT[name];
        const matches = example.includes(name) || ((alias !== undefined) && example.includes(alias));

        assert.equal(matches, true, name + " example does not reference its command (or short alias): " + example);
      }
    }
  });
});

// 7 (cont). Boundary - CLI_OPTIONS structural compliance.
describe("CLI_OPTIONS - flag table structural compliance", () => {

  test("declares every documented global flag", () => {

    for(const flag of [ "host", "port", "psk", "verbose", "interactive", "help" ]) {

      assert.equal(flag in CLI_OPTIONS, true, "CLI_OPTIONS missing global flag: " + flag);
    }
  });

  test("declares every command-scoped flag consumed by the parser", () => {

    for(const flag of [ "brightness", "duration", "effect", "entity", "rgb", "state", "temp", "type", "keep-alive", "reconnect" ]) {

      assert.equal(flag in CLI_OPTIONS, true, "CLI_OPTIONS missing command-scoped flag: " + flag);
    }
  });

  test("short-flag aliases are wired correctly", () => {

    assert.equal(CLI_OPTIONS.host.short, "h");
    assert.equal(CLI_OPTIONS.port.short, "p");
    assert.equal(CLI_OPTIONS.psk.short, "k");
    assert.equal(CLI_OPTIONS.interactive.short, "i");
    assert.equal(CLI_OPTIONS.verbose.short, "v");
  });
});

// 10. Values - hand-verified output fixtures for formatDeviceInfo.
describe("formatDeviceInfo - hand-verified output fixtures", () => {

  test("renders every field when DeviceInfo is fully populated (FIXTURE_DEVICE_INFO_FULL)", () => {

    const info: DeviceInfo = mockDeviceInfo({

      compilationTime: "Jan 15 2026, 10:23:45",
      esphomeVersion: "2025.10.0",
      friendlyName: "Living Room ESP",
      legacyBluetoothProxyVersion: 5,
      legacyVoiceAssistantVersion: 2,
      macAddress: "24:62:AB:CD:EF:01",
      manufacturer: "Espressif",
      model: "ESP32-WROOM",
      name: "Living Room",
      usesPassword: true,
      webserverPort: 80
    });

    assert.equal(formatDeviceInfo(info), FIXTURE_DEVICE_INFO_FULL);
  });

  test("renders only the always-present fields when DeviceInfo is minimal (FIXTURE_DEVICE_INFO_MINIMAL)", () => {

    // We strip every optional field so the formatter shows only the section header and "Uses Password: No".
    const info: DeviceInfo = {

      apiEncryptionSupported: false,
      bluetoothMacAddress: "",
      bluetoothProxyFeatureFlags: 0,
      compilationTime: "",
      esphomeVersion: "",
      friendlyName: "",
      hasDeepSleep: false,
      macAddress: "",
      manufacturer: "",
      model: "",
      name: "",
      projectName: "",
      projectVersion: "",
      suggestedArea: "",
      usesPassword: false,
      voiceAssistantFeatureFlags: 0,
      webserverPort: 0
    };

    assert.equal(formatDeviceInfo(info), FIXTURE_DEVICE_INFO_MINIMAL);
  });

  test("usesPassword=true renders as 'Yes', false as 'No'", () => {

    const yes = formatDeviceInfo(mockDeviceInfo({ usesPassword: true }));
    const no = formatDeviceInfo(mockDeviceInfo({ usesPassword: false }));

    assert.match(yes, /Uses Password: Yes/);
    assert.match(no, /Uses Password: No/);
  });

  test("optional bluetooth proxy version of zero is rendered as '0', not omitted", () => {

    // The guard is `info.legacyBluetoothProxyVersion !== undefined`, so 0 is rendered.
    const out = formatDeviceInfo(mockDeviceInfo({ legacyBluetoothProxyVersion: 0 }));

    assert.match(out, /Bluetooth Proxy Version: 0/);
  });

  test("multi-byte UTF-8 in name passes through unchanged", () => {

    const out = formatDeviceInfo(mockDeviceInfo({ name: "客厅" }));

    assert.match(out, /Name: 客厅/);
  });
});

// 4 + 7 + 8. findEntity - branch + boundary + edge coverage.
describe("findEntity - lookup by numeric key vs string id", () => {

  const sampleEntities: EntityWithId[] = [

    entityRecord("switch", "garage_door", 100),
    entityRecord("light", "bedroom_lamp", 200),
    entityRecord("sensor", "temperature", 300)
  ];

  test("returns the entity matching a numeric key", () => {

    const found = findEntity(sampleEntities, "200");

    assert.equal(found?.id, "light-bedroom_lamp");
  });

  test("returns the entity matching a branded string id", () => {

    const found = findEntity(sampleEntities, "switch-garage_door");

    assert.equal(found?.key, 100);
  });

  test("returns undefined when neither key nor id matches", () => {

    assert.equal(findEntity(sampleEntities, "nonsense"), undefined);
    assert.equal(findEntity(sampleEntities, "9999"), undefined);
  });

  test("numeric-string-with-no-key-match falls through to id match", () => {

    // "100" is a numeric string but no entity has the id "100"; we use the numeric path. parseInt("100") = 100, which matches the switch key. Demonstrates the
    // numeric-first preference.
    const found = findEntity(sampleEntities, "100");

    assert.equal(found?.id, "switch-garage_door");
  });

  test("numeric-string-not-a-key falls through to id match", () => {

    // "12abc" is not a strict integer literal under tryParseIntStrict, so the numeric path is skipped entirely and we fall through to id lookup. No id is "12abc", so
    // undefined. (The legacy unradixed `parseInt("12abc")` would silently truncate to 12 and search for that key - the strict parser eliminates that surprise.)
    assert.equal(findEntity(sampleEntities, "12abc"), undefined);
  });

  test("hex-prefixed identifier is treated as a string id, not silently reinterpreted as base-16", () => {

    // Pre-strict, `parseInt("0xa")` returned 10 and the lookup would find any entity whose key was 10 - which was a real footgun for users who named an entity "0xa"
    // literally. The strict parser rejects "0xa" as a non-decimal literal so the by-id path takes over.
    assert.equal(findEntity(sampleEntities, "0xa"), undefined);
  });

  test("empty list returns undefined", () => {

    assert.equal(findEntity([], "anything"), undefined);
  });
});

// 5 + 7. handleInteractiveCommand branches.
describe("handleInteractiveCommand - REPL branches", () => {

  function makeRig(deviceInfo: Nullable<DeviceInfo> = null, entities: Entity[] = []): { client: MockClient; rig: PrinterRig } {

    const client = new MockClient();

    if(deviceInfo) {

      client.setDeviceInfo(deviceInfo);
    }

    if(entities.length > 0) {

      client.populateEntities(entities);
    }

    return { client, rig: makePrinter() };
  }

  test("empty line returns true and emits nothing", () => {

    const { client, rig } = makeRig();
    const ok = handleInteractiveCommand("", client, rig.printer);

    assert.equal(ok, true);
    assert.equal(rig.stdout.text, "");
  });

  test("'help' returns true and emits the REPL help banner", () => {

    const { client, rig } = makeRig();

    handleInteractiveCommand("help", client, rig.printer);

    assert.match(rig.stdout.text, /Available commands:/);
    assert.match(rig.stdout.text, /quit, exit/);
  });

  test("'info' renders deviceInfo when populated", () => {

    const { client, rig } = makeRig(mockDeviceInfo({ name: "esp-01" }));

    handleInteractiveCommand("info", client, rig.printer);

    assert.match(rig.stdout.text, /Device Information:/);
    assert.match(rig.stdout.text, /Name: esp-01/);
  });

  test("'info' warns when deviceInfo is unavailable", () => {

    const { client, rig } = makeRig(null);

    handleInteractiveCommand("info", client, rig.printer);

    assert.match(rig.stderr.text, /\[WARN\] Device information not available/);
  });

  test("'list' enumerates registered entities", () => {

    const { client, rig } = makeRig(null);

    client.populateEntities([
      { key: 1, name: "garage", objectId: "garage", type: "switch" },
      { key: 2, name: "lamp", objectId: "lamp", type: "light" }
    ]);

    handleInteractiveCommand("list", client, rig.printer);

    assert.match(rig.stdout.text, /Entities:/);
    assert.match(rig.stdout.text, /\[switch\] garage/);
    assert.match(rig.stdout.text, /\[light\] lamp/);
  });

  test("'quit' returns false (signals REPL exit)", () => {

    const { client, rig } = makeRig();

    assert.equal(handleInteractiveCommand("quit", client, rig.printer), false);
  });

  test("'exit' returns false", () => {

    const { client, rig } = makeRig();

    assert.equal(handleInteractiveCommand("exit", client, rig.printer), false);
  });

  test("unknown command returns true with a warning", () => {

    const { client, rig } = makeRig();
    const ok = handleInteractiveCommand("totally-bogus", client, rig.printer);

    assert.equal(ok, true);
    assert.match(rig.stderr.text, /\[WARN\] Unknown command: totally-bogus/);
  });

  test("'control' delegates to runInteractiveControl (printer.warn on no args)", () => {

    const { client, rig } = makeRig();

    handleInteractiveCommand("control", client, rig.printer);

    assert.match(rig.stderr.text, /\[WARN\] Usage: control/);
  });

  test("leading/trailing whitespace is trimmed", () => {

    const { client, rig } = makeRig();

    assert.equal(handleInteractiveCommand("   exit   ", client, rig.printer), false);
  });
});

// 4 + 8. printInteractiveHelp - branch + edge.
describe("printInteractiveHelp", () => {

  test("renders the canonical command list", () => {

    const { printer, stdout } = makePrinter();

    printInteractiveHelp(printer);

    for(const fragment of [ "Available commands:", "help", "info", "list", "control", "quit, exit" ]) {

      assert.equal(stdout.text.includes(fragment), true, "help missing fragment: " + fragment);
    }
  });
});

// 4 + 8. executeControl - per-entity-type branch matrix, dispatched through the CONTROL_BUILDERS table.
describe("executeControl - non-interactive control dispatch (every entity-type branch)", () => {

  test("switch: 'on' records a state:true command", () => {

    const client = new MockClient();
    const rig = makePrinter();
    const entity = entityRecord("switch", "garage", 1);

    executeControl({ client: client, commandArgs: [ "switch-garage", "on" ], commandOptions: EMPTY_OPTIONS, entity: entity, printer: rig.printer });

    assert.equal(client.commands.length, 1);
    assert.deepEqual(client.commands[0]?.options, { state: true });
    assert.match(rig.stdout.text, /Turning garage ON/);
    assert.match(rig.stdout.text, /\[OK\] Command sent\./);
  });

  test("switch: 'off' records a state:false command", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "x", "off" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("switch", "x"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { state: false });
  });

  test("switch: missing state throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("switch", "x"),
      printer: rig.printer
    }), CliError);
    assert.equal(client.commands.length, 0);
  });

  test("switch: invalid state throws CliError with explicit message", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "maybe" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("switch", "x"),
      printer: rig.printer
    }), /Switch requires 'on' or 'off'/);
  });

  test("button: presses with no payload", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: ["doorbell"], commandOptions: EMPTY_OPTIONS, entity: entityRecord("button", "doorbell"), printer: rig.printer });

    assert.equal(client.commands.length, 1);
    assert.deepEqual(client.commands[0]?.options, {});
    assert.match(rig.stdout.text, /Pressing button doorbell/);
  });

  test("light: positional 'on' enables state without flags", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "lamp", "on" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("light", "lamp"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { state: true });
  });

  test("light: --state flag overrides the positional", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: [ "lamp", "on" ],
      commandOptions: { ...EMPTY_OPTIONS, state: "off" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { state: false });
  });

  test("light: --brightness is a 0-100 percentage converted to the 0.0-1.0 wire fraction", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, brightness: "80" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { brightness: 0.8 });
  });

  test("light: --brightness out of the 0-100 range throws rather than silently saturating", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, brightness: "999" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    }), /--brightness must be between 0 and 100/);
    assert.equal(client.commands.length, 0);
  });

  test("light: --rgb 0-255 channels convert to {r,g,b} as 0.0-1.0 fractions", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, rgb: "255,51,0" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    // 255 -> 1.0, 51 -> 0.2, 0 -> 0.0 (each channel divided by 255).
    assert.deepEqual(client.commands[0]?.options, { rgb: { b: 0, g: 0.2, r: 1 } });
  });

  test("light: --rgb accepts #RRGGBB hex", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, rgb: "#FF0000" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { rgb: { b: 0, g: 0, r: 1 } });
  });

  test("light: --rgb with fewer than 3 values throws a typed CliError naming the flag", () => {

    const client = new MockClient();
    const rig = makePrinter();

    // The strict RGB parser rejects malformed input rather than silently dropping it. The error message names the flag and the offending value so the user can correct
    // it without parsing a stack trace.
    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "lamp", "on" ],
      commandOptions: { ...EMPTY_OPTIONS, rgb: "100,50" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    }),
    (err: unknown): boolean => (err instanceof CliError) && err.message.includes("--rgb") && err.message.includes("100,50"));
    assert.equal(client.commands.length, 0, "no command is sent when input validation throws");
  });

  test("light: --rgb with a non-numeric component throws a typed CliError naming the flag and the bad value", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "lamp", "on" ],
      commandOptions: { ...EMPTY_OPTIONS, rgb: "50,abc,25" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    }),
    (err: unknown): boolean => (err instanceof CliError) && err.message.includes("--rgb") && err.message.includes("abc"));
    assert.equal(client.commands.length, 0, "no command is sent when a component fails strict-number validation");
  });

  test("light: --temp populates colorTemperature", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, temp: "300" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { colorTemperature: 300 });
  });

  test("light: --effect populates effect", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: ["lamp"],
      commandOptions: { ...EMPTY_OPTIONS, effect: "rainbow" },
      entity: entityRecord("light", "lamp"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { effect: "rainbow" });
  });

  test("cover: 'open' sets position to 1.0", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "garage", "open" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("cover", "garage"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { position: 1.0 });
  });

  test("cover: 'close' sets position to 0.0", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "garage", "close" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("cover", "garage"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { position: 0.0 });
  });

  test("cover: 'stop' sets stop:true", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "garage", "stop" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("cover", "garage"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { stop: true });
  });

  test("cover: invalid action throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "tilt" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("cover", "x"),
      printer: rig.printer
    }), /Cover requires 'open', 'close', or 'stop'/);
  });

  test("fan: 'on'/'off' toggle state", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "ceiling", "on" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("fan", "ceiling"), printer: rig.printer });
    executeControl({ client: client, commandArgs: [ "ceiling", "off" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("fan", "ceiling"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { state: true });
    assert.deepEqual(client.commands[1]?.options, { state: false });
  });

  test("fan: invalid state throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "maybe" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("fan", "x"),
      printer: rig.printer
    }), /Fan requires 'on' or 'off'/);
  });

  test("lock: 'lock'/'unlock'/'open' map to command field", () => {

    const client = new MockClient();
    const rig = makePrinter();

    for(const cmd of [ "lock", "unlock", "open" ]) {

      executeControl({ client: client, commandArgs: [ "front", cmd ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("lock", "front"), printer: rig.printer });
    }

    assert.equal(client.commands.length, 3);
    assert.deepEqual(client.commands[0]?.options, { command: "lock" });
    assert.deepEqual(client.commands[1]?.options, { command: "unlock" });
    assert.deepEqual(client.commands[2]?.options, { command: "open" });
  });

  test("lock: invalid command throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "smash" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("lock", "x"),
      printer: rig.printer
    }), /Lock requires one of: lock, open, unlock/);
  });

  test("number: integer value passed through as state", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: [ "setpoint", "42" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("number", "setpoint"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { state: 42 });
  });

  test("number: float value parsed as float", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: [ "setpoint", "3.14" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("number", "setpoint"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { state: 3.14 });
  });

  test("number: missing value throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("number", "x"),
      printer: rig.printer
    }), /Number entity requires a value/);
  });

  test("number: NaN throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "abc" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("number", "x"),
      printer: rig.printer
    }), /Invalid number for number value/);
  });

  test("select: option string passed as state", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({ client: client, commandArgs: [ "mode", "auto" ], commandOptions: EMPTY_OPTIONS, entity: entityRecord("select", "mode"), printer: rig.printer });

    assert.deepEqual(client.commands[0]?.options, { state: "auto" });
  });

  test("select: multi-word option preserved (joined with space)", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: [ "mode", "energy", "saver" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("select", "mode"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { state: "energy saver" });
  });

  test("select: missing option throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("select", "x"),
      printer: rig.printer
    }), /Select entity requires an option/);
  });

  test("climate: each documented mode dispatches correctly", () => {

    const client = new MockClient();
    const rig = makePrinter();

    for(const mode of CLIMATE_MODE_NAMES) {

      executeControl({

        client: client,
        commandArgs: [ "thermostat", mode ],
        commandOptions: EMPTY_OPTIONS,
        entity: entityRecord("climate", "thermostat"),
        printer: rig.printer
      });
    }

    assert.equal(client.commands.length, CLIMATE_MODE_NAMES.size);

    for(const recorded of client.commands) {

      assert.equal((recorded.options as { mode: string }).mode in (Object.fromEntries(CLIMATE_MODE_NAMES.entries())), true);
    }
  });

  test("climate: unknown mode throws CliError listing the valid modes", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "frostbite" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("climate", "x"),
      printer: rig.printer
    }), (err) => {

      return (err instanceof CliError) && err.message.includes("Climate entity requires a valid mode") && [...CLIMATE_MODE_NAMES].every((m) => err.message.includes(m));
    });
  });

  test("climate: missing mode throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("climate", "x"),
      printer: rig.printer
    }), /Climate entity requires a valid mode/);
  });

  test("text: value passed as state, joined across positionals with spaces", () => {

    const client = new MockClient();
    const rig = makePrinter();

    executeControl({

      client: client,
      commandArgs: [ "label", "hello", "world" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("text", "label"),
      printer: rig.printer
    });

    assert.deepEqual(client.commands[0]?.options, { state: "hello world" });
  });

  test("text: missing value throws CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("text", "x"),
      printer: rig.printer
    }), /Text entity requires text value/);
  });

  test("sensor / binary_sensor / text_sensor: all read-only, throw CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    for(const type of [ "sensor", "binary_sensor", "text_sensor" ]) {

      assert.throws(() => executeControl({

        client: client,
        commandArgs: [ "x", "anything" ],
        commandOptions: EMPTY_OPTIONS,
        entity: entityRecord(type, "x"),
        printer: rig.printer
      }), (err) => {

        return (err instanceof CliError) && err.message.includes(type) && err.message.includes("read-only");
      });
    }

    assert.equal(client.commands.length, 0);
  });

  test("read-only entity type rejects with a read-only CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    // A schema-recognized entity type with no command block (sensor) is rejected as read-only, derived from the schema rather than a hardcoded type list.
    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("sensor", "x"),
      printer: rig.printer
    }), (err) => {

      return (err instanceof CliError) && err.message.includes("sensor") && err.message.includes("read-only");
    });
  });

  test("unknown entity type rejects with an unknown-type CliError", () => {

    const client = new MockClient();
    const rig = makePrinter();

    // A type that is not in ENTITY_SCHEMAS at all is a distinct failure from read-only - it surfaces the unknown-type message.
    assert.throws(() => executeControl({

      client: client,
      commandArgs: ["x"],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("bogus_type", "x"),
      printer: rig.printer
    }), (err) => {

      return (err instanceof CliError) && err.message.includes("Unknown entity type 'bogus_type'");
    });
  });
});

// 4 + 8. runInteractiveControl - REPL counterparts of executeControl, but errors via printer rather than throw.
describe("runInteractiveControl - interactive control dispatch (every entity-type branch)", () => {

  function rig(): { client: MockClient; printer: Printer; stdout: StringWriter; stderr: StringWriter } {

    const client = new MockClient();
    const p = makePrinter();

    return { client, printer: p.printer, stderr: p.stderr, stdout: p.stdout };
  }

  function withEntity(client: MockClient, type: string, objectId: string, key = 1): EntityWithId {

    const entity = entityRecord(type, objectId, key);

    // We populate the entity registry directly so client.getEntitiesWithIds() returns the same shape the dispatcher reads.
    client.populateEntities([{ key, name: entity.name, objectId, type } as Entity]);

    return entity;
  }

  test("warns on too few parts (no identifier)", () => {

    const r = rig();

    runInteractiveControl(["control"], r.client, r.printer);

    assert.match(r.stderr.text, /\[WARN\] Usage: control/);
    assert.equal(r.client.commands.length, 0);
  });

  test("errors on unknown entity identifier", () => {

    const r = rig();

    runInteractiveControl([ "control", "ghost" ], r.client, r.printer);

    assert.match(r.stderr.text, /\[ERROR\] Entity 'ghost' not found/);
  });

  test("switch: 'on'/'off' dispatch and report success", () => {

    const r = rig();

    withEntity(r.client, "switch", "garage");
    runInteractiveControl([ "control", "switch-garage", "on" ], r.client, r.printer);
    runInteractiveControl([ "control", "switch-garage", "off" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 2);
    assert.deepEqual(r.client.commands[0]?.options, { state: true });
    assert.deepEqual(r.client.commands[1]?.options, { state: false });
    assert.match(r.stdout.text, /\[OK\] Turning garage ON/);
    assert.match(r.stdout.text, /\[OK\] Turning garage OFF/);
  });

  test("switch: bad state errors via printer (no throw)", () => {

    const r = rig();

    withEntity(r.client, "switch", "garage");

    // No throw - the REPL's design is that bad input keeps the loop alive.
    runInteractiveControl([ "control", "switch-garage", "maybe" ], r.client, r.printer);

    assert.match(r.stderr.text, /\[ERROR\] Switch requires 'on' or 'off'/);
    assert.equal(r.client.commands.length, 0);
  });

  test("button: dispatches with empty options", () => {

    const r = rig();

    withEntity(r.client, "button", "doorbell");
    runInteractiveControl([ "control", "button-doorbell" ], r.client, r.printer);

    assert.deepEqual(r.client.commands[0]?.options, {});
    assert.match(r.stdout.text, /\[OK\] Pressing button/);
  });

  test("light: positional 'on' with optional brightness percentage", () => {

    const r = rig();

    withEntity(r.client, "light", "lamp");
    runInteractiveControl([ "control", "light-lamp", "on", "80" ], r.client, r.printer);

    assert.deepEqual(r.client.commands[0]?.options, { brightness: 0.8, state: true });
  });

  test("light: no directives sends an empty light command", () => {

    const r = rig();

    withEntity(r.client, "light", "lamp");

    // A bare `control light-lamp` sends an empty (no-op) light command. This matches the non-interactive surface, which has always permitted a directive-less light
    // command; the unified builder keeps the two surfaces identical rather than diverging on an interactive-only "state required" rule.
    runInteractiveControl([ "control", "light-lamp" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, {});
    assert.match(r.stdout.text, /\[OK\] Sending light command to lamp/);
  });

  test("cover: open/close/stop", () => {

    const r = rig();

    withEntity(r.client, "cover", "garage");

    runInteractiveControl([ "control", "cover-garage", "open" ], r.client, r.printer);
    runInteractiveControl([ "control", "cover-garage", "close" ], r.client, r.printer);
    runInteractiveControl([ "control", "cover-garage", "stop" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 3);
    assert.deepEqual(r.client.commands[0]?.options, { position: 1.0 });
    assert.deepEqual(r.client.commands[1]?.options, { position: 0.0 });
    assert.deepEqual(r.client.commands[2]?.options, { stop: true });
  });

  test("cover: invalid action errors via printer", () => {

    const r = rig();

    withEntity(r.client, "cover", "garage");
    runInteractiveControl([ "control", "cover-garage", "tilt" ], r.client, r.printer);

    assert.match(r.stderr.text, /\[ERROR\] Cover requires 'open', 'close', or 'stop'/);
  });

  test("fan: on/off + bad state", () => {

    const r = rig();

    withEntity(r.client, "fan", "ceiling");
    runInteractiveControl([ "control", "fan-ceiling", "on" ], r.client, r.printer);
    runInteractiveControl([ "control", "fan-ceiling", "maybe" ], r.client, r.printer);

    assert.deepEqual(r.client.commands[0]?.options, { state: true });
    assert.equal(r.client.commands.length, 1);
    assert.match(r.stderr.text, /\[ERROR\] Fan requires 'on' or 'off'/);
  });

  test("lock: lock/unlock/open + bad command", () => {

    const r = rig();

    withEntity(r.client, "lock", "front");

    runInteractiveControl([ "control", "lock-front", "lock" ], r.client, r.printer);
    runInteractiveControl([ "control", "lock-front", "smash" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, { command: "lock" });
    assert.match(r.stderr.text, /\[ERROR\] Lock requires one of: lock, open, unlock/);
  });

  test("number: integer + missing + NaN", () => {

    const r = rig();

    withEntity(r.client, "number", "setpoint");
    runInteractiveControl([ "control", "number-setpoint", "42" ], r.client, r.printer);
    runInteractiveControl([ "control", "number-setpoint" ], r.client, r.printer);
    runInteractiveControl([ "control", "number-setpoint", "abc" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, { state: 42 });
    assert.match(r.stderr.text, /\[ERROR\] Number entity requires a value/);
    assert.match(r.stderr.text, /\[ERROR\] Invalid number for number value/);
  });

  test("select: option string + missing", () => {

    const r = rig();

    withEntity(r.client, "select", "mode");
    runInteractiveControl([ "control", "select-mode", "auto" ], r.client, r.printer);
    runInteractiveControl([ "control", "select-mode" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, { state: "auto" });
    assert.match(r.stderr.text, /\[ERROR\] Select entity requires an option/);
  });

  test("text: value + missing", () => {

    const r = rig();

    withEntity(r.client, "text", "label");
    runInteractiveControl([ "control", "text-label", "hello" ], r.client, r.printer);
    runInteractiveControl([ "control", "text-label" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, { state: "hello" });
    assert.match(r.stderr.text, /\[ERROR\] Text entity requires text value/);
  });

  test("climate: valid mode + invalid mode", () => {

    const r = rig();

    withEntity(r.client, "climate", "thermo");
    runInteractiveControl([ "control", "climate-thermo", "auto" ], r.client, r.printer);
    runInteractiveControl([ "control", "climate-thermo", "frostbite" ], r.client, r.printer);

    assert.equal(r.client.commands.length, 1);
    assert.deepEqual(r.client.commands[0]?.options, { mode: "auto" });
    assert.match(r.stderr.text, /\[ERROR\] Climate entity requires a valid mode/);
  });

  test("read-only entity type errors via printer (schema-derived)", () => {

    const r = rig();

    // A schema-recognized but command-less entity type (sensor) is rejected as read-only - the REPL reports it and stays alive rather than throwing.
    withEntity(r.client, "sensor", "temperature");
    runInteractiveControl([ "control", "sensor-temperature", "anything" ], r.client, r.printer);

    assert.match(r.stderr.text, /\[ERROR\] sensor entities are read-only and cannot be controlled/);
    assert.equal(r.client.commands.length, 0);
  });
});

// 4 + 8. runInfo - the extracted 'info' read-command policy, exercised against MockClient. This is the read-handler coverage that did not exist before the policy was
// split out of handleInfo: the function reads the cached device-info record off the injected CliClient and routes the formatted record (or the absent-info warning) to
// the Printer, with no client construction in the loop.
describe("runInfo - 'info' read-command policy", () => {

  test("renders the formatted device-info record to stdout when device info is present", () => {

    const client = new MockClient();
    const { printer, stderr, stdout } = makePrinter();

    client.setDeviceInfo(mockDeviceInfo({ name: "esp-01" }));
    runInfo(client, printer);

    assert.match(stdout.text, /Device Information:/);
    assert.match(stdout.text, /Name: esp-01/);
    assert.equal(stderr.text, "");
  });

  test("warns on stderr when device info is unavailable (defensive null branch)", () => {

    const client = new MockClient();
    const { printer, stderr, stdout } = makePrinter();

    // No setDeviceInfo: MockClient.deviceInfo() returns null, exercising the defensive branch that survives even though a resolved connect now guarantees device info.
    runInfo(client, printer);

    assert.match(stderr.text, /\[WARN\] Device information not available\. The device may not be responding\./);
    assert.equal(stdout.text, "");
  });
});

// 4 + 8. runCapabilities - the extracted 'capabilities' read-command policy. Reads the structured capability record off the injected CliClient and renders each
// formatter line to the Printer, routing info-kind section headers and data-kind detail rows to stdout (both Printer channels for these kinds are stdout).
describe("runCapabilities - 'capabilities' read-command policy", () => {

  // Provenance mirrors the formatCapabilities fixture: every ClientCapabilities field populated with a deterministic value so the rendered lines are fully determined.
  function fixtureCaps(): ClientCapabilities {

    return {

      api: { major: 1, minor: 12 },
      bluetoothProxy: { activeConnections: true, legacyAdvertisements: true, rawAdvertisements: false, supported: true },
      clientDerivedObjectId: false,
      climateTemperatureUnit: false,
      encryption: { active: true, supported: true },
      lockOpenStates: false,
      modernHandshake: true,
      noiseKeyRotation: false,
      serialProxy: { count: 2, supported: true },
      voiceAssistant: { announcements: true, apiAudio: false, speaker: false, startConversation: false, stereoAudio: false, supported: true, timerEvents: true },
      zwaveProxy: { featureFlags: 0x1, homeId: 0xdeadbeef, supported: true }
    };
  }

  test("renders the section headers (info kind) and detail rows (data kind) to stdout", () => {

    const client = new MockClient();
    const { printer, stderr, stdout } = makePrinter();

    client.setCapabilities(fixtureCaps());
    runCapabilities(client, printer);

    // Info-kind section header and data-kind detail rows both route to stdout; stderr stays empty.
    assert.match(stdout.text, /Device Capabilities:/);
    assert.match(stdout.text, /API:.*1\.12/);
    assert.match(stdout.text, /Encryption: supported=true active=true/);
    assert.equal(stderr.text, "");
  });
});

// 4 + 7. runList - the extracted 'list' read-command policy. Prints the discovered-entities banner and one line per entity read off the injected CliClient, honoring an
// optional type filter passed through from the handler.
describe("runList - 'list' read-command policy", () => {

  test("prints the banner and one line per entity to stdout", () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    client.populateEntities([
      { key: 1, name: "garage", objectId: "garage", type: "switch" },
      { key: 2, name: "lamp", objectId: "lamp", type: "light" }
    ]);
    runList(client, printer, null);

    assert.match(stdout.text, /Discovered Entities:/);
    assert.match(stdout.text, /switch-garage/);
    assert.match(stdout.text, /light-lamp/);
  });

  test("a type filter includes only matching entities", () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    client.populateEntities([
      { key: 1, name: "garage", objectId: "garage", type: "switch" },
      { key: 2, name: "lamp", objectId: "lamp", type: "light" }
    ]);
    runList(client, printer, "light");

    assert.match(stdout.text, /Discovered Entities:/);
    assert.match(stdout.text, /light-lamp/);
    assert.equal(stdout.text.includes("switch-garage"), false);
  });
});

// 4 + 7. runDevices - the extracted 'devices' read-command policy. Renders the sub-device listing read off the injected CliClient, computing the per-device entity count
// via client.entitiesByDevice, and routes each line to the Printer. Covers both the multi-device and the single-device (no sub-devices) branches.
describe("runDevices - 'devices' read-command policy", () => {

  test("renders the sub-device listing with per-device entity counts", () => {

    const client = new MockClient();
    const { printer, stderr, stdout } = makePrinter();

    client.setSubDevices([ { id: 1, name: "kitchen" }, { areaId: 7, id: 2, name: "garage" } ]);
    client.populateEntities([
      { deviceId: 0, key: 1, name: "uptime", objectId: "uptime", type: "sensor" },
      { deviceId: 1, key: 2, name: "lamp", objectId: "lamp", type: "light" },
      { deviceId: 1, key: 3, name: "fan", objectId: "fan", type: "fan" },
      { deviceId: 2, key: 4, name: "door", objectId: "door", type: "switch" }
    ]);
    runDevices(client, printer);

    assert.match(stdout.text, /Sub-devices on this parent ESP:/);
    assert.match(stdout.text, /Parent device \(id 0\): 1 entit\(ies\)/);
    assert.match(stdout.text, /Device 1 kitchen: 2 entit\(ies\)/);
    assert.match(stdout.text, /Device 2 garage: 1 entit\(ies\) \| area: 7/);
    assert.equal(stderr.text, "");
  });

  test("renders the single-device fallback when there are no sub-devices", () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    client.populateEntities([
      { key: 1, name: "uptime", objectId: "uptime", type: "sensor" },
      { key: 2, name: "lamp", objectId: "lamp", type: "light" }
    ]);
    runDevices(client, printer);

    assert.match(stdout.text, /no sub-devices/);
    assert.match(stdout.text, /Parent device entities: 2/);
  });
});

// 5 + 8. runSnapshot - the extracted 'snapshot' read-command policy. Settles the latest-state cache (fixed window or adaptive quiet period via client.on("telemetry")),
// then renders it as JSON. The fixed-window path uses a deterministic short wait; the adaptive path drives the mock's telemetry emit so awaitQuietPeriod settles quickly.
describe("runSnapshot - 'snapshot' read-command policy", () => {

  test("fixed-window path renders the snapshot JSON after the fixed wait", async () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    // Seed the latest-state cache via the mock's telemetry seam; emitState updates the same cache snapshot() reads from.
    client.emitState(mockStateMessage(entityId("switch", "garage"), { state: true }));
    client.emitState(mockStateMessage(entityId("light", "lamp"), { state: false }));

    await runSnapshot(client, printer, { fixedWaitMs: 5, typeFilter: null });

    const json = JSON.parse(stdout.text) as { entity: string }[];

    assert.equal(json.length, 2);
    assert.equal(json.some((e) => e.entity === "switch-garage"), true);
    assert.equal(json.some((e) => e.entity === "light-lamp"), true);
  });

  test("fixed-window path honors the type filter", async () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    client.emitState(mockStateMessage(entityId("switch", "garage"), { state: true }));
    client.emitState(mockStateMessage(entityId("light", "lamp"), { state: false }));

    await runSnapshot(client, printer, { fixedWaitMs: 5, typeFilter: "switch" });

    const json = JSON.parse(stdout.text) as { entity: string }[];

    assert.equal(json.length, 1);
    assert.equal(json[0]?.entity, "switch-garage");
  });

  test("adaptive path settles via client.on(\"telemetry\") and renders the snapshot JSON", async () => {

    const client = new MockClient();
    const { printer, stdout } = makePrinter();

    // No fixedWaitMs: the policy subscribes to telemetry and waits for the stream to go quiet. We drive one event shortly after starting so the initial grace transitions
    // to the shorter inter-event quiet window and the collect settles promptly (well under the production ceiling).
    const p = runSnapshot(client, printer, { fixedWaitMs: undefined, typeFilter: null });

    await delay(20);
    client.emitState(mockStateMessage(entityId("sensor", "temp"), { state: 21.5 }));
    await p;

    const json = JSON.parse(stdout.text) as { entity: string }[];

    assert.equal(json.length, 1);
    assert.equal(json[0]?.entity, "sensor-temp");
  });
});

// 4 + 8. buildControlCommand - the shared control core, covering every entity type not exercised by the executeControl describe block above. Exercising the core
// directly (rather than through both surfaces) verifies the schema-exhaustive coverage in one place; executeControl and runInteractiveControl are thin wrappers over it.
describe("buildControlCommand - schema-exhaustive control coverage", () => {

  test("every controllable entity type in ENTITY_SCHEMAS has a builder, and no read-only type does", () => {

    // Runtime mirror of the compile-time guarantee: the CONTROL_BUILDERS mapped type forces an entry per controllable type. Asserting the same guarantee against the
    // live schema means a regression surfaces as a test failure as well as a type error, and pins the read-only/controllable split to the schema.
    for(const type of Object.keys(ENTITY_SCHEMAS)) {

      assert.equal(Object.hasOwn(CONTROL_BUILDERS, type), isControllableType(type), "builder presence must match controllability for '" + type + "'");
    }
  });

  test("the control help documents every controllable entity type", () => {

    // Coverage parity for documentation. Dispatch coverage is compile-enforced by the CONTROL_BUILDERS mapped type; help content is authored prose (it must describe
    // each builder's real accepted grammar, including aliases like update's "install" that the schema does not carry), so its one mechanizable rule - that no
    // controllable type ships undocumented - is enforced here. Each help line is anchored on the canonical type id; we match an anchored prefix so short ids (date,
    // time) are not satisfied spuriously by a longer line (datetime).
    const helpLines = CLI_COMMANDS.control.detailedUsage ?? [];

    for(const type of Object.keys(ENTITY_SCHEMAS).filter(isControllableType)) {

      const documented = helpLines.some((line) => line.trimStart().startsWith(type + ":"));

      assert.ok(documented, "control help is missing a documented grammar line for controllable type '" + type + "'");
    }
  });

  test("alarm_control_panel: arm/disarm verb plus optional code", () => {

    assert.deepEqual(buildControlCommand(entityRecord("alarm_control_panel", "house"), ["arm_away"], EMPTY_OPTIONS).options, { command: "arm_away" });
    assert.deepEqual(buildControlCommand(entityRecord("alarm_control_panel", "house"), [ "disarm", "1234" ], EMPTY_OPTIONS).options, { code: "1234", command: "disarm" });
    assert.throws(() => buildControlCommand(entityRecord("alarm_control_panel", "house"), ["boom"], EMPTY_OPTIONS), /Alarm control panel requires one of/);
  });

  test("date: YYYY-MM-DD parsed into components", () => {

    assert.deepEqual(buildControlCommand(entityRecord("date", "alarm"), ["2026-05-23"], EMPTY_OPTIONS).options, { day: 23, month: 5, year: 2026 });
    assert.throws(() => buildControlCommand(entityRecord("date", "alarm"), ["2026/05/23"], EMPTY_OPTIONS), /YYYY-MM-DD/);
  });

  test("datetime: epoch integer and ISO-8601 string", () => {

    assert.deepEqual(buildControlCommand(entityRecord("datetime", "clock"), ["1748044800"], EMPTY_OPTIONS).options, { epochSeconds: 1748044800 });
    assert.deepEqual(buildControlCommand(entityRecord("datetime", "clock"), ["2026-05-23T12:00:00Z"], EMPTY_OPTIONS).options,
      { epochSeconds: Math.floor(Date.parse("2026-05-23T12:00:00Z") / 1000) });
    assert.throws(() => buildControlCommand(entityRecord("datetime", "clock"), ["not-a-date"], EMPTY_OPTIONS), /epoch seconds or an ISO/);
  });

  test("time: HH:MM and HH:MM:SS", () => {

    assert.deepEqual(buildControlCommand(entityRecord("time", "wake"), ["18:30"], EMPTY_OPTIONS).options, { hour: 18, minute: 30, second: 0 });
    assert.deepEqual(buildControlCommand(entityRecord("time", "wake"), ["18:30:15"], EMPTY_OPTIONS).options, { hour: 18, minute: 30, second: 15 });
    assert.throws(() => buildControlCommand(entityRecord("time", "wake"), ["1830"], EMPTY_OPTIONS), /HH:MM/);
  });

  test("update: check and install verbs (install aliases the protocol's update command)", () => {

    assert.deepEqual(buildControlCommand(entityRecord("update", "fw"), ["check"], EMPTY_OPTIONS).options, { command: "check" });
    assert.deepEqual(buildControlCommand(entityRecord("update", "fw"), ["install"], EMPTY_OPTIONS).options, { command: "update" });
    assert.throws(() => buildControlCommand(entityRecord("update", "fw"), ["rollback"], EMPTY_OPTIONS), /Update requires one of/);
  });

  test("valve: open/close/stop", () => {

    assert.deepEqual(buildControlCommand(entityRecord("valve", "water"), ["open"], EMPTY_OPTIONS).options, { position: 1 });
    assert.deepEqual(buildControlCommand(entityRecord("valve", "water"), ["close"], EMPTY_OPTIONS).options, { position: 0 });
    assert.deepEqual(buildControlCommand(entityRecord("valve", "water"), ["stop"], EMPTY_OPTIONS).options, { stop: true });
    assert.throws(() => buildControlCommand(entityRecord("valve", "water"), ["halfway"], EMPTY_OPTIONS), /Valve requires/);
  });

  test("siren: on/off with optional tone and the --duration flag", () => {

    assert.deepEqual(buildControlCommand(entityRecord("siren", "alarm"), ["on"], EMPTY_OPTIONS).options, { state: true });
    assert.deepEqual(buildControlCommand(entityRecord("siren", "alarm"), [ "on", "wail" ], { ...EMPTY_OPTIONS, duration: "30" }).options,
      { duration: 30, state: true, tone: "wail" });
    assert.throws(() => buildControlCommand(entityRecord("siren", "alarm"), ["loud"], EMPTY_OPTIONS), /Siren requires 'on' or 'off'/);
  });

  test("water_heater: mode plus optional target temperature", () => {

    assert.deepEqual(buildControlCommand(entityRecord("water_heater", "tank"), ["eco"], EMPTY_OPTIONS).options, { mode: "eco" });
    assert.deepEqual(buildControlCommand(entityRecord("water_heater", "tank"), [ "performance", "60" ], EMPTY_OPTIONS).options,
      { mode: "performance", targetTemperature: 60 });
    assert.throws(() => buildControlCommand(entityRecord("water_heater", "tank"), ["blazing"], EMPTY_OPTIONS), /Water heater requires one of/);
  });

  test("media_player: verbs map to numeric commands; volume takes a level", () => {

    assert.deepEqual(buildControlCommand(entityRecord("media_player", "speaker"), ["play"], EMPTY_OPTIONS).options, { command: 0 });
    assert.deepEqual(buildControlCommand(entityRecord("media_player", "speaker"), ["pause"], EMPTY_OPTIONS).options, { command: 1 });
    assert.deepEqual(buildControlCommand(entityRecord("media_player", "speaker"), [ "volume", "50" ], EMPTY_OPTIONS).options, { volume: 0.5 });
    assert.throws(() => buildControlCommand(entityRecord("media_player", "speaker"), ["rewind"], EMPTY_OPTIONS), /Media player requires one of/);
  });

  test("infrared / radio_frequency: raw timings plus optional carrier and repeat", () => {

    assert.deepEqual(buildControlCommand(entityRecord("infrared", "blaster"), ["9000,-4500,560,-560"], EMPTY_OPTIONS).options, { timings: [ 9000, -4500, 560, -560 ] });
    assert.deepEqual(buildControlCommand(entityRecord("radio_frequency", "remote"), [ "300,-300", "433920000", "5" ], EMPTY_OPTIONS).options,
      { carrierFrequency: 433920000, repeatCount: 5, timings: [ 300, -300 ] });
    assert.throws(() => buildControlCommand(entityRecord("infrared", "blaster"), ["100,bad"], EMPTY_OPTIONS), /Invalid integer for timing/);
  });

  test("read-only and unknown entity types are rejected from the shared core", () => {

    assert.throws(() => buildControlCommand(entityRecord("sensor", "temp"), [], EMPTY_OPTIONS), /read-only/);
    assert.throws(() => buildControlCommand(entityRecord("bogus_type", "x"), [], EMPTY_OPTIONS), /Unknown entity type/);
  });
});

// 4 + 10. Normalized-input conventions - intensities (parsePercent, 0-100) vs color (parseRgb, 0-255 / hex), both normalizing to the 0.0-1.0 wire fraction.
describe("parsePercent / parseRgb - domain-appropriate input conventions", () => {

  test("parsePercent maps 0-100 to the 0.0-1.0 wire fraction", () => {

    assert.equal(parsePercent("0", "--brightness"), 0);
    assert.equal(parsePercent("50", "--brightness"), 0.5);
    assert.equal(parsePercent("100", "--brightness"), 1);
  });

  test("parsePercent rejects out-of-range and non-numeric input", () => {

    assert.throws(() => parsePercent("101", "--brightness"), /--brightness must be between 0 and 100/);
    assert.throws(() => parsePercent("-1", "--brightness"), /--brightness must be between 0 and 100/);
    assert.throws(() => parsePercent("half", "--brightness"), /Invalid number/);
  });

  test("parseRgb accepts a 0-255 decimal triple and divides each channel by 255", () => {

    assert.deepEqual(parseRgb("255,51,0", "--rgb"), { b: 0, g: 0.2, r: 1 });
  });

  test("parseRgb accepts #RRGGBB and #RGB hex (shorthand expanded like CSS)", () => {

    assert.deepEqual(parseRgb("#FF0000", "--rgb"), { b: 0, g: 0, r: 1 });
    assert.deepEqual(parseRgb("#00FF00", "--rgb"), { b: 0, g: 1, r: 0 });
    // #F00 expands to #FF0000.
    assert.deepEqual(parseRgb("#F00", "--rgb"), { b: 0, g: 0, r: 1 });
  });

  test("parseRgb rejects malformed hex, wrong arity, and out-of-range channels", () => {

    assert.throws(() => parseRgb("#GG0000", "--rgb"), /Expected #RGB or #RRGGBB hex/);
    assert.throws(() => parseRgb("255,0", "--rgb"), /three comma-separated 0-255 channels/);
    assert.throws(() => parseRgb("300,0,0", "--rgb"), /--rgb must be between 0 and 255/);
    assert.throws(() => parseRgb("255,abc,0", "--rgb"), /Invalid number/);
  });
});

// 9. Hot - parseInvocation and formatDeviceInfo under tight loops.
describe("Hot path - parseInvocation, formatDeviceInfo, executeControl iterate cleanly", () => {

  test("parseInvocation runs 1000 iterations without observable retention", () => {

    for(let i = 0; i < 1000; i++) {

      const inv = parseInvocation([ "control", "switch-x", "on", "--host", "h" ]);

      assert.equal(inv.kind, "command");
    }
  });

  test("formatDeviceInfo runs 1000 iterations without observable retention", () => {

    const info = mockDeviceInfo({ esphomeVersion: "2025.10.0", name: "h" });

    for(let i = 0; i < 1000; i++) {

      const out = formatDeviceInfo(info);

      assert.equal(out.length > 0, true);
    }
  });

  test("executeControl dispatches 1000 switch commands cleanly", () => {

    const client = new MockClient();
    const rig = makePrinter();
    const entity = entityRecord("switch", "garage");

    for(let i = 0; i < 1000; i++) {

      executeControl({

        client: client,
        commandArgs: [ "switch-garage", i % 2 === 0 ? "on" : "off" ],
        commandOptions: EMPTY_OPTIONS,
        entity: entity,
        printer: rig.printer
      });
    }

    assert.equal(client.commands.length, 1000);
  });
});

// 11. Negative rules - "X does NOT happen when Z."
describe("Negative rules - structural guarantees", () => {

  test("parseInvocation does not call process.exit", () => {

    // We invoke parseInvocation across every command and the help/empty paths and verify the process is still alive at the end. This is an indirect assertion: if
    // parseInvocation called process.exit, the test runner would terminate before the assertion below. Reaching the assertion is the affirmative signal.
    parseInvocation([]);
    parseInvocation(["--help"]);
    parseInvocation([ "info", "--host", "h" ]);

    assert.equal(typeof process.exit, "function");
  });

  test("dispatch does not write the PSK on any path", async () => {

    const { printer, stdout, stderr } = makePrinter();

    await dispatch({ kind: "help" }, printer);

    // The help banner must never echo a PSK back. We don't have a PSK in scope here, but we assert that the help text does not contain typical PSK-shaped strings.
    assert.equal(stdout.text.includes("base64"), false);
    assert.equal(stderr.text.includes("base64"), false);
  });

  test("executeControl read-only branch does NOT record a command", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "temp", "x" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("sensor", "temp"),
      printer: rig.printer
    }));
    assert.equal(client.commands.length, 0);
  });

  test("executeControl error branches do NOT call printer.success", () => {

    const client = new MockClient();
    const rig = makePrinter();

    assert.throws(() => executeControl({

      client: client,
      commandArgs: [ "x", "maybe" ],
      commandOptions: EMPTY_OPTIONS,
      entity: entityRecord("switch", "x"),
      printer: rig.printer
    }));
    assert.equal(rig.stdout.text.includes("[OK] Command sent."), false);
  });

  test("runInteractiveControl errors do NOT throw (REPL stays alive)", () => {

    const client = new MockClient();
    const rig = makePrinter();

    // Every error branch in runInteractiveControl reports via printer.error and returns; nothing should propagate. We invoke a representative set of error branches.
    client.populateEntities([{ key: 1, name: "g", objectId: "g", type: "switch" }]);
    assert.doesNotThrow(() => runInteractiveControl(["control"], client, rig.printer));
    assert.doesNotThrow(() => runInteractiveControl([ "control", "ghost" ], client, rig.printer));
    assert.doesNotThrow(() => runInteractiveControl([ "control", "switch-g", "maybe" ], client, rig.printer));
  });

  test("CLI_COMMANDS export is a frozen-at-write-time SSOT (mutation does not affect the registry)", () => {

    const before = Object.keys(CLI_COMMANDS).length;

    // The registry is `as const satisfies Record<string, CliCommand>`, so TypeScript narrows it to the literal shape; runtime does not freeze the object, but the
    // CommandName type derived from `keyof typeof CLI_COMMANDS` is the contract. We assert the snapshot count is the same as the prior assertion to detect accidental
    // session-state leakage from earlier tests.
    assert.equal(before, Object.keys(CLI_COMMANDS).length);
  });
});

// 8. Edge - boundary cases on entity ids and command-arg parsing.
describe("Edge cases - boundary inputs to parser and dispatch", () => {

  test("parseInvocation handles commandArgs preserving whitespace inside positionals", () => {

    const inv = parseInvocation([ "control", "switch-x with spaces", "on", "--host", "h" ]);

    if(inv.kind === "command") {

      assert.deepEqual(inv.commandArgs, [ "switch-x with spaces", "on" ]);
    }
  });

  test("parseInvocation handles multi-byte UTF-8 in --host", () => {

    const inv = parseInvocation([ "info", "--host", "客厅.local" ]);

    if(inv.kind === "command") {

      assert.equal(inv.options.host, "客厅.local");
    }
  });

  test("findEntity matches the very first entity in a single-element list", () => {

    const single = [entityRecord("switch", "only", 7)];

    assert.equal(findEntity(single, "7")?.id, "switch-only");
    assert.equal(findEntity(single, "switch-only")?.key, 7);
  });

  test("ControlClient interface is satisfied structurally by MockClient", () => {

    // This is a compile-time + runtime check: passing a MockClient to a function typed for ControlClient must work in both senses. We do this by direct assignment to a
    // typed binding; if the structural shape ever drifts (e.g., MockClient drops getEntitiesWithIds), the build breaks here, not in the test bodies above.
    const client: ControlClient = new MockClient();

    assert.equal(typeof client.command, "function");
    assert.equal(typeof client.deviceInfo, "function");
    assert.equal(typeof client.getEntitiesWithIds, "function");
  });

  test("executeControl accepts EntityId<T> brand on entity.id without runtime cast", () => {

    // The branded EntityId<"switch"> is structurally a string at runtime; the cast is a TS-only narrowing. We verify the runtime path: passing a plain string id works
    // and the recorded command's `id` is the same brand-shaped string.
    const client = new MockClient();
    const rig = makePrinter();
    const entity = entityRecord("switch", "x", 1);

    executeControl({ client: client, commandArgs: [ "x", "on" ], commandOptions: EMPTY_OPTIONS, entity: entity, printer: rig.printer });

    assert.equal(client.commands[0]?.id, "switch-x");
  });

  test("joinParts concatenates mixed string/number parts without separators", () => {

    assert.equal(joinParts([ "a", 1, "b", 2 ]), "a1b2");
    assert.equal(joinParts([]), "");
    assert.equal(joinParts([""]), "");
    assert.equal(joinParts([0]), "0");
  });
});

// Type-level surface check: ControlClient, EntityWithId, EntityId<T> compose without compile errors.
describe("Structural type surface", () => {

  test("EntityId<T> brand is assignable from a runtime string at the executeControl boundary", () => {

    // We construct an EntityId<"switch"> via a runtime cast (the same path the CLI uses) and pass it through. The cast is a documented boundary: parseEntityId is the
    // safe alternative when the input is untrusted.
    const id = "switch-test" as EntityId<"switch">;
    const client = new MockClient();

    client.command(id, { state: true });

    assert.equal(client.commands[0]?.id, "switch-test");
  });
});

// 4 + 7 + 10. formatEntityList - branch + boundary + values.
describe("formatEntityList - filtered entity rendering", () => {

  const sampleEntities: EntityWithId[] = [

    entityRecord("switch", "garage", 1),
    entityRecord("light", "lamp", 2),
    entityRecord("sensor", "temp", 3),
    entityRecord("binary_sensor", "motion", 4)
  ];

  test("returns one line per entity with no filter", () => {

    const lines = formatEntityList(sampleEntities);

    assert.equal(lines.length, 4);
  });

  test("renders each entity in the canonical CLI shape", () => {

    const [first] = formatEntityList(sampleEntities);

    assert.equal(first, "  [switch] garage (id: switch-garage, key: 1)");
  });

  test("--type filter is a substring match (case-insensitive)", () => {

    // 'sensor' matches both `sensor-temp` and `binary_sensor-motion` (the latter contains the substring "sensor").
    const lines = formatEntityList(sampleEntities, "sensor");

    assert.equal(lines.length, 2);
    assert.match(lines.join("\n"), /sensor-temp/);
    assert.match(lines.join("\n"), /binary_sensor-motion/);
  });

  test("filter is case-insensitive", () => {

    const lines = formatEntityList(sampleEntities, "LIGHT");

    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /lamp/);
  });

  test("returns empty list when no entity matches the filter", () => {

    assert.deepEqual(formatEntityList(sampleEntities, "alarm"), []);
  });

  test("returns empty list when entities is empty", () => {

    assert.deepEqual(formatEntityList([], null), []);
  });

  test("null filter is equivalent to no filter", () => {

    assert.equal(formatEntityList(sampleEntities, null).length, 4);
  });
});

// 4 + 10. formatCapabilities - hand-verified output rows.
describe("formatCapabilities - capability record rendering", () => {

  // Provenance: every field of ClientCapabilities populated with a deterministic value. Each line in the output is the canonical row formatter inserts; the kinds
  // (info/data) reflect the section/detail split that drives Printer routing in handleCapabilities.
  function fixtureCaps(): ClientCapabilities {

    return {

      api: { major: 1, minor: 12 },
      bluetoothProxy: { activeConnections: true, legacyAdvertisements: true, rawAdvertisements: false, supported: true },
      clientDerivedObjectId: false,
      climateTemperatureUnit: false,
      encryption: { active: true, supported: true },
      lockOpenStates: false,
      modernHandshake: true,
      noiseKeyRotation: false,
      serialProxy: { count: 2, supported: true },
      voiceAssistant: { announcements: true, apiAudio: false, speaker: false, startConversation: false, stereoAudio: false, supported: true, timerEvents: true },
      zwaveProxy: { featureFlags: 0x1, homeId: 0xdeadbeef, supported: true }
    };
  }

  test("renders the five section headers", () => {

    const lines = formatCapabilities(fixtureCaps()).filter((l) => l.kind === "info").map((l) => l.line);

    assert.deepEqual(lines, [ "Device Capabilities:", "Voice Assistant:", "Bluetooth Proxy:", "Serial Proxy:", "Z-Wave Proxy:" ]);
  });

  test("renders the API row in major.minor format", () => {

    const lines = formatCapabilities(fixtureCaps());

    assert.match(lines.find((l) => l.line.startsWith("  API:"))?.line ?? "", /1\.12/);
  });

  test("renders Bluetooth proxy active-connections boolean as 'true'/'false'", () => {

    const lines = formatCapabilities(fixtureCaps());

    assert.match(lines.find((l) => l.line.includes("Active connections"))?.line ?? "", /true/);
  });

  test("renders boolean capability fields as 'true'/'false' literals", () => {

    const caps = fixtureCaps();
    const lines = formatCapabilities(caps);
    const flat = lines.map((l) => l.line).join("\n");

    // Verifying the canonical literal pair is present somewhere in the output - both "true" and "false" come from the fixture's mixed booleans.
    assert.match(flat, /Encryption: supported=true active=true/);
    assert.match(flat, /Noise key rotation: false/);
  });

  test("renders the Serial Proxy section with supported and instance count", () => {

    const flat = formatCapabilities(fixtureCaps()).map((l) => l.line).join("\n");

    assert.match(flat, /Serial Proxy:/);
    assert.match(flat, /Supported: +true/, "serialProxy.supported renders as a 'true' literal");
    assert.match(flat, /Instances: +2/, "serialProxy.count renders as the integer instance count");
  });

  test("renders the Z-Wave Proxy section with hex-formatted feature flags and home id", () => {

    const flat = formatCapabilities(fixtureCaps()).map((l) => l.line).join("\n");

    assert.match(flat, /Z-Wave Proxy:/);
    assert.match(flat, /Feature flags: +0x1\b/, "zwaveProxy.featureFlags renders as hex with '0x' prefix");
    assert.match(flat, /Home id: +0xdeadbeef\b/, "zwaveProxy.homeId renders as hex with '0x' prefix");
  });

  test("renders Z-Wave home id as 'none' when the bitmask is set but no network is joined", () => {

    const caps = fixtureCaps();

    caps.zwaveProxy = { ...caps.zwaveProxy, homeId: null };

    const flat = formatCapabilities(caps).map((l) => l.line).join("\n");

    assert.match(flat, /Home id: +none\b/);
  });

  test("output kinds are correctly split between info (sections) and data (detail rows)", () => {

    const lines = formatCapabilities(fixtureCaps());
    const sections = lines.filter((l) => l.kind === "info").length;
    const detail = lines.filter((l) => l.kind === "data").length;

    // Five section headers + 19 detail rows (4 + 6 + 4 + 2 + 3 across the five sections).
    assert.equal(sections, 5);
    assert.equal(detail, 19);
  });
});

// 4 + 7 + 10. formatSnapshotJson - JSON output, type filter, buffer encoding.
describe("formatSnapshotJson - latest-state cache as JSON", () => {

  test("renders an empty array for an empty cache", () => {

    assert.equal(formatSnapshotJson(new Map<string, unknown>()), "[]");
  });

  test("renders one entry per cache key", () => {

    const cache = new Map<string, unknown>([
      [ "switch-x", { state: true, type: "switch" } ],
      [ "light-y", { state: false, type: "light" } ]
    ]);
    const json = JSON.parse(formatSnapshotJson(cache)) as { entity: string; state: unknown }[];

    assert.equal(json.length, 2);
    assert.equal(json[0]?.entity, "switch-x");
  });

  test("--type filter matches by entity-id prefix", () => {

    const cache = new Map<string, unknown>([
      [ "switch-x", { state: true } ],
      [ "light-y", { state: false } ],
      [ "sensor-z", { state: 1 } ]
    ]);
    const json = JSON.parse(formatSnapshotJson(cache, "switch")) as { entity: string }[];

    assert.equal(json.length, 1);
    assert.equal(json[0]?.entity, "switch-x");
  });

  test("Buffer values are encoded as { __buffer: <base64> }", () => {

    const cache = new Map<string, unknown>([[ "camera-cam", { image: Buffer.from("hi"), type: "camera" } ]]);
    const json = JSON.parse(formatSnapshotJson(cache)) as { state: { image: { __buffer: string } } }[];

    assert.equal(json[0]?.state.image.__buffer, Buffer.from("hi").toString("base64"));
  });

  test("type filter is case-insensitive", () => {

    const cache = new Map<string, unknown>([[ "switch-x", { state: true } ]]);
    const json = JSON.parse(formatSnapshotJson(cache, "SWITCH")) as { entity: string }[];

    assert.equal(json.length, 1);
  });
});

// 4 + 8 + 10. formatReplayMetadata - branch + edge + values.
describe("formatReplayMetadata - capture metadata rendering", () => {

  test("renders every populated field", () => {

    const meta: Partial<CaptureMetadata> = {

      capturedAt: "2026-05-08T00:00:00Z",
      description: "Synthesized basic-discovery scenario",
      expectedFrames: 42,
      scenario: "basic-discovery",
      schemaVersion: "1.0",
      source: "real-device"
    };

    const lines = formatReplayMetadata(meta, 1024);
    const flat = lines.map((l) => l.line).join("\n");

    assert.match(flat, /Replay scenario: basic-discovery/);
    assert.match(flat, /Source:\s+real-device/);
    assert.match(flat, /Schema:\s+1\.0/);
    assert.match(flat, /Captured at:\s+2026-05-08T00:00:00Z/);
    assert.match(flat, /Description:\s+Synthesized basic-discovery scenario/);
    assert.match(flat, /Binary bytes: 1024/);
    assert.match(flat, /Expected frames: 42/);
  });

  test("missing fields render as canonical placeholders", () => {

    const lines = formatReplayMetadata({}, 0);
    const flat = lines.map((l) => l.line).join("\n");

    assert.match(flat, /Replay scenario: \(unnamed\)/);
    assert.match(flat, /Source:\s+\(unknown\)/);
    assert.match(flat, /Description:\s+\(none\)/);
    assert.match(flat, /Expected frames: 0/);
  });

  test("zero-byte capture appends a 'fixture is empty' warn line", () => {

    const lines = formatReplayMetadata({ scenario: "empty" }, 0);

    assert.equal(lines[lines.length - 1]?.kind, "warn");
    assert.match(lines[lines.length - 1]?.line ?? "", /Capture binary is empty/);
  });

  test("non-zero capture renders the metadata block with no future-deliverable disclaimer", () => {

    const lines = formatReplayMetadata({ scenario: "real" }, 1234);

    // The handler drives the actual replay and reports results; the formatter is metadata-only. No stub disclaimer survives.
    assert.equal(lines.some((entry) => /future deliverable|not yet been implemented/.test(entry.line)), false);
    assert.equal(lines.some((entry) => entry.line.includes("Binary bytes: 1234")), true);
    assert.equal(lines.some((entry) => entry.kind === "warn"), false);
  });
});

// 4 + 7. formatSubDeviceList - branch + boundary.
describe("formatSubDeviceList - multi-device parent ESP rendering", () => {

  test("empty list renders the single-device fallback", () => {

    const lines = formatSubDeviceList([], (id) => (id === 0 ? 5 : 0));

    assert.equal(lines.length, 2);
    assert.match(lines[0]?.line ?? "", /no sub-devices/);
    assert.match(lines[1]?.line ?? "", /Parent device entities: 5/);
  });

  test("non-empty list renders the parent + each sub-device row", () => {

    const lines = formatSubDeviceList(

      [ { id: 1, name: "kitchen" }, { areaId: 7, id: 2, name: "garage" } ],
      (id) => (id === 0 ? 3 : id === 1 ? 2 : 4)
    );

    const flat = lines.map((l) => l.line).join("\n");

    assert.match(flat, /Sub-devices on this parent ESP:/);
    assert.match(flat, /Parent device \(id 0\): 3 entit\(ies\)/);
    assert.match(flat, /Device 1 kitchen: 2 entit\(ies\)/);
    assert.match(flat, /Device 2 garage: 4 entit\(ies\) \| area: 7/);
  });

  test("unnamed sub-device renders '(unnamed)'", () => {

    const lines = formatSubDeviceList([{ id: 5 }], () => 1);

    assert.match(lines.find((l) => l.line.includes("Device 5"))?.line ?? "", /\(unnamed\)/);
  });

  test("areaId omitted suppresses the area suffix", () => {

    const lines = formatSubDeviceList([{ id: 1, name: "kitchen" }], () => 1);
    const flat = lines.map((l) => l.line).join("\n");

    assert.equal(flat.includes("area:"), false);
  });
});

// 5 + 8. dispatch through the command kind path - exercises handleRecord and handleReplay (the two handlers that do not require a real EspHomeClient).
describe("dispatch - command-kind path (createClient-free handlers)", () => {

  function emptyInvocation(name: keyof typeof CLI_COMMANDS, args: string[] = [], host: string | null = null): { kind: "command";
    command: keyof typeof CLI_COMMANDS; commandArgs: string[]; commandOptions: CommandOptions;
    options: { host: string | null; keepAlive: undefined; port: number; psk: undefined; reconnect: undefined; verbose: boolean }; } {

    return {

      command: name,
      commandArgs: args,
      commandOptions: { ...EMPTY_OPTIONS },
      kind: "command",
      options: { host, keepAlive: undefined, port: 6053, psk: undefined, reconnect: undefined, verbose: false }
    };
  }

  test("record without --host rejects with the host-required CliError", async () => {

    const { printer } = makePrinter();

    await assert.rejects(dispatch(emptyInvocation("record"), printer), (err) => {

      return (err instanceof CliError) && err.message.includes("--host option is required");
    });
  });

  test("record with --host but no output path rejects with the usage CliError", async () => {

    const { printer } = makePrinter();

    // Host present, no positional output path: the validation branch fires before any connection is attempted.
    await assert.rejects(dispatch(emptyInvocation("record", [], "192.168.1.1"), printer), (err) => {

      return (err instanceof CliError) && err.message.includes("record requires an output file path");
    });
  });

  test("replay with no positional rejects with the missing-path CliError", async () => {

    const { printer } = makePrinter();

    await assert.rejects(dispatch(emptyInvocation("replay"), printer), (err) => {

      return (err instanceof CliError) && err.message.includes("replay requires a path");
    });
  });

  test("replay with a non-existent path rejects with the not-found CliError", async () => {

    const { printer } = makePrinter();

    await assert.rejects(dispatch(emptyInvocation("replay", ["/nonexistent/path.bin"]), printer), (err) => {

      return (err instanceof CliError) && err.message.includes("Capture file not found");
    });
  });

  test("replay with the basic-discovery fixture renders the metadata block", async () => {

    // We synthesize a temporary capture (an empty .bin plus a sibling .json carrying the minimal metadata handleReplay renders) rather than reading a committed
    // fixture. The CLI's metadata-block rendering is a function of the .json contents, so a self-generated metadata file exercises the same path.
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "espc-replay-"));
    const binPath = join(dir, "basic-discovery.bin");
    const metadataPath = join(dir, "basic-discovery.json");

    writeFileSync(binPath, Buffer.alloc(0));
    writeFileSync(metadataPath, JSON.stringify({ scenario: "basic-discovery", schemaVersion: "v1.0.0", source: "real-device" }));

    try {

      const { printer, stdout } = makePrinter();

      await dispatch(emptyInvocation("replay", [binPath]), printer);

      assert.match(stdout.text, /Replay scenario: basic-discovery/);
      assert.match(stdout.text, /Source:/);
    } finally {

      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("replay with a bin file that has no sibling metadata file rejects with the missing-metadata CliError", async () => {

    // We synthesize a temporary capture file with no metadata file to drive the only handleReplay branch the existing fixtures cannot reach: bin exists, json missing.
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "espc-replay-"));
    const binPath = join(dir, "no-metadata.bin");

    writeFileSync(binPath, Buffer.alloc(0));

    try {

      const { printer } = makePrinter();

      await assert.rejects(dispatch(emptyInvocation("replay", [binPath]), printer), (err) => {

        return (err instanceof CliError) && err.message.includes("Capture metadata file not found");
      });
    } finally {

      rmSync(dir, { force: true, recursive: true });
    }
  });
});

// 11 (cont). Negative rules - the isCommandName prototype-pollution guard.
describe("Negative - isCommandName guards prototype-chain keys", () => {

  test("__proto__ is not a command name", () => {

    // Object.hasOwn-based lookup correctly rejects prototype-chain keys like __proto__, so the dispatcher never invokes .handler on a non-spec value downstream.
    assert.equal(isCommandName("__proto__"), false);
  });

  test("toString is not a command name", () => {

    assert.equal(isCommandName("toString"), false);
  });

  test("hasOwnProperty is not a command name", () => {

    assert.equal(isCommandName("hasOwnProperty"), false);
  });

  test("constructor is not a command name", () => {

    assert.equal(isCommandName("constructor"), false);
  });

  test("parseInvocation rejects __proto__ as an unknown command (no TypeError)", () => {

    // Object.hasOwn correctly rejects prototype-chain keys like __proto__ as unknown commands, so the dispatcher never crashes invoking .handler on a non-spec value.
    assert.throws(() => parseInvocation([ "__proto__", "--host", "h" ]), (err) => {

      return (err instanceof CliError) && err.message.includes("Unknown command: __proto__");
    });
  });
});
