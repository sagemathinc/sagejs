// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  PLATFORMS,
  POLICY_SCHEMA,
  RECEIPT_SCHEMA,
  REQUIRED_FAILURES,
  REQUIRED_SANITIZERS,
  SOURCE_BUNDLE_ALGORITHM,
  generateSourceBundle,
  queryAutoReceiptPolicy,
  readJson,
  sha256,
  validatePolicyDocument,
  verifyPolicy,
} = require("../tools/math-dispatch/hyperelliptic-auto-receipt-policy.cjs");

const ROOT = path.resolve(__dirname, "..");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const COMMIT = "d".repeat(40);

function clone(value) {
  return structuredClone(value);
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(filename, bytes);
  return sha256(bytes);
}

function requirement(id, platforms) {
  return { id, platforms: [...platforms] };
}

function exactModel(fingerprints = [HASH_A]) {
  return { kind: "exact-fingerprint", fingerprints };
}

function domainModel(genus = [2]) {
  return {
    kind: "domain-envelope",
    domain_id: "odd-prime-cantor-v1",
    constraints: {
      genus,
      field_kind: ["prime"],
      model_kind: ["odd-degree-one-infinity"],
      h_kind: ["zero"],
    },
  };
}

function envelope(overrides = {}) {
  return {
    prime_min: 3,
    prime_max: 1009,
    interval_start_min: 3,
    interval_stop_max: 100000,
    interval_span_max: 100000,
    batch_items_min: 1,
    batch_items_max: 1000,
    scalar_bits_max: 256,
    resource_bytes_max: 64 * 1024 * 1024,
    ...overrides,
  };
}

function evidenceMap(ids) {
  return Object.fromEntries(
    ids.map((id) => [id, { status: "passed", artifact_sha256: HASH_C }]),
  );
}

