/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.ts: Camera sub-API for the ESPHome client.
 */

/**
 * Camera sub-API.
 *
 * @remarks One instance per camera entity. The host caches instances keyed by branded {@link EntityId}<"camera"> so repeated `client.camera(id)` calls return the same
 * object, giving callers a single stable reference to hold across call sites. Instances persist across reconnects and take part in the host's
 * {@link SubscriptionLifecycle}: each session boundary drops the per-image reassembly buffer and the stream's connection-scoped wire state, and a reconnect sends the
 * stream request again while any stream view is open.
 *
 * Multi-packet image reassembly is owned by this sub-API. The host's run-phase dispatcher decodes one `CameraImageResponse` chunk, resolves the entity-key to the
 * cached `CameraApi` (or constructs one lazily on first chunk), and delegates the chunk via the host-only `acceptChunk` method. The sub-API buffers chunks in a private
 * `imageBuffers` list, concatenates on the `done` flag, and publishes the assembled image through the host's telemetry path, the same one every entity's state takes.
 * {@link CameraApi.snapshot} sends `CAMERA_IMAGE_REQUEST(single=true)` and awaits one image; {@link CameraApi.stream} yields each reassembled image, and the views open
 * on one camera share a single device-side stream.
 *
 * @module camera
 */
import { EMPTY, ReissuableSubscription } from "./reissuable-subscription.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import { MessageType, WireType } from "./protocol/index.ts";
import { Buffer } from "node:buffer";
import type { CameraEvent } from "./schemas/index.ts";
import { CameraStreamClosedError } from "./errors.ts";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { EntityId } from "./entity-id.ts";
import type { EspHomeLogging } from "./types.ts";
import type { ProtoField } from "./protocol/codec.ts";
import { ReadableStream } from "node:stream/web";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";
import { encodeProtoFields } from "./protocol/codec.ts";

/**
 * Narrow interface the host implements for the camera sub-API: the bus (for the snapshot and stream subscriptions), a logger, the telemetry publish hook for reassembled
 * images, and the frame-and-send hook. The per-id filter branches on the branded entity id stamped on every `camera` event, so no friendly-name resolver hook is
 * required.
 *
 * @internal
 */
export interface CameraHost {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;

  /**
   * Maximum byte size of a single reassembled multi-packet image. When the accumulator would exceed this, the in-flight image is dropped and a warning is emitted. See
   * {@link EspHomeClientOptions.maxImageBytes}.
   */
  readonly maxImageBytes: number;

  /**
   * Publish one reassembled image through the host's telemetry path: the latest-state cache write under `id`, then the `telemetry` and `camera` emits, in the order every
   * entity's state follows.
   *
   * @param id - The camera's branded entity id, which keys the cache entry.
   * @param event - The assembled image event.
   */
  publishTelemetry(id: EntityId<"camera">, event: CameraEvent): void;

  send(type: number, payload: Buffer): void;
}

/**
 * The single constant wire key every {@link CameraApi.stream} view of one camera groups under. A camera either streams to the client or it does not, so each instance
 * holds one wire subscription however many views are open. The value is irrelevant; what matters is that every view shares this one key.
 */
const STREAM_CHANNEL = 0;

/**
 * Camera sub-API. Per-id instance.
 */
export class CameraApi implements SubscriptionLifecycle {

  private readonly host: CameraHost;
  private readonly id: EntityId<"camera">;

  /**
   * The device-side stream intent. Every {@link stream} view acquires a unit `true` intent under {@link STREAM_CHANNEL}; the first acquire sends
   * `CAMERA_IMAGE_REQUEST(stream=true)` and the release that drops the last view sends the request with the stream flag cleared, so one view closing never stops the
   * stream another view still reads. The subscriber ledger survives reconnect: {@link clearConnectionState} clears only the wire cache, and {@link reissueOnReconnect}
   * sends the stream request again for the views still open.
   *
   * `CameraImageRequest` carries no entity key, so every request this subscription sends applies to the whole device, while the refcount counts only this instance's
   * views. The two agree only when the device exposes one camera. Nothing in `api.proto` or this library limits a device to one camera, so the per-instance refcount
   * assumes it...on a device with two, each instance would start and stop the device-wide stream on its own count, and the last view of one camera closing would send
   * the stop while the other camera's views are still open.
   */
  private readonly streamSubscription: ReissuableSubscription<number, boolean, boolean>;

  /**
   * Per-instance multi-packet reassembly buffer. ESPHome chunks an image across multiple `CameraImageResponse` frames; we collect chunks here until the device sets
   * `done=true`, then concatenate and publish. {@link clearConnectionState} resets it at both session boundaries - the disconnect teardown and the fresh connect - so any
   * in-flight partial image is dropped at both and never bleeds across a session.
   */
  private imageBuffers: Buffer[] = [];

  /**
   * Running byte total of {@link imageBuffers}, maintained in lockstep so the per-image size can be bounded in O(1) per chunk without re-summing the buffer list on every
   * packet. Reset together with {@link imageBuffers} by {@link resetReassembly}.
   */
  private reassembledBytes = 0;

