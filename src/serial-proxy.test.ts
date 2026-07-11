/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * serial-proxy.test.ts: Unit tests for the SerialProxyApi class plus the extractSerialProxies device-info decoder. Exercises every public method against an in-memory
 * host seam (no transport, no real device). Verifies the wire-format encode, the Correlator-based request/response correlation, the refcounted-subscription pattern
 * for the AsyncIterable surface, and the reset/reissueOnReconnect lifecycle.
 */
import type { CapturedContractFrame, ContractFrameKind } from "./reissuable-subscription-contract.helpers.ts";
import type { FieldValue, ProtoField } from "./protocol/codec.ts";
import type { SerialDataChunk, SerialProxyFlushResult, SerialProxyHost, SerialProxyInfo } from "./serial-proxy.ts";
import { SerialProxyApi, extractSerialProxies } from "./serial-proxy.ts";
import {
  SerialProxyLineStateFlags, SerialProxyParity, SerialProxyPortType, SerialProxyRequestType, SerialProxyStatus
} from "./api-constants.ts";
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { ConnectionError } from "./errors.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";
import { runReissuableSubscriptionContract } from "./reissuable-subscription-contract.helpers.ts";

interface CapturedFrame {

  payload: Buffer;
  type: number;
}

interface HostHandle {

  bus: EventBus<ClientEventsMap>;
  debugLogs: string[];
  host: SerialProxyHost;
  sent: CapturedFrame[];
  setDeviceInfo(serialProxies?: readonly SerialProxyInfo[]): void;
  warnLogs: string[];
}

// Build a fresh host seam in one call. Each test gets its own bus, captured-frames buffer, and recording logger so assertions stay isolated.
function makeHost(): HostHandle {

  const bus = new EventBus<ClientEventsMap>();
  const sent: CapturedFrame[] = [];
  const debugLogs: string[] = [];
  const warnLogs: string[] = [];
  let serialProxies: readonly SerialProxyInfo[] | undefined;

  const host: SerialProxyHost = {

    bus,
    deviceInfo: (): { serialProxies?: readonly SerialProxyInfo[] } | null => (serialProxies ? { serialProxies } : null),
    log: {

      debug: (message: string): void => { debugLogs.push(message); },
      error: (): void => { /* */ },
      info: (): void => { /* */ },
      warn: (message: string): void => { warnLogs.push(message); }
    },
    send: (type: number, payload: Buffer): void => { sent.push({ payload, type }); }
  };

  return {

    bus,
    debugLogs,
    host,
    sent,
    setDeviceInfo: (proxies?: readonly SerialProxyInfo[]): void => { serialProxies = proxies; },
    warnLogs
  };
}

function decodeFields(payload: Buffer): Record<number, FieldValue[]> {

  return decodeProtobuf(payload, { maxFieldsPerMessage: 100 });
}

