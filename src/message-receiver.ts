/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * message-receiver.ts: Setup-phase awaiter and run-phase drain hand-off over a Transport's typed-message iterator.
 */

/**
 * Demultiplexer that sits on top of {@link Transport}'s typed-message iterator and exposes three complementary surfaces:
 *
 * 1. {@link MessageReceiver.waitFor} - the setup phase's promise-based wait for one of a small set of expected message types.
 * 2. {@link MessageReceiver.onInterleave} - synchronous handlers for messages that arrive concurrently with a `waitFor` (e.g., `PING_REQUEST` mid-handshake).
 * 3. {@link MessageReceiver.startDrain} - the explicit hand-off from setup to run phase. After it fires, every subsequent inbound message routes through the supplied
 *    map; `waitFor` rejects, and `onInterleave` registrations are inactive.
 *
 * The receiver runs one internal pump loop that consumes the transport's iterator. Pump life-cycle:
 *
 * - Pump starts on the first `waitFor` / `onInterleave` / `startDrain` call.
 * - Pump tears down when the transport's iterator returns or throws, or when the receiver is disposed.
 * - The pump never blocks the transport - it always pulls the next message and routes it.
 *
 * Backpressure: setup-phase messages that nothing claims on arrival wait in one buffer, in arrival order, with a small per-type high-water mark
 * (`MAX_BUFFERED_PER_TYPE`). Setup-phase messages should arrive in tight cadence; if unhandled messages of the same type accumulate beyond that high-water mark, the
 * receiver drops that type's oldest with a warning. This is intentional: setup is a sequence with handful-of-messages cardinality. The single arrival-ordered buffer
 * is what lets a late `waitFor` and the drain hand-off both see messages in the order the device sent them.
 *
 * @module message-receiver
 */
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { InboundMessage, TransportLike } from "./transport.ts";
import { ConnectionClosedByPeerError } from "./errors.ts";

/**
 * Per-type high-water mark of the setup-phase buffer. Setup-phase doesn't reasonably accumulate more than a few unhandled messages of the same type at a time;
 * exceeding this is almost certainly a bug or a hostile peer. We drop that type's oldest with a warning rather than allowing unbounded growth.
 */
const MAX_BUFFERED_PER_TYPE = 8;

/**
 * Options for {@link MessageReceiver.waitFor}.
 */
export interface WaitForOptions {

  /**
   * Optional cancellation signal. Aborting rejects the returned promise; subsequent awaits see the receiver as still alive.
   */
  signal?: AbortSignal;
}

/**
 * Run-phase handler map passed to {@link MessageReceiver.startDrain}.
 *
 * @remarks Maps each message type identifier to the synchronous handler that should run when that message arrives. The catch-all `default` handles message types not in
 * the map.
 */
export interface MessageHandlers {

  /**
   * Catch-all for unmapped message types.
   */
  default?: (message: InboundMessage) => void;

  /**
   * Per-type handlers. Numeric keys; the message type is matched as `===`.
   */
  [type: number]: ((message: InboundMessage) => void) | undefined;
}

interface InterleaveRegistration {

  handler: (message: InboundMessage) => void;
  type: number;
}

interface WaitForAwaiter {

  reject: (reason: unknown) => void;
  resolve: (message: InboundMessage) => void;
  signal: AbortSignal | undefined;
  signalListener?: () => void;
  types: ReadonlySet<number>;
}

/**
 * Demultiplexes the transport's typed-message stream between handshake awaiters, sync interleave handlers, and the run-phase drain. See module docs for life-cycle.
 */
export class MessageReceiver implements AsyncDisposable {

  /**
   * Backing transport. Borrowed (not owned) - the receiver does not dispose the transport on its own dispose.
   */
  private readonly transport: TransportLike;

  /**
   * Optional host logger. Omitted at the test and handshake construction sites that pass no logger; every emit is guarded with `this.log?.warn(...)` so a logger-less
   * receiver no-ops its diagnostics. The host's production call site (`openHandshakeContext`) wires its own logger in so the receiver's warnings reach the consumer.
   */
  private readonly log: EspHomeLogging | undefined;

  /**
   * Registered sync interleave handlers.
   */
  private readonly interleaveHandlers = new Map<number, InterleaveRegistration>();

  /**
   * Active setup-phase awaiters. There is at most one per call site, but multiple `waitFor` awaiters can coexist if a caller wires up multiple awaits in parallel.
   */
  private readonly awaiters = new Set<WaitForAwaiter>();

