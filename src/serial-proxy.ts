/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * serial-proxy.ts: Serial-proxy sub-API for the ESPHome client.
 */

/**
 * Serial-proxy sub-API.
 *
 * @remarks Lazy-instantiated single-instance namespace exposed via `client.serial`. Composes with the host via a narrow {@link SerialProxyHost} seam - no reach into
 * host private fields, only the bus, the logger, a synchronous frame-send hook, and an accessor for the latest {@link DeviceInfo}.
 *
 * The sub-API owns its own connection-scoped state: a per-request-type `Correlator` for each in-flight await (flush, getModemPins), keyed by instance
 * number, and a `ReissuableSubscription` keyed by instance number for per-instance data streaming, whose subscriber ledger survives reconnect and
 * whose wire cache drives {@link SerialProxyApi.reissueOnReconnect}. Connection-scoped state resets on connect via {@link SerialProxyApi.clearConnectionState}.
 *
 * Serial Proxy is *not* entity-shaped. The proto enumerates serial-proxy instances on `DeviceInfoResponse.serial_proxies` (field 25, repeated `SerialProxyInfo`),
 * keyed by zero-based `instance` index - not via `ListEntities`, not by a fixed32 entity key. The composition story mirrors {@link VoiceAssistantApi}
 * (single sub-API namespace) plus `LogSubscriptionManager` (refcounted streaming with reissueOnReconnect), adapted to per-instance
 * keying.
 *
 * @module serial-proxy
 */
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import type { FieldValue, ProtoField } from "./protocol/index.ts";
import { MessageType, WireType, decodeProtobuf, encodeProtoFields, extractNumberField, extractStringField } from "./protocol/index.ts";
import type { SerialProxyParity, SerialProxyPortType, SerialProxyStatus } from "./api-constants.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { ConnectionError } from "./errors.ts";
import { Correlator } from "./correlator.ts";
import { SerialProxyRequestType } from "./api-constants.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";

/**
 * Default timeout in milliseconds applied to {@link SerialProxyApi.flush} and {@link SerialProxyApi.getModemPins} when the caller omits `timeoutMs`. Tuned generously so
 * a slow UART drain or modem-pin read does not race the await on a healthy device, while still bounded so a misbehaving device cannot stall a consumer forever.
 */
const DEFAULT_SERIAL_REQUEST_TIMEOUT_MS = 5000;

/**
 * Per-instance metadata for a serial-proxy port advertised by the device. The array index in {@link DeviceInfo.serialProxies} is the `instance`
 * number used in every subsequent serial-proxy wire message. Empty (or undefined) when the device firmware was not compiled with `USE_SERIAL_PROXY`.
 */
export interface SerialProxyInfo {

  /** Human-readable port name (e.g., "uart_0"). */
  readonly name: string;

  /** Port type tag - mirrors {@link SerialProxyPortType}. */
  readonly portType: SerialProxyPortType;
}

/**
 * Options accepted by {@link SerialProxyApi.configure}. Mirrors the wire-side `SerialProxyConfigureRequest` (field numbers per `api.proto`): `baudrate` (2),
 * `flowControl` (3), `parity` (4), `stopBits` (5), `dataSize` (6).
 *
 * Both `dataSize` and `stopBits` are validated client-side before the wire send. The wire accepts arbitrary integers but the device silently rejects out-of-range values;
 * surfacing the rejection at the call site is strictly better than a debug log nobody reads.
 */
export interface SerialProxyConfigureOptions {

  /** UART baud rate in bits-per-second. The device imposes its own upper bound; consult firmware docs for the specific platform. */
  readonly baudrate: number;

  /** Data-bits per character. Must be in the inclusive range 5-8; values outside this range throw {@link ConnectionError} with code `INVALID_SERIAL_CONFIG`. */
  readonly dataSize: number;

  /** Whether to enable hardware flow control. Defaults to `false` (no flow control). */
  readonly flowControl?: boolean;

  /** Parity selection. Defaults to {@link SerialProxyParity.NONE}. */
  readonly parity?: SerialProxyParity;

