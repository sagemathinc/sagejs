// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// macOS exposes /tmp as a symlink to /private/tmp. Promotion deliberately
// rejects symlinked output ancestors, so tests which exercise the transaction
// itself must create their fixture in the canonical temporary directory.
const canonicalTemporaryRoot = fs.realpathSync(os.tmpdir());

const {
  CASE_RECEIPT_SCHEMA,
  EVIDENCE_PROGRAMS,
  EVIDENCE_RECEIPT_SCHEMA,
  REQUIRED_CHECKS,
  attachReceiptOrigin,
  buildQualification,
  canonicalJson,
  formattedJson,
  portableBuildReportBinding,
  readJson,
  sha256,
  validateQualificationSummary,
  validateManifestQualificationState,
  validateSelection,
  writePromotion,
} = require("../qualification/contracts.cjs");
const {
  validatePackagedArtifact,
  validateRawDestructive,
  validateRawSanitizer,
} = require("../qualification/collect-evidence.cjs");
const {
  verifyPlatformEnrollment,
} = require("../qualification/verify-platform-enrollment.cjs");

const digest = (character) => character.repeat(64);
const candidate = "1".repeat(40);
const campaignChallenge = digest("4");
const caseIds = ["nelder-rosenbrock-2", "nelder-beale-2"];
const corpusCases = [
  {
    id: caseIds[0], method: "nlopt-nelder-mead", problem: "rosenbrock",
    expected: [1, 1], point_tolerance: [2e-5, 2e-5], objective_tolerance: 1e-10,
  },
  {
    id: caseIds[1], method: "nlopt-nelder-mead", problem: "beale",
    expected: [3, 0.5], point_tolerance: [3e-5, 3e-5], objective_tolerance: 1e-10,
  },
];
const keyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-fixture-keys-"));
test.after(() => fs.rmSync(keyRoot, { recursive: true, force: true }));
const platformFacts = {
  "linux-x64": ["linux", "x64", "bench-1"],
  "linux-arm64": ["linux", "arm64", "bench-arm"],
  "macos-arm64": ["darwin", "arm64", "m1"],
  "windows-x64": ["win32", "x64", "windows"],
};
const platformPrivateKeys = {};
const platforms = Object.fromEntries(Object.entries(platformFacts).map(
  ([id, [osName, architecture, hostAlias]]) => {
    const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 3072 });
    const privateKeyPath = path.join(keyRoot, `${id}.pem`);
    fs.writeFileSync(
      privateKeyPath,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }),
      { mode: 0o600 },
    );
    platformPrivateKeys[id] = privateKeyPath;
    const der = pair.publicKey.export({ type: "spki", format: "der" });
    return [id, {
      os: osName,
      architecture,
      host_alias: hostAlias,
      operator_signing: {
        algorithm: "rsa-pkcs1-sha256",
        public_key_spki_sha256: sha256(der),
        public_key_pem: pair.publicKey.export({ type: "spki", format: "pem" }),
      },
    }];
  },
));
const evidenceKinds = Object.keys(REQUIRED_CHECKS);

function clone(value) {
  return structuredClone(value);
}

test("portable build-report binding excludes only host-builder provenance", () => {
  const report = {
    schema: "sagejs.numerical-nlopt-build/v1",
    source: { revision: "1".repeat(40) },
    source_closure: { sha256: digest("2") },
    toolchain: {
      identity: digest("3"),
      builder: { identity: digest("4"), platform: "linux-x64" },
      target: "wasm32-wasip1",
      floating_point_contract: "off",
    },
    artifact: { sha256: digest("5"), bytes: 42 },
    methods: ["nlopt-nelder-mead"],
    selection: "explicit-only",
  };
  const expected = portableBuildReportBinding(report);
  const otherBuilder = clone(report);
  otherBuilder.toolchain.builder = {
    identity: digest("6"), platform: "darwin-arm64",
  };
  assert.deepEqual(portableBuildReportBinding(otherBuilder), expected);

  for (const mutate of [
    (value) => { value.source.revision = "7".repeat(40); },
    (value) => { value.source_closure.sha256 = digest("8"); },
    (value) => { value.toolchain.identity = digest("9"); },
    (value) => { value.artifact.sha256 = digest("a"); },
  ]) {
    const changed = clone(report);
    mutate(changed);
    assert.notDeepEqual(portableBuildReportBinding(changed), expected);
  }
  const malformed = clone(report);
  malformed.toolchain.builder.extra = true;
  assert.throws(() => portableBuildReportBinding(malformed), /missing or extra fields/);
});

