/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * mock-transport.ts: In-memory transport for unit-testing the host class.
 */

/**
 * In-memory `TransportLike` implementation. Drives an {@link EspHomeClient} without a real TCP socket - inbound frames are pushed in synchronously
 * via {@link MockTransport.pushInbound}, outbound frames are captured in {@link MockTransport.outboundFrames}, and phase transitions are exposed for assertion.
 *
 * @remarks
 * The mock implements the same `TransportLike` surface real consumers see in {@link Transport}: `send`, `firstByte`, the async-iterable inbound queue,
 * `enterNoiseHandshake` / `installCipher` phase transitions, `nextNoiseHandshakeFrame`, dispose, and `isEncrypted`. None of those methods do real I/O; the mock parks
 * awaiters that resolve when the test pushes the matching response with `pushInbound`, `pushNoiseHandshakeFrame`, or `pushFirstByte`.
 *
 * Typical usage:
 *
 * ```ts
 * const transport = new MockTransport();
 *
 * await using client = await openEspHomeClient({ host: "test.local", transportFactory: (): MockTransport => transport });
 *
 * transport.pushInbound(MessageType.HELLO_RESPONSE, helloResponseBytes);
 * // ...
 * ```
 *
 * @module testing/mock-transport
 */
import type { BluetoothScannerMode, BluetoothScannerState, SerialProxyRequestType, SerialProxyStatus } from "../api-constants.ts";
import type { InboundMessage, NoiseCipherPair, TransportLike } from "../transport.ts";
import { encodePackedSint32, encodeProtoFields, encodeVarint, encodeVarintBigInt } from "../protocol/codec.ts";
import { Buffer } from "node:buffer";
import { MessageType } from "../protocol/message-types.ts";
import type { Nullable } from "../types.ts";
import type { ProtoField } from "../protocol/codec.ts";
import { WireType } from "../protocol/wire-types.ts";
import { ZWaveProxyRequestType } from "../api-constants.ts";

/**
 * Phase tag used for assertions in tests.
 */
export const MockTransportPhase = {

  NOISE_DATA: "noise-data",
  NOISE_HANDSHAKE: "noise-handshake",
  PLAINTEXT: "plaintext"
} as const;

export type MockTransportPhase = typeof MockTransportPhase[keyof typeof MockTransportPhase];

/**
 * One captured outbound frame. Tests assert against the captured `type` plus `payload` to verify what the host sent.
 */
export interface CapturedFrame {

  /**
   * Whether the frame was sent in `noise-data` phase (encrypted) or `plaintext` / `noise-handshake` phase.
   */
  encrypted: boolean;

  /**
   * The encoded payload bytes the host passed to `send`.
   */
  payload: Buffer;

  /**
   * The numeric message type identifier.
   */
  type: number;
}

interface InboundAwaiter {

  reject: (reason: unknown) => void;
  resolve: (value: IteratorResult<InboundMessage>) => void;
  signal: AbortSignal | undefined;
  signalListener?: () => void;
}

interface ValueAwaiter<T> {

  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
  signal: AbortSignal | undefined;
  signalListener?: () => void;
}

/**
 * In-memory `TransportLike` for unit tests.
 *
 * Usage:
 *
 * {@includeCode ../examples/showcase.ts#mock-transport-pattern}
 *
 */
export class MockTransport implements TransportLike {

  /**
   * Captured outbound frames in send-order. Tests inspect this array after driving the host.
   */
  public readonly outboundFrames: CapturedFrame[] = [];

  /**
   * Captured raw noise handshake frames in send-order.
   */
  public readonly outboundHandshakeFrames: Buffer[] = [];

  private currentPhase: MockTransportPhase = MockTransportPhase.PLAINTEXT;
  private installedCipher: Nullable<NoiseCipherPair> = null;
  private terminated = false;
  private fatalError: Nullable<Error> = null;

  /**
   * Test-only accessor for the installed noise cipher pair. Returns `null` until {@link installCipher} is called.
   */
  public get cipher(): Nullable<NoiseCipherPair> {

    return this.installedCipher;
  }

  private readonly messageQueue: InboundMessage[] = [];
  private readonly handshakeFrameQueue: Buffer[] = [];
  private firstByteQueue: number[] = [];

  private messageAwaiter: Nullable<InboundAwaiter> = null;
  private handshakeAwaiter: Nullable<ValueAwaiter<Buffer>> = null;
  private firstByteAwaiter: Nullable<ValueAwaiter<number>> = null;
  private idleResolvers: (() => void)[] = [];

  /**
   * Current transport phase. Test-only accessor for assertions.
   */
  public get phase(): MockTransportPhase {

    return this.currentPhase;
  }

  /**
   * Whether the transport is operating in `noise-data` phase.
   */
  public get isEncrypted(): boolean {

    return this.currentPhase === MockTransportPhase.NOISE_DATA;
  }

  /**
   * Push one inbound typed message into the queue. The host's run-phase iterator yields it on the next `next()` call.
   *
   * @param type - Message type identifier.
   * @param payload - The message payload.
   */
  public pushInbound(type: number, payload: Buffer): void {

    if(this.terminated) {

      return;
    }

    const message: InboundMessage = { payload, type };

    if(this.messageAwaiter) {

      const awaiter = this.messageAwaiter;

      this.messageAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.resolve({ done: false, value: message });

      return;
    }

    this.messageQueue.push(message);
  }

