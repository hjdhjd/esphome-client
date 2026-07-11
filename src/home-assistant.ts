/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * home-assistant.ts: Single-source-of-truth module for the ESPHome Home-Assistant-bridge surface (inbound dispatchers + outbound subscribe-and-respond + the
 * bridged event payload types).
 */

/**
 * Authoritative coordinator for the Home-Assistant-bridge protocol surface.
 *
 * @remarks ESPHome devices delegate Home-Assistant-side actions back through the API client - typically as part of `homeassistant.action` calls baked into the device's
 * YAML config or `on_value` triggers that reference Home Assistant entity state. The library exposes both halves of that conversation:
 *
 * - **Inbound**: the device fires `HOMEASSISTANT_SERVICE_RESPONSE` (a request to invoke a Home Assistant service) or `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE` (a request
 *   for a Home Assistant entity's current state). Decoded by {@link dispatchHomeassistantService} / {@link dispatchHomeAssistantStateRequest}, fanned out via the
 *   `EventBus` as `homeassistantService` / `homeassistantStateRequest`.
 * - **Outbound**: the consumer subscribes the device to either feed via {@link HomeAssistantApi.subscribeServices} / {@link HomeAssistantApi.subscribeStates}, then
 *   answers state requests via {@link HomeAssistantApi.sendState}.
 *
 * Both halves share the concerns enumerated below: the `EventBus` (where decoded events fan out and where outbound debug breadcrumbs flow), the {@link EspHomeLogging}
 * sink (debug tracing for both directions), and the protobuf field decoder/encoder pipeline. This module owns all of them. Future contributors adding a new HA-bridge
 * message type edit exactly this file plus its co-located test file.
 *
 * The {@link HomeAssistantApi} class composes a narrow {@link HomeAssistantApiHost} seam (`bus`, `log`, `decode`, `send`). It exposes the outbound methods -
 * {@link HomeAssistantApi.subscribeServices}, {@link HomeAssistantApi.subscribeStates}, {@link HomeAssistantApi.sendState}, and {@link HomeAssistantApi.respondToAction}
 * - plus a memoized {@link HomeAssistantApi.inboundContext} accessor that the host forwards into `RunPhaseHost` so the per-message dispatcher avoids per-frame context
 * allocation. The dispatcher entries in `run-phase-handlers` call the module-level {@link dispatchHomeassistantService} / {@link dispatchHomeAssistantStateRequest}
 * functions through that cached context - the inbound and outbound paths converge in this module without either side reaching into host private state.
 *
 * Mirrors the `voice-assistant` module's class-plus-module-level-dispatchers shape: one file owns both the consumer-facing API class and the inbound decode
 * pipeline so the entire HA-bridge protocol surface is documented top-to-bottom in one place.
 *
 * @module home-assistant
 */
import type { FieldValue, ProtoField } from "./protocol/index.ts";
import { encodeProtoFields, extractNumberField, extractRepeatedServiceMap, extractStringField } from "./protocol/index.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import type { EspHomeLogging } from "./types.ts";
import type { EventBus } from "./event-bus.ts";
import { MessageType } from "./protocol/message-types.ts";
import type { SubscriptionLifecycle } from "./reissuable-subscription.ts";
import { WireType } from "./protocol/wire-types.ts";

/**
 * Home Assistant service call event data. Emitted as the `homeassistantService` event when an ESPHome device triggers a `homeassistant.action` or
 * `homeassistant.service` call expecting Home Assistant to execute the action.
 *
 * The optional `callId` field is populated when the device firmware enables the `USE_API_HOMEASSISTANT_ACTION_RESPONSES` preprocessor flag, while `wantsResponse` and
 * `responseTemplate` are populated when the firmware enables `USE_API_HOMEASSISTANT_ACTION_RESPONSES_JSON` (matching the `field_ifdef` annotations on `call_id`,
 * `wants_response`, and `response_template` in api.proto). When `wantsResponse` is `true`, the consumer is expected to call {@link HomeAssistantApi.respondToAction}
 * with the matching `callId` so the device receives the action result. Older firmwares omit these fields; legacy consumers that ignore them remain correct.
 *
 * @property data - Key-value data for the service call.
 * @property dataTemplate - Templated key-value data for the service call.
 * @property isEvent - Whether this is an event (true) or a service call (false).
 * @property service - The service being called (e.g., "notify.html5").
 * @property variables - Variables for template rendering.
 * @property callId - Numeric correlation id for {@link HomeAssistantApi.respondToAction}. Present only when the device firmware enables action responses.
 * @property wantsResponse - When `true`, the device expects a `HOMEASSISTANT_ACTION_RESPONSE` keyed by `callId`. Absent on legacy firmwares.
 * @property responseTemplate - Optional rendering template the device expects the response to follow. Present only when the device firmware enables JSON action
 *   responses.
 */
