/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * frames-per-second.bench.ts: End-to-end throughput benchmark for the run-phase dispatcher.
 */

/*
 * Drives a synthesized stream of `SwitchStateResponse` frames through `MockTransport` into a connected `EspHomeClient` and measures sustained frames per second.
 * Target: >=10,000 frames/sec on a recent laptop-class CPU.
 *
 * Stability infrastructure: one warmup run amortizes JIT compilation, then five measured runs are summarized into median / p10 / stddev. A `tryGc()` call between
 * runs prevents accumulated buffer allocations from one run skewing the next. The `bench` npm script runs this benchmark under `--expose-gc` and prints a single JSON
 * summary line (rounded median fps, the conservative p10 floor, the per-run durations, and the median / stddev); it performs no baseline comparison and gates nothing,
 * so the output is for manual, out-of-band inspection. Reporting the median rather than a single sample simply keeps the printed number stable across contended runs.
 */
import { MessageType } from "../src/protocol/index.ts";
import { startDriver, summarize, tryGc, yieldTick } from "./_runtime.ts";
import { switchStateResponsePayload } from "../test/simulator/scenarios/index.ts";

const FRAMES_PER_RUN = 100000;
const MEASURED_RUNS = 5;
const WARMUP_RUNS = 1;
const SWITCH_KEY = 1001;
const YIELD_INTERVAL_MASK = 0x3FF;

interface RunResult {

  durationMs: number;
  framesObserved: number;
}

const runOnce = async (): Promise<RunResult> => {

  const { client, transport } = await startDriver();

  let framesObserved = 0;
  using sub = client.on("switch", (): void => { framesObserved += 1; });

  const start = performance.now();

  // Push state-update frames in batches so the receiver's pump dispatches each one through the run-phase dispatcher.
  for(let i = 0; i < FRAMES_PER_RUN; i++) {

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, switchStateResponsePayload(SWITCH_KEY, (i & 1) === 1));

    if((i & YIELD_INTERVAL_MASK) === 0) {

      // Every 1024 frames, yield to let the receiver's pump catch up so we don't over-fill the queue.
      await yieldTick();
    }
  }

  // Final drain: yield until the pump has dispatched everything we pushed.
  while(framesObserved < FRAMES_PER_RUN) {

    await yieldTick();
  }

  const durationMs = performance.now() - start;

  sub[Symbol.dispose]();
  client[Symbol.dispose]();

  return { durationMs, framesObserved };
};

// Warmup: discard timing, exercise the JIT.
for(let i = 0; i < WARMUP_RUNS; i++) {

  await runOnce();
  tryGc();
}

const durations: number[] = [];
let framesObserved = 0;

for(let i = 0; i < MEASURED_RUNS; i++) {

  const result = await runOnce();

  durations.push(result.durationMs);
  framesObserved = result.framesObserved;
  tryGc();
}

const stats = summarize(durations);
const fpsMedian = (FRAMES_PER_RUN / stats.median) * 1000;

// fps is the reciprocal of run duration, so the conservative 10th-percentile fps floor is computed from the 90th-percentile (slowest) duration, not from stats.p10.
const fpsP10 = (FRAMES_PER_RUN / stats.p90) * 1000;

// eslint-disable-next-line no-console
console.log(JSON.stringify({

  benchmark: "frames-per-second",
  fps: Math.round(fpsMedian),
  fpsP10: Math.round(fpsP10),
  framesObserved,
  framesPerRun: FRAMES_PER_RUN,
  medianMs: Math.round(stats.median),
  runs: durations.map((d) => Math.round(d)),
  stddevMs: Math.round(stats.stddev),
  warmupRuns: WARMUP_RUNS
}));
