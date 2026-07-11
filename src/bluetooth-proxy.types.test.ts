/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bluetooth-proxy.types.test.ts: Type-level tests for the BluetoothProxyApi surface. Verifies that consumer-facing signatures narrow correctly and that obvious
 * mis-uses (wrong argument types, raw numbers in place of enum values) fail typecheck.
 */
import type {
  BluetoothGATTService,
  BluetoothLERawAdvertisement,
  BluetoothScannerStateData,
  ConnectionParams,
  ConnectionStateData,
  ConnectionsFreeData,
  NotifyDataChunk
} from "./bluetooth-proxy.ts";
import { BluetoothScannerMode, BluetoothScannerState } from "./api-constants.ts";
import { describe, test } from "node:test";
import type { BluetoothProxyApi } from "./bluetooth-proxy.ts";
import { Buffer } from "node:buffer";
import { EspHomeClient } from "./esphome-client.ts";
import assert from "node:assert/strict";

describe("BluetoothProxyApi - public-surface narrowing", () => {

  test("client.bluetooth returns BluetoothProxyApi (not nullable)", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const api: BluetoothProxyApi = client.bluetooth;

    assert.ok(api);
    assert.equal(typeof api.advertisements, "function");
    assert.equal(typeof api.scannerState, "function");
    assert.equal(typeof api.setScannerMode, "function");
    assert.equal(typeof api.lastScannerState, "function");

    client.disconnect();
  });

  test("client.bluetooth.advertisements() returns AsyncIterable<BluetoothLERawAdvertisement>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const iterable: AsyncIterable<BluetoothLERawAdvertisement> = client.bluetooth.advertisements();

    void iterable;

    client.disconnect();
  });

  test("client.bluetooth.scannerState() returns AsyncIterable<BluetoothScannerStateData>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const iterable: AsyncIterable<BluetoothScannerStateData> = client.bluetooth.scannerState();

    void iterable;

    client.disconnect();
  });

  test("client.bluetooth.lastScannerState() returns BluetoothScannerStateData | null", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const value: BluetoothScannerStateData | null = client.bluetooth.lastScannerState();

    assert.equal(value, null);

    client.disconnect();
  });

  test("client.bluetooth.available is a boolean", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const available: boolean = client.bluetooth.available;

    assert.equal(available, false);

    client.disconnect();
  });
});

describe("BluetoothLERawAdvertisement.address is bigint (not number)", () => {

  test("the address field types as bigint and rejects number assignment", () => {

    const ad: BluetoothLERawAdvertisement = {

      address: 0x123456789abcn,
      addressType: 1,
      data: Buffer.alloc(0),
      rssi: -50
    };

    // The bigint literal must round-trip through the type without coercion.
    assert.equal(typeof ad.address, "bigint");

    // @ts-expect-error - address requires bigint; a plain number is not assignable.
    const _wrongType: BluetoothLERawAdvertisement = { address: 0x123, addressType: 0, data: Buffer.alloc(0), rssi: 0 };

    void _wrongType;
  });
});

describe("BluetoothProxyApi.setScannerMode - argument narrowing", () => {

  test("accepts BluetoothScannerMode.PASSIVE and ACTIVE; rejects arbitrary integers", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // The control case compiles cleanly.
    client.bluetooth.setScannerMode(BluetoothScannerMode.PASSIVE);
    client.bluetooth.setScannerMode(BluetoothScannerMode.ACTIVE);

    // @ts-expect-error - 5 is not a member of BluetoothScannerMode (only 0 and 1 are accepted).
    client.bluetooth.setScannerMode(5);

    // @ts-expect-error - a string is also not assignable.
    client.bluetooth.setScannerMode("active");

    client.disconnect();
  });
});

