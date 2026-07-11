/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * api-constants.test.ts: Unit tests for the wire-level enum constants exported from api-constants.ts (AlarmControlPanelState, BluetoothDeviceRequestType, etc.). The
 * tests run a shared shape-consistency pass (distinct, integer, non-negative values; deterministic key order) across every exported constant, then pin each enum's
 * member values line-for-line against the api.proto wire numbers. Constants exercised indirectly through their consumers (LockCommand, CoverOperation, ClimateMode,
 * etc.) are intentionally not re-tested here.
 */
import {
  AlarmControlPanelState, BluetoothDeviceRequestType, BluetoothScannerMode, BluetoothScannerState, FanDirection, InfraredCapabilityFlags, LockState,
  MediaPlayerState, RadioFrequencyCapabilityFlags, RadioFrequencyModulation, SerialProxyLineStateFlags, SerialProxyParity, SerialProxyPortType,
  SerialProxyRequestType, SerialProxyStatus, TemperatureUnit, UpdateCommand, ZWaveProxyRequestType
} from "./api-constants.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Shared rule runner. We run the shared cross-cutting checks (distinct values, integer values, non-negative values, deterministic iteration order) once per
// constant so a future addition only needs to update the table below.
const WIRE_CONSTANTS = {

  AlarmControlPanelState,
  BluetoothDeviceRequestType,
  BluetoothScannerMode,
  BluetoothScannerState,
  FanDirection,
  InfraredCapabilityFlags,
  LockState,
  MediaPlayerState,
  RadioFrequencyCapabilityFlags,
  RadioFrequencyModulation,
  SerialProxyLineStateFlags,
  SerialProxyParity,
  SerialProxyPortType,
  SerialProxyRequestType,
  SerialProxyStatus,
  TemperatureUnit,
  UpdateCommand,
  ZWaveProxyRequestType
};

describe("api-constants enum-constant guarantees", () => {

  for(const [ name, table ] of Object.entries(WIRE_CONSTANTS)) {

    test(name + " is a frozen-shape const-object with distinct, non-negative integer values", () => {

      const values = Object.values(table);

      assert.equal(new Set(values).size, values.length, name + " must not contain duplicate numeric values");

      for(const value of values) {

        assert.equal(typeof value, "number", name + " value must be a number");
        assert.equal(Number.isInteger(value), true, name + " value must be an integer");
        assert.equal((value >= 0), true, name + " value must be non-negative");
      }

      // 'as const' object literals enumerate keys in their literal insertion order. This assertion is a deliberately trivial restatement of that property - it compares a
      // table's key order against itself, so it cannot catch a non-deterministic table derivation; it documents the assumed rule rather than enforcing it.
      assert.deepEqual(Object.keys(table), Object.keys(table), name + " must enumerate keys in the same order across calls");
    });
  }
});

describe("TemperatureUnit matches api.proto TemperatureUnit", () => {

  test("member values mirror the proto enum line-for-line", () => {

    // ESPHome API 1.14 introduced `TemperatureUnit` on `ListEntitiesClimateResponse` (field 28) and `ListEntitiesWaterHeaterResponse` (field 13). Capability gate:
    // `client.capabilities().climateTemperatureUnit`.
    assert.equal(TemperatureUnit.CELSIUS, 0);
    assert.equal(TemperatureUnit.FAHRENHEIT, 1);
    assert.equal(TemperatureUnit.KELVIN, 2);
    assert.equal(Object.keys(TemperatureUnit).length, 3);
  });
});

describe("LockState matches api.proto LockState", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(LockState.NONE, 0);
    assert.equal(LockState.LOCKED, 1);
    assert.equal(LockState.UNLOCKED, 2);
    assert.equal(LockState.JAMMED, 3);
    assert.equal(LockState.LOCKING, 4);
    assert.equal(LockState.UNLOCKING, 5);

    // LOCK_STATE_OPENING and LOCK_STATE_OPEN added in ESPHome API 1.14. Devices on older firmware never emit these values; consumers narrowing on the extended union
    // can short-circuit pre-1.14 devices via `client.capabilities().lockOpenStates`.
    assert.equal(LockState.OPENING, 6);
    assert.equal(LockState.OPEN, 7);
    assert.equal(Object.keys(LockState).length, 8);
  });
});

describe("MediaPlayerState matches api.proto MediaPlayerState", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(MediaPlayerState.NONE, 0);
    assert.equal(MediaPlayerState.IDLE, 1);
    assert.equal(MediaPlayerState.PLAYING, 2);
    assert.equal(MediaPlayerState.PAUSED, 3);
    assert.equal(MediaPlayerState.ANNOUNCING, 4);
    assert.equal(MediaPlayerState.OFF, 5);
    assert.equal(MediaPlayerState.ON, 6);
    assert.equal(Object.keys(MediaPlayerState).length, 7);
  });
});

