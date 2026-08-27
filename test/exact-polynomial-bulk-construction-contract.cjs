#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const report = JSON.parse(
  readFileSync(
    resolve(root, "bench/results/exact-polynomial-bulk-construction.json"),
    "utf8",
  ),
);

function runPublicDifferentials() {
  const source = String.raw`
import json

R = PolynomialRing(ZZ, "x")
S = PolynomialRing(QQ, "y")
huge = 2**65537 + 1
large_denominator = 2**32771 + 1

integer_cases = [
    R([]),
    R([0, 0, 0]),
    R((1, -2, 3, 0, 0)),
    R([1, huge, 0]),
]
rational_cases = [
    S([]),
    S([0, 0]),
    S((QQ(-2) / QQ(-4), QQ(6) / QQ(-8), 0, 0)),
    S([QQ(huge) / QQ(large_denominator), 0]),
]
canonical_skew = QQ(huge) / QQ(large_denominator)

invalid = False
try:
    R([1, None, 3])
except Exception:
    invalid = True

answer = {
    "integer": [[int(value.degree()), [str(part) for part in value.coefficients()], loads(dumps(value)) == value] for value in integer_cases],
    "rational": [[int(value.degree()), [str(part) for part in value.coefficients()], loads(dumps(value)) == value] for value in rational_cases],
    "integer_skew_exact": integer_cases[-1][1] == huge,
    "rational_skew_exact": rational_cases[-1][0] == canonical_skew,
    "rational_skew_expected": str(canonical_skew),
    "rational_skew_expected_parts": [str(canonical_skew._numerator), str(canonical_skew._denominator)],
    "rational_skew_parts": [str(rational_cases[-1][0]._numerator), str(rational_cases[-1][0]._denominator)],
    "huge": str(huge),
    "large_denominator": str(large_denominator),
    "resource": [integer_cases[-1]._has_fmpz_polynomial_resource(), rational_cases[-1]._has_fmpq_polynomial_resource()],
    "invalid": invalid,
}
print("SAGEJS_EXACT_POLY_DIFFERENTIAL " + json.dumps(answer, separators=(",", ":")))
`;
  const result = spawnSync(process.execPath, [resolve(root, "bin/sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 120_000,
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const prefix = "SAGEJS_EXACT_POLY_DIFFERENTIAL ";
  const line = result.stdout.split("\n").find((candidate) => candidate.startsWith(prefix));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice(prefix.length));
}

test("exact polynomial ingress contract is explicit and representation-neutral", () => {
  assert.equal(
    report.contract.schema,
    "sagejs.contract/exact-polynomial-bulk-construction-v1",
  );
  assert.deepEqual(
    report.contract.required_api.map((entry) => entry.declaration),
    [
      "flint:fmpz_polynomial_from_byte_region",
      "flint:fmpq_polynomial_from_byte_region",
    ],
  );
  assert.match(report.contract.lowering.ingress, /one host-to-foreign copy/);
  assert.match(report.contract.lowering.host_fast_path, /ordinary coercion loop/);
  assert.match(report.contract.lowering.ownership, /independent/);
  assert.ok(
    report.contract.invariants.includes(
      "arbitrarily skewed coefficient sizes require no uniform per-entry limb capacity",
    ),
  );
  assert.ok(
    report.contract.invariants.includes(
      "one public construction performs at most one host-to-foreign byte-stream copy on Node",
    ),
  );
  assert.match(report.contract.acceptance.boundary, /zero scalar coefficient calls/);
  assert.match(report.contract.acceptance.boundary, /no stream-sized BigInt/);
  assert.match(report.contract.acceptance.performance, /same-host SageMath ratio/);
  assert.match(report.contract.acceptance.performance, /without turning one host's timing/);
  assert.match(report.contract.acceptance.remaining_performance_goal, /at most 2x/);
  assert.match(report.contract.acceptance.remaining_performance_goal, /remains unmet/);
  assert.match(report.contract.acceptance.maintainability, /no compiler branch/);
  assert.match(report.contract.acceptance.stage_gates.canonical_pack, /public canonical-list construction actually uses it/);
  assert.match(report.contract.acceptance.stage_gates.byte_region, /reverse\/hex/);
  assert.match(report.contract.acceptance.stage_gates.end_to_end, /both route assertions/);
  assert.match(report.contract.acceptance.stage_gates.skew, /maximum limb size times coefficient count/);
});

test("recorded evidence separates setup, first use, warm work, and process time", () => {
  assert.equal(
    report.schema,
    "sagejs.benchmark/exact-polynomial-bulk-construction-v1",
  );
  assert.ok(report.configuration.samples >= 3);
  assert.match(report.configuration.timing, /setup/);
  assert.match(report.configuration.timing, /first invocation/);
  assert.match(report.configuration.timing, /warm median/);
  assert.match(report.configuration.timing, /process wall time/);
  assert.match(report.repository.commit, /^[0-9a-f]{40}$/);
  assert.equal(report.repository.dirty, false);
  for (const [runtime, domains] of Object.entries(report.measurements)) {
    for (const domain of ["ZZ", "QQ"]) {
      const value = domains[domain];
      assert.equal(value.ok, true, `${runtime} ${domain}`);
      assert.equal(value.first_summary_matches, true, `${runtime} ${domain}`);
      assert.ok(value.setup_ms >= 0);
      assert.ok(value.first_ms >= 0);
      assert.ok(value.warm_ms >= 0);
      assert.ok(value.process_ms >= value.first_ms);
    }
  }
  const labels = new Set(report.additional_host_evidence.map((entry) => entry.label));
  assert.ok(labels.has("macos-arm64-5001"));
  assert.ok(labels.has("linux-x64-20001"));
  const m1Evidence = report.additional_host_evidence.filter((entry) =>
    entry.label === "macos-arm64-5001",
  );
  for (const evidence of report.additional_host_evidence) {
    assert.equal(evidence.repository.dirty, false, evidence.label);
    assert.match(evidence.repository.commit, /^[0-9a-f]{40}$/, evidence.label);
    assert.ok(Number.isInteger(evidence.configuration.samples));
    assert.ok(evidence.configuration.samples > 0);
    assert.ok(Number.isInteger(evidence.configuration.count));
    assert.ok(evidence.configuration.count > 0);
    for (const [runtime, domains] of Object.entries(evidence.measurements)) {
      for (const domain of ["ZZ", "QQ"]) {
        const value = domains[domain];
        assert.equal(value.ok, true, `${evidence.label} ${runtime} ${domain}`);
        for (const key of ["setup_ms", "first_ms", "warm_ms", "process_ms"]) {
          assert.equal(typeof value[key], "number", `${evidence.label} ${runtime} ${domain} ${key}`);
          assert.ok(Number.isFinite(value[key]), `${evidence.label} ${runtime} ${domain} ${key}`);
          assert.ok(value[key] >= 0, `${evidence.label} ${runtime} ${domain} ${key}`);
        }
      }
    }
    for (const [domain, comparison] of Object.entries(evidence.comparisons)) {
      assert.equal(comparison.summaries_match, true, `${evidence.label} ${domain}`);
      assert.equal(typeof comparison.sagejs_over_sage, "number", `${evidence.label} ${domain}`);
      assert.ok(Number.isFinite(comparison.sagejs_over_sage), `${evidence.label} ${domain}`);
      assert.ok(comparison.sagejs_over_sage > 0, `${evidence.label} ${domain}`);
    }
  }
  for (const evidence of m1Evidence) {
    assert.equal(evidence.host.platform, "darwin");
    assert.equal(evidence.host.architecture, "arm64");
    assert.equal(evidence.host.cpu, "Apple M1 Max");
    for (const domain of ["ZZ", "QQ"]) {
      assert.equal(evidence.measurements.sagejs[domain].ok, true);
      assert.equal(evidence.diagnostic_stages[domain].ok, true);
    }
    // This host had no usable SageMath command-line oracle. Cross-runtime
    // semantics and ratios are recorded by the Linux reports; this evidence
    // proves the generated-resource path itself on macOS arm64.
    assert.deepEqual(evidence.comparisons, {});
  }
  const large = report.additional_host_evidence.find(
    (entry) => entry.label === "linux-x64-20001",
  );
  assert.equal(large.host.platform, "linux");
  assert.equal(large.host.architecture, "x64");
  assert.equal(large.configuration.count, 20_001);
  for (const domain of ["ZZ", "QQ"]) {
    assert.equal(large.measurements.sagejs[domain].ok, true);
    assert.equal(large.diagnostic_stages[domain].skew_bits, 65_538);
  }
});

test("stage evidence demonstrates checked packing and direct borrowed parsing", () => {
  for (const domain of ["ZZ", "QQ"]) {
    const stages = report.diagnostic_stages[domain];
    assert.equal(stages.ok, true);
    assert.ok(stages.encoded_bytes > 16);
    assert.ok(stages.checked_host_list_pack_ms >= 0);
    assert.ok(stages.canonical_envelope_ms >= 0);
    assert.ok(stages.byte_region_creation_ms >= 0);
    assert.ok(stages.borrowed_parse_ms >= 0);
    assert.ok(stages.skew_checked_host_list_pack_ms >= 0);
    assert.ok(stages.skew_public_construct_ms >= 0);
    assert.ok(stages.skew_encoded_bytes > stages.encoded_bytes);
    assert.equal(stages.skew_bits, 65_538);
  }
  assert.match(
    report.contract.eliminated_bottleneck.diagnosis,
    /former bulk path unnecessarily round-tripped its canonical byte stream through one enormous exact integer/,
  );
});

test("public exact construction preserves dense Sage semantics without legacy N-API", () => {
  const value = runPublicDifferentials();
  assert.deepEqual(value.integer.slice(0, 3), [
    [-1, [], true],
    [-1, [], true],
    [2, ["1", "-2", "3"], true],
  ]);
  assert.deepEqual(value.integer[3].slice(0, 1), [1]);
  assert.deepEqual(value.integer[3][1].slice(0, 1), ["1"]);
  assert.equal(value.integer_skew_exact, true);
  assert.equal(value.integer[3][1][1], value.huge);
  assert.equal(value.integer[3][2], true);
  assert.deepEqual(value.rational.slice(0, 3), [
    [-1, [], true],
    [-1, [], true],
    [1, ["1/2", "-3/4"], true],
  ]);
  assert.deepEqual(value.rational[3].slice(0, 1), [0]);
  assert.equal(value.rational_skew_exact, true);
  assert.equal(value.rational[3][1][0], value.rational_skew_expected);
  assert.deepEqual(value.rational_skew_parts, value.rational_skew_expected_parts);
  assert.equal(value.rational[3][2], true);
  assert.deepEqual(value.resource, [true, true]);
  assert.equal(value.invalid, true);
});
