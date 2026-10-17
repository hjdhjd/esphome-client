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
 * The mock client is an in-memory stand-in for the public {@link EspHomeClient} surface and the layer for testing consumer code that reacts to client behavior, so bytes
 * never enter the picture. The mock transport sits one level down: it drives a real client without a socket, captures each frame the client sends, and comes with
 * frame-push helpers that synthesize the inbound messages a device would send. The message-type table names the message each pushed or captured frame carries. The
 * fixture factories build typed entities, state messages, device info, and health records to seed the mock client, and the recording-mock controller surface exposes
 * the calls each mocked sub-API received. The export list names each public symbol from the module that declares it and is the authority on what the subpath exposes.
 *
 * SemVer: this subpath follows the same SemVer commitment as the main entry point. Breaking changes here are documented in the changelog.
 *
 * @module testing
 */

// This list is the subpath's public surface: each name is exported from the module that declares it, and an export not named here stays internal. MessageType is
// public here and not at the package root because only a test that pushes or inspects a raw frame names a message by its id.
export { MessageType } from "../protocol/message-types.ts";
export { mockDeviceInfo, mockEntity, mockEntityDiscovery, mockHealth, mockStateMessage } from "./factories.ts";
export type { MockCommand } from "./factories.ts";
export { MockClient } from "./mock-client.ts";
export type { RecordedCommand } from "./mock-client.ts";
export {
  MockTransport, MockTransportPhase, mockNoiseHandshakeExchange, pushBluetoothAdvertisementsBatch, pushBluetoothConnectionsFreeResponse,
  pushBluetoothDeviceClearCacheResponse, pushBluetoothDeviceConnectionResponse, pushBluetoothDevicePairingResponse, pushBluetoothDeviceUnpairingResponse,
  pushBluetoothGattErrorResponse, pushBluetoothGattGetServicesDoneResponse, pushBluetoothGattGetServicesResponse, pushBluetoothGattNotifyData,
  pushBluetoothGattNotifyResponse, pushBluetoothGattReadResponse, pushBluetoothGattWriteResponse, pushBluetoothScannerState, pushBluetoothSetConnectionParamsResponse,
  pushDeviceInfo, pushHandshake, pushInfraredListEntity, pushInfraredRFReceiveEvent, pushRadioFrequencyListEntity, pushSerialData, pushSerialFlushResult,
  pushSerialModemPinsResponse, pushZWaveFrame, pushZWaveHomeIdChange
} from "./mock-transport.ts";
export type {
  CapturedFrame, PushBluetoothAdvertisement, PushBluetoothGattCharacteristic, PushBluetoothGattDescriptor, PushBluetoothGattService, PushBluetoothScannerStateOptions,
  PushDeviceInfoOptions, PushHandshakeOptions, PushInfraredListEntityOptions, PushInfraredRFReceiveEventOptions, PushRadioFrequencyListEntityOptions,
  PushSerialFlushResultOptions
} from "./mock-transport.ts";
// The recording-mock factory's MOCK symbol and MockController surface are part of the public test API - consumer code that captures recorded calls via
// `mock.bluetooth[MOCK].calls` needs both to be importable from `esphome-client/testing`. The factory function itself is internal infrastructure (MockClient uses it
// internally to mint sub-API mocks), so it is NOT re-exported. The internal `type-assertions.ts` helper module is likewise intentionally absent.
export { MOCK } from "./recording-mock.ts";
export type { MockController, RecordedSubApiCall } from "./recording-mock.ts";
