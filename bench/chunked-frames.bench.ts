/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * chunked-frames.bench.ts: Inbound framing benchmark for frames that arrive split across many socket chunks.
 */

/*
 * Drives a real `Transport` in plaintext mode through its `socketFactory` over a `MockSocket`, pushing a stream of large frames cut into TCP-segment-sized chunks, so
 * each frame is reassembled from dozens of chunks and the receive accumulator's copying dominates the cost. The sibling benches inject `MockTransport`, which never
 * runs the transport's framing, so this one measures the inbound path they skip. The stream is cut at fixed offsets without regard to frame boundaries, as TCP cuts
 * it, so frame headers and tails share chunks with their neighbors. Each run replays the stream over several passes, draining every pass before the next, so a run
 * lasts long enough to time while the message queue never holds more than one stream's payloads.
 *
 * Stability infrastructure matches the siblings: a warmup run amortizes JIT compilation, then the measured runs are summarized into median / p10 / stddev, with a
 * `tryGc()` between runs. The bench touches only the transport's open options, its message iterator, and `MockSocket`, so it runs unchanged against any revision of
 * the receive accumulator. It performs no baseline comparison and gates nothing; the printed JSON line is for manual, out-of-band inspection.
 */
import { MessageType, encodeVarint } from "../src/protocol/index.ts";
import { ProtocolByte, Transport } from "../src/transport.ts";
import { summarize, tryGc } from "./_runtime.ts";
import { Buffer } from "node:buffer";
import { MockSocket } from "../src/testing/mock-socket.ts";
import type { Socket } from "node:net";

// A typical TCP segment payload on a 1500-byte Ethernet MTU.
const CHUNK_BYTES = 1400;

// Frames just under 64 KiB, near the 65535-byte ceiling that a noise frame's 16-bit size field places on encrypted frames.
const FRAME_PAYLOAD_BYTES = (64 * 1024) - 16;

const FRAMES_PER_STREAM = 256;
const PASSES_PER_RUN = 16;
const FRAMES_PER_RUN = FRAMES_PER_STREAM * PASSES_PER_RUN;
const MEASURED_RUNS = 5;
const WARMUP_RUNS = 1;

// Limits well above the stream's needs: the largest frame and the accumulator's peak, one frame plus one chunk, sit far below them, so neither bound fires.
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_RECV_BUFFER_BYTES = 4 * 1024 * 1024;

interface RunResult {

  durationMs: number;
  framesObserved: number;
}

const discard = (): void => { /* discard */ };
const log = { debug: discard, error: discard, info: discard, warn: discard };

// Build the stream once. Each frame is [0x00][len-varint][type-varint][payload], the plaintext wire form; the transport never decodes the type, so which message
// type carries the bulk bytes does not matter. The stream ends on a frame boundary, so every pass leaves the accumulator empty for the next. The transport only reads
// the chunks it is handed and copies every delivered payload out, so one set of chunks serves every pass of every run.
const frame = Buffer.concat([ Buffer.from([ProtocolByte.PLAINTEXT]), encodeVarint(FRAME_PAYLOAD_BYTES), encodeVarint(MessageType.CAMERA_IMAGE_RESPONSE),
  Buffer.alloc(FRAME_PAYLOAD_BYTES, 0xA5) ]);
const stream = Buffer.concat(Array.from({ length: FRAMES_PER_STREAM }, () => frame));
const chunks: Buffer[] = [];

for(let offset = 0; offset < stream.length; offset += CHUNK_BYTES) {

  chunks.push(stream.subarray(offset, offset + CHUNK_BYTES));
}

// Every await inside a loop below is sequential by design, because the iterator hands back one queued message per step and each run has to finish before the next
// one starts, or the runs would contend and skew the timing.
/* eslint-disable no-await-in-loop */
const runOnce = async (): Promise<RunResult> => {

  const socket = new MockSocket();
  const opening = Transport.open({

    host: "bench-host",
    log,
    maxFrameBytes: MAX_FRAME_BYTES,
    maxRecvBufferBytes: MAX_RECV_BUFFER_BYTES,
    port: 6053,
    socketFactory: (): Socket => socket as unknown as Socket
  });

  socket.simulateConnect();

  const transport = await opening;
  const messages = transport[Symbol.asyncIterator]();
  let framesObserved = 0;

  const start = performance.now();

  for(let pass = 0; pass < PASSES_PER_RUN; pass++) {

    // The transport frames each chunk synchronously inside pushData, so this loop carries the accumulator and parser cost; the drain after it only hands back the
    // messages already queued.
    for(const chunk of chunks) {

      socket.pushData(chunk);
    }

    for(let i = 0; i < FRAMES_PER_STREAM; i++) {

      const result = await messages.next();

      if(!result.done) {

        framesObserved += 1;
      }
    }
  }

  const durationMs = performance.now() - start;

  transport[Symbol.dispose]();

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
/* eslint-enable no-await-in-loop */

const stats = summarize(durations);
const fpsMedian = (FRAMES_PER_RUN / stats.median) * 1000;

// fps is the reciprocal of run duration, so the conservative 10th-percentile fps floor is computed from the 90th-percentile (slowest) duration, not from stats.p10.
const fpsP10 = (FRAMES_PER_RUN / stats.p90) * 1000;

// eslint-disable-next-line no-console
console.log(JSON.stringify({

  benchmark: "chunked-frames",
  chunkBytes: CHUNK_BYTES,
  fps: Math.round(fpsMedian),
  fpsP10: Math.round(fpsP10),
  frameBytes: frame.length,
  framesObserved,
  framesPerRun: FRAMES_PER_RUN,
  medianMs: Math.round(stats.median),
  runs: durations.map((d) => Math.round(d)),
  stddevMs: Math.round(stats.stddev),
  warmupRuns: WARMUP_RUNS
}));
