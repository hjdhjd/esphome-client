/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * log-subscription-manager.test.ts: Unit tests for the LogSubscriptionManager.
 */
import type { ClientEventsMap, LogEventData } from "./esphome-client.ts";
import { decodeProtobuf, extractNumberField } from "./protocol/index.ts";
import { describe, test } from "node:test";
import type { Buffer } from "node:buffer";
import type { EspHomeLogging } from "./types.ts";
import { EventBus } from "./event-bus.ts";
import { LogLevel } from "./api-constants.ts";
import { LogSubscriptionManager } from "./log-subscription-manager.ts";
import type { LogSubscriptionManagerHost } from "./log-subscription-manager.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { StreamOptions } from "./event-bus.ts";
import assert from "node:assert/strict";

// Build a logger that records every message at every level. Tests assert against the captured arrays directly so the diagnostic debug lines emitted by the manager
// are inspectable as side effects.
type RecordingLogger = EspHomeLogging & { debugged: string[]; errored: string[]; infoed: string[]; warned: string[] };

const recordingLogger = (): RecordingLogger => {

  const debugged: string[] = [];
  const errored: string[] = [];
  const infoed: string[] = [];
  const warned: string[] = [];

  return {

    debug: (msg: string): void => { debugged.push(msg); },
    debugged,
    error: (msg: string): void => { errored.push(msg); },
    errored,
    info: (msg: string): void => { infoed.push(msg); },
    infoed,
    warn: (msg: string): void => { warned.push(msg); },
    warned
  };
};

// Captured outbound frame shape - the manager's host seam send hook records every wire frame here so tests can assert on the wire-protocol contract directly.
interface CapturedFrame {

  payload: Buffer;
  type: number;
}

interface Harness {

  bus: EventBus<ClientEventsMap>;
  log: RecordingLogger;
  manager: LogSubscriptionManager;
  outbound: CapturedFrame[];
}

// Construct a manager plus its bus, recording logger, and outbound-frame buffer in one call. Returns all four so tests can assert against any of them.
const buildHarness = (): Harness => {

  const bus = new EventBus<ClientEventsMap>();
  const log = recordingLogger();
  const outbound: CapturedFrame[] = [];
  const host: LogSubscriptionManagerHost = {

    bus,
    log,
    send: (type: number, payload: Buffer): void => { outbound.push({ payload, type }); }
  };
  const manager = new LogSubscriptionManager(host);

  return { bus, log, manager, outbound };
};

// Decode a captured `SUBSCRIBE_LOGS_REQUEST` payload back into its fields. Tests use this to verify the wire-protocol contract end-to-end (level field 1, dump_config
// field 2) rather than asserting on opaque buffer bytes.
const decodeSubscribeLogsFrame = (frame: CapturedFrame): { dumpConfig: boolean; level: LogLevel } => {

  assert.equal(frame.type, MessageType.SUBSCRIBE_LOGS_REQUEST);
  const fields = decodeProtobuf(frame.payload, { maxFieldsPerMessage: 16, warn: (): void => { /* ignore */ } });
  const level = extractNumberField(fields, 1) ?? 0;
  const dumpConfigRaw = extractNumberField(fields, 2) ?? 0;

  return { dumpConfig: dumpConfigRaw === 1, level: level as LogLevel };
};

// Open a `subscribe()` async-iterable. Async generators only execute their `finally` block when their body is parked at a yield point - calling `.return()` while the
// body is parked at an `await` of an inner iterator does not propagate to the inner iterator's `.return()` (an open V8 limitation), so the standard cleanup paths in
// the production code are: consumer breaks the for-await, consumer signal aborts, or the EventBus disposes. The helper threads its own AbortController through the
// stream options so disposal-only tests can trigger the abort path without emitting events.
//
// - `next()` advances the iterator (the first call also primes the generator). Use in tests that consume events.
// - `closeAfterPrime()` primes the generator and then aborts the internal signal, which propagates through the BackpressureStream's signal listener and resolves the
//   parked inner `.next()` with a rejection. The wrapper's for-await catches the rejection, runs the `finally` block, and the iterator settles. Use in tests that only
//   verify refcount / wire-send behavior on the disposal path.
// - `close()` calls `.return()` on an already-started iterator. Use in tests that already advanced the iterator with `next()` to a yield point.
interface OpenedIterator {

  close: () => Promise<void>;
  closeAfterPrime: () => Promise<void>;
  iter: AsyncIterator<LogEventData>;
  next: () => Promise<IteratorResult<LogEventData>>;
}

const openIterator = (manager: LogSubscriptionManager, level: LogLevel, options?: StreamOptions): OpenedIterator => {

  const ac = new AbortController();
  // Compose the test's internal abort signal with any caller-supplied signal so both paths still work; AbortSignal.any forwards the first abort that fires.
  const signal = options?.signal ? AbortSignal.any([ ac.signal, options.signal ]) : ac.signal;
  const resolvedOptions: StreamOptions = { ...options, signal };
  const iterable = manager.subscribe(level, resolvedOptions);
  const iter = iterable[Symbol.asyncIterator]();

  return {

    close: async (): Promise<void> => {

      try {

        await iter.return!();

      } catch {

        /* swallow: normal close path can race with abort */
      }
    },
    closeAfterPrime: async (): Promise<void> => {

      const primer = iter.next();

      // Yield once so the generator body enters the for-await and the BackpressureStream listener is attached to the abort signal.
      await Promise.resolve();
      ac.abort();

      try {

        await primer;

      } catch {

        /* signal abort surfaces as a rejection on the parked .next(); swallow because the cleanup path is the assertion target. */
      }
    },
    iter,
    next: async (): Promise<IteratorResult<LogEventData>> => iter.next()
  };
};

