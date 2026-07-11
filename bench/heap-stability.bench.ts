/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * heap-stability.bench.ts: Long-run heap-stability benchmark.
 */

/*
 * Drives a fully-instantiated `EspHomeClient` through `MockTransport` for 15 seconds of sustained `SwitchStateResponse` traffic, sampling V8 heap usage (`heapUsed`) every
 * five seconds. Target: heap delta <=5 MiB end-to-end. Detects accidental retention of inbound buffers, listener leaks, unbounded queue growth, and sub-API caches
 * that grow with traffic instead of with cardinality.
 *
 * Stability infrastructure: a one-second warmup window amortizes JIT, then `tryGc()` runs at every sample point so the captured `heapUsed` reflects steady-state
 * retention rather than transient allocations between collections. The bench prints `deltaHeapBytes` as `final - initial` alongside the documented ~5 MiB target
 * above; it performs no baseline comparison and gates nothing, so the output is for manual, out-of-band inspection.
 */
import { MessageType } from "../src/protocol/index.ts";
import { startDriver, tryGc, yieldTick } from "./_runtime.ts";
import { switchStateResponsePayload } from "../test/simulator/scenarios/index.ts";

const SAMPLE_INTERVAL_MS = 5000;
const SAMPLE_COUNT = 3;
const WARMUP_DURATION_MS = 1000;
const SWITCH_KEY = 1001;
const YIELD_INTERVAL_MASK = 0x3FF;

interface HeapSample {

  at: number;
  heapUsed: number;
  rss: number;
}

const captureSample = (atMs: number): HeapSample => {

  // Force GC at the sample boundary so the captured heap reflects retained-after-collection memory, not transient allocator churn.
  tryGc();

  const memory = process.memoryUsage();

  return { at: atMs, heapUsed: memory.heapUsed, rss: memory.rss };
};

const { client, transport } = await startDriver();

let framesObserved = 0;
using sub = client.on("switch", (): void => { framesObserved += 1; });

// Warmup window: discarded; amortizes JIT.
const warmupStart = performance.now();
let pushCounter = 0;

while((performance.now() - warmupStart) < WARMUP_DURATION_MS) {

  transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, switchStateResponsePayload(SWITCH_KEY, (pushCounter & 1) === 1));
  pushCounter++;

  if((pushCounter & YIELD_INTERVAL_MASK) === 0) {

    await yieldTick();
  }
}

while(framesObserved < pushCounter) {

  await yieldTick();
}

// Reset counters and start the measured run.
pushCounter = 0;
framesObserved = 0;

const captures: HeapSample[] = [];
const startedAt = performance.now();

captures.push(captureSample(0));

for(let i = 1; i <= SAMPLE_COUNT; i++) {

  const sampleStart = performance.now();

  while((performance.now() - sampleStart) < SAMPLE_INTERVAL_MS) {

    transport.pushInbound(MessageType.SWITCH_STATE_RESPONSE, switchStateResponsePayload(SWITCH_KEY, (pushCounter & 1) === 1));
    pushCounter++;

    if((pushCounter & YIELD_INTERVAL_MASK) === 0) {

      await yieldTick();
    }
  }

  // Drain any pending dispatch before the next sample so the heap reflects fully-processed traffic.
  while(framesObserved < pushCounter) {

    await yieldTick();
  }

  captures.push(captureSample(Math.round(performance.now() - startedAt)));
}

sub[Symbol.dispose]();
client[Symbol.dispose]();

const deltaHeapBytes = (captures[captures.length - 1]?.heapUsed ?? 0) - (captures[0]?.heapUsed ?? 0);

// eslint-disable-next-line no-console
console.log(JSON.stringify({

  benchmark: "heap-stability",
  deltaHeapBytes,
  framesProcessed: framesObserved,
  samples: captures
}));
