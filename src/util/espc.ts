/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * espc.ts: Library for the espc CLI.
 *
 * This file is a side-effect-free library: every public symbol is a building block (parseInvocation, dispatch, Printer, CLI_COMMANDS, handlers, formatters) that the
 * CLI entry point in espc-bin.ts composes into the running application. There is no top-level run logic here; importing this module from a test or another consumer
 * has no observable effect beyond making its exports available. The runnable bin file (espc-bin.ts) is the only place that triggers execution; this separation
 * isolates CLI bootstrap concerns from CLI feature work.
 */

/**
 * Library for the espc CLI. The runnable entry point is {@link "../util/espc-bin" espc-bin.ts}; this module exports the primitives it composes.
 *
 * @module util/espc
 */

import type { ClientEventsMap, DeviceInfo, EspHomeClientOptions } from "../esphome-client.ts";
import type { CommandFor, Entity, EntityType, TelemetryEvent } from "../schemas/index.ts";
import { EspHomeClient, LogLevel } from "../esphome-client.ts";
import type { EspHomeLogging, Nullable } from "../types.ts";
import { parseArgs, styleText } from "node:util";
import { recordCapture, replayCapture } from "./capture.ts";
import type { CaptureMetadata } from "./capture.ts";
import type { ClientCapabilities } from "../capabilities.ts";
import { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import { MediaPlayerCommand } from "../api-constants.ts";
import type { ParseArgsConfig } from "node:util";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import type { SubDevice } from "../sub-device.ts";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { parseEntityId } from "../entity-id.ts";

/**
 * Runtime validation set for climate modes derived from `ENTITY_SCHEMAS.climate.command.enumMappings.mode`. Exposed for unit tests that need to assert the CLI's
 * climate vocabulary without re-reading the schema.
 *
 * @remarks Adding a mode to {@link ENTITY_SCHEMAS} automatically extends the CLI's accepted vocabulary - no parallel list to maintain. The static-lookup path (no
 * optional chaining) is safe because `ENTITY_SCHEMAS` uses `as const satisfies`, so TS knows at compile time that the climate schema has a command with
 * `enumMappings.mode`.
 *
 * @internal
 */
export const CLIMATE_MODE_NAMES: ReadonlySet<string> = new Set(Object.keys(ENTITY_SCHEMAS.climate.command.enumMappings.mode));

/**
 * Type narrowing for climate modes. Derived directly from the schema's `enumMappings` keys so the predicate's narrowed type is the pure string union; deriving via
 * {@link CommandFor} would mix in `number` (the wire-side acceptable form) and break the type-predicate assignability check.
 */
type ClimateModeName = keyof typeof ENTITY_SCHEMAS["climate"]["command"]["enumMappings"]["mode"];

/**
 * Type predicate over the climate mode vocabulary. Returns `true` iff `value` is one of the keys in `CLIMATE_MODE_NAMES`.
 *
 * @internal
 */
export function isClimateMode(value: string): value is ClimateModeName {

  return CLIMATE_MODE_NAMES.has(value);
}

/**
 * Helper that strips readonly modifiers so the CLI's incremental-builder pattern can populate command-options objects field-by-field. The schema-derived
 * {@link CommandFor} types are readonly by default to discourage mutation in consumer code; the CLI's parser legitimately builds them up step by step from disparate
 * option flags, so the mutable view is the right shape inside the parser scope only.
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Options shape for the light command, derived from the schema. Used by both the `control light` handler and the interactive REPL's light dispatcher.
 */
type LightCommandOptions = Mutable<CommandFor<typeof ENTITY_SCHEMAS["light"]>>;

/**
 * Marker error type for user-facing CLI failures. The top-level catch prints the message verbatim and exits 1; non-CliError throws are reported with a "Fatal:"
 * prefix.
 *
 * @remarks Throwing one of these is the canonical way to abort a command - the pattern lets handlers `throw` instead of `process.exit`, which keeps `using` cleanup
 * working and lets ESLint and TypeScript see case-block bodies as terminated (no `break` after `process.exit` and no unreachable code).
 *
 * @internal
 */
export class CliError extends Error {

  constructor(message: string) {

    super(message);
    this.name = "CliError";
  }
}

/**
 * Strict base-10 integer regex used by {@link tryParseIntStrict} and {@link parseIntOption}. Accepts an optional leading sign followed by one or more decimal digits and
 * nothing else - "123abc", "0x1a", " 42 ", and "" all fail. The regex is the validation gate because `parseInt(value, 10)` alone silently accepts trailing garbage
 * ("123abc" -> 123), which is exactly the surprise we are closing in the CLI input layer.
 *
 * @internal
 */
const STRICT_INT_PATTERN = /^-?\d+$/;

/**
 * Parse a string as a strict base-10 integer. Returns the parsed number when the input is a valid integer literal; returns `null` otherwise. This is the lookup-style
 * variant for call sites that have a non-numeric fallback path (e.g. {@link findEntity}, where a non-numeric identifier is a valid entity id, not an error).
 *
 * @internal
 */
export function tryParseIntStrict(value: string): number | null {

  if(!STRICT_INT_PATTERN.test(value)) {

    return null;
  }

  return parseInt(value, 10);
}

/**
 * Parse a CLI option's string value as a strict base-10 integer. Throws a typed {@link CliError} naming the option and the offending value when validation fails. This
 * is the throw-on-bad-input variant for call sites where a non-numeric value is a usage error (every `--brightness`, `--duration`, `--rgb`, `--temp`, `--port`, etc.).
 *
 * @param value - The raw string from the parsed argv.
 * @param flag - The flag name to surface in the error message (e.g. "--brightness").
 * @returns The parsed integer.
 * @throws {@link CliError} when `value` is not a strict base-10 integer literal.
 * @internal
 */
export function parseIntOption(value: string, flag: string): number {

  const parsed = tryParseIntStrict(value);

  if(parsed === null) {

    throw new CliError("Invalid integer for " + flag + ": '" + value + "'. Expected a base-10 integer (no hex, no trailing characters).");
  }

  return parsed;
}

/**
 * Strict decimal-number regex used by {@link parseFloatOption}. Accepts an optional leading sign, then either a digit run with an optional fractional part or a
 * bare fractional value (".5"), and nothing else - "1.2.3", "1abc", "1e3", and "" all fail. We reject exponent notation deliberately: device command values are
 * concrete magnitudes (temperatures, volumes, positions) where scientific notation in a CLI argument is far more likely a typo than an intentional input.
 *
 * @internal
 */
const STRICT_FLOAT_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)$/;

/**
 * Parse a CLI argument as a strict decimal number. Throws a typed {@link CliError} naming the label and the offending value when validation fails. This is the
 * float counterpart to {@link parseIntOption}; the per-entity control builders use it for every floating-point command field (positions, temperatures, volumes).
 *
 * @param value - The raw string from the parsed argv.
 * @param label - The flag or argument name to surface in the error message (e.g. "--brightness", "valve position").
 * @returns The parsed number.
 * @throws {@link CliError} when `value` is not a strict decimal literal.
 * @internal
 */
export function parseFloatOption(value: string, label: string): number {

  if(!STRICT_FLOAT_PATTERN.test(value)) {

    throw new CliError("Invalid number for " + label + ": '" + value + "'. Expected a decimal number.");
  }

  return Number(value);
}

/**
 * Normalize a bounded human-scale value to the 0.0-1.0 fraction ESPHome's normalized float wire fields use. This is the single mechanism every such conversion runs
 * through; the caller supplies the domain's full-scale `max` (100 for a percentage, 255 for an 8-bit color channel). Out-of-range or non-numeric input is a usage error
 * (a typo, not an intent to saturate) and throws rather than silently clamping, consistent with the CLI's strict input parsing.
 *
 * @param value - The raw string from the parsed argv.
 * @param label - The flag or argument name to surface in the error message.
 * @param max - The inclusive upper bound of the input scale (the value that maps to 1.0).
 * @returns The value as a 0.0-1.0 fraction.
 * @throws {@link CliError} when `value` is not a decimal in the inclusive range `[0, max]`.
 * @internal
 */
function normalizeToWireUnit(value: string, label: string, max: number): number {

  const parsed = parseFloatOption(value, label);

  if((parsed < 0) || (parsed > max)) {

    throw new CliError(label + " must be between 0 and " + String(max) + ". Received: '" + value + "'.");
  }

  return parsed / max;
}

/**
 * Parse a CLI percentage (0-100) into the 0.0-1.0 wire fraction ESPHome's *intensity* fields use - light brightness and media-player volume. Those are scalar
 * magnitudes a human naturally thinks of as a percentage. Color channels do NOT use this scale - see {@link parseRgb}, which follows the universal 0-255 / hex color
 * convention instead. Both conventions normalize through the same {@link normalizeToWireUnit} mechanism; only the full-scale value (and the human notation) differ.
 *
 * @param value - The raw string from the parsed argv.
 * @param label - The flag or argument name to surface in the error message (e.g. "--brightness").
 * @returns The value as a 0.0-1.0 fraction.
 * @throws {@link CliError} when `value` is not a decimal in the inclusive range 0-100.
 * @internal
 */
export function parsePercent(value: string, label: string): number {

  return normalizeToWireUnit(value, label, 100);
}

/**
 * Parse an RGB color specification into the `{ r, g, b }` shape (each component a 0.0-1.0 wire fraction) the light command takes. Two notations are accepted, matching
 * how humans and tooling actually express color:
 *
 * - Hex: `#RRGGBB` or the shorthand `#RGB` (e.g. `#FF8000`, `#F80`).
 * - Decimal triple: three comma-separated 0-255 channels (e.g. `255,128,0`).
 *
 * Color uses the 0-255 / hex convention rather than the 0-100 percentage scale brightness and volume use, because that is the universal convention for color
 * everywhere (CSS, hex, color pickers, Home Assistant's `rgb_color`); a percentage-per-channel form is essentially never how a color is specified. The conversion to
 * the wire fraction runs through the same {@link normalizeToWireUnit} mechanism as percentages; only the full-scale value (255) and the input notation differ.
 *
 * @param spec - The raw `--rgb` value.
 * @param label - The flag name to surface in error messages (e.g. "--rgb").
 * @returns The color as `{ b, g, r }` fractions in 0.0-1.0.
 * @throws {@link CliError} when the spec is neither valid hex nor a valid 0-255 triple.
 * @internal
 */
export function parseRgb(spec: string, label: string): { b: number; g: number; r: number } {

  // Hex notation. We accept the 3-digit shorthand by doubling each nibble (#F80 -> #FF8800), the same expansion CSS uses.
  if(spec.startsWith("#")) {

    const digits = spec.slice(1);
    const full = (digits.length === 3) ? digits.replace(/./g, (character) => character + character) : digits;

    if(!(/^[0-9a-fA-F]{6}$/).test(full)) {

      throw new CliError("Invalid " + label + " value: '" + spec + "'. Expected #RGB or #RRGGBB hex (e.g. #FF8000).");
    }

    return { b: parseInt(full.slice(4, 6), 16) / 255, g: parseInt(full.slice(2, 4), 16) / 255, r: parseInt(full.slice(0, 2), 16) / 255 };
  }

  // Decimal triple: three comma-separated 0-255 channels. Fewer or more than three components is a usage error rather than a silent fall-through.
  const tokens = spec.split(",").map((token) => token.trim());

  if(tokens.length !== 3) {

    throw new CliError("Invalid " + label + " value: '" + spec + "'. Expected #RRGGBB hex or three comma-separated 0-255 channels (e.g. 255,128,0).");
  }

  const [ r, g, b ] = tokens.map((token) => normalizeToWireUnit(token, label, 255)) as [ number, number, number ];

  return { b, g, r };
}

/**
 * Parse a JSON document into a value, wrapping any {@link SyntaxError} from `JSON.parse` in a typed {@link CliError} that names the source (a flag name or a file path)
 * so the user-facing message points at the bad input rather than dumping a raw parser stack trace.
 *
 * The return type is `unknown` because `JSON.parse` itself returns `unknown` - callers narrow at the assignment site (the `Partial<CaptureMetadata>` capture-metadata
 * read shape, the `EspHomeClientOptions["reconnect"]` shape, etc.) rather than relying on a free-floating generic that would shift the cost of validation onto the
 * parser helper.
 *
 * @param value - The raw JSON text.
 * @param source - A human-readable label identifying where the JSON came from (e.g. "--reconnect" or a file path).
 * @returns The parsed value, typed as `unknown` - the caller narrows at the assignment site.
 * @throws {@link CliError} when the input is not valid JSON.
 * @internal
 */
export function parseJsonOption(value: string, source: string): unknown {

  try {

    return JSON.parse(value);
  } catch(error) {

    const detail = (error instanceof SyntaxError) ? error.message : String(error);

    throw new CliError("Invalid JSON for " + source + ": " + detail);
  }
}

