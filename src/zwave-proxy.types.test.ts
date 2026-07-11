/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * zwave-proxy.types.test.ts: Type-level tests for the ZWaveProxyApi surface. Verifies that consumer-facing signatures narrow correctly and that obvious mis-uses (wrong
 * argument types, omitted required fields) fail typecheck.
 */
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { EspHomeClient } from "./esphome-client.ts";
import type { ZWaveProxyApi } from "./zwave-proxy.ts";
import assert from "node:assert/strict";

describe("ZWaveProxyApi - public-surface narrowing", () => {

  test("client.zwave returns ZWaveProxyApi (not nullable)", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const api: ZWaveProxyApi = client.zwave;

    assert.ok(api);
    assert.equal(typeof api.send, "function");
    assert.equal(typeof api.frames, "function");
    assert.equal(typeof api.homeIdChanges, "function");
    assert.equal(typeof api.homeId, "function");

    client.disconnect();
  });

  test("client.zwave.frames() returns AsyncIterable<Buffer>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const iterable: AsyncIterable<Buffer> = client.zwave.frames();

    void iterable;

    client.disconnect();
  });

  test("client.zwave.homeIdChanges() returns AsyncIterable<number>", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const iterable: AsyncIterable<number> = client.zwave.homeIdChanges();

    void iterable;

    client.disconnect();
  });

  test("client.zwave.homeId() returns number | null", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const result: number | null = client.zwave.homeId();

    void result;

    client.disconnect();
  });

  test("client.zwave.available is a boolean", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const available: boolean = client.zwave.available;

    void available;

    client.disconnect();
  });
});

describe("ZWaveProxyApi - argument-type narrowing", () => {

  test("send rejects a string frame", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // The @ts-expect-error is the contract under test - it locks the compile-time rejection. We wrap in try/catch because the runtime path (encodeProtoFields ->
    // Buffer.concat) will throw on a non-Buffer argument; the throw is acceptable here because the typecheck has already done its job.
    try {

      // @ts-expect-error - send requires a Buffer; a string must not type-check.
      client.zwave.send("not a buffer");

    } catch {

      // Expected runtime rejection; the type-level assertion is the contract.
    }

    // Control case: a Buffer compiles cleanly.
    client.zwave.send(Buffer.alloc(0));

    client.disconnect();
  });

  test("send rejects an array of numbers (must be a Buffer)", () => {

    const client = new EspHomeClient({ host: "localhost" });

    try {

      // @ts-expect-error - send requires a Buffer; an array of numbers must not type-check.
      client.zwave.send([ 0x01, 0x02, 0x03 ]);

    } catch {

      // Expected runtime rejection; the type-level assertion is the contract.
    }

    client.disconnect();
  });
});

describe("ClientEventsMap - zwave channel typing", () => {

  test("client.on(\"zwaveFrame\", cb) types the callback parameter as Buffer", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: Buffer | null = null;

    using sub = client.on("zwaveFrame", (frame): void => { seen = frame; });

    void seen;
    void sub;

    client.disconnect();
  });

  test("client.on(\"zwaveHomeIdChange\", cb) types the callback parameter as number", () => {

    const client = new EspHomeClient({ host: "localhost" });
    let seen: number | null = null;

    using sub = client.on("zwaveHomeIdChange", (homeId): void => { seen = homeId; });

    void seen;
    void sub;

    client.disconnect();
  });
});
