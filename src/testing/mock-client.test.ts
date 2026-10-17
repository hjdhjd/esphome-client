/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-client.test.ts: Helper-coverage-parity tests for the MockClient consumer-test double.
 */
import { ConfigurationError, ConnectionError, ConnectionLostError, NotConnectedError } from "../errors.ts";
import { HealthState, isConnectionLive } from "../health.ts";
import { InfraredCapabilityFlags, LogLevel, RadioFrequencyCapabilityFlags, SerialProxyPortType } from "../api-constants.ts";
import { describe, test } from "node:test";
import { mockDeviceInfo, mockEntity, mockHealth, mockStateMessage } from "./factories.ts";
import { Buffer } from "node:buffer";
import { ENTITY_SCHEMAS } from "../schemas/index.ts";
import type { EncodeResult } from "../command-pipeline.ts";
import type { Entity } from "../schemas/index.ts";
import type { EntityId } from "../entity-id.ts";
import type { LifecycleEvent } from "../lifecycle.ts";
import { MOCK } from "./recording-mock.ts";
import { MockClient } from "./mock-client.ts";
import assert from "node:assert/strict";
import { decodeProtobuf } from "../protocol/codec.ts";
import { disconnectedCapabilities } from "../capabilities.ts";
import { entityId } from "../entity-id.ts";

describe("MockClient.populateEntities", () => {

  test("registers entities under their canonical branded id", () => {

    const client = new MockClient();
    const light = mockEntity("light", "kitchen");

    client.populateEntities([light]);

    const id = entityId("light", "kitchen");

    assert.equal(client.hasEntity(id), true);
    assert.deepEqual(client.getEntityById(id), light);
  });

  test("replaces existing entries with the same id", () => {

    const client = new MockClient();
    const a = mockEntity("light", "kitchen", { name: "First" });
    const b = mockEntity("light", "kitchen", { name: "Second" });

    client.populateEntities([a]);
    client.populateEntities([b]);

    const id = entityId("light", "kitchen");

    assert.equal(client.getEntityById(id)?.name, "Second");
  });

  test("entities() returns the full list", () => {

    const client = new MockClient();

    client.populateEntities([ mockEntity("light", "a"), mockEntity("switch", "b") ]);

    assert.equal(client.entities().length, 2);
  });
});

describe("MockClient.command recording", () => {

  test("records command calls in arrival order", () => {

    const client = new MockClient();
    const id = entityId("light", "kitchen");

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.command(id, { state: true });
    client.command(id, { brightness: 0.5 });

    assert.equal(client.commands.length, 2);
    assert.equal(client.commands[0]?.id, id);
    assert.deepEqual(client.commands[1]?.options, { brightness: 0.5 });
  });

  test("drops a command for an id the test never registered and records nothing, as the real client does", () => {

    const client = new MockClient();
    const kitchen = entityId("light", "kitchen");

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.command(entityId("light", "cellar"), { state: true });

    assert.equal(client.commands.length, 0, "a command for an unregistered id must not reach the command log");

    // The registered id still records, so the drop is the registration rule and not a blanket refusal.
    client.command(kitchen, { state: true });

    assert.equal(client.commands.length, 1);
    assert.equal(client.commands[0]?.id, kitchen);
  });

  test("drops a malformed id without throwing and records nothing, as the real client's fire-and-forget runner does", () => {

    const client = new MockClient();
    const lamp = entityId("light", "lamp");

    client.populateEntities([mockEntity("light", "lamp")]);

    // A malformed id reaches the mock only through a cast across the brand. The real runner warns and drops it rather than throwing, unlike commandAndAwait().
    for(const malformed of [ "lamp", "-lamp" ]) {

      assert.doesNotThrow(() => client.command(malformed as unknown as typeof lamp, { state: true }));
    }

    assert.equal(client.commands.length, 0, "a command for a malformed id must not reach the command log");

    // The well-formed id for the same entity records, so the drop is the malformed id and not a refusal of this entity.
    client.command(lamp, { state: true });

    assert.equal(client.commands.length, 1);
    assert.equal(client.commands[0]?.id, lamp);
  });

  test("drops an out-of-range value and an unknown enum alias the client's encoder refuses and records nothing, as the real client does", () => {

    const client = new MockClient();
    const alarm = entityId("datetime", "alarm");
    const thermostat = entityId("climate", "thermostat");

    client.populateEntities([ mockEntity("datetime", "alarm"), mockEntity("climate", "thermostat") ]);
    client.command(alarm, { epochSeconds: -1 });
    client.command(thermostat, { mode: "freze" } as never);

    assert.equal(client.commands.length, 0, "a command the client's encoder refuses must not reach the command log");

    // In-range values for the same fields record, so the drop is the encoder's refusal and not a blanket refusal of these entities.
    client.command(alarm, { epochSeconds: 1 });
    client.command(thermostat, { mode: "heat" });

    assert.deepEqual(client.commands.map((recorded) => recorded.id), [ alarm, thermostat ]);
    assert.deepEqual(client.commands[1]?.options, { mode: "heat" }, "the recorded options are the caller's own, not the encoded form");
  });

  test("records a command to a sub-device entity and encodes it with the entity's device id", () => {

    const client = new MockClient();
    const porch = mockEntity("light", "porch", { deviceId: 7 });
    const id = entityId("light", "porch");

    client.populateEntities([porch]);
    client.command(id, { state: true });

    assert.equal(client.commands.length, 1, "a command to a sub-device entity must record");

    // The encoded frame is private to the mock, so the test reads it through the encode helper every command path goes through.
    const result = (client as unknown as { encode: (entity: Entity, id: EntityId, options: unknown) => EncodeResult }).encode(porch, id, { state: true });

    if(!result.ok) {

      assert.fail("the encoder refused a command to a sub-device entity: " + result.reason);
    }

    const fields = decodeProtobuf(result.value.payload, { maxFieldsPerMessage: 16 });

    assert.deepEqual(fields[ENTITY_SCHEMAS.light.command.deviceIdFieldNumber], [7], "the frame must carry the entity's device id");
  });

  test("clearCommands empties the recorded log", () => {

    const client = new MockClient();
    const id = entityId("switch", "front");

    client.populateEntities([mockEntity("switch", "front")]);
    client.command(id, { state: true });

    assert.equal(client.commands.length, 1);

    client.clearCommands();

    assert.equal(client.commands.length, 0);
  });

  test("commands accessor returns a snapshot - mutating it doesn't affect future commands", () => {

    const client = new MockClient();
    const id = entityId("switch", "x");

    client.populateEntities([mockEntity("switch", "x")]);
    client.command(id, { state: true });

    const snapshot = client.commands;

    (snapshot as unknown as { length: number }).length = 0;

    // Immediately read again - the live count should still be 1 because `commands` is a getter that returns a copy.
    assert.equal(client.commands.length, 1, "commands returns a snapshot, not a live mutable reference");
  });
});