/**
 * Minimal write-only stream contract that {@link Printer} consumes. Both `process.stdout` and `process.stderr` satisfy this; tests inject an in-memory writer that
 * captures calls.
 *
 * @internal
 */
export interface PrinterWritable {

  write(data: string): unknown;
}

/**
 * Closed set of color names the {@link Printer} actually emits. Constraining this to a dedicated union (instead of inheriting the wider {@link styleText} format type)
 * keeps {@link LEVEL_THEME} self-documenting and lets the compiler flag any typo in a theme entry.
 *
 * @internal
 */
export type ColorName = "gray" | "green" | "red" | "yellow";

/**
 * The semantic CLI output levels the {@link Printer} emits. Distinct from the protocol-level {@link import("../esphome-client.ts").LogLevel} enum (which describes
 * device log severity on the wire); these are the Printer's own user-facing categories. Adding a level is a single new entry in {@link LEVEL_THEME} plus a one-line
 * public method on {@link Printer}; the writer pipeline is parameterized over the level and picks up the change automatically.
 *
 * @internal
 */
export type PrinterLevel = "data" | "debug" | "error" | "info" | "success" | "warn";

/**
 * Per-level rendering metadata. `label` is the bracketed prefix written before the message (empty string for unprefixed levels); `color` is the prefix's foreground
 * color when color is enabled (`null` means the prefix is never colored, even with color on); `stderr` routes the line to stderr instead of stdout.
 *
 * @internal
 */
export interface LevelTheme {

  readonly color: Nullable<ColorName>;
  readonly label: string;
  readonly stderr: boolean;
}

/**
 * The single source of truth for how each log level renders. Every divergence between levels - prefix, color, target stream - lives in one row of this table, so a
 * change to one level cannot drift from the others. Adding a new level is one row here plus one shim method on {@link Printer}.
 *
 * @internal
 */
export const LEVEL_THEME: Readonly<Record<PrinterLevel, LevelTheme>> = {

  data:    { color: null,     label: "",        stderr: false },
  debug:   { color: "gray",   label: "[DEBUG]", stderr: false },
  error:   { color: "red",    label: "[ERROR]", stderr: true  },
  info:    { color: null,     label: "",        stderr: false },
  success: { color: "green",  label: "[OK]",    stderr: false },
  warn:    { color: "yellow", label: "[WARN]",  stderr: true  }
};

/**
 * Dependency-injection seam for {@link Printer}. The constructor is pure: every field has a deterministic default that does not consult the runtime environment, so
 * tests construct directly with explicit overrides. Production callers obtain an env-aware Printer via {@link Printer.fromEnvironment}, which is the only place that
 * reads `process.stdout.isTTY`, `NO_COLOR`, and `FORCE_COLOR`.
 *
 * `color` is the single authority on whether ANSI escape codes are emitted. `tty` is independent and governs only the readline-interleave dance: whether we should
 * clear the prompt line and redraw on each write. The two flags are kept separate: conflating them lets color emission silently disagree with the printer's stated
 * configuration.
 *
 * @internal
 */
export interface PrinterIO {

  readonly color: boolean;
  readonly stderr: PrinterWritable;
  readonly stdout: PrinterWritable;
  readonly tty: boolean;
}

/**
 * The CLI's single point of coordination for `stdout`/`stderr` writes. Owns three responsibilities call sites should not have to think about:
 *
 * 1. Colorization, fully owned by the `color` flag - no second-guessing by the underlying ANSI primitive.
 * 2. Semantic level prefixes: every line goes out through one of error/warn/success/info/data/debug, so call sites express intent rather than visual style.
 * 3. Interleave coordination with an active readline prompt: when telemetry arrives mid-input, the printer clears the prompt line, writes the message, then redraws
 *    the prompt with the user's in-progress input intact. The interleave dance is encapsulated here so handlers don't have to know about it.
 *
 * Construct directly with explicit flags for tests; use {@link Printer.fromEnvironment} for production where the runtime environment governs color and TTY detection.
 *
 * @internal
 */
export class Printer {

  private readonly io: PrinterIO;
  private rl: Nullable<ReadlineInterface> = null;

  constructor(io?: Partial<PrinterIO>) {

    // The constructor is pure: defaults are deterministic and do not read the environment. Streams default to the real Node primitives because every CLI ultimately
    // writes there; the boolean flags default to `false` (the safe, deterministic value) so test rigs that omit them get reproducible behavior. Production paths that
    // need env-aware defaults route through `fromEnvironment` instead.
    this.io = {

      color: io?.color ?? false,
      stderr: io?.stderr ?? process.stderr,
      stdout: io?.stdout ?? process.stdout,
      tty: io?.tty ?? false
    };
  }

  /**
   * Construct a Printer whose `color` and `tty` flags are derived from the runtime environment. This is the only place in the module that reads the environment, which
   * keeps `Printer` itself trivially testable with explicit flags.
   *
   * Precedence: `NO_COLOR` > `FORCE_COLOR` > TTY heuristic. {@link https://no-color.org NO_COLOR} is the user's explicit accessibility kill switch and supersedes
   * everything else; `FORCE_COLOR` is a tooling-level override that turns color on when stdout isn't a TTY (pagers that ANSI-render, CI logs); otherwise the default
   * follows whether stdout is detected as a TTY.
   */
  public static fromEnvironment(io?: Partial<PrinterIO>): Printer {

    // process.stdout.isTTY is typed as `true` by @types/node when present but is `undefined` at runtime in non-TTY contexts. We widen and coerce to a strict boolean so
    // the result is unambiguous.
    const tty = Boolean(process.stdout.isTTY as boolean | undefined);

    // NO_COLOR convention: any non-empty value disables color. Some shells export the variable as the empty string, which by convention means "color is fine".
    const noColor = (process.env["NO_COLOR"] !== undefined) && (process.env["NO_COLOR"] !== "");

    // FORCE_COLOR convention: any value other than "0" or "" forces color even when stdout isn't a TTY. Common when piping through a pager that supports ANSI, or when
    // a parent process (e.g. the Node test runner) injects it for child workers.
    const forceColor = (process.env["FORCE_COLOR"] !== undefined) && (process.env["FORCE_COLOR"] !== "") && (process.env["FORCE_COLOR"] !== "0");

    return new Printer({

      // The precedence (NO_COLOR > FORCE_COLOR > TTY) collapses cleanly: NO_COLOR vetoes everything, then FORCE_COLOR or TTY can each turn color on.
      color: io?.color ?? (!noColor && (forceColor || tty)),
      stderr: io?.stderr ?? process.stderr,
      stdout: io?.stdout ?? process.stdout,
      tty: io?.tty ?? tty
    });
  }

  // Bind a readline interface so output can interleave cleanly with an active prompt. Pass null to detach when the REPL exits.
  public attachReadline(rl: Nullable<ReadlineInterface>): void {

    this.rl = rl;
  }

  public error(message: string): void {

    this.write("error", message);
  }

  public warn(message: string): void {

    this.write("warn", message);
  }

  public success(message: string): void {

    this.write("success", message);
  }

  public info(message: string): void {

    this.write("info", message);
  }

  public data(message: string): void {

    this.write("data", message);
  }

  public debug(message: string): void {

    this.write("debug", message);
  }

  // The shared writer pipeline. Resolves the level's metadata from LEVEL_THEME, applies color to the prefix when configured, then hands the assembled line to emit().
  // Every public level method is a one-line shim onto this method; behavioral changes (e.g. a new prefix format, a stream re-routing) belong in LEVEL_THEME, not here.
  private write(level: PrinterLevel, message: string): void {

    const theme = LEVEL_THEME[level];

    // Levels with no label (info, data) emit the message verbatim. Splitting on the empty-label check avoids constructing a "" prefix that would otherwise still pass
    // through applyColor.
    const prefix = theme.label ? this.applyColor(theme.color, theme.label + " ") : "";

    this.emit(prefix + message, theme.stderr);
  }

  // Internal write. When a readline is attached and we have a TTY, save the user's in-progress input, clear the prompt line, write the message, redraw the prompt with
  // the input restored. Without a TTY (piped to a file or no readline), write directly to stdout/stderr through the IO seam so tests can capture both channels.
  private emit(line: string, isErr: boolean): void {

    if(this.rl && this.io.tty) {

      const buffered = this.rl.line;

      this.io.stdout.write("\r\x1b[K" + line + "\n");
      this.rl.prompt(true);
      this.rl.write(buffered);

      return;
    }

    const writer = isErr ? this.io.stderr : this.io.stdout;

    writer.write(line + "\n");
  }

  private applyColor(name: Nullable<ColorName>, text: string): string {

    // Two short-circuits: when color is off globally, or when the level explicitly opts out (color === null), we return the text unchanged. Otherwise we delegate to
    // styleText with `validateStream: false` so the Printer's `color` flag is the sole authority. Without that option, styleText would re-validate against the actual
    // process.stdout color depth and silently strip codes when stdout isn't a TTY (a common test-runner condition), making output non-deterministic with respect to the
    // Printer's own configuration.
    if(!this.io.color || (name === null)) {

      return text;
    }

    return styleText(name, text, { validateStream: false });
  }
}

/**
 * Adapter that satisfies {@link EspHomeLogging} by routing every level through the CLI's {@link Printer}. Verbose mode lifts `debug` and `info` from suppressed to
 * surfaced; `warn`/`error` always surface. Informational library messages are quieted to debug-level by default because the library is chatty about expected
 * operations.
 *
 * @internal
 */
export class CLILogger implements EspHomeLogging {

  private readonly printer: Printer;
  private readonly verbose: boolean;

  constructor(printer: Printer, verbose: boolean) {

    this.printer = printer;
    this.verbose = verbose;
  }

  public debug(message: string, context?: unknown): void {

    if(this.verbose) {

      this.printer.debug(this.format(message, context));
    }
  }

  public error(message: string, context?: unknown): void {

    this.printer.error(this.format(message, context));
  }

  public info(message: string, context?: unknown): void {

    if(this.verbose) {

      this.printer.info(this.format(message, context));
    }
  }

  public warn(message: string, context?: unknown): void {

    this.printer.warn(this.format(message, context));
  }

  private format(message: string, context?: unknown): string {

    return context !== undefined ? message + " " + JSON.stringify(context, null, 2) : message;
  }
}

/**
 * Stringify and concatenate a list of mixed string/number parts. Used throughout the CLI's formatters to assemble multi-segment output lines without resorting to
 * template literals (which the house style forbids).
 *
 * @internal
 */
export function joinParts(parts: (string | number)[]): string {

  return parts.map(p => String(p)).join("");
}

// Type definitions for parsed arguments. Optional fields use `T | undefined` (rather than `T?`) because parseArgs uniformly produces a key for every defined option,
// with undefined when not supplied; the field is always present, and "explicit undefined" is the right encoding under exactOptionalPropertyTypes.
/**
 * Parsed shape of the CLI's global flags. Every field is always present; absence is encoded as `undefined`/`null` per the schema below so call sites don't need a
 * separate `in` check.
 *
 * @internal
 */
export interface ParsedOptions {

  host: Nullable<string>;
  keepAlive: string | undefined;
  port: number;
  psk: string | undefined;
  reconnect: string | undefined;
  verbose: boolean;
}

/**
 * Parsed shape of the CLI's command-scoped flags (the `--brightness`/`--rgb`/`--type` family that varies by command). Every field is `string | undefined` directly
 * from parseArgs; numeric and boolean coercion happens at the consumer.
 *
 * @internal
 */
export interface CommandOptions {

  brightness: string | undefined;
  duration: string | undefined;
  effect: string | undefined;
  entity: string | undefined;
  rgb: string | undefined;
  state: string | undefined;
  temp: string | undefined;
  type: string | undefined;
  wait: string | undefined;
}

/**
 * Minimal entity shape consumed by the CLI's lookup and dispatch helpers. Both `EspHomeClient.getEntitiesWithIds()` and `MockClient.getEntitiesWithIds()` return values
 * structurally compatible with this interface; the CLI never reads more than these four fields off an entity.
 *
 * @internal
 */
export interface EntityWithId {

  id: string;
  key: number;
  name: string;
  type: string;
}

/**
 * Structural client shape consumed by the CLI's per-entity-type dispatch (`executeControl`, `runInteractiveControl`, `handleInteractiveCommand`). Both
 * {@link EspHomeClient} and the testing mock client satisfy this; the CLI never reaches outside these three methods during entity control dispatch.
 *
 * @internal
 */
export interface ControlClient {

  command<T extends EntityType>(id: EntityId<T>, options: CommandFor<typeof ENTITY_SCHEMAS[T]>): void;
  deviceInfo(): Nullable<DeviceInfo>;
  getEntitiesWithIds(): EntityWithId[];
}