export interface HomeAssistantServiceEvent {

  callId?: number;
  data: Record<string, string>;
  dataTemplate: Record<string, string>;
  isEvent: boolean;
  responseTemplate?: string;
  service: string;
  variables: Record<string, string>;
  wantsResponse?: boolean;
}

/**
 * Home Assistant state request event data. Emitted as the `homeassistantStateRequest` event when an ESPHome device requests the state of a Home Assistant entity,
 * typically when ESPHome has an `on_value` trigger that references Home Assistant state.
 *
 * @property attribute - The specific attribute being requested (empty string if requesting the main state).
 * @property entityId - The Home Assistant entity ID being requested.
 * @property once - Whether this is a one-time request (true) or a subscription (false).
 */
export interface HomeAssistantStateRequest {

  attribute: string;
  entityId: string;
  once: boolean;
}

/**
 * Decode-and-emit context shared by every Home-Assistant inbound handler. Carries the bus the handlers emit through, the logger they tag debug breadcrumbs to, and the
 * decoder used for nested protobuf payloads (the host injects its own decoder so the per-message field-count cap and warn callback stay consistent).
 *
 * @remarks The {@link HomeAssistantApi} memoizes one of these objects in its constructor and exposes it via {@link HomeAssistantApi.inboundContext}. The host
 * forwards that accessor into the `RunPhaseHost` composition so the per-message dispatcher in `run-phase-handlers` reuses the same
 * cached context for every inbound HA-bridge frame, avoiding per-message allocation.
 *
 * @internal
 */
export interface HomeAssistantInboundContext {

  readonly bus: EventBus<ClientEventsMap>;
  readonly decode: (buffer: Buffer) => Record<number, FieldValue[]>;
  readonly log: EspHomeLogging;
}

/**
 * Narrow seam the {@link HomeAssistantApi} consumes from the host. Mirrors `LogSubscriptionManagerHost` and
 * {@link VoiceAssistantHost} - the bus and logger flow in for both inbound emit and outbound diagnostic, the decoder is reused by the inbound
 * dispatchers, and the synchronous frame-send hook backs the outbound subscribe-and-respond methods. The bridge never reads or writes host private state directly.
 *
 * @property bus - Event bus the inbound dispatchers emit decoded payloads to.
 * @property log - Logger the bridge tags debug breadcrumbs to.
 * @property decode - Bounded protobuf decoder used by the inbound dispatchers (the host injects its own decoder so the per-message field-count cap and warn callback stay
 *   consistent).
 * @property send - Synchronous frame-send hook for the outbound `SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST` / `SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST` /
 *   `HOME_ASSISTANT_STATE_RESPONSE` wires.
 * @internal
 */
export interface HomeAssistantApiHost {

  readonly bus: EventBus<ClientEventsMap>;
  readonly log: EspHomeLogging;
  decode(buffer: Buffer): Record<number, FieldValue[]>;
  send(type: number, payload: Buffer): void;
}

/**
 * Owns the entire Home-Assistant-bridge surface: the outbound subscribe-and-respond wire pipeline plus the memoized inbound-dispatcher context. Constructed once per
 * {@link EspHomeClient}, which exposes this instance directly through its `homeAssistant` getter rather than through client-level delegate methods.
 *
 * @remarks The bridge's four outbound methods ({@link HomeAssistantApi.subscribeServices}, {@link HomeAssistantApi.subscribeStates}, {@link HomeAssistantApi.sendState},
 * {@link HomeAssistantApi.respondToAction}) are fire-and-forget by contract: they encode a payload and hand it to the host `send` seam, which routes
 * through the host's `frameAndSend`. Failure modes are surfaced through the transport's existing error path (a disconnected client throws on send via the transport
 * layer; the bridge does not duplicate that detection because doing so would create a second source of truth for connection state). Not every outbound method is an
 * unconditional passthrough: {@link HomeAssistantApi.sendState}'s optional `attribute` argument encodes field 3 only when the caller passes a non-empty string, and
 * {@link HomeAssistantApi.respondToAction}'s `options.errorMessage` / `options.responseData` each encode their field only when the caller supplies a value, matching
 * ESPHome's proto contract for those optional fields.
 *
 * The {@link HomeAssistantApi.inboundContext} accessor returns a frozen object built once at construction time from the seam's `bus`, `log`, and `decode` members.
 * The frozen-and-memoized shape means the per-message dispatch in `run-phase-handlers` performs zero allocations on the inbound HA-bridge hot path.
 */
