/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.types.ts: Type-level rules for the types the public barrel re-exports by name.
 */

/**
 * Compile-time rules for the package root's named type re-exports: the command-runner types the client's `command`, `commandAndAwait`, and `transmitRawTimings`
 * methods name in their signatures, and the clock and transport types the client's `clock` and `transportFactory` options name. A consumer who wraps those methods
 * generically or supplies those options must be able to import the types from the package root. Each assertion imports the name through the barrel and holds it
 * equal to its declaration: a dropped re-export fails to resolve at the import, and a re-export that reached a different declaration breaks the equality.
 *
 * @remarks This file holds **type-level assertions only**. It lives at `.types.ts` (not `.types.test.ts`) and is validated by `tsc` via `tsconfig.json`, NOT by
 * `node --test`.
 *
 * @module index.types
 */
import type * as commandRunner from "./command-runner.ts";
import type * as heartbeat from "./heartbeat.ts";
import type * as transport from "./transport.ts";
import type { Assert, Equal } from "./internal/type-assertions.ts";
import type {
  ClockFn, CommandAndAwaitOptions, CommandAndAwaitable, InboundMessage, NoiseCipherPair, NonAwaitableEntityType, TransmitEntityType, TransportLike, TransportOpenOptions
} from "./index.ts";

/**
 * The barrel's {@link ClockFn} is the injectable clock the client's `clock` option names.
 */
type ClockFnResolves = Assert<Equal<ClockFn, heartbeat.ClockFn>>;

/**
 * The barrel's {@link CommandAndAwaitOptions} is the runner's per-call await options, checked at the full awaitable entity-type union.
 */
type CommandAndAwaitOptionsResolves = Assert<Equal<CommandAndAwaitOptions<CommandAndAwaitable>, commandRunner.CommandAndAwaitOptions<commandRunner.CommandAndAwaitable>>>;

/**
 * The barrel's {@link CommandAndAwaitable} is the runner's set of entity types `commandAndAwait` accepts.
 */
type CommandAndAwaitableResolves = Assert<Equal<CommandAndAwaitable, commandRunner.CommandAndAwaitable>>;

/**
 * The barrel's {@link InboundMessage} is the typed message a {@link TransportLike} yields.
 */
type InboundMessageResolves = Assert<Equal<InboundMessage, transport.InboundMessage>>;

/**
 * The barrel's {@link NoiseCipherPair} is the cipher pair a {@link TransportLike} installs once the Noise handshake completes.
 */
type NoiseCipherPairResolves = Assert<Equal<NoiseCipherPair, transport.NoiseCipherPair>>;

/**
 * The barrel's {@link NonAwaitableEntityType} is the runner's set of entity types `commandAndAwait` excludes.
 */
type NonAwaitableEntityTypeResolves = Assert<Equal<NonAwaitableEntityType, commandRunner.NonAwaitableEntityType>>;

/**
 * The barrel's {@link TransmitEntityType} is the runner's set of raw-timings transmit entity types that `command` excludes and `transmitRawTimings` accepts.
 */
type TransmitEntityTypeResolves = Assert<Equal<TransmitEntityType, commandRunner.TransmitEntityType>>;

/**
 * The barrel's {@link TransportLike} is the transport the client's `transportFactory` option returns.
 */
type TransportLikeResolves = Assert<Equal<TransportLike, transport.TransportLike>>;

/**
 * The barrel's {@link TransportOpenOptions} is the options record the client's `transportFactory` option receives.
 */
type TransportOpenOptionsResolves = Assert<Equal<TransportOpenOptions, transport.TransportOpenOptions>>;

// Every sentinel-assertion type alias is exported so the module carries its rules as a surface a reader can find.
export type {

  ClockFnResolves,
  CommandAndAwaitOptionsResolves,
  CommandAndAwaitableResolves,
  InboundMessageResolves,
  NoiseCipherPairResolves,
  NonAwaitableEntityTypeResolves,
  TransmitEntityTypeResolves,
  TransportLikeResolves,
  TransportOpenOptionsResolves
};