/**
 * The CLI's client dependency contract: the broader sibling of {@link ControlClient}, adding the read-surface the non-control commands consume. Both the real
 * {@link EspHomeClient} and the {@link MockClient} satisfy it; src/util/espc.types.ts pins that with a compile-time drift-guard so
 * a method the CLI needs can never silently leave either. Extracted `run*` command-logic functions take this interface (not the concrete client) so they are
 * unit-testable against MockClient, exactly as executeControl/handleInteractiveCommand take ControlClient.
 *
 * @internal
 */
export interface CliClient extends ControlClient {

  capabilities(): ClientCapabilities;
  entitiesByDevice(id: number): Entity[];
  on<E extends keyof ClientEventsMap>(event: E, handler: (payload: ClientEventsMap[E]) => void): Disposable;
  snapshot(): ReadonlyMap<EntityId, TelemetryEvent>;
  subDevices(): readonly SubDevice[];
}

/**
 * Single source of truth for the parser's accepted flag vocabulary - every supported flag, both global and command-scoped, is declared here. parseArgs runs in strict
 * mode against this table so an unknown flag fails loudly with a clear error rather than silently no-opping; a typo like "--brigthness" surfaces at parse time instead
 * of dropping into an unbrightened light command. Adding a new flag is a one-line change; tests assert the shape directly to verify every documented flag is wired
 * through.
 *
 * @remarks `as const satisfies` preserves the literal types (so parseArgs can narrow `values.host` to `string | undefined`) AND validates each entry at compile time
 * against the `ParseArgsConfig["options"]` shape - a typo like `type: "strring"` would fail the build immediately rather than surfacing at runtime via parseArgs.
 *
 * @internal
 */
export const CLI_OPTIONS = {

  brightness:   { type: "string" },
  duration:     { type: "string" },
  effect:       { type: "string" },
  entity:       { type: "string" },
  help:         { type: "boolean" },
  host:         { short: "h", type: "string" },
  interactive:  { short: "i", type: "boolean" },
  "keep-alive": { type: "string" },
  port:         { short: "p", type: "string" },
  psk:          { short: "k", type: "string" },
  reconnect:    { type: "string" },
  rgb:          { type: "string" },
  state:        { type: "string" },
  temp:         { type: "string" },
  type:         { type: "string" },
  verbose:      { short: "v", type: "boolean" },
  wait:         { type: "string" }
} as const satisfies NonNullable<ParseArgsConfig["options"]>;

/**
 * Resolve a user-supplied identifier (numeric key or branded id string) against an entity list. Numeric keys win when the identifier parses as a number AND a matching
 * entity exists; the string-id fallback is exact-match. Returns `undefined` when no entity matches either path.
 *
 * @internal
 */
export function findEntity(entities: EntityWithId[], identifier: string): EntityWithId | undefined {

  // First try to parse as a number (key). The strict base-10 parser (see {@link STRICT_INT_PATTERN}) keeps non-integer identifiers - branded id strings like
  // "light-bedroom", hex-shaped tokens like "0xa", partial-digit tokens like "123abc" - off this branch and routes them to the by-id lookup below. A clean integer
  // matches by key; anything else falls through to the exact-match string id path.
  const asNumber = tryParseIntStrict(identifier);

  if(asNumber !== null) {

    const byKey = entities.find(e => e.key === asNumber);

    if(byKey) {

      return byKey;
    }
  }

  // Then try as an ID string.
  return entities.find(e => e.id === identifier);
}

async function createClient(options: ParsedOptions, printer: Printer): Promise<EspHomeClient> {

  if(!options.host) {

    throw new CliError("--host option is required.");
  }

  // We omit `psk` entirely when absent rather than passing explicit `undefined`; under exactOptionalPropertyTypes, "field omitted" and "field present with undefined"
  // are semantically distinct, and the library's contract treats absence as "no PSK configured."
  // The --reconnect flag accepts "false" (disable) or a JSON object literal (override defaults). Anything else is treated as "use defaults." Malformed JSON inside the
  // object-literal branch surfaces as a CliError naming the flag so the user sees a usable hint, not a raw SyntaxError stack trace from the parser.
  const reconnectOption: EspHomeClientOptions["reconnect"] = (options.reconnect === "false") ? false :
    options.reconnect?.startsWith("{") ? parseJsonOption(options.reconnect, "--reconnect") as Exclude<EspHomeClientOptions["reconnect"], false> :
      undefined;

  // The --keep-alive flag accepts "false" (disable) or omitted (use the 30s/60s default).
  const keepAliveOption: EspHomeClientOptions["keepAlive"] = (options.keepAlive === "false") ? false : undefined;

  const config: EspHomeClientOptions = {

    host: options.host,
    ...((keepAliveOption !== undefined) && { keepAlive: keepAliveOption }),
    logger: new CLILogger(printer, options.verbose),
    port: options.port || 6053,
    ...((options.psk !== undefined) && { psk: options.psk }),
    ...((reconnectOption !== undefined) && { reconnect: reconnectOption })
  };

  const client = new EspHomeClient(config);

  // Surface device-side errors prominently regardless of verbose mode.
  client.on("log", (data) => {

    if(data.level === LogLevel.ERROR) {

      printer.error("Device log: " + data.message);
    }
  });

  // Disconnect notifications are only useful in verbose mode - normal operation cleans up via `using` and we don't want to spam the user.
  client.on("disconnect", (reason) => {

    if(options.verbose) {

      printer.debug("Client disconnected: " + (reason ?? "unknown"));
    }
  });

  // Connect with a 30 second deadline. connect() returns a promise that resolves on the "connect" event and rejects on "disconnect" or signal abort.
  await client.connect({ signal: AbortSignal.timeout(30000) });

  return client;
}

/**
 * Render a {@link DeviceInfo} record as the multi-line string the CLI prints for `info` and the interactive REPL's `info` command. Pure: every output byte is a
 * function of the input record.
 *
 * @internal
 */
export function formatDeviceInfo(info: DeviceInfo): string {

  const lines: string[] = [];

  lines.push("Device Information:");

  if(info.name) {

    lines.push(joinParts([ "  Name: ", info.name ]));
  }

  if(info.model) {

    lines.push(joinParts([ "  Model: ", info.model ]));
  }

  if(info.manufacturer) {

    lines.push(joinParts([ "  Manufacturer: ", info.manufacturer ]));
  }

  if(info.friendlyName) {

    lines.push(joinParts([ "  Friendly Name: ", info.friendlyName ]));
  }

  if(info.macAddress) {

    lines.push(joinParts([ "  MAC Address: ", info.macAddress ]));
  }

  if(info.esphomeVersion) {

    lines.push(joinParts([ "  ESPHome Version: ", info.esphomeVersion ]));
  }

  if(info.compilationTime) {

    lines.push(joinParts([ "  Compilation Time: ", info.compilationTime ]));
  }
  lines.push(joinParts([ "  Uses Password: ", info.usesPassword ? "Yes" : "No" ]));

  if(info.webserverPort !== undefined) {

    lines.push(joinParts([ "  Webserver Port: ", info.webserverPort.toString() ]));
  }

  if(info.legacyBluetoothProxyVersion !== undefined) {

    lines.push(joinParts([ "  Bluetooth Proxy Version: ", info.legacyBluetoothProxyVersion.toString() ]));
  }

  if(info.legacyVoiceAssistantVersion !== undefined) {

    lines.push(joinParts([ "  Voice Assistant Version: ", info.legacyVoiceAssistantVersion.toString() ]));
  }

  return lines.join("\n");
}

/**
 * Read-command policy for 'info': read the cached device-info record and render it (or warn when absent). Extracted from {@link handleInfo} so it is unit-testable
 * against {@link CliClient} (the MockClient satisfies it), mirroring how {@link executeControl} takes {@link ControlClient}. The handler owns client construction and
 * disposal; this function never disposes the client.
 *
 * @internal
 */
export function runInfo(client: CliClient, printer: Printer): void {

  // A resolved connect guarantees device info is populated: discovery completes only once both the device-info response and the list-entities done sentinel have
  // arrived, so we read the cached record directly. The defensive null branch remains for the impossible case.
  const info = client.deviceInfo();

  if(info) {

    printer.data(formatDeviceInfo(info));
  } else {

    printer.warn("Device information not available. The device may not be responding.");
  }
}

// Command handler for 'info'.
async function handleInfo(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options } = invocation;

  using client = await createClient(options, printer);

  runInfo(client, printer);
}

// Command handler for 'record'. Connects to the device, tees its transport to capture the decoded session, and writes the capture binary plus a PII-scrubbed metadata
// file. The recording runs for the --duration window (default applied by the recorder). The work is delegated to the shared recorder in capture.ts, keeping a single
// implementation behind the CLI surface.
async function handleRecord(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options, commandArgs, commandOptions } = invocation;

  if(!options.host) {

    throw new CliError("--host option is required.");
  }

  const outputPath = commandArgs.at(0);

  if(outputPath === undefined) {

    throw new CliError("record requires an output file path. Usage: espc --host <host> record <output-file.bin> [scenario] [--duration <seconds>]");
  }

  // --duration is whole or fractional seconds; the recorder takes milliseconds. When absent, the recorder applies its own default window.
  const durationMs = commandOptions.duration ? Math.floor(parseFloatOption(commandOptions.duration, "--duration") * 1000) : undefined;
  const scenario = commandArgs.at(1);

  printer.info("Recording from " + options.host + " to " + outputPath + "...");

  const summary = await recordCapture({

    ...((durationMs !== undefined) && { durationMs }),
    host: options.host,
    logger: new CLILogger(printer, options.verbose),
    outputPath,
    port: options.port,
    psk: options.psk ?? null,
    ...((scenario !== undefined) && { scenario })
  });

  printer.success("Recorded " + String(summary.frameCount) + " frames (" + String(summary.byteLength) + " bytes) to " + summary.binaryPath + ".");
  printer.data("Wrote metadata file to " + summary.metadataPath + ".");
}

/**
 * Render the metadata block for the `replay` command. Pure: every output is a function of the metadata record and the binary byte count. Returns a list of
 * `{ kind, line }` records so handlers can route info-level header lines and data-level detail rows to the right Printer channel.
 *
 * @internal
 */
export function formatReplayMetadata(metadata: Partial<CaptureMetadata>, binBytes: number): { kind: "info" | "data" | "warn"; line: string }[] {

  const lines: { kind: "info" | "data" | "warn"; line: string }[] = [

    { kind: "info", line: "Replay scenario: " + (metadata.scenario ?? "(unnamed)") },
    { kind: "data", line: "  Source:       " + (metadata.source ?? "(unknown)") },
    { kind: "data", line: "  Schema:       " + (metadata.schemaVersion ?? "(unknown)") },
    { kind: "data", line: "  Captured at:  " + (metadata.capturedAt ?? "(unknown)") },
    { kind: "data", line: "  Description:  " + (metadata.description ?? "(none)") },
    { kind: "data", line: "  Binary bytes: " + String(binBytes) },
    { kind: "data", line: "  Expected frames: " + String(metadata.expectedFrames ?? 0) }
  ];

  if(binBytes === 0) {

    lines.push({ kind: "warn", line: "Capture binary is empty - this is a synthesized scaffolding fixture with no frames to replay." });
  }

  return lines;
}

// Command handler for 'replay'. Reads a capture file and its metadata file, prints the parsed metadata, then - for a non-empty capture - drives the recorded frame
// stream through a MockTransport into a real client and reports what the host observed (device, entities, telemetry). Empty synthesized fixtures render metadata only.
// The host-driving work is delegated to the shared replayCapture in capture.ts.
async function handleReplay(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { commandArgs } = invocation;
  const target = commandArgs.at(0);

  if(!target) {

    throw new CliError("replay requires a path to a capture .bin file. Example: espc replay captures/my-device.bin");
  }

  const { existsSync, readFileSync } = await import("node:fs");

  if(!existsSync(target)) {

    throw new CliError("Capture file not found: " + target);
  }

  const metadataPath = target.replace(/\.bin$/, ".json");

  if(!existsSync(metadataPath)) {

    throw new CliError("Capture metadata file not found: " + metadataPath);
  }

  const binBytes = readFileSync(target);
  const metadata = parseJsonOption(readFileSync(metadataPath, "utf8"), metadataPath) as Partial<CaptureMetadata>;

  for(const { kind, line } of formatReplayMetadata(metadata, binBytes.length)) {

    if(kind === "info") {

      printer.info(line);
    } else if(kind === "warn") {

      printer.warn(line);
    } else {

      printer.data(line);
    }
  }

  if(binBytes.length === 0) {

    return;
  }

  // Drive the captured stream through MockTransport into a real client and report the observed result.
  const result = await replayCapture({ binaryPath: target });

  printer.info("Replayed " + String(result.frameCount) + " frames through MockTransport.");
  printer.data("  Device:           " + (result.deviceName ?? "(unknown)"));
  printer.data("  Entities:         " + String(result.entityCount));
  printer.data("  Telemetry events: " + String(result.telemetryEventCount));
}

