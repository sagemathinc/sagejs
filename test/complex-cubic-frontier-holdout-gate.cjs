// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

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
  THREAD_ENV,
  WARMUP_ATTESTATION_SCHEMA,
  WARMUP_SCHEMA,
  candidateDirectEnvironmentIdentity,
  candidateRuntimeClosure,
  combineCensus,
  corpusIdentity,
  directProcessEnvironment,
  pariCensusSource,
  pariTimingSource,
  recordLabelsDigest,
  sageCensusSource,
  sageWarmupSource,
  sageTimingSource,
  shardRecords,
  systemOrder,
  timingMetrics,
  validateDirectSagejsTool,
} = require("../bench/class-unit-groups/run-complex-cubic-frontier.cjs");
const {
  FREEZE_SCHEMA,
  HOLDOUT_COUNT,
  PROOF_CONTRACT,
  SELECTION_MECHANISM,
  closeOutputReservation,
  expectedTimingAnswerDigest,
  freezeFilename,
  makeFreezeArtifact,
  parseArguments,
  preflightHoldoutExecution,
  publishReservedOutput,
  readFreezeFile,
  reserveOutput,
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

function syntheticSurveyRecord(stratum, shard, rank, role) {
  // Labels and class-group outcomes remain synthetic protocol-test data, not
  // arithmetic evidence. Unlike the old arbitrary discriminants, these
  // polynomial/discriminant pairs satisfy the exact equation-index contract.
  // Each x^3-x+c has squarefree negative discriminant in the required band.
  const constant = [21n, 61n, 195n, 609n][Math.floor(shard / frozen.CLASS_BANDS.length)];
  const discriminant = 27n * constant * constant - 4n;
  const [classNumber, classGroup] = groupFor(stratum);
  const record = sourceRecord(`3.1.${discriminant}.${100 * shard + rank}`, {
    role,
    stratum,
    selection_rank: rank,
  }, classNumber, classGroup);
  record.coefficients = [String(constant), "-1", "0", "1"];
  return record;
}

function corpusFixture() {
  const survey = frozen.CONTROL_LABELS.map((label, index) => sourceRecord(label, {
    role: "smoke",
    stratum: "fixed-complex-controls",
    selection_rank: index + 1,
  }, "1", []));
  frozen.expectedStrata().forEach((stratum, shard) => {
    for (let rank = 1; rank <= 50; rank += 1) {
      survey.push(syntheticSurveyRecord(stratum, shard, rank, "tune"));
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
    schema: "sagejs.number-fields/certified-complex-cubic-native-v4",
    polynomial_coefficients: record.coefficients,
    class_number: record.class_number,
    invariants: record.class_group_invariants,
    field_discriminant: record.discriminant,
    equation_order_index: "1",
    factor_base_size: "1",
    relation_count: "1",
    proof_status: "exact-relations-conditional-grh",
    assumptions: [
      "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
    ],
    theorem: "minkowski-generators-plus-belabas-friedman-index-one",
    relation_transcript: {
      schema: "sagejs.number-fields/complex-cubic-relation-transcript-v1",
      factor_ideal_hnf_order_coordinates: [
        [["2", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]],
      ],
      relation_rows: [["2"]],
      principal_element_order_coordinates: [["2", "0", "0"]],
    },
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

function fallbackObservation(record) {
  return {
    label: record.label,
    status: "native-decline-fallback-pass",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    proof_status: "exact-relations-conditional-grh",
    native_receipt_authenticated: null,
    independent_exact_replay: null,
    independent_exact_replay_contract: null,
    fallback_verified: true,
    receipt_digest: null,
    receipt: null,
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

function holdoutProcess(tool, selected, response, options, ordinal) {
  const processEvidence = censusProcess(
    tool.system,
    tool.system === "sagejs" ? options.censusShard : null,
    selected.records,
    response,
    ordinal,
  );
  processEvidence.execution_epoch = options.executionEpoch;
  processEvidence.affinity_logical_cpus = [options.cpu];
  processEvidence.timeout_seconds = options.timeoutSeconds;
  if (tool.system === "sagejs") {
    processEvidence.runtime_closure_sha256 = candidateDirectEnvironmentIdentity().sha256;
  }
  return processEvidence;
}

function sourceIdentity(
  commitCharacter = "a",
  treeCharacter = "b",
  receiptCharacter = "c",
  runtimeCharacter = null,
  records = null,
) {
  const tree = treeCharacter.repeat(40);
  const source = {
    candidate_commit: commitCharacter.repeat(40),
    candidate_tree: tree,
    clean: true,
    promotion_eligible: true,
    source_closure_sha256: sha256(`git-tree:${tree}`),
    build_receipt: {
      current: true,
      reason: "unit-test",
      path: "/tmp/build-receipt.json",
      sha256: receiptCharacter.repeat(64),
    },
  };
  if (runtimeCharacter !== null) {
    source.candidate_runtime_closure = {
      schema: "sagejs.benchmark/complex-cubic-candidate-runtime-closure-v3",
      sha256: runtimeCharacter.repeat(64),
      file_count: 42,
      total_bytes: "123456",
      native_cache_key: "9".repeat(64),
      production_native_pack: {
        path: "dist/native-kernels/pack/sagejs_native_kernel_pack.node",
        pack_key: "8".repeat(64),
        sha256: "7".repeat(64),
        bytes: "1234",
      },
      standalone_native_addon: {
        path: `dist/native-kernels/${"9".repeat(64)}/build/Release/sagejs_native_kernel.node`,
        required_absent: true,
      },
      flint_runtime: {
        declaration_identity: `flint@${"6".repeat(64)}`,
        resolved_loader: "packages/flint/index.cjs",
        package_resolution: {
          strategy: "fresh-node-create-require-v1",
          runtime_require_origin: "dist/tools/resources.js",
          workspace_link: "node_modules/@sagemath/sagejs-flint",
          workspace_link_realpath: "packages/flint",
          resolved_loader: "packages/flint/index.cjs",
        },
        generated_addon_sha256: "5".repeat(64),
        direct_addon_sha256: "4".repeat(64),
      },
      direct_process_environment: candidateDirectEnvironmentIdentity(),
    };
    source.candidate_runtime_warmup = {
      schema: WARMUP_ATTESTATION_SCHEMA,
      program_bundle_sha256: "1".repeat(64),
      record_count: 1000,
      processes_per_pass: 20,
      observations_sha256: "2".repeat(64),
      pass_count: 2,
      response_bundle_sha256_by_pass: ["3".repeat(64), "3".repeat(64)],
      runtime_closure_sha256_by_pass: [
        runtimeCharacter.repeat(64), runtimeCharacter.repeat(64),
      ],
    };
    if (records !== null) {
      const observations = records.map((record) => ({
        label: record.label,
        discriminant: record.discriminant,
        class_number: record.class_number,
        class_group_invariants: record.class_group_invariants,
      }));
      const response = {
        schema: WARMUP_SCHEMA,
        record_count: records.length,
        native_pass_count: records.length,
        observations_sha256:
          sha256(JSON.stringify(JSON.parse(canonicalJson(observations)))),
      };
      const partitions = shardRecords({ records });
      const responses = partitions.map((partition) => {
        const selected = partition.map((record) => ({
          label: record.label,
          discriminant: record.discriminant,
          class_number: record.class_number,
          class_group_invariants: record.class_group_invariants,
        }));
        return {
          schema: WARMUP_SCHEMA,
          record_count: partition.length,
          native_pass_count: partition.length,
          observations_sha256:
            sha256(JSON.stringify(JSON.parse(canonicalJson(selected)))),
        };
      });
      source.candidate_runtime_warmup = {
        schema: WARMUP_ATTESTATION_SCHEMA,
        program_bundle_sha256: canonicalDigest(
          partitions.map((partition) => sha256(sageWarmupSource(partition))),
        ),
        record_count: records.length,
        processes_per_pass: partitions.length,
        observations_sha256: response.observations_sha256,
        pass_count: 2,
        response_bundle_sha256_by_pass: [canonicalDigest(responses), canonicalDigest(responses)],
        runtime_closure_sha256_by_pass: [
          runtimeCharacter.repeat(64), runtimeCharacter.repeat(64),
        ],
      };
    }
  }
  return source;
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
    const processEvidence = censusProcess("sagejs", shard, [record], response, ordinal++);
    processEvidence.runtime_closure_sha256 =
      source.candidate_runtime_closure?.direct_process_environment?.sha256 ?? null;
    processes.push(processEvidence);
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
    requested: path.join(root, "bin/sagejs"),
    executable: fs.realpathSync(path.join(root, "bin/sagejs")),
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
  const candidateSource = sourceIdentity("d", "e", "f", "8", corpus.records);
  const candidateTools = structuredClone(tools);
  candidateTools[0].executable_sha256 = "5".repeat(64);
  const candidateHost = {
    platform: "linux",
    architecture: "x64",
    release: "unit-test-release",
    hostname: "unit-test-host",
    logical_cpu_count: 4,
    selected_logical_cpu: 0,
    selected_cpu_model: "unit-test-cpu",
    node: process.version,
    thread_environment_sha256: canonicalDigest(THREAD_ENV),
  };
  const qualification = censusFixture(corpus, candidateTools, candidateSource);
  qualification.host = {
    platform: candidateHost.platform,
    architecture: candidateHost.architecture,
    release: candidateHost.release,
    hostname: candidateHost.hostname,
    total_memory_bytes: "17179869184",
    logical_cpu_count: candidateHost.logical_cpu_count,
    selected_logical_cpu: candidateHost.selected_logical_cpu,
    selected_cpu_model: candidateHost.selected_cpu_model,
    node: candidateHost.node,
    thread_environment: structuredClone(THREAD_ENV),
  };
  const qualificationBytes = Buffer.from(`${canonicalJson(qualification)}\n`);
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
    candidateSource,
    candidateTools,
    candidateHost,
    qualification,
    qualificationBytes,
    qualificationFilename: "/tmp/candidate-qualification.json",
  };
  return cached;
}

function holdoutRecords(manifest) {
  const records = [];
  manifest.strata.forEach((stratum, shard) => {
    for (let rank = 51; rank <= 70; rank += 1) {
      records.push(syntheticSurveyRecord(stratum, shard, rank, "holdout"));
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
  assert.equal(
    artifact.predecessor_source.candidate_commit,
    fixture.census.source.candidate_commit,
  );
  assert.equal(
    artifact.candidate_source.candidate_commit,
    fixture.candidateSource.candidate_commit,
  );
  assert.notEqual(
    artifact.predecessor_source.candidate_commit,
    artifact.candidate_source.candidate_commit,
  );
  assert.equal(
    artifact.candidate_tools[0].executable_sha256,
    fixture.candidateTools[0].executable_sha256,
  );
  assert.equal(artifact.candidate_host.selected_logical_cpu, 0);
  assert.equal(
    artifact.candidate_qualification.census.sha256,
    sha256(fixture.qualificationBytes),
  );
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
    candidateSource: fixture.candidateSource,
    candidateTools: fixture.candidateTools,
    candidateHost: fixture.candidateHost,
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
    candidateSource: fixture.candidateSource,
    candidateTools: fixture.candidateTools,
    candidateHost: fixture.candidateHost,
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
    candidateSource: fixture.candidateSource,
    candidateTools: fixture.candidateTools,
    candidateHost: fixture.candidateHost,
    assetDirectory: "/opened-after-validation",
    loadAsset: () => missing,
  }), /exactly frozen-stratum ranks 51-70/);
});

test("candidate source and tool mismatches fail before holdout disclosure", () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const options = {
    sagejs: "/tmp/sagejs",
    gp: "/tmp/gp",
    cpu: 0,
    output: "/tmp/unwritten-holdout.json",
  };
  let reads = 0;
  const attempt = (dependencies) => {
    const execution = preflightHoldoutExecution(artifact, fixture, options, {
      hostExecutionIdentity: () => fixture.candidateHost,
      reserveOutput: () => ({ descriptor: 1, filename: options.output }),
      ...dependencies,
    });
    return validateFreezeThenLoadHoldout({
      artifact,
      inputs: fixture,
      candidateSource: execution.source,
      candidateTools: execution.tools,
      candidateHost: execution.host,
      assetDirectory: "/must-remain-unopened",
      loadAsset() {
        reads += 1;
        return holdoutRecords(fixture.manifest);
      },
    });
  };

  const differentSource = sourceIdentity("6", "7", "8", "7", fixture.corpus.records);
  assert.throws(() => attempt({
    currentSourceIdentity: () => differentSource,
    toolPlan: () => fixture.candidateTools,
  }), /candidate-source qualification census/);
  assert.equal(reads, 0);

  const wrongQualificationHost = structuredClone(fixture);
  wrongQualificationHost.qualification = structuredClone(fixture.qualification);
  wrongQualificationHost.qualification.host.selected_logical_cpu = 1;
  assert.throws(() => makeFreezeArtifact({
    ...wrongQualificationHost,
    frozenAt: "2026-09-01T03:00:00.000Z",
  }), /qualification host does not match/);

  const wrongQualificationEnvironment = structuredClone(fixture);
  wrongQualificationEnvironment.qualification = structuredClone(fixture.qualification);
  wrongQualificationEnvironment.qualification.host.thread_environment.FLINT_NUM_THREADS = "2";
  assert.throws(() => makeFreezeArtifact({
    ...wrongQualificationEnvironment,
    frozenAt: "2026-09-01T03:00:00.000Z",
  }), /qualification host has an invalid deterministic environment/);

  const lateQualification = structuredClone(fixture);
  lateQualification.qualification = structuredClone(fixture.qualification);
  lateQualification.qualification.recorded_at = "2026-09-01T04:00:00.000Z";
  assert.throws(() => makeFreezeArtifact({
    ...lateQualification,
    frozenAt: "2026-09-01T03:00:00.000Z",
  }), /qualification cannot be recorded after frozen_at/);

  const staleBuild = structuredClone(fixture.candidateSource);
  staleBuild.build_receipt.current = false;
  staleBuild.promotion_eligible = false;
  assert.throws(() => attempt({
    currentSourceIdentity: () => staleBuild,
    toolPlan: () => fixture.candidateTools,
  }), /clean promotable source and current build receipt/);
  assert.equal(reads, 0);

  const dirtySource = structuredClone(fixture.candidateSource);
  dirtySource.clean = false;
  dirtySource.promotion_eligible = false;
  assert.throws(() => attempt({
    currentSourceIdentity: () => dirtySource,
    toolPlan: () => fixture.candidateTools,
  }), /clean promotable source and current build receipt/);
  assert.equal(reads, 0);

  const wrongClosure = structuredClone(fixture.candidateSource);
  wrongClosure.candidate_runtime_closure.sha256 = "6".repeat(64);
  wrongClosure.candidate_runtime_warmup.runtime_closure_sha256_by_pass = [
    "6".repeat(64), "6".repeat(64),
  ];
  assert.throws(() => attempt({
    currentSourceIdentity: () => wrongClosure,
    toolPlan: () => fixture.candidateTools,
  }), /candidate-source qualification census/);
  assert.equal(reads, 0);

  const crossCheckout = structuredClone(fixture.candidateTools);
  crossCheckout[0].executable = "/tmp/other-checkout/bin/sagejs";
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => crossCheckout,
  }), /must execute ROOT\/bin\/sagejs/);
  assert.equal(reads, 0);

  const wrongSage = structuredClone(fixture.candidateTools);
  wrongSage[0].executable_sha256 = "6".repeat(64);
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => wrongSage,
  }), /candidate qualification tools/);
  assert.equal(reads, 0);

  const wrongPari = structuredClone(fixture.candidateTools);
  wrongPari[1].executable_sha256 = "6".repeat(64);
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => wrongPari,
  }), /predecessor PARI executable and version/);
  assert.equal(reads, 0);

  const unavailable = structuredClone(fixture.candidateTools);
  unavailable[0].status = "unavailable";
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => unavailable,
  }), /must identify an available executable/);
  assert.equal(reads, 0);

  const failedVersion = structuredClone(fixture.candidateTools);
  failedVersion[1].version = "version-probe-failed";
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => failedVersion,
  }), /has no authenticated version/);
  assert.equal(reads, 0);

  const blankVersion = structuredClone(fixture.candidateTools);
  blankVersion[1].version = "   ";
  assert.throws(() => attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => blankVersion,
  }), /has no authenticated version/);
  assert.equal(reads, 0);

  const holdout = attempt({
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => fixture.candidateTools,
  });
  assert.equal(reads, 1);
  assert.equal(holdout.records.length, 20);
});

