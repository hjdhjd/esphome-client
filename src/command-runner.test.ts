/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * command-runner.test.ts: Unit tests for the command-dispatch module.
 */
import type { ClientMetrics, Nullable } from "./types.ts";
import type { CommandAndAwaitable, CommandHost } from "./command-runner.ts";
import { ConfigurationError, NotConnectedError } from "./errors.ts";
import { describe, test } from "node:test";
import { runCommand, runCommandAndAwait } from "./command-runner.ts";
import type { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { ConnectionScope } from "./connection-scope.ts";
import { ENTITY_SCHEMAS } from "./schemas/index.ts";
import type { EntityId } from "./entity-id.ts";
import type { EntitySchema } from "./schemas/index.ts";
import { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import assert from "node:assert/strict";
import { connectionLostError } from "./connection-scope.ts";
import { entityId } from "./entity-id.ts";

// Recording logger captures each level so tests can assert on the malformed-id warn, the encode-failure warns, the sendEntityCommand debug line, and the
// unrecognized-options debug emitted by reportUnrecognizedOptions.
interface RecordingLogger {

  debug: (msg: string) => void;
  debugged: string[];
  error: (msg: string) => void;
  errored: string[];
  info: (msg: string) => void;
  infoed: string[];
  warn: (msg: string) => void;
  warned: string[];
}

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

interface CapturedFrame {

  payload: Buffer;
  type: number;
}

interface CapturedMetric {

  delta: number;
  name: string;
  tags: Record<string, string> | undefined;
}

// Build a CommandHost with optional overrides. The default host knows nothing (keyForId returns null, deviceIdForKey returns undefined, send is a no-op). Each test
// composes the parts it cares about. The connection lives in a closure, starting attached, so a test aborts it to stand for a teardown, sets it to `null` to stand
// for no transport, and installs a fresh controller for the next connection; a spread copy of the host reads the same controller.
interface MockHostBundle {

  bus: EventBus<ClientEventsMap>;
  frames: CapturedFrame[];
  host: CommandHost;
  logger: RecordingLogger;
  metrics: CapturedMetric[];
  setConnection: (controller: Nullable<AbortController>) => void;
}

interface MockHostOverrides {

  bus?: EventBus<ClientEventsMap>;
  deviceIdForKey?: (key: number) => number | undefined;
  keyForId?: (id: EntityId) => Nullable<number>;
  metricsSink?: ClientMetrics | undefined;
  send?: (type: number, payload: Buffer) => void;
}

const mockHost = (overrides: MockHostOverrides = {}): MockHostBundle => {

  const bus = overrides.bus ?? new EventBus<ClientEventsMap>();
  const frames: CapturedFrame[] = [];
  const logger = recordingLogger();
  const recordedMetrics: CapturedMetric[] = [];
  const sink = ("metricsSink" in overrides) ? overrides.metricsSink : ((): ClientMetrics => {

    return {

      gauge: (name: string, value: number, tags?: Record<string, string>): void => { recordedMetrics.push({ delta: value, name, tags }); },
      increment: (name: string, delta: number, tags?: Record<string, string>): void => { recordedMetrics.push({ delta, name, tags }); },
      timing: (name: string, durationMs: number, tags?: Record<string, string>): void => { recordedMetrics.push({ delta: durationMs, name, tags }); }
    };
  })();

  let connection: Nullable<AbortController> = new AbortController();

  const host: CommandHost = {

    bus,
    connectionScope: (): ConnectionScope => ((connection === null) ? { kind: "none" } : { kind: "attached", signal: connection.signal }),
    deviceIdForKey: overrides.deviceIdForKey ?? ((): number | undefined => undefined),
    keyForId: overrides.keyForId ?? ((): Nullable<number> => null),
    log: logger,
    metrics: sink,
    resolveSchema: (entityType: string) => (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType],
    send: overrides.send ?? ((type: number, payload: Buffer): void => { frames.push({ payload, type }); })
  };

  return { bus, frames, host, logger, metrics: recordedMetrics, setConnection: (controller: Nullable<AbortController>): void => { connection = controller; } };
};

// Bend the brand to mint a structurally-malformed branded id without going through the runtime mint (which always produces a well-formed `<type>-<objectId>` string).
// This is the only place in this file we do this - tests need it to exercise the malformed-id branches in the runners.
const malformedId = <T extends string>(raw: string): EntityId<T extends "light" ? "light" : T extends "switch" ? "switch" : never> => {

  return raw as unknown as EntityId<T extends "light" ? "light" : T extends "switch" ? "switch" : never>;
};

// 1 Exports - every exported function/type/value referenced from a real test below.

describe("command-runner - module exports", () => {

  test("runCommand is an exported function", () => {

    assert.equal(typeof runCommand, "function");
  });

  test("runCommandAndAwait is an exported function", () => {

    assert.equal(typeof runCommandAndAwait, "function");
  });
});

// 2 Branches + 4 Exports + 8 Edge - runCommand happy paths through the full encode + adapter + send path.

describe("runCommand - happy paths through the full pipeline", () => {

  test("encodes a switch command, frames-and-sends through the CommandHost, emits the metric", () => {

    const bundle = mockHost({ keyForId: (): number => 42 });
    const id = entityId("switch", "front_door");

    runCommand(bundle.host, id, { state: true });

    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.frames[0]?.type, MessageType.SWITCH_COMMAND_REQUEST);
    assert.ok(bundle.frames[0]?.payload.length > 0);

    const sent = bundle.metrics.find((m) => m.name === "entity.commands.sent");

    assert.ok(sent);
    assert.equal(sent?.delta, 1);
    assert.deepEqual(sent?.tags, { type: "switch" });
  });

  test("light's COMMAND_ADAPTERS rgb expansion runs before encode (rgb -> red/green/blue/hasRgb)", () => {

    const bundle = mockHost({ keyForId: (): number => 7 });
    const id = entityId("light", "kitchen");

    runCommand(bundle.host, id, { rgb: { b: 0.2, g: 0.5, r: 1 }, state: true });

    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.frames[0]?.type, MessageType.LIGHT_COMMAND_REQUEST);

    // The encoded payload must contain the four expanded fields (red/green/blue/hasRgb), not the rgb object. We verify by encoding length sanity - an unexpanded rgb
    // would have failed at the encoder boundary because the schema doesn't declare an `rgb` field.
    assert.ok(bundle.frames[0]?.payload.length > 8);

    // Unrecognized options were not reported - all keys were processed.
    assert.equal(bundle.logger.debugged.filter((d) => d.includes("unrecognized option")).length, 0);
  });

  test("siren's COMMAND_ADAPTERS duration round runs before encode (1.6 -> 2)", () => {

    const bundle = mockHost({ keyForId: (): number => 9 });
    const id = entityId("siren", "doorbell");

    runCommand(bundle.host, id, { duration: 1.6, state: true });

    // The frame was sent. The siren adapter rounded duration to 2 before encoding.
    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.frames[0]?.type, MessageType.SIREN_COMMAND_REQUEST);
  });

  test("logs the per-command debug line through the CommandHost", () => {

    const bundle = mockHost({ keyForId: (): number => 11 });
    const id = entityId("switch", "garage");

    runCommand(bundle.host, id, { state: false });

    const debug = bundle.logger.debugged.find((d) => d.includes("sendEntityCommand"));

    assert.ok(debug);
    assert.ok(debug?.includes("type: switch"));
    assert.ok(debug?.includes("KEY: 11"));
  });

  test("forwards the registry-resolved device_id into the encoder", () => {

    let receivedDeviceIdLookup: number | undefined;

    const bundle = mockHost({

      deviceIdForKey: (key: number): number | undefined => {

        receivedDeviceIdLookup = key;

        return 99;
      },
      keyForId: (): number => 42
    });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(receivedDeviceIdLookup, 42);
    assert.equal(bundle.frames.length, 1);
  });

  test("water_heater command aggregates multiple options into the bitmask field per WaterHeaterCommandHasField", async () => {

    const { decodeProtobuf } = await import("./protocol/codec.ts");

    const bundle = mockHost({ keyForId: (): number => 88 });

    runCommand(bundle.host, entityId("water_heater", "tank"), { mode: "heat_pump", targetTemperature: 60 });

    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.frames[0]?.type, MessageType.WATER_HEATER_COMMAND_REQUEST);

    const fields = decodeProtobuf(bundle.frames[0].payload, { maxFieldsPerMessage: 16 });

    // has_fields (field 2) must equal HAS_MODE (1) | HAS_TARGET_TEMPERATURE (2) = 3.
    assert.equal(fields[2]?.[0], 3);
    // mode (field 3) must equal WATER_HEATER_MODE_HEAT_PUMP (5).
    assert.equal(fields[3]?.[0], 5);
    // target_temperature (field 4) is a fixed32 float; the schema decodes it as a number for telemetry but the raw bytes round-trip via the codec.
    assert.ok(fields[4]?.[0] !== undefined);
  });

  test("water_heater command emits only the bit for the option supplied", async () => {

    const { decodeProtobuf } = await import("./protocol/codec.ts");

    const bundle = mockHost({ keyForId: (): number => 88 });

    runCommand(bundle.host, entityId("water_heater", "tank"), { targetTemperatureLow: 45 });

    const fields = decodeProtobuf(bundle.frames[0]!.payload, { maxFieldsPerMessage: 16 });

    // has_fields must equal HAS_TARGET_TEMPERATURE_LOW (8) only.
    assert.equal(fields[2]?.[0], 8);
    // No HAS_MODE bit, no mode field on the wire.
    assert.equal(fields[3], undefined);
  });
});