  /**
   * Push one raw noise handshake frame for {@link nextNoiseHandshakeFrame}.
   *
   * @param frame - The handshake frame bytes.
   */
  public pushNoiseHandshakeFrame(frame: Buffer): void {

    if(this.terminated) {

      return;
    }

    if(this.handshakeAwaiter) {

      const awaiter = this.handshakeAwaiter;

      this.handshakeAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.resolve(frame);

      return;
    }

    this.handshakeFrameQueue.push(frame);
  }

  /**
   * Push the indicator byte that {@link firstByte} returns.
   *
   * @param byte - `0x00` for plaintext or `0x01` for noise.
   */
  public pushFirstByte(byte: 0x00 | 0x01): void {

    if(this.terminated) {

      return;
    }

    if(this.firstByteAwaiter) {

      const awaiter = this.firstByteAwaiter;

      this.firstByteAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.resolve(byte);

      return;
    }

    this.firstByteQueue.push(byte);
  }

  /**
   * Simulate a fatal transport error. Pending awaiters reject; subsequent calls reject with the same error.
   *
   * @param error - The error to surface.
   */
  public fail(error: Error): void {

    if(this.terminated) {

      return;
    }

    this.fatalError = error;
    this.terminated = true;

    if(this.messageAwaiter) {

      const awaiter = this.messageAwaiter;

      this.messageAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.reject(error);
    }

    if(this.handshakeAwaiter) {

      const awaiter = this.handshakeAwaiter;

      this.handshakeAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.reject(error);
    }

    if(this.firstByteAwaiter) {

      const awaiter = this.firstByteAwaiter;

      this.firstByteAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.reject(error);
    }
  }

  /**
   * Capture an outbound frame. Implements the {@link TransportLike}.send contract; instead of writing to a socket, the frame is appended to
   * {@link MockTransport.outboundFrames} so tests can assert what the host sent. The captured frame's `encrypted` flag reflects the current phase ({@link
   * MockTransportPhase.NOISE_DATA} captures as encrypted; everything else captures as plaintext). Rejects with the fatal error when {@link MockTransport.fail} has been
   * called.
   *
   * @param type - The numeric message type identifier the host passed.
   * @param payload - The encoded protobuf payload bytes the host passed.
   */
  public async send(type: number, payload: Buffer): Promise<void> {

    if(this.fatalError) {

      throw this.fatalError;
    }

    this.outboundFrames.push({ encrypted: this.currentPhase === MockTransportPhase.NOISE_DATA, payload, type });
  }

  /**
   * Capture a raw noise handshake frame. Implements the {@link TransportLike}.sendNoiseHandshakeFrame contract; the frame is appended to
   * {@link MockTransport.outboundHandshakeFrames} so tests can assert the exact bytes the host emitted during the noise handshake. Rejects with the fatal error when
   * {@link MockTransport.fail} has been called.
   *
   * @param frame - The raw handshake frame bytes the host emitted.
   */
  public async sendNoiseHandshakeFrame(frame: Buffer): Promise<void> {

    if(this.fatalError) {

      throw this.fatalError;
    }

    this.outboundHandshakeFrames.push(frame);
  }

  /**
   * Transition to {@link MockTransportPhase.NOISE_HANDSHAKE}. Implements the {@link TransportLike}.enterNoiseHandshake contract; the host calls this once
   * before driving the noise NNpsk0 handshake exchange.
   */
  public enterNoiseHandshake(): void {

    this.currentPhase = MockTransportPhase.NOISE_HANDSHAKE;
  }

  /**
   * Install the negotiated noise cipher pair and transition to {@link MockTransportPhase.NOISE_DATA}. Implements the {@link TransportLike}.installCipher
   * contract; the captured cipher pair is held so tests can assert that the host installed the correct keys, but the mock does not actually encrypt subsequent frames.
   *
   * @param cipher - The negotiated send/receive cipher pair from the noise handshake.
   */
  public installCipher(cipher: NoiseCipherPair): void {

    this.installedCipher = cipher;
    this.currentPhase = MockTransportPhase.NOISE_DATA;
  }

  public async firstByte(signal?: AbortSignal): Promise<0x00 | 0x01> {

    if(this.fatalError) {

      throw this.fatalError;
    }

    signal?.throwIfAborted();

    const queued = this.firstByteQueue.shift();

    if(queued !== undefined) {

      return (queued === 0x01 ? 0x01 : 0x00);
    }

    const { promise, resolve, reject } = Promise.withResolvers<0x00 | 0x01>();
    const awaiter: ValueAwaiter<number> = { reject, resolve: resolve as (v: number) => void, signal };

    if(signal) {

      const listener = (): void => {

        if(this.firstByteAwaiter === awaiter) {

          this.firstByteAwaiter = null;
        }

        this.cleanupAwaiterSignal(awaiter);

        // Forward the abort reason as-is. AbortSignal.reason can be any value (per the DOM spec); when callers used `AbortSignal.timeout(...)` it is a DOMException
        // which is an Error subclass. We coerce non-Error reasons to a plain Error wrapping the value to satisfy the prefer-promise-reject-errors lint.
        const reason: Error = (signal.reason instanceof Error) ? signal.reason : new Error("Aborted: " + String(signal.reason));

        reject(reason);
      };

      awaiter.signalListener = listener;
      signal.addEventListener("abort", listener, { once: true });
    }

    this.firstByteAwaiter = awaiter;

    return promise;
  }