test("CPU and output gates fail before holdout disclosure", () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const options = {
    sagejs: "/tmp/sagejs",
    gp: "/tmp/gp",
    cpu: 4,
    output: "/tmp/existing-holdout.json",
  };
  const common = {
    currentSourceIdentity: () => fixture.candidateSource,
    toolPlan: () => fixture.candidateTools,
    hostExecutionIdentity: () => fixture.candidateHost,
  };
  let reads = 0;
  const load = (execution) => validateFreezeThenLoadHoldout({
    artifact,
    inputs: fixture,
    candidateSource: execution.source,
    candidateTools: execution.tools,
    candidateHost: execution.host,
    assetDirectory: "/must-remain-unopened",
    loadAsset() {
      reads += 1;
      return holdoutRecords(fixture.manifest);
    },
  });

  assert.throws(() => load(preflightHoldoutExecution(artifact, fixture, options, {
    ...common,
    reserveOutput: () => ({ descriptor: 1, filename: options.output }),
  })), /requested CPU does not match the frozen CPU/);
  assert.equal(reads, 0);

  const wrongHost = structuredClone(fixture.candidateHost);
  wrongHost.selected_cpu_model = "different-cpu";
  assert.throws(() => load(preflightHoldoutExecution(artifact, fixture, {
    ...options,
    cpu: 0,
  }, {
    ...common,
    hostExecutionIdentity: () => wrongHost,
    reserveOutput: () => ({ descriptor: 1, filename: options.output }),
  })), /qualification host does not match/);
  assert.equal(reads, 0);

  assert.throws(() => load(preflightHoldoutExecution(artifact, fixture, {
    ...options,
    cpu: 0,
  }, {
    ...common,
    reserveOutput: () => {
      throw new Error("holdout census cannot reserve output (EEXIST)");
    },
  })), /cannot reserve output \(EEXIST\)/);
  assert.equal(reads, 0);
});

