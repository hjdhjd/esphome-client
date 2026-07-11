/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * zwave-proxy.ts: Z-Wave-proxy sub-API for the ESPHome client.
 */

/**
 * Z-Wave-proxy sub-API.
 *
 * @remarks **This module is a transparent byte pipe to the device's Z-Wave radio Serial API.** It does NOT implement the Z-Wave protocol, the Z-Wave Serial API frame
 * format, command classes, security envelopes (S0 / S2), routing, association, or any higher-layer Z-Wave functionality. Frames sent via {@link ZWaveProxyApi.send}
 * are passed unchanged to the device's Z-Wave radio; frames yielded by {@link ZWaveProxyApi.frames} are the radio's output passed unchanged to the consumer.
 *
 * Consumers are responsible for parsing and generating Z-Wave Serial API frames, typically by routing this stream into a library that speaks Z-Wave (e.g., `zwave-js`).
 * Without such a library, the byte-pipe surface is suitable for protocol research, frame logging, and replay scenarios; it is not a Z-Wave network manager.
 *
 * Lazy-instantiated single-instance namespace exposed via `client.zwave`. Composes with the host via a narrow {@link ZWaveProxyHost} seam - no reach into host private
 * fields, only the bus, the logger, a synchronous frame-send hook, and an accessor for the latest {@link DeviceInfo}.
 *
 * Module shape mirrors {@link BluetoothProxyApi} simplified for the single-subscription case: a single global-key {@link
 * ReissuableSubscription} (Z-Wave frame streaming is a device-wide subscription, not per-key, so every subscriber groups under one constant
 * wire key), a cached `homeId`, and no `Correlator` instances (there is no request/response correlation in the Z-Wave proxy - frames flow
 * asynchronously in both directions and home-id changes are unsolicited pushes).
 *
 * @module zwave-proxy
 */
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import type { FieldValue, ProtoField } from "./protocol/index.ts";
import { MessageType, WireType, decodeProtobuf, encodeProtoFields, extractNumberField } from "./protocol/index.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";
import { ZWaveProxyRequestType } from "./api-constants.ts";

/**
 * Per-message field-count cap for the bounded protobuf decoder used here. Z-Wave-proxy messages are tiny (one or two top-level fields), so a generous cap is fine. The
 * host's transport-level `maxFrameBytes` already protects against pathological frame-level payloads before they reach this module; this decoder uses the same
 * 1024-field cap applied across the codebase so a malformed message cannot run away. The codec requires `maxFieldsPerMessage` as an argument and defines no default of
 * its own.
 */
const ZWAVE_DECODE_MAX_FIELDS = 1024;

/**
 * Byte length of the `HOME_ID_CHANGE` `data` field. Z-Wave home ids are 32-bit; the device encodes them as a 4-byte big-endian uint32 in the request's `data` field per
 * the ESPHome firmware's `zwave_proxy` component (the proto's `bytes data` does not document the encoding inline).
 */
const HOME_ID_DATA_BYTES = 4;

/**
 * The single constant wire key every {@link ZWaveProxyApi.frames} subscriber groups under. Z-Wave frame streaming is device-wide - the device either streams every
 * Z-Wave frame to the client or it does not - so there is exactly one wire subscription regardless of consumer count. The actual value is irrelevant; what matters is
 * that every subscriber shares this one key so they aggregate into a single `ReissuableSubscription` entry.
 */
const FRAME_CHANNEL = 0;

/**
 * Narrow seam the host implements for the Z-Wave-proxy sub-API. Mirrors {@link BluetoothProxyHost} and {@link SerialProxyHost} in
 * shape: a bus, a logger, a frame-send hook, plus a read-through accessor for the latest decoded {@link DeviceInfo}. The sub-API never reaches into
 * host private fields.
 *
 * @internal
 */
export interface ZWaveProxyHost {

  readonly bus: EventBus<ClientEventsMap>;

  /**
   * Read-through accessor for the latest decoded device-info. Used by {@link ZWaveProxyApi.available} to gate consumer code on `zwaveProxyFeatureFlags` and by
   * {@link ZWaveProxyApi.homeId} to seed the initial home-id snapshot. Returns `null` before discovery completes.
   */
  deviceInfo(): Nullable<{ zwaveProxyFeatureFlags?: number; zwaveHomeId?: number }>;

  readonly log: EspHomeLogging;

  /** Synchronous frame-send hook - the host wraps `frameAndSend(MessageType.X, payload)`. */
  send(type: number, payload: Buffer): void;
}

/**
 * Z-Wave-proxy sub-API. Single instance per client; created lazily on first access via {@link EspHomeClient.zwave}.
 */
