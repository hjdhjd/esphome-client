[**esphome-client**](../README.md)

***

[Home](../README.md) / createHandshake

# Function: createHandshake()

```ts
function createHandshake(options): HandshakeState;
```

Factory function to create a Noise handshake with a cleaner API. This is the primary way to create a handshake for general Noise protocol usage. For ESPHome
specific connections, use [createESPHomeHandshake](createESPHomeHandshake.md) instead.

Usage:

```ts
export function cryptoNoiseHandshakeBasicExample(): void {

  // The pre-shared key must be exactly 32 bytes and known to both sides.
  const psk = randomBytes(32);

  // Initialize the initiator and responder with their respective roles.
  const initiator = createHandshake({ psk, role: "initiator" });
  const responder = createHandshake({ psk, role: "responder" });

  // First message: the initiator sends its ephemeral key.
  responder.readMessage(initiator.writeMessage());

  // Second message: the responder replies, completing the handshake.
  initiator.readMessage(responder.writeMessage());

  // Once the handshake is complete, sendCipher / receiveCipher are populated on both sides. Narrow against undefined before use.
  const { sendCipher: initiatorSend, receiveCipher: initiatorReceive } = initiator;
  const { sendCipher: responderSend, receiveCipher: responderReceive } = responder;

  if(!initiatorSend || !initiatorReceive || !responderSend || !responderReceive) {

    throw new Error("Handshake did not complete.");
  }

  const encrypted = initiatorSend.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello World"));
  const decrypted = responderReceive.DecryptWithAd(Buffer.alloc(0), encrypted);

  void decrypted;

  // The responder can reply through its sendCipher.
  const response = responderSend.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello back!"));
  const responseDecrypted = initiatorReceive.DecryptWithAd(Buffer.alloc(0), response);

  void responseDecrypted;
}
```

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`NoiseHandshakeOptions`](../interfaces/NoiseHandshakeOptions.md) | Configuration options for the handshake. |

## Returns

[`HandshakeState`](../classes/HandshakeState.md)

A configured HandshakeState instance ready for the handshake process.