// Convenience: build a `SerialProxyRequestResponse(FLUSH)` payload for direct acceptRequestResponse calls.
function flushResponsePayload(instance: number, status: SerialProxyStatus, errorMessage?: string): Buffer {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
    { fieldNumber: 2, value: SerialProxyRequestType.FLUSH, wireType: WireType.VARINT },
    { fieldNumber: 3, value: status, wireType: WireType.VARINT }
  ];

  if(errorMessage !== undefined) {

    fields.push({ fieldNumber: 4, value: Buffer.from(errorMessage, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  return encodeProtoFields(fields);
}

describe("SerialProxyApi.list", () => {

  test("returns an empty array when discovery has not completed", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    assert.deepEqual(api.list(), []);
  });

  test("returns the device-info serialProxies array unchanged", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const proxies: SerialProxyInfo[] = [

      { name: "uart_0", portType: SerialProxyPortType.TTL },
      { name: "uart_1", portType: SerialProxyPortType.RS232 }
    ];

    handle.setDeviceInfo(proxies);

    assert.deepEqual(api.list(), proxies);
  });
});

describe("SerialProxyApi.configure", () => {

  test("encodes all fields and sends SERIAL_PROXY_CONFIGURE_REQUEST", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.configure(0, { baudrate: 115200, dataSize: 8, flowControl: true, parity: SerialProxyParity.EVEN, stopBits: 2 });

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SERIAL_PROXY_CONFIGURE_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], 0, "instance in field 1");
    assert.equal(fields[2]?.[0], 115200, "baudrate in field 2");
    assert.equal(fields[3]?.[0], 1, "flowControl=true encoded as 1 in field 3");
    assert.equal(fields[4]?.[0], SerialProxyParity.EVEN, "parity in field 4");
    assert.equal(fields[5]?.[0], 2, "stopBits in field 5");
    assert.equal(fields[6]?.[0], 8, "dataSize in field 6");
  });

  test("applies defaults for omitted optional fields", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.configure(3, { baudrate: 9600, dataSize: 7 });

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[3]?.[0], 0, "flowControl default=false encoded as 0");
    assert.equal(fields[4]?.[0], SerialProxyParity.NONE, "parity default=NONE");
    assert.equal(fields[5]?.[0], 1, "stopBits default=1");
  });

  test("throws ConnectionError(INVALID_SERIAL_CONFIG) when dataSize is out of range", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    assert.throws(() => api.configure(0, { baudrate: 115200, dataSize: 4 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "INVALID_SERIAL_CONFIG");
    });

    assert.throws(() => api.configure(0, { baudrate: 115200, dataSize: 9 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "INVALID_SERIAL_CONFIG");
    });

    assert.equal(handle.sent.length, 0, "no wire send when validation fails");
  });

  test("throws ConnectionError(INVALID_SERIAL_CONFIG) when stopBits is out of range", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    assert.throws(() => api.configure(0, { baudrate: 115200, dataSize: 8, stopBits: 0 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "INVALID_SERIAL_CONFIG");
    });

    assert.throws(() => api.configure(0, { baudrate: 115200, dataSize: 8, stopBits: 3 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "INVALID_SERIAL_CONFIG");
    });
  });
});

describe("SerialProxyApi.write", () => {

  test("encodes instance + data and sends SERIAL_PROXY_WRITE_REQUEST", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const payload = Buffer.from([ 0x41, 0x42, 0x43 ]);

    api.write(2, payload);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SERIAL_PROXY_WRITE_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], 2);
    assert.deepEqual(fields[2]?.[0], payload);
  });

  test("round-trips arbitrary buffer content including null and high bytes", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    // A mix of null bytes, high bytes, and a UTF-8-invalid sequence (lone continuation byte 0x80).
    const payload = Buffer.from([ 0x00, 0xff, 0x80, 0x7f, 0xc0, 0x00 ]);

    api.write(0, payload);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.deepEqual(fields[2]?.[0], payload, "wire frame must contain the buffer verbatim");
  });
});

describe("SerialProxyApi.setModemPins", () => {

  test("encodes instance + lineStates and sends SERIAL_PROXY_SET_MODEM_PINS_REQUEST", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.setModemPins(1, SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SERIAL_PROXY_SET_MODEM_PINS_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], 1);
    assert.equal(fields[2]?.[0], 0x3);
  });
});

