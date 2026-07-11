/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * serial-proxy.types.test.ts: Type-level tests for the SerialProxyApi surface. Verifies that consumer-facing signatures narrow correctly and that obvious mis-uses
 * (wrong argument types, omitted required fields) fail typecheck.
 */
import type { SerialDataChunk, SerialProxyConfigureOptions, SerialProxyFlushResult } from "./serial-proxy.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { EspHomeClient } from "./esphome-client.ts";
import { SerialProxyRequestType } from "./api-constants.ts";
import assert from "node:assert/strict";

describe("SerialProxyApi - public-surface narrowing", () => {

  test("client.serial returns SerialProxyApi (not nullable)", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const api = client.serial;

    // Smoke-check that the lazy getter returns an object (not null, not undefined).
    assert.ok(api);
    assert.equal(typeof api.list, "function");
    assert.equal(typeof api.configure, "function");
    assert.equal(typeof api.write, "function");
    assert.equal(typeof api.setModemPins, "function");
    assert.equal(typeof api.getModemPins, "function");
    assert.equal(typeof api.flush, "function");
    assert.equal(typeof api.data, "function");

    client.disconnect();
  });

  test("client.serial.data(0) returns AsyncIterable<SerialDataChunk>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const iterable: AsyncIterable<SerialDataChunk> = client.serial.data(0);

    // We cannot actually consume the iterable without a transport - the type assertion is the point.
    void iterable;

    client.disconnect();
  });

  test("client.serial.getModemPins(0) returns Promise<number>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const result: Promise<number> = client.serial.getModemPins(0, { timeoutMs: 1 });

    // Catch the eventual rejection so the unhandled-rejection guard does not fire; type assertion above is the contract under test.
    result.catch((): void => { /* expected timeout */ });

    client.disconnect();
  });

  test("client.serial.flush(0) returns Promise<SerialProxyFlushResult>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const result: Promise<SerialProxyFlushResult> = client.serial.flush(0, { timeoutMs: 1 });

    result.catch((): void => { /* expected timeout */ });

    client.disconnect();
  });
});

describe("SerialProxyConfigureOptions - required fields", () => {

  test("baudrate and dataSize are required (compile error if omitted)", () => {

    // The control case compiles cleanly.
    const opts: SerialProxyConfigureOptions = { baudrate: 115200, dataSize: 8 };

    void opts;

    // @ts-expect-error - dataSize is required.
    const _missingDataSize: SerialProxyConfigureOptions = { baudrate: 115200 };

    void _missingDataSize;

    // @ts-expect-error - baudrate is required.
    const _missingBaudrate: SerialProxyConfigureOptions = { dataSize: 8 };

    void _missingBaudrate;
  });
});

describe("SerialProxyApi - argument-type narrowing", () => {

  test("write rejects a string instance", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - instance must be a number, not a string.
    client.serial.write("notNumber", Buffer.alloc(0));

    // Control case: number instance compiles cleanly.
    client.serial.write(0, Buffer.alloc(0));

    client.disconnect();
  });

  test("configure rejects a string instance", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - instance must be a number, not a string.
    client.serial.configure("zero", { baudrate: 9600, dataSize: 8 });

    client.serial.configure(0, { baudrate: 9600, dataSize: 8 });

    client.disconnect();
  });

  test("setModemPins rejects a string lineStates", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - lineStates must be a number bitmask.
    client.serial.setModemPins(0, "RTS");

    client.serial.setModemPins(0, 0x3);

    client.disconnect();
  });
});

describe("ClientEventsMap - serialData typing", () => {

  test("client.on(\"serialData\", cb) types the callback parameter as SerialDataChunk", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: SerialDataChunk | null = null;

    using sub = client.on("serialData", (chunk): void => { seen = chunk; });

    // No emit available without a transport; the type assertion above is the contract.
    void seen;
    void sub;

    client.disconnect();
  });
});

describe("SerialProxyFlushResult - type tag", () => {

  test("status is a SerialProxyStatus literal union, type is FLUSH only", () => {

    const result: SerialProxyFlushResult = { instance: 0, status: 0, type: SerialProxyRequestType.FLUSH };

    // The control case compiles cleanly.
    assert.equal(result.type, SerialProxyRequestType.FLUSH);

    // @ts-expect-error - the result type is locked to FLUSH; SUBSCRIBE / UNSUBSCRIBE are not assignable.
    const _wrongType: SerialProxyFlushResult = { instance: 0, status: 0, type: SerialProxyRequestType.SUBSCRIBE };

    void _wrongType;
  });
});
