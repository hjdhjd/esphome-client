/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * lifecycle/handshake.ts: Connect-phase handshake + version negotiation + entity discovery.
 */

import { API_FEATURE_VERSIONS, deviceSupports } from "../api-feature-versions.ts";
import type { ClientMetrics, EspHomeLogging, Nullable } from "../types.ts";
import {
  EncryptionKeyInvalidError, EncryptionKeyMissingError, EncryptionRequiredError, NegotiationFailedError,
  NoiseHandshakeError, NoiseHandshakeTimeoutError, PeerClosedDuringNoiseError, PlaintextHandshakeError, ProtocolError
} from "../errors.ts";
import { MessageType, WireType } from "../protocol/index.ts";
import { decodeProtobuf, encodeProtoFields } from "../protocol/codec.ts";
import { extractNumberField, extractStringField } from "../protocol/field-extractors.ts";
import { Buffer } from "node:buffer";
import type { FieldValue } from "../protocol/codec.ts";
import type { MessageReceiver } from "../message-receiver.ts";
import type { TransportLike } from "../transport.ts";
import { createESPHomeHandshake } from "../crypto-noise.ts";

/**
 * Connect-phase handshake.
 *
 * @remarks This module owns every step of the connect-flow handshake: the optional Noise NNpsk0 handshake, the plaintext HELLO exchange and protocol-version
 * negotiation, the legacy CONNECT_REQUEST authentication for API < 1.11, and the entity-discovery sequence terminated by `LIST_ENTITIES_DONE_RESPONSE`. Each function
 * takes its dependencies through an explicit input object so the module is testable in isolation - no host class reach-back.
 *
 * @module lifecycle/handshake
 */

/**
 * Range of API major versions supported by this client. Range-based negotiation, rather than checking against a single allowed major, lets the library extend support
 * for a future ESPHome major-version bump with a one-line constant change rather than a new major version of this library.
 */
export interface ApiMajorRange {

  readonly max: number;
  readonly min: number;
}

/**
 * Client-side API version advertised in `HELLO_REQUEST`. The major must lie within {@link ApiMajorRange} to satisfy negotiation; the minor is informational and gates
 * features available to the device.
 */
export interface ClientApiVersion {

  readonly major: number;
  readonly minor: number;
}

/**
 * Inputs required to run the noise handshake. The `psk` is the resolved 32-byte key (base64); when null, callers must skip noise entirely - the helper rejects with
 * {@link EncryptionKeyMissingError} if invoked without one.
 */
export interface NoiseHandshakeInput {

  readonly expectedServerName: Nullable<string>;
  readonly log: EspHomeLogging;
  readonly metrics: ClientMetrics | undefined;
  readonly psk: Nullable<string>;
  readonly signal: AbortSignal;
  readonly transport: TransportLike;
}

/**
 * Inputs required to run the plaintext HELLO exchange + protocol-version negotiation. The host wires `setApiMinorVersion` to its own state so subsequent capability
 * queries read the right value.
 */
export interface PlaintextHandshakeInput {

  readonly clientApiVersion: ClientApiVersion;
  readonly clientId: string;
  readonly log: EspHomeLogging;
  readonly maxFieldsPerMessage: number;
  readonly psk: Nullable<string>;
  readonly receiver: MessageReceiver;
  readonly setApiMinorVersion: (minor: number) => void;
  readonly signal: AbortSignal;
  readonly supportedApiMajors: ApiMajorRange;
  readonly transport: TransportLike;
}

/**
 * Inputs required to run the legacy authentication step. API >= 1.11 short-circuits without a wire round-trip.
 */
export interface AuthenticateInput {

  readonly apiMinorVersion: number;
  readonly log: EspHomeLogging;
  readonly receiver: MessageReceiver;
  readonly signal: AbortSignal;
  readonly transport: TransportLike;
}

/**
 * Inputs required to run the entity-discovery loop. The host wires its discovery state mutation through the apply* callbacks so this module never reaches back
 * into the host class. The count* callbacks feed the discovery gauges; whether the `services` event fires is decided independently inside the host's `emitServices`
 * callback.
 */
export interface DiscoveryInput {