// 3 Errors + 4 Branches - runCommand silent-drop paths.

describe("runCommand - fire-and-forget error paths warn-and-drop without throwing", () => {

  test("warn-and-drop on a malformed branded id (no dash separator)", () => {

    const bundle = mockHost();
    const id = malformedId<"light">("nodash");

    assert.doesNotThrow((): void => runCommand(bundle.host, id, { state: true }));
    assert.equal(bundle.frames.length, 0);
    assert.ok(bundle.logger.warned.some((w) => w.includes("malformed entity id")));
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0);
  });

  test("warn-and-drop on a malformed branded id (dash at index 0)", () => {

    const bundle = mockHost();
    const id = malformedId<"light">("-prefix");

    assert.doesNotThrow((): void => runCommand(bundle.host, id, { state: true }));
    assert.equal(bundle.frames.length, 0);
    assert.ok(bundle.logger.warned.some((w) => w.includes("malformed entity id")));
  });

  test("warn-and-drop with key_not_found when the registry has no key for the id", () => {

    const bundle = mockHost({ keyForId: (): Nullable<number> => null });

    runCommand(bundle.host, entityId("switch", "missing"), { state: true });

    assert.equal(bundle.frames.length, 0);
    assert.ok(bundle.logger.warned.some((w) => w.includes("Entity key not found")));
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0);
  });

  test("warn-and-drop with schema_unknown when the entity type prefix isn't a known schema", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });
    const id = malformedId<"light">("notatype-x");

    runCommand(bundle.host, id, { state: true });

    assert.equal(bundle.frames.length, 0);
    assert.ok(bundle.logger.warned.some((w) => w.includes("Unknown entity type: notatype")));
  });

  test("warn-and-drop with command_unsupported when the entity type has no command schema (sensor)", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });
    const id = malformedId<"light">("sensor-temp");

    runCommand(bundle.host, id, { state: true });

    assert.equal(bundle.frames.length, 0);
    assert.ok(bundle.logger.warned.some((w) => w.includes("does not support commands")));
  });

  test("warn-and-drop with value_out_of_range when a command field falls outside its integer domain (datetime epochSeconds)", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    assert.doesNotThrow((): void => runCommand(bundle.host, entityId("datetime", "alarm"), { epochSeconds: -1 }));
    assert.equal(bundle.frames.length, 0);
    assert.deepEqual(bundle.logger.warned, ["Command for datetime dropped: field 'epochSeconds' received out-of-range value '-1'."]);
    assert.ok(bundle.logger.warned.some((w) => w.includes("out-of-range")));
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0);
  });
});

