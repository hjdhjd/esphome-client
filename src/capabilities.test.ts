/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capabilities.test.ts: Unit tests for the capability parser.
 */
import { describe, test } from "node:test";
import { disconnectedCapabilities, parseCapabilities } from "./capabilities.ts";
import type { ClientCapabilities } from "./capabilities.ts";
import type { DeviceInfo } from "./esphome-client.ts";
import type { SerialProxyInfo } from "./serial-proxy.ts";
import assert from "node:assert/strict";

// Construct a DeviceInfo fixture. Every field of DeviceInfo is optional, so a Partial<DeviceInfo> literal is already structurally assignable without any cast.
function makeDeviceInfo(overrides: Partial<DeviceInfo> = {}): DeviceInfo {

  const base: Partial<DeviceInfo> = {

    apiEncryptionSupported: false,
    bluetoothProxyFeatureFlags: 0,
    legacyBluetoothProxyVersion: 0,
    legacyVoiceAssistantVersion: 0,
    voiceAssistantFeatureFlags: 0,
    ...overrides
  };

  return base;
}

// Construct a minimal SerialProxyInfo fixture. The parser only reads the array length to populate `serialProxy.count`, so the per-instance shape is unimportant; we still
// emit a real record so the call sites stay honest to the SerialProxyInfo contract.
function makeSerialProxyInfo(overrides: Partial<SerialProxyInfo> = {}): SerialProxyInfo {

  return { name: "uart0", portType: 0, ...overrides };
}

describe("disconnectedCapabilities", () => {

  test("returns a record with all flags false and api { 0, 0 }", () => {

    const caps = disconnectedCapabilities();

    assert.deepEqual(caps.api, { major: 0, minor: 0 });
    assert.equal(caps.encryption.active, false);
    assert.equal(caps.encryption.supported, false);
    assert.equal(caps.modernHandshake, false);
    assert.equal(caps.noiseKeyRotation, false);
    assert.equal(caps.clientDerivedObjectId, false);
    assert.equal(caps.climateTemperatureUnit, false);
    assert.equal(caps.lockOpenStates, false);
    assert.equal(caps.voiceAssistant.supported, false);
    assert.equal(caps.voiceAssistant.stereoAudio, false);
    assert.equal(caps.bluetoothProxy.supported, false);
  });

  test("returns a fresh object on each call", () => {

    const a = disconnectedCapabilities();
    const b = disconnectedCapabilities();

    a.encryption.active = true;

    assert.equal(b.encryption.active, false, "mutating one record must not affect another");
  });
});

describe("parseCapabilities - disconnected fallback", () => {

  test("returns disconnected shape when deviceInfo is null", () => {

    const caps = parseCapabilities({ apiMinor: 11, deviceInfo: null, encrypted: false });

    assert.equal(caps.api.major, 0, "no deviceInfo -> api.major stays at 0");
    assert.equal(caps.encryption.active, false);
  });

  test("preserves the encrypted flag even when deviceInfo is null", () => {

    const caps = parseCapabilities({ apiMinor: 0, deviceInfo: null, encrypted: true });

    assert.equal(caps.encryption.active, true, "encrypted is observable from the transport without needing deviceInfo");
  });
});

describe("parseCapabilities - api version", () => {

  test("populates api.major=1 and api.minor from input", () => {

    const caps = parseCapabilities({ apiMinor: 12, deviceInfo: makeDeviceInfo(), encrypted: false });

    assert.deepEqual(caps.api, { major: 1, minor: 12 });
  });

  test("modernHandshake is true when apiMinor >= 11", () => {

    assert.equal(parseCapabilities({ apiMinor: 11, deviceInfo: makeDeviceInfo(), encrypted: false }).modernHandshake, true);
    assert.equal(parseCapabilities({ apiMinor: 12, deviceInfo: makeDeviceInfo(), encrypted: false }).modernHandshake, true);
  });

  test("modernHandshake is false when apiMinor < 11", () => {

    assert.equal(parseCapabilities({ apiMinor: 10, deviceInfo: makeDeviceInfo(), encrypted: false }).modernHandshake, false);
    assert.equal(parseCapabilities({ apiMinor: 0, deviceInfo: makeDeviceInfo(), encrypted: false }).modernHandshake, false);
  });

  test("noiseKeyRotation is true when apiMinor >= 7", () => {

    assert.equal(parseCapabilities({ apiMinor: 7, deviceInfo: makeDeviceInfo(), encrypted: false }).noiseKeyRotation, true);
    assert.equal(parseCapabilities({ apiMinor: 11, deviceInfo: makeDeviceInfo(), encrypted: false }).noiseKeyRotation, true);
  });

  test("noiseKeyRotation is false when apiMinor < 7", () => {

    assert.equal(parseCapabilities({ apiMinor: 6, deviceInfo: makeDeviceInfo(), encrypted: false }).noiseKeyRotation, false);
  });

  test("clientDerivedObjectId is true at apiMinor >= 14, false below", () => {

    assert.equal(parseCapabilities({ apiMinor: 14, deviceInfo: makeDeviceInfo(), encrypted: false }).clientDerivedObjectId, true);
    assert.equal(parseCapabilities({ apiMinor: 15, deviceInfo: makeDeviceInfo(), encrypted: false }).clientDerivedObjectId, true);
    assert.equal(parseCapabilities({ apiMinor: 13, deviceInfo: makeDeviceInfo(), encrypted: false }).clientDerivedObjectId, false);
  });

  test("climateTemperatureUnit is true at apiMinor >= 14, false below", () => {

    assert.equal(parseCapabilities({ apiMinor: 14, deviceInfo: makeDeviceInfo(), encrypted: false }).climateTemperatureUnit, true);
    assert.equal(parseCapabilities({ apiMinor: 13, deviceInfo: makeDeviceInfo(), encrypted: false }).climateTemperatureUnit, false);
  });

  test("lockOpenStates is true at apiMinor >= 14, false below", () => {

    assert.equal(parseCapabilities({ apiMinor: 14, deviceInfo: makeDeviceInfo(), encrypted: false }).lockOpenStates, true);
    assert.equal(parseCapabilities({ apiMinor: 13, deviceInfo: makeDeviceInfo(), encrypted: false }).lockOpenStates, false);
  });

  test("voiceAssistant.stereoAudio is true at apiMinor >= 14, false below", () => {

    assert.equal(parseCapabilities({ apiMinor: 14, deviceInfo: makeDeviceInfo(), encrypted: false }).voiceAssistant.stereoAudio, true);
    assert.equal(parseCapabilities({ apiMinor: 13, deviceInfo: makeDeviceInfo(), encrypted: false }).voiceAssistant.stereoAudio, false);
  });
});

