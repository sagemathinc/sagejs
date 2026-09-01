// sagejs-test-tier: unit
// sagejs-test-portable
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  canonicalJson,
  contentId,
  parseJsonText,
  platformIdentity,
} = require("../../../scripts/numerical-computing/common.cjs");
const {
  CAPABILITY_SCHEMA,
  CORPUS_SCHEMA,
  POLICY_SCHEMA,
  PROGRAM_PHASES,
  RECEIPT_SCHEMA,
  REPORT_SCHEMA,
  validateCorpus,
} = require("../../../scripts/numerical-computing/contracts.cjs");
const {
  bindCapabilityDraft,
  collectReceipt,
  receiptCore,
  verifyReceipt,
  writeImmutableJson,
} = require("../../../scripts/numerical-computing/receipt.cjs");
const {
  buildReport,
  markdownReport,
} = require("../../../scripts/numerical-computing/report.cjs");
const {
  discoverCorpora,
  usage,
} = require("../../../scripts/numerical-computing/qualify.cjs");

const ARTIFACT_SPECIFICATIONS = ["core=artifact.bin"];

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function corpusFixture() {
  return {
    schema: CORPUS_SCHEMA,
    id: "fixture-domain-v1",
    version: 1,
    domain: "fixture-domain",
    description: "One exact case for qualification harness adversarial tests.",
    program_phases: ["P1"],
    source_paths: ["source.txt"],
    cases: [{
      id: "answer",
      description: "Return a deterministic exact value and independent oracle.",
      program_phase: "P1",
      layer: "differential-oracle",
      workload_tier: "instant-classroom",
      campaign: { kind: "fixed", seed: null, trials: 1, evidence_check_ids: [] },
      input: { value: 42 },
      required_capabilities: ["fixture.answer"],
      expected: { outcome: "success", failure_code: null },
      checks: [{
        id: "answer-exact",
        evidence: "correctness",
        kind: "deep-equal",
        actual: "/values/result",
        expected: { literal: 42 },
      }, {
        id: "oracle-exact",
        evidence: "validation",
        kind: "deep-equal",
        actual: "/values/result",
        expected: { pointer: "/values/oracle" },
      }],
      measurement: { warmup: 1, samples: 2 },
    }],
  };
}

function adapterSource(subject, externalExecution = "async", mutateInput = false) {
  return `"use strict";
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
let subjectProcess = null;
let repositoryRoot = null;
const external = ${JSON.stringify(subject.kind !== "node")};
const externalExecution = ${JSON.stringify(externalExecution)};
const mutateInput = ${JSON.stringify(mutateInput)};
const childSource =
  "const held = Buffer.alloc(64 * 1024 * 1024, 1); " +
  "setTimeout(() => process.exit(0), 1500)";

async function exerciseExternalSubject() {
  if (!external) return;
  if (externalExecution === "sync") {
    const result = spawnSync(process.execPath, ["-e", childSource], {
      stdio: "ignore", windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("synchronous subject fixture failed");
    return;
  }
  await new Promise((resolve, reject) => {
    subjectProcess = spawn(process.execPath, ["-e", childSource], {
      stdio: "ignore", windowsHide: true,
    });
    subjectProcess.once("error", reject);
    subjectProcess.once("close", (status) => {
      subjectProcess = null;
      if (status === 0) resolve();
      else reject(new Error("asynchronous subject fixture failed"));
    });
  });
}

module.exports = {
  protocol: "sagejs.numerical-qualification-adapter/v1",
  async initialize(context) {
    repositoryRoot = context.root;
    return {
      subject: ${JSON.stringify(subject)},
      capability_ids: ["fixture.answer"],
    };
  },
  async runCase(sample) {
    if (mutateInput) {
      fs.appendFileSync(path.join(repositoryRoot, "source.txt"), "adapter mutation\\n");
    }
    await exerciseExternalSubject();
    return {
      outcome: { kind: "success", code: null },
      values: { result: sample.input.value, oracle: 42 },
      metrics: { phases_ms: { kernel: 0.25 }, counters: { evaluations: 1 } },
    };
  },
  async close() {
    if (subjectProcess !== null) subjectProcess.kill();
  },
};
`;
}

