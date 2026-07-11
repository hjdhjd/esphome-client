[**esphome-client**](../README.md)

***

[Home](../README.md) / createESPHomeHandshake

# Function: createESPHomeHandshake()

```ts
function createESPHomeHandshake(options): HandshakeState;
```

Factory function to create a Noise handshake specifically for ESPHome connections. This function automatically configures the correct prologue for ESPHome Native
API communication. ESPHome devices expect a specific prologue format and this function handles that setup automatically.

Usage:

```ts
export function cryptoNoiseEsphomeConnectionExample(psk: Buffer): void {

  const handshake = createESPHomeHandshake({ psk, role: "initiator" });

  // First wire frame the client sends after the TCP connect: the ephemeral-key carrying handshake message.
  const clientHello = handshake.writeMessage();

  void clientHello;

  // The transport feeds the device's response back into readMessage; once isComplete becomes true, send/receive ciphers are ready for the API layer.
  // handshake.readMessage(deviceResponse);
  // const { sendCipher } = handshake;
  // const encrypted = sendCipher?.EncryptWithAd(Buffer.alloc(0), apiPayload);
}
```

Usage (with logging):

```ts
export function cryptoNoiseWithLoggingExample(psk: Buffer): void {

  const logger: EspHomeLogging = {

    debug: (message): void => { void message; },
    error: (message): void => { void message; },
    info: (message): void => { void message; },
    warn: (message): void => { void message; }
  };

  const handshake = createESPHomeHandshake({ logger, psk, role: "initiator" });

  void handshake;
}
```

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ESPHomeHandshakeOptions`](../interfaces/ESPHomeHandshakeOptions.md) | Configuration options for the ESPHome handshake. |

## Returns

[`HandshakeState`](../classes/HandshakeState.md)

A configured HandshakeState instance ready for ESPHome communication.