describe("MockClient.transmitRawTimings recording", () => {

  test("records infrared and radio-frequency transmits in the command log in arrival order", () => {

    const client = new MockClient();
    const blaster = entityId("infrared", "blaster");
    const remote = entityId("radio_frequency", "remote");

    client.populateEntities([ mockEntity("infrared", "blaster", { capabilities: InfraredCapabilityFlags.TRANSMITTER }),
      mockEntity("radio_frequency", "remote", { capabilities: RadioFrequencyCapabilityFlags.TRANSMITTER }) ]);
    client.transmitRawTimings(blaster, { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] });
    client.transmitRawTimings(remote, { carrierFrequency: 433920000, repeatCount: 3, timings: [ 350, -1050 ] });

    assert.equal(client.commands.length, 2);
    assert.equal(client.commands[0]?.id, blaster);
    assert.deepEqual(client.commands[0]?.options, { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] });
    assert.equal(client.commands[1]?.id, remote);
    assert.deepEqual(client.commands[1]?.options, { carrierFrequency: 433920000, repeatCount: 3, timings: [ 350, -1050 ] });
  });

  test("refuses a registered receive-only entity with ENTITY_NOT_TRANSMITTER and records nothing, as the real client does", () => {

    const client = new MockClient();
    const receiver = entityId("infrared", "receiver");
    const blaster = entityId("infrared", "blaster");
    const options = { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] };

    client.populateEntities([ mockEntity("infrared", "receiver", { capabilities: InfraredCapabilityFlags.RECEIVER }),
      mockEntity("infrared", "blaster", { capabilities: InfraredCapabilityFlags.TRANSMITTER }) ]);

    assert.throws(() => client.transmitRawTimings(receiver, options), { code: "ENTITY_NOT_TRANSMITTER", constructor: ConnectionError });
    assert.equal(client.commands.length, 0, "a refused transmit must not reach the command log");

    // A registered transmitter passes the same check and records, so the refusal is the capability rule and not a blanket refusal of registered entities.
    client.transmitRawTimings(blaster, options);

    assert.equal(client.commands.length, 1);
    assert.equal(client.commands[0]?.id, blaster);
  });

  test("refuses an id the test never registered with ENTITY_NOT_FOUND and records nothing, as the real client does", () => {

    const client = new MockClient();
    const options = { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] };

    assert.throws(() => client.transmitRawTimings(entityId("infrared", "blaster"), options), {

      code: "ENTITY_NOT_FOUND",
      constructor: ConnectionError,
      message: "No entity is registered for infrared-blaster."
    });
    assert.equal(client.commands.length, 0, "a refused transmit must not reach the command log");
  });

  test("refuses a malformed id with ENTITY_NOT_FOUND and records nothing, as the real client's registry lookup does", () => {

    const client = new MockClient();
    const blaster = entityId("infrared", "blaster");
    const options = { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] };

    client.populateEntities([mockEntity("infrared", "blaster", { capabilities: InfraredCapabilityFlags.TRANSMITTER })]);

    // The real client looks the id up before the runner reads its prefix, so a malformed id fails that lookup and throws where command() would drop it.
    for(const malformed of [ "blaster", "-blaster" ]) {

      assert.throws(() => client.transmitRawTimings(malformed as unknown as typeof blaster, options), {

        code: "ENTITY_NOT_FOUND",
        constructor: ConnectionError,
        message: "No entity is registered for " + malformed + "."
      });
    }

    assert.equal(client.commands.length, 0, "a refused transmit must not reach the command log");

    // The well-formed id for the same transmitter records, so the refusal is the malformed id and not a refusal of this entity.
    client.transmitRawTimings(blaster, options);

    assert.equal(client.commands.length, 1);
    assert.equal(client.commands[0]?.id, blaster);
  });

  test("drops a transmit whose timings the client's encoder refuses and records nothing, as the real client does", () => {

    const client = new MockClient();
    const blaster = entityId("infrared", "blaster");

    client.populateEntities([mockEntity("infrared", "blaster", { capabilities: InfraredCapabilityFlags.TRANSMITTER })]);

    // A timing one past the signed 32-bit maximum is outside the packed sint32 domain the wire carries.
    client.transmitRawTimings(blaster, { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, 2147483648 ] });

    assert.equal(client.commands.length, 0, "a transmit the client's encoder refuses must not reach the command log");

    // The same transmit with in-range timings records, so the drop is the encoder's refusal and not the transmitter check.
    client.transmitRawTimings(blaster, { carrierFrequency: 38000, repeatCount: 1, timings: [ 9000, -4500 ] });

    assert.equal(client.commands.length, 1);
    assert.equal(client.commands[0]?.id, blaster);
  });
});

describe("MockClient.emit", () => {

  test("drives on() callbacks", () => {

    const client = new MockClient();
    const received: string[] = [];

    using _sub = client.on("disconnect", (reason) => { received.push(reason ?? "(no reason)"); });

    client.emit("disconnect", "test");
    client.emit("disconnect", undefined);

    assert.deepEqual(received, [ "test", "(no reason)" ]);
  });

  test("drives once() promise consumers", async () => {

    const client = new MockClient();
    const promise = client.once("deviceInfo");

    client.emit("deviceInfo", mockDeviceInfo({ name: "test" }));

    const info = await promise;

    assert.equal(info.name, "test");
  });
});

