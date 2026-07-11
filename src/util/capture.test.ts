/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.test.ts: Unit tests for the capture-replay primitives.
 */

/*
 * Covers the pure and isolated pieces of the capture-replay subsystem: the binary frame codec (round-trip, high-numbered type ids, truncation detection), the
 * RecordingTransport tee (it copies every inbound message while delegating), and PII scrubbing. The end-to-end record-through-replay drive lives in
 * test/e2e/capture.test.ts, where the simulator scenarios provide validated wire fixtures.
 */
import { decodeCaptureFrames, encodeCaptureFrames, scrubDeviceInfo } from "./capture.ts";
import { describe, test } from "node:test";
import type { DeviceInfo } from "../esphome-client.ts";
import type { InboundMessage } from "../transport.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import { RecordingTransport } from "./capture.ts";
import assert from "node:assert/strict";

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
  });

  test("a capture truncated mid-varint throws the same unified error (via Error.cause)", () => {

    // A lone 0xFF byte is an incomplete varint - continuation bit set with no terminating byte. The read error is wrapped into the unified truncation error.
    assert.throws(() => decodeCaptureFrames(Buffer.from([0xFF])), (error: unknown): boolean => {

      return (error instanceof Error) && error.message.includes("truncated or corrupt") && (error.cause !== undefined);
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
