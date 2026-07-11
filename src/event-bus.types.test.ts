/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * event-bus.types.test.ts: Type-level tests for the generic EventBus<EventMap> subscription API.
 */
import { describe, test } from "node:test";
import { EventBus } from "./event-bus.ts";
import assert from "node:assert/strict";

interface DemoEvents {

  greet: { name: string };
  count: number;
}

describe("EventBus<EventMap> subscription typing", () => {

  test("on() narrows the handler payload to the event's value type", () => {

    const bus = new EventBus<DemoEvents>();

    bus.on("greet", (payload): void => {

      // payload is { name: string }; the handler must access .name without coercion.
      const _name: string = payload.name;

      void _name;
    });

    bus.on("count", (payload): void => {

      // payload is number; the handler can use it as a number directly.
      const _doubled: number = payload * 2;

      void _doubled;
    });

    bus[Symbol.dispose]();
    assert.ok(true);
  });

  test("emit() rejects mismatched payload shapes at compile time", () => {

    const bus = new EventBus<DemoEvents>();

    bus.emit("greet", { name: "ok" });
    bus.emit("count", 42);

    // @ts-expect-error -- "greet" expects { name: string }, not a number.
    bus.emit("greet", 42);

    // @ts-expect-error -- "count" expects number, not an object.
    bus.emit("count", { name: "x" });

    // @ts-expect-error -- unknown event name not in EventMap.
    bus.emit("unknown", undefined);

    bus[Symbol.dispose]();
  });

  test("stream() yields the correct payload type", async () => {

    const bus = new EventBus<DemoEvents>();
    const ac = new AbortController();
    const iterator = bus.stream("count", { signal: ac.signal })[Symbol.asyncIterator]();

    bus.emit("count", 7);

    const { value } = await iterator.next();
    const _typed: number = value;

    assert.equal(_typed, 7);
    ac.abort();

    // Drain the iterator's pending pull after the abort so the test exits cleanly. The rejection is the abort propagating, not a contract under test, and an
    // undrained pull would surface as an unhandled-rejection warning in the runner.
    try {

      await iterator.next();
    } catch { /* expected abort rejection */ }

    bus[Symbol.dispose]();
  });

  test("on() rejects unknown event names at compile time", () => {

    const bus = new EventBus<DemoEvents>();

    // @ts-expect-error -- "unknown" is not a key in DemoEvents.
    bus.on("unknown", (): void => { /* discard */ });

    bus[Symbol.dispose]();
  });
});
