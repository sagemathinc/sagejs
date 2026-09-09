// sagejs-test-tier: unit
"use strict";
const fs = require("node:fs"), path = require("node:path"), test = require("node:test");
const assert = require("node:assert/strict");
const { unreducedRecoverySource } = require("../bench/class-unit-groups/diagnose-cubic-unreduced-recovery-build.cjs");
test("unreduced recovery ablates only conditioning, not certification or limits", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const result = unreducedRecoverySource(source);
  const start = source.indexOf("def _cubic_relation_prefix_has_archimedean_unit(");
  const end = source.indexOf("\ndef ", start + 1);
  const newEnd = result.indexOf("\ndef ", start + 1);
  assert.equal(result.slice(0, start), source.slice(0, start));
  assert.equal(result.slice(newEnd), source.slice(end));
  const proofStart = "    coefficient_bits: uint64 = 0";
  assert.equal(result.slice(result.indexOf(proofStart, start), newEnd),
    source.slice(source.indexOf(proofStart, start), end));
  assert(!result.slice(start, newEnd).includes("fmpz_matrix_lll_transform_prefix("));
  assert.throws(() => unreducedRecoverySource(result));
  assert.throws(() => unreducedRecoverySource(""));
});
