[**esphome-client**](../README.md)

***

[Home](../README.md) / ClientMetrics

# Interface: ClientMetrics

Optional metrics interface for observability. Consumers wire this to their backend (StatsD, OpenTelemetry, Prometheus, Datadog, custom) to count frames, time
operations, and gauge state. Tags are passed as a flat record so each backend can shape labels per its conventions.

## Remarks

The library's metric names are designed for low cardinality - they tag by entity TYPE, error CLASS, and result CATEGORY rather than by entity id, error
message, or per-frame state. High-cardinality concerns are consumer-side. The default `metrics: undefined` short-circuits to no overhead at all; consumers who want
metrics pay only the property lookup and function-call cost.

Library-emitted metric names (the contract; additive only across minor versions, breaking only across major):

| Name | Kind | Tags |
|---|---|---|
| `frames.received` | counter | `{ encrypted: "true" \| "false" }` |
| `frames.sent` | counter | `{ encrypted, type }` (where type is MessageType name) |
| `frames.dropped` | counter | `{ reason }` |
| `messages.unknown_type` | counter | `{ type }` (numeric) |
| `connect.attempts` | counter | `{ result: "success" \| "failure" \| "timeout" }` |
| `connect.duration_ms` | timing | `{ encrypted }` |
| `reconnect.attempts` | counter | - |
| `noise.handshake.duration_ms` | timing | - |
| `heartbeat.rtt_ms` | timing | - |
| `heartbeat.stalled` | counter | - |
| `entity.commands.sent` | counter | `{ type }` (entity type) |
| `discovery.entities_found` | gauge | - |
| `discovery.services_found` | gauge | - |

## Methods

### gauge()

```ts
gauge(
   name, 
   value, 
   tags?): void;
```

Set a gauge to a specific value.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The metric name. |
| `value` | `number` | The current gauge value. |
| `tags?` | `Record`\<`string`, `string`\> | Optional flat record of label key/value pairs. |

#### Returns

`void`

***

### increment()

```ts
increment(
   name, 
   by?, 
   tags?): void;
```

Increment a counter. Tag values should be low-cardinality strings; the library never emits high-cardinality tags.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The metric name (dot-separated namespace). |
| `by?` | `number` | Increment value. Defaults to 1. |
| `tags?` | `Record`\<`string`, `string`\> | Optional flat record of label key/value pairs. |

#### Returns

`void`

***

### timing()

```ts
timing(
   name, 
   durationMs, 
   tags?): void;
```

Record a timing measurement.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The metric name. |
| `durationMs` | `number` | Elapsed milliseconds. |
| `tags?` | `Record`\<`string`, `string`\> | Optional flat record of label key/value pairs. |

#### Returns

`void`