  public async nextNoiseHandshakeFrame(signal?: AbortSignal): Promise<Buffer> {

    if(this.fatalError) {

      throw this.fatalError;
    }

    signal?.throwIfAborted();

    const queued = this.handshakeFrameQueue.shift();

    if(queued !== undefined) {

      return queued;
    }

    const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
    const awaiter: ValueAwaiter<Buffer> = { reject, resolve, signal };

    if(signal) {

      const listener = (): void => {

        if(this.handshakeAwaiter === awaiter) {

          this.handshakeAwaiter = null;
        }

        this.cleanupAwaiterSignal(awaiter);

        // Forward the abort reason as-is. AbortSignal.reason can be any value (per the DOM spec); when callers used `AbortSignal.timeout(...)` it is a DOMException
        // which is an Error subclass. We coerce non-Error reasons to a plain Error wrapping the value to satisfy the prefer-promise-reject-errors lint.
        const reason: Error = (signal.reason instanceof Error) ? signal.reason : new Error("Aborted: " + String(signal.reason));

        reject(reason);
      };

      awaiter.signalListener = listener;
      signal.addEventListener("abort", listener, { once: true });
    }

    this.handshakeAwaiter = awaiter;

    return promise;
  }

  /**
   * Resolve once the inbound consumer has drained the queue and parked awaiting the next frame - i.e. every frame pushed so far has been pulled and its synchronous
   * handling has run. This is the deterministic alternative to timer-based "let the queue drain" waits: push frames, then `await transport.whenIdle()`. Resolves
   * immediately when the consumer is already parked on an empty queue, or when the transport has terminated (nothing more will be consumed).
   *
   * @returns A promise that settles when the consumer has caught up to everything pushed.
   */
  public whenIdle(): Promise<void> {

    if(this.terminated || ((this.messageQueue.length === 0) && (this.messageAwaiter !== null))) {

      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {

      this.idleResolvers.push(() => resolve());
    });
  }

  // Fire and clear any pending whenIdle() resolvers. Called when the consumer parks on an empty queue and on disposal, so a pending whenIdle() never hangs.
  private resolveIdle(): void {

    if(this.idleResolvers.length === 0) {

      return;
    }

    const resolvers = this.idleResolvers;

    this.idleResolvers = [];

    for(const resolve of resolvers) {

      resolve();
    }
  }

