/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-runner.types.test.ts: Type-level tests for the runCommand / runCommandAndAwait brand-narrowing seam.
 */
import { describe, test } from "node:test";
import { runCommand, runCommandAndAwait } from "./command-runner.ts";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { CommandHost } from "./command-runner.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EntityId } from "./entity-id.ts";
import type { EntitySchema } from "./schemas/index.ts";
import type { EspHomeLogging } from "./types.ts";
import { EventBus } from "./event-bus.ts";
import type { Nullable } from "./types.ts";
import type { StateEventFor } from "./schemas/derived.ts";
import assert from "node:assert/strict";
import { entityId } from "./entity-id.ts";

const noopLogger: EspHomeLogging = {

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info:  (): void => { /* discard */ },
  warn:  (): void => { /* discard */ }
};

const stubHost = (): CommandHost => ({

  bus: new EventBus<ClientEventsMap>(),
  deviceIdForKey: (): number | undefined => undefined,
  keyForId: (): Nullable<number> => null,
  log: noopLogger,
  metrics: undefined,
  resolveSchema: (entityType: string): EntitySchema | undefined => (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType],
  send: (): void => { /* discard */ }
});

describe("runCommand<T> - branded-id tag flows through to options", () => {

  test("runCommand accepts a light id with light-shaped options", () => {

    const host = stubHost();
    const lightId: EntityId<"light"> = entityId("light", "kitchen");

    // Light's CommandFor accepts state, brightness, rgb, etc. The narrowing is exercised at compile time; the runtime call is a no-op (no entity registered).
    runCommand(host, lightId, { brightness: 0.5, state: true });

    assert.equal(typeof runCommand, "function");
  });

  test("runCommand rejects a switch id paired with light-shaped options", () => {

    const host = stubHost();
    const switchId: EntityId<"switch"> = entityId("switch", "front_door");

    // The static-type check is the entire purpose of this test - we host the call inside an unused function so the type error fires without producing a runtime call
    // that would log warn-and-drop. Reading `_attempt` keeps it from being unused.
    const _attempt = (): void => {

      // @ts-expect-error - SwitchCommand has no `brightness` field; passing light-shaped options for a switch id is a brand-mismatch compile error.
      runCommand(host, switchId, { brightness: 0.5, state: true });
    };

    void _attempt;
    assert.equal(typeof runCommand, "function");
  });

  test("runCommand rejects a plain unbranded string at the type level", () => {

    const host = stubHost();

    const _attempt = (): void => {

      // @ts-expect-error - runCommand's `id` parameter requires the branded EntityId; a plain string fails the brand constraint.
      runCommand(host, "light-x", { state: true });
    };

    void _attempt;
    assert.equal(typeof runCommand, "function");
  });
});

describe("runCommandAndAwait<T> - type-level constraint on awaitable entity types", () => {

  test("runCommandAndAwait return type narrows to the entity-specific StateEventFor (light)", () => {

    const host = stubHost();
    const lightId: EntityId<"light"> = entityId("light", "kitchen");

    // Static-type-only check: we type-annotate the return value to verify the distributing-return-type narrowing flows through. The function is never invoked, so no
    // runtime promise is created.
    const _typed = async (): Promise<StateEventFor<typeof ENTITY_SCHEMAS["light"]>> => runCommandAndAwait(host, lightId, { state: true });

    void _typed;
    assert.equal(typeof runCommandAndAwait, "function");
  });

  test("runCommandAndAwait return type narrows to the entity-specific StateEventFor (switch)", () => {

    const host = stubHost();
    const switchId: EntityId<"switch"> = entityId("switch", "x");

    const _typed = async (): Promise<StateEventFor<typeof ENTITY_SCHEMAS["switch"]>> => runCommandAndAwait(host, switchId, { state: true });

    void _typed;
    assert.equal(typeof runCommandAndAwait, "function");
  });

  test("runCommandAndAwait rejects a button id (excluded type)", () => {

    const host = stubHost();
    const buttonId: EntityId<"button"> = entityId("button", "x");

    const _attempt = (): unknown => {

      // @ts-expect-error - button is excluded from CommandAndAwaitable (no state response on the wire); calling commandAndAwait against it would hang until timeout.
      return runCommandAndAwait(host, buttonId, {});
    };

    void _attempt;
    assert.equal(typeof runCommandAndAwait, "function");
  });

  test("runCommandAndAwait rejects a sensor id (read-only type)", () => {

    const host = stubHost();
    const sensorId: EntityId<"sensor"> = entityId("sensor", "x");

    const _attempt = (): unknown => {

      // @ts-expect-error - sensor is excluded from CommandAndAwaitable (read-only; no command surface on the wire).
      return runCommandAndAwait(host, sensorId, {});
    };

    void _attempt;
    assert.equal(typeof runCommandAndAwait, "function");
  });

  test("runCommandAndAwait rejects a camera id (no key-bearing state event)", () => {

    const host = stubHost();
    const cameraId: EntityId<"camera"> = entityId("camera", "x");

    const _attempt = (): unknown => {

      // @ts-expect-error - camera is excluded from CommandAndAwaitable; its event shape lacks `key` so the predicate-match loop has nothing to compare against.
      return runCommandAndAwait(host, cameraId, {});
    };

    void _attempt;
    assert.equal(typeof runCommandAndAwait, "function");
  });
});
