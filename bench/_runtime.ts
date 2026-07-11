/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * _runtime.ts: Shared infrastructure for the runtime benchmarks.
 */

/*
 * Provides the primitives each bench needs to produce a stable, manually-inspectable measurement:
 *
 *   1. `tryGc()`: forces a major GC when node was started with `--expose-gc` (a no-op otherwise). Calling this at sample boundaries removes GC-pause randomness from
 *      the measurement; calling it between runs keeps the heap from drifting upward across iterations and skewing later runs slower than earlier ones.
 *   2. `yieldTick()`: a `setImmediate`-backed yield used by the end-to-end driver pattern. The host's run-phase iterator pumps inbound frames asynchronously, so the
 *      bench has to surrender the event loop periodically for the dispatcher to drain pushed frames.
 *   3. `summarize()`: produces median / min / max / p10 / p90 / stddev from a sample list. Single-run numbers are too noisy on their own, so summarize() reports
 *      the full spread for manual, out-of-band inspection rather than reducing it to a single pass/fail threshold.
 *
 * Every benchmark in bench/ drives a fully-instantiated `EspHomeClient` end-to-end through `MockTransport`. The harness here makes that pattern reusable so each
 * bench file stays small and reads as the workload it measures rather than ceremony.
 */
import type { EspHomeClient } from "../src/esphome-client.ts";
import { MockTransport } from "../src/testing/mock-transport.ts";
import { basicDiscovery } from "../test/simulator/scenarios/index.ts";
import { driveScenario } from "../test/simulator/simulator.ts";
import { openEspHomeClient } from "../src/esphome-client.ts";

/**
 * Statistical summary of a sample list. Used by every bench so reports carry enough information to judge whether a fail is real.
 */
export interface RunStats {

  count: number;
  max: number;
  median: number;
  min: number;
  p10: number;
  p90: number;
  stddev: number;
}

/**
 * Force a major GC if `--expose-gc` was passed; no-op otherwise. The `bench` npm script passes `--expose-gc` to each bench, so this is effective when run via
 * `npm run bench`; standalone runs without the flag still complete, just with more variance.
 */
export const tryGc = (): void => {

  const gc = (globalThis as { gc?: () => void }).gc;

  if(gc) {

    gc();
  }
};

/**
 * Yield to the event loop so the host's run-phase iterator can dispatch pushed frames. Backed by `setImmediate` rather than a microtask so we cycle past the I/O
 * queue too.
 */
export const yieldTick = async (): Promise<void> => { await new Promise<void>((resolve): void => { setImmediate(resolve); }); };

/**
 * Compute median / min / max / p10 / p90 / stddev for a sample list. Stable against an empty input; returns zeros instead of NaN.
 *
 * @param samples - The samples to summarize.
 */
export function summarize(samples: ReadonlyArray<number>): RunStats {

  if(samples.length === 0) {

    return { count: 0, max: 0, median: 0, min: 0, p10: 0, p90: 0, stddev: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * n))] ?? 0;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + ((b - mean) ** 2), 0) / n;

  return {

    count: n,
    max: sorted[n - 1] ?? 0,
    median: pick(0.5),
    min: sorted[0] ?? 0,
    p10: pick(0.1),
    p90: pick(0.9),
    stddev: Math.sqrt(variance)
  };
}

/**
 * Driver result handed back to the bench. Holds the connected client and its underlying mock transport so the bench can push frames and observe events.
 */
export interface DriverContext {

  client: EspHomeClient;
  transport: MockTransport;
}

/**
 * Spin up a fresh `MockTransport` + `EspHomeClient` driven through the canonical `basic-discovery` scenario. Every bench starts from the same handshake state so
 * measurements compare apples-to-apples. The caller owns disposing the returned `client`; the transport is disposed automatically when the client tears down.
 */
export const startDriver = async (): Promise<DriverContext> => {

  const transport = new MockTransport();

  // Push the synthesized handshake before the client connects so its first `waitFor()` resolves out of the receiver's pre-fetched buffer.
  driveScenario(transport, basicDiscovery);
  await yieldTick();

  const client = await openEspHomeClient({

    host: "bench-host",
    keepAlive: false,
    logger: { debug: (): void => { /* discard */ }, error: (): void => { /* discard */ }, info: (): void => { /* discard */ }, warn: (): void => { /* discard */ } },
    psk: null,
    reconnect: false,
    transportFactory: (): MockTransport => transport
  });

  return { client, transport };
};