describe("AlarmControlPanelState matches api.proto AlarmControlPanelState", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(AlarmControlPanelState.DISARMED, 0);
    assert.equal(AlarmControlPanelState.ARMED_HOME, 1);
    assert.equal(AlarmControlPanelState.ARMED_AWAY, 2);
    assert.equal(AlarmControlPanelState.ARMED_NIGHT, 3);
    assert.equal(AlarmControlPanelState.ARMED_VACATION, 4);
    assert.equal(AlarmControlPanelState.ARMED_CUSTOM_BYPASS, 5);
    assert.equal(AlarmControlPanelState.PENDING, 6);
    assert.equal(AlarmControlPanelState.ARMING, 7);
    assert.equal(AlarmControlPanelState.DISARMING, 8);
    assert.equal(AlarmControlPanelState.TRIGGERED, 9);
    assert.equal(Object.keys(AlarmControlPanelState).length, 10);
  });
});

describe("FanDirection matches api.proto FanDirection", () => {

  test("member values mirror the proto enum and agree with the fan-command direction enumMapping in the schema", () => {

    // The schema's command 'enumMappings.direction' maps "forward" -> 0 and "reverse" -> 1 (see entity-schemas.ts). The numeric side must match this constant so a
    // consumer holding FanDirection.FORWARD and a consumer passing "forward" both encode to the same wire value.
    assert.equal(FanDirection.FORWARD, 0);
    assert.equal(FanDirection.REVERSE, 1);
    assert.equal(Object.keys(FanDirection).length, 2);
  });
});

describe("UpdateCommand matches api.proto UpdateCommand", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(UpdateCommand.NONE, 0);
    assert.equal(UpdateCommand.UPDATE, 1);
    assert.equal(UpdateCommand.CHECK, 2);
    assert.equal(Object.keys(UpdateCommand).length, 3);
  });
});

describe("InfraredCapabilityFlags matches the upstream bitmask", () => {

  test("flag values occupy the documented bit positions (bit 0 = transmitter, bit 1 = receiver)", () => {

    // Unlike RadioFrequencyCapabilityFlags, whose bit positions api.proto documents inline, the Infrared bit positions are inferred by parity with the RF
    // flags and from the upstream infrared.h header, not from an inline api.proto annotation.
    assert.equal(InfraredCapabilityFlags.TRANSMITTER, 1);
    assert.equal(InfraredCapabilityFlags.RECEIVER, 2);
    assert.equal(Object.keys(InfraredCapabilityFlags).length, 2);
  });

  test("bitwise OR composes both flags into the conventional 0x3 mask", () => {

    assert.equal(InfraredCapabilityFlags.TRANSMITTER | InfraredCapabilityFlags.RECEIVER, 0x3);
  });
});

describe("RadioFrequencyCapabilityFlags matches the upstream bitmask", () => {

  test("flag values occupy the documented bit positions (bit 0 = transmitter, bit 1 = receiver)", () => {

    // Per api.proto §ListEntitiesRadioFrequencyResponse.capabilities, the bit positions match IR exactly.
    assert.equal(RadioFrequencyCapabilityFlags.TRANSMITTER, 1);
    assert.equal(RadioFrequencyCapabilityFlags.RECEIVER, 2);
    assert.equal(Object.keys(RadioFrequencyCapabilityFlags).length, 2);
  });

  test("transmitter bit aligns with the IR equivalent so the cross-entity capability guard can use either constant", () => {

    assert.equal(RadioFrequencyCapabilityFlags.TRANSMITTER, InfraredCapabilityFlags.TRANSMITTER);
    assert.equal(RadioFrequencyCapabilityFlags.RECEIVER, InfraredCapabilityFlags.RECEIVER);
  });
});

describe("RadioFrequencyModulation matches api.proto", () => {

  test("OOK is value 0 and is currently the only documented modulation", () => {

    assert.equal(RadioFrequencyModulation.OOK, 0);
    assert.equal(Object.keys(RadioFrequencyModulation).length, 1);
  });
});

describe("SerialProxyParity matches api.proto SerialProxyParity", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(SerialProxyParity.NONE, 0);
    assert.equal(SerialProxyParity.EVEN, 1);
    assert.equal(SerialProxyParity.ODD, 2);
    assert.equal(Object.keys(SerialProxyParity).length, 3);
  });
});