// 4 Branches + 8 Edge - adapter dispatch logic.

describe("runCommand - COMMAND_ADAPTERS dispatch", () => {

  test("light without rgb skips the adapter expansion (only state+brightness encoded)", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("light", "x"), { brightness: 0.4, state: true });

    assert.equal(bundle.frames.length, 1);
  });

  test("light's adapter rounds a floating-point transitionLength before the encoder's integer check, so the command sends", async () => {

    const { decodeProtobuf } = await import("./protocol/codec.ts");
    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("light", "x"), { state: true, transitionLength: 0.1 * 3 * 1000 });

    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.logger.warned.length, 0);

    const fields = decodeProtobuf(bundle.frames[0]!.payload, { maxFieldsPerMessage: 32 });

    // transition_length is field 15 on LightCommandRequest; the adapter rounded 300.00000000000006 to 300.
    assert.equal(fields[15]?.[0], 300);
  });

  test("siren without duration skips the adapter rounding", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("siren", "x"), { state: true });

    assert.equal(bundle.frames.length, 1);
  });

  test("entity types without a registered adapter encode the options unchanged (switch)", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(bundle.frames.length, 1);
  });
});

// 8 Edge + 11 Negative - unrecognized options + metric absence.

describe("runCommand - unrecognized options + metrics zero-cost path", () => {

  test("reports unrecognized option keys at debug level via reportUnrecognizedOptions", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("switch", "x"), { junk: 1, state: true } as never);

    assert.ok(bundle.logger.debugged.some((d) => d.includes("unrecognized option 'junk'")));
  });

  test("does NOT emit the metric when no metrics sink was supplied (zero-cost path)", () => {

    const bundle = mockHost({ keyForId: (): number => 1, metricsSink: undefined });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(bundle.frames.length, 1);
    assert.equal(bundle.metrics.length, 0);
  });

  test("does NOT subscribe to events (runCommand is fire-and-forget)", () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    // No listeners on any entity-type channel.
    assert.equal(bus.listenerCount("switch"), 0);
    assert.equal(bus.listenerCount("light"), 0);
  });
});

