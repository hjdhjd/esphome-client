/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * capture.ts: Session capture (record) and deterministic replay for the espc CLI.
 */

/**
 * Capture-replay support for the espc CLI's `record` and `replay` commands.
 *
 * The two halves share one byte-level capture format and one design principle: a capture is the ordered stream of decoded inbound protocol messages, recorded at the
 * transport seam. Recording wraps the real {@link Transport} in a {@link RecordingTransport} tee that copies every message the host pulls off the wire;
 * replay feeds that same stream back through a {@link MockTransport} to drive a real {@link EspHomeClient} through a
 * full connect.
 *
 * Recording at the decoded-message layer (rather than the raw socket layer) makes the format encryption-agnostic: a Noise-encrypted session and a plaintext session
 * both surface the same decrypted typed-message stream through the transport's async iterator, so a capture of either replays identically as a plaintext session. It
 * also means a capture is self-contained - it begins with the `HELLO_RESPONSE` the handshake consumes and continues through discovery and state updates - so replay can
 * drive the host from first byte to steady state with no live device.
 *
 * @module util/capture
 */
import type { InboundMessage, TransportLike, TransportOpenOptions } from "../transport.ts";
import { ProtocolByte, Transport } from "../transport.ts";
import { encodeVarint, readVarint } from "../protocol/codec.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { DeviceInfo } from "../esphome-client.ts";
import type { EspHomeLogging } from "../types.ts";
import { MessageType } from "../protocol/message-types.ts";
import { MockTransport } from "../testing/mock-transport.ts";
import type { Nullable } from "../types.ts";
import { STATE_MESSAGE_TYPES } from "../run-phase-handlers.ts";
import { setTimeout as delay } from "node:timers/promises";
import { dirname } from "node:path";
import { openEspHomeClient } from "../esphome-client.ts";

// Default capture duration when the caller does not specify one.
const DEFAULT_DURATION_MS = 10000;

// replayCapture is a deterministic offline driver: the frames are pre-queued, so a well-formed connect completes in milliseconds. Bound the overall connect
// envelope so an undrivable capture (a missing discovery frame) surfaces the typed ConnectionError quickly instead of waiting the production default.
const REPLAY_CONNECT_TIMEOUT_MS = 5000;

// Schema version stamped into every metadata file. Bump when the binary frame format or metadata-file shape changes incompatibly.
export const CAPTURE_SCHEMA_VERSION = "v1.0.0";

// A no-op logger used when the caller supplies none. Recording and replay are quiet by default; the CLI passes its own logger when verbose output is wanted.
const SILENT_LOGGER: EspHomeLogging = {

  debug: (): void => { /* discard */ },
  error: (): void => { /* discard */ },
  info: (): void => { /* discard */ },
  warn: (): void => { /* discard */ }
};

/**
 * The capture metadata written alongside a capture binary. Every consumer-facing field is optional on read (older captures may omit fields) but always written by
 * {@link recordCapture}. PII in the device-info subset is scrubbed before it lands here.
 */
export interface CaptureMetadata {

  readonly capturedAt: string;
  readonly description: string;
  readonly deviceInfo: Nullable<Record<string, unknown>>;
  readonly expectedFrames: number;
  readonly scenario: string;
  readonly schemaVersion: string;
  readonly source: "real-device";
}

/**
 * Options for {@link recordCapture}. Connection options mirror the client's; `outputPath` is the `.bin` destination and the metadata file is written alongside it with a
 * `.json` extension.
 */
export interface RecordCaptureOptions {

  readonly durationMs?: number;
  readonly host: string;
  readonly logger?: EspHomeLogging;
  readonly outputPath: string;
  readonly port?: number;
  readonly psk?: Nullable<string>;
  readonly scenario?: string;
}

/**
 * The result of a completed recording: the paths written and the captured frame/byte counts.
 */
export interface CaptureSummary {

