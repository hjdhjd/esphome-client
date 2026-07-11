/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.test.ts: Unit tests for the per-id CameraApi multi-packet reassembly logic.
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { CameraApi } from "./camera.ts";
import type { CameraHost } from "./camera.ts";
import { CameraStreamClosedError } from "./errors.ts";
import type { ClientEventsMap } from "./esphome-client.ts";
import { EventBus } from "./event-bus.ts";
import assert from "node:assert/strict";
import { entityId } from "./entity-id.ts";

function makeHost(maxImageBytes = 8 * 1024 * 1024):
CameraHost & { events: { event: string; payload: unknown }[]; sent: { type: number; payload: Buffer }[]; warnings: { context?: unknown; message: string }[] } {

  const bus = new EventBus<ClientEventsMap>();
  const events: { event: string; payload: unknown }[] = [];
  const sent: { type: number; payload: Buffer }[] = [];
  const warnings: { context?: unknown; message: string }[] = [];

  bus.on("camera", (payload) => { events.push({ event: "camera", payload }); });

  return {

    bus,
    events,
    log: {

      debug: (): void => { /* */ },
      error: (): void => { /* */ },
      info: (): void => { /* */ },
      warn: (message: string, context?: unknown): void => { warnings.push({ context, message }); }
    },
    maxImageBytes,
    send: (type: number, payload: Buffer): void => { sent.push({ payload, type }); },
    sent,
    warnings
  };
}

describe("CameraApi.acceptChunk", () => {

  test("buffers a single chunk without emitting when done is false", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    cam.acceptChunk(Buffer.from([ 0x01, 0x02 ]), false, "FrontDoor", 1);

    assert.equal(host.events.length, 0, "incomplete image must not emit a camera event");
  });

  test("emits an assembled camera event when done is true with a single chunk", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    cam.acceptChunk(Buffer.from([ 0xff, 0xd8 ]), true, "FrontDoor", 1);

    assert.equal(host.events.length, 1);

    const payload = host.events[0]?.payload as { image: Buffer; name: string };

    assert.deepEqual(payload.image, Buffer.from([ 0xff, 0xd8 ]));
    assert.equal(payload.name, "FrontDoor");
  });

  test("concatenates multiple chunks in order on done", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    cam.acceptChunk(Buffer.from([0x11]), false, "FrontDoor", 1);
    cam.acceptChunk(Buffer.from([ 0x22, 0x33 ]), false, "FrontDoor", 1);
    cam.acceptChunk(Buffer.from([0x44]), true, "FrontDoor", 1);

    const payload = host.events[0]?.payload as { image: Buffer };

    assert.deepEqual(payload.image, Buffer.from([ 0x11, 0x22, 0x33, 0x44 ]));
  });

  test("clears the internal buffer between distinct image cycles", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    // First image.
    cam.acceptChunk(Buffer.from([0x01]), true, "FrontDoor", 1);

    // Second image must NOT include the first image's bytes.
    cam.acceptChunk(Buffer.from([0x02]), true, "FrontDoor", 1);

    assert.equal(host.events.length, 2);

    const second = host.events[1]?.payload as { image: Buffer };

    assert.deepEqual(second.image, Buffer.from([0x02]), "buffer must reset between image cycles");
  });

  test("a single empty chunk with done=true emits a zero-length image (the empty-input boundary)", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    cam.acceptChunk(Buffer.alloc(0), true, "front", 1);

    assert.equal(host.events.length, 1, "a done-terminated empty chunk must still emit exactly one camera event");

    const payload = host.events[0]?.payload as { image: Buffer };

    assert.equal(payload.image.length, 0, "the assembled image of an empty chunk must be zero-length, not dropped or corrupted");
  });
});

