/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * crypto-noise.test.ts: Unit tests for the Noise NNpsk0 implementation primitives.
 */
import { CipherState, ESPHOME_NOISE_PROLOGUE, NOISE_DH_LEN, NOISE_MAX_MESSAGE_LEN, NOISE_PSK_LEN, createESPHomeHandshake, createHandshake } from "./crypto-noise.ts";
import { createCipheriv, createHash, hkdfSync } from "node:crypto";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import { NoiseHandshakeError } from "./errors.ts";
import assert from "node:assert/strict";

describe("Noise constants", () => {

  test("NOISE_PSK_LEN is 32", () => {

    assert.equal(NOISE_PSK_LEN, 32);
  });

  test("NOISE_DH_LEN is 32 (X25519 key length)", () => {

    assert.equal(NOISE_DH_LEN, 32);
  });

  test("NOISE_MAX_MESSAGE_LEN is 65535 (16-bit length prefix max)", () => {

    assert.equal(NOISE_MAX_MESSAGE_LEN, 65535);
  });

  test("ESPHOME_NOISE_PROLOGUE is the literal 'NoiseAPIInit\\x00\\x00'", () => {

    assert.equal(ESPHOME_NOISE_PROLOGUE, "NoiseAPIInit\x00\x00");
    assert.equal(ESPHOME_NOISE_PROLOGUE.length, 14);
  });
});

describe("CipherState", () => {

  test("HasKey is false until InitializeKey is called", () => {

    const cs = new CipherState();

    assert.equal(cs.HasKey(), false);
  });

  test("InitializeKey with a Buffer flips HasKey to true", () => {

    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32, 0x42));

    assert.equal(cs.HasKey(), true);
  });

  test("InitializeKey with null clears the key", () => {

    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32));
    cs.InitializeKey(null);

    assert.equal(cs.HasKey(), false);
  });

  test("EncryptWithAd returns plaintext unchanged when no key is set (passthrough during handshake)", () => {

    const cs = new CipherState();
    const plaintext = Buffer.from("hello", "utf8");

    assert.deepEqual(cs.EncryptWithAd(Buffer.alloc(0), plaintext), plaintext);
  });

  test("DecryptWithAd returns data unchanged when no key is set", () => {

    const cs = new CipherState();
    const data = Buffer.from([ 0x01, 0x02, 0x03 ]);

    assert.deepEqual(cs.DecryptWithAd(Buffer.alloc(0), data), data);
  });

  test("encrypt/decrypt round-trips with a fixed key", () => {

    const key = Buffer.alloc(32, 0xab);
    const enc = new CipherState();
    const dec = new CipherState();

    enc.InitializeKey(key);
    dec.InitializeKey(key);

    const ad = Buffer.from("associated", "utf8");
    const plaintext = Buffer.from("the quick brown fox", "utf8");

    const ct = enc.EncryptWithAd(ad, plaintext);

    // Ciphertext must NOT equal plaintext (must include the 16-byte auth tag at minimum).
    assert.notDeepEqual(ct, plaintext);
    assert.equal(ct.length, plaintext.length + 16, "ciphertext is plaintext + 16-byte poly1305 tag");

    const decoded = dec.DecryptWithAd(ad, ct);

    assert.deepEqual(decoded, plaintext);
  });

  test("encrypts empty plaintext to a 16-byte auth-tag-only frame", () => {

    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32, 0x11));

    const ct = cs.EncryptWithAd(Buffer.alloc(0), Buffer.alloc(0));

    assert.equal(ct.length, 16, "empty plaintext + 16-byte tag = 16 bytes");
  });

  test("DecryptWithAd throws CT_TOO_SHORT for ciphertext shorter than 16 bytes", () => {

    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32, 0x11));

    assert.throws(() => cs.DecryptWithAd(Buffer.alloc(0), Buffer.alloc(15)), { code: "CT_TOO_SHORT", name: "NoiseHandshakeError" });
  });

  test("EncryptWithAd throws MSG_TOO_LONG when plaintext exceeds the max-frame budget", () => {

    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32, 0x11));

    // Plaintext + 16-byte tag must fit under NOISE_MAX_MESSAGE_LEN (65535). One byte over the budget triggers.
    const tooLong = Buffer.alloc(NOISE_MAX_MESSAGE_LEN - 16 + 1);

    assert.throws(() => cs.EncryptWithAd(Buffer.alloc(0), tooLong), NoiseHandshakeError);
  });

  test("nonce increments on every encrypt", () => {

    const enc = new CipherState();
    const dec = new CipherState();
    const key = Buffer.alloc(32, 0x55);

    enc.InitializeKey(key);
    dec.InitializeKey(key);

    const a = enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("a"));
    const b = enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("a"));

    // Same plaintext + same key but different nonces -> different ciphertexts.
    assert.notDeepEqual(a, b, "nonce reuse would produce identical ciphertexts; different ciphertexts confirm nonce increment");

    // Decryption must mirror the nonce sequence.
    assert.deepEqual(dec.DecryptWithAd(Buffer.alloc(0), a), Buffer.from("a"));
    assert.deepEqual(dec.DecryptWithAd(Buffer.alloc(0), b), Buffer.from("a"));
  });

  test("DecryptWithAd throws on a tampered tag", () => {

    const enc = new CipherState();
    const dec = new CipherState();
    const key = Buffer.alloc(32, 0x33);

    enc.InitializeKey(key);
    dec.InitializeKey(key);

    const ct = Buffer.from(enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("payload")));

    // Flip the last byte (inside the auth tag).
    ct[ct.length - 1] = (ct[ct.length - 1] ?? 0) ^ 0xff;

    assert.throws(() => dec.DecryptWithAd(Buffer.alloc(0), ct), "tampered tag must fail authentication");
  });

  test("DecryptWithAd throws on tampered ciphertext", () => {

    const enc = new CipherState();
    const dec = new CipherState();
    const key = Buffer.alloc(32, 0x44);

    enc.InitializeKey(key);
    dec.InitializeKey(key);

    const ct = Buffer.from(enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("payload")));

    // Flip a byte in the body (not the tag).
    ct[0] = (ct[0] ?? 0) ^ 0xff;

    assert.throws(() => dec.DecryptWithAd(Buffer.alloc(0), ct), "tampered ciphertext must fail authentication");
  });

  test("Rekey replaces the active key with derived material that still round-trips", () => {

    // The Noise spec defines Rekey as "encrypt 32 zeros with the maximum nonce; the first 32 bytes of the result become the new key." The contract is that Rekey is
    // observable (the post-Rekey ciphertexts differ from the pre-Rekey ciphertexts under the original key) and that Rekey is symmetric (peers that both Rekey at the
    // same point in the stream still decrypt each other's traffic). We assert both: divergence under the old key, and continued round-trip when both sides Rekey.
    const a = new CipherState();
    const b = new CipherState();
    const key = Buffer.alloc(32, 0x77);

    a.InitializeKey(key);
    b.InitializeKey(key);

    // Pre-Rekey baseline: a sends, b decrypts.
    const ctBefore = a.EncryptWithAd(Buffer.alloc(0), Buffer.from("before"));

    assert.deepEqual(b.DecryptWithAd(Buffer.alloc(0), ctBefore), Buffer.from("before"));

    // Both sides rekey to derive new key material from the same starting state.
    a.Rekey();
    b.Rekey();

    // Post-Rekey traffic must round-trip; encrypting the same plaintext with the same nonce sequence under a different key yields different ciphertext, so the new
    // ciphertext must differ from what we'd have produced pre-Rekey to confirm the key actually changed.
    const ctAfter = a.EncryptWithAd(Buffer.alloc(0), Buffer.from("after"));

    assert.deepEqual(b.DecryptWithAd(Buffer.alloc(0), ctAfter), Buffer.from("after"), "post-Rekey round-trip must succeed");

    // Sanity check that Rekey actually replaced the key: a re-encryption of the same plaintext on a fresh CipherState that did NOT Rekey produces different bytes.
    const fresh = new CipherState();

    fresh.InitializeKey(key);
    fresh.EncryptWithAd(Buffer.alloc(0), Buffer.from("before"));

    const ctFreshAfter = fresh.EncryptWithAd(Buffer.alloc(0), Buffer.from("after"));

    assert.notDeepEqual(ctAfter, ctFreshAfter, "Rekey must change the active key (post-Rekey ciphertext must differ from same-nonce ciphertext under the original key)");
  });

  test("Rekey is a no-op when no key is set", () => {

    // Rekey's contract on an unkeyed cipher state is "do nothing"; the empty-key passthrough mode for handshake messages must continue to work.
    const cs = new CipherState();

    assert.doesNotThrow(() => cs.Rekey());
    assert.equal(cs.HasKey(), false);
    assert.deepEqual(cs.EncryptWithAd(Buffer.alloc(0), Buffer.from("plain")), Buffer.from("plain"));
  });

  test("[Symbol.dispose] zeroes the key and is safe to call more than once (using-block semantics)", () => {

    // The dispose hook is the contract behind `using cs = new CipherState(); ...` - when the binding leaves scope, key material must be wiped. We assert the
    // observable consequence (HasKey returns false after dispose) and that calling dispose twice is safe (the standard Symbol.dispose contract).
    const cs = new CipherState();

    cs.InitializeKey(Buffer.alloc(32, 0x99));
    assert.equal(cs.HasKey(), true);

    cs[Symbol.dispose]();
    assert.equal(cs.HasKey(), false, "dispose must zero key material");

    // Safe to call more than once: a second dispose must not throw.
    assert.doesNotThrow(() => cs[Symbol.dispose]());
  });

  test("EncryptWithAd and DecryptWithAd refuse the reserved maximum nonce with a typed NONCE_EXHAUSTED error", () => {

    // Noise §5.1 reserves the maximum nonce (2^64 - 1) for Rekey; it must never encrypt or decrypt a transport message. The real trigger (2^64 messages) is physically
    // unreachable, so we drive the private counter to the reserved value directly to exercise the guard. The guard must fire BEFORE the AEAD runs, on both directions.
    const maxNonce = (1n << 64n) - 1n;

    const encState = new CipherState();

    encState.InitializeKey(Buffer.alloc(32, 0x11));
    (encState as unknown as { n: bigint }).n = maxNonce;
    assert.throws(() => encState.EncryptWithAd(Buffer.alloc(0), Buffer.from([ 1, 2, 3 ])),
      (err: unknown): boolean => (err instanceof NoiseHandshakeError) && (err.code === "NONCE_EXHAUSTED"));

    const decState = new CipherState();

    decState.InitializeKey(Buffer.alloc(32, 0x22));
    (decState as unknown as { n: bigint }).n = maxNonce;
    assert.throws(() => decState.DecryptWithAd(Buffer.alloc(0), Buffer.alloc(20)),
      (err: unknown): boolean => (err instanceof NoiseHandshakeError) && (err.code === "NONCE_EXHAUSTED"));
  });
});

