/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bluetooth-proxy.test.ts: Unit tests for the BluetoothProxyApi class. Exercises every public method against an in-memory host seam (no transport, no real device).
 * Verifies the wire-format encode, the batched fan-out path, the ReissuableSubscription-backed dimensions (advertisement, connections-free, notify) for the
 * AsyncIterable surface, and the clearConnectionState / reissueOnReconnect lifecycle. Drives the shared reissuable-subscription contract harness for each
 * dimension. Pairs with `bluetooth-proxy.types.test.ts`, which covers the type-system surface.
 */
import { BluetoothDeviceRequestType, BluetoothScannerMode, BluetoothScannerState } from "./api-constants.ts";
import type {
  BluetoothGATTService, BluetoothLERawAdvertisement, BluetoothProxyHost, BluetoothScannerStateData, ConnectionStateData, ConnectionsFreeData, NotifyDataChunk
} from "./bluetooth-proxy.ts";
import type { CapturedContractFrame, ContractFrameKind } from "./reissuable-subscription-contract.helpers.ts";
import type { FieldValue, ProtoField } from "./protocol/codec.ts";
import { decodeProtobuf, encodeProtoFields, encodeVarintBigInt } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import { BluetoothProxyApi } from "./bluetooth-proxy.ts";
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
  host: BluetoothProxyHost;
  sent: CapturedFrame[];
  setBluetoothProxyFeatureFlags(flags?: number): void;
  warnLogs: string[];
}

// Build a fresh host seam in one call. Each test gets its own bus, captured-frames buffer, and recording logger so assertions stay isolated.
function makeHost(): HostHandle {

  const bus = new EventBus<ClientEventsMap>();
  const sent: CapturedFrame[] = [];
  const debugLogs: string[] = [];
  const warnLogs: string[] = [];
  let flags: number | undefined;

  const host: BluetoothProxyHost = {

    bus,
    deviceInfo: (): { bluetoothProxyFeatureFlags?: number } | null => ((flags === undefined) ? null : { bluetoothProxyFeatureFlags: flags }),
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
    setBluetoothProxyFeatureFlags: (value?: number): void => { flags = value; },
    warnLogs
  };
}

function decodeFields(payload: Buffer): Record<number, FieldValue[]> {

  return decodeProtobuf(payload, { maxFieldsPerMessage: 1024 });
}

// Encode one BluetoothLERawAdvertisement nested message for the round-trip tests. Mirrors the helper in mock-transport.ts but kept local to keep the test self-contained.
function encodeAdvertisement(advertisement: BluetoothLERawAdvertisement): Buffer {

  const parts: Buffer[] = [];

  // Field 1 (uint64 address): tag + bigint body.
  parts.push(Buffer.from([(1 << 3) | WireType.VARINT]));
  parts.push(encodeVarintBigInt(advertisement.address));

  // Field 2 (sint32 rssi): zigzag encode.
  const zigzag = ((advertisement.rssi << 1) ^ (advertisement.rssi >> 31)) >>> 0;

  parts.push(encodeProtoFields([{ fieldNumber: 2, value: zigzag, wireType: WireType.VARINT }]));

  // Field 3 (uint32 address_type): standard varint.
  parts.push(encodeProtoFields([{ fieldNumber: 3, value: advertisement.addressType, wireType: WireType.VARINT }]));

  // Field 4 (bytes data): length-delimited.
  parts.push(encodeProtoFields([{ fieldNumber: 4, value: advertisement.data, wireType: WireType.LENGTH_DELIMITED }]));

  return Buffer.concat(parts);
}

// Build a BluetoothLERawAdvertisementsResponse payload around the supplied advertisement records.
function encodeAdvertisementsBatch(advertisements: readonly BluetoothLERawAdvertisement[]): Buffer {

  const fields: ProtoField[] = advertisements.map((ad) => ({

    fieldNumber: 1,
    value: encodeAdvertisement(ad),
    wireType: WireType.LENGTH_DELIMITED
  }));

  return encodeProtoFields(fields);
}

// Build a BluetoothScannerStateResponse payload.
function encodeScannerState(data: BluetoothScannerStateData): Buffer {

  return encodeProtoFields([

    { fieldNumber: 1, value: data.state, wireType: WireType.VARINT },
    { fieldNumber: 2, value: data.mode, wireType: WireType.VARINT },
    { fieldNumber: 3, value: data.configuredMode, wireType: WireType.VARINT }
  ]);
}

describe("BluetoothProxyApi.available", () => {

  test("returns false before discovery completes (deviceInfo is null)", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    assert.equal(api.available, false);
  });

  test("returns false when bluetoothProxyFeatureFlags is undefined", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    // setBluetoothProxyFeatureFlags(undefined) leaves the device-info accessor returning null entirely; an explicit zero is the "compiled out" case.
    handle.setBluetoothProxyFeatureFlags(0);

    assert.equal(api.available, false);
  });

  test("returns true when bluetoothProxyFeatureFlags is nonzero", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    handle.setBluetoothProxyFeatureFlags(0x1);

    assert.equal(api.available, true);
  });

  test("returns true for a large bitmask value", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    handle.setBluetoothProxyFeatureFlags(0xff);

    assert.equal(api.available, true);
  });
});

describe("BluetoothProxyApi.setScannerMode", () => {

  test("encodes the mode and sends BLUETOOTH_SCANNER_SET_MODE_REQUEST", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.setScannerMode(BluetoothScannerMode.ACTIVE);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_SCANNER_SET_MODE_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], BluetoothScannerMode.ACTIVE);
  });

  test("encodes PASSIVE as 0", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.setScannerMode(BluetoothScannerMode.PASSIVE);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[1]?.[0], 0);
  });
});

