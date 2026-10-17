/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * voice-assistant.ts: Voice-assistant sub-API for the ESPHome client.
 */

/**
 * Voice-assistant sub-API.
 *
 * @remarks Lazy-instantiated single-instance namespace exposed via `client.voiceAssistant`. Carves the voice-assistant entry points off the host class so the
 * file-size budget stays in check. Composes with the host via the narrow {@link VoiceAssistantHost} interface - no reach into private fields, only the bus,
 * the logger, and a synchronous frame-send hook.
 *
 * The sub-API holds two distinct state lifetimes: the PRESERVED consumer subscription intent (including the requested flags), which must survive a reconnect so the
 * device is re-armed automatically, and the connection-scoped state (the cached configuration response, any in-flight announcement, and any pending configuration
 * read), which resets per connection. The connection-scoped half clears via {@link VoiceAssistantApi.clearConnectionState}; the preserved intent is replayed by
 * {@link VoiceAssistantApi.reissueOnReconnect}.
 * Together these satisfy the uniform `SubscriptionLifecycle` contract the host loops over - VA implements it DIRECTLY (a single preserved desired-intent) rather than
 * through the keyed `ReissuableSubscription` multiset, because its request / audio streams are decoupled bus pass-throughs with no
 * per-iterator ledger to reduce.
 *
 * @module voice-assistant
 */
import type {
  ClientEventsMap, VoiceAssistantAudioData, VoiceAssistantAudioSettings, VoiceAssistantConfiguration, VoiceAssistantEventData, VoiceAssistantRequest,
  VoiceAssistantTimerEventData, VoiceAssistantWakeWord
} from "./esphome-client.ts";
import type { EspHomeLogging, Nullable } from "./types.ts";
import type { EventBus, StreamOptions } from "./event-bus.ts";
import type { FieldValue, ProtoField } from "./protocol/index.ts";
import { MessageType, WireType, encodeProtoFields, extractNumberField, extractStringField, extractTelemetryValue } from "./protocol/index.ts";
import type { VoiceAssistantEvent, VoiceAssistantSubscribeFlag } from "./api-constants.ts";
import { Buffer } from "node:buffer";
import { ConnectionError } from "./errors.ts";
import { Correlator } from "./correlator.ts";
import { ReadableStream } from "node:stream/web";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";

/**
 * Correlation key for the single in-flight {@link VoiceAssistantApi.announce} slot. The device's `VoiceAssistantAnnounceFinished` reply carries no per-call identity,
 * so every announcement shares this one key.
 */
const ANNOUNCE_KEY = "announce";

/**
 * Build the rejection an awaited voice-assistant request settles with when its timeout or its caller's signal ends it: a `DOMException` named `AbortError` whose
 * `cause` is the originating reason.
 *
 * @param message - The error message, naming the request and how far it got.
 * @param cause - The originating reason: the timeout's `TimeoutError` or the caller signal's abort reason.
 * @returns The `AbortError` carrying `cause`.
 */
function abortError(message: string, cause: unknown): DOMException {

  const error = new DOMException(message, "AbortError");

  // The DOM lib types DOMException's constructor without the options bag that carries `cause`, so we install it with the descriptor `Error` gives its own `cause`:
  // writable and configurable but not enumerable, which keeps the error's inspected and serialized shape standard.
  Object.defineProperty(error, "cause", { configurable: true, value: cause, writable: true });

  return error;
}

/**
 * Compose the signal a voice-assistant request waits under: a timeout of `timeoutMs` (5000ms when omitted), joined by the caller's `signal` when one is supplied.
 * The composite aborts with the reason of whichever source fires first, the timeout's `TimeoutError` or the caller's own reason, which becomes the `cause` of the
 * request's abort rejection.
 *
 * @param options - The caller's optional `signal` and `timeoutMs`.
 * @returns The composed timeout-and-caller signal.
 */
function requestSignal(options?: { signal?: AbortSignal; timeoutMs?: number }): AbortSignal {

  const sources: AbortSignal[] = [AbortSignal.timeout(options?.timeoutMs ?? 5000)];

  if(options?.signal) {

    sources.push(options.signal);
  }

  return AbortSignal.any(sources);
}