function record(value) {
  const bytes = Buffer.from(formattedJson(value));
  return { value, sha256: sha256(bytes), size: bytes.length, bytes };
}

function context() {
  return {
    candidate,
    manifest: {
      schema: "sagejs.numerical-nlopt-production-manifest/v1",
      methods: { "nlopt-nelder-mead": "NLOPT_LN_NELDERMEAD" },
      selection: "explicit-only",
      qualification_tooling_files: {
        "src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/collect-evidence.cjs":
          digest("6"),
      },
      qualification: {
        status: "pending_source_current_requalification",
        reason: "Exact fixture pending state.",
        public_semantics_bundle_sha256: digest("c"),
        qualification_tooling_bundle_sha256: digest("d"),
        selection_sha256: digest("e"),
        oracle_sha256: digest("9"),
        invalidated_summary: "qualification-v1.json",
      },
    },
    artifact: { sha256: digest("a"), bytes: 72592 },
    source: {
      revision: "2".repeat(40),
      source_lock_sha256: digest("2"),
      source_closure_sha256: digest("b"),
      build_report_sha256: digest("1"),
    },
    publicSemantics: {
      encoding: "sorted-repository-path-nul-sha256-nul/v1", sha256: digest("c"),
    },
    tooling: {
      encoding: "sorted-repository-path-nul-sha256-nul/v1", sha256: digest("d"),
    },
    selection: {
      schema: "sagejs.numerical-nlopt-qualification-selection/v2",
      method: "nlopt-nelder-mead",
      upstream_identity: "NLOPT_LN_NELDERMEAD",
      case_ids: caseIds,
      evidence_kinds: evidenceKinds,
      portable_platforms: platforms,
      browser_evidence: {
        engine: "chromium",
        version: "149.0.7827.196",
        result_case_ids: caseIds,
        results_sha256: digest("5"),
      },
      historical_exclusions: {
        "nlopt-cobyla": {
          status: "excluded",
          reason: "Unresolved pointer-provenance undefined behavior.",
          qualification_rule: "Historical COBYLA evidence is never accepted.",
        },
      },
    },
    selectionBinding: { sha256: digest("e"), bytes: 100 },
    corpusBinding: { sha256: digest("f"), bytes: 200 },
    corpus: { schema: "sagejs.numerical-nlopt-corpus/v1", cases: corpusCases },
    oracleBinding: { sha256: digest("9"), bytes: 300 },
    oracleSourceSha256: digest("8"),
    oracle: { selected_results_sha256: digest("7") },
  };
}

function common(current) {
  return {
    candidate_commit: current.candidate,
    artifact: { ...current.artifact },
    public_semantics_bundle_sha256: current.publicSemantics.sha256,
    qualification_tooling_bundle_sha256: current.tooling.sha256,
    source_lock_sha256: current.source.source_lock_sha256,
    source_closure_sha256: current.source.source_closure_sha256,
    build_report_sha256: current.source.build_report_sha256,
    corpus_sha256: current.corpusBinding.sha256,
    oracle_sha256: current.oracleBinding.sha256,
    oracle_source_sha256: current.oracleSourceSha256,
    selection_sha256: current.selectionBinding.sha256,
    selected_case_ids: [...current.selection.case_ids],
  };
}

function signReceipt(current, value, platformId = "linux-x64") {
  return attachReceiptOrigin(value, {
    context: current,
    platformId,
    campaignChallenge,
    privateKeyPath: platformPrivateKeys[platformId],
  });
}

