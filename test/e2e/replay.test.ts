/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * replay.test.ts: Drives the synthesized basic-discovery and v114-discovery scenarios through the client.
 */

/*
 * Drives the synthesized basic-discovery and v114-discovery scenarios end-to-end through MockTransport + EspHomeClient. The simulator (`test/simulator/`) is the single
 * source of truth for these scenarios; each carries its synthesized inbound bytes, and the host is driven from first byte to steady state with no live device.
 */
import { describe, test } from "node:test";
import { ALL_SCENARIOS } from "../simulator/scenarios/index.ts";
import { MockTransport } from "../../src/testing/mock-transport.ts";
import assert from "node:assert/strict";
import { driveScenario } from "../simulator/simulator.ts";
import { openEspHomeClient } from "../../src/esphome-client.ts";

describe("capture-replay end-to-end", () => {

  // Shared helpers for the scenario-replay tests below: yieldTick yields the event loop so the inbound bytes queued by driveScenario flush before openEspHomeClient
  // runs, and silentLogger discards all log output so the test report stays clean.
  const yieldTick = async (): Promise<void> => { await new Promise<void>((resolve): void => { setImmediate(resolve); }); };
  const silentLogger = { debug: (): void => { /* discard */ }, error: (): void => { /* discard */ }, info: (): void => { /* discard */ }, warn: (): void => { /* discard */ } };

  test("basic-discovery scenario drives the host through connect + initial state", async () => {

    const scenario = ALL_SCENARIOS.find((s) => s.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");
    assert.ok(scenario.inbound.length > 0, "basic-discovery must have synthesized byte fixtures");

    const transport = new MockTransport();

    driveScenario(transport, scenario);

    await yieldTick();

    const client = await openEspHomeClient({

      host: "replay-host",
      keepAlive: false,
      logger: silentLogger,
      psk: null,
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    // After connect, the host must have recorded the device info and discovered the one switch entity from the synthesized fixture.
    assert.ok(client.deviceInfo());
    assert.equal(client.deviceInfo()?.name, "test-device");

    const entities = client.getEntitiesWithIds();

    assert.equal(entities.length, 1);
    assert.equal(entities[0]!.type, "switch");

    // The host emitted HELLO_REQUEST + LIST_ENTITIES_REQUEST + DEVICE_INFO_REQUEST + SUBSCRIBE_STATES_REQUEST.
    const outboundTypes = transport.outboundFrames.map((f) => f.type);

    for(const expected of scenario.expectedOutbound) {

      assert.ok(outboundTypes.includes(expected), "scenario expected outbound type " + String(expected) + " was not observed (got " + outboundTypes.join(",") + ")");
    }

    client[Symbol.dispose]();
  });

  test("v114-discovery scenario derives object_id from name when the server omits it", async () => {

    // ESPHome API 1.14 stopped sending `object_id` on the wire because the value is always derivable from `name`. This scenario synthesizes that exact wire shape:
    // a HelloResponse advertising minor 14, plus a ListEntitiesSwitchResponse with `object_id` (field 1) deliberately absent. The discovery decoder must derive
    // `front_door` from "Front Door" via the upstream sanitize/snake_case algorithm; if `deriveObjectId` or the wire-first-with-fallback path regresses, this
    // assertion catches it.
    const scenario = ALL_SCENARIOS.find((s) => s.name === "v114-discovery");

    assert.ok(scenario, "v114-discovery scenario must be registered");
    assert.ok(scenario.inbound.length > 0, "v114-discovery must have synthesized byte fixtures");

    const transport = new MockTransport();

    driveScenario(transport, scenario);

    await yieldTick();

    const client = await openEspHomeClient({

      host: "replay-host",
      keepAlive: false,
      logger: silentLogger,
      psk: null,
      reconnect: false,
      transportFactory: (): MockTransport => transport
    });

    // Device announced minor 14; capabilities should reflect that the negotiated session is 1.14+.
    assert.equal(client.capabilities().api.minor, 14);
    assert.equal(client.capabilities().clientDerivedObjectId, true);

    const entities = client.getEntitiesWithIds();

    assert.equal(entities.length, 1, "discovery should produce exactly one switch entity from the synthesized fixture");

    const entity = entities[0]!;

    assert.equal(entity.type, "switch");
    assert.equal(entity.name, "Front Door");

    // The decisive assertion: object_id was NOT on the wire; the decoder must have derived it from `name`. "Front Door" -> "front_door".
    assert.equal(entity.objectId, "front_door", "object_id must be derived client-side when the server omits it (ESPHome 1.14+ shape)");

    // The branded entity id mints from the derived object_id; consumers can look up the entity by the canonical id.
    assert.ok(client.hasEntity("switch-front_door"));

    client[Symbol.dispose]();
  });
});