describe("MockClient.emitState", () => {

  test("drives both the per-type channel and the generic telemetry channel", () => {

    const client = new MockClient();
    const lightEvents: unknown[] = [];
    const telemetryEvents: unknown[] = [];

    using _a = client.on("light", (e) => { lightEvents.push(e); });
    using _b = client.on("telemetry", (e) => { telemetryEvents.push(e); });

    const id = entityId("light", "kitchen");
    const event = mockStateMessage(id, { state: true });

    client.emitState(event);

    assert.equal(lightEvents.length, 1, "per-type channel fires");
    assert.equal(telemetryEvents.length, 1, "generic telemetry channel fires");
  });

  test("updates the latest-state cache", () => {

    const client = new MockClient();
    const id = entityId("sensor", "temp");
    const event = mockStateMessage(id, { state: 21.5 });

    client.emitState(event);

    assert.deepEqual(client.latest(id), event);
  });

  test("cache contract: latest/snapshot/snapshotFor reads from inside listeners see the just-emitted event", () => {

    // Mirrors the real client's cache contract: the latest-state cache must be updated BEFORE the per-type and generic telemetry listeners fire. A future refactor
    // that flips the order in MockClient.emitState would diverge the test double from the real client's observable behavior and silently break consumer tests written
    // against the mock.
    const client = new MockClient();
    const id = entityId("light", "bedroom");

    let latestInTelemetry: unknown = "unset";
    let snapshotSizeInTelemetry = -1;
    let snapshotForSizeInTelemetry = -1;
    let latestInPerType: unknown = "unset";

    using _telemetrySub = client.on("telemetry", () => {

      latestInTelemetry = client.latest(id);
      snapshotSizeInTelemetry = client.snapshot().size;
      snapshotForSizeInTelemetry = client.snapshotFor("light").size;
    });

    using _perTypeSub = client.on("light", () => {

      latestInPerType = client.latest(id);
    });

    client.emitState(mockStateMessage(id, { state: true }));

    assert.notEqual(latestInTelemetry, null, "client.latest(id) inside on(\"telemetry\") must see the just-emitted event");
    assert.notEqual(latestInTelemetry, "unset", "on(\"telemetry\") listener did not fire");
    assert.equal(snapshotSizeInTelemetry, 1, "client.snapshot() inside on(\"telemetry\") must include the just-emitted event");
    assert.equal(snapshotForSizeInTelemetry, 1, "client.snapshotFor(type) inside on(\"telemetry\") must include the just-emitted event");
    assert.notEqual(latestInPerType, null, "client.latest(id) inside on(\"light\") must see the just-emitted event");
    assert.notEqual(latestInPerType, "unset", "on(\"light\") listener did not fire");
  });
});

describe("MockClient.snapshot / snapshotFor", () => {

  test("snapshot returns the full latest-state cache", () => {

    const client = new MockClient();
    const lightId = entityId("light", "x");
    const sensorId = entityId("sensor", "y");

    client.emitState(mockStateMessage(lightId, { state: true }));
    client.emitState(mockStateMessage(sensorId, { state: 1 }));

    assert.equal(client.snapshot().size, 2);
  });

  test("snapshotFor narrows to one entity type", () => {

    const client = new MockClient();

    client.emitState(mockStateMessage(entityId("light", "a"), { state: true }));
    client.emitState(mockStateMessage(entityId("light", "b"), { state: false }));
    client.emitState(mockStateMessage(entityId("switch", "c"), { state: true }));

    assert.equal(client.snapshotFor("light").size, 2);
    assert.equal(client.snapshotFor("switch").size, 1);
    assert.equal(client.snapshotFor("sensor").size, 0);
  });
});

describe("MockClient.setConnected lifecycle", () => {

  test("emits connect and lifecycle events on transition to connected", () => {

    const client = new MockClient();
    const lifecycleEvents: { kind: string }[] = [];

    using _sub = client.on("lifecycle", (e) => { lifecycleEvents.push(e); });

    client.setConnected(true);

    assert.equal(lifecycleEvents.length, 1);
    assert.equal(lifecycleEvents[0]?.kind, "connect");
  });

  test("emits disconnect and lifecycle events on transition to disconnected", () => {

    const client = new MockClient();
    const events: { kind: string }[] = [];

    client.setConnected(true);

    using _sub = client.on("lifecycle", (e) => { events.push(e); });

    client.setConnected(false);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "disconnect");
  });

  test("setConnected with the same state is a no-op", () => {

    const client = new MockClient();
    let count = 0;

    using _sub = client.on("lifecycle", () => { count++; });

    // Already disconnected at construction; setConnected(false) should not fire.
    client.setConnected(false);

    assert.equal(count, 0);
  });
});

describe("MockClient.setConnected health record", () => {

  test("setConnected(true) installs a frozen connected record that isConnectionLive reads as live, as the real client's connect does", () => {

    const client = new MockClient();

    client.setConnected(true);

    const health = client.health();

    assert.equal(health.state, HealthState.CONNECTED);
    assert.ok(isConnectionLive(health), "the connected record must be the live variant");
    assert.ok(Object.isFrozen(health), "the connected record must be frozen");
  });

  test("setConnected(true) announces the transition on healthChange exactly once, with the record health() returns", () => {

    const client = new MockClient();
    const emitted: unknown[] = [];

    using _sub = client.onHealthChange((health) => { emitted.push(health); });

    client.setConnected(true);

    assert.equal(emitted.length, 1, "the connect must announce its record once");
    assert.equal(emitted[0], client.health(), "health() must return the record the healthChange event carried");
  });

  test("isConnected and health().state agree after a connect and after the disconnect that follows it", () => {

    const client = new MockClient();

    client.setConnected(true);

    assert.equal(client.isConnected, true);
    assert.equal(client.health().state, HealthState.CONNECTED);

    client.setConnected(false);

    assert.equal(client.isConnected, false);
    assert.equal(client.health().state, HealthState.DISCONNECTED);
  });

  test("setConnected(true) announces connect, healthChange, then lifecycle, and every listener reads the connected record, as the real client does", () => {

    const client = new MockClient();
    const events: [ string, string ][] = [];

    using _connect = client.on("connect", () => { events.push([ "connect", client.health().state ]); });
    using _health = client.onHealthChange(() => { events.push([ "healthChange", client.health().state ]); });
    using _lifecycle = client.on("lifecycle", () => { events.push([ "lifecycle", client.health().state ]); });

    client.setConnected(true);

    assert.deepEqual(events, [ [ "connect", HealthState.CONNECTED ], [ "healthChange", HealthState.CONNECTED ], [ "lifecycle", HealthState.CONNECTED ] ]);
  });

  test("setConnected(true) on a connected mock announces nothing and keeps the record it holds", () => {

    const client = new MockClient();

    client.setConnected(true);

    const health = client.health();
    const events: string[] = [];

    using _connect = client.on("connect", () => { events.push("connect"); });
    using _health = client.onHealthChange(() => { events.push("healthChange"); });
    using _lifecycle = client.on("lifecycle", () => { events.push("lifecycle"); });

    client.setConnected(true);

    assert.deepEqual(events, [], "a repeat connect must announce nothing");
    assert.equal(client.health(), health, "a repeat connect must leave the record as it stands");
  });

  test("setConnected(true) replaces a seeded record, carrying only its stall count, and stamps one clock read as the epoch and the inbound activity", () => {

    const client = new MockClient();
    const seed = mockHealth({ connectedAtMs: 1, consecutiveStalls: 3, encrypted: true, lastInboundActivityAt: 12345, lastPingRttMs: 42, state: HealthState.STALLED });

    client.setHealth(seed);

    const before = Date.now();

    client.setConnected(true);

    const after = Date.now();
    const health = client.health();

    assert.ok(isConnectionLive(health), "the connected record must be the live variant");
    assert.equal(health.state, HealthState.CONNECTED);
    assert.equal(health.consecutiveStalls, 3, "the stall count must carry into the connected record");
    assert.equal(("lastPingRttMs" in health), false, "a new connection has measured no round trip");
    assert.equal(health.encrypted, false, "the encryption flag must be the mock's own, not the seed's");
    assert.ok((health.connectedAtMs >= before) && (health.connectedAtMs <= after), "the connect epoch must be read at the connect");
    assert.equal(health.lastInboundActivityAt, health.connectedAtMs, "the epoch and the first inbound activity must come from one clock read");
  });

  test("the connected record's encryption flag is the one the connect event carries", () => {

    const client = new MockClient();
    const payloads: boolean[] = [];

    using _sub = client.on("connect", (encrypted) => { payloads.push(encrypted); });

    client.setEncrypted(true);
    client.setConnected(true);

    assert.deepEqual(payloads, [true]);
    assert.equal(client.health().encrypted, true, "the record and the connect event must carry the same flag");
  });

  test("a seeded stall count carries through a disconnect into the next connected record", () => {

    const client = new MockClient();

    client.setConnected(true);
    client.setHealth(mockHealth({ consecutiveStalls: 2, state: HealthState.STALLED }));
    client.disconnect();

    assert.equal(client.health().consecutiveStalls, 2, "the teardown must carry the count into the disconnected record");

    client.setConnected(true);

    assert.equal(client.health().state, HealthState.CONNECTED);
    assert.equal(client.health().consecutiveStalls, 2, "the next connect must carry the count until inbound activity resets it");
  });
});