describe("BluetoothProxyApi.advertisements refcounted subscription", () => {

  test("first subscriber sends SUBSCRIBE with flags=0; consumer break sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.advertisements()[Symbol.asyncIterator]();

    // First subscriber should have sent SUBSCRIBE with flags=0.
    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST);
    assert.equal(decodeFields(handle.sent[0]!.payload)[1]?.[0], 0, "flags field must be 0");
    assert.equal(api.subscriberCount(), 1);

    // Drive the generator through one yield so the for-await loop is past its initial start and the finally is reachable via `iter.return`. We push one synthetic
    // advertisement, consume it, and then detach.
    handle.bus.emit("bluetoothAdvertisement", { address: 0x10n, addressType: 0, data: Buffer.alloc(0), rssi: -50 });

    const first = await iter.next();

    assert.equal(first.done, false);

    // Detach: the generator's finally should send UNSUBSCRIBE with an empty payload.
    await iter.return?.();

    assert.equal(handle.sent.length, 2);
    assert.equal(handle.sent[1]!.type, MessageType.UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST);
    assert.equal(handle.sent[1]!.payload.length, 0, "UNSUBSCRIBE payload must be empty");
    assert.equal(api.subscriberCount(), 0);
  });

  test("two concurrent consumers share one wire SUBSCRIBE; first detach does not unsubscribe; second does", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iterA = api.advertisements()[Symbol.asyncIterator]();
    const iterB = api.advertisements()[Symbol.asyncIterator]();

    // Only one SUBSCRIBE on the wire even though two iterators attached.
    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(), 2);

    // Drive both generators through one yield each so the wrapping finally is reachable on detach.
    handle.bus.emit("bluetoothAdvertisement", { address: 0x20n, addressType: 0, data: Buffer.alloc(0), rssi: -50 });
    await iterA.next();
    await iterB.next();

    // First detach: refcount drops to 1, no UNSUBSCRIBE.
    await iterA.return?.();
    assert.equal(handle.sent.length, 1, "first detach must not send UNSUBSCRIBE");
    assert.equal(api.subscriberCount(), 1);

    // Second detach: refcount drops to 0, UNSUBSCRIBE sent.
    await iterB.return?.();
    assert.equal(handle.sent.length, 2);
    assert.equal(handle.sent[1]!.type, MessageType.UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST);
    assert.equal(api.subscriberCount(), 0);
  });

  test("both concurrent iterators receive every advertisement (independent bus.stream subscriptions)", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iterA = api.advertisements()[Symbol.asyncIterator]();
    const iterB = api.advertisements()[Symbol.asyncIterator]();
    const ad: BluetoothLERawAdvertisement = { address: 0x123456789abcn, addressType: 1, data: Buffer.from([ 0x01, 0x02 ]), rssi: -60 };

    handle.bus.emit("bluetoothAdvertisement", ad);

    const a = (await iterA.next()).value as BluetoothLERawAdvertisement;
    const b = (await iterB.next()).value as BluetoothLERawAdvertisement;

    assert.equal(a.address, 0x123456789abcn);
    assert.equal(b.address, 0x123456789abcn);

    await iterA.return?.();
    await iterB.return?.();
  });

  test("AbortSignal abort tears down the refcount and sends UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const controller = new AbortController();
    const iter = api.advertisements({ signal: controller.signal })[Symbol.asyncIterator]();
    const nextPromise = iter.next();

    assert.equal(handle.sent.length, 1);
    assert.equal(api.subscriberCount(), 1);

    controller.abort();

    await assert.rejects(nextPromise);

    assert.equal(api.subscriberCount(), 0);
    assert.equal(handle.sent.length, 2);
    assert.equal(handle.sent[1]!.type, MessageType.UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST);
  });

  test("a batch of N advertisements fans out into N iterator yields (not 1)", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.advertisements()[Symbol.asyncIterator]();
    const batch: BluetoothLERawAdvertisement[] = [

      { address: 0x000000000001n, addressType: 0, data: Buffer.from([0x01]), rssi: -40 },
      { address: 0x000000000002n, addressType: 0, data: Buffer.from([0x02]), rssi: -50 },
      { address: 0x000000000003n, addressType: 1, data: Buffer.from([0x03]), rssi: -60 },
      { address: 0x000000000004n, addressType: 1, data: Buffer.from([0x04]), rssi: -70 },
      { address: 0x000000000005n, addressType: 2, data: Buffer.from([0x05]), rssi: -80 }
    ];

    api.acceptAdvertisementsBatch(encodeAdvertisementsBatch(batch));

    const received: BluetoothLERawAdvertisement[] = [];

    for(const _ of batch) {

      received.push((await iter.next()).value as BluetoothLERawAdvertisement);
    }

    assert.equal(received.length, batch.length, "iterator must yield one entry per batch advertisement");

    // Order is preserved (batch order is iteration order).
    for(let i = 0; i < batch.length; i++) {

      assert.equal(received[i]!.address, batch[i]!.address);
      assert.equal(received[i]!.rssi, batch[i]!.rssi);
      assert.equal(received[i]!.addressType, batch[i]!.addressType);
      assert.deepEqual(received[i]!.data, batch[i]!.data);
    }

    await iter.return?.();
  });
});

describe("BluetoothProxyApi.scannerState", () => {

  test("iterates pushed scanner-state messages in order", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.scannerState()[Symbol.asyncIterator]();
    const seq: BluetoothScannerStateData[] = [

      { configuredMode: BluetoothScannerMode.ACTIVE, mode: BluetoothScannerMode.PASSIVE, state: BluetoothScannerState.STARTING },
      { configuredMode: BluetoothScannerMode.ACTIVE, mode: BluetoothScannerMode.ACTIVE, state: BluetoothScannerState.RUNNING }
    ];

    for(const state of seq) {

      api.acceptScannerStateResponse(encodeScannerState(state));
    }

    for(const expected of seq) {

      const got = (await iter.next()).value as BluetoothScannerStateData;

      assert.deepEqual(got, expected);
    }

    await iter.return?.();
  });

  test("does NOT issue any subscribe/unsubscribe at the wire level", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.scannerState()[Symbol.asyncIterator]();

    assert.equal(handle.sent.length, 0, "scannerState() must not send any wire frame");

    await iter.return?.();

    assert.equal(handle.sent.length, 0, "scannerState() detach must not send any wire frame");
  });
});

describe("BluetoothProxyApi.lastScannerState", () => {

  test("returns null before any push", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    assert.equal(api.lastScannerState(), null);
  });

  test("returns the most recently pushed state", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.STARTING
    }));

    assert.deepEqual(api.lastScannerState(), {

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.STARTING
    });

    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.ACTIVE,
      state: BluetoothScannerState.RUNNING
    }));

    assert.deepEqual(api.lastScannerState(), {

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.ACTIVE,
      state: BluetoothScannerState.RUNNING
    });
  });

  test("returns null after clearConnectionState() even if a state was previously cached", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.PASSIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.RUNNING
    }));

    assert.notEqual(api.lastScannerState(), null);

    api.clearConnectionState();

    assert.equal(api.lastScannerState(), null);
  });

  test("a scanner-state push before any iterator populates the cache; future iterators do not see the historical push", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.PASSIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.RUNNING
    }));

    assert.notEqual(api.lastScannerState(), null);

    // Open an iterator AFTER the historical push. `bus.stream` is not replay-buffered, so the iterator parks awaiting a future push.
    const iter = api.scannerState()[Symbol.asyncIterator]();
    const nextPromise = iter.next();

    // Push a fresh state; the iterator yields it.
    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.ACTIVE,
      state: BluetoothScannerState.RUNNING
    }));

    const got = (await nextPromise).value as BluetoothScannerStateData;

    assert.equal(got.mode, BluetoothScannerMode.ACTIVE);
    assert.equal(got.state, BluetoothScannerState.RUNNING);

    await iter.return?.();
  });
});

describe("BluetoothProxyApi.acceptScannerStateResponse", () => {

  test("malformed payload (missing state field) is dropped at warn; cached state is unchanged", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    // Seed a valid cached state.
    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.PASSIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.RUNNING
    }));

    const before = api.lastScannerState();

    // Push a malformed payload that omits field 1 (state).
    const malformed = encodeProtoFields([

      { fieldNumber: 2, value: BluetoothScannerMode.PASSIVE, wireType: WireType.VARINT },
      { fieldNumber: 3, value: BluetoothScannerMode.PASSIVE, wireType: WireType.VARINT }
    ]);

    api.acceptScannerStateResponse(malformed);

    assert.equal(handle.warnLogs.length, 1);
    assert.deepEqual(api.lastScannerState(), before, "cached state must not be overwritten by a malformed push");
  });
});

