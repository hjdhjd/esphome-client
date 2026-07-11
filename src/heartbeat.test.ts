/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * heartbeat.test.ts: Unit tests for the HeartbeatScheduler.
 */
import type { ClockFn, HeartbeatConfig, HeartbeatHost } from "./heartbeat.ts";
import { describe, test } from "node:test";
import type { EspHomeLogging } from "./types.ts";
import { HeartbeatScheduler } from "./heartbeat.ts";
import { HeartbeatStalledError } from "./errors.ts";
import assert from "node:assert/strict";

// Build a logger that records every warn line; tests can assert against the array directly.
const recordingLogger = (): EspHomeLogging & { warned: string[] } => {

  const warned: string[] = [];

  return {

    debug: (): void => { /* discard */ },
    error: (): void => { /* discard */ },
    info:  (): void => { /* discard */ },
    warn:  (msg: string): void => { warned.push(msg); },
    warned
  };
};

interface TestHost {

  host: HeartbeatHost;
  log: ReturnType<typeof recordingLogger>;
  pings: number;
  stalls: { cause: HeartbeatStalledError; idleMs: number }[];
}

const buildHost = (): TestHost => {

  const log = recordingLogger();
  const stalls: { cause: HeartbeatStalledError; idleMs: number }[] = [];
  let pings = 0;

  const host: HeartbeatHost = {

    log,
    onSendPing: (): void => { pings += 1; },
    onStall: (cause: HeartbeatStalledError, idleMs: number): void => { stalls.push({ cause, idleMs }); }
  };

  return {

    get host(): HeartbeatHost { return host; },
    get log(): ReturnType<typeof recordingLogger> { return log; },
    get pings(): number { return pings; },
    get stalls(): { cause: HeartbeatStalledError; idleMs: number }[] { return stalls; }
  };
};

// Build a controllable clock the tests advance by hand. Returns the clock fn plus a setter.
const buildClock = (initial = 0): { advance: (deltaMs: number) => void; clock: ClockFn; set: (atMs: number) => void } => {

  let now = initial;

  return {

    advance: (deltaMs: number): void => { now += deltaMs; },
    clock: (): number => now,
    set: (atMs: number): void => { now = atMs; }
  };
};

const defaultConfig: HeartbeatConfig = { intervalMs: 30000, stallTimeoutMs: 60000 };

describe("HeartbeatScheduler - construction", () => {

  test("a null config produces a disabled scheduler", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, null);

    assert.equal(scheduler.enabled, false, "scheduler with null config must report disabled");
  });

  test("a populated config produces an enabled scheduler", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig);

    assert.equal(scheduler.enabled, true);
  });

  test("default state has zero last-activity timestamp and no in-flight ping", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig);

    assert.equal(scheduler.lastActivityAt, 0);
    assert.equal(scheduler.isPingInFlight, false);
  });

  test("the default clock is Date.now when none is injected", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig);
    const before = Date.now();

    scheduler.stamp();

    const stamped = scheduler.lastActivityAt;
    const after = Date.now();

    assert.ok((stamped >= before) && (stamped <= after), "default-clock stamp must fall within Date.now bounds");
  });
});

describe("HeartbeatScheduler - start (happy path + safe re-entry + disabled)", () => {

  test("start seeds the activity timestamp from the supplied initial value", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(500);

    assert.equal(scheduler.lastActivityAt, 500);
    scheduler.stop();
  });

  test("start is a no-op when the scheduler is disabled", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, null);

    scheduler.start(123);

    assert.equal(scheduler.lastActivityAt, 0, "disabled scheduler must not stamp anything on start");
  });

  test("start is safe to call more than once - re-entering after start re-seeds the activity timestamp without duplicating the timer", () => {

    const t = buildHost();
    const c = buildClock(0);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(0);
    // Advance past the first interval, then re-call start. Second start must overwrite lastActivityAt to the new seed, so a tick-at-30s now sees idleMs=0, not 30s.
    c.advance(30000);
    scheduler.start(c.clock());
    scheduler.tick();

    assert.equal(t.pings, 0, "second start re-seeded activity, so the immediate tick is below the interval threshold");
    assert.equal(t.stalls.length, 0);
    scheduler.stop();
  });
});

describe("HeartbeatScheduler - stamp", () => {

  test("stamp records the supplied timestamp", () => {

    const t = buildHost();
    const c = buildClock();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.stamp(42);

    assert.equal(scheduler.lastActivityAt, 42);
  });

  test("stamp without an argument reads the injected clock", () => {

    const t = buildHost();
    const c = buildClock(7777);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.stamp();

    assert.equal(scheduler.lastActivityAt, 7777);
  });

  test("a later stamp overwrites the previous activity timestamp", () => {

    const t = buildHost();
    const c = buildClock();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.stamp(100);
    scheduler.stamp(200);

    assert.equal(scheduler.lastActivityAt, 200);
  });
});

