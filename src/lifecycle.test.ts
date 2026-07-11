/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle.test.ts: Runtime tests for the LifecycleEvent discriminated union.
 */
import { describe, test } from "node:test";
import { ConnectionError } from "./errors.ts";
import type { LifecycleEvent } from "./lifecycle.ts";
import assert from "node:assert/strict";

describe("LifecycleEvent discriminated union", () => {

  test("connect variant carries an encrypted boolean", () => {

    const event: LifecycleEvent = { encrypted: true, kind: "connect" };

    if(event.kind === "connect") {

      assert.equal(event.encrypted, true);
    }
  });

  test("disconnect variant has no required encrypted field", () => {

    const event: LifecycleEvent = { kind: "disconnect" };

    if(event.kind === "disconnect") {

      assert.equal(event.cause, undefined);
    }
  });

  test("disconnect variant accepts an optional cause typed as EspHomeError", () => {

    const cause = new ConnectionError("peer closed", "PEER_CLOSED");
    const event: LifecycleEvent = { cause, kind: "disconnect" };

    if(event.kind === "disconnect") {

      assert.equal(event.cause?.name, "ConnectionError");
      assert.equal(event.cause?.code, "PEER_CLOSED");
    }
  });

  test("kind narrows correctly in switch", () => {

    const events: readonly LifecycleEvent[] = [ { encrypted: false, kind: "connect" }, { kind: "disconnect" } ];
    const summary: string[] = [];

    for(const e of events) {

      switch(e.kind) {

        case "connect":

          summary.push("c:" + String(e.encrypted));

          break;

        case "disconnect":

          summary.push("d");

          break;
      }
    }

    assert.deepEqual(summary, [ "c:false", "d" ]);
  });
});