describe("CipherState - hot path", () => {

  test("round-trips 10,000 paired EncryptWithAd / DecryptWithAd frames with monotonic nonce and no exhaustion", () => {

    const enc = new CipherState();
    const dec = new CipherState();
    const key = Buffer.alloc(32, 0x5a);

    enc.InitializeKey(key);
    dec.InitializeKey(key);

    const ad = Buffer.alloc(0);
    const N = 10000;

    // We track the previous ciphertext so we can prove the nonce advances every frame - the same key and a near-identical plaintext must still yield distinct
    // ciphertexts. Nonce reuse under ChaCha20-Poly1305 would collide here, so a passing loop is positive evidence the per-frame nonce sequencing is sound. The cipher
    // output is wrapped in `Buffer.from(...)` below (matching this file's round-trip tests), which normalizes the buffer type; the zero-length seed only matters for the
    // i === 0 frame, which we never compare.
    let previous = Buffer.alloc(0);

    for(let i = 0; i < N; i++) {

      const plaintext = Buffer.from([ i & 0xff, (i >> 8) & 0xff, 0x42 ]);
      const ct = Buffer.from(enc.EncryptWithAd(ad, plaintext));

      assert.deepEqual(dec.DecryptWithAd(ad, ct), plaintext);

      if(i > 0) {

        assert.notDeepEqual(ct, previous, "each frame's ciphertext must differ from the prior frame's - nonce reuse would collide");
      }

      previous = ct;
    }

    // A clean N-iteration run inherently proves the 2^64-1 NONCE_EXHAUSTED guard never fired; the explicit counter read is the stronger monotonic-advance assertion.
    assert.equal((enc as unknown as { n: bigint }).n, BigInt(N), "the encrypt nonce must advance to exactly N");
    assert.equal((dec as unknown as { n: bigint }).n, BigInt(N), "the decrypt nonce must mirror the encrypt nonce to exactly N");

    enc[Symbol.dispose]();
    dec[Symbol.dispose]();
  });
});

describe("createHandshake / createESPHomeHandshake construction", () => {

  test("createHandshake constructs a HandshakeState with role 'initiator'", () => {

    const psk = Buffer.alloc(32, 0x01);
    const handshake = createHandshake({ prologue: Buffer.from(ESPHOME_NOISE_PROLOGUE, "utf8"), psk, role: "initiator" });

    assert.notEqual(handshake, null);
    assert.equal(typeof handshake.writeMessage, "function");
    assert.equal(typeof handshake.readMessage, "function");
  });

  test("createESPHomeHandshake construct succeeds with valid 32-byte PSK", () => {

    const psk = Buffer.alloc(32, 0x42);
    const handshake = createESPHomeHandshake({ psk, role: "initiator" });

    assert.notEqual(handshake, null);
  });

  test("createESPHomeHandshake throws INVALID_PSK_LENGTH on a wrong-size PSK", () => {

    assert.throws(() => createESPHomeHandshake({ psk: Buffer.alloc(16), role: "initiator" }), { code: "INVALID_PSK_LENGTH", name: "NoiseHandshakeError" });
    assert.throws(() => createESPHomeHandshake({ psk: Buffer.alloc(64), role: "initiator" }), { code: "INVALID_PSK_LENGTH", name: "NoiseHandshakeError" });
  });

  test("two handshakes constructed from the same inputs are independent instances", () => {

    const psk = Buffer.alloc(32, 0x07);
    const a = createESPHomeHandshake({ psk, role: "initiator" });
    const b = createESPHomeHandshake({ psk, role: "initiator" });

    assert.notEqual(a, b, "construction must produce fresh state, not a shared singleton");
  });
});

