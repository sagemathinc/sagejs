// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "../src/baselib");
const compilerBootstrap = fs.readFileSync(
  path.join(root, "compiler_bootstrap.py"),
  "utf8",
);
const sageBootstrap = fs.readFileSync(
  path.join(root, "sagejs_bootstrap.py"),
  "utf8",
);

function definition(source, name) {
  const start = source.indexOf(`def ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = source.indexOf("\ndef ", start + 1);
  return source.slice(start, next === -1 ? source.length : next).trim();
}

test("optimizer runtime guards are identical in both bootstrap closures", () => {
  for (const name of [
    "ρσ_prepare_strict_float_region",
    "ρσ_prepare_machine_field_region",
    "ρσ_materialize_machine_field_value",
    "ρσ_machine_field_power",
  ]) {
    assert.equal(definition(sageBootstrap, name), definition(compilerBootstrap, name));
  }
});

test("runtime guards expose stable actionable reason codes", () => {
  for (const reason of [
    "invalid-iteration-count",
    "missing-live-ins",
    "live-in-not-binary64",
    "invalid-entry-contract",
    "element-brand-unavailable",
    "live-in-brand-mismatch",
    "sequence-shape-mismatch",
    "integer-coercion-contract-mismatch",
    "in-place-descriptor-mutated",
    "machine-integer-coercion-mutated",
    "modulus-out-of-range",
    "integer-constant-invalid",
    "live-in-representation-mismatch",
    "sequence-element-representation-mismatch",
    "extension-parent-contract-mismatch",
    "extension-operation-contract-mismatch",
    "extension-negation-contract-mismatch",
    "extension-power-contract-mismatch",
    "extension-modulus-out-of-range",
  ]) {
    assert.match(compilerBootstrap, new RegExp(`reject\\("${reason}"\\)`));
  }
});
