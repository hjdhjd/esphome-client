/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * infrared-rf.types.test.ts: Type-level guarantees for the infrared and radio_frequency entity types.
 *
 * Locks in the schema-derived ClientEventsMap auto-extension, the brand distinction on transmitRawTimings, and the commandAndAwait exclusion list. Every
 * `@ts-expect-error` annotation below MUST fail to compile if removed; `npm run typecheck` (tsc against tsconfig.check.json) enforces this. The annotations live
 * inside helper functions that are never executed - the type checker walks them at compile time but the test runner only confirms the file parses cleanly.
 */
import type { ClientEventsMap, EspHomeClient } from "./esphome-client.ts";
import { describe, test } from "node:test";
import type { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EntityId } from "./entity-id.ts";
import type { StateEventFor } from "./schemas/derived.ts";
import assert from "node:assert/strict";

describe("ClientEventsMap auto-extension via SchemaEvents (slice 2 design payoff)", () => {

  test("ClientEventsMap['infrared'] resolves to StateEventFor<typeof ENTITY_SCHEMAS['infrared']> without a hand-edit", () => {

    // Mutually-assignable pairs prove structural equality - if the auto-extension regressed, either binding would surface a typecheck error.
    const l: ClientEventsMap["infrared"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["infrared"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["infrared"]> = null as unknown as ClientEventsMap["infrared"];

    void l;
    void r;
    assert.ok(true);
  });

  test("ClientEventsMap['radio_frequency'] resolves to StateEventFor<typeof ENTITY_SCHEMAS['radio_frequency']> without a hand-edit", () => {

    const l: ClientEventsMap["radio_frequency"] = null as unknown as StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]>;
    const r: StateEventFor<typeof ENTITY_SCHEMAS["radio_frequency"]> = null as unknown as ClientEventsMap["radio_frequency"];

    void l;
    void r;
    assert.ok(true);
  });
});

describe("EspHomeClient.transmitRawTimings brand distinction", () => {

  // The bodies of the helper functions below are walked at compile time but never invoked at runtime. The pattern mirrors src/entity-id.types.test.ts: hosting the
  // type-rejection annotations inside an unreferenced function lets the typechecker validate them without producing runtime side effects.

  test("rejects entity ids whose brand is not infrared or radio_frequency", () => {

    const rejectSwitch = (client: EspHomeClient, id: EntityId<"switch">): void => {

      // @ts-expect-error - EntityId<"switch"> is not assignable to EntityId<"infrared"> | EntityId<"radio_frequency">.
      client.transmitRawTimings(id, { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    const rejectLight = (client: EspHomeClient, id: EntityId<"light">): void => {

      // @ts-expect-error - EntityId<"light"> is not assignable to EntityId<"infrared"> | EntityId<"radio_frequency">.
      client.transmitRawTimings(id, { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    assert.equal(typeof rejectSwitch, "function");
    assert.equal(typeof rejectLight, "function");
  });

  test("accepts an EntityId<\"infrared\"> at the type level", () => {

    // No annotation - this should typecheck cleanly. The function exists only to host the typecheck; running it would touch a null client.
    const acceptInfrared = (client: EspHomeClient, id: EntityId<"infrared">): void => {

      client.transmitRawTimings(id, { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    assert.equal(typeof acceptInfrared, "function");
  });

  test("accepts an EntityId<\"radio_frequency\"> at the type level", () => {

    const acceptRadioFrequency = (client: EspHomeClient, id: EntityId<"radio_frequency">): void => {

      client.transmitRawTimings(id, { carrierFrequency: 433920000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    assert.equal(typeof acceptRadioFrequency, "function");
  });
});

describe("EspHomeClient.commandAndAwait exclusion list", () => {

  test("rejects an EntityId<\"infrared\"> - the receive event is unsolicited, not a command acknowledgement", () => {

    const rejectInfrared = (client: EspHomeClient, id: EntityId<"infrared">): void => {

      // @ts-expect-error - "infrared" is excluded from the commandAndAwait surface; calling it would hang indefinitely waiting for a state event that does not arrive.
      void client.commandAndAwait(id, { carrierFrequency: 38000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    assert.equal(typeof rejectInfrared, "function");
  });

  test("rejects an EntityId<\"radio_frequency\"> - same rationale as infrared", () => {

    const rejectRadioFrequency = (client: EspHomeClient, id: EntityId<"radio_frequency">): void => {

      // @ts-expect-error - "radio_frequency" is excluded from the commandAndAwait surface; calling it would hang indefinitely.
      void client.commandAndAwait(id, { carrierFrequency: 433920000, repeatCount: 1, timings: [ 1, -1 ] });
    };

    assert.equal(typeof rejectRadioFrequency, "function");
  });
});
