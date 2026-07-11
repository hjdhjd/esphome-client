[**esphome-client**](../README.md)

***

[Home](../README.md) / HomeAssistantApi

# Class: HomeAssistantApi

Owns the entire Home-Assistant-bridge surface: the outbound subscribe-and-respond wire pipeline plus the memoized inbound-dispatcher context. Constructed once per
[EspHomeClient](EspHomeClient.md), which exposes this instance directly through its `homeAssistant` getter rather than through client-level delegate methods.

## Remarks

The bridge's four outbound methods ([HomeAssistantApi.subscribeServices](#subscribeservices), [HomeAssistantApi.subscribeStates](#subscribestates), [HomeAssistantApi.sendState](#sendstate),
[HomeAssistantApi.respondToAction](#respondtoaction)) are fire-and-forget by contract: they encode a payload and hand it to the host `send` seam, which routes
through the host's `frameAndSend`. Failure modes are surfaced through the transport's existing error path (a disconnected client throws on send via the transport
layer; the bridge does not duplicate that detection because doing so would create a second source of truth for connection state). Not every outbound method is an
unconditional passthrough: [HomeAssistantApi.sendState](#sendstate)'s optional `attribute` argument encodes field 3 only when the caller passes a non-empty string, and
[HomeAssistantApi.respondToAction](#respondtoaction)'s `options.errorMessage` / `options.responseData` each encode their field only when the caller supplies a value, matching
ESPHome's proto contract for those optional fields.

The [HomeAssistantApi.inboundContext](#inboundcontext) accessor returns a frozen object built once at construction time from the seam's `bus`, `log`, and `decode` members.
The frozen-and-memoized shape means the per-message dispatch in `run-phase-handlers` performs zero allocations on the inbound HA-bridge hot path.

## Implements

- `SubscriptionLifecycle`

## Accessors

### inboundContext

#### Get Signature

```ts
get inboundContext(): HomeAssistantInboundContext;
```

Read the memoized inbound-dispatcher context. The host forwards this accessor into `RunPhaseHost` at construction time so the
per-message dispatcher in `run-phase-handlers` reuses one cached context across every inbound `HOMEASSISTANT_SERVICE_RESPONSE` /
`SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE` frame.

##### Returns

`HomeAssistantInboundContext`

The frozen inbound context built at construction time.

## Methods

### clearConnectionState()

```ts
clearConnectionState(): void;
```

Reset ONLY connection-scoped state, called by the host at the disconnect boundary and again at connect-top via the `SubscriptionLifecycle` contract. The
HA-bridge holds NO connection-scoped wire or cache state - its subscriptions are fire-and-forget and its inbound-dispatch context is connection-independent - so
there is nothing to reset here. The desired-intent booleans are deliberately PRESERVED (clearing them would be the reconnect-drops-the-subscription bug this
contract prevents); [reissueOnReconnect](#reissueonreconnect) replays them. This empty body is the correct implementation, not a stub.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.clearConnectionState
```

***

### reissueOnReconnect()

```ts
reissueOnReconnect(): void;
```

Replay the preserved subscription intents onto the fresh transport, called by the host on `connect()` at connect-bottom via the `SubscriptionLifecycle`
contract after the new transport is up. Re-issues the services and/or states subscribe frames for whichever feeds the consumer subscribed to; a pure no-op when
neither is desired. This is what keeps a HA-bridge consumer receiving `homeassistantService` / `homeassistantStateRequest` events across an auto-reconnect.

#### Returns

`void`

#### Implementation of

```ts
SubscriptionLifecycle.reissueOnReconnect
```

***

### respondToAction()

```ts
respondToAction(callId, options): void;
```

Send a `HOMEASSISTANT_ACTION_RESPONSE` for a prior `homeassistantService` event whose payload carried a `callId` (and `wantsResponse: true`). Encodes the four
fields per `api.proto`'s `HomeassistantActionResponse`: field 1 `call_id` (varint), field 2 `success` (bool), field 3 `error_message` (string, omitted when
`success` is true and absent on the input), field 4 `response_data` (bytes, omitted when absent).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callId` | `number` | The numeric correlation id from the originating service event. |
| `options` | \{ `errorMessage?`: `string`; `responseData?`: `Buffer`\<`ArrayBufferLike`\>; `success`: `boolean`; \} | Result data: `success` is required; `errorMessage` should be supplied when `success` is `false`; `responseData` is the optional opaque JSON bytes the device firmware expects when `wantsResponse` was `true` and a `responseTemplate` was supplied. |
| `options.errorMessage?` | `string` | - |
| `options.responseData?` | `Buffer`\<`ArrayBufferLike`\> | - |
| `options.success` | `boolean` | - |

#### Returns

`void`

***

### sendState()

```ts
sendState(
   entityId, 
   state, 
   attribute?): void;
```

Send a Home Assistant entity state to the ESPHome device. The consumer typically calls this in response to a `homeassistantStateRequest` event whose `entityId` and
`attribute` echo back here. The encoded payload matches `api.proto`'s `HomeAssistantStateResponse` (field 1 entity_id, field 2 state, field 3 attribute - the third
is omitted when the caller passes an empty string).

Usage:

```ts
export function homeAssistantStateBridgeExample(client: EspHomeClient, lookup: (entity: string, attribute: string) => string): void {

  client.homeAssistant.subscribeStates();

  using sub = client.on("homeassistantStateRequest", (request) => {

    const value = lookup(request.entityId, request.attribute);

    client.homeAssistant.sendState(request.entityId, value, request.attribute);
  });

  void sub;
}
```

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `entityId` | `string` | `undefined` | The Home Assistant entity ID. |
| `state` | `string` | `undefined` | The current state value as a string. |
| `attribute` | `string` | `""` | The specific attribute (default empty string for the main state). |

#### Returns

`void`

***

### subscribeServices()

```ts
subscribeServices(): void;
```

Subscribe to Home Assistant service calls from the ESPHome device. When subscribed, consumers receive `homeassistantService` events whenever the device triggers a
`homeassistant.action` or `homeassistant.service` call in its ESPHome configuration. ESPHome has no unsubscribe message in the protocol; the subscription lives until
the connection drops.

Usage:

```ts
export function homeAssistantServicesExample(client: EspHomeClient): void {

  client.homeAssistant.subscribeServices();

  using sub = client.on("homeassistantService", (event) => {

    void event.service;
    void event.data;
    void event.dataTemplate;
    void event.variables;
    void event.isEvent;
  });

  void sub;
}
```

#### Returns

`void`

***

### subscribeStates()

```ts
subscribeStates(): void;
```

Subscribe to Home Assistant state requests from the ESPHome device. When subscribed, consumers receive `homeassistantStateRequest` events whenever the device wants
to import the state of a Home Assistant entity. ESPHome has no unsubscribe message in the protocol; the subscription lives until the connection drops.

Usage:

```ts
export function homeAssistantStateBridgeExample(client: EspHomeClient, lookup: (entity: string, attribute: string) => string): void {

  client.homeAssistant.subscribeStates();

  using sub = client.on("homeassistantStateRequest", (request) => {

    const value = lookup(request.entityId, request.attribute);

    client.homeAssistant.sendState(request.entityId, value, request.attribute);
  });

  void sub;
}
```

#### Returns

`void`
