// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const frozen = require("../bench/optimization-engine/complex-cubic-frontier-corpus.cjs");
const {
  ADAPTER_SCHEMA,
  BOUNDARIES,
  CENSUS_SCHEMA,
  TIMING_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
} = require("../bench/class-unit-groups/complex-cubic-frontier-schema.cjs");
const {
  projectSurvey,
} = require("../bench/class-unit-groups/load-complex-cubic-frontier-survey.cjs");
const {
  DIRECT_CENSUS_PARTITIONS,
  combineCensus,
  corpusIdentity,
  pariCensusSource,
  pariTimingSource,
  recordLabelsDigest,
  sageCensusSource,
  sageTimingSource,
  shardRecords,
  systemOrder,
  timingMetrics,
} = require("../bench/class-unit-groups/run-complex-cubic-frontier.cjs");
const {
  FREEZE_SCHEMA,
  HOLDOUT_COUNT,
  PROOF_CONTRACT,
  SELECTION_MECHANISM,
  expectedTimingAnswerDigest,
  freezeFilename,
  makeFreezeArtifact,
  readFreezeFile,
  runHoldoutCensus,
  validateFreezeThenLoadHoldout,
  writeFreezeExclusive,
} = require("../bench/class-unit-groups/complex-cubic-frontier-holdout.cjs");

function sourceRecord(label, selection, classNumber, classGroup) {
  const discriminant = label.split(".")[2];
  return {
    selection,
    label,
    degree: 3,
    coefficients: ["1", "0", "-1", "1"],
    disc_sign: -1,
    discriminant_absolute: discriminant,
    r2: 1,
    unit_rank: 1,
    discriminant_radical: discriminant,
    equation_order_index: "1",
    monogenic: 1,
    galois_transitive_group: 2,
    galois_label: "3T2",
    ramified_prime_count: 1,
    class_number: classNumber,
    class_group: classGroup,
    regulator: "1.25",
    torsion_order: 2,
    used_grh: false,
    narrow_class_number: classNumber,
    narrow_class_group: classGroup,
    unit_signature_rank: 1,
  };
}

function groupFor(stratum) {
  if (stratum.endsWith("h0-trivial")) return ["1", []];
  if (stratum.endsWith("h1-cyclic-2-4")) return ["2", ["2"]];
  if (stratum.endsWith("h2-cyclic-5-16")) return ["5", ["5"]];
  if (stratum.endsWith("h3-cyclic-ge-17")) return ["17", ["17"]];
  return ["4", ["2", "2"]];
}

function corpusFixture() {
  const survey = frozen.CONTROL_LABELS.map((label, index) => sourceRecord(label, {
    role: "smoke",
    stratum: "fixed-complex-controls",
    selection_rank: index + 1,
  }, "1", []));
  frozen.expectedStrata().forEach((stratum, shard) => {
    const band = frozen.DISCRIMINANT_BANDS[Math.floor(shard / frozen.CLASS_BANDS.length)];
    const [classNumber, classGroup] = groupFor(stratum);
    for (let rank = 1; rank <= 50; rank += 1) {
      const discriminant = band.lowerExclusive + BigInt(100 * rank + shard + 1);
      survey.push(sourceRecord(`3.1.${discriminant}.${shard + 1}`, {
        role: "tune",
        stratum,
        selection_rank: rank,
      }, classNumber, classGroup));
    }
  });
  survey.sort(frozen.compareRecords);
  const manifest = {
    schema: frozen.MANIFEST_SCHEMA,
    id: `sha256:${"1".repeat(64)}`,
    controls: [...frozen.CONTROL_LABELS],
    strata: frozen.expectedStrata(),
    counts: {
      total: 1412,
      smoke: 12,
      tune: 1000,
      holdout: 400,
      strata: 20,
      tune_per_stratum: 50,
      holdout_per_stratum: 20,
    },
    snapshot: {
      captured_at: "2026-09-01T00:00:00.000Z",
      selection_seed: frozen.SELECTION_SEED,
    },
    exclusions: {
      count: 1,
      labels_sha256: "2".repeat(64),
      derivation: { roots: ["unit-test"] },
    },
    checksums: { selection_sql_sha256: "3".repeat(64) },
    release: { assets: [{
      role: "survey",
      filename: "survey.jsonl.gz",
      gzip_sha256: "4".repeat(64),
      records_sha256: "5".repeat(64),
      labels_sha256: "6".repeat(64),
    }, {
      role: "holdout",
      filename: "holdout.jsonl.gz",
      record_count: 400,
      gzip_sha256: "7".repeat(64),
      canonical_jsonl_sha256: "8".repeat(64),
      records_sha256: "9".repeat(64),
      labels_sha256: "a".repeat(64),
    }] },
  };
  const corpus = projectSurvey(manifest, survey, {
    manifestFilename: "manifest.json",
    manifestFileSha256: "b".repeat(64),
  });
  return { corpus, manifest };
}