  readonly applyDeviceInfo: (payload: Buffer) => void;
  readonly applyListEntity: (type: number, payload: Buffer) => void;
  readonly applyListServiceEntity: (payload: Buffer) => void;
  readonly countEntities: () => number;
  readonly countServices: () => number;
  readonly emitDeviceInfo: () => void;
  readonly emitEntities: () => void;
  readonly emitServices: () => void;
  readonly listEntitiesMessageTypes: ReadonlySet<number>;
  readonly metrics: ClientMetrics | undefined;
  readonly receiver: MessageReceiver;
  readonly signal: AbortSignal;
  readonly transport: TransportLike;
}

/**
 * Run the Noise NNpsk0 handshake over the supplied transport. Initializes the cipher state, sends the empty initial frame, processes the server's hello + handshake
 * replies, and installs the cipher pair on success.
 *
 * @param input - Handshake inputs.
 * @throws {EncryptionKeyMissingError} when invoked without a PSK.
 * @throws {NoiseHandshakeError} for framing-level handshake failures (truncated/short/missing-key) that are not key problems.
 * @throws {EncryptionKeyInvalidError} when the encrypted handshake reply cannot be authenticated: the in-band server rejection (header != 0), OR a local AEAD failure
 * decrypting the reply (`AUTH_FAILED`), OR a malformed / low-order peer ephemeral that fails X25519 key agreement (`INVALID_REMOTE_KEY`). Every enumerated failure above
 * is a permanent bad-key failure; the granular cause code is preserved on the error's `cause` chain.
 * @throws {NoiseHandshakeTimeoutError} when the abort signal fires (timeout or user-driven abort).
 * @throws {PlaintextHandshakeError} when the announced server name does not match the expected name.
 */
export async function performNoiseHandshake(input: NoiseHandshakeInput): Promise<void> {

  const { expectedServerName, log, metrics, psk, signal, transport } = input;

  if(!psk) {

    throw new EncryptionKeyMissingError("Missing encryption key.", "ENCRYPTION_KEY_MISSING");
  }

  transport.enterNoiseHandshake();

  const noiseClient = createESPHomeHandshake({ logger: log, psk: Buffer.from(psk, "base64") });
  const startedAt = Date.now();

  try {

    // Step 1: send the empty initial handshake frame.
    await transport.sendNoiseHandshakeFrame(Buffer.alloc(0));

    // Step 2: receive the server hello frame. Format: [chosen-proto][server-name\x00][...].
    const serverHello = await transport.nextNoiseHandshakeFrame(signal);
    const chosenProto = (serverHello.length > 0) ? serverHello.readUInt8(0) : -1;

    if(chosenProto !== 1) {

      throw new NoiseHandshakeError("Unknown protocol selected by server: " + String(chosenProto) + ".", "UNSUPPORTED_TOKEN");
    }

    if(expectedServerName) {

      const serverNameEnd = serverHello.indexOf(0, 1);

      if(serverNameEnd > 1) {

        const serverName = serverHello.subarray(1, serverNameEnd).toString();

        if(expectedServerName !== serverName) {

          throw new PlaintextHandshakeError("Server name mismatch, expected " + expectedServerName + ", got " + serverName + ".", "SERVER_NAME_MISMATCH");
        }
      }
    }

    // Step 3: send our handshake message prefixed with the zero header byte.
    const handshakeMessage = noiseClient.writeMessage();

    await transport.sendNoiseHandshakeFrame(Buffer.concat([ Buffer.from([0]), handshakeMessage ]));

    // Step 4: receive the server handshake reply. First byte 0 indicates success; non-zero is an authentication failure.
    const serverHandshake = await transport.nextNoiseHandshakeFrame(signal);

    if(serverHandshake.length === 0) {

      throw new NoiseHandshakeError("Server handshake reply was empty.", "TRUNCATED_E");
    }

    const header = serverHandshake.readUInt8(0);

    if(header !== 0) {

      throw new EncryptionKeyInvalidError("Noise handshake failure: " + serverHandshake.subarray(1).toString() + ".", "NOISE_HANDSHAKE_FAILED");
    }

    // Read the server's handshake reply. This is the connect-flow's final crypto step, so a bad-KEY failure here is permanent: either the server rejected our PSK (a
    // local AEAD `AUTH_FAILED` decrypting the header=0 reply) or the peer ephemeral was malformed / a low-order point (`INVALID_REMOTE_KEY` from the X25519 DH). We own
    // the phase context the primitive lacks, so we re-tag every genuine bad-key code into the permanent EncryptionKeyInvalidError. The framing / internal codes
    // (TRUNCATED_E, CT_TOO_SHORT, MISSING_KEYS, HANDSHAKE_COMPLETE) are NOT key problems and pass through unchanged as their own NoiseHandshakeError - the fallback gate
    // fails them closed but the reconnect supervisor may retry a one-off garble. We do NOT call noiseClient.destroy() here: the outer catch is the single teardown owner,
    // and our EncryptionKeyInvalidError (not a DOMException) flows through it unchanged.
    try {

      noiseClient.readMessage(serverHandshake.subarray(1));
    } catch(err) {

      if((err instanceof NoiseHandshakeError) && ((err.code === "AUTH_FAILED") || (err.code === "INVALID_REMOTE_KEY"))) {

        throw new EncryptionKeyInvalidError(
          "The device's encrypted handshake reply could not be authenticated; the encryption key may be wrong or the reply was rejected.", "NOISE_HANDSHAKE_FAILED",
          { cause: err });
      }

      throw err;
    }

    if(!noiseClient.sendCipher || !noiseClient.receiveCipher) {

      throw new NoiseHandshakeError("Cipher pair missing after successful handshake.", "MISSING_KEYS");
    }

    transport.installCipher({ receiveCipher: noiseClient.receiveCipher, sendCipher: noiseClient.sendCipher });

    metrics?.timing("noise.handshake.duration_ms", Date.now() - startedAt);
    log.debug("Noise handshake complete, encryption enabled.");

    // The cipher pair is now owned by the transport. Wipe the spent handshake secrets (PSK, chaining key, handshake hash, ephemeral) WITHOUT touching the live ciphers -
    // closing the zeroization contract on the success path. (The catch path below calls the full destroy(), which is correct there since no ciphers are in use.)
    noiseClient.destroyHandshakeSecrets();

  } catch(err) {

    noiseClient.destroy();

    // Translate signal-driven aborts into typed timeout errors so the caller's catch can decide whether to fall back.
    if((err instanceof DOMException) && ((err.name === "AbortError") || (err.name === "TimeoutError"))) {

      throw new NoiseHandshakeTimeoutError("Noise handshake timed out.", "HANDSHAKE_TIMEOUT", { cause: err });
    }

    throw err;
  }
}