  /**
   * Constructs a new camera sub-API instance for one entity.
   *
   * @param host - Narrow host interface.
   * @param id - The branded camera id this instance is bound to.
   *
   * @internal
   */
  public constructor(host: CameraHost, id: EntityId<"camera">) {

    this.host = host;
    this.id = id;

    // Each camera's stream is a single wire subscription, so every view groups under the constant STREAM_CHANNEL key with a unit `true` intent. A non-empty subscriber
    // set reduces to `true` (stream on); an empty set reduces to EMPTY, which onChange maps to the request with the stream flag cleared. The primitive preserves the
    // subscriber ledger across reconnect so a parked view survives, while the connection-scoped wire cache resets via clearConnectionState.
    this.streamSubscription = new ReissuableSubscription<number, boolean, boolean>({

      onChange: (_key: number, desired: boolean | typeof EMPTY): void => { this.sendCameraImageRequest({ single: false, stream: desired !== EMPTY }); },
      reduce: (intents: readonly boolean[]): boolean | typeof EMPTY => (intents.length === 0) ? EMPTY : true
    });
  }

  /**
   * Capture one image. Sends `CAMERA_IMAGE_REQUEST(single=true)` and resolves with the reassembled image when the device replies.
   *
   * @remarks Subscribes to the `camera` bus channel before sending the request so a fast device cannot beat the listener. The default timeout is 5000ms; supply
   * `options.timeoutMs` to override. The composed signal layers the caller's optional `AbortSignal` over the timeout via {@link AbortSignal.any}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#camera-snapshot}
   *
   * @param options - Optional cancellation signal and custom timeout (default 5000ms).
   * @returns A promise that resolves with the captured image as a Buffer.
   * @throws Asynchronously - a `DOMException` with name `TimeoutError` when {@link AbortSignal.timeout} fires. When the caller's `options.signal` aborts, the promise
   * rejects with the signal's reason verbatim (typically an `AbortError` DOMException, or the custom reason passed to `AbortController.abort(reason)`).
   * @throws {@link CameraStreamClosedError} with code `STREAM_CLOSED` when the bus stream closes without yielding an image for this camera (typically the
   * transport disconnected mid-snapshot). The error carries the branded {@link CameraStreamClosedError.cameraId} so consumers awaiting multiple cameras can
   * correlate the rejection.
   *
   */
  public async snapshot(options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<Buffer> {

    const timeoutMs = options?.timeoutMs ?? 5000;
    const sources: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];

    if(options?.signal) {

      sources.push(options.signal);
    }

    const composedSignal = AbortSignal.any(sources);
    const stream = this.host.bus.stream("camera", { signal: composedSignal });

    // Issue the request after subscribing so a fast device cannot beat our listener.
    this.sendCameraImageRequest({ single: true, stream: false });

    for await (const event of stream) {

      // Branch on the branded entity id, not the friendly name. The id is always available (it is this instance's constructor argument) and is the exact,
      // collision-free identity of the camera that produced the event. A name-based filter mis-routes when two cameras share a name and falls open - accepting any
      // camera's image - before discovery has resolved this camera's name, so a snapshot raced against connect could return a different camera's frame.
      if(event.entity === this.id) {

        return event.image;
      }
    }

    throw new CameraStreamClosedError("Camera snapshot stream ended before an image arrived for " + this.id + ".", "STREAM_CLOSED", this.id);
  }

  /**
   * Stream images continuously, yielding each reassembled image as it arrives. Iteration ends on signal abort or when the consumer breaks out of the `for await`.
   *
   * The views open on one camera share a single device-side stream: the first view sends `CAMERA_IMAGE_REQUEST(stream=true)`, and a reconnect sends it again while any
   * view is open. Each view releases its share once, on whichever ends it first: the signal aborting, the iterator's `return()` or `throw()` (including a `break` out of
   * `for await`), or the bus ending the stream. The last view to release sends the request with the stream flag cleared. A view abandoned before it is ever iterated
   * still releases when its signal aborts or its `return()` runs.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#camera-stream}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<Buffer>`.
   *
   */
  public stream(options?: StreamOptions): AsyncIterable<Buffer> {

    // We acquire the view's share of the stream when the view is requested, so the acquire always pairs with the close hook's release below...an already-aborted signal
    // or a disposed bus closes the view inside the stream() call, and acquiring first keeps that release from preceding its acquire. The first open view sends the
    // stream request; the send cannot deliver an image synchronously, so the bus listener attaches before the first image can arrive.
    const handle = this.streamSubscription.acquire(STREAM_CHANNEL, true);

    // The bus runs the close hook exactly once, on the stream's first terminal path, so the hook releases the handle directly. The release that drops the last view sends
    // the request with the stream flag cleared, which is best-effort: ESPHome's CameraImageRequest with both flags false is a no-op, and the device-side stream
    // self-terminates when no consumer requests new frames. The selector branches on the branded entity id (see {@link snapshot}) - the exact, always-available identity
    // of the camera that produced the event - and projects each of this camera's events to its image.
    return this.host.bus.stream("camera", {

      ...options,
      onClose: (): void => { this.streamSubscription.release(handle); },
      select: (event: CameraEvent): Buffer | undefined => (event.entity === this.id) ? event.image : undefined
    });
  }