  /**
   * Async-iterator factory backing the inbound-message stream. Implements the {@link TransportLike} async-iterable contract; the host's
   * {@link MessageReceiver} pulls inbound messages from this iterator. Each call to `next()` either returns a queued message
   * (pushed via {@link MockTransport.pushInbound}) or parks an awaiter that resolves when the next message arrives. Returns the terminal `done` sentinel after
   * disposal.
   *
   * @returns An async iterator that yields one {@link InboundMessage} per pushed frame.
   */
  public [Symbol.asyncIterator](): AsyncIterator<InboundMessage> {

    return {

      next: async (): Promise<IteratorResult<InboundMessage>> => {

        if(this.fatalError) {

          throw this.fatalError;
        }

        const queued = this.messageQueue.shift();

        if(queued) {

          return { done: false, value: queued };
        }

        if(this.terminated) {

          return { done: true, value: undefined };
        }

        const { promise, resolve, reject } = Promise.withResolvers<IteratorResult<InboundMessage>>();

        this.messageAwaiter = { reject, resolve, signal: undefined };

        // The consumer has drained the queue and is now parked awaiting the next frame; settle anyone waiting on whenIdle().
        this.resolveIdle();

        return promise;
      },
      // The iterator's `return` produces an immediately-settled `done` sentinel. Mark async and `await` a no-op resolve so both `promise-function-async` and
      // `require-await` are satisfied without a lint suppression - the `await` here costs nothing and keeps the AsyncIterator contract clean.
      return: async (): Promise<IteratorResult<InboundMessage>> => {

        this.terminated = true;

        await Promise.resolve();

        return { done: true, value: undefined };
      }
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {

    this[Symbol.dispose]();
  }

  public [Symbol.dispose](): void {

    if(this.terminated) {

      return;
    }

    this.terminated = true;

    // Settle any pending whenIdle() waiters: a disposed transport will consume nothing further, so it is trivially idle.
    this.resolveIdle();

    if(this.messageAwaiter) {

      const awaiter = this.messageAwaiter;

      this.messageAwaiter = null;
      this.cleanupAwaiterSignal(awaiter);
      awaiter.resolve({ done: true, value: undefined });
    }
  }

  private cleanupAwaiterSignal(awaiter: { signal: AbortSignal | undefined; signalListener?: () => void }): void {

    if(awaiter.signal && awaiter.signalListener) {

      awaiter.signal.removeEventListener("abort", awaiter.signalListener);
    }
  }
}

/**
 * Encode a fixed32 entity key for use in mock list-entities and receive-event payloads. ESPHome stamps entity keys as little-endian uint32 across every wire message,
 * so this helper centralizes the conversion the IR / RF push helpers below depend on.
 *
 * @param key - The numeric entity key.
 * @returns A 4-byte little-endian buffer.
 */
function encodeKeyFixed32(key: number): Buffer {

  const buf = Buffer.alloc(4);

  buf.writeUInt32LE(key, 0);

  return buf;
}

/**
 * Options consumed by {@link pushInfraredListEntity}. Mirrors the wire fields of `ListEntitiesInfraredResponse` (`api.proto` §id 135). The required `key`, `objectId`,
 * and `name` are stamped into every push; optional fields are emitted only when defined.
 */
export interface PushInfraredListEntityOptions {

  capabilities?: number;
  disabledByDefault?: boolean;
  entityCategory?: number;
  icon?: string;
  key: number;
  name: string;
  objectId: string;
  receiverFrequency?: number;
}

/**
 * Push a synthesized `LIST_ENTITIES_INFRARED_RESPONSE` frame onto the mock transport. Tests use this during discovery to seed an infrared entity into the host's
 * registry; the produced bytes match the field layout the schema's listEntities slot declares.
 *
 * @param transport - The mock transport to push onto.
 * @param options - Per-entity fields. See {@link PushInfraredListEntityOptions}.
 */
export function pushInfraredListEntity(transport: MockTransport, options: PushInfraredListEntityOptions): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: Buffer.from(options.objectId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 2, value: encodeKeyFixed32(options.key), wireType: WireType.FIXED32 },
    { fieldNumber: 3, value: Buffer.from(options.name, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ];

  if(options.icon !== undefined) {

    fields.push({ fieldNumber: 4, value: Buffer.from(options.icon, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  if(options.disabledByDefault !== undefined) {

    fields.push({ fieldNumber: 5, value: options.disabledByDefault ? 1 : 0, wireType: WireType.VARINT });
  }

  if(options.entityCategory !== undefined) {

    fields.push({ fieldNumber: 6, value: options.entityCategory, wireType: WireType.VARINT });
  }

  if(options.capabilities !== undefined) {

    fields.push({ fieldNumber: 8, value: options.capabilities, wireType: WireType.VARINT });
  }

  if(options.receiverFrequency !== undefined) {

    fields.push({ fieldNumber: 9, value: options.receiverFrequency, wireType: WireType.VARINT });
  }

  transport.pushInbound(MessageType.LIST_ENTITIES_INFRARED_RESPONSE, encodeProtoFields(fields));
}

/**
 * Options consumed by {@link pushRadioFrequencyListEntity}. Mirrors the wire fields of `ListEntitiesRadioFrequencyResponse` (`api.proto` §id 148).
 */
export interface PushRadioFrequencyListEntityOptions {

  capabilities?: number;
  disabledByDefault?: boolean;
  entityCategory?: number;
  frequencyMax?: number;
  frequencyMin?: number;
  icon?: string;
  key: number;
  name: string;
  objectId: string;
  supportedModulations?: number;
}

/**
 * Push a synthesized `LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE` frame onto the mock transport. Tests use this during discovery to seed a radio-frequency entity into the
 * host's registry; the produced bytes match the field layout the schema's listEntities slot declares.
 *
 * @param transport - The mock transport to push onto.
 * @param options - Per-entity fields. See {@link PushRadioFrequencyListEntityOptions}.
 */
export function pushRadioFrequencyListEntity(transport: MockTransport, options: PushRadioFrequencyListEntityOptions): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: Buffer.from(options.objectId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
    { fieldNumber: 2, value: encodeKeyFixed32(options.key), wireType: WireType.FIXED32 },
    { fieldNumber: 3, value: Buffer.from(options.name, "utf8"), wireType: WireType.LENGTH_DELIMITED }
  ];

  if(options.icon !== undefined) {

    fields.push({ fieldNumber: 4, value: Buffer.from(options.icon, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  if(options.disabledByDefault !== undefined) {

    fields.push({ fieldNumber: 5, value: options.disabledByDefault ? 1 : 0, wireType: WireType.VARINT });
  }

  if(options.entityCategory !== undefined) {

    fields.push({ fieldNumber: 6, value: options.entityCategory, wireType: WireType.VARINT });
  }

  if(options.capabilities !== undefined) {

    fields.push({ fieldNumber: 8, value: options.capabilities, wireType: WireType.VARINT });
  }

  if(options.frequencyMin !== undefined) {

    fields.push({ fieldNumber: 9, value: options.frequencyMin, wireType: WireType.VARINT });
  }

  if(options.frequencyMax !== undefined) {

    fields.push({ fieldNumber: 10, value: options.frequencyMax, wireType: WireType.VARINT });
  }

  if(options.supportedModulations !== undefined) {

    fields.push({ fieldNumber: 11, value: options.supportedModulations, wireType: WireType.VARINT });
  }

  transport.pushInbound(MessageType.LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE, encodeProtoFields(fields));
}

/**
 * Options consumed by {@link pushInfraredRFReceiveEvent}. Mirrors the wire fields of `InfraredRFReceiveEvent` (`api.proto` §id 137). The same message id carries both
 * infrared and radio-frequency receive events; the host disambiguates by consulting the registered entity's type, so this helper does not need a type tag.
 */
export interface PushInfraredRFReceiveEventOptions {

  deviceId?: number;
  key: number;
  timings: readonly number[];
}

/**
 * Push a synthesized `INFRARED_RF_RECEIVE_EVENT` frame onto the mock transport. The `timings` array is encoded as a packed `sint32` body matching the wire format the
 * device produces.
 *
 * @param transport - The mock transport to push onto.
 * @param options - Per-event fields. See {@link PushInfraredRFReceiveEventOptions}.
 */
export function pushInfraredRFReceiveEvent(transport: MockTransport, options: PushInfraredRFReceiveEventOptions): void {

  const fields: ProtoField[] = [

    { fieldNumber: 2, value: encodeKeyFixed32(options.key), wireType: WireType.FIXED32 },
    { fieldNumber: 3, value: encodePackedSint32(options.timings), wireType: WireType.LENGTH_DELIMITED }
  ];

  if(options.deviceId !== undefined) {

    // `device_id` is field 1 on the receive event (varint).
    fields.push({ fieldNumber: 1, value: options.deviceId, wireType: WireType.VARINT });
  }

  transport.pushInbound(MessageType.INFRARED_RF_RECEIVE_EVENT, encodeProtoFields(fields));
}

/**
 * Push a synthesized `SERIAL_PROXY_DATA_RECEIVED` frame onto the mock transport. The frame carries one chunk of inbound serial data for a specific instance; the host
 * routes it to `SerialProxyApi.acceptDataMessage` which emits the `serialData` bus event after decoding.
 *
 * @param transport - The mock transport to push onto.
 * @param instance - Zero-based instance index identifying the UART port.
 * @param data - Raw bytes the device claims to have received from the UART.
 */
export function pushSerialData(transport: MockTransport, instance: number, data: Buffer): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
    { fieldNumber: 2, value: data, wireType: WireType.LENGTH_DELIMITED }
  ];

  transport.pushInbound(MessageType.SERIAL_PROXY_DATA_RECEIVED, encodeProtoFields(fields));
}

/**
 * Push a synthesized `SERIAL_PROXY_GET_MODEM_PINS_RESPONSE` frame onto the mock transport. The frame resolves the matching `getModemPins` await on the host's
 * serial-proxy sub-API, correlated by the `instance` index.
 *
 * @param transport - The mock transport to push onto.
 * @param instance - Zero-based instance index identifying the UART port.
 * @param lineStates - Bitmask of {@link SerialProxyLineStateFlags} the device claims for the current RTS / DTR state.
 */
export function pushSerialModemPinsResponse(transport: MockTransport, instance: number, lineStates: number): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: instance, wireType: WireType.VARINT },
    { fieldNumber: 2, value: lineStates, wireType: WireType.VARINT }
  ];

  transport.pushInbound(MessageType.SERIAL_PROXY_GET_MODEM_PINS_RESPONSE, encodeProtoFields(fields));
}

/**
 * Options consumed by {@link pushSerialFlushResult}. Mirrors the wire fields of `SerialProxyRequestResponse` (`api.proto` §id 147). All four fields are conditionally
 * emitted so a test can simulate a malformed response by omitting any of them.
 */
export interface PushSerialFlushResultOptions {

  /** Optional human-readable error message field (4). Emitted only when defined. */
  errorMessage?: string;

  /** Zero-based instance index identifying the UART port (field 1). */
  instance: number;

  /** Wire-level completion status (field 3). See {@link SerialProxyStatus}. */
  status: SerialProxyStatus;

  /** Echoed request-type tag (field 2). See {@link SerialProxyRequestType}. */
  type: SerialProxyRequestType;
}

/**
 * Push a synthesized `SERIAL_PROXY_REQUEST_RESPONSE` frame onto the mock transport. The frame resolves the matching `flush` await on the host's serial-proxy sub-API,
 * correlated by the `instance` index.
 *
 * @param transport - The mock transport to push onto.
 * @param options - Per-response fields. See {@link PushSerialFlushResultOptions}.
 */
export function pushSerialFlushResult(transport: MockTransport, options: PushSerialFlushResultOptions): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: options.instance, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.type, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.status, wireType: WireType.VARINT }
  ];

  if(options.errorMessage !== undefined) {

    fields.push({ fieldNumber: 4, value: Buffer.from(options.errorMessage, "utf8"), wireType: WireType.LENGTH_DELIMITED });
  }

  transport.pushInbound(MessageType.SERIAL_PROXY_REQUEST_RESPONSE, encodeProtoFields(fields));
}

/**
 * One advertisement record consumed by {@link pushBluetoothAdvertisementsBatch}. Mirrors the public {@link BluetoothLERawAdvertisement} shape (address
 * as `bigint`, rssi as signed `number`, addressType as unsigned `number`, data as `Buffer`). Decoupled from the public type at the type level so the mock-transport
 * subpath does not pull the sub-API module's import graph.
 */
export interface PushBluetoothAdvertisement {