/**
 * Run the plaintext (or post-noise) HELLO exchange. Sends `HELLO_REQUEST`, awaits `HELLO_RESPONSE`, applies range-based version negotiation, and stamps the device's
 * API minor version through the `setApiMinorVersion` callback.
 *
 * @param input - Handshake inputs.
 * @throws {EncryptionRequiredError} when the server requires encryption but no PSK was configured.
 * @throws {NegotiationFailedError} when the device's API major is outside the supported range.
 */
export async function performPlaintextHandshake(input: PlaintextHandshakeInput): Promise<void> {

  const { clientApiVersion, clientId, log, maxFieldsPerMessage, psk, receiver, setApiMinorVersion, signal, supportedApiMajors, transport } = input;
  const clientInfo = Buffer.from(clientId, "utf8");

  try {

    await transport.send(MessageType.HELLO_REQUEST, encodeProtoFields([
      { fieldNumber: 1, value: clientInfo, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: clientApiVersion.major, wireType: WireType.VARINT },
      { fieldNumber: 3, value: clientApiVersion.minor, wireType: WireType.VARINT }
    ]));

    const message = await receiver.waitFor([MessageType.HELLO_RESPONSE], { signal });

    applyHelloResponse({ clientApiVersion, log, maxFieldsPerMessage, payload: message.payload, setApiMinorVersion, supportedApiMajors });

  } catch(err) {

    // No-PSK case: peer responded with the noise indicator byte, transport surfaced PROTOCOL_MISMATCH. Translate to EncryptionRequiredError so consumers see a typed
    // permanent failure rather than a generic protocol error.
    if((err instanceof ProtocolError) && (err.code === "PROTOCOL_MISMATCH") && !psk) {

      throw new EncryptionRequiredError("Server requires encryption but no PSK was configured.", "ENCRYPTION_REQUIRED", { cause: err });
    }

    throw err;
  }
}