describe("MockClient.setConnected encryption on its announcements", () => {

  test("a connect listener that disconnects the mock leaves the lifecycle connect event reporting the session's encryption, after the disconnect's own events", () => {

    const client = new MockClient();
    const order: string[] = [];
    let lifecycleConnect: LifecycleEvent | undefined;

    client.setEncrypted(true);
    client.on("connect", (): void => { client.disconnect(); });
    client.on("disconnect", (): void => { order.push("disconnect"); });
    client.on("lifecycle", (event: LifecycleEvent): void => {

      order.push("lifecycle:" + event.kind);

      if(event.kind === "connect") {

        lifecycleConnect = event;
      }
    });

    client.setConnected(true);

    // The real client emits its lifecycle connect from the session it attached after a connect listener's teardown, so the disconnect's own events come first and the
    // connect event still reports the encryption that session had.
    assert.deepEqual(order, [ "lifecycle:disconnect", "disconnect", "lifecycle:connect" ]);
    assert.deepEqual(lifecycleConnect, { encrypted: true, kind: "connect" });
  });
});

describe("MockClient.setEncrypted / isEncrypted", () => {

  test("isEncrypted reflects setEncrypted", () => {

    const client = new MockClient();

    assert.equal(client.isEncrypted, false);

    client.setEncrypted(true);

    assert.equal(client.isEncrypted, true);
  });
});

describe("MockClient.setDeviceInfo / deviceInfo", () => {

  test("returns the seeded device info", () => {

    const client = new MockClient();
    const info = mockDeviceInfo({ name: "kitchen-controller" });

    client.setDeviceInfo(info);

    assert.equal(client.deviceInfo()?.name, "kitchen-controller");
  });

  test("returns null before any setDeviceInfo call", () => {

    const client = new MockClient();

    assert.equal(client.deviceInfo(), null);
  });

  test("setDeviceInfo emits a frozen copy with its serial-proxy list and entries frozen, and deviceInfo() returns that same record, as on the real client", () => {

    const client = new MockClient();
    const fixture = mockDeviceInfo({ name: "kitchen-controller", serialProxies: [{ name: "uart_0", portType: SerialProxyPortType.TTL }] });
    const emitted: unknown[] = [];

    using _sub = client.on("deviceInfo", (info) => { emitted.push(info); });

    client.setDeviceInfo(fixture);

    const info = client.deviceInfo();

    assert.equal(emitted.length, 1, "setDeviceInfo must announce the record on the deviceInfo event");
    assert.equal(info, emitted[0], "deviceInfo() must return the record the deviceInfo event carried");
    assert.ok(Object.isFrozen(info), "the record must be frozen");
    assert.ok(Object.isFrozen(info?.serialProxies), "the serial-proxy list must be frozen");
    assert.ok(Object.isFrozen(info?.serialProxies?.[0]), "each serial-proxy entry must be frozen");
    assert.deepEqual(info, fixture, "the record must carry the caller's values");

    // The caller's own fixture stays writable, so the mock froze a copy rather than the object the test passed in.
    assert.equal(Object.isFrozen(fixture), false);
    assert.equal(Object.isFrozen(fixture.serialProxies), false);
    assert.equal(Object.isFrozen(fixture.serialProxies?.[0]), false);
  });
});

describe("MockClient.setHealth / health", () => {

  test("returns the seeded health record", () => {

    const client = new MockClient();
    const health = mockHealth({ state: HealthState.STALLED });

    client.setHealth(health);

    assert.equal(client.health().state, HealthState.STALLED);
  });

  test("returns the disconnected record by default", () => {

    const client = new MockClient();

    assert.equal(client.health().state, HealthState.DISCONNECTED);
  });

  test("setHealth emits a frozen copy and health() returns that same record, with the default record frozen too, as on the real client", () => {

    const client = new MockClient();
    const fixture = mockHealth({ state: HealthState.STALLED });
    const emitted: unknown[] = [];

    assert.ok(Object.isFrozen(client.health()), "the default disconnected record must be frozen");

    using _sub = client.onHealthChange((health) => { emitted.push(health); });

    client.setHealth(fixture);

    assert.equal(emitted.length, 1, "setHealth must announce the record on the healthChange event");
    assert.equal(client.health(), emitted[0], "health() must return the record the healthChange event carried");
    assert.ok(Object.isFrozen(client.health()), "the record must be frozen");
    assert.deepEqual(client.health(), fixture, "the record must carry the caller's values");
    assert.equal(Object.isFrozen(fixture), false, "the caller's own object must stay writable");
  });
});

