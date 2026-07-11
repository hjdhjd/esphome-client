/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * bluetooth-proxy.ts: Bluetooth-proxy sub-API for the ESPHome client.
 */

/**
 * Bluetooth-proxy sub-API.
 *
 * @remarks Lazy-instantiated single-instance namespace exposed via `client.bluetooth`. Composes with the host via a narrow {@link BluetoothProxyHost} seam - no reach
 * into host private fields, only the bus, the logger, a synchronous frame-send hook, and an accessor for the latest {@link DeviceInfo} (to surface
 * the BLE-proxy capability flags advertised by the device).
 *
 * Two related surfaces live in this module:
 *
 * 1. **Advertisement scanning**. Backpressured async-iterable view of inbound BLE advertisements via a refcounted-subscription pattern that collapses to a single
 *    integer (BLE advertisement scanning is a device-wide subscription, not per-key). Plus an unsolicited scanner-state push stream with a cached last-state snapshot.
 * 2. **GATT operations**. Connect, disconnect, pair, unpair, clearCache, service discovery, characteristic read/write, descriptor read/write, notify
 *    enable/disable, notify data stream, connection-parameter setting, connection-slots-free observation, and connection-state observation. Built on
 *    `Correlator`-driven request/response correlation - one Correlator per *response shape* (so characteristic read and descriptor read share one, and
 *    characteristic write and descriptor write share another); a single try-each-reject error router handles `BluetoothGATTErrorResponse` routing without an auxiliary
 *    key map.
 *
 * The composition story mirrors {@link VoiceAssistantApi}: a single sub-API namespace housing related state, refcounted-subscription patterns for
 * streamed events, and cached pushes that synchronous accessors read. The class is intentionally large - BLE GATT is intrinsically wide - but the seam, the host
 * surface, and the in-flight error router are all uniform across operations.
 *
 * @module bluetooth-proxy
 */
import type { BluetoothDeviceRequestType as BluetoothDeviceRequestTypeValue, BluetoothScannerMode, BluetoothScannerState } from "./api-constants.ts";
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import type { FieldValue, ProtoField } from "./protocol/index.ts";
import { MessageType, WireType, decodeProtobuf, encodeProtoFields, extractNumberField, readVarint, readVarintBigInt, zigzagDecode } from "./protocol/index.ts";
import { BluetoothDeviceRequestType } from "./api-constants.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { ConnectionError } from "./errors.ts";
import { Correlator } from "./correlator.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";

/**
 * One inbound BLE advertisement record. Fanned out from a batched `BluetoothLERawAdvertisementsResponse` so consumers see ads at single-ad granularity. The wire shape
 * is the nested `BluetoothLERawAdvertisement` message defined in `api.proto` §`BluetoothLERawAdvertisementsResponse`.
 */
export interface BluetoothLERawAdvertisement {

  /**
   * Device BLE address as a `bigint`. The wire field is `uint64`, which exceeds the JavaScript safe-integer range; modelling the value as `bigint` preserves the wire
   * shape exactly and forward-compatibly. BLE addresses themselves are 48 bits so they fit in a JavaScript number today, but addresses are routinely indexed by tools
   * that compose them with other 64-bit ids - keeping the public surface as `bigint` removes a precision pitfall before it surfaces.
   *
   * Display convention: format as the conventional 12-hex `aa:bb:cc:dd:ee:ff` colon-separated string when rendering for humans; keep the raw `bigint` as the lookup key.
   */
  readonly address: bigint;

  /**
   * Address-type tag (0-4) per Bluetooth Core 4.0+: 0 = public, 1 = random, 2 = public identity, 3 = random static identity, 4 = anonymous advertiser. The
   * client passes the value through unchanged; consumers narrow against the Core-spec values as needed.
   */
  readonly addressType: number;

  /**
   * Raw advertisement payload bytes. The wire field is `bytes` with a documented `fixed_array_size` of 62 - the BLE 4.x advertisement-data upper bound. Consumers parse
   * the buffer against the AD-structure format documented in BLE Core (length-prefixed type-tagged sub-records).
   */
  readonly data: Buffer;

  /**
   * Received-signal strength indicator, in dBm. The wire field is `sint32` (zigzag-encoded), so the decoded value is the canonical signed dBm reading - negative,
   * typically in the -30 (very close) to -100 (range edge) span. Decoder applies `zigzagDecode` after the varint pass.
   */
  readonly rssi: number;
}

/**
 * One inbound scanner-state push. The device emits the wire-level `BluetoothScannerStateResponse` frame whenever the scanner transitions through its state machine
 * (IDLE -> STARTING -> RUNNING when activated, RUNNING -> STOPPING -> STOPPED when deactivated, FAILED on controller-level error). Pushes are unsolicited at the wire
 * level - the client does not subscribe; the device emits whenever a transition happens.
 *
 * `mode` reflects the scanner's currently active mode; `configuredMode` reflects the mode the consumer asked for via {@link BluetoothProxyApi.setScannerMode}. These
 * usually agree once the scanner reaches RUNNING; they may temporarily diverge during a mode-change transition.
 */
export interface BluetoothScannerStateData {

  /** Mode the consumer last requested via {@link BluetoothProxyApi.setScannerMode}. */
  readonly configuredMode: BluetoothScannerMode;

  /** Mode the scanner is currently operating in. */
  readonly mode: BluetoothScannerMode;

  /** Current scanner state. */
  readonly state: BluetoothScannerState;
}

/**
 * Connection-state snapshot pushed by the device via `BluetoothDeviceConnectionResponse` (id 69). One message shape covers both the connect-completed and
 * disconnect-completed transitions; the `connected` boolean is the tag. `mtu` carries the negotiated GATT MTU (only meaningful on `connected=true`); `error`
 * carries a nonzero firmware-level error code when the transition failed (typical on `connected=false` for a failed connection attempt).
 */
export interface ConnectionStateData {

  /** Device BLE address. uint64 on the wire; bigint here for end-to-end precision. */
  readonly address: bigint;

  /** Whether the device is currently connected (true) or disconnected (false) after this transition. */
  readonly connected: boolean;

  /** Firmware-level error code. Zero on success; nonzero on a failed transition. The numeric value is a passthrough from the upstream ESPHome BLE proxy component. */
  readonly error: number;

  /** Negotiated GATT MTU for the connected session. Zero on disconnect transitions. */
  readonly mtu: number;
}

/**
 * Snapshot of the device's connection-slot capacity, pushed via `BluetoothConnectionsFreeResponse` (id 81). The device pushes this on subscribe and on every change so
 * consumers can adapt to slot pressure dynamically (e.g., back off a probe loop when `free === 0`).
 */
export interface ConnectionsFreeData {

  /** Addresses currently using a slot. Uint64 on the wire; bigint here. */
  readonly allocated: readonly bigint[];

  /** Number of unused slots available for new connections. */
  readonly free: number;

  /** Total slot count. `free + allocated.length === limit` in well-formed pushes. */
  readonly limit: number;
}

/**
 * One inbound GATT notify chunk. Emitted on the `bluetoothNotifyData` bus event whenever the device pushes a `BluetoothGATTNotifyDataResponse` (id 79); the
 * {@link BluetoothProxyApi.notify} iterator filters by `(address, handle)` so consumers see only the notifications they subscribed to.
 */
export interface NotifyDataChunk {

  /** Device BLE address. */
  readonly address: bigint;

  /** Notification payload bytes. */
  readonly data: Buffer;

  /** Characteristic handle the notification fires for. */
  readonly handle: number;
}

/**
 * GATT descriptor metadata. Carried inside {@link BluetoothGATTCharacteristic.descriptors}; surfaced from {@link BluetoothProxyApi.getServices}. The wire fields are
 * (`uuid: repeated uint64`, `handle`, `short_uuid`) - 128-bit UUIDs arrive as two-element uint64 arrays; shorter assigned-number UUIDs arrive on `shortUuid`.
 */
export interface BluetoothGATTDescriptor {

  /** Descriptor handle. */
  readonly handle: number;

  /** 16-bit or 32-bit assigned-number UUID. Set when `uuid` is unset. */
  readonly shortUuid?: number;

  /** 128-bit UUID as two `uint64` halves (little end first). Set when `shortUuid` is unset. */
  readonly uuid?: readonly bigint[];
}

/**
 * GATT characteristic metadata. The `properties` bitmask encodes the characteristic-properties bits (Read = 0x02, Write = 0x08, Notify = 0x10, etc.) as defined in the
 * Bluetooth Core spec; this surface passes the value through unchanged for the consumer to bit-test.
 */
export interface BluetoothGATTCharacteristic {

  /** Descriptors associated with this characteristic. */
  readonly descriptors: readonly BluetoothGATTDescriptor[];

  /** Characteristic value handle. Pass this handle to {@link BluetoothProxyApi.readCharacteristic} / {@link BluetoothProxyApi.writeCharacteristic}. */
  readonly handle: number;

  /** BLE Core characteristic-properties bitmask. Consumers bit-test to gate UI affordances. */
  readonly properties: number;

  /** 16-bit or 32-bit assigned-number UUID. Set when `uuid` is unset. */
  readonly shortUuid?: number;

  /** 128-bit UUID as two `uint64` halves. */
  readonly uuid?: readonly bigint[];
}

/**
 * GATT service metadata. Surfaced from {@link BluetoothProxyApi.getServices} as an array of services; the device streams services across multiple wire frames terminated
 * by a sentinel, and the sub-API accumulates them transparently.
 */
export interface BluetoothGATTService {

  /** Characteristics owned by this service. */
  readonly characteristics: readonly BluetoothGATTCharacteristic[];

  /** Service handle (the start of the service's attribute range). */
  readonly handle: number;

  /** 16-bit or 32-bit assigned-number UUID. */
  readonly shortUuid?: number;

  /** 128-bit UUID as two `uint64` halves. */
  readonly uuid?: readonly bigint[];
}

/**
 * Per-link connection parameters carried on `BluetoothSetConnectionParamsRequest` (id 145).
 *
 * - `minInterval` / `maxInterval` are connection-interval bounds in units of 1.25 ms (BLE spec convention).
 * - `latency` is the slave-latency count - the peripheral may skip this many consecutive connection events without consequence.
 * - `timeout` is the supervision timeout in units of 10 ms.
 */
export interface ConnectionParams {

  readonly latency: number;

  readonly maxInterval: number;

  readonly minInterval: number;

  readonly timeout: number;
}

/**
 * Narrow seam the host implements for the Bluetooth-proxy sub-API. Mirrors {@link VoiceAssistantHost} and
 * {@link SerialProxyHost} in shape: a bus, a logger, a frame-send hook, plus a read-through accessor for the latest decoded {@link
 * DeviceInfo} so the {@link BluetoothProxyApi.available} getter can consult the BLE-proxy feature flags without reaching into host private fields.
 *
 * @internal
 */
export interface BluetoothProxyHost {

  readonly bus: EventBus<ClientEventsMap>;

  /**
   * Read-through accessor for the latest decoded device-info. Used by {@link BluetoothProxyApi.available} to gate consumer code on `bluetoothProxyFeatureFlags`.
   * Returns `null` before discovery completes.
   */
  deviceInfo(): Nullable<{ bluetoothProxyFeatureFlags?: number }>;

  readonly log: EspHomeLogging;

  /** Synchronous frame-send hook - the host wraps `frameAndSend(MessageType.X, payload)`. */
  send(type: number, payload: Buffer): void;
}

/**
 * Per-message field-count cap for the bounded protobuf decoder used here. Service-discovery responses carry nested-message lists whose entry count is bounded by the
 * device's GATT table size (typically tens, not thousands), but a malformed message must not run away. The 1024-field default applied across the codebase is the right
 * ceiling: high enough that no legitimate BLE-proxy frame trips it, low enough that a malformed message cannot exhaust memory.
 */