  /** Device BLE address. uint64 on the wire; modelled as `bigint` for end-to-end precision. */
  address: bigint;

  /** Address-type tag (0-4). */
  addressType: number;

  /** Advertisement payload bytes (up to 62). */
  data: Buffer;

  /** Received-signal strength indicator, in dBm. Negative integer in practice. */
  rssi: number;
}

/**
 * Encode a single `BluetoothLERawAdvertisement` nested message. The wire format uses `uint64` for the address (field 1) and `sint32` for the rssi (field 2); the
 * helper hand-encodes the address varint to preserve full 64-bit precision (the standard varint encoder uses 32-bit bitwise math and would silently truncate any
 * address above 2^32) and zigzag-encodes the signed rssi.
 *
 * @param advertisement - The advertisement record to encode.
 * @returns The encoded nested-message bytes.
 */
function encodeBluetoothAdvertisement(advertisement: PushBluetoothAdvertisement): Buffer {

  const parts: Buffer[] = [];

  // Field 1 (uint64 address): tag = (1 << 3) | VARINT, plus the bigint varint body. The standard encoder works in JS numbers so the body is hand-rolled here; the
  // tag itself fits in 7 bits and is encoded via the standard helper.
  parts.push(encodeVarint((1 << 3) | WireType.VARINT));
  parts.push(encodeVarintBigInt(advertisement.address));

  // Field 2 (sint32 rssi): zigzag encode then standard varint body.
  parts.push(encodeVarint((2 << 3) | WireType.VARINT));
  parts.push(encodeVarint(((advertisement.rssi << 1) ^ (advertisement.rssi >> 31)) >>> 0));

  // Field 3 (uint32 address_type): standard varint.
  parts.push(encodeVarint((3 << 3) | WireType.VARINT));
  parts.push(encodeVarint(advertisement.addressType));

  // Field 4 (bytes data): length-delimited.
  parts.push(encodeVarint((4 << 3) | WireType.LENGTH_DELIMITED));
  parts.push(encodeVarint(advertisement.data.length));
  parts.push(advertisement.data);

  return Buffer.concat(parts);
}

/**
 * Push a synthesized `BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE` frame onto the mock transport. The supplied advertisements are encoded as repeated nested entries on
 * field 1; the host fans each one out as an individual `bluetoothAdvertisement` bus event after decoding.
 *
 * @param transport - The mock transport to push onto.
 * @param advertisements - The batched advertisements to encode. Pass an empty array to test the "empty batch" path; pass multiple entries to verify the host's
 * fan-out behavior.
 */
export function pushBluetoothAdvertisementsBatch(transport: MockTransport, advertisements: readonly PushBluetoothAdvertisement[]): void {

  const fields: ProtoField[] = advertisements.map((ad) => ({

    fieldNumber: 1,
    value: encodeBluetoothAdvertisement(ad),
    wireType: WireType.LENGTH_DELIMITED
  }));

  transport.pushInbound(MessageType.BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE, encodeProtoFields(fields));
}

/**
 * Options consumed by {@link pushBluetoothScannerState}. Mirrors the wire fields of `BluetoothScannerStateResponse` (`api.proto` §id 126): `state` (1), `mode` (2),
 * `configured_mode` (3). All three fields are required by the consumer-facing record; the helper does not support omission so the test always exercises the
 * well-formed path.
 */
export interface PushBluetoothScannerStateOptions {