function capabilityDraft(status = "available", subject = {
  kind: "node", name: "node", version: process.version, engine: null,
}) {
  return {
    schema: CAPABILITY_SCHEMA,
    backend: { id: "fixture-backend", version: "1" },
    subject,
    capabilities: [{
      id: "fixture.answer",
      status,
      reason: status === "available" ? null : "fixture capability intentionally unavailable",
      case_ids: status === "available" ? ["answer"] : [],
      envelope: status === "available" ? { exact_fixture: true } : null,
    }],
  };
}

function initializeGit(root) {
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, "config", "user.email", "qualification@example.invalid");
  git(root, "config", "user.name", "Qualification Fixture");
}

function commitAll(root, message) {
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
}

function makeWorkspace({
  capabilityStatus = "available",
  subject = { kind: "node", name: "node", version: process.version, engine: null },
  externalExecution = "async",
  mutateInput = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-numerical-evidence-"));
  initializeGit(root);
  fs.writeFileSync(path.join(root, "source.txt"), "exact fixture source\n");
  fs.writeFileSync(path.join(root, "artifact.bin"), Buffer.from([0, 1, 2, 3, 255]));
  fs.writeFileSync(
    path.join(root, "adapter.cjs"),
    adapterSource(subject, externalExecution, mutateInput),
  );
  writeJson(path.join(root, "fixture.corpus.json"), corpusFixture());
  writeJson(
    path.join(root, "capability-draft.json"),
    capabilityDraft(capabilityStatus, subject),
  );
  commitAll(root, "fixture inputs");
  const manifest = bindCapabilityDraft({
    root,
    corpusPath: "fixture.corpus.json",
    adapterPath: "adapter.cjs",
    artifactSpecifications: ARTIFACT_SPECIFICATIONS,
    draftPath: "capability-draft.json",
  });
  writeJson(path.join(root, "capabilities.json"), manifest);
  commitAll(root, "bound capability manifest");
  return { root, manifest };
}

function makeHarnessWorkspace() {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
  const evidenceDirectory = "bench/numerical-computing/evidence";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-harness-self-test-"));
  initializeGit(root);
  fs.mkdirSync(path.join(root, evidenceDirectory), { recursive: true });
  for (const name of [
    "self-test-adapter.cjs", "self-test-artifact.txt", "self-test-source.txt",
    "self-test.corpus.json",
  ]) {
    fs.copyFileSync(
      path.join(repositoryRoot, evidenceDirectory, name),
      path.join(root, evidenceDirectory, name),
    );
  }
  const corpus = validateCorpus(parseJsonText(fs.readFileSync(
    path.join(root, evidenceDirectory, "self-test.corpus.json"), "utf8",
  )));
  const draftPath = `${evidenceDirectory}/capability-draft.json`;
  writeJson(path.join(root, draftPath), {
    schema: CAPABILITY_SCHEMA,
    backend: { id: "qualification-self-test", version: "1" },
    subject: { kind: "node", name: "node", version: process.version, engine: null },
    capabilities: [{
      id: "self-test.scalar",
      status: "available",
      reason: null,
      case_ids: corpus.cases.map((item) => item.id),
      envelope: { purpose: "harness-self-test-only" },
    }],
  });
  commitAll(root, "harness inputs");
  const artifactSpecifications = [`self-test=${evidenceDirectory}/self-test-artifact.txt`];
  const manifest = bindCapabilityDraft({
    root,
    corpusPath: `${evidenceDirectory}/self-test.corpus.json`,
    adapterPath: `${evidenceDirectory}/self-test-adapter.cjs`,
    artifactSpecifications,
    draftPath,
  });
  const capabilityPath = `${evidenceDirectory}/capabilities.json`;
  writeJson(path.join(root, capabilityPath), manifest);
  commitAll(root, "bound harness manifest");
  return { root, evidenceDirectory, artifactSpecifications, capabilityPath };
}

async function collectFixture(workspace) {
  return collectReceipt({
    root: workspace.root,
    corpusPath: "fixture.corpus.json",
    adapterPath: "adapter.cjs",
    capabilityPath: "capabilities.json",
    artifactSpecifications: ARTIFACT_SPECIFICATIONS,
  });
}

function policyFor(receipt, rows = [{ id: "measured", platform: receipt.platform.id }]) {
  return {
    schema: POLICY_SCHEMA,
    id: "fixture-matrix",
    description: "Explicit fixture evidence matrix.",
    require_clean: true,
    rows: rows.map((row) => ({
      id: row.id,
      match: {
        corpus_id: receipt.corpus.snapshot.id,
        corpus_sha256: receipt.corpus.sha256,
        source_bundle_sha256: receipt.source_bundle.sha256,
        capability_manifest_id: receipt.capability_manifest.snapshot.id,
        backend_id: receipt.capability_manifest.snapshot.backend.id,
        backend_version: receipt.capability_manifest.snapshot.backend.version,
        platform: row.platform,
        subject_kind: receipt.runtime.subject.kind,
        subject_name: receipt.runtime.subject.name,
        subject_version: receipt.runtime.subject.version,
        subject_engine: receipt.runtime.subject.engine,
      },
      required_program_phases: ["P1"],
      required_case_layers: ["differential-oracle"],
      required_capabilities: ["fixture.answer"],
      required_memory_scope: row.required_memory_scope ??
        (receipt.runtime.subject.kind === "node" ? "collector_process" : "process_tree"),
      required_artifacts: [{
        name: "core",
        sha256: receipt.artifacts.find((item) => item.name === "core").sha256,
      }],
    })),
  };
}

test("backend-neutral corpora validate and discovery is content bound", () => {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
  const relative = "bench/numerical-computing/evidence/self-test.corpus.json";
  const corpus = validateCorpus(parseJsonText(
    fs.readFileSync(path.join(repositoryRoot, relative), "utf8"), relative,
  ));
  assert.equal(corpus.cases.length, 5);
  assert.deepEqual(corpus.program_phases, ["P0", "P8"]);
  assert.deepEqual([...new Set(corpus.cases.map((item) => item.layer))].sort(), [
    "definition-identity", "failure-semantics", "fuzz", "independent-residual", "metamorphic",
  ]);
  const first = discoverCorpora(repositoryRoot, ["bench/numerical-computing/evidence"]);
  const second = discoverCorpora(repositoryRoot, ["bench/numerical-computing/evidence"]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.entries.map((item) => item.id), ["qualification-harness-self-test"]);
  assert.match(usage(), /there is intentionally no platform override/i);
});

test("published wire schemas are strict duplicate-free JSON with matching identities", () => {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
  const directory = path.join(repositoryRoot, "docs/numerical-computing/qualification");
  const schemas = new Map([
    ["capability-manifest.schema.json", CAPABILITY_SCHEMA],
    ["corpus.schema.json", CORPUS_SCHEMA],
    ["matrix-policy.schema.json", POLICY_SCHEMA],
    ["matrix-report.schema.json", REPORT_SCHEMA],
    ["run-receipt.schema.json", RECEIPT_SCHEMA],
  ]);
  for (const [name, identity] of schemas) {
    const schema = parseJsonText(fs.readFileSync(path.join(directory, name), "utf8"), name);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.properties.schema.const, identity);
    assert.equal(schema.additionalProperties, false);
  }
});