describe("ClientEventsMap - bluetoothAdvertisement and bluetoothScannerState typing", () => {

  test("client.on(\"bluetoothAdvertisement\", cb) types the callback parameter as BluetoothLERawAdvertisement", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: BluetoothLERawAdvertisement | null = null;

    using sub = client.on("bluetoothAdvertisement", (ad): void => { seen = ad; });

    void seen;
    void sub;

    client.disconnect();
  });

  test("client.on(\"bluetoothScannerState\", cb) types the callback parameter as BluetoothScannerStateData", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: BluetoothScannerStateData | null = null;

    using sub = client.on("bluetoothScannerState", (state): void => { seen = state; });

    void seen;
    void sub;

    client.disconnect();
  });
});

describe("BluetoothScannerStateData - field types", () => {

  test("state, mode, and configuredMode are the constant-derived union types", () => {

    const data: BluetoothScannerStateData = {

      configuredMode: BluetoothScannerMode.ACTIVE,
      mode: BluetoothScannerMode.PASSIVE,
      state: BluetoothScannerState.RUNNING
    };

    assert.equal(data.state, BluetoothScannerState.RUNNING);

    // @ts-expect-error - the state field rejects arbitrary numbers; only BluetoothScannerState members are assignable.
    const _wrongState: BluetoothScannerStateData = { configuredMode: 0, mode: 0, state: 99 };

    void _wrongState;
  });
});

// Swallow any rejected promise quietly. Many of these typing tests issue calls that the real implementation parks awaiting a response that never arrives; the
// `@ts-expect-error` annotations also produce calls that would reject with a type-incompat runtime error. Both paths are irrelevant to typecheck and would otherwise
// leak as unhandled-rejection warnings. The compiler verifies the surface; the runtime here is incidental.
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the type-test settle helper deliberately widens to `T | void` to model the catch-swallowed branch.
const settle = async <T>(promise: Promise<T>): Promise<T | void> => promise.catch((): void => { /* */ });

describe("BluetoothProxyApi - GATT method argument typing", () => {

  test("connect requires a bigint address", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // The well-typed call compiles cleanly.
    void settle(client.bluetooth.connect(0xaabbccddn, { timeoutMs: 1000 }));

    // @ts-expect-error - address must be bigint; a plain number is not assignable.
    void settle(client.bluetooth.connect(0x12345));

    client.disconnect();
  });

  test("readCharacteristic requires bigint address and number handle", () => {

    const client = new EspHomeClient({ host: "localhost" });

    void settle(client.bluetooth.readCharacteristic(0xaan, 0x2a));

    // @ts-expect-error - the address parameter must be bigint.
    void settle(client.bluetooth.readCharacteristic(123, 5));

    // @ts-expect-error - the handle parameter must be number.
    void settle(client.bluetooth.readCharacteristic(0xaan, 0x2an));

    client.disconnect();
  });

  test("writeCharacteristic requires a Buffer", () => {

    const client = new EspHomeClient({ host: "localhost" });

    void settle(client.bluetooth.writeCharacteristic(0xaan, 0x2a, Buffer.alloc(0), { response: true }));

    // @ts-expect-error - data must be a Buffer; a string is not assignable.
    void settle(client.bluetooth.writeCharacteristic(0xaan, 0x2a, "hello"));

    client.disconnect();
  });

  test("setNotify requires a boolean enable", () => {

    const client = new EspHomeClient({ host: "localhost" });

    void settle(client.bluetooth.setNotify(0xaan, 0x2a, true));

    // @ts-expect-error - enable must be boolean; "yes" is not assignable.
    void settle(client.bluetooth.setNotify(0xaan, 0x2a, "yes"));

    client.disconnect();
  });

  test("setConnectionParams requires all four ConnectionParams fields", () => {

    const client = new EspHomeClient({ host: "localhost" });

    void settle(client.bluetooth.setConnectionParams(0xaan, { latency: 0, maxInterval: 40, minInterval: 24, timeout: 400 }));

    // @ts-expect-error - missing `timeout` field; ConnectionParams is exact.
    void settle(client.bluetooth.setConnectionParams(0xaan, { latency: 0, maxInterval: 40, minInterval: 24 }));

    client.disconnect();
  });

  test("connect / disconnect / pair / unpair / clearCache return Promises", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const connect: Promise<ConnectionStateData> = client.bluetooth.connect(0xaan);
    const disconnect: Promise<void> = client.bluetooth.disconnect(0xaan);
    const pair: Promise<void> = client.bluetooth.pair(0xaan);
    const unpair: Promise<void> = client.bluetooth.unpair(0xaan);
    const clearCache: Promise<void> = client.bluetooth.clearCache(0xaan);

    void settle(connect);
    void settle(disconnect);
    void settle(pair);
    void settle(unpair);
    void settle(clearCache);

    client.disconnect();
  });

  test("getServices returns Promise<BluetoothGATTService[]>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const promise: Promise<BluetoothGATTService[]> = client.bluetooth.getServices(0xaan);

    void settle(promise);

    client.disconnect();
  });

  test("notify returns AsyncIterable<NotifyDataChunk>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const stream: AsyncIterable<NotifyDataChunk> = client.bluetooth.notify(0xaan, 0x2a);

    void stream;

    client.disconnect();
  });

  test("connectionsFree returns AsyncIterable<ConnectionsFreeData>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const stream: AsyncIterable<ConnectionsFreeData> = client.bluetooth.connectionsFree();

    void stream;

    client.disconnect();
  });

  test("connectionStates returns AsyncIterable<ConnectionStateData>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const stream: AsyncIterable<ConnectionStateData> = client.bluetooth.connectionStates();

    void stream;

    client.disconnect();
  });

  test("isConnected and connectionState are synchronous accessors", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const flag: boolean = client.bluetooth.isConnected(0xaan);
    const state: ConnectionStateData | null = client.bluetooth.connectionState(0xaan);

    assert.equal(flag, false);
    assert.equal(state, null);

    client.disconnect();
  });

  test("lastConnectionsFree is a synchronous Nullable accessor", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const snapshot: ConnectionsFreeData | null = client.bluetooth.lastConnectionsFree();

    assert.equal(snapshot, null);

    client.disconnect();
  });
});

