[**esphome-client**](../README.md)

***

[Home](../README.md) / logLevelName

# Function: logLevelName()

```ts
function logLevelName(level): string;
```

Resolve a numeric log level back to its canonical name. Used by diagnostic logging and consumer code that wants to display the level alongside the message. Falls
back to a stable `Unknown(<id>)` placeholder when the level is outside the registered set so callers never see `undefined`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | `number` | Numeric log level. |

## Returns

`string`

The canonical name from [LogLevel](../variables/LogLevel.md), or `"Unknown(<id>)"` for unrecognized levels.
