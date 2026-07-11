/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * crypto-noise.ts: A complete Node-native Noise_NNpsk0_25519_ChaChaPoly_SHA256 handshake implementation with no external dependencies.
 */

/**
 * Node-native Noise_NNpsk0_25519_ChaChaPoly_SHA256 handshake implementation with no external dependencies.
 *
 * @remarks Implements the handshake using only Node's built-in `crypto` primitives (X25519 via `diffieHellman`, ChaCha20-Poly1305 via `createCipheriv`, SHA-256 via
 * `createHash`, HKDF via `hkdfSync`). Exports {@link HandshakeState} (the high-level driver), {@link CipherState} (a single-direction cipher state; the handshake
 * produces a pair of them for bidirectional traffic), the ESPHome-specific prologue constant, and the typed {@link NoiseHandshakeError} thrown on failure.
 * After the handshake completes, the returned cipher pair carries the keys for bidirectional encrypted traffic on the live transport.
 *
 * @module crypto-noise
 */
import type { EspHomeLogging, Nullable } from "./types.ts";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { Buffer } from "node:buffer";
import type { KeyObject } from "node:crypto";
import { NoiseHandshakeError } from "./errors.ts";

// Protocol constants that define the specific Noise protocol variant we're implementing.
const PROTOCOL_NAME = "Noise_NNpsk0_25519_ChaChaPoly_SHA256";
const DH_LEN = 32;
const CIPHER_ALGO = "chacha20-poly1305";
const AUTH_TAG_LEN = 16;
const HASH_ALGO = "sha256";

// Cached empty buffer used as the standard empty-AD/empty-payload argument across the handshake, avoiding repeated zero-length allocations at the handshake call sites.
const EMPTY_BUFFER = Buffer.alloc(0);

/**
 * Maximum Noise protocol message length as specified in the Noise Protocol Framework.
 */
export const NOISE_MAX_MESSAGE_LEN = 65535;

/**
 * Required length for pre-shared keys in bytes.
 */
export const NOISE_PSK_LEN = 32;

/**
 * The maximum ChaCha20-Poly1305 nonce (2^64 - 1). Per Noise Protocol Framework §5.1 this value is RESERVED for {@link CipherState.Rekey} and must never encrypt or
 * decrypt a transport message. The single source of truth for both the rekey nonce and the exhaustion guard in {@link CipherState.EncryptWithAd} / {@link
 * CipherState.DecryptWithAd}.
 */
const MAX_NONCE = (1n << 64n) - 1n;

/**
 * Length of Diffie-Hellman public keys in bytes.
 */
export const NOISE_DH_LEN = 32;

/**
 * ESPHome Noise protocol prologue prefix used for all ESPHome API connections. This identifies the connection as using the ESPHome Native API protocol.
 */
export const ESPHOME_NOISE_PROLOGUE = "NoiseAPIInit\x00\x00";

// Cache the protocol name hash since it never changes. Per Noise §5.2, when the protocol-name buffer is at most HASHLEN (32) bytes, it is zero-padded into the hash;
// otherwise it is itself hashed. The actual protocol name "Noise_NNpsk0_25519_ChaChaPoly_SHA256" is 36 bytes, so the hashed branch is the one that fires. We skip the
// short-name branch entirely - re-add it (with a test) only if a future refactor introduces a pattern whose name is short enough to need it.
const PROTOCOL_NAME_HASH = createHash(HASH_ALGO).update(Buffer.from(PROTOCOL_NAME, "ascii")).digest();

// The Noise spec defines a wider set of pattern tokens (psk, e, ee, es, se, ss, s) used across various handshake patterns. NNpsk0 only uses three of them, and this
// module is committed to NNpsk0 specifically: the narrow type below is the dispatch contract, and adding a new token to a future pattern is an explicit, deliberate
// extension - not a silent rule violation. Using the narrow union as the switch input makes processWriteToken and processReadToken exhaustive without a default
// arm, and TypeScript will reject any attempt to add a token to NNPSK0_PATTERN that this dispatch doesn't handle.
type NNpsk0Token = "e" | "ee" | "psk";
type MessagePattern = readonly NNpsk0Token[];
type HandshakePattern = readonly MessagePattern[];

// The NNpsk0 handshake pattern: first message mixes PSK and sends ephemeral, second message sends ephemeral and performs DH.
const NNPSK0_PATTERN: HandshakePattern = [

  [ "psk", "e" ] as const,
  [ "e", "ee" ] as const
];

/**
 * Role in the Noise protocol handshake.
 */
export type NoiseRole = "initiator" | "responder";

/**
 * Options for creating a Noise handshake.
 */
