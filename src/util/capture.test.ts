/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.test.ts: Unit tests for the capture-replay primitives.
 */

/*
 * Covers the pure and isolated pieces of the capture-replay subsystem: the binary frame codec (round-trip, high-numbered type ids, truncation detection), the
 * RecordingTransport tee (it copies every inbound message while delegating), and PII scrubbing. The end-to-end record-through-replay drive lives in
 * test/e2e/capture.test.ts, where the simulator scenarios provide validated wire fixtures.
 */
import { RecordingTransport, decodeCaptureFrames, encodeCaptureFrames, recordCapture, replayCaptureFrames, scrubDeviceInfo } from "./capture.ts";
import { describe, test } from "node:test";
import { CliError } from "./cli-error.ts";
import type { DeviceInfo } from "../esphome-client.ts";
import { EspHomeClient } from "../esphome-client.ts";
import type { InboundMessage } from "../transport.ts";
import { MessageType } from "../protocol/message-types.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("capture frame codec", () => {

  test("round-trips an ordered frame sequence", () => {

    const frames: InboundMessage[] = [

      { payload: Buffer.from([ 1, 2, 3 ]), type: 2 },
      { payload: Buffer.alloc(0), type: 10 },
      { payload: Buffer.from("hello", "utf8"), type: 33 }
    ];

    const decoded = decodeCaptureFrames(encodeCaptureFrames(frames));

    assert.equal(decoded.length, 3);
    assert.deepEqual(decoded.map((frame) => frame.type), [ 2, 10, 33 ]);
    assert.deepEqual(decoded[2]?.payload.toString("utf8"), "hello");
  });

  test("preserves message type ids above 127 (varint type field, not a single byte)", () => {

    // ZWAVE_PROXY_FRAME (128) and the infrared/RF transmit message (136) are above the 7-bit boundary; a single-byte type field would truncate them.
    const frames: InboundMessage[] = [ { payload: Buffer.from([9]), type: 128 }, { payload: Buffer.from([7]), type: 136 } ];
    const decoded = decodeCaptureFrames(encodeCaptureFrames(frames));

    assert.deepEqual(decoded.map((frame) => frame.type), [ 128, 136 ]);
  });

  test("an empty capture decodes to an empty sequence", () => {

    assert.deepEqual(decodeCaptureFrames(Buffer.alloc(0)), []);
  });

  test("a truncated capture throws rather than replaying a partial frame", () => {

    // A frame declaring three payload bytes but providing one: the decoder must reject it.
    const truncated = Buffer.concat([encodeCaptureFrames([{ payload: Buffer.from([ 1, 2, 3 ]), type: 5 }]).subarray(0, 3)]);

    assert.throws(() => decodeCaptureFrames(truncated), /truncated or corrupt/);

    // A corrupt capture is the user's file to replace, so the failure is the CLI's user-facing error class rather than an internal-bug throw.
    assert.throws(() => decodeCaptureFrames(truncated), CliError);
  });

  test("a capture truncated mid-varint throws the same unified error (via Error.cause)", () => {

    // A lone 0xFF byte is an incomplete varint - continuation bit set with no terminating byte. The read error is wrapped into the unified truncation error.
    assert.throws(() => decodeCaptureFrames(Buffer.from([0xFF])), (error: unknown): boolean => {

      assert.ok(error instanceof Error, "A capture truncated mid-varint throws an Error.");
      assert.match(error.message, /truncated or corrupt/);
      assert.notEqual(error.cause, undefined);

      return true;
    });
    assert.throws(() => decodeCaptureFrames(Buffer.from([0xFF])), CliError);
  });
});

describe("capture replay refusal", () => {

  test("a capture with frames but no LIST_ENTITIES_DONE_RESPONSE rejects with a CliError before any connect", async () => {

    // A capture that cannot drive discovery is the user's to re-record, so the refusal is the CLI's user-facing error class and names the missing frame.
    await assert.rejects(replayCaptureFrames([{ payload: Buffer.from([1]), type: 2 }]), { constructor: CliError, message: /no LIST_ENTITIES_DONE_RESPONSE frame/ });
  });
});

