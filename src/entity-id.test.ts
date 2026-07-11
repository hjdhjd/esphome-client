/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * entity-id.test.ts: Unit tests for the branded entity-id mint, narrow, and parse helpers in entity-id.ts.
 */
import { deriveObjectId, entityId, isEntityId, parseEntityId } from "./entity-id.ts";
import { describe, test } from "node:test";
import type { EntityId } from "./entity-id.ts";
import assert from "node:assert/strict";

describe("entityId", () => {

  test("returns a string in the canonical type-prefixed lowercased shape", () => {

    const id = entityId("light", "Bedroom Lamp");

    assert.equal(id, "light-bedroom lamp", "entityId should lowercase the object portion and prefix the type with a dash");
  });

  test("preserves an already-lowercase object id verbatim", () => {

    assert.equal(entityId("switch", "front_door"), "switch-front_door", "lowercase input should round-trip without modification");
  });

  test("accepts an empty object id (degenerate but legal)", () => {

    assert.equal(entityId("sensor", ""), "sensor-", "empty objectId is degenerate but the helper is total - it returns the prefix alone");
  });

  test("the brand is type-erased at runtime - typeof is string", () => {

    const id: EntityId<"light"> = entityId("light", "x");

    assert.equal(typeof id, "string", "the brand is a phantom type; runtime is plain string");
  });

  test("differs by entity type at runtime even for the same object id", () => {

    const lightId = entityId("light", "kitchen");
    const switchId = entityId("switch", "kitchen");

    assert.notEqual(lightId, switchId, "different types with the same objectId must produce different runtime values");
  });
});

describe("isEntityId", () => {

  test("narrows a string with the expected type prefix", () => {

    assert.equal(isEntityId("light-kitchen", "light"), true, "string with `light-` prefix narrows to EntityId<'light'>");
  });

  test("returns false for a string with a different type prefix", () => {

    assert.equal(isEntityId("switch-kitchen", "light"), false, "`switch-` prefix does NOT narrow to EntityId<'light'>");
  });

  test("returns false for a bare object id with no dash", () => {

    assert.equal(isEntityId("kitchen", "light"), false, "missing dash separator must not narrow");
  });

  test("returns false for an empty string", () => {

    assert.equal(isEntityId("", "light"), false, "empty input is not a valid id");
  });

  test("matches a string with the prefix and an empty body", () => {

    // "light-" technically passes the predicate; downstream validation (hasEntity) catches the empty id.
    assert.equal(isEntityId("light-", "light"), true, "the predicate only checks the prefix; empty body is acceptable at this layer");
  });

  test("does not match a partial prefix that's a substring of the type", () => {

    assert.equal(isEntityId("li-x", "light"), false, "partial type prefix must not match");
  });

  test("does not match when the dash is missing despite a leading type substring", () => {

    assert.equal(isEntityId("lightkitchen", "light"), false, "the dash separator is required");
  });
});

describe("parseEntityId", () => {

  test("returns the parsed pair for a well-formed light id", () => {

    const parsed = parseEntityId("light-kitchen");

    assert.notEqual(parsed, null, "well-formed input should parse");
    assert.equal(parsed?.type, "light", "parsed type should match the prefix");
    assert.equal(parsed?.id, "light-kitchen", "parsed id should round-trip the lowercase string");
  });

  test("normalizes a mixed-case type prefix instead of rejecting it - lenient, normalizing parse", () => {

    // parseEntityId is the lenient counterpart to the strict isEntityId guard: it lower-cases the type prefix before matching (mirroring entityId's minting convention),
    // so a mixed-case input normalizes to the canonical id rather than being rejected. The returned id was already lower-cased; lower-casing the prefix too closes the
    // internal inconsistency where the minter would accept a prefix the parser rejected.
    assert.deepEqual(parseEntityId("Light-Kitchen"), { id: "light-kitchen", type: "light" }, "a mixed-case prefix normalizes to the canonical lowercase id");
  });

  test("lowercases the object portion when the type prefix is already lowercase", () => {

    const parsed = parseEntityId("light-Kitchen");

    assert.equal(parsed?.id, "light-kitchen", "the object portion is lowercased on parse to match the canonical entityId mint convention");
  });

  test("returns null for a string with no dash", () => {

    assert.equal(parseEntityId("nodash"), null, "strings without a dash separator must not parse");
  });

  test("returns null for a leading dash (empty type)", () => {

    assert.equal(parseEntityId("-kitchen"), null, "empty type prefix must not parse");
  });

  test("returns null for a string whose prefix is not a known entity type", () => {

    assert.equal(parseEntityId("notatype-x"), null, "unknown type prefixes must not parse");
  });

  test("returns null for an empty string", () => {

    assert.equal(parseEntityId(""), null, "empty input does not parse");
  });
});