function fixture({ model = exactModel() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-hyp-auto-policy-"));
  fs.mkdirSync(path.join(root, "source"), { recursive: true });
  fs.writeFileSync(path.join(root, "source", "kernel.py"), "def kernel(x):\n    return x + 1\n");
  fs.mkdirSync(path.join(root, "corpus"), { recursive: true });
  fs.writeFileSync(path.join(root, "corpus", "cases.json"), "{\"cases\":[1,2,3]}\n");
  fs.mkdirSync(path.join(root, "harness"), { recursive: true });
  fs.writeFileSync(path.join(root, "harness", "run.cjs"), "'use strict';\n");
  const generated = generateSourceBundle(root, ["source/kernel.py"]);
  const sourceBundle = { ...generated, source_commit: COMMIT };
  const corpusPath = "corpus/cases.json";
  const harnessPath = "harness/run.cjs";
  const corpus = {
    id: "finite-cantor-v1",
    path: corpusPath,
    sha256: sha256(fs.readFileSync(path.join(root, corpusPath))),
  };
  const harness = {
    path: harnessPath,
    sha256: sha256(fs.readFileSync(path.join(root, harnessPath))),
  };
  const receipts = [];
  for (const platform of PLATFORMS) {
    const receipt = {
      schema: RECEIPT_SCHEMA,
      platform,
      source_bundle: sourceBundle,
      corpus,
      backend: "cantor-native-v1",
      operation: "scalar-batch",
      model_evidence: clone(model),
      envelope_evidence: envelope(),
      exact: {
        harness_sha256: harness.sha256,
        targets: {
          dynamic: { result_sha256: HASH_A },
          native: { result_sha256: HASH_A },
          wasm: { result_sha256: HASH_A },
        },
      },
      evidence: {
        failures: evidenceMap(REQUIRED_FAILURES),
        sanitizers: evidenceMap(platform === "linux-x64" ? REQUIRED_SANITIZERS : []),
      },
    };
    const receiptPath = `receipts/${platform}.json`;
    const receiptHash = writeJson(path.join(root, receiptPath), receipt);
    receipts.push({ platform, path: receiptPath, sha256: receiptHash });
  }
  const policy = {
    schema: POLICY_SCHEMA,
    enabled: true,
    required_platforms: [...PLATFORMS],
    source_bundle_contract: {
      algorithm: SOURCE_BUNDLE_ALGORITHM,
      paths: ["source/kernel.py"],
    },
    source_bundle: sourceBundle,
    entries: [
      {
        id: "cantor-scalar-v1",
        enabled: true,
        backend: "cantor-native-v1",
        operation: "scalar-batch",
        platforms: [...PLATFORMS],
        source_bundle_sha256: sourceBundle.sha256,
        corpus,
        harness,
        required_targets: ["dynamic", "native", "wasm"],
        exact_result_sha256: HASH_A,
        model: clone(model),
        envelope: envelope(),
        required_evidence: {
          failures: REQUIRED_FAILURES.map((id) => requirement(id, PLATFORMS)),
          sanitizers: REQUIRED_SANITIZERS.map((id) => requirement(id, ["linux-x64"])),
        },
        receipts,
      },
    ],
  };
  return { root, policy };
}

function cleanup(item) {
  fs.rmSync(item.root, { recursive: true, force: true });
}

function rewriteReceipt(item, platform, transform) {
  const entry = item.policy.entries[0];
  const reference = entry.receipts.find((receipt) => receipt.platform === platform);
  const filename = path.join(item.root, reference.path);
  const receipt = readJson(filename);
  transform(receipt);
  reference.sha256 = writeJson(filename, receipt);
}

function verifyFixture(item) {
  return verifyPolicy(item.policy, { root: item.root, sourceCommit: COMMIT });
}

function exactQuery(bundleSha = null) {
  return {
    platform: "linux-x64",
    backend: "cantor-native-v1",
    operation: "scalar-batch",
    source_bundle_sha256: bundleSha,
    model: { kind: "exact-fingerprint", fingerprint: HASH_A },
    workload: {
      prime: 1009,
      interval_start: 3,
      interval_stop: 100000,
      batch_items: 64,
      scalar_bits: 256,
      resource_bytes: 32 * 1024 * 1024,
    },
  };
}

test("the checked-in release policy fails closed after the native ABI change", () => {
  const raw = readJson(
    path.join(ROOT, "architecture", "hyperelliptic-auto-receipt-policy.json"),
  );
  const policy = verifyPolicy(raw, {
    root: ROOT,
    sourceCommit: raw.source_bundle.source_commit,
  });
  assert.equal(policy.enabled, false);
  assert.equal(policy.entries.length, 6);
  assert.equal(policy.verified_receipts.length, 0);
  assert.equal(
    policy.source_bundle.sha256,
    "e927c2ffe5ea3ebaef37f9a8c4eaf7dd5f89239379e7effd0c4d057aca698c1e",
  );
  assert(Object.isFrozen(policy));
  assert.equal(
    queryAutoReceiptPolicy(policy, {
      platform: "linux-x64",
      backend: "prime-cantor",
      operation: "add",
      source_bundle_sha256: policy.source_bundle.sha256,
      model: {
        kind: "exact-fingerprint",
        fingerprint:
          "9f6fd634246b344cc75da9f21f673dd3862236ae908cf4c2780d7a2e2a6da234",
      },
      workload: {
        prime: 1009,
        interval_start: 1009,
        interval_stop: 1009,
        batch_items: 1000,
        scalar_bits: 0,
        resource_bytes: 200096,
      },
    }).reason,
    "policy-disabled",
  );
  assert.deepEqual(
    policy.entries.map((entry) => [entry.backend, entry.operation]),
    [
      ["prime-cantor", "add"],
      ["prime-cantor", "scalar"],
      ["prime-cantor", "progression"],
      ["prime-cantor", "add"],
      ["prime-cantor", "scalar"],
      ["prime-cantor", "progression"],
    ],
  );
});

test("source bundles are deterministic, framed, and path safe", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-source-bundle-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "source"));
  fs.writeFileSync(path.join(root, "source", "a"), "bc");
  fs.writeFileSync(path.join(root, "source", "ab"), "c");
  const first = generateSourceBundle(root, ["source/a", "source/ab"]);
  const repeat = generateSourceBundle(root, ["source/a", "source/ab"]);
  assert.deepEqual(first, repeat);
  assert.equal(first.algorithm, SOURCE_BUNDLE_ALGORITHM);
  fs.writeFileSync(path.join(root, "source", "ab"), "changed");
  assert.notEqual(
    generateSourceBundle(root, ["source/a", "source/ab"]).sha256,
    first.sha256,
  );
  assert.throws(
    () => generateSourceBundle(root, ["source/ab", "source/a"]),
    /must be sorted/,
  );
  assert.throws(() => generateSourceBundle(root, ["../outside"]), /repository-relative/);
  if (process.platform !== "win32") {
    fs.symlinkSync(path.join(root, "source", "a"), path.join(root, "source", "link"));
    assert.throws(
      () => generateSourceBundle(root, ["source/link"]),
      /symbolic link/,
    );
  }
});