describe("HandshakeState NNpsk0 round-trip between initiator and responder", () => {

  test("a paired initiator + responder complete the handshake and exchange compatible ciphers", () => {

    const psk = Buffer.alloc(32, 0x42);
    const initiator = createESPHomeHandshake({ psk, role: "initiator" });
    const responder = createESPHomeHandshake({ psk, role: "responder" });

    // First message: initiator -> responder. Empty payload by default.
    const msg1 = initiator.writeMessage();
    const recv1 = responder.readMessage(msg1);

    assert.equal(recv1.length, 0, "first message has no payload");

    // Second message: responder -> initiator. With payload.
    const responderPayload = Buffer.from("server-hello", "utf8");
    const msg2 = responder.writeMessage(responderPayload);
    const recv2 = initiator.readMessage(msg2);

    assert.deepEqual(recv2, responderPayload, "responder's payload must round-trip through to the initiator's readMessage");
  });

  test("MixKey never logs the chaining-key material (the ck) at debug", () => {

    const psk = Buffer.alloc(32, 0x42);
    const prologue = Buffer.from(ESPHOME_NOISE_PROLOGUE, "utf8");
    const captured: string[] = [];
    const capturingLog = {

      debug: (msg: string): void => { captured.push(msg); },
      error: (): void => { /* discard */ },
      info:  (): void => { /* discard */ },
      warn:  (): void => { /* discard */ }
    };

    const initiator = createHandshake({ logger: capturingLog, prologue, psk, role: "initiator" });
    const responder = createHandshake({ logger: capturingLog, prologue, psk, role: "responder" });

    const msg1 = initiator.writeMessage();

    responder.readMessage(msg1);

    const msg2 = responder.writeMessage();

    initiator.readMessage(msg2);

    // MixKey runs on every handshake transition. The `ck` transitively incorporates the PSK and the DH shared secrets and is the HKDF input Split() expands into the
    // live transport ChaCha20 keys, so it must never appear in any log. Assert the MixKey progress line fires but carries no hex key material.
    const mixKeyLogs = captured.filter((msg) => msg.includes("Mixed key material"));

    assert.ok(mixKeyLogs.length > 0, "MixKey must still emit a progress signal at debug");

    for(const msg of mixKeyLogs) {

      assert.doesNotMatch(msg, /[0-9a-f]{16,}/i, "the MixKey debug log must not contain hex key material (the chaining key)");
    }
  });

  test("a complete NNpsk0 exchange leaves both sides post-handshake with no errors", () => {

    const psk = Buffer.alloc(32, 0x88);
    const initiator = createESPHomeHandshake({ psk, role: "initiator" });
    const responder = createESPHomeHandshake({ psk, role: "responder" });

    // NNpsk0 is a two-message pattern: initiator -> responder, responder -> initiator.
    const msg1 = initiator.writeMessage();
    const recv1 = responder.readMessage(msg1);

    assert.equal(recv1.length, 0);

    const msg2 = responder.writeMessage(Buffer.from("ack"));
    const recv2 = initiator.readMessage(msg2);

    assert.deepEqual(recv2, Buffer.from("ack"));
  });

  test("a tampered handshake message fails authentication on readMessage", () => {

    const psk = Buffer.alloc(32, 0xaa);
    const initiator = createESPHomeHandshake({ psk, role: "initiator" });
    const responder = createESPHomeHandshake({ psk, role: "responder" });

    const msg1 = initiator.writeMessage();

    // Tamper with the last byte (inside the auth-tag region).
    const tampered = Buffer.from(msg1);

    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;

    assert.throws(() => responder.readMessage(tampered), "tampered handshake byte must fail authentication");
  });

  test("mismatched PSKs cause the handshake to fail authentication immediately", () => {

    const initiator = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x01), role: "initiator" });
    const responder = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x02), role: "responder" });

    const msg1 = initiator.writeMessage();

    // Mismatched PSK is folded into the symmetric state; the responder fails to decrypt the first encrypted-and-hashed payload component immediately.
    assert.throws(() => responder.readMessage(msg1), "mismatched PSK must fail on the first inbound message");
  });

  test("calling writeMessage past the pattern length throws", () => {

    const psk = Buffer.alloc(32, 0x55);
    const initiator = createESPHomeHandshake({ psk, role: "initiator" });
    const responder = createESPHomeHandshake({ psk, role: "responder" });

    // Complete the two-message exchange: msg1 init->resp, msg2 resp->init.
    const msg1 = initiator.writeMessage();

    responder.readMessage(msg1);

    const msg2 = responder.writeMessage();

    initiator.readMessage(msg2);

    // Both sides have completed the NNpsk0 pattern. A third writeMessage on either side must throw with the HANDSHAKE_COMPLETE code (the single source of truth for
    // pattern-exhausted state, emitted from nextPatternStep()).
    assert.throws(() => initiator.writeMessage(), { code: "HANDSHAKE_COMPLETE", name: "NoiseHandshakeError" });
  });

  test("readMessage with a message shorter than DH_LEN throws TRUNCATED_E", () => {

    // The "e" token in NNpsk0's first message expects 32 bytes (the remote ephemeral public key). A truncated message must be rejected before any DH operation runs;
    // the responder sees the malformed first byte (the encryption prefix) and continues on the bytes that follow, which fall short of DH_LEN.
    const psk = Buffer.alloc(32, 0x33);
    const responder = createESPHomeHandshake({ psk, role: "responder" });

    // Construct a deliberately short first message: fewer than DH_LEN (32) bytes after the start.
    const truncated = Buffer.alloc(NOISE_DH_LEN - 1, 0x00);

    assert.throws(() => responder.readMessage(truncated), { code: "TRUNCATED_E", name: "NoiseHandshakeError" });
  });

  test("[Symbol.dispose] on HandshakeState seals the state against further use (using-block semantics)", () => {

    // The dispose hook lets consumers write `using handshake = createESPHomeHandshake({ ... });` and have the handshake's key material zeroed deterministically when
    // the binding leaves scope. After dispose, the patternIndex is at the end so a subsequent writeMessage must throw HANDSHAKE_COMPLETE.
    const psk = Buffer.alloc(32, 0xcc);
    const handshake = createESPHomeHandshake({ psk, role: "initiator" });

    handshake[Symbol.dispose]();

    assert.throws(() => handshake.writeMessage(), { code: "HANDSHAKE_COMPLETE", name: "NoiseHandshakeError" });
  });

  test("additionalPrologueData is folded into the prologue and binds peers that share it", () => {

    // The prologue is mixed into the symmetric state at construction time (Noise §5.3) and any divergence between peers' prologues causes the first authenticated
    // payload component to fail decryption. We exercise both directions of the contract:
    //   1. Two peers that both pass the same additionalPrologueData complete the handshake successfully.
    //   2. Two peers whose additionalPrologueData differs (or one is missing) fail authentication on the first inbound message.
    const psk = Buffer.alloc(32, 0x12);
    const extra = Buffer.from("device-uid-abc123", "utf8");

    // Direction 1: matched extras succeed.
    const initiator = createESPHomeHandshake({ additionalPrologueData: extra, psk, role: "initiator" });
    const responder = createESPHomeHandshake({ additionalPrologueData: extra, psk, role: "responder" });
    const msg1 = initiator.writeMessage();

    assert.doesNotThrow(() => responder.readMessage(msg1), "matched additionalPrologueData must complete the first message");

    // Direction 2: mismatched extras (responder omits) fail. The initiator binds "extra" into its prologue; the responder doesn't, so its symmetric state diverges and
    // the first encrypted-and-hashed payload component cannot be authenticated.
    const initiator2 = createESPHomeHandshake({ additionalPrologueData: extra, psk, role: "initiator" });
    const responder2 = createESPHomeHandshake({ psk, role: "responder" });
    const msg1b = initiator2.writeMessage();

    assert.throws(() => responder2.readMessage(msg1b), "mismatched prologue must fail authentication on the first inbound message");
  });

  test("destroyHandshakeSecrets wipes the PSK and chaining material but preserves the live ciphers", () => {

    // Each side gets a DISTINCT psk buffer (same contents, separate allocations) so zeroing the initiator's does not mutate the responder's. The handshake folds the PSK
    // into the symmetric state; mismatched contents would fail authentication, so we use identical contents in independent buffers.
    const initiatorPsk = Buffer.alloc(32, 0x42);
    const responderPsk = Buffer.alloc(32, 0x42);
    const initiator = createESPHomeHandshake({ psk: initiatorPsk, role: "initiator" });
    const responder = createESPHomeHandshake({ psk: responderPsk, role: "responder" });

    // Drive the full NNpsk0 exchange to completion so the initiator's sendCipher / receiveCipher are populated by Split().
    const msg1 = initiator.writeMessage();

    responder.readMessage(msg1);

    const msg2 = responder.writeMessage();

    initiator.readMessage(msg2);

    // Capture the post-handshake cipher reference BEFORE the wipe; destroyHandshakeSecrets relinquishes the field but must leave the object keyed and usable.
    const sendCipher = initiator.sendCipher;

    assert.ok(sendCipher, "the initiator must hold a sendCipher after a completed handshake");

    initiator.destroyHandshakeSecrets();

    // (a) The PSK buffer is zeroed in place; the responder's independent buffer is untouched.
    assert.ok(initiatorPsk.every((b) => b === 0), "destroyHandshakeSecrets must zero the initiator's PSK buffer");

    // (b) The captured cipher still has its key - the transport owns it now, so it must NOT have been destroyed.
    assert.equal(sendCipher.HasKey(), true, "the post-handshake sendCipher must remain keyed after destroyHandshakeSecrets");

    // (c) The cipher still encrypts: a keyed CipherState transforms the plaintext, whereas a keyless one returns it unchanged. Ciphertext differing from plaintext proves
    // the key survived.
    const plaintext = Buffer.from([ 1, 2, 3 ]);
    const ciphertext = sendCipher.EncryptWithAd(Buffer.alloc(0), plaintext);

    assert.notDeepEqual(ciphertext, plaintext, "the preserved sendCipher must still encrypt (keyed), not pass the plaintext through");
  });

  test("destroy zeroes the PSK buffer (failure-path teardown)", () => {

    // The full destroy() - the correct teardown for a FAILED handshake - must also wipe the PSK, not just the ephemeral and cipher material.
    const psk = Buffer.alloc(32, 0x77);
    const handshake = createESPHomeHandshake({ psk, role: "initiator" });

    handshake.destroy();

    assert.ok(psk.every((b) => b === 0), "destroy() must zero the PSK buffer");
  });
});

