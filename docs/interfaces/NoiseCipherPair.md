[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseCipherPair

# Interface: NoiseCipherPair

Cipher state pair installed via `Transport.installCipher`.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="receivecipher"></a> `receiveCipher` | [`CipherState`](../classes/CipherState.md) | Cipher used to decrypt inbound frames. |
| <a id="sendcipher"></a> `sendCipher` | [`CipherState`](../classes/CipherState.md) | Cipher used to encrypt outbound frames. |