const sampleEvent = (level: LogLevel, message = "test message"): LogEventData => ({ level, message });

describe("LogSubscriptionManager - construction", () => {

  test("a freshly constructed manager reports no active level and zero subscribers", () => {

    const { manager } = buildHarness();

    assert.equal(manager.activeLevel, null);
    assert.equal(manager.subscriberCount, 0);
  });

  test("the host seam is the only constructor parameter", () => {

    const bus = new EventBus<ClientEventsMap>();
    const log = recordingLogger();
    const sent: CapturedFrame[] = [];
    const manager = new LogSubscriptionManager({ bus, log, send: (type, payload): void => { sent.push({ payload, type }); } });

    assert.equal(manager.subscriberCount, 0);
    assert.equal(log.debugged.length, 0);
    assert.equal(sent.length, 0);
  });

  test("construction does not invoke any logger method or send any wire frame", () => {

    const { log, outbound } = buildHarness();

    assert.equal(log.debugged.length, 0);
    assert.equal(log.errored.length, 0);
    assert.equal(log.infoed.length, 0);
    assert.equal(log.warned.length, 0);
    assert.equal(outbound.length, 0);
  });
});

describe("LogSubscriptionManager - requestDeviceLevel (imperative pin)", () => {

  test("sends a SUBSCRIBE_LOGS_REQUEST at the requested level with dump_config=false by default", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    const frame = outbound[0];

    assert.ok(frame);
    const decoded = decodeSubscribeLogsFrame(frame);

    assert.equal(decoded.level, LogLevel.INFO);
    assert.equal(decoded.dumpConfig, false);
  });

  test("requestDeviceLevel(INFO) with no iterators sends SUBSCRIBE at INFO and reports activeLevel INFO", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    assert.equal(decodeSubscribeLogsFrame(outbound[0]!).level, LogLevel.INFO);
    assert.equal(manager.activeLevel, LogLevel.INFO);
    // The imperative pin is an internal subscriber, not a consumer iterator, so it does not count toward subscriberCount.
    assert.equal(manager.subscriberCount, 0);
  });

  test("updates the cached activeLevel after a successful send", () => {

    const { manager } = buildHarness();

    assert.equal(manager.activeLevel, null);
    manager.requestDeviceLevel(LogLevel.WARN);
    assert.equal(manager.activeLevel, LogLevel.WARN);
    manager.requestDeviceLevel(LogLevel.ERROR);
    assert.equal(manager.activeLevel, LogLevel.ERROR);
  });

  test("emits a debug log line naming the level and the dump_config flag for the dump send", () => {

    const { log, manager } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO, true);

    // The pin update fires one onChange-driven send (dump config false) and the independent one-shot dump fires a second send (dump config true); both log a debug line.
    assert.ok(log.debugged.length >= 1);
    const dumpLine = log.debugged.find((line) => line.includes("dump config: true"));

    assert.ok(dumpLine);
    assert.match(dumpLine, /Subscribing to logs at level: INFO/);
  });

  test("supports every level in the LogLevel enumeration (boundary values)", () => {

    const { manager, outbound } = buildHarness();

    for(const level of Object.values(LogLevel)) {

      manager.requestDeviceLevel(level);
    }

    assert.equal(outbound.length, Object.values(LogLevel).length);

    for(const [ index, frame ] of outbound.entries()) {

      const decoded = decodeSubscribeLogsFrame(frame);
      const expected = Object.values(LogLevel)[index];

      assert.equal(decoded.level, expected);
    }
  });

  test("repeated calls at the same level send exactly ONE wire frame (retainOnEmpty keeps the re-pin wire-silent)", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);
    manager.requestDeviceLevel(LogLevel.INFO);
    manager.requestDeviceLevel(LogLevel.INFO);

    // The first call sends INFO. Each subsequent call releases the prior pin and re-acquires at the same level, but retainOnEmpty: true keeps the cache at INFO through
    // the intermediate empty transition, so the re-acquire reduces to the already-cached INFO and is suppressed. Re-pinning the level the device already has is silent.
    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.INFO);
  });
});