describe("capture connect timeouts", () => {

  test("a recording whose connect times out rejects with a CliError naming the host once the construction retries are spent", async (t) => {

    const timeout = new DOMException("The operation was aborted due to timeout.", "TimeoutError");
    const connect = t.mock.method(EspHomeClient.prototype, "connect", (): Promise<void> => Promise.reject(timeout));
    const startedAt = Date.now();

    // The connect fails before the capture window opens, so nothing is written to the output path.
    await assert.rejects(recordCapture({ host: "192.0.2.1", outputPath: join(tmpdir(), "esphome-capture-timeout.bin") }), (error: unknown): boolean => {

      assert.ok(error instanceof CliError, "a timed-out recording connect must reach the bin as a user-facing CliError");
      assert.match(error.message, /192\.0\.2\.1/, "the failure must name the host");
      assert.equal(error.cause, timeout, "the failure must carry the TimeoutError as its cause");

      return true;
    });

    // The default construction budget retries the connect with a growing backoff between attempts, so the recording reports the timeout only once that backoff is
    // waited out.
    assert.equal(connect.mock.callCount(), 4, "the recording must spend the default construction retries before it reports the timeout");
    assert.ok((Date.now() - startedAt) < 8000, "the recording must report the timeout once the backoff is waited out rather than hang");
  });

  test("a replay whose connect times out rejects with a CliError naming the replay host", async (t) => {

    const timeout = new DOMException("The operation was aborted due to timeout.", "TimeoutError");

    t.mock.method(EspHomeClient.prototype, "connect", (): Promise<void> => Promise.reject(timeout));

    await assert.rejects(replayCaptureFrames([{ payload: Buffer.alloc(0), type: MessageType.LIST_ENTITIES_DONE_RESPONSE }]), (error: unknown): boolean => {

      assert.ok(error instanceof CliError, "a timed-out replay connect must reach the bin as a user-facing CliError");
      assert.match(error.message, /replay/, "the failure must name the replay host");
      assert.equal(error.cause, timeout, "the failure must carry the TimeoutError as its cause");

      return true;
    });
  });
});

describe("RecordingTransport", () => {

  test("records a copy of every inbound message while delegating iteration", async () => {

    const inner = new MockTransport();
    const recorded: InboundMessage[] = [];
    const tee = new RecordingTransport(inner, recorded);

    inner.pushInbound(2, Buffer.from([ 1, 2, 3 ]));
    inner.pushInbound(10, Buffer.from([ 4, 5 ]));

    const iterator = tee[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();

    assert.equal(first.value?.type, 2);
    assert.equal(second.value?.type, 10);
    assert.equal(recorded.length, 2);
    assert.deepEqual(recorded.map((frame) => frame.type), [ 2, 10 ]);
    assert.deepEqual(recorded[0]?.payload, Buffer.from([ 1, 2, 3 ]));
  });

  test("the recorded payload is a copy, not a view that can be overwritten", async () => {

    const inner = new MockTransport();
    const recorded: InboundMessage[] = [];
    const tee = new RecordingTransport(inner, recorded);
    const source = Buffer.from([ 9, 9 ]);

    inner.pushInbound(7, source);

    await tee[Symbol.asyncIterator]().next();

    // Mutating the source buffer must not change the recorded copy.
    source[0] = 0;

    assert.deepEqual(recorded[0]?.payload, Buffer.from([ 9, 9 ]));
  });

  test("delegates the encryption flag to the inner transport", () => {

    const inner = new MockTransport();
    const tee = new RecordingTransport(inner, []);

    assert.equal(tee.isEncrypted, inner.isEncrypted);
  });
});

describe("scrubDeviceInfo", () => {

  test("returns null for null input", () => {

    assert.equal(scrubDeviceInfo(null), null);
  });

  test("replaces MAC, BLE MAC, name, and friendly name with synthetic values", () => {

    const info = {

      bluetoothMacAddress: "11:22:33:44:55:66",
      friendlyName: "Living Room",
      macAddress: "AA:BB:CC:DD:EE:FF",
      name: "living-room"
    } as unknown as DeviceInfo;

    const scrubbed = scrubDeviceInfo(info);

    assert.notEqual(scrubbed?.["macAddress"], "AA:BB:CC:DD:EE:FF");
    assert.match(String(scrubbed?.["macAddress"]), /^00:00:00:00:/);
    assert.match(String(scrubbed?.["bluetoothMacAddress"]), /^02:00:00:00:/);
    assert.match(String(scrubbed?.["name"]), /^device-\d+$/);
    assert.match(String(scrubbed?.["friendlyName"]), /^device-\d+$/);
  });
});
