/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * health.test.ts: Unit tests for the HealthState const-object, the health record builders, the live-state guard, and the uptime derivation.
 */
import type { DownConnectionHealth, LiveConnectionHealth } from "./health.ts";
import { HealthState, connectedHealth, connectionUptimeMs, disconnectedHealth, downHealth, isConnectionLive } from "./health.ts";
import { describe, test } from "node:test";
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

  test("returns a fresh object on each call", () => {

    const a = disconnectedHealth();
    const b = disconnectedHealth();

    // The records are readonly, so freshness is shown by identity rather than by mutating one record.
    assert.notStrictEqual(a, b, "each call returns a fresh object");
    assert.deepEqual(a, b);
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

describe("downHealth", () => {

  test("carries the stall count of the record it replaces - only inbound activity resets the count", () => {

    assert.equal(downHealth({ ...liveConnected, consecutiveStalls: 3 }, HealthState.DISCONNECTED).consecutiveStalls, 3);
  });

  test("carries the last ping round-trip time when the record it replaces has one", () => {

    assert.equal(downHealth({ ...liveConnected, lastPingRttMs: 42 }, HealthState.DISCONNECTED).lastPingRttMs, 42);
  });

  test("omits lastPingRttMs when the record it replaces has none - the key is absent, not undefined", () => {

    assert.equal(("lastPingRttMs" in downHealth(liveConnected, HealthState.DISCONNECTED)), false);
  });

  test("returns the down state it was given, for each down state", () => {

    assert.equal(downHealth(liveConnected, HealthState.DISCONNECTED).state, HealthState.DISCONNECTED);
    assert.equal(downHealth(liveConnected, HealthState.RECONNECTING).state, HealthState.RECONNECTING);
  });

  test("returns no inbound-activity time when handed a reconnecting record that carries one", () => {

    const reconnecting: DownConnectionHealth = { ...disconnectedHealth(), lastInboundActivityAt: 12345, state: HealthState.RECONNECTING };

    assert.equal(downHealth(reconnecting, HealthState.RECONNECTING).lastInboundActivityAt, 0);
  });

  test("returns no inbound-activity time when handed a live record that carries one", () => {

    assert.equal(downHealth({ ...liveConnected, lastInboundActivityAt: 12345 }, HealthState.RECONNECTING).lastInboundActivityAt, 0);
  });

  test("carries no connect epoch when handed a live record", () => {

    const health = downHealth({ ...liveConnected, connectedAtMs: 1000 }, HealthState.RECONNECTING);

    assert.ok(!("connectedAtMs" in health), "a down record must not carry the connect epoch");
  });
});

describe("connectedHealth", () => {

  // The new session's facts, each different from the matching field of every record the tests below replace, so a value read from the wrong side shows.
  const facts = { connectedAtMs: 5000, encrypted: true, lastInboundActivityAt: 6000 };

  test("carries the stall count of the record it replaces - a device that stalls again right after reconnecting keeps counting", () => {

    assert.equal(connectedHealth({ ...disconnectedHealth(), consecutiveStalls: 2, state: HealthState.RECONNECTING }, facts).consecutiveStalls, 2);
  });

  test("omits lastPingRttMs even when the record it replaces has one - a new connection has measured no round trip", () => {

    assert.equal(("lastPingRttMs" in connectedHealth({ ...disconnectedHealth(), lastPingRttMs: 42 }, facts)), false);
  });

  test("takes its connect epoch, encryption flag, and inbound-activity time from its options, in the connected state", () => {

    const previous: LiveConnectionHealth = { ...liveConnected, connectedAtMs: 1, encrypted: false, lastInboundActivityAt: 2, state: HealthState.STALLED };
    const expected: LiveConnectionHealth = { connectedAtMs: 5000, consecutiveStalls: 0, encrypted: true, lastInboundActivityAt: 6000, state: HealthState.CONNECTED };

    assert.deepEqual(connectedHealth(previous, facts), expected);
  });
});
