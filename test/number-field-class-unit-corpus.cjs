"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const fixturePath = path.join(
  root,
  "test/fixtures/number-field-lmfdb-cubic-100.json",
);
const legacyPath = path.join(
  root,
  "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
const downloader = require("../bench/class-unit-groups/download-lmfdb-number-fields.cjs");
const evidence = require("../bench/class-unit-groups/class-unit-evidence-schema.cjs");
const runner = require("../bench/class-unit-groups/run-class-unit-corpus.cjs");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the stratified cubic snapshot is canonical and checksum-bound", () => {
  assert.equal(downloader.validateCorpus(fixture), fixture);
  assert.equal(fixture.schema, downloader.STRATIFIED_SCHEMA);
  assert.equal(fixture.records.length, 100);
  assert.deepEqual(
    Object.fromEntries(
      ["smoke", "tune", "holdout"].map((role) => [
        role,
        fixture.records.filter((record) => record.selection.role === role).length,
      ]),
    ),
    { smoke: 10, tune: 60, holdout: 30 },
  );
  assert.equal(
    fixture.checksums.labels_sha256,
    downloader.labelsDigest(fixture.records),
  );
  assert.equal(
    fixture.checksums.source_records_sha256,
    downloader.sourceRecordsDigest(fixture.records),
  );
  assert.equal(
    fixture.checksums.records_sha256,
    downloader.recordsDigest(fixture.records),
  );
  assert.equal(
    fixture.checksums.selection_sql_sha256,
    downloader.sha256(downloader.stratifiedCubicQuery()),
  );
});

test("the ten-field ladder remains the permanent smoke projection", () => {
  const byLabel = new Map(fixture.records.map((record) => [record.label, record]));
  assert.deepEqual(
    fixture.records
      .filter((record) => record.selection.role === "smoke")
      .map((record) => record.label),
    legacy.records.map((record) => record.label),
  );
  for (const oldRecord of legacy.records) {
    const current = byLabel.get(oldRecord.label);
    assert.ok(current);
    assert.equal(current.selection.role, "smoke");
    for (const key of [
      "degree",
      "coefficients",
      "disc_sign",
      "discriminant_absolute",
      "r2",
      "class_number",
      "class_group",
      "regulator",
      "torsion_order",
      "used_grh",
    ]) {
      assert.deepEqual(current[key], oldRecord[key], `${oldRecord.label}: ${key}`);
    }
  }
});

test("the tuning and held-out grids cover signatures and class structures", () => {
  const tune = fixture.records.filter((record) => record.selection.role === "tune");
  const holdout = fixture.records.filter(
    (record) => record.selection.role === "holdout",
  );
  assert.equal(new Set(tune.map((record) => record.selection.stratum)).size, 30);
  assert.ok(tune.every((record) => [1, 2].includes(record.selection.selection_rank)));
  assert.equal(tune.filter((record) => record.r2 === 0).length, 28);
  assert.equal(tune.filter((record) => record.r2 === 1).length, 32);
  assert.equal(holdout.filter((record) => record.r2 === 0).length, 15);
  assert.equal(holdout.filter((record) => record.r2 === 1).length, 15);
  assert.equal(fixture.records.filter((record) => record.class_group.length > 1).length, 20);
  assert.equal(
    fixture.records.filter((record) => record.equation_order_index === "2").length,
    7,
  );
  const canary = fixture.records.find((record) => record.label === "3.3.961.1");
  assert.deepEqual(
    {
      role: canary.selection.role,
      stratum: canary.selection.stratum,
      index: canary.equation_order_index,
      signature: [canary.degree - 2 * canary.r2, canary.r2],
    },
    {
      role: "holdout",
      stratum: "canary:totally-real-index-2",
      index: "2",
      signature: [3, 0],
    },
  );
});

test("offline validation fails closed on content, tier, SQL, and order changes", () => {
  const mutations = [
    (value) => {
      value.records[0].class_number = "2";
    },
    (value) => {
      value.records.find((record) => record.selection.role === "tune").selection.role =
        "holdout";
    },
    (value) => {
      value.snapshot.selection_sql += "-- changed\n";
    },
    (value) => {
      [value.records[0], value.records[1]] = [value.records[1], value.records[0]];
    },
  ];
  for (const mutate of mutations) {
    const changed = clone(fixture);
    mutate(changed);
    assert.throws(() => downloader.validateCorpus(changed));
  }
});

