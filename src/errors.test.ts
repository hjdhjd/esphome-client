/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.test.ts: Unit tests for the typed error hierarchy.
 */
import {
  AuthenticationError, BackpressureError, BufferOverflowError, CameraStreamClosedError, ConfigurationError, ConnectionClosedByPeerError, ConnectionError,
  ConnectionRefusedError, ConnectionTimeoutError, DecodingError, DecryptionFailedError, EncodingError, EncryptionKeyInvalidError, EncryptionKeyMissingError,
  EncryptionRequiredError, EspHomeError, FrameTooLargeError, HandshakeError, HeartbeatStalledError, IncompatibleApiVersionError, MalformedVarintError,
  MessageTooManyFieldsError, NegotiationFailedError, NoiseHandshakeError, NoiseHandshakeTimeoutError, NotConnectedError, PeerClosedDuringNoiseError, PermanentError,
  PlaintextHandshakeError, ProtocolError, UnknownEntityTypeError, UnknownMessageTypeError, UnsupportedCapabilityError
} from "./errors.ts";
import type { CameraStreamClosedErrorCode, NoiseHandshakeErrorCode } from "./errors.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("EspHomeError", () => {

  test("is an Error subclass", () => {

    assert.equal(new EspHomeError("x") instanceof Error, true);
  });

  test("uses the constructor name as the .name property", () => {

    assert.equal(new EspHomeError("x").name, "EspHomeError", "name comes from this.constructor.name so subclasses get distinct names");
  });

  test("preserves the message", () => {

    assert.equal(new EspHomeError("hello").message, "hello");
  });

  test("stores the optional code", () => {

    assert.equal(new EspHomeError("x", "MY_CODE").code, "MY_CODE");
  });

  test("leaves code undefined when not supplied", () => {

    assert.equal(new EspHomeError("x").code, undefined);
  });

  test("preserves the cause via standard ErrorOptions", () => {

    const inner = new Error("inner");
    const outer: Error = new EspHomeError("outer", undefined, { cause: inner });

    assert.equal(outer.cause, inner, "ErrorOptions.cause must round-trip through to the standard Error.cause");
  });
});

describe("PermanentError marker", () => {

  test("is abstract - subclasses are concrete (e.g. AuthenticationError)", () => {

    // The marker class is abstract and cannot be constructed directly. Instead, validate by exercising one of its concrete subclasses.
    const auth = new AuthenticationError("auth failed");

    assert.equal(auth instanceof PermanentError, true, "AuthenticationError must inherit from PermanentError");
    assert.equal(auth instanceof EspHomeError, true, "AuthenticationError must also be an EspHomeError");
  });
});

