"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "..");
const MANIFEST = resolve(ROOT, "bench/number-field-maximal-order-manifest.json");
const CLI = resolve(ROOT, "tools/number-field-maximal-order/cli.cjs");
const { canonicalBasis, polynomialDigest } = require("../tools/number-field-maximal-order/exact.cjs");
const { PersistentLineProcess } = require("../tools/number-field-maximal-order/process.cjs");
const {
  loadManifest,
  reportMarkdown,
  runManifest,
  validateManifest,
} = require("../tools/number-field-maximal-order/runner.cjs");
const { verifyOracleResult } = require("../tools/number-field-maximal-order/verify.cjs");

test("the frozen manifest is exact, deterministic, and family-aware", () => {
  const manifest = loadManifest(MANIFEST);
  assert.equal(manifest.cases.length, 11);
  assert.equal(manifest.profiles.baseline.case_ids.length, 7);
  assert.equal(manifest.corpus_metadata.case_count, 494);
  assert.deepEqual(validateManifest(manifest), []);
  assert.deepEqual(manifest.implementation_families["pari-sage"].members, ["pari", "sage"]);
  assert.deepEqual(manifest.implementation_families["hecke-oscar"].members, ["hecke", "oscar"]);
  for (const caseSpec of manifest.cases) {
    assert.match(caseSpec.expected.canonical_basis_digest, /^[0-9a-f]{64}$/);
    assert.match(polynomialDigest(caseSpec.polynomial.coefficients), /^[0-9a-f]{64}$/);
    assert.equal(BigInt(caseSpec.polynomial.coefficients.at(-1)), 1n);
  }
  const badGenerator = manifest.cases.find((entry) => entry.id === "pure-bad-generator-n8-c2pow32");
  assert.equal(badGenerator.expected.field_discriminant, "-2147483648");
  assert.equal(badGenerator.limits.magma.timeout_ms, 180000);
});

test("canonical rational row HNF ignores unimodular basis changes", () => {
  const first = canonicalBasis([
    ["1", "0", "0"],
    ["0", "1/2", "1/2"],
    ["0", "0", "1"],
  ]);
  const second = canonicalBasis([
    ["1", "1/2", "1/2"],
    ["0", "1/2", "1/2"],
    ["0", "-1/2", "1/2"],
  ]);
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first, {
    denominator: "2",
    numerator: [["2", "0", "0"], ["0", "2", "0"], ["0", "1", "1"]],
    digest: "07f519234e1d0e58501e7e431422653bb63825d93a814e1eed2990f8ef81faf6",
  });
});

test("independent verification checks containment, closure, index, and discriminant", () => {
  const basis = [["1", "0"], ["1/2", "1/2"]];
  const caseSpec = {
    polynomial: { coefficients: ["-5", "0", "1"] },
    expected: {
      polynomial_discriminant: "20",
      field_discriminant: "5",
      equation_order_index: "2",
      canonical_basis_digest: canonicalBasis(basis).digest,
    },
  };
  const valid = verifyOracleResult(caseSpec, {
    irreducible_verified: true,
    basis,
    field_discriminant: "5",
  });
  assert.equal(valid.verified, true);
  assert.ok(Object.values(valid.checks).every(Boolean));

  const corrupted = verifyOracleResult(caseSpec, {
    irreducible_verified: true,
    basis: [["1", "0"], ["0", "1"]],
    field_discriminant: "5",
  });
  assert.equal(corrupted.verified, false);
  assert.ok(corrupted.errors.some((error) => error.includes("index")));
  assert.ok(corrupted.errors.some((error) => error.includes("canonical basis")));
});

test("persistent subprocesses expose unavailable and timeout states", async () => {
  const unavailable = new PersistentLineProcess({
    name: "missing",
    command: "/definitely/not/a/maximal-order-oracle",
  });
  assert.equal((await unavailable.request("request", { timeoutMs: 20 })).status, "unavailable");

  const silent = new PersistentLineProcess({
    name: "silent",
    command: process.execPath,
    args: ["-e", "console.log('@@NFMO_READY@@test'); process.stdin.resume()"],
  });
  const timed = await silent.request("request", { timeoutMs: 30 });
  assert.equal(timed.status, "timeout");
  assert.equal(timed.timeout_ms, 30);
  const restarted = await silent.request("second request", { timeoutMs: 30 });
  assert.equal(restarted.status, "timeout");
  silent.close();
});

test("runner rejects wrong oracle results before accepting timings", async () => {
  const basis = [["1", "0"], ["1/2", "1/2"]];
  const manifest = {
    schema_version: 1,
    id: "test",
    defaults: { warmups: 0, samples: 1, memory_limit_mb: 64 },
    profiles: { baseline: { systems: { good: ["core"], bad: ["core"] } } },
    implementation_families: { independent: { members: ["good", "bad"] } },
    cases: [{
      id: "quadratic",
      polynomial: { coefficients: ["-5", "0", "1"] },
      profiles: ["baseline"],
      provenance: "test",
      expected: {
        polynomial_discriminant: "20",
        field_discriminant: "5",
        equation_order_index: "2",
        canonical_basis_digest: canonicalBasis(basis).digest,
      },
    }],
  };
  function adapter(id, reportedBasis) {
    return {
      async run() {
        return {
          case_id: "quadratic",
          system: id,
          implementation_family: "independent",
          boundary: "core",
          status: "ok",
          irreducible_verified: true,
          basis: reportedBasis,
          field_discriminant: "5",
          samples: [{ timing_ms: 1, stages: { maximal_order: 1 } }],
          statistics: { median_ms: 1, sample_count: 1 },
        };
      },
      close() {},
    };
  }
  const report = await runManifest(
    manifest,
    { profile: "baseline", systems: ["good", "bad"] },
    { good: adapter("good", basis), bad: adapter("bad", [["1", "0"], ["0", "1"]]) },
  );
  assert.equal(report.records[0].status, "ok");
  assert.equal(report.records[1].status, "invalid");
  assert.equal(report.records[1].statistics, null);
  assert.equal(report.records[1].rejected_statistics.median_ms, 1);
  assert.match(report.records[1].reason, /failed independent basis verification/);
  assert.match(reportMarkdown(report), /invalid/);
});

test("the CLI validates the checked manifest", () => {
  const result = spawnSync(process.execPath, [CLI, "validate", "--manifest", MANIFEST], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated 11 maximal-order cases/);
});

test("live GP adapter produces a verified bounded quick record when available", {
  skip: !existsSync("/usr/bin/gp"),
}, () => {
  const output = resolve(process.env.TMPDIR || "/tmp", `nfmo-test-${process.pid}.json`);
  const result = spawnSync(process.execPath, [
    CLI, "run", "--profile", "quick", "--systems", "pari",
    "--samples", "1", "--warmups", "0", "--output", output,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.records.length, 2);
  assert.ok(report.records.every((record) => record.status === "ok"));
  assert.ok(report.records.every((record) => record.verification.verified));
  assert.equal(report.records[0].implementation_family, "pari-sage");
  assert.ok(report.records[0].samples.length === 1);
});