/**
 * Render a {@link ClientCapabilities} record as the multi-section block the CLI's `capabilities` command prints. Each section header is an `info`-level line; each
 * detail row is a `data`-level line. Returning a flat list of `{ kind, line }` records keeps the formatter pure while letting handlers route each line to the right
 * Printer channel.
 *
 * @internal
 */
export function formatCapabilities(caps: ClientCapabilities): { kind: "info" | "data"; line: string }[] {

  return [

    { kind: "info", line: "Device Capabilities:" },
    { kind: "data", line: "  API: " + String(caps.api.major) + "." + String(caps.api.minor) },
    { kind: "data", line: "  Modern handshake: " + String(caps.modernHandshake) },
    { kind: "data", line: "  Encryption: supported=" + String(caps.encryption.supported) + " active=" + String(caps.encryption.active) },
    { kind: "data", line: "  Noise key rotation: " + String(caps.noiseKeyRotation) },
    { kind: "info", line: "Voice Assistant:" },
    { kind: "data", line: "  Supported:          " + String(caps.voiceAssistant.supported) },
    { kind: "data", line: "  API audio:          " + String(caps.voiceAssistant.apiAudio) },
    { kind: "data", line: "  Announcements:      " + String(caps.voiceAssistant.announcements) },
    { kind: "data", line: "  Speaker:            " + String(caps.voiceAssistant.speaker) },
    { kind: "data", line: "  Start conversation: " + String(caps.voiceAssistant.startConversation) },
    { kind: "data", line: "  Timer events:       " + String(caps.voiceAssistant.timerEvents) },
    { kind: "info", line: "Bluetooth Proxy:" },
    { kind: "data", line: "  Supported:              " + String(caps.bluetoothProxy.supported) },
    { kind: "data", line: "  Active connections:     " + String(caps.bluetoothProxy.activeConnections) },
    { kind: "data", line: "  Legacy advertisements:  " + String(caps.bluetoothProxy.legacyAdvertisements) },
    { kind: "data", line: "  Raw advertisements:     " + String(caps.bluetoothProxy.rawAdvertisements) },
    { kind: "info", line: "Serial Proxy:" },
    { kind: "data", line: "  Supported:              " + String(caps.serialProxy.supported) },
    { kind: "data", line: "  Instances:              " + String(caps.serialProxy.count) },
    { kind: "info", line: "Z-Wave Proxy:" },
    { kind: "data", line: "  Supported:              " + String(caps.zwaveProxy.supported) },
    // Render the feature-flag bitmask in hex (`0x` prefix, lowercase nibbles) so the bit positions are legible at a glance; the leading "0x" disambiguates it from the
    // surrounding decimal counters even at zero. Home id follows the same hex convention because the value is naturally read as a 32-bit identifier, not as an integer.
    { kind: "data", line: "  Feature flags:          0x" + caps.zwaveProxy.featureFlags.toString(16) },
    { kind: "data", line: "  Home id:                " + (caps.zwaveProxy.homeId === null ? "none" : "0x" + caps.zwaveProxy.homeId.toString(16)) }
  ];
}

/**
 * Read-command policy for 'capabilities': render the structured capability record, routing each line to the right Printer channel. Extracted from
 * {@link handleCapabilities} so it is unit-testable against {@link CliClient}.
 *
 * @internal
 */
export function runCapabilities(client: CliClient, printer: Printer): void {

  // Capabilities are populated synchronously after the connect handshake completes. Discovery may still be in flight when we get here, but that's fine - the capability
  // record is built from DeviceInfo plus the negotiated API minor, both of which arrive before discovery.
  for(const { kind, line } of formatCapabilities(client.capabilities())) {

    if(kind === "info") {

      printer.info(line);
    } else {

      printer.data(line);
    }
  }
}

// Command handler for 'capabilities'. Pretty-prints the structured capability record for the connected device.
async function handleCapabilities(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options } = invocation;

  using client = await createClient(options, printer);

  runCapabilities(client, printer);
}

/**
 * Render the latest-state cache as the JSON document the CLI's `snapshot` command prints. The optional type filter is matched against the entity-id prefix (e.g.,
 * `--type sensor` matches every id starting with `sensor-`), mirroring the public `client.snapshotFor(type)` semantics. Buffer values are encoded as
 * `{ __buffer: "<base64>" }` so the output round-trips through JSON.parse without binary corruption.
 *
 * @internal
 */
export function formatSnapshotJson(cache: ReadonlyMap<string, unknown>, typeFilter: Nullable<string> = null): string {

  const normalized = typeFilter?.toLowerCase() ?? null;
  const entries: { entity: string; state: unknown }[] = [];

  for(const [ id, event ] of cache) {

    if(normalized && !id.startsWith(normalized + "-")) {

      continue;
    }

    entries.push({ entity: id, state: event });
  }

  return JSON.stringify(entries, bufferAwareJsonReplacer, 2);
}

/**
 * JSON.stringify replacer that rewrites Buffer-shaped objects to a compact `{ __buffer: base64 }` form. JSON.stringify calls `Buffer.prototype.toJSON()` before the
 * replacer, which produces `{ type: "Buffer", data: number[] }`; this replacer detects that converted shape and rewrites it so the JSON output is round-trippable. The
 * shape match is structurally narrow (`type === "Buffer"` AND `data` is an array of numbers) so user-supplied state objects that happen to have a `type: "Buffer"`
 * field do not false-positive.
 *
 * @internal
 */
export function bufferAwareJsonReplacer(_key: string, value: unknown): unknown {

  if(value && (typeof value === "object") && ((value as { type?: unknown }).type === "Buffer") && Array.isArray((value as { data?: unknown }).data)) {

    return { __buffer: Buffer.from((value as { data: number[] }).data).toString("base64") };
  }

  return value;
}

// Initial grace for the snapshot's adaptive settle: how long to wait for the FIRST state event before giving up and capturing an empty snapshot. The timer is armed at
// connect-resolve, so this longer window absorbs first-frame latency on a slow device or network - a marginal device is not cut off mid-handshake-to-burst, and a device
// that genuinely has no immediate state settles here, empty, rather than waiting out the full ceiling.
const SNAPSHOT_INITIAL_GRACE_MS = 1000;

// Inter-event quiet window: once the first state event has arrived, the snapshot is considered settled when no further event arrives for this long. ESPHome's
// SubscribeStates stream has no "initial states complete" marker, so we detect the end of the post-subscribe burst by its quiet tail rather than a fixed wall-clock
// guess.
const SNAPSHOT_QUIET_MS = 500;

// Hard ceiling on the adaptive collect: a device whose telemetry never goes quiet (a fast-cycling sensor) would otherwise hold the snapshot open forever, so we cap the
// total wait and capture whatever has arrived by then.
const SNAPSHOT_CEILING_MS = 5000;

/**
 * Resolve once an event stream has settled, using a two-phase adaptive window bounded by a hard ceiling. The caller supplies a `subscribe` thunk that registers an event
 * callback and returns its {@link Disposable}. Before the first event the timer waits `initialGraceMs` - a longer window that absorbs first-frame latency, so a slow
 * source is not cut off and a source with no events settles empty; the first event switches to the shorter inter-event `quietMs`, which every subsequent event restarts,
 * so the collect extends across the burst and settles `quietMs` after its last event. `ceilingMs` caps the total regardless of activity. Used by the snapshot command to
 * collect the post-`SubscribeStates` state burst - ESPHome defines no completeness marker for that stream, so quiet-tail detection is the honest model. Never rejects:
 * the ceiling guarantees termination.
 *
 * @param subscribe - Registers the per-event callback and returns its disposable subscription handle.
 * @param options.ceilingMs - Hard upper bound on the total collect, regardless of stream activity.
 * @param options.initialGraceMs - How long to wait for the first event before settling (empty when none arrives).
 * @param options.quietMs - After the first event, settle once no further event has arrived for this many milliseconds.
 * @returns A promise that resolves (never rejects) when the stream settles or the ceiling is reached.
 *
 * @internal
 */
export async function awaitQuietPeriod(subscribe: (onEvent: () => void) => Disposable,
  { ceilingMs, initialGraceMs, quietMs }: { ceilingMs: number; initialGraceMs: number; quietMs: number }): Promise<void> {

  return new Promise<void>((resolve) => {

    // Single settle path shared by every timer: clear the live timers, drop the subscription, and resolve once. clearTimeout on an already-fired or never-armed timer
    // is a safe no-op, and resolve() is inert after the first call, so a race between the ceiling and the quiet timer settles cleanly exactly once.
    const finish = (): void => {

      clearTimeout(ceiling);
      clearTimeout(quiet);
      subscription[Symbol.dispose]();
      resolve();
    };

    // The hard ceiling bounds the total collect so a perpetually-active stream still returns.
    const ceiling = setTimeout(finish, ceilingMs);

    // Phase one: wait initialGraceMs for the first event; if none ever arrives, this timer settles an empty snapshot. Each event (re)arms the shorter inter-event quiet
    // window from now, so the first event transitions us into phase two and every later event extends it. We recreate the timer rather than refresh() it because the
    // first event must SHORTEN the delay (grace -> quiet), which Timer.refresh - which always re-arms for the original delay - cannot do.
    let quiet = setTimeout(finish, initialGraceMs);
    const subscription = subscribe((): void => {

      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    });
  });
}

/**
 * Read-command policy for 'snapshot': settle the latest-state cache (fixed window or adaptive quiet period), then render it as JSON. Extracted from
 * {@link handleSnapshot} so it is unit-testable against {@link CliClient}. The `--wait` PARSE stays in the handler (it is a pre-connect fail-fast); the resolved
 * `fixedWaitMs` is passed in. The options-object param carries two heterogeneous args, matching the house options-object rule and the {@link executeControl} precedent.
 *
 * @internal
 */
export async function runSnapshot(client: CliClient, printer: Printer, options: { fixedWaitMs: number | undefined; typeFilter: Nullable<string> }): Promise<void> {

  // The latest-state cache is empty at connect-resolve and fills from the live telemetry burst that follows SubscribeStatesRequest. ESPHome defines no "initial states
  // complete" marker, so by default we collect adaptively until the stream goes quiet (capped by a ceiling); --wait overrides that with a fixed deterministic window.
  if(options.fixedWaitMs !== undefined) {

    await delay(options.fixedWaitMs);
  } else {

    await awaitQuietPeriod((onEvent) => client.on("telemetry", () => onEvent()),
      { ceilingMs: SNAPSHOT_CEILING_MS, initialGraceMs: SNAPSHOT_INITIAL_GRACE_MS, quietMs: SNAPSHOT_QUIET_MS });
  }

  printer.data(formatSnapshotJson(client.snapshot(), options.typeFilter));
}

// Command handler for 'snapshot'. Dumps the latest-state cache as JSON. With --type, filters to one entity type via snapshotFor(); otherwise dumps the full snapshot.
async function handleSnapshot(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { commandOptions, options } = invocation;

  // Validate --wait at the boundary, before opening the connection, so a malformed value fails fast rather than after a live connect. --wait is whole or fractional
  // seconds (float-unified with --duration); when present it overrides the adaptive settle with a deterministic fixed window.
  const fixedWaitMs = commandOptions.wait !== undefined ? Math.floor(parseFloatOption(commandOptions.wait, "--wait") * 1000) : undefined;

  using client = await createClient(options, printer);

  await runSnapshot(client, printer, { fixedWaitMs, typeFilter: commandOptions.type ?? null });
}

/**
 * Render the sub-device listing for the CLI's `devices` command. The first argument is the sub-device list; the second is a function that returns the entity count for
 * a given device id (decouples this formatter from the live `client.entitiesByDevice` so tests can pass a deterministic counter). Returns kind-tagged lines so handlers
 * route to the right Printer channel.
 *
 * @internal
 */
export function formatSubDeviceList(subDevices: readonly { id: number; name?: string; areaId?: number }[],
  entityCountFor: (deviceId: number) => number): { kind: "info" | "data"; line: string }[] {

  if(subDevices.length === 0) {

    return [

      { kind: "info", line: "This device has no sub-devices (single-device configuration)." },
      { kind: "data", line: "  Parent device entities: " + String(entityCountFor(0)) }
    ];
  }

  const lines: { kind: "info" | "data"; line: string }[] = [

    { kind: "info", line: "Sub-devices on this parent ESP:" },
    { kind: "data", line: "  Parent device (id 0): " + String(entityCountFor(0)) + " entit(ies)" }
  ];

  for(const dev of subDevices) {

    const label = dev.name ?? "(unnamed)";
    const areaSuffix = dev.areaId !== undefined ? " | area: " + String(dev.areaId) : "";

    lines.push({ kind: "data", line: "  Device " + String(dev.id) + " " + label + ": " + String(entityCountFor(dev.id)) + " entit(ies)" + areaSuffix });
  }

  return lines;
}

