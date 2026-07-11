/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * message-types.test.ts: Unit tests for the MessageType const-object and the messageTypeName reverse lookup.
 */
import { MessageType, messageTypeName } from "./message-types.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("MessageType", () => {

  test("HELLO_REQUEST is 1 - the canonical first message in the handshake", () => {

    assert.equal(MessageType.HELLO_REQUEST, 1, "HELLO_REQUEST has wire id 1 per api.proto");
  });

  test("CONNECT_REQUEST and AUTHENTICATION_REQUEST share id 3 - the protocol reuses the wire number across the two name conventions", () => {

    assert.equal(MessageType.CONNECT_REQUEST, MessageType.AUTHENTICATION_REQUEST, "the two names refer to the same wire id by design");
    assert.equal(MessageType.CONNECT_REQUEST, 3, "the shared id is 3");
  });

  test("CONNECT_RESPONSE and AUTHENTICATION_RESPONSE share id 4 - the response side mirrors the request alias", () => {

    assert.equal(MessageType.CONNECT_RESPONSE, MessageType.AUTHENTICATION_RESPONSE, "the two names share the wire id by design");
    assert.equal(MessageType.CONNECT_RESPONSE, 4, "the shared id is 4");
  });

  test("PING_REQUEST is 7 and PING_RESPONSE is 8 - heartbeat round-trip", () => {

    assert.equal(MessageType.PING_REQUEST, 7);
    assert.equal(MessageType.PING_RESPONSE, 8);
  });
});

describe("messageTypeName", () => {

  test("returns the canonical name for a known id", () => {

    assert.equal(messageTypeName(1), "HELLO_REQUEST", "id 1 maps to HELLO_REQUEST");
  });

  test("returns one of the aliased names for a shared id (3 -> CONNECT_REQUEST or AUTHENTICATION_REQUEST)", () => {

    // The reverse map keeps whichever entry was iterated last per the SSOT comment in message-types.ts. We assert it's one of the two aliases rather than pinning to
    // either, because the iteration order is alphabetical (CONNECT_REQUEST sorts after AUTHENTICATION_REQUEST so CONNECT_REQUEST wins) but neither alias is wrong.
    const name = messageTypeName(3);

    assert.equal((name === "CONNECT_REQUEST") || (name === "AUTHENTICATION_REQUEST"), true, "id 3 maps to either alias; got: " + name);
  });

  test("returns Unknown(<id>) for an unrecognized id", () => {

    assert.equal(messageTypeName(9999), "Unknown(9999)", "unrecognized ids fall back to a stable placeholder");
  });

  test("handles negative ids without throwing", () => {

    assert.equal(messageTypeName(-1), "Unknown(-1)", "negative ids are out-of-range and fall back");
  });

  test("handles zero (a valid wire value but not a declared MessageType)", () => {

    assert.equal(messageTypeName(0), "Unknown(0)", "id 0 is not declared and falls back");
  });

  test("never returns undefined", () => {

    for(const id of [ 0, 1, 100, 9999, -1, Number.MAX_SAFE_INTEGER ]) {

      assert.notEqual(messageTypeName(id), undefined, "messageTypeName(" + String(id) + ") must always return a string");
    }
  });
});
