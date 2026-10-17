[**esphome-client**](../README.md)

***

[Home](../README.md) / NoiseHandshakeErrorCode

# Type Alias: NoiseHandshakeErrorCode

```ts
type NoiseHandshakeErrorCode = 
  | "AUTH_FAILED"
  | "CT_TOO_SHORT"
  | "HANDSHAKE_COMPLETE"
  | "HANDSHAKE_REJECTED"
  | "INVALID_PSK_LENGTH"
  | "INVALID_REMOTE_KEY"
  | "MISSING_KEYS"
  | "MSG_TOO_LONG"
  | "NONCE_EXHAUSTED"
  | "NOT_INITIALIZED"
  | "PEER_CLOSED_NOISE"
  | "PEER_PLAINTEXT_DURING_NOISE"
  | "SERVER_NAME_MISMATCH"
  | "TRUNCATED_E"
  | "UNSUPPORTED_TOKEN";
```

Tagged codes for noise-handshake failure modes that consumers can pattern-match on.

## Remarks

Each code names a specific failure mode the consumer can pattern-match on. The throw sites live in `crypto-noise.ts` (low-level cipher / handshake state),
`lifecycle/handshake.ts` (orchestration), and `transport.ts` (the frame writer's `MSG_TOO_LONG` guard and every `PEER_*_NOISE` code, each carried by the
[PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md) subclass).

Code table:

- `AUTH_FAILED` - ChaCha20-Poly1305 authentication tag verification failed during decryption (`crypto-noise.ts`). Wrong PSK or tampered ciphertext; the
  connect-flow handshake re-tags this into a permanent [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md) coded `NOISE_HANDSHAKE_FAILED`.
- `CT_TOO_SHORT` - Inbound ciphertext was shorter than the 16-byte AEAD tag (`crypto-noise.ts`). Malformed inbound noise frame.
- `HANDSHAKE_COMPLETE` - A handshake-state operation was attempted after the handshake already completed (`crypto-noise.ts`). Library-internal lifecycle bug.
- `HANDSHAKE_REJECTED` - The device rejected the handshake in-band for a reason other than a wrong key, such as a malformed or unexpected handshake frame
  (`lifecycle/handshake.ts`). The message carries the device's reason text. Not a key problem, so it stays transient; a wrong key is reported instead as a permanent
  [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md).
- `INVALID_PSK_LENGTH` - The PSK, or a cipher key installed through `CipherState.InitializeKey`, is not exactly 32 bytes (`crypto-noise.ts`). Consumer-supplied
  configuration error; the connect-flow handshake re-tags the PSK case into a permanent [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md).
- `INVALID_REMOTE_KEY` - The remote ephemeral public key was malformed or a low-order point, so X25519 key agreement failed (`crypto-noise.ts`). The `diffieHellman`
  primitive rejected the peer key; the connect-flow handshake re-tags this into a permanent [EncryptionKeyInvalidError](../classes/EncryptionKeyInvalidError.md).
- `MISSING_KEYS` - A Diffie-Hellman or post-handshake step required keys that were not yet initialized (`crypto-noise.ts`, `lifecycle/handshake.ts`).
- `MSG_TOO_LONG` - Outbound noise message exceeded the 65535-byte protocol limit, `NOISE_MAX_MESSAGE_LEN`, which the frame writer (`transport.ts`) and the cipher
  (`crypto-noise.ts`) enforce. Indicates an oversized payload.
- `NONCE_EXHAUSTED` - The ChaCha20-Poly1305 nonce reached the reserved maximum 2^64 - 1 (`crypto-noise.ts`). Per Noise §5.1 that nonce is reserved for rekey and must
  never encrypt or decrypt a transport message; physically unreachable in practice (it would require 2^64 messages on one connection).
- `NOT_INITIALIZED` - Reserved for future use; no current throw site constructs this code. Kept in the union for forward compatibility.
- `PEER_CLOSED_NOISE` - The peer ended the TCP connection, whether as a close, a reset or a failed write, during the noise handshake before it had sent any Noise frame
  (`transport.ts`); an ending after the device has spoken Noise is an ordinary [ConnectionClosedByPeerError](../classes/ConnectionClosedByPeerError.md). Carried by [PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md).
- `PEER_PLAINTEXT_DURING_NOISE` - The peer responded with the plaintext indicator byte (0x00) during the noise handshake (`transport.ts`). Triggers the fallback to
  plaintext. Carried by [PeerClosedDuringNoiseError](../classes/PeerClosedDuringNoiseError.md).
- `SERVER_NAME_MISMATCH` - The device's noise-handshake server hello announced a server name other than the one the client's `serverName` option expects
  (`lifecycle/handshake.ts`). The check runs before any key is in use.
- `TRUNCATED_E` - The ephemeral public key segment in an inbound handshake message was shorter than 32 bytes (`crypto-noise.ts`, `lifecycle/handshake.ts`).
- `UNSUPPORTED_TOKEN` - The device's noise-handshake server-hello frame selected a protocol byte other than 1 (`lifecycle/handshake.ts`). Indicates the peer
  negotiated a noise protocol variant this client does not support.