describe("LogSubscriptionManager - the imperative pin is a floor over subscriber levels", () => {

  test("an iterator below the pin does NOT downgrade the device-side level", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.VERBOSE);

    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);

    // A logs(INFO)-equivalent iterator below the pin does not lower the aggregate; the device stays at the pin's VERBOSE max and no wire frame fires.
    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1, "an iterator below the pin must not downgrade the device");
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
    assert.equal(manager.subscriberCount, 1);
  });

  test("requestDeviceLevel below the current aggregate is wire-silent (the pin floors at the max, never a transient downgrade)", () => {

    const { manager, outbound } = buildHarness();

    // A high iterator holds the aggregate at VERBOSE.
    manager.subscribe(LogLevel.VERBOSE);

    assert.equal(outbound.length, 1);
    assert.equal(decodeSubscribeLogsFrame(outbound[0]!).level, LogLevel.VERBOSE);

    // Pinning below the aggregate adds a floor that does not exceed the max, so no wire send and the device stays at VERBOSE.
    manager.requestDeviceLevel(LogLevel.INFO);

    assert.equal(outbound.length, 1, "a pin below the aggregate must not downgrade the device");
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
  });

  test("the pin raises the device-side level when it exceeds the current aggregate", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.INFO);

    // Pinning above the aggregate raises the device level via a follow-up SUBSCRIBE_LOGS_REQUEST(VERBOSE).
    manager.requestDeviceLevel(LogLevel.VERBOSE);

    assert.equal(outbound.length, 2);
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.VERBOSE);
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
  });

  test("re-pinning to a lower level above the surviving iterator downgrades to the new aggregate", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.VERBOSE);
    manager.subscribe(LogLevel.INFO);

    // Pin VERBOSE held the aggregate; the INFO iterator was silent below it. Outbound holds only the VERBOSE send.
    assert.equal(outbound.length, 1);

    // Re-pin to WARN. The pin floor is now WARN; the surviving INFO iterator is the new max, so the device downgrades to INFO via exactly one wire frame.
    manager.requestDeviceLevel(LogLevel.WARN);

    assert.equal(outbound.length, 2);
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.INFO);
    assert.equal(manager.activeLevel, LogLevel.INFO);
  });
});

describe("LogSubscriptionManager - the imperative pin survives reconnect", () => {

  test("requestDeviceLevel(INFO) re-sends SUBSCRIBE at INFO after clearConnectionState + reissueOnReconnect with no open iterator", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.INFO);

    // Simulate the reconnect cycle. The cache is invalidated, then the surviving pin replays SUBSCRIBE_LOGS_REQUEST(INFO): the imperative level re-arms after
    // reconnect because it is a first-class subscriber in the ledger, even with no open consumer iterator.
    manager.clearConnectionState();

    assert.equal(manager.activeLevel, null);

    manager.reissueOnReconnect();

    assert.equal(outbound.length, 2, "the imperative pin must re-send after reconnect with no open iterator");
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.INFO);
    assert.equal(manager.activeLevel, LogLevel.INFO);
  });

  test("the pin and an iterator both survive reconnect; the aggregate max is replayed", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);
    manager.subscribe(LogLevel.VERBOSE);

    // Pin INFO sent first; the VERBOSE iterator upgraded the aggregate to VERBOSE.
    assert.equal(outbound.length, 2);
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);

    manager.clearConnectionState();
    manager.reissueOnReconnect();

    // The reconnect replays the aggregate max over both surviving subscribers: VERBOSE.
    assert.equal(outbound.length, 3);
    assert.equal(decodeSubscribeLogsFrame(outbound[2]!).level, LogLevel.VERBOSE);
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
  });
});

describe("LogSubscriptionManager - dumpConfig is an independent one-shot side-channel", () => {

  test("requestDeviceLevel(INFO, true) fires a frame with the dump bit set at the authoritative level", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO, true);

    // The pin update sends one frame (dump bit clear); the independent dump sends a distinct frame with the dump bit set.
    const dumpFrame = outbound.map(decodeSubscribeLogsFrame).find((decoded) => decoded.dumpConfig);

    assert.ok(dumpFrame);
    assert.equal(dumpFrame.level, LogLevel.INFO);
  });

  test("the dump rides the authoritative level so it never downgrades the device below what iterators need", () => {

    const { manager, outbound } = buildHarness();

    // A VERBOSE iterator holds the aggregate. A dumpConfig pin at INFO must not drop the device to INFO; the dump frame must carry the authoritative VERBOSE level.
    manager.subscribe(LogLevel.VERBOSE);
    manager.requestDeviceLevel(LogLevel.INFO, true);

    const dumpFrame = outbound.map(decodeSubscribeLogsFrame).find((decoded) => decoded.dumpConfig);

    assert.ok(dumpFrame);
    assert.equal(dumpFrame.level, LogLevel.VERBOSE);
    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
  });

  test("a subsequent reissueOnReconnect re-arms the pin level but does NOT re-fire the dump bit (the one-shot does not survive reconnect)", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO, true);

    // Before reconnect: a non-dump pin send and a dump-bit send.
    assert.ok(outbound.some((frame) => decodeSubscribeLogsFrame(frame).dumpConfig));

    manager.clearConnectionState();
    manager.reissueOnReconnect();

    const lastFrame = outbound.at(-1);

    assert.ok(lastFrame);
    const decoded = decodeSubscribeLogsFrame(lastFrame);

    // The reconnect replay re-arms INFO but the dump bit is gone - it is a one-shot side-channel, not stored subscription state.
    assert.equal(decoded.level, LogLevel.INFO);
    assert.equal(decoded.dumpConfig, false);
  });

  test("dumpConfig=true does not influence the cached activeLevel beyond the pin level", () => {

    const { manager } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO, true);
    manager.requestDeviceLevel(LogLevel.WARN, false);

    assert.equal(manager.activeLevel, LogLevel.WARN);
  });
});