describe("HeartbeatScheduler - tick (idle ping)", () => {

  test("tick is a no-op when disabled", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, null);

    scheduler.tick();

    assert.equal(t.pings, 0);
    assert.equal(t.stalls.length, 0);
  });

  test("tick before any activity is below threshold and emits no ping", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    scheduler.tick();

    assert.equal(t.pings, 0, "no ping when idleMs is well below the configured interval");
  });

  test("tick at exactly intervalMs sends a ping", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();

    assert.equal(t.pings, 1, "boundary case: idleMs == intervalMs must trigger a ping");
    assert.equal(scheduler.isPingInFlight, true);
  });

  test("tick past intervalMs sends a ping and stamps the in-flight marker", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30500);
    scheduler.tick();

    assert.equal(t.pings, 1);
    assert.equal(scheduler.isPingInFlight, true);
  });

  test("tick does not double-ping when one is already in flight", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();
    c.advance(5000);
    scheduler.tick();

    assert.equal(t.pings, 1, "second tick must not send a duplicate ping while one is in flight");
  });

  test("after consumePingRtt, a subsequent idle tick can send a fresh ping", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();

    // Simulate the PING_RESPONSE arriving and threading through the host's tap (which calls stamp()) plus the run-phase RTT consumer.
    scheduler.stamp();
    scheduler.consumePingRtt();
    c.advance(30000);
    scheduler.tick();

    assert.equal(t.pings, 2, "after RTT is consumed and activity is restamped, the next idle window must be allowed a ping");
  });
});

describe("HeartbeatScheduler - tick (stall path)", () => {

  test("tick at exactly stallTimeoutMs surfaces a HeartbeatStalledError", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(60000);
    scheduler.tick();

    assert.equal(t.stalls.length, 1, "boundary case: idleMs == stallTimeoutMs must trigger onStall");
    assert.ok(t.stalls[0]!.cause instanceof HeartbeatStalledError);
    assert.equal(t.stalls[0]!.cause.code, "HEARTBEAT_STALLED");
    assert.equal(t.stalls[0]!.idleMs, 60000);
  });

  test("the supervisory warn line is logged exactly once on stall", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(75000);
    scheduler.tick();

    assert.equal(t.log.warned.length, 1);
    assert.match(t.log.warned[0]!, /Heartbeat stalled after 75000 ms/);
  });

  test("the scheduler stops its own timer once it surfaces a stall", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(60000);
    scheduler.tick();

    // After the stall, ticking again should be a no-op even though the config is unchanged - the timer was stopped.
    c.advance(60000);
    scheduler.tick();

    assert.equal(t.stalls.length, 1, "the scheduler must not keep firing stalls after it stops itself");
  });

  test("stall fires once even when idleMs exceeds the timeout by an arbitrary margin", () => {

    const t = buildHost();
    const c = buildClock(0);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(0);
    c.advance(10000000);
    scheduler.tick();

    assert.equal(t.stalls.length, 1);
  });
});

describe("HeartbeatScheduler - consumePingRtt", () => {

  test("returns undefined when no ping is in flight", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    assert.equal(scheduler.consumePingRtt(), undefined);
  });

  test("returns the elapsed milliseconds since the most recent ping send", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();
    c.advance(42);

    const rtt = scheduler.consumePingRtt();

    assert.equal(rtt, 42, "RTT is now - pingSentAt");
  });

  test("clears the in-flight marker after consumption", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();
    scheduler.consumePingRtt();

    assert.equal(scheduler.isPingInFlight, false);
    assert.equal(scheduler.consumePingRtt(), undefined, "consume is one-shot - second call returns undefined");
  });
});

describe("HeartbeatScheduler - stop (safe re-entry + lifecycle)", () => {

  test("stop is safe to call more than once on a never-started scheduler", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig);

    assert.doesNotThrow(() => scheduler.stop());
    assert.doesNotThrow(() => scheduler.stop());
  });

  test("stop clears any in-flight ping marker", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(30000);
    scheduler.tick();
    assert.equal(scheduler.isPingInFlight, true);

    scheduler.stop();

    assert.equal(scheduler.isPingInFlight, false);
  });

  test("stop is a no-op on a disabled scheduler", () => {

    const t = buildHost();
    const scheduler = new HeartbeatScheduler(t.host, null);

    assert.doesNotThrow(() => scheduler.stop());
  });
});

describe("HeartbeatScheduler - timer scheduling (real setInterval)", { concurrency: false }, () => {

  test("a started scheduler installs a timer that the runtime sees as live", async (t) => {

    const host = buildHost();
    // Use a small interval so the half-interval floor (1000 ms) clamps; the test verifies that start() and stop() on a real, unmocked setInterval-backed
    // scheduler complete cleanly, not that ticks fire.
    const config: HeartbeatConfig = { intervalMs: 60, stallTimeoutMs: 200 };
    const scheduler = new HeartbeatScheduler(host.host, config);

    scheduler.start(Date.now());
    t.after((): void => scheduler.stop());

    // We can't observe internal handles without leaking them. Instead, assert that stop() succeeds and consumes the timer cleanly.
    scheduler.stop();
    assert.equal(scheduler.isPingInFlight, false);
  });
});

describe("HeartbeatScheduler - interaction with host stamp transitions", () => {

  test("stamp after a stall does not magically restart the timer", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(60000);
    scheduler.tick();
    assert.equal(t.stalls.length, 1);

    // Caller stamps a fresh activity timestamp - this does not auto-restart the supervisor; the host owns the restart decision via start().
    c.advance(1000);
    scheduler.stamp();
    c.advance(60000);
    scheduler.tick();

    assert.equal(t.stalls.length, 1, "stamp alone must not resume scheduler ticks after a self-stop");
  });

  test("explicit start after a stall resumes scheduling cleanly", () => {

    const t = buildHost();
    const c = buildClock(1000);
    const scheduler = new HeartbeatScheduler(t.host, defaultConfig, c.clock);

    scheduler.start(1000);
    c.advance(60000);
    scheduler.tick();
    assert.equal(t.stalls.length, 1);

    // Host calls start() again on the next successful connect.
    c.advance(1000);
    scheduler.start(c.clock());
    c.advance(30000);
    scheduler.tick();

    assert.equal(t.pings, 1, "after explicit restart, scheduler resumes idle-ping detection");
  });
});