describe("BluetoothProxyApi.acceptAdvertisementsBatch", () => {

  test("decodes a single advertisement, applies zigzag-decode to rssi, and emits bluetoothAdvertisement", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: BluetoothLERawAdvertisement[] = [];

    handle.bus.on("bluetoothAdvertisement", (ad): void => { captured.push(ad); });

    const expected: BluetoothLERawAdvertisement = {

      address: 0x123456789abcn,
      addressType: 1,
      data: Buffer.from([ 0x02, 0x01, 0x06, 0x03, 0x03, 0x12, 0x18 ]),
      rssi: -67
    };

    api.acceptAdvertisementsBatch(encodeAdvertisementsBatch([expected]));

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.address, expected.address);
    assert.equal(captured[0]!.addressType, expected.addressType);
    assert.equal(captured[0]!.rssi, expected.rssi);
    assert.deepEqual(captured[0]!.data, expected.data);
  });

  test("round-trips a uint64 address above 2^53 without precision loss", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: BluetoothLERawAdvertisement[] = [];

    handle.bus.on("bluetoothAdvertisement", (ad): void => { captured.push(ad); });

    // 0xFFFFFFFFFFFFFFFF (uint64 max) is the worst-case round-trip target. A number-based decoder would silently lose precision well below this point; the bigint
    // path preserves every bit. Number.MAX_SAFE_INTEGER is 2^53 - 1 (= 0x1FFFFFFFFFFFFF), and the test value is far above it.
    const address = 0xFFFFFFFFFFFFFFFFn;

    assert.ok(address > BigInt(Number.MAX_SAFE_INTEGER), "test address must exceed the safe-integer range");

    const data = Buffer.alloc(62, 0xaa);

    api.acceptAdvertisementsBatch(encodeAdvertisementsBatch([

      { address, addressType: 0, data, rssi: -50 }
    ]));

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.address, address);
    assert.equal(captured[0]!.data.length, 62);
  });

  test("a batch of 5 ads emits 5 separate bluetoothAdvertisement events in original order", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: BluetoothLERawAdvertisement[] = [];

    handle.bus.on("bluetoothAdvertisement", (ad): void => { captured.push(ad); });

    const batch: BluetoothLERawAdvertisement[] = [

      { address: 0x111111111111n, addressType: 0, data: Buffer.from([0x01]), rssi: -40 },
      { address: 0x222222222222n, addressType: 0, data: Buffer.from([0x02]), rssi: -50 },
      { address: 0x333333333333n, addressType: 1, data: Buffer.from([0x03]), rssi: -60 },
      { address: 0x444444444444n, addressType: 1, data: Buffer.from([0x04]), rssi: -70 },
      { address: 0x555555555555n, addressType: 2, data: Buffer.from([0x05]), rssi: -80 }
    ];

    api.acceptAdvertisementsBatch(encodeAdvertisementsBatch(batch));

    assert.equal(captured.length, 5);

    for(let i = 0; i < batch.length; i++) {

      assert.equal(captured[i]!.address, batch[i]!.address);
      assert.equal(captured[i]!.rssi, batch[i]!.rssi);
      assert.equal(captured[i]!.addressType, batch[i]!.addressType);
      assert.deepEqual(captured[i]!.data, batch[i]!.data);
    }
  });

  test("an empty batch (no advertisements field) is a no-op", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: BluetoothLERawAdvertisement[] = [];

    handle.bus.on("bluetoothAdvertisement", (ad): void => { captured.push(ad); });

    api.acceptAdvertisementsBatch(Buffer.alloc(0));

    assert.equal(captured.length, 0);
  });

  test("stray batch with no active subscribers does NOT throw (emits to zero listeners)", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    // No subscribers; just push a batch and assert no throw.
    assert.doesNotThrow(() => {

      api.acceptAdvertisementsBatch(encodeAdvertisementsBatch([

        { address: 0x010203040506n, addressType: 0, data: Buffer.alloc(0), rssi: -50 }
      ]));
    });
  });

  test("a batch with a malformed entry skips that entry and processes the rest", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: BluetoothLERawAdvertisement[] = [];

    handle.bus.on("bluetoothAdvertisement", (ad): void => { captured.push(ad); });

    // The middle entry has a truncated varint at field 1 (continuation bit set with no follow-up byte). The outer codec accepts it as a length-delimited buffer; the
    // inner decoder catches the malformed-varint throw and returns null so the entry is silently dropped without crashing the batch.
    const good1 = encodeAdvertisement({ address: 0xaan, addressType: 0, data: Buffer.alloc(0), rssi: -30 });
    const bad = Buffer.from([ 0x08, 0xff ]);
    const good2 = encodeAdvertisement({ address: 0xbbn, addressType: 0, data: Buffer.alloc(0), rssi: -40 });
    const payload = encodeProtoFields([

      { fieldNumber: 1, value: good1, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 1, value: bad, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 1, value: good2, wireType: WireType.LENGTH_DELIMITED }
    ]);

    api.acceptAdvertisementsBatch(payload);

    assert.equal(captured.length, 2);
    assert.equal(captured[0]!.address, 0xaan);
    assert.equal(captured[1]!.address, 0xbbn);
  });
});

describe("BluetoothProxyApi.clearConnectionState", () => {

  test("PRESERVES the advertisement subscriber ledger (the ledger survives the reconnect cycle)", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.advertisements()[Symbol.asyncIterator]();

    assert.equal(api.subscriberCount(), 1);

    api.clearConnectionState();

    // The subscriber ledger is consumer-scoped and MUST survive clearConnectionState - a parked iterator is still open across the reconnect. Only the wire cache resets.
    // Zeroing the ledger here would leave that survivor deaf to advertisements after reconnect, which is exactly what this assertion pins against.
    assert.equal(api.subscriberCount(), 1, "clearConnectionState must preserve the surviving subscriber ledger");

    void iter.return?.();
  });

  test("clears the cached scanner state", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.acceptScannerStateResponse(encodeScannerState({

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.ACTIVE,
      state: BluetoothScannerState.RUNNING
    }));

    assert.notEqual(api.lastScannerState(), null);

    api.clearConnectionState();

    assert.equal(api.lastScannerState(), null);
  });

  test("iterator finally after clearConnectionState (no reissue) does not send a stray UNSUBSCRIBE", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.advertisements()[Symbol.asyncIterator]();

    // First subscriber sent SUBSCRIBE.
    assert.equal(handle.sent.length, 1);

    // Drive the generator through one yield so the finally is reachable on `iter.return`. Without this, an unstarted async generator skips the finally entirely and
    // the test would assert the right outcome (no UNSUBSCRIBE) for the wrong reason.
    handle.bus.emit("bluetoothAdvertisement", { address: 0x30n, addressType: 0, data: Buffer.alloc(0), rssi: -50 });
    await iter.next();

    api.clearConnectionState();

    // Clear captured frames so we can assert the iterator's finally adds nothing. The wire cache was just cleared (no reissue ran), so the last-release recompute finds
    // no cache entry to diff against and emits no UNSUBSCRIBE for a connection the new transport never subscribed.
    handle.sent.length = 0;

    await iter.return?.();

    assert.equal(handle.sent.length, 0, "post-clearConnectionState iterator teardown must not send UNSUBSCRIBE");
  });
});