  /** Stop bits. Must be 1 or 2; values outside this range throw {@link ConnectionError} with code `INVALID_SERIAL_CONFIG`. Defaults to 1. */
  readonly stopBits?: number;
}

/**
 * One inbound serial-data chunk emitted on the `serialData` bus event. The `instance` field correlates with the {@link SerialProxyInfo} index used at subscribe time so
 * a single bus listener can route across multiple instances.
 */
export interface SerialDataChunk {

  /** Raw bytes received from the UART. The buffer is yielded verbatim - no decoding, no trimming. */
  readonly data: Buffer;

  /** Zero-based instance index identifying the source UART port. */
  readonly instance: number;
}

/**
 * Result of {@link SerialProxyApi.flush}. The numeric `status` distinguishes success (`OK` or `ASSUMED_SUCCESS`) from failure (`ERROR`, `TIMEOUT`, `NOT_SUPPORTED`); the
 * optional `errorMessage` accompanies failure variants when the device supplies one. The `type` field always echoes `SerialProxyRequestType.FLUSH` for results
 * surfaced by this method; it is included so the result shape parallels future request-types that may share the same response message.
 */
export interface SerialProxyFlushResult {

  /** Optional human-readable error message supplied by the device. Absent on success and on most failure variants. */
  readonly errorMessage?: string;

  /** Zero-based instance index identifying the UART port. */
  readonly instance: number;

  /** Wire-level completion status. See {@link SerialProxyStatus}. */
  readonly status: SerialProxyStatus;

  /** Echoed request type. Always `SerialProxyRequestType.FLUSH` for results surfaced by {@link SerialProxyApi.flush}. */
  readonly type: typeof SerialProxyRequestType.FLUSH;
}

/**
 * Narrow seam the host implements for the serial-proxy sub-API. Mirrors {@link VoiceAssistantHost} and
 * `LogSubscriptionManagerHost` in shape: a bus, a logger, a frame-send hook, plus a read-through accessor for the latest decoded
 * {@link DeviceInfo}. The sub-API never reaches into host private fields.
 *
 * @internal
 */
export interface SerialProxyHost {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;

  /**
   * Read-through accessor for the latest decoded device-info. Used by {@link SerialProxyApi.list} to surface the `serialProxies` advertisement. Returns `null` before
   * discovery completes.
   */
  deviceInfo(): Nullable<{ serialProxies?: readonly SerialProxyInfo[] }>;

  /** Synchronous frame-send hook - the host wraps `frameAndSend(MessageType.X, payload)`. */
  send(type: number, payload: Buffer): void;
}

/**
 * Per-await options accepted by {@link SerialProxyApi.flush} and {@link SerialProxyApi.getModemPins}. The composed signal layers the caller's optional `AbortSignal`
 * over the timeout via `AbortSignal.any`, mirroring the {@link VoiceAssistantApi.announce} contract.
 */
export interface SerialProxyAwaitOptions {

  /** Optional user abort signal. When aborted, the await rejects with `signal.reason`. */
  signal?: AbortSignal;

  /** Optional timeout in milliseconds. Defaults to 5000ms. When elapsed, the await rejects with `DOMException(name: "AbortError")`. */
  timeoutMs?: number;
}

/**
 * Serial-proxy sub-API. Single instance per client; created lazily on first access via {@link EspHomeClient.serial}.
 */
export class SerialProxyApi implements SubscriptionLifecycle {

  private readonly host: SerialProxyHost;

  /**
   * Per-instance subscription for `serialData` streaming. Each {@link data} iterator acquires a subscriber keyed by the numeric `instance` index; the first acquire on
   * an instance issues `SerialProxyRequest(SUBSCRIBE)` and the last release issues `SerialProxyRequest(UNSUBSCRIBE)`. Built on
   * `ReissuableSubscription` so the consumer subscriber ledger survives reconnect while the connection-scoped wire cache resets. A
   * consumer iterator parked in `for await` across a reconnect stays live: {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect}
   * replays SUBSCRIBE for each instance with surviving subscribers. The intent and reduced desired-state are a unit `true` presence marker; an empty subscriber set for
   * an instance reduces to {@link EMPTY}, which the on-change hook maps to UNSUBSCRIBE for that instance.
   */
  private readonly dataSubscription: ReissuableSubscription<number, boolean, boolean>;