describe("SerialProxyApi.getModemPins", () => {

  test("sends SERIAL_PROXY_GET_MODEM_PINS_REQUEST and resolves with the response line-states", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const pending = api.getModemPins(0);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SERIAL_PROXY_GET_MODEM_PINS_REQUEST);

    api.acceptModemPinsResponse(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: SerialProxyLineStateFlags.RTS, wireType: WireType.VARINT }
    ]));

    const result = await pending;

    assert.equal(result, SerialProxyLineStateFlags.RTS);
  });

  test("rejects with AbortError on timeout", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    await assert.rejects(api.getModemPins(0, { timeoutMs: 10 }), (err: unknown) => {

      return (err instanceof DOMException) && ((err.name === "AbortError") || (err.name === "TimeoutError"));
    });
  });

  test("rejects with the user signal's reason on caller abort", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    const pending = api.getModemPins(0, { signal: controller.signal, timeoutMs: 10000 });

    controller.abort(reason);

    await assert.rejects(pending, reason);
  });

  test("rejects with ConnectionError(MODEM_PINS_IN_FLIGHT) on concurrent call for the same instance", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    const first = api.getModemPins(0, { timeoutMs: 1000 });

    await assert.rejects(api.getModemPins(0, { timeoutMs: 1000 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "MODEM_PINS_IN_FLIGHT");
    });

    api.acceptModemPinsResponse(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 0, wireType: WireType.VARINT }
    ]));

    await first;
  });

  test("allows independent concurrent awaits for different instances", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const a = api.getModemPins(0, { timeoutMs: 1000 });
    const b = api.getModemPins(1, { timeoutMs: 1000 });

    api.acceptModemPinsResponse(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: SerialProxyLineStateFlags.RTS, wireType: WireType.VARINT }
    ]));

    api.acceptModemPinsResponse(encodeProtoFields([

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 2, value: SerialProxyLineStateFlags.DTR, wireType: WireType.VARINT }
    ]));

    assert.equal(await a, SerialProxyLineStateFlags.RTS);
    assert.equal(await b, SerialProxyLineStateFlags.DTR);
  });

  test("stale response with no pending await is dropped at debug", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.acceptModemPinsResponse(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: SerialProxyLineStateFlags.RTS, wireType: WireType.VARINT }
    ]));

    assert.equal(handle.warnLogs.length, 0);
    assert.ok(handle.debugLogs.some((m) => m.includes("no pending await")), "expected a debug log about the stale response");
  });

  test("malformed response (missing field) is dropped at warn", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.acceptModemPinsResponse(Buffer.alloc(0));

    assert.equal(handle.warnLogs.length, 1);
  });
});

describe("SerialProxyApi.flush", () => {

  test("sends SERIAL_PROXY_REQUEST(FLUSH) and resolves with the response", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const pending = api.flush(0);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SERIAL_PROXY_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], 0);
    assert.equal(fields[2]?.[0], SerialProxyRequestType.FLUSH);

    api.acceptRequestResponse(flushResponsePayload(0, SerialProxyStatus.OK));

    const result = await pending;

    assert.equal(result.instance, 0);
    assert.equal(result.status, SerialProxyStatus.OK);
    assert.equal(result.type, SerialProxyRequestType.FLUSH);
    assert.equal(result.errorMessage, undefined);
  });

  test("resolves with each of the five SerialProxyStatus values when pushed", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const statuses = [

      SerialProxyStatus.OK,
      SerialProxyStatus.ASSUMED_SUCCESS,
      SerialProxyStatus.ERROR,
      SerialProxyStatus.TIMEOUT,
      SerialProxyStatus.NOT_SUPPORTED
    ];

    // We resolve each flush before issuing the next so the per-instance Correlator's in-flight guard never triggers; the sequential pattern is the test's contract.
    const pendings = statuses.map(async (status) => {

      const pending = api.flush(0);

      api.acceptRequestResponse(flushResponsePayload(0, status));

      return pending;
    });

    const results = await Promise.all(pendings);

    for(let i = 0; i < statuses.length; i++) {

      assert.equal(results[i]!.status, statuses[i]);
    }
  });

  test("carries errorMessage from the wire response into the result", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const pending = api.flush(0);

    api.acceptRequestResponse(flushResponsePayload(0, SerialProxyStatus.ERROR, "uart underrun"));

    const result = await pending;

    assert.equal(result.errorMessage, "uart underrun");
  });

  test("rejects on timeout", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    await assert.rejects(api.flush(0, { timeoutMs: 10 }), (err: unknown) => {

      return (err instanceof DOMException) && ((err.name === "AbortError") || (err.name === "TimeoutError"));
    });
  });

  test("rejects with ConnectionError(FLUSH_IN_FLIGHT) on concurrent call for the same instance", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const first = api.flush(0, { timeoutMs: 1000 });

    await assert.rejects(api.flush(0, { timeoutMs: 1000 }), (err: unknown) => {

      return (err instanceof ConnectionError) && (err.code === "FLUSH_IN_FLIGHT");
    });

    api.acceptRequestResponse(flushResponsePayload(0, SerialProxyStatus.OK));
    await first;
  });

  test("dropping a SUBSCRIBE / UNSUBSCRIBE response is a no-op debug log", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.acceptRequestResponse(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: SerialProxyRequestType.SUBSCRIBE, wireType: WireType.VARINT },
      { fieldNumber: 3, value: SerialProxyStatus.OK, wireType: WireType.VARINT }
    ]));

    assert.equal(handle.warnLogs.length, 0);
    assert.ok(handle.debugLogs.some((m) => m.includes("non-FLUSH request type")), "expected a debug log about non-FLUSH type");
  });

  test("stale FLUSH response with no pending await is dropped at debug", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);

    api.acceptRequestResponse(flushResponsePayload(0, SerialProxyStatus.OK));

    assert.ok(handle.debugLogs.some((m) => m.includes("no pending await")), "expected a debug log about the stale response");
  });
});

