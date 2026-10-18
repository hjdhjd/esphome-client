/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle.types.test.ts: Type-level tests for the LifecycleEvent discriminated union.
 */
import { describe, test } from "node:test";
import { ConnectionError } from "./errors.ts";
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

  test("kind:'lost' narrows to a record with a required cause: EspHomeError", () => {

    const cause = new ConnectionError("Synthetic failed reconnect attempt.", "PEER_CLOSED");
    const handle = (e: LifecycleEvent): EspHomeError | undefined => {

      if(e.kind === "lost") {

        // Inside the lost branch, e.cause is typed as EspHomeError with no undefined to narrow away.
        const required: EspHomeError = e.cause;

        return required;
      }

      return undefined;
    };

    // @ts-expect-error - a lost event must carry its cause.
    const _missing: LifecycleEvent = { kind: "lost" };

    assert.equal(handle({ cause, kind: "lost" }), cause);
    assert.equal(handle({ kind: "recovered" }), undefined);
  });

  test("connect variant rejects accessing .cause", () => {

    const e: LifecycleEvent = { encrypted: false, kind: "connect" };

    if(e.kind === "connect") {

      // @ts-expect-error - .cause is not a property of the connect variant; the discriminated union excludes it.
      const _x = e.cause;
    }

    assert.equal(e.kind, "connect");
  });

  test("disconnect variant rejects accessing .encrypted", () => {

    const e: LifecycleEvent = { kind: "disconnect" };

    if(e.kind === "disconnect") {

      // @ts-expect-error - .encrypted is not a property of the disconnect variant.
      const _x = e.encrypted;
    }

    assert.equal(e.kind, "disconnect");
  });

  test("recovered variant rejects accessing .cause and .encrypted", () => {

    const e: LifecycleEvent = { kind: "recovered" };

    if(e.kind === "recovered") {

      // @ts-expect-error - .cause is not a property of the recovered variant.
      const _cause = e.cause;
      // @ts-expect-error - .encrypted is not a property of the recovered variant.
      const _encrypted = e.encrypted;
    }

    assert.equal(e.kind, "recovered");
  });
});