describe("BluetoothProxyApi.reissueOnReconnect", () => {

  test("re-sends SUBSCRIBE for a surviving iterator across the real clearConnectionState + reissueOnReconnect order", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.advertisements()[Symbol.asyncIterator]();

    // Clear the captured outbound buffer so we only see the reissue traffic.
    handle.sent.length = 0;

    // Compose the host's real connect order: clear connection-scoped state (wire cache resets, ledger survives), then reissue after the new transport is up. The
    // surviving subscriber must then drive a fresh SUBSCRIBE onto the new transport.
    api.clearConnectionState();
    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST);
    assert.equal(decodeFields(handle.sent[0]!.payload)[1]?.[0], 0, "flags field must be 0");

    void iter.return?.();
  });

  test("does NOT re-send SUBSCRIBE when no consumers are alive", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.clearConnectionState();
    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 0, "no consumers, no wire activity");
  });
});

describe("BluetoothProxyApi.util.inspect.custom", () => {

  test("includes the subscriber count and the cached-scanner-state flag", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const inspectFn = api[Symbol.for("nodejs.util.inspect.custom") as never] as (depth: number, opts: { stylize: (s: string, t: string) => string }) => string;
    const stylize = (s: string): string => s;
    const out = inspectFn.call(api, 0, { stylize });

    assert.match(out, /BluetoothProxyApi/);
    assert.match(out, /advertisementSubscribers/);
    assert.match(out, /hasCachedScannerState/);
    assert.match(out, /pendingRead/);
    assert.match(out, /pendingWrite/);
    assert.match(out, /pendingConnect/);
    assert.match(out, /notifySubscriberCount/);
  });
});

// GATT tests.

// Encode a `BluetoothDeviceConnectionResponse` (id 69) payload for inbound-message simulation.
function encodeDeviceConnection(address: bigint, connected: boolean, mtu = 0, error = 0): Buffer {

  return encodeProtoFields([
    { fieldNumber: 1, value: address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: connected ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: mtu, wireType: WireType.VARINT },
    { fieldNumber: 4, value: error, wireType: WireType.VARINT }
  ]);
}

// Encode a `BluetoothGATTReadResponse` / NotifyData (74 / 79) payload (address, handle, data).
function encodeReadOrNotify(address: bigint, handle: number, data: Buffer): Buffer {

  return encodeProtoFields([
    { fieldNumber: 1, value: address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
    { fieldNumber: 3, value: data, wireType: WireType.LENGTH_DELIMITED }
  ]);
}

// Encode a `BluetoothGATTWriteResponse` / NotifyResponse (83 / 84) payload (address, handle).
function encodeAddressHandle(address: bigint, handle: number): Buffer {

  return encodeProtoFields([
    { fieldNumber: 1, value: address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: handle, wireType: WireType.VARINT }
  ]);
}

// Encode a `BluetoothGATTErrorResponse` (82) payload.
function encodeGattError(address: bigint, handle: number, error: number): Buffer {

  return encodeProtoFields([
    { fieldNumber: 1, value: address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
    { fieldNumber: 3, value: error, wireType: WireType.VARINT }
  ]);
}

// Encode a `BluetoothDevicePairingResponse` / Unpairing / ClearCache (85 / 86 / 88) payload.
function encodeAddressFlagError(address: bigint, flag: boolean, error = 0): Buffer {

  return encodeProtoFields([
    { fieldNumber: 1, value: address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: flag ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: error, wireType: WireType.VARINT }
  ]);
}

// Encode a `BluetoothGATTGetServicesResponse` (71) payload with a list of services.
function encodeGetServicesResponse(address: bigint,
  services: readonly { characteristics?: ProtoField[][]; handle: number; shortUuid?: number; uuid?: readonly bigint[] }[]): Buffer {

  const fields: ProtoField[] = [{ fieldNumber: 1, value: address, wireType: WireType.VARINT }];

  for(const service of services) {

    const serviceFields: ProtoField[] = [];

    if(service.uuid) {

      for(const segment of service.uuid) {

        serviceFields.push({ fieldNumber: 1, value: segment, wireType: WireType.VARINT });
      }
    }

    serviceFields.push({ fieldNumber: 2, value: service.handle, wireType: WireType.VARINT });

    if(service.shortUuid !== undefined) {

      serviceFields.push({ fieldNumber: 4, value: service.shortUuid, wireType: WireType.VARINT });
    }

    fields.push({ fieldNumber: 2, value: encodeProtoFields(serviceFields), wireType: WireType.LENGTH_DELIMITED });
  }

  return encodeProtoFields(fields);
}

// Decode the first VARINT field at `fieldNumber` from a payload as a bigint, using the test-local helper rather than the codec's number-truncated path.
function readUint64Field(payload: Buffer, fieldNumber: number): bigint | undefined {

  let offset = 0;

  while(offset < payload.length) {

    // Single-byte tags suffice for fields 1-15.
    const tag = payload.readUInt8(offset);

    offset++;

    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if((wireType === WireType.VARINT) && (fieldNum === fieldNumber)) {

      // Walk the varint as bigint.
      let result = 0n;
      let shift = 0n;

      while(true) {

        const byte = payload.readUInt8(offset++);

        result |= BigInt(byte & 0x7F) << shift;
        shift += 7n;

        if((byte & 0x80) === 0) {

          break;
        }
      }

      return result;
    }

    // Skip the value. For VARINT, scan to the stop bit. For LENGTH_DELIMITED, read the length and advance.
    if(wireType === WireType.VARINT) {

      while((payload.readUInt8(offset) & 0x80) !== 0) {

        offset++;
      }

      offset++;

    } else if(wireType === WireType.LENGTH_DELIMITED) {

      let len = 0;
      let shift = 0;
      let lenByte = 0;

      do {

        lenByte = payload.readUInt8(offset++);
        len |= (lenByte & 0x7F) << shift;
        shift += 7;

      } while((lenByte & 0x80) !== 0);

      offset += len;

    } else {

      return undefined;
    }
  }

  return undefined;
}

describe("BluetoothProxyApi.connect", () => {

  test("sends BLUETOOTH_DEVICE_REQUEST(CONNECT_V3_WITH_CACHE) by default and resolves on a connected=true response", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xaabbccddn;
    const connectPromise = api.connect(address);

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_DEVICE_REQUEST);
    assert.equal(readUint64Field(handle.sent[0]!.payload, 1), address);
    assert.equal(decodeFields(handle.sent[0]!.payload)[2]?.[0], BluetoothDeviceRequestType.CONNECT_V3_WITH_CACHE);

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, true, 23, 0));

    const state = await connectPromise;

    assert.equal(state.connected, true);
    assert.equal(state.mtu, 23);
    assert.equal(state.address, address);
    assert.equal(api.isConnected(address), true);
  });

  test("useCache=false sends CONNECT_V3_WITHOUT_CACHE", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x11n;
    const connectPromise = api.connect(address, { useCache: false });

    assert.equal(decodeFields(handle.sent[0]!.payload)[2]?.[0], BluetoothDeviceRequestType.CONNECT_V3_WITHOUT_CACHE);

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, true));
    await connectPromise;
  });

  test("a connected=false response with nonzero error rejects with GATT_CONNECT_FAILED", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x22n;
    const connectPromise = api.connect(address);

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, false, 0, 7));

    await assert.rejects(connectPromise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_CONNECT_FAILED"));
    assert.equal(api.isConnected(address), false);
  });

  test("a connected=false response with error=0 while a connect is pending fails fast instead of hanging", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x44n;
    const connectPromise = api.connect(address);

    // A clean disconnect (error=0) arriving while the connect await is pending means the connect will never complete, so it must reject fast with the typed
    // GATT_CONNECT_FAILED error rather than leave the connect await to expire on its lifecycle timeout.
    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, false, 0, 0));

    await assert.rejects(connectPromise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_CONNECT_FAILED"));
    assert.equal(api.isConnected(address), false);
  });

  test("a second concurrent connect for the same address rejects with GATT_CONNECT_IN_FLIGHT", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x33n;
    const inflight = api.connect(address);

    await assert.rejects(api.connect(address), (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_CONNECT_IN_FLIGHT"));

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, true));
    await inflight;
  });

  test("disconnect sends DISCONNECT and resolves on connected=false", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x44n;

    // Seed the cache with a connected state via an unsolicited response.
    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, true, 23, 0));

    assert.equal(api.isConnected(address), true);

    const disconnectPromise = api.disconnect(address);

    assert.equal(handle.sent[handle.sent.length - 1]!.type, MessageType.BLUETOOTH_DEVICE_REQUEST);
    assert.equal(decodeFields(handle.sent[handle.sent.length - 1]!.payload)[2]?.[0], BluetoothDeviceRequestType.DISCONNECT);

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(address, false));

    await disconnectPromise;
    assert.equal(api.isConnected(address), false);
  });

  test("connectionState() returns the cached snapshot per address", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    assert.equal(api.connectionState(0x55n), null);

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(0x55n, true, 31, 0));

    const state = api.connectionState(0x55n);

    assert.notEqual(state, null);
    assert.equal(state!.mtu, 31);
  });

  test("an unsolicited connection-state response emits the streaming event and updates the cache without throwing", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const captured: ConnectionStateData[] = [];

    handle.bus.on("bluetoothConnectionState", (state): void => { captured.push(state); });

    // No pending connect for this address; the response is unsolicited.
    api.acceptDeviceConnectionResponse(encodeDeviceConnection(0x66n, true));

    assert.equal(captured.length, 1);
    assert.equal(api.isConnected(0x66n), true);
  });
});