test("dirty mode is forbidden for freeze and holdout", () => {
  assert.throws(() => parseArguments([
    "--freeze", "--allow-dirty", "--corpus", "/tmp/manifest.json",
    "--asset-dir", "/tmp/assets", "--census", "/tmp/census.json",
    "--timing", "/tmp/timing.json", "--qualification", "/tmp/qualification.json",
    "--output-dir", "/tmp/freezes",
  ]), /require a clean candidate source/);

  const options = parseArguments([
    "--freeze", "--corpus", "/tmp/manifest.json", "--asset-dir", "/tmp/assets",
    "--census", "/tmp/census.json", "--timing", "/tmp/timing.json",
    "--qualification", "/tmp/qualification.json",
    "--sagejs", "/tmp/candidate-sagejs", "--gp", "/tmp/pari-gp",
    "--output-dir", "/tmp/freezes",
  ]);
  assert.equal(options.sagejs, "/tmp/candidate-sagejs");
  assert.equal(options.gp, "/tmp/pari-gp");
});

test("direct Sage.js execution is ROOT-bound and forced to source mode", () => {
  const fixture = completeFixture();
  assert.equal(validateDirectSagejsTool(fixture.candidateTools[0]), fixture.candidateTools[0]);
  const identity = candidateDirectEnvironmentIdentity();
  const environment = directProcessEnvironment(fixture.candidateTools[0]);
  assert.deepEqual(environment, identity.environment);
  for (const name of [
    "PATH", "HOME", "XDG_DATA_HOME", "NODE_OPTIONS", "NODE_PATH", "PYLANGPATH",
    "PYTHONPATH", "LD_PRELOAD", "LD_LIBRARY_PATH",
  ]) assert.equal(environment[name], undefined, name);
  assert.equal(environment.SAGEJS_USE_SOURCE, "1");
  assert.equal(environment.SAGEJS_NATIVE_MODE, "auto");
  assert.equal(environment.SAGEJS_NATIVE_AUTOLOAD, "1");
  assert.equal(environment.SAGEJS_NATIVE_REQUIRED, "1");
  assert.equal(environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP, "0");
  assert.equal(identity.launch_wrappers.schema,
    "sagejs.benchmark/complex-cubic-launch-wrappers-v1");
  assert.equal(
    environment.XDG_CACHE_HOME,
    path.join(root, "dist/runtime-cache/complex-cubic-frontier-xdg"),
  );
  assert.equal(
    environment.SAGEJS_NATIVE_CACHE_DIR,
    path.join(root, "dist/native-kernels"),
  );
  assert.equal(environment.SAGEJS_PRECOMPILED_MODULE_CACHE_DIR, undefined);
  assert.equal(
    environment.SAGEJS_SITE_PACKAGES,
    "/nonexistent/sagejs-complex-cubic-frontier-site-packages",
  );
  assert.equal(identity.node_executable.path, fs.realpathSync(process.execPath));
  assert.equal(
    identity.node_executable.sha256,
    sha256(fs.readFileSync(process.execPath)),
  );
  assert.deepEqual(identity.node_executable.argv_prefix, [
    fs.realpathSync(path.join(root, "bin/sagejs")),
  ]);
  for (const [name, value] of Object.entries(THREAD_ENV)) {
    assert.equal(environment[name], value, name);
  }
  assert.equal(
    fixture.candidateSource.candidate_runtime_closure.direct_process_environment.sha256,
    candidateDirectEnvironmentIdentity().sha256,
  );
  assert.deepEqual(directProcessEnvironment(fixture.candidateTools[1]), {});
  const other = structuredClone(fixture.candidateTools[0]);
  other.executable = "/tmp/other-checkout/bin/sagejs";
  assert.throws(() => validateDirectSagejsTool(other), /must execute ROOT\/bin\/sagejs/);
});