function nativeObservation(record) {
  const receipt = {
    schema: "sagejs.number-fields/certified-complex-cubic-native-v3",
    polynomial_coefficients: record.coefficients,
    class_number: record.class_number,
    invariants: record.class_group_invariants,
    field_discriminant: record.discriminant,
    equation_order_index: "1",
    proof_status: "exact-relations-conditional-grh",
    assumptions: [
      "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
    ],
    theorem: "minkowski-generators-plus-belabas-friedman-index-one",
  };
  return {
    label: record.label,
    status: "native-pass",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    proof_status: receipt.proof_status,
    native_receipt_authenticated: true,
    independent_exact_replay: true,
    independent_exact_replay_contract:
      "ordinary-object-exact-replay-bypassing-closed-cubic-authority",
    fallback_verified: null,
    receipt_digest: sha256(JSON.stringify(JSON.parse(canonicalJson(receipt)))),
    receipt,
  };
}

function pariObservation(record) {
  return {
    label: record.label,
    status: "ok",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    proof_status: "exact-relations-conditional-grh",
  };
}

function adapterResponse(system, records) {
  return {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system,
    status: "ok",
    proof: "conditional-grh",
    payload: { records },
  };
}

function censusProcess(system, shard, records, response, ordinal) {
  const launched = BigInt(ordinal * 100 + 1);
  const generated = system === "sagejs"
    ? sha256(sageCensusSource(records))
    : sha256(pariCensusSource(records));
  return {
    system,
    mode: "census",
    execution_epoch: "e".repeat(64),
    round: null,
    census_shard: shard,
    record_labels_sha256: recordLabelsDigest(records),
    status: "ok",
    response_validation_error: null,
    response_sha256: canonicalDigest(response),
    generated_program_sha256: generated,
    launched_monotonic_nanoseconds: launched.toString(),
    ended_monotonic_nanoseconds: (launched + 10n).toString(),
    launch_to_ready_nanoseconds: "5",
    process_wall_nanoseconds: "10",
    timeout_seconds: 3600,
    affinity_logical_cpus: [0],
    peak_rss_bytes: "1024",
    stderr_sha256: "f".repeat(64),
    runtime_identity: null,
    runtime_closure_sha256: null,
  };
}

function sourceIdentity() {
  const tree = "b".repeat(40);
  return {
    candidate_commit: "a".repeat(40),
    candidate_tree: tree,
    clean: true,
    promotion_eligible: true,
    source_closure_sha256: sha256(`git-tree:${tree}`),
    build_receipt: {
      current: true,
      reason: "unit-test",
      path: "/tmp/build-receipt.json",
      sha256: "c".repeat(64),
    },
  };
}

function censusFixture(corpus, tools, source) {
  const sage = corpus.records.map(nativeObservation);
  const pari = corpus.records.map(pariObservation);
  const combined = combineCensus(corpus, [
    adapterResponse("sagejs", sage),
    adapterResponse("pari", pari),
  ]);
  const processes = [];
  let ordinal = 0;
  corpus.records.forEach((record, shard) => {
    const response = adapterResponse("sagejs", [sage[shard]]);
    processes.push(censusProcess("sagejs", shard, [record], response, ordinal++));
  });
  shardRecords(corpus).forEach((records, shard) => {
    const response = adapterResponse("pari", records.map(pariObservation));
    processes.push(censusProcess("pari", shard, records, response, ordinal++));
  });
  return {
    schema: CENSUS_SCHEMA,
    schema_version: 1,
    recorded_at: "2026-09-01T01:00:00.000Z",
    corpus: corpusIdentity("/tmp/manifest.json", corpus),
    source,
    host: { selected_logical_cpu: 0 },
    proof_contract: structuredClone(PROOF_CONTRACT),
    systems: ["sagejs", "pari"],
    tools,
    execution: {
      scheduler: "dynamic-next-shard-on-idle-cpu-list-v1",
      direct_cpus: [0],
      external_cpu: 0,
      direct_partitions: DIRECT_CENSUS_PARTITIONS,
      max_live_direct_processes_per_cpu: 1,
      timing_authority: "none-census-is-non-authoritative",
      checkpointing: {
        schema: "sagejs.benchmark/complex-cubic-frontier-census-part-v1",
        enabled: false,
        scope: "verified-sagejs-singletons-only",
        parts_dir: null,
        reused: 0,
        published: 0,
        not_published: 0,
        disabled: 1000,
      },
    },
    records: combined.records,
    summary: { ...combined.summary, processes },
  };
}