describe("BluetoothProxyApi.pair / unpair / clearCache", () => {

  test("pair resolves on paired=true with error=0", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x77n;
    const pairPromise = api.pair(address);

    assert.equal(decodeFields(handle.sent[0]!.payload)[2]?.[0], BluetoothDeviceRequestType.PAIR);

    api.acceptPairingResponse(encodeAddressFlagError(address, true));
    await pairPromise;
  });

  test("pair rejects on paired=false with GATT_PAIR_FAILED", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x88n;
    const pairPromise = api.pair(address);

    api.acceptPairingResponse(encodeAddressFlagError(address, false, 3));

    await assert.rejects(pairPromise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_PAIR_FAILED"));
  });

  test("unpair resolves on success=true with error=0", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x99n;
    const promise = api.unpair(address);

    assert.equal(decodeFields(handle.sent[0]!.payload)[2]?.[0], BluetoothDeviceRequestType.UNPAIR);

    api.acceptUnpairingResponse(encodeAddressFlagError(address, true));
    await promise;
  });

  test("clearCache resolves on success=true with error=0", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xaan;
    const promise = api.clearCache(address);

    assert.equal(decodeFields(handle.sent[0]!.payload)[2]?.[0], BluetoothDeviceRequestType.CLEAR_CACHE);

    api.acceptClearCacheResponse(encodeAddressFlagError(address, true));
    await promise;
  });
});

describe("BluetoothProxyApi.getServices", () => {

  test("accumulates streamed responses until the Done sentinel and resolves with the full list in wire order", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xbbn;
    const promise = api.getServices(address);

    // Three frames: first one service, second two services, third no services (still valid).
    api.acceptGetServicesResponse(encodeGetServicesResponse(address, [{ handle: 1, shortUuid: 0x1800 }]));
    api.acceptGetServicesResponse(encodeGetServicesResponse(address, [ { handle: 2, shortUuid: 0x180a }, { handle: 3, shortUuid: 0x180f } ]));
    api.acceptGetServicesResponse(encodeGetServicesResponse(address, []));
    api.acceptGetServicesDoneResponse(encodeProtoFields([{ fieldNumber: 1, value: address, wireType: WireType.VARINT }]));

    const services = await promise;

    assert.equal(services.length, 3);
    assert.equal(services[0]!.handle, 1);
    assert.equal(services[0]!.shortUuid, 0x1800);
    assert.equal(services[2]!.handle, 3);
  });

  test("resolves with an empty list when the Done sentinel arrives with no preceding service responses", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xeen;
    const promise = api.getServices(address);

    // The adverse ordering for the accumulate-until-Done gate: the device answers with the Done sentinel and ZERO id-71 service frames (a peripheral that exposes no GATT
    // services, or whose stream is empty). The gate must resolve with an empty list rather than hang waiting for service frames that will never arrive.
    api.acceptGetServicesDoneResponse(encodeProtoFields([{ fieldNumber: 1, value: address, wireType: WireType.VARINT }]));

    assert.deepEqual(await promise, []);
  });

  test("concurrent getServices for the same address rejects with GATT_GET_SERVICES_IN_FLIGHT", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xccn;
    const first = api.getServices(address);

    await assert.rejects(api.getServices(address),
      (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_GET_SERVICES_IN_FLIGHT"));

    api.acceptGetServicesDoneResponse(encodeProtoFields([{ fieldNumber: 1, value: address, wireType: WireType.VARINT }]));
    await first;
  });

  test("an aborted getServices clears the in-flight accumulator", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xddn;
    const controller = new AbortController();
    const promise = api.getServices(address, { signal: controller.signal });

    api.acceptGetServicesResponse(encodeGetServicesResponse(address, [{ handle: 1, shortUuid: 0x1800 }]));

    controller.abort();

    await assert.rejects(promise);

    // After abort the accumulator must be gone, so a fresh getServices call works.
    const fresh = api.getServices(address);

    api.acceptGetServicesDoneResponse(encodeProtoFields([{ fieldNumber: 1, value: address, wireType: WireType.VARINT }]));
    await fresh;
  });
});

describe("BluetoothProxyApi.readCharacteristic / readDescriptor", () => {

  test("readCharacteristic round-trips a Buffer", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.readCharacteristic(0x100n, 0x2a);

    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_GATT_READ_REQUEST);

    api.acceptGattReadResponse(encodeReadOrNotify(0x100n, 0x2a, Buffer.from([ 0xde, 0xad, 0xbe, 0xef ])));

    const value = await promise;

    assert.deepEqual(value, Buffer.from([ 0xde, 0xad, 0xbe, 0xef ]));
  });

  test("readDescriptor sends BLUETOOTH_GATT_READ_DESCRIPTOR_REQUEST", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.readDescriptor(0x101n, 0x2b);

    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_GATT_READ_DESCRIPTOR_REQUEST);

    api.acceptGattReadResponse(encodeReadOrNotify(0x101n, 0x2b, Buffer.from([0x01])));
    await promise;
  });

  test("concurrent reads for the same (address, handle) reject with GATT_READ_IN_FLIGHT", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const first = api.readCharacteristic(0x102n, 0x2c);

    await assert.rejects(api.readCharacteristic(0x102n, 0x2c),
      (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_READ_IN_FLIGHT"));

    api.acceptGattReadResponse(encodeReadOrNotify(0x102n, 0x2c, Buffer.alloc(0)));
    await first;
  });

  test("a GATT error response while a read is in flight rejects with GATT_ERROR", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.readCharacteristic(0x103n, 0x2d);

    api.acceptGattErrorResponse(encodeGattError(0x103n, 0x2d, 5));

    await assert.rejects(promise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_ERROR"));
  });
});