  /** Mode the consumer last requested via `client.bluetooth.setScannerMode` (field 3). */
  configuredMode: BluetoothScannerMode;

  /** Mode the scanner is currently operating in (field 2). */
  mode: BluetoothScannerMode;

  /** Current scanner state (field 1). */
  state: BluetoothScannerState;
}

/**
 * Push a synthesized `BLUETOOTH_SCANNER_STATE_RESPONSE` frame onto the mock transport. The frame updates the host's cached snapshot and emits the
 * `bluetoothScannerState` bus event.
 *
 * @param transport - The mock transport to push onto.
 * @param options - Scanner-state fields. See {@link PushBluetoothScannerStateOptions}.
 */
export function pushBluetoothScannerState(transport: MockTransport, options: PushBluetoothScannerStateOptions): void {

  const fields: ProtoField[] = [

    { fieldNumber: 1, value: options.state, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.mode, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.configuredMode, wireType: WireType.VARINT }
  ];

  transport.pushInbound(MessageType.BLUETOOTH_SCANNER_STATE_RESPONSE, encodeProtoFields(fields));
}

/**
 * One BLE GATT service consumed by {@link pushBluetoothGattGetServicesResponse}. The fields mirror the public sub-API surface but stay decoupled at the type level so
 * the helper does not pull the bluetooth-proxy import graph.
 */
export interface PushBluetoothGattService {

  /** Characteristics nested under this service. */
  characteristics?: readonly PushBluetoothGattCharacteristic[];

  /** Service handle. */
  handle: number;

  /** 16-bit or 32-bit assigned-number UUID. */
  shortUuid?: number;

  /** 128-bit UUID as two uint64 halves. */
  uuid?: readonly bigint[];
}

/**
 * One BLE GATT characteristic.
 */
export interface PushBluetoothGattCharacteristic {

  /** Descriptors nested under this characteristic. */
  descriptors?: readonly PushBluetoothGattDescriptor[];

  /** Characteristic value handle. */
  handle: number;

  /** BLE Core characteristic-properties bitmask (Read = 0x02, Write = 0x08, Notify = 0x10, etc.). */
  properties: number;

  /** 16-bit or 32-bit assigned-number UUID. */
  shortUuid?: number;

  /** 128-bit UUID as two uint64 halves. */
  uuid?: readonly bigint[];
}

/**
 * One BLE GATT descriptor.
 */
export interface PushBluetoothGattDescriptor {

  /** Descriptor handle. */
  handle: number;

  /** 16-bit or 32-bit assigned-number UUID. */
  shortUuid?: number;