function caseReceipt(current, platformId = "linux-x64") {
  const platform = platforms[platformId];
  const results = current.selection.case_ids.map((id) => ({
    id,
    method: "nlopt-nelder-mead",
    backend_status: 4,
    backend_converged: true,
    value: [...current.corpus.cases.find((record) => record.id === id).expected],
    objective: 0,
    maximum_violation: 0,
    evaluations: 10,
    callbacks: 10,
    independently_accepted: true,
  }));
  return signReceipt(current, {
    schema: CASE_RECEIPT_SCHEMA,
    ...common(current),
    runtime: { node: "v26.7.0", os: platform.os, architecture: platform.architecture },
    method: "nlopt-nelder-mead",
    results,
    results_sha256: sha256(Buffer.from(canonicalJson(results))),
    lifecycle_after: {
      activeContexts: 0, activeHandle: 0, liveAllocations: 0, liveBytes: 0,
      memoryBytes: 2 * 1024 * 1024,
    },
    automatic_selection: false,
  }, platformId);
}

function rawSanitizer(current) {
  const run = (sanitizer) => ({
    sanitizer, status: "passed", execute: { status: 0, signal: null },
  });
  return {
    schema: "sagejs.numerical-native-sanitizer-evidence/v1",
    status: "passed",
    repository: { commit: current.candidate, clean: true },
    components: [
      { id: "cminpack" },
      {
        id: "nlopt",
        status: "passed",
        source_closure_sha256: current.source.source_closure_sha256,
        artifact: { content_sha256: current.artifact.sha256 },
        source_files: [{ path: "<repository>/src/algs/neldermead/nldrmd.c" }],
        runs: [run("address"), run("undefined"), run("leak")],
      },
    ],
  };
}

function rawDestructive(current) {
  const checkNames = [
    "allocation-failure", "corrupt-region", "harness-input-artifact-mismatch",
    "post-failure-recovery", "product-malformed-artifact-fail-closed",
    "runner-build-report-artifact-mismatch",
  ];
  return {
    schema: "sagejs.numerical-wasm-destructive-evidence/v1",
    status: "passed",
    repository: { commit: current.candidate, clean: true },
    execution: { status: 0, signal: null },
    scope: { source_and_artifact_bound: true, host_output_independently_validated: true },
    source_closures: { nlopt: current.source.source_closure_sha256 },
    artifacts: [
      { name: "cminpack-wasm" },
      { name: "nlopt-wasm", content_sha256: current.artifact.sha256, bytes: current.artifact.bytes },
    ],
    checks: Object.fromEntries(checkNames.map((name) => [name, { status: "passed" }])),
  };
}