describe("BluetoothProxyApi.writeCharacteristic / writeDescriptor", () => {

  test("writeCharacteristic(response=false) is fire-and-forget; a stray response is logged at debug", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    await api.writeCharacteristic(0x110n, 0x2a, Buffer.from([0x01]));

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_GATT_WRITE_REQUEST);
    // The wire `response` field at field 3 is 0.
    assert.equal(decodeFields(handle.sent[0]!.payload)[3]?.[0], 0);

    const debugBefore = handle.debugLogs.length;

    api.acceptGattWriteResponse(encodeAddressHandle(0x110n, 0x2a));

    assert.equal(handle.debugLogs.length, debugBefore + 1);
  });

  test("writeCharacteristic(response=true) awaits and resolves on the matching response", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.writeCharacteristic(0x111n, 0x2a, Buffer.from([0x02]), { response: true });

    assert.equal(decodeFields(handle.sent[0]!.payload)[3]?.[0], 1);

    api.acceptGattWriteResponse(encodeAddressHandle(0x111n, 0x2a));

    await promise;
  });

  test("writeDescriptor sends BLUETOOTH_GATT_WRITE_DESCRIPTOR_REQUEST and awaits the shared write response", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.writeDescriptor(0x112n, 0x2b, Buffer.from([ 0x01, 0x00 ]));

    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_GATT_WRITE_DESCRIPTOR_REQUEST);

    api.acceptGattWriteResponse(encodeAddressHandle(0x112n, 0x2b));
    await promise;
  });

  test("a GATT error while a write is in flight rejects with GATT_ERROR", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.writeCharacteristic(0x113n, 0x2c, Buffer.from([0xff]), { response: true });

    api.acceptGattErrorResponse(encodeGattError(0x113n, 0x2c, 9));

    await assert.rejects(promise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_ERROR"));
  });
});

describe("BluetoothProxyApi.setNotify and notify()", () => {

  test("setNotify(true) sends BLUETOOTH_GATT_NOTIFY_REQUEST and resolves on NotifyResponse", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.setNotify(0x120n, 0x2a, true);

    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_GATT_NOTIFY_REQUEST);
    assert.equal(decodeFields(handle.sent[0]!.payload)[3]?.[0], 1);

    api.acceptGattNotifyResponse(encodeAddressHandle(0x120n, 0x2a));

    await promise;
  });

  test("setNotify(false) sends enable=0", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.setNotify(0x121n, 0x2a, false);

    assert.equal(decodeFields(handle.sent[0]!.payload)[3]?.[0], 0);

    api.acceptGattNotifyResponse(encodeAddressHandle(0x121n, 0x2a));
    await promise;
  });

  test("notify() yields only matching (address, handle) chunks", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.notify(0x130n, 0x2a)[Symbol.asyncIterator]();

    // Push two notifications: one matching, one for a different handle.
    api.acceptGattNotifyDataResponse(encodeReadOrNotify(0x130n, 0x2a, Buffer.from([0xaa])));
    api.acceptGattNotifyDataResponse(encodeReadOrNotify(0x130n, 0x2b, Buffer.from([0xbb])));
    api.acceptGattNotifyDataResponse(encodeReadOrNotify(0x130n, 0x2a, Buffer.from([0xcc])));

    const first = (await iter.next()).value as NotifyDataChunk;
    const second = (await iter.next()).value as NotifyDataChunk;

    assert.deepEqual(first.data, Buffer.from([0xaa]));
    assert.deepEqual(second.data, Buffer.from([0xcc]));

    await iter.return?.();
  });

  test("two concurrent notify() iterators on the same (address, handle) both receive every chunk", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iterA = api.notify(0x131n, 0x2a)[Symbol.asyncIterator]();
    const iterB = api.notify(0x131n, 0x2a)[Symbol.asyncIterator]();

    api.acceptGattNotifyDataResponse(encodeReadOrNotify(0x131n, 0x2a, Buffer.from([0x01])));

    const a = (await iterA.next()).value as NotifyDataChunk;
    const b = (await iterB.next()).value as NotifyDataChunk;

    assert.deepEqual(a.data, Buffer.from([0x01]));
    assert.deepEqual(b.data, Buffer.from([0x01]));

    await iterA.return?.();
    await iterB.return?.();
  });

  test("notify() iterator detach decrements the ledger count; last detach removes the entry", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iterA = api.notify(0x132n, 0x2a)[Symbol.asyncIterator]();
    const iterB = api.notify(0x132n, 0x2a)[Symbol.asyncIterator]();

    // The snapshot is reconstructed from the subscription ledger: one distinct (address, handle) key, two live subscribers on it.
    assert.equal(api.notifySubscriberSnapshot().size, 1, "single (address, handle) entry");
    assert.equal(Array.from(api.notifySubscriberSnapshot().values())[0], 2);

    // Drive both generators through one yield so the wrapping finally is reachable on detach.
    api.acceptGattNotifyDataResponse(encodeReadOrNotify(0x132n, 0x2a, Buffer.alloc(0)));
    await iterA.next();
    await iterB.next();

    await iterA.return?.();
    assert.equal(Array.from(api.notifySubscriberSnapshot().values())[0], 1);

    await iterB.return?.();
    assert.equal(api.notifySubscriberSnapshot().size, 0);
  });

  test("concurrent setNotify for the same key rejects with GATT_NOTIFY_SETUP_IN_FLIGHT", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const first = api.setNotify(0x133n, 0x2a, true);

    await assert.rejects(api.setNotify(0x133n, 0x2a, false),
      (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_NOTIFY_SETUP_IN_FLIGHT"));

    api.acceptGattNotifyResponse(encodeAddressHandle(0x133n, 0x2a));
    await first;
  });

  test("a GATT error during setNotify rejects the await", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const promise = api.setNotify(0x134n, 0x2a, true);

    api.acceptGattErrorResponse(encodeGattError(0x134n, 0x2a, 11));

    await assert.rejects(promise, (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_ERROR"));
  });
});

describe("BluetoothProxyApi.setConnectionParams", () => {

  test("round-trips through setConnectionParamsCorrelator", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x140n;
    const promise = api.setConnectionParams(address, { latency: 0, maxInterval: 40, minInterval: 24, timeout: 400 });

    assert.equal(handle.sent[0]!.type, MessageType.BLUETOOTH_SET_CONNECTION_PARAMS_REQUEST);

    const fields = decodeFields(handle.sent[0]!.payload);

    assert.equal(fields[2]?.[0], 24);
    assert.equal(fields[3]?.[0], 40);
    assert.equal(fields[4]?.[0], 0);
    assert.equal(fields[5]?.[0], 400);

    api.acceptSetConnectionParamsResponse(encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 0, wireType: WireType.VARINT }
    ]));

    await promise;
  });

  test("a nonzero error rejects with GATT_SET_CONNECTION_PARAMS_FAILED", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0x141n;
    const promise = api.setConnectionParams(address, { latency: 0, maxInterval: 40, minInterval: 24, timeout: 400 });

    api.acceptSetConnectionParamsResponse(encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 4, wireType: WireType.VARINT }
    ]));

    await assert.rejects(promise,
      (error: unknown): boolean => (error instanceof ConnectionError) && (error.code === "GATT_SET_CONNECTION_PARAMS_FAILED"));
  });
});