test("an exact four-platform policy verifies and authorizes only its envelope", () => {
  const item = fixture();
  try {
    const verified = verifyFixture(item);
    assert.equal(verified.verified_receipts.length, 4);
    assert.deepEqual(queryAutoReceiptPolicy(
      verified,
      exactQuery(item.policy.source_bundle.sha256),
    ), {
      selected: true,
      reason: "exact-receipt-policy-match",
      entry_id: "cantor-scalar-v1",
      backend: "cantor-native-v1",
    });
    const tooLarge = exactQuery(item.policy.source_bundle.sha256);
    tooLarge.workload.scalar_bits = 257;
    assert.deepEqual(queryAutoReceiptPolicy(verified, tooLarge), {
      selected: false,
      reason: "unreceipted-fallback",
    });
    const unknownModel = exactQuery(item.policy.source_bundle.sha256);
    unknownModel.model.fingerprint = HASH_B;
    assert.equal(queryAutoReceiptPolicy(verified, unknownModel).selected, false);
  } finally {
    cleanup(item);
  }
});

test("every numeric policy dimension is bounded by receipt evidence", () => {
  const broaderValues = {
    prime_min: 2,
    prime_max: 1010,
    interval_start_min: 2,
    interval_stop_max: 100001,
    interval_span_max: 100001,
    batch_items_min: 0,
    batch_items_max: 1001,
    scalar_bits_max: 257,
    resource_bytes_max: 64 * 1024 * 1024 + 1,
  };
  for (const [field, broader] of Object.entries(broaderValues)) {
    const item = fixture();
    try {
      item.policy.entries[0].envelope[field] = broader;
      assert.throws(
        () => verifyFixture(item),
        /broader workload envelope/,
        field,
      );
    } finally {
      cleanup(item);
    }
  }
});

test("exact-model policy fingerprints cannot exceed receipt evidence", () => {
  const model = fixture();
  try {
    model.policy.entries[0].model.fingerprints.push(HASH_B);
    assert.throws(
      () => verifyFixture(model),
      /broader model envelope/,
    );
  } finally {
    cleanup(model);
  }
});

test("a broad domain requires explicit receipt coverage for every authorized class", () => {
  const item = fixture({ model: domainModel([2]) });
  try {
    item.policy.entries[0].model.constraints.genus.push(3);
    assert.throws(
      () => verifyFixture(item),
      /broader model envelope/,
    );
  } finally {
    cleanup(item);
  }
});

test("receipt hashes, platform sets, and safe paths fail closed", () => {
  const hash = fixture();
  try {
    hash.policy.entries[0].receipts[0].sha256 = HASH_A;
    assert.throws(
      () => verifyFixture(hash),
      /hash does not match policy/,
    );
  } finally {
    cleanup(hash);
  }

  const missing = fixture();
  try {
    missing.policy.entries[0].receipts.pop();
    assert.throws(
      () => verifyFixture(missing),
      /receipt platforms do not match/,
    );
  } finally {
    cleanup(missing);
  }

  const mismatch = fixture();
  try {
    rewriteReceipt(mismatch, "linux-x64", (receipt) => {
      receipt.platform = "linux-arm64";
    });
    assert.throws(
      () => verifyFixture(mismatch),
      /mismatched platform/,
    );
  } finally {
    cleanup(mismatch);
  }

  const traversal = fixture();
  try {
    traversal.policy.entries[0].receipts[0].path = "../receipt.json";
    assert.throws(
      () => verifyFixture(traversal),
      /repository-relative/,
    );
  } finally {
    cleanup(traversal);
  }
});