export interface NoiseHandshakeOptions {

  /** The role this party plays in the handshake. */
  role: NoiseRole;

  /** The 32-byte pre-shared key for authentication. */
  psk: Buffer;

  /** Optional prologue data to bind to the handshake. */
  prologue?: Buffer;

  /** Optional logger for debugging output. */
  logger?: EspHomeLogging;
}

/**
 * Options for creating an ESPHome Noise handshake.
 * This is a specialized version for connecting to ESPHome devices.
 */
export interface ESPHomeHandshakeOptions {

  /** The role in the handshake (defaults to "initiator" for clients). */
  role?: "initiator" | "responder";

  /** The 32-byte pre-shared key configured in the ESPHome device. */
  psk: Buffer;

  /** Optional additional data to append to the ESPHome prologue. */
  additionalPrologueData?: Buffer;

  /** Optional logger for debugging output. */
  logger?: EspHomeLogging;
}

// NoiseHandshakeError is imported from "./errors.ts" so the entire library shares one error hierarchy. Its companion NoiseHandshakeErrorCode union lives in the same
// module but is not referenced here. Consumers import the same names from the same package entry point because index.ts re-exports the errors module.

/**
 * Generates an X25519 key pair and returns both the private key and raw 32-byte public key.
 * This encapsulates the Node.js crypto API complexity for cleaner usage throughout the code.
 */
function generateX25519KeyPair(): { privateKey: KeyObject; publicKeyRaw: Buffer } {

  const { publicKey, privateKey } = generateKeyPairSync("x25519");

  // Export directly as SPKI DER and extract the last 32 bytes which contain the raw public key. We do this as an efficiency win rather than going through
  // JWK encoding/decoding.
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRaw = spki.subarray(spki.length - 32);

  return { privateKey, publicKeyRaw };
}

/**
 * Creates an X25519 public key object from raw 32-byte key material.
 * This handles the SPKI DER construction that Node.js requires for key import.
 */
function importX25519PublicKey(rawKey: Buffer): KeyObject {

  // SPKI DER prefix for X25519 keys (OID 1.3.101.110). The raw key follows this prefix.
  const spkiPrefix = Buffer.from([ 0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00 ]);
  const spkiDer = Buffer.concat([ spkiPrefix, rawKey ]);

  return createPublicKey({ format: "der", key: spkiDer, type: "spki" });
}

/**
 * HKDF implementation using Node.js native hkdfSync, matching Noise Protocol Framework §4.3.
 * Derives multiple output keys from input key material using the specified hash algorithm.
 */
function hkdf(chainingKey: Buffer, ikm: Buffer, numOutputs: 2): [Buffer, Buffer];
function hkdf(chainingKey: Buffer, ikm: Buffer, numOutputs: 3): [Buffer, Buffer, Buffer];

function hkdf(chainingKey: Buffer, ikm: Buffer, numOutputs: 2 | 3): [Buffer, Buffer] | [Buffer, Buffer, Buffer] {

  const outputLength = 32 * numOutputs;

  // The Noise Protocol's HKDF matches RFC 5869 with an empty info parameter. The chaining key serves as the salt.
  const derivedKeyArray = hkdfSync(HASH_ALGO, ikm, chainingKey, EMPTY_BUFFER, outputLength);

  // Convert ArrayBuffer to Buffer and split into separate 32-byte keys.
  const derivedKey = Buffer.from(derivedKeyArray);

  if(numOutputs === 2) {

    return [ derivedKey.subarray(0, 32), derivedKey.subarray(32, 64) ];
  } else {

    return [ derivedKey.subarray(0, 32), derivedKey.subarray(32, 64), derivedKey.subarray(64, 96) ];
  }
}

/**
 * CipherState manages the encryption state for a single direction of communication.
 * Implements the CipherState object as specified in Noise Protocol Framework §5.1 using ChaCha20-Poly1305.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#crypto-noise-associated-data}
 */
export class CipherState {

  // Our encryption key.
  private k: Nullable<Buffer>;

  // The nonce counter for ChaCha20-Poly1305.
  private n;

  // The nonce buffer.
  private readonly nonce;

  // Optional logger reference, captured for debug output during cipher operations.
  private readonly log: EspHomeLogging | undefined;

  constructor(log?: EspHomeLogging) {

    this.k = null;
    this.n = 0n;

    // We allocate the nonce buffer only once as a performance optimization and reuse it throughout our session.
    this.nonce = Buffer.alloc(12);
    this.log = log;
  }

  /**
   * Initializes the cipher state with a new key, resetting the nonce counter to zero.
   */
  public InitializeKey(key: Nullable<Buffer>): void {

    this.k = key;
    this.n = 0n;
    this.log?.debug("CipherState: Key initialized, hasKey=" + String(key !== null) + ".");
  }

