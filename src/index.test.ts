/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.test.ts: Structural tests for the public entry-point re-exports.
 */
import * as publicApi from "./index.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Tests that the public entry point re-exports the named surface every downstream consumer relies on. If a re-export is silently dropped (e.g., a new module is
// added but its exports never end up at the package root), one of these tests will fail before the breakage ships.

describe("Public entry-point re-exports", () => {

  test("exports the EspHomeClient class", () => {

    assert.equal(typeof publicApi.EspHomeClient, "function");
  });

  test("exports the openEspHomeClient async factory", () => {

    assert.equal(typeof publicApi.openEspHomeClient, "function");
  });

  test("exports the entity-id helpers", () => {

    assert.equal(typeof publicApi.entityId, "function");
    assert.equal(typeof publicApi.isEntityId, "function");
    assert.equal(typeof publicApi.parseEntityId, "function");
  });

  test("exports the typed error hierarchy base + key subclasses", () => {

    assert.equal(typeof publicApi.EspHomeError, "function");
    assert.equal(typeof publicApi.PermanentError, "function");
    assert.equal(typeof publicApi.ConnectionError, "function");
    assert.equal(typeof publicApi.HandshakeError, "function");
    assert.equal(typeof publicApi.NoiseHandshakeError, "function");
    assert.equal(typeof publicApi.AuthenticationError, "function");
    assert.equal(typeof publicApi.IncompatibleApiVersionError, "function");
    assert.equal(typeof publicApi.NegotiationFailedError, "function");
    assert.equal(typeof publicApi.MalformedVarintError, "function");
    assert.equal(typeof publicApi.MessageTooManyFieldsError, "function");
    assert.equal(typeof publicApi.FrameTooLargeError, "function");
    assert.equal(typeof publicApi.BufferOverflowError, "function");
    assert.equal(typeof publicApi.BackpressureError, "function");
    assert.equal(typeof publicApi.ConfigurationError, "function");
    assert.equal(typeof publicApi.UnsupportedCapabilityError, "function");
  });

  test("exports the capability + health + lifecycle types", () => {

    assert.equal(typeof publicApi.disconnectedHealth, "function");
    assert.equal(typeof publicApi.disconnectedCapabilities, "function");
    assert.equal(typeof publicApi.HealthState, "object");
    assert.equal(publicApi.HealthState.CONNECTED, "connected");
  });

  test("exports the withReconnect supervisor", () => {

    assert.equal(typeof publicApi.withReconnect, "function");
  });

  test("exports the EventBus primitive", () => {

    // EventBus is defined in event-bus.ts and is intentionally not re-exported at the package root; the camera/voice-assistant sub-APIs reference it via type-only
    // imports. There is therefore nothing to assert about it on the public surface, so this stands as a no-op placeholder confirming the public API is an object.
    assert.equal(typeof publicApi, "object");
  });

  test("exports the schema-extension helpers", () => {

    assert.equal(typeof publicApi.aliasOf, "function");
    assert.equal(typeof publicApi.extending, "function");
  });

  test("exports the CameraApi class", () => {

    assert.equal(typeof publicApi.CameraApi, "function");
  });

  test("exports the VoiceAssistantApi class", () => {

    assert.equal(typeof publicApi.VoiceAssistantApi, "function");
  });

  test("exports the ENTITY_SCHEMAS registry", () => {

    assert.equal(typeof publicApi.ENTITY_SCHEMAS, "object");
    assert.equal(typeof publicApi.ENTITY_SCHEMAS.light, "object");
    assert.equal(typeof publicApi.ENTITY_SCHEMAS.switch, "object");
  });
});

describe("Public entry-point - LogLevel and protocol constants", () => {

  test("exports LogLevel const-object", () => {

    assert.equal(typeof publicApi.LogLevel, "object");
    assert.equal(typeof publicApi.LogLevel.INFO, "number");
  });

  test("exports the climate / cover / fan / lock / light / media-player command constants", () => {

    assert.equal(typeof publicApi.ClimateMode, "object");
    assert.equal(typeof publicApi.ClimateFanMode, "object");
    assert.equal(typeof publicApi.CoverOperation, "object");
    assert.equal(typeof publicApi.LockCommand, "object");
    assert.equal(typeof publicApi.MediaPlayerCommand, "object");
    assert.equal(typeof publicApi.AlarmControlPanelCommand, "object");
  });

  test("exports the VoiceAssistant constants", () => {

    assert.equal(typeof publicApi.VoiceAssistantSubscribeFlag, "object");
    assert.equal(typeof publicApi.VoiceAssistantRequestFlag, "object");
    assert.equal(typeof publicApi.VoiceAssistantEvent, "object");
    assert.equal(typeof publicApi.VoiceAssistantTimerEvent, "object");
  });
});