describe("deriveObjectId", () => {

  // The algorithm mirrors ESPHome's `to_sanitized_char` ∘ `to_snake_case_char` from `esphome/core/helpers.h`. Each test below corresponds to one rule of the
  // upstream pipeline. ESPHome API 1.14 omits `object_id` from `ListEntities*Response` for 1.14+ clients, so the discovery decoder uses this function as the
  // canonical fallback. Byte-for-byte parity with the upstream algorithm is the masterclass guarantee; any divergence here would mean older devices and newer
  // devices produce different ids for the same name, which would break the branded-id system.

  test("returns lowercase ASCII verbatim", () => {

    assert.equal(deriveObjectId("foo"), "foo");
    assert.equal(deriveObjectId("front_door"), "front_door");
  });

  test("lowercases uppercase ASCII letters", () => {

    assert.equal(deriveObjectId("FooBar"), "foobar");
    assert.equal(deriveObjectId("ABC"), "abc");
  });

  test("converts spaces to underscores", () => {

    assert.equal(deriveObjectId("Living Room Lamp"), "living_room_lamp");
  });

  test("preserves underscores and hyphens", () => {

    assert.equal(deriveObjectId("front-door_lock"), "front-door_lock");
  });

  test("preserves digits", () => {

    assert.equal(deriveObjectId("sensor_42"), "sensor_42");
    assert.equal(deriveObjectId("Room 12"), "room_12");
  });

  test("replaces non-alphanumeric punctuation with underscores", () => {

    assert.equal(deriveObjectId("Light #1"), "light__1", "# and space both become _, producing a double underscore");
    assert.equal(deriveObjectId("a.b.c"), "a_b_c");
    assert.equal(deriveObjectId("hello!"), "hello_");
  });

  test("replaces non-ASCII characters with underscores - one underscore per UTF-8 byte", () => {

    // Upstream iterates the BYTES of the name (each `char` in a C++ string), and any byte outside the ASCII allowed-set becomes underscore. "Café" in UTF-8 is the
    // five bytes 0x43 0x61 0x66 0xC3 0xA9 - the trailing two bytes of the UTF-8 encoding for 'é'. Each non-ASCII byte falls to the underscore branch independently,
    // so the output is "caf__" (two underscores), NOT "caf_" (one). A code-point iteration would emit one underscore per character and diverge from the upstream
    // server-side `get_object_id_to()` output for the same name - which would silently re-map every non-ASCII-named entity to a different id between the client and
    // server.
    assert.equal(deriveObjectId("Café"), "caf__");

    // "Über" in UTF-8: 0xC3 0x9C 0x62 0x65 0x72 - two underscores from the 'Ü' (two bytes) then "ber".
    assert.equal(deriveObjectId("Über"), "__ber");
  });

  test("returns empty string for empty input", () => {

    assert.equal(deriveObjectId(""), "");
  });

  test("is a no-op on already-derived values", () => {

    const once = deriveObjectId("Living Room Lamp");

    assert.equal(deriveObjectId(once), once, "deriving a derived value must produce the same value");
  });
});
