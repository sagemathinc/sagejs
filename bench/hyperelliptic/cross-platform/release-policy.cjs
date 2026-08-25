#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");

const {
  POLICY_SCHEMA,
  RECEIPT_SCHEMA,
  REQUIRED_FAILURES,
  REQUIRED_SANITIZERS,
  generateSourceBundle,
  queryAutoReceiptPolicy,
  verifyPolicy,
} = require("../../../tools/math-dispatch/hyperelliptic-auto-receipt-policy.cjs");

const root = resolve(__dirname, "..", "..", "..");
const results = join(__dirname, "results");
const policyDirectory = join(results, "policy-2f1e2964");
const policyPath = join(
  root,
  "architecture",
  "hyperelliptic-auto-receipt-policy.json",
);
const sourceCommit = "2f1e296481aef4455ccd0aa35199692e44509116";
const sourceBundleSha =
  "1985fa5202ce06e6dcbfe037db6f569c9791d2d6677e8c1f1a1a29b6af8d7d59";
const harnessPath = "bench/hyperelliptic/cross-platform/run.cjs";
const modelFingerprints = Object.freeze({
  2: "9f6fd634246b344cc75da9f21f673dd3862236ae908cf4c2780d7a2e2a6da234",
  3: "4979edd07927163f5a5e528117cb1fc49f6e9eeca2971d0e60eec50e7cf63279",
});
const platformFiles = Object.freeze({
  "linux-x64": "linux-x64-2f1e2964",
  "linux-arm64": "linux-arm64-2f1e2964",
  "darwin-arm64": "macos-arm64-2f1e2964",
  "win32-x64": "windows-x64-2f1e2964",
});
const platforms = Object.freeze(Object.keys(platformFiles));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function repositoryPath(filename) {
  const value = relative(root, filename).split(sep).join("/");
  assert(!value.startsWith("../"), `${filename} lies outside the repository`);
  return value;
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function output(filename, value, write) {
  const expected = bytes(value);
  if (write) {
    mkdirSync(resolve(filename, ".."), { recursive: true });
    writeFileSync(filename, expected);
  } else {
    assert.deepEqual(readFileSync(filename), expected, `${filename} is stale`);
  }
  return sha256(expected);
}

function artifact(id, platform, filename, assertions) {
  return {
    id,
    platform,
    path: repositoryPath(filename),
    sha256: sha256(readFileSync(filename)),
    assertions,
  };
}

function exactModel(genus) {
  return {
    kind: "exact-fingerprint",
    fingerprints: [modelFingerprints[genus]],
  };
}

function envelope(operation) {
  const values = {
    add: { batch: 1000, scalarBits: 0, resourceBytes: 200096 },
    scalar: { batch: 64, scalarBits: 256, resourceBytes: 11360 },
    progression: { batch: 1000, scalarBits: 0, resourceBytes: 72224 },
  }[operation];
  assert(values, `unsupported operation ${operation}`);
  return {
    prime_min: 1009,
    prime_max: 1009,
    interval_start_min: 1009,
    interval_stop_max: 1009,
    interval_span_max: 1,
    batch_items_min: values.batch,
    batch_items_max: values.batch,
    scalar_bits_max: values.scalarBits,
    resource_bytes_max: values.resourceBytes,
  };
}

function evidenceResult(value) {
  return { status: "passed", artifact_sha256: value.sha256 };
}

function main() {
  const write = process.argv.length === 3 && process.argv[2] === "--write";
  if (!write && !(process.argv.length === 3 && process.argv[2] === "--check")) {
    throw new Error("usage: release-policy.cjs --write|--check");
  }
  const candidate = readJson(policyPath);
  const generated = generateSourceBundle(
    root,
    candidate.source_bundle_contract.paths,
  );
  assert.equal(generated.sha256, sourceBundleSha);
  const sourceBundle = { ...generated, source_commit: sourceCommit };
  const harnessBytes = readFileSync(join(root, harnessPath));
  const harness = { path: harnessPath, sha256: sha256(harnessBytes) };
  assert.equal(
    harness.sha256,
    "b81a08b591d94191c23fedb6ea93c576251f46620b16732cab1087ca06c47669",
  );
  const corpus = {
    id: "phase10-primary-cantor-2f1e2964-v1",
    path: harnessPath,
    sha256: harness.sha256,
  };

  const receipts = {};
  const extras = {};
  const artifacts = [];
  for (const platform of platforms) {
    const stem = platformFiles[platform];
    const primaryPath = join(results, `${stem}.json`);
    const extrasPath = join(results, `${stem}-extras.json`);
    const primary = readJson(primaryPath);
    const extra = readJson(extrasPath);
    assert.equal(primary.schema, "sagejs.hyperelliptic-cross-platform-acceptance.v1");
    assert.equal(extra.schema, "sagejs.hyperelliptic-phase10-portable-extras.v1");
    assert.equal(primary.repository.commit, sourceCommit);
    assert.equal(extra.repository.commit, sourceCommit);
    assert.equal(primary.repository.status, "");
    assert.equal(extra.repository.status, "");
    assert.equal(`${primary.host.platform}-${primary.host.architecture}`, platform);
    assert.equal(`${extra.host.platform}-${extra.host.architecture}`, platform);
    assert.match(primary.modes.dynamic.cantor.capability, /artifact-unavailable/);
    assert.equal(extra.wasm.status, "available");
    assert.equal(extra.wasm.resource_bounds.result, false);
    assert.equal(extra.wasm.resource_bounds.short_output_unchanged, true);
    assert.equal(extra.wasm.cancellation.exit_code, 124);
    assert.equal(extra.wasm.cancellation.recovery_stdout, "42");
    assert.equal(extra.wasm.package_verification.stderr, "");
    assert.equal(extra.wasm.package_load_test.status, "passed");
    receipts[platform] = primary;
    extras[platform] = extra;
    artifacts.push(
      artifact("missing-artifact", platform, primaryPath, [
        "forced dynamic mode reports source-transparent artifact unavailable",
        "dynamic and native exact digests agree",
      ]),
      artifact("cancellation", platform, extrasPath, [
        "bounded evaluator cancellation exits 124",
        "fresh evaluator recovery returns 42",
      ]),
      artifact("memory-exhaustion", platform, extrasPath, [
        "undersized bounded output is rejected",
        "short output remains unchanged",
      ]),
      artifact("worker-loss", platform, extrasPath, [
        "timed-out worker is discarded",
        "fresh worker recovery returns 42",
      ]),
    );
  }

  const referenceExact = receipts[platforms[0]].cross_mode_exact;
  for (const platform of platforms.slice(1)) {
    assert.deepEqual(receipts[platform].cross_mode_exact, referenceExact);
  }
  const cachePath = join(results, "linux-x64-2f1e2964-cache-corruption.stdout");
  assert.match(
    readFileSync(cachePath, "utf8"),
    /receipt validation detects changed production assets/,
  );
  artifacts.push(
    artifact("cache-corruption", "linux-x64", cachePath, [
      "changed production asset invalidates its authenticated receipt",
      "artifact identity binds layout and content",
    ]),
  );
  const sanitizerPath = join(results, "linux-x64-2f1e2964-cantor-sanitizers.json");
  const sanitizer = readJson(sanitizerPath);
  assert.equal(sanitizer.schema, "sagejs.hyperelliptic-cantor-sanitizers/v1");
  assert.deepEqual(
    sanitizer.rows.map((row) => [row.sanitizer, row.status]),
    REQUIRED_SANITIZERS.map((name) => [name, "passed"]),
  );
  for (const name of REQUIRED_SANITIZERS) {
    artifacts.push(
      artifact(name, "linux-x64", sanitizerPath, [
        `${name} sanitizer executes add, scalar, and progression`,
        "genus-2 and genus-3 exact digests match the standalone corpus",
      ]),
    );
  }

  const evidenceIndex = {
    schema: "sagejs.hyperelliptic-release-evidence-index/v1",
    source_bundle: sourceBundle,
    artifacts,
  };
  output(join(policyDirectory, "evidence-index.json"), evidenceIndex, write);
  const findArtifact = (id, platform) => {
    const matches = artifacts.filter(
      (item) => item.id === id && item.platform === platform,
    );
    assert.equal(matches.length, 1, `missing ${platform} ${id} artifact`);
    return matches[0];
  };

  const requiredEvidence = {
    failures: REQUIRED_FAILURES.map((id) => ({
      id,
      platforms: id === "cache-corruption" ? ["linux-x64"] : [...platforms],
    })),
    sanitizers: REQUIRED_SANITIZERS.map((id) => ({
      id,
      platforms: ["linux-x64"],
    })),
  };
  const entries = [];
  for (const genus of [2, 3]) {
    const exact = referenceExact.cantor_cases.find((row) => row.genus === genus);
    assert(exact, `missing genus-${genus} exact row`);
    for (const operation of ["add", "scalar", "progression"]) {
      const digest = exact[`${operation}_sha256`];
      const entryId = `prime-cantor-g${genus}-${operation}-2f1e2964-v1`;
      const references = [];
      for (const platform of platforms) {
        const receiptEvidence = {
          failures: Object.fromEntries(
            REQUIRED_FAILURES.filter(
              (id) => id !== "cache-corruption" || platform === "linux-x64",
            ).map((id) => [id, evidenceResult(findArtifact(id, platform))]),
          ),
          sanitizers: platform === "linux-x64"
            ? Object.fromEntries(
                REQUIRED_SANITIZERS.map((id) => [
                  id,
                  evidenceResult(findArtifact(id, platform)),
                ]),
              )
            : {},
        };
        const policyReceipt = {
          schema: RECEIPT_SCHEMA,
          platform,
          source_bundle: sourceBundle,
          corpus,
          backend: "prime-cantor",
          operation,
          model_evidence: exactModel(genus),
          envelope_evidence: envelope(operation),
          exact: {
            harness_sha256: harness.sha256,
            targets: {
              dynamic: { result_sha256: digest },
              native: { result_sha256: digest },
            },
          },
          evidence: receiptEvidence,
        };
        const filename = join(policyDirectory, `${entryId}-${platform}.json`);
        const receiptSha = output(filename, policyReceipt, write);
        references.push({
          platform,
          path: repositoryPath(filename),
          sha256: receiptSha,
        });
      }
      entries.push({
        id: entryId,
        enabled: true,
        backend: "prime-cantor",
        operation,
        platforms: [...platforms],
        source_bundle_sha256: sourceBundle.sha256,
        corpus,
        harness,
        required_targets: ["dynamic", "native"],
        exact_result_sha256: digest,
        model: exactModel(genus),
        envelope: envelope(operation),
        required_evidence: requiredEvidence,
        receipts: references,
      });
    }
  }

  const policy = {
    $schema: "./hyperelliptic-auto-receipt-policy.schema.json",
    schema: POLICY_SCHEMA,
    enabled: true,
    required_platforms: [...platforms],
    source_bundle_contract: candidate.source_bundle_contract,
    source_bundle: sourceBundle,
    entries,
  };
  output(policyPath, policy, write);
  const verified = verifyPolicy(policy, { root, sourceCommit });
  assert.equal(verified.verified_receipts.length, entries.length * platforms.length);
  for (const entry of entries) {
    for (const platform of platforms) {
      const query = queryAutoReceiptPolicy(verified, {
        platform,
        backend: entry.backend,
        operation: entry.operation,
        source_bundle_sha256: sourceBundle.sha256,
        model: {
          kind: "exact-fingerprint",
          fingerprint: entry.model.fingerprints[0],
        },
        workload: {
          prime: entry.envelope.prime_min,
          interval_start: entry.envelope.interval_start_min,
          interval_stop: entry.envelope.interval_stop_max,
          batch_items: entry.envelope.batch_items_min,
          scalar_bits: entry.envelope.scalar_bits_max,
          resource_bytes: entry.envelope.resource_bytes_max,
        },
      });
      assert.equal(query.selected, true, `${entry.id} is not selected on ${platform}`);
    }
  }
  process.stdout.write(
    `${write ? "wrote" : "verified"} ${entries.length} exact entries and ` +
      `${verified.verified_receipts.length} receipts\n`,
  );
}

main();
