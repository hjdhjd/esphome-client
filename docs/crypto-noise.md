[**esphome-client**](README.md)

***

[Home](README.md) / crypto-noise

# crypto-noise

## Examples

```typescript
import { createHandshake } from "./crypto-noise";
import { randomBytes } from "node:crypto";

// Create a pre-shared key that both parties must possess. This must be exactly 32 bytes.
const psk = randomBytes(32);

// Initialize the initiator and responder with their respective roles.
const initiator = createHandshake({ role: "initiator", psk });
const responder = createHandshake({ role: "responder", psk });

// Perform the two-message handshake pattern. First, the initiator sends their ephemeral key.
const msg1 = initiator.writeMessage();
const payload1 = responder.readMessage(msg1);

// Then the responder replies with their ephemeral key, completing the handshake.
const msg2 = responder.writeMessage();
const payload2 = initiator.readMessage(msg2);

// After the handshake completes, both parties have cipher states for secure communication.
// The initiator uses sendCipher to encrypt and receiveCipher to decrypt.
const encrypted = initiator.sendCipher.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello World"));
const decrypted = responder.receiveCipher.DecryptWithAd(Buffer.alloc(0), encrypted);
console.log("Decrypted message:", decrypted.toString());

// The responder can send messages back using their sendCipher.
const response = responder.sendCipher.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello back!"));
const responseDecrypted = initiator.receiveCipher.DecryptWithAd(Buffer.alloc(0), response);
```

```typescript
import { createESPHomeHandshake } from "./crypto-noise";
import { connect } from "node:net";

// Connect to an ESPHome device using its pre-shared key from the YAML configuration.
// The PSK is configured in your device's YAML under api.encryption.key.
const handshake = createESPHomeHandshake({
  role: "initiator",  // Clients are always initiators when connecting to ESPHome devices.
  psk: Buffer.from("your-32-byte-psk-from-esphome-config", "base64"),
  logger: myLogger
});

// Connect to the device on port 6053, which is the standard ESPHome API port.
const socket = connect(6053, "192.168.1.100");

socket.on("connect", () => {
  // Send the first handshake message containing our ephemeral public key.
  const hello = handshake.writeMessage();
  socket.write(hello);
});

socket.on("data", (data) => {
  if (!handshake.isComplete) {
    // Process the device's handshake response.
    handshake.readMessage(data);

    // The handshake is now complete. We can use the cipher states for API communication.
    // All subsequent API messages must be encrypted using these cipher states.
    const apiHello = createAPIHelloMessage(); // Your API protocol implementation.
    const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), apiHello);
    socket.write(encrypted);
  } else {
    // Decrypt incoming API messages from the device.
    const plaintext = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
    processAPIMessage(plaintext); // Your API message handler.
  }
});
```

```typescript
// You can include associated data that gets authenticated but not encrypted.
// This is useful for message sequence numbers or protocol headers.
const sequenceNumber = Buffer.allocUnsafe(4);
sequenceNumber.writeUInt32LE(messageCount++, 0);

// The associated data is authenticated but transmitted in plaintext.
const encrypted = handshake.sendCipher.EncryptWithAd(sequenceNumber, payload);

// The receiver must provide the same associated data to decrypt successfully.
const decrypted = handshake.receiveCipher.DecryptWithAd(sequenceNumber, encrypted);
```

## Classes

### HandshakeState

HandshakeState manages the complete Noise protocol handshake, implementing the NNpsk0 pattern with optional prologue support.
This class implements the HandshakeState object as specified in Noise Protocol Framework §5.3. After the handshake completes, the sendCipher and receiveCipher
properties provide access to the encryption states for ongoing communication.

#### Examples

```typescript
const handshake = new HandshakeState(true, psk, logger, prologue);

// Write the first message with an optional payload.
const message = handshake.writeMessage(Buffer.from("client-hello"));

// After the handshake completes, use the cipher states directly.
if (handshake.isComplete) {
  const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), data);
}
```

