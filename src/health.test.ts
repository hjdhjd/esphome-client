/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * health.test.ts: Unit tests for the HealthState const-object and the disconnectedHealth helper.
 */
import { HealthState, connectionUptimeMs, disconnectedHealth, isConnectionLive } from "./health.ts";
import { describe, test } from "node:test";
import type { LiveConnectionHealth } from "./health.ts";
import assert from "node:assert/strict";

describe("HealthState", () => {

  test("CONNECTED has the literal value 'connected' - matches the lifecycle event tag", () => {

    assert.equal(HealthState.CONNECTED, "connected");
  });

  test("DISCONNECTED has the literal value 'disconnected'", () => {

    assert.equal(HealthState.DISCONNECTED, "disconnected");
  });

  test("RECONNECTING has the literal value 'reconnecting'", () => {

    assert.equal(HealthState.RECONNECTING, "reconnecting");
  });

  test("STALLED has the literal value 'stalled'", () => {

    assert.equal(HealthState.STALLED, "stalled");
  });

  test("the four state values are pairwise distinct", () => {

    const values = new Set(Object.values(HealthState));

    assert.equal(values.size, 4, "all four declared health states must be distinct");
  });
});

describe("disconnectedHealth", () => {

  test("returns a record with state DISCONNECTED", () => {

    assert.equal(disconnectedHealth().state, HealthState.DISCONNECTED, "the initial state is DISCONNECTED");
  });

  test("starts with zero stall count - no stalls observed before the first connect", () => {

    assert.equal(disconnectedHealth().consecutiveStalls, 0);
  });

  test("starts with encrypted=false - we have no transport yet", () => {

    assert.equal(disconnectedHealth().encrypted, false);
  });

  test("starts with lastInboundActivityAt=0 - sentinel for 'no inbound message yet'", () => {

    assert.equal(disconnectedHealth().lastInboundActivityAt, 0);
  });

  test("has zero derived uptime - no current connection means no uptime", () => {

    assert.equal(connectionUptimeMs(disconnectedHealth()), 0);
  });

  test("carries no connect epoch - connectedAtMs is absent on a down record", () => {

    assert.ok(!("connectedAtMs" in disconnectedHealth()), "a down record must not carry the connect epoch");
  });

  test("does not set lastPingRttMs - the field is omitted until the first ping completes", () => {

    const health = disconnectedHealth();

    assert.equal(("lastPingRttMs" in health), false, "lastPingRttMs is omitted, not set to undefined - matches the optional-field convention");
  });

  test("returns a fresh object on each call - mutating the result does not affect future calls", () => {

    const a = disconnectedHealth();
    const b = disconnectedHealth();

    a.consecutiveStalls = 99;

    assert.equal(b.consecutiveStalls, 0, "each call must produce a fresh object so mutation does not leak");
  });
});

// A canonical live "connected" record used as the base for the derivation tests below. The `connectedAtMs` epoch is overridden per-test for deterministic uptime math.
const liveConnected: LiveConnectionHealth = {

  connectedAtMs: 0,
  consecutiveStalls: 0,
  encrypted: false,
  lastInboundActivityAt: 0,
  state: HealthState.CONNECTED
};

describe("isConnectionLive", () => {

  test("is true for a connected record", () => {

    assert.equal(isConnectionLive({ ...liveConnected, state: HealthState.CONNECTED }), true);
  });

  test("is true for a stalled record - a stall is still socket-up", () => {

    assert.equal(isConnectionLive({ ...liveConnected, state: HealthState.STALLED }), true);
  });

  test("is false for a disconnected record", () => {

    assert.equal(isConnectionLive(disconnectedHealth()), false);
  });

  test("is false for a reconnecting record", () => {

    assert.equal(isConnectionLive({ ...disconnectedHealth(), state: HealthState.RECONNECTING }), false);
  });
});

describe("connectionUptimeMs", () => {

  test("returns 0 for a down record regardless of the supplied now", () => {

    assert.equal(connectionUptimeMs(disconnectedHealth(), 9999), 0);
  });

  test("returns now - connectedAtMs for a connected record", () => {

    assert.equal(connectionUptimeMs({ ...liveConnected, connectedAtMs: 1000 }, 4000), 3000);
  });

  test("stays live through a stall - a stalled record derives uptime, not the 0 the pre-union code froze it at", () => {

    // A stalled record carries connectedAtMs, so derived uptime keeps advancing through a stall.
    assert.equal(connectionUptimeMs({ ...liveConnected, connectedAtMs: 1000, state: HealthState.STALLED }, 6000), 5000);
  });

  test("defaults now to Date.now() so a live record yields a non-negative uptime", () => {

    const before = Date.now();

    assert.ok(connectionUptimeMs({ ...liveConnected, connectedAtMs: before }) >= 0);
  });
});