test("source bundle and corpus mismatches are rejected after receipt authentication", () => {
  const bundle = fixture();
  try {
    rewriteReceipt(bundle, "linux-x64", (receipt) => {
      receipt.source_bundle.sha256 = HASH_A;
    });
    assert.throws(
      () => verifyFixture(bundle),
      /mismatched source bundle/,
    );
  } finally {
    cleanup(bundle);
  }

  const corpus = fixture();
  try {
    rewriteReceipt(corpus, "linux-x64", (receipt) => {
      receipt.corpus.sha256 = HASH_A;
    });
    assert.throws(
      () => verifyFixture(corpus),
      /does not match its policy workload/,
    );
  } finally {
    cleanup(corpus);
  }
});

test("checkout commit, checked-in corpus, and harness identities are verified", () => {
  const commit = fixture();
  try {
    assert.throws(
      () => verifyPolicy(commit.policy, {
        root: commit.root,
        sourceCommit: "e".repeat(40),
      }),
      /source commit does not match/,
    );
  } finally {
    cleanup(commit);
  }

  const corpus = fixture();
  try {
    fs.appendFileSync(path.join(corpus.root, corpus.policy.entries[0].corpus.path), " ");
    assert.throws(
      () => verifyFixture(corpus),
      /corpus hash does not match repository contents/,
    );
  } finally {
    cleanup(corpus);
  }

  const harness = fixture();
  try {
    fs.appendFileSync(path.join(harness.root, harness.policy.entries[0].harness.path), " ");
    assert.throws(
      () => verifyFixture(harness),
      /harness hash does not match repository contents/,
    );
  } finally {
    cleanup(harness);
  }
});

test("every required failure and sanitizer witness must be authenticated", () => {
  const failure = fixture();
  try {
    rewriteReceipt(failure, "linux-arm64", (receipt) => {
      delete receipt.evidence.failures["worker-loss"];
    });
    assert.throws(
      () => verifyFixture(failure),
      /lacks required failures evidence worker-loss/,
    );
  } finally {
    cleanup(failure);
  }

  const sanitizer = fixture();
  try {
    rewriteReceipt(sanitizer, "linux-x64", (receipt) => {
      delete receipt.evidence.sanitizers.leak;
    });
    assert.throws(
      () => verifyFixture(sanitizer),
      /lacks required sanitizers evidence leak/,
    );
  } finally {
    cleanup(sanitizer);
  }
});

test("dynamic, native, and Wasm targets must share the authorized exact digest", () => {
  const missing = fixture();
  try {
    rewriteReceipt(missing, "win32-x64", (receipt) => {
      delete receipt.exact.targets.wasm;
    });
    assert.throws(
      () => verifyFixture(missing),
      /lacks required exact target wasm/,
    );
  } finally {
    cleanup(missing);
  }

  const mismatch = fixture();
  try {
    rewriteReceipt(mismatch, "darwin-arm64", (receipt) => {
      receipt.exact.targets.native.result_sha256 = HASH_B;
    });
    assert.throws(
      () => verifyFixture(mismatch),
      /mismatched exact native digest/,
    );
  } finally {
    cleanup(mismatch);
  }
});

test("malformed policies cannot weaken the mandatory evidence or query boundary", () => {
  const item = fixture();
  try {
    item.policy.entries[0].required_evidence.failures.pop();
    assert.throws(
      () => validatePolicyDocument(item.policy),
      /must require exactly/,
    );
  } finally {
    cleanup(item);
  }
  const platforms = fixture();
  try {
    platforms.policy.required_platforms.pop();
    platforms.policy.entries[0].platforms.pop();
    platforms.policy.entries[0].receipts.pop();
    assert.throws(
      () => validatePolicyDocument(platforms.policy),
      /must name every Phase-10 platform/,
    );
  } finally {
    cleanup(platforms);
  }
  assert.throws(
    () => queryAutoReceiptPolicy(Object.freeze({ enabled: true }), exactQuery(HASH_A)),
    /verified immutable policy/,
  );
});