function timingEvent(corpus, system, boundary, round, shard, slowLabel) {
  const records = shardRecords(corpus)[shard];
  const perField = records.map((record) =>
    String(boundary === "scalar-prepared" && system === "sagejs" &&
      record.label === slowLabel ? 400 : 100));
  return {
    round,
    order_position: systemOrder(round, ["sagejs", "pari"]).indexOf(system),
    system,
    boundary,
    shard,
    proof: "conditional-grh",
    status: "ok",
    iterations: 1,
    record_count: 50,
    root_nanoseconds: "1200000000",
    root_source: "one-contiguous-monotonic-timer",
    phase_sum_used: false,
    digest_inside_root: false,
    answer_digest: expectedTimingAnswerDigest(corpus, system, shard),
    per_field_nanoseconds: perField,
  };
}

function timingProcess(corpus, system, round, ordinal) {
  const launched = BigInt(ordinal * 100 + 1);
  return {
    system,
    mode: "timing",
    execution_epoch: "d".repeat(64),
    round,
    census_shard: null,
    record_labels_sha256: null,
    status: "ok",
    response_validation_error: null,
    response_sha256: "1".repeat(64),
    generated_program_sha256: system === "sagejs"
      ? sha256(sageTimingSource(corpus, BOUNDARIES, round))
      : sha256(pariTimingSource(corpus, BOUNDARIES, round)),
    launched_monotonic_nanoseconds: launched.toString(),
    ended_monotonic_nanoseconds: (launched + 10n).toString(),
    launch_to_ready_nanoseconds: "5",
    process_wall_nanoseconds: "10",
    timeout_seconds: 3600,
    affinity_logical_cpus: [0],
    peak_rss_bytes: "1024",
    stderr_sha256: "2".repeat(64),
    runtime_identity: null,
    runtime_closure_sha256: null,
  };
}