describe("parseCapabilities - encryption", () => {

  test("encryption.supported reflects deviceInfo.apiEncryptionSupported", () => {

    const supported = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ apiEncryptionSupported: true }), encrypted: false });

    assert.equal(supported.encryption.supported, true);
  });

  test("encryption.active reflects the transport flag, distinct from supported", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ apiEncryptionSupported: true }), encrypted: true });

    assert.equal(caps.encryption.active, true);
    assert.equal(caps.encryption.supported, true);
  });

  test("encryption.active can be true even when supported is false (legacy device that's actually encrypted)", () => {

    // Defensive case: device-info says no encryption but the active session is encrypted. This is unusual but the parser accepts it without normalizing.
    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ apiEncryptionSupported: false }), encrypted: true });

    assert.equal(caps.encryption.active, true);
    assert.equal(caps.encryption.supported, false);
  });
});

describe("parseCapabilities - voice assistant", () => {

  test("supported is false when no flags and no legacy version", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo(), encrypted: false });

    assert.equal(caps.voiceAssistant.supported, false);
  });

  test("supported is true when feature flags are non-zero", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 }), encrypted: false });

    assert.equal(caps.voiceAssistant.supported, true);
  });

  test("supported is true on legacy devices (legacyVoiceAssistantVersion > 0)", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ legacyVoiceAssistantVersion: 1 }), encrypted: false });

    assert.equal(caps.voiceAssistant.supported, true);
  });

  test("apiAudio is true when bit 2 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 << 2 }), encrypted: false });

    assert.equal(caps.voiceAssistant.apiAudio, true);
  });

  test("timerEvents is true when bit 3 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 << 3 }), encrypted: false });

    assert.equal(caps.voiceAssistant.timerEvents, true);
  });

  test("announcements is true when bit 4 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 << 4 }), encrypted: false });

    assert.equal(caps.voiceAssistant.announcements, true);
  });

  test("speaker is true when bit 1 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 << 1 }), encrypted: false });

    assert.equal(caps.voiceAssistant.speaker, true);
  });

  test("startConversation is true when bit 5 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 1 << 5 }), encrypted: false });

    assert.equal(caps.voiceAssistant.startConversation, true);
  });

  test("flag bits compose - all VA flags set produces all-true voice-assistant capabilities", () => {

    const allFlags = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: allFlags }), encrypted: false });

    assert.equal(caps.voiceAssistant.apiAudio, true);
    assert.equal(caps.voiceAssistant.timerEvents, true);
    assert.equal(caps.voiceAssistant.announcements, true);
    assert.equal(caps.voiceAssistant.speaker, true);
    assert.equal(caps.voiceAssistant.startConversation, true);
    assert.equal(caps.voiceAssistant.supported, true);
  });
});

describe("parseCapabilities - bluetooth proxy", () => {

  test("supported is false with no flags or legacy version", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo(), encrypted: false });

    assert.equal(caps.bluetoothProxy.supported, false);
  });

  test("supported is true when feature flags are non-zero", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ bluetoothProxyFeatureFlags: 1 }), encrypted: false });

    assert.equal(caps.bluetoothProxy.supported, true);
  });

  test("supported is true on legacy devices (legacyBluetoothProxyVersion > 0)", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ legacyBluetoothProxyVersion: 1 }), encrypted: false });

    assert.equal(caps.bluetoothProxy.supported, true);
  });

  test("activeConnections is true when bit 1 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ bluetoothProxyFeatureFlags: 1 << 1 }), encrypted: false });

    assert.equal(caps.bluetoothProxy.activeConnections, true);
  });

  test("rawAdvertisements is true when bit 5 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ bluetoothProxyFeatureFlags: 1 << 5 }), encrypted: false });

    assert.equal(caps.bluetoothProxy.rawAdvertisements, true);
  });

  test("legacyAdvertisements (passive scan) is true when bit 0 is set", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ bluetoothProxyFeatureFlags: 1 << 0 }), encrypted: false });

    assert.equal(caps.bluetoothProxy.legacyAdvertisements, true);
  });
});