/**
 * Narrow interface the host implements for the voice-assistant sub-API. The sub-API never touches host private fields directly.
 *
 * @internal
 */
export interface VoiceAssistantHost {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;
  send(type: number, payload: Buffer): void;
}

/**
 * Options accepted by {@link VoiceAssistantApi.announce}. Mirrors the wire-side `VoiceAssistantAnnounceRequest`.
 */
export interface VoiceAssistantAnnounceOptions {

  conversationId?: string;
  mediaId?: string;
  preannounceMediaId?: string;
  startConversation?: boolean;
  text?: string;
}

/**
 * Voice-assistant sub-API. Single instance per client; created lazily on first access.
 */
export class VoiceAssistantApi implements SubscriptionLifecycle {

  private readonly host: VoiceAssistantHost;

  /**
   * The PRESERVED consumer subscription intent, including the originally-requested {@link VoiceAssistantSubscribeFlag} bits. `null` means no subscription is desired;
   * a non-null record means a {@link subscribe} call requested the device-side subscription with those flags. Set by {@link subscribe}, cleared by {@link unsubscribe}.
   * Critically, it SURVIVES {@link clearConnectionState} (a reconnect must not silently drop the consumer's voice-assistant subscription); {@link reissueOnReconnect}
   * replays it onto the fresh transport with the same flags. This is the voice-assistant analogue of the multiset sub-APIs' preserved subscriber ledger, collapsed to a
   * single desired-intent because VA has no per-iterator multiset.
   */
  private desired: Nullable<{ flags: VoiceAssistantSubscribeFlag }> = null;

  /**
   * Cached most-recent {@link VoiceAssistantConfiguration} response. Populated on the first {@link configuration} call (or any inbound configuration event); cleared on
   * connection reset.
   */
  private cachedConfig: Nullable<VoiceAssistantConfiguration> = null;

  /**
   * The single in-flight {@link announce} slot, keyed by `ANNOUNCE_KEY` and resolved by the `voiceAssistantAnnounceFinished` listener the constructor installs.
   * Connection-scoped: {@link clearConnectionState} rejects a pending announcement with an `AbortError`.
   */
  private readonly announceCorrelator = new Correlator<boolean>();

  /**
   * Ends the {@link configuration} reads pending on the current connection. Each read composes this controller's signal into its wait for the reply, and
   * {@link clearConnectionState} aborts it with a cause-less `AbortError` and installs a fresh controller, so a teardown settles every read issued before it and none
   * issued after. Overlapping reads each wait on the bus for the next configuration reply rather than holding a correlator slot, so one connection-scoped signal is
   * what reaches all of them.
   */
  private teardownController = new AbortController();

  /**
   * Constructs the sub-API. The host argument carries the bus, logger, and send hook; the sub-API does not store or read other host state.
   *
   * @internal
   */
  public constructor(host: VoiceAssistantHost) {

    this.host = host;

    // Cache configuration responses so subsequent reads can resolve synchronously without re-issuing the wire request.
    this.host.bus.on("voiceAssistantConfiguration", (config): void => { this.cachedConfig = config; });

    // Settle the pending announcement from each finished reply. Consumers still receive the bus event as emitted; a reply that finds nothing pending arrived after its
    // call timed out or was aborted, or was never requested, so we note it at debug and leave it at that.
    this.host.bus.on("voiceAssistantAnnounceFinished", (success): void => {

      if(!this.announceCorrelator.resolve(ANNOUNCE_KEY, success)) {

        this.host.log.debug("Received VoiceAssistantAnnounceFinished with no announcement in flight; the reply is late or unsolicited.");
      }
    });
  }

  /**
   * Reset ONLY connection-scoped state. Called by the host at the disconnect boundary and again at connect-top via the `SubscriptionLifecycle` contract. Rejects
   * a pending {@link announce} and every pending {@link configuration} read with an `AbortError` (an in-flight request cannot outlive the connection it was issued
   * on), and clears the cached configuration the device re-pushes on a fresh connection. It deliberately does NOT touch `desired`: the consumer subscription intent
   * (including its flags) is PRESERVED across the reconnect cycle so {@link reissueOnReconnect} re-arms the device with the originally-requested flags. Clearing the
   * intent here would be the precise reconnect-drops-the-subscription bug this split exists to prevent.
   */
  public clearConnectionState(): void {

    this.announceCorrelator.rejectAll(new DOMException("The connection was torn down before the voice-assistant announcement finished.", "AbortError"));

    // The abort settles every read composed with this controller's signal before we return. The replacement is what a read issued after this call composes, so the
    // teardown never reaches it.
    this.teardownController.abort(new DOMException("The connection was torn down before the voice-assistant configuration read finished.", "AbortError"));
    this.teardownController = new AbortController();

    this.cachedConfig = null;
  }

