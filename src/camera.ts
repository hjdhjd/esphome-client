/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * camera.ts: Camera sub-API for the ESPHome client.
 */

/**
 * Camera sub-API.
 *
 * @remarks One instance per camera entity. The host caches instances keyed by branded {@link EntityId}<"camera"> so repeated `client.camera(id)` calls return the same
 * object, giving callers a single stable reference to hold across call sites. Instances persist across reconnects; only their per-image reassembly buffer
 * is dropped at each session boundary - the host clears it on both the disconnect teardown and the fresh connect.
 *
 * Multi-packet image reassembly is owned by this sub-API. The host's run-phase dispatcher decodes one `CameraImageResponse` chunk, resolves the entity-key to the
 * cached `CameraApi` (or constructs one lazily on first chunk), and delegates the chunk via the host-only `acceptChunk` seam. The sub-API buffers chunks in a private
 * `imageBuffers` list, concatenates on the `done` flag, and emits the assembled image to the bus so existing `client.on("camera", ...)` consumers continue to fire.
 * {@link CameraApi.snapshot} sends `CAMERA_IMAGE_REQUEST(single=true)` and awaits one image; {@link CameraApi.stream} sends `CAMERA_IMAGE_REQUEST(stream=true)` and
 * yields each reassembled image.
 *
 * @module camera
 */
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
import { encodeProtoFields } from "./protocol/codec.ts";

/**
 * Narrow seam the host implements for the camera sub-API: the bus (for emitting reassembled-image events and for the snapshot/stream subscriptions), a logger, and the
 * frame-and-send hook. The per-id filter branches on the branded entity id stamped on every `camera` event, so no friendly-name resolver seam is required.
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

  send(type: number, payload: Buffer): void;
}

/**
 * Camera sub-API. Per-id instance.
 */
export class CameraApi {

  private readonly host: CameraHost;
  private readonly id: EntityId<"camera">;

  /**
   * Per-instance multi-packet reassembly buffer. ESPHome chunks an image across multiple `CameraImageResponse` frames; we collect chunks here until the device sets
   * `done=true`, then concatenate and emit. The host calls {@link CameraApi.resetReassembly} at both session boundaries - the disconnect teardown and the fresh
   * connect - so any in-flight partial image is dropped at both and never bleeds across a session.
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
   * @param host - Narrow host seam.
   * @param id - The branded camera id this instance is bound to.
   *
   * @internal
   */
  public constructor(host: CameraHost, id: EntityId<"camera">) {

    this.host = host;
    this.id = id;
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
   * Stream images continuously. Sends `CAMERA_IMAGE_REQUEST(stream=true)` and yields each reassembled image as it arrives. Iteration ends on signal abort or when the
   * consumer breaks out of the `for await`.
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

    const id = this.id;
    const source = this.host.bus.stream("camera", options);

    // Start and stop arrows capture `this` lexically so the IIFE generator below doesn't need a `this` alias; the branded id is captured into `id` for the same reason.
    const startStream = (): void => this.sendCameraImageRequest({ single: false, stream: true });

    // Best-effort: clear the stream flag when the consumer stops iterating. ESPHome's CameraImageRequest with both flags false is a no-op; the device-side stream
    // self-terminates when no consumer requests new frames.
    const stopStream = (): void => this.sendCameraImageRequest({ single: false, stream: false });

    return (async function *(): AsyncGenerator<Buffer> {

      startStream();

      try {

        for await (const event of source) {

          // Branch on the branded entity id (see {@link snapshot}) - the exact, always-available identity of the camera that produced the event.
          if(event.entity === id) {

            yield event.image;
          }
        }

      } finally {

        stopStream();
      }
    })();
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
   * emits the assembled image on the bus so consumers subscribed via `client.on("camera", ...)`, `client.stream("camera", ...)`, {@link snapshot}, and {@link stream}
   * all observe the same single event.
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

      this.host.bus.emit("camera", { entity: this.id, image: completeImage, key, name, type: "camera" });
      this.host.log.debug("Received complete camera image from " + name + " | size: " + String(completeImage.length) + " bytes");

      return;
    }

    this.host.log.debug("Buffering camera image packet from " + name + " | packet size: " + String(imageData.length) +
      " bytes | total packets: " + String(this.imageBuffers.length));
  }

  /**
   * Drop any in-flight multi-packet reassembly state. Called by the host at both session boundaries - the disconnect teardown and the fresh connect - so partial
   * images that were arriving when the previous session disconnected don't bleed into a subsequent session.
   *
   * @internal Only the host class calls this; consumer code does not.
   */
  public resetReassembly(): void {

    this.imageBuffers = [];
    this.reassembledBytes = 0;
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
