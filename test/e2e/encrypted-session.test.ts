/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * encrypted-session.test.ts: A real end-to-end encrypted session - a genuine NNpsk0 handshake + encrypted discovery through the production client.
 */

/*
 * Drives a real Noise NNpsk0 encrypted session end-to-end: a genuine `HandshakeState(role:"initiator")` inside the production client + transport completes the handshake
 * against an INDEPENDENT synthetic responder (the device side) sharing the PSK, then the responder encrypts the basic-discovery responses with the real post-handshake
 * cipher and the client decrypts them to reach steady state. This test proves a genuine bidirectional NNpsk0 round-trip: `client.isEncrypted === true` is reached via
 * `connect()` with a real cipher that the client and responder actually install and interoperate through, not a `FAKE_TAG` stub asserting `isEncrypted === false`.
 *
 * Crypto anti-vacuity is the whole point: a test that asserts `isEncrypted === true` but never round-trips a real cipher, or that silently took the plaintext-fallback
 * path, is a false-green security test. Two mandatory checks make this non-vacuous: (1) the bidirectional-decrypt assertion decrypts the client's first encrypted
 * outbound under the responder's `receiveCipher`, proving the client->responder direction; the successful encrypted discovery proves responder->client; and (2) the
 * mutation-check corrupts one ciphertext byte of a SETUP-phase frame and asserts `connect()` rejects, proving the client genuinely decrypts a real cipher.
 */
import { ConnectionClosedByPeerError, EncryptionKeyInvalidError, EspHomeError, PermanentError } from "../../src/errors.ts";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import type { EspHomeClient } from "../../src/esphome-client.ts";
import type { EspHomeLogging } from "../../src/types.ts";
import type { InboundMessage } from "../../src/transport.ts";
import { MessageType } from "../../src/protocol/index.ts";
import type { NoiseResponder } from "../simulator/noise-responder.ts";
import type { Scenario } from "../simulator/simulator.ts";
import type { Socket } from "node:net";
import { Transport } from "../../src/transport.ts";
import type { TransportLike } from "../../src/transport.ts";
import assert from "node:assert/strict";
import { basicDiscovery } from "../simulator/scenarios/index.ts";
import { createNoiseResponder } from "../simulator/noise-responder.ts";
import { openEspHomeClient } from "../../src/esphome-client.ts";