/**
 * Read-command policy for 'devices': render the sub-device listing with per-device entity counts, routing each line to the right Printer channel. Extracted from
 * {@link handleDevices} so it is unit-testable against {@link CliClient}.
 *
 * @internal
 */
export function runDevices(client: CliClient, printer: Printer): void {

  for(const { kind, line } of formatSubDeviceList(client.subDevices(), (id) => client.entitiesByDevice(id).length)) {

    if(kind === "info") {

      printer.info(line);
    } else {

      printer.data(line);
    }
  }
}

// Command handler for 'devices'. Lists every sub-device for a multi-device parent ESP, plus the entities owned by each device.
async function handleDevices(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options } = invocation;

  using client = await createClient(options, printer);

  runDevices(client, printer);
}

// Command handler for 'watch'. Streams events for a single entity until either Ctrl+C or the optional duration expires. Built on the per-stream wrapper to avoid the
// fan-out of the generic telemetry stream.
async function handleWatch(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options, commandArgs, commandOptions } = invocation;

  // Validate every caller-supplied input BEFORE opening the connection, so a malformed invocation fails fast rather than paying a live connect (which can take seconds,
  // or fail outright on a bad host) only to reject the input afterward. The first positional is the entity id ("light-bedroom_lamp", a numeric key, or a name substring
  // findEntity accepts); --duration is a pure flag the watch loop bounds itself by below - neither depends on the connected device, so both belong at the boundary.
  const target = commandArgs.at(0);

  if(!target) {

    throw new CliError("watch requires an entity id, key, or unique name (e.g. light-bedroom_lamp).");
  }

  const durationMs = commandOptions.duration ? Math.floor(parseFloatOption(commandOptions.duration, "--duration") * 1000) : 0;

  using stack = new DisposableStack();
  const client = stack.use(await createClient(options, printer));

  const entities = client.getEntitiesWithIds();
  const matched = findEntity(entities, target);

  if(!matched) {

    throw new CliError("No entity matched: " + target);
  }

  printer.info("Watching " + matched.id + " (key: " + matched.key.toString() + "). Press Ctrl+C to stop.");
  const sources: AbortSignal[] = [];
  const sigintController = new AbortController();
  const onSigint = (): void => { sigintController.abort(); };

  process.on("SIGINT", onSigint);
  stack.defer(() => process.off("SIGINT", onSigint));
  sources.push(sigintController.signal);

  if(durationMs > 0) {

    sources.push(AbortSignal.timeout(durationMs));
  }

  const composed = AbortSignal.any(sources);

  try {

    for await (const event of client.stream("telemetry", { signal: composed })) {

      if(event.entity === matched.id) {

        printer.data(JSON.stringify({ entity: event.entity, state: event }, bufferAwareJsonReplacer));
      }
    }

  } catch(err) {

    if((err instanceof DOMException) && ((err.name === "AbortError") || (err.name === "TimeoutError"))) {

      printer.info("Watch ended.");

      return;
    }

    throw err;
  }
}

/**
 * Render a list of entity records as the CLI's `list` output (one line per entity, optionally filtered by entity type substring). Pure: every output byte is a function
 * of the inputs. The type filter is matched case-insensitively as a substring of `entity.type`, mirroring the loose-match behavior consumers expect from a CLI flag
 * (e.g., `--type sensor` matches both `sensor` and `binary_sensor`).
 *
 * @internal
 */
export function formatEntityList(entities: readonly EntityWithId[], typeFilter: Nullable<string> = null): string[] {

  const normalized = typeFilter?.toLowerCase() ?? null;
  const lines: string[] = [];

  for(const entity of entities) {

    if(normalized && !entity.type.toLowerCase().includes(normalized)) {

      continue;
    }
    lines.push("  [" + entity.type + "] " + entity.name + " (id: " + entity.id + ", key: " + entity.key.toString() + ")");
  }

  return lines;
}

/**
 * Read-command policy for 'list': print the discovered-entities banner and one line per entity (optionally type-filtered). Extracted from {@link handleList} so it is
 * unit-testable against {@link CliClient}. The `typeFilter` param replaces the handler's `commandOptions.type ?? null`, which the handler passes in.
 *
 * @internal
 */
export function runList(client: CliClient, printer: Printer, typeFilter: Nullable<string>): void {

  printer.info("Discovered Entities:");

  for(const line of formatEntityList(client.getEntitiesWithIds(), typeFilter)) {

    printer.data(line);
  }
}

// Command handler for 'list'.
async function handleList(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { commandOptions, options } = invocation;

  using client = await createClient(options, printer);

  runList(client, printer, commandOptions.type ?? null);
}

// Command handler for 'monitor'. Streams entity state changes until either the duration elapses or the user presses Ctrl+C. DisposableStack coordinates teardown of the
// client and the SIGINT handler in LIFO order on scope exit.
async function handleMonitor(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options, commandOptions } = invocation;

  // Validate the --duration flag at the boundary, before opening the connection, so a malformed value fails fast rather than after a live connect. The value (whole or
  // fractional seconds) has no dependency on the connected device; the monitor loop below bounds itself by it. Uses parseFloatOption to match watch and record, so
  // --duration is uniformly float-seconds across all three commands.
  const durationMs = commandOptions.duration ? Math.floor(parseFloatOption(commandOptions.duration, "--duration") * 1000) : undefined;

  using stack = new DisposableStack();
  const client = stack.use(await createClient(options, printer));

  printer.info("Monitoring entity state changes... Press Ctrl+C to stop.");

  // Set up telemetry listener for all entity updates. We filter by entity if --entity was supplied (matched by either numeric key or string ID). The strict-int parse
  // returns null for non-numeric input rather than NaN; the null guard then skips the key comparison instead of letting `entity.key !== NaN` always evaluate true.
  client.on("telemetry", (data) => {

    if(commandOptions.entity) {

      const entityKey = tryParseIntStrict(commandOptions.entity);
      const parsed = parseEntityId(commandOptions.entity);
      const entity = parsed ? client.getEntityById(parsed.id) : null;

      if(entity && (entityKey !== null) && (entity.key !== entityKey)) {

        return;
      }
    }

    printer.data("[" + new Date().toISOString() + "] " + (data.entity || "Unknown") + " (" + data.type + ", key: " + data.key.toString() + ") -> " +
      JSON.stringify(data));
  });

  // SIGINT triggers an AbortController that the duration timer (or the no-duration await) is racing against. We register the listener with `process.once` and also defer
  // an explicit `removeListener` - the explicit removal is a no-op if SIGINT already fired (cleaning up its own listener), but covers the path where the duration timer
  // wins the race and the listener would otherwise leak past function return.
  const sessionDone = new AbortController();
  const sigintHandler = (): void => {

    printer.info("Stopping monitor...");
    sessionDone.abort();
  };

  process.once("SIGINT", sigintHandler);
  stack.defer(() => process.removeListener("SIGINT", sigintHandler));

  if(durationMs !== undefined) {

    // Catch swallows the abort error - it's the expected termination, not a real failure.
    await delay(durationMs, undefined, { signal: sessionDone.signal }).catch((): undefined => undefined);
    printer.info("Monitor stopped.");
  } else if(!sessionDone.signal.aborted) {

    // Wait for SIGINT to abort the controller. Guarded by a synchronous check first because `once()` waits for the NEXT emission - if SIGINT fired between the listener
    // registration above and this await (single-tick race window), the abort event already fired and once() would hang forever.
    await once(sessionDone.signal, "abort");
  }
}

// Command handler for 'control' - universal entity control. Throws CliError for any user-facing failure (unknown entity, invalid input). The top-level catch prints the
// message and exits non-zero; `using` ensures the client is disconnected on every exit path.
async function handleControl(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options, commandArgs, commandOptions } = invocation;

  // `.at(0)` returns `string | undefined` regardless of the noUncheckedIndexedAccess compiler flag, so the runtime guard below is honest about bounds without
  // depending on tsconfig.
  const identifier = commandArgs.at(0);

  if(identifier === undefined) {

    throw new CliError("control command requires at least an entity identifier. Usage: espc --host <host> control <key|id> [args]");
  }

  // Fail-fast gate: when the identifier is a branded id (e.g. "climate-thermostat"), parseEntityId recovers its entity TYPE without the device, so the entire
  // device-independent command can be validated at the boundary - before opening a connection - mirroring the watch/monitor fail-fast move. We probe the schema-driven
  // builder against a synthetic entity carrying just that type: it surfaces a read-only entity, an invalid sub-command/mode, or a malformed value (--temp, dates, times,
  // siren --duration) now rather than after a connect+discovery round-trip. The result is discarded - executeControl rebuilds it against the real entity (for its
  // display name) post-connect. parseEntityId returns non-null only for a known entity type, so a numeric-key identifier (whose type the device alone resolves) skips the
  // gate and is necessarily validated post-connect; this is the one input class that cannot fail fast.
  const parsedIdentifier = parseEntityId(identifier);

  if(parsedIdentifier !== null) {

    buildControlCommand({ id: identifier, key: 0, name: identifier, type: parsedIdentifier.type }, commandArgs.slice(1), commandOptions);
  }

  using client = await createClient(options, printer);

  // Find entity by key or ID.
  const entities = client.getEntitiesWithIds();
  const entity = findEntity(entities, identifier);

  if(!entity) {

    throw new CliError("Entity '" + identifier + "' not found.");
  }

  executeControl({ client, commandArgs, commandOptions, entity, printer });
}

/**
 * The subset of entity types that carry a `command` block in {@link ENTITY_SCHEMAS} - the entities the ESPHome protocol lets us control. Derived from the schema so the
 * set tracks the registry automatically: adding a controllable entity type to `ENTITY_SCHEMAS` extends this union with no parallel list to maintain, and the
 * {@link CONTROL_BUILDERS} mapped type then forces a builder to exist for it. A missing builder is a compile error, not a silently-unsupported entity the user only
 * discovers at runtime.
 *
 * @internal
 */
export type ControllableEntityType = {

  [T in keyof typeof ENTITY_SCHEMAS]: typeof ENTITY_SCHEMAS[T] extends { command: unknown } ? T : never;
}[keyof typeof ENTITY_SCHEMAS];

/**
 * Context handed to every control builder: the resolved entity plus the user's positional argument tokens (everything after the entity identifier) and the parsed
 * command flags. Both the non-interactive `control` command and the interactive REPL populate this shape, so a single builder serves both surfaces.
 *
 * @internal
 */
export interface ControlContext {

  /**
   * Positional tokens following the entity identifier. For `control light-lamp on --brightness 80` this is `[ "on" ]`; for the REPL line `control light-lamp on 80`
   * it is `[ "on", "80" ]`.
   */
  readonly args: readonly string[];

  /**
   * The resolved entity (id, key, name, type).
   */
  readonly entity: EntityWithId;

  /**
   * Parsed command flags (`--brightness`, `--rgb`, `--duration`, ...). The REPL supplies an all-undefined set because it accepts positional arguments only.
   */
  readonly options: CommandOptions;
}

/**
 * The product of a control builder: the schema-typed command-options object to send plus a human-readable summary of the action for the {@link Printer}. Carrying the
 * summary alongside the options lets both the non-interactive and interactive callers render consistent feedback without re-deriving the per-type phrasing.
 *
 * @internal
 */
export interface BuiltCommand<T extends ControllableEntityType> {

  readonly options: CommandFor<typeof ENTITY_SCHEMAS[T]>;
  readonly summary: string;
}

/**
 * Translates a {@link ControlContext} into a {@link BuiltCommand} for one entity type, throwing {@link CliError} on any malformed or missing input. Each builder owns its
 * entity's argument grammar; the grammar genuinely diverges per type (a `switch` takes `on|off`, a `date` takes `YYYY-MM-DD`, an `alarm_control_panel` takes an
 * arm/disarm verb plus an optional code), so a per-type function reads more clearly than one table-driven parser - while the registry's mapped type still guarantees
 * coverage of every controllable entity.
 *
 * @internal
 */
export type ControlBuilder<T extends ControllableEntityType> = (context: ControlContext) => BuiltCommand<T>;

/**
 * The type-erased result of {@link buildControlCommand}. The options are fully schema-typed inside each builder (where the checking matters); at the dispatch boundary
 * the per-type link is gone, so the options surface as `unknown` and are bridged to the generic `command()` signature in exactly one place ({@link sendEntityCommand}).
 *
 * @internal
 */
export interface ResolvedControlCommand {

  readonly options: unknown;
  readonly summary: string;
}

/**
 * Empty command-flag set the interactive REPL passes to {@link buildControlCommand}. The REPL parses positional arguments only, so every flag is absent; the builders
 * that read flags (light, siren) simply see no overrides.
 *
 * @internal
 */