describe("CameraApi.acceptChunk reassembly byte cap", () => {

  test("drops the in-flight image and warns when reassembly exceeds maxImageBytes, then recovers cleanly", () => {

    const host = makeHost(4);
    const cam = new CameraApi(host, entityId("camera", "front"));

    // Accumulate 3 bytes (under the 4-byte cap), no done yet.
    cam.acceptChunk(Buffer.from([ 0x01, 0x02, 0x03 ]), false, "front", 1);
    assert.equal(host.events.length, 0, "an under-cap partial image must not emit");
    assert.equal(host.warnings.length, 0, "no warning while under the cap");

    // The next chunk drives the running total to 5 > 4: the in-flight image is dropped and a warning is emitted (no corrupt event).
    cam.acceptChunk(Buffer.from([ 0x04, 0x05 ]), false, "front", 1);
    assert.equal(host.events.length, 0, "an over-cap image must not emit a corrupt camera event");
    assert.equal(host.warnings.length, 1, "exceeding maxImageBytes must emit exactly one warning");
    assert.ok((host.warnings[0]?.message ?? "").includes("maximum image size"), "the warning must name the cause");

    // After the drop, reassembly is reset: a fresh small image assembles with no stale-prefix corruption.
    cam.acceptChunk(Buffer.from([0x42]), true, "front", 1);
    assert.equal(host.events.length, 1, "a fresh image after the drop must assemble");

    const payload = host.events[0]?.payload as { image: Buffer };

    assert.deepEqual(payload.image, Buffer.from([0x42]), "the recovered image must not contain bytes from the dropped partial");
  });

  test("drops a single chunk that alone exceeds maxImageBytes, before it can emit", () => {

    const host = makeHost(2);
    const cam = new CameraApi(host, entityId("camera", "front"));

    // A done-terminated chunk that alone exceeds the cap must be dropped and warned, never assembled - the cap check precedes the done emit.
    cam.acceptChunk(Buffer.from([ 0x01, 0x02, 0x03 ]), true, "front", 1);
    assert.equal(host.events.length, 0, "a single over-cap chunk must not emit");
    assert.equal(host.warnings.length, 1, "a single over-cap chunk must warn");
  });

  test("reassembly reaching exactly maxImageBytes is not dropped (the boundary below overflow)", () => {

    const host = makeHost(4);
    const cam = new CameraApi(host, entityId("camera", "front"));

    // The cap check is strictly-greater (reassembledBytes > maxImageBytes), so a total of EXACTLY the cap must assemble and emit, not drop. The overflow tests above
    // cover 5 > 4 (drop); this covers exactly 4 (no drop), pinning the threshold from below.
    cam.acceptChunk(Buffer.from([ 0x01, 0x02 ]), false, "front", 1);
    cam.acceptChunk(Buffer.from([ 0x03, 0x04 ]), true, "front", 1);

    assert.equal(host.warnings.length, 0, "a reassembly reaching exactly the cap must not warn or drop");
    assert.equal(host.events.length, 1, "a reassembly reaching exactly the cap must assemble and emit");

    const payload = host.events[0]?.payload as { image: Buffer };

    assert.deepEqual(payload.image, Buffer.from([ 0x01, 0x02, 0x03, 0x04 ]), "the assembled image at exactly the cap must contain all four bytes intact");
  });
});

describe("CameraApi.resetReassembly", () => {

  test("drops in-flight chunks so the next image starts clean", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    cam.acceptChunk(Buffer.from([ 0xaa, 0xbb ]), false, "FrontDoor", 1);
    cam.resetReassembly();

    // Now finalize a new image; the dropped chunks must not appear.
    cam.acceptChunk(Buffer.from([0x99]), true, "FrontDoor", 1);

    const payload = host.events[0]?.payload as { image: Buffer };

    assert.deepEqual(payload.image, Buffer.from([0x99]));
  });

  test("is a no-op when no chunks are buffered", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    assert.doesNotThrow(() => cam.resetReassembly());
  });
});

describe("CameraApi.snapshot", () => {

  test("sends a CAMERA_IMAGE_REQUEST(single=true) and resolves with the next image", async () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    const snapshotPromise = cam.snapshot();

    // Yield so the snapshot's stream subscription attaches before we emit.
    await new Promise((resolve) => setImmediate(resolve));

    // The api should have sent a single-shot request.
    assert.equal(host.sent.length, 1);

    // Push the assembled image via acceptChunk (the same path the host's run-phase dispatcher uses).
    cam.acceptChunk(Buffer.from([ 0xab, 0xcd ]), true, "FrontDoor", 1);

    const result = await snapshotPromise;

    assert.deepEqual(result, Buffer.from([ 0xab, 0xcd ]));
  });

  test("distinguishes foreign camera events by branded id, not by friendly name", async () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    const snapshotPromise = cam.snapshot();

    await new Promise((resolve) => setImmediate(resolve));

    // A DIFFERENT camera ("back") whose friendly name even COLLIDES with ours. A name-based filter would wrongly deliver this frame, and an undiscovered (null-name)
    // camera would fall open to any camera entirely. The branded entity id is the exact, always-available tag, so this foreign frame must be skipped.
    host.bus.emit("camera", { entity: entityId("camera", "back"), image: Buffer.from([ 0xBA, 0xD0 ]), key: 99, name: "front", type: "camera" });

    // Then the genuine frame for THIS camera arrives via the host's reassembly path.
    cam.acceptChunk(Buffer.from([0xff]), true, "front", 1);

    const result = await snapshotPromise;

    assert.deepEqual(result, Buffer.from([0xff]), "snapshot must skip a foreign camera's event even when its name collides, and resolve only with this camera's image");
  });

  test("rejects with a typed CameraStreamClosedError when the bus disposes before any image arrives", async () => {

    // Simulates the operational case: the transport disconnects mid-snapshot, the host disposes the bus, and the awaiting consumer sees the typed rejection. The error
    // must carry the branded camera id and the tagged STREAM_CLOSED code so a consumer awaiting multiple cameras can correlate which snapshot failed.
    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    const snapshotPromise = cam.snapshot();

    // Yield so the subscription is attached before we dispose.
    await new Promise((resolve) => setImmediate(resolve));

    host.bus.dispose();

    await assert.rejects(snapshotPromise, (err: unknown): boolean => {

      assert.equal(err instanceof CameraStreamClosedError, true, "must be a CameraStreamClosedError");
      assert.equal((err as CameraStreamClosedError).code, "STREAM_CLOSED");
      assert.equal((err as CameraStreamClosedError).cameraId, "camera-front", "must carry the branded camera id");
      assert.ok((err as Error).message.includes("camera-front"), "message must name the camera id for log correlation");

      return true;
    });
  });
});