  /**
   * Checks whether this cipher state has an encryption key set.
   */
  public HasKey(): boolean {

    return this.k !== null;
  }

  /**
   * Updates the reusable nonce buffer with the current counter value in little-endian format at offset 4.
   */
  private updateNonce(): Buffer {

    // The first four bytes are always zeros per ChaCha20-Poly1305 specification.
    this.nonce.fill(0, 0, 4);
    this.nonce.writeBigUInt64LE(this.n, 4);

    return this.nonce;
  }

  /**
   * Encrypts plaintext with associated data using ChaCha20-Poly1305. Returns plaintext unchanged if no key is set.
   */
  public EncryptWithAd(ad: Buffer, plaintext: Buffer): Buffer {

    // Without a key, return plaintext unchanged (happens during handshake before encryption is established).
    if(!this.HasKey() || (this.k === null)) {

      return plaintext;
    }

    // Noise §5.1: the maximum nonce (2^64 - 1) is reserved for Rekey and must never encrypt a transport message. Refuse it with a typed error before the nonce is
    // consumed, rather than encrypting under the reserved nonce and then throwing a raw RangeError from writeBigUInt64LE on the following call.
    if(this.n >= MAX_NONCE) {

      throw new NoiseHandshakeError("Nonce exhausted: the reserved maximum nonce must not encrypt a transport message.", "NONCE_EXHAUSTED");
    }

    if(plaintext.length + AUTH_TAG_LEN > NOISE_MAX_MESSAGE_LEN) {

      throw new NoiseHandshakeError("Message too long", "MSG_TOO_LONG");
    }

    const cipher = createCipheriv(CIPHER_ALGO, this.k, this.updateNonce(), { authTagLength: AUTH_TAG_LEN });

    // We pass plaintextLength purely for symmetry with the CCM-capable setAAD call shape. The option only matters for CCM-mode ciphers, so ChaCha20-Poly1305
    // ignores it - it is harmless here and simply keeps the call shape uniform.
    cipher.setAAD(ad, { plaintextLength: plaintext.length });

    // For empty plaintext, we still need to generate the auth tag.
    const ct = plaintext.length === 0 ? cipher.final() : Buffer.concat([ cipher.update(plaintext), cipher.final() ]);

    const tag = cipher.getAuthTag();

    this.log?.debug("CipherState: Encrypted with nonce=" + String(this.n) + ", plaintext=" + String(plaintext.length) + " bytes, ciphertext=" + String(ct.length) +
      " bytes.");
    this.n++;

    return Buffer.concat([ ct, tag ]);
  }

  /**
   * Decrypts ciphertext with associated data using ChaCha20-Poly1305. Returns input unchanged if no key is set.
   */
  public DecryptWithAd(ad: Buffer, data: Buffer): Buffer {

    // Without a key, return data unchanged (happens during handshake before encryption is established).
    if(!this.HasKey() || (this.k === null)) {

      return data;
    }

    // Noise §5.1: refuse the reserved maximum nonce on the receive side too (see {@link EncryptWithAd}).
    if(this.n >= MAX_NONCE) {

      throw new NoiseHandshakeError("Nonce exhausted: the reserved maximum nonce must not decrypt a transport message.", "NONCE_EXHAUSTED");
    }

    // We reject packets that are shorter than our tag length.
    if(data.length < AUTH_TAG_LEN) {

      throw new NoiseHandshakeError("Ciphertext too short", "CT_TOO_SHORT");
    }

    // Split the input into ciphertext and authentication tag.
    const ciphertext = data.subarray(0, data.length - AUTH_TAG_LEN);
    const tag = data.subarray(data.length - AUTH_TAG_LEN);

    const decipher = createDecipheriv(CIPHER_ALGO, this.k, this.updateNonce(), { authTagLength: AUTH_TAG_LEN });

    decipher.setAAD(ad, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);

    try {

      // For empty ciphertext, just verify the tag without calling update.
      const pt = ciphertext.length === 0 ? decipher.final() : Buffer.concat([ decipher.update(ciphertext), decipher.final() ]);

      this.log?.debug("CipherState: Decrypted with nonce=" + String(this.n) + ", ciphertext=" + String(ciphertext.length) +
        " bytes, plaintext=" + String(pt.length) + " bytes.");
      this.n++;

      return pt;
    } catch(e) {

      if(e instanceof Error) {

        this.log?.error("CipherState: Decryption failed: " + e.message + ".");
      }
      throw new NoiseHandshakeError("Authentication failed", "AUTH_FAILED", { cause: e });
    }
  }