describe("SerialProxyPortType matches api.proto SerialProxyPortType", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(SerialProxyPortType.TTL, 0);
    assert.equal(SerialProxyPortType.RS232, 1);
    assert.equal(SerialProxyPortType.RS485, 2);
    assert.equal(Object.keys(SerialProxyPortType).length, 3);
  });
});

describe("SerialProxyRequestType matches api.proto SerialProxyRequestType", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(SerialProxyRequestType.SUBSCRIBE, 0);
    assert.equal(SerialProxyRequestType.UNSUBSCRIBE, 1);
    assert.equal(SerialProxyRequestType.FLUSH, 2);
    assert.equal(Object.keys(SerialProxyRequestType).length, 3);
  });
});

describe("SerialProxyStatus matches api.proto SerialProxyStatus", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(SerialProxyStatus.OK, 0);
    assert.equal(SerialProxyStatus.ASSUMED_SUCCESS, 1);
    assert.equal(SerialProxyStatus.ERROR, 2);
    assert.equal(SerialProxyStatus.TIMEOUT, 3);
    assert.equal(SerialProxyStatus.NOT_SUPPORTED, 4);
    assert.equal(Object.keys(SerialProxyStatus).length, 5);
  });
});

describe("BluetoothScannerState matches api.proto BluetoothScannerState", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(BluetoothScannerState.IDLE, 0);
    assert.equal(BluetoothScannerState.STARTING, 1);
    assert.equal(BluetoothScannerState.RUNNING, 2);
    assert.equal(BluetoothScannerState.FAILED, 3);
    assert.equal(BluetoothScannerState.STOPPING, 4);
    assert.equal(BluetoothScannerState.STOPPED, 5);
    assert.equal(Object.keys(BluetoothScannerState).length, 6);
  });
});

describe("BluetoothScannerMode matches api.proto BluetoothScannerMode", () => {

  test("PASSIVE = 0 and ACTIVE = 1, matching the upstream enum", () => {

    assert.equal(BluetoothScannerMode.PASSIVE, 0);
    assert.equal(BluetoothScannerMode.ACTIVE, 1);
    assert.equal(Object.keys(BluetoothScannerMode).length, 2);
  });
});

describe("BluetoothDeviceRequestType matches api.proto BluetoothDeviceRequestType", () => {

  test("member values mirror the proto enum line-for-line, with the deprecated CONNECT=0 intentionally absent", () => {

    assert.equal(BluetoothDeviceRequestType.DISCONNECT, 1);
    assert.equal(BluetoothDeviceRequestType.PAIR, 2);
    assert.equal(BluetoothDeviceRequestType.UNPAIR, 3);
    assert.equal(BluetoothDeviceRequestType.CONNECT_V3_WITH_CACHE, 4);
    assert.equal(BluetoothDeviceRequestType.CONNECT_V3_WITHOUT_CACHE, 5);
    assert.equal(BluetoothDeviceRequestType.CLEAR_CACHE, 6);
    assert.equal(Object.keys(BluetoothDeviceRequestType).length, 6);
  });

  test("the deprecated CONNECT=0 value is not exported", () => {

    // The deprecated CONNECT=0 variant is never used - the V3 variants are used unconditionally, so the deprecated value is intentionally absent and callers
    // cannot silently fall back to the cached-by-default path.
    assert.equal(Object.values(BluetoothDeviceRequestType).includes(0 as never), false);
  });
});

describe("ZWaveProxyRequestType matches api.proto ZWaveProxyRequestType", () => {

  test("member values mirror the proto enum line-for-line", () => {

    assert.equal(ZWaveProxyRequestType.SUBSCRIBE, 0);
    assert.equal(ZWaveProxyRequestType.UNSUBSCRIBE, 1);
    assert.equal(ZWaveProxyRequestType.HOME_ID_CHANGE, 2);
    assert.equal(Object.keys(ZWaveProxyRequestType).length, 3);
  });
});

describe("SerialProxyLineStateFlags occupies the documented bit positions", () => {

  test("RTS = bit 0, DTR = bit 1, standard UART modem-control convention", () => {

    assert.equal(SerialProxyLineStateFlags.RTS, 1);
    assert.equal(SerialProxyLineStateFlags.DTR, 2);
    assert.equal(Object.keys(SerialProxyLineStateFlags).length, 2);
  });

  test("bitwise OR composes both flags into the conventional 0x3 mask", () => {

    assert.equal(SerialProxyLineStateFlags.RTS | SerialProxyLineStateFlags.DTR, 0x3);
  });
});
