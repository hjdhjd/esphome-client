/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: Public test helpers for esphome-client consumers.
 */

/**
 * Public test helpers for downstream consumers (Homebridge plugins, libraries built on top of esphome-client).
 *
 * @remarks This subpath is published as `esphome-client/testing`. Import via:
 *
 * ```ts
 * import { MockClient, mockEntity, mockStateMessage } from "esphome-client/testing";
 * ```
 *
 * This subpath exposes:
 *
 * - {@link MockClient} - high-level, in-memory implementation of the public {@link EspHomeClient} surface. Tests of consumer
 *   code that reacts to client behavior should use this layer; bytes never enter the picture.
 *
 * - Factory helpers ({@link mockEntity}, {@link mockEntityDiscovery}, {@link mockStateMessage}, {@link mockDeviceInfo}, {@link mockHealth}) build typed fixtures
 *   consumed by the `MockClient` seed methods (`populate*`, `setHealth`) and any future low-level test harness.
 *
 * SemVer: this subpath follows the same SemVer commitment as the main entry point. Breaking changes here are documented in the changelog.
 *
 * @module testing
 */

export * from "./factories.ts";
export * from "./mock-client.ts";
export * from "./mock-transport.ts";
// The recording-mock factory's MOCK symbol and MockController surface are part of the public test API - consumer code that captures recorded calls via
// `mock.bluetooth[MOCK].calls` needs both to be importable from `esphome-client/testing`. The factory function itself is internal infrastructure (MockClient uses it
// internally to mint sub-API mocks), so it is NOT re-exported. The internal `type-assertions.ts` helper module is likewise intentionally absent.
export { MOCK } from "./recording-mock.ts";
export type { MockController, RecordedSubApiCall } from "./recording-mock.ts";
