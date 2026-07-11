/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * espc.types.ts: Type-level drift-guard pinning that both the real client and the test mock satisfy the CLI's client dependency contract.
 */

/**
 * Compile-time drift-guard for the CLI's client dependency contract. {@link CliClient} is the segregated interface the extracted CLI command-logic functions
 * consume; this file asserts that BOTH the real {@link EspHomeClient} and the {@link MockClient} structurally satisfy it, so a
 * method the CLI needs can never silently leave the real client (breaking the binary) or the mock (silently weakening the unit tests). A divergence in either is a
 * typecheck error here.
 *
 * @module util/espc.types
 */
import type { Assert, Extends } from "../internal/type-assertions.ts";
import type { CliClient } from "./espc.ts";
import type { EspHomeClient } from "../esphome-client.ts";
import type { MockClient } from "../testing/mock-client.ts";

/** The real client must expose everything the CLI consumes. */
type _EspHomeClientSatisfiesCliClient = Assert<Extends<EspHomeClient, CliClient>>;

/** The mock must expose everything the CLI consumes, so the unit tests exercise the real contract. */
type _MockClientSatisfiesCliClient = Assert<Extends<MockClient, CliClient>>;

export type { _EspHomeClientSatisfiesCliClient, _MockClientSatisfiesCliClient };
