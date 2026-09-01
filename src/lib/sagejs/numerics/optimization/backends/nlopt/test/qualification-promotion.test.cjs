// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CASE_RECEIPT_SCHEMA,
  EVIDENCE_RECEIPT_SCHEMA,
  REQUIRED_CHECKS,
  buildQualification,
  canonicalJson,
  formattedJson,
  sha256,
  validateQualificationSummary,
  validateSelection,
  writePromotion,
} = require("../qualification/contracts.cjs");
const {
  validatePackagedArtifact,
  validateRawDestructive,
  validateRawSanitizer,
} = require("../qualification/collect-evidence.cjs");

const digest = (character) => character.repeat(64);
const candidate = "1".repeat(40);
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
const platforms = {
  "linux-x64": { os: "linux", architecture: "x64" },
  "linux-arm64": { os: "linux", architecture: "arm64" },
  "macos-arm64": { os: "darwin", architecture: "arm64" },
  "windows-x64": { os: "win32", architecture: "x64" },
};
const evidenceKinds = Object.keys(REQUIRED_CHECKS);

function clone(value) {
  return structuredClone(value);
}

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
      qualification: { status: "pending_source_current_requalification" },
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
      schema: "sagejs.numerical-nlopt-qualification-selection/v1",
      method: "nlopt-nelder-mead",
      upstream_identity: "NLOPT_LN_NELDERMEAD",
      case_ids: caseIds,
      evidence_kinds: evidenceKinds,
      portable_platforms: platforms,
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

function caseReceipt(current, platform = platforms["linux-x64"]) {
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
  return {
    schema: CASE_RECEIPT_SCHEMA,
    ...common(current),
    runtime: { node: "v26.7.0", ...platform },
    method: "nlopt-nelder-mead",
    results,
    results_sha256: sha256(Buffer.from(canonicalJson(results))),
    lifecycle_after: { liveAllocations: 0, liveBytes: 0 },
    automatic_selection: false,
  };
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
  const stdout = kind === "browser-lifecycle" ? JSON.stringify({
    schema: "sagejs.numerical-nlopt-browser/v1",
    cases: current.selection.case_ids.length,
    public_semantics_bundle_sha256: current.publicSemantics.sha256,
    pre_set_shared_atomic_force_stop: "pass",
    hard_worker_replacement: "pass",
    lifecycle_after: { liveAllocations: 0, liveBytes: 0 },
  }) : "";
  const payload = kind === "sanitizer"
    ? { raw: rawSanitizer(current), stdout, stderr: "" }
    : kind === "destructive-wasm"
      ? { raw: rawDestructive(current), stdout, stderr: "" }
      : { stdout, stderr: "" };
  const sourceBinding = record(payload);
  return {
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
      schema: kind === "sanitizer" ? payload.raw.schema
        : kind === "destructive-wasm" ? payload.raw.schema
          : kind === "browser-lifecycle" ? "sagejs.numerical-nlopt-browser/v1"
            : "sagejs.numerical-nlopt-command-transcript/v1",
      sha256: sourceBinding.sha256,
      bytes: sourceBinding.size,
      payload,
    },
    execution: {
      status: 0,
      signal: null,
      stdout_sha256: sha256(stdout),
      stderr_sha256: sha256(""),
    },
  };
}

function validInputs() {
  const current = context();
  return {
    context: current,
    caseReceiptRecord: record(caseReceipt(current)),
    evidenceRecords: evidenceKinds.map((kind) => record(evidenceReceipt(current, kind))),
    portableRecords: Object.values(platforms).map((platform) =>
      record(caseReceipt(current, platform))),
  };
}

test("selection rejects COBYLA contamination", () => {
  const selection = context().selection;
  validateSelection(selection);
  const contaminated = clone(selection);
  contaminated.case_ids.push("cobyla-old-success");
  assert.throws(() => validateSelection(contaminated), /COBYLA|exactly/);
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
  input.caseReceiptRecord = record(input.caseReceiptRecord.value);
  assert.throws(() => buildQualification(input), /independent point envelope/);
});

test("embedded evidence is preserved and revalidated during durable verification", () => {
  const input = validInputs();
  const promoted = buildQualification(input);
  assert.deepEqual(
    promoted.summary.evidence.sanitizer.receipt.source_evidence.payload.raw,
    input.evidenceRecords[0].value.source_evidence.payload.raw,
  );
  promoted.summary.evidence.sanitizer.receipt.source_evidence.payload.raw.status = "failed";
  assert.throws(() => validateQualificationSummary(
    promoted.summary, input.context, promoted.manifest,
  ), /durable evidence binding|stale or failed/);
});

test("unsupported Node versions cannot qualify a portable platform", () => {
  const input = validInputs();
  input.portableRecords[0].value.runtime.node = "v22.22.1";
  input.portableRecords[0] = record(input.portableRecords[0].value);
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
  input.portableRecords.push(record(caseReceipt(input.context, {
    os: "freebsd", architecture: "x64",
  })));
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
    input.caseReceiptRecord = record(value);
    assert.throws(() => buildQualification(input), /case|duplicate|exactly/i);
  }
});

test("atomic promotion validates before touching outputs and leaves no temporary files", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-promote-test-"));
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
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-symlink-test-"));
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