  /**
   * Rekeys the cipher state by encrypting zeros with the maximum nonce value, providing forward secrecy.
   */
  public Rekey(): void {

    if(!this.HasKey() || (this.k === null)) {

      return;
    }

    // Use the reserved maximum nonce (2^64 - 1) for the rekey operation - the same {@link MAX_NONCE} the AEAD entry points refuse for transport messages.
    this.nonce.fill(0, 0, 4);
    this.nonce.writeBigUInt64LE(MAX_NONCE, 4);

    // Encrypt 32 bytes of zeros to generate the new key material. Must be zeros for the rekey operation.
    const zeros = Buffer.alloc(32);
    const cipher = createCipheriv(CIPHER_ALGO, this.k, this.nonce, { authTagLength: AUTH_TAG_LEN });

    cipher.setAAD(EMPTY_BUFFER, { plaintextLength: zeros.length });
    const ct = Buffer.concat([ cipher.update(zeros), cipher.final() ]);

    // The first 32 bytes of the ciphertext become our new key.
    this.InitializeKey(ct.subarray(0, 32));
    this.log?.debug("CipherState: Rekey operation completed successfully.");
  }

  /**
   * Zero out the key material and reset state. The key Buffer is filled with zeros before the reference is dropped, ensuring sensitive material does not linger in
   * memory waiting on garbage collection. Safe to call more than once.
   */
  public destroy(): void {

    if(this.k) {

      this.k.fill(0);
      this.k = null;
    }

    this.nonce.fill(0);
    this.n = 0n;
  }

  /**
   * Symbol.dispose hook so consumers can `using cipher = new CipherState(log);` and have key material zeroized deterministically when the binding leaves scope. Aliased
   * to {@link destroy} for callers that prefer the explicit method.
   */
  public [Symbol.dispose](): void {

    this.destroy();
  }
}

/**
 * SymmetricState manages the symmetric cryptography operations during the handshake.
 * Implements the SymmetricState object as specified in Noise Protocol Framework §5.2.
 */
class SymmetricState {

  // The chaining key for key derivation.
  private ck: Buffer = Buffer.alloc(0);

  // The handshake hash.
  private h: Buffer = Buffer.alloc(0);

  // The cipher state for encryption/decryption.
  private cs: CipherState;

  // Optional logger reference, mirrored to the underlying CipherState so handshake-phase debug output stays attributable.
  private readonly log: EspHomeLogging | undefined;

  constructor(log?: EspHomeLogging) {

    this.cs = new CipherState(log);
    this.log = log;
  }

  /**
   * Initializes the symmetric state with the protocol name, setting up initial handshake hash and chaining key.
   */
  public InitializeSymmetric(): void {

    // Use the cached protocol name hash for efficiency.
    this.h = Buffer.from(PROTOCOL_NAME_HASH);
    this.ck = Buffer.from(PROTOCOL_NAME_HASH);

    // We initialize the cipher state with no key.
    this.cs.InitializeKey(null);

    this.log?.debug("SymmetricState: Initialized with protocol \"" + PROTOCOL_NAME + "\".");
  }

  /**
   * Mixes data into the handshake hash to maintain a running hash of all handshake data for authentication.
   */
  public MixHash(data: Buffer): void {

    this.h = createHash(HASH_ALGO).update(Buffer.concat([ this.h, data ])).digest();
    this.log?.debug("SymmetricState: Mixed data into hash, new h=" + this.h.toString("hex") + ".");
  }

  /**
   * Mixes input key material into the chaining key and derives a new encryption key.
   */
  public MixKey(ikm: Buffer): void {

    const [ ck, tempK ] = hkdf(this.ck, ikm, 2);

    this.ck = ck;
    this.cs.InitializeKey(tempK);

    // We log only a non-reversible progress signal here - NEVER the chaining key itself. The `ck` transitively incorporates the PSK and the DH shared secrets and is the
    // exact HKDF input that Split() expands into the live transport ChaCha20 keys, so emitting it (even at debug) would let anyone with the log re-derive the session
    // keys, defeating the zeroization this module performs everywhere else.
    this.log?.debug("SymmetricState: Mixed key material into the chaining key.");
  }

  /**
   * Mixes input key material into both the chaining key and handshake hash (used for PSK operations).
   */
  public MixKeyAndHash(ikm: Buffer): void {

    const [ ck, tempH, tempK ] = hkdf(this.ck, ikm, 3);

    this.ck = ck;
    this.MixHash(tempH);
    this.cs.InitializeKey(tempK);
    this.log?.debug("SymmetricState: Mixed key and hash with PSK material.");
  }