describe("LogSubscriptionManager - subscriberCount excludes the imperative pin", () => {

  test("a pin alone reads zero iterators", () => {

    const { manager } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);

    assert.equal(manager.subscriberCount, 0);
  });

  test("a pin plus one iterator reads one iterator", () => {

    const { manager } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO);
    manager.subscribe(LogLevel.DEBUG);

    assert.equal(manager.subscriberCount, 1);
  });

  test("two iterators with no pin read two iterators", () => {

    const { manager } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.DEBUG);

    assert.equal(manager.subscriberCount, 2);
  });
});

describe("LogSubscriptionManager - subscribe: aggregate level computation", () => {

  test("first iterator at INFO sends one SUBSCRIBE_LOGS_REQUEST(INFO)", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    const frame = outbound[0];

    assert.ok(frame);
    assert.equal(decodeSubscribeLogsFrame(frame).level, LogLevel.INFO);
    assert.equal(manager.activeLevel, LogLevel.INFO);
    assert.equal(manager.subscriberCount, 1);
  });

  test("second iterator at the SAME level sends NO additional wire frame (don't double-send rule)", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.INFO);
    assert.equal(manager.subscriberCount, 2);
  });

  test("second iterator at a LOWER level sends NO additional wire frame (don't double-send rule)", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.DEBUG);
    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);
    assert.equal(decodeSubscribeLogsFrame(outbound[0]!).level, LogLevel.DEBUG);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);
    assert.equal(manager.subscriberCount, 2);
  });

  test("second iterator at a HIGHER level upgrades the device-side subscription via a follow-up wire frame", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.DEBUG);

    assert.equal(outbound.length, 2);
    assert.equal(decodeSubscribeLogsFrame(outbound[0]!).level, LogLevel.INFO);
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.DEBUG);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);
  });

  test("aggregate level computes Math.max across many concurrent iterators", () => {

    const { manager } = buildHarness();

    manager.subscribe(LogLevel.WARN);
    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.VERBOSE);
    manager.subscribe(LogLevel.DEBUG);

    assert.equal(manager.activeLevel, LogLevel.VERBOSE);
    assert.equal(manager.subscriberCount, 4);
  });

  test("subscribing at NONE (level 0) is a registered subscriber but does not push the aggregate above the current max", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.WARN);
    manager.subscribe(LogLevel.NONE);

    assert.equal(outbound.length, 1);
    assert.equal(manager.activeLevel, LogLevel.WARN);
    assert.equal(manager.subscriberCount, 2);
  });
});

describe("LogSubscriptionManager - subscribe: dispose / downgrade semantics", () => {

  test("disposing a non-max iterator does NOT send a wire frame (don't double-send rule)", async () => {

    const { manager, outbound } = buildHarness();
    const lowIter = openIterator(manager, LogLevel.INFO);

    manager.subscribe(LogLevel.DEBUG);

    // Both subscribers active; outbound has the INFO + DEBUG sends.
    assert.equal(outbound.length, 2);

    // Dispose the lower-level iterator. The aggregate stays at DEBUG (the higher iterator still holds it), so no wire frame.
    await lowIter.closeAfterPrime();

    assert.equal(outbound.length, 2, "no follow-up wire send when a non-max iterator disposes");
    assert.equal(manager.activeLevel, LogLevel.DEBUG);
    assert.equal(manager.subscriberCount, 1);
  });

  test("disposing the max iterator downgrades the device-side subscription via a follow-up wire frame", async () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    const highIter = openIterator(manager, LogLevel.DEBUG);

    assert.equal(outbound.length, 2);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);

    await highIter.closeAfterPrime();

    assert.equal(outbound.length, 3);
    assert.equal(decodeSubscribeLogsFrame(outbound[2]!).level, LogLevel.INFO);
    assert.equal(manager.activeLevel, LogLevel.INFO);
    assert.equal(manager.subscriberCount, 1);
  });

  test("disposing the last iterator does NOT send an unsubscribe (ESPHome protocol has no unsubscribe message)", async () => {

    const { manager, outbound } = buildHarness();
    const onlyIter = openIterator(manager, LogLevel.INFO);

    assert.equal(outbound.length, 1);

    await onlyIter.closeAfterPrime();

    assert.equal(outbound.length, 1, "no follow-up wire send when the last iterator disposes - device keeps firing until the connection drops");
    assert.equal(manager.subscriberCount, 0);
    // The cached level PERSISTS at INFO because the subscription is built with retainOnEmpty: true: ESPHome has no unsubscribe-logs frame, so the device is still firing
    // at INFO and the cache (and thus activeLevel) must keep reporting it until the connection drops.
    assert.equal(manager.activeLevel, LogLevel.INFO);
  });

  test("re-subscribing at the same level after all iterators left is wire-SILENT (no redundant SUBSCRIBE_LOGS_REQUEST)", async () => {

    const { manager, outbound } = buildHarness();
    const first = openIterator(manager, LogLevel.INFO);

    // First iterator sends one INFO frame and disposes; retainOnEmpty keeps the device-side level cached at INFO across the idle gap.
    assert.equal(outbound.length, 1);

    await first.closeAfterPrime();

    assert.equal(manager.subscriberCount, 0);
    assert.equal(manager.activeLevel, LogLevel.INFO);

    // A fresh iterator at the SAME level after the set emptied must NOT re-send: the device is still firing at INFO, so the retained cache suppresses a redundant frame.
    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1, "a same-level re-subscribe after all iterators left must be wire-silent - the device is still at INFO");
    assert.equal(manager.activeLevel, LogLevel.INFO);
    assert.equal(manager.subscriberCount, 1);
  });

  test("disposing one of two iterators at the same level does NOT send a wire frame", async () => {

    const { manager, outbound } = buildHarness();
    const a = openIterator(manager, LogLevel.INFO);

    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);

    await a.closeAfterPrime();

    assert.equal(outbound.length, 1);
    assert.equal(manager.subscriberCount, 1);
    assert.equal(manager.activeLevel, LogLevel.INFO);
  });

  test("re-disposing an already-disposed iterator does not double-decrement (defensive against the Disposable contract)", async () => {

    const { manager, outbound } = buildHarness();
    const iter = openIterator(manager, LogLevel.INFO);

    await iter.closeAfterPrime();
    await iter.close();

    assert.equal(manager.subscriberCount, 0);
    // Two return()s on the same iterator must not produce a phantom downgrade frame.
    assert.equal(outbound.length, 1);
  });

  test("subscribe / dispose / subscribe sequence does not leak refcount state", async () => {

    const { manager } = buildHarness();
    const a = openIterator(manager, LogLevel.INFO);

    await a.closeAfterPrime();

    assert.equal(manager.subscriberCount, 0);

    manager.subscribe(LogLevel.DEBUG);

    assert.equal(manager.subscriberCount, 1);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);
  });
});

