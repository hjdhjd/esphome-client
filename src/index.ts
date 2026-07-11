/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: Public API surface for the ESPHome client library.
 */

/**
 * Public API barrel for the ESPHome client. Every consumer-facing symbol is re-exported here; per-symbol JSDoc lives at the symbol's defining module so each contract
 * has a single canonical home.
 *
 * @remarks Consumers should import from the package root (`import { openEspHomeClient, entityId, ConfigurationError } from "esphome-client"`); deep imports into the
 * compiled `dist/` paths are not part of the public contract. Test helpers ship under the conditional export `esphome-client/testing`; they are intentionally not
 * re-exported here so production bundles don't pull in the mock-transport surface.
 *
 * The set of barreled modules covers the connection/lifecycle surface (`esphome-client`, `lifecycle`, `health`, `reconnect`, `capabilities`), the entity model
 * (`entity-id`, `schemas`, `sub-device`), the named wire-enum constants (`api-constants`) and the API feature-version table (`api-feature-versions`), the sub-APIs
 * (`bluetooth-proxy`, `camera`, `home-assistant`, `serial-proxy`, `user-services`, `voice-assistant`, `zwave-proxy`), the typed error hierarchy (`errors`), the
 * stream backpressure options, and the protocol-level primitives (`protocol`, `crypto-noise`, `types`).
 *
 * @module esphome-client
 */
export * from "./api-constants.ts";
export * from "./api-feature-versions.ts";
export * from "./bluetooth-proxy.ts";
export * from "./camera.ts";
export * from "./capabilities.ts";
export * from "./crypto-noise.ts";
export * from "./entity-id.ts";
export * from "./errors.ts";
export * from "./esphome-client.ts";
export type { StreamBackpressureMode, StreamOptions } from "./event-bus.ts";
export * from "./health.ts";
export * from "./home-assistant.ts";
export * from "./lifecycle.ts";
export * from "./protocol/index.ts";
export * from "./reconnect.ts";
export * from "./schemas/index.ts";
export * from "./serial-proxy.ts";
export * from "./sub-device.ts";
export * from "./types.ts";
export * from "./user-services.ts";
export * from "./voice-assistant.ts";
export * from "./zwave-proxy.ts";