describe("SerialProxyApi.data refcounted subscription", () => {

  test("first subscriber sends SUBSCRIBE; iterator yields matching-instance chunks; consumer break sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const received: SerialDataChunk[] = [];
    const iter = api.data(0)[Symbol.asyncIterator]();

    // First subscriber should have sent SUBSCRIBE for instance 0.
    assert.equal(handle.sent.length, 1);

    const subFields = decodeFields(handle.sent[0]!.payload);

    assert.equal(subFields[1]?.[0], 0, "instance in field 1");
    assert.equal(subFields[2]?.[0], SerialProxyRequestType.SUBSCRIBE);

    // Push two matching-instance chunks and one mismatched one.
    handle.bus.emit("serialData", { data: Buffer.from([0x01]), instance: 0 });
    handle.bus.emit("serialData", { data: Buffer.from([0x02]), instance: 5 });
    handle.bus.emit("serialData", { data: Buffer.from([0x03]), instance: 0 });

    const first = await iter.next();

    received.push(first.value as SerialDataChunk);

    const second = await iter.next();

    received.push(second.value as SerialDataChunk);

    assert.equal(received.length, 2);
    assert.deepEqual(received[0]!.data, Buffer.from([0x01]));
    assert.equal(received[0]!.instance, 0);
    assert.deepEqual(received[1]!.data, Buffer.from([0x03]));
    assert.equal(received[1]!.instance, 0);

    // Detach the iterator. The generator's finally should send UNSUBSCRIBE.
    await iter.return?.();

    assert.equal(handle.sent.length, 2);

    const unsubFields = decodeFields(handle.sent[1]!.payload);

    assert.equal(unsubFields[1]?.[0], 0);
    assert.equal(unsubFields[2]?.[0], SerialProxyRequestType.UNSUBSCRIBE);
    assert.equal(api.subscriberCount(0), 0);
  });

  test("two concurrent consumers on the same instance share one wire SUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const iterA = api.data(0)[Symbol.asyncIterator]();
    const iterB = api.data(0)[Symbol.asyncIterator]();

    // Only one SUBSCRIBE on the wire for two concurrent consumers (the device-wide subscription is shared), but the per-instance subscriber count reads 2 - the ledger
    // tracks both live iterators even though they collapse to a single wire subscription.
    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(0), 2);

    handle.bus.emit("serialData", { data: Buffer.from([0x01]), instance: 0 });

    const a = await iterA.next();
    const b = await iterB.next();

    assert.deepEqual((a.value as SerialDataChunk).data, Buffer.from([0x01]));
    assert.deepEqual((b.value as SerialDataChunk).data, Buffer.from([0x01]));

    // First detach: no UNSUBSCRIBE yet.
    await iterA.return?.();
    assert.equal(handle.sent.length, 1, "first detach must not send UNSUBSCRIBE");
    assert.equal(api.subscriberCount(0), 1);

    // Second detach: UNSUBSCRIBE.
    await iterB.return?.();
    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[1]!.payload)[2]?.[0], SerialProxyRequestType.UNSUBSCRIBE);
    assert.equal(api.subscriberCount(0), 0);
  });

  test("AbortSignal abort tears down the refcount and sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const controller = new AbortController();
    const iterable = api.data(0, { signal: controller.signal });

    // Begin iteration (subscriber goes 0 -> 1, SUBSCRIBE sent) and let it park awaiting next chunk.
    const iter = iterable[Symbol.asyncIterator]();
    const nextPromise = iter.next();

    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(0), 1);

    controller.abort();

    await assert.rejects(nextPromise);

    assert.equal(api.subscriberCount(0), 0);
    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[1]!.payload)[2]?.[0], SerialProxyRequestType.UNSUBSCRIBE);
  });

  test("two iterators on different instances send independent SUBSCRIBEs and see disjoint chunks", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const iter0 = api.data(0)[Symbol.asyncIterator]();
    const iter1 = api.data(1)[Symbol.asyncIterator]();

    assert.equal(handle.sent.length, 2);
    assert.equal(decodeFields(handle.sent[0]!.payload)[1]?.[0], 0);
    assert.equal(decodeFields(handle.sent[1]!.payload)[1]?.[0], 1);

    handle.bus.emit("serialData", { data: Buffer.from([0xa0]), instance: 0 });
    handle.bus.emit("serialData", { data: Buffer.from([0xb1]), instance: 1 });

    const a = await iter0.next();
    const b = await iter1.next();

    assert.deepEqual((a.value as SerialDataChunk).data, Buffer.from([0xa0]));
    assert.deepEqual((b.value as SerialDataChunk).data, Buffer.from([0xb1]));

    await iter0.return?.();
    await iter1.return?.();
  });
});