  /**
   * Per-instance correlator for in-flight {@link flush} awaits. The key is the numeric `instance` index; the value is the decoded {@link SerialProxyFlushResult}.
   * Cleared (every entry rejected with `AbortError`) on {@link clearConnectionState}.
   */
  private readonly flushCorrelator: Correlator<SerialProxyFlushResult, number>;

  /**
   * Per-instance correlator for in-flight {@link getModemPins} awaits. The key is the numeric `instance` index; the value is the raw line-states bitmask. Cleared on
   * {@link clearConnectionState}.
   */
  private readonly modemPinsCorrelator: Correlator<number, number>;

  /**
   * Constructs the sub-API. The host argument carries the bus, logger, send hook, and device-info accessor; the sub-API does not store or read other host state.
   *
   * @param host - The host seam.
   * @internal
   */
  public constructor(host: SerialProxyHost) {

    this.host = host;
    this.flushCorrelator = new Correlator<SerialProxyFlushResult, number>();
    this.modemPinsCorrelator = new Correlator<number, number>();

    // Each instance is an independent device-wide wire subscription keyed by the numeric instance index, with a unit `true` intent. A non-empty subscriber set for an
    // instance reduces to `true` (SUBSCRIBE); an empty set reduces to EMPTY, which onChange maps to UNSUBSCRIBE for that instance. The primitive preserves the subscriber
    // ledger across reconnect so parked consumer iterators survive, while the connection-scoped wire cache resets via clearConnectionState.
    this.dataSubscription = new ReissuableSubscription<number, boolean, boolean>({

      onChange: (instance: number, desired: boolean | typeof EMPTY): void => {

        this.sendRequest(instance, (desired === EMPTY) ? SerialProxyRequestType.UNSUBSCRIBE : SerialProxyRequestType.SUBSCRIBE);
      },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true
    });
  }

  /**
   * Reset ONLY connection-scoped state. Called by the host on `connect()`. Rejects every pending {@link flush} and {@link getModemPins} await with an `AbortError`
   * (in-flight request/response state cannot outlive the connection it was issued on) and clears the data subscription's connection-scoped wire cache (the device starts
   * every fresh connection with no subscription). The subscriber ledger is PRESERVED: iterators alive across the reconnect cycle stay live, and the host's
   * {@link reissueOnReconnect} call after the new connection is up re-issues SUBSCRIBE for each instance with surviving subscribers.
   */
  public clearConnectionState(): void {

    const reason = new DOMException("Serial proxy reset: client reconnected before the prior request completed.", "AbortError");

    this.flushCorrelator.rejectAll(reason);
    this.modemPinsCorrelator.rejectAll(reason);
    this.dataSubscription.clearConnectionState();
  }

  /**
   * Re-establish device-side subscriptions on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the data subscription's
   * `ReissuableSubscription.reissueOnReconnect`, which re-issues a `SerialProxyRequest(SUBSCRIBE)` for every instance with surviving
   * subscribers so the new device starts streaming `SerialProxyDataReceived` again, and is a pure no-op when no instance has live subscribers. Mirrors
   * `LogSubscriptionManager.reissueOnReconnect`.
   */
  public reissueOnReconnect(): void {

    this.dataSubscription.reissueOnReconnect();
  }

  /**
   * Read the device-info `serial_proxies` advertisement. Returns an empty array when discovery has not completed or when the device firmware was not compiled with
   * `USE_SERIAL_PROXY`. The returned view is `readonly`; callers cannot mutate the cached record.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-list}
   *
   * @returns The list of {@link SerialProxyInfo} entries, in declaration order.
   *
   */
  public list(): readonly SerialProxyInfo[] {

    return this.host.deviceInfo()?.serialProxies ?? [];
  }