  /**
   * Encrypts plaintext and mixes the ciphertext into the handshake hash.
   */
  public EncryptAndHash(plaintext: Buffer): Buffer {

    const c = this.cs.EncryptWithAd(this.h, plaintext);

    this.MixHash(c);

    return c;
  }

  /**
   * Decrypts ciphertext and mixes it into the handshake hash.
   */
  public DecryptAndHash(ciphertext: Buffer): Buffer {

    const p = this.cs.DecryptWithAd(this.h, ciphertext);

    // Mix the ciphertext into the handshake hash.
    this.MixHash(ciphertext);

    return p;
  }

  /**
   * Splits the symmetric state into two cipher states for bidirectional communication at handshake completion.
   */
  public Split(): [CipherState, CipherState] {

    // Single HKDF call producing 64 bytes (two 32-byte keys) is cheaper than two 32-byte derivations because the underlying expansion is sequential by construction.
    const derivedKey = Buffer.from(hkdfSync(HASH_ALGO, EMPTY_BUFFER, this.ck, EMPTY_BUFFER, 64));

    const c1 = new CipherState(this.log);
    const c2 = new CipherState(this.log);

    // Use subarray to create views without copying the underlying buffer.
    c1.InitializeKey(derivedKey.subarray(0, 32));
    c2.InitializeKey(derivedKey.subarray(32, 64));

    this.log?.debug("SymmetricState: Split into two cipher states for transport encryption.");

    return [ c1, c2 ];
  }

  /**
   * Zero out the chaining key, handshake hash, and the embedded CipherState's key. Cascades to {@link CipherState.destroy} so all derived key material is wiped together.
   * Safe to call more than once.
   */
  public destroy(): void {

    this.ck.fill(0);
    this.h.fill(0);
    this.cs.destroy();
  }

}

/**
 * HandshakeState manages the complete Noise protocol handshake, implementing the NNpsk0 pattern with optional prologue support. This class implements the
 * HandshakeState object as specified in Noise Protocol Framework §5.3. After the handshake completes, the sendCipher and receiveCipher properties provide access to
 * the encryption states for ongoing communication.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#crypto-noise-error-handling}
 *
 */
export class HandshakeState {

  // Cipher for sending encrypted messages after handshake. We type this as `T | undefined` rather than `T?` because destroy() explicitly assigns undefined as part of
  // the zero-out semantics; presence-with-undefined is intentional, not field-omission.
  public sendCipher: CipherState | undefined;

  // Cipher for receiving encrypted messages after handshake. Same `T | undefined` rationale as sendCipher.
  public receiveCipher: CipherState | undefined;

  // Whether the handshake has completed successfully.
  public isComplete = false;

  // The symmetric state managing the handshake.
  private ss: SymmetricState;

  // Our ephemeral key pair. Typed `T | undefined` (not `T?`) because destroy() resets it to undefined as a security measure.
  private ephemeral: { privateKey: KeyObject; publicKeyRaw: Buffer } | undefined;

  // The remote party's public key. Same `T | undefined` rationale.
  private remotePubKey: KeyObject | undefined;

  // Current position in the handshake pattern.
  private patternIndex = 0;

  // Handshake role - true if we're the initiator (client), false if responder.
  private readonly initiator: boolean;

  // The pre-shared key for the NNpsk0 pattern. Held read-only for the lifetime of the handshake.
  private readonly psk: Buffer;

  // Optional logger reference for debug output during handshake processing.
  private readonly log: EspHomeLogging | undefined;

  /**
   * Constructs a new handshake state for the NNpsk0 pattern.
   *
   * @param initiator - True if we're the initiator, false if we're the responder.
   * @param psk - The 32-byte pre-shared key for authentication.
   * @param log - Optional logger for debugging.
   * @param prologue - Optional fixed prologue bytes to mix into the handshake hash.
   * @throws {NoiseHandshakeError} If the PSK is not exactly 32 bytes.
   */
  constructor(initiator: boolean, psk: Buffer, log?: EspHomeLogging, prologue: Buffer = EMPTY_BUFFER) {

    if(psk.length !== NOISE_PSK_LEN) {

      throw new NoiseHandshakeError("PSK must be exactly " + String(NOISE_PSK_LEN) + " bytes, got " + String(psk.length) + ".", "INVALID_PSK_LENGTH");
    }

    this.initiator = initiator;
    this.psk = psk;
    this.log = log;
    this.ss = new SymmetricState(log);

    // Folds the Noise protocol name into the handshake hash, anchoring every subsequent MixHash and MixKey operation to this specific pattern.
    this.ss.InitializeSymmetric();

    // Mix the prologue into the handshake hash before any messages to bind the handshake to pre-agreed context data.
    this.ss.MixHash(prologue);
    this.log?.debug("HandshakeState: Mixed prologue into initial hash: " + prologue.toString("hex") + ".");

    this.log?.debug("HandshakeState: Initialized as " + (initiator ? "initiator" : "responder") + ".");
  }