describe("LogSubscriptionManager - subscribe yields events to consumers", () => {

  test("subscribe yields LogEventData when the bus emits a 'log' event below the iterator's level", async () => {

    const { bus, manager } = buildHarness();
    const iter = openIterator(manager, LogLevel.INFO);
    const eventToEmit = sampleEvent(LogLevel.WARN, "warning text");

    // The first .next() primes the generator so the BackpressureStream's listener is attached BEFORE the emit fires.
    const pending = iter.next();

    bus.emit("log", eventToEmit);

    const result = await pending;

    assert.equal(result.done, false);
    assert.deepEqual(result.value, eventToEmit);

    await iter.close();
  });

  test("subscribe filters out events more verbose than the iterator's level (per-iterator filter)", async () => {

    const { bus, manager } = buildHarness();
    const iter = openIterator(manager, LogLevel.INFO);
    // Prime so the listener is attached before any emit.
    const pending = iter.next();

    // INFO subscriber must not see DEBUG even when the bus emits one.
    bus.emit("log", sampleEvent(LogLevel.DEBUG, "debug text"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "warning text"));

    const result = await pending;

    assert.equal(result.done, false);
    assert.equal(result.value.level, LogLevel.WARN);
    assert.equal(result.value.message, "warning text");

    await iter.close();
  });

  test("multiple iterators at different levels each see only the events their filter permits", async () => {

    const { bus, manager } = buildHarness();
    const infoIter = openIterator(manager, LogLevel.INFO);
    const debugIter = openIterator(manager, LogLevel.DEBUG);

    // Prime both iterators so their listeners are attached before any emit.
    const infoPending = infoIter.next();
    const debugPending = debugIter.next();

    bus.emit("log", sampleEvent(LogLevel.WARN, "warn-1"));
    bus.emit("log", sampleEvent(LogLevel.DEBUG, "debug-1"));

    const infoResult = await infoPending;

    // INFO iterator's first yielded event must be the WARN; the DEBUG event was filtered out by the per-iterator filter.
    assert.equal(infoResult.value!.level, LogLevel.WARN);

    const debugResult1 = await debugPending;

    // DEBUG iterator's first yielded event is also the WARN (DEBUG iterator accepts both WARN and DEBUG; WARN was emitted first).
    assert.equal(debugResult1.value!.level, LogLevel.WARN);

    const debugResult2 = await debugIter.next();

    assert.equal(debugResult2.value!.level, LogLevel.DEBUG);

    await infoIter.close();
    await debugIter.close();
  });

  test("subscribe terminates cleanly when the consumer breaks out of the for-await loop", async () => {

    const { bus, manager } = buildHarness();
    const events: LogEventData[] = [];

    const consumer = (async (): Promise<void> => {

      for await (const event of manager.subscribe(LogLevel.INFO)) {

        events.push(event);

        if(events.length >= 2) {

          break;
        }
      }
    })();

    bus.emit("log", sampleEvent(LogLevel.WARN, "first"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "second"));

    await consumer;

    assert.equal(events.length, 2);
    assert.equal(manager.subscriberCount, 0, "break must run the iterator's finally cleanup");
  });

  test("subscribe terminates when the consumer's signal aborts (pre-aborted)", async () => {

    const { manager } = buildHarness();
    const aborted = new AbortController();

    aborted.abort();

    const iter = manager.subscribe(LogLevel.INFO, { signal: aborted.signal })[Symbol.asyncIterator]();

    await assert.rejects(async (): Promise<void> => { await iter.next(); });
    assert.equal(manager.subscriberCount, 0);
  });

  test("subscribe terminates when the consumer's signal aborts mid-iteration", async () => {

    const { bus, manager } = buildHarness();
    const ac = new AbortController();
    const iter = manager.subscribe(LogLevel.INFO, { signal: ac.signal })[Symbol.asyncIterator]();
    // Prime so the listener is attached before any emit.
    const pending = iter.next();

    bus.emit("log", sampleEvent(LogLevel.WARN, "before-abort"));

    const first = await pending;

    assert.equal(first.value!.message, "before-abort");

    ac.abort();

    await assert.rejects(async (): Promise<void> => { await iter.next(); });
    assert.equal(manager.subscriberCount, 0);
  });

  test("subscribe respects backpressure StreamOptions and forwards them to the underlying bus.stream()", async () => {

    const { bus, manager } = buildHarness();
    // Open with a small high-water mark and dropOldest policy; emit more events than the buffer holds before consuming.
    const iter = manager.subscribe(LogLevel.INFO, { backpressure: "dropOldest", highWaterMark: 2 })[Symbol.asyncIterator]();
    // Prime to attach the listener; the first .next() will resolve with the first preserved event.
    const pending = iter.next();

    bus.emit("log", sampleEvent(LogLevel.WARN, "1"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "2"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "3"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "4"));

    const r1 = await pending;
    const r2 = await iter.next();

    // The pending .next() resolves with the first event delivered; dropOldest may drop earlier ones depending on internal queue ordering, so we assert that one of the
    // expected later messages came through and the second .next() yields a strictly later message.
    assert.ok([ "1", "2", "3", "4" ].includes(r1.value!.message as string));
    assert.ok([ "2", "3", "4" ].includes(r2.value!.message as string));
    assert.notEqual(r2.value!.message, r1.value!.message);

    await iter.return!();
  });
});