describe("MockClient.homeAssistant sub-API", () => {

  test("records subscribeServices / subscribeStates calls with the canonical method names", () => {

    const client = new MockClient();

    client.homeAssistant.subscribeServices();
    client.homeAssistant.subscribeStates();

    assert.equal(client.homeAssistant[MOCK].calls.length, 2);
    assert.equal(client.homeAssistant[MOCK].calls[0]?.method, "subscribeServices");
    assert.equal(client.homeAssistant[MOCK].calls[1]?.method, "subscribeStates");
  });

  test("records sendState args verbatim (entityId, state, attribute)", () => {

    const client = new MockClient();

    client.homeAssistant.sendState("sensor.kitchen_temp", "21.4", "unit");

    assert.equal(client.homeAssistant[MOCK].calls.length, 1);
    assert.equal(client.homeAssistant[MOCK].calls[0]?.method, "sendState");
    assert.deepEqual(client.homeAssistant[MOCK].calls[0]?.args, [ "sensor.kitchen_temp", "21.4", "unit" ]);
  });

  test("records respondToAction with callId and options", () => {

    const client = new MockClient();

    client.homeAssistant.respondToAction(42, { success: true });

    assert.equal(client.homeAssistant[MOCK].calls[0]?.method, "respondToAction");
    assert.deepEqual(client.homeAssistant[MOCK].calls[0]?.args, [ 42, { success: true } ]);
  });

  test("clearCalls empties the recorded log", () => {

    const client = new MockClient();

    client.homeAssistant.subscribeServices();
    client.homeAssistant[MOCK].clearCalls();

    assert.equal(client.homeAssistant[MOCK].calls.length, 0);
  });

  test("disconnect clears the home-assistant call log alongside other state", () => {

    const client = new MockClient();

    client.homeAssistant.subscribeServices();
    client.disconnect();

    assert.equal(client.homeAssistant[MOCK].calls.length, 0);
  });
});

describe("MockClient.services sub-API", () => {

  test("list returns the staged service catalog (via stub) and records the call", () => {

    const client = new MockClient();
    const catalog = [
      { args: [], key: 1, name: "service_a" },
      { args: [], key: 2, name: "service_b" }
    ];

    // The recording factory stubs return values via the mock controller. Tests stage the catalog by stubbing the list() method's return; the real UserServicesApi
    // reads from its private service registry, which the mock side bypasses entirely.
    client.services[MOCK].stub("list", () => catalog);

    const result = client.services.list();

    assert.deepEqual(result, catalog);
    assert.equal(client.services[MOCK].calls[0]?.method, "list");
  });

  test("list returns an empty array when no services have been staged", () => {

    const client = new MockClient();

    assert.deepEqual(client.services.list(), []);
  });

  test("execute records (key, args) verbatim", () => {

    const client = new MockClient();

    client.services.execute(7, [{ stringValue: "hello" }]);

    assert.equal(client.services[MOCK].calls[0]?.method, "execute");
    assert.deepEqual(client.services[MOCK].calls[0]?.args, [ 7, [{ stringValue: "hello" }] ]);
  });

  test("executeByName records (name, args) verbatim", () => {

    const client = new MockClient();

    client.services.executeByName("notify_user", [{ stringValue: "ping" }]);

    assert.equal(client.services[MOCK].calls[0]?.method, "executeByName");
    assert.deepEqual(client.services[MOCK].calls[0]?.args, [ "notify_user", [{ stringValue: "ping" }] ]);
  });

  test("disconnect clears the services call log alongside other state", () => {

    const client = new MockClient();

    client.services.execute(1);
    client.disconnect();

    assert.equal(client.services[MOCK].calls.length, 0);
  });
});

describe("MockClient.bluetooth sub-API", () => {

  test("records connect/disconnect calls with their args via the reflection-driven factory", () => {

    const client = new MockClient();

    void client.bluetooth.connect(0x1234567890abn, { timeoutMs: 5000 });
    void client.bluetooth.disconnect(0x1234567890abn);

    assert.equal(client.bluetooth[MOCK].calls.length, 2);
    assert.equal(client.bluetooth[MOCK].calls[0]?.method, "connect");
    assert.deepEqual(client.bluetooth[MOCK].calls[0]?.args, [ 0x1234567890abn, { timeoutMs: 5000 } ]);
    assert.equal(client.bluetooth[MOCK].calls[1]?.method, "disconnect");
  });

  test("default `available` accessor returns false (construction-time default)", () => {

    const client = new MockClient();

    assert.equal(client.bluetooth.available, false);
  });

  test("stub overrides the default `available` accessor return", () => {

    const client = new MockClient();

    client.bluetooth[MOCK].stub("available", true);

    assert.equal(client.bluetooth.available, true);
  });
});

describe("MockClient.voiceAssistant sub-API", () => {

  test("records subscribe/respondToRequest invocations via the factory", () => {

    const client = new MockClient();

    client.voiceAssistant.subscribe();
    client.voiceAssistant.respondToRequest({ port: 12345 });

    assert.equal(client.voiceAssistant[MOCK].calls.length, 2);
    assert.equal(client.voiceAssistant[MOCK].calls[0]?.method, "subscribe");
    assert.equal(client.voiceAssistant[MOCK].calls[1]?.method, "respondToRequest");
    assert.deepEqual(client.voiceAssistant[MOCK].calls[1]?.args, [{ port: 12345 }]);
  });
});

describe("MockClient.serial sub-API", () => {

  test("records list/write invocations via the factory", () => {

    const client = new MockClient();

    void client.serial.list();
    client.serial.write(0, Buffer.from("hello"));

    assert.equal(client.serial[MOCK].calls.length, 2);
    assert.equal(client.serial[MOCK].calls[0]?.method, "list");
    assert.equal(client.serial[MOCK].calls[1]?.method, "write");
  });

  test("default `list` accessor returns an empty array (construction-time default)", () => {

    const client = new MockClient();

    assert.deepEqual(client.serial.list(), []);
  });
});