describe("SerialProxyApi.acceptDataMessage", () => {

  test("decodes the wire frame and emits serialData on the bus", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const captured: SerialDataChunk[] = [];

    handle.bus.on("serialData", (chunk: SerialDataChunk): void => { captured.push(chunk); });

    api.acceptDataMessage(encodeProtoFields([

      { fieldNumber: 1, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 2, value: Buffer.from([ 0xaa, 0xbb ]), wireType: WireType.LENGTH_DELIMITED }
    ]));

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.instance, 2);
    assert.deepEqual(captured[0]!.data, Buffer.from([ 0xaa, 0xbb ]));
  });

  test("malformed message (missing data field) is dropped at warn", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const captured: SerialDataChunk[] = [];

    handle.bus.on("serialData", (chunk: SerialDataChunk): void => { captured.push(chunk); });

    api.acceptDataMessage(encodeProtoFields([

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT }
    ]));

    assert.equal(captured.length, 0);
    assert.equal(handle.warnLogs.length, 1);
  });
});

describe("SerialProxyApi.clearConnectionState and reissueOnReconnect", () => {

  test("clearConnectionState rejects every in-flight flush and getModemPins with AbortError", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const f = api.flush(0, { timeoutMs: 10000 });
    const g = api.getModemPins(1, { timeoutMs: 10000 });

    api.clearConnectionState();

    await assert.rejects(f, (err: unknown) => (err instanceof DOMException) && (err.name === "AbortError"));
    await assert.rejects(g, (err: unknown) => (err instanceof DOMException) && (err.name === "AbortError"));
  });

  test("clearConnectionState clears the wire cache but PRESERVES the subscriber ledger (count stays N)", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const iterA = api.data(0)[Symbol.asyncIterator]();
    const iterB = api.data(0)[Symbol.asyncIterator]();

    // Two concurrent iterators on instance 0, so the live subscriber count is 2.
    assert.equal(api.subscriberCount(0), 2);

    api.clearConnectionState();

    // clearConnectionState clears ONLY the connection-scoped wire cache; the subscriber ledger is PRESERVED. This is a direct assertion of the must-fix property: the
    // surviving iterators are still open across the reconnect cycle, so the per-instance count stays at the live value 2 (it does NOT reset to 0). The subsequent
    // reissueOnReconnect re-arms the device for these survivors (verified by the harness).
    assert.equal(api.subscriberCount(0), 2, "clearConnectionState must PRESERVE the subscriber ledger, so the count stays at the live value");

    // The iterators' finally blocks still run eventually; explicitly tear them down here so the test exits cleanly.
    void iterA.return?.();
    void iterB.return?.();
  });

  test("reissueOnReconnect re-sends SUBSCRIBE for every instance with active consumers", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const iter0 = api.data(0)[Symbol.asyncIterator]();
    const iter1 = api.data(1)[Symbol.asyncIterator]();

    // Clear the captured outbound buffer so we only see the reissue traffic.
    handle.sent.length = 0;

    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 2);

    // Order is not guaranteed (the ledger scan groups by key), so assert by content rather than position.
    const instances = handle.sent.map((frame) => decodeFields(frame.payload)[1]?.[0]).sort();

    assert.deepEqual(instances, [ 0, 1 ]);
    assert.equal(handle.sent.every((frame) => decodeFields(frame.payload)[2]?.[0] === SerialProxyRequestType.SUBSCRIBE), true);

    void iter0.return?.();
    void iter1.return?.();
  });

  test("iterator finally after clearConnectionState (no reissue) does not send a stray UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const iter = api.data(0)[Symbol.asyncIterator]();

    // First subscriber sent SUBSCRIBE.
    assert.equal(handle.sent.length, 1);

    api.clearConnectionState();

    // Clear the captured frames so we can assert that the iterator's finally adds nothing.
    handle.sent.length = 0;

    // Because clearConnectionState emptied the wire cache and no reissue re-armed it, the last-release reduces to EMPTY against an absent cache entry, so the empty
    // transition does NOT fire - no stray UNSUBSCRIBE for a connection the new transport never subscribed.
    await iter.return?.();

    assert.equal(handle.sent.length, 0, "post-clearConnectionState iterator teardown must not send a stray UNSUBSCRIBE");
  });

  test("subsequent flush after clearConnectionState succeeds without throwing FLUSH_IN_FLIGHT", async () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const before = api.flush(0, { timeoutMs: 10000 });

    api.clearConnectionState();
    await assert.rejects(before);

    // After clearConnectionState, a new flush should be admissible.
    const after = api.flush(0);

    api.acceptRequestResponse(flushResponsePayload(0, SerialProxyStatus.OK));

    const result = await after;

    assert.equal(result.status, SerialProxyStatus.OK);
  });
});