  // Single source of truth for "advance to the next handshake step." Returns the pattern at the current index, throws if the pattern is exhausted, and advances the
  // index in one place. Returning a non-undefined MessagePattern means callers don't need their own bounds re-checks - TS narrowing carries through the return type,
  // so writeMessage and readMessage operate on a guaranteed-present pattern without a follow-up `if(!pattern)`.
  private nextPatternStep(): MessagePattern {

    const pattern = NNPSK0_PATTERN[this.patternIndex];

    if(!pattern) {

      throw new NoiseHandshakeError("Handshake already complete", "HANDSHAKE_COMPLETE");
    }

    this.patternIndex++;

    return pattern;
  }

  // Validate-and-extract for the DH inputs: throws when either key is missing, returns the (now non-nullable) keys when both are present. The return-narrowed shape -
  // rather than an `asserts this is ...` form on this method - is the more direct masterclass pattern: callers see exactly what's being validated and what comes out,
  // narrowing flows by destructuring rather than by an implicit predicate on the receiver, and we sidestep TypeScript's nominal-private-field semantics that make
  // intersecting the receiver type with private fields collapse to `never`. Single source of truth for the DH-key rule; no redundant null re-checks downstream.
  private requireKeysForDH(): { privateKey: KeyObject; remotePubKey: KeyObject } {

    if(!this.ephemeral || !this.remotePubKey) {

      throw new NoiseHandshakeError("Missing keys for Diffie-Hellman operation", "MISSING_KEYS");
    }

    return { privateKey: this.ephemeral.privateKey, remotePubKey: this.remotePubKey };
  }

  // Single source of truth for the X25519 key-agreement step shared by both `ee` token sites (write and read). Node's `diffieHellman` throws a RAW OpenSSL error
  // (ERR_OSSL_FAILED_DURING_DERIVATION) when the remote ephemeral is malformed or a low-order point. Because this is a PUBLIC module, we must never leak that raw error;
  // we wrap it in our own typed `NoiseHandshakeError` (code `INVALID_REMOTE_KEY`) preserving the original on the `cause` chain. The error stays phase-agnostic by design:
  // the primitive cannot know whether this is the connect-flow handshake or some other use, so the connect-flow orchestrator (`lifecycle/handshake.ts`) is what re-tags
  // this into the permanent `EncryptionKeyInvalidError`.
  private computeDH(keys: { privateKey: KeyObject; remotePubKey: KeyObject }): Buffer {

    try {

      return diffieHellman({ privateKey: keys.privateKey, publicKey: keys.remotePubKey });
    } catch(err) {

      throw new NoiseHandshakeError("X25519 key agreement failed; the remote ephemeral public key is invalid.", "INVALID_REMOTE_KEY", { cause: err });
    }
  }

  /**
   * Processes a single token during message writing.
   */
  private processWriteToken(token: NNpsk0Token): Buffer {

    switch(token) {

      case "psk":

        this.log?.debug("HandshakeState: Mixing PSK into handshake state.");
        this.ss.MixKeyAndHash(this.psk);

        return EMPTY_BUFFER;

      case "e": {

        // Generate a new ephemeral key pair and send the public key.
        const { privateKey, publicKeyRaw } = generateX25519KeyPair();

        this.ephemeral = { privateKey, publicKeyRaw };

        // Mix the public key into the handshake state.
        this.ss.MixHash(publicKeyRaw);
        this.ss.MixKey(publicKeyRaw);

        this.log?.debug("HandshakeState: Sending ephemeral public key: " + publicKeyRaw.toString("hex") + ".");

        return publicKeyRaw;
      }

      case "ee": {

        // Compute the shared secret using X25519 (via the shared, raw-error-wrapping helper) and mix it into the handshake state.
        const dh = this.computeDH(this.requireKeysForDH());

        this.ss.MixKey(dh);
        this.log?.debug("HandshakeState: Processed ephemeral-ephemeral DH exchange.");

        return EMPTY_BUFFER;
      }
    }
  }