function evidenceReceipt(current, kind) {
  const programs = EVIDENCE_PROGRAMS[kind].map((specification, index) => {
    let result;
    if (specification.result === "native-sanitizer-json") result = rawSanitizer(current);
    else if (specification.result === "wasm-destructive-json") result = rawDestructive(current);
    else if (specification.result === "browser-json") {
      result = {
        schema: "sagejs.numerical-nlopt-browser/v1",
        chromium: current.selection.browser_evidence.version,
        cases: current.selection.case_ids.length,
        result_case_ids: [...current.selection.case_ids],
        results_sha256: current.selection.browser_evidence.results_sha256,
        public_semantics_bundle_sha256: current.publicSemantics.sha256,
        pre_set_shared_atomic_force_stop: "pass",
        hard_worker_replacement: "pass",
        lifecycle_after: {
          activeContexts: 0, activeHandle: 0, liveAllocations: 0, liveBytes: 0,
          memoryBytes: 2 * 1024 * 1024,
        },
      };
    } else if (specification.result === "node-test-tap") {
      result = {
        schema: "sagejs.node-test-tap-summary/v1",
        tests: 1,
        passed: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        todo: 0,
        subtest_names: [`${kind}-${index}`],
        stdout_sha256: "",
      };
    } else if (specification.result === "sea-resource-json") {
      result = {
        schema: "sagejs.sea-qualification-resource-digests/v1",
        resources: [{
          name: "numerical/nlopt-methods.wasm",
          sha256: current.artifact.sha256,
          bytes: current.artifact.bytes,
        }],
      };
    }
    const stdout = specification.result === "node-test-tap"
      ? `TAP version 13\n# Subtest: ${result.subtest_names[0]}\nok 1 - pass\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`
      : `${JSON.stringify(result)}\n`;
    if (specification.result === "node-test-tap") result.stdout_sha256 = sha256(stdout);
    return {
      id: specification.id,
      executable: specification.executable,
      arguments: [...specification.arguments],
      status: 0,
      signal: null,
      stdout,
      stderr: "",
      stdout_sha256: sha256(stdout),
      stderr_sha256: sha256(""),
      result,
    };
  });
  const payload = { programs };
  const sourceBinding = record(payload);
  const combined = (field) => programs.map(
    (program) => `${program.id}\n${program[field]}`,
  ).join("\n");
  return signReceipt(current, {
    schema: EVIDENCE_RECEIPT_SCHEMA,
    ...common(current),
    kind,
    status: "passed",
    platform: { id: "linux-x64", os: "linux", architecture: "x64" },
    checks: [...REQUIRED_CHECKS[kind]],
    collector: {
      path: "src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/collect-evidence.cjs",
      sha256: digest("6"),
    },
    source_evidence: {
      schema: "sagejs.numerical-nlopt-program-evidence/v1",
      sha256: sourceBinding.sha256,
      bytes: sourceBinding.size,
      payload,
    },
    execution: {
      status: 0,
      signal: null,
      stdout_sha256: sha256(combined("stdout")),
      stderr_sha256: sha256(combined("stderr")),
    },
  });
}

function rebindEvidence(current, receipt) {
  const programs = receipt.source_evidence.payload.programs;
  for (const program of programs) {
    program.stdout_sha256 = sha256(program.stdout);
    program.stderr_sha256 = sha256(program.stderr);
    if (program.result?.schema === "sagejs.node-test-tap-summary/v1") {
      program.result.stdout_sha256 = program.stdout_sha256;
    }
  }
  const payloadBinding = record(receipt.source_evidence.payload);
  receipt.source_evidence.sha256 = payloadBinding.sha256;
  receipt.source_evidence.bytes = payloadBinding.size;
  const combined = (field) => programs.map(
    (program) => `${program.id}\n${program[field]}`,
  ).join("\n");
  receipt.execution.stdout_sha256 = sha256(combined("stdout"));
  receipt.execution.stderr_sha256 = sha256(combined("stderr"));
  return signReceipt(current, receipt, "linux-x64");
}

function validInputs() {
  const current = context();
  return {
    context: current,
    campaignChallenge,
    caseReceiptRecord: record(caseReceipt(current)),
    evidenceRecords: evidenceKinds.map((kind) => record(evidenceReceipt(current, kind))),
    portableRecords: Object.keys(platforms).map((platformId) =>
      record(caseReceipt(current, platformId))),
  };
}

test("selection rejects COBYLA contamination", () => {
  const selection = context().selection;
  validateSelection(selection);
  const contaminated = clone(selection);
  contaminated.case_ids.push("cobyla-old-success");
  assert.throws(() => validateSelection(contaminated), /COBYLA|exactly/);
});

test("platform enrollment derives the selected identity from the installed private key", () => {
  const current = context();
  const privateKeyPath = platformPrivateKeys["linux-x64"];
  fs.writeFileSync(`${privateKeyPath}.pub.pem`, crypto.generateKeyPairSync(
    "rsa", { modulusLength: 3072 },
  ).publicKey.export({ type: "spki", format: "pem" }));
  const result = verifyPlatformEnrollment({
    selection: current.selection,
    selectionSha256: current.selectionBinding.sha256,
    platformId: "linux-x64",
    privateKeyPath,
    requiredPrivateKeyPath: privateKeyPath,
    enforcePrivatePermissions: process.platform !== "win32",
  });
  assert.equal(result.status, "verified");
  assert.equal(
    result.operator_signing.public_key_spki_sha256,
    platforms["linux-x64"].operator_signing.public_key_spki_sha256,
  );
  assert.equal(result.operator_signing.model,
    "operator-controlled-persistent-host-software-key");
});