  readonly binaryPath: string;
  readonly byteLength: number;
  readonly frameCount: number;
  readonly metadataPath: string;
}

/**
 * Options for {@link replayCapture}.
 */
export interface ReplayCaptureOptions {

  readonly binaryPath: string;
  readonly logger?: EspHomeLogging;
}

/**
 * The result of a completed replay: what the host observed when driven from the captured stream.
 */
export interface ReplaySummary {

  readonly deviceName: Nullable<string>;
  readonly entityCount: number;
  readonly frameCount: number;
  readonly telemetryEventCount: number;
}

/**
 * Encode a sequence of inbound messages into the capture binary format. Each frame is `[type varint][length varint][payload bytes]`. Using a varint for the message
 * type (rather than a single byte) means type ids above 127 - `ZWAVE_PROXY_FRAME`, the infrared/RF transmit message, and any future high-numbered type - round-trip
 * faithfully instead of being truncated by a `& 0x7F` mask.
 *
 * @param frames - The ordered inbound messages to encode.
 * @returns The capture binary.
 */
export function encodeCaptureFrames(frames: readonly InboundMessage[]): Buffer {

  const chunks: Buffer[] = [];

  for(const frame of frames) {

    chunks.push(encodeVarint(frame.type), encodeVarint(frame.payload.length), frame.payload);
  }

  return Buffer.concat(chunks);
}

/**
 * Decode a capture binary back into the inbound-message sequence {@link encodeCaptureFrames} produced. Throws when the buffer is truncated mid-frame so a corrupt
 * capture fails loudly rather than silently replaying a partial stream.
 *
 * @param buffer - The capture binary.
 * @returns The decoded inbound messages in order.
 * @throws {@link Error} when a frame's declared length runs past the end of the buffer.
 */
export function decodeCaptureFrames(buffer: Buffer): InboundMessage[] {

  const frames: InboundMessage[] = [];
  let offset = 0;

  while(offset < buffer.length) {

    try {

      // readVarint returns [value, bytesRead], so each result advances the cursor by its own byte count rather than reporting an absolute offset. A buffer truncated
      // mid-varint surfaces here as a read error rather than the length check below; both are wrapped into one truncation error so the caller sees a consistent message.
      const [ type, typeBytes ] = readVarint(buffer, offset);
      const [ length, lengthBytes ] = readVarint(buffer, offset + typeBytes);
      const payloadStart = offset + typeBytes + lengthBytes;
      const end = payloadStart + length;

      if(end > buffer.length) {

        throw new Error("declares " + String(length) + " payload bytes but the buffer ends early");
      }

      frames.push({ payload: buffer.subarray(payloadStart, end), type });
      offset = end;
    } catch(error) {

      throw new Error("Capture is truncated or corrupt: the frame at offset " + String(offset) + " could not be parsed.", { cause: error });
    }
  }

  return frames;
}

/**
 * A transport tee. Wraps an inner {@link TransportLike} and records a copy of every inbound typed message the host pulls off the wire, while delegating every other
 * method (handshake, send, lifecycle) unchanged. Recording at this layer captures the complete decoded session - the handshake responses, discovery, and state
 * updates all flow through the async iterator - regardless of whether the underlying session was encrypted.
 */
export class RecordingTransport implements TransportLike {

  private readonly inner: TransportLike;
  private readonly frames: InboundMessage[];

  /**
   * @param inner - The transport to wrap and delegate to.
   * @param frames - The sink array each inbound message is copied into, in arrival order.
   */
  constructor(inner: TransportLike, frames: InboundMessage[]) {

    this.inner = inner;
    this.frames = frames;
  }

  public get isEncrypted(): boolean {

    return this.inner.isEncrypted;
  }

  public send(type: number, payload: Buffer): Promise<void> {

    return this.inner.send(type, payload);
  }