const BLUETOOTH_DECODE_MAX_FIELDS = 1024;

/**
 * Default GATT operation timeout in milliseconds. Used as the floor when a caller does not pass an explicit `timeoutMs`. Ten seconds is generous for any single GATT
 * operation (read, write, notify-setup) and aligns with what `bleak` and similar libraries default to.
 */
const DEFAULT_GATT_TIMEOUT_MS = 10000;

/**
 * Default service-discovery timeout in milliseconds. Service discovery is a multi-frame streamed exchange and can run noticeably longer than a single read - thirty
 * seconds is the upstream-firmware-recommended ceiling for the full service walk on a slow peripheral.
 */
const DEFAULT_SERVICE_DISCOVERY_TIMEOUT_MS = 30000;

/**
 * Default connection-lifecycle timeout in milliseconds. Connect / disconnect / pair / unpair / clearCache all share this ceiling. Sixty seconds is the upstream-firmware
 * convention - some peripherals take a while to honor a directed pairing request.
 */
const DEFAULT_LIFECYCLE_TIMEOUT_MS = 60000;

/**
 * The single constant wire key every {@link BluetoothProxyApi.advertisements} subscriber groups under. BLE advertisement scanning is device-wide - the device either
 * streams every observed advertisement to the client or it does not - so there is exactly one wire subscription regardless of consumer count. The actual value is
 * irrelevant; what matters is that every subscriber shares this one key so they aggregate into a single `ReissuableSubscription` entry.
 */
const ADVERTISEMENT_CHANNEL = 0;

/**
 * The single constant wire key every {@link BluetoothProxyApi.connectionsFree} subscriber groups under. Connection-slot capacity is a device-wide subscription, mirroring
 * {@link ADVERTISEMENT_CHANNEL}. Unlike advertisement, the device has no unsubscribe frame for connections-free, so the subscription's on-change hook treats the EMPTY
 * transition as a deliberate no-op.
 */
const CONNECTIONS_FREE_CHANNEL = 0;

/**
 * Serialise an `(address, handle)` tuple to a deterministic string for use as a Correlator key or a Map index. Implemented as `address.toString(16) + ":" +
 * handle.toString(16)` so two structurally-equal tuples hash to the same slot; the same serialiser feeds the GATT-error router so its "try-each-Correlator-reject" pass
 * is key-coherent with the in-flight Correlators.
 *
 * @param address - Device BLE address as a bigint.
 * @param handle - Attribute handle as a number.
 * @returns The serialised composite key.
 */
function makeGattKey(address: bigint, handle: number): string {

  return address.toString(16) + ":" + handle.toString(16);
}

/**
 * Bluetooth-proxy sub-API. Single instance per client; created lazily on first access via {@link EspHomeClient.bluetooth}.
 */
export class BluetoothProxyApi implements SubscriptionLifecycle {

  private readonly host: BluetoothProxyHost;

  /**
   * Global advertisement subscription. Every {@link advertisements} iterator acquires a subscriber under the single {@link ADVERTISEMENT_CHANNEL} key; the first acquire
   * issues a wire-side `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` and the last release issues `UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST`. The subscription is
   * device-wide rather than per-key - the device either streams every observed advertisement to the client or it does not - so every subscriber groups under one constant
   * wire key.
   *
   * Built on `ReissuableSubscription` so the consumer subscriber ledger survives reconnect while the connection-scoped wire cache resets.
   * A consumer iterator parked in `for await` across a reconnect stays live: {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect}
   * replays SUBSCRIBE for the surviving subscribers. The intent and reduced desired-state are a unit `true` presence marker; an empty subscriber set reduces to
   * {@link EMPTY}, which the on-change hook maps to UNSUBSCRIBE.
   */
  private readonly advertisementSubscription: ReissuableSubscription<number, boolean, boolean>;

  /**
   * Most-recent scanner-state push received from the device on this connection. Updated every time the device pushes a wire-level `BluetoothScannerStateResponse`;
   * cleared on {@link clearConnectionState}. The {@link lastScannerState} accessor reads this synchronously so consumers can probe the current state without iterating
   * the stream.
   */
  private cachedScannerState: Nullable<BluetoothScannerStateData> = null;

  // GATT correlators. The topology is determined by *response shape*, not request shape: characteristic read and descriptor read share a single response message (74),
  // so they share a single Correlator; characteristic write and descriptor write likewise share response 83 and a single Correlator. Connect and disconnect both
  // arrive on message 69, but the *semantics* differ (connect resolves on connected=true with a value, disconnect resolves on connected=false with void), so they get
  // separate Correlators told apart by the `connected` boolean at dispatch time.

  /** Resolves `BluetoothGATTReadResponse` (id 74) for both `readCharacteristic` and `readDescriptor`. Keyed by `makeGattKey(address, handle)`. */
  private readonly readCorrelator: Correlator<Buffer> = new Correlator<Buffer>();

  /** Resolves `BluetoothGATTWriteResponse` (id 83) for both `writeCharacteristic(response=true)` and `writeDescriptor`. Keyed by `makeGattKey(address, handle)`. */
  private readonly writeCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothGATTNotifyResponse` (id 84) for `setNotify(enable=true|false)`. Keyed by `makeGattKey(address, handle)`. */
  private readonly notifySetupCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothDeviceConnectionResponse` (id 69) with `connected=true` for `connect`. Keyed by `address.toString()`. */
  private readonly connectCorrelator: Correlator<ConnectionStateData> = new Correlator<ConnectionStateData>();