  /**
   * Replay the preserved desired subscription onto the fresh transport. Called by the host on `connect()` at connect-bottom via the `SubscriptionLifecycle`
   * contract, after the new transport is up. Re-sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with the originally-requested flags when a subscription is desired, mirroring
   * the other sub-APIs' reissue path; a pure no-op when no subscription is desired (`desired` is `null`).
   */
  public reissueOnReconnect(): void {

    if(this.desired !== null) {

      this.sendSubscribe(this.desired.flags);
    }
  }

  /**
   * Subscribe to voice-assistant requests at the device. Sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with `subscribe=1` plus the supplied flag bits.
   *
   * @remarks After subscribing, the device may send `VoiceAssistantRequest` frames with `start=true` to begin a pipeline. The client must respond to each one via
   * {@link VoiceAssistantApi.respondToRequest} - either accepting the pipeline (default, API audio) or declining. Pipelines may stall on the device side if the
   * response is not sent.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant}
   *
   * @param flags - Subscription flags. Defaults to 0 (no audio routing).
   *
   */
  public subscribe(flags: VoiceAssistantSubscribeFlag = 0): void {

    this.host.log.debug("Voice assistant: subscribe with flags " + String(flags) + ".");

    // Record the consumer intent INCLUDING the requested flags before sending. This is the preserved desired-state {@link reissueOnReconnect} replays after a reconnect,
    // so a parked consumer keeps its voice-assistant subscription with the same flags across the transport swap.
    this.desired = { flags };
    this.sendSubscribe(flags);
  }