  /**
   * Web Streams adapter for {@link stream}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#web-streams-interop}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns A `ReadableStream<Buffer>`.
   *
   */
  public readable(options?: StreamOptions): ReadableStream<Buffer> {

    return ReadableStream.from(this.stream(options));
  }

  /**
   * Accept one inbound chunk from the host's run-phase dispatcher. Buffers the chunk; on the `done` flag, concatenates the accumulated buffer, clears local state, and
   * publishes the assembled image through the host's telemetry path, which records it as the camera's latest state and emits it on the `telemetry` and `camera`
   * channels, so consumers of `client.on("telemetry", ...)`, `client.on("camera", ...)`, `client.latest(id)`, {@link snapshot}, and {@link stream} all observe the same
   * single event.
   *
   * @param imageData - One protocol-level packet of image bytes.
   * @param done - Whether this is the last chunk of the image.
   * @param name - Friendly entity name stamped on the emitted event.
   * @param key - Numeric entity key from the wire packet, forwarded onto the assembled event so the camera arm of {@link TelemetryEvent} carries the same tags
   * every other arm does.
   *
   * @internal Only the host run-phase dispatcher calls this; consumer code does not.
   */
  public acceptChunk(imageData: Buffer, done: boolean, name: string, key: number): void {

    // Bound the multi-packet reassembly accumulator. A device that streams chunks but never sets `done`, or a `done` frame lost mid-image (leaving a stale prefix the
    // next image would silently concatenate onto), would otherwise grow `imageBuffers` without an application-level limit - the transport's `maxRecvBufferBytes` only
    // bounds the undecoded socket buffer, not this above-transport accumulator. When the running total would exceed `maxImageBytes`, drop the in-flight reassembly and
    // warn so the runaway/corruption is observable rather than silent. A single oversized image is a per-image fault, so we do not tear the connection down.
    this.reassembledBytes += imageData.length;

    if(this.reassembledBytes > this.host.maxImageBytes) {

      this.host.log.warn("Camera image reassembly exceeded the maximum image size; dropping the partial image.",
        { camera: name, maxImageBytes: this.host.maxImageBytes, reassembledBytes: this.reassembledBytes });
      this.resetReassembly();

      return;
    }

    this.imageBuffers.push(imageData);

    if(done) {

      const completeImage = Buffer.concat(this.imageBuffers);

      this.resetReassembly();

      this.host.publishTelemetry(this.id, { entity: this.id, image: completeImage, key, name, type: "camera" });
      this.host.log.debug("Received complete camera image from " + name + " | size: " + String(completeImage.length) + " bytes");

      return;
    }

    this.host.log.debug("Buffering camera image packet from " + name + " | packet size: " + String(imageData.length) +
      " bytes | total packets: " + String(this.imageBuffers.length));
  }

  /**
   * Drop any in-flight multi-packet reassembly state. {@link acceptChunk} calls this when an image completes or overruns the size cap, and {@link clearConnectionState}
   * calls it at both session boundaries - the disconnect teardown and the fresh connect - so partial images that were arriving when the previous session disconnected
   * don't bleed into a subsequent session.
   */
  private resetReassembly(): void {

    this.imageBuffers = [];
    this.reassembledBytes = 0;
  }

  /**
   * Reset ONLY connection-scoped state. Called by the host on every disconnect and again at the top of every connect attempt. Drops the in-flight image reassembly and
   * clears the stream subscription's connection-scoped wire cache (the device starts every fresh connection with no stream). The open {@link stream} views are
   * PRESERVED, so the host's {@link reissueOnReconnect} call after the new connection is up sends the stream request again for them.
   */
  public clearConnectionState(): void {

    this.resetReassembly();
    this.streamSubscription.clearConnectionState();
  }

  /**
   * Re-establish the device-side stream on a fresh connection. Called from the host's `connect()` after the new transport is up. Delegates to the stream subscription's
   * `ReissuableSubscription.reissueOnReconnect`, which sends `CAMERA_IMAGE_REQUEST(stream=true)` iff at least one {@link stream} view is still open, and is a pure no-op
   * when none is.
   */
  public reissueOnReconnect(): void {

    this.streamSubscription.reissueOnReconnect();
  }

  /**
   * Encode and send a `CameraImageRequest` to the device.
   */
  private sendCameraImageRequest(opts: { single: boolean; stream: boolean }): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: opts.single ? 1 : 0, wireType: WireType.VARINT },
      { fieldNumber: 2, value: opts.stream ? 1 : 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.CAMERA_IMAGE_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Custom inspector for `console.log(client.camera(id))` clean output.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    return options.stylize("CameraApi", "special") + " " + JSON.stringify({ id: this.id });
  }
}

// Re-export the inbound event shape so it resolves for consumers who import this module directly; CameraEvent is also re-exported from the package root via
// esphome-client.ts.
export type { CameraEvent };