  public sendNoiseHandshakeFrame(frame: Buffer): Promise<void> {

    return this.inner.sendNoiseHandshakeFrame(frame);
  }

  public enterNoiseHandshake(): void {

    this.inner.enterNoiseHandshake();
  }

  public installCipher(cipher: Parameters<TransportLike["installCipher"]>[0]): void {

    this.inner.installCipher(cipher);
  }

  public firstByte(signal?: AbortSignal): ReturnType<TransportLike["firstByte"]> {

    return this.inner.firstByte(signal);
  }

  public nextNoiseHandshakeFrame(signal?: AbortSignal): Promise<Buffer> {

    return this.inner.nextNoiseHandshakeFrame(signal);
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<InboundMessage, void> {

    for await (const message of this.inner) {

      // We persist a copy of the bytes. The transport hands out subarray views into a recv buffer it may reuse, so retaining the view risks the payload being
      // overwritten before the capture is serialized. The message is recorded as it passes through, then forwarded unchanged to the host.
      this.frames.push({ payload: Buffer.from(message.payload), type: message.type });

      yield message;
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {

    await this.inner[Symbol.asyncDispose]();
  }

  public [Symbol.dispose](): void {

    this.inner[Symbol.dispose]();
  }
}

/**
 * Counters used to mint stable replacement values during PII scrubbing. Each distinct source value maps to a single deterministic replacement so cross-references in
 * the captured metadata stay internally consistent.
 */
interface ScrubCounter {

  next: number;
  readonly seen: Map<string, string>;
}

// Format the low 16 bits of an id as two colon-separated hex bytes (id 258 -> "01:02"). Shared by the MAC and BLE-MAC scrubbers so both render an incrementing suffix.
function macSuffix(id: number): string {

  return ((id >> 8) & 0xFF).toString(16).padStart(2, "0") + ":" + (id & 0xFF).toString(16).padStart(2, "0");
}

// Resolve (or mint) a replacement for a source value through a counter, formatting the nth distinct value via `format`.
function scrubValue(counter: ScrubCounter, value: string, format: (id: number) => string): string {

  const existing = counter.seen.get(value);

  if(existing !== undefined) {

    return existing;
  }

  const replacement = format(counter.next++);

  counter.seen.set(value, replacement);

  return replacement;
}

/**
 * Scrub personally-identifying fields from a device-info record for the capture metadata. MAC and Bluetooth-MAC addresses, the device name, and the friendly name are
 * replaced with stable synthetic values so captures can be shared as fixtures without leaking a real device's identity. The mapping is deterministic within one
 * record, so a name that also appears as a friendly name scrubs to the same replacement.
 *
 * @param info - The device-info record to scrub, or `null` when none was received.
 * @returns A scrubbed shallow copy, or `null` when the input was `null`.
 */
export function scrubDeviceInfo(info: Nullable<DeviceInfo>): Nullable<Record<string, unknown>> {

  if(!info) {

    return null;
  }

  const macCounter: ScrubCounter = { next: 1, seen: new Map() };
  const bleMacCounter: ScrubCounter = { next: 1, seen: new Map() };
  const hostCounter: ScrubCounter = { next: 1, seen: new Map() };
  const scrubbed: Record<string, unknown> = { ...info };

  if(typeof scrubbed["macAddress"] === "string") {

    scrubbed["macAddress"] = scrubValue(macCounter, scrubbed["macAddress"], (id) => "00:00:00:00:" + macSuffix(id));
  }

  if(typeof scrubbed["bluetoothMacAddress"] === "string") {

    // Locally-administered range: the second nibble of the first byte is 2, 6, A, or E. We use 02 so a scrubbed BLE MAC is visibly synthetic.
    scrubbed["bluetoothMacAddress"] = scrubValue(bleMacCounter, scrubbed["bluetoothMacAddress"], (id) => "02:00:00:00:" + macSuffix(id));
  }

  if(typeof scrubbed["name"] === "string") {

    scrubbed["name"] = scrubValue(hostCounter, scrubbed["name"], (id) => "device-" + String(id));
  }

  if(typeof scrubbed["friendlyName"] === "string") {

    scrubbed["friendlyName"] = scrubValue(hostCounter, scrubbed["friendlyName"], (id) => "device-" + String(id));
  }

  return scrubbed;
}

/**
 * Record a live device session to a capture file. Opens a connection to the device, wraps its transport in a {@link RecordingTransport}, captures every inbound
 * message for `durationMs`, then writes the capture binary and its scrubbed metadata file. The metadata path is the binary path with its extension replaced by
 * `.json`.
 *
 * @param options - Connection, output, and timing options.
 * @returns A summary of the capture written.
 */
export async function recordCapture(options: RecordCaptureOptions): Promise<CaptureSummary> {

  const logger = options.logger ?? SILENT_LOGGER;
  const frames: InboundMessage[] = [];

  // `await using` disposes the connection on every exit path, including a throw during the capture window. The host owns the port default, so we forward `port` only
  // when the caller set one rather than restating 6053 here.
  await using client = await openEspHomeClient({

    host: options.host,
    keepAlive: false,
    logger,
    ...((options.port !== undefined) && { port: options.port }),
    psk: options.psk ?? null,
    reconnect: false,

    // The factory receives the client's fully-resolved open options (host, port, log, frame/buffer limits, metrics, signal), so the tee wraps Transport.open(options)
    // with the client's own configuration - there is no second copy of any transport setting here to drift from the client's.
    transportFactory: async (transportOptions: TransportOpenOptions): Promise<TransportLike> => new RecordingTransport(await Transport.open(transportOptions), frames)
  });

  await delay(options.durationMs ?? DEFAULT_DURATION_MS);

  // Snapshot the device info while the connection is still live (it is disposed on scope exit).
  const deviceInfo = scrubDeviceInfo(client.deviceInfo());
  const binary = encodeCaptureFrames(frames);
  const metadataPath = options.outputPath.replace(/\.bin$/, ".json");
  const metadata: CaptureMetadata = {

    capturedAt: new Date().toISOString(),
    description: "Real-device capture.",
    deviceInfo,
    expectedFrames: frames.length,
    scenario: options.scenario ?? "real-device",
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    source: "real-device"
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, binary);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  return { binaryPath: options.outputPath, byteLength: binary.length, frameCount: frames.length, metadataPath };
}

/**
 * Reads a capture file, decodes it, and delegates to {@link replayCaptureFrames}.
 *
 * @param options - The capture path and optional logger.
 * @returns A summary of what the host observed during replay.
 * @throws {@link Error} when the capture has frames but lacks the `LIST_ENTITIES_DONE_RESPONSE` that bounds discovery.
 */
export async function replayCapture(options: ReplayCaptureOptions): Promise<ReplaySummary> {

  const binary = await readFile(options.binaryPath);
  const frames = decodeCaptureFrames(binary);

  return replayCaptureFrames(frames, options.logger);
}

/**
 * Replay a captured session through a {@link MockTransport} into a real {@link EspHomeClient}, driving the host through a full connect and
 * reporting what it observed. The captured decoded stream is presented as a plaintext session (a `0x00` indicator byte followed by each typed message in order), which
 * is why a capture of an originally-encrypted session replays without any cipher state.
 *
 * The stream is split at the first run-phase state frame (the schema-derived {@link STATE_MESSAGE_TYPES} boundary): every setup frame the connect consumes - the
 * handshake, the full `LIST_ENTITIES_*` discovery sequence, the done sentinel, and a late `DEVICE_INFO_RESPONSE` a real device sends after the sentinel - is queued
 * before {@link openEspHomeClient}, then a telemetry listener is attached and the remaining run-phase state frames are queued so their decoded events are observed.
 * Splitting at `LIST_ENTITIES_DONE_RESPONSE` instead would strand a post-done device-info frame in the run slice and block discovery forever. A capture with no
 * `LIST_ENTITIES_DONE_RESPONSE` cannot drive a connect and is rejected; an empty capture is reported as a no-op rather than attempting a connection.
 *
 * @param frames - The ordered inbound messages to drive through the host.
 * @param logger - An optional logger; the silent logger is used when none is supplied.
 * @returns A summary of what the host observed during replay.
 * @throws {@link Error} when the capture has frames but lacks the `LIST_ENTITIES_DONE_RESPONSE` that bounds discovery.
 */
export async function replayCaptureFrames(frames: readonly InboundMessage[], logger: EspHomeLogging = SILENT_LOGGER): Promise<ReplaySummary> {

  if(frames.length === 0) {

    return { deviceName: null, entityCount: 0, frameCount: 0, telemetryEventCount: 0 };
  }

  const doneIndex = frames.findIndex((frame) => frame.type === MessageType.LIST_ENTITIES_DONE_RESPONSE);

  if(doneIndex < 0) {

    throw new Error("Capture has no LIST_ENTITIES_DONE_RESPONSE frame, so it cannot drive a connect. Re-record it with `espc record`.");
  }

  // Split at the first run-phase state frame, NOT at LIST_ENTITIES_DONE_RESPONSE: a real device sends DEVICE_INFO_RESPONSE after the done sentinel, and discovery
  // (performDiscovery) needs both, so every discovery frame must stay in the setup slice the connect consumes. STATE_MESSAGE_TYPES is the schema-derived SSOT for the
  // run-phase boundary. A capture with no state frames is all-setup (discovery-only, zero telemetry).
  const firstStateIndex = frames.findIndex((frame) => STATE_MESSAGE_TYPES.has(frame.type));
  const setupEnd = firstStateIndex < 0 ? frames.length : firstStateIndex;
  const transport = new MockTransport();

  // Present the decoded stream as a plaintext session: the plaintext indicator byte, then the setup frames the handshake and discovery consume.
  transport.pushFirstByte(ProtocolByte.PLAINTEXT);

  for(const frame of frames.slice(0, setupEnd)) {

    transport.pushInbound(frame.type, frame.payload);
  }

  // A synchronous `using` dispose is correct for an offline replay: there is no live peer, so we tear the client down with a plain TCP-style close rather than the async
  // graceful disconnect (a DISCONNECT_REQUEST plus a wait for a DISCONNECT_RESPONSE the peerless MockTransport can never send, which would stall the disposal until its
  // timeout). The telemetry has already been counted in the body before this scope exits, and `using` still disposes on every exit path including a throw.
  using client = await openEspHomeClient({

    connectTimeoutMs: REPLAY_CONNECT_TIMEOUT_MS,
    host: "replay",
    keepAlive: false,
    logger,
    maxConstructionRetries: 0,
    psk: null,
    reconnect: false,
    transportFactory: (): MockTransport => transport
  });

  let telemetryEventCount = 0;

  // Attach the telemetry listener before queuing the run-phase frames so every decoded state update is observed. The subscription's lifetime is bounded by the client:
  // `using` disposes the client on scope exit, and no telemetry can fire after that, so the listener needs no separate disposal.
  client.on("telemetry", (): void => { telemetryEventCount++; });

  for(const frame of frames.slice(setupEnd)) {

    transport.pushInbound(frame.type, frame.payload);
  }

  // Wait deterministically until the host has pulled every queued frame and parked awaiting more. Because run-phase decode and telemetry emission are synchronous, the
  // host's per-frame side effects have all run by the time it parks, so the counts below are exact - no timer race.
  await transport.whenIdle();

  return {

    deviceName: client.deviceInfo()?.name ?? null,
    entityCount: client.getEntitiesWithIds().length,
    frameCount: frames.length,
    telemetryEventCount
  };
}