test("candidate runtime closure requires and binds the production native pack", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-frontier-closure-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const requiredFiles = [
    "bin/sagejs",
    "bin/sagejs-source.cjs",
    "bin/native-launcher.cjs",
    "bin/wasm-launcher.cjs",
    "dist/build-receipt.json",
  ];
  for (const name of requiredFiles) {
    const filename = path.join(directory, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${name}\n`);
  }
  for (const name of ["dist/compiler", "dist/tools", "dist/module-cache", "dist/runtime-cache"]) {
    const filename = path.join(directory, name, "sentinel");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${name}\n`);
  }
  const cacheKey = "7".repeat(64);
  const packKey = "8".repeat(64);
  const cacheRoot = path.join(directory, "dist/native-kernels");
  const source = path.join(directory, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.writeFileSync(path.join(cacheRoot, "index.json"), JSON.stringify({
    schema: "sagejs.native-cache/v4",
    complete: true,
    packs: [{ packKey, kernels: [cacheKey] }],
    sources: { [source]: {
      cacheKey,
      packKey,
      foreignDeclarations: [{
        dynamicPackage: "@sagemath/sagejs-flint",
        declarationIdentity: `flint@${"6".repeat(64)}`,
      }],
    } },
  }));
  const loader = path.join(cacheRoot, cacheKey, "index.cjs");
  fs.mkdirSync(path.dirname(loader), { recursive: true });
  fs.writeFileSync(loader, "module.exports = {};\n");
  const pack = path.join(cacheRoot, "pack/sagejs_native_kernel_pack.node");
  fs.mkdirSync(path.dirname(pack), { recursive: true });
  fs.writeFileSync(pack, "preferred-pack-v1");
  const writeManifest = () => fs.writeFileSync(
    path.join(cacheRoot, "pack/index.json"),
    JSON.stringify({
      schema: "sagejs.native-pack/v2",
      packKey,
      sha256: sha256(fs.readFileSync(pack)),
      bytes: fs.statSync(pack).size,
    }),
  );
  writeManifest();
  const flint = path.join(directory, "packages/flint");
  const generatedAddon = path.join(
    flint,
    "build/generated-ffi/sagejs_flint_ffi.node",
  );
  const directAddon = path.join(flint, "build/Release/sagejs_flint.node");
  fs.mkdirSync(path.dirname(generatedAddon), { recursive: true });
  fs.mkdirSync(path.dirname(directAddon), { recursive: true });
  fs.writeFileSync(path.join(flint, "index.cjs"), "module.exports = {};\n");
  fs.writeFileSync(path.join(flint, "package.json"), JSON.stringify({
    name: "@sagemath/sagejs-flint",
    main: "index.cjs",
  }));
  fs.writeFileSync(generatedAddon, "generated-flint-addon");
  fs.writeFileSync(directAddon, "direct-flint-addon");
  fs.writeFileSync(
    path.join(flint, "build/generated-ffi/manifest.json"),
    JSON.stringify({
      schema: "sagejs.ffi/generated-host-adapter-v1",
      library: `flint@${"6".repeat(64)}`,
      addon: "sagejs_flint_ffi.node",
      addon_hash: sha256(fs.readFileSync(generatedAddon)),
    }),
  );
  fs.writeFileSync(
    path.join(flint, "build/Release/sagejs_flint.manifest.json"),
    JSON.stringify({
      schema: "sagejs.flint/direct-addon-v1",
      addon: "build/Release/sagejs_flint.node",
      addon_hash: sha256(fs.readFileSync(directAddon)),
    }),
  );
  const packageLink = path.join(
    directory,
    "node_modules/@sagemath/sagejs-flint",
  );
  fs.mkdirSync(path.dirname(packageLink), { recursive: true });
  fs.symlinkSync(
    process.platform === "win32" ? flint : "../../packages/flint",
    packageLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  const present = candidateRuntimeClosure(directory);
  assert.equal(present.production_native_pack.pack_key, packKey);
  assert.equal(present.production_native_pack.sha256, sha256("preferred-pack-v1"));
  assert.equal(present.flint_runtime.resolved_loader, "packages/flint/index.cjs");
  assert.equal(
    present.flint_runtime.package_resolution.runtime_require_origin,
    "dist/tools/resources.js",
  );
  assert.equal(
    present.flint_runtime.generated_addon_sha256,
    sha256("generated-flint-addon"),
  );
  const shadow = path.join(
    directory,
    "dist/tools/node_modules/@sagemath/sagejs-flint",
  );
  fs.mkdirSync(shadow, { recursive: true });
  assert.throws(
    () => candidateRuntimeClosure(directory),
    /rejects a nearer FLINT resolution entry/,
  );
  fs.rmSync(path.join(directory, "dist/tools/node_modules"), {
    recursive: true,
    force: true,
  });
  const alternateFlint = path.join(directory, "packages/alternate-flint");
  fs.cpSync(flint, alternateFlint, { recursive: true });
  fs.unlinkSync(packageLink);
  fs.symlinkSync(
    alternateFlint,
    packageLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.throws(
    () => candidateRuntimeClosure(directory),
    /requires the workspace FLINT package link/,
  );
  fs.unlinkSync(packageLink);
  fs.symlinkSync(
    process.platform === "win32" ? flint : "../../packages/flint",
    packageLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.deepEqual(present.standalone_native_addon, {
    path: `dist/native-kernels/${cacheKey}/build/Release/sagejs_native_kernel.node`,
    required_absent: true,
  });
  const standalone = path.join(
    cacheRoot,
    cacheKey,
    "build/Release/sagejs_native_kernel.node",
  );
  fs.mkdirSync(path.dirname(standalone), { recursive: true });
  fs.writeFileSync(standalone, "unbound-fallback");
  assert.throws(
    () => candidateRuntimeClosure(directory),
    /rejects the standalone native-addon fallback/,
  );
  fs.unlinkSync(standalone);
  fs.writeFileSync(pack, "preferred-pack-v2");
  assert.throws(
    () => candidateRuntimeClosure(directory),
    /inconsistent production native pack/,
  );
  writeManifest();
  assert.notEqual(candidateRuntimeClosure(directory).sha256, present.sha256);
  fs.unlinkSync(pack);
  assert.throws(() => candidateRuntimeClosure(directory), /ENOENT/);
});

test("output reservation is exclusive, publishable, and retained after failure", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-holdout-output-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "evidence.json");
  const reservation = reserveOutput(output);
  assert.equal(fs.readFileSync(output, "utf8"), "");
  assert.throws(() => reserveOutput(output), /cannot reserve output \(EEXIST\)/);
  publishReservedOutput(reservation, "{\"complete\":true}\n");
  assert.equal(fs.readFileSync(output, "utf8"), "{\"complete\":true}\n");

  const failed = reserveOutput(path.join(directory, "failed.json"));
  closeOutputReservation(failed);
  assert.equal(fs.readFileSync(failed.filename, "utf8"), "");

  const denied = Object.assign(new Error("permission denied"), { code: "EACCES" });
  assert.throws(() => reserveOutput(path.join(directory, "denied.json"), {
    mkdir: () => {},
    open: () => { throw denied; },
  }), /cannot reserve output \(EACCES\)/);

  const attacked = path.join(directory, "attacked.json");
  const displaced = path.join(directory, "attacked-reservation.json");
  const attackedReservation = reserveOutput(attacked);
  assert.throws(() => publishReservedOutput(
    attackedReservation,
    "{\"authentic\":true}\n",
    {
      write(descriptor, bytes) {
        fs.writeFileSync(descriptor, bytes);
        fs.renameSync(attacked, displaced);
        fs.writeFileSync(attacked, "{\"attacker\":true}\n");
      },
    },
  ), /reservation lost ownership/);
  closeOutputReservation(attackedReservation);
  assert.equal(fs.readFileSync(displaced, "utf8"), "{\"authentic\":true}\n");
  assert.equal(fs.readFileSync(attacked, "utf8"), "{\"attacker\":true}\n");

  if (process.platform === "linux") {
    const symlinked = path.join(directory, "symlinked.json");
    const symlinkReservation = reserveOutput(symlinked);
    const displacedSymlink = path.join(directory, "symlinked-reservation.json");
    fs.renameSync(symlinked, displacedSymlink);
    fs.symlinkSync(`/proc/self/fd/${symlinkReservation.descriptor}`, symlinked);
    assert.throws(() => publishReservedOutput(
      symlinkReservation,
      "{\"authentic\":true}\n",
    ), /reservation lost ownership/);
    closeOutputReservation(symlinkReservation);
  }

  let directorySyncs = 0;
  const synced = reserveOutput(path.join(directory, "synced.json"), {
    fsyncParentDirectory() { directorySyncs += 1; },
  });
  publishReservedOutput(synced, "{\"durable\":true}\n", {
    fsyncParentDirectory() { directorySyncs += 1; },
  });
  assert.equal(directorySyncs, 2);
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

test("holdout process evidence and native generalization fail closed", async () => {
  const fixture = completeFixture();
  const artifact = makeFreezeArtifact({
    ...fixture,
    frozenAt: "2026-09-01T03:00:00.000Z",
  });
  const holdout = validateFreezeThenLoadHoldout({
    artifact,
    inputs: fixture,
    candidateSource: fixture.candidateSource,
    candidateTools: fixture.candidateTools,
    candidateHost: fixture.candidateHost,
    assetDirectory: "/opened-after-validation",
    loadAsset: () => holdoutRecords(fixture.manifest),
  });
  const options = {
    sagejs: fixture.candidateTools[0].executable,
    gp: fixture.candidateTools[1].executable,
    cpu: 0,
    timeoutSeconds: 3600,
    allowDirty: false,
  };
  const runWith = (mutate) => {
    let ordinal = 0;
    return runHoldoutCensus(holdout, artifact, options, {
      toolPlan: () => fixture.candidateTools,
      currentSourceIdentity: () => fixture.candidateSource,
      invokeAdapter: async (tool, selected, _mode, invokeOptions) => {
        ordinal += 1;
        const records = tool.system === "sagejs"
          ? selected.records.map(nativeObservation)
          : selected.records.map(pariObservation);
        const response = adapterResponse(tool.system, records);
        const invocation = {
          response,
          process: holdoutProcess(tool, selected, response, invokeOptions, ordinal),
        };
        mutate(invocation, tool, selected, ordinal);
        if (invocation.process) {
          invocation.process.response_sha256 = canonicalDigest(invocation.response);
        }
        return invocation;
      },
    });
  };

  await assert.rejects(() => runWith((invocation, tool, _selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 1) invocation.process = null;
  }), /schema-valid census process evidence/);

  await assert.rejects(() => runWith((invocation, tool, _selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 1) {
      invocation.process.affinity_logical_cpus = [1];
    }
  }), /not bound to its exact invocation/);

  await assert.rejects(() => runWith((invocation, tool, _selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 1) {
      invocation.process.generated_program_sha256 = "0".repeat(64);
    }
  }), /not bound to its exact invocation/);

  await assert.rejects(() => runWith((invocation, tool, _selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 1) {
      invocation.process.runtime_closure_sha256 = "0".repeat(64);
    }
  }), /not bound to its exact invocation/);

  await assert.rejects(() => runWith((invocation, tool, _selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 2) {
      invocation.process.launched_monotonic_nanoseconds = "105";
      invocation.process.ended_monotonic_nanoseconds = "115";
      invocation.process.process_wall_nanoseconds = "10";
    }
  }), /processes overlap on logical CPU 0/);

  await assert.rejects(() => runWith((invocation, tool, selected, ordinal) => {
    if (tool.system === "sagejs" && ordinal === 1) {
      invocation.response = adapterResponse("sagejs", [fallbackObservation(selected.records[0])]);
    }
  }), /declined native execution/);
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
    candidateSource: fixture.candidateSource,
    candidateTools: fixture.candidateTools,
    candidateHost: fixture.candidateHost,
    assetDirectory: "/opened-after-validation",
    loadAsset: () => holdoutRecords(fixture.manifest),
  });
  const calls = [];
  const source = fixture.candidateSource;
  const evidence = await runHoldoutCensus(holdout, artifact, {
    sagejs: "/tmp/sagejs",
    gp: "/tmp/gp",
    cpu: 0,
    timeoutSeconds: 3600,
    allowDirty: false,
  }, {
    toolPlan: () => fixture.candidateTools,
    currentSourceIdentity: () => source,
    invokeAdapter: async (tool, selected, mode, invokeOptions) => {
      calls.push([tool.system, selected.records.length, mode]);
      const records = tool.system === "sagejs"
        ? selected.records.map(nativeObservation)
        : selected.records.map(pariObservation);
      const response = adapterResponse(tool.system, records);
      return {
        response,
        process: holdoutProcess(tool, selected, response, invokeOptions, calls.length),
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
    toolPlan: () => fixture.candidateTools,
    currentSourceIdentity: () => source,
    invokeAdapter: async (tool, selected, _mode, invokeOptions) => {
      if (tool.system === "pari") {
        const records = selected.records.map(pariObservation);
        records[0].class_number = "999";
        const response = adapterResponse("pari", records);
        return {
          response,
          process: holdoutProcess(tool, selected, response, invokeOptions, index + 1),
        };
      }
      index += 1;
      const response = adapterResponse("sagejs", selected.records.map(nativeObservation));
      return {
        response,
        process: holdoutProcess(tool, selected, response, invokeOptions, index),
      };
    },
  }), /PARI holdout result disagrees with LMFDB/);
  assert.equal(index, 20);
});