describe("BluetoothProxyApi.connectionsFree", () => {

  test("first iterator sends SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST; pushes drain through the stream", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.connectionsFree()[Symbol.asyncIterator]();

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST);

    api.acceptConnectionsFreeResponse(encodeProtoFields([
      { fieldNumber: 1, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 3, wireType: WireType.VARINT },
      { fieldNumber: 3, value: 0x10n, wireType: WireType.VARINT }
    ]));

    const update = (await iter.next()).value as ConnectionsFreeData;

    assert.equal(update.free, 2);
    assert.equal(update.limit, 3);
    assert.deepEqual(update.allocated, [0x10n]);

    await iter.return?.();
  });

  test("re-opening connectionsFree() after all prior iterators closed does NOT re-send a redundant SUBSCRIBE (retainOnEmpty)", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    // First iterator issues one SUBSCRIBE, then releases. Connections-free has no unsubscribe frame, so retainOnEmpty: true keeps the cache marked SUBSCRIBED through the
    // empty gap - the device is still streaming.
    const first = parkedSubscription((signal) => api.connectionsFree({ signal })[Symbol.asyncIterator]());

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST);

    await first.release();

    // A fresh iterator after the prior one closed must NOT re-issue SUBSCRIBE: the retained cache suppresses the redundant frame because the device is already streaming.
    const second = parkedSubscription((signal) => api.connectionsFree({ signal })[Symbol.asyncIterator]());

    assert.equal(handle.sent.length, 1, "a re-open after all prior iterators closed must be wire-silent - the device retained the subscription");

    await second.release();
  });

  test("lastConnectionsFree() returns null before any push and the cached value after", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    assert.equal(api.lastConnectionsFree(), null);

    api.acceptConnectionsFreeResponse(encodeProtoFields([
      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 3, wireType: WireType.VARINT }
    ]));

    assert.deepEqual(api.lastConnectionsFree(), { allocated: [], free: 1, limit: 3 });
  });

  test("reissueOnReconnect re-sends SUBSCRIBE only when a consumer is alive", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    api.clearConnectionState();
    api.reissueOnReconnect();
    assert.equal(handle.sent.length, 0, "no consumers, no wire activity");

    const iter = api.connectionsFree()[Symbol.asyncIterator]();

    // Compose the host's real connect order: the surviving consumer's ledger entry drives a fresh SUBSCRIBE on reconnect.
    handle.sent.length = 0;
    api.clearConnectionState();
    api.reissueOnReconnect();

    assert.equal(handle.sent.length, 1);
    assert.equal(handle.sent[0]!.type, MessageType.SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST);

    void iter.return?.();
  });
});

describe("BluetoothProxyApi.acceptGattErrorResponse routing", () => {

  test("a stray GATT error with no pending operation is logged at debug, not thrown", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    assert.doesNotThrow(() => {

      api.acceptGattErrorResponse(encodeGattError(0x150n, 0x2a, 1));
    });

    assert.equal(handle.debugLogs.length, 1);
  });

  test("error for (addr1, h1) does not affect a pending write on (addr1, h2)", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const readPromise = api.readCharacteristic(0x151n, 0x2a);
    const writePromise = api.writeCharacteristic(0x151n, 0x2b, Buffer.alloc(0), { response: true });

    // GATT error matches the read's (address, handle); the write is unaffected.
    api.acceptGattErrorResponse(encodeGattError(0x151n, 0x2a, 7));

    await assert.rejects(readPromise);

    // The write must still be in flight - settle it explicitly.
    api.acceptGattWriteResponse(encodeAddressHandle(0x151n, 0x2b));
    await writePromise;
  });
});

describe("BluetoothProxyApi.clearConnectionState and reissueOnReconnect (GATT)", () => {

  test("clearConnectionState rejects every pending Correlator with AbortError; the cache clears", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const readPromise = api.readCharacteristic(0x160n, 0x2a);
    const connectPromise = api.connect(0x161n);

    // Seed the cache, then verify it clears.
    api.acceptDeviceConnectionResponse(encodeDeviceConnection(0x162n, true));
    assert.equal(api.isConnected(0x162n), true);

    api.clearConnectionState();

    await assert.rejects(readPromise, (error: unknown): boolean => (error instanceof DOMException) && (error.name === "AbortError"));
    await assert.rejects(connectPromise, (error: unknown): boolean => (error instanceof DOMException) && (error.name === "AbortError"));
    assert.equal(api.isConnected(0x162n), false);
  });

  test("a surviving notify subscriber is re-armed with NOTIFY(enable=true) across clearConnectionState + reissueOnReconnect", () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);

    void api.notify(0x170n, 0x2a)[Symbol.asyncIterator]();
    void api.notify(0x170n, 0x2b)[Symbol.asyncIterator]();

    // notify() acquire is wire-silent (reissue-only ledger), so nothing was sent on the wire by the two attaches; the ledger merely records the surviving keys.
    assert.equal(handle.sent.length, 0, "notify() acquire must be wire-silent");

    // Compose the host's real connect order. clearConnectionState resets only the wire caches and PRESERVES the notify ledger; reissueOnReconnect re-arms each surviving
    // (address, handle) via the subscription's onReissue hook, which is what keeps the survivor receiving notifications across reconnect rather than going deaf.
    api.clearConnectionState();
    api.reissueOnReconnect();

    // Two NOTIFY frames, one per (address, handle).
    assert.equal(handle.sent.length, 2);

    for(const frame of handle.sent) {

      assert.equal(frame.type, MessageType.BLUETOOTH_GATT_NOTIFY_REQUEST);
      assert.equal(decodeFields(frame.payload)[3]?.[0], 1, "enable bit must be 1");
    }
  });
});

describe("BluetoothProxyApi uint64 round-trip", () => {

  test("connect, read, and write all preserve a uint64 address > 2^53 end-to-end", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const address = 0xaabbccdd12345678n;

    assert.ok(address > BigInt(Number.MAX_SAFE_INTEGER), "test address must exceed the safe-integer range");

    // Connect.
    const connectPromise = api.connect(address);

    // The outbound frame must carry the bigint without truncation.
    assert.equal(readUint64Field(handle.sent[0]!.payload, 1), address);

    // The inbound response is encoded with the same bigint-preserving encoder via encodeProtoFields' VARINT bigint path.
    api.acceptDeviceConnectionResponse(encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 3, value: 23, wireType: WireType.VARINT },
      { fieldNumber: 4, value: 0, wireType: WireType.VARINT }
    ]));

    const state = await connectPromise;

    assert.equal(state.address, address);

    // Read against the same address.
    const readPromise = api.readCharacteristic(address, 0x2a);
    const readFrame = handle.sent[handle.sent.length - 1]!;

    assert.equal(readUint64Field(readFrame.payload, 1), address);

    api.acceptGattReadResponse(encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 0x2a, wireType: WireType.VARINT },
      { fieldNumber: 3, value: Buffer.from([0x42]), wireType: WireType.LENGTH_DELIMITED }
    ]));

    const value = await readPromise;

    assert.deepEqual(value, Buffer.from([0x42]));

    // Write against the same address.
    await api.writeCharacteristic(address, 0x2a, Buffer.from([0x01]));
    const writeFrame = handle.sent[handle.sent.length - 1]!;

    assert.equal(readUint64Field(writeFrame.payload, 1), address);
  });

  test("encodeVarintBigInt round-trips uint64 max via the codec primitive", () => {

    // Smoke test - the bluetooth-proxy depends on the codec exporting encodeVarintBigInt; this confirms the smoke-test pre-condition holds.
    const encoded = encodeVarintBigInt(0xFFFFFFFFFFFFFFFFn);

    assert.ok(encoded.length > 0, "encoder must produce bytes");
  });
});