const EMPTY_COMMAND_OPTIONS: CommandOptions = {

  brightness: undefined,
  duration:   undefined,
  effect:     undefined,
  entity:     undefined,
  rgb:        undefined,
  state:      undefined,
  temp:       undefined,
  type:       undefined,
  wait:       undefined
};

/**
 * Schema-derived enum vocabularies for the control builders. Each set is the exact key set of the corresponding `enumMappings` table, typed as the literal-name union so
 * {@link parseEnumArg} returns the precise member type the schema-derived {@link CommandFor} shape expects. Adding a value to a schema enum extends the CLI's accepted
 * vocabulary with no parallel list to maintain - the same SSOT pattern {@link CLIMATE_MODE_NAMES} already uses for climate modes.
 */
type AlarmCommandName = keyof typeof ENTITY_SCHEMAS["alarm_control_panel"]["command"]["enumMappings"]["command"];
type LockCommandName = keyof typeof ENTITY_SCHEMAS["lock"]["command"]["enumMappings"]["command"];
type UpdateCommandName = keyof typeof ENTITY_SCHEMAS["update"]["command"]["enumMappings"]["command"];
type WaterHeaterModeName = keyof typeof ENTITY_SCHEMAS["water_heater"]["command"]["enumMappings"]["mode"];

const ALARM_COMMAND_NAMES = new Set(Object.keys(ENTITY_SCHEMAS.alarm_control_panel.command.enumMappings.command) as AlarmCommandName[]);
const LOCK_COMMAND_NAMES = new Set(Object.keys(ENTITY_SCHEMAS.lock.command.enumMappings.command) as LockCommandName[]);
const UPDATE_COMMAND_NAMES = new Set(Object.keys(ENTITY_SCHEMAS.update.command.enumMappings.command) as UpdateCommandName[]);
const WATER_HEATER_MODE_NAMES = new Set(Object.keys(ENTITY_SCHEMAS.water_heater.command.enumMappings.mode) as WaterHeaterModeName[]);

/**
 * Media-player commands keyed by lowercased verb. The media-player command field has no `enumMappings` in the schema (its public command-options type is plain
 * `number`), so the CLI maps friendly verbs to the numeric {@link MediaPlayerCommand} values here rather than passing a name string the encoder would not recognize.
 */
const MEDIA_PLAYER_COMMAND_BY_NAME: ReadonlyMap<string, number> = new Map(Object.entries(MediaPlayerCommand).map(([ name, value ]) => [ name.toLowerCase(), value ]));

/**
 * Parse an on/off token into a boolean, throwing a typed {@link CliError} that names the entity-type label on anything else. Accepts case-insensitive "on"/"off".
 *
 * @internal
 */
function parseOnOff(value: string | undefined, label: string): boolean {

  switch(value?.toLowerCase()) {

    case "on": {

      return true;
    }

    case "off": {

      return false;
    }

    default: {

      throw new CliError(label + " requires 'on' or 'off'.");
    }
  }
}

/**
 * Validate that a token is a member of a schema-derived enum vocabulary, returning the lowercased member name narrowed to the vocabulary's literal type. Throws a
 * {@link CliError} listing the accepted values otherwise. The accepted set comes straight from the schema's `enumMappings`, so the CLI's vocabulary tracks the protocol.
 *
 * @internal
 */
function parseEnumArg<K extends string>(value: string | undefined, vocabulary: ReadonlySet<K>, label: string): K {

  const name = value?.toLowerCase();

  if((name !== undefined) && (vocabulary as ReadonlySet<string>).has(name)) {

    return name as K;
  }

  throw new CliError(label + " requires one of: " + [...vocabulary].sort().join(", ") + ".");
}

/**
 * Require a positional argument at `index`, throwing a {@link CliError} carrying `message` when it is absent.
 *
 * @internal
 */
function requireArg(args: readonly string[], index: number, message: string): string {

  const value = args.at(index);

  if(value === undefined) {

    throw new CliError(message);
  }

  return value;
}

/**
 * Parse a `YYYY-MM-DD` token into the date command's component fields. Each component is validated as a strict integer; a missing or malformed component throws a
 * {@link CliError} naming the offending part.
 *
 * @internal
 */
function parseDateArg(value: string): { day: number; month: number; year: number } {

  const parts = value.split("-");

  if(parts.length !== 3) {

    throw new CliError("Date entity requires a value in YYYY-MM-DD form. Example: 2026-05-23.");
  }

  return { day: parseIntOption(parts[2] ?? "", "date day"), month: parseIntOption(parts[1] ?? "", "date month"), year: parseIntOption(parts[0] ?? "", "date year") };
}

/**
 * Parse an `HH:MM` or `HH:MM:SS` token into the time command's component fields. Seconds default to zero when omitted. Each component is validated as a strict integer.
 *
 * @internal
 */
function parseTimeArg(value: string): { hour: number; minute: number; second: number } {

  const parts = value.split(":");

  if((parts.length < 2) || (parts.length > 3)) {

    throw new CliError("Time entity requires a value in HH:MM or HH:MM:SS form. Example: 18:30 or 18:30:15.");
  }

  return {

    hour:   parseIntOption(parts[0] ?? "", "time hour"),
    minute: parseIntOption(parts[1] ?? "", "time minute"),
    second: (parts.length === 3) ? parseIntOption(parts[2] ?? "", "time second") : 0
  };
}

/**
 * Parse a datetime token into epoch seconds. Accepts either a strict integer epoch-seconds value or any timestamp `Date` can parse (e.g. an ISO-8601 string), in which
 * case the result is floored to whole seconds. Throws a {@link CliError} on anything else.
 *
 * @internal
 */
function parseEpochArg(value: string): number {

  const asInt = tryParseIntStrict(value);

  if(asInt !== null) {

    return asInt;
  }

  const asDate = new Date(value);

  if(Number.isNaN(asDate.getTime())) {

    throw new CliError("Datetime entity requires epoch seconds or an ISO-8601 timestamp. Example: 1748044800 or 2026-05-23T12:00:00Z.");
  }

  return Math.floor(asDate.getTime() / 1000);
}

/**
 * Parse a comma-separated list of signed raw timings (microseconds) into a number array. Each token is validated as a strict integer so a malformed entry fails loudly
 * rather than silently encoding a zero. Used by both the infrared and radio-frequency transmit builders.
 *
 * @internal
 */
function parseTimingsArg(value: string): number[] {

  return value.split(",").map((token, index) => parseIntOption(token.trim(), "timing #" + String(index + 1)));
}

/**
 * Parse the shared transmit grammar for the infrared and radio-frequency entities, which reuse the same wire message: a required comma-separated raw-timings list,
 * followed by an optional carrier frequency and repeat count. Returned as a structural shape assignable to either entity's {@link CommandFor} command-options type.
 *
 * @internal
 */
function parseTransmitArgs(args: readonly string[], label: string): { carrierFrequency?: number; repeatCount?: number; timings: number[] } {

  const timings = parseTimingsArg(requireArg(args, 0, label + " transmit requires comma-separated raw timings. Example: 9000,-4500,560,-560."));
  const result: { carrierFrequency?: number; repeatCount?: number; timings: number[] } = { timings };
  const carrier = args.at(1);

  if(carrier !== undefined) {

    result.carrierFrequency = parseIntOption(carrier, label + " carrier frequency");
  }

  const repeat = args.at(2);

  if(repeat !== undefined) {

    result.repeatCount = parseIntOption(repeat, label + " repeat count");
  }

  return result;
}

/**
 * Schema-exhaustive registry of per-entity-type control builders. The mapped type `{ [T in ControllableEntityType]: ControlBuilder<T> }` is the architectural guarantee:
 * every entity type with a command block in {@link ENTITY_SCHEMAS} MUST have an entry, or the file fails to compile. Adding a new controllable entity type to the schema
 * surfaces here as a missing-property error rather than as a silently-unsupported entity discovered at runtime. Both the non-interactive `control` command
 * ({@link executeControl}) and the interactive REPL ({@link runInteractiveControl}) dispatch through this one table, so the two surfaces can never drift in coverage.
 *
 * @internal
 */
/* eslint-disable camelcase */
export const CONTROL_BUILDERS: { readonly [T in ControllableEntityType]: ControlBuilder<T> } = {

  alarm_control_panel: ({ args, entity }) => {

    const command = parseEnumArg(args.at(0), ALARM_COMMAND_NAMES, "Alarm control panel");
    const code = args.at(1);
    const options: Mutable<CommandFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>> = { command };

    if(code !== undefined) {

      options.code = code;
    }

    return { options, summary: "Sending " + command + " to alarm " + entity.name };
  },

  button: ({ entity }) => ({ options: {}, summary: "Pressing button " + entity.name }),

  climate: ({ args, entity }) => {

    const mode = args.at(0)?.toLowerCase();

    if((mode === undefined) || !isClimateMode(mode)) {

      throw new CliError("Climate entity requires a valid mode (one of: " + [...CLIMATE_MODE_NAMES].join(", ") + ").");
    }

    return { options: { mode }, summary: "Setting climate " + entity.name + " to mode " + mode };
  },

  cover: ({ args, entity }) => {

    switch(args.at(0)?.toLowerCase()) {

      case "open": {

        return { options: { position: 1 }, summary: "Opening cover " + entity.name };
      }

      case "close": {

        return { options: { position: 0 }, summary: "Closing cover " + entity.name };
      }

      case "stop": {

        return { options: { stop: true }, summary: "Stopping cover " + entity.name };
      }

      default: {

        throw new CliError("Cover requires 'open', 'close', or 'stop'.");
      }
    }
  },

  date: ({ args, entity }) => {

    const value = requireArg(args, 0, "Date entity requires a value in YYYY-MM-DD form.");

    return { options: parseDateArg(value), summary: "Setting date " + entity.name + " to " + value };
  },

  datetime: ({ args, entity }) => {

    const value = requireArg(args, 0, "Datetime entity requires epoch seconds or an ISO-8601 timestamp.");
    const epochSeconds = parseEpochArg(value);

    return { options: { epochSeconds }, summary: "Setting datetime " + entity.name + " to epoch " + String(epochSeconds) };
  },

  fan: ({ args, entity }) => {

    const state = parseOnOff(args.at(0), "Fan");

    return { options: { state }, summary: "Turning fan " + entity.name + " " + (state ? "ON" : "OFF") };
  },

  infrared: ({ args, entity }) => {

    const options = parseTransmitArgs(args, "IR");

    return { options, summary: "Transmitting " + String(options.timings.length) + " IR timings via " + entity.name };
  },

  light: ({ args, entity, options }) => {

    const lightCommand: LightCommandOptions = {};
    const positional = args.at(0)?.toLowerCase();

    if((positional === "on") || (positional === "off")) {

      lightCommand.state = positional === "on";
    }

    if(options.state) {

      lightCommand.state = options.state.toLowerCase() === "on";
    }

    // REPL parity: a positional brightness percentage after the on/off verb sets brightness, preserving the interactive surface's `light <id> on 80` grammar.
    const positionalBrightness = args.at(1);

    if(positionalBrightness !== undefined) {

      lightCommand.brightness = parsePercent(positionalBrightness, "light brightness");
    }

    if(options.brightness) {

      lightCommand.brightness = parsePercent(options.brightness, "--brightness");
    }

    if(options.rgb) {

      // Color follows the universal 0-255 / hex convention, not the percentage scale. parseRgb returns { r, g, b } as 0.0-1.0 fractions; the runtime adapter expands
      // them into the wire-side flat red/green/blue fields before encoding.
      lightCommand.rgb = parseRgb(options.rgb, "--rgb");
    }

    if(options.temp) {

      lightCommand.colorTemperature = parseIntOption(options.temp, "--temp");
    }

    if(options.effect) {

      lightCommand.effect = options.effect;
    }

    return { options: lightCommand, summary: "Sending light command to " + entity.name };
  },

  lock: ({ args, entity }) => {

    const command = parseEnumArg(args.at(0), LOCK_COMMAND_NAMES, "Lock");
    const code = args.at(1);
    const options: Mutable<CommandFor<typeof ENTITY_SCHEMAS["lock"]>> = { command };

    if(code !== undefined) {

      options.code = code;
    }

    return { options, summary: "Sending " + command + " command to " + entity.name };
  },

  media_player: ({ args, entity }) => {

    const verb = requireArg(args, 0, "Media player requires a command (e.g. play, pause, stop, volume).").toLowerCase();

    if(verb === "volume") {

      const level = requireArg(args, 1, "Media player volume requires a percentage between 0 and 100.");
      const volume = parsePercent(level, "media player volume");

      return { options: { volume }, summary: "Setting media player " + entity.name + " volume to " + level + "%" };
    }

    const command = MEDIA_PLAYER_COMMAND_BY_NAME.get(verb);

    if(command === undefined) {

      throw new CliError("Media player requires one of: " + [...MEDIA_PLAYER_COMMAND_BY_NAME.keys()].sort().join(", ") + ", volume.");
    }

    return { options: { command }, summary: "Sending " + verb + " to media player " + entity.name };
  },

  number: ({ args, entity }) => {

    const state = parseFloatOption(requireArg(args, 0, "Number entity requires a value."), "number value");

    return { options: { state }, summary: "Setting number " + entity.name + " to " + String(state) };
  },

  radio_frequency: ({ args, entity }) => {

    const options = parseTransmitArgs(args, "RF");

    return { options, summary: "Transmitting " + String(options.timings.length) + " RF timings via " + entity.name };
  },

  select: ({ args, entity }) => {

    const state = args.join(" ");

    if(!state) {

      throw new CliError("Select entity requires an option value.");
    }

    return { options: { state }, summary: "Setting select " + entity.name + " to '" + state + "'" };
  },

  siren: ({ args, entity, options }) => {

    const state = parseOnOff(args.at(0), "Siren");
    const sirenOptions: Mutable<CommandFor<typeof ENTITY_SCHEMAS["siren"]>> = { state };

    // An optional tone name follows the on/off verb; the shared --duration flag (whole seconds) is honored when present.
    const tone = args.at(1);

    if(tone !== undefined) {

      sirenOptions.tone = tone;
    }

    if(options.duration) {

      sirenOptions.duration = parseIntOption(options.duration, "--duration");
    }

    return { options: sirenOptions, summary: "Turning siren " + entity.name + " " + (state ? "ON" : "OFF") };
  },

  switch: ({ args, entity }) => {

    const state = parseOnOff(args.at(0), "Switch");

    return { options: { state }, summary: "Turning " + entity.name + " " + (state ? "ON" : "OFF") };
  },

  text: ({ args, entity }) => {

    const state = args.join(" ");

    if(!state) {

      throw new CliError("Text entity requires text value.");
    }

    return { options: { state }, summary: "Setting text " + entity.name + " to '" + state + "'" };
  },

  time: ({ args, entity }) => {

    const value = requireArg(args, 0, "Time entity requires a value in HH:MM or HH:MM:SS form.");

    return { options: parseTimeArg(value), summary: "Setting time " + entity.name + " to " + value };
  },

  update: ({ args, entity }) => {

    // The friendly verb "install" is accepted as an alias for the protocol's "update" command name.
    const raw = args.at(0)?.toLowerCase();
    const command = parseEnumArg((raw === "install") ? "update" : raw, UPDATE_COMMAND_NAMES, "Update");

    return { options: { command }, summary: "Sending " + command + " to update " + entity.name };
  },

  valve: ({ args, entity }) => {

    switch(args.at(0)?.toLowerCase()) {

      case "open": {

        return { options: { position: 1 }, summary: "Opening valve " + entity.name };
      }

      case "close": {

        return { options: { position: 0 }, summary: "Closing valve " + entity.name };
      }

      case "stop": {

        return { options: { stop: true }, summary: "Stopping valve " + entity.name };
      }

      default: {

        throw new CliError("Valve requires 'open', 'close', or 'stop'.");
      }
    }
  },

  water_heater: ({ args, entity }) => {

    const mode = parseEnumArg(args.at(0), WATER_HEATER_MODE_NAMES, "Water heater");
    const options: Mutable<CommandFor<typeof ENTITY_SCHEMAS["water_heater"]>> = { mode };
    const target = args.at(1);

    if(target !== undefined) {

      options.targetTemperature = parseFloatOption(target, "water heater target temperature");
    }

    return { options, summary: "Setting water heater " + entity.name + " to mode " + mode };
  }
};
/* eslint-enable camelcase */