describe("MockClient.zwave sub-API", () => {

  test("records send/homeId invocations via the factory", () => {

    const client = new MockClient();

    client.zwave.send(Buffer.from([ 0x01, 0x02 ]));
    void client.zwave.homeId();

    assert.equal(client.zwave[MOCK].calls.length, 2);
    assert.equal(client.zwave[MOCK].calls[0]?.method, "send");
    assert.equal(client.zwave[MOCK].calls[1]?.method, "homeId");
  });

  test("default `available` accessor returns false (construction-time default)", () => {

    const client = new MockClient();

    assert.equal(client.zwave.available, false);
  });
});

describe("MockClient.camera sub-API", () => {

  test("records snapshot invocations via the factory", () => {

    const client = new MockClient();
    const cameraId = entityId("camera", "front_door");

    void client.camera(cameraId).snapshot();

    assert.equal(client.camera(cameraId)[MOCK].calls.length, 1);
    assert.equal(client.camera(cameraId)[MOCK].calls[0]?.method, "snapshot");
  });

  test("returns the same recording-mock instance for repeated calls with the same id (reference equality)", () => {

    const client = new MockClient();
    const cameraId = entityId("camera", "front_door");

    const a = client.camera(cameraId);
    const b = client.camera(cameraId);

    assert.strictEqual(a, b, "same id must yield the same mock instance so test code can capture a reference once and reuse it across the scenario");
  });

  test("returns distinct recording-mock instances for distinct ids (reference inequality)", () => {

    const client = new MockClient();
    const idA = entityId("camera", "front_door");
    const idB = entityId("camera", "back_door");

    assert.notStrictEqual(client.camera(idA), client.camera(idB), "distinct ids must yield distinct mock instances so per-id assertions stay isolated");
  });

  test("per-id call logs are independent - a call on camera(A) does not appear on camera(B)", () => {

    const client = new MockClient();
    const idA = entityId("camera", "front_door");
    const idB = entityId("camera", "back_door");

    void client.camera(idA).snapshot();

    assert.equal(client.camera(idA)[MOCK].calls.length, 1, "call recorded on camera(A)");
    assert.equal(client.camera(idB)[MOCK].calls.length, 0, "camera(B) sees no calls from camera(A)");
  });
});

describe("MockClient disconnect resets every sub-API recording log", () => {

  test("every sub-API mock's call log is cleared on disconnect()", () => {

    const client = new MockClient();
    const cameraId = entityId("camera", "x");

    client.bluetooth.setScannerMode(0);
    client.homeAssistant.subscribeServices();
    client.serial.write(0, Buffer.alloc(0));
    client.services.execute(1);
    client.voiceAssistant.subscribe();
    client.zwave.send(Buffer.alloc(0));
    void client.camera(cameraId).snapshot();

    client.disconnect();

    assert.equal(client.bluetooth[MOCK].calls.length, 0);
    assert.equal(client.homeAssistant[MOCK].calls.length, 0);
    assert.equal(client.serial[MOCK].calls.length, 0);
    assert.equal(client.services[MOCK].calls.length, 0);
    assert.equal(client.voiceAssistant[MOCK].calls.length, 0);
    assert.equal(client.zwave[MOCK].calls.length, 0);
    assert.equal(client.camera(cameraId)[MOCK].calls.length, 0);
  });
});

describe("MockClient disconnect keeps the event bus", () => {

  test("a subscription taken before connect keeps firing after disconnect() and the next connect, as on the real client", async () => {

    const client = new MockClient();
    const kinds: string[] = [];
    const connects = client.stream("connect")[Symbol.asyncIterator]();

    using _sub = client.on("lifecycle", (event) => { kinds.push(event.kind); });

    client.setConnected(true);
    client.disconnect();
    client.setConnected(true);

    assert.deepEqual(kinds, [ "connect", "disconnect", "connect" ], "the lifecycle handler must fire for disconnect() and for the connect that follows it");

    // The stream taken before the first connect queues every connect emission; a disposed bus would have ended it instead.
    assert.equal((await connects.next()).done, false);
    assert.equal((await connects.next()).done, false, "the stream must still deliver the connect that follows disconnect()");

    await connects.return?.();
  });
});

