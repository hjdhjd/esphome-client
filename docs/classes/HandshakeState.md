[**esphome-client**](../README.md)

***

[Home](../README.md) / HandshakeState

# Class: HandshakeState

HandshakeState manages the complete Noise protocol handshake, implementing the NNpsk0 pattern with optional prologue support. This class implements the
HandshakeState object as specified in Noise Protocol Framework §5.3. After the handshake completes, the sendCipher and receiveCipher properties provide access to
the encryption states for ongoing communication.

Usage:

```ts
export function cryptoNoiseErrorHandlingExample(psk: Buffer, incoming: Buffer): void {

  const handshake = createESPHomeHandshake({ psk, role: "initiator" });

  try {

    handshake.readMessage(incoming);

  } catch(error) {

    if(error instanceof NoiseHandshakeError) {

      void error.code;
      void error.message;
    }

    throw error;
  }
}
```

## Constructors

### Constructor

```ts
new HandshakeState(
   initiator, 
   psk, 
   log?, 
   prologue?): HandshakeState;
```

Constructs a new handshake state for the NNpsk0 pattern.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `initiator` | `boolean` | `undefined` | True if we're the initiator, false if we're the responder. |
| `psk` | `Buffer` | `undefined` | The 32-byte pre-shared key for authentication. |
| `log?` | [`EspHomeLogging`](../interfaces/EspHomeLogging.md) | `undefined` | Optional logger for debugging. |
| `prologue?` | `Buffer` | `EMPTY_BUFFER` | Optional fixed prologue bytes to mix into the handshake hash. |

#### Returns

`HandshakeState`

#### Throws

If the PSK is not exactly 32 bytes.

## Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="iscomplete"></a> `isComplete` | `public` | `boolean` | `false` |
| <a id="receivecipher"></a> `receiveCipher` | `public` | [`CipherState`](CipherState.md) \| `undefined` | `undefined` |
| <a id="sendcipher"></a> `sendCipher` | `public` | [`CipherState`](CipherState.md) \| `undefined` | `undefined` |

## Methods

### \[dispose\]()

```ts
dispose: void;
```

Symbol.dispose hook for the explicit-resource-management proposal. Lets consumers write `using handshake = createESPHomeHandshake({ ... });` and have key material
zeroized deterministically when the binding leaves scope, including on thrown errors. Aliased to [destroy](#destroy) so call sites and `using` agree on behavior.

#### Returns

`void`

***

### destroy()

```ts
destroy(): void;
```

Clears sensitive key material from memory where possible. Note: cannot clear `KeyObject` internal memory in Node.js.

#### Returns

`void`

***

### destroyHandshakeSecrets()

```ts
destroyHandshakeSecrets(): void;
```

Zeroize the handshake-only secrets - the PSK, the `SymmetricState` chaining key / handshake hash (and its embedded handshake cipher), and our ephemeral public
key - while LEAVING the post-handshake [sendCipher](#sendcipher) / [receiveCipher](#receivecipher) intact. Called on the success path AFTER the cipher pair has been installed on the
transport, so the live session keys survive while the now-spent handshake inputs (the PSK and the HKDF chaining material that derived the session keys) do not linger
in memory. The cipher references are relinquished (set to undefined, NOT destroyed) because ownership has transferred to the transport via `installCipher`; this also
makes a later [destroy](#destroy) on this spent handshake a safe no-op that can never zero the transport's live keys. Contrast [destroy](#destroy), which additionally
cascades into the cipher states and is the correct teardown for a FAILED handshake (no ciphers in use). Idempotent. Best-effort: Node Buffer zeroization cannot
guarantee the GC made no prior copy.

#### Returns

`void`

***

### readMessage()

```ts
readMessage(message): Buffer;
```

Reads a handshake message according to the next pattern in the sequence.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `Buffer` | The received handshake message to process. |

#### Returns

`Buffer`

The decrypted payload from the message.

#### Throws

If the handshake is already complete or authentication fails.

***

### writeMessage()

```ts
writeMessage(payload?): Buffer;
```

Writes a handshake message according to the next pattern in the sequence.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `payload` | `Buffer` | `EMPTY_BUFFER` | Optional payload data to encrypt and include in the message. |

#### Returns

`Buffer`

The complete handshake message to send.

#### Throws

If the handshake is already complete or if pattern processing fails.