describe("Error hierarchy - instanceof checks", () => {

  test("HandshakeError extends ConnectionError extends EspHomeError", () => {

    const err = new HandshakeError("x");

    assert.equal(err instanceof HandshakeError, true);
    assert.equal(err instanceof ConnectionError, true);
    assert.equal(err instanceof EspHomeError, true);
  });

  test("NoiseHandshakeError extends HandshakeError - and exposes a tagged code", () => {

    const err = new NoiseHandshakeError("x", "AUTH_FAILED");

    assert.equal(err instanceof NoiseHandshakeError, true);
    assert.equal(err instanceof HandshakeError, true);
    assert.equal(err.code, "AUTH_FAILED");
  });

  test("NoiseHandshakeTimeoutError extends NoiseHandshakeError", () => {

    const err = new NoiseHandshakeTimeoutError("x", "HANDSHAKE_TIMEOUT");

    assert.equal(err instanceof NoiseHandshakeTimeoutError, true);
    assert.equal(err instanceof NoiseHandshakeError, true);
  });

  test("PeerClosedDuringNoiseError extends NoiseHandshakeError", () => {

    const err = new PeerClosedDuringNoiseError("x", "PEER_CLOSED_NOISE");

    assert.equal(err instanceof PeerClosedDuringNoiseError, true);
    assert.equal(err instanceof NoiseHandshakeError, true);
  });

  test("encryption-error subclasses inherit from PermanentError", () => {

    assert.equal(new EncryptionKeyMissingError("x") instanceof PermanentError, true);
    assert.equal(new EncryptionKeyInvalidError("x") instanceof PermanentError, true);
    assert.equal(new EncryptionRequiredError("x") instanceof PermanentError, true);
  });

  test("AuthenticationError, IncompatibleApiVersionError, NegotiationFailedError inherit from PermanentError", () => {

    assert.equal(new AuthenticationError("x") instanceof PermanentError, true);
    assert.equal(new IncompatibleApiVersionError("x") instanceof PermanentError, true);
    assert.equal(new NegotiationFailedError("x") instanceof PermanentError, true);
  });

  test("ConnectionTimeoutError, ConnectionRefusedError, ConnectionClosedByPeerError, HeartbeatStalledError extend ConnectionError but NOT PermanentError", () => {

    const errs = [ new ConnectionTimeoutError("x"), new ConnectionRefusedError("x"), new ConnectionClosedByPeerError("x"), new HeartbeatStalledError("x") ];

    for(const e of errs) {

      assert.equal(e instanceof ConnectionError, true, e.constructor.name + " must extend ConnectionError");
      assert.equal(e instanceof PermanentError, false, e.constructor.name + " is recoverable; must NOT be a PermanentError");
    }
  });

  test("PlaintextHandshakeError extends HandshakeError", () => {

    assert.equal(new PlaintextHandshakeError("x") instanceof HandshakeError, true);
  });

  test("ProtocolError subclasses (DecodingError, EncodingError, UnknownEntityTypeError, etc) extend ProtocolError", () => {

    const subs = [
      new DecodingError("x"), new EncodingError("x"), new UnknownEntityTypeError("x"),
      new UnknownMessageTypeError("x"), new FrameTooLargeError("x"), new BufferOverflowError("x")
    ];

    for(const e of subs) {

      assert.equal(e instanceof ProtocolError, true, e.constructor.name + " must extend ProtocolError");
    }
  });

  test("MessageTooManyFieldsError and MalformedVarintError extend DecodingError", () => {

    assert.equal(new MessageTooManyFieldsError("x") instanceof DecodingError, true);
    assert.equal(new MalformedVarintError("x") instanceof DecodingError, true);
  });

  test("NotConnectedError, ConfigurationError, UnsupportedCapabilityError extend EspHomeError but NOT PermanentError", () => {

    const errs = [ new NotConnectedError("x"), new ConfigurationError("x"), new UnsupportedCapabilityError("x") ];

    for(const e of errs) {

      assert.equal(e instanceof EspHomeError, true);
      assert.equal(e instanceof PermanentError, false, e.constructor.name + " is recoverable from the auto-reconnect supervisor's perspective");
    }
  });
});

describe("BackpressureError", () => {

  test("stores the dropped count", () => {

    const err = new BackpressureError("dropped", 42);

    assert.equal(err.dropped, 42);
  });

  test("uses the BACKPRESSURE_EXCEEDED code", () => {

    assert.equal(new BackpressureError("x", 1).code, "BACKPRESSURE_EXCEEDED");
  });

  test("preserves the cause", () => {

    const inner = new Error("inner");
    const wrapped: Error = new BackpressureError("x", 0, { cause: inner });

    assert.equal(wrapped.cause, inner);
  });
});

describe("CameraStreamClosedError", () => {

  test("stores the cameraId", () => {

    const err = new CameraStreamClosedError("stream closed", "STREAM_CLOSED", "camera-front_door");

    assert.equal(err.cameraId, "camera-front_door");
  });

  test("uses the STREAM_CLOSED code as both the tag and base-class storage", () => {

    const err = new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-x");

    assert.equal(err.code, "STREAM_CLOSED");
  });

  test("preserves the cause via standard ErrorOptions", () => {

    const inner = new Error("inner");
    const wrapped: Error = new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-x", { cause: inner });

    assert.equal(wrapped.cause, inner);
  });

  test("climbs the inheritance chain to EspHomeError but NOT to ConnectionError or PermanentError", () => {

    // Operational standalone: it's neither a connection-family failure (it's about an in-flight bus stream) nor a permanent-configuration failure (it's recoverable
    // on the next snapshot). Mirrors the BackpressureError shape.
    const err = new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-x");

    assert.equal(err instanceof CameraStreamClosedError, true);
    assert.equal(err instanceof EspHomeError, true);
    assert.equal(err instanceof Error, true);
    assert.equal(err instanceof ConnectionError, false, "stream-closed is not a transport-level connection error");
    assert.equal(err instanceof PermanentError, false, "stream-closed is recoverable; consumer can retry the snapshot");
  });

  test("exposes the CameraStreamClosedErrorCode discriminated union for pattern-matching", () => {

    const codes: readonly CameraStreamClosedErrorCode[] = ["STREAM_CLOSED"];

    for(const code of codes) {

      const err = new CameraStreamClosedError("x", code, "camera-x");

      assert.equal(err.code, code);
    }
  });
});