export class HomeAssistantApi implements SubscriptionLifecycle {

  /**
   * Memoized inbound-dispatcher context. Built once at construction from the seam's bus/log/decode; returned unchanged on every read so the per-message dispatch in
   * `run-phase-handlers` reuses the same object across every inbound HA-bridge frame.
   */
  private readonly cachedInboundContext: HomeAssistantInboundContext;

  /**
   * Narrow host seam (bus, logger, decoder, frame-send hook). Set in the constructor and never reassigned.
   */
  private readonly host: HomeAssistantApiHost;

  /**
   * PRESERVED consumer subscription intent for the Home-Assistant services feed. Set by {@link subscribeServices}; never cleared (ESPHome has no unsubscribe). It
   * SURVIVES {@link clearConnectionState} so {@link reissueOnReconnect} can replay `SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST` onto the fresh transport after a reconnect.
   * This is the HA-bridge analogue of the voice-assistant `desired` intent, split into independent per-feed booleans because each HA-bridge subscription is independent.
   */
  private servicesDesired = false;

  /**
   * PRESERVED consumer subscription intent for the Home-Assistant states feed. Set by {@link subscribeStates}; never cleared. Survives {@link clearConnectionState};
   * replayed as `SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST` by {@link reissueOnReconnect} after a reconnect.
   */
  private statesDesired = false;

  /**
   * Construct a bridge bound to a host seam. The seam's `bus`/`log`/`decode` members are captured into the memoized inbound context immediately so the accessor returns
   * the same object identity for the bridge's lifetime.
   *
   * @param host - The host seam (bus, logger, decoder, frame-send hook).
   * @internal
   */
  public constructor(host: HomeAssistantApiHost) {

    this.host = host;

    // Build the inbound-dispatcher context once. Object.freeze guards against accidental mutation by the dispatcher path; the per-message run-phase dispatch reads this
    // object on every inbound HA-bridge frame and would otherwise be one of the only paths in the codebase where mutation of a long-lived shared struct is plausible.
    this.cachedInboundContext = Object.freeze({

      bus: host.bus,
      decode: (buffer: Buffer): Record<number, FieldValue[]> => host.decode(buffer),
      log: host.log
    });
  }

  /**
   * Read the memoized inbound-dispatcher context. The host forwards this accessor into `RunPhaseHost` at construction time so the
   * per-message dispatcher in `run-phase-handlers` reuses one cached context across every inbound `HOMEASSISTANT_SERVICE_RESPONSE` /
   * `SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE` frame.
   *
   * @returns The frozen inbound context built at construction time.
   */
  public get inboundContext(): HomeAssistantInboundContext {

    return this.cachedInboundContext;
  }

  /**
   * Subscribe to Home Assistant service calls from the ESPHome device. When subscribed, consumers receive `homeassistantService` events whenever the device triggers a
   * `homeassistant.action` or `homeassistant.service` call in its ESPHome configuration. ESPHome has no unsubscribe message in the protocol; the subscription lives until
   * the connection drops.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#home-assistant-services}
   *
   */
  public subscribeServices(): void {

    // Record the consumer intent before sending so reissueOnReconnect can replay it after a reconnect; then issue the wire subscribe.
    this.servicesDesired = true;
    this.sendSubscribeServices();
  }

  /**
   * Subscribe to Home Assistant state requests from the ESPHome device. When subscribed, consumers receive `homeassistantStateRequest` events whenever the device wants
   * to import the state of a Home Assistant entity. ESPHome has no unsubscribe message in the protocol; the subscription lives until the connection drops.
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#home-assistant-state-bridge}
   *
   */
  public subscribeStates(): void {

    this.statesDesired = true;
    this.sendSubscribeStates();
  }

