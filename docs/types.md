[**esphome-client**](README.md)

***

[Home](README.md) / types

# types

## Interfaces

### EspHomeLogging

Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.

#### Remarks

By default, logging is done to the console. If you use your own logging functions, you must specify all the alert levels that the library uses: `debug`,
`error`, `info`, and `warn`.

#### Methods

##### debug()

```ts
debug(message, ...parameters): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### error()

```ts
error(message, ...parameters): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### info()

```ts
info(message, ...parameters): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

##### warn()

```ts
warn(message, ...parameters): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| ...`parameters` | `unknown`[] |

###### Returns

`void`

## Type Aliases

### Nullable\<T\>

```ts
type Nullable<T> = T | null;
```

Utility type that allows a value to be either the given type or `null`.

This type is used to explicitly indicate that a variable, property, or return value may be either a specific type or `null`.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The type to make nullable. |

#### Example

```ts
let id: Nullable<string> = null;

// Later...
id = "device-001";
```