function timingFixture(corpus, census, censusBytes, tools, source, slowLabel) {
  const events = [];
  for (let round = 0; round < 11; round += 1) {
    for (const system of systemOrder(round, ["sagejs", "pari"])) {
      for (const boundary of BOUNDARIES) {
        for (let shard = 0; shard < 20; shard += 1) {
          events.push(timingEvent(corpus, system, boundary, round, shard, slowLabel));
        }
      }
    }
  }
  const frontierCandidate = require(
    "../bench/class-unit-groups/run-complex-cubic-frontier.cjs"
  ).selectFrontierCandidate(corpus, census, events);
  return {
    schema: TIMING_SCHEMA,
    schema_version: 1,
    recorded_at: "2026-09-01T02:00:00.000Z",
    corpus: corpusIdentity("/relocated/manifest.json", corpus),
    census: { path: "/tmp/census.json", sha256: sha256(censusBytes) },
    source: structuredClone(source),
    host: { selected_logical_cpu: 0 },
    protocol: {
      retained_rounds: 11,
      shard_count: 20,
      fields_per_shard: 50,
      boundaries: {
        "scalar-prepared": {
          sagejs:
            "fresh isomorphic field and maximal order before root; K.class_number(proof=False) inside",
          pari: "nfinit(P) before root; bnfinit(nf,0) inside",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
        "fresh-complete": {
          sagejs:
            "coefficients through polynomial, field, maximal order, and K.class_number(proof=False)",
          pari: "bnfinit(P,0) from polynomial coefficients",
          relationship: "PARI output is a superset; one-sided frontier evidence",
        },
      },
    },
    tools,
    processes: Array.from({ length: 11 }, (_, round) => ["sagejs", "pari"].map(
      (system, position) => timingProcess(corpus, system, round, round * 2 + position),
    )).flat(),
    events,
    metrics: {
      ...timingMetrics(events, corpus, census),
      frontier_candidate: frontierCandidate,
    },
  };
}

let cached;

function completeFixture() {
  if (cached) return cached;
  const { corpus, manifest } = corpusFixture();
  const source = sourceIdentity();
  const tools = [{
    system: "sagejs",
    adapter_kind: "generated-sagejs-python",
    requested: "/tmp/sagejs",
    executable: "/tmp/sagejs",
    executable_sha256: "3".repeat(64),
    version: "0.4.1",
    status: "available",
  }, {
    system: "pari",
    adapter_kind: "generated-direct-gp",
    requested: "/tmp/gp",
    executable: "/tmp/gp",
    executable_sha256: "4".repeat(64),
    version: "GP/PARI 2.17.4",
    status: "available",
  }];
  const census = censusFixture(corpus, tools, source);
  const censusBytes = Buffer.from(`${canonicalJson(census)}\n`);
  const slowRecord = [...corpus.records].sort((left, right) =>
    BigInt(left.discriminant_absolute) < BigInt(right.discriminant_absolute) ? -1 : 1)[0];
  const timing = timingFixture(corpus, census, censusBytes, tools, source, slowRecord.label);
  const timingBytes = Buffer.from(`${canonicalJson(timing)}\n`);
  cached = {
    corpus,
    manifest,
    census,
    censusBytes,
    censusFilename: "/tmp/census.json",
    timing,
    timingBytes,
    timingFilename: "/tmp/timing.json",
    slowRecord,
  };
  return cached;
}

function holdoutRecords(manifest) {
  const records = [];
  manifest.strata.forEach((stratum, shard) => {
    const band = frozen.DISCRIMINANT_BANDS[Math.floor(shard / frozen.CLASS_BANDS.length)];
    const [classNumber, classGroup] = groupFor(stratum);
    for (let rank = 51; rank <= 70; rank += 1) {
      const discriminant = band.lowerExclusive + BigInt(100 * rank + shard + 1);
      records.push(sourceRecord(`3.1.${discriminant}.${100 + shard}`, {
        role: "holdout",
        stratum,
        selection_rank: rank,
      }, classNumber, classGroup));
    }
  });
  return records;
}

test("freeze uses the stable-slowdown selector and binds all predecessors", () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  assert.equal(artifact.schema, FREEZE_SCHEMA);
  assert.equal(artifact.selection.mechanism, SELECTION_MECHANISM);
  assert.equal(artifact.selection.candidate.label, fixture.slowRecord.label);
  assert.equal(
    artifact.selection.candidate.reason,
    "smallest-discriminant-stable-threefold-slowdown",
  );
  assert.equal(artifact.selection.candidate.scalar_prepared_ratio_median, 4);
  assert.equal(artifact.selection.candidate.slower_rounds, 11);
  assert.equal(artifact.predecessor_evidence.census.sha256, sha256(fixture.censusBytes));
  assert.equal(artifact.predecessor_evidence.timing.sha256, sha256(fixture.timingBytes));
  assert.equal(artifact.source.candidate_commit, fixture.census.source.candidate_commit);
  assert.equal(artifact.holdout.first_rank, 51);
  assert.equal(artifact.holdout.last_rank, 70);
  assert.equal(artifact.holdout.field_count, 20);
  assert.equal(artifact.freeze_sha256, canonicalDigest((({ freeze_sha256, ...rest }) => rest)(artifact)));
});

test("freeze rejects a weakened proof contract and any stale predecessor bytes", () => {
  const fixture = completeFixture();
  const weakened = structuredClone(fixture.census);
  weakened.proof_contract = { request: "GRH" };
  assert.throws(() => makeFreezeArtifact({
    ...fixture,
    census: weakened,
    frozenAt: "2026-09-01T03:00:00.000Z",
  }), /proof-contract-valid/);

  const timing = structuredClone(fixture.timing);
  timing.census.sha256 = "0".repeat(64);
  assert.throws(() => makeFreezeArtifact({
    ...fixture,
    timing,
    frozenAt: "2026-09-01T03:00:00.000Z",
  }), /does not match the accepted census/);
});

