/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.test.ts: Structural tests for the public entry-point re-exports.
 */
import * as publicApi from "./index.ts";
import * as testingApi from "./testing/index.ts";
import { describe, test } from "node:test";
import { MessageType } from "./protocol/message-types.ts";
import assert from "node:assert/strict";

// The package root's runtime exports are held to an exact list, so a dropped export and an internal one that leaks into the root both fail here before the change
// ships. The remaining tests check the kind and shape of the exports consumers reach for most.

describe("Public entry-point re-exports", () => {

  test("exports exactly the public runtime surface", () => {

    assert.deepEqual(Object.keys(publicApi).sort(), [

      "AlarmControlPanelCommand", "AlarmControlPanelState", "AuthenticationError", "BackpressureError", "BluetoothScannerMode", "BluetoothScannerState",
      "BufferOverflowError", "CipherState", "ClimateAction", "ClimateFanMode", "ClimateFeature", "ClimateMode", "ClimatePreset",
      "ClimateSwingMode", "ColorMode", "ConfigurationError", "ConnectionClosedByPeerError", "ConnectionError", "ConnectionLostError", "ConnectionRefusedError",
      "ConnectionTimeoutError",
      "CoverOperation", "DecodingError", "DecryptionFailedError", "ENTITY_SCHEMAS", "ESPHOME_NOISE_PROLOGUE", "EncodingError", "EncryptionKeyInvalidError",
      "EncryptionKeyMissingError", "EncryptionRequiredError", "EntityCategory", "EspHomeClient", "EspHomeError", "FanDirection", "FrameTooLargeError", "HandshakeError",
      "HandshakeState", "HealthState", "HeartbeatStalledError", "IncompatibleApiVersionError", "InfraredCapabilityFlags", "LockCommand", "LockState", "LogLevel",
      "MalformedVarintError", "MediaPlayerCommand", "MediaPlayerFormatPurpose", "MediaPlayerState", "MessageTooManyFieldsError", "NOISE_DH_LEN", "NOISE_MAX_MESSAGE_LEN",
      "NOISE_PSK_LEN", "NegotiationFailedError", "NoiseHandshakeError", "NotConnectedError", "NumberMode", "PeerClosedDuringNoiseError",
      "PermanentError", "PlaintextHandshakeError", "ProtocolError", "RadioFrequencyCapabilityFlags", "RadioFrequencyModulation", "SensorStateClass",
      "SerialProxyLineStateFlags", "SerialProxyParity", "SerialProxyPortType", "SerialProxyRequestType", "SerialProxyStatus", "ServiceArgType", "TemperatureUnit",
      "TextMode", "TruncatedMessageError", "UnknownEntityTypeError", "UnknownMessageTypeError", "UnsupportedCapabilityError", "UpdateCommand", "ValveOperation",
      "VoiceAssistantEvent", "VoiceAssistantRequestFlag", "VoiceAssistantSubscribeFlag", "VoiceAssistantTimerEvent", "WaterHeaterMode", "WireType", "aliasOf",
      "connectionUptimeMs", "createESPHomeHandshake", "createHandshake", "disconnectedCapabilities", "disconnectedHealth", "entityId", "extending", "isConnectionLive",
      "isEntityId", "logLevelName", "openEspHomeClient", "parseEntityId", "withReconnect"
    ]);
  });

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

  test("exports the schema-extension helpers", () => {

    assert.equal(typeof publicApi.aliasOf, "function");
    assert.equal(typeof publicApi.extending, "function");
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

// The testing subpath's runtime exports are held to an exact list for the reason the root's are: a dropped export fails here, and so does an internal one that leaks.
describe("Testing entry-point exports", () => {

  test("exports exactly the testing runtime surface", () => {

    assert.deepEqual(Object.keys(testingApi).sort(), [

      "MOCK", "MessageType", "MockClient", "MockTransport", "MockTransportPhase", "mockDeviceInfo", "mockEntity", "mockEntityDiscovery", "mockHealth",
      "mockNoiseHandshakeExchange", "mockStateMessage", "pushBluetoothAdvertisementsBatch", "pushBluetoothConnectionsFreeResponse",
      "pushBluetoothDeviceClearCacheResponse", "pushBluetoothDeviceConnectionResponse", "pushBluetoothDevicePairingResponse", "pushBluetoothDeviceUnpairingResponse",
      "pushBluetoothGattErrorResponse", "pushBluetoothGattGetServicesDoneResponse", "pushBluetoothGattGetServicesResponse", "pushBluetoothGattNotifyData",
      "pushBluetoothGattNotifyResponse", "pushBluetoothGattReadResponse", "pushBluetoothGattWriteResponse", "pushBluetoothScannerState",
      "pushBluetoothSetConnectionParamsResponse", "pushDeviceInfo", "pushHandshake", "pushInfraredListEntity", "pushInfraredRFReceiveEvent",
      "pushRadioFrequencyListEntity", "pushSerialData", "pushSerialFlushResult", "pushSerialModemPinsResponse", "pushZWaveFrame", "pushZWaveHomeIdChange"
    ]);
  });

  test("exports the protocol's MessageType table", () => {

    assert.equal(testingApi.MessageType, MessageType);
    assert.equal(testingApi.MessageType.HELLO_RESPONSE, MessageType.HELLO_RESPONSE);
  });
});