  /** 128-bit UUID as two uint64 halves. */
  uuid?: readonly bigint[];
}

/**
 * Encode a `BluetoothGATTDescriptor` nested message (uuid x2, handle, short_uuid).
 */
function encodeBluetoothGattDescriptor(descriptor: PushBluetoothGattDescriptor): Buffer {

  const fields: ProtoField[] = [];

  if(descriptor.uuid) {

    for(const segment of descriptor.uuid) {

      fields.push({ fieldNumber: 1, value: segment, wireType: WireType.VARINT });
    }
  }

  fields.push({ fieldNumber: 2, value: descriptor.handle, wireType: WireType.VARINT });

  if(descriptor.shortUuid !== undefined) {

    fields.push({ fieldNumber: 3, value: descriptor.shortUuid, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

/**
 * Encode a `BluetoothGATTCharacteristic` nested message (uuid x2, handle, properties, descriptors..., short_uuid).
 */
function encodeBluetoothGattCharacteristic(characteristic: PushBluetoothGattCharacteristic): Buffer {

  const fields: ProtoField[] = [];

  if(characteristic.uuid) {

    for(const segment of characteristic.uuid) {

      fields.push({ fieldNumber: 1, value: segment, wireType: WireType.VARINT });
    }
  }

  fields.push({ fieldNumber: 2, value: characteristic.handle, wireType: WireType.VARINT });
  fields.push({ fieldNumber: 3, value: characteristic.properties, wireType: WireType.VARINT });

  if(characteristic.descriptors) {

    for(const descriptor of characteristic.descriptors) {

      fields.push({ fieldNumber: 4, value: encodeBluetoothGattDescriptor(descriptor), wireType: WireType.LENGTH_DELIMITED });
    }
  }

  if(characteristic.shortUuid !== undefined) {

    fields.push({ fieldNumber: 5, value: characteristic.shortUuid, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

/**
 * Encode a `BluetoothGATTService` nested message (uuid x2, handle, characteristics..., short_uuid).
 */
function encodeBluetoothGattService(service: PushBluetoothGattService): Buffer {

  const fields: ProtoField[] = [];

  if(service.uuid) {

    for(const segment of service.uuid) {

      fields.push({ fieldNumber: 1, value: segment, wireType: WireType.VARINT });
    }
  }

  fields.push({ fieldNumber: 2, value: service.handle, wireType: WireType.VARINT });

  if(service.characteristics) {

    for(const characteristic of service.characteristics) {

      fields.push({ fieldNumber: 3, value: encodeBluetoothGattCharacteristic(characteristic), wireType: WireType.LENGTH_DELIMITED });
    }
  }

  if(service.shortUuid !== undefined) {

    fields.push({ fieldNumber: 4, value: service.shortUuid, wireType: WireType.VARINT });
  }

  return encodeProtoFields(fields);
}

/**
 * Push a `BluetoothDeviceConnectionResponse` (id 69) frame. Fired on both connect and disconnect transitions; the `connected` boolean distinguishes them.
 *
 * @param transport - The mock transport.
 * @param options - Address, connected flag, MTU, error code.
 */
export function pushBluetoothDeviceConnectionResponse(transport: MockTransport, options: { address: bigint; connected: boolean; error?: number; mtu?: number }): void {

  const fields: ProtoField[] = [
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.connected ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.mtu ?? 0, wireType: WireType.VARINT },
    { fieldNumber: 4, value: options.error ?? 0, wireType: WireType.VARINT }
  ];

  transport.pushInbound(MessageType.BLUETOOTH_DEVICE_CONNECTION_RESPONSE, encodeProtoFields(fields));
}

/**
 * Push a `BluetoothGATTGetServicesResponse` (id 71) frame. The device may send multiple of these in sequence; terminate the streamed sequence with
 * {@link pushBluetoothGattGetServicesDoneResponse}.
 *
 * @param transport - The mock transport.
 * @param options - Address plus an array of services to include in this single frame.
 */
export function pushBluetoothGattGetServicesResponse(transport: MockTransport, options: { address: bigint; services: readonly PushBluetoothGattService[] }): void {

  const fields: ProtoField[] = [{ fieldNumber: 1, value: options.address, wireType: WireType.VARINT }];

  for(const service of options.services) {

    fields.push({ fieldNumber: 2, value: encodeBluetoothGattService(service), wireType: WireType.LENGTH_DELIMITED });
  }

  transport.pushInbound(MessageType.BLUETOOTH_GATT_GET_SERVICES_RESPONSE, encodeProtoFields(fields));
}

/**
 * Push a `BluetoothGATTGetServicesDoneResponse` (id 72) sentinel.
 *
 * @param transport - The mock transport.
 * @param options - Address being terminated.
 */
export function pushBluetoothGattGetServicesDoneResponse(transport: MockTransport, options: { address: bigint }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothGATTReadResponse` (id 74) frame. Shared response for characteristic read (73) and descriptor read (76).
 *
 * @param transport - The mock transport.
 * @param options - Address, handle, response bytes.
 */
export function pushBluetoothGattReadResponse(transport: MockTransport, options: { address: bigint; data: Buffer; handle: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_READ_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.handle, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.data, wireType: WireType.LENGTH_DELIMITED }
  ]));
}

/**
 * Push a `BluetoothGATTWriteResponse` (id 83) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address and handle being acknowledged.
 */
export function pushBluetoothGattWriteResponse(transport: MockTransport, options: { address: bigint; handle: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_WRITE_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.handle, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothGATTNotifyResponse` (id 84) frame - the setNotify acknowledgment.
 *
 * @param transport - The mock transport.
 * @param options - Address and handle being acknowledged.
 */
export function pushBluetoothGattNotifyResponse(transport: MockTransport, options: { address: bigint; handle: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_NOTIFY_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.handle, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothGATTNotifyDataResponse` (id 79) frame - one notification chunk.
 *
 * @param transport - The mock transport.
 * @param options - Address, handle, and notification payload bytes.
 */
export function pushBluetoothGattNotifyData(transport: MockTransport, options: { address: bigint; data: Buffer; handle: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.handle, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.data, wireType: WireType.LENGTH_DELIMITED }
  ]));
}

/**
 * Push a `BluetoothGATTErrorResponse` (id 82) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address, handle, and error code.
 */
export function pushBluetoothGattErrorResponse(transport: MockTransport, options: { address: bigint; error: number; handle: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_GATT_ERROR_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.handle, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.error, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothDevicePairingResponse` (id 85) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address, paired bit, error code.
 */
export function pushBluetoothDevicePairingResponse(transport: MockTransport, options: { address: bigint; error?: number; paired: boolean }): void {

  transport.pushInbound(MessageType.BLUETOOTH_DEVICE_PAIRING_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.paired ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.error ?? 0, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothDeviceUnpairingResponse` (id 86) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address, success bit, error code.
 */
export function pushBluetoothDeviceUnpairingResponse(transport: MockTransport, options: { address: bigint; error?: number; success: boolean }): void {

  transport.pushInbound(MessageType.BLUETOOTH_DEVICE_UNPAIRING_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.success ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.error ?? 0, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothDeviceClearCacheResponse` (id 88) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address, success bit, error code.
 */
export function pushBluetoothDeviceClearCacheResponse(transport: MockTransport, options: { address: bigint; error?: number; success: boolean }): void {

  transport.pushInbound(MessageType.BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.success ? 1 : 0, wireType: WireType.VARINT },
    { fieldNumber: 3, value: options.error ?? 0, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a `BluetoothConnectionsFreeResponse` (id 81) frame.
 *
 * @param transport - The mock transport.
 * @param options - Slot capacity snapshot.
 */
export function pushBluetoothConnectionsFreeResponse(transport: MockTransport, options: { allocated?: readonly bigint[]; free: number; limit: number }): void {

  const fields: ProtoField[] = [
    { fieldNumber: 1, value: options.free, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.limit, wireType: WireType.VARINT }
  ];

  if(options.allocated) {

    for(const address of options.allocated) {

      fields.push({ fieldNumber: 3, value: address, wireType: WireType.VARINT });
    }
  }

  transport.pushInbound(MessageType.BLUETOOTH_CONNECTIONS_FREE_RESPONSE, encodeProtoFields(fields));
}

/**
 * Push a `BluetoothSetConnectionParamsResponse` (id 146) frame.
 *
 * @param transport - The mock transport.
 * @param options - Address and error code.
 */
export function pushBluetoothSetConnectionParamsResponse(transport: MockTransport, options: { address: bigint; error?: number }): void {

  transport.pushInbound(MessageType.BLUETOOTH_SET_CONNECTION_PARAMS_RESPONSE, encodeProtoFields([
    { fieldNumber: 1, value: options.address, wireType: WireType.VARINT },
    { fieldNumber: 2, value: options.error ?? 0, wireType: WireType.VARINT }
  ]));
}

/**
 * Push a synthesized `ZWAVE_PROXY_FRAME` (id 128) frame onto the mock transport. The frame carries one Z-Wave Serial API frame as an opaque byte buffer; the host
 * routes it to `ZWaveProxyApi.acceptFrame` which emits the `zwaveFrame` bus event after decoding. The buffer is wrapped in a `bytes data` field
 * (field 1, length-delimited) verbatim - this helper does not parse or validate the Z-Wave Serial API content.
 *
 * @param transport - The mock transport to push onto.
 * @param frame - Raw Z-Wave Serial API frame bytes. Arbitrary content (null bytes, high bytes, the Z-Wave SOF byte 0x01) is preserved end-to-end.
 */
export function pushZWaveFrame(transport: MockTransport, frame: Buffer): void {

  const fields: ProtoField[] = [{ fieldNumber: 1, value: frame, wireType: WireType.LENGTH_DELIMITED }];

  transport.pushInbound(MessageType.ZWAVE_PROXY_FRAME, encodeProtoFields(fields));
}

/**
 * Push a synthesized `ZWAVE_PROXY_REQUEST(HOME_ID_CHANGE)` (id 129) frame onto the mock transport. The `data` field carries the new home id as a 4-byte big-endian
 * uint32, matching the encoding the upstream ESPHome `zwave_proxy` firmware component emits. The host routes the frame to {@link ZWaveProxyApi
 * .acceptRequest} which updates the cached home id and emits the `zwaveHomeIdChange` bus event.
 *
 * @param transport - The mock transport to push onto.
 * @param homeId - The new home id to encode. Values up to 2^32 - 1 are valid; values <= 0 are interpreted by the sub-API as "no network joined".
 */
export function pushZWaveHomeIdChange(transport: MockTransport, homeId: number): void {

  const data = Buffer.alloc(4);

  data.writeUInt32BE(homeId >>> 0, 0);

  const fields: ProtoField[] = [
    { fieldNumber: 1, value: ZWaveProxyRequestType.HOME_ID_CHANGE, wireType: WireType.VARINT },
    { fieldNumber: 2, value: data, wireType: WireType.LENGTH_DELIMITED }
  ];

  transport.pushInbound(MessageType.ZWAVE_PROXY_REQUEST, encodeProtoFields(fields));
}

/**
 * Synthesized noise handshake exchange shape: the inbound server-hello and server-handshake frames the mock should push (currently empty placeholders), not a
 * cipher pair. The shape lets callers exercise the type signature without performing an actual cryptographic exchange; callers that need a real handshake -
 * including the cipher pair a real exchange produces - use `createESPHomeHandshake` from `crypto-noise.ts` and drive the returned `HandshakeState` directly.
 *
 * @param psk - The base64-encoded pre-shared key. Currently used only for shape validation.
 * @returns A synthesized handshake exchange shape: the inbound server-hello and server-handshake frames the mock should push.
 */
export function mockNoiseHandshakeExchange(psk: string): { serverHandshake: Buffer; serverHello: Buffer } {

  // Validate shape: a real PSK base64-decodes to 32 bytes.
  const decoded = Buffer.from(psk, "base64");

  if(decoded.length !== 32) {

    throw new Error("mockNoiseHandshakeExchange requires a 32-byte (base64-encoded) PSK; got " + String(decoded.length) + " bytes.");
  }

  // Empty placeholder frames. Tests that need a real noise handshake call `createESPHomeHandshake` from `crypto-noise.ts` and drive the returned `HandshakeState`; this
  // helper only satisfies the return-shape contract for callers that need the type signature without exercising the protocol.
  return {

    serverHandshake: Buffer.alloc(0),
    serverHello: Buffer.alloc(0)
  };
}