// SymmetricState (Noise spec §5.2) is private to crypto-noise.ts so we cannot import the class directly. Its public method surface is reached through
// HandshakeState's `ss` field; TypeScript's `private` is structural at runtime so casting through the interface below names the methods we drive directly without
// modifying the source module to add a test-only export. The interface mirrors the SymmetricState class exactly...keep in sync if a future refactor renames a
// method or adds a new one.
interface SymmetricStateForTesting {

  ck: Buffer;
  cs: CipherState;
  h: Buffer;
  DecryptAndHash(ciphertext: Buffer): Buffer;
  destroy(): void;
  EncryptAndHash(plaintext: Buffer): Buffer;
  InitializeSymmetric(): void;
  MixHash(data: Buffer): void;
  MixKey(ikm: Buffer): void;
  MixKeyAndHash(ikm: Buffer): void;
  Split(): [CipherState, CipherState];
}

// Source-of-truth for the protocol-name hash that anchors every SymmetricState method. The 36-byte name exceeds the 32-byte HASHLEN, so per Noise §5.2 the spec
// hashes it rather than zero-padding. We recompute the hash here from the literal name string rather than re-importing the implementation's cached constant so the
// tests cross-check the implementation against an independently derived vector.
const PROTOCOL_NAME_FOR_TESTS = "Noise_NNpsk0_25519_ChaChaPoly_SHA256";
const PROTOCOL_NAME_HASH_VECTOR = createHash("sha256").update(Buffer.from(PROTOCOL_NAME_FOR_TESTS, "ascii")).digest();

// Helper to extract the SymmetricState embedded inside a HandshakeState. The SymmetricState is constructed by HandshakeState's constructor; after construction its
// ck and h have already been threaded through InitializeSymmetric() + MixHash(prologue). Tests that want a freshly-initialized SymmetricState call
// InitializeSymmetric() again on the returned reference to revert any constructor-time MixHash side effects.
function symmetricStateOf(handshake: ReturnType<typeof createHandshake>): SymmetricStateForTesting {

  return (handshake as unknown as { ss: SymmetricStateForTesting }).ss;
}

// Construct a fresh SymmetricState by way of a HandshakeState, then call InitializeSymmetric() to undo the constructor-time MixHash(prologue) so the state matches
// "post-InitializeSymmetric, pre-anything-else" - the canonical starting point for per-method assertions.
function freshSymmetricState(): SymmetricStateForTesting {

  const handshake = createHandshake({ prologue: Buffer.alloc(0), psk: Buffer.alloc(32, 0x01), role: "initiator" });
  const ss = symmetricStateOf(handshake);

  ss.InitializeSymmetric();

  return ss;
}