  /**
   * Setup-phase messages no interleave handler or awaiter claimed on arrival, in arrival order, for a late `waitFor` or the drain hand-off. Each message type keeps at
   * most `MAX_BUFFERED_PER_TYPE` entries.
   */
  private readonly buffered: InboundMessage[] = [];

  /**
   * Run-phase handler map. `null` until {@link startDrain} fires.
   */
  private drainHandlers: Nullable<MessageHandlers> = null;

  /**
   * Whether the pump loop is running. Prevents duplicate pumps if multiple methods race to start one.
   */
  private pumping = false;

  /**
   * Whether the receiver is disposed. Disposed receivers reject every subsequent `waitFor` and ignore inbound messages.
   */
  private disposed = false;

  /**
   * Pending fatal error from the transport. Surfaced into every awaiter on settle.
   */
  private pumpError: Nullable<Error> = null;

  /**
   * Run-phase terminal-completion callback. `null` until {@link startDrain} fires. Invoked exactly once via `settleTerminal` when the pump ends during the run
   * phase for any reason other than a host-initiated dispose.
   */
  private onTerminal: Nullable<(cause: Error) => void> = null;

  /**
   * Single-fire guard for `settleTerminal`. Set the first time the terminal callback is dispatched so a clean-end-then-fault (or any double terminal trigger) can
   * never fire {@link onTerminal} twice.
   */
  private terminalFired = false;

  /**
   * @param transport - The transport whose typed-message iterator this receiver demultiplexes. Accepts either {@link Transport} or any structurally-
   * compatible {@link TransportLike} (notably the testing-subpath `MockTransport`).
   * @param log - Optional host logger. When supplied, the receiver surfaces its run-phase diagnostics (a run-phase handler throw, a setup-phase buffer-overflow drop)
   * through it; when omitted (the test/handshake construction sites that pass no logger), those diagnostics no-op. Optional by design so the logger-less call sites
   * keep compiling without a sweep.
   */
  public constructor(transport: TransportLike, log?: EspHomeLogging) {

    this.transport = transport;
    this.log = log;
  }