export class ZWaveProxyApi implements SubscriptionLifecycle {

  private readonly host: ZWaveProxyHost;

  /**
   * Global frame subscription. Every {@link frames} iterator acquires a subscriber under the single {@link FRAME_CHANNEL} key; the first acquire issues a wire-side
   * `ZWaveProxyRequest(SUBSCRIBE)` and the last release issues `ZWaveProxyRequest(UNSUBSCRIBE)`. The subscription is device-wide rather than per-key - the device either
   * streams every Z-Wave frame to the client or it does not - so every subscriber groups under one constant wire key.
   *
   * Built on `ReissuableSubscription` so the consumer subscriber ledger survives reconnect while the connection-scoped wire cache resets.
   * A consumer iterator parked in `for await` across a reconnect stays live: {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect}
   * replays SUBSCRIBE for the surviving subscribers. The intent and reduced desired-state are a unit `true` presence marker; an empty subscriber set reduces to
   * {@link EMPTY}, which the on-change hook maps to UNSUBSCRIBE.
   */
  private readonly frameSubscription: ReissuableSubscription<number, boolean, boolean>;

  /**
   * Most-recent home id observed via a `HOME_ID_CHANGE` push on this connection. `undefined` means no push has been observed yet - the {@link homeId} accessor falls
   * back to {@link DeviceInfo.zwaveHomeId} in that state. A defined value (including zero) is the authoritative current home id and the device-info
   * fallback is bypassed; a `HOME_ID_CHANGE` to zero means the radio left the network, and surfacing the stale device-info value over it would mislead consumers.
   *
   * Cleared (back to `undefined`) on {@link clearConnectionState} so a fresh connection starts from the new device-info value.
   */
  private observedHomeId: number | undefined = undefined;

  /**
   * Constructs the sub-API. The host argument carries the bus, logger, send hook, and device-info accessor; the sub-API does not store or read other host state.
   *
   * @param host - The host seam.
   * @internal
   */
  public constructor(host: ZWaveProxyHost) {

    this.host = host;

    // The global frame channel is a single device-wide wire subscription, so every subscriber groups under the one constant FRAME_CHANNEL key with a unit `true` intent.
    // A non-empty subscriber set reduces to `true` (SUBSCRIBE); an empty set reduces to EMPTY, which onChange maps to UNSUBSCRIBE. The primitive preserves the subscriber
    // ledger across reconnect so a parked consumer iterator survives, while the connection-scoped wire cache resets via clearConnectionState.
    this.frameSubscription = new ReissuableSubscription<number, boolean, boolean>({

      onChange: (_key: number, desired: boolean | typeof EMPTY): void => {

        this.sendRequest((desired === EMPTY) ? ZWaveProxyRequestType.UNSUBSCRIBE : ZWaveProxyRequestType.SUBSCRIBE);
      },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true
    });
  }

  /**
   * Reset ONLY connection-scoped state. Called by the host on `connect()`. Clears the cached home id (a fresh connection re-derives it from the new device-info) and the
   * frame subscription's connection-scoped wire cache (the device starts every fresh connection with no subscription). The subscriber ledger is PRESERVED: iterators
   * alive across the reconnect cycle stay live, and the host's {@link reissueOnReconnect} call after the new connection is up re-issues SUBSCRIBE for them.
   */
  public clearConnectionState(): void {

    this.observedHomeId = undefined;
    this.frameSubscription.clearConnectionState();
  }

  /**
   * Re-establish the wire-side subscription on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the frame
   * subscription's `ReissuableSubscription.reissueOnReconnect`, which re-issues `ZWaveProxyRequest(SUBSCRIBE)` iff at least one
   * {@link frames} subscriber is still alive at the moment of reconnect, and is a pure no-op when none is.
   *
   * @remarks Mirrors {@link BluetoothProxyApi.reissueOnReconnect} for the advertisement-subscription case - the same shape applied to the single
   * device-wide Z-Wave frame channel.
   */
  public reissueOnReconnect(): void {

    this.frameSubscription.reissueOnReconnect();
  }

  /**
   * Whether the connected device advertises Z-Wave-proxy support. Reads `zwaveProxyFeatureFlags` from the latest {@link DeviceInfo}; returns `false`
   * when discovery has not completed or when the device firmware was not compiled with `USE_ZWAVE_PROXY`. Any nonzero feature-flag bitmask reads as `true`; the
   * individual bit semantics are upstream concerns not surfaced here.
   *
   */
  public get available(): boolean {

    const flags = this.host.deviceInfo()?.zwaveProxyFeatureFlags;

    return (flags !== undefined) && (flags > 0);
  }

