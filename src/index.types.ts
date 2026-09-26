/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.types.ts: Type-level rules for the command-runner types the public barrel re-exports.
 */

/**
 * Compile-time rules for the package root's re-export of the command-runner types. The client's `command`, `commandAndAwait`, and `transmitRawTimings` methods name
 * these types in their signatures, so a consumer who wraps those methods generically must be able to import them from the package root. Each assertion imports the
 * name through the barrel and holds it equal to the declaration in `command-runner.ts`: a dropped re-export fails to resolve at the import, and a re-export that
 * reached a different declaration breaks the equality.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.check.json`, NOT by
 * `node --test`.
 *
 * @module index.types
 */
import type * as commandRunner from "./command-runner.ts";
import type { Assert, Equal } from "./internal/type-assertions.ts";
import type { CommandAndAwaitOptions, CommandAndAwaitable, NonAwaitableEntityType, TransmitEntityType } from "./index.ts";

/**
 * The barrel's {@link CommandAndAwaitOptions} is the runner's per-call await options, checked at the full awaitable entity-type union.
 */
type CommandAndAwaitOptionsResolves = Assert<Equal<CommandAndAwaitOptions<CommandAndAwaitable>, commandRunner.CommandAndAwaitOptions<commandRunner.CommandAndAwaitable>>>;

/**
 * The barrel's {@link CommandAndAwaitable} is the runner's set of entity types `commandAndAwait` accepts.
 */
type CommandAndAwaitableResolves = Assert<Equal<CommandAndAwaitable, commandRunner.CommandAndAwaitable>>;

/**
 * The barrel's {@link NonAwaitableEntityType} is the runner's set of entity types `commandAndAwait` excludes.
 */
type NonAwaitableEntityTypeResolves = Assert<Equal<NonAwaitableEntityType, commandRunner.NonAwaitableEntityType>>;

/**
 * The barrel's {@link TransmitEntityType} is the runner's set of raw-timings transmit entity types that `command` excludes and `transmitRawTimings` accepts.
 */
type TransmitEntityTypeResolves = Assert<Equal<TransmitEntityType, commandRunner.TransmitEntityType>>;

// Every sentinel-assertion type alias is exported so the module carries its rules as a surface a reader can find.
export type {

  CommandAndAwaitOptionsResolves,
  CommandAndAwaitableResolves,
  NonAwaitableEntityTypeResolves,
  TransmitEntityTypeResolves
};