// 9 Hot - runCommand realistic-load test.

describe("runCommand - hot path", () => {

  test("dispatches 10000 commands without throwing or leaking listeners", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    for(let i = 0; i < 10000; i++) {

      runCommand(bundle.host, entityId("switch", "x"), { state: (i % 2) === 0 });
    }

    assert.equal(bundle.frames.length, 10000);

    const sentCount = bundle.metrics.filter((m) => m.name === "entity.commands.sent").length;

    assert.equal(sentCount, 10000);
  });
});

// 10 Values - boundary input shapes.

describe("runCommand - boundary input shapes", () => {

  test("empty options object encodes (only the key field is sent)", () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("switch", "x"), {});

    assert.equal(bundle.frames.length, 1);
  });

  test("undefined deviceId from the CommandHost means the encoder omits the device_id field", () => {

    const bundle = mockHost({ deviceIdForKey: (): number | undefined => undefined, keyForId: (): number => 1 });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(bundle.frames.length, 1);
  });

  test("zero key (the registry's first-registered entity) encodes correctly", () => {

    const bundle = mockHost({ keyForId: (): number => 0 });

    runCommand(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(bundle.frames.length, 1);
  });
});

// runCommandAndAwait happy paths - cover 1 Exports, 4 Branches, 5 Async resolved boundary, 6 Narrowing.