/**
 * Apply protocol-version negotiation to a `HELLO_RESPONSE` payload and stamp the device's announced minor version through the supplied setter. Exported for direct
 * testing of the negotiation logic without the surrounding wire I/O.
 *
 * @param input - Decoded payload + version constants + setter.
 * @throws {NegotiationFailedError} when the device's API major is outside the supported range.
 */
export function applyHelloResponse(input: {
  readonly clientApiVersion: ClientApiVersion;
  readonly log: EspHomeLogging;
  readonly maxFieldsPerMessage: number;
  readonly payload: Buffer;
  readonly setApiMinorVersion: (minor: number) => void;
  readonly supportedApiMajors: ApiMajorRange;
}): void {

  const { clientApiVersion, log, maxFieldsPerMessage, payload, setApiMinorVersion, supportedApiMajors } = input;

  const fields = decodeProtobufWithLog(payload, maxFieldsPerMessage, log);

  const majorVersion = extractNumberField(fields, 1);
  const minorVersion = extractNumberField(fields, 2);
  const serverInfo = extractStringField(fields, 3);
  const deviceName = extractStringField(fields, 4);

  if(serverInfo) {

    log.debug("ESPHome server info: " + serverInfo);
  }

  if(deviceName) {

    log.debug("ESPHome device name: " + deviceName);
  }

  if((majorVersion === undefined) || (minorVersion === undefined)) {

    log.warn("Device did not provide API version information.");

    return;
  }

  setApiMinorVersion(minorVersion);

  log.debug("ESPHome API version: " + String(majorVersion) + "." + String(minorVersion) + " (client supports majors " + String(supportedApiMajors.min) + "-" +
    String(supportedApiMajors.max) + ", minor " + String(clientApiVersion.minor) + ").");

  // Range-based major-version negotiation: when ESPHome ships a major-version bump, this client adds support with a one-line constant change in SUPPORTED_API_MAJORS
  // rather than a new major version of this library.
  if((majorVersion < supportedApiMajors.min) || (majorVersion > supportedApiMajors.max)) {

    throw new NegotiationFailedError("Device announced API major version " + String(majorVersion) + " which is outside the client's supported range " +
      String(supportedApiMajors.min) + "-" + String(supportedApiMajors.max) + ".", "API_MAJOR_OUT_OF_RANGE");
  }

  if(minorVersion > clientApiVersion.minor) {

    log.debug("Device uses newer API minor version (" + String(minorVersion) + " vs " + String(clientApiVersion.minor) + "). Some features may not be available.");

  } else if(minorVersion < clientApiVersion.minor) {

    log.debug("Device uses older API minor version (" + String(minorVersion) + " vs " + String(clientApiVersion.minor) + "). Using compatibility mode.");
  }
}

/**
 * Send the legacy `CONNECT_REQUEST` and await `CONNECT_RESPONSE` for devices below the modern-handshake floor. Modern-handshake-capable devices skip authentication
 * for unauthenticated sessions, so this is a no-op against them. The version gate consults the {@link API_FEATURE_VERSIONS.modernHandshake}
 * table entry rather than a hardcoded minor number...the table is the single source of truth for protocol-feature version floors.
 *
 * @param input - Authentication inputs.
 */
export async function authenticateIfNeeded(input: AuthenticateInput): Promise<void> {

  const { apiMinorVersion, log, receiver, signal, transport } = input;

  // Synthesize the device's API version for the table comparison. Major is hardcoded to 1 here for the same reason it is in parseCapabilities: the handshake's
  // earlier major-version check (applyHelloResponse) already rejected anything outside SUPPORTED_API_MAJORS before we got here. When ESPHome ships a v2 major, the
  // upstream callers thread the major through and this synthesis goes away.
  const apiVersion = { major: 1, minor: apiMinorVersion };

  if(deviceSupports(apiVersion, API_FEATURE_VERSIONS.modernHandshake)) {

    log.debug("Using modern handshake for API version 1." + String(apiMinorVersion) + "; skipping CONNECT_REQUEST.");

    return;
  }

  log.debug("Using legacy handshake for API version 1." + String(apiMinorVersion) + "; sending CONNECT_REQUEST.");

  await transport.send(MessageType.CONNECT_REQUEST, Buffer.alloc(0));

  // CONNECT_RESPONSE and AUTHENTICATION_RESPONSE share message id 4. Either name applies; receiver matches by numeric id.
  await receiver.waitFor([MessageType.CONNECT_RESPONSE], { signal });
}