describe("SymmetricState per-method coverage", () => {

  test("InitializeSymmetric sets ck and h to SHA256 of the protocol name and clears the cipher key", () => {

    // Noise §5.2: when the protocol_name buffer is longer than HASHLEN (32 bytes), set h := SHA256(protocol_name); otherwise zero-pad. The 36-byte
    // "Noise_NNpsk0_25519_ChaChaPoly_SHA256" hits the hashed branch. ck is initialized to the same value and the embedded cipher state has no key.
    const ss = freshSymmetricState();

    assert.deepEqual(ss.h, PROTOCOL_NAME_HASH_VECTOR, "h must equal SHA256(protocol_name) immediately after InitializeSymmetric");
    assert.deepEqual(ss.ck, PROTOCOL_NAME_HASH_VECTOR, "ck must equal SHA256(protocol_name) immediately after InitializeSymmetric");
    assert.equal(ss.cs.HasKey(), false, "the embedded cipher state must have no key immediately after InitializeSymmetric");
  });

  test("MixHash(data) sets h to SHA256(prevH || data) and leaves ck untouched", () => {

    // Noise §5.2: MixHash(data) := h := SHA256(h || data). The chaining key is not touched by MixHash. We compute the expected hash independently from Node's
    // SHA256 primitive and assert byte-equality against the implementation's output.
    const ss = freshSymmetricState();
    const data = Buffer.from("device-uid-abc123", "utf8");
    const expectedH = createHash("sha256").update(Buffer.concat([ PROTOCOL_NAME_HASH_VECTOR, data ])).digest();

    ss.MixHash(data);

    assert.deepEqual(ss.h, expectedH, "MixHash output must equal SHA256(prevH || data) byte-for-byte");
    assert.deepEqual(ss.ck, PROTOCOL_NAME_HASH_VECTOR, "ck must remain unchanged across MixHash");
  });

  test("MixHash with empty input still re-hashes h (h := SHA256(h))", () => {

    // Boundary case: an empty buffer is a valid input. The result is SHA256(h) because Buffer.concat([h, empty]) === h. Documents the no-op-on-empty
    // misconception...MixHash with empty input is NOT a no-op; it advances the handshake hash by one round.
    const ss = freshSymmetricState();
    const expectedH = createHash("sha256").update(PROTOCOL_NAME_HASH_VECTOR).digest();

    ss.MixHash(Buffer.alloc(0));

    assert.deepEqual(ss.h, expectedH, "MixHash(empty) must equal SHA256(prevH) - the concat with empty is a no-op but the hash round still fires");
  });

  test("MixKey(ikm) splits HKDF(ck, ikm, 64) into (new_ck, temp_k) and arms the cipher", () => {

    // Noise §5.2: MixKey(ikm) := HKDF(ck, ikm, 2). Output is split into (new_ck, temp_k); ck is replaced and the cipher state's key is set to temp_k. The
    // implementation uses Node's hkdfSync with chainingKey-as-salt and empty info. Test vector source: recompute via the same Node primitive against the
    // pre-method ck and the supplied ikm; cross-checks the implementation's HKDF invocation byte-for-byte.
    const ss = freshSymmetricState();
    const ikm = Buffer.alloc(32, 0xab);
    const derived = Buffer.from(hkdfSync("sha256", ikm, PROTOCOL_NAME_HASH_VECTOR, Buffer.alloc(0), 64));
    const expectedCk = derived.subarray(0, 32);

    ss.MixKey(ikm);

    assert.deepEqual(ss.ck, expectedCk, "MixKey must replace ck with the first 32 bytes of HKDF(prevCk, ikm, 64)");
    assert.deepEqual(ss.h, PROTOCOL_NAME_HASH_VECTOR, "MixKey must NOT touch h");
    assert.equal(ss.cs.HasKey(), true, "MixKey must arm the embedded cipher state's key");
  });

  test("MixKeyAndHash(ikm) splits HKDF(ck, ikm, 96), mixes the middle output into h, and arms the cipher", () => {

    // Noise §5.2: MixKeyAndHash(ikm) := HKDF(ck, ikm, 3). The first 32 bytes become the new ck; the middle 32 are MixHash'd into h; the last 32 arm the cipher.
    // Used by the NNpsk0 "psk" token. Test vector source: recompute via Node's hkdfSync against the pre-method ck and the supplied ikm; the expected h is
    // SHA256(prevH || temp_h) because MixKeyAndHash chains a MixHash of the middle output.
    const ss = freshSymmetricState();
    const ikm = Buffer.alloc(32, 0x5a);
    const derived = Buffer.from(hkdfSync("sha256", ikm, PROTOCOL_NAME_HASH_VECTOR, Buffer.alloc(0), 96));
    const expectedCk = derived.subarray(0, 32);
    const tempH = derived.subarray(32, 64);
    const expectedH = createHash("sha256").update(Buffer.concat([ PROTOCOL_NAME_HASH_VECTOR, tempH ])).digest();

    ss.MixKeyAndHash(ikm);

    assert.deepEqual(ss.ck, expectedCk, "MixKeyAndHash must replace ck with the first 32 bytes of HKDF(prevCk, ikm, 96)");
    assert.deepEqual(ss.h, expectedH, "MixKeyAndHash must mix the middle output into h: h := SHA256(prevH || temp_h)");
    assert.equal(ss.cs.HasKey(), true, "MixKeyAndHash must arm the embedded cipher state's key");
  });

  test("EncryptAndHash returns plaintext unchanged and mixes plaintext into h when the cipher has no key", () => {

    // Noise §5.2: EncryptAndHash(plaintext) := MixHash(CipherState.EncryptWithAd(h, plaintext)). When the cipher has no key the inner call returns plaintext
    // unchanged, so the buffer mixed into h is the plaintext itself. This is the pre-MixKey handshake path.
    const ss = freshSymmetricState();
    const plaintext = Buffer.from("hello", "utf8");
    const expectedH = createHash("sha256").update(Buffer.concat([ PROTOCOL_NAME_HASH_VECTOR, plaintext ])).digest();

    const out = ss.EncryptAndHash(plaintext);

    assert.deepEqual(out, plaintext, "EncryptAndHash without a key must passthrough plaintext unchanged");
    assert.deepEqual(ss.h, expectedH, "EncryptAndHash without a key must mix plaintext into h");
  });

  test("EncryptAndHash returns ciphertext+tag and mixes ciphertext into h when the cipher has a key", () => {

    // After MixKey arms the cipher, EncryptAndHash emits ChaCha20-Poly1305 ciphertext plus a 16-byte auth tag. The buffer mixed into h is the ciphertext, NOT
    // the plaintext...we assert this by recomputing h := SHA256(prevH || ciphertext) against the implementation's output.
    const ss = freshSymmetricState();

    ss.MixKey(Buffer.alloc(32, 0xab));

    const hAfterMixKey = Buffer.from(ss.h);
    const plaintext = Buffer.from("encrypted-payload", "utf8");

    const ct = ss.EncryptAndHash(plaintext);

    assert.equal(ct.length, plaintext.length + 16, "EncryptAndHash with a key must emit plaintext + 16-byte auth tag");
    assert.notDeepEqual(ct.subarray(0, plaintext.length), plaintext, "ciphertext bytes must differ from plaintext bytes when the cipher is keyed");

    const expectedH = createHash("sha256").update(Buffer.concat([ hAfterMixKey, ct ])).digest();

    assert.deepEqual(ss.h, expectedH, "EncryptAndHash with a key must mix the ciphertext (not the plaintext) into h");
  });

  test("DecryptAndHash returns input unchanged when the cipher has no key", () => {

    // Mirror of EncryptAndHash without a key: the inner DecryptWithAd passes input through unchanged, and the input bytes are mixed into h.
    const ss = freshSymmetricState();
    const payload = Buffer.from([ 0x01, 0x02, 0x03, 0x04 ]);
    const expectedH = createHash("sha256").update(Buffer.concat([ PROTOCOL_NAME_HASH_VECTOR, payload ])).digest();

    const out = ss.DecryptAndHash(payload);

    assert.deepEqual(out, payload, "DecryptAndHash without a key must passthrough input unchanged");
    assert.deepEqual(ss.h, expectedH, "DecryptAndHash without a key must mix input bytes into h");
  });

  test("DecryptAndHash reverses an EncryptAndHash round-trip across a paired SymmetricState", () => {

    // Two SymmetricStates, both initialized and MixKey'd identically, must agree on encrypt/decrypt. Note: EncryptAndHash uses the current h as associated data,
    // so for the round-trip to succeed both sides must share the same h at the moment of operation. Calling InitializeSymmetric + MixKey on both produces
    // matching (ck, h, k) and thus matching AAD.
    const a = freshSymmetricState();
    const b = freshSymmetricState();
    const ikm = Buffer.alloc(32, 0xcd);

    a.MixKey(ikm);
    b.MixKey(ikm);

    const plaintext = Buffer.from("round-trip-payload", "utf8");
    const ct = a.EncryptAndHash(plaintext);
    const decoded = b.DecryptAndHash(ct);

    assert.deepEqual(decoded, plaintext, "paired SymmetricStates must round-trip an EncryptAndHash / DecryptAndHash pair");

    // Both sides must arrive at the same h after the round-trip - EncryptAndHash on the sender mixes ct into h; DecryptAndHash on the receiver mixes ct into h.
    assert.deepEqual(a.h, b.h, "both sides must arrive at the same h after a paired EncryptAndHash / DecryptAndHash exchange");
  });

  test("DecryptAndHash throws when the ciphertext is tampered and the cipher has a key", () => {

    // Negative path: authentication is the property the AEAD construction guarantees; a single-bit flip in the tag must surface as a typed error and the
    // method must not return a partially-decrypted buffer.
    const a = freshSymmetricState();
    const b = freshSymmetricState();
    const ikm = Buffer.alloc(32, 0xef);

    a.MixKey(ikm);
    b.MixKey(ikm);

    const ct = Buffer.from(a.EncryptAndHash(Buffer.from("payload", "utf8")));

    ct[ct.length - 1] = (ct[ct.length - 1] ?? 0) ^ 0xff;

    assert.throws(() => b.DecryptAndHash(ct), NoiseHandshakeError, "tampered ciphertext must surface as a typed NoiseHandshakeError");
  });

  test("Split produces two distinct CipherState instances with different keys", () => {

    // Noise §5.2: Split() := HKDF(ck, empty, 2) -> two 32-byte keys, returned as two new CipherState instances. The two instances must be independent objects
    // (different identity) and their keys must differ (the second 32 bytes of the HKDF output differ from the first under any non-pathological ck).
    const ss = freshSymmetricState();

    // Mix some key material first so the chaining key is nontrivial.
    ss.MixKey(Buffer.alloc(32, 0x77));

    const [ c1, c2 ] = ss.Split();

    assert.notEqual(c1, c2, "Split must return two distinct CipherState instances (different references)");
    assert.equal(c1.HasKey(), true, "Split's first CipherState must be armed");
    assert.equal(c2.HasKey(), true, "Split's second CipherState must be armed");

    // Encrypt the same plaintext with the same nonce-0 starting state on each side; identical output would prove identical keys, which Split forbids. The empty
    // associated data and identical fresh nonces isolate the comparison to the key material itself.
    const probe = Buffer.from("split-key-divergence-probe", "utf8");
    const ctA = c1.EncryptWithAd(Buffer.alloc(0), probe);
    const ctB = c2.EncryptWithAd(Buffer.alloc(0), probe);

    assert.notDeepEqual(ctA, ctB, "the two CipherStates returned by Split must hold different keys (encrypting the same plaintext yields different ciphertexts)");
  });

  test("destroy zero-fills ck and h, cascades to the embedded CipherState, and is safe to call more than once", () => {

    // destroy() is the explicit-resource-management hook. Post-destroy: ck and h are zeroed in place, the embedded cipher state's key is wiped (HasKey false),
    // and a second destroy call must not throw (safe to call more than once). We MixKey first so the embedded cipher has a key to wipe.
    const ss = freshSymmetricState();

    ss.MixKey(Buffer.alloc(32, 0x99));

    // Capture pre-destroy state: ck and h must be nonzero (their lengths are 32 each).
    assert.equal(ss.ck.some((b: number): boolean => b !== 0), true, "ck must be nonzero pre-destroy");
    assert.equal(ss.h.some((b: number): boolean => b !== 0), true, "h must be nonzero pre-destroy");
    assert.equal(ss.cs.HasKey(), true, "cipher state must be armed pre-destroy");

    ss.destroy();

    assert.equal(ss.ck.every((b: number): boolean => b === 0), true, "destroy must zero-fill ck in place");
    assert.equal(ss.h.every((b: number): boolean => b === 0), true, "destroy must zero-fill h in place");
    assert.equal(ss.cs.HasKey(), false, "destroy must cascade to the embedded CipherState's destroy");

    // Safe to call more than once: a second destroy must not throw.
    assert.doesNotThrow(() => ss.destroy(), "destroy must be safe to call more than once");
  });
});