describe("runCommandAndAwait - happy paths", () => {

  test("resolves with the next state event whose key matches the resolved target", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 42,
      send: (): void => {

        // Fast device responds synchronously with a matching state event. Pre-subscribe ordering means the listener is already attached.
        bus.emit("switch", { entity: "x", key: 42, state: true, type: "switch" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(result.key, 42);
    assert.equal(result.state, true);
  });

  test("resolves with the first matching event when multiple events arrive (first-match semantics)", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 7,
      send: (): void => {

        bus.emit("light", { entity: "x", key: 7, state: false, type: "light" });
        bus.emit("light", { entity: "x", key: 7, state: true, type: "light" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("light", "x"), { state: true });

    assert.equal(result.state, false);
  });

  test("non-matching keys are skipped; the first matching key wins", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 5,
      send: (): void => {

        bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" });
        bus.emit("switch", { entity: "x", key: 99, state: false, type: "switch" });
        bus.emit("switch", { entity: "x", key: 5, state: true, type: "switch" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(result.key, 5);
  });
});

// 3 Errors - typed throws on misuse.

describe("runCommandAndAwait - typed error paths", () => {

  test("throws ConfigurationError(MALFORMED_ENTITY_ID) on a malformed branded id", async () => {

    const bundle = mockHost();

    await assert.rejects(
      runCommandAndAwait(bundle.host, malformedId<"light">("nodash"), { state: true }),
      { code: "MALFORMED_ENTITY_ID", constructor: ConfigurationError }
    );
  });

  test("throws ConfigurationError(UNKNOWN_ENTITY_ID) when the registry has no key for the id", async () => {

    const bundle = mockHost({ keyForId: (): Nullable<number> => null });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "missing"), { state: true }),
      { code: "UNKNOWN_ENTITY_ID", constructor: ConfigurationError }
    );
  });

  test("rejects with a plain Error naming the bus when the bus is disposed before a matching event arrives", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => {

        // Dispose the bus synchronously; the open stream ends cleanly without a matching event.
        bus.dispose();
      }
    });

    // Only the bus ending the stream reaches the runner's tail, which no connection lifecycle causes, so the rejection carries no public class or code. The object
    // form's exact constructor refuses any EspHomeError subclass.
    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }),
      { constructor: Error, message: /^commandAndAwait\(\): the event bus ended the wait before a matching state event arrived\.$/ }
    );
  });
});

// 3 Errors - an encode refusal rejects at once with a typed code, before any stream opens or any frame sends.

describe("runCommandAndAwait - encode refusals reject at once with a typed code", () => {

  // Each case is a registered key whose command the encoder refuses. The await runs with a generous timeout: a refusal that fell through to the stream would reject
  // with the timeout's TimeoutError instead of the refusal code, and the listener count read right after the call would show the open stream.
  const cases: readonly { channel: keyof ClientEventsMap; code: string; id: EntityId<CommandAndAwaitable>; name: string; options: unknown }[] = [

    { channel: "notatype" as keyof ClientEventsMap, code: "SCHEMA_UNKNOWN", id: malformedId<"switch">("notatype-x"), name: "an entity type with no schema",
      options: { state: true } },
    { channel: "sensor", code: "COMMAND_UNSUPPORTED", id: malformedId<"switch">("sensor-temp"), name: "an entity type without a command schema",
      options: { state: true } },
    { channel: "climate", code: "ENUM_VALUE_UNKNOWN", id: entityId("climate", "thermostat"), name: "an unknown enum alias", options: { mode: "freze" } },
    { channel: "datetime", code: "VALUE_OUT_OF_RANGE", id: entityId("datetime", "alarm"), name: "an out-of-range value", options: { epochSeconds: -1 } }
  ];

  for(const { channel, code, id, name, options } of cases) {

    test("rejects " + name + " with ConfigurationError(" + code + "), opening no stream and sending nothing", async () => {

      const bus = new EventBus<ClientEventsMap>();
      const bundle = mockHost({ bus, keyForId: (): number => 1 });
      const pending = runCommandAndAwait(bundle.host, id, options as never, { timeoutMs: 5000 });

      assert.equal(bus.listenerCount(channel), 0, "a refused command must not open the state stream");

      await assert.rejects(pending, { code, constructor: ConfigurationError });
      assert.equal(bundle.frames.length, 0);
      assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0);
    });
  }

  test("names the refused field and value in the rejection message", async () => {

    const bundle = mockHost({ keyForId: (): number => 1 });

    await assert.rejects(runCommandAndAwait(bundle.host, entityId("datetime", "alarm"), { epochSeconds: -1 }, { timeoutMs: 5000 }), {

      message: "commandAndAwait(): command for datetime-alarm refused before sending (VALUE_OUT_OF_RANGE): field 'epochSeconds' received out-of-range value '-1'."
    });
  });

  test("an accepted command is encoded and sent exactly once", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 3,
      send: (): void => {

        bus.emit("switch", { entity: "x", key: 3, state: true, type: "switch" });
      }
    });

    await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(bundle.logger.debugged.filter((d) => d.includes("sendEntityCommand")).length, 1, "the command is encoded once");
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 1, "the command is sent once");
  });
});