/**
 * Run the entity-discovery sequence: `LIST_ENTITIES_REQUEST` + `DEVICE_INFO_REQUEST` followed by an explicit drain of every entity-list response and the device info
 * reply, terminated by `LIST_ENTITIES_DONE_RESPONSE`. Subscribes to state updates as the final step. State mutation is delegated through the input's apply/emit/count
 * callbacks so the module stays free of host references.
 *
 * @param input - Discovery inputs.
 */
export async function performDiscovery(input: DiscoveryInput): Promise<void> {

  const { applyDeviceInfo, applyListEntity, applyListServiceEntity, countEntities, countServices, emitDeviceInfo, emitEntities, emitServices,
    listEntitiesMessageTypes, metrics, receiver, signal, transport } = input;

  await transport.send(MessageType.LIST_ENTITIES_REQUEST, Buffer.alloc(0));
  await transport.send(MessageType.DEVICE_INFO_REQUEST, Buffer.alloc(0));

  // Wait for the discovery sequence to terminate. We accept any list-entities response, the device info, or the done sentinel; everything else flows to interleave
  // handlers (PING_REQUEST replies, etc.) or the per-type buffer.
  const accepted: number[] = [ MessageType.DEVICE_INFO_RESPONSE, MessageType.LIST_ENTITIES_DONE_RESPONSE, ...listEntitiesMessageTypes ];

  const nextMessage = async (): Promise<Awaited<ReturnType<typeof receiver.waitFor>>> => receiver.waitFor(accepted, { signal });

  // Discovery completes only when BOTH responses it requested have arrived: the device-info response AND the list-entities done sentinel. Gating on `done` alone let a
  // device that answers its entity stream before the device-info request leave `remoteDeviceInfo` null at connect completion, so `capabilities()`/`deviceInfo()` read
  // empty until the late response arrived in the run phase. Whichever arrives first, we keep draining until the other does; the composed `signal` (connect/handshake
  // timeout) bounds the wait, so a device that never returns DeviceInfo fails the connect with the same typed timeout the HELLO/CONNECT waits raise.
  let deviceInfoReceived = false;
  let doneReceived = false;

  while(!deviceInfoReceived || !doneReceived) {

    // eslint-disable-next-line no-await-in-loop -- each iteration awaits the next inbound message; there is no batching API on the receiver side.
    const message = await nextMessage();

    switch(message.type) {

      case MessageType.DEVICE_INFO_RESPONSE: {

        applyDeviceInfo(message.payload);
        emitDeviceInfo();
        deviceInfoReceived = true;

        break;
      }

      case MessageType.LIST_ENTITIES_DONE_RESPONSE: {

        doneReceived = true;

        break;
      }

      case MessageType.LIST_ENTITIES_SERVICES_RESPONSE: {

        applyListServiceEntity(message.payload);

        break;
      }

      default: {

        applyListEntity(message.type, message.payload);

        break;
      }
    }
  }

  metrics?.gauge("discovery.entities_found", countEntities());
  metrics?.gauge("discovery.services_found", countServices());
  emitEntities();

  // Call emitServices unconditionally so the host's callback can clear the service-registry dirty bit at connect-time even when no services were discovered.
  // Whether to actually emit the public `services` event stays the callback's decision (the host emits only when the snapshot has services), so the consumer-visible
  // semantic is unchanged but the dirty-bit lifecycle is correct: a stale mid-session DONE cannot re-emit `services` with an empty list because the dirty bit was
  // cleared here.
  emitServices();

  await transport.send(MessageType.SUBSCRIBE_STATES_REQUEST, Buffer.alloc(0));
}

/**
 * Adapts {@link decodeProtobuf} to the host's standard `maxFieldsPerMessage` cap and warn callback, so the single negotiation helper that calls it reads cleanly
 * without repeating the option-object wiring inline.
 */
function decodeProtobufWithLog(payload: Buffer, maxFieldsPerMessage: number, log: EspHomeLogging): Record<number, FieldValue[]> {

  return decodeProtobuf(payload, { maxFieldsPerMessage, warn: (m): void => { log.warn(m); } });
}

// Re-export PeerClosedDuringNoiseError so callers wiring the handshake module see the full set of typed connect-flow errors at one import site.
export { PeerClosedDuringNoiseError };
