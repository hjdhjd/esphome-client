/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-socket.ts: Mock socket helper that mimics `node:net.Socket` for transport tests.
 */

import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import type { Nullable } from "../types.ts";
import type { Socket } from "node:net";

/**
 * Mock socket helper for testing infrastructure.
 *
 * @remarks Implements just enough of `node:net.Socket` to drive `Transport` end-to-end. Not a full reimplementation - extends `EventEmitter` and exposes the methods
 * the transport actually consumes (`once`, `on`, `write`, `destroy`, `destroyed`, `removeAllListeners`), plus `setNoDelay` and `setKeepAlive` as structural-compatibility
 * no-ops that satisfy the `Socket` type without being called by the transport itself. Tests construct a `MockSocket`, pass it via the `socketFactory` option, and
 * drive transitions via the `pushData`, `simulateError`, and `simulateClose` methods.
 *
 * @module testing/mock-socket
 */

/**
 * Connection lifecycle phase tracked by {@link MockSocket}.
 */
const Phase = {

  CLOSED:    "closed",
  CONNECTED: "connected",
  PENDING:   "pending"
} as const;

type Phase = typeof Phase[keyof typeof Phase];

/**
 * Test-only mock implementing the subset of `node:net.Socket` the {@link Transport} class consumes.
 *
 * Tests typically:
 * 1. Construct a MockSocket.
 * 2. Pass `() => mockSocket` as the `socketFactory` option.
 * 3. Call `mockSocket.simulateConnect()` to fire the `connect` event the transport awaits.
 * 4. Drive inbound bytes via `pushData(...)`.
 * 5. Inspect outbound writes via the `writes` array.
 */
export class MockSocket extends EventEmitter {

  /**
   * Captured outbound writes in order.
   */
  public readonly writes: Buffer[] = [];

  /**
   * Mirrors `node:net.Socket.destroyed`. Set to `true` after `destroy()`.
   */
  public destroyed = false;

  private phase: Phase = Phase.PENDING;

  /**
   * Pre-armed error fired through the next {@link write} callback, then cleared. Tests use this to exercise the transport's "write callback fires error" path without
   * destroying the socket.
   */
  private nextWriteError: Nullable<Error> = null;

  /**
   * Fire the `connect` event so a pending {@link Transport.open} call resolves.
   */
  public simulateConnect(): void {

    if(this.phase !== Phase.PENDING) {

      return;
    }

    this.phase = Phase.CONNECTED;
    this.emit("connect");
  }

  /**
   * Fire an `error` event. Tests use this to exercise the connect-error path without standing up a real socket.
   *
   * @param err - The error to emit. Typically a `NodeJS.ErrnoException` with a `.code` of `"ECONNREFUSED"` or similar.
   */
  public simulateError(err: NodeJS.ErrnoException): void {

    this.emit("error", err);
  }

  /**
   * Push a chunk of bytes through the socket as if the peer sent them. The transport's `data` listener consumes this and routes it through the framing layer.
   *
   * @param chunk - The bytes to push.
   */
  public pushData(chunk: Buffer): void {

    if(this.phase !== Phase.CONNECTED) {

      throw new Error("MockSocket: cannot pushData before simulateConnect()");
    }

    this.emit("data", chunk);
  }

  /**
   * Fire a `close` event so the transport's close handler runs. Marks the mock as destroyed.
   */
  public simulateClose(): void {

    this.phase = Phase.CLOSED;
    this.destroyed = true;
    this.emit("close");
  }

  /**
   * Fire an `end` event. The transport interprets this as a clean peer-side shutdown.
   */
  public simulateEnd(): void {

    this.emit("end");
  }

  /**
   * Mirror `node:net.Socket.write`. Captures the buffer for test inspection and invokes the optional callback synchronously to mimic the socket's flush semantics.
   *
   * @param data - The bytes to write.
   * @param callback - Optional callback fired after the write completes.
   * @returns Always `true` (the mock has unlimited buffer).
   */
  public write(data: Buffer | string, callback?: (err?: Error) => void): boolean {

    if(this.destroyed) {

      callback?.(new Error("write after destroy"));

      return false;
    }

    if(this.nextWriteError) {

      const err = this.nextWriteError;

      this.nextWriteError = null;
      callback?.(err);

      return false;
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.writes.push(buf);
    callback?.();

    return true;
  }

  /**
   * Arm a synthetic write error for the next {@link write} call only. The error fires through the write callback the way `node:net.Socket` propagates underlying file-
   * descriptor errors. After firing once the slot is cleared, so subsequent writes succeed normally.
   *
   * @param err - The error to emit through the next write's callback.
   */
  public failNextWrite(err: Error): void {

    this.nextWriteError = err;
  }

  /**
   * Mirror `node:net.Socket.destroy`. Marks the mock as destroyed and fires `close` so the transport tears down listeners.
   */
  public destroy(): this {

    if(this.destroyed) {

      return this;
    }

    this.destroyed = true;
    this.phase = Phase.CLOSED;
    this.emit("close");

    return this;
  }

  /**
   * Mirror `node:net.Socket.setNoDelay`. The mock ignores it but accepts the call.
   */
  public setNoDelay(): this {

    return this;
  }

  /**
   * Mirror `node:net.Socket.setKeepAlive`. The mock ignores it but accepts the call.
   */
  public setKeepAlive(): this {

    return this;
  }
}

/**
 * Construct a {@link MockSocket} that callers pass where a `Socket`-typed {@link TransportOpenOptions.socketFactory} is expected. Assignability is purely
 * structural - the mock implements every method the transport actually invokes; properties not invoked (e.g. `bytesRead`) are absent and would surface as runtime errors
 * at the unused call site (which is fine for a test mock). The {@link MockSocketFactory} alias names the `Socket`-returning signature for the factory call site.
 *
 * @returns A new {@link MockSocket} instance, typed as `MockSocket`.
 */
export function createMockSocket(): MockSocket {

  return new MockSocket();
}

/**
 * Type alias used by the `socketFactory` option's signature; the mock conforms structurally.
 */
export type MockSocketFactory = (params: { host: string; port: number }) => Socket;