test("platform enrollment rejects wrong key, wrong path, and permissive mode", () => {
  const current = context();
  const privateKeyPath = platformPrivateKeys["linux-x64"];
  assert.throws(() => verifyPlatformEnrollment({
    selection: current.selection,
    selectionSha256: current.selectionBinding.sha256,
    platformId: "windows-x64",
    privateKeyPath,
    requiredPrivateKeyPath: privateKeyPath,
    enforcePrivatePermissions: false,
  }), /does not derive/);
  assert.throws(() => verifyPlatformEnrollment({
    selection: current.selection,
    selectionSha256: current.selectionBinding.sha256,
    platformId: "linux-x64",
    privateKeyPath,
    requiredPrivateKeyPath: `${privateKeyPath}.different`,
    enforcePrivatePermissions: false,
  }), /must use the enrolled path/);
  if (process.platform !== "win32") {
    fs.chmodSync(privateKeyPath, 0o644);
    try {
      assert.throws(() => verifyPlatformEnrollment({
        selection: current.selection,
        selectionSha256: current.selectionBinding.sha256,
        platformId: "linux-x64",
        privateKeyPath,
        requiredPrivateKeyPath: privateKeyPath,
        enforcePrivatePermissions: true,
      }), /exclude group\/other access/);
    } finally {
      fs.chmodSync(privateKeyPath, 0o600);
    }
  }
});

test("raw sanitizer evidence is exact-artifact, exact-source, and NM-only", () => {
  const current = context();
  const raw = rawSanitizer(current);
  validateRawSanitizer(raw, current);
  for (const mutate of [
    (value) => { value.components[1].artifact.content_sha256 = digest("0"); },
    (value) => { value.components[1].source_closure_sha256 = digest("0"); },
    (value) => { value.components[1].source_files.push({ path: "src/algs/cobyla/cobyla.c" }); },
    (value) => { value.components[0].id = "extra"; },
  ]) {
    const invalid = clone(raw);
    mutate(invalid);
    assert.throws(() => validateRawSanitizer(invalid, current), /artifact|source|NM-only|exactly/);
  }
});

test("raw destructive Wasm evidence is exact-artifact and exact-check", () => {
  const current = context();
  const raw = rawDestructive(current);
  validateRawDestructive(raw, current);
  const wrong = clone(raw);
  wrong.artifacts[1].content_sha256 = digest("0");
  assert.throws(() => validateRawDestructive(wrong, current), /wrong NLopt artifact/);
  const extra = clone(raw);
  extra.checks["historical-cobyla"] = { status: "passed" };
  assert.throws(() => validateRawDestructive(extra, current), /missing or extra checks/);
});

test("promotion is deterministic and qualifies only the exact evidence matrix", () => {
  const input = validInputs();
  const first = buildQualification(input);
  const second = buildQualification(validInputs());
  assert.deepEqual(second, first);
  assert.equal(first.summary.status, "qualified");
  assert.equal(first.manifest.qualification.status, "qualified");
  assert.deepEqual(Object.keys(first.summary.evidence), evidenceKinds);
  assert.deepEqual(Object.keys(first.summary.portable_receipts), Object.keys(platforms));
  assert.equal(first.manifest.qualification.historical_cobyla_status, "excluded-not-qualified");
});

test("promotion independently rejects a producer's false acceptance claim", () => {
  const input = validInputs();
  input.caseReceiptRecord.value.results[0].value = [0, 0];
  input.caseReceiptRecord.value.results_sha256 = sha256(Buffer.from(canonicalJson(
    input.caseReceiptRecord.value.results,
  )));
  input.caseReceiptRecord = record(signReceipt(
    input.context, input.caseReceiptRecord.value, "linux-x64",
  ));
  assert.throws(() => buildQualification(input), /independent point envelope/);
});