describe("LogSubscriptionManager - reissueOnReconnect", () => {

  test("with no active subscribers, reissueOnReconnect does NOT send a wire frame", () => {

    const { manager, outbound } = buildHarness();

    manager.reissueOnReconnect();

    assert.equal(outbound.length, 0);
    assert.equal(manager.activeLevel, null);
  });

  test("with active subscribers, reissueOnReconnect re-sends the aggregate level on the new connection", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.DEBUG);

    assert.equal(outbound.length, 1);

    // Simulate the reconnect cycle. The cache is invalidated, then the surviving subscriber replays SUBSCRIBE_LOGS_REQUEST(DEBUG) again.
    manager.reissueOnReconnect();

    assert.equal(outbound.length, 2);
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.DEBUG);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);
  });

  test("reissueOnReconnect uses the recomputed aggregate, not the previously-cached level", async () => {

    const { manager, outbound } = buildHarness();

    // Subscribe at INFO and DEBUG, then dispose DEBUG mid-flight (still no reconnect). Aggregate should now be INFO.
    manager.subscribe(LogLevel.INFO);
    const debugIter = openIterator(manager, LogLevel.DEBUG);

    await debugIter.closeAfterPrime();

    assert.equal(manager.activeLevel, LogLevel.INFO);

    manager.reissueOnReconnect();

    const lastFrame = outbound.at(-1);

    assert.ok(lastFrame);
    assert.equal(decodeSubscribeLogsFrame(lastFrame).level, LogLevel.INFO);
  });

  test("reissueOnReconnect followed by an iterator dispose at the same level does not produce a phantom downgrade", async () => {

    const { manager, outbound } = buildHarness();
    const iter = openIterator(manager, LogLevel.INFO);

    manager.reissueOnReconnect();

    const framesBeforeDispose = outbound.length;

    await iter.closeAfterPrime();

    // Last iterator disposed; aggregate is now empty; the EMPTY transition is a no-op (no unsubscribe in protocol).
    assert.equal(outbound.length, framesBeforeDispose);
    assert.equal(manager.subscriberCount, 0);
  });
});

describe("LogSubscriptionManager - clearConnectionState", () => {

  test("invalidates the cached activeLevel without touching the subscriber set", () => {

    const { manager } = buildHarness();

    manager.subscribe(LogLevel.WARN);
    assert.equal(manager.activeLevel, LogLevel.WARN);
    assert.equal(manager.subscriberCount, 1);

    manager.clearConnectionState();

    assert.equal(manager.activeLevel, null);
    // Per-iterator subscribers SURVIVE a connection-state clear: subscription-continuity contract.
    assert.equal(manager.subscriberCount, 1);
  });

  test("a subsequent reissueOnReconnect re-sends the SUBSCRIBE_LOGS_REQUEST because the cache was invalidated", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);

    manager.clearConnectionState();
    manager.reissueOnReconnect();

    assert.equal(outbound.length, 2);
    assert.equal(decodeSubscribeLogsFrame(outbound[1]!).level, LogLevel.INFO);
  });

  test("clearConnectionState is safe to call more than once on a fresh manager", () => {

    const { manager } = buildHarness();

    manager.clearConnectionState();
    manager.clearConnectionState();

    assert.equal(manager.activeLevel, null);
    assert.equal(manager.subscriberCount, 0);
  });

  test("clearConnectionState does not send a wire frame on its own", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);

    const before = outbound.length;

    manager.clearConnectionState();

    assert.equal(outbound.length, before);
  });
});

