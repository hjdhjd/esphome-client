[**esphome-client**](../README.md)

***

[Home](../README.md) / CipherState

# Class: CipherState

CipherState manages the encryption state for a single direction of communication.
Implements the CipherState object as specified in Noise Protocol Framework §5.1 using ChaCha20-Poly1305.

Usage:

```ts
export function cryptoNoiseAssociatedDataExample(): void {

  const psk = randomBytes(32);
  const initiator = createHandshake({ psk, role: "initiator" });
  const responder = createHandshake({ psk, role: "responder" });

  responder.readMessage(initiator.writeMessage());
  initiator.readMessage(responder.writeMessage());

  // Build a four-byte little-endian sequence number to authenticate alongside the payload.
  const sequenceNumber = Buffer.alloc(4);

  sequenceNumber.writeUInt32LE(1, 0);

  const { sendCipher } = initiator;
  const { receiveCipher } = responder;

  if(!sendCipher || !receiveCipher) {

    throw new Error("Handshake did not complete.");
  }

  const encrypted = sendCipher.EncryptWithAd(sequenceNumber, Buffer.from("payload"));
  const decrypted = receiveCipher.DecryptWithAd(sequenceNumber, encrypted);

  void decrypted;
}
```

## Constructors

### Constructor

```ts
new CipherState(log?): CipherState;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `log?` | [`EspHomeLogging`](../interfaces/EspHomeLogging.md) |

#### Returns

`CipherState`

## Methods

### \[dispose\]()

```ts
dispose: void;
```

Symbol.dispose hook so consumers can `using cipher = new CipherState(log);` and have key material zeroized deterministically when the binding leaves scope. Aliased
to [destroy](#destroy) for callers that prefer the explicit method.

#### Returns

`void`

***

### DecryptWithAd()

```ts
DecryptWithAd(ad, data): Buffer;
```

Decrypts ciphertext with associated data using ChaCha20-Poly1305. Returns input unchanged if no key is set.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ad` | `Buffer` |
| `data` | `Buffer` |

#### Returns

`Buffer`

***

### destroy()

```ts
destroy(): void;
```

Zero out the key material and reset state. The key Buffer is filled with zeros before the reference is dropped, ensuring sensitive material does not linger in
memory waiting on garbage collection. Idempotent - safe to call multiple times.

#### Returns

`void`

***

### EncryptWithAd()

```ts
EncryptWithAd(ad, plaintext): Buffer;
```

Encrypts plaintext with associated data using ChaCha20-Poly1305. Returns plaintext unchanged if no key is set.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ad` | `Buffer` |
| `plaintext` | `Buffer` |

#### Returns

`Buffer`

***

### HasKey()

```ts
HasKey(): boolean;
```

Checks whether this cipher state has an encryption key set.

#### Returns

`boolean`

***

### InitializeKey()

```ts
InitializeKey(key): void;
```

Initializes the cipher state with a new key, resetting the nonce counter to zero.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | [`Nullable`](../type-aliases/Nullable.md)\<`Buffer`\<`ArrayBufferLike`\>\> |

#### Returns

`void`

***

### Rekey()

```ts
Rekey(): void;
```

Rekeys the cipher state by encrypting zeros with the maximum nonce value, providing forward secrecy.

#### Returns

`void`