  /**
   * Configure UART parameters for an instance. Sends `SerialProxyConfigureRequest`; fire-and-forget at the wire level.
   *
   * @remarks Validates `dataSize` in 5..8 and `stopBits` in 1..2 before the wire send. Out-of-range values throw {@link ConnectionError} with code
   * `INVALID_SERIAL_CONFIG` synchronously - the wire accepts arbitrary values but the device rejects silently, so the client-side guard is the only way the caller
   * sees the misconfiguration.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-configure}
   *
   * @param instance - Zero-based instance index.
   * @param options - UART parameters. See {@link SerialProxyConfigureOptions}.
   * @throws ConnectionError with code `INVALID_SERIAL_CONFIG` when `dataSize` or `stopBits` is out of range.
   *
   */
  public configure(instance: number, options: SerialProxyConfigureOptions): void {

    if((options.dataSize < 5) || (options.dataSize > 8)) {

      throw new ConnectionError("Serial proxy dataSize must be in the inclusive range 5..8 (got " + String(options.dataSize) + ").", "INVALID_SERIAL_CONFIG");
    }

    const stopBits = options.stopBits ?? 1;

    if((stopBits !== 1) && (stopBits !== 2)) {

      throw new ConnectionError("Serial proxy stopBits must be 1 or 2 (got " + String(stopBits) + ").", "INVALID_SERIAL_CONFIG");
    }

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
      { fieldNumber: 2, value: options.baudrate, wireType: WireType.VARINT },
      { fieldNumber: 3, value: options.flowControl ? 1 : 0, wireType: WireType.VARINT },
      { fieldNumber: 4, value: options.parity ?? 0, wireType: WireType.VARINT },
      { fieldNumber: 5, value: stopBits, wireType: WireType.VARINT },
      { fieldNumber: 6, value: options.dataSize, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SERIAL_PROXY_CONFIGURE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Write raw bytes to an instance. Sends `SerialProxyWriteRequest`; fire-and-forget at the wire level.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-write}
   *
   * @param instance - Zero-based instance index.
   * @param data - Raw bytes to send. Length-delimited on the wire; arbitrary-content buffers (including null bytes, high bytes, and UTF-8-invalid sequences) are
   * transmitted verbatim.
   *
   */
  public write(instance: number, data: Buffer): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
      { fieldNumber: 2, value: data, wireType: WireType.LENGTH_DELIMITED }
    ];

    this.host.send(MessageType.SERIAL_PROXY_WRITE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Set the RTS / DTR modem-control line states for an instance. Sends `SerialProxySetModemPinsRequest`; fire-and-forget at the wire level.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-modem-pins}
   *
   * @param instance - Zero-based instance index.
   * @param lineStates - Bitmask of {@link SerialProxyLineStateFlags}. Compose flags via bitwise OR (e.g., `RTS | DTR`).
   *
   */
  public setModemPins(instance: number, lineStates: number): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
      { fieldNumber: 2, value: lineStates, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SERIAL_PROXY_SET_MODEM_PINS_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Read the current RTS / DTR modem-control line states for an instance. Sends `SerialProxyGetModemPinsRequest` and awaits the matching response, correlated by the
   * `instance` index.
   *
   * @remarks Concurrent calls for the same instance throw {@link ConnectionError} with code `MODEM_PINS_IN_FLIGHT`. The composed signal layers the caller's optional
   * `AbortSignal` over the timeout via `AbortSignal.any`; the default timeout is 5000ms.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-modem-pins}
   *
   * @param instance - Zero-based instance index.
   * @param options - Optional cancellation signal and custom timeout (default 5000ms).
   * @returns A promise that resolves with the line-states bitmask. Decode against {@link SerialProxyLineStateFlags}.
   * @throws ConnectionError with code `MODEM_PINS_IN_FLIGHT` when another await for the same instance is still pending.
   * @throws DOMException with name `AbortError` on either timeout or caller-signal abort. `Correlator.await` manufactures the timeout error itself; it
   * does not propagate {@link AbortSignal.timeout}'s native `TimeoutError`.
   *
   */
  public async getModemPins(instance: number, options?: SerialProxyAwaitOptions): Promise<number> {

    if(this.modemPinsCorrelator.pending(instance)) {

      throw new ConnectionError("Serial proxy getModemPins is already in flight for instance " + String(instance) + ".", "MODEM_PINS_IN_FLIGHT");
    }

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: instance, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SERIAL_PROXY_GET_MODEM_PINS_REQUEST, encodeProtoFields(fields));