describe("MockClient teardown mirrors the real client's", () => {

  // A connected mock with a non-default record for every session fact the teardown resets, plus one registered entity, so each reset and each survivor shows.
  function connectedClient(): MockClient {

    const client = new MockClient();

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.setCapabilities({ ...disconnectedCapabilities(), encryption: { active: true, supported: true } });
    client.setDeviceInfo(mockDeviceInfo({ name: "kitchen-controller" }));
    client.setEncrypted(true);
    client.setSubDevices([{ id: 1, name: "kitchen" }]);
    client.setConnected(true);

    // The connect installs a connected record of its own, so the health seed follows it.
    client.setHealth(mockHealth());

    return client;
  }

  // Record every event on the channels the real client announces a disconnect on, in arrival order and with its payload, until the recorder is disposed.
  function recordAnnouncements(client: MockClient): Disposable & { readonly events: [ string, unknown ][] } {

    const events: [ string, unknown ][] = [];
    const subscriptions = [
      client.onHealthChange((health) => { events.push([ "healthChange", health ]); }),
      client.on("lifecycle", (event) => { events.push([ "lifecycle", event ]); }),
      client.on("disconnect", (reason) => { events.push([ "disconnect", reason ]); })
    ];

    return {

      events,
      [Symbol.dispose]: (): void => {

        for(const subscription of subscriptions) {

          subscription[Symbol.dispose]();
        }
      }
    };
  }

  test("disconnect() on a connected mock resets the session's records and announces healthChange, lifecycle, then disconnect, as the real client does", () => {

    const client = connectedClient();
    let deviceInfoAtAnnouncement: unknown = "unset";
    let entitiesAtAnnouncement = -1;

    using recorder = recordAnnouncements(client);
    using _health = client.onHealthChange(() => { deviceInfoAtAnnouncement = client.deviceInfo(); });
    using _disconnect = client.on("disconnect", () => { entitiesAtAnnouncement = client.entities().length; });

    client.disconnect();

    const health = client.health();

    assert.deepEqual(recorder.events, [ [ "healthChange", health ], [ "lifecycle", { kind: "disconnect" } ], [ "disconnect", undefined ] ]);
    assert.equal(recorder.events[0]?.[1], health, "health() must return the record the healthChange event carried");
    assert.ok(Object.isFrozen(health), "the disconnected record must be frozen");
    assert.deepEqual(health, { consecutiveStalls: 0, encrypted: false, lastInboundActivityAt: 0, state: HealthState.DISCONNECTED });
    assert.equal(client.deviceInfo(), null);
    assert.deepEqual(client.capabilities(), disconnectedCapabilities());
    assert.equal(client.isEncrypted, false);
    assert.deepEqual(client.subDevices(), []);
    assert.equal(client.isConnected, false);

    // The real client resets the session's records before it announces the end and keeps its registry through it, so a listener sees both.
    assert.equal(deviceInfoAtAnnouncement, null, "the device info must be cleared before the announcement");
    assert.equal(entitiesAtAnnouncement, 1, "the entity registry must still be readable while the disconnect is announced");
    assert.equal(client.entities().length, 0, "disconnect() clears the entity registry once the announcement is done");
  });

  test("setConnected(false) on a connected mock tears down the same way, carries its reason, and keeps the registry and the command log", () => {

    const client = connectedClient();
    const kitchen = entityId("light", "kitchen");

    client.command(kitchen, { state: true });

    using recorder = recordAnnouncements(client);

    client.setConnected(false, "link lost");

    const health = client.health();

    assert.deepEqual(recorder.events, [ [ "healthChange", health ], [ "lifecycle", { kind: "disconnect" } ], [ "disconnect", "link lost" ] ]);
    assert.equal(recorder.events[0]?.[1], health, "health() must return the record the healthChange event carried");
    assert.ok(Object.isFrozen(health), "the disconnected record must be frozen");
    assert.deepEqual(health, { consecutiveStalls: 0, encrypted: false, lastInboundActivityAt: 0, state: HealthState.DISCONNECTED });
    assert.equal(client.deviceInfo(), null);
    assert.deepEqual(client.capabilities(), disconnectedCapabilities());
    assert.equal(client.isEncrypted, false);
    assert.deepEqual(client.subDevices(), []);

    // A dropped session is not the consumer's own teardown, so the registry and the command log survive it, as the real client keeps its registry.
    assert.equal(client.hasEntity(kitchen), true);
    assert.equal(client.commands.length, 1);
  });

  test("a second disconnect() announces nothing and leaves the health record as it stands, as the real client's repeat call does", () => {

    const client = connectedClient();

    client.disconnect();

    const health = client.health();

    using recorder = recordAnnouncements(client);

    client.disconnect();

    assert.deepEqual(recorder.events, [], "a disconnect on a disconnected mock must announce nothing");
    assert.equal(client.health(), health, "the health record must be the one the first teardown installed");
    assert.equal(client.deviceInfo(), null);
  });

  test("the disconnected health record carries the stall count and the last ping round-trip time forward, as the real client's does", () => {

    const client = new MockClient();

    client.setConnected(true);
    client.setHealth(mockHealth({ consecutiveStalls: 3, encrypted: true, lastInboundActivityAt: 12345, lastPingRttMs: 42, state: HealthState.STALLED }));
    client.disconnect();

    // Only the stall count and the round-trip time carry over. The encryption flag and the inbound-activity stamp return to the disconnected baseline, and the
    // connect epoch is absent, as a down record requires.
    assert.deepEqual(client.health(), { consecutiveStalls: 3, encrypted: false, lastInboundActivityAt: 0, lastPingRttMs: 42, state: HealthState.DISCONNECTED });
  });
});

describe("MockClient.getEntityKey", () => {

  test("returns the registered entity's numeric key, and null for an unknown id", () => {

    const client = new MockClient();
    const light = mockEntity("light", "kitchen");
    const id = entityId("light", "kitchen");

    client.populateEntities([light]);

    assert.equal(client.getEntityKey(id), light.key);
    assert.equal(client.getEntityKey(entityId("light", "absent")), null);
  });
});

describe("MockClient.getAvailableEntityIds", () => {

  test("groups registered object ids by entity type", () => {

    const client = new MockClient();

    client.populateEntities([ mockEntity("light", "kitchen"), mockEntity("light", "bedroom"), mockEntity("switch", "fan") ]);

    const available = client.getAvailableEntityIds();

    assert.deepEqual(available["light"]?.slice().sort(), [ "bedroom", "kitchen" ]);
    assert.deepEqual(available["switch"], ["fan"]);
  });
});

describe("MockClient.logsReadable", () => {

  test("returns a Web Streams reader that surfaces emitted log events", async () => {

    const client = new MockClient();
    const reader = client.logsReadable(LogLevel.INFO).getReader();

    // The reader subscribes on construction, so an emit after this line queues into the stream.
    client.emitLog({ level: LogLevel.INFO, message: "hello" });

    const { value } = await reader.read();

    assert.equal(value?.message, "hello");

    await reader.cancel();
  });
});

describe("MockClient.telemetryForId", () => {

  test("yields only the target entity's state events, filtered by key", async () => {

    const client = new MockClient();
    const kitchen = entityId("light", "kitchen");
    const bedroom = entityId("light", "bedroom");

    client.populateEntities([ mockEntity("light", "kitchen"), mockEntity("light", "bedroom") ]);

    const iter = client.telemetryForId(kitchen)[Symbol.asyncIterator]();
    const next = iter.next();

    // A different entity's event on the same type channel must be skipped; only the matching key resolves the parked pull.
    client.emitState(mockStateMessage(bedroom, { state: false }));
    client.emitState(mockStateMessage(kitchen, { state: true }));

    const { value } = await next;

    assert.equal(value?.entity, kitchen);
    assert.equal(value?.state, true);

    await iter.return?.();
  });

  test("a never-iterated view detaches its bus listener on return() and on an abort of its signal", async () => {

    const client = new MockClient();
    const controller = new AbortController();

    client.populateEntities([mockEntity("light", "kitchen")]);

    // The bus is private; the listener count on the per-type channel is the observable for whether the view still holds its stream.
    const bus = (client as unknown as { bus: { listenerCount: (event: string) => number } }).bus;
    const returned = client.telemetryForId(entityId("light", "kitchen"))[Symbol.asyncIterator]();

    client.telemetryForId(entityId("light", "kitchen"), { signal: controller.signal });

    assert.equal(bus.listenerCount("light"), 2, "each view attaches its listener when it is requested");

    await returned.return!();

    assert.equal(bus.listenerCount("light"), 1, "return() must detach the listener even though the view was never iterated");

    controller.abort();

    assert.equal(bus.listenerCount("light"), 0, "the abort must detach the listener even though the view was never iterated");
  });
});