// 5 Async - abort/timeout boundaries (resolved + rejected + pre-aborted + aborted-mid-operation).

describe("runCommandAndAwait - abort + timeout boundaries", () => {

  test("rejects with TimeoutError when the timeout fires before any matching event", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { timeoutMs: 30 }),
      { constructor: DOMException, name: "TimeoutError" }
    );
  });

  test("rejects when a pre-aborted caller signal is supplied, with its reason as it is, sending nothing and counting nothing", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });
    const controller = new AbortController();

    controller.abort(new Error("preaborted"));

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { signal: controller.signal, timeoutMs: 5000 }),
      (err: unknown): boolean => err === controller.signal.reason
    );

    // A reason that is no Error comes back as itself too.
    const stringController = new AbortController();

    stringController.abort("preaborted");

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { signal: stringController.signal, timeoutMs: 5000 }),
      (err: unknown): boolean => err === "preaborted"
    );
    assert.equal(bundle.frames.length, 0, "a pre-aborted command sends no frame");
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0, "a pre-aborted command counts no send");
  });

  test("aborts mid-stream when the caller's signal fires after the subscribe but before any event matches", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });
    const controller = new AbortController();
    const reason = new Error("user-cancelled");

    setTimeout((): void => { controller.abort(reason); }, 25);

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { signal: controller.signal, timeoutMs: 5000 }),
      (err: unknown): boolean => err === reason
    );
  });

  test("a command await issued with no timeoutMs asks the platform for a timeout of the documented default", async (t) => {

    // A mock with no implementation passes each call through to the platform, so the await builds its real timeout while the mock records the milliseconds asked for.
    const timeout = t.mock.method(AbortSignal, "timeout");
    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => {

        bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" });
      }
    });

    await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true });

    // The expected value is the literal the timeoutMs field documents rather than the runner's constant, because a value read from the constant would agree with any
    // default the runner held.
    assert.deepEqual(timeout.mock.calls.map((call) => call.arguments[0]), [2000], "the await asks the platform for one timeout of the documented default");
  });
});

// The connection scope: admission before anything else, and a teardown ending the wait.

describe("runCommandAndAwait - connection admission and teardown", () => {

  test("a teardown of the connection rejects a pending wait with the connection-lost error it was aborted with", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });
    const connection = new AbortController();
    const lost = connectionLostError();

    bundle.setConnection(connection);

    const pending = runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { timeoutMs: 1000 });

    connection.abort(lost);

    await assert.rejects(pending, (err: unknown): boolean => err === lost);
  });

  test("a call with no connection is refused with NOT_CONNECTED ahead of validation, opening no stream, sending nothing, and counting nothing", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({ bus, keyForId: (): number => 1 });

    bundle.setConnection(null);

    const pending = runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { timeoutMs: 1000 });

    assert.equal(bus.listenerCount("switch"), 0, "a refused command must not open the state stream");
    await assert.rejects(pending, { code: "NOT_CONNECTED", constructor: NotConnectedError });

    // The admission runs ahead of validation, so a malformed id reports the missing connection rather than the id.
    await assert.rejects(runCommandAndAwait(bundle.host, malformedId<"light">("nodash"), { state: true }), { code: "NOT_CONNECTED", constructor: NotConnectedError });
    assert.equal(bundle.frames.length, 0, "a refused command sends no frame");
    assert.equal(bundle.metrics.filter((m) => m.name === "entity.commands.sent").length, 0, "a refused command counts no send");
  });
});

