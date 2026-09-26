[**esphome-client**](../README.md)

***

[Home](../README.md) / InboundMessage

# Interface: InboundMessage

One inbound typed message. The async iterator over a `Transport` yields entries of this shape during the `plaintext` and `noise-data` phases.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="payload"></a> `payload` | `Buffer` | The decrypted inner payload after noise frame decryption (`noise-data` phase) or the raw frame body (`plaintext` phase). In both phases this carries plaintext. |
| <a id="type"></a> `type` | `number` | The numeric message type identifier. |
