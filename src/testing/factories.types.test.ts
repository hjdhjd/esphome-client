/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * factories.types.test.ts: Type-level tests for the schema-derived override parameters on mockEntity / mockStateMessage.
 */
import { describe, test } from "node:test";
import { mockEntity, mockStateMessage } from "./factories.ts";
import assert from "node:assert/strict";
import { entityId } from "../entity-id.ts";

describe("mockEntity override typing", () => {

  test("rejects a typo'd override key against the entity-type-derived partial", () => {

    // The overrides parameter is `Partial<EntityFor<typeof ENTITY_SCHEMAS["light"]>>`, so a misspelled key (brigthness) is an excess property and fails the
    // object-literal check.
    // @ts-expect-error - "brigthness" is not a known key of the light entity shape, so the excess property fails the object-literal check.
    const ent = mockEntity("light", "lamp", { brigthness: 0.8 });

    void ent;

    assert.equal(typeof mockEntity, "function");
  });

  test("accepts a correctly-spelled override key for the same entity type", () => {

    // The corresponding correct field (deviceId) is on the shape, so this construction has no type error - it confirms the schema-derived partial rejects only
    // the typo, not every override.
    const ent = mockEntity("light", "lamp", { deviceId: 3 });

    assert.equal(ent.deviceId, 3);
  });
});

describe("mockStateMessage fields typing", () => {

  test("rejects a typo'd state field against the entity-type-derived partial", () => {

    const id = entityId("sensor", "temp");

    // The fields parameter is `Partial<StateEventFor<typeof ENTITY_SCHEMAS["sensor"]>>`, so a field that does not exist on the sensor state shape (the sensor state
    // carries `state`, not `value`) is an excess property and fails the object-literal check.
    // @ts-expect-error - "value" is not a known field of the sensor state shape, so the excess property fails the object-literal check.
    const event = mockStateMessage(id, { value: 21.5 });

    void event;

    assert.equal(typeof mockStateMessage, "function");
  });

  test("accepts a correctly-named state field for the same entity type", () => {

    const id = entityId("sensor", "temp");
    const event = mockStateMessage(id, { state: 21.5 });

    assert.equal((event as Record<string, unknown>)["state"], 21.5);
  });
});