  /**
   * Processes a single token during message reading.
   */
  private processReadToken(token: NNpsk0Token, message: Buffer, index: number): number {

    switch(token) {

      case "psk":

        this.log?.debug("HandshakeState: Mixing PSK into handshake state.");
        this.ss.MixKeyAndHash(this.psk);

        return 0;

      case "e": {

        // Verify we actually have 32 bytes.
        if((message.length - index) < DH_LEN) {

          throw new NoiseHandshakeError("Truncated ephemeral key", "TRUNCATED_E");
        }

        // Read the remote ephemeral public key from the message.
        const remoteKeyRaw = message.subarray(index, index + DH_LEN);

        // Mix the remote public key into the handshake state.
        this.ss.MixHash(remoteKeyRaw);
        this.ss.MixKey(remoteKeyRaw);

        // Import the raw key as a KeyObject for DH operations.
        this.remotePubKey = importX25519PublicKey(remoteKeyRaw);

        this.log?.debug("HandshakeState: Received ephemeral public key: " + remoteKeyRaw.toString("hex") + ".");

        return DH_LEN;
      }

      case "ee": {

        // Compute the shared secret using X25519 (via the shared, raw-error-wrapping helper) and mix it into the handshake state.
        const dh = this.computeDH(this.requireKeysForDH());

        this.ss.MixKey(dh);
        this.log?.debug("HandshakeState: Processed ephemeral-ephemeral DH exchange.");

        return 0;
      }
    }
  }

  /**
   * Writes a handshake message according to the next pattern in the sequence.
   *
   * @param payload - Optional payload data to encrypt and include in the message.
   * @returns The complete handshake message to send.
   * @throws {NoiseHandshakeError} If the handshake is already complete or if pattern processing fails.
   *
   */
  public writeMessage(payload: Buffer = EMPTY_BUFFER): Buffer {

    const pattern = this.nextPatternStep();

    // Collect message parts to minimize concatenation operations.
    const parts: Buffer[] = [];

    // Process each token in the pattern and collect non-empty outputs.
    for(const token of pattern) {

      const tokenOutput = this.processWriteToken(token);

      if(tokenOutput.length > 0) {

        parts.push(tokenOutput);
      }
    }

    // Encrypt and add the payload. NNpsk0 always emits at least 32 bytes from the first token (the ephemeral key), so an empty-message early-return path is
    // unreachable. Re-add such a path (with a covering test) only if a future pattern with zero-byte tokens is introduced.
    const encPayload = this.ss.EncryptAndHash(payload);

    if(encPayload.length > 0) {

      parts.push(encPayload);
    }

    // Optimize for common cases to avoid unnecessary concatenation. The `?? EMPTY_BUFFER` fallback is unreachable at runtime - parts.length === 1 guarantees parts[0]
    // exists - but it satisfies the strict-mode index-access check without a non-null assertion.
    const out: Buffer = (parts.length === 0) ? EMPTY_BUFFER : ((parts.length === 1) ? (parts[0] ?? EMPTY_BUFFER) : Buffer.concat(parts));

    this.log?.debug("HandshakeState: Wrote message with " + String(payload.length) + " byte payload.");

    // If this was the last message and we're the responder, split the state (responder splits after writing final message).
    if((this.patternIndex >= NNPSK0_PATTERN.length) && !this.initiator) {

      const [ c1, c2 ] = this.ss.Split();

      this.receiveCipher = c1;
      this.sendCipher = c2;
      this.isComplete = true;

      this.log?.debug("HandshakeState: Handshake complete (responder split on write).");
    }

    return out;
  }

  /**
   * Reads a handshake message according to the next pattern in the sequence.
   *
   * @param message - The received handshake message to process.
   * @returns The decrypted payload from the message.
   * @throws {NoiseHandshakeError} If the handshake is already complete or authentication fails.
   *
   */
  public readMessage(message: Buffer): Buffer {

    const pattern = this.nextPatternStep();

    let index = 0;

    // Process each token in the pattern.
    for(const token of pattern) {

      const bytesConsumed = this.processReadToken(token, message, index);

      index += bytesConsumed;
    }

    // Decrypt the payload from the remainder of the message.
    const cipherPayload = message.subarray(index);
    const payload = this.ss.DecryptAndHash(cipherPayload);

    this.log?.debug("HandshakeState: Read message with " + String(payload.length) + " byte payload.");

    // If this was the last message and we're the initiator, split the state (initiator splits after reading final message).
    if((this.patternIndex >= NNPSK0_PATTERN.length) && this.initiator) {

      const [ c1, c2 ] = this.ss.Split();

      this.sendCipher = c1;
      this.receiveCipher = c2;
      this.isComplete = true;

      this.log?.debug("HandshakeState: Handshake complete (initiator split on read).");
    }

    return payload;
  }

