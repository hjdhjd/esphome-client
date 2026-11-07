[**esphome-client**](../README.md)

***

[Home](../README.md) / BackpressureError

# Class: BackpressureError

Emitted into a stream operating in `backpressure: "throw"` mode when the high-water mark is exceeded. Carries the dropped-item count for diagnostics.

Usage:

```ts
export async function backpressurePolicyExample(client: EspHomeClient): Promise<void> {

  // Default: drop the oldest item under load. Optimized for "I want a recent sample, not the full backlog."
  for await (const event of client.telemetry({ backpressure: "dropOldest", highWaterMark: 64 })) {

    log.debug("Received the freshest available state event.", event);
  }

  // Throw on overflow. Pair with a try/catch that responds to BackpressureError specifically.
  try {

    for await (const event of client.telemetry({ backpressure: "throw", highWaterMark: 32 })) {

      log.debug("Received a state event with no loss permitted.", event);
    }

  } catch(error) {

    log.error("The telemetry stream overflowed before the consumer could drain it.", error);
  }
}
```

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new BackpressureError(
   message, 
   dropped, 
   options?
): BackpressureError;
```

Creates a new BackpressureError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable description. |
| `dropped` | `number` | Number of items dropped before the throw fired. |
| `options?` | `ErrorOptions` | Standard ErrorOptions. |

#### Returns

`BackpressureError`

#### Overrides

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `public readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to tagged string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
| <a id="dropped"></a> `dropped` | `public readonly` | `number` | Number of items the stream dropped before the high-water-mark throw fired. | - |