describe("ClientEventsMap - new GATT event payloads", () => {

  test("client.on(\"bluetoothConnectionState\", cb) types the callback as ConnectionStateData", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: ConnectionStateData | null = null;

    using sub = client.on("bluetoothConnectionState", (state): void => { seen = state; });

    void seen;
    void sub;

    client.disconnect();
  });

  test("client.on(\"bluetoothNotifyData\", cb) types the callback as NotifyDataChunk", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: NotifyDataChunk | null = null;

    using sub = client.on("bluetoothNotifyData", (chunk): void => { seen = chunk; });

    void seen;
    void sub;

    client.disconnect();
  });

  test("client.on(\"bluetoothConnectionsFree\", cb) types the callback as ConnectionsFreeData", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: ConnectionsFreeData | null = null;

    using sub = client.on("bluetoothConnectionsFree", (data): void => { seen = data; });

    void seen;
    void sub;

    client.disconnect();
  });
});

describe("ConnectionStateData and NotifyDataChunk - field types", () => {

  test("ConnectionStateData.address is bigint", () => {

    const data: ConnectionStateData = { address: 0xaan, connected: true, error: 0, mtu: 23 };

    assert.equal(typeof data.address, "bigint");

    // @ts-expect-error - address requires bigint.
    const _wrong: ConnectionStateData = { address: 0xaa, connected: true, error: 0, mtu: 23 };

    void _wrong;
  });

  test("NotifyDataChunk has bigint address, number handle, Buffer data", () => {

    const chunk: NotifyDataChunk = { address: 0xaan, data: Buffer.alloc(0), handle: 0x2a };

    assert.equal(typeof chunk.address, "bigint");
    assert.equal(typeof chunk.handle, "number");
    assert.equal(Buffer.isBuffer(chunk.data), true);
  });

  test("ConnectionParams has the four numeric fields", () => {

    const params: ConnectionParams = { latency: 0, maxInterval: 40, minInterval: 24, timeout: 400 };

    assert.equal(typeof params.minInterval, "number");
    assert.equal(typeof params.maxInterval, "number");
    assert.equal(typeof params.latency, "number");
    assert.equal(typeof params.timeout, "number");
  });
});