test("embedded evidence is preserved and revalidated during durable verification", () => {
  const input = validInputs();
  const promoted = buildQualification(input);
  assert.deepEqual(
    promoted.summary.evidence.sanitizer.receipt.source_evidence.payload.raw,
    input.evidenceRecords[0].value.source_evidence.payload.raw,
  );
  promoted.summary.evidence.sanitizer.receipt.source_evidence.payload.programs[0].result.status =
    "failed";
  assert.throws(() => validateQualificationSummary(
    record(promoted.summary), input.context, promoted.manifest,
  ), /durable evidence binding|stale or failed/);
});

test("unsupported Node versions cannot qualify a portable platform", () => {
  const input = validInputs();
  input.portableRecords[0].value.runtime.node = "v22.22.1";
  input.portableRecords[0] = record(signReceipt(
    input.context, input.portableRecords[0].value, "linux-x64",
  ));
  assert.throws(() => buildQualification(input), /unsupported Node/);
});

test("public package validation requires the exact artifact bytes", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-packaged-"));
  try {
    const filename = path.join(temporary, "nlopt-methods.wasm");
    const artifact = Buffer.from("exact-artifact");
    fs.writeFileSync(filename, artifact);
    const current = { artifact: { sha256: sha256(artifact), bytes: artifact.length } };
    validatePackagedArtifact(current, filename);
    fs.writeFileSync(filename, Buffer.from("wrong-artifact"));
    assert.throws(() => validatePackagedArtifact(current, filename), /exact qualified/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("missing, duplicate, and extra supplemental evidence fail closed", () => {
  let input = validInputs();
  input.evidenceRecords.pop();
  assert.throws(() => buildQualification(input), /evidence kinds/);

  input = validInputs();
  input.evidenceRecords.push(input.evidenceRecords[0]);
  assert.throws(() => buildQualification(input), /duplicate evidence kind/);

  input = validInputs();
  const extra = clone(input.evidenceRecords[0].value);
  extra.kind = "nlopt-cobyla";
  input.evidenceRecords.push(record(extra));
  assert.throws(() => buildQualification(input), /extra evidence kind/);
});

test("wrong artifact, candidate, and stale source/oracle/corpus bindings fail closed", () => {
  for (const mutate of [
    (receipt) => { receipt.artifact.sha256 = digest("0"); },
    (receipt) => { receipt.candidate_commit = "3".repeat(40); },
    (receipt) => { receipt.source_closure_sha256 = digest("0"); },
    (receipt) => { receipt.oracle_sha256 = digest("0"); },
    (receipt) => { receipt.corpus_sha256 = digest("0"); },
  ]) {
    const input = validInputs();
    const value = clone(input.evidenceRecords[0].value);
    mutate(value);
    input.evidenceRecords[0] = record(value);
    assert.throws(() => buildQualification(input), /wrong|stale/);
  }
});

test("missing, duplicate, and extra portable platforms fail closed", () => {
  let input = validInputs();
  input.portableRecords.pop();
  assert.throws(() => buildQualification(input), /portable platforms/);

  input = validInputs();
  input.portableRecords.push(input.portableRecords[0]);
  assert.throws(() => buildQualification(input), /duplicate portable platform/);

  input = validInputs();
  const unknown = caseReceipt(input.context, "windows-x64");
  unknown.runtime = { node: "v26.7.0", os: "freebsd", architecture: "x64" };
  input.portableRecords.push(record(unknown));
  assert.throws(() => buildQualification(input), /extra portable platform/);
});

test("missing, duplicate, reordered, and extra selected cases fail closed", () => {
  for (const mutate of [
    (receipt) => { receipt.results.pop(); receipt.selected_case_ids.pop(); },
    (receipt) => { receipt.results.push(clone(receipt.results[0])); },
    (receipt) => { receipt.results.reverse(); },
    (receipt) => {
      receipt.results.push({ ...clone(receipt.results[0]), id: "nlopt-cobyla-old" });
      receipt.selected_case_ids.push("nlopt-cobyla-old");
    },
  ]) {
    const input = validInputs();
    const value = clone(input.caseReceiptRecord.value);
    mutate(value);
    value.results_sha256 = sha256(Buffer.from(canonicalJson(value.results)));
    input.caseReceiptRecord = record(signReceipt(input.context, value, "linux-x64"));
    assert.throws(() => buildQualification(input), /case|duplicate|exactly/i);
  }
});

test("one signed Linux receipt cannot be cloned into four platform identities", () => {
  const input = validInputs();
  const linux = input.portableRecords[0].value;
  input.portableRecords = Object.entries(platforms).map(([platformId, platform]) => {
    const forged = clone(linux);
    forged.runtime.os = platform.os;
    forged.runtime.architecture = platform.architecture;
    forged.origin.platform_id = platformId;
    forged.origin.host_alias = platform.host_alias;
    forged.origin.public_key_spki_sha256 = platform.operator_signing.public_key_spki_sha256;
    return record(forged);
  });
  assert.throws(() => buildQualification(input), /signed payload is stale|signature is invalid/);
});

test("missing, wrong-host, wrong-challenge, and stale signatures fail closed", () => {
  for (const mutate of [
    (receipt) => { delete receipt.origin; },
    (receipt) => { receipt.origin.host_alias = "bench-arm"; },
    (receipt) => { receipt.origin.campaign_challenge = digest("3"); },
    (receipt) => { receipt.results[0].evaluations += 1; },
  ]) {
    const input = validInputs();
    const forged = clone(input.portableRecords[0].value);
    mutate(forged);
    input.portableRecords[0] = record(forged);
    assert.throws(() => buildQualification(input), /origin|signed payload|signature/i);
  }
});

test("empty or unstructured public transcripts cannot qualify", () => {
  for (const kind of ["public-integration", "resource-corruption", "relocation", "sea"]) {
    const input = validInputs();
    const index = evidenceKinds.indexOf(kind);
    const receipt = clone(input.evidenceRecords[index].value);
    receipt.source_evidence.payload.programs[0].stdout = "";
    input.evidenceRecords[index] = record(rebindEvidence(input.context, receipt));
    assert.throws(() => buildQualification(input), /empty, failed, or stale command transcript/);
  }
});

test("fabricated sanitizer and destructive payloads require the persistent-host signature", () => {
  for (const kind of ["sanitizer", "destructive-wasm"]) {
    const input = validInputs();
    const index = evidenceKinds.indexOf(kind);
    const receipt = clone(input.evidenceRecords[index].value);
    receipt.source_evidence.payload.programs[0].result.status = "failed";
    const payloadBinding = record(receipt.source_evidence.payload);
    receipt.source_evidence.sha256 = payloadBinding.sha256;
    receipt.source_evidence.bytes = payloadBinding.size;
    input.evidenceRecords[index] = record(receipt);
    assert.throws(() => buildQualification(input), /signed payload is stale|signature is invalid/);
  }
});

test("evaluation and complete lifecycle budgets are independently enforced", () => {
  for (const mutate of [
    (receipt) => { receipt.results[0].evaluations = 4001; receipt.results[0].callbacks = 4001; },
    (receipt) => { receipt.lifecycle_after.activeContexts = 1; },
    (receipt) => { receipt.lifecycle_after.activeHandle = 1; },
  ]) {
    const input = validInputs();
    const receipt = clone(input.caseReceiptRecord.value);
    mutate(receipt);
    receipt.results_sha256 = sha256(Buffer.from(canonicalJson(receipt.results)));
    input.caseReceiptRecord = record(signReceipt(input.context, receipt, "linux-x64"));
    assert.throws(() => buildQualification(input), /termination contract|leaked Wasm state/);
  }
});

test("browser identity, exact result IDs, digest, and lifecycle are bound", () => {
  for (const mutate of [
    (result) => { result.chromium = "150.0.0.0"; },
    (result) => { result.result_case_ids.reverse(); },
    (result) => { result.results_sha256 = digest("0"); },
    (result) => { result.lifecycle_after.activeHandle = 1; },
  ]) {
    const input = validInputs();
    const index = evidenceKinds.indexOf("browser-lifecycle");
    const receipt = clone(input.evidenceRecords[index].value);
    mutate(receipt.source_evidence.payload.programs[0].result);
    input.evidenceRecords[index] = record(rebindEvidence(input.context, receipt));
    assert.throws(() => buildQualification(input), /browser|quiescent/);
  }
});

test("strict JSON and exact summary file bytes are release boundaries", () => {
  const input = validInputs();
  const promoted = buildQualification(input);
  validateQualificationSummary(record(promoted.summary), input.context, promoted.manifest);
  const compact = Buffer.from(JSON.stringify(promoted.summary));
  assert.throws(() => validateQualificationSummary({
    value: promoted.summary,
    bytes: compact,
    sha256: sha256(compact),
    size: compact.length,
  }, input.context, promoted.manifest), /deterministic formatted JSON/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-strict-json-"));
  try {
    const filename = path.join(temporary, "duplicate.json");
    fs.writeFileSync(filename, '{"status":"qualified","status":"pending"}\n');
    assert.throws(() => readJson(filename, "duplicate fixture"), /duplicate object key/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("only the exact pending and qualified manifest states are recognized", () => {
  assert.equal(validateManifestQualificationState(context().manifest), "pending");
  assert.equal(validateManifestQualificationState(buildQualification(validInputs()).manifest),
    "qualified");
  for (const status of ["pending", "invalidated", "corrupted", "promotion_in_progress", "other"]) {
    const input = validInputs();
    input.context.manifest.qualification = { status };
    assert.throws(() => buildQualification(input), /forbidden state/);
  }
});

test("atomic promotion validates before touching outputs and leaves no temporary files", () => {
  const temporary = fs.mkdtempSync(path.join(
    canonicalTemporaryRoot, "sagejs-nlopt-promote-test-",
  ));
  try {
    const summaryPath = path.join(temporary, "qualification-v1.json");
    const manifestPath = path.join(temporary, "production-manifest.json");
    fs.writeFileSync(summaryPath, "old-summary\n");
    fs.writeFileSync(manifestPath, "old-manifest\n");
    const qualification = buildQualification(validInputs());
    const invalid = clone(qualification.manifest);
    invalid.qualification.summary_sha256 = digest("0");
    assert.throws(() => writePromotion({
      summaryPath, manifestPath, summary: qualification.summary, manifest: invalid,
    }), /summary binding mismatch/);
    assert.equal(fs.readFileSync(summaryPath, "utf8"), "old-summary\n");
    assert.equal(fs.readFileSync(manifestPath, "utf8"), "old-manifest\n");

    writePromotion({ summaryPath, manifestPath, ...qualification });
    assert.equal(JSON.parse(fs.readFileSync(summaryPath)).status, "qualified");
    assert.equal(JSON.parse(fs.readFileSync(manifestPath)).qualification.status, "qualified");
    assert.deepEqual(fs.readdirSync(temporary).sort(), [
      "production-manifest.json", "qualification-v1.json",
    ]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("symbolic-link output rejection happens before either release file changes", () => {
  const temporary = fs.mkdtempSync(path.join(
    canonicalTemporaryRoot, "sagejs-nlopt-symlink-test-",
  ));
  try {
    const target = path.join(temporary, "target");
    const summaryPath = path.join(temporary, "qualification-v1.json");
    const manifestPath = path.join(temporary, "production-manifest.json");
    fs.writeFileSync(target, "target\n");
    fs.symlinkSync(target, summaryPath);
    fs.writeFileSync(manifestPath, "old-manifest\n");
    const qualification = buildQualification(validInputs());
    assert.throws(() => writePromotion({ summaryPath, manifestPath, ...qualification }),
      /non-regular output/);
    assert.equal(fs.readFileSync(target, "utf8"), "target\n");
    assert.equal(fs.readFileSync(manifestPath, "utf8"), "old-manifest\n");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