test("portable harness self-test executes failure, deterministic fuzz, and metamorphic cases", async (t) => {
  const workspace = makeHarnessWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectReceipt({
    root: workspace.root,
    corpusPath: `${workspace.evidenceDirectory}/self-test.corpus.json`,
    adapterPath: `${workspace.evidenceDirectory}/self-test-adapter.cjs`,
    capabilityPath: workspace.capabilityPath,
    artifactSpecifications: workspace.artifactSpecifications,
  });
  assert.equal(receipt.status, "passed");
  assert.deepEqual([...new Set(receipt.cases.map((item) => item.program_phase))].sort(), ["P0", "P8"]);
  const fuzz = receipt.cases.find((item) => item.layer === "fuzz");
  const metamorphic = receipt.cases.find((item) => item.layer === "metamorphic");
  const failure = receipt.cases.find((item) => item.layer === "failure-semantics");
  assert.equal(fuzz.campaign.seed, "lcg-0x12345678");
  assert.equal(fuzz.samples[0].observation.metrics.counters.trials, 64);
  assert.equal(metamorphic.samples[0].observation.metrics.counters.trials, 4);
  assert.equal(failure.samples[0].evidence.failure.status, "passed");
  assert(receipt.metrics.startup.process_entry_to_ready_ms >= 0);
  assert(
    receipt.metrics.startup.process_entry_to_ready_ms < receipt.metrics.total_wall_ms,
    "startup must stop at adapter readiness rather than include the case campaign",
  );
  assert(receipt.metrics.payload.artifact_installed_bytes > 0);
  assert.deepEqual(
    receipt.cases[0].samples[0].metrics.peak_memory,
    {
      bytes: receipt.cases[0].samples[0].metrics.peak_memory.bytes,
      measurement_method: "node-process-rss-boundary-v1",
      measurement_scope: "collector_process",
      authenticated_by: "qualification-collector",
      sample_interval_ms: 5,
    },
  );
  assert.equal(receipt.cases[0].metrics.peak_memory.measurement_scope, "collector_process");
  assert.equal(verifyReceipt(receipt, {
    root: workspace.root,
    requireClean: true,
  }).valid, true);
});

