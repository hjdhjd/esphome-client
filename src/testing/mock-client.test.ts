/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-client.test.ts: Helper-coverage-parity tests for the MockClient consumer-test double.
 */
import { describe, test } from "node:test";
import { mockDeviceInfo, mockEntity, mockHealth, mockStateMessage } from "./factories.ts";
import { Buffer } from "node:buffer";
import { ConfigurationError } from "../errors.ts";
import { HealthState } from "../health.ts";
import { LogLevel } from "../api-constants.ts";
import { MOCK } from "./recording-mock.ts";
import { MockClient } from "./mock-client.ts";
import assert from "node:assert/strict";
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

    client.command(id, { state: true });
    client.command(id, { brightness: 0.5 });

    assert.equal(client.commands.length, 2);
    assert.equal(client.commands[0]?.id, id);
    assert.deepEqual(client.commands[1]?.options, { brightness: 0.5 });
  });

  test("clearCommands empties the recorded log", () => {

    const client = new MockClient();
    const id = entityId("switch", "front");

    client.command(id, { state: true });
    client.clearCommands();

    assert.equal(client.commands.length, 0);
  });

  test("commands accessor returns a snapshot - mutating it doesn't affect future commands", () => {

    const client = new MockClient();
    const id = entityId("switch", "x");

    client.command(id, { state: true });

    const snapshot = client.commands;

    (snapshot as unknown as { length: number }).length = 0;

    // Immediately read again - the live count should still be 1 because `commands` is a getter that returns a copy.
    assert.equal(client.commands.length, 1, "commands returns a snapshot, not a live mutable reference");
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
});

describe("MockClient.commandAndAwait", () => {

  test("records the command and resolves with the entity's next matching state", async () => {

    const client = new MockClient();
    const id = entityId("light", "kitchen");

    client.populateEntities([mockEntity("light", "kitchen")]);

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

    const controller = new AbortController();
    const awaited = client.commandAndAwait(id, { state: true }, { signal: controller.signal });

    controller.abort();

    await assert.rejects(awaited);
  });

  test("rejects with a ConfigurationError for an unregistered entity id", async () => {

    const client = new MockClient();

    await assert.rejects(client.commandAndAwait(entityId("light", "absent"), { state: true }), (err: unknown) => {

      assert.ok(err instanceof ConfigurationError);

      return true;
    });
  });
});
