#!/usr/bin/env node
/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * espc-bin.ts: Command-line entry point for the espc CLI.
 *
 * This file is the application; espc.ts is the library it composes from. The bin file unconditionally runs - the only reason it gets executed is that something ran
 * it - while the library file has no top-level side effects. That split keeps "am I being invoked as a CLI?" out of the source: invocation is structural rather than
 * inferred from `import.meta`, so symlink invocation (npm bin, npx, npm link) works the same as a direct `node` invocation.
 *
 * Add CLI bootstrap concerns here (env-aware Printer construction, top-level error policy, exit codes); add CLI feature work in espc.ts (parseInvocation, dispatch,
 * the CLI_COMMANDS registry, handlers).
 */

import { CliError, Printer, dispatch, parseInvocation } from "./espc.ts";

// Single termination point for the CLI. CliError is treated as a user-facing message (no stack); anything else is reported with a "Fatal:" prefix because it indicates
// an internal bug worth investigating. The process exits 1 in either case. Production uses Printer.fromEnvironment so color and TTY detection follow NO_COLOR /
// FORCE_COLOR / isTTY at the system boundary; the library itself takes Printer as a parameter so tests can inject a captured Printer with explicit flags.
const printer = Printer.fromEnvironment();

try {

  await dispatch(parseInvocation(), printer);
} catch(error) {

  if(error instanceof CliError) {

    printer.error(error.message);
  } else {

    printer.error("Fatal: " + (error instanceof Error ? error.message : String(error)));
  }

  process.exit(1);
}
