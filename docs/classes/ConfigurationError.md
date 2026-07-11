[**esphome-client**](../README.md)

***

[Home](../README.md) / ConfigurationError

# Class: ConfigurationError

Construction-time misconfiguration: bad PSK length, missing host, conflicting options, etc. Caught at the boundary so internal code can trust validated structures.

Usage:

```ts
export async function commandErrorHandlingExample(client: EspHomeClient, lightId: EntityId<"light">): Promise<void> {

  try {

    await client.commandAndAwait(lightId, { state: true }, { signal: AbortSignal.timeout(2000) });

  } catch(error) {

    if(error instanceof ConfigurationError) {

      switch(error.code) {

        case "MALFORMED_ENTITY_ID":

          // The supplied id was not a valid `${type}-${objectId}` brand.
          break;

        case "UNKNOWN_ENTITY_ID":

          // The id parses but the entity is not registered on the current connection - typically discovery has not completed.
          break;

        case "AWAIT_STREAM_CLOSED":

          // The connection dropped before the matching state event arrived.
          break;
      }

      return;
    }

    if((error instanceof DOMException) && ((error.name === "AbortError") || (error.name === "TimeoutError"))) {

      // Caller signal aborted or the 2000ms default deadline elapsed.
      return;
    }

    throw error;
  }
}
```

## Extends

- [`EspHomeError`](EspHomeError.md)

## Constructors

### Constructor

```ts
new ConfigurationError(
   message, 
   code?, 
   options?): ConfigurationError;
```

Creates a new EspHomeError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code?` | `string` | Optional machine-readable error code. Subclasses narrow this to discriminated unions. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConfigurationError`

#### Inherited from

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` \| `undefined` | Optional machine-readable error code. Subclasses narrow this to discriminated string unions. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