  /** Resolves `BluetoothDeviceConnectionResponse` (id 69) with `connected=false` for `disconnect`. Keyed by `address.toString()`. */
  private readonly disconnectCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothDevicePairingResponse` (id 85). Keyed by `address.toString()`. */
  private readonly pairCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothDeviceUnpairingResponse` (id 86). Keyed by `address.toString()`. */
  private readonly unpairCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothDeviceClearCacheResponse` (id 88). Keyed by `address.toString()`. */
  private readonly clearCacheCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves `BluetoothSetConnectionParamsResponse` (id 146). Keyed by `address.toString()`. */
  private readonly setConnectionParamsCorrelator: Correlator<void> = new Correlator<void>();

  /** Resolves on `BluetoothGATTGetServicesDoneResponse` (id 72) with the accumulator built from prior 71 frames. Keyed by `address.toString()`. */
  private readonly serviceDiscoveryCorrelator: Correlator<BluetoothGATTService[]> = new Correlator<BluetoothGATTService[]>();

  /**
   * Per-(address, handle) notify subscription, keyed by `makeGattKey(address, handle)`. This is a REISSUE-ONLY ledger: {@link acquire} / {@link release} are deliberately
   * wire-silent because the wire-side notify enable/disable is the caller's responsibility via {@link setNotify}. The ledger exists solely so {@link reissueOnReconnect}
   * knows which (address, handle) pairs to re-arm with `BLUETOOTH_GATT_NOTIFY_REQUEST(enable=1)` after a reconnect.
   *
   * Built on `ReissuableSubscription` with `onChange` OMITTED (so acquire / release have no on-change wire effect) and an
   * {@link ReissuableSubscriptionOptions.onReissue} hook that replays the per-key NOTIFY enable. The subscriber ledger survives reconnect so a
   * consumer iterator parked in `for await` across a reconnect stays live and its key is re-armed by {@link reissueOnReconnect}; the intent and reduced desired-state are
   * a unit `true` presence marker.
   */
  private readonly notifySubscription: ReissuableSubscription<string, boolean, boolean>;

  /** Connection-state cache keyed by `address.toString()`. Fed by every `BluetoothDeviceConnectionResponse` push regardless of whether it correlates to an awaiter. */
  private readonly connectionStateCache: Map<string, ConnectionStateData> = new Map<string, ConnectionStateData>();

  /** Streaming service-discovery accumulator keyed by `address.toString()`. Cleared on the matching Done sentinel or on abort/timeout via the await's finally block. */
  private readonly inflightServices: Map<string, BluetoothGATTService[]> = new Map<string, BluetoothGATTService[]>();

  /** Most-recent `BluetoothConnectionsFreeResponse`, cached for {@link lastConnectionsFree}. */
  private cachedConnectionsFree: Nullable<ConnectionsFreeData> = null;

  /**
   * Global connections-free subscription. Every {@link connectionsFree} iterator acquires a subscriber under the single {@link CONNECTIONS_FREE_CHANNEL} key; the first
   * acquire issues a wire-side `SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST`. Unlike advertisement, the device has NO unsubscribe frame for connections-free, so the
   * last release is deliberately wire-silent (the on-change hook treats the EMPTY transition as a no-op). The subscription is device-wide rather than per-key.
   *
   * Built on `ReissuableSubscription` so the consumer subscriber ledger survives reconnect while the connection-scoped wire cache resets.
   * A consumer iterator parked in `for await` across a reconnect stays live: {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect}
   * replays SUBSCRIBE for the surviving subscribers. The intent and reduced desired-state are a unit `true` presence marker.
   */
  private readonly connectionsFreeSubscription: ReissuableSubscription<number, boolean, boolean>;

  /**
   * Constructs the sub-API. The host argument carries the bus, logger, send hook, and device-info accessor; the sub-API does not store or read other host state.
   *
   * @param host - The host seam.
   * @internal
   */
  public constructor(host: BluetoothProxyHost) {

    this.host = host;

    // The global advertisement channel is a single device-wide wire subscription, so every subscriber groups under the one constant ADVERTISEMENT_CHANNEL key with a unit
    // `true` intent. A non-empty subscriber set reduces to `true` (SUBSCRIBE); an empty set reduces to EMPTY, which onChange maps to UNSUBSCRIBE. The primitive preserves
    // the subscriber ledger across reconnect so a parked consumer iterator survives, while the connection-scoped wire cache resets via clearConnectionState.
    this.advertisementSubscription = new ReissuableSubscription<number, boolean, boolean>({

      onChange: (_key: number, desired: boolean | typeof EMPTY): void => {

        // Advertisement is symmetric: the EMPTY transition (last subscriber left) emits a wire UNSUBSCRIBE; any concrete desired-state emits SUBSCRIBE.
        if(desired === EMPTY) {

          this.host.send(MessageType.UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST, Buffer.alloc(0));

          return;
        }

        this.sendSubscribe();
      },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true
    });

    // The global connections-free channel is a single device-wide wire subscription keyed by the one constant CONNECTIONS_FREE_CHANNEL with a unit `true` intent. A
    // non-empty subscriber set reduces to `true` (SUBSCRIBE). Unlike advertisement, the device has NO unsubscribe frame for connections-free, so we set retainOnEmpty:
    // true - dropping the last subscriber is wire-silent and the cached `true` PERSISTS (the device keeps streaming until the connection drops). That keeps a re-open of
    // connectionsFree() after all prior iterators closed wire-silent instead of re-issuing a redundant SUBSCRIBE; the EMPTY transition therefore never reaches onChange,
    // and the guard below is purely type-safety.
    this.connectionsFreeSubscription = new ReissuableSubscription<number, boolean, boolean>({

      onChange: (_key: number, desired: boolean | typeof EMPTY): void => {

        // With retainOnEmpty: true the EMPTY transition never reaches onChange, so this guard is purely type-safety. A concrete desired-state (first attach, or a
        // reconnect replay) re-issues the SUBSCRIBE.
        if(desired !== EMPTY) {

          this.sendConnectionsFreeSubscribe();
        }
      },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true,
      retainOnEmpty: true
    });

    // The per-(address, handle) notify channel is a REISSUE-ONLY ledger keyed by makeGattKey with a unit `true` intent. onChange is OMITTED so acquire / release stay
    // wire-silent (the wire enable/disable is the caller's responsibility via setNotify); onReissue replays the per-key NOTIFY(enable=1) so a parked consumer iterator's
    // key is re-armed after a reconnect. A non-empty subscriber set reduces to `true`; an empty set reduces to EMPTY (which has no reissue effect because empty keys are
    // skipped during reissue).
    this.notifySubscription = new ReissuableSubscription<string, boolean, boolean>({

      onReissue: (key: string, _desired: boolean): void => {

        // Split the composite key back into (address, handle) and re-issue NOTIFY(enable=1). The key format is `address.toString(16) + ":" + handle.toString(16)` per
        // makeGattKey; a malformed key (missing either half) is skipped defensively, though the ledger only ever holds keys this module minted.
        const [ addressHex, handleHex ] = key.split(":");

        if((addressHex === undefined) || (handleHex === undefined)) {

          return;
        }

        const address = BigInt("0x" + addressHex);
        const handle = parseInt(handleHex, 16);

        // Fire-and-forget: we do NOT await NOTIFY_RESPONSE on the re-issue path because the consumer is already iterating and a missed setup response is recoverable
        // (the device will re-emit notify data once it accepts the request). A failure here would leave the iterator parked forever, which is worse than the silent path.
        this.host.send(MessageType.BLUETOOTH_GATT_NOTIFY_REQUEST, encodeProtoFields([
          { fieldNumber: 1, value: address, wireType: WireType.VARINT },
          { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
          { fieldNumber: 3, value: 1, wireType: WireType.VARINT }
        ]));
      },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true
    });
  }

  /**
   * Reset ONLY connection-scoped state. Called by the host at disconnect and again at connect-top. Rejects every pending GATT Correlator with an `AbortError`
   * (in-flight request/response state cannot outlive the connection it was issued on), clears the connection-scoped caches and accumulators (scanner-state,
   * connections-free, connection-state, inflight-services), and clears each subscription's connection-scoped wire cache (the device starts every fresh connection with no
   * subscription). The consumer
   * subscriber ledgers are PRESERVED: iterators alive across the reconnect cycle stay live, and the host's {@link reissueOnReconnect} call after the new connection is up
   * re-issues SUBSCRIBE (advertisement, connections-free) and NOTIFY(enable=1) (notify) for the surviving consumers.
   *
   * Notes for callers:
   *
   * - In-flight `connect`, `disconnect`, `pair`, `unpair`, `clearCache`, `read`, `write`, `setNotify`, `getServices`, `setConnectionParams` awaits all reject with
   *   `DOMException("AbortError")` so callers see a uniform abort signal regardless of which Correlator was holding them.
   * - `connectionStateCache` is cleared so {@link isConnected} reports `false` for every previously-connected address. Consumers that want to reconnect must
   *   call {@link connect} again; we do NOT auto-reconnect peripherals across a host-level reconnect because the consumer's intent for each address is application-level
   *   policy, not library-level policy.
   */
  public clearConnectionState(): void {

    this.cachedScannerState = null;

    const abortReason = new DOMException("Bluetooth-proxy sub-API was reset; pending GATT awaits are aborted.", "AbortError");

    this.readCorrelator.rejectAll(abortReason);
    this.writeCorrelator.rejectAll(abortReason);
    this.notifySetupCorrelator.rejectAll(abortReason);
    this.connectCorrelator.rejectAll(abortReason);
    this.disconnectCorrelator.rejectAll(abortReason);
    this.pairCorrelator.rejectAll(abortReason);
    this.unpairCorrelator.rejectAll(abortReason);
    this.clearCacheCorrelator.rejectAll(abortReason);
    this.setConnectionParamsCorrelator.rejectAll(abortReason);
    this.serviceDiscoveryCorrelator.rejectAll(abortReason);

    this.connectionStateCache.clear();
    this.inflightServices.clear();
    this.cachedConnectionsFree = null;

    // Clear each subscription's connection-scoped wire cache. The subscriber LEDGERS are intentionally preserved so a parked consumer iterator survives the reconnect
    // cycle; only the "what we last told this device" cache resets, exactly as the primitive's clearConnectionState documents.
    this.advertisementSubscription.clearConnectionState();
    this.connectionsFreeSubscription.clearConnectionState();
    this.notifySubscription.clearConnectionState();
  }

  /**
   * Re-establish wire-side subscriptions on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to each subscription's
   * `ReissuableSubscription.reissueOnReconnect`, which replays the surviving consumers' desired state onto the new transport:
   *
   * - Advertisement: re-issues `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` when at least one {@link advertisements} iterator is alive (via the subscription's
   *   on-change hook).
   * - Connections-free: re-issues `SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST` when at least one {@link connectionsFree} iterator is alive.
   * - Notify: re-issues `BLUETOOTH_GATT_NOTIFY_REQUEST(enable=1)` for each (address, handle) with a surviving {@link notify} iterator (via the subscription's on-reissue
   *   hook, since acquire / release on the notify ledger are wire-silent).
   *
   * Each dimension is a pure no-op when no consumer survives - keys with no live subscribers are skipped during reissue, so a subscription whose consumers all left does
   * not resurrect. Connection state itself is NOT auto-restored. A peripheral is dropped by the device when the proxy disconnects, so attempting to `connect()` for the
   * user without the user asking is a footgun. Consumers reconnect their peripherals explicitly after the host-level `connect` event fires.
   *
   * @remarks {@link clearConnectionState} resets only the wire caches as part of disconnect cleanup; the subscriber ledgers survive, so this method finds the surviving
   * consumers and re-arms their keys. The iterator's `for await` continues running across the cycle and its first `bus.stream` yield resumes naturally once the wire-side
   * subscription re-issues. Mirrors `LogSubscriptionManager.reissueOnReconnect`.
   */
  public reissueOnReconnect(): void {

    this.advertisementSubscription.reissueOnReconnect();
    this.connectionsFreeSubscription.reissueOnReconnect();
    this.notifySubscription.reissueOnReconnect();
  }

  /**
   * Whether the connected device advertises Bluetooth-proxy support. Reads `bluetoothProxyFeatureFlags` from the latest {@link DeviceInfo}; returns
   * `false` when discovery has not completed or when the device firmware was not compiled with `USE_BLUETOOTH_PROXY`. Any nonzero feature-flag bitmask reads as `true`;
   * the individual bit semantics are upstream concerns not surfaced here.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-availability}
   *
   */
  public get available(): boolean {

    const flags = this.host.deviceInfo()?.bluetoothProxyFeatureFlags;

    return (flags !== undefined) && (flags > 0);
  }

  /**
   * The most recent scanner-state push received from the device on this connection, or `null` if none has arrived yet (or after a {@link clearConnectionState}). The full
   * stream of state pushes is available via {@link scannerState}; this accessor is the synchronous-snapshot counterpart for consumers that want the current state without
   * iterating.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-scanner-state}
   *
   * @returns The cached {@link BluetoothScannerStateData}, or `null` when no push has been observed on the current connection.
   *
   */
  public lastScannerState(): Nullable<BluetoothScannerStateData> {

    return this.cachedScannerState;
  }

  /**
   * Set the BLE scanner mode. Fire-and-forget at the wire level; the device confirms the mode change via the next {@link scannerState} push. To synchronously await
   * the confirmed change, iterate {@link scannerState} and break when both `state.mode === mode` and `state.state === BluetoothScannerState.RUNNING`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-scanner-mode}
   *
   * @param mode - The desired scanner mode. {@link BluetoothScannerMode.PASSIVE} listens for broadcasts only;
   * {@link BluetoothScannerMode.ACTIVE} additionally elicits scan-response data from advertisers.
   *
   */
  public setScannerMode(mode: BluetoothScannerMode): void {

    const fields: ProtoField[] = [{ fieldNumber: 1, value: mode, wireType: WireType.VARINT }];

    this.host.send(MessageType.BLUETOOTH_SCANNER_SET_MODE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Backpressured async-iterable view of inbound BLE advertisements. First iterator issues a wire-side `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` with `flags: 0`;
   * the last iterator to detach issues `UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST`. Concurrent iterators share the wire-side subscription (only one SUBSCRIBE is
   * sent regardless of consumer count). The subscription survives reconnect via {@link reissueOnReconnect}.
   *
   * Each yielded {@link BluetoothLERawAdvertisement} is a single advertisement. The device batches multiple ads into one wire message
   * (`BluetoothLERawAdvertisementsResponse.advertisements`); the handler fans them out before they reach the iterator so consumers filter / count / aggregate
   * per-advertisement, not per-batch.
   *
   * @remarks The wire-side `flags` field is documented as `uint32` in `api.proto` without further specification; we pass `0` which matches the upstream firmware's
   * default-subscription behavior. If a future ESPHome release documents flag bits, plumbing them through becomes an additive option.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-advertisements}
   *
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("bluetoothAdvertisement", options)`.
   * @returns An `AsyncIterable<BluetoothLERawAdvertisement>` that yields ads until the consumer aborts, the connection drops, or the stream completes.
   *
   */
  public advertisements(options?: StreamOptions): AsyncIterable<BluetoothLERawAdvertisement> {

    // Acquire a subscriber synchronously at call time so concurrent attaches are race-free. The first acquire on ADVERTISEMENT_CHANNEL drives the reduction from EMPTY to
    // `true`, which fires the wire-side SUBSCRIBE; subsequent acquires share the same subscription (the reduction is already `true`, so onChange is suppressed).
    const handle = this.advertisementSubscription.acquire(ADVERTISEMENT_CHANNEL, true);
    const stream = this.host.bus.stream("bluetoothAdvertisement", options);

    // Cleanup as a `this`-capturing arrow so the IIFE generator below doesn't need a `this` alias. The primitive pairs release to acquire by symbol identity, so the
    // last release drives the reduction back to EMPTY (firing UNSUBSCRIBE) and a post-reconnect dispose is correct without any "still nonzero" guard - the ledger
    // survived the reconnect and the wire cache was re-armed by reissueOnReconnect.
    const releaseSubscription = (): void => {

      this.advertisementSubscription.release(handle);
    };

    return (async function *(): AsyncGenerator<BluetoothLERawAdvertisement> {

      try {

        for await (const ad of stream) {

          yield ad;
        }

      } finally {

        releaseSubscription();
      }
    })();
  }

  /**
   * Backpressured async-iterable view of scanner-state changes. The device pushes a new state whenever the scanner transitions (e.g., after {@link setScannerMode}).
   * Does NOT issue any subscribe/unsubscribe at the wire level - scanner-state pushes are unsolicited.
   *
   * @remarks The iterator yields only future pushes - historical state is not replayed. Consumers that want the current state synchronously read {@link
   * lastScannerState}; those that want the next transition iterate this stream and break on the first yield.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-scanner-state}
   *
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("bluetoothScannerState", options)`.
   * @returns An `AsyncIterable<BluetoothScannerStateData>`.
   *
   */
  public scannerState(options?: StreamOptions): AsyncIterable<BluetoothScannerStateData> {

    return this.host.bus.stream("bluetoothScannerState", options);
  }

  /**
   * Read the current advertisement-subscriber count. Primarily a test affordance plus a debug aid via the `util.inspect` hook. Reads the subscription's live-subscriber
   * ledger size, which is unchanged by {@link clearConnectionState} (the ledger survives the reconnect cycle while only the wire cache resets).
   *
   * @returns The number of active iterators currently attached.
   */
  public subscriberCount(): number {

    return this.advertisementSubscription.size;
  }

