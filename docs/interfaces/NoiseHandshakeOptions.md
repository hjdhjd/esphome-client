[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseHandshakeOptions

# Interface: NoiseHandshakeOptions

Options for creating a Noise handshake.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="logger"></a> `logger?` | [`EspHomeLogging`](EspHomeLogging.md) | Optional logger for debugging output. |
| <a id="prologue"></a> `prologue?` | `Buffer`\<`ArrayBufferLike`\> | Optional prologue data to bind to the handshake. |
| <a id="psk"></a> `psk` | `Buffer` | The 32-byte pre-shared key for authentication. |
| <a id="role"></a> `role` | [`NoiseRole`](../type-aliases/NoiseRole.md) | The role this party plays in the handshake. |
