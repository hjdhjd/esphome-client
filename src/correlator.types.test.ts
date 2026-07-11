/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * correlator.types.test.ts: Type-level tests for the Correlator generic surface.
 */
import { describe, test } from "node:test";
import { Correlator } from "./correlator.ts";
import assert from "node:assert/strict";

describe("Correlator - generic type narrowing", () => {

  test("await on Correlator<string> returns Promise<string>", async () => {

    const correlator = new Correlator<string>();
    const promise = correlator.await("k");

    correlator.resolve("k", "value");

    const value: string = await promise;

    assert.equal(value, "value");
  });

  test("resolve narrows the value parameter to T", () => {

    const correlator = new Correlator<number>();

    // @ts-expect-error - resolve must reject a string argument when T is number.
    correlator.resolve("k", "not-a-number");

    // The control case compiles cleanly.
    correlator.resolve("k", 42);
  });

  test("await with a number key rejects a string key at compile time", async () => {

    const correlator = new Correlator<string, number>();

    // @ts-expect-error - K is number; a string key fails the type constraint.
    const _wrong = correlator.await("not-a-number");

    void _wrong;

    // The control case compiles cleanly.
    const p = correlator.await(7);

    correlator.resolve(7, "seven");
    assert.equal(await p, "seven");
  });

  test("composite keys accept keyToString in the constructor options", async () => {

    const correlator = new Correlator<string, [bigint, number]>({

      keyToString: ([ address, handle ]): string => address.toString(16) + ":" + String(handle)
    });

    const p = correlator.await([ 0x123n, 7 ]);

    correlator.resolve([ 0x123n, 7 ], "matched");
    assert.equal(await p, "matched");
  });

  test("pending and reject narrow the key parameter to K", () => {

    const correlator = new Correlator<string, number>();

    // @ts-expect-error - pending must reject a string key when K is number.
    correlator.pending("not-a-number");

    // @ts-expect-error - reject must reject a string key when K is number.
    correlator.reject("not-a-number", new Error("ignored"));

    // The control cases compile cleanly.
    assert.equal(correlator.pending(1), false);
    assert.equal(correlator.reject(1, new Error("ignored")), false);
  });
});
