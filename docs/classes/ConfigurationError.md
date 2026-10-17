[**esphome-client**](../README.md)

***

[Home](../README.md) / ConfigurationError

# Class: ConfigurationError

Construction-time misconfiguration: missing host, conflicting options, etc. Caught at the boundary so internal code can trust validated structures.

## Remarks

Carries a required [ConfigurationErrorCode](../type-aliases/ConfigurationErrorCode.md) so consumers can pattern-match the specific misuse without parsing the message string.

Code table:

- `COMMAND_UNSUPPORTED` - [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) was called for an entity type whose schema declares no command. Nothing is sent.
- `ENUM_VALUE_UNKNOWN` - A [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) command field received a string that is not one of the field's enum aliases. The message names the
  field and the value. Nothing is sent.
- `EXTRA_SCHEMA_OVERRIDES_BUILTIN` - A key in the client's `extraSchemas` option names a built-in entity type. Raised at client construction.
- `MALFORMED_ENTITY_ID` - [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) received an id that is not a valid `${type}-${objectId}` brand.
- `SCHEMA_MISSING_DECODE_CALLBACK` - An entity schema declares repeated message fields but the discovery decoder was given no nested-message decoder for them.
- `SCHEMA_UNKNOWN` - [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) was called for an entity type no schema is registered for. Nothing is sent.
- `UNKNOWN_ENTITY_ID` - [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) was called for an id that has not been discovered on the current connection. Nothing is sent.
- `VALUE_OUT_OF_RANGE` - A [EspHomeClient.commandAndAwait](EspHomeClient.md#commandandawait) command field received a value outside the integer domain its wire type carries. The message
  names the field and the value. Nothing is sent.

Usage:

```ts
export async function commandErrorHandlingExample(client: EspHomeClient, lightId: EntityId<"light">): Promise<void> {

  const deadline = AbortSignal.timeout(2000);

  try {

    await client.commandAndAwait(lightId, { state: true }, { signal: deadline });

  } catch(error) {

    if(error === deadline.reason) {

      // Our own deadline elapsed first.
      return;
    }

    if(error instanceof NotConnectedError) {

      // No connection could carry the command, so nothing was sent. CONNECT_IN_PROGRESS means a connect was running; a connect listener can issue it again.
      return;
    }

    if(error instanceof ConnectionLostError) {

      // The connection was torn down before the light confirmed the command.
      return;
    }

    if(error instanceof ConfigurationError) {

      switch(error.code) {

        case "MALFORMED_ENTITY_ID":

          // The supplied id was not a valid `${type}-${objectId}` brand.
          break;

        case "UNKNOWN_ENTITY_ID":

          // The id parses but the entity is not registered on the current connection.
          break;
      }

      return;
    }

    if((error instanceof DOMException) && (error.name === "TimeoutError")) {

      // The default deadline elapsed before the light confirmed the command.
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
   code, 
   options?
): ConfigurationError;
```

Creates a new ConfigurationError.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Human-readable error description. |
| `code` | [`ConfigurationErrorCode`](../type-aliases/ConfigurationErrorCode.md) | Narrowed configuration error code. |
| `options?` | `ErrorOptions` | Standard ErrorOptions; pass `{ cause }` to preserve an underlying error. |

#### Returns

`ConfigurationError`

#### Overrides

[`EspHomeError`](EspHomeError.md).[`constructor`](EspHomeError.md#constructor)

## Properties

| Property | Modifier | Type | Description | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | [`ConfigurationErrorCode`](../type-aliases/ConfigurationErrorCode.md) | Narrowed configuration error code. Overrides the base class's optional `code` to make it required and narrowed. | [`EspHomeError`](EspHomeError.md).[`code`](EspHomeError.md#code) |