  /**
   * The Z-Wave home id reported by the device. On first read after discovery, falls back to {@link DeviceInfo.zwaveHomeId}; subsequent reads return the
   * cached value updated by the most recent `HOME_ID_CHANGE` push. Returns `null` when no Z-Wave network is joined (home id zero) or when the device does not advertise
   * Z-Wave proxy support.
   *
   * @returns The numeric home id, or `null` when none is currently joined.
   *
   */
  public homeId(): Nullable<number> {

    // A HOME_ID_CHANGE push (including one to zero) is authoritative for the current connection - we surface it over the stale device-info snapshot. The "left the
    // network" case (push value zero) returns null so consumers reading homeId() after a network-leave see a coherent "no network joined" answer rather than the value
    // the device-info captured before the leave.
    if(this.observedHomeId !== undefined) {

      return (this.observedHomeId > 0) ? this.observedHomeId : null;
    }

    const fromDeviceInfo = this.host.deviceInfo()?.zwaveHomeId;

    return ((fromDeviceInfo !== undefined) && (fromDeviceInfo > 0)) ? fromDeviceInfo : null;
  }

  /**
   * Send a raw Z-Wave Serial API frame to the device's Z-Wave radio. The `frame` buffer is passed unchanged - this library does not validate, parse, or modify it.
   * Consumers are responsible for producing well-formed Z-Wave Serial API frames; see the module-level documentation for context.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#zwave-byte-pipe}
   *
   * @param frame - The raw Z-Wave Serial API frame bytes to transmit. Length-delimited on the wire; arbitrary-content buffers (including null bytes, high bytes, and
   * the Z-Wave SOF byte 0x01) are transmitted verbatim.
   *
   */
  public send(frame: Buffer): void {

    const fields: ProtoField[] = [{ fieldNumber: 1, value: frame, wireType: WireType.LENGTH_DELIMITED }];

    this.host.send(MessageType.ZWAVE_PROXY_FRAME, encodeProtoFields(fields));
  }

  /**
   * Backpressured async-iterable view of inbound Z-Wave Serial API frames from the device's Z-Wave radio. The first iterator issues a wire-side
   * `ZWaveProxyRequest(SUBSCRIBE)`; the last iterator to detach issues `ZWaveProxyRequest(UNSUBSCRIBE)`. Concurrent iterators share the wire-side subscription (only one
   * SUBSCRIBE is sent regardless of consumer count). The subscription survives reconnect via {@link reissueOnReconnect}.
   *
   * Each yielded `Buffer` is one frame as received from the device's Z-Wave radio Serial API; this library does not validate, parse, or modify the contents. Consumers
   * route the stream into a Z-Wave-aware library (e.g., `zwave-js`) for protocol-level handling.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#zwave-byte-pipe}
   *
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("zwaveFrame", options)`.
   * @returns An `AsyncIterable<Buffer>` that yields frames until the consumer aborts, the connection drops, or the stream completes.
   *
   */
  public frames(options?: StreamOptions): AsyncIterable<Buffer> {

    // Acquire a subscriber synchronously at call time so concurrent attaches are race-free. The first acquire on FRAME_CHANNEL drives the reduction from EMPTY to `true`,
    // which fires the wire-side SUBSCRIBE; subsequent acquires share the same wire-side subscription (the reduction is already `true`, so onChange is suppressed).
    const handle = this.frameSubscription.acquire(FRAME_CHANNEL, true);
    const stream = this.host.bus.stream("zwaveFrame", options);

    // Cleanup as a `this`-capturing arrow so the IIFE generator below doesn't need a `this` alias. The primitive pairs release to acquire by symbol identity, so the
    // last release drives the reduction back to EMPTY (firing UNSUBSCRIBE) and a post-reconnect dispose is correct without any "still nonzero" guard - the ledger
    // survived the reconnect and the wire cache was re-armed by reissueOnReconnect.
    const releaseSubscription = (): void => {

      this.frameSubscription.release(handle);
    };

    return (async function *(): AsyncGenerator<Buffer> {

      try {

        for await (const frame of stream) {

          yield frame;
        }

      } finally {

        releaseSubscription();
      }
    })();
  }