describe("LogSubscriptionManager - dispatch", () => {

  test("dispatches a LogEventData to every subscribed bus.on listener", () => {

    const { bus, manager } = buildHarness();
    const seen: LogEventData[] = [];

    using sub = bus.on("log", (event): void => { seen.push(event); });

    void sub;
    const event = sampleEvent(LogLevel.INFO, "hello world");

    manager.dispatch(event);

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], event);
  });

  test("dispatch fans out to every active subscribe() iterator", async () => {

    const { manager } = buildHarness();
    const a = openIterator(manager, LogLevel.INFO);
    const b = openIterator(manager, LogLevel.DEBUG);
    // Prime both iterators so their listeners are attached before dispatch fires.
    const ap = a.next();
    const bp = b.next();

    const event = sampleEvent(LogLevel.WARN, "broadcast");

    manager.dispatch(event);

    const ar = await ap;
    const br = await bp;

    assert.deepEqual(ar.value, event);
    assert.deepEqual(br.value, event);

    await a.close();
    await b.close();
  });

  test("dispatch emits a debug-level diagnostic line naming the level and the message", () => {

    const { log, manager } = buildHarness();

    manager.dispatch(sampleEvent(LogLevel.WARN, "hello"));

    assert.equal(log.debugged.length, 1);
    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /ESPHome Log \[WARN\]: hello/);
  });

  test("dispatch with no active subscribers does NOT throw", () => {

    const { manager } = buildHarness();

    assert.doesNotThrow(() => manager.dispatch(sampleEvent(LogLevel.INFO)));
  });

  test("dispatch yields the same event reference to every consumer (no defensive copy)", () => {

    const { bus, manager } = buildHarness();
    const captured: LogEventData[] = [];

    using sub = bus.on("log", (event): void => { captured.push(event); });

    void sub;
    const event = sampleEvent(LogLevel.WARN, "shared");

    manager.dispatch(event);

    assert.equal(captured[0], event);
  });

  test("dispatch handles unknown log levels by emitting a placeholder name in the diagnostic line", () => {

    const { log, manager } = buildHarness();

    // 99 is not in the LogLevel enumeration; logLevelName falls back to "Unknown(99)".
    manager.dispatch({ level: 99 as LogLevel, message: "out-of-range" });

    const line = log.debugged[0];

    assert.ok(line);
    assert.match(line, /Unknown\(99\)/);
  });
});

describe("LogSubscriptionManager - hot path", () => {

  test("dispatching 1000 events across 10 active subscribers stays correct under load", async () => {

    const { bus, manager } = buildHarness();
    const counters = new Array<number>(10).fill(0);

    // Use a high-water mark above the test load so the default backpressure policy never engages; the assertion is correctness under realistic dispatch volume, not
    // backpressure behavior (which has its own dedicated test).
    const consumers = counters.map(async (_, idx) => (async (): Promise<void> => {

      for await (const event of manager.subscribe(LogLevel.VERY_VERBOSE, { highWaterMark: 2048 })) {

        void event;
        counters[idx]!++;

        if(counters[idx]! >= 1000) {

          break;
        }
      }
    })());

    // Yield to the event loop so every consumer's primer .next() attaches its listener before any emit fires.
    await new Promise<void>((resolve) => setImmediate(resolve));

    for(let i = 0; i < 1000; i++) {

      bus.emit("log", sampleEvent(LogLevel.INFO, "msg-" + String(i)));
    }

    await Promise.all(consumers);

    for(const c of counters) {

      assert.equal(c, 1000);
    }

    assert.equal(manager.subscriberCount, 0, "all iterators must have torn down their refcount entries via the for-await break");
  });

  test("rapid subscribe / dispose cycles do not leak refcount state", async () => {

    const { manager, outbound } = buildHarness();

    for(let i = 0; i < 100; i++) {

      const iter = openIterator(manager, LogLevel.INFO);

      await iter.closeAfterPrime();
    }

    assert.equal(manager.subscriberCount, 0);
    // Exactly ONE wire frame fires across all 100 cycles. The first cycle's iterator sends INFO; every subsequent same-level re-acquire is wire-SILENT because
    // retainOnEmpty: true keeps the cache at INFO through each empty gap, so the device is never told something it is already doing. This is the redundant-resubscribe
    // bug the retainOnEmpty option fixes - under the cleared-on-empty default this loop would have re-sent INFO on every single cycle.
    assert.equal(outbound.length, 1);
  });
});

describe("LogSubscriptionManager - boundary values", () => {

  test("subscribe at LogLevel.NONE (lowest) yields nothing because the per-iterator filter rejects everything except NONE-level events", async () => {

    const { bus, manager } = buildHarness();
    const iter = openIterator(manager, LogLevel.NONE);
    // Prime so the listener is attached before any emit.
    const pending = iter.next();

    bus.emit("log", sampleEvent(LogLevel.ERROR, "error"));
    bus.emit("log", sampleEvent(LogLevel.NONE, "should-be-yielded"));

    const result = await pending;

    assert.equal(result.value!.message, "should-be-yielded");

    await iter.close();
  });

  test("subscribe at LogLevel.VERY_VERBOSE yields every event regardless of level", async () => {

    const { bus, manager } = buildHarness();
    const iter = openIterator(manager, LogLevel.VERY_VERBOSE);
    const pending = iter.next();

    bus.emit("log", sampleEvent(LogLevel.ERROR, "error"));
    bus.emit("log", sampleEvent(LogLevel.VERY_VERBOSE, "very-verbose"));

    const r1 = await pending;
    const r2 = await iter.next();

    assert.equal(r1.value!.message, "error");
    assert.equal(r2.value!.message, "very-verbose");

    await iter.close();
  });

  test("zero subscribers, reissueOnReconnect is a no-op", () => {

    const { manager, outbound } = buildHarness();

    manager.reissueOnReconnect();
    manager.reissueOnReconnect();
    manager.reissueOnReconnect();

    assert.equal(outbound.length, 0);
    assert.equal(manager.activeLevel, null);
  });
});