describe("extractSerialProxies (device-info decoder)", () => {

  test("decodes a repeated field 25 of SerialProxyInfo records", () => {

    const proxyA = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("uart_0", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: SerialProxyPortType.TTL, wireType: WireType.VARINT }
    ]);

    const proxyB = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("uart_1", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: SerialProxyPortType.RS485, wireType: WireType.VARINT }
    ]);

    const parent = encodeProtoFields([

      { fieldNumber: 25, value: proxyA, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 25, value: proxyB, wireType: WireType.LENGTH_DELIMITED }
    ]);

    const fields = decodeFields(parent);
    const result = extractSerialProxies(fields, 25, (b) => decodeFields(b));

    assert.deepEqual(result, [

      { name: "uart_0", portType: SerialProxyPortType.TTL },
      { name: "uart_1", portType: SerialProxyPortType.RS485 }
    ]);
  });

  test("returns an empty array when the field is absent", () => {

    const fields = decodeFields(Buffer.alloc(0));

    assert.deepEqual(extractSerialProxies(fields, 25, (b) => decodeFields(b)), []);
  });

  test("defaults portType to 0 (TTL) when the inner field is missing", () => {

    const proxy = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("uart_0", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    const parent = encodeProtoFields([{ fieldNumber: 25, value: proxy, wireType: WireType.LENGTH_DELIMITED }]);
    const fields = decodeFields(parent);

    assert.deepEqual(extractSerialProxies(fields, 25, (b) => decodeFields(b)), [{ name: "uart_0", portType: SerialProxyPortType.TTL }]);
  });

  test("skips entries missing the name field", () => {

    const proxyMissingName = encodeProtoFields([{ fieldNumber: 2, value: SerialProxyPortType.TTL, wireType: WireType.VARINT }]);
    const parent = encodeProtoFields([{ fieldNumber: 25, value: proxyMissingName, wireType: WireType.LENGTH_DELIMITED }]);
    const fields = decodeFields(parent);

    assert.deepEqual(extractSerialProxies(fields, 25, (b) => decodeFields(b)), []);
  });
});