  /**
   * Backpressured async-iterable view of home-id change notifications. The device pushes `HOME_ID_CHANGE` unsolicited when the radio joins, leaves, or re-keys a Z-Wave
   * network. Each yielded `number` is the new home id (or `0` when the network is left).
   *
   * @remarks Consumers do not need to subscribe separately - the device pushes these as part of the normal proxy lifecycle whenever they occur. The iterator yields
   * only future pushes; historical state is not replayed. For the most-recent value as a synchronous snapshot, read {@link homeId}.
   *
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("zwaveHomeIdChange", options)`.
   * @returns An `AsyncIterable<number>`.
   *
   */
  public homeIdChanges(options?: StreamOptions): AsyncIterable<number> {

    return this.host.bus.stream("zwaveHomeIdChange", options);
  }

  /**
   * Decode an inbound `ZWaveProxyFrame` payload and emit it on the bus as `zwaveFrame`. Called by the host's run-phase dispatcher. A frame with no `data` field is
   * logged at debug and dropped; this is forward-compatible with future firmwares that may push empty frames as keepalives.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the frame message.
   */
  public acceptFrame(payload: Buffer): void {

    const fields = this.decode(payload);
    const data = fields[1]?.[0];

    if(!Buffer.isBuffer(data)) {

      this.host.log.debug("Received ZWaveProxyFrame without a valid data field; dropping.");

      return;
    }

    this.host.bus.emit("zwaveFrame", data);
  }

  /**
   * Decode an inbound `ZWaveProxyRequest` payload and route it. The only inbound request type the upstream firmware emits is
   * {@link ZWaveProxyRequestType.HOME_ID_CHANGE}; SUBSCRIBE / UNSUBSCRIBE are outbound-only at the wire level. Unknown request types are logged at debug
   * and dropped so a forward-compatible firmware that adds a new request type cannot break this client.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the request message.
   */
  public acceptRequest(payload: Buffer): void {

    const fields = this.decode(payload);
    const type = extractNumberField(fields, 1);
    const data = fields[2]?.[0];

    if(type !== ZWaveProxyRequestType.HOME_ID_CHANGE) {

      this.host.log.debug("Received ZWaveProxyRequest with unsupported type " + String(type) + "; ignoring.");

      return;
    }

    // HOME_ID_CHANGE carries the new home id in the data field. The encoding is 4-byte big-endian uint32 per ESPHome firmware (see the api-constants JSDoc for context).
    // A malformed payload (wrong length or non-buffer) is logged at debug and dropped so a misbehaving device cannot disturb the iterator stream.
    if(!Buffer.isBuffer(data) || (data.length < HOME_ID_DATA_BYTES)) {

      this.host.log.debug("Received ZWaveProxyRequest(HOME_ID_CHANGE) with invalid data length; ignoring.");

      return;
    }

    const homeId = data.readUInt32BE(0);

    this.observedHomeId = homeId;
    this.host.bus.emit("zwaveHomeIdChange", homeId);
  }

  /**
   * Read the current frame-subscriber count. Primarily a test affordance plus a debug aid via the `util.inspect` hook. Reads the subscription's live-subscriber ledger
   * size, which is unchanged by {@link clearConnectionState} (the ledger survives the reconnect cycle).
   *
   * @returns The number of active {@link frames} iterators currently attached.
   */
  public subscriberCount(): number {

    return this.frameSubscription.size;
  }

  /**
   * Encode and send a `ZWaveProxyRequest` with the supplied type and an empty `data` field. Shared by {@link frames} (SUBSCRIBE / UNSUBSCRIBE) and
   * {@link reissueOnReconnect}. The `data` field is omitted entirely - the wire-level codec skips fields with no value, matching the upstream firmware's expectation
   * that SUBSCRIBE / UNSUBSCRIBE carry no payload.
   *
   * @param type - The request-type tag. SUBSCRIBE or UNSUBSCRIBE in outbound use; HOME_ID_CHANGE is inbound-only.
   */
  private sendRequest(type: ZWaveProxyRequestType): void {

    const fields: ProtoField[] = [{ fieldNumber: 1, value: type, wireType: WireType.VARINT }];

    this.host.send(MessageType.ZWAVE_PROXY_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Bounded protobuf decoder; see {@link ZWAVE_DECODE_MAX_FIELDS} for the field-cap rationale.
   *
   * @param buffer - The protobuf-encoded payload.
   * @returns The decoded field map.
   */
  private decode(buffer: Buffer): Record<number, FieldValue[]> {

    return decodeProtobuf(buffer, { maxFieldsPerMessage: ZWAVE_DECODE_MAX_FIELDS });
  }

  /**
   * Custom inspector for `console.log(client.zwave)` clean output.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    return options.stylize("ZWaveProxyApi", "special") + " " + JSON.stringify({

      frameSubscribers: this.frameSubscription.size,
      observedHomeId: this.observedHomeId ?? null
    });
  }
}
