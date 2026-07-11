/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * voice-assistant.types.test.ts: Type-level tests for the VoiceAssistantApi public surface. Verifies that consumer-facing signatures accept the documented argument
 * shapes and reject obvious mis-uses (wrong argument types, wrong return-type assumptions).
 */
import { describe, test } from "node:test";
import { EspHomeClient } from "./esphome-client.ts";
import type { VoiceAssistantApi } from "./voice-assistant.ts";
import assert from "node:assert/strict";

describe("VoiceAssistantApi.respondToRequest - argument-shape narrowing", () => {

  test("respondToRequest accepts no arguments (default API-audio acceptance)", () => {

    const client = new EspHomeClient({ host: "localhost" });
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- type-test: pin the return type to `void` literally.
    const result: void = client.voiceAssistant.respondToRequest();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- type-test: reference the binding to suppress unused-var without changing the type contract.
    result;
    client.disconnect();
  });

  test("respondToRequest accepts an empty options object", () => {

    const client = new EspHomeClient({ host: "localhost" });

    client.voiceAssistant.respondToRequest({});
    client.disconnect();
  });

  test("respondToRequest accepts { port: number }", () => {

    const client = new EspHomeClient({ host: "localhost" });

    client.voiceAssistant.respondToRequest({ port: 12345 });
    client.disconnect();
  });

  test("respondToRequest accepts { error: boolean }", () => {

    const client = new EspHomeClient({ host: "localhost" });

    client.voiceAssistant.respondToRequest({ error: true });
    client.voiceAssistant.respondToRequest({ error: false });
    client.disconnect();
  });

  test("respondToRequest accepts both { port, error } together", () => {

    const client = new EspHomeClient({ host: "localhost" });

    client.voiceAssistant.respondToRequest({ error: true, port: 12345 });
    client.disconnect();
  });

  test("respondToRequest is reachable as a method on VoiceAssistantApi (not nullable)", () => {

    const client = new EspHomeClient({ host: "localhost" });
    const api: VoiceAssistantApi = client.voiceAssistant;

    assert.equal(typeof api.respondToRequest, "function");

    client.disconnect();
  });

  test("respondToRequest rejects a string port (must be number)", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - port must be number, not string.
    client.voiceAssistant.respondToRequest({ port: "12345" });

    client.disconnect();
  });

  test("respondToRequest rejects a numeric error flag (must be boolean)", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - error must be boolean, not numeric.
    client.voiceAssistant.respondToRequest({ error: 1 });

    client.disconnect();
  });

  test("respondToRequest rejects unknown option keys (exactOptionalPropertyTypes enforces shape)", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // @ts-expect-error - unknown option key must not type-check.
    client.voiceAssistant.respondToRequest({ unknownField: true });

    client.disconnect();
  });

  test("respondToRequest return type is void (not Promise<void>)", () => {

    const client = new EspHomeClient({ host: "localhost" });

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- type-test: pin the return type to `void` literally.
    const result: void = client.voiceAssistant.respondToRequest();

    // @ts-expect-error - the result is `void`, not a thenable; assigning to a Promise must fail.
    const asPromise: Promise<void> = client.voiceAssistant.respondToRequest();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- type-test: reference the binding to suppress unused-var without changing the type contract.
    result;
    void asPromise;

    client.disconnect();
  });
});