    return this.modemPinsCorrelator.await(instance, {

      ...((options?.signal !== undefined) && { signal: options.signal }),
      timeoutMs: options?.timeoutMs ?? DEFAULT_SERIAL_REQUEST_TIMEOUT_MS
    });
  }

  /**
   * Flush the TX buffer for an instance. Sends `SerialProxyRequest(FLUSH)` and awaits the matching `SerialProxyRequestResponse`, correlated by the `instance` index.
   * Blocks until the device confirms drain (status `OK` / `ASSUMED_SUCCESS`) or fails out (`ERROR` / `TIMEOUT` / `NOT_SUPPORTED`).
   *
   * @remarks Concurrent calls for the same instance throw {@link ConnectionError} with code `FLUSH_IN_FLIGHT`. The composed signal layers the caller's optional
   * `AbortSignal` over the timeout via `AbortSignal.any`; the default timeout is 5000ms.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-flush}
   *
   * @param instance - Zero-based instance index.
   * @param options - Optional cancellation signal and custom timeout (default 5000ms).
   * @returns A promise that resolves with the {@link SerialProxyFlushResult}. Consumers switch on `status` to distinguish success from failure.
   * @throws ConnectionError with code `FLUSH_IN_FLIGHT` when another await for the same instance is still pending.
   * @throws DOMException with name `AbortError` on either timeout or caller-signal abort. `Correlator.await` manufactures the timeout error itself; it
   * does not propagate {@link AbortSignal.timeout}'s native `TimeoutError`.
   *
   */
  public async flush(instance: number, options?: SerialProxyAwaitOptions): Promise<SerialProxyFlushResult> {

    if(this.flushCorrelator.pending(instance)) {

      throw new ConnectionError("Serial proxy flush is already in flight for instance " + String(instance) + ".", "FLUSH_IN_FLIGHT");
    }

    this.sendRequest(instance, SerialProxyRequestType.FLUSH);

    return this.flushCorrelator.await(instance, {

      ...((options?.signal !== undefined) && { signal: options.signal }),
      timeoutMs: options?.timeoutMs ?? DEFAULT_SERIAL_REQUEST_TIMEOUT_MS
    });
  }

  /**
   * Backpressured async-iterable view of inbound data from a specific instance. Mirrors `LogSubscriptionManager.subscribe` -
   * refcounted-subscription pattern keyed by instance.
   *
   * @remarks The first iterator on an instance issues a wire-side `SerialProxyRequest(SUBSCRIBE)`; the last iterator to detach issues `SerialProxyRequest(UNSUBSCRIBE)`.
   * Concurrent iterators on the same instance share the wire-side subscription (only one SUBSCRIBE is sent regardless of consumer count). The subscription survives
   * reconnect via {@link reissueOnReconnect}.
   *
   * Per-instance filtering happens in the wrapper generator: the `serialData` bus emits chunks for every instance, and the generator yields only those whose `instance`
   * matches the iterator's argument. Two iterators on different instances do not see each other's chunks.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#serial-data-stream}
   *
   * @param instance - Zero-based instance index.
   * @param options - Optional backpressure policy and cancellation signal forwarded to the underlying `bus.stream("serialData", options)`.
   * @returns An `AsyncIterable<SerialDataChunk>` that yields chunks until the consumer aborts, the connection drops, or the stream completes.
   *
   */
  public data(instance: number, options?: StreamOptions): AsyncIterable<SerialDataChunk> {

    // Acquire a subscriber synchronously at call time so concurrent attaches are race-free. The first acquire on this instance drives the reduction from EMPTY to `true`,
    // which fires the wire-side SUBSCRIBE; subsequent acquires share the same wire-side subscription (the reduction is already `true`, so onChange is suppressed).
    const handle = this.dataSubscription.acquire(instance, true);
    const stream = this.host.bus.stream("serialData", options);

    // Cleanup as a `this`-capturing arrow so the IIFE generator below doesn't need a `this` alias. The primitive pairs release to acquire by symbol identity, so the
    // last release for an instance drives its reduction back to EMPTY (firing UNSUBSCRIBE) and a post-reconnect dispose is correct without any guard - the ledger
    // survived the reconnect and the wire cache was re-armed by reissueOnReconnect.
    const releaseSubscription = (): void => {

      this.dataSubscription.release(handle);
    };

    return (async function *(): AsyncGenerator<SerialDataChunk> {

      try {

        for await (const chunk of stream) {

          if(chunk.instance === instance) {

            yield chunk;
          }
        }

      } finally {

        releaseSubscription();
      }
    })();
  }

  /**
   * Decode an inbound `SerialProxyDataReceived` payload and emit it on the bus as `serialData`. Called by the host's run-phase dispatcher.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the data-received message.
   */
  public acceptDataMessage(payload: Buffer): void {

    const fields = this.decode(payload);
    const instance = extractNumberField(fields, 1);
    const data = fields[2]?.[0];

    if((instance === undefined) || !Buffer.isBuffer(data)) {

      this.host.log.warn("Received SerialProxyDataReceived without a valid instance or data field; dropping.");

      return;
    }

    this.host.bus.emit("serialData", { data, instance });
  }

  /**
   * Decode an inbound `SerialProxyGetModemPinsResponse` payload and resolve the matching await. Called by the host's run-phase dispatcher.
   *
   * @remarks A stale response (no pending await for the instance) is logged at debug and discarded. This can happen when the caller's timeout already fired before the
   * device responded.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptModemPinsResponse(payload: Buffer): void {

    const fields = this.decode(payload);
    const instance = extractNumberField(fields, 1);
    const lineStates = extractNumberField(fields, 2);

    if((instance === undefined) || (lineStates === undefined)) {

      this.host.log.warn("Received SerialProxyGetModemPinsResponse without a valid instance or line_states field; dropping.");

      return;
    }

    if(!this.modemPinsCorrelator.resolve(instance, lineStates)) {

      this.host.log.debug("Received SerialProxyGetModemPinsResponse for instance " + String(instance) + " with no pending await; discarding.");
    }
  }

  /**
   * Decode an inbound `SerialProxyRequestResponse` payload and resolve the matching await. Called by the host's run-phase dispatcher.
   *
   * @remarks The only request type that produces a response is {@link SerialProxyRequestType.FLUSH}. SUBSCRIBE and UNSUBSCRIBE responses (if any device firmware ever
   * sends them) are observational and dropped at debug. A stale FLUSH response (no pending await) is also logged at debug and discarded.
   *
   * @internal Inbound dispatch seam; not part of the consumer surface. Invoked exclusively by the host's run-phase message routing.
   * @param payload - Raw protobuf bytes for the response message.
   */
  public acceptRequestResponse(payload: Buffer): void {

    const fields = this.decode(payload);
    const instance = extractNumberField(fields, 1);
    const type = extractNumberField(fields, 2);
    const status = extractNumberField(fields, 3);
    const errorMessage = extractStringField(fields, 4);

    if((instance === undefined) || (type === undefined) || (status === undefined)) {

      this.host.log.warn("Received SerialProxyRequestResponse without a valid instance, type, or status field; dropping.");

      return;
    }

    if(type !== SerialProxyRequestType.FLUSH) {

      this.host.log.debug("Received SerialProxyRequestResponse for non-FLUSH request type " + String(type) + " on instance " + String(instance) + "; discarding.");

      return;
    }

    const result: SerialProxyFlushResult = {

      ...((errorMessage !== undefined) && { errorMessage }),
      instance,
      status: status as SerialProxyStatus,
      type: SerialProxyRequestType.FLUSH
    };

    if(!this.flushCorrelator.resolve(instance, result)) {

      this.host.log.debug("Received SerialProxyRequestResponse(FLUSH) for instance " + String(instance) + " with no pending await; discarding.");
    }
  }

  /**
   * Read the count of currently-active subscribers for an instance. Primarily a test and introspection affordance; the `util.inspect` hook surfaces
   * subscriber instances via `activeKeys()` rather than calling this accessor for per-instance counts.
   *
   * @remarks Delegates to the data subscription's `ReissuableSubscription.count`, a LEDGER-view read: it returns the true number of live
   * {@link data} iterators grouped under `instance`, derived from the subscriber ledger, so it survives {@link clearConnectionState} (the ledger is preserved across the
   * reconnect cycle while only the wire cache resets). It is not the cached wire-state - a survivor still counts after a reconnect even before {@link reissueOnReconnect}
   * re-arms the device.
   *
   * @param instance - Zero-based instance index.
   * @returns The number of active iterators currently attached to that instance. Zero when the instance has no live subscribers.
   */
  public subscriberCount(instance: number): number {

    return this.dataSubscription.count(instance);
  }

  /**
   * Encode and send a `SerialProxyRequest` for the given instance + type. Shared by {@link flush}, {@link data}, and {@link reissueOnReconnect}.
   *
   * @param instance - Zero-based instance index.
   * @param type - The request-type tag.
   */
  private sendRequest(instance: number, type: typeof SerialProxyRequestType[keyof typeof SerialProxyRequestType]): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
      { fieldNumber: 2, value: type, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SERIAL_PROXY_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Bounded protobuf decoder. Serial-proxy messages are tiny (instance plus a small payload at most), so a generous field cap is fine here. The host's transport-level
   * `maxFrameBytes` already protects against pathological frame-level payloads before they reach this module; this decoder passes the same 1024-field cap the host uses
   * by default (DEFAULT_MAX_FIELDS_PER_MESSAGE) so a malformed message cannot run away. The codec itself has no default - maxFieldsPerMessage is a required option.
   *
   * @param buffer - The protobuf-encoded payload.
   * @returns The decoded field map.
   */
  private decode(buffer: Buffer): Record<number, FieldValue[]> {

    return decodeProtobuf(buffer, { maxFieldsPerMessage: 1024 });
  }

  /**
   * Custom inspector for `console.log(client.serial)` clean output.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    return options.stylize("SerialProxyApi", "special") + " " + JSON.stringify({

      pendingFlushes: this.flushCorrelator.size,
      pendingModemPinsReads: this.modemPinsCorrelator.size,
      subscriberInstances: [...this.dataSubscription.activeKeys()]
    });
  }
}

/**
 * Parse the repeated `serial_proxies` nested-message field from a `DeviceInfoResponse` payload. Returns the list of {@link SerialProxyInfo} records in declaration
 * order, skipping any entry without a usable `name` (the wire-side `name` field is required; an entry without one is malformed and dropped). The `port_type` field
 * defaults to `0` (TTL) when absent so the consumer-visible record always has a numeric tag.
 *
 * @param fields - Decoded fields of the parent `DeviceInfoResponse`.
 * @param fieldNum - The repeated field number (`25` per `api.proto`).
 * @param decode - Decoder that the host injects for nested protobuf payloads (so per-message field-count caps and warn callbacks stay consistent).
 * @returns A list of {@link SerialProxyInfo} records. Empty when the field is absent or every entry is malformed.
 * @internal
 */
export function extractSerialProxies(fields: Record<number, FieldValue[]>, fieldNum: number, decode: (buffer: Buffer) => Record<number, FieldValue[]>):
SerialProxyInfo[] {

  const result: SerialProxyInfo[] = [];
  const proxyFields = fields[fieldNum];

  if(!proxyFields || !Array.isArray(proxyFields)) {

    return result;
  }

  for(const proxyBuffer of proxyFields) {

    if(!Buffer.isBuffer(proxyBuffer)) {

      continue;
    }

    const proxyMsg = decode(proxyBuffer);
    const name = extractStringField(proxyMsg, 1);

    if(name === undefined) {

      continue;
    }

    const portType = extractNumberField(proxyMsg, 2) ?? 0;

    result.push({

      name,
      portType: portType as SerialProxyPortType
    });
  }

  return result;
}