describe("SerialProxyApi util.inspect.custom", () => {

  test("includes pending counters and subscriber-instance list", () => {

    const handle = makeHost();
    const api = new SerialProxyApi(handle.host);
    const inspectFn = api[Symbol.for("nodejs.util.inspect.custom") as never] as (depth: number, opts: { stylize: (s: string, t: string) => string }) => string;
    const stylize = (s: string): string => s;

    // Open a subscriber on instance 2 so the inspect output's subscriberInstances list (sourced from the ledger via activeKeys) is non-empty and reflects the live key.
    const iter = api.data(2)[Symbol.asyncIterator]();
    const out = inspectFn.call(api, 0, { stylize });

    assert.match(out, /SerialProxyApi/);
    assert.match(out, /pendingFlushes/);
    assert.match(out, /"subscriberInstances":\[2\]/);

    void iter.return?.();
  });
});

// The instance index this file's harness invocation drives. Serial subscriptions are per-instance, so the harness keys every assertion on this one instance; classify
// distinguishes SUBSCRIBE / UNSUBSCRIBE for it on the SerialProxyRequest type field while filtering out frames for other instances.
const CONTRACT_INSTANCE = 0;

// Drive the shared reissuable-subscription contract harness against a single Serial instance. The harness asserts the same canonical guarantees Z-Wave does, here
// keyed by instance number rather than a global channel, so the per-instance Serial sub-API proves the identical contract.
runReissuableSubscriptionContract<SerialProxyApi>({

  classify: (frame: CapturedContractFrame): ContractFrameKind => {

    if(frame.type !== MessageType.SERIAL_PROXY_REQUEST) {

      return "other";
    }

    const decoded = decodeFields(frame.payload);

    // A SerialProxyRequest carries the instance in field 1 and the request type in field 2. Frames for a different instance are "other" so they do not perturb the
    // counts the harness asserts on.
    if(decoded[1]?.[0] !== CONTRACT_INSTANCE) {

      return "other";
    }

    const type = decoded[2]?.[0];

    if(type === SerialProxyRequestType.SUBSCRIBE) {

      return "subscribe";
    }

    if(type === SerialProxyRequestType.UNSUBSCRIBE) {

      return "unsubscribe";
    }

    return "other";
  },
  label: "SerialProxyApi.data",
  openSubscription: (api: SerialProxyApi) => {

    // Open the iterator under an AbortController and start it so it enters its try/finally and parks in `for await` - exactly modeling a consumer parked across a
    // reconnect. release() aborts the controller, which rejects the parked inner stream next, unwinds the `for await`, and runs the cleanup finally (the subscription
    // release). We swallow the parked promise's abort rejection so it does not surface as an unhandled rejection.
    const controller = new AbortController();
    const iter = api.data(CONTRACT_INSTANCE, { signal: controller.signal })[Symbol.asyncIterator]();
    const parked = iter.next();

    parked.catch((): void => { /* The abort below settles this; the rejection is expected teardown, not a failure. */ });

    return { release: async (): Promise<void> => {

      controller.abort();

      // Await the parked next so the generator's finally (the subscription release) has run before the harness asserts on the wire effects.
      await parked.catch((): void => { /* expected abort */ });
    } };
  },
  setup: () => {

    const handle = makeHost();

    return { api: new SerialProxyApi(handle.host), sent: handle.sent };
  }
});

// Reference the SerialProxyFlushResult type so the test file's symbol table records the contract; assertions above check the runtime shape.
const _flushResultShape: SerialProxyFlushResult = { instance: 0, status: SerialProxyStatus.OK, type: SerialProxyRequestType.FLUSH };

void _flushResultShape;