  /**
   * Unsubscribe from voice-assistant requests. Sends `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` with `subscribe=0` and clears the preserved `desired` intent so a
   * subsequent {@link reissueOnReconnect} is a no-op (the consumer no longer wants the subscription).
   */
  public unsubscribe(): void {

    this.host.log.debug("Voice assistant: unsubscribe.");

    // Clear the preserved intent first: the consumer no longer wants the subscription, so a future reconnect must not re-arm the device.
    this.desired = null;

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Emit the `SUBSCRIBE_VOICE_ASSISTANT_REQUEST(subscribe=1)` wire frame with the supplied flag bits. Shared by {@link subscribe} (records intent then sends) and
   * {@link reissueOnReconnect} (replays the preserved flags after a reconnect), so the encoded frame is identical on both paths and cannot drift.
   *
   * @param flags - The subscription flag bits to encode into field 2.
   */
  private sendSubscribe(flags: VoiceAssistantSubscribeFlag): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 2, value: flags, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST, encodeProtoFields(fields));
  }

  /**
   * Async-iterable view of inbound `voiceAssistantRequest` events. Yields one entry per device-side request (wake-word activation, conversation start, etc).
   *
   * @remarks Each `start=true` request expects an outbound acknowledgement via {@link VoiceAssistantApi.respondToRequest}. The consumer decides per-request whether
   * to accept the pipeline (default, API audio), accept with UDP audio on a consumer-owned port, or decline.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-respond}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<VoiceAssistantRequest>`.
   *
   */
  public requests(options?: StreamOptions): AsyncIterable<VoiceAssistantRequest> {

    return this.host.bus.stream("voiceAssistantRequest", options);
  }

  /**
   * Async-iterable view of inbound `voiceAssistantAudio` events. Each entry is one audio chunk; the `end` flag marks the last chunk in a stream.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns An `AsyncIterable<VoiceAssistantAudioData>`.
   *
   */
  public audio(options?: StreamOptions): AsyncIterable<VoiceAssistantAudioData> {

    return this.host.bus.stream("voiceAssistantAudio", options);
  }

  /**
   * Web Streams adapter for {@link audio}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#web-streams-interop}
   *
   * @param options - Optional backpressure policy and cancellation signal.
   * @returns A `ReadableStream<VoiceAssistantAudioData>`.
   *
   */
  public audioReadable(options?: StreamOptions): ReadableStream<VoiceAssistantAudioData> {

    return ReadableStream.from(this.audio(options));
  }

  /**
   * Respond to an inbound {@link VoiceAssistantRequest} by sending `VoiceAssistantResponse` (wire id 91) to the device. The device sends a request with `start=true`
   * when it wants to begin a voice pipeline; the device expects the client to acknowledge before proceeding. Three semantic forms:
   *
   * - **Accept with API audio (default).** Pass no arguments. Equivalent to `{ port: 0, error: false }`. The device routes audio over the API channel (wire message
   *   `VoiceAssistantAudio`, id 106), which {@link VoiceAssistantApi.audio} iterates. This is the path most consumers take and matches the `API_AUDIO` subscribe flag.
   * - **Accept with UDP audio.** Pass `{ port: N }`. The device sends audio packets to UDP port N. This library is the transport for the ESPHome API only and
   *   does not receive UDP audio; the consumer implements the UDP listener separately (e.g., via `node:dgram`).
   * - **Decline.** Pass `{ error: true }`. The device aborts the pipeline; no audio is streamed in either direction. Use this when the client cannot (or chooses not
   *   to) handle the request - transient capacity, policy rejection, configuration mismatch, etc.
   *
   * The method does not enforce semantic constraints on the wire frame - `{ port: N, error: true }` encodes both. It also does not gate on subscription state;
   * calling without a prior {@link subscribe} encodes-and-sends, and the device discards unsolicited responses.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-respond}
   *
   * @param options - Optional response shape; defaults to `{ port: 0, error: false }` (the API-audio acceptance case).
   *
   */
  public respondToRequest(options?: { error?: boolean; port?: number }): void {

    const port = options?.port ?? 0;
    const error = options?.error ?? false;

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: port, wireType: WireType.VARINT },
      { fieldNumber: 2, value: error ? 1 : 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.VOICE_ASSISTANT_RESPONSE, encodeProtoFields(fields));
  }

  /**
   * Send a single audio chunk to the device. Mirrors the wire-side `VoiceAssistantAudio` message.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-streaming}
   *
   * @param audioData - The audio bytes to send.
   * @param end - Whether this is the last chunk in the stream.
   *
   */
  public sendAudio(audioData: Buffer, end = false): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: audioData, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: end ? 1 : 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.VOICE_ASSISTANT_AUDIO, encodeProtoFields(fields));
  }

  /**
   * Send a voice-assistant pipeline event back to the device. Mirrors the wire-side `VoiceAssistantEventResponse` message.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-streaming}
   *
   * @param eventType - The pipeline event kind.
   * @param data - Optional event data payload.
   *
   */
  public sendEvent(eventType: VoiceAssistantEvent, data: VoiceAssistantEventData[] = []): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: eventType, wireType: WireType.VARINT }
    ];

    for(const entry of data) {

      const nestedFields: ProtoField[] = [

        { fieldNumber: 1, value: Buffer.from(entry.name, "utf8"), wireType: WireType.LENGTH_DELIMITED },
        { fieldNumber: 2, value: Buffer.from(entry.value, "utf8"), wireType: WireType.LENGTH_DELIMITED }
      ];

      fields.push({ fieldNumber: 2, value: encodeProtoFields(nestedFields), wireType: WireType.LENGTH_DELIMITED });
    }

    this.host.send(MessageType.VOICE_ASSISTANT_EVENT_RESPONSE, encodeProtoFields(fields));
  }

  /**
   * Send a voice-assistant timer event to the device. Mirrors the wire-side `VoiceAssistantTimerEventResponse` message.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-timer}
   *
   * @param timerData - The timer event data.
   *
   */
  public sendTimerEvent(timerData: VoiceAssistantTimerEventData): void {

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: timerData.eventType, wireType: WireType.VARINT },
      { fieldNumber: 2, value: Buffer.from(timerData.timerId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: Buffer.from(timerData.name, "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 4, value: timerData.totalSeconds, wireType: WireType.VARINT },
      { fieldNumber: 5, value: timerData.secondsLeft, wireType: WireType.VARINT },
      { fieldNumber: 6, value: timerData.isActive ? 1 : 0, wireType: WireType.VARINT }
    ];

    this.host.send(MessageType.VOICE_ASSISTANT_TIMER_EVENT_RESPONSE, encodeProtoFields(fields));
  }

  /**
   * Trigger a TTS announcement on the device. Resolves with the success flag from the matching `voiceAssistantAnnounceFinished` event, or rejects on timeout, abort,
   * or disconnect.
   *
   * @remarks One announcement can be in flight at a time. The device's reply carries no per-call identity, so a call made while another is pending throws rather than
   * settling on the other call's reply. The pending slot is claimed before the wire request goes out so a fast device cannot beat it, and a disconnect rejects the
   * pending call at once rather than leaving it to its timeout. A caller signal that is already aborted rejects the call before the in-flight check and sends nothing.
   * The default timeout is 5000ms; supply `awaitOptions.timeoutMs` to override. The composed signal layers the caller's optional `AbortSignal` over the timeout via
   * {@link AbortSignal.any}.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-announce}
   *
   * @param options - The announce request fields.
   * @param awaitOptions - Optional cancellation signal and custom timeout (default 5000ms).
   * @returns A promise that resolves with the success flag from the device's response.
   * @throws ConnectionError with code `ANNOUNCE_IN_FLIGHT` when another announcement is still pending.
   * @throws DOMException named `AbortError` (code `ABORT_ERR`) on timeout or caller-signal abort, including a caller signal already aborted at call time, which sends
   * nothing. The originating reason is carried as the error's `cause`: a `TimeoutError` when the {@link AbortSignal.timeout} elapses, or the caller signal's abort
   * reason.
   * @throws DOMException named `AbortError`, with no `cause`, when the connection is torn down while the announcement is pending.
   *
   */
  public async announce(options: VoiceAssistantAnnounceOptions, awaitOptions?: { signal?: AbortSignal; timeoutMs?: number }): Promise<boolean> {

    // We honor a signal the caller has already aborted before anything else, so the call rejects as cancelled rather than as in flight, claims no slot, and sends
    // nothing.
    if(awaitOptions?.signal?.aborted) {

      throw abortError("The voice-assistant announcement was aborted before it was sent.", awaitOptions.signal.reason);
    }

    if(this.announceCorrelator.pending(ANNOUNCE_KEY)) {

      throw new ConnectionError("A voice-assistant announcement is already in flight; await the previous call before issuing another.", "ANNOUNCE_IN_FLIGHT");
    }

    const fields: ProtoField[] = [];

    if(options.mediaId !== undefined) {

      fields.push({ fieldNumber: 1, value: Buffer.from(options.mediaId, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    if(options.text !== undefined) {

      fields.push({ fieldNumber: 2, value: Buffer.from(options.text, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    if(options.preannounceMediaId !== undefined) {

      fields.push({ fieldNumber: 3, value: Buffer.from(options.preannounceMediaId, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    if(options.startConversation !== undefined) {

      fields.push({ fieldNumber: 4, value: options.startConversation ? 1 : 0, wireType: WireType.VARINT });
    }

    if(options.conversationId !== undefined) {

      fields.push({ fieldNumber: 5, value: Buffer.from(options.conversationId, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    const composedSignal = requestSignal(awaitOptions);

    // We claim the slot before sending: `await` registers its entry synchronously, so a reply delivered before `send` returns (a synchronous mock transport, for one)
    // still finds it.
    const reply = this.announceCorrelator.await(ANNOUNCE_KEY, { signal: composedSignal });

    this.host.send(MessageType.VOICE_ASSISTANT_ANNOUNCE_REQUEST, encodeProtoFields(fields));

    return this.awaitReply({ message: "The voice-assistant announcement was aborted before the device finished it.", reply, signal: composedSignal });
  }

  /**
   * Read the device's voice-assistant configuration. Returns the cached value when `options.refresh` is false (the default) and a configuration has been received;
   * otherwise issues a fresh `VoiceAssistantConfigurationRequest` and resolves on the matching response.
   *
   * @remarks The cache is populated by the inbound `voiceAssistantConfiguration` event listener installed in the constructor, so any prior request (or an unsolicited
   * configuration push from the device) seeds the cache. Pass `refresh: true` to force a fresh request even when a cached value exists. The default timeout is 5000ms;
   * the composed signal layers the caller's optional `AbortSignal` over the timeout via {@link AbortSignal.any}. Overlapping calls that reach the device each send their
   * own request, and every one resolves with the device's configuration. A disconnect rejects every pending read at once rather than leaving it to its timeout, and a
   * read issued after the disconnect waits for a reply of its own.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-configuration}
   *
   * @param options - Optional cancellation signal, custom timeout (default 5000ms), and `refresh` flag (default `false`).
   * @returns A promise that resolves with the configuration record.
   * @throws DOMException named `AbortError` (code `ABORT_ERR`) on timeout or caller-signal abort, including a caller signal already aborted at call time, which sends
   * nothing and rejects even when a cached configuration is available. The originating reason is carried as the error's `cause`: a `TimeoutError` when the
   * {@link AbortSignal.timeout} elapses, or the caller signal's abort reason.
   * @throws DOMException named `AbortError`, with no `cause`, when the connection is torn down while the read is pending.
   *
   */
  public async configuration(options?: { refresh?: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<VoiceAssistantConfiguration> {

    // We honor a signal the caller has already aborted ahead of the cache, so a cancelled read rejects the same way whether or not a configuration has arrived.
    if(options?.signal?.aborted) {

      throw abortError("The voice-assistant configuration read was aborted before it started.", options.signal.reason);
    }

    if(!options?.refresh && this.cachedConfig) {

      return this.cachedConfig;
    }

    const composedSignal = requestSignal(options);

    // We read the teardown signal once, before sending, so the read belongs to the connection it was issued on: a teardown that lands inside `send` installs the next
    // connection's controller, and the wait below must still recognize the signal that settled it.
    const teardown = this.teardownController.signal;
    const reply = this.host.bus.once("voiceAssistantConfiguration", { signal: AbortSignal.any([ composedSignal, teardown ]) });

    this.host.send(MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST, Buffer.alloc(0));

    return this.awaitReply({ message: "The voice-assistant configuration request was aborted before the device answered.", reply, signal: composedSignal, teardown });
  }

  /**
   * Wait for a request's reply and settle an abort in the documented shape. `signal` is the request's composed timeout-and-caller signal; when it ends the wait, the
   * rejection becomes a `DOMException` named `AbortError` whose `cause` is the signal's reason, the timeout's `TimeoutError` or the caller's own reason. `teardown`, when
   * supplied, is the connection-scoped signal {@link clearConnectionState} aborts; when it ends the wait, the rejection is that signal's reason itself, the cause-less
   * `AbortError` a disconnect delivers. Every other rejection passes through unchanged, so the disconnect rejection the announcement's correlator delivers keeps its own
   * shape.
   *
   * @param options - The `message` for the abort rejection, the pending `reply`, the composed `signal` the reply waits under, and the optional `teardown` signal.
   * @returns The reply's value.
   */
  private async awaitReply<T>({ message, reply, signal, teardown }: { message: string; reply: Promise<T>; signal: AbortSignal; teardown?: AbortSignal }): Promise<T> {

    try {

      return await reply;

    } catch(error) {

      /* An abort reaches us in whichever form the reply's primitive rejects with: `Correlator.await` rejects with the signal's reason itself, and `EventBus.once`, which
       * delegates to Node's `events.once`, rejects with Node's own `AbortError` carrying that reason as its `cause`. We match a source's reason by identity, and only
       * once that source has aborted, so the rejection takes the shape of whichever source ended the wait even when another aborts in the same tick...a disconnect's
       * `AbortError` has no `cause`, which an unaborted signal's `undefined` reason would otherwise match.
       */
      const endedBy = (source: AbortSignal): boolean => source.aborted && ((error === source.reason) || ((error instanceof Error) && (error.cause === source.reason)));

      if(endedBy(signal)) {

        throw abortError(message, signal.reason);
      }

      if(teardown && endedBy(teardown)) {

        throw teardown.reason;
      }

      throw error;
    }
  }

  /**
   * Push a new active-wake-word list to the device. Mirrors the wire-side `VoiceAssistantSetConfiguration` message.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#voice-assistant-configuration}
   *
   * @param ids - The wake-word ids to activate. Pass an empty list to clear all active wake words.
   *
   */
  public setActiveWakeWords(ids: readonly string[]): void {

    const fields: ProtoField[] = [];

    for(const id of ids) {

      fields.push({ fieldNumber: 1, value: Buffer.from(id, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    this.host.send(MessageType.VOICE_ASSISTANT_SET_CONFIGURATION, encodeProtoFields(fields));
  }

  /**
   * Whether a device-side subscription is currently desired. Backed by the preserved `desired` intent, so it stays `true` across {@link clearConnectionState}
   * (a reconnect does not drop the subscription) and only returns to `false` after an {@link unsubscribe}.
   */
  public isSubscribed(): boolean {

    return this.desired !== null;
  }

  /**
   * Last-known configuration record. Returns `null` when no configuration has been received since connect.
   */
  public lastConfiguration(): Nullable<VoiceAssistantConfiguration> {

    return this.cachedConfig;
  }

  /**
   * Custom inspector for `console.log(client.voiceAssistant)` clean output.
   */
  public [Symbol.for("nodejs.util.inspect.custom")](_depth: number, options: { stylize: (text: string, style: string) => string }): string {

    return options.stylize("VoiceAssistantApi", "special") + " " + JSON.stringify({

      hasConfig: this.cachedConfig !== null,
      pendingAnnouncements: this.announceCorrelator.size,
      subscribed: this.desired !== null
    });
  }
}

/**
 * Decode-and-emit context shared by every voice-assistant inbound handler. Carries the bus the handlers emit through, the logger they tag debug breadcrumbs to, and
 * the decoder used for nested protobuf payloads (the host injects its own decoder so the per-message field-count cap and warn callback stay consistent).
 *
 * @internal
 */
export interface VoiceAssistantInboundContext {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;
  decode(buffer: Buffer): Record<number, FieldValue[]>;
}

/**
 * Decode a `VoiceAssistantRequest` payload and emit the resulting event on the bus.
 *
 * @param payload - The raw protobuf bytes for the request.
 * @param ctx - Inbound context with bus, log, and nested decoder.
 * @internal
 */
export function dispatchVoiceAssistantRequest(payload: Buffer, ctx: VoiceAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const start = extractNumberField(fields, 1) === 1;
  const conversationId = extractStringField(fields, 2);
  const flags = extractNumberField(fields, 3) ?? 0;

  let audioSettings: VoiceAssistantAudioSettings | undefined;
  const audioSettingsBuffer = fields[4]?.[0];

  if(Buffer.isBuffer(audioSettingsBuffer)) {

    const audioFields = ctx.decode(audioSettingsBuffer);

    audioSettings = {

      autoGain: extractNumberField(audioFields, 2) ?? 0,
      noiseSuppressionLevel: extractNumberField(audioFields, 1) ?? 0,
      // A wire volume of 0 (float 0.0) is ESPHome's "unset" sentinel, so we deliberately use `||` rather than the house-default `??`: 0 must coerce to the unity
      // multiplier (1.0), not be preserved as silence. The `as number` cast is safe because field 3 is always a FIXED32 float on the wire, so extractTelemetryValue
      // decodes it to a number (never a string).
      volumeMultiplier: (extractTelemetryValue(audioFields, 3) as number) || 1.0
    };
  }

  const wakeWordPhrase = extractStringField(fields, 5);

  // Optional fields are conditionally included so absence on the wire becomes absence on the event payload, matching the exactOptionalPropertyTypes contract.
  const event: VoiceAssistantRequest = {

    ...(audioSettings !== undefined ? { audioSettings } : {}),
    ...(conversationId !== undefined ? { conversationId } : {}),
    flags,
    start,
    ...(wakeWordPhrase !== undefined ? { wakeWordPhrase } : {})
  };

  ctx.bus.emit("voiceAssistantRequest", event);
  ctx.log.debug("Voice assistant request - start: " + String(start) + " | conversation: " + String(conversationId) + " | flags: " + String(flags) + ".");
}

/**
 * Decode a `VoiceAssistantAnnounceFinished` payload and emit the resulting event on the bus.
 *
 * @param payload - The raw protobuf bytes for the response.
 * @param ctx - Inbound context with bus, log, and nested decoder.
 * @internal
 */
export function dispatchVoiceAssistantAnnounceFinished(payload: Buffer, ctx: VoiceAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const success = extractNumberField(fields, 1) === 1;

  ctx.bus.emit("voiceAssistantAnnounceFinished", success);
  ctx.log.debug("Voice assistant announce finished - success: " + String(success) + ".");
}

/**
 * Decode a `VoiceAssistantConfigurationResponse` payload and emit the resulting event on the bus.
 *
 * @param payload - The raw protobuf bytes for the response.
 * @param ctx - Inbound context with bus, log, and nested decoder.
 * @internal
 */
export function dispatchVoiceAssistantConfiguration(payload: Buffer, ctx: VoiceAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const availableWakeWords: VoiceAssistantWakeWord[] = [];
  const wakeWordFields = fields[1];

  if(wakeWordFields && Array.isArray(wakeWordFields)) {

    for(const wakeWordBuffer of wakeWordFields) {

      if(Buffer.isBuffer(wakeWordBuffer)) {

        const wakeWordMsg = ctx.decode(wakeWordBuffer);
        const id = extractStringField(wakeWordMsg, 1);
        const wakeWord = extractStringField(wakeWordMsg, 2);
        const trainedLanguages: string[] = [];
        const langFields = wakeWordMsg[3];

        if(langFields && Array.isArray(langFields)) {

          for(const langBuffer of langFields) {

            if(Buffer.isBuffer(langBuffer)) {

              trainedLanguages.push(langBuffer.toString("utf8"));
            }
          }
        }

        if(id && wakeWord) {

          availableWakeWords.push({ id, trainedLanguages, wakeWord });
        }
      }
    }
  }

  const activeWakeWords: string[] = [];
  const activeFields = fields[2];

  if(activeFields && Array.isArray(activeFields)) {

    for(const activeBuffer of activeFields) {

      if(Buffer.isBuffer(activeBuffer)) {

        activeWakeWords.push(activeBuffer.toString("utf8"));
      }
    }
  }

  const maxActiveWakeWords = extractNumberField(fields, 3) ?? 0;
  const config: VoiceAssistantConfiguration = { activeWakeWords, availableWakeWords, maxActiveWakeWords };

  ctx.bus.emit("voiceAssistantConfiguration", config);
  ctx.log.debug("Voice assistant configuration received - available: " + String(availableWakeWords.length) + " | active: " + String(activeWakeWords.length) + " | max: " +
    String(maxActiveWakeWords) + ".");
}

/**
 * Decode a `VoiceAssistantAudio` payload and emit the resulting event on the bus.
 *
 * @param payload - The raw protobuf bytes for the audio chunk.
 * @param ctx - Inbound context with bus, log, and nested decoder.
 * @internal
 */
export function dispatchVoiceAssistantAudio(payload: Buffer, ctx: VoiceAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const data = fields[1]?.[0];

  if(!Buffer.isBuffer(data)) {

    ctx.log.warn("Received voice assistant audio without valid data.");

    return;
  }

  const end = extractNumberField(fields, 2) === 1;

  // Optional second-channel payload from the stereo voice-assistant extension. Carried by firmware that advertises API minor 14 or higher with stereo support;
  // firmware without it sends only `data` (field 1). Surfaced only when the wire actually carries it; consumers reading `audioData.data2` always see `Buffer` or
  // `undefined`, never an empty Buffer that ambiguously stands for "no second channel."
  const data2 = fields[3]?.[0];
  const audioData: VoiceAssistantAudioData = Buffer.isBuffer(data2) ? { data, data2, end } : { data, end };

  ctx.bus.emit("voiceAssistantAudio", audioData);
  ctx.log.debug("Voice assistant audio received - size: " + String(data.length) + " bytes | end: " + String(end) +
    (Buffer.isBuffer(data2) ? " | data2: " + String(data2.length) + " bytes" : "") + ".");
}
