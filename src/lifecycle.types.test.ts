/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle.types.test.ts: Type-level tests for the LifecycleEvent discriminated union.
 */
import { describe, test } from "node:test";
import type { EspHomeError } from "./errors.ts";
import type { LifecycleEvent } from "./lifecycle.ts";
import assert from "node:assert/strict";

describe("LifecycleEvent discriminated union narrowing", () => {

  test("kind:'connect' narrows to a record with encrypted: boolean", () => {

    const handle = (e: LifecycleEvent): boolean | undefined => {

      if(e.kind === "connect") {

        // Inside the connect branch, e.encrypted is typed as boolean.
        const enc: boolean = e.encrypted;

        return enc;
      }

      return undefined;
    };

    assert.equal(handle({ encrypted: true, kind: "connect" }), true);
    assert.equal(handle({ kind: "disconnect" }), undefined);
  });

  test("kind:'disconnect' narrows to a record with optional cause: EspHomeError", () => {

    const handle = (e: LifecycleEvent): EspHomeError | undefined => {

      if(e.kind === "disconnect") {

        // Inside the disconnect branch, e.cause is typed as EspHomeError | undefined.
        return e.cause;
      }

      return undefined;
    };

    assert.equal(handle({ kind: "disconnect" }), undefined);
  });

  test("connect variant rejects accessing .cause", () => {

    const e: LifecycleEvent = { encrypted: false, kind: "connect" };

    if(e.kind === "connect") {

      // @ts-expect-error - .cause is not a property of the connect variant; the discriminated union excludes it.
      const _x = e.cause;

      void _x;
    }

    assert.equal(e.kind, "connect");
  });

  test("disconnect variant rejects accessing .encrypted", () => {

    const e: LifecycleEvent = { kind: "disconnect" };

    if(e.kind === "disconnect") {

      // @ts-expect-error - .encrypted is not a property of the disconnect variant.
      const _x = e.encrypted;

      void _x;
    }

    assert.equal(e.kind, "disconnect");
  });
});