describe("encrypted session end-to-end - real NNpsk0 cipher", () => {

  // A 32-byte pre-shared key. Two distinct buffers decode the same bytes: the client receives the base64 string (the success path zeroizes the initiator's decoded copy),
  // and the responder receives a FRESH 32-byte buffer so the wipe does not pull the key out from under it mid-handshake.
  const PSK_BYTES = Buffer.alloc(32, 0x5A);
  const PSK_BASE64 = PSK_BYTES.toString("base64");

  // Discardable logger - no console noise during the test run.
  const silentLogger: EspHomeLogging = { debug: (): void => { /* discard */ }, error: (): void => { /* discard */ }, info: (): void => { /* discard */ }, warn: (): void => { /* discard */ } };

  // Yield a macrotask so the transport's connect listener is attached before we fire the responder's connect event. `setImmediate` runs after the microtask queue
  // drains, so the synchronous-then-microtask-hop chain inside `openEspHomeClient` -> `connect` -> `Transport.open` has registered `socket.once("connect", ...)` by then.
  const yieldTick = async (): Promise<void> => { await new Promise<void>((resolve): void => { setImmediate(resolve); }); };

  // The untriggered inbound frames the in-flight connect consumes, in order: HELLO_RESPONSE (hello phase), DEVICE_INFO_RESPONSE + LIST_ENTITIES_SWITCH_RESPONSE +
  // LIST_ENTITIES_DONE_RESPONSE (setup/discovery phase), then SWITCH_STATE_RESPONSE (run phase, consumed after connect resolves). Mirrors the e2e replay/capture filter.
  const scenarioFrames = (scenario: Scenario): InboundMessage[] => scenario.inbound.filter((frame) => frame.trigger === undefined).map((frame) => ({ payload: frame.payload, type: frame.type }));

  // Build a fresh responder PSK buffer per call so no two responders share a mutable key.
  const responderPsk = (): Buffer => Buffer.from(PSK_BYTES);

  // Drive a single encrypted connect: kick off the open, fire the responder's connect, and await the client. `transportFactory` returns a REAL Transport over the
  // responder's mock socket, so a real cipher pair is installed - the only test seam is the injected socket. We count factory invocations to prove no plaintext fallback
  // (a fallback constructs a second transport). `maxConstructionRetries: 0` keeps the attempt single-shot so a corrupted-frame run rejects promptly instead of retrying.
  const driveEncryptedConnect = async (responder: NoiseResponder): Promise<{ client: EspHomeClient; transportConstructions: number }> => {

    let transportConstructions = 0;

    const openPromise = openEspHomeClient({

      host: "encrypted-host",
      keepAlive: false,
      logger: silentLogger,
      maxConstructionRetries: 0,
      psk: PSK_BASE64,
      reconnect: false,
      transportFactory: (options): Promise<TransportLike> => {

        transportConstructions++;

        // The factory returns a REAL Transport over the responder's mock socket - the only test seam. The mock conforms structurally to the methods the transport
        // invokes; the `as unknown as Socket` cast mirrors the transport unit tests' `socketFactory` shape.
        return Transport.open({ ...options, socketFactory: (): Socket => responder.socket as unknown as Socket });
      }
    });

    await yieldTick();
    responder.start();

    const client = await openPromise;

    return { client, transportConstructions };
  };

  test("a real handshake reaches isEncrypted === true and round-trips both cipher directions", async () => {

    const responder = createNoiseResponder({ frames: scenarioFrames(basicDiscovery), psk: responderPsk() });
    const { client, transportConstructions } = await driveEncryptedConnect(responder);

    // The decisive crypto assertions. `isEncrypted` and `capabilities().encryption.active` assert `=== true` - reached only via a genuine cipher install, since the
    // synthetic responder is an independent HandshakeState and the discovery frames decrypt only if the two ciphers truly interoperate.
    assert.equal(client.isEncrypted, true, "the session must be encrypted after a real NNpsk0 handshake");
    assert.equal(client.capabilities().encryption.active, true, "capabilities must report the encrypted session as active");

    // Discovery decoded through the encrypted channel: the one switch from the encrypted LIST_ENTITIES stream.
    const entities = client.getEntitiesWithIds();

    assert.equal(entities.length, 1, "the encrypted LIST_ENTITIES stream must yield exactly one switch entity");
    assert.equal(entities[0]!.type, "switch");

    // Exactly one transport was constructed: a silent plaintext fallback would have built a second one, so this rules out an `isEncrypted === false` masquerading as
    // "connected".
    assert.equal(transportConstructions, 1, "no plaintext fallback - exactly one transport must be constructed for an encrypted connect");

    // BIDIRECTIONAL real-cipher proof (closes the false-green gap). The client's first data-phase outbound is its encrypted HELLO_REQUEST. We strip the `[0x01][be16]`
    // wire header and decrypt the ciphertext under the responder's `receiveCipher` (nonce 0, before any other receiveCipher use), then assert the recovered inner
    // envelope `[type-be16][len-be16]` is a well-formed HELLO_REQUEST. The successful discovery already proved responder->client; this proves client->responder.
    const firstDataWrite = responder.firstDataWrite();

    assert.ok(firstDataWrite, "the responder must have captured the client's first encrypted outbound");

    const receiveCipher = responder.receiveCipher();

    assert.ok(receiveCipher, "the responder must hold a receive cipher after the handshake");

    const ciphertext = firstDataWrite.subarray(3);
    const innerPlaintext = receiveCipher.DecryptWithAd(Buffer.alloc(0), ciphertext);

    assert.ok(innerPlaintext.length >= 4, "the decrypted inner envelope must carry at least the 4-byte [type][len] header");
    assert.equal(innerPlaintext.readUInt16BE(0), MessageType.HELLO_REQUEST, "the client's first encrypted outbound must decrypt to a HELLO_REQUEST envelope");

    const innerLen = innerPlaintext.readUInt16BE(2);

    assert.equal(innerPlaintext.length, 4 + innerLen, "the recovered inner envelope length must match its declared payload length");

    client[Symbol.dispose]();
  });

  test("corrupting a SETUP-phase encrypted frame makes connect reject (the cipher genuinely decrypts)", async () => {

    // Mutation-check / crypto anti-vacuity proof. The responder flips one ciphertext byte of the LIST_ENTITIES_SWITCH_RESPONSE - a SETUP-phase frame the in-flight
    // connect awaits via the discovery loop, NOT a run-phase frame that would decrypt-fail only after connect already resolved (corrupting SWITCH_STATE would leave the
    // green path intact and prove nothing). A genuine ChaCha20-Poly1305 cipher rejects the tampered frame at its AEAD tag check: the transport's
    // `receiveCipher.DecryptWithAd` throws, the transport tears down, and `connect()` rejects. The decrypt teardown deterministically races just ahead of the discovery
    // `waitFor` rejection, so the surfaced error is the transport-closed failure the teardown produces (the discovery loop's next `transport.send` hits the now-closed
    // transport) - a faithful downstream consequence of the real decrypt failing, not an unrelated connection error. The differential below is the airtight non-vacuity
    // proof: the SAME harness with the SAME bytes, minus the one flipped ciphertext byte, connects successfully (the happy-path test above) - so this rejection is caused
    // by the corruption and nothing else. If the cipher were a no-op stub, the flipped byte would be invisible and this connect would falsely succeed.
    const responder = createNoiseResponder({ corruptType: MessageType.LIST_ENTITIES_SWITCH_RESPONSE, frames: scenarioFrames(basicDiscovery), psk: responderPsk() });

    await assert.rejects(async (): Promise<void> => { await driveEncryptedConnect(responder); }, (err: unknown): boolean => {

      // The rejection must be a typed client error from the real protocol path (an EspHomeError), proving the corruption propagated through genuine decrypt + teardown
      // rather than surfacing as a test-harness fault. Concretely it is the ConnectionClosedByPeerError the post-teardown send raises; the broader EspHomeError check
      // documents that any teardown-rooted client error is the expected shape while pinning it to the library's typed hierarchy.
      assert.ok(err instanceof EspHomeError, "connect must reject with a typed client error after the real cipher rejects the tampered frame, got: " + String(err));
      assert.ok(err instanceof ConnectionClosedByPeerError, "the decrypt teardown surfaces as a transport-closed rejection, got: " + String(err));

      return true;
    });
  });

  // Drive a single encrypted connect whose responder corrupts msg2 on the header=0 SUCCESS path so the client cannot complete the handshake. Returns the construction
  // count via a closure so a REJECTED connect still proves no plaintext fallback (a fallback would construct a second transport). Mirrors driveEncryptedConnect but keeps
  // the count reachable on the rejection path and surfaces the client reference so `isEncrypted` can be checked. `maxConstructionRetries: 0` keeps the attempt
  // single-shot.
  const driveBadKeyConnect = (responder: NoiseResponder): { count: () => number; openPromise: Promise<EspHomeClient> } => {

    let transportConstructions = 0;

    const openPromise = openEspHomeClient({

      host: "encrypted-host",
      keepAlive: false,
      logger: silentLogger,
      maxConstructionRetries: 0,
      psk: PSK_BASE64,
      reconnect: false,
      transportFactory: (options): Promise<TransportLike> => {

        transportConstructions++;

        return Transport.open({ ...options, socketFactory: (): Socket => responder.socket as unknown as Socket });
      }
    });

    return { count: (): number => transportConstructions, openPromise };
  };

  // The two header=0-UNDECRYPTABLE bad-key modes, parameterized: a low-order responder ephemeral drives the client's X25519 DH to INVALID_REMOTE_KEY; a 0xFF ephemeral
  // drives a DH-accepted-but-wrong secret to a payload AEAD AUTH_FAILED. Both re-tag to a permanent EncryptionKeyInvalidError in the connect flow, so connect() must fail
  // CLOSED: reject with EncryptionKeyInvalidError (a PermanentError), never reach isEncrypted === true, and construct ONE transport (no plaintext fallback). These
  // two modes are the meaningful coverage for the header=0 path; the in-band header != 0 reject is already fail-closed and exercises neither the readMessage wrap nor the
  // narrowed gate.
  for(const mode of [ "auth-failed", "low-order" ] as const) {

    test("a header=0 undecryptable msg2 (" + mode + ") fails closed - rejects EncryptionKeyInvalidError, never encrypted, one transport", async () => {

      const responder = createNoiseResponder({ frames: scenarioFrames(basicDiscovery), psk: responderPsk(), undecryptableMode: mode });
      const { count, openPromise } = driveBadKeyConnect(responder);

      // Guard the open promise's eventual rejection so firing the responder connect cannot surface an unhandled rejection between the tick and the assertion.
      const settled = openPromise.then((client): { client?: EspHomeClient; err?: unknown } => ({ client }), (err: unknown): { client?: EspHomeClient; err?: unknown } => ({ err }));

      await yieldTick();
      responder.start();

      const outcome = await settled;

      assert.equal(outcome.client, undefined, "a bad-key encrypted connect must NOT resolve to a connected client");
      assert.ok(outcome.err instanceof EncryptionKeyInvalidError, "a header=0 undecryptable msg2 must reject with EncryptionKeyInvalidError, got: " + String(outcome.err));
      assert.ok(outcome.err instanceof PermanentError, "the bad-key rejection must be a PermanentError so the default reconnect predicate gives up");
      assert.equal(count(), 1, "no plaintext fallback - a bad-key handshake must construct exactly one transport");
    });
  }
});