test("holdout bytes cannot be loaded before a valid predecessor freeze", () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const tampered = structuredClone(artifact);
  tampered.selection.stratum = "invented-stratum";
  let reads = 0;
  assert.throws(() => validateFreezeThenLoadHoldout({
    artifact: tampered,
    inputs: fixture,
    assetDirectory: "/unopened",
    loadAsset() {
      reads += 1;
      return holdoutRecords(fixture.manifest);
    },
  }), /stale complex-cubic frontier freeze digest/);
  assert.equal(reads, 0);

  const holdout = validateFreezeThenLoadHoldout({
    artifact,
    inputs: fixture,
    assetDirectory: "/opened-after-validation",
    loadAsset() {
      reads += 1;
      return holdoutRecords(fixture.manifest);
    },
  });
  assert.equal(reads, 1);
  assert.equal(holdout.records.length, HOLDOUT_COUNT);
  assert.deepEqual(
    holdout.records.map((record) => record.selection.stratum_rank),
    Array.from({ length: 20 }, (_, index) => index + 51),
  );
  assert.ok(holdout.records.every((record) =>
    record.selection.stratum === artifact.selection.stratum));

  const missing = holdoutRecords(fixture.manifest).filter((record) =>
    !(record.selection.stratum === artifact.selection.stratum &&
      record.selection.selection_rank === 61));
  assert.throws(() => validateFreezeThenLoadHoldout({
    artifact,
    inputs: fixture,
    assetDirectory: "/opened-after-validation",
    loadAsset: () => missing,
  }), /exactly frozen-stratum ranks 51-70/);
});

test("freeze files are canonical, exclusive, and content-addressed", (t) => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-frontier-freeze-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = writeFreezeExclusive(directory, artifact);
  assert.equal(path.basename(filename), freezeFilename(artifact));
  assert.deepEqual(readFreezeFile(filename), artifact);
  assert.equal(writeFreezeExclusive(directory, artifact), filename);

  const renamed = path.join(directory, "not-content-addressed.json");
  fs.copyFileSync(filename, renamed);
  assert.throws(() => readFreezeFile(renamed), /filename is not content-addressed/);
});

test("holdout census reuses receipt replay and checks PARI against LMFDB", async () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const holdout = validateFreezeThenLoadHoldout({
    artifact,
    inputs: fixture,
    assetDirectory: "/opened-after-validation",
    loadAsset: () => holdoutRecords(fixture.manifest),
  });
  const calls = [];
  const source = sourceIdentity();
  const evidence = await runHoldoutCensus(holdout, artifact, {
    sagejs: "/tmp/sagejs",
    gp: "/tmp/gp",
    cpu: 0,
    timeoutSeconds: 3600,
    allowDirty: false,
  }, {
    toolPlan: () => fixture.census.tools,
    currentSourceIdentity: () => source,
    invokeAdapter: async (tool, selected, mode) => {
      calls.push([tool.system, selected.records.length, mode]);
      const records = tool.system === "sagejs"
        ? selected.records.map(nativeObservation)
        : selected.records.map(pariObservation);
      return {
        response: adapterResponse(tool.system, records),
        process: null,
      };
    },
  });
  assert.equal(evidence.summary.agreement, true);
  assert.equal(evidence.summary.coverage_complete, true);
  assert.equal(evidence.records.length, 20);
  assert.deepEqual(calls.slice(0, 20), Array.from({ length: 20 }, () =>
    ["sagejs", 1, "census"]));
  assert.deepEqual(calls[20], ["pari", 20, "census"]);
  assert.ok(evidence.records.every((record) => record.status === "native-pass"));
  assert.deepEqual(evidence.proof_contract, PROOF_CONTRACT);

  let index = 0;
  await assert.rejects(() => runHoldoutCensus(holdout, artifact, {
    sagejs: "/tmp/sagejs",
    gp: "/tmp/gp",
    cpu: 0,
    timeoutSeconds: 3600,
    allowDirty: false,
  }, {
    toolPlan: () => fixture.census.tools,
    currentSourceIdentity: () => source,
    invokeAdapter: async (tool, selected) => {
      if (tool.system === "pari") {
        const records = selected.records.map(pariObservation);
        records[0].class_number = "999";
        return { response: adapterResponse("pari", records), process: null };
      }
      index += 1;
      return {
        response: adapterResponse("sagejs", selected.records.map(nativeObservation)),
        process: null,
      };
    },
  }), /PARI holdout result disagrees with LMFDB/);
  assert.equal(index, 20);
});
