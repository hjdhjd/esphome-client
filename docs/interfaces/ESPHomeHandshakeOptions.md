[**esphome-client**](../README.md)

***

[Home](../README.md) / ESPHomeHandshakeOptions

# Interface: ESPHomeHandshakeOptions

Options for creating an ESPHome Noise handshake.
This is a specialized version for connecting to ESPHome devices.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="additionalprologuedata"></a> `additionalPrologueData?` | `Buffer`\<`ArrayBufferLike`\> | Optional additional data to append to the ESPHome prologue. |
| <a id="logger"></a> `logger?` | [`EspHomeLogging`](EspHomeLogging.md) | Optional logger for debugging output. |
| <a id="psk"></a> `psk` | `Buffer` | The 32-byte pre-shared key configured in the ESPHome device. |
| <a id="role"></a> `role?` | `"initiator"` \| `"responder"` | The role in the handshake (defaults to "initiator" for clients). |