test("collection binds exact source, artifact, capabilities, runtime and per-case evidence", async (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.platform.id, platformIdentity().id);
  assert.equal(receipt.repository.clean, true);
  assert.equal(receipt.cases[0].samples.length, 2);
  assert.equal(receipt.cases[0].samples[0].evidence.correctness.status, "passed");
  assert.equal(receipt.cases[0].samples[0].evidence.validation.status, "passed");
  assert.equal(receipt.cases[0].samples[0].evidence.failure.status, "passed");
  assert.equal(receipt.cases[0].program_phase, "P1");
  assert.deepEqual(receipt.cases[0].campaign, {
    kind: "fixed", seed: null, trials: 1, evidence_check_ids: [],
  });
  assert(receipt.metrics.startup.process_entry_to_ready_ms >= 0);
  assert(receipt.metrics.payload.artifact_installed_bytes > 0);
  assert(receipt.cases[0].metrics.wall_ms.samples.length === 2);
  assert.equal(verifyReceipt(receipt, {
    root: workspace.root,
    requireClean: true,
  }).mode, "current-binding");
  assert.equal(verifyReceipt(receipt, {
    historical: true,
    requireClean: true,
  }).mode, "historical-content-integrity");
});

test("tampering, recomputed forgeries, duplicate keys, and missing cases fail closed", async (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);

  const tampered = structuredClone(receipt);
  tampered.cases[0].samples[0].observation.values.result = 7;
  assert.throws(() => verifyReceipt(tampered, { historical: true }), /receipt\.id: is stale/);

  tampered.id = contentId(receiptCore(tampered));
  assert.throws(
    () => verifyReceipt(tampered, { historical: true }),
    /correctness\/failure\/validation evidence is stale/,
  );

  const missingCase = structuredClone(receipt);
  missingCase.cases = [];
  missingCase.status = "passed";
  missingCase.id = contentId(receiptCore(missingCase));
  assert.throws(() => verifyReceipt(missingCase, { historical: true }), /every corpus case/);

  const forgedPlatform = structuredClone(receipt);
  forgedPlatform.platform.id = receipt.platform.id === "windows-x64" ? "linux-x64" : "windows-x64";
  forgedPlatform.id = contentId(receiptCore(forgedPlatform));
  assert.throws(
    () => verifyReceipt(forgedPlatform, { root: workspace.root }),
    /does not match os_platform and architecture|does not describe this measured host/,
  );

  assert.throws(
    () => parseJsonText('{"schema":"one","schema":"two"}', "adversarial.json"),
    /duplicate object key/,
  );
});