test("replay SQL fetches only pinned labels and does not resample strata", () => {
  const query = downloader.replayQuery(fixture);
  assert.match(query, /WITH selected_labels\(label\) AS/);
  assert.doesNotMatch(query, /row_number\(\) OVER/);
  assert.doesNotMatch(query, /md5\(/);
  for (const label of downloader.LEGACY_LABELS) {
    assert.match(query, new RegExp(label.replaceAll(".", "\\.")));
  }
  assert.match(query, /3\.3\.961\.1/);
});

test("the checked-in stratified fixture validates in a network-free process", () => {
  const run = childProcess.spawnSync(
    process.execPath,
    [
      path.join(root, "bench/class-unit-groups/download-lmfdb-number-fields.cjs"),
      "--check",
      "--fixture",
      fixturePath,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        LMFDB_PGHOST: "offline.invalid",
      },
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /valid \(100 records\)/);
});

function syntheticEvidenceRaw({
  requestedProof = "conditional-grh",
  achievedProof = "exact-unconditional",
} = {}) {
  const answer = {
    class_number: "1",
    class_group_invariant_factors: [],
    unit_rank: 1,
    torsion_order: "2",
    regulator: {
      kind: "interval",
      lower: "1405997871614809/5000000000000000",
      upper: "2811995743229619/10000000000000000",
      precision_bits: 100,
      rigorous: true,
    },
  };
  const tools = Object.fromEntries(
    ["sagejs", "sagejs-release"].map((name, index) => [
      name,
      evidence.createToolFingerprint(name, {
        status: "ok",
        executable: `/opt/test/${name}`,
        argv_prefix: [`/opt/test/${name}`, "--python"],
        project: null,
        version: "test-1",
        executable_sha256: String(index + 1).repeat(64),
        artifacts: [{
          role: "executable",
          path: `/opt/test/${name}`,
          sha256: String(index + 1).repeat(64),
        }],
        reason: null,
      }),
    ]),
  );
  const configuration = {
    tier: "smoke",
    requested_proofs: [requestedProof],
    requested_output: evidence.REQUESTED_OUTPUT,
    regulator_contract: {
      minimum_decimal_digits: 10,
      require_rigorous: false,
    },
    boundaries: [...evidence.TIMING_BOUNDARIES],
    systems: ["sagejs"],
    samples: 5,
    timeout_seconds: 60,
  };
  const jobs = evidence.TIMING_BOUNDARIES.map((boundary) => ({
    system: "sagejs",
    tool_id: boundary === "release-cold" ? "sagejs-release" : "sagejs",
    case_id: "3.1.23.1",
    label: "3.1.23.1",
    role: "smoke",
    requested_proof: requestedProof,
    boundary,
    samples: 5,
    status: "selected",
    invocation: ["/opt/test/sagejs", "--python", "<adapter>"],
  }));
  const comparisonKey = evidence.semanticComparisonKey({
    achievedProofSemantics: achievedProof,
    requestedOutput: evidence.REQUESTED_OUTPUT,
    regulatorContract: configuration.regulator_contract,
  });
  const results = jobs.map((job) => ({
    system: job.system,
    tool_id: job.tool_id,
    case_id: job.case_id,
    label: job.label,
    role: job.role,
    requested_proof: requestedProof,
    achieved_proof_semantics: achievedProof,
    semantic_parity: {
      request_satisfied: evidence.proofRequestSatisfied(
        requestedProof,
        achievedProof,
      ),
      comparison_key: comparisonKey,
    },
    boundary: job.boundary,
    status: "ok",
    reason: null,
    process_total_seconds: 0.5,
    samples: Array.from({ length: 5 }, (_, sampleIndex) => ({
      sample_index: sampleIndex,
      answer_sha256: evidence.fingerprint(answer),
      achieved_proof_semantics: achievedProof,
      elapsed_seconds: ["process-cold", "release-cold"].includes(job.boundary) ? 0.1 : 0.01,
      batch_elapsed_seconds: 0.01,
      iteration_count: 1,
      peak_rss_bytes: 1024,
      phases_seconds: {
        initialization: ["process-cold", "release-cold"].includes(job.boundary) ? 0.08 : null,
        field_construction: job.boundary === "kernel-warm" ? null : 0,
        computation: 0.01,
        verification: null,
      },
    })),
    summary: {
      minimum_seconds: ["process-cold", "release-cold"].includes(job.boundary) ? 0.1 : 0.01,
      median_seconds: ["process-cold", "release-cold"].includes(job.boundary) ? 0.1 : 0.01,
      maximum_seconds: ["process-cold", "release-cold"].includes(job.boundary) ? 0.1 : 0.01,
    },
    answer,
    correctness: {
      oracle: "synthetic exact oracle",
      matched: true,
      digests: { answer_sha256: evidence.fingerprint(answer) },
    },
  }));
  return {
    schema: evidence.SCHEMA,
    schema_version: evidence.SCHEMA_VERSION,
    captured_at: "2026-08-25T00:00:00.000Z",
    source: {
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      clean: true,
    },
    host: evidence.createHostFingerprint({
      hostname: "test-host",
      platform: "linux",
      architecture: "x64",
      operating_system: "Test OS 1",
      cpu_model: "Test CPU",
      logical_cpu_count: 1,
      total_memory_bytes: 1024,
      node_version: "v22.22.2",
    }),
    fixture: {
      path: "test/fixtures/number-field-lmfdb-cubic-100.json",
      sha256: evidence.sha256File(fixturePath),
      schema: fixture.schema,
      selection_query_sha256: fixture.checksums.selection_sql_sha256,
      selected_labels_sha256: fixture.checksums.labels_sha256,
      record_count: fixture.records.length,
    },
    configuration,
    tools,
    plan: { case_count: 1, job_count: jobs.length, jobs },
    results,
  };
}

test("performance evidence binds all boundaries, tools, and achieved semantics", () => {
  const finalized = evidence.finalizeClassUnitEvidence(syntheticEvidenceRaw());
  assert.equal(finalized.performance_accepted, true);
  assert.equal(finalized.report.results[0].requested_proof, "conditional-grh");
  assert.equal(
    finalized.report.results[0].achieved_proof_semantics,
    "exact-unconditional",
  );
  assert.notEqual(
    finalized.report.plan.jobs[0].tool_id,
    finalized.report.plan.jobs.at(-1).tool_id,
  );
  const roundTrip = JSON.parse(evidence.canonicalJson(finalized.report));
  assert.equal(
    evidence.validateClassUnitEvidence(roundTrip).fingerprint,
    finalized.fingerprint,
  );
});

test("evidence rejects an unconditional request with only conditional proof", () => {
  assert.throws(
    () =>
      evidence.finalizeClassUnitEvidence(
        syntheticEvidenceRaw({
          requestedProof: "unconditional",
          achievedProof: "exact-relations-conditional-grh",
        }),
      ),
    /does not satisfy the requested proof semantics/,
  );
});

test("evidence rejects a retained sample that disagrees with its aggregate answer", () => {
  const raw = syntheticEvidenceRaw();
  raw.results[0].samples[2].answer_sha256 = "f".repeat(64);
  assert.throws(
    () => evidence.finalizeClassUnitEvidence(raw),
    /samples\[2\]\.answer_sha256 differs from its aggregate answer/,
  );
});

test("the runner defaults to receipt-eligible sampling and all boundaries", () => {
  const options = runner.parseArguments([]);
  assert.equal(options.samples, 5);
  assert.deepEqual(options.boundaries, evidence.TIMING_BOUNDARIES);
  assert.deepEqual(runner.proofModes("both"), [
    "conditional-grh",
    "unconditional",
  ]);
});

test("rounded LMFDB regulator cells accept a valid narrow rigorous interval", () => {
  const expected = fixture.records.find((record) => record.label === "3.1.23.1");
  const answer = {
    class_number: expected.class_number,
    class_group_invariant_factors: expected.class_group,
    unit_rank: expected.unit_rank,
    torsion_order: String(expected.torsion_order),
    regulator: {
      kind: "interval",
      lower: "1405997871614809/5000000000000000",
      upper: "2811995743229619/10000000000000000",
      precision_bits: 100,
      rigorous: true,
    },
  };
  assert.deepEqual(runner.correctnessMismatches(answer, expected), []);
  const far = clone(answer);
  far.regulator.lower = "29/100";
  far.regulator.upper = "2900000000000001/10000000000000000";
  assert.deepEqual(runner.correctnessMismatches(far, expected), ["regulator_interval"]);
});

test("job aggregation rejects duplicate identities and every bad retained sample", () => {
  const expected = fixture.records.find((record) => record.label === "3.1.23.1");
  const job = {
    system: "direct-gp",
    tool_id: "direct-gp",
    case_id: expected.label,
    label: expected.label,
    role: "smoke",
    requested_proof: "conditional-grh",
    boundary: "kernel-warm",
    samples: 5,
  };
  const answer = {
    class_number: expected.class_number,
    class_group_invariant_factors: expected.class_group,
    unit_rank: expected.unit_rank,
    torsion_order: String(expected.torsion_order),
    regulator: {
      kind: "decimal",
      value: "0.2811995743229618465",
      precision_digits: 19,
      absolute_error_bound: "1/20000000000000000000",
      rigorous: false,
    },
    _achieved_proof_semantics: "exact-relations-conditional-grh",
  };
  const samples = Array.from({ length: 5 }, (_, sample) => ({
    label: expected.label,
    sample,
    status: "ok",
    elapsed_seconds: 0.002,
    batch_elapsed_seconds: 1.2,
    iteration_count: 600,
    phases_seconds: {
      initialization: null,
      field_construction: 0,
      computation: 0.002,
      verification: 0,
    },
    answer: clone(answer),
  }));
  assert.equal(runner.aggregateJob(job, samples, expected, 7, 1024).status, "ok");
  const duplicate = clone(samples);
  duplicate[4].sample = 3;
  assert.match(
    runner.aggregateJob(job, duplicate, expected, 7, 1024).reason,
    /sample identity mismatch/,
  );
  const wrongFirst = clone(samples);
  wrongFirst[0].answer.class_number = "2";
  assert.match(
    runner.aggregateJob(job, wrongFirst, expected, 7, 1024).reason,
    /sample-0:class_number/,
  );
});

test("runner fixture loading invokes the full checksum validator", () => {
  const temporary = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sagejs-cu-fixture-"));
  const filename = path.join(temporary, "fixture.json");
  const changed = clone(fixture);
  changed.records[0].class_number = "2";
  fs.writeFileSync(filename, `${JSON.stringify(changed)}\n`);
  assert.throws(() => runner.loadFixture(filename, "smoke", null));
  fs.rmSync(temporary, { recursive: true, force: true });
});