describe("Known-Answer Tests (reference vectors)", () => {

  // KAT-1 pins the CipherState nonce construction against an explicitly-written literal nonce. Every other CipherState test in this file is a symmetric round-trip
  // (encrypt then decrypt with the same code), so a wrong nonce byte-layout - wrong endianness, or the counter at offset 0 instead of offset 4 - would round-trip
  // perfectly because both directions would share the mistake. updateNonce() builds the 12-byte nonce as [00 00 00 00][LE64(n)] (src/crypto-noise.ts:235-236); this KAT
  // drives the private counter to n=5 and asserts our output equals the same plaintext encrypted under the literal nonce [0,0,0,0, 5,0,0,0,0,0,0,0]. A non-zero counter
  // is used deliberately so the LE64 advance is exercised, not just the all-zero n=0 case. The key, ad, and plaintext are arbitrary fixed test constants.
  const kat1Key = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c2b7e151628aed2a6abf7158809cf4f3c", "hex");
  const kat1Ad = Buffer.from("0102030405060708", "hex");
  const kat1Plaintext = Buffer.from("the quick brown fox jumps over", "utf8");

  // The expected ciphertext+tag is computed here from an explicit-literal nonce, independent of updateNonce(). This is the external reference the production nonce
  // construction must reproduce: the first four bytes are zeros and the counter (5) occupies the low byte of the little-endian 64-bit suffix at offset 4. We mirror the
  // production cipher conventions (chacha20-poly1305, 16-byte auth tag, setAAD with the plaintext length) so the byte layout under comparison is the same one our code
  // produces.
  const kat1LiteralNonce = Buffer.from([ 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0 ]);
  const kat1Cipher = createCipheriv("chacha20-poly1305", kat1Key, kat1LiteralNonce, { authTagLength: 16 });

  kat1Cipher.setAAD(kat1Ad, { plaintextLength: kat1Plaintext.length });

  const kat1Expected = Buffer.concat([ kat1Cipher.update(kat1Plaintext), kat1Cipher.final(), kat1Cipher.getAuthTag() ]);

  test("KAT-1: EncryptWithAd at counter n=5 matches the explicit-literal-nonce reference", () => {

    // We set the private nonce counter to 5 via the same cast the NONCE_EXHAUSTED test uses (the counter is declared bare `private n;` at src/crypto-noise.ts:193, its
    // type inferred bigint from `this.n = 0n;` at :204). If the production nonce layout were wrong - big-endian, or the counter at offset 0 - the constructed nonce would
    // diverge from kat1LiteralNonce and this byte-equality would fail.
    const enc = new CipherState();

    enc.InitializeKey(Buffer.from(kat1Key));
    (enc as unknown as { n: bigint }).n = 5n;
    assert.deepEqual(Buffer.from(enc.EncryptWithAd(kat1Ad, kat1Plaintext)), kat1Expected);
  });

  test("KAT-1: DecryptWithAd at counter n=5 recovers the plaintext from the literal-nonce ciphertext", () => {

    // The decrypt direction must reconstruct the same nonce to verify the Poly1305 tag and recover the plaintext. A wrong nonce layout would fail the AEAD tag check
    // rather than returning the plaintext, so this pins the read-side nonce construction independently of the write side.
    const dec = new CipherState();

    dec.InitializeKey(Buffer.from(kat1Key));
    (dec as unknown as { n: bigint }).n = 5n;
    assert.deepEqual(Buffer.from(dec.DecryptWithAd(kat1Ad, kat1Expected)), kat1Plaintext);
  });

  // KAT-2 is an external end-to-end pin of the responder read-path handshake composition. The vector comes from haskell-cryptography/cacophony `vectors/cacophony.txt`,
  // entry `Noise_NNpsk0_25519_ChaChaPoly_SHA256` - an independent Haskell Noise implementation. Its first message is `init_ephemeral_pub (32) || ChaChaPoly ciphertext +
  // Poly1305 tag (32)`. In NNpsk0 the message-1 read order is psk-then-e (the pattern is [["psk","e"],["e","ee"]] at src/crypto-noise.ts:73-77), so no `ee` DH happens
  // until message 2 and msg1 authenticates from public values alone. Our `responder.readMessage(msg1)` therefore reconstructs the matching symmetric state and recovers
  // the payload IFF our entire read-path composition (protocol-name SHA-256, prologue MixHash, MixKeyAndHash(psk) with its HKDF-3 split + h-mix, MixHash + MixKey(e) with
  // HKDF-2, DecryptAndHash with AAD=h and nonce 0) matches cacophony's. The decrypt of cacophony's externally-computed ciphertext also transitively confirms our
  // ChaCha20-Poly1305 is RFC-conformant in the decrypt direction. We use createHandshake (not createESPHomeHandshake) because cacophony's prologue is "John Galt", not
  // the ESPHome prologue.
  const kat2Prologue = Buffer.from("4a6f686e2047616c74", "hex");
  const kat2Psk = Buffer.from("54686973206973206d7920417573747269616e20706572737065637469766521", "hex");
  const kat2Msg1 = Buffer.from("ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c794479b962b8aff8485742ac32f905ba45369e2465fb59e138a93d67a0d1266b6a54", "hex");
  const kat2Payload = Buffer.from("4c756477696720766f6e204d69736573", "hex");

  test("KAT-2: readMessage recovers the cacophony NNpsk0 message-1 payload (happy path)", () => {

    // The happy path: our responder reconstructs cacophony's symmetric state from the public message-1 bytes and the shared psk, then decrypts cacophony's externally
    // computed ciphertext to recover the payload (ASCII "Ludwig von Mises").
    const responder = createHandshake({ prologue: kat2Prologue, psk: kat2Psk, role: "responder" });

    assert.deepEqual(Buffer.from(responder.readMessage(kat2Msg1)), kat2Payload);
  });

  test("KAT-2: a one-byte-flipped psk fails authentication on readMessage (psk is bound)", () => {

    // A wrong psk folds different key material into the symmetric state via MixKeyAndHash, so the derived cipher key diverges and the AEAD tag check fails. This proves
    // authentication binds the psk - the failure originates at key derivation, distinct from the tampered-ciphertext case below.
    const wrongPsk = Buffer.from(kat2Psk);

    wrongPsk[0] = (wrongPsk[0] ?? 0) ^ 0x01;

    const wrongResponder = createHandshake({ prologue: kat2Prologue, psk: wrongPsk, role: "responder" });

    assert.throws(() => wrongResponder.readMessage(kat2Msg1), { code: "AUTH_FAILED", name: "NoiseHandshakeError" });
  });

  test("KAT-2: a tampered external ciphertext byte fails authentication on readMessage (the tag is verified)", () => {

    // We flip one byte inside the ciphertext/tag region (offset >= 32) while keeping the e_pub bytes (0..31) and the CORRECT psk. This proves the Poly1305 tag is
    // verified against the external ciphertext bytes - a distinct, stronger failure mode than the wrong-psk case, which fails at key derivation. We use a fresh responder
    // because a responder whose readMessage already threw is mid-pattern and must not be reused.
    const tampered = Buffer.from(kat2Msg1);

    tampered[63] = (tampered[63] ?? 0) ^ 0x01;

    const responder = createHandshake({ prologue: kat2Prologue, psk: kat2Psk, role: "responder" });

    assert.throws(() => responder.readMessage(tampered), { code: "AUTH_FAILED", name: "NoiseHandshakeError" });
  });
});

