[**esphome-client**](../README.md)

***

[Home](../README.md) / EspHomeLogging

# Interface: EspHomeLogging

Logging interface for the client. Defaults to console output. Consumers supplying their own implementation must define all four levels: `debug`, `error`, `info`,
and `warn`.

Usage:

```ts
export async function customLoggerInjectionExample(): Promise<void> {

  const logger: EspHomeClientOptions["logger"] = {

    debug: (message, ...args): void => { void message; void args; },
    error: (message, ...args): void => { void message; void args; },
    info: (message, ...args): void => { void message; void args; },
    warn: (message, ...args): void => { void message; void args; }
  };

  await using client = await openEspHomeClient({

    host: "tracked.local",
    logger,
    psk: null
  });

  void client;
}
```

## Methods

### debug()

```ts
debug(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### error()

```ts
error(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### info()

```ts
info(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`

***

### warn()

```ts
warn(message, ...parameters): void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

#### Returns

`void`
