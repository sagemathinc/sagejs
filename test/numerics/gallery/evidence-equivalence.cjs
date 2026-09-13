"use strict";

const assert = require("node:assert/strict");

function normalizeGeneratedJson(text) {
  return text.endsWith("\r\n") ? `${text.slice(0, -2)}\n` : text;
}

function isDerivedByteMeasurement(location) {
  const segments = location.split("/");
  const leaf = segments.at(-1) ?? "";
  return (
    (segments.includes("measurements") || segments.includes("budget_measurements")) &&
    (leaf === "bytes" || leaf.endsWith("_bytes"))
  );
}

function assertEvidenceEquivalent(actual, expected, location = "$") {
  if (typeof actual === "number" || typeof expected === "number") {
    assert.equal(typeof actual, "number", `${location} changed type`);
    assert.equal(typeof expected, "number", `${location} changed type`);
    assert.ok(Number.isFinite(actual), `${location} generated a non-finite number`);
    assert.ok(Number.isFinite(expected), `${location} checked a non-finite number`);
    if (Number.isInteger(actual) && Number.isInteger(expected)) {
      if (isDerivedByteMeasurement(location)) {
        // These receipts count serialized computed floats. Equivalent values
        // can use a few more or fewer decimal digits across CPython/libm
        // implementations; the recursively compared payload still guards its
        // complete structure and numerical meaning.
        assert.ok(
          Math.abs(actual - expected) <= 1024,
          `${location} changed by ${Math.abs(actual - expected)} bytes`,
        );
      } else {
        assert.equal(actual, expected, `${location} changed`);
      }
      return;
    }
    // Numerical evidence is binary64 data, not an exact external encoding.
    // Admit ordinary cross-platform rounding while rejecting changes above a
    // small multiple of machine epsilon at the value's absolute scale.
    const tolerance = 64 * Number.EPSILON *
      Math.max(1, Math.abs(actual), Math.abs(expected));
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${location} changed: generated ${actual}, checked ${expected}, ` +
        `tolerance ${tolerance}`,
    );
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${location} changed type`);
    assert.ok(Array.isArray(expected), `${location} changed type`);
    assert.equal(actual.length, expected.length, `${location} changed length`);
    for (let index = 0; index < actual.length; index += 1) {
      assertEvidenceEquivalent(actual[index], expected[index], `${location}/${index}`);
    }
    return;
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    assert.deepEqual(actualKeys, expectedKeys, `${location} changed keys`);
    for (const key of actualKeys) {
      assertEvidenceEquivalent(actual[key], expected[key], `${location}/${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, `${location} changed`);
}

module.exports = { assertEvidenceEquivalent, normalizeGeneratedJson };