describe("MockClient.commandAndAwait", () => {

  test("records the command and resolves with the entity's next matching state", async () => {

    const client = new MockClient();
    const id = entityId("light", "kitchen");

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.setConnected(true);

    const awaited = client.commandAndAwait(id, { state: true });

    client.emitState(mockStateMessage(id, { state: true }));

    const result = await awaited;

    assert.equal(result.state, true);
    assert.equal(client.commands.at(-1)?.id, id);
  });

  test("rejects with the abort reason when the caller signal fires before a state arrives", async () => {

    const client = new MockClient();
    const id = entityId("light", "kitchen");

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.setConnected(true);

    const controller = new AbortController();
    const reason = new Error("caller");
    const awaited = client.commandAndAwait(id, { state: true }, { signal: controller.signal, timeoutMs: 5000 });

    controller.abort(reason);

    await assert.rejects(awaited, (err: unknown): boolean => err === reason);
  });

  test("rejects with a ConfigurationError for an unregistered entity id", async () => {

    const client = new MockClient();

    client.setConnected(true);

    await assert.rejects(client.commandAndAwait(entityId("light", "absent"), { state: true }), (err: unknown) => {

      assert.ok(err instanceof ConfigurationError);

      return true;
    });
  });

  test("rejects a malformed id at once with the real runner's MALFORMED_ENTITY_ID error, ahead of the unknown-id check, and records nothing", async () => {

    const client = new MockClient();

    client.populateEntities([mockEntity("climate", "thermostat")]);
    client.setConnected(true);

    // A malformed id is never registered either, so the code shows the order: the malformed check runs before the registry lookup, as in the real runner. The
    // timeout is generous, so a refusal that fell through to the await would reject with the timeout's TimeoutError instead.
    for(const malformed of [ "thermostat", "-thermostat" ]) {

      await assert.rejects(client.commandAndAwait(malformed as unknown as EntityId<"climate">, { mode: "heat" }, { timeoutMs: 5000 }), {

        code: "MALFORMED_ENTITY_ID",
        constructor: ConfigurationError,
        message: "commandAndAwait(): malformed entity id '" + malformed + "'."
      });
    }

    assert.equal(client.commands.length, 0, "a command for a malformed id must not reach the command log");
  });

  test("rejects an unknown enum alias at once with the real runner's ConfigurationError code, opening no stream and recording nothing", async () => {

    const client = new MockClient();
    const id = entityId("climate", "thermostat");
    const bus = (client as unknown as { bus: { listenerCount: (event: string) => number } }).bus;

    client.populateEntities([mockEntity("climate", "thermostat")]);
    client.setConnected(true);

    // The timeout is generous: a refusal that fell through to the await would reject with the timeout's TimeoutError instead of the refusal code.
    const pending = client.commandAndAwait(id, { mode: "freze" } as never, { timeoutMs: 5000 });

    assert.equal(bus.listenerCount("climate"), 0, "a refused command must not open the state stream");

    await assert.rejects(pending, {

      code: "ENUM_VALUE_UNKNOWN",
      constructor: ConfigurationError,
      message: "commandAndAwait(): command for climate-thermostat refused before sending (ENUM_VALUE_UNKNOWN): field 'mode' received unknown enum value 'freze'."
    });
    assert.equal(client.commands.length, 0, "a refused command must not reach the command log");
  });

  test("on a mock never connected, refuses a registered, a malformed, and an unregistered id with NOT_CONNECTED and records nothing", async () => {

    const client = new MockClient();

    client.populateEntities([ mockEntity("light", "kitchen"), mockEntity("climate", "thermostat") ]);

    // The admission runs ahead of the runner's validation, so each call reports the missing connection whatever its id would have reported.
    await assert.rejects(client.commandAndAwait(entityId("light", "kitchen"), { state: true }, { timeoutMs: 1000 }),
      { code: "NOT_CONNECTED", constructor: NotConnectedError });
    await assert.rejects(client.commandAndAwait("thermostat" as unknown as EntityId<"climate">, { mode: "heat" }, { timeoutMs: 1000 }),
      { code: "NOT_CONNECTED", constructor: NotConnectedError });
    await assert.rejects(client.commandAndAwait(entityId("light", "absent"), { state: true }, { timeoutMs: 1000 }),
      { code: "NOT_CONNECTED", constructor: NotConnectedError });
    assert.equal(client.commands.length, 0, "a refused command must not reach the command log");
  });

  test("a call whose signal is already aborted rejects with that reason and records nothing", async () => {

    const client = new MockClient();
    const controller = new AbortController();
    const reason = new Error("The caller gave up.");

    client.populateEntities([mockEntity("light", "kitchen")]);
    client.setConnected(true);
    controller.abort(reason);

    await assert.rejects(client.commandAndAwait(entityId("light", "kitchen"), { state: true }, { signal: controller.signal }), (err: unknown): boolean => err === reason);
    assert.equal(client.commands.length, 0, "a pre-aborted command must not reach the command log");
  });

  // Each teardown the mock offers ends the session the way the real client's teardown does, so each rejects a pending command wait with the one connection-lost error
  // it aborts the mock's connection scope with, read through the private field before the teardown runs.
  const teardowns: readonly { name: string; run: (client: MockClient) => void }[] = [

    { name: "disconnect()", run: (client: MockClient): void => { client.disconnect(); } },
    { name: "setConnected(false)", run: (client: MockClient): void => { client.setConnected(false); } },
    { name: "dispose", run: (client: MockClient): void => { client[Symbol.dispose](); } }
  ];

  for(const { name, run } of teardowns) {

    test("a pending call rejects with the connection-lost error on " + name, async () => {

      const client = new MockClient();
      const id = entityId("light", "kitchen");

      client.populateEntities([mockEntity("light", "kitchen")]);
      client.setConnected(true);

      const connection = (client as unknown as { connection: AbortController }).connection;
      const awaited = client.commandAndAwait(id, { state: true }, { timeoutMs: 1000 });

      run(client);

      await assert.rejects(awaited, (err: unknown): boolean => {

        assert.ok(err instanceof ConnectionLostError, "the teardown must reject the wait with a ConnectionLostError");
        assert.equal(err, connection.signal.reason, "the wait must reject with the one error the teardown aborted the scope with");

        return true;
      });
    });
  }

  test("a once() for connect registered while connected resolves on the next connect, since a teardown ends no once()", async () => {

    const client = new MockClient();

    client.setConnected(true);

    const next = client.once("connect", { signal: AbortSignal.timeout(2000) });

    client.setConnected(false);
    client.setConnected(true);

    assert.equal(await next, false);
  });
});