/**
 * Type guard: is `type` a controllable entity type (one with a command block in {@link ENTITY_SCHEMAS})? Drives the read-only-vs-controllable decision in
 * {@link buildControlCommand} straight from the schema, so read-only classification never drifts from the registry.
 *
 * @internal
 */
export function isControllableType(type: string): type is ControllableEntityType {

  // The preceding Object.hasOwn check guarantees that `type` is a key of ENTITY_SCHEMAS at runtime; the cast documents that guarantee to the type checker, which
  // cannot narrow a plain string through Object.hasOwn on its own.
  return Object.hasOwn(ENTITY_SCHEMAS, type) && Object.hasOwn(ENTITY_SCHEMAS[type as keyof typeof ENTITY_SCHEMAS], "command");
}

/**
 * Resolve and run the control builder for an entity, returning the command options to send plus an action summary. Throws {@link CliError} for unknown entity types,
 * read-only entities (no command block in the schema), and any per-builder input violation. This is the single translation point both control surfaces share, which is
 * what keeps the non-interactive and interactive grammars from diverging.
 *
 * @internal
 */
export function buildControlCommand(entity: EntityWithId, args: readonly string[], options: CommandOptions): ResolvedControlCommand {

  const type = entity.type.toLowerCase();

  if(!Object.hasOwn(ENTITY_SCHEMAS, type)) {

    throw new CliError("Unknown entity type '" + entity.type + "'.");
  }

  if(!isControllableType(type)) {

    throw new CliError(entity.type + " entities are read-only and cannot be controlled.");
  }

  // Indexing the registry with the runtime-narrowed type yields the union of builder signatures; the single cast lets us invoke it with the shared context. The
  // narrowing above guarantees the key is present, so this is a total lookup.
  const builder = CONTROL_BUILDERS[type] as ControlBuilder<ControllableEntityType>;

  return builder({ args, entity, options });
}

/**
 * Send a resolved command's options to the device. This is the one place that bridges the type-erased {@link ResolvedControlCommand} options to the generic
 * `command()` signature: {@link buildControlCommand} has already validated the options against the entity's schema, but the compiler cannot re-derive that link
 * through the runtime-narrowed type, so the cast lives here and nowhere else.
 *
 * @internal
 */
export function sendEntityCommand(client: ControlClient, entity: EntityWithId, options: unknown): void {

  (client.command as (id: string, commandOptions: unknown) => void)(entity.id, options);
}

/**
 * Options for {@link executeControl}.
 *
 * @internal
 */
export interface ExecuteControlInput {

  /**
   * The control-surface client (real {@link EspHomeClient} or a {@link MockClient}). Used to send the assembled entity command.
   */
  client: ControlClient;

  /**
   * Raw positional command arguments from the CLI (entity id first, per-type sub-command following).
   */
  commandArgs: readonly string[];

  /**
   * Parsed flag options from the CLI (`--brightness`, `--rgb`, etc.).
   */
  commandOptions: CommandOptions;

  /**
   * The resolved entity record (entity id, type, name, etc.). Resolved earlier in the dispatch chain.
   */
  entity: EntityWithId;

  /**
   * The output printer for success / structured-data lines.
   */
  printer: Printer;
}

/**
 * Non-interactive `control` command dispatch. Delegates to the schema-exhaustive {@link CONTROL_BUILDERS} registry via {@link buildControlCommand}, prints the action
 * summary, sends the command, then reports completion with `success("Command sent.")`. Throws {@link CliError} on user input violations (read-only entities, unknown
 * types, malformed values, missing positional args); the caller `handleControl` propagates through the top-level catch so the process exits non-zero with a clean
 * message. Coverage of every controllable entity type is guaranteed by the registry's mapped type.
 *
 * @internal
 */
export function executeControl(input: ExecuteControlInput): void {

  const { client, commandArgs, commandOptions, entity, printer } = input;
  const { options, summary } = buildControlCommand(entity, commandArgs.slice(1), commandOptions);

  printer.info(summary + "...");
  sendEntityCommand(client, entity, options);
  printer.success("Command sent.");
}

/**
 * Print the help text for the interactive REPL. Output flows through the supplied {@link Printer} so tests capture lines via the IO seam rather than monkey-patching
 * `console`.
 *
 * @internal
 */
export function printInteractiveHelp(printer: Printer): void {

  printer.info("Available commands:");
  printer.info("  help                    - Show this help message");
  printer.info("  info                    - Display device information");
  printer.info("  list                    - List all discovered entities");
  printer.info("  control <key|id> [args] - Control an entity (type auto-detected)");
  printer.info("    Examples:");
  printer.info("      control bedroom_light on");
  printer.info("      control 5 off");
  printer.info("      control my_light on 80");
  printer.info("      control my_cover open");
  printer.info("  quit, exit              - Disconnect and exit");
}

/**
 * Dispatch a single REPL command line. Returns `false` when the user typed `quit`/`exit` (the loop should terminate), `true` for every other input. Unknown commands
 * print a one-line warning and return `true` so the REPL stays alive across typos.
 *
 * @internal
 */
export function handleInteractiveCommand(line: string, client: ControlClient, printer: Printer): boolean {

  const parts = line.trim().split(" ");

  // String.prototype.split always returns at least one element, so `.at(0)` is never undefined here. Use `?? ""` to satisfy the type system without claiming knowledge
  // it doesn't have.
  const cmd = parts.at(0) ?? "";

  switch(cmd) {

    case "":

      return true;

    case "help": {

      printInteractiveHelp(printer);

      return true;
    }

    case "info": {

      const info = client.deviceInfo();

      if(info) {

        printer.data(formatDeviceInfo(info));
      } else {

        printer.warn("Device information not available.");
      }

      return true;
    }

    case "list": {

      printer.info("Entities:");

      for(const entity of client.getEntitiesWithIds()) {

        printer.data("  [" + entity.type + "] " + entity.name + " (id: " + entity.id + ", key: " + entity.key.toString() + ")");
      }

      return true;
    }

    case "control": {

      runInteractiveControl(parts, client, printer);

      return true;
    }

    case "quit":
    case "exit":

      return false;

    default: {

      printer.warn("Unknown command: " + cmd + ". Type 'help' for the command list.");

      return true;
    }
  }
}

/**
 * REPL `control` command dispatch. Shares the schema-exhaustive {@link CONTROL_BUILDERS} registry with {@link executeControl} via {@link buildControlCommand}, so the
 * interactive and non-interactive surfaces can never drift in entity-type coverage. The only behavioral difference is failure handling: a {@link CliError} from a
 * builder is reported via `printer.error()` and the loop continues, rather than propagating to a top-level catch.
 *
 * @internal
 */
export function runInteractiveControl(parts: string[], client: ControlClient, printer: Printer): void {

  // parts[0] is the literal "control"; parts[1] is the identifier; the remainder are the entity's positional arguments. Under noUncheckedIndexedAccess parts[1] is
  // `string | undefined`, so we narrow via `if(!identifier)` to give the type checker the runtime guarantee.
  const [ , identifier ] = parts;

  if((parts.length < 2) || !identifier) {

    printer.warn("Usage: control <key|id> [args]");

    return;
  }

  const entity = findEntity(client.getEntitiesWithIds(), identifier);

  if(!entity) {

    printer.error("Entity '" + identifier + "' not found.");

    return;
  }

  try {

    const { options, summary } = buildControlCommand(entity, parts.slice(2), EMPTY_COMMAND_OPTIONS);

    sendEntityCommand(client, entity, options);
    printer.success(summary);
  } catch(error) {

    // A CliError is a user-input problem (bad verb, missing value, read-only entity); report it and keep the REPL alive. Anything else is a real fault and propagates.
    if(error instanceof CliError) {

      printer.error(error.message);

      return;
    }

    throw error;
  }
}

// Command handler for 'interactive'. Hosts an async input loop driven by readline/promises; telemetry interleaves cleanly through the Printer's coordination logic.
// DisposableStack coordinates teardown of the following resources in LIFO order on scope exit: SIGINT listener removal, printer detach, readline close, client
// disconnect.
async function handleInteractive(invocation: CommandInvocation, printer: Printer): Promise<void> {

  const { options } = invocation;

  using stack = new DisposableStack();
  const client = stack.use(await createClient(options, printer));

  printer.info("Connected to ESPHome device. Entering interactive mode...");
  printer.info("Type 'help' for available commands.");

  // The readline/promises Interface drives the input loop via async iteration. Binding it to the Printer enables the clear/write/restore dance for telemetry that
  // arrives while the user is mid-typing. Both bindings are deferred to the stack so they tear down in the right order regardless of how we exit.
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "espc> " });

  stack.defer(() => { rl.close(); });
  printer.attachReadline(rl);
  stack.defer(() => { printer.attachReadline(null); });

  client.on("telemetry", (data) => {

    printer.data("[TELEMETRY] " + (data.entity || "Unknown") + " (" + data.type + ") -> " + JSON.stringify(data));
  });

  // Ctrl+C and Ctrl+D both terminate the REPL gracefully. SIGINT closes the readline; the for-await loop then completes naturally and the stack tears everything down.
  // The deferred removeListener handles the path where the user exits via "quit" or Ctrl+D and SIGINT never fires.
  const sigintHandler = (): void => {

    printer.info("");
    rl.close();
  };

  process.once("SIGINT", sigintHandler);
  stack.defer(() => process.removeListener("SIGINT", sigintHandler));

  // Brief delay so the initial entity-discovery telemetry (if any) prints before the prompt appears.
  await delay(100);
  rl.prompt();

  for await (const line of rl) {

    const shouldContinue = handleInteractiveCommand(line, client, printer);

    if(!shouldContinue) {

      printer.info("Disconnecting...");

      break;
    }
    rl.prompt();
  }
}