// Pre-subscribe ordering - the architectural keystone of commandAndAwait.

describe("runCommandAndAwait - pre-subscribe ordering guarantee", () => {

  test("captures a synchronously-emitted state event during the send call (subscribe runs BEFORE send)", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const callOrder: string[] = [];

    // Track invocation ordering via a wrapping EventBus subscription assertion. The send hook synchronously emits the matching event; if subscribe ran first, the
    // event queues into the BackpressureStream and the for-await pulls it. If send ran first, the listener wouldn't be attached and the event would be lost; the
    // await would hang until timeout.
    const bundle = mockHost({

      bus,
      keyForId: (): number => 100,
      // Both parameters carry the underscore prefix: the hook needs neither, and spelling them out keeps the mock's shape readable against the wire callback contract.
      send: (_type: number, _payload: Buffer): void => {

        callOrder.push("send");

        // Verify that bus.stream() already attached its listener by the time send runs. listenerCount > 0 proves pre-subscribe.
        assert.ok(bus.listenerCount("light") > 0, "stream listener attached before send fires");

        bus.emit("light", { entity: "x", key: 100, state: true, type: "light" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("light", "fast_device"), { state: true }, { timeoutMs: 1000 });

    assert.deepEqual(callOrder, ["send"]);
    assert.equal(result.key, 100);
    assert.equal(result.state, true);
  });

  test("multiple synchronous emits during send are all queued; the matching key wins regardless of ordering", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 50,
      send: (): void => {

        // A burst of state events arrives synchronously; the BackpressureStream's queue captures all of them.
        bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" });
        bus.emit("switch", { entity: "x", key: 2, state: false, type: "switch" });
        bus.emit("switch", { entity: "x", key: 50, state: true, type: "switch" });
        bus.emit("switch", { entity: "x", key: 99, state: false, type: "switch" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { timeoutMs: 1000 });

    assert.equal(result.key, 50);
  });
});

// 8 Edge + predicate normalization - sync, async, throw, reject.

describe("runCommandAndAwait - predicate normalization (Promise.try shim semantics)", () => {

  test("sync predicate returning true accepts the first key-matching event", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 7,
      send: (): void => { bus.emit("switch", { entity: "x", key: 7, state: false, type: "switch" }); }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: false }, { predicate: (e): boolean => e.state === false });

    assert.equal(result.state, false);
  });

  test("sync predicate returning false skips events; later accept resolves", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 7,
      send: (): void => {

        bus.emit("switch", { entity: "x", key: 7, state: false, type: "switch" });
        bus.emit("switch", { entity: "x", key: 7, state: true, type: "switch" });
      }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { predicate: (e): boolean => e.state === true });

    assert.equal(result.state, true);
  });

  test("async predicate (Promise<boolean>) is awaited", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => { bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" }); }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, {

      predicate: async (e): Promise<boolean> => {

        await Promise.resolve();

        return e.key === 1;
      }
    });

    assert.equal(result.key, 1);
  });

  test("predicate that throws synchronously rejects the await with the thrown error", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => { bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" }); }
    });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, {

        predicate: (): boolean => { throw new Error("predicate-bug"); }
      }),
      { constructor: Error, message: "predicate-bug" }
    );
  });

  test("predicate that returns a rejected promise rejects the await", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => { bus.emit("switch", { entity: "x", key: 1, state: true, type: "switch" }); }
    });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, {

        predicate: async (): Promise<boolean> => Promise.reject(new Error("async-bug"))
      }),
      { constructor: Error, message: "async-bug" }
    );
  });

  test("default predicate (no predicate supplied) accepts the first key-matching event", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 1,
      send: (): void => { bus.emit("switch", { entity: "x", key: 1, state: false, type: "switch" }); }
    });

    const result = await runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true });

    assert.equal(result.state, false);
  });
});