test("stale source, artifact, adapter, and capability bindings prevent collection", async (t) => {
  for (const [name, mutate, pattern] of [[
    "source",
    (root) => fs.appendFileSync(path.join(root, "source.txt"), "tamper\n"),
    /capability manifest\.bindings/,
  ], [
    "artifact",
    (root) => fs.appendFileSync(path.join(root, "artifact.bin"), Buffer.from([9])),
    /capability manifest\.bindings/,
  ], [
    "adapter",
    (root) => fs.appendFileSync(path.join(root, "adapter.cjs"), "\n// tamper\n"),
    /capability manifest\.bindings/,
  ]]) {
    await t.test(name, async (t) => {
      const workspace = makeWorkspace();
      t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
      mutate(workspace.root);
      await assert.rejects(() => collectFixture(workspace), pattern);
    });
  }
});

test("collection rejects an adapter that changes a bound input while executing", async (t) => {
  const workspace = makeWorkspace({ mutateInput: true });
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  await assert.rejects(
    () => collectFixture(workspace),
    /capability manifest\.bindings|changed during collection/,
  );
});

test("collection requires a clean checkout before adapter code runs", async (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspace.root, "untracked.txt"), "not a release candidate\n");
  await assert.rejects(
    () => collectFixture(workspace),
    /requires a clean candidate checkout/,
  );
});

test("unavailable or unobserved capabilities produce failed receipts without samples", async (t) => {
  const workspace = makeWorkspace({ capabilityStatus: "unavailable" });
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.cases[0].status, "failed");
  assert.equal(receipt.cases[0].failure_reason, "missing-capability-evidence");
  assert.deepEqual(receipt.cases[0].samples, []);
  assert.equal(verifyReceipt(receipt, { historical: true }).valid, true);
});

test("matrix reports preserve missing evidence as missing and never infer metrics", async (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);
  const passing = buildReport(policyFor(receipt), [{ path: "measured.receipt.json", value: receipt }]);
  assert.equal(passing.status, "passed");
  assert.equal(passing.rows[0].receipt.id, receipt.id);
  assert.equal(passing.rows[0].bindings.source_bundle_sha256, receipt.source_bundle.sha256);
  assert.deepEqual(passing.rows[0].coverage, {
    program_phases: ["P1"],
    case_layers: ["differential-oracle"],
  });
  assert.equal(passing.rows[0].required_memory_scope, "collector_process");
  assert.equal(
    passing.rows[0].metrics.peak_memory.authenticated_by,
    "qualification-collector",
  );

  const wrongScopePolicy = policyFor(receipt);
  wrongScopePolicy.rows[0].required_memory_scope = "process_tree";
  const wrongScope = buildReport(
    wrongScopePolicy,
    [{ path: "measured.receipt.json", value: receipt }],
  );
  assert.equal(wrongScope.status, "failed");
  assert.match(wrongScope.rows[0].reasons.join("\n"), /required process_tree memory evidence/);

  const missingPlatform = receipt.platform.id === "windows-x64" ? "linux-x64" : "windows-x64";
  const incomplete = buildReport(policyFor(receipt, [
    { id: "measured", platform: receipt.platform.id },
    { id: "not-measured", platform: missingPlatform },
  ]), [{ path: "measured.receipt.json", value: receipt }]);
  assert.equal(incomplete.status, "failed");
  assert.equal(incomplete.rows[1].status, "missing");
  assert.equal(incomplete.rows[1].receipt, null);
  assert.equal(incomplete.rows[1].bindings, null);
  assert.equal(incomplete.rows[1].coverage, null);
  assert.equal(incomplete.rows[1].metrics, null);
  assert.match(markdownReport(incomplete), /no values are inferred/i);

  const duplicate = buildReport(policyFor(receipt), [
    { path: "one.receipt.json", value: receipt },
    { path: "two.receipt.json", value: receipt },
  ]);
  assert.equal(duplicate.status, "failed");
  assert.match(duplicate.rows[0].reasons[0], /must be unambiguous/);
});