```typescript
// For ESPHome connections, use the specialized factory function which sets up
// the correct prologue automatically. ESPHome uses "NoiseAPIInit" as its prologue.
import { createESPHomeHandshake } from "./crypto-noise";

const handshake = createESPHomeHandshake({
  role: "initiator",
  psk: Buffer.from(esphomeKey, "base64")
});

// The handshake follows a strict two-message pattern.
const clientHello = handshake.writeMessage();
// Send to device and receive response...
handshake.readMessage(deviceResponse);

// Now handshake.isComplete is true and cipher states are available.
```

#### Constructors

##### Constructor

```ts
new HandshakeState(
   initiator, 
   psk, 
   log?, 
   prologue?): HandshakeState;
```

Constructs a new handshake state for the NNpsk0 pattern.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `initiator` | `boolean` | `undefined` | True if we're the initiator, false if we're the responder. |
| `psk` | `Buffer` | `undefined` | The 32-byte pre-shared key for authentication. |
| `log?` | [`EspHomeLogging`](types.md#esphomelogging) | `undefined` | Optional Homebridge-compatible logger for debugging. |
| `prologue?` | `Buffer` | `EMPTY_BUFFER` | Optional fixed prologue bytes to mix into the handshake hash. |

###### Returns

[`HandshakeState`](#handshakestate)

###### Throws

If the PSK is not exactly 32 bytes.

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="iscomplete"></a> `isComplete` | `public` | `boolean` | `false` |
| <a id="receivecipher"></a> `receiveCipher?` | `public` | `CipherState` | `undefined` |
| <a id="sendcipher"></a> `sendCipher?` | `public` | `CipherState` | `undefined` |

#### Accessors

##### canReceive

###### Get Signature

```ts
get canReceive(): boolean;
```

Checks if this party can receive encrypted messages (handshake complete and receive cipher available).

###### Returns

`boolean`

##### canSend

###### Get Signature

```ts
get canSend(): boolean;
```

Checks if this party can send encrypted messages (handshake complete and send cipher available).

###### Returns

`boolean`

##### role

###### Get Signature

```ts
get role(): NoiseRole;
```

Gets the role of this party in the handshake.

###### Returns

[`NoiseRole`](#noiserole)

#### Methods

##### destroy()

```ts
destroy(): void;
```

Clears sensitive key material from memory where possible.
Note: Cannot clear KeyObject internal memory in Node.js.

###### Returns

`void`

###### Example

```typescript
// Clean up after handshake
handshake.destroy();
```

##### readMessage()

```ts
readMessage(message): Buffer;
```

Reads a handshake message according to the next pattern in the sequence.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `Buffer` | The received handshake message to process. |

###### Returns

`Buffer`

The decrypted payload from the message.

###### Throws

If the handshake is already complete or authentication fails.

###### Example

```typescript
const payload = responder.readMessage(message1);
console.log("Received:", payload.toString());
```

##### writeMessage()

```ts
writeMessage(payload): Buffer;
```

Writes a handshake message according to the next pattern in the sequence.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `payload` | `Buffer` | `EMPTY_BUFFER` | Optional payload data to encrypt and include in the message. |

###### Returns

`Buffer`

The complete handshake message to send.

###### Throws

If the handshake is already complete or if pattern processing fails.

###### Example

```typescript
try {
  const message1 = initiator.writeMessage();
  const message2 = initiator.writeMessage(Buffer.from("hello"));
} catch (error) {
  if (error instanceof NoiseHandshakeError) {
    console.error("Write failed:", error.message, "Code:", error.code);
  }
}
```

***

### NoiseHandshakeError

Custom error class for Noise protocol errors with error codes for better error handling.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new NoiseHandshakeError(message, code): NoiseHandshakeError;
```

Creates a new NoiseHandshakeError.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | The error message. |
| `code` | `string` | A machine-readable error code. |

###### Returns

[`NoiseHandshakeError`](#noisehandshakeerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="code"></a> `code` | `readonly` | `string` | A machine-readable error code. |

## Interfaces

### ESPHomeHandshakeOptions

Options for creating an ESPHome Noise handshake.
This is a specialized version for connecting to ESPHome devices.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="additionalprologuedata"></a> `additionalPrologueData?` | `Buffer`\<`ArrayBufferLike`\> | Optional additional data to append to the ESPHome prologue. |
| <a id="logger"></a> `logger?` | [`EspHomeLogging`](types.md#esphomelogging) | Optional logger for debugging output. |
| <a id="psk"></a> `psk` | `Buffer` | The 32-byte pre-shared key configured in the ESPHome device. |
| <a id="role-1"></a> `role?` | `"initiator"` \| `"responder"` | The role in the handshake (defaults to "initiator" for clients). |

***

### NoiseHandshakeOptions

Options for creating a Noise handshake.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="logger-1"></a> `logger?` | [`EspHomeLogging`](types.md#esphomelogging) | Optional logger for debugging output. |
| <a id="prologue"></a> `prologue?` | `Buffer`\<`ArrayBufferLike`\> | Optional prologue data to bind to the handshake. |
| <a id="psk-1"></a> `psk` | `Buffer` | The 32-byte pre-shared key for authentication. |
| <a id="role-2"></a> `role` | [`NoiseRole`](#noiserole) | The role this party plays in the handshake. |

## Type Aliases

### NoiseHandshakeErrorCode

```ts
type NoiseHandshakeErrorCode = 
  | "AUTH_FAILED"
  | "CT_TOO_SHORT"
  | "HANDSHAKE_COMPLETE"
  | "INVALID_PSK_LENGTH"
  | "MISSING_KEYS"
  | "MSG_TOO_LONG"
  | "NO_PATTERN"
  | "NOT_INITIALIZED"
  | "TRUNCATED_E"
  | "UNSUPPORTED_TOKEN";
```

Noise handshake error codes to allow precise error handling by consumers.

***

### NoiseRole

```ts
type NoiseRole = "initiator" | "responder";
```

Role in the Noise protocol handshake.

## Variables

### ESPHOME\_NOISE\_PROLOGUE

```ts
const ESPHOME_NOISE_PROLOGUE: "NoiseAPIInit\u0000\u0000" = "NoiseAPIInit\x00\x00";
```

ESPHome Noise protocol prologue prefix used for all ESPHome API connections. This identifies the connection as using the ESPHome Native API protocol.

***

### NOISE\_DH\_LEN

```ts
const NOISE_DH_LEN: 32 = 32;
```

Length of Diffie-Hellman public keys in bytes.

***

### NOISE\_MAX\_MESSAGE\_LEN

```ts
const NOISE_MAX_MESSAGE_LEN: 65535 = 65535;
```

Maximum Noise protocol message length as specified in the Noise Protocol Framework.

***

### NOISE\_PSK\_LEN

```ts
const NOISE_PSK_LEN: 32 = 32;
```

Required length for pre-shared keys in bytes.

## Functions

### createESPHomeHandshake()

```ts
function createESPHomeHandshake(options): HandshakeState;
```

Factory function to create a Noise handshake specifically for ESPHome connections.
This function automatically configures the correct prologue for ESPHome Native API communication.
ESPHome devices expect a specific prologue format and this function handles that setup automatically.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ESPHomeHandshakeOptions`](#esphomehandshakeoptions) | Configuration options for the ESPHome handshake. |

#### Returns

[`HandshakeState`](#handshakestate)

A configured HandshakeState instance ready for ESPHome communication.

#### Examples

```typescript
import { createESPHomeHandshake } from "./crypto-noise";
import { connect } from "node:net";

// The PSK is configured in your ESPHome device YAML file. Look for the api.encryption.key field in your device configuration.
// api:
//   encryption:
//     key: "base64-encoded-32-byte-key"

const psk = Buffer.from("your-base64-key", "base64");
const handshake = createESPHomeHandshake({
  role: "initiator",  // Clients connecting to ESPHome devices are always initiators.
  psk: psk
});

// Connect to the ESPHome device on its API port (default 6053).
const socket = connect(6053, "device-ip-address");

// Perform the two-message Noise handshake once connected.
socket.on("connect", () => {
  const clientHello = handshake.writeMessage();
  socket.write(clientHello);
});

socket.on("data", (data) => {
  if (!handshake.isComplete) {
    // Complete the handshake by processing the device's response.
    handshake.readMessage(data);
    console.log("Handshake complete, ready for encrypted API communication.");

    // Now you can send encrypted API messages using the established cipher states.
    const apiMessage = createConnectRequest(); // Your API message creation.
    const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), apiMessage);
    socket.write(encrypted);
  } else {
    // All subsequent communication is encrypted using the cipher states.
    const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
    handleAPIResponse(decrypted); // Your API response handler.
  }
});
```

```typescript
// Enable detailed logging to troubleshoot handshake issues.
const handshake = createESPHomeHandshake({
  role: "initiator",
  psk: myPSK,
  logger: {
    debug: (msg) => console.log("[DEBUG]", msg),
    error: (msg) => console.error("[ERROR]", msg)
  }
});

// The logger will output detailed information about each handshake step,
// including key exchanges, hash updates, and cipher state transitions.
```

```typescript
// If you're implementing a server that ESPHome devices can connect to,
// configure the handshake as a responder. This is uncommon but supported.
const handshake = createESPHomeHandshake({
  role: "responder",
  psk: serverPSK,
  additionalPrologueData: Buffer.from("server-identifier")
});

// Wait for incoming connections and process the initiator's hello message.
server.on("connection", (socket) => {
  socket.on("data", (data) => {
    if (!handshake.isComplete) {
      // Read the client's hello message.
      handshake.readMessage(data);

      // Send our response to complete the handshake.
      const response = handshake.writeMessage();
      socket.write(response);
    } else {
      // Handle encrypted API messages.
      const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
      processIncomingMessage(decrypted);
    }
  });
});
```

```typescript
try {
  const handshake = createESPHomeHandshake({
    role: "initiator",
    psk: psk
  });

  // Process messages with proper error handling.
  handshake.readMessage(incomingData);
} catch (error) {
  if (error instanceof NoiseHandshakeError) {
    // Handle specific Noise protocol errors.
    console.error("Handshake failed:", error.message, "Code:", error.code);

    // Common error codes include:
    // AUTH_FAILED - Authentication tag verification failed.
    // INVALID_PSK_LENGTH - PSK is not exactly 32 bytes.
    // HANDSHAKE_COMPLETE - Attempting operations after handshake finished.
    // MISSING_KEYS - Required keys not available for DH operation.
  }
}
```

***

### createHandshake()

```ts
function createHandshake(options): HandshakeState;
```

Factory function to create a Noise handshake with a cleaner API. This is the primary way to create a handshake for general Noise protocol usage. For ESPHome specific
connections, use createESPHomeHandshake instead.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`NoiseHandshakeOptions`](#noisehandshakeoptions) | Configuration options for the handshake. |

#### Returns

[`HandshakeState`](#handshakestate)

A configured HandshakeState instance ready for the handshake process.

#### Examples

```typescript
import { createHandshake } from "./crypto-noise";

const handshake = createHandshake({
  role: "initiator",
  psk: myPreSharedKey,
  prologue: Buffer.from("application-specific-data"),
  logger: myLogger
});

// Perform the handshake and then use the cipher states.
const msg = handshake.writeMessage();
// ... exchange messages ...

// After completion, encrypt data using the cipher states.
const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), plaintext);
```

```typescript
// The minimal configuration only requires a role and PSK.
const handshake = createHandshake({
  role: "responder",
  psk: sharedSecret
});
```