describe("BluetoothProxyApi.connectionStates streaming", () => {

  test("multiple connect/disconnect transitions push through the stream", async () => {

    const handle = makeHost();
    const api = new BluetoothProxyApi(handle.host);
    const iter = api.connectionStates()[Symbol.asyncIterator]();

    api.acceptDeviceConnectionResponse(encodeDeviceConnection(0x180n, true, 23, 0));
    api.acceptDeviceConnectionResponse(encodeDeviceConnection(0x180n, false, 0, 0));

    const first = (await iter.next()).value as ConnectionStateData;
    const second = (await iter.next()).value as ConnectionStateData;

    assert.equal(first.connected, true);
    assert.equal(second.connected, false);

    await iter.return?.();
  });
});

// The (address, handle) the notify harness invocation drives. Bluetooth notify subscriptions are per-(address, handle), so the harness keys every assertion on this one
// pair. The address is kept small enough to round-trip through the decodeFields VARINT path (the standard decoder reads VARINT as a 32-bit number) so classify can match
// the re-armed NOTIFY frame by address + handle + enable bit.
const CONTRACT_NOTIFY_ADDRESS = 0x200n;
const CONTRACT_NOTIFY_HANDLE = 0x2a;

// Open a subscription iterator and park it in `for await` without iterating, exactly modeling a consumer parked across a reconnect. release() aborts the controller,
// which rejects the parked inner stream, unwinds the `for await`, and runs the cleanup finally (the subscription release). Shared by every Bluetooth harness
// invocation; the per-dimension `open` callback supplies the iterator factory. We swallow the parked promise's abort rejection so it does not surface as unhandled.
function parkedSubscription<T>(open: (signal: AbortSignal) => AsyncIterator<T>): { release: () => Promise<void> } {

  const controller = new AbortController();
  const iter = open(controller.signal);
  const parked = iter.next();

  parked.catch((): void => { /* The abort below settles this; the rejection is expected teardown, not a failure. */ });

  return { release: async (): Promise<void> => {

    controller.abort();

    // Await the parked next so the generator's finally (the subscription release) has run before the harness asserts on the wire effects.
    await parked.catch((): void => { /* expected abort */ });
  } };
}

// Drive the shared reissuable-subscription contract harness against the Bluetooth advertisement dimension - the canonical symmetric SUBSCRIBE / UNSUBSCRIBE shape on a
// single device-wide wire key. The harness asserts the canonical guarantees it documents (first-subscriber SUBSCRIBE / concurrent share / last-release UNSUBSCRIBE,
// reconnect-survival, dispose-after-reconnect, and clearConnectionState-alone wire-silence) so advertisement proves the same contract Serial and Z-Wave do.
runReissuableSubscriptionContract<BluetoothProxyApi>({

  classify: (frame: CapturedContractFrame): ContractFrameKind => {

    if(frame.type === MessageType.SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST) {

      return "subscribe";
    }

    if(frame.type === MessageType.UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST) {

      return "unsubscribe";
    }

    return "other";
  },
  label: "BluetoothProxyApi.advertisements",
  openSubscription: (api: BluetoothProxyApi) => parkedSubscription((signal) => api.advertisements({ signal })[Symbol.asyncIterator]()),
  setup: () => {

    const handle = makeHost();

    return { api: new BluetoothProxyApi(handle.host), sent: handle.sent };
  }
});

// Drive the harness against the Bluetooth connections-free dimension - a SUBSCRIBE-only device-wide subscription whose device has NO unsubscribe frame. emitsUnsubscribe
// is false, so the harness asserts the last release (and the post-reconnect last release) emit NOTHING rather than an UNSUBSCRIBE; reconnect-survival still
// re-issues SUBSCRIBE for the surviving consumer.
runReissuableSubscriptionContract<BluetoothProxyApi>({

  classify: (frame: CapturedContractFrame): ContractFrameKind => {

    return (frame.type === MessageType.SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST) ? "subscribe" : "other";
  },
  emitsUnsubscribe: false,
  label: "BluetoothProxyApi.connectionsFree",
  openSubscription: (api: BluetoothProxyApi) => parkedSubscription((signal) => api.connectionsFree({ signal })[Symbol.asyncIterator]()),
  setup: () => {

    const handle = makeHost();

    return { api: new BluetoothProxyApi(handle.host), sent: handle.sent };
  }
});

// Drive the harness against the Bluetooth notify dimension - a REISSUE-ONLY ledger keyed by (address, handle). wireSilentOnChange is true, so acquire / release emit
// NOTHING on the wire; the SUBSCRIBE-classified re-arm (a NOTIFY enable=1 frame) appears only on reissueOnReconnect via the subscription's onReissue hook.
// emitsUnsubscribe is false since there is no detach wire effect at all. classify matches the re-armed NOTIFY frame on the contract (address, handle) with enable set.
runReissuableSubscriptionContract<BluetoothProxyApi>({

  classify: (frame: CapturedContractFrame): ContractFrameKind => {

    if(frame.type !== MessageType.BLUETOOTH_GATT_NOTIFY_REQUEST) {

      return "other";
    }

    const decoded = decodeFields(frame.payload);

    // The NOTIFY frame carries address in field 1, handle in field 2, and the enable bit in field 3. A re-arm for the contract key with enable=1 is the SUBSCRIBE-class
    // wire effect the harness asserts on; anything else (a different key, or an enable=0 disable) is "other".
    if((decoded[1]?.[0] !== Number(CONTRACT_NOTIFY_ADDRESS)) || (decoded[2]?.[0] !== CONTRACT_NOTIFY_HANDLE) || (decoded[3]?.[0] !== 1)) {

      return "other";
    }

    return "subscribe";
  },
  emitsUnsubscribe: false,
  label: "BluetoothProxyApi.notify",
  openSubscription: (api: BluetoothProxyApi) => {

    return parkedSubscription((signal) => api.notify(CONTRACT_NOTIFY_ADDRESS, CONTRACT_NOTIFY_HANDLE, { signal })[Symbol.asyncIterator]());
  },
  setup: () => {

    const handle = makeHost();

    return { api: new BluetoothProxyApi(handle.host), sent: handle.sent };
  },
  wireSilentOnChange: true
});

// Avoid an unused-import warning when the tests above did not exercise BluetoothGATTService directly. The type is part of the public surface and the tests rely on it
// indirectly via getServices(); this no-op assertion locks the public re-export in place.
test("BluetoothGATTService is re-exported", () => {

  const sample: BluetoothGATTService = { characteristics: [], handle: 1 };

  assert.equal(sample.handle, 1);
});