  /**
   * Issue the wire `SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST`. The single source of truth for the services subscribe frame, shared by {@link subscribeServices} (first
   * subscribe) and {@link reissueOnReconnect} (post-reconnect replay).
   */
  private sendSubscribeServices(): void {

    this.host.log.debug("Subscribing to Home Assistant services.");

    // SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST has no payload fields; an empty buffer satisfies the wire format.
    this.host.send(MessageType.SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST, Buffer.alloc(0));
  }

  /**
   * Issue the wire `SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST`. The single source of truth for the states subscribe frame, shared by {@link subscribeStates} and
   * {@link reissueOnReconnect}.
   */
  private sendSubscribeStates(): void {

    this.host.log.debug("Subscribing to Home Assistant state requests.");

    // SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST has no payload fields; an empty buffer satisfies the wire format.
    this.host.send(MessageType.SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST, Buffer.alloc(0));
  }

  /**
   * Reset ONLY connection-scoped state, called by the host at the disconnect boundary and again at connect-top via the `SubscriptionLifecycle` contract. The
   * HA-bridge holds NO connection-scoped wire or cache state - its subscriptions are fire-and-forget and its inbound-dispatch context is connection-independent - so
   * there is nothing to reset here. The desired-intent booleans are deliberately PRESERVED (clearing them would be the reconnect-drops-the-subscription bug this
   * contract prevents); {@link reissueOnReconnect} replays them. This empty body is the correct implementation, not a stub.
   */
  public clearConnectionState(): void {

    // Intentionally empty: see the doc comment. The HA-bridge has no connection-scoped state to clear, and the desired intent must survive a reconnect.
  }

  /**
   * Replay the preserved subscription intents onto the fresh transport, called by the host on `connect()` at connect-bottom via the `SubscriptionLifecycle`
   * contract after the new transport is up. Re-issues the services and/or states subscribe frames for whichever feeds the consumer subscribed to; a pure no-op when
   * neither is desired. This is what keeps a HA-bridge consumer receiving `homeassistantService` / `homeassistantStateRequest` events across an auto-reconnect.
   */
  public reissueOnReconnect(): void {

    if(this.servicesDesired) {

      this.sendSubscribeServices();
    }

    if(this.statesDesired) {

      this.sendSubscribeStates();
    }
  }