describe("CameraApi.stream", () => {

  test("yields only this camera's frames, distinguishing foreign events by branded id", async () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    const iterator = cam.stream()[Symbol.asyncIterator]();
    const nextFrame = iterator.next();

    // Yield so the stream subscription attaches before we emit.
    await new Promise((resolve) => setImmediate(resolve));

    // A foreign camera's frame (different branded id, colliding name) must be skipped by the id tag.
    host.bus.emit("camera", { entity: entityId("camera", "back"), image: Buffer.from([ 0xBA, 0xD0 ]), key: 99, name: "front", type: "camera" });

    // This camera's genuine frame must be the one yielded.
    cam.acceptChunk(Buffer.from([ 0x42, 0x43 ]), true, "front", 1);

    const result = await nextFrame;

    assert.equal(result.done, false);
    assert.deepEqual(result.value, Buffer.from([ 0x42, 0x43 ]), "stream must yield only this camera's frame, never a foreign camera's");

    await iterator.return?.();
  });

  test("starts the device stream on first iteration and stops it only when the consumer ends iteration", async () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));

    const iterator = cam.stream()[Symbol.asyncIterator]();
    const nextFrame = iterator.next();

    // Yield so the generator runs startStream() and the bus subscription attaches.
    await new Promise((resolve) => setImmediate(resolve));

    // Edge: starting the stream sends exactly one CameraImageRequest with single=false, stream=true. Bytes hand-verified against api.proto's CameraImageRequest: field 1
    // (single) VARINT 0 -> tag 0x08 value 0x00; field 2 (stream) VARINT 1 -> tag 0x10 value 0x01. Negative: the stop request (both flags clear) must NOT have fired yet -
    // the generator's finally clears the stream flag only when the consumer stops iterating.
    assert.equal(host.sent.length, 1, "starting a stream must send exactly one request");
    assert.deepEqual(host.sent[0]?.payload, Buffer.from([ 0x08, 0x00, 0x10, 0x01 ]), "the start request must encode single=false, stream=true");

    // Deliver one frame so the consumer completes a clean iteration before ending the stream.
    cam.acceptChunk(Buffer.from([0x42]), true, "front", 1);

    const frame = await nextFrame;

    assert.deepEqual(frame.value, Buffer.from([0x42]), "the stream must yield this camera's frame");

    // Ending iteration runs the generator's finally, which sends the both-flags-false stop request.
    await iterator.return?.();

    assert.equal(host.sent.length, 2, "ending iteration must send exactly one additional (stop) request");
    assert.deepEqual(host.sent[1]?.payload, Buffer.from([ 0x08, 0x00, 0x10, 0x00 ]), "the stop request must encode single=false, stream=false (both flags clear)");
  });
});

describe("CameraApi - hot path", () => {

  test("reassembles and emits 10,000 multi-chunk images in order with no inter-cycle leakage", () => {

    const host = makeHost();
    const cam = new CameraApi(host, entityId("camera", "front"));
    const N = 10000;
    let firstWrong = -1;

    // acceptChunk runs per inbound CameraImageResponse frame on hot path #1; a streaming camera drives many chunks per second. Each image here is two chunks (a partial
    // plus a done) carrying its own index across two bytes, so the loop exercises the full per-image path - the O(1) lockstep byte accumulator, the done concat, the bus
    // emit, and the reset - N times, and confirms no bytes leak between cycles.
    for(let i = 0; i < N; i++) {

      cam.acceptChunk(Buffer.from([(i >> 8) & 0xff]), false, "front", 1);
      cam.acceptChunk(Buffer.from([i & 0xff]), true, "front", 1);

      const image = (host.events[i]?.payload as { image: Buffer } | undefined)?.image;

      if((firstWrong === -1) && ((image?.length !== 2) || (image.readUInt16BE(0) !== i))) {

        firstWrong = i;
      }
    }

    assert.equal(host.events.length, N, "every completed image must emit exactly one camera event");
    assert.equal(firstWrong, -1, "each image must reassemble to its own two bytes in order with no leakage between cycles");
  });
});