describe("Real-cipher edge cases", () => {

  // Completes a paired NNpsk0 handshake and returns both sides post-split, each carrying its real transport CipherState pair. The wire carries no nonce: the implicit
  // monotonic counter on each CipherState is what makes replayed and out-of-order frames fail closed, so these tests exercise that property against a REAL Split cipher
  // pair rather than the stub ciphers the transport-level "desync" test installs. We use DISTINCT psk buffers per side (same contents, separate allocations) so neither
  // side's zeroization can wipe the other side's key.
  const completePair = (): { initiator: ReturnType<typeof createESPHomeHandshake>; responder: ReturnType<typeof createESPHomeHandshake> } => {

    const initiator = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "initiator" });
    const responder = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "responder" });

    // NNpsk0 is a two-message pattern: initiator -> responder, responder -> initiator. Both sides split after the second message and are then post-handshake.
    const msg1 = initiator.writeMessage();

    responder.readMessage(msg1);

    const msg2 = responder.writeMessage(Buffer.from("ack"));

    initiator.readMessage(msg2);

    return { initiator, responder };
  };

  test("a replayed transport frame fails AUTH_FAILED on a real cipher pair (the implicit nonce advances)", () => {

    const { initiator, responder } = completePair();

    // The initiator's sendCipher pairs with the responder's receiveCipher (both are the c1 half of the symmetric Split). Narrow the typed `CipherState | undefined`
    // before use.
    const enc = initiator.sendCipher;
    const dec = responder.receiveCipher;

    assert.ok(enc, "the initiator must expose a sendCipher after a completed handshake");
    assert.ok(dec, "the responder must expose a receiveCipher after a completed handshake");

    const frame = enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("hello"));

    // First decrypt succeeds and advances the receive nonce from 0 to 1.
    assert.deepEqual(dec.DecryptWithAd(Buffer.alloc(0), frame), Buffer.from("hello"), "the first delivery of a frame must round-trip");

    // The SECOND decrypt of the same bytes now runs at receive nonce 1, but the frame was encrypted at nonce 0, so the Poly1305 tag check fails. A replayed transport
    // frame fails closed - the implicit monotonic nonce is what enforces this, with no nonce on the wire.
    assert.throws(() => dec.DecryptWithAd(Buffer.alloc(0), frame), { code: "AUTH_FAILED", name: "NoiseHandshakeError" });
  });

  test("an out-of-order transport frame fails AUTH_FAILED on a real cipher pair", () => {

    const { initiator, responder } = completePair();

    const enc = initiator.sendCipher;
    const dec = responder.receiveCipher;

    assert.ok(enc, "the initiator must expose a sendCipher after a completed handshake");
    assert.ok(dec, "the responder must expose a receiveCipher after a completed handshake");

    // Encrypt frame A (advances the send nonce from 0 to 1), then frame B at nonce 1.
    const a = enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("A"));
    const b = enc.EncryptWithAd(Buffer.alloc(0), Buffer.from("B"));

    // Delivering B before A means the receiver decrypts B at nonce 0, but B was encrypted at nonce 1, so the tag check fails. Reordering fails closed for the same
    // implicit-nonce reason as replay. (We keep `a` to document the order that WOULD have succeeded; we do not deliver it.)
    void a;

    assert.throws(() => dec.DecryptWithAd(Buffer.alloc(0), b), { code: "AUTH_FAILED", name: "NoiseHandshakeError" });
  });

  test("a low-order X25519 peer ephemeral is rejected at the DH, distinct from a generic transcript tamper", () => {

    // Drives a fresh paired handshake to the point the responder has written msg2 and returns the initiator (still mid-pattern, not yet split) plus that msg2. We rebuild
    // for each sub-case because an initiator whose readMessage already threw is mid-pattern and must not be reused. DISTINCT psk buffers per side, as above.
    const driveToMsg2 = (): { initiator: ReturnType<typeof createESPHomeHandshake>; msg2: Buffer } => {

      const initiator = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "initiator" });
      const responder = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "responder" });

      const msg1 = initiator.writeMessage();

      responder.readMessage(msg1);

      // msg2 is [responder_e_pub (32 bytes)][encrypted payload]; the first 32 bytes are the responder ephemeral we tamper below.
      const msg2 = responder.writeMessage(Buffer.from("server-hello", "utf8"));

      return { initiator, msg2 };
    };

    // Why all three sub-cases are needed: "throws + isComplete false" alone cannot tell them apart - ANY ephemeral tamper produces it, because the responder ephemeral is
    // mixed into the transcript by processReadToken's `e` token (MixHash + MixKey of the remote ephemeral), so even a DH-valid tamper breaks the later payload decrypt.
    // What proves our handshake rejects a low-order point SPECIFICALLY at key-agreement is the DIFFERENT failure LAYER: the low-order ephemeral fails at the X25519 DH
    // (processReadToken's `ee` token), which runs BEFORE the payload decrypt, while a DH-accepted (non-low-order) tamper fails LATER at the payload. The low-order DH
    // failure surfaces as a TYPED NoiseHandshakeError with code INVALID_REMOTE_KEY (the diffieHellman calls are wrapped so the public module never leaks the raw OpenSSL
    // ERR_OSSL_FAILED_DURING_DERIVATION), which stays DISTINCT from the contrast case's AUTH_FAILED - the two fail at different layers and now carry different typed
    // codes, preserving the distinction.

    // Control: an untampered msg2 completes the initiator's handshake, proving the harness produces a valid pairing.
    const control = driveToMsg2();

    control.initiator.readMessage(Buffer.from(control.msg2));

    assert.equal(control.initiator.isComplete, true, "an untampered msg2 must complete the initiator's handshake");

    // Low-order: overwrite the responder ephemeral with the all-zeros low-order point. The X25519 DH rejects it at key-agreement (BEFORE the payload decrypt); the wrap
    // turns the raw OpenSSL derivation error into a typed NoiseHandshakeError/INVALID_REMOTE_KEY, and the initiator never splits, so isComplete stays false.
    const lowOrder = driveToMsg2();
    const lowOrderMsg2 = Buffer.from(lowOrder.msg2);

    Buffer.alloc(32, 0x00).copy(lowOrderMsg2, 0);

    assert.throws(() => lowOrder.initiator.readMessage(lowOrderMsg2), { code: "INVALID_REMOTE_KEY", name: "NoiseHandshakeError" });
    assert.equal(lowOrder.initiator.isComplete, false, "a low-order ephemeral must leave the initiator's handshake incomplete");

    // Contrast: overwrite the same 32 bytes with 0xFF, a non-low-order value X25519 ACCEPTS. The DH succeeds and produces a shared secret, so the failure surfaces LATER
    // at the payload decrypt as a typed AUTH_FAILED - a different failure layer from the low-order case, which is what tells the two cases apart.
    const contrast = driveToMsg2();
    const contrastMsg2 = Buffer.from(contrast.msg2);

    Buffer.alloc(32, 0xff).copy(contrastMsg2, 0);

    assert.throws(() => contrast.initiator.readMessage(contrastMsg2), { code: "AUTH_FAILED", name: "NoiseHandshakeError" });
    assert.equal(contrast.initiator.isComplete, false, "a DH-accepted tampered ephemeral must still leave the initiator's handshake incomplete");
  });

  test("a low-order responder ephemeral throws a typed NoiseHandshakeError/INVALID_REMOTE_KEY directly from the DH wrap", () => {

    // Direct pin on the diffieHellman wrap, independent of the low-order-ephemeral characterization test above. We drive a fresh paired handshake to msg2, overwrite the
    // responder ephemeral with the all-zeros low-order point, and assert the initiator's readMessage throws the typed code the wrap raises - proving the public module
    // never leaks the raw OpenSSL derivation error. We rebuild the pair fresh because an initiator whose readMessage already threw is mid-pattern and must not be reused.
    const initiator = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "initiator" });
    const responder = createESPHomeHandshake({ psk: Buffer.alloc(32, 0x42), role: "responder" });

    responder.readMessage(initiator.writeMessage());

    const msg2 = Buffer.from(responder.writeMessage(Buffer.from("server-hello", "utf8")));

    Buffer.alloc(32, 0x00).copy(msg2, 0);

    assert.throws(() => initiator.readMessage(msg2), (err: unknown) => (err instanceof NoiseHandshakeError) && (err.code === "INVALID_REMOTE_KEY"));
  });
});
