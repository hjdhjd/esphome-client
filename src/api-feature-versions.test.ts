/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * api-feature-versions.test.ts: Unit tests for the protocol-feature version table and the deviceSupports comparator.
 */
import { API_FEATURE_VERSIONS, deviceSupports } from "./api-feature-versions.ts";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("API_FEATURE_VERSIONS table", () => {

  test("every entry has a valid major/minor shape", () => {

    for(const [ name, version ] of Object.entries(API_FEATURE_VERSIONS)) {

      assert.equal(typeof version.major, "number", name + ".major must be a number");
      assert.equal(typeof version.minor, "number", name + ".minor must be a number");
      assert.ok(version.major >= 1, name + ".major must be at least 1");
      assert.ok(version.minor >= 0, name + ".minor must be non-negative");
    }
  });

  test("entries are kept in alphabetical order so the file diff stays clean on additions", () => {

    const keys = Object.keys(API_FEATURE_VERSIONS);
    const sorted = [...keys].sort();

    assert.deepEqual(keys, sorted, "API_FEATURE_VERSIONS keys should be alphabetical");
  });
});

describe("deviceSupports", () => {

  test("returns true at the exact floor (boundary)", () => {

    assert.equal(deviceSupports({ major: 1, minor: 14 }, { major: 1, minor: 14 }), true);
  });

  test("returns true above the floor (same major)", () => {

    assert.equal(deviceSupports({ major: 1, minor: 15 }, { major: 1, minor: 14 }), true);
    assert.equal(deviceSupports({ major: 1, minor: 99 }, { major: 1, minor: 11 }), true);
  });

  test("returns false below the floor (same major)", () => {

    assert.equal(deviceSupports({ major: 1, minor: 13 }, { major: 1, minor: 14 }), false);
    assert.equal(deviceSupports({ major: 1, minor: 0 }, { major: 1, minor: 1 }), false);
  });

  test("returns true when the device's major exceeds the floor's major (any minor)", () => {

    assert.equal(deviceSupports({ major: 2, minor: 0 }, { major: 1, minor: 99 }), true);
    assert.equal(deviceSupports({ major: 3, minor: 0 }, { major: 1, minor: 14 }), true);
  });

  test("returns false when the device's major is below the floor's major (any minor)", () => {

    assert.equal(deviceSupports({ major: 0, minor: 99 }, { major: 1, minor: 0 }), false);
  });

  test("disconnected sentinel (major 0, minor 0) supports no version-gated feature", () => {

    for(const version of Object.values(API_FEATURE_VERSIONS)) {

      assert.equal(deviceSupports({ major: 0, minor: 0 }, version), false);
    }
  });
});
