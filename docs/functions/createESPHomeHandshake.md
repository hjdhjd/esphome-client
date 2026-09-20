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

  log.debug("The first handshake frame is ready for the transport to send.", clientHello);

  // The transport feeds the device's response back into readMessage; once isComplete becomes true, send/receive ciphers are ready for the API layer.
  // handshake.readMessage(deviceResponse);
  // const { sendCipher } = handshake;
  // const encrypted = sendCipher?.EncryptWithAd(Buffer.alloc(0), apiPayload);
}
```

Usage (with logging):

```ts
export function cryptoNoiseWithLoggingExample(psk: Buffer): void {

  // The adapter forwards every level to the logging backend the consumer already owns. The handshake calls it on each key exchange, hash update, and cipher
  // transition, so a debug-enabled backend gets a step-by-step trace of the negotiation.
  const logger: EspHomeLogging = {

    debug: (message, ...parameters): void => log.debug(message, ...parameters),
    error: (message, ...parameters): void => log.error(message, ...parameters),
    info: (message, ...parameters): void => log.info(message, ...parameters),
    warn: (message, ...parameters): void => log.warn(message, ...parameters)
  };

  const handshake = createESPHomeHandshake({ logger, psk, role: "initiator" });

  // The handshake reports incomplete until the device's response has been read back into it...the trace above narrates each step along the way.
  log.debug("The traced handshake is ready to drive against the device socket.", handshake.isComplete);
}
```

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ESPHomeHandshakeOptions`](../interfaces/ESPHomeHandshakeOptions.md) | Configuration options for the ESPHome handshake. |

## Returns

[`HandshakeState`](../classes/HandshakeState.md)

A configured HandshakeState instance ready for ESPHome communication.
