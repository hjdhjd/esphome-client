/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * index.ts: Named simulator scenarios.
 */

/*
 * Defines and exports the canonical scenarios that mirror the capture-replay set. The basic-discovery and v114-discovery scenarios carry full byte-level fixtures
 * synthesized via the library's own encoder; the rest are stubs awaiting real-device captures (gated on hardware).
 */
import type { InboundFrame, Scenario } from "../simulator.ts";
import { Buffer } from "node:buffer";
import { MessageType } from "../../../src/protocol/index.ts";
import { WireType } from "../../../src/protocol/index.ts";
import { encodeProtoFields } from "../../../src/protocol/codec.ts";

// Helpers for synthesizing wire-shaped payloads. Mirrors the library's encoders so the simulator stays in lockstep with what the host expects.
const fixed32 = (n: number): Buffer => {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(n, 0);

  return buf;
};

const utf8 = (s: string): Buffer => Buffer.from(s, "utf8");

// Synthesize a HelloResponse payload with API 1.12 (modern handshake; skips CONNECT_REQUEST), a server identifier, and a device name.
const helloResponsePayload = (): Buffer => encodeProtoFields([
  { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
  { fieldNumber: 2, value: 12, wireType: WireType.VARINT },
  { fieldNumber: 3, value: utf8("esphome v2025.10.0"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 4, value: utf8("test-device"), wireType: WireType.LENGTH_DELIMITED }
]);

// Synthesize a DeviceInfoResponse payload with the deprecated uses-password flag plus the required name, mac-address, esphome-version, compilation-time, and
// model fields.
const deviceInfoResponsePayload = (): Buffer => encodeProtoFields([
  { fieldNumber: 1, value: 0, wireType: WireType.VARINT },
  { fieldNumber: 2, value: utf8("test-device"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 3, value: utf8("aa:bb:cc:dd:ee:ff"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 4, value: utf8("2025.10.0"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 5, value: utf8("Jan 1 2026, 00:00:00"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 6, value: utf8("ESP32"), wireType: WireType.LENGTH_DELIMITED }
]);

// Synthesize a ListEntitiesSwitchResponse for a switch with the canonical key/objectId/name trio.
const listEntitiesSwitchResponsePayload = (key: number, objectId: string, name: string): Buffer => encodeProtoFields([
  { fieldNumber: 1, value: utf8(objectId), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 2, value: fixed32(key), wireType: WireType.FIXED32 },
  { fieldNumber: 3, value: utf8(name), wireType: WireType.LENGTH_DELIMITED }
]);

// Synthesize a ListEntitiesSwitchResponse with `object_id` (field 1) deliberately OMITTED. This is the 1.14+ server shape: the server stops sending object_id for
// clients that advertise 1.14 or higher, on the grounds that the value is always derivable from `name` as `sanitize(snake_case(name))`. The client's discovery
// decoder must derive the same canonical id from `name` alone; this fixture is the regression net for that behavior.
const listEntitiesSwitchResponsePayloadV114 = (key: number, name: string): Buffer => encodeProtoFields([
  { fieldNumber: 2, value: fixed32(key), wireType: WireType.FIXED32 },
  { fieldNumber: 3, value: utf8(name), wireType: WireType.LENGTH_DELIMITED }
]);

// Synthesize a SwitchStateResponse for an on/off state report.
export const switchStateResponsePayload = (key: number, state: boolean): Buffer => encodeProtoFields([
  { fieldNumber: 1, value: fixed32(key), wireType: WireType.FIXED32 },
  { fieldNumber: 2, value: state ? 1 : 0, wireType: WireType.VARINT }
]);

// Synthesize a HelloResponse advertising API 1.14. Used by the v114-discovery scenario to fidelity-match a real 1.14 device's handshake reply.
const helloResponsePayloadV114 = (): Buffer => encodeProtoFields([
  { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
  { fieldNumber: 2, value: 14, wireType: WireType.VARINT },
  { fieldNumber: 3, value: utf8("esphome v2026.5.0"), wireType: WireType.LENGTH_DELIMITED },
  { fieldNumber: 4, value: utf8("test-device"), wireType: WireType.LENGTH_DELIMITED }
]);

const basicDiscoveryInbound: InboundFrame[] = [
  { payload: helloResponsePayload(), type: MessageType.HELLO_RESPONSE },
  { payload: deviceInfoResponsePayload(), type: MessageType.DEVICE_INFO_RESPONSE },
  { payload: listEntitiesSwitchResponsePayload(1001, "front_door", "Front Door"), type: MessageType.LIST_ENTITIES_SWITCH_RESPONSE },
  { payload: Buffer.alloc(0), type: MessageType.LIST_ENTITIES_DONE_RESPONSE },
  { payload: switchStateResponsePayload(1001, true), type: MessageType.SWITCH_STATE_RESPONSE }
];

/**
 * Basic discovery scenario: plaintext HELLO + DeviceInfo + switch discovery + an initial state update.
 *
 * Used by the end-to-end bench (driving a real EspHomeClient through MockTransport) and the e2e replay test.
 */
export const basicDiscovery: Scenario = {

  expectedOutbound: [

    MessageType.HELLO_REQUEST,
    MessageType.LIST_ENTITIES_REQUEST,
    MessageType.DEVICE_INFO_REQUEST,
    MessageType.SUBSCRIBE_STATES_REQUEST
  ],
  expectedReplay: { deviceName: "test-device", entityCount: 1, telemetryEventCount: 1 },
  inbound: basicDiscoveryInbound,
  name: "basic-discovery"
};

const v114DiscoveryInbound: InboundFrame[] = [
  { payload: helloResponsePayloadV114(), type: MessageType.HELLO_RESPONSE },
  { payload: deviceInfoResponsePayload(), type: MessageType.DEVICE_INFO_RESPONSE },
  // The server omits `object_id` from the ListEntities*Response (field 1) - this is the 1.14+ wire shape. The client's discovery decoder must derive the canonical
  // object_id from `name` ("Front Door" -> "front_door").
  { payload: listEntitiesSwitchResponsePayloadV114(1001, "Front Door"), type: MessageType.LIST_ENTITIES_SWITCH_RESPONSE },
  { payload: Buffer.alloc(0), type: MessageType.LIST_ENTITIES_DONE_RESPONSE },
  { payload: switchStateResponsePayload(1001, true), type: MessageType.SWITCH_STATE_RESPONSE }
];

/**
 * ESPHome API 1.14 discovery scenario. Identical to basic-discovery except: the device announces API 1.14 in `HelloResponse`, and the
 * `ListEntitiesSwitchResponse` omits the `object_id` field (the 1.14+ server-side optimization). The client's discovery decoder must derive `object_id` from
 * `name` to produce the same canonical entity id.
 *
 * Regression net for the wire-first-with-fallback path in `decodeEntityFromSchema` and for `deriveObjectId`'s upstream-mirror algorithm.
 */
export const v114Discovery: Scenario = {

  expectedOutbound: [

    MessageType.HELLO_REQUEST,
    MessageType.LIST_ENTITIES_REQUEST,
    MessageType.DEVICE_INFO_REQUEST,
    MessageType.SUBSCRIBE_STATES_REQUEST
  ],
  expectedReplay: { deviceName: "test-device", entityCount: 1, telemetryEventCount: 1 },
  inbound: v114DiscoveryInbound,
  name: "v114-discovery"
};

const empty = (name: string): Scenario => ({ expectedOutbound: [], inbound: [], name });

// Exercises the full Noise handshake path against a device configured with a pre-shared key.
export const encryptedHandshake: Scenario = empty("encrypted-handshake");

// Exercises the plaintext fallback path triggered when a device closes the connection mid-handshake during Noise negotiation.
export const fallback: Scenario = empty("fallback");

// Exercises the client's PING_REQUEST interleave handling under a rapid, repeated flood of keepalive pings.
export const pingFlood: Scenario = empty("ping-flood");

// Exercises discovery and entity attribution for a device that exposes multiple sub-devices.
export const multiDevice: Scenario = empty("multi-device");

// Exercises the client's tolerance for a large entity discovery sequence that trickles in with delays between responses.
export const slowDiscovery: Scenario = empty("slow-discovery");

// Exercises the client's handling of a device-initiated disconnect request.
export const disconnectRequest: Scenario = empty("disconnect-request");

// The canonical scenario registry. Every scenario constant defined above must be added here, since consumers that iterate scenarios exhaustively (the e2e
// replay and capture-corpus tests) rely on this array as their sole enumeration source.
export const ALL_SCENARIOS: ReadonlyArray<Scenario> = [
  basicDiscovery, v114Discovery, encryptedHandshake, fallback, pingFlood, multiDevice, slowDiscovery, disconnectRequest
];