describe("parseCapabilities - serial proxy", () => {

  test("supported is false and count is 0 when the device advertises no serial proxies", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo(), encrypted: false });

    assert.equal(caps.serialProxy.supported, false);
    assert.equal(caps.serialProxy.count, 0);
  });

  test("supported is false and count is 0 when serialProxies is an empty array", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ serialProxies: [] }), encrypted: false });

    assert.equal(caps.serialProxy.supported, false);
    assert.equal(caps.serialProxy.count, 0);
  });

  test("supported is true and count reflects the length of serialProxies", () => {

    const caps = parseCapabilities({

      apiMinor: 1,
      deviceInfo: makeDeviceInfo({ serialProxies: [ makeSerialProxyInfo(), makeSerialProxyInfo({ name: "uart1" }) ] }),
      encrypted: false
    });

    assert.equal(caps.serialProxy.supported, true);
    assert.equal(caps.serialProxy.count, 2);
  });
});

describe("parseCapabilities - zwave proxy", () => {

  test("supported is false when the device advertises zero feature flags and no home id", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo(), encrypted: false });

    assert.equal(caps.zwaveProxy.supported, false);
    assert.equal(caps.zwaveProxy.featureFlags, 0);
    assert.equal(caps.zwaveProxy.homeId, null);
  });

  test("supported is true and featureFlags is exposed verbatim when the device advertises any nonzero bitmask", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ zwaveProxyFeatureFlags: 0x3 }), encrypted: false });

    assert.equal(caps.zwaveProxy.supported, true);
    assert.equal(caps.zwaveProxy.featureFlags, 0x3);
  });

  test("homeId is normalised to null when the device-info value is 0 (no network joined)", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ zwaveHomeId: 0, zwaveProxyFeatureFlags: 1 }), encrypted: false });

    assert.equal(caps.zwaveProxy.homeId, null);
  });

  test("homeId surfaces the device-info value when it is nonzero", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ zwaveHomeId: 0xdeadbeef, zwaveProxyFeatureFlags: 1 }), encrypted: false });

    assert.equal(caps.zwaveProxy.homeId, 0xdeadbeef);
  });

  test("featureFlags is 0 when device-info reports the bitmask absent (treated as zero)", () => {

    const caps = parseCapabilities({ apiMinor: 1, deviceInfo: makeDeviceInfo({ zwaveHomeId: 0x12345678 }), encrypted: false });

    assert.equal(caps.zwaveProxy.supported, false, "supported gates strictly on featureFlags, not on home id");
    assert.equal(caps.zwaveProxy.featureFlags, 0);
  });
});

describe("parseCapabilities - disconnected defaults for new subsystems", () => {

  test("disconnectedCapabilities reports serialProxy.supported false and zwaveProxy.supported false", () => {

    const caps = disconnectedCapabilities();

    assert.equal(caps.serialProxy.supported, false);
    assert.equal(caps.serialProxy.count, 0);
    assert.equal(caps.zwaveProxy.supported, false);
    assert.equal(caps.zwaveProxy.featureFlags, 0);
    assert.equal(caps.zwaveProxy.homeId, null);
  });

  test("parseCapabilities with deviceInfo=null produces the same defaults for the new subsystems", () => {

    const caps = parseCapabilities({ apiMinor: 11, deviceInfo: null, encrypted: false });

    assert.equal(caps.serialProxy.supported, false);
    assert.equal(caps.serialProxy.count, 0);
    assert.equal(caps.zwaveProxy.supported, false);
    assert.equal(caps.zwaveProxy.featureFlags, 0);
    assert.equal(caps.zwaveProxy.homeId, null);
  });
});

describe("parseCapabilities - determinism", () => {

  test("same inputs always produce structurally-equal records", () => {

    const a = parseCapabilities({ apiMinor: 11, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 7 }), encrypted: true });
    const b = parseCapabilities({ apiMinor: 11, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 7 }), encrypted: true });

    assert.deepEqual(a, b);
  });

  test("returns a fresh object - mutating the result does not affect a subsequent call", () => {

    const input = { apiMinor: 11, deviceInfo: makeDeviceInfo({ voiceAssistantFeatureFlags: 7 }), encrypted: true };
    const a: ClientCapabilities = parseCapabilities(input);

    a.voiceAssistant.supported = false;

    const b = parseCapabilities(input);

    assert.equal(b.voiceAssistant.supported, true, "the parser must produce fresh records, not share refs across calls");
  });
});