/**
 * Shape of a single command in the CLI registry. Every command declares its description, usage, optional detailed-usage block (for commands with subcommand-like
 * syntax such as `control`), at least one example, and the handler function. Tests assert this shape directly to verify every registry entry is well-formed.
 *
 * @internal
 */
export interface CliCommand {

  readonly description: string;
  readonly detailedUsage?: readonly string[];
  readonly examples: readonly string[];
  readonly handler: CommandHandler;
  readonly usage: string;
}

/**
 * Uniform handler signature shared by every command in {@link CLI_COMMANDS}. Each handler takes the typed invocation and the {@link Printer} and returns a promise
 * that resolves on success or rejects with {@link CliError} (or another `Error` subclass for internal bugs).
 *
 * @internal
 */
export type CommandHandler = (invocation: CommandInvocation, printer: Printer) => Promise<void>;

/**
 * Single source of truth for the CLI's command surface. The parser narrows positional command names against this table, the dispatcher routes to `handler` here, and
 * the help renderer iterates this table to render descriptions and examples. Adding a command is a one-line table extension; removing one drops every consumer's
 * reference automatically.
 *
 * @internal
 */
export const CLI_COMMANDS = {

  capabilities: {

    description: "Pretty-print the structured capability record",
    examples: ["espc --host 192.168.1.100 capabilities"],
    handler: handleCapabilities,
    usage: "espc -h <host> capabilities"
  },
  control: {

    description: "Send command to any entity (type auto-detected)",
    detailedUsage: [

      // One line per controllable entity type, anchored on the canonical type id (the same token `list` prints and that prefixes an entity id). A test asserts every
      // controllable type in ENTITY_SCHEMAS appears here, so this documentation cannot silently fall behind the dispatch registry when a new type is added.
      "alarm_control_panel:  arm_away|arm_home|arm_night|arm_vacation|arm_custom_bypass|disarm|trigger [code]",
      "button:               (no args, just press)",
      "climate:              off|heat|cool|auto|dry|fan_only|heat_cool",
      "cover:                open|close|stop",
      "date:                 <YYYY-MM-DD>",
      "datetime:             <epoch-seconds|ISO-8601>",
      "fan:                  on|off",
      "infrared:             <timings-csv> [carrier-hz] [repeat-count]",
      "light:                <on|off> or [options]",
      "  --state <on|off>     Turn light on/off",
      "  --brightness <0-100> Set brightness (percent)",
      "  --rgb <#RRGGBB|R,G,B> Set RGB color (hex, or three 0-255 channels)",
      "  --temp <mireds>      Set color temperature",
      "  --effect <name>      Set light effect",
      "lock:                 lock|unlock|open [code]",
      "media_player:         play|pause|stop|mute|unmute|toggle|volume <0-100>|...",
      "number:               <value>",
      "radio_frequency:      <timings-csv> [carrier-hz] [repeat-count]",
      "select:               <option>",
      "siren:                on|off [tone]   (use --duration <seconds>)",
      "switch:               <on|off>",
      "text:                 <text value>",
      "time:                 <HH:MM[:SS]>",
      "update:               check|install",
      "valve:                open|close|stop",
      "water_heater:         <mode> [target-temperature]"
    ],
    examples: [

      "espc --host 192.168.1.100 control bedroom_light on",
      "espc --host 192.168.1.100 control 5 on",
      "espc --host 192.168.1.100 control my_light --brightness 80 --rgb 255,0,128"
    ],
    handler: handleControl,
    usage: "espc -h <host> control <key|id> [args]"
  },
  devices: {

    description: "List sub-devices on a multi-device parent ESP and their entity counts",
    examples: ["espc --host 192.168.1.100 devices"],
    handler: handleDevices,
    usage: "espc -h <host> devices"
  },
  info: {

    description: "Get device information",
    examples: ["espc --host 192.168.1.100 info"],
    handler: handleInfo,
    usage: "espc -h <host> info"
  },
  interactive: {

    description: "Enter interactive REPL mode (-i is sugar for this command)",
    examples: [ "espc -h 192.168.1.100 -i", "espc -h 192.168.1.100 interactive" ],
    handler: handleInteractive,
    usage: "espc -h <host> -i  (or: espc -h <host> interactive)"
  },
  list: {

    description: "List all discovered entities (optionally filtered by --type)",
    examples: [ "espc --host esp-device.local --psk MySecret123 list", "espc --host esp.local list --type light" ],
    handler: handleList,
    usage: "espc -h <host> list [--type <type>]"
  },
  monitor: {

    description: "Monitor entity state changes in real-time",
    examples: ["espc --host esp-device.local monitor --duration 60"],
    handler: handleMonitor,
    usage: "espc -h <host> monitor [--entity <key|id>] [--duration <seconds>]"
  },
  record: {

    description: "Record a live device session to a capture file (and a PII-scrubbed metadata file)",
    examples: ["espc -h 192.168.1.100 record captures/my-device.bin --duration 30"],
    handler: handleRecord,
    usage: "espc -h <host> record <output-file.bin> [scenario] [--duration <seconds>]"
  },
  replay: {

    description: "Replay a captured device session through MockTransport and report what the host observed",
    examples: ["espc replay captures/my-device.bin"],
    handler: handleReplay,
    usage: "espc replay <capture-file>"
  },
  snapshot: {

    description: "Dump the latest-state cache as JSON (filterable by --type). Waits for the state stream to settle, or a fixed --wait window.",
    examples: [ "espc --host 192.168.1.100 snapshot", "espc --host 192.168.1.100 snapshot --type sensor", "espc --host 192.168.1.100 snapshot --wait 3" ],
    handler: handleSnapshot,
    usage: "espc -h <host> snapshot [--type <type>] [--wait <seconds>]"
  },
  watch: {

    description: "Stream events for a single entity until Ctrl+C or --duration expires",
    examples: [ "espc --host 192.168.1.100 watch light-bedroom_lamp", "espc --host esp.local watch sensor-temperature --duration 30" ],
    handler: handleWatch,
    usage: "espc -h <host> watch <id|key|name> [--duration <seconds>]"
  }
} as const satisfies Record<string, CliCommand>;

/**
 * Union of every command name accepted by the CLI. Derived from {@link CLI_COMMANDS} so adding/removing a command updates the type automatically.
 *
 * @internal
 */
export type CommandName = keyof typeof CLI_COMMANDS;

/**
 * Discriminated union describing every valid CLI invocation. The parser produces exactly one of these variants; the dispatcher's exhaustiveness check (the
 * `_exhaustive: never` assignment) guarantees every variant is handled.
 *
 * @internal
 */
export type Invocation = { kind: "help" } | CommandInvocation;

/**
 * Concrete invocation variant for an actionable command. Carries the resolved command name, the post-command positional args, the command-scoped flags, and the
 * global options.
 *
 * @internal
 */
export interface CommandInvocation {

  command: CommandName;
  commandArgs: string[];
  commandOptions: CommandOptions;
  kind: "command";
  options: ParsedOptions;
}

/**
 * Type predicate that narrows a runtime string to a {@link CommandName}. Used by {@link parseInvocation} after positional resolution. Uses `Object.hasOwn` rather than
 * the `in` operator so prototype-chain keys (`__proto__`, `toString`, `hasOwnProperty`) are correctly rejected as unknown commands instead of crashing the dispatcher
 * downstream when it tries to invoke `.handler` on a non-spec value.
 *
 * @internal
 */
export function isCommandName(value: string): value is CommandName {

  return Object.hasOwn(CLI_COMMANDS, value);
}

// Parse process.argv into a typed Invocation. The -i flag is sugar for the `interactive` command name - resolving it here means the rest of the program treats the two
// invocation forms identically. The help kind is only chosen when there is genuinely no actionable input (no command, no -i, no other positional), so an empty argv
// reliably routes to help rather than falling through into an undefined-command path.
/**
 * Parse the CLI invocation from a list of argv tokens. Defaults to `process.argv.slice(2)` when `argv` is omitted, matching production behaviour. Exposed for
 * direct unit testing without spawning a subprocess.
 *
 * @internal
 */
export function parseInvocation(argv: readonly string[] = process.argv.slice(2)): Invocation {

  const { positionals, values } = parseArgs({

    allowPositionals: true,
    args: argv as string[],
    options: CLI_OPTIONS,
    strict: true
  });

  if(values.help) {

    return { kind: "help" };
  }

  // Resolve the command name. Explicit positional wins; -i flag is sugar for the "interactive" command. If neither is present, fall back to help.
  // Use `.at(0)` instead of `[0]` so the type system sees the possibility of undefined - this CLI ships without `noUncheckedIndexedAccess`, but `.at()` is honest about
  // bounds regardless of that compiler flag.
  const explicit = positionals.at(0);
  const fromFlag = values.interactive ? "interactive" : undefined;
  const commandName = explicit ?? fromFlag;

  if(commandName === undefined) {

    return { kind: "help" };
  }

  if(!isCommandName(commandName)) {

    throw new CliError("Unknown command: " + commandName + ". Run 'espc --help' for usage.");
  }

  // commandArgs are positionals after the explicit command (if there was one). When the user used the -i flag instead of a positional command, every positional is a
  // command-arg.
  const commandArgs = explicit !== undefined ? positionals.slice(1) : positionals.slice(0);

  return {

    command: commandName,
    commandArgs,
    commandOptions: {

      brightness: values.brightness,
      duration: values.duration,
      effect: values.effect,
      entity: values.entity,
      rgb: values.rgb,
      state: values.state,
      temp: values.temp,
      type: values.type,
      wait: values.wait
    },
    kind: "command",
    options: {

      host: values.host ?? null,
      keepAlive: values["keep-alive"],
      port: values.port ? parseIntOption(values.port, "--port") : 6053,
      psk: values.psk,
      reconnect: values.reconnect,
      verbose: values.verbose ?? false
    }
  };
}

/**
 * Dispatch a parsed {@link Invocation} to the corresponding side effect. `command` invocations route through the {@link CLI_COMMANDS} registry; `help` invocations
 * render the help text. The exhaustiveness check on the switch's default branch ensures a new {@link Invocation} variant cannot ship without an explicit dispatch.
 *
 * @internal
 */
export async function dispatch(invocation: Invocation, printer: Printer): Promise<void> {

  switch(invocation.kind) {

    case "command": {

      return CLI_COMMANDS[invocation.command].handler(invocation, printer);
    }

    case "help": {

      showUsage(printer);

      return;
    }

    default: {

      const _exhaustive: never = invocation;

      throw new Error("Unhandled invocation kind: " + JSON.stringify(_exhaustive));
    }
  }
}

/**
 * Render the help text by iterating {@link CLI_COMMANDS}. Output flows through the supplied {@link Printer} so tests capture lines via the IO seam; adding or removing
 * a command updates the help automatically because the registry is the contract.
 *
 * @internal
 */
export function showUsage(printer: Printer): void {

  printer.info("espc - ESPHome Client CLI Utility");
  printer.info("");
  printer.info("Usage: espc [options] <command> [command-options]");
  printer.info("");
  printer.info("Global Options:");
  printer.info("  -h, --host <host>       ESPHome device hostname or IP address (required)");
  printer.info("  -p, --port <port>       Port number (default: 6053)");
  printer.info("  -k, --psk <psk>         Pre-shared key for encryption");
  printer.info("  -v, --verbose           Enable verbose debug output");
  printer.info("  -i, --interactive       Enter interactive mode (sugar for the 'interactive' command)");
  printer.info("  --help                  Show this help message");
  printer.info("");
  printer.info("Commands:");

  // Cast at the iteration boundary to widen the literal-typed registry to the unifying CliCommand interface. Same pattern as the ENTITY_SCHEMAS consumers - the literal
  // types are preserved at static-lookup sites but for generic iteration we want the structural view.
  for(const [ name, spec ] of Object.entries(CLI_COMMANDS) as [ string, CliCommand ][]) {

    printer.info("  " + name.padEnd(15) + spec.description);
    printer.info("                  " + spec.usage);

    if(spec.detailedUsage) {

      for(const line of spec.detailedUsage) {

        printer.info("    " + line);
      }
    }
  }
  printer.info("");
  printer.info("Examples:");

  for(const spec of Object.values(CLI_COMMANDS) as CliCommand[]) {

    for(const example of spec.examples) {

      printer.info("  " + example);
    }
  }
}