  /**
   * Wait for the next message whose `type` is in `types`. A buffered message of a wanted type returns first, earliest arrival first, so a late `waitFor` sees
   * messages in the order the device sent them. Other inbound messages route to interleave handlers (during setup) or wait in the arrival-ordered buffer, capped at
   * `MAX_BUFFERED_PER_TYPE` entries per type.
   *
   * @param types - Acceptable message types. Must be non-empty.
   * @param options - Optional cancellation signal.
   * @returns The first matching inbound message.
   */
  public async waitFor(types: readonly number[], options: WaitForOptions = {}): Promise<InboundMessage> {

    if(this.disposed) {

      throw new ConnectionClosedByPeerError("MessageReceiver is disposed.", "RECEIVER_DISPOSED");
    }

    if(this.drainHandlers !== null) {

      throw new ConnectionClosedByPeerError("MessageReceiver is in drain phase; waitFor is no longer accepted.", "RECEIVER_DRAINING");
    }

    if(types.length === 0) {

      throw new TypeError("waitFor requires at least one message type.");
    }

    const wanted = new Set(types);

    // Take the earliest-arrived buffered message of any wanted type first. Scanning in arrival order rather than in `types` order is what keeps a burst of discovery
    // responses in the device's order: the done sentinel buffered behind an entity response never overtakes it.
    for(const [ index, message ] of this.buffered.entries()) {

      if(wanted.has(message.type)) {

        this.buffered.splice(index, 1);

        return message;
      }
    }

    if(this.pumpError) {

      throw this.pumpError;
    }

    options.signal?.throwIfAborted();

    this.ensurePump();

    const { promise, resolve, reject } = Promise.withResolvers<InboundMessage>();
    const awaiter: WaitForAwaiter = { reject, resolve, signal: options.signal, types: wanted };

    if(options.signal) {

      const onAbort = (): void => {

        this.awaiters.delete(awaiter);

        const reason = options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("Aborted", "AbortError");

        reject(reason);
      };

      awaiter.signalListener = onAbort;
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    this.awaiters.add(awaiter);

    return promise;
  }

  /**
   * Register a synchronous interleave handler. Active only during setup phase; cleared automatically when {@link MessageReceiver.startDrain} fires. The handler runs
   * before any `waitFor` awaiter sees the message.
   *
   * @param type - Message type to intercept.
   * @param handler - Sync callback. Throwing from the handler causes the receiver to fail with the thrown error.
   * @returns A `Disposable` that removes the handler.
   */
  public onInterleave(type: number, handler: (message: InboundMessage) => void): Disposable {

    if(this.disposed || (this.drainHandlers !== null)) {

      return { [Symbol.dispose]: (): void => { /* no-op for disposed/draining receiver */ } };
    }

    const registration: InterleaveRegistration = { handler, type };

    this.interleaveHandlers.set(type, registration);

    this.ensurePump();

    return { [Symbol.dispose]: (): void => {

      const current = this.interleaveHandlers.get(type);

      if(current === registration) {

        this.interleaveHandlers.delete(type);
      }
    } };
  }

  /**
   * Hand the receiver over to the run-phase drain. After this call, every subsequent inbound message routes through `handlers`; pending and future `waitFor` calls
   * reject; `onInterleave` registrations stop firing. Safe to call more than once.
   *
   * @param handlers - Map from message type to handler.
   * @param onTerminal - Required terminal-completion callback. Fired exactly once (via `settleTerminal`) when the pump ends during the run phase for any reason
   * other than a host-initiated dispose - a passive transport death (peer RST or FIN, device reboot, mid-session decrypt failure, oversized frame), which the transport
   * surfaces as a fault. The transport's iterator ends cleanly only when the transport is disposed, which the host does after disposing this receiver, so that path is
   * suppressed. Without this escalation a passive transport death would leave the host falsely `CONNECTED` with no liveness detector when `keepAlive` is disabled; the
   * host wires it to its disconnect path so a peer death drives teardown and auto-reconnect.
   */
  public startDrain(handlers: MessageHandlers, onTerminal: (cause: Error) => void): void {

    if(this.disposed) {

      throw new ConnectionClosedByPeerError("MessageReceiver is disposed; startDrain is no longer accepted.", "RECEIVER_DISPOSED");
    }

    if(this.drainHandlers !== null) {

      return;
    }

    this.onTerminal = onTerminal;

    // Reject every pending waitFor with a draining error.
    for(const awaiter of this.awaiters) {

      // The signal and signalListener fields are set together in the same `if(options.signal)` block in waitFor, so a truthy signal guarantees signalListener is
      // defined; the cast below satisfies removeEventListener's parameter type without weakening that guarantee. The same reasoning covers every other
      // signal?.removeEventListener call site in this file.
      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.reject(new ConnectionClosedByPeerError("MessageReceiver entered drain phase before this waitFor settled.", "RECEIVER_DRAINING"));
    }

    this.awaiters.clear();
    this.interleaveHandlers.clear();

    // Drain buffered messages into the new handlers in arrival order, emptying the buffer as we take it.
    this.drainHandlers = handlers;

    for(const message of this.buffered.splice(0)) {

      this.dispatchToDrain(message);
    }

    this.ensurePump();
  }

  /**
   * Dispose the receiver. Settles every awaiter, clears every handler, and stops the pump. Does NOT dispose the underlying transport.
   */
  public async [Symbol.asyncDispose](): Promise<void> {

    this.dispose();
  }

  /**
   * Sync dispose for `using` scopes.
   */
  public [Symbol.dispose](): void {

    this.dispose();
  }

  /**
   * Internal teardown.
   */
  private dispose(): void {

    if(this.disposed) {

      return;
    }

    this.disposed = true;

    for(const awaiter of this.awaiters) {

      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.reject(new ConnectionClosedByPeerError("MessageReceiver disposed.", "RECEIVER_DISPOSED"));
    }

    this.awaiters.clear();
    this.interleaveHandlers.clear();
    this.buffered.length = 0;
    this.drainHandlers = null;
  }

  /**
   * Start the pump loop if it is not already running. Safe to call multiple times.
   */
  private ensurePump(): void {

    if(this.pumping || this.disposed) {

      return;
    }

    this.pumping = true;
    void this.pump();
  }

  /**
   * Pump loop: pulls inbound messages from the transport and dispatches each per the current phase (interleave/awaiter/buffer or drain handler).
   */
  private async pump(): Promise<void> {

    try {

      for await (const message of this.transport) {

        if(this.disposed) {

          return;
        }

        this.dispatch(message);
      }

      // The iterator ends cleanly only when the transport is disposed; a peer FIN or RST is a fault that throws into the catch below. `failPending` settles any
      // setup-phase awaiter so it does not hang forever; `settleTerminal` escalates the run-phase terminal completion unless the host initiated the dispose.
      const cleanEnd = new ConnectionClosedByPeerError("Transport iterator ended.", "TRANSPORT_CLOSED");

      this.failPending(cleanEnd);
      this.settleTerminal(cleanEnd);

    } catch(err) {

      // A fault during the run phase (peer RST or FIN, mid-session decrypt failure, oversized frame) throws out of the `for await`. We keep `pumpError` (read by a late
      // setup-phase `waitFor`) and `failPending` (settles setup-phase awaiters) for the setup-phase contract, then escalate the terminal completion to the host.
      this.pumpError = err instanceof Error ? err : new Error(String(err), { cause: err });
      this.failPending(this.pumpError);
      this.settleTerminal(this.pumpError);
    }
  }

  /**
   * Single-fire chokepoint that escalates the run-phase terminal completion to the host. Both pump branches (clean iterator end and fault) funnel through here.
   *
   * The `disposed` guard is the host-initiated-vs-peer-death distinguisher: the host's `disconnectInternal` disposes the receiver (setting `disposed`) BEFORE it
   * disposes the transport, so a host-initiated teardown's clean iterator end arrives here with `disposed === true` and is suppressed - the host already knows it is
   * tearing down. Only a peer death, where `disposed === false` because the host did not initiate it, escalates back through {@link onTerminal}. The `terminalFired`
   * guard makes the callback strictly one-shot regardless of how many terminal conditions occur.
   *
   * @param cause - The typed terminal cause (the clean-end sentinel or the run-phase fault).
   */
  private settleTerminal(cause: Error): void {

    if(this.terminalFired || this.disposed) {

      return;
    }

    this.terminalFired = true;
    this.onTerminal?.(cause);
  }

  /**
   * Route an inbound message per the current phase.
   */
  private dispatch(message: InboundMessage): void {

    if(this.drainHandlers !== null) {

      this.dispatchToDrain(message);

      return;
    }

    // Setup phase. Order of precedence: interleave handlers > waitFor awaiters > the arrival-ordered buffer.
    const interleave = this.interleaveHandlers.get(message.type);

    if(interleave) {

      try {

        interleave.handler(message);

      } catch(err) {

        // A throw from an interleave handler is fatal - it usually means the handler decided the connection cannot proceed (e.g., DISCONNECT_REQUEST mid-handshake).
        this.pumpError = err instanceof Error ? err : new Error(String(err), { cause: err });
        this.failPending(this.pumpError);
      }

      return;
    }

    for(const awaiter of this.awaiters) {

      if(awaiter.types.has(message.type)) {

        this.awaiters.delete(awaiter);
        awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
        awaiter.resolve(message);

        return;
      }
    }

    // No handler. Buffer for a future waitFor, in arrival order.
    this.buffered.push(message);

    let sameType = 0;

    for(const entry of this.buffered) {

      if(entry.type === message.type) {

        sameType++;
      }
    }

    if(sameType > MAX_BUFFERED_PER_TYPE) {

      // Drop this type's oldest entry and leave every other type's entries in place. The mark is sized so this only fires under abuse or a buggy peer; warn so the drop
      // is observable.
      this.buffered.splice(this.buffered.findIndex((entry) => entry.type === message.type), 1);
      this.log?.warn("Dropped the oldest buffered setup-phase message; the per-type buffer exceeded its high-water mark.",
        { highWaterMark: MAX_BUFFERED_PER_TYPE, messageType: message.type });
    }
  }

  /**
   * Dispatch a message during the run phase via the registered handlers map.
   */
  private dispatchToDrain(message: InboundMessage): void {

    if(this.drainHandlers === null) {

      return;
    }

    const handler = this.drainHandlers[message.type] ?? this.drainHandlers.default;

    if(handler) {

      try {

        handler(message);

      } catch(err) {

        // A run-phase handler threw - a decode fault on a malformed frame, say. A consumer's listener cannot reach this catch: the bus reports a listener's fault through
        // its own error callback before it can unwind into a handler's emit. We log and CONTINUE, never tearing the connection down: one bad frame must not kill a
        // connection shared by every consumer. Genuine transport death is the pump's for-await fault path, which escalates via settleTerminal, not this catch.
        this.log?.warn("A run-phase message handler threw while dispatching an inbound frame; the frame was dropped and the connection was kept alive.",
          { error: err, messageType: message.type });
      }
    }
  }

  /**
   * Reject every pending awaiter with the given error.
   */
  private failPending(error: unknown): void {

    for(const awaiter of this.awaiters) {

      awaiter.signal?.removeEventListener("abort", awaiter.signalListener as () => void);
      awaiter.reject(error);
    }

    this.awaiters.clear();
  }
}
