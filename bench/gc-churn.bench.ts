/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * gc-churn.bench.ts: Sustained-throughput benchmark that surfaces GC pressure on the dispatcher.
 */

/*
 * Drives a fully-instantiated `EspHomeClient` through `MockTransport` and measures how many `SwitchStateResponse` frames the run-phase dispatcher processes per
 * second over a fixed wall-clock window. This is the throughput-under-pressure proxy: heavy GC churn manifests as throughput collapse, while a clean steady state
 * sustains a roughly constant frame rate across the window.
 *
 * Stability infrastructure: one warmup window amortizes JIT compilation, then `tryGc()` clears the heap before the measured window so the steady-state rate is not
 * polluted by warmup allocations. The bench reports `frameRateActual` as the measured frame rate alongside `frameRateTarget`; it performs no baseline comparison
 * and gates nothing, so the printed JSON is for manual, out-of-band inspection.
 *
 * The bench measures throughput collapse rather than direct GC events because throughput is straightforward to observe in-process, whereas direct GC-event
 * counting requires `--trace-gc` log parsing.
 */
import { MessageType } from "../src/protocol/index.ts";
import { startDriver, tryGc, yieldTick } from "./_runtime.ts";
import { switchStateResponsePayload } from "../test/simulator/scenarios/index.ts";

const MEASURED_DURATION_MS = 5000;
const WARMUP_DURATION_MS = 1000;
const FRAME_RATE_TARGET = 1000;
const SWITCH_KEY = 1001;
const YIELD_INTERVAL_MASK = 0x3FF;

interface WindowResult {

  durationMs: number;
  frames: number;
}

const runWindow = async (durationMs: number): Promise<WindowResult> => {

  const { client, transport } = await startDriver();

  let framesObserved = 0;
  using sub = client.on("switch", (): void => { framesObserved += 1; });

  const start = performance.now();
  let i = 0;

  while((performance.now() - start) < durationMs) {

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, switchStateResponsePayload(SWITCH_KEY, (i & 1) === 1));
    i++;

    if((i & YIELD_INTERVAL_MASK) === 0) {

      // Yield periodically so the receiver pump can dispatch what we pushed.
      await yieldTick();
    }
  }

  // Drain any frames still pending dispatch so the count is accurate.
  while(framesObserved < i) {

    await yieldTick();
  }

  const elapsedMs = performance.now() - start;

  sub[Symbol.dispose]();
  client[Symbol.dispose]();

  return { durationMs: elapsedMs, frames: framesObserved };
};

// Warmup window: discarded; amortizes JIT.
await runWindow(WARMUP_DURATION_MS);
tryGc();

// Measured window.
const result = await runWindow(MEASURED_DURATION_MS);
const fps = (result.frames / result.durationMs) * 1000;

// eslint-disable-next-line no-console
console.log(JSON.stringify({

  benchmark: "gc-churn",
  durationMs: Math.round(result.durationMs),
  frameRateActual: Math.round(fps),
  frameRateTarget: FRAME_RATE_TARGET,
  frames: result.frames
}));