  /**
   * Connect to a peripheral. Sends `BluetoothDeviceRequest(CONNECT_V3_WITH_CACHE | CONNECT_V3_WITHOUT_CACHE)` and awaits `BluetoothDeviceConnectionResponse` with the
   * `connected=true` tag. The deprecated `CONNECT=0` variant is never used - this client uses the V3 variants unconditionally; the cached/uncached choice is
   * the caller's via the `useCache` option.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connect}
   *
   * @param address - Device BLE address as a bigint.
   * @param options - Optional `addressType`, `signal`, `timeoutMs`, and `useCache` (default true).
   * @returns The resolved {@link ConnectionStateData}.
   *
   * @throws {@link ConnectionError} with code `"GATT_CONNECT_FAILED"` when the device reports `connected=false` with a nonzero `error` field.
   * @throws {@link ConnectionError} with code `"GATT_CONNECT_IN_FLIGHT"` when another connect for the same address is already pending.
   *
   */
  public async connect(address: bigint, options?: { addressType?: number; signal?: AbortSignal; timeoutMs?: number; useCache?: boolean }): Promise<ConnectionStateData> {

    const key = address.toString();

    if(this.connectCorrelator.pending(key)) {

      throw new ConnectionError("connect is already in flight for address " + key + ".", "GATT_CONNECT_IN_FLIGHT");
    }

    const requestType: BluetoothDeviceRequestTypeValue = (options?.useCache ?? true) ?
      BluetoothDeviceRequestType.CONNECT_V3_WITH_CACHE :
      BluetoothDeviceRequestType.CONNECT_V3_WITHOUT_CACHE;

    this.sendDeviceRequest(address, requestType, options?.addressType);

    return this.connectCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS));
  }

  /**
   * Disconnect from a peripheral. Sends `BluetoothDeviceRequest(DISCONNECT)` and awaits `BluetoothDeviceConnectionResponse` with `connected=false`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connect}
   *
   * @param address - Device BLE address.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_DISCONNECT_IN_FLIGHT"` when another disconnect for the same address is already pending.
   *
   */
  public async disconnect(address: bigint, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = address.toString();

    if(this.disconnectCorrelator.pending(key)) {

      throw new ConnectionError("disconnect is already in flight for address " + key + ".", "GATT_DISCONNECT_IN_FLIGHT");
    }

    this.sendDeviceRequest(address, BluetoothDeviceRequestType.DISCONNECT);

    return this.disconnectCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS));
  }

  /**
   * Initiate pairing with a peripheral. Sends `BluetoothDeviceRequest(PAIR)` and awaits `BluetoothDevicePairingResponse`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-pair-unpair}
   *
   * @param address - Device BLE address.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_PAIR_FAILED"` when the device reports `paired=false` or a nonzero `error` field.
   * @throws {@link ConnectionError} with code `"GATT_PAIR_IN_FLIGHT"` when another pair for the same address is already pending.
   *
   */
  public async pair(address: bigint, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = address.toString();

    if(this.pairCorrelator.pending(key)) {

      throw new ConnectionError("pair is already in flight for address " + key + ".", "GATT_PAIR_IN_FLIGHT");
    }

    this.sendDeviceRequest(address, BluetoothDeviceRequestType.PAIR);

    return this.pairCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS));
  }

  /**
   * Remove pairing with a peripheral. Sends `BluetoothDeviceRequest(UNPAIR)` and awaits `BluetoothDeviceUnpairingResponse`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-pair-unpair}
   *
   * @param address - Device BLE address.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_UNPAIR_FAILED"` when the device reports `success=false` or a nonzero `error` field.
   * @throws {@link ConnectionError} with code `"GATT_UNPAIR_IN_FLIGHT"` when another unpair for the same address is already pending.
   *
   */
  public async unpair(address: bigint, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = address.toString();

    if(this.unpairCorrelator.pending(key)) {

      throw new ConnectionError("unpair is already in flight for address " + key + ".", "GATT_UNPAIR_IN_FLIGHT");
    }

    this.sendDeviceRequest(address, BluetoothDeviceRequestType.UNPAIR);

    return this.unpairCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS));
  }

  /**
   * Clear the GATT cache for a peripheral. Sends `BluetoothDeviceRequest(CLEAR_CACHE)` and awaits `BluetoothDeviceClearCacheResponse`. Useful after a peripheral
   * firmware upgrade changes its GATT layout - clearing the cache forces a fresh service discovery on the next connect.
   *
   * @param address - Device BLE address.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_CLEAR_CACHE_FAILED"` when the device reports `success=false` or a nonzero `error` field.
   * @throws {@link ConnectionError} with code `"GATT_CLEAR_CACHE_IN_FLIGHT"` when another clearCache for the same address is already pending.
   */
  public async clearCache(address: bigint, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = address.toString();

    if(this.clearCacheCorrelator.pending(key)) {

      throw new ConnectionError("clearCache is already in flight for address " + key + ".", "GATT_CLEAR_CACHE_IN_FLIGHT");
    }

    this.sendDeviceRequest(address, BluetoothDeviceRequestType.CLEAR_CACHE);

    return this.clearCacheCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS));
  }

  /**
   * Discover services on a connected peripheral. Sends `BluetoothGATTGetServicesRequest` and accumulates streamed `BluetoothGATTGetServicesResponse` frames until the
   * matching `BluetoothGATTGetServicesDoneResponse` sentinel arrives.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-get-services}
   *
   * @param address - Device BLE address.
   * @param options - Optional cancellation signal and timeout.
   * @returns The full service list as an array, preserving wire-order.
   *
   * @throws {@link ConnectionError} with code `"GATT_GET_SERVICES_IN_FLIGHT"` when another getServices for the same address is already pending.
   *
   */
  public async getServices(address: bigint, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<BluetoothGATTService[]> {

    const key = address.toString();

    if(this.serviceDiscoveryCorrelator.pending(key)) {

      throw new ConnectionError("getServices is already in flight for address " + key + ".", "GATT_GET_SERVICES_IN_FLIGHT");
    }

    // Seed the accumulator before sending so any inbound 71 frames have a destination. The accumulator's lifetime is bounded by the await's finally block below, which
    // ensures cleanup on every settle path (resolve, reject, abort, timeout).
    this.inflightServices.set(key, []);

    this.host.send(MessageType.BLUETOOTH_GATT_GET_SERVICES_REQUEST, encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT }
    ]));

    try {

      return await this.serviceDiscoveryCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_SERVICE_DISCOVERY_TIMEOUT_MS));

    } finally {

      // On a clean resolve via {@link acceptGetServicesDoneResponse}, the accumulator was already deleted there. The finally is harmless in that case and required
      // on reject/abort/timeout, where the Done sentinel never arrives and the map entry would otherwise leak.
      this.inflightServices.delete(key);
    }
  }

  /**
   * Read a characteristic value. Sends `BluetoothGATTReadRequest` and awaits the matching `BluetoothGATTReadResponse`. A `BluetoothGATTErrorResponse` for the same
   * (address, handle) rejects the await with `code="GATT_ERROR"`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-read-write}
   *
   * @param address - Device BLE address.
   * @param handle - Characteristic value handle (from {@link getServices}).
   * @param options - Optional cancellation signal and timeout.
   * @returns The characteristic value bytes.
   *
   * @throws {@link ConnectionError} with code `"GATT_READ_IN_FLIGHT"` when another read for the same (address, handle) is already pending.
   * @throws {@link ConnectionError} with code `"GATT_ERROR"` when the device returns an error for the operation.
   *
   */
  public async readCharacteristic(address: bigint, handle: number, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<Buffer> {

    return this.readImpl(address, handle, MessageType.BLUETOOTH_GATT_READ_REQUEST, options);
  }

  /**
   * Write a characteristic value. By default fire-and-forget at the wire level (`response=false`); pass `options.response=true` to await
   * `BluetoothGATTWriteResponse`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-read-write}
   *
   * @param address - Device BLE address.
   * @param handle - Characteristic value handle.
   * @param data - The bytes to write.
   * @param options - Optional `response` (default false), cancellation signal, and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_WRITE_IN_FLIGHT"` when `response=true` and another write for the same (address, handle) is already pending.
   * @throws {@link ConnectionError} with code `"GATT_ERROR"` when `response=true` and the device returns an error.
   *
   */
  public async writeCharacteristic(address: bigint, handle: number, data: Buffer,
    options?: { response?: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const expectResponse = options?.response ?? false;
    const payload = encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
      { fieldNumber: 3, value: expectResponse ? 1 : 0, wireType: WireType.VARINT },
      { fieldNumber: 4, value: data, wireType: WireType.LENGTH_DELIMITED }
    ]);

    if(!expectResponse) {

      // Fire-and-forget. No Correlator awaiting; no response will come. A stray BluetoothGATTWriteResponse for this (address, handle) is logged at debug by the
      // dispatcher and otherwise ignored.
      this.host.send(MessageType.BLUETOOTH_GATT_WRITE_REQUEST, payload);

      return;
    }

    const key = makeGattKey(address, handle);

    if(this.writeCorrelator.pending(key)) {

      throw new ConnectionError("writeCharacteristic is already in flight for (" + address.toString() + ", " + handle.toString() + ").", "GATT_WRITE_IN_FLIGHT");
    }

    this.host.send(MessageType.BLUETOOTH_GATT_WRITE_REQUEST, payload);

    return this.writeCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_GATT_TIMEOUT_MS));
  }

  /**
   * Read a descriptor value. Sends `BluetoothGATTReadDescriptorRequest` and awaits the matching `BluetoothGATTReadResponse` (shared with characteristic reads at the
   * wire level).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-descriptors}
   *
   * @param address - Device BLE address.
   * @param handle - Descriptor handle.
   * @param options - Optional cancellation signal and timeout.
   * @returns The descriptor value bytes.
   *
   * @throws {@link ConnectionError} with code `"GATT_READ_IN_FLIGHT"` when another read for the same (address, handle) is already pending.
   * @throws {@link ConnectionError} with code `"GATT_ERROR"` when the device returns an error.
   *
   */
  public async readDescriptor(address: bigint, handle: number, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<Buffer> {

    return this.readImpl(address, handle, MessageType.BLUETOOTH_GATT_READ_DESCRIPTOR_REQUEST, options);
  }

  /**
   * Write a descriptor value. Sends `BluetoothGATTWriteDescriptorRequest` and awaits the matching `BluetoothGATTWriteResponse` (shared with characteristic writes).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-descriptors}
   *
   * @param address - Device BLE address.
   * @param handle - Descriptor handle.
   * @param data - The bytes to write.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_WRITE_IN_FLIGHT"` when another write for the same (address, handle) is already pending.
   * @throws {@link ConnectionError} with code `"GATT_ERROR"` when the device returns an error.
   *
   */
  public async writeDescriptor(address: bigint, handle: number, data: Buffer, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = makeGattKey(address, handle);

    if(this.writeCorrelator.pending(key)) {

      throw new ConnectionError("writeDescriptor is already in flight for (" + address.toString() + ", " + handle.toString() + ").", "GATT_WRITE_IN_FLIGHT");
    }

    this.host.send(MessageType.BLUETOOTH_GATT_WRITE_DESCRIPTOR_REQUEST, encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
      { fieldNumber: 3, value: data, wireType: WireType.LENGTH_DELIMITED }
    ]));

    return this.writeCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_GATT_TIMEOUT_MS));
  }

  /**
   * Enable or disable device-side notifications for a (address, handle) pair. Sends `BluetoothGATTNotifyRequest` and awaits `BluetoothGATTNotifyResponse`. This sets up
   * the wire-side subscription; the actual notification data flows on a separate stream consumers iterate via {@link notify}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-notify}
   *
   * @param address - Device BLE address.
   * @param handle - Characteristic handle (the value handle, not the CCCD - the device handles CCCD writes internally).
   * @param enable - `true` to enable notifications, `false` to disable.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_NOTIFY_SETUP_IN_FLIGHT"` when another setNotify for the same (address, handle) is already pending.
   * @throws {@link ConnectionError} with code `"GATT_ERROR"` when the device returns an error.
   *
   */
  public async setNotify(address: bigint, handle: number, enable: boolean, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = makeGattKey(address, handle);

    if(this.notifySetupCorrelator.pending(key)) {

      throw new ConnectionError("setNotify is already in flight for (" + address.toString() + ", " + handle.toString() + ").", "GATT_NOTIFY_SETUP_IN_FLIGHT");
    }

    this.host.send(MessageType.BLUETOOTH_GATT_NOTIFY_REQUEST, encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: handle, wireType: WireType.VARINT },
      { fieldNumber: 3, value: enable ? 1 : 0, wireType: WireType.VARINT }
    ]));

    return this.notifySetupCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_GATT_TIMEOUT_MS));
  }

  /**
   * Iterate notification data for a (address, handle) pair. The iterator filters the global `bluetoothNotifyData` bus event so each consumer only sees notifications
   * for the handle they care about. Multiple concurrent iterators on the same (address, handle) all receive every push.
   *
   * Note that {@link setNotify} and {@link notify} are intentionally separate. `setNotify(enable=true)` issues the wire-side enable and awaits its response; `notify()`
   * is purely a client-side iterator over the resulting bus events. This mirrors how a BLE programmer thinks: "enable notify on this handle, then iterate the stream."
   * If the consumer iterates without calling setNotify first, the iterator parks - the device is not pushing data. If the consumer calls setNotify(false) while
   * iterating, the iterator stays open (no new data arrives, but the AsyncIterable's lifetime is the consumer's, not the device's).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-notify}
   *
   * @param address - Device BLE address.
   * @param handle - Characteristic handle (matching what was passed to {@link setNotify}).
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<NotifyDataChunk>`.
   *
   */
  public notify(address: bigint, handle: number, options?: StreamOptions): AsyncIterable<NotifyDataChunk> {

    const key = makeGattKey(address, handle);

    // Acquire a subscriber synchronously at call time so concurrent attaches are race-free. This is the reissue-only-ledger shape: acquire / release are wire-silent (the
    // notify subscription omits onChange) because the wire-side enable/disable is the caller's responsibility via {@link setNotify}. The ledger entry tells
    // {@link reissueOnReconnect} which (address, handle) pairs to re-arm after a reconnect. The local name avoids colliding with the `handle` parameter.
    const subscriberHandle = this.notifySubscription.acquire(key, true);
    const stream = this.host.bus.stream("bluetoothNotifyData", options);

    // Cleanup as a `this`-capturing arrow so the IIFE generator below doesn't need a `this` alias. The primitive pairs release to acquire by symbol identity and is
    // wire-silent for the notify ledger, so a post-reconnect dispose is correct without any guard - the ledger survived the reconnect and reissueOnReconnect re-armed
    // the surviving keys.
    const releaseSubscription = (): void => {

      this.notifySubscription.release(subscriberHandle);
    };

    return (async function *(): AsyncGenerator<NotifyDataChunk> {

      try {

        for await (const chunk of stream) {

          if((chunk.address === address) && (chunk.handle === handle)) {

            yield chunk;
          }
        }

      } finally {

        releaseSubscription();
      }
    })();
  }

  /**
   * Set per-link connection parameters on a connected peripheral. Sends `BluetoothSetConnectionParamsRequest` and awaits `BluetoothSetConnectionParamsResponse`.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connection-params}
   *
   * @param address - Device BLE address.
   * @param params - Connection-interval bounds, slave latency, and supervision timeout. See {@link ConnectionParams} for units.
   * @param options - Optional cancellation signal and timeout.
   *
   * @throws {@link ConnectionError} with code `"GATT_SET_CONNECTION_PARAMS_FAILED"` when the device returns a nonzero `error` field.
   * @throws {@link ConnectionError} with code `"GATT_SET_CONNECTION_PARAMS_IN_FLIGHT"` when another setConnectionParams for the same address is already pending.
   *
   */
  public async setConnectionParams(address: bigint, params: ConnectionParams, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void> {

    const key = address.toString();

    if(this.setConnectionParamsCorrelator.pending(key)) {

      throw new ConnectionError("setConnectionParams is already in flight for address " + key + ".", "GATT_SET_CONNECTION_PARAMS_IN_FLIGHT");
    }

    this.host.send(MessageType.BLUETOOTH_SET_CONNECTION_PARAMS_REQUEST, encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: params.minInterval, wireType: WireType.VARINT },
      { fieldNumber: 3, value: params.maxInterval, wireType: WireType.VARINT },
      { fieldNumber: 4, value: params.latency, wireType: WireType.VARINT },
      { fieldNumber: 5, value: params.timeout, wireType: WireType.VARINT }
    ]));

    return this.setConnectionParamsCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_GATT_TIMEOUT_MS));
  }

  /**
   * Backpressured async-iterable view of connection-slot capacity changes. First iterator issues `SubscribeBluetoothConnectionsFreeRequest`; the iterator yields every
   * push the device sends thereafter. The wire-side subscription is shared across iterators and survives reconnect via {@link reissueOnReconnect}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connections-free}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<ConnectionsFreeData>`.
   *
   */
  public connectionsFree(options?: StreamOptions): AsyncIterable<ConnectionsFreeData> {

    // Acquire a subscriber synchronously so concurrent attaches are race-free, identical to the advertisement subscription path. The first acquire on
    // CONNECTIONS_FREE_CHANNEL drives the reduction from EMPTY to `true`, which fires the wire-side SUBSCRIBE; subsequent acquires share it (the reduction is already
    // `true`, so onChange is suppressed).
    const handle = this.connectionsFreeSubscription.acquire(CONNECTIONS_FREE_CHANNEL, true);
    const stream = this.host.bus.stream("bluetoothConnectionsFree", options);

    // Cleanup as a `this`-capturing arrow so the IIFE generator below doesn't need a `this` alias. The device does not document an unsubscribe message for
    // connections-free, so the subscription's onChange treats the EMPTY transition as a no-op: the last release simply stops tracking and sends nothing on the wire. A
    // future reconnect with no surviving consumers will not re-issue SUBSCRIBE, which matches the consumer's stated intent.
    const releaseSubscription = (): void => {

      this.connectionsFreeSubscription.release(handle);
    };

    return (async function *(): AsyncGenerator<ConnectionsFreeData> {

      try {

        for await (const update of stream) {

          yield update;
        }

      } finally {

        releaseSubscription();
      }
    })();
  }

  /**
   * Synchronous snapshot of the most recent connections-free push, or `null` when none has arrived on this connection. Pair with {@link connectionsFree} for the live
   * stream.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connections-free}
   *
   * @returns The cached {@link ConnectionsFreeData}, or `null`.
   *
   */
  public lastConnectionsFree(): Nullable<ConnectionsFreeData> {

    return this.cachedConnectionsFree;
  }

  /**
   * Synchronous probe of the connection state for a given address. Returns `true` only when a `BluetoothDeviceConnectionResponse(connected=true)` has been observed
   * for the address and no subsequent `connected=false` has overwritten it on the current connection.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#bluetooth-connect}
   *
   * @param address - Device BLE address.
   * @returns `true` if cached as connected, `false` otherwise.
   *
   */
  public isConnected(address: bigint): boolean {

    return this.connectionStateCache.get(address.toString())?.connected ?? false;
  }

  /**
   * Synchronous accessor for the cached {@link ConnectionStateData} for an address, or `null` if no connection-state push has been observed for that address on the
   * current connection. For the streaming view, see {@link connectionStates}.
   *
   * @param address - Device BLE address.
   * @returns The cached state, or `null`.
   */
  public connectionState(address: bigint): Nullable<ConnectionStateData> {

    return this.connectionStateCache.get(address.toString()) ?? null;
  }

  /**
   * Backpressured async-iterable view of every connection-state transition. The iterator yields one entry per `BluetoothDeviceConnectionResponse` push the device
   * sends - typically one connected-true at successful connect, one connected-false at clean disconnect, plus extras for unexpected device-side disconnects.
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<ConnectionStateData>`.
   */
  public connectionStates(options?: StreamOptions): AsyncIterable<ConnectionStateData> {

    return this.host.bus.stream("bluetoothConnectionState", options);
  }

  // Inbound message dispatchers (called by the host's run-phase router).

  /**
   * Decode an inbound `BluetoothLERawAdvertisementsResponse` payload and fan each nested {@link BluetoothLERawAdvertisement} out as an individual bus event. Called by
   * the host's run-phase dispatcher.
   *
   * @remarks The wire message is one outer field (`advertisements`, repeated nested `BluetoothLERawAdvertisement`); each inner record is parsed by the module-private
   * `decodeBluetoothLERawAdvertisement`, which uses {@link readVarintBigInt} for the uint64 address field so 64-bit values round-trip without
   * precision loss.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptAdvertisementsBatch(payload: Buffer): void {

    const fields = this.decode(payload);
    const entries = fields[1];

    if(!entries) {

      return;
    }

    for(const entry of entries) {

      if(!Buffer.isBuffer(entry)) {

        continue;
      }

      const ad = decodeBluetoothLERawAdvertisement(entry);

      if(ad !== null) {

        this.host.bus.emit("bluetoothAdvertisement", ad);
      }
    }
  }

  /**
   * Decode an inbound `BluetoothScannerStateResponse` payload, update the cached snapshot, and emit the `bluetoothScannerState` bus event. Called by the host's
   * run-phase dispatcher.
   *
   * @remarks Pushes are unsolicited - the device emits whenever the scanner transitions. A malformed push (missing required field) is logged at warn and dropped; the
   * cached state is left at its previous value so consumers do not see a partial transition.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptScannerStateResponse(payload: Buffer): void {

    const fields = this.decode(payload);
    const state = extractNumberField(fields, 1);
    const mode = extractNumberField(fields, 2);
    const configuredMode = extractNumberField(fields, 3);

    if((state === undefined) || (mode === undefined) || (configuredMode === undefined)) {

      this.host.log.warn("Received BluetoothScannerStateResponse without state, mode, or configured_mode; dropping.");

      return;
    }

    const data: BluetoothScannerStateData = {

      configuredMode: configuredMode as BluetoothScannerMode,
      mode: mode as BluetoothScannerMode,
      state: state as BluetoothScannerState
    };

    this.cachedScannerState = data;
    this.host.bus.emit("bluetoothScannerState", data);
  }

  /**
   * Decode an inbound `BluetoothDeviceConnectionResponse` (id 69). The `connected` boolean distinguishes between connect-completed and disconnect-completed; routes to
   * either `connectCorrelator` or `disconnectCorrelator`, updates `connectionStateCache`, and emits `bluetoothConnectionState` for streaming
   * consumers regardless of which correlator (if any) had a pending await.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptDeviceConnectionResponse(payload: Buffer): void {

    const decoded = this.decodeAddressWithFlags(payload);

    if(decoded === null) {

      this.host.log.warn("Received BluetoothDeviceConnectionResponse with missing address; dropping.");

      return;
    }

    const data: ConnectionStateData = {

      address: decoded.address,
      connected: decoded.connected,
      error: decoded.error,
      mtu: decoded.mtu
    };

    const key = data.address.toString();

    this.connectionStateCache.set(key, data);

    if(data.connected) {

      // Connect-completed transition. A nonzero error field on connected=true is unexpected per the upstream firmware but we propagate it untouched - the consumer's
      // contract is the {@link ConnectionStateData} record, not a sanitized version of it.
      if(!this.connectCorrelator.resolve(key, data)) {

        // No pending connect await - the transition is unsolicited (a stale response after a timed-out await, or a server-initiated reconnect). Still emit the
        // streaming event so consumers observing the connection-state stream see it.
        this.host.log.debug("Unsolicited BluetoothDeviceConnectionResponse(connected=true) for address " + key + ".");
      }

    } else if(decoded.error !== 0) {

      // Disconnect-completed transition with a nonzero error field. This is the canonical "connect failed" path - the device rejected the connection attempt or the
      // peripheral was unreachable. Reject the pending connect await, if any; otherwise resolve a pending disconnect await as if the device had reported success.
      const reason = new ConnectionError("Bluetooth connect failed (error " + decoded.error.toString() + ") for address " + key + ".", "GATT_CONNECT_FAILED",
        { cause: { address: data.address, error: decoded.error } });

      if(!this.connectCorrelator.reject(key, reason)) {

        // No pending connect; this may be a server-initiated disconnect that carries an error code. Resolve a pending disconnect await so explicit disconnect callers
        // are not left hanging.
        this.disconnectCorrelator.resolve(key, undefined);
      }

    } else {

      // Disconnect-completed transition with error=0 (a clean disconnect). If a connect await is still pending for this key, the device disconnected before the connect
      // completed: fail that await fast with a typed error rather than leaving the caller to hang until its lifecycle timeout. This mirrors the reject-then-fallback
      // idiom of the error!==0 branch above (well-behaved firmware reports a nonzero error on failure, but a connected=false/error=0 arriving with a connect pending is
      // still a connect that will never complete). Otherwise resolve any pending disconnect await; failing both, log at debug (an unsolicited server-initiated
      // disconnect of an already-tracked connection).
      const reason = new ConnectionError("Bluetooth device disconnected before the connect completed for address " + key + ".", "GATT_CONNECT_FAILED",
        { cause: { address: data.address, error: decoded.error } });

      if(!this.connectCorrelator.reject(key, reason) && !this.disconnectCorrelator.resolve(key, undefined)) {

        this.host.log.debug("Unsolicited BluetoothDeviceConnectionResponse(connected=false) for address " + key + ".");
      }
    }

    this.host.bus.emit("bluetoothConnectionState", data);
  }

  /**
   * Decode an inbound `BluetoothGATTGetServicesResponse` (id 71). Accumulates the decoded services into the in-flight buffer keyed by address; the matching Done
   * sentinel (id 72) resolves the await with the final accumulator.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGetServicesResponse(payload: Buffer): void {

    const decoded = this.decodeGetServicesResponse(payload);

    if(decoded === null) {

      this.host.log.warn("Received BluetoothGATTGetServicesResponse with missing address; dropping.");

      return;
    }

    const key = decoded.address.toString();
    const accumulator = this.inflightServices.get(key);

    if(accumulator) {

      accumulator.push(...decoded.services);

    } else {

      this.host.log.debug("Stray BluetoothGATTGetServicesResponse for address " + key + ": no in-flight discovery.");
    }
  }

  /**
   * Decode an inbound `BluetoothGATTGetServicesDoneResponse` (id 72). Resolves the matching service-discovery await with the accumulated service list and clears the
   * in-flight accumulator.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGetServicesDoneResponse(payload: Buffer): void {

    const address = this.decodeAddressOnly(payload);

    if(address === null) {

      this.host.log.warn("Received BluetoothGATTGetServicesDoneResponse with missing address; dropping.");

      return;
    }

    const key = address.toString();
    const accumulator = this.inflightServices.get(key);

    // Delete before resolve to handle the (theoretical) re-entrant case where the await's then-handler immediately starts another getServices.
    this.inflightServices.delete(key);

    if(accumulator) {

      this.serviceDiscoveryCorrelator.resolve(key, accumulator);

    } else {

      this.host.log.debug("Stray BluetoothGATTGetServicesDoneResponse for address " + key + ": no in-flight discovery.");
    }
  }

  /**
   * Decode an inbound `BluetoothGATTReadResponse` (id 74). Resolves the matching `readCorrelator` entry with the `data` field. Shared response for both
   * characteristic read (73) and descriptor read (76).
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGattReadResponse(payload: Buffer): void {

    const decoded = this.decodeAddressHandleData(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothGATTReadResponse; dropping.");

      return;
    }

    if(!this.readCorrelator.resolve(makeGattKey(decoded.address, decoded.handle), decoded.data)) {

      this.host.log.debug("Stray BluetoothGATTReadResponse for (" + decoded.address.toString() + ", " + decoded.handle.toString() + "): no pending read.");
    }
  }

  /**
   * Decode an inbound `BluetoothGATTWriteResponse` (id 83). Resolves the matching `writeCorrelator` entry. Shared response for both characteristic write (75) and
   * descriptor write (77).
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGattWriteResponse(payload: Buffer): void {

    const decoded = this.decodeAddressAndHandle(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothGATTWriteResponse; dropping.");

      return;
    }

    if(!this.writeCorrelator.resolve(makeGattKey(decoded.address, decoded.handle), undefined)) {

      // No pending write - this is the canonical `response: false` write echo (the device acknowledges every write at the wire level, but the client does not surface
      // the response when the caller opts out). Log at debug for diagnostics.
      this.host.log.debug("Stray BluetoothGATTWriteResponse for (" + decoded.address.toString() + ", " + decoded.handle.toString() + "): no pending write.");
    }
  }

  /**
   * Decode an inbound `BluetoothGATTNotifyResponse` (id 84). Resolves the matching `notifySetupCorrelator` entry. Acknowledgment for the
   * `BluetoothGATTNotifyRequest` enable/disable; not to be confused with the notify-data stream (id 79).
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGattNotifyResponse(payload: Buffer): void {

    const decoded = this.decodeAddressAndHandle(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothGATTNotifyResponse; dropping.");

      return;
    }

    if(!this.notifySetupCorrelator.resolve(makeGattKey(decoded.address, decoded.handle), undefined)) {

      this.host.log.debug("Stray BluetoothGATTNotifyResponse for (" + decoded.address.toString() + ", " + decoded.handle.toString() + "): no pending setNotify.");
    }
  }

  /**
   * Decode an inbound `BluetoothGATTNotifyDataResponse` (id 79). Emits the chunk on the `bluetoothNotifyData` bus event; consumers iterating {@link notify} filter by
   * their (address, handle) pair on the consumer side.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGattNotifyDataResponse(payload: Buffer): void {

    const decoded = this.decodeAddressHandleData(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothGATTNotifyDataResponse; dropping.");

      return;
    }

    this.host.bus.emit("bluetoothNotifyData", { address: decoded.address, data: decoded.data, handle: decoded.handle });
  }

  /**
   * Decode an inbound `BluetoothGATTErrorResponse` (id 82) and route it to whichever Correlator family has a pending entry for the (address, handle) pair.
   *
   * The try-each-reject pattern: at most one of `readCorrelator` / `writeCorrelator` / `notifySetupCorrelator` has a pending entry for any (address, handle) at any
   * time (BLE does not pipeline mixed operations on a single characteristic; the per-method `*_IN_FLIGHT` guards ensure this on the client side), so iterating the
   * Correlator families is O(1) for practical purposes. The first match consumes the error - subsequent Correlators are not touched.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptGattErrorResponse(payload: Buffer): void {

    const decoded = this.decodeAddressHandleAndError(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothGATTErrorResponse; dropping.");

      return;
    }

    const { address, handle, error } = decoded;
    const key = makeGattKey(address, handle);
    const reason = new ConnectionError("GATT operation failed (error " + error.toString() + ").", "GATT_ERROR", { cause: { address, error, handle } });

    if(this.readCorrelator.reject(key, reason)) {

      return;
    }

    if(this.writeCorrelator.reject(key, reason)) {

      return;
    }

    if(this.notifySetupCorrelator.reject(key, reason)) {

      return;
    }

    this.host.log.debug("Stray BluetoothGATTErrorResponse for (" + address.toString() + ", " + handle.toString() + ") error " + error.toString() +
      ": no pending operation matched.");
  }

  /**
   * Decode an inbound `BluetoothDevicePairingResponse` (id 85). Resolves the pair await on success, rejects with `code="GATT_PAIR_FAILED"` on failure.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptPairingResponse(payload: Buffer): void {

    const decoded = this.decodeAddressFlagAndError(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothDevicePairingResponse; dropping.");

      return;
    }

    const { address, flag: paired, error } = decoded;
    const key = address.toString();

    if(paired && (error === 0)) {

      this.pairCorrelator.resolve(key, undefined);

      return;
    }

    this.pairCorrelator.reject(key, new ConnectionError("Bluetooth pairing failed (error " + error.toString() + ") for address " + key + ".", "GATT_PAIR_FAILED",
      { cause: { address, error } }));
  }

  /**
   * Decode an inbound `BluetoothDeviceUnpairingResponse` (id 86).
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptUnpairingResponse(payload: Buffer): void {

    const decoded = this.decodeAddressFlagAndError(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothDeviceUnpairingResponse; dropping.");

      return;
    }

    const { address, flag: success, error } = decoded;
    const key = address.toString();

    if(success && (error === 0)) {

      this.unpairCorrelator.resolve(key, undefined);

      return;
    }

    this.unpairCorrelator.reject(key, new ConnectionError("Bluetooth unpair failed (error " + error.toString() + ") for address " + key + ".", "GATT_UNPAIR_FAILED",
      { cause: { address, error } }));
  }

  /**
   * Decode an inbound `BluetoothDeviceClearCacheResponse` (id 88).
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptClearCacheResponse(payload: Buffer): void {

    const decoded = this.decodeAddressFlagAndError(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothDeviceClearCacheResponse; dropping.");

      return;
    }

    const { address, flag: success, error } = decoded;
    const key = address.toString();

    if(success && (error === 0)) {

      this.clearCacheCorrelator.resolve(key, undefined);

      return;
    }

    this.clearCacheCorrelator.reject(key, new ConnectionError("Bluetooth clearCache failed (error " + error.toString() + ") for address " + key + ".",
      "GATT_CLEAR_CACHE_FAILED", { cause: { address, error } }));
  }

  /**
   * Decode an inbound `BluetoothConnectionsFreeResponse` (id 81). Updates `cachedConnectionsFree` and emits `bluetoothConnectionsFree` for streaming consumers.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptConnectionsFreeResponse(payload: Buffer): void {

    const fields = this.decode(payload);
    const free = extractNumberField(fields, 1);
    const limit = extractNumberField(fields, 2);

    if((free === undefined) || (limit === undefined)) {

      this.host.log.warn("Received BluetoothConnectionsFreeResponse without free/limit; dropping.");

      return;
    }

    // Field 3 is `repeated uint64 allocated`. Each entry arrives as its own VARINT value in the field map; readVarintBigInt is the right reader for the 64-bit
    // dynamic range. The standard decoder dropped each value as a JS number (the `extractNumberField` path), so we re-decode the raw bytes for this field instead.
    const allocated = this.decodeRepeatedUint64Field(payload, 3);
    const data: ConnectionsFreeData = { allocated, free, limit };

    this.cachedConnectionsFree = data;
    this.host.bus.emit("bluetoothConnectionsFree", data);
  }

  /**
   * Decode an inbound `BluetoothSetConnectionParamsResponse` (id 146). Resolves the matching `setConnectionParams` await; rejects with
   * `code="GATT_SET_CONNECTION_PARAMS_FAILED"` on nonzero `error`.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptSetConnectionParamsResponse(payload: Buffer): void {

    const decoded = this.decodeAddressAndError(payload);

    if(decoded === null) {

      this.host.log.warn("Received malformed BluetoothSetConnectionParamsResponse; dropping.");

      return;
    }

    const { address, error } = decoded;
    const key = address.toString();

    if(error === 0) {

      this.setConnectionParamsCorrelator.resolve(key, undefined);

      return;
    }

    this.setConnectionParamsCorrelator.reject(key, new ConnectionError("Bluetooth setConnectionParams failed (error " + error.toString() + ") for address " + key + ".",
      "GATT_SET_CONNECTION_PARAMS_FAILED", { cause: { address, error } }));
  }

  // Private helpers.

  /**
   * Encode and send a `SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST` with the documented `flags: 0`. Shared by {@link advertisements} (first-subscriber attach) and
   * {@link reissueOnReconnect} (post-reconnect re-attach) so the two paths cannot drift.
   */
  private sendSubscribe(): void {

    const fields: ProtoField[] = [{ fieldNumber: 1, value: 0, wireType: WireType.VARINT }];

    this.host.send(MessageType.SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Send `SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST` (id 80) with an empty payload. Shared between {@link connectionsFree} (first-subscriber attach) and
   * {@link reissueOnReconnect} (post-reconnect re-attach).
   */
  private sendConnectionsFreeSubscribe(): void {

    this.host.send(MessageType.SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST, Buffer.alloc(0));
  }

  /**
   * Encode and send a `BluetoothDeviceRequest` (id 68). Shared across `connect`, `disconnect`, `pair`, `unpair`, `clearCache` - every operation is told apart
   * by the `request_type` field on the same wire message.
   *
   * @param address - Device BLE address (uint64).
   * @param requestType - The {@link BluetoothDeviceRequestType} tag.
   * @param addressType - Optional Bluetooth address-type tag. When provided, field 4 is set and the deprecated `has_address_type` field 3 is forced to `true`.
   */
  private sendDeviceRequest(address: bigint, requestType: BluetoothDeviceRequestTypeValue, addressType?: number): void {

    const fields: ProtoField[] = [
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: requestType, wireType: WireType.VARINT }
    ];

    if(addressType !== undefined) {

      // Field 3 is the deprecated `has_address_type` and field 4 is `address_type`. The upstream firmware tolerates both layouts; we set both so older firmwares that
      // still gate on `has_address_type` accept the request, and newer firmwares that ignore it see no harm.
      fields.push({ fieldNumber: 3, value: 1, wireType: WireType.VARINT });
      fields.push({ fieldNumber: 4, value: addressType, wireType: WireType.VARINT });
    }

    this.host.send(MessageType.BLUETOOTH_DEVICE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Shared body for {@link readCharacteristic} and {@link readDescriptor}. Both send `(address, handle)` and await `BluetoothGATTReadResponse`; the only difference is
   * the outbound message type.
   */
  private async readImpl(address: bigint, handle: number, messageType: number, options: { signal?: AbortSignal; timeoutMs?: number } | undefined): Promise<Buffer> {

    const key = makeGattKey(address, handle);

    if(this.readCorrelator.pending(key)) {

      throw new ConnectionError("read is already in flight for (" + address.toString() + ", " + handle.toString() + ").", "GATT_READ_IN_FLIGHT");
    }

    this.host.send(messageType, encodeProtoFields([
      { fieldNumber: 1, value: address, wireType: WireType.VARINT },
      { fieldNumber: 2, value: handle, wireType: WireType.VARINT }
    ]));

    return this.readCorrelator.await(key, this.awaitOptions(options?.signal, options?.timeoutMs ?? DEFAULT_GATT_TIMEOUT_MS));
  }

  /**
   * Build the options object passed to `Correlator.await`. Centralised so the exactOptionalPropertyTypes spread idiom is used identically across every call site.
   */
  private awaitOptions(signal: AbortSignal | undefined, timeoutMs: number): { signal?: AbortSignal; timeoutMs: number } {

    return { ...((signal !== undefined) && { signal }), timeoutMs };
  }

  /**
   * Bounded protobuf decoder. The scanner-state and advertisement-batch payloads are small (one or a handful of fields); the codec's generous default field cap
   * applies via the {@link BLUETOOTH_DECODE_MAX_FIELDS} constant so a malformed message cannot exhaust memory. Transport-level `maxFrameBytes` already bounds the
   * outer frame; this cap defends against pathological field-counts inside an otherwise well-formed frame.
   *
   * @param buffer - The protobuf-encoded payload.
   * @returns The decoded field map.
   */
  private decode(buffer: Buffer): Record<number, FieldValue[]> {

    return decodeProtobuf(buffer, { maxFieldsPerMessage: BLUETOOTH_DECODE_MAX_FIELDS });
  }

  /**
   * Walk a payload that carries `(address: uint64, handle: uint32, data: bytes)` - the wire layout of `BluetoothGATTReadResponse` (74) and
   * `BluetoothGATTNotifyDataResponse` (79). Returns the parsed triple or `null` when the address field is missing.
   *
   * @param payload - Raw protobuf bytes.
   */
  private decodeAddressHandleData(payload: Buffer): { address: bigint; data: Buffer; handle: number } | null {

    let address: bigint | null = null;
    let handle = 0;
    let data: Buffer = Buffer.alloc(0);

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            if(fieldNum === 2) {

              handle = value;
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen;

          if(fieldNum === 3) {

            data = payload.subarray(offset, offset + len);
          }

          offset += len;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, data, handle };
  }

  /**
   * Walk a payload that carries `(address: uint64, handle: uint32)` - the wire layout of `BluetoothGATTWriteResponse` (83) and `BluetoothGATTNotifyResponse` (84).
   * Returns the parsed pair or `null` when the address is missing.
   *
   * @param payload - Raw protobuf bytes.
   */
  private decodeAddressAndHandle(payload: Buffer): { address: bigint; handle: number } | null {

    let address: bigint | null = null;
    let handle = 0;

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            if(fieldNum === 2) {

              handle = value;
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, handle };
  }

  /**
   * Walk a payload that carries `(address: uint64, handle: uint32, error: uint32)` - the wire layout of `BluetoothGATTErrorResponse` (82). Returns the parsed triple or
   * `null` when the address is missing.
   *
   * @param payload - Raw protobuf bytes.
   */
  private decodeAddressHandleAndError(payload: Buffer): { address: bigint; error: number; handle: number } | null {

    let address: bigint | null = null;
    let handle = 0;
    let error = 0;

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            if(fieldNum === 2) {

              handle = value;

            } else if(fieldNum === 3) {

              error = value;
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, error, handle };
  }

  /**
   * Walk a payload that carries `(address: uint64, flag: bool, error: uint32)` - the wire layout shared by `BluetoothDevicePairingResponse` (85),
   * `BluetoothDeviceUnpairingResponse` (86), and `BluetoothDeviceClearCacheResponse` (88). The `flag` field is `paired` / `success` depending on which message; the
   * semantics are identical to the caller (settle the await positively when the flag is true and error is zero, otherwise reject).
   *
   * @param payload - Raw protobuf bytes.
   */
  private decodeAddressFlagAndError(payload: Buffer): { address: bigint; error: number; flag: boolean } | null {

    let address: bigint | null = null;
    let flag = false;
    let error = 0;

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            if(fieldNum === 2) {

              flag = value === 1;

            } else if(fieldNum === 3) {

              error = value;
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, error, flag };
  }

  /**
   * Walk a payload that carries `(address: uint64, error: uint32)` - the wire layout of `BluetoothSetConnectionParamsResponse` (146).
   *
   * @param payload - Raw protobuf bytes.
   */
  private decodeAddressAndError(payload: Buffer): { address: bigint; error: number } | null {

    let address: bigint | null = null;
    let error = 0;

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            if(fieldNum === 2) {

              error = value;
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, error };
  }

  /**
   * Decode a single `address` (uint64 at field 1) plus optional flag fields. Used by {@link acceptDeviceConnectionResponse} which needs the bigint address plus the
   * narrow flag fields (connected, mtu, error). Walks the raw wire bytes directly so the address round-trips with full 64-bit precision.
   *
   * @param payload - The protobuf-encoded payload.
   * @returns The decoded fields, or `null` when the address is missing.
   */
  private decodeAddressWithFlags(payload: Buffer): { address: bigint; connected: boolean; error: number; mtu: number } | null {

    let address: bigint | null = null;
    let connected = false;
    let mtu = 0;
    let error = 0;

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if(wireType === WireType.VARINT) {

          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(payload, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(payload, offset);

            switch(fieldNum) {

              case 2: {

                connected = value === 1;

                break;
              }

              case 3: {

                mtu = value;

                break;
              }

              case 4: {

                error = value;

                break;
              }

              default: {

                // Unknown field number; ignore for forward-compatibility with future firmware additions.
                break;
              }
            }

            offset += bytesRead;
          }

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          // Unknown wire type; abort the decode rather than risk emitting a partial record.
          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, connected, error, mtu };
  }

  /**
   * Decode a `BluetoothGATTGetServicesResponse` (id 71). Returns the address plus the list of nested services; each service is parsed via
   * {@link decodeBluetoothGATTService}.
   */
  private decodeGetServicesResponse(payload: Buffer): { address: bigint; services: BluetoothGATTService[] } | null {

    let address: bigint | null = null;
    const services: BluetoothGATTService[] = [];

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if((wireType === WireType.VARINT) && (fieldNum === 1)) {

          const [ value, bytesRead ] = readVarintBigInt(payload, offset);

          address = value;
          offset += bytesRead;

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen;

          if(fieldNum === 2) {

            const service = decodeBluetoothGATTService(payload.subarray(offset, offset + len));

            if(service !== null) {

              services.push(service);
            }
          }

          offset += len;

        } else if(wireType === WireType.VARINT) {

          // Unknown VARINT field; skip the value.
          const [ , bytesRead ] = readVarint(payload, offset);

          offset += bytesRead;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    if(address === null) {

      return null;
    }

    return { address, services };
  }

  /**
   * Decode a payload that carries only a uint64 `address` field at field 1. Used for `BluetoothGATTGetServicesDoneResponse` (id 72).
   */
  private decodeAddressOnly(payload: Buffer): bigint | null {

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if((wireType === WireType.VARINT) && (fieldNum === 1)) {

          const [value] = readVarintBigInt(payload, offset);

          return value;
        }

        // Any other field shape - skip.
        if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else if(wireType === WireType.VARINT) {

          const [ , bytesRead ] = readVarint(payload, offset);

          offset += bytesRead;

        } else {

          return null;
        }
      }

    } catch {

      return null;
    }

    return null;
  }

  /**
   * Decode every `repeated uint64` value at the given field number from a payload. ESPHome's firmware encoder emits this repeated field as back-to-back unpacked
   * VARINT entries - one tag-plus-value pair per element - rather than a single packed length-delimited blob, so we walk byte-by-byte and accumulate the matching
   * VARINT entries. The implementation deliberately allocates a fresh array each call - the connections-free push is low-cadence so the allocation cost is irrelevant.
   */
  private decodeRepeatedUint64Field(payload: Buffer, fieldNumber: number): bigint[] {

    const values: bigint[] = [];

    try {

      for(let offset = 0; offset < payload.length;) {

        const [ tag, tagLen ] = readVarint(payload, offset);

        offset += tagLen;

        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;

        if((wireType === WireType.VARINT) && (fieldNum === fieldNumber)) {

          const [ value, bytesRead ] = readVarintBigInt(payload, offset);

          values.push(value);
          offset += bytesRead;

        } else if(wireType === WireType.VARINT) {

          const [ , bytesRead ] = readVarint(payload, offset);

          offset += bytesRead;

        } else if(wireType === WireType.LENGTH_DELIMITED) {

          const [ len, lenLen ] = readVarint(payload, offset);

          offset += lenLen + len;

        } else {

          break;
        }
      }

    } catch {

      // Truncated varint or out-of-bounds read; return whatever we accumulated.
    }

    return values;
  }

  /**
   * Test affordance: snapshot the current notify-subscriber map as `Map<makeGattKey(address, handle) -> live-subscriber count>`. Reconstructed from the notify
   * subscription's live-subscriber ledger via the primitive's `activeKeys` and `count` LEDGER-view reads (see `ReissuableSubscription`).
   * The result is a fresh `Map` built per call, so the defensive-copy guarantee is intact - test mutation cannot affect internal state. The counts are unchanged by
   * {@link clearConnectionState} (the ledger survives the reconnect cycle).
   *
   * @returns A fresh `Map<string, number>` keyed by `(address, handle)` with each key's live-subscriber count.
   */
  public notifySubscriberSnapshot(): Map<string, number> {

    return new Map(this.notifySubscription.activeKeys().map((key) => [ key, this.notifySubscription.count(key) ]));
  }

  /**
   * Custom inspector for `console.log(client.bluetooth)` clean output. Mirrors the inspector contract used by the sibling sub-APIs.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    return options.stylize("BluetoothProxyApi", "special") + " " + JSON.stringify({

      advertisementSubscribers: this.advertisementSubscription.size,
      connectionStateCacheSize: this.connectionStateCache.size,
      connectionsFreeSubscribers: this.connectionsFreeSubscription.size,
      hasCachedConnectionsFree: this.cachedConnectionsFree !== null,
      hasCachedScannerState: this.cachedScannerState !== null,
      notifySubscriberCount: this.notifySubscription.size,
      pendingClearCache: this.clearCacheCorrelator.size,
      pendingConnect: this.connectCorrelator.size,
      pendingDisconnect: this.disconnectCorrelator.size,
      pendingGetServices: this.serviceDiscoveryCorrelator.size,
      pendingNotifySetup: this.notifySetupCorrelator.size,
      pendingPair: this.pairCorrelator.size,
      pendingRead: this.readCorrelator.size,
      pendingSetConnectionParams: this.setConnectionParamsCorrelator.size,
      pendingUnpair: this.unpairCorrelator.size,
      pendingWrite: this.writeCorrelator.size
    });
  }
}

/**
 * Decode a single `BluetoothLERawAdvertisement` nested message. The decoder walks the bytes directly rather than going through the standard
 * {@link decodeProtobuf} so the `uint64 address` field can be parsed via {@link readVarintBigInt} - the standard varint reader uses 32-bit bitwise
 * arithmetic and would silently truncate any address above 2^32, even though BLE addresses themselves fit in 48 bits.
 *
 * Field layout (per `api.proto` §`BluetoothLERawAdvertisement`):
 *
 * | Field # | Wire type        | Name           | Decode |
 * |---------|------------------|----------------|--------|
 * | 1       | VARINT           | address        | {@link readVarintBigInt} - uint64 |
 * | 2       | VARINT           | rssi           | {@link readVarint} + {@link zigzagDecode} - sint32 |
 * | 3       | VARINT           | address_type   | {@link readVarint} - uint32 (max 4) |
 * | 4       | LENGTH_DELIMITED | data           | subarray - bytes (max 62) |
 *
 * Unknown wire types and unknown field numbers are skipped so a future-firmware advertisement with extra fields does not crash an older client. A malformed entry
 * (truncated varint, length-delimited field beyond the buffer end) returns `null`; the caller drops it without emitting.
 *
 * @param buffer - The nested-message bytes (one entry from the outer `advertisements` repeated field).
 * @returns The decoded advertisement, or `null` when the message is malformed.
 */
function decodeBluetoothLERawAdvertisement(buffer: Buffer): Nullable<BluetoothLERawAdvertisement> {

  let address = 0n;
  let addressType = 0;
  let rssi = 0;
  let data: Buffer = Buffer.alloc(0);

  try {

    for(let offset = 0; offset < buffer.length;) {

      const [ tag, tagLen ] = readVarint(buffer, offset);

      offset += tagLen;

      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      switch(wireType) {

        case WireType.VARINT: {

          // Field 1 carries uint64 and needs the bigint reader; fields 2 and 3 fit in a JavaScript number so the standard reader suffices. Skipping unknown varint
          // fields preserves forward-compatibility with newer firmwares that add fields at the tail.
          if(fieldNum === 1) {

            const [ value, bytesRead ] = readVarintBigInt(buffer, offset);

            address = value;
            offset += bytesRead;

          } else {

            const [ value, bytesRead ] = readVarint(buffer, offset);

            if(fieldNum === 2) {

              rssi = zigzagDecode(value);

            } else if(fieldNum === 3) {

              addressType = value;
            }

            offset += bytesRead;
          }

          break;
        }

        case WireType.LENGTH_DELIMITED: {

          const [ len, lenLen ] = readVarint(buffer, offset);

          offset += lenLen;

          if(fieldNum === 4) {

            data = buffer.subarray(offset, offset + len);
          }

          offset += len;

          break;
        }

        default:

          // Unknown wire type; abort the decode rather than risk emitting a partial record. BLE advertisements arrive at high cadence so a malformed entry should not
          // be silently propagated as a half-decoded record.
          return null;
      }
    }

  } catch {

    // Malformed varint or out-of-bounds read - drop the entry. The codec throws for unterminated varints; we collapse that to a `null` return so the caller can
    // continue processing the rest of the batch.
    return null;
  }

  return { address, addressType, data, rssi };
}

/**
 * Decode a nested `BluetoothGATTService` message. Fields per `api.proto` §`BluetoothGATTService`:
 *
 * | Field # | Wire type        | Name             |
 * |---------|------------------|------------------|
 * | 1       | VARINT (repeat)  | uuid (uint64 x2) |
 * | 2       | VARINT           | handle           |
 * | 3       | LENGTH_DELIMITED | characteristics  |
 * | 4       | VARINT           | short_uuid       |
 *
 * @param buffer - The nested-message bytes.
 * @returns The decoded service, or `null` when the message is malformed.
 */
function decodeBluetoothGATTService(buffer: Buffer): Nullable<BluetoothGATTService> {

  const uuid: bigint[] = [];
  const characteristics: BluetoothGATTCharacteristic[] = [];
  let handle = 0;
  let shortUuid: number | undefined = undefined;

  try {

    for(let offset = 0; offset < buffer.length;) {

      const [ tag, tagLen ] = readVarint(buffer, offset);

      offset += tagLen;

      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      if(wireType === WireType.VARINT) {

        if(fieldNum === 1) {

          const [ value, bytesRead ] = readVarintBigInt(buffer, offset);

          uuid.push(value);
          offset += bytesRead;

        } else {

          const [ value, bytesRead ] = readVarint(buffer, offset);

          if(fieldNum === 2) {

            handle = value;

          } else if(fieldNum === 4) {

            shortUuid = value;
          }

          offset += bytesRead;
        }

      } else if(wireType === WireType.LENGTH_DELIMITED) {

        const [ len, lenLen ] = readVarint(buffer, offset);

        offset += lenLen;

        if(fieldNum === 3) {

          const characteristic = decodeBluetoothGATTCharacteristic(buffer.subarray(offset, offset + len));

          if(characteristic !== null) {

            characteristics.push(characteristic);
          }
        }

        offset += len;

      } else {

        return null;
      }
    }

  } catch {

    return null;
  }

  return {

    characteristics,
    handle,
    ...((shortUuid !== undefined) && { shortUuid }),
    ...((uuid.length > 0) && { uuid })
  };
}

/**
 * Decode a nested `BluetoothGATTCharacteristic` message. Fields per `api.proto` §`BluetoothGATTCharacteristic`:
 *
 * | Field # | Wire type        | Name        |
 * |---------|------------------|-------------|
 * | 1       | VARINT (repeat)  | uuid        |
 * | 2       | VARINT           | handle      |
 * | 3       | VARINT           | properties  |
 * | 4       | LENGTH_DELIMITED | descriptors |
 * | 5       | VARINT           | short_uuid  |
 *
 * @param buffer - The nested-message bytes.
 * @returns The decoded characteristic, or `null` when the message is malformed.
 */
function decodeBluetoothGATTCharacteristic(buffer: Buffer): Nullable<BluetoothGATTCharacteristic> {

  const uuid: bigint[] = [];
  const descriptors: BluetoothGATTDescriptor[] = [];
  let handle = 0;
  let properties = 0;
  let shortUuid: number | undefined = undefined;

  try {

    for(let offset = 0; offset < buffer.length;) {

      const [ tag, tagLen ] = readVarint(buffer, offset);

      offset += tagLen;

      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      if(wireType === WireType.VARINT) {

        if(fieldNum === 1) {

          const [ value, bytesRead ] = readVarintBigInt(buffer, offset);

          uuid.push(value);
          offset += bytesRead;

        } else {

          const [ value, bytesRead ] = readVarint(buffer, offset);

          if(fieldNum === 2) {

            handle = value;

          } else if(fieldNum === 3) {

            properties = value;

          } else if(fieldNum === 5) {

            shortUuid = value;
          }

          offset += bytesRead;
        }

      } else if(wireType === WireType.LENGTH_DELIMITED) {

        const [ len, lenLen ] = readVarint(buffer, offset);

        offset += lenLen;

        if(fieldNum === 4) {

          const descriptor = decodeBluetoothGATTDescriptor(buffer.subarray(offset, offset + len));

          if(descriptor !== null) {

            descriptors.push(descriptor);
          }
        }

        offset += len;

      } else {

        return null;
      }
    }

  } catch {

    return null;
  }

  return {

    descriptors,
    handle,
    properties,
    ...((shortUuid !== undefined) && { shortUuid }),
    ...((uuid.length > 0) && { uuid })
  };
}

/**
 * Decode a nested `BluetoothGATTDescriptor` message. Fields per `api.proto` §`BluetoothGATTDescriptor`:
 *
 * | Field # | Wire type        | Name        |
 * |---------|------------------|-------------|
 * | 1       | VARINT (repeat)  | uuid        |
 * | 2       | VARINT           | handle      |
 * | 3       | VARINT           | short_uuid  |
 *
 * @param buffer - The nested-message bytes.
 * @returns The decoded descriptor, or `null` when the message is malformed.
 */
function decodeBluetoothGATTDescriptor(buffer: Buffer): Nullable<BluetoothGATTDescriptor> {

  const uuid: bigint[] = [];
  let handle = 0;
  let shortUuid: number | undefined = undefined;

  try {

    for(let offset = 0; offset < buffer.length;) {

      const [ tag, tagLen ] = readVarint(buffer, offset);

      offset += tagLen;

      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      if(wireType === WireType.VARINT) {

        if(fieldNum === 1) {

          const [ value, bytesRead ] = readVarintBigInt(buffer, offset);

          uuid.push(value);
          offset += bytesRead;

        } else {

          const [ value, bytesRead ] = readVarint(buffer, offset);

          if(fieldNum === 2) {

            handle = value;

          } else if(fieldNum === 3) {

            shortUuid = value;
          }

          offset += bytesRead;
        }

      } else if(wireType === WireType.LENGTH_DELIMITED) {

        const [ len, lenLen ] = readVarint(buffer, offset);

        offset += lenLen + len;

      } else {

        return null;
      }
    }

  } catch {

    return null;
  }

  return {

    handle,
    ...((shortUuid !== undefined) && { shortUuid }),
    ...((uuid.length > 0) && { uuid })
  };
}
