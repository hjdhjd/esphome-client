/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.test.ts: End-to-end record/replay drive through the capture subsystem.
 */

/*
 * Drives the replay half of the capture subsystem end-to-end. We synthesize a capture binary from a simulator scenario's validated inbound wire fixtures, then replay
 * it through replayCapture - which feeds the frames through a MockTransport into a real EspHomeClient and reports what the host observed. This exercises the full
 * decode-and-drive path (handshake, discovery, state) with no live device, which is exactly what a real-device capture replays through.
 */
import { encodeCaptureFrames, replayCapture, replayCaptureFrames } from "../../src/util/capture.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { ALL_SCENARIOS } from "../simulator/scenarios/index.ts";
import type { InboundMessage } from "../../src/transport.ts";
import { MessageType } from "../../src/protocol/index.ts";
import type { Scenario } from "../simulator/simulator.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("capture replay - end-to-end drive from synthesized fixtures", () => {

  // The untriggered inbound frames are the full plaintext stream the host consumes during a connect - handshake, discovery, and the trailing switch state. This is the
  // exact frame-build the replay tests share, so we single-source it here rather than repeating the filter/map at every call site.
  const scenarioFrames = (scenario: Scenario): InboundMessage[] => scenario.inbound.filter((frame) => frame.trigger === undefined).map((frame) => ({ payload: frame.payload, type: frame.type }));

  test("a basic-discovery capture replays to device info, the discovered entity, and the state event", async () => {

    const scenario = ALL_SCENARIOS.find((entry) => entry.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");
    assert.ok(scenario.expectedReplay, "basic-discovery scenario must declare expectedReplay");

    const frames = scenarioFrames(scenario);
    const binary = encodeCaptureFrames(frames);
    const directory = await mkdtemp(join(tmpdir(), "espc-capture-"));
    const binaryPath = join(directory, "basic-discovery.bin");

    await writeFile(binaryPath, binary);

    try {

      const result = await replayCapture({ binaryPath });

      // The full observed shape (device name, the one discovered entity, and the single SWITCH_STATE_RESPONSE telemetry event) must equal the scenario's declared
      // expectation; the frame count is tautological against the input, so we check it separately.
      assert.deepEqual({ deviceName: result.deviceName, entityCount: result.entityCount, telemetryEventCount: result.telemetryEventCount }, scenario.expectedReplay);
      assert.equal(result.frameCount, frames.length);
    } finally {

      await rm(directory, { force: true, recursive: true });
    }
  });

  test("an empty capture replays as a no-op", async () => {

    const result = await replayCaptureFrames([]);

    assert.equal(result.frameCount, 0);
    assert.equal(result.entityCount, 0);
    assert.equal(result.deviceName, null);
  });

  // The 500ms timeout is a regression guard on the disposal path: replayCapture tears the client down synchronously because there is no live peer. If a graceful
  // `await using` disconnect were reintroduced, the peerless MockTransport would never answer the DISCONNECT_REQUEST and disposal would stall ~1000ms (and exit 13 under
  // a bare process), blowing this bound. A correct synchronous teardown completes the whole replay in single-digit milliseconds.
  test("a capture whose DEVICE_INFO_RESPONSE follows LIST_ENTITIES_DONE_RESPONSE still replays", { timeout: 500 }, async () => {

    const scenario = ALL_SCENARIOS.find((entry) => entry.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");
    assert.ok(scenario.expectedReplay, "basic-discovery scenario must declare expectedReplay");

    // We rebuild the basic-discovery stream the same way the happy-path test does, then reorder it so DEVICE_INFO_RESPONSE sits immediately after the
    // LIST_ENTITIES_DONE_RESPONSE sentinel. This mirrors the real-device wire order (a ratgdo at API 1.14 sends device-info after the done sentinel). Splitting the
    // capture at the first run-phase state frame keeps device-info in the setup slice the connect consumes, so discovery resolves it during connect rather than after
    // the run phase begins.
    const base = scenarioFrames(scenario);
    const devInfo = base.filter((frame) => frame.type === MessageType.DEVICE_INFO_RESPONSE);
    const withoutDevInfo = base.filter((frame) => frame.type !== MessageType.DEVICE_INFO_RESPONSE);
    const doneAt = withoutDevInfo.findIndex((frame) => frame.type === MessageType.LIST_ENTITIES_DONE_RESPONSE);
    const frames: InboundMessage[] = [ ...withoutDevInfo.slice(0, doneAt + 1), ...devInfo, ...withoutDevInfo.slice(doneAt + 1) ];
    const result = await replayCaptureFrames(frames);

    // The reordered stream must yield the SAME observations as the natural-order basic-discovery replay, so we assert against the scenario's declared expectation
    // directly; the frame count is tautological against the input, so we check it separately.
    assert.deepEqual({ deviceName: result.deviceName, entityCount: result.entityCount, telemetryEventCount: result.telemetryEventCount }, scenario.expectedReplay);
    assert.equal(result.frameCount, frames.length);
  });

  test("an undrivable capture (no DEVICE_INFO_RESPONSE) fails fast rather than hanging", async () => {

    const scenario = ALL_SCENARIOS.find((entry) => entry.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");

    // We drop the DEVICE_INFO_RESPONSE frame entirely, so performDiscovery can never satisfy its `while(!deviceInfoReceived || !doneReceived)` loop against the
    // now-drained MockTransport. The connectTimeoutMs bound plus maxConstructionRetries: 0 makes the single attempt reject in roughly REPLAY_CONNECT_TIMEOUT_MS rather
    // than hanging.
    const frames: InboundMessage[] = scenario.inbound
      .filter((frame) => (frame.trigger === undefined) && (frame.type !== MessageType.DEVICE_INFO_RESPONSE))
      .map((frame) => ({ payload: frame.payload, type: frame.type }));

    await assert.rejects(replayCaptureFrames(frames));
  });

  test("a discovery-only capture with no state frames replays with zero telemetry", async () => {

    const scenario = ALL_SCENARIOS.find((entry) => entry.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");
    assert.ok(scenario.expectedReplay, "basic-discovery scenario must declare expectedReplay");

    // Drop the trailing state frame so the capture is discovery-only - HELLO, device-info, the entity list, and the done sentinel, with no run-phase telemetry. This
    // exercises replayCapture's no-state-frame branch (`firstStateIndex < 0` means the whole capture is the setup slice), which the other replay tests never reach.
    const frames: InboundMessage[] = scenario.inbound
      .filter((frame) => (frame.trigger === undefined) && (frame.type !== MessageType.SWITCH_STATE_RESPONSE))
      .map((frame) => ({ payload: frame.payload, type: frame.type }));
    const result = await replayCaptureFrames(frames);

    // Discovery still completes (every frame is in the setup slice the connect consumes), so device info and the entity are observed - we source those from the
    // scenario's declared expectation. The telemetry, however, is deliberately zero here: this test drops the one SWITCH_STATE_RESPONSE the scenario expects, so its
    // telemetry count is the intentional variation from `expectedReplay` and stays an explicit 0.
    assert.equal(result.deviceName, scenario.expectedReplay.deviceName);
    assert.equal(result.entityCount, scenario.expectedReplay.entityCount);
    assert.equal(result.frameCount, frames.length);
    assert.equal(result.telemetryEventCount, 0);
  });

  test("a capture with no LIST_ENTITIES_DONE_RESPONSE is rejected up front with a clear re-record message", async () => {

    const scenario = ALL_SCENARIOS.find((entry) => entry.name === "basic-discovery");

    assert.ok(scenario, "basic-discovery scenario must be registered");

    // Drop the done sentinel: discovery can never complete. The doneIndex guard must reject this synchronously with a clear "re-record" message rather than let it fall
    // through to the connect and surface as a generic ~5s timeout. We assert the SPECIFIC guard message, not a bare rejection: an undrivable capture also rejects via the
    // connectTimeoutMs fail-fast, so `assert.rejects(...)` alone would pass with or without the guard - only matching the guard's own message pins what the guard owns.
    const frames: InboundMessage[] = scenario.inbound
      .filter((frame) => (frame.trigger === undefined) && (frame.type !== MessageType.LIST_ENTITIES_DONE_RESPONSE))
      .map((frame) => ({ payload: frame.payload, type: frame.type }));

    await assert.rejects(replayCaptureFrames(frames), /no LIST_ENTITIES_DONE_RESPONSE frame/);
  });

  // Self-checking corpus: every scenario that declares an `expectedReplay` is its own single source of truth for what a replay should observe. Driving the scenario's
  // frames through the real replayCaptureFrames pipeline and asserting against that declared expectation means adding a future self-checking scenario is a matter of
  // declaring `expectedReplay` - no per-scenario test to write. This covers every scenario that declares expectedReplay, whichever those are at any given time.
  for(const scenario of ALL_SCENARIOS) {

    const expectedReplay = scenario.expectedReplay;

    if(expectedReplay === undefined) {

      continue;
    }

    test("scenario " + scenario.name + " replays to its declared expectedReplay", async () => {

      const frames = scenarioFrames(scenario);
      const result = await replayCaptureFrames(frames);

      // The three observed fields must equal the scenario's declared expectation; the frame count is tautological against the input, so we check it separately.
      assert.deepEqual({ deviceName: result.deviceName, entityCount: result.entityCount, telemetryEventCount: result.telemetryEventCount }, expectedReplay);
      assert.equal(result.frameCount, frames.length);
    });
  }
});