test("memory evidence is authenticated by the collector, never by adapters", async (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);
  const forged = structuredClone(receipt);
  forged.cases[0].samples[0].metrics.peak_memory.authenticated_by = "adapter";
  forged.id = contentId(receiptCore(forged));
  assert.throws(
    () => verifyReceipt(forged, { historical: true }),
    /authenticated_by.*qualification-collector/,
  );

  const impossible = structuredClone(receipt);
  impossible.cases[0].samples[0].metrics.peak_memory.measurement_scope =
    "browser_heap";
  impossible.id = contentId(receiptCore(impossible));
  assert.throws(
    () => verifyReceipt(impossible, { historical: true }),
    /measurement_scope.*must be collector_process/,
  );
});

test("external subjects receive live authenticated process-tree memory evidence", async (t) => {
  const subject = { kind: "sea", name: "fixture-sea", version: "1", engine: null };
  const workspace = makeWorkspace({ subject });
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const collectorRss = process.memoryUsage().rss;
  const receipt = await collectFixture(workspace);
  const memory = receipt.cases[0].metrics.peak_memory;
  const methods = {
    linux: "linux-procfs-process-tree-sampled-v1",
    darwin: "macos-ps-process-tree-sampled-v1",
    win32: "windows-cim-process-tree-sampled-v1",
  };
  assert.equal(memory.measurement_scope, "process_tree");
  assert.equal(memory.measurement_method, methods[process.platform]);
  assert.equal(memory.authenticated_by, "qualification-collector");
  assert(
    memory.bytes > collectorRss + 32 * 1024 * 1024,
    "the authenticated peak must include the touched 64 MiB child allocation",
  );
  const report = buildReport(
    policyFor(receipt),
    [{ path: "sea.receipt.json", value: receipt }],
  );
  assert.equal(report.status, "passed");
});

test("synchronous external execution cannot fabricate process-tree evidence", async (t) => {
  const subject = { kind: "npm", name: "fixture-npm", version: "1", engine: null };
  const workspace = makeWorkspace({ subject, externalExecution: "sync" });
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  await assert.rejects(
    () => collectFixture(workspace),
    /synchronous or remote execution cannot qualify process-tree memory/,
  );
});

test("phase and campaign contracts reject unauditable fuzz and matrix coverage", async (t) => {
  assert.deepEqual(PROGRAM_PHASES, ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);

  const noSeed = corpusFixture();
  noSeed.cases[0].layer = "fuzz";
  noSeed.cases[0].campaign = {
    kind: "deterministic-fuzz", seed: null, trials: 10, evidence_check_ids: ["oracle-exact"],
  };
  assert.throws(() => validateCorpus(noSeed), /nonempty seed/);

  const undeclared = corpusFixture();
  undeclared.cases[0].program_phase = "P8";
  assert.throws(() => validateCorpus(undeclared), /undeclared program phase P8/);

  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace.root, { recursive: true, force: true }));
  const receipt = await collectFixture(workspace);
  const missingLayerPolicy = policyFor(receipt);
  missingLayerPolicy.rows[0].required_case_layers.push("fuzz");
  const missingLayer = buildReport(missingLayerPolicy, [{
    path: "measured.receipt.json",
    value: receipt,
  }]);
  assert.equal(missingLayer.status, "failed");
  assert.match(missingLayer.rows[0].reasons.join("\n"), /case layer fuzz lacks passing evidence/);
});

test("receipt writes are immutable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-evidence-output-"));
  const filename = path.join(directory, "receipt.json");
  try {
    writeImmutableJson(filename, { first: true });
    assert.throws(() => writeImmutableJson(filename, { first: false }), /already exists/);
    assert.equal(canonicalJson(parseJsonText(fs.readFileSync(filename, "utf8"))), '{"first":true}');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
