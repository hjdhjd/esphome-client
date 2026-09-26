[**esphome-client**](../README.md)

***

[Home](../README.md) / TransportOpenOptions

# Interface: TransportOpenOptions

Construction options for `Transport.open`.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="host"></a> `host` | `string` | Hostname or IP address of the ESPHome device. |
| <a id="log"></a> `log` | [`EspHomeLogging`](EspHomeLogging.md) | Logging adapter for diagnostic output. |
| <a id="maxframebytes"></a> `maxFrameBytes` | `number` | Maximum frame size in bytes. Frames larger than this are rejected with [FrameTooLargeError](../classes/FrameTooLargeError.md) before any allocation. |
| <a id="maxrecvbufferbytes"></a> `maxRecvBufferBytes` | `number` | Maximum total bytes in the receive buffer. Exceeding this triggers [BufferOverflowError](../classes/BufferOverflowError.md) and tears down the transport. Protects against peers that send partial frames forever. |
| <a id="metrics"></a> `metrics?` | [`ClientMetrics`](ClientMetrics.md) | Optional metrics adapter. The transport emits `frames.received`, `frames.sent`, and `frames.dropped` counters. No-overhead when undefined. |
| <a id="port"></a> `port` | `number` | TCP port. ESPHome's default is `6053`. |
| <a id="signal"></a> `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional cancellation signal scoped to the open attempt only. After connection is established, the signal has no further effect; the caller manages the transport's lifetime explicitly via dispose. |
| <a id="socketfactory"></a> `socketFactory?` | (`params`) => `Socket` | Optional socket factory. Tests inject a mock socket here; production omits it to use Node's [net.createConnection](https://nodejs.org/api/net.html#netcreateconnectionoptions-connectlistener). The factory must return a [net.Socket](https://nodejs.org/api/net.html#class-netsocket)-compatible duplex stream that emits `connect`, `data`, `end`, `error`, and `close` events. |