describe("Class-name preservation", () => {

  test("each subclass exposes its own class name (constructor.name pattern)", () => {

    const cases: readonly (readonly [Error, string])[] = [

      [ new EspHomeError("x"), "EspHomeError" ],
      [ new ConnectionError("x"), "ConnectionError" ],
      [ new HandshakeError("x"), "HandshakeError" ],
      [ new AuthenticationError("x"), "AuthenticationError" ],
      [ new ConnectionTimeoutError("x"), "ConnectionTimeoutError" ],
      [ new HeartbeatStalledError("x"), "HeartbeatStalledError" ],
      [ new MalformedVarintError("x"), "MalformedVarintError" ],
      [ new EncryptionRequiredError("x"), "EncryptionRequiredError" ],
      [ new BackpressureError("x", 1), "BackpressureError" ],
      [ new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-x"), "CameraStreamClosedError" ]
    ];

    for(const [ instance, expectedName ] of cases) {

      assert.equal(instance.name, expectedName, "subclass name must match its constructor name");
    }
  });
});

describe("Per-class edge enumeration", () => {

  // Edge enumeration: every concrete error class enumerated below is constructed, verified to climb the inheritance chain to Error, carries a code where one is supplied,
  // and round-trips its `cause` when one is provided. The PermanentError-subclass branches additionally verify the marker. The structural-parent classes (EspHomeError,
  // ConnectionError, HandshakeError, ProtocolError, DecodingError) are covered by their direct-construction subset; PermanentError itself is abstract and is verified
  // through one of its concrete subclasses. Concrete classes exercised only through their own dedicated construction path - such as TruncatedMessageError, which is
  // constructed only through the codec suite that exercises it - are not enumerated here.

  // Concrete classes that take just `(message)` plus optional code/options.
  const simpleErrorClasses: readonly (readonly [string, new (message: string, code?: string, options?: ErrorOptions) => EspHomeError, { permanent: boolean }])[] = [

    [ "EspHomeError", EspHomeError, { permanent: false } ],
    [ "ConnectionError", ConnectionError, { permanent: false } ],
    [ "HandshakeError", HandshakeError, { permanent: false } ],
    [ "PlaintextHandshakeError", PlaintextHandshakeError, { permanent: false } ],
    [ "AuthenticationError", AuthenticationError, { permanent: true } ],
    [ "ConnectionTimeoutError", ConnectionTimeoutError, { permanent: false } ],
    [ "ConnectionRefusedError", ConnectionRefusedError, { permanent: false } ],
    [ "ConnectionClosedByPeerError", ConnectionClosedByPeerError, { permanent: false } ],
    [ "HeartbeatStalledError", HeartbeatStalledError, { permanent: false } ],
    [ "IncompatibleApiVersionError", IncompatibleApiVersionError, { permanent: true } ],
    [ "NotConnectedError", NotConnectedError, { permanent: false } ],
    [ "EncryptionKeyMissingError", EncryptionKeyMissingError, { permanent: true } ],
    [ "EncryptionKeyInvalidError", EncryptionKeyInvalidError, { permanent: true } ],
    [ "EncryptionRequiredError", EncryptionRequiredError, { permanent: true } ],
    [ "ProtocolError", ProtocolError, { permanent: false } ],
    [ "DecryptionFailedError", DecryptionFailedError, { permanent: false } ],
    [ "DecodingError", DecodingError, { permanent: false } ],
    [ "EncodingError", EncodingError, { permanent: false } ],
    [ "UnknownEntityTypeError", UnknownEntityTypeError, { permanent: false } ],
    [ "UnknownMessageTypeError", UnknownMessageTypeError, { permanent: false } ],
    [ "FrameTooLargeError", FrameTooLargeError, { permanent: false } ],
    [ "BufferOverflowError", BufferOverflowError, { permanent: false } ],
    [ "MessageTooManyFieldsError", MessageTooManyFieldsError, { permanent: false } ],
    [ "MalformedVarintError", MalformedVarintError, { permanent: false } ],
    [ "ConfigurationError", ConfigurationError, { permanent: false } ],
    [ "NegotiationFailedError", NegotiationFailedError, { permanent: true } ],
    [ "UnsupportedCapabilityError", UnsupportedCapabilityError, { permanent: false } ]
  ];

  for(const [ className, Ctor, { permanent } ] of simpleErrorClasses) {

    test(className + " climbs the inheritance chain to Error and EspHomeError", () => {

      const err = new Ctor("test message");

      assert.equal(err instanceof Error, true, className + " must be an Error subclass");
      assert.equal(err instanceof EspHomeError, true, className + " must be an EspHomeError");
      assert.equal(err.message, "test message");
      assert.equal(err.name, className, "name comes from this.constructor.name");
    });

    test(className + " stores the optional code", () => {

      const err = new Ctor("x", "TEST_CODE");

      assert.equal(err.code, "TEST_CODE");
    });

    test(className + " round-trips ErrorOptions.cause", () => {

      const inner = new Error("inner");
      const wrapped: Error = new Ctor("outer", undefined, { cause: inner });

      assert.equal(wrapped.cause, inner, className + " must preserve the cause chain");
    });

    test(className + " " + (permanent ? "extends" : "does NOT extend") + " PermanentError", () => {

      const err = new Ctor("x");

      assert.equal(err instanceof PermanentError, permanent, className + (permanent ? " is a permanent failure mode" : " is recoverable"));
    });
  }

  test("NoiseHandshakeError carries a tagged NoiseHandshakeErrorCode", () => {

    const codes: readonly NoiseHandshakeErrorCode[] = [
      "AUTH_FAILED", "CT_TOO_SHORT", "HANDSHAKE_COMPLETE", "HANDSHAKE_TIMEOUT", "INVALID_PSK_LENGTH", "MISSING_KEYS", "MSG_TOO_LONG",
      "NOT_INITIALIZED", "PEER_CLOSED_NOISE", "PEER_PLAINTEXT_DURING_NOISE", "TRUNCATED_E", "UNSUPPORTED_TOKEN"
    ];

    for(const code of codes) {

      const err = new NoiseHandshakeError("x", code);

      assert.equal(err instanceof NoiseHandshakeError, true);
      assert.equal(err instanceof HandshakeError, true);
      assert.equal(err instanceof ConnectionError, true);
      assert.equal(err instanceof EspHomeError, true);
      assert.equal(err.code, code);
    }
  });

  test("NoiseHandshakeTimeoutError climbs to NoiseHandshakeError and HandshakeError and ConnectionError", () => {

    const err = new NoiseHandshakeTimeoutError("x", "HANDSHAKE_TIMEOUT");

    assert.equal(err instanceof NoiseHandshakeTimeoutError, true);
    assert.equal(err instanceof NoiseHandshakeError, true);
    assert.equal(err instanceof HandshakeError, true);
    assert.equal(err instanceof ConnectionError, true);
    assert.equal(err instanceof EspHomeError, true);
    assert.equal(err.code, "HANDSHAKE_TIMEOUT");
  });

  test("PeerClosedDuringNoiseError climbs to NoiseHandshakeError and HandshakeError and ConnectionError", () => {

    const err = new PeerClosedDuringNoiseError("x", "PEER_CLOSED_NOISE");

    assert.equal(err instanceof PeerClosedDuringNoiseError, true);
    assert.equal(err instanceof NoiseHandshakeError, true);
    assert.equal(err instanceof HandshakeError, true);
    assert.equal(err instanceof ConnectionError, true);
    assert.equal(err.code, "PEER_CLOSED_NOISE");
  });

  test("MessageTooManyFieldsError climbs to DecodingError and ProtocolError", () => {

    const err = new MessageTooManyFieldsError("x", "TOO_MANY_FIELDS");

    assert.equal(err instanceof MessageTooManyFieldsError, true);
    assert.equal(err instanceof DecodingError, true);
    assert.equal(err instanceof ProtocolError, true);
    assert.equal(err instanceof EspHomeError, true);
    assert.equal(err.code, "TOO_MANY_FIELDS");
  });

  test("MalformedVarintError climbs to DecodingError and ProtocolError", () => {

    const err = new MalformedVarintError("x", "MALFORMED_VARINT");

    assert.equal(err instanceof MalformedVarintError, true);
    assert.equal(err instanceof DecodingError, true);
    assert.equal(err instanceof ProtocolError, true);
    assert.equal(err.code, "MALFORMED_VARINT");
  });

  test("BackpressureError carries the dropped count and the BACKPRESSURE_EXCEEDED code", () => {

    // Boundary values for `dropped`: zero, small positive, large positive at the 32-bit signed-integer boundary (2^31 - 1) to exercise number-handling without
    // overflow assumptions.
    const droppedValues: readonly number[] = [ 0, 1, 1024, 65535, 0x7FFFFFFF ];

    for(const dropped of droppedValues) {

      const err = new BackpressureError("x", dropped);

      assert.equal(err instanceof BackpressureError, true);
      assert.equal(err instanceof EspHomeError, true);
      assert.equal(err.dropped, dropped);
      assert.equal(err.code, "BACKPRESSURE_EXCEEDED", "BackpressureError uses a fixed code");
    }
  });

  test("BackpressureError preserves the cause", () => {

    const inner = new Error("inner");
    const wrapped: Error = new BackpressureError("x", 1, { cause: inner });

    assert.equal(wrapped.cause, inner);
  });

  test("CameraStreamClosedError climbs the inheritance chain to Error and EspHomeError without extending ConnectionError or PermanentError", () => {

    const err = new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-front");

    assert.equal(err instanceof CameraStreamClosedError, true);
    assert.equal(err instanceof EspHomeError, true);
    assert.equal(err instanceof Error, true);
    assert.equal(err instanceof ConnectionError, false, "operational, not transport-level");
    assert.equal(err instanceof PermanentError, false, "recoverable; consumer can retry");
    assert.equal(err.name, "CameraStreamClosedError");
    assert.equal(err.code, "STREAM_CLOSED");
    assert.equal(err.cameraId, "camera-front");
  });

  test("CameraStreamClosedError preserves the cause", () => {

    const inner = new Error("inner");
    const wrapped: Error = new CameraStreamClosedError("x", "STREAM_CLOSED", "camera-x", { cause: inner });

    assert.equal(wrapped.cause, inner);
  });

  test("PermanentError is abstract - cannot be subclassed without inheritance", () => {

    // PermanentError cannot be constructed directly - its subclasses surface the marker.
    const permanents: readonly EspHomeError[] = [

      new AuthenticationError("x"),
      new IncompatibleApiVersionError("x"),
      new EncryptionKeyMissingError("x"),
      new EncryptionKeyInvalidError("x"),
      new EncryptionRequiredError("x"),
      new NegotiationFailedError("x")
    ];

    for(const err of permanents) {

      assert.equal(err instanceof PermanentError, true, err.constructor.name + " must be a PermanentError");
      assert.equal(err instanceof EspHomeError, true, err.constructor.name + " must also be an EspHomeError");
    }
  });

  test("Transient ConnectionError subclasses do NOT extend PermanentError", () => {

    // The marker distinguishes retry candidates from terminal states. Each of these is recoverable; the auto-reconnect loop should retry them.
    const transients: readonly EspHomeError[] = [

      new ConnectionTimeoutError("x"),
      new ConnectionRefusedError("x"),
      new ConnectionClosedByPeerError("x"),
      new HeartbeatStalledError("x"),
      new HandshakeError("x"),
      new PlaintextHandshakeError("x"),
      new NoiseHandshakeError("x", "AUTH_FAILED"),
      new NoiseHandshakeTimeoutError("x", "HANDSHAKE_TIMEOUT"),
      new PeerClosedDuringNoiseError("x", "PEER_CLOSED_NOISE")
    ];

    for(const err of transients) {

      assert.equal(err instanceof PermanentError, false, err.constructor.name + " is recoverable; must NOT be a PermanentError");
      assert.equal(err instanceof ConnectionError, true, err.constructor.name + " must extend ConnectionError");
    }
  });

  test("Protocol-family classes climb to ProtocolError but NOT to ConnectionError", () => {

    const protocols: readonly EspHomeError[] = [

      new ProtocolError("x"),
      new DecodingError("x"),
      new EncodingError("x"),
      new UnknownEntityTypeError("x"),
      new UnknownMessageTypeError("x"),
      new FrameTooLargeError("x"),
      new BufferOverflowError("x"),
      new MessageTooManyFieldsError("x"),
      new MalformedVarintError("x")
    ];

    for(const err of protocols) {

      assert.equal(err instanceof ProtocolError, true, err.constructor.name + " must extend ProtocolError");
      assert.equal(err instanceof ConnectionError, false, err.constructor.name + " is a protocol-family error, not a connection-family error");
    }
  });
});
