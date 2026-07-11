[**esphome-client**](../README.md)

***

[Home](../README.md) / LogEventData

# Interface: LogEventData

Log event data emitted when log messages are received from the ESPHome device. These provide insight into the device's internal operation and debugging information.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="level"></a> `level` | [`LogLevel`](../type-aliases/LogLevel.md) | The log level of the message (ERROR, WARN, INFO, DEBUG, VERBOSE, VERY_VERBOSE). |
| <a id="message"></a> `message` | `string` | The actual log message text. |
| <a id="sendfailed"></a> `sendFailed?` | `boolean` | Whether sending the log message failed (optional). |