  /**
   * Send a Home Assistant entity state to the ESPHome device. The consumer typically calls this in response to a `homeassistantStateRequest` event whose `entityId` and
   * `attribute` echo back here. The encoded payload matches `api.proto`'s `HomeAssistantStateResponse` (field 1 entity_id, field 2 state, field 3 attribute - the third
   * is omitted when the caller passes an empty string).
   *
   * Usage:
   *
   * {@includeCode ./examples/showcase.ts#home-assistant-state-bridge}
   *
   * @param entityId - The Home Assistant entity ID.
   * @param state - The current state value as a string.
   * @param attribute - The specific attribute (default empty string for the main state).
   *
   */
  public sendState(entityId: string, state: string, attribute = ""): void {

    this.host.log.debug("Sending Home Assistant state - entityId: " + entityId + " | state: " + state + " | attribute: " + attribute);

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from(entityId, "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from(state, "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ];

    // Field 3 (attribute) is optional in api.proto's HomeAssistantStateResponse. We omit it when the caller passes the empty-string default so the encoded payload is
    // byte-identical to ESPHome's expectation for the "main state, no attribute" case. Both branches are exercised in home-assistant.test.ts.
    if(attribute.length > 0) {

      fields.push({ fieldNumber: 3, value: Buffer.from(attribute, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    this.host.send(MessageType.HOME_ASSISTANT_STATE_RESPONSE, encodeProtoFields(fields));
  }

  /**
   * Send a `HOMEASSISTANT_ACTION_RESPONSE` for a prior `homeassistantService` event whose payload carried a `callId` (and `wantsResponse: true`). Encodes the four
   * fields per `api.proto`'s `HomeassistantActionResponse`: field 1 `call_id` (varint), field 2 `success` (bool), field 3 `error_message` (string, omitted when
   * `success` is true and absent on the input), field 4 `response_data` (bytes, omitted when absent).
   *
   * @param callId - The numeric correlation id from the originating service event.
   * @param options - Result data: `success` is required; `errorMessage` should be supplied when `success` is `false`; `responseData` is the optional opaque JSON bytes
   * the device firmware expects when `wantsResponse` was `true` and a `responseTemplate` was supplied.
   */
  public respondToAction(callId: number, options: { errorMessage?: string; responseData?: Buffer; success: boolean }): void {

    this.host.log.debug("Sending Home Assistant action response - callId: " + String(callId) + " | success: " + String(options.success));

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: callId, wireType: WireType.VARINT },
      { fieldNumber: 2, value: options.success ? 1 : 0, wireType: WireType.VARINT }
    ];

    if(options.errorMessage !== undefined) {

      fields.push({ fieldNumber: 3, value: Buffer.from(options.errorMessage, "utf8"), wireType: WireType.LENGTH_DELIMITED });
    }

    if(options.responseData !== undefined) {

      fields.push({ fieldNumber: 4, value: options.responseData, wireType: WireType.LENGTH_DELIMITED });
    }

    this.host.send(MessageType.HOMEASSISTANT_ACTION_RESPONSE, encodeProtoFields(fields));
  }
}

/**
 * Decode a `HomeassistantServiceResponse` payload and emit the resulting `homeassistantService` event. The payload is emitted when the device triggers a
 * `homeassistant.action` or `homeassistant.service` call expecting Home Assistant to execute the action.
 *
 * @param payload - The raw protobuf bytes for the response.
 * @param ctx - Inbound context with bus, log, and nested decoder (memoized by {@link HomeAssistantApi.inboundContext}).
 * @internal
 */
export function dispatchHomeassistantService(payload: Buffer, ctx: HomeAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const service = extractStringField(fields, 1) ?? "";
  const data = extractRepeatedServiceMap(fields, 2, ctx.decode);
  const dataTemplate = extractRepeatedServiceMap(fields, 3, ctx.decode);
  const variables = extractRepeatedServiceMap(fields, 4, ctx.decode);
  const isEvent = extractNumberField(fields, 5) === 1;
  // Action-response correlation fields (firmware-gated, all absent on legacy firmwares): call_id (field 6) is gated by USE_API_HOMEASSISTANT_ACTION_RESPONSES, while
  // wants_response (field 7) and response_template (field 8) are gated by USE_API_HOMEASSISTANT_ACTION_RESPONSES_JSON. Conditional spread so omission stays omission
  // under exactOptionalPropertyTypes rather than degrading to `undefined`.
  const callId = extractNumberField(fields, 6);
  const wantsResponse = extractNumberField(fields, 7) === 1 ? true : undefined;
  const responseTemplate = extractStringField(fields, 8);

  const serviceEvent: HomeAssistantServiceEvent = {

    data,
    dataTemplate,
    isEvent,
    service,
    variables,
    ...((callId !== undefined) && { callId }),
    ...((wantsResponse === true) && { wantsResponse }),
    ...((responseTemplate !== undefined) && { responseTemplate })
  };

  ctx.bus.emit("homeassistantService", serviceEvent);
  ctx.log.debug("Home Assistant service call received - service: " + service + " | isEvent: " + String(isEvent) +
    ((callId !== undefined) ? (" | callId: " + String(callId)) : ""));
}

/**
 * Decode a `SubscribeHomeAssistantStateResponse` payload and emit the resulting `homeassistantStateRequest` event. The payload is emitted when the device requests the
 * state of a Home Assistant entity, typically used when ESPHome has an `on_value` trigger that references Home Assistant state.
 *
 * @param payload - The raw protobuf bytes for the request.
 * @param ctx - Inbound context with bus, log, and nested decoder (memoized by {@link HomeAssistantApi.inboundContext}).
 * @internal
 */
export function dispatchHomeAssistantStateRequest(payload: Buffer, ctx: HomeAssistantInboundContext): void {

  const fields = ctx.decode(payload);
  const entityId = extractStringField(fields, 1) ?? "";
  const attribute = extractStringField(fields, 2) ?? "";
  const once = extractNumberField(fields, 3) === 1;

  const stateRequest: HomeAssistantStateRequest = {

    attribute,
    entityId,
    once
  };

  ctx.bus.emit("homeassistantStateRequest", stateRequest);
  ctx.log.debug("Home Assistant state request received - entityId: " + entityId + " | attribute: " + attribute + " | once: " + String(once));
}