describe("LogSubscriptionManager - negative cases", () => {

  test("subscribing at the SAME level twice produces exactly ONE wire send", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.INFO);
    manager.subscribe(LogLevel.INFO);

    assert.equal(outbound.length, 1);
  });

  test("disposing a subscriber when others remain at the same level does NOT send a wire frame", async () => {

    const { manager, outbound } = buildHarness();
    const a = openIterator(manager, LogLevel.INFO);

    manager.subscribe(LogLevel.INFO);

    const before = outbound.length;

    await a.closeAfterPrime();

    assert.equal(outbound.length, before);
  });

  test("reissueOnReconnect after clearConnectionState with no subscribers does NOT send a wire frame", () => {

    const { manager, outbound } = buildHarness();

    manager.clearConnectionState();
    manager.reissueOnReconnect();

    assert.equal(outbound.length, 0);
  });

  test("emitting a 'log' bus event with no active subscribers does NOT throw", () => {

    const { bus } = buildHarness();

    assert.doesNotThrow(() => bus.emit("log", sampleEvent(LogLevel.INFO)));
  });

  test("reissueOnReconnect with subscribers but identical aggregate still re-sends because the cache was invalidated (negative-of-the-no-double-send)", () => {

    const { manager, outbound } = buildHarness();

    manager.subscribe(LogLevel.WARN);

    const before = outbound.length;

    manager.reissueOnReconnect();

    // The cache was invalidated by reissueOnReconnect, so the recomputed aggregate (WARN) is replayed unconditionally for the live key and a wire frame DOES fire.
    assert.equal(outbound.length, before + 1);
  });

  test("dispatch path does NOT touch the subscriber set or the cached active level", () => {

    const { manager } = buildHarness();

    manager.subscribe(LogLevel.INFO);
    const sizeBefore = manager.subscriberCount;
    const levelBefore = manager.activeLevel;

    manager.dispatch(sampleEvent(LogLevel.INFO, "x"));
    manager.dispatch(sampleEvent(LogLevel.INFO, "y"));

    assert.equal(manager.subscriberCount, sizeBefore);
    assert.equal(manager.activeLevel, levelBefore);
  });
});

describe("LogSubscriptionManager - documented edge cases", () => {

  test("dumpConfig is encoded as field 2 = 1 when true and field 2 = 0 when false", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.INFO, false);
    manager.requestDeviceLevel(LogLevel.INFO, true);

    // The dump-bit-clear frames carry field 2 = 0; the independent one-shot dump frame carries field 2 = 1.
    const decodedFrames = outbound.map(decodeSubscribeLogsFrame);

    assert.ok(decodedFrames.some((decoded) => !decoded.dumpConfig));
    assert.ok(decodedFrames.some((decoded) => decoded.dumpConfig));
  });

  test("the per-iterator filter compares with `<=` so an iterator at INFO sees INFO, WARN, ERROR but not DEBUG", async () => {

    const { bus, manager } = buildHarness();
    const iter = openIterator(manager, LogLevel.INFO);
    // Prime so the listener is attached before any emit.
    const pending = iter.next();

    bus.emit("log", sampleEvent(LogLevel.ERROR, "error"));
    bus.emit("log", sampleEvent(LogLevel.WARN, "warn"));
    bus.emit("log", sampleEvent(LogLevel.INFO, "info"));
    bus.emit("log", sampleEvent(LogLevel.DEBUG, "debug"));

    const r1 = await pending;
    const r2 = await iter.next();
    const r3 = await iter.next();

    assert.deepEqual([ r1.value!.message, r2.value!.message, r3.value!.message ], [ "error", "warn", "info" ]);

    await iter.close();
  });

  test("the imperative pin floors the device at its level even when a lower iterator opens after it (the v1 imperative-overridden bug is fixed)", () => {

    const { manager, outbound } = buildHarness();

    manager.requestDeviceLevel(LogLevel.DEBUG, true);
    assert.equal(manager.activeLevel, LogLevel.DEBUG);

    // A new iterator at INFO opens below the pin. The aggregate stays at DEBUG (the pin floors it), so no downgrade frame fires when a lower iterator opens.
    manager.subscribe(LogLevel.INFO);

    assert.equal(manager.activeLevel, LogLevel.DEBUG);
    assert.ok(!outbound.map(decodeSubscribeLogsFrame).some((decoded) => decoded.level === LogLevel.INFO), "the lower iterator must not downgrade the pinned DEBUG level");
  });
});
