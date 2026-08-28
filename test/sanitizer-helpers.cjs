// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  sanitizerCompilerFlag,
  sanitizerEnvironment,
} = require("./helpers/sanitizers.cjs");

test("sanitizer capabilities preserve Linux coverage and avoid Apple ASan", () => {
  const environment = sanitizerEnvironment({ strictStringChecks: true });
  assert.equal(
    environment.ASAN_OPTIONS,
    `detect_leaks=${process.platform === "darwin" ? 0 : 1}:` +
      "halt_on_error=1:strict_string_checks=1",
  );
  assert.equal(
    sanitizerCompilerFlag(),
    process.platform === "darwin"
      ? "-fsanitize=undefined"
      : "-fsanitize=address,undefined",
  );
});
