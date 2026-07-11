[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseHandshakeErrorCode

# Type Alias: NoiseHandshakeErrorCode

```ts
type NoiseHandshakeErrorCode = 
  | "AUTH_FAILED"
  | "CT_TOO_SHORT"
  | "HANDSHAKE_COMPLETE"
  | "HANDSHAKE_TIMEOUT"
  | "INVALID_PSK_LENGTH"
  | "INVALID_REMOTE_KEY"
  | "MISSING_KEYS"
  | "MSG_TOO_LONG"
  | "NONCE_EXHAUSTED"
  | "NOT_INITIALIZED"
  | "PEER_CLOSED_NOISE"
  | "PEER_PLAINTEXT_DURING_NOISE"
  | "TRUNCATED_E"
  | "UNSUPPORTED_TOKEN";
```

Discriminated codes for noise-handshake failure modes that consumers can pattern-match on.

## Remarks

Each code names a specific failure mode the consumer can pattern-match on. The throw sites live in `crypto-noise.ts` (low-level cipher / handshake state),
`lifecycle/handshake.ts` (orchestration), and `transport.ts` (the two `PEER_*_NOISE` codes carried by the [PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md) subclass).

Code table:

- `AUTH_FAILED` - ChaCha20-Poly1305 authentication tag verification failed during decryption (`crypto-noise.ts`). Wrong PSK or tampered ciphertext.
- `CT_TOO_SHORT` - Inbound ciphertext was shorter than the 16-byte AEAD tag (`crypto-noise.ts`). Malformed inbound noise frame.
- `HANDSHAKE_COMPLETE` - A handshake-state operation was attempted after the handshake already completed (`crypto-noise.ts`). Library-internal lifecycle bug.
- `HANDSHAKE_TIMEOUT` - The per-step handshake timeout elapsed (`lifecycle/handshake.ts`). Carried by [NoiseHandshakeTimeoutError](../classes/NoiseHandshakeTimeoutError.md).
- `INVALID_PSK_LENGTH` - The PSK is not exactly 32 bytes (`crypto-noise.ts`). Consumer-supplied configuration error.
- `INVALID_REMOTE_KEY` - The remote ephemeral public key was malformed or a low-order point, so X25519 key agreement failed (`crypto-noise.ts`). The `diffieHellman`
  primitive rejected the peer key; the connect-flow handshake re-tags this into a permanent [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md).
- `MISSING_KEYS` - A Diffie-Hellman or post-handshake step required keys that were not yet initialized (`crypto-noise.ts`, `lifecycle/handshake.ts`).
- `MSG_TOO_LONG` - Outbound noise message exceeded the 65535-byte protocol limit (`crypto-noise.ts`). Indicates an oversized payload.
- `NONCE_EXHAUSTED` - The ChaCha20-Poly1305 nonce reached the reserved maximum 2^64 - 1 (`crypto-noise.ts`). Per Noise §5.1 that nonce is reserved for rekey and must
  never encrypt or decrypt a transport message; physically unreachable in practice (it would require 2^64 messages on one connection).
- `NOT_INITIALIZED` - Reserved for future use; no current throw site constructs this code. Kept in the union for forward compatibility.
- `PEER_CLOSED_NOISE` - The peer closed the TCP socket while a noise handshake was in flight (`transport.ts`). Carried by [PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md).
- `PEER_PLAINTEXT_DURING_NOISE` - The peer responded with the plaintext indicator byte (0x00) during the noise handshake (`transport.ts`). Triggers fallback to
  plaintext when the consumer has not insisted on encryption. Carried by [PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md).
- `TRUNCATED_E` - The ephemeral public key segment in an inbound handshake message was shorter than 32 bytes (`crypto-noise.ts`, `lifecycle/handshake.ts`).
- `UNSUPPORTED_TOKEN` - The device's noise-handshake server-hello frame selected a protocol byte other than 1 (`lifecycle/handshake.ts`). Indicates the peer
  negotiated a noise protocol variant this client does not support.
