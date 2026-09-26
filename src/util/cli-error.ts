/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * cli-error.ts: The espc CLI's user-facing failure type and the classification its entry point and REPL share.
 */

/**
 * The espc CLI's failure classification. Every CLI module that raises a user-facing failure imports {@link CliError} from here, and the entry point and the REPL both
 * classify a thrown value through {@link isUserFacingError}.
 *
 * @remarks A leaf module rather than a member of `espc.ts` because the capture subsystem raises these failures too, and `espc.ts` imports `capture.ts`...holding the
 * class here lets both throw it without an import cycle between them.
 *
 * @module util/cli-error
 */
import { EspHomeError } from "../errors.ts";

/**
 * Marker error type for user-facing CLI failures. The top-level catch prints the message verbatim and exits 1, the framing it also gives a typed client
 * `EspHomeError`; any other throw is reported with a "Fatal:" prefix.
 *
 * @remarks Throwing one of these is the canonical way to abort a command - the pattern lets handlers `throw` instead of `process.exit`, which keeps `using` cleanup
 * working and lets ESLint and TypeScript see case-block bodies as terminated (no `break` after `process.exit` and no unreachable code).
 *
 * @internal
 */
export class CliError extends Error {

  constructor(message: string, options?: ErrorOptions) {

    super(message, options);
    this.name = "CliError";
  }
}

/**
 * Whether a thrown value is a user-facing failure: a CLI usage error ({@link CliError}) or a typed client `EspHomeError` is the user's to read and prints as its message
 * alone, while anything else is a bug and stays "Fatal".
 *
 * @internal
 */
export function isUserFacingError(error: unknown): error is CliError | EspHomeError {

  return (error instanceof CliError) || (error instanceof EspHomeError);
}