// 6 Narrowing + 11 Negative - key-matching guards.

describe("runCommandAndAwait - key-matching narrowing guards", () => {

  test("events for the wrong key are skipped (no spurious resolution)", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 100,
      send: (): void => {

        // None of these match key 100.
        bus.emit("light", { entity: "x", key: 1, state: true, type: "light" });
        bus.emit("light", { entity: "x", key: 2, state: true, type: "light" });
        bus.emit("light", { entity: "x", key: 3, state: true, type: "light" });
      }
    });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("light", "x"), { state: true }, { timeoutMs: 30 }),
      Error
    );
  });

  test("events on a different entity-type channel are NOT delivered to the await", async () => {

    const bus = new EventBus<ClientEventsMap>();
    const bundle = mockHost({

      bus,
      keyForId: (): number => 5,
      send: (): void => {

        // Emit on the wrong channel.
        bus.emit("light", { entity: "x", key: 5, state: true, type: "light" });
      }
    });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "x"), { state: true }, { timeoutMs: 30 }),
      Error
    );
  });
});

// 11 Negative + 3 Errors - the fire-and-forget runner's warn-and-drop never masks the awaited runner's typed throws.

describe("runCommandAndAwait - typed throws are never masked by the fire-and-forget drop", () => {

  test("malformed id is caught at stage 1 before anything encodes or sends (typed throw, not silent drop)", async () => {

    const bundle = mockHost();

    await assert.rejects(
      runCommandAndAwait(bundle.host, malformedId<"light">("nodash"), { state: true }),
      { code: "MALFORMED_ENTITY_ID", constructor: ConfigurationError }
    );

    // No frames sent and no fire-and-forget malformed-id warn: the throw at stage 1 comes before anything encodes or sends.
    assert.equal(bundle.frames.length, 0);
    assert.equal(bundle.logger.warned.filter((w) => w.includes("command(): malformed entity id")).length, 0);
  });

  test("unknown id is caught at stage 2 before anything encodes or sends (typed throw)", async () => {

    const bundle = mockHost({ keyForId: (): Nullable<number> => null });

    await assert.rejects(
      runCommandAndAwait(bundle.host, entityId("switch", "missing"), { state: true }),
      { code: "UNKNOWN_ENTITY_ID", constructor: ConfigurationError }
    );

    assert.equal(bundle.frames.length, 0);
  });
});

// 7 Boundary - every public surface that exists.

describe("command-runner - public boundary surface", () => {

  test("CommandHost interface is structurally compatible with a hand-rolled object", () => {

    const host: CommandHost = {

      bus: new EventBus<ClientEventsMap>(),
      connectionScope: (): ConnectionScope => ({ kind: "none" }),
      deviceIdForKey: (): undefined => undefined,
      keyForId: (): null => null,
      log: { debug: (): void => { /* no-op */ }, error: (): void => { /* no-op */ }, info: (): void => { /* no-op */ }, warn: (): void => { /* no-op */ } },
      metrics: undefined,
      resolveSchema: (entityType: string) => (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType],
      send: (): void => { /* no-op */ }
    };

    assert.equal(typeof host.send, "function");
  });

  test("runCommand is callable with the minimal CommandHost surface", () => {

    const host: CommandHost = {

      bus: new EventBus<ClientEventsMap>(),
      connectionScope: (): ConnectionScope => ({ kind: "none" }),
      deviceIdForKey: (): undefined => undefined,
      keyForId: (): number => 1,
      log: { debug: (): void => { /* no-op */ }, error: (): void => { /* no-op */ }, info: (): void => { /* no-op */ }, warn: (): void => { /* no-op */ } },
      metrics: undefined,
      resolveSchema: (entityType: string) => (ENTITY_SCHEMAS as Record<string, EntitySchema>)[entityType],
      send: (): void => { /* no-op */ }
    };

    assert.doesNotThrow((): void => runCommand(host, entityId("switch", "x"), { state: true }));
  });
});
