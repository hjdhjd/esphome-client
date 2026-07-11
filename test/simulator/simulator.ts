/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * simulator.ts: Scenario-driven simulator that replays canned exchanges through MockTransport.
 */

/*
 * Simulator scaffolding. Each `Scenario` describes a sequence of inbound frames the simulator pushes into a `MockTransport`, plus the expected outbound frames the
 * host should emit in response. Tests instantiate the simulator with one of the named scenarios in `scenarios/`, attach assertions, and drive the host through
 * `const client = await openEspHomeClient({ ..., transportFactory: () => transport })`, disposing the client explicitly via `client[Symbol.dispose]()` once the
 * scenario has run.
 *
 * The framing ships with named scenarios that mirror the capture-replay set. The basic-discovery and v114-discovery scenarios carry full byte-level fixtures
 * synthesized via the library's own encoder; the rest are stubs awaiting real-device captures that will let the simulator and capture-replay layers
 * cross-validate the same exchanges.
 *
 * @module test/simulator
 */
import { Buffer } from "node:buffer";
import { type MockTransport } from "../../src/testing/index.ts";
import type { ReplaySummary } from "../../src/util/capture.ts";

/**
 * One inbound frame the simulator pushes. Frames with no `trigger` are pushed unconditionally at the start of the scenario.
 */
export interface InboundFrame {

  /**
   * Reserved for a future trigger-gated push: the intent is for the simulator to wait for the host to send a frame whose `type` matches before pushing this
   * inbound frame. The current {@link driveScenario} implementation does not yet honor this field - a frame with `trigger` set is never pushed.
   */
  trigger?: number;

  /**
   * Wire-side message type identifier.
   */
  type: number;

  /**
   * The message payload bytes.
   */
  payload: Buffer;
}

/**
 * What a replay of this scenario should observe - the {@link ReplaySummary} minus the tautological frame count.
 */
export type ReplayExpectation = Omit<ReplaySummary, "frameCount">;

/**
 * One scenario the simulator can drive through a {@link MockTransport}.
 */
export interface Scenario {

  /**
   * Human-readable scenario name. Matches the corresponding capture-replay fixture name.
   */
  name: string;

  /**
   * Inbound frames to push, in order.
   */
  inbound: ReadonlyArray<InboundFrame>;

  /**
   * Outbound message types the host is expected to send (in any order; the test asserts against the captured outbound list).
   */
  expectedOutbound: ReadonlyArray<number>;

  /**
   * What a replay of this scenario should observe when driven through the capture pipeline. Optional: only the self-checking scenarios declare it; the stubs omit it.
   */
  expectedReplay?: ReplayExpectation;
}

/**
 * Drive a scenario through a {@link MockTransport}. Pushes every inbound frame that has no `trigger` immediately; frames with `trigger` set are not yet honored
 * and are silently skipped (see {@link InboundFrame.trigger}).
 *
 * @param transport - The mock transport instance.
 * @param scenario - The scenario definition.
 */
export function driveScenario(transport: MockTransport, scenario: Scenario): void {

  for(const frame of scenario.inbound) {

    if(frame.trigger === undefined) {

      transport.pushInbound(frame.type, frame.payload);

      continue;
    }

    // For triggered frames, the test harness will watch `transport.outboundFrames` and push when a matching trigger arrives. The current scaffolding accepts the
    // expectation but performs no watch+push - that pass lands when full handshake-byte fixtures are available.
  }
}
