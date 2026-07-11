/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * errors.types.test.ts: Type-level tests for the typed error hierarchy's instanceof narrowing.
 */
import { AuthenticationError, ConnectionError, EspHomeError, NoiseHandshakeError, PermanentError } from "./errors.ts";
import { describe, test } from "node:test";
import type { NoiseHandshakeErrorCode } from "./errors.ts";
import assert from "node:assert/strict";

describe("Error hierarchy type-level narrowing", () => {

  test("instanceof EspHomeError narrows error to .code: string | undefined", () => {

    const fn = (err: unknown): string | undefined => {

      if(err instanceof EspHomeError) {

        // Inside this branch, err.code is observable as string | undefined.
        return err.code;
      }

      return undefined;
    };

    assert.equal(fn(new ConnectionError("x", "MY_CODE")), "MY_CODE");
    assert.equal(fn(new Error("plain")), undefined);
  });

  test("instanceof NoiseHandshakeError narrows .code to NoiseHandshakeErrorCode", () => {

    const err = new NoiseHandshakeError("x", "AUTH_FAILED");

    if(err instanceof NoiseHandshakeError) {

      // Type-level: err.code is narrowed from `string | undefined` to NoiseHandshakeErrorCode (a discriminated union).
      const code: NoiseHandshakeErrorCode = err.code;

      assert.equal(code, "AUTH_FAILED");
    }
  });

  test("PermanentError marker is structurally an EspHomeError", () => {

    const err: PermanentError = new AuthenticationError("auth failed");

    // Both narrowings hold simultaneously: PermanentError is also EspHomeError.
    assert.equal(err instanceof EspHomeError, true);
    assert.equal(err instanceof PermanentError, true);
  });

  test("plain Error does NOT narrow to EspHomeError", () => {

    const plain: Error = new Error("plain");

    // @ts-expect-error - assigning a plain Error to an EspHomeError-typed binding is a type error; the runtime value is rejected by the typechecker.
    const _bad: EspHomeError = plain;

    void _bad;

    assert.equal(plain instanceof EspHomeError, false);
  });
});

describe("NoiseHandshakeErrorCode discriminated union", () => {

  test("rejects an unknown code at the type level", () => {

    const accept = (code: NoiseHandshakeErrorCode): string => code;

    // @ts-expect-error - "NOT_A_REAL_CODE" is not in the documented discriminated union.
    accept("NOT_A_REAL_CODE");

    // Real codes are accepted.
    assert.equal(accept("AUTH_FAILED"), "AUTH_FAILED");
    assert.equal(accept("HANDSHAKE_TIMEOUT"), "HANDSHAKE_TIMEOUT");
  });
});