  /**
   * Clears sensitive key material from memory where possible. Note: cannot clear `KeyObject` internal memory in Node.js.
   */
  public destroy(): void {

    // Clear ephemeral public key material that we own directly.
    if(this.ephemeral) {

      this.ephemeral.publicKeyRaw.fill(0);
    }

    // Zero the pre-shared key in place so the failure-path teardown also wipes it; .fill(0) mutates the buffer contents without reassigning the readonly reference.
    this.psk.fill(0);

    // Cascade destroy() to the symmetric state and the post-handshake cipher states. Each child zeros its own key material before we drop the references. This is the
    // piece of the destroy contract that matters: setting fields to undefined alone leaves the underlying key bytes sitting in memory until garbage collection.
    this.ss.destroy();
    this.sendCipher?.destroy();
    this.receiveCipher?.destroy();

    // Mark the handshake exhausted so any post-destroy method call no-ops or fails fast rather than touching now-freed key material.
    this.patternIndex = NNPSK0_PATTERN.length;
    this.isComplete = false;
    this.ephemeral = undefined;
    this.remotePubKey = undefined;
    this.sendCipher = undefined;
    this.receiveCipher = undefined;
  }

  /**
   * Symbol.dispose hook for the explicit-resource-management proposal. Lets consumers write `using handshake = createESPHomeHandshake({ ... });` and have key material
   * zeroized deterministically when the binding leaves scope, including on thrown errors. Aliased to {@link destroy} so call sites and `using` agree on behavior.
   */
  public [Symbol.dispose](): void {

    this.destroy();
  }

  /**
   * Zeroize the handshake-only secrets - the PSK, the `SymmetricState` chaining key / handshake hash (and its embedded handshake cipher), and our ephemeral public
   * key - while LEAVING the post-handshake {@link sendCipher} / {@link receiveCipher} intact. Called on the success path AFTER the cipher pair has been installed on the
   * transport, so the live session keys survive while the now-spent handshake inputs (the PSK and the HKDF chaining material that derived the session keys) do not linger
   * in memory. The cipher references are relinquished (set to undefined, NOT destroyed) because ownership has transferred to the transport via `installCipher`; this also
   * makes a later {@link destroy} on this spent handshake a safe no-op that can never zero the transport's live keys. Contrast {@link destroy}, which additionally
   * cascades into the cipher states and is the correct teardown for a FAILED handshake (no ciphers in use). Safe to call more than once. Best-effort: Node Buffer
   * zeroization cannot guarantee the GC made no prior copy.
   */
  public destroyHandshakeSecrets(): void {

    this.psk.fill(0);
    this.ss.destroy();

    if(this.ephemeral) {

      this.ephemeral.publicKeyRaw.fill(0);
    }

    this.ephemeral = undefined;
    this.remotePubKey = undefined;

    // Relinquish - do NOT destroy - the post-handshake ciphers: the transport owns them now.
    this.sendCipher = undefined;
    this.receiveCipher = undefined;
  }
}

/**
 * Factory function to create a Noise handshake with a cleaner API. This is the primary way to create a handshake for general Noise protocol usage. For ESPHome
 * specific connections, use {@link createESPHomeHandshake} instead.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#crypto-noise-handshake-basic}
 *
 * @param options - Configuration options for the handshake.
 * @returns A configured HandshakeState instance ready for the handshake process.
 *
 */
export function createHandshake(options: NoiseHandshakeOptions): HandshakeState {

  return new HandshakeState(options.role === "initiator", options.psk, options.logger, options.prologue);
}

/**
 * Factory function to create a Noise handshake specifically for ESPHome connections. This function automatically configures the correct prologue for ESPHome Native
 * API communication. ESPHome devices expect a specific prologue format and this function handles that setup automatically.
 *
 * Usage:
 *
 * {@includeCode ./examples/showcase.ts#crypto-noise-esphome-connection}
 *
 * Usage (with logging):
 *
 * {@includeCode ./examples/showcase.ts#crypto-noise-with-logging}
 *
 * @param options - Configuration options for the ESPHome handshake.
 * @returns A configured HandshakeState instance ready for ESPHome communication.
 *
 */
export function createESPHomeHandshake(options: ESPHomeHandshakeOptions): HandshakeState {

  options.role ??= "initiator";

  // ESPHome always uses "NoiseAPIInit" as the prologue prefix. Additional data can be appended if needed, but typically isn't used.
  let prologue = Buffer.from(ESPHOME_NOISE_PROLOGUE, "utf8");

  if(options.additionalPrologueData && (options.additionalPrologueData.length > 0)) {

    // Concatenate the ESPHome prologue with any additional data.
    prologue = Buffer.concat([ prologue, options.additionalPrologueData ]);
  }

  return new HandshakeState(options.role === "initiator", options.psk, options.logger, prologue);
}
