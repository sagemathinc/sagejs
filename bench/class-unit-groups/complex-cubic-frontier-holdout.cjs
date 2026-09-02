#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectBuildReceipt } = require("../../scripts/build-receipt.cjs");
const frozen = require("../optimization-engine/complex-cubic-frontier-corpus.cjs");
const {
  BOUNDARIES,
  CENSUS_SCHEMA,
  TIMING_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateField,
  validateTimingEvent,
} = require("./complex-cubic-frontier-schema.cjs");
const {
  loadFrozenSurveyCorpus,
  projectField,
} = require("./load-complex-cubic-frontier-survey.cjs");
const {
  RETAINED_ROUNDS,
  combineCensus,
  corpusIdentitiesMatch,
  corpusIdentity,
  invokeAdapter,
  pariTimingSource,
  recordLabelsDigest,
  sageTimingSource,
  selectFrontierCandidate,
  shardRecords,
  sourceIdentitiesMatchForTiming,
  systemOrder,
  timingMetrics,
  toolPlan,
  validateCensusProcessTopology,
  validateCheckpointObservation,
} = require("./run-complex-cubic-frontier.cjs");

const ROOT = path.resolve(__dirname, "../..");
const FREEZE_SCHEMA = "sagejs.benchmark/complex-cubic-frontier-freeze-v1";
const HOLDOUT_CORPUS_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-frozen-holdout-v1";
const HOLDOUT_CENSUS_SCHEMA =
  "sagejs.benchmark/complex-cubic-frontier-holdout-census-v1";
const FREEZE_PREFIX = "complex-cubic-frontier-freeze-sha256-";
const REQUIRED_SYSTEMS = Object.freeze(["sagejs", "pari"]);
const HOLDOUT_FIRST_RANK = 51;
const HOLDOUT_LAST_RANK = 70;
const HOLDOUT_COUNT = HOLDOUT_LAST_RANK - HOLDOUT_FIRST_RANK + 1;
const SELECTION_MECHANISM =
  "survey-native-decline-else-stable-threefold-slowdown-v1";
const SELECTION_PARAMETERS = Object.freeze({
  population: "authenticated 1,000-field survey only",
  decline_priority: "native-decline-fallback-pass before retained timing",
  decline_order:
    "discriminant_absolute,equation_order_index,class_number,label ascending",
  timing_boundary: "scalar-prepared",
  retained_rounds: RETAINED_ROUNDS,
  stable_slowdown_median_ratio_at_least: 3,
  stable_slowdown_sage_slower_rounds_at_least: 9,
  stable_slowdown_required_paired_rounds: RETAINED_ROUNDS,
  holdout_influence: "none; holdout bytes remain unopened until this selection is frozen",
});
const PROOF_CONTRACT = Object.freeze({
  request: "conditional-grh",
  sagejs: "K.class_number(proof=False)",
  pari: "bnfinit(P,0)",
  magma: 'Proof := "GRH"',
  hecke: "class_group(...; GRH=true)",
  lmfdb_oracle: "used_grh=false",
  receipt_carrier: "live-authenticated-with-independent-exact-recomputation",
  sagejs_independent_replay:
    "ordinary-object-engine-bypassing-closed-cubic-program-proof-false",
});

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("\n") !== [...keys].sort().join("\n")) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function digest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256`);
  }
  return value;
}

function isoTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not JSON: ${error.message}`);
  }
}

function physicalEvidence(filename, bytes, value) {
  return {
    filename: path.basename(filename),
    sha256: sha256(bytes),
    canonical_sha256: canonicalDigest(value),
  };
}

function validateSourceIdentity(source, label) {
  if (!source || typeof source !== "object" || source.clean !== true ||
      source.promotion_eligible !== true ||
      typeof source.candidate_commit !== "string" ||
      !/^[0-9a-f]{40}$/.test(source.candidate_commit) ||
      typeof source.candidate_tree !== "string" ||
      !/^[0-9a-f]{40}$/.test(source.candidate_tree) ||
      !/^[0-9a-f]{64}$/.test(source.source_closure_sha256 || "") ||
      source.build_receipt?.current !== true ||
      !/^[0-9a-f]{64}$/.test(source.build_receipt.sha256 || "")) {
    throw new Error(`${label} requires a clean promotable source and current build receipt`);
  }
  if (source.source_closure_sha256 !== sha256(`git-tree:${source.candidate_tree}`)) {
    throw new Error(`${label} source closure does not match its Git tree`);
  }
  return source;
}

function validateTools(census, timing) {
  if (JSON.stringify(census.systems) !== JSON.stringify(REQUIRED_SYSTEMS) ||
      !Array.isArray(census.tools) || census.tools.length !== REQUIRED_SYSTEMS.length ||
      census.tools.some((tool, index) => tool.system !== REQUIRED_SYSTEMS[index] ||
        tool.status !== "available") ||
      canonicalDigest(census.tools) !== canonicalDigest(timing.tools)) {
    throw new Error("freeze requires the same available Sage.js and PARI tools");
  }
  const [sagejs, pari] = census.tools;
  if (sagejs.adapter_kind !== "generated-sagejs-python" ||
      pari.adapter_kind !== "generated-direct-gp") {
    throw new Error("freeze requires the direct Sage.js and direct GP census/timing paths");
  }
  return census.tools;
}

function expectedTimingAnswerDigest(corpus, system, shard) {
  const records = shardRecords(corpus)[shard];
  const answers = system === "sagejs"
    ? records.map((record) => ({ class_number: record.class_number }))
    : records.map((record) => ({
      class_number: record.class_number,
      class_group_invariants: record.class_group_invariants,
    }));
  return canonicalDigest(answers);
}

function validateTimingProcesses(timing, corpus) {
  if (!Array.isArray(timing.processes) ||
      timing.processes.length !== RETAINED_ROUNDS * REQUIRED_SYSTEMS.length) {
    throw new Error("freeze requires one retained process per system and round");
  }
  const seen = new Set();
  for (const process of timing.processes) {
    const key = `${process?.round}:${process?.system}`;
    if (!process || process.mode !== "timing" ||
        !REQUIRED_SYSTEMS.includes(process.system) ||
        !Number.isSafeInteger(process.round) || process.round < 0 ||
        process.round >= RETAINED_ROUNDS || seen.has(key) ||
        process.status !== "ok" || process.response_validation_error !== null ||
        process.census_shard !== null || process.record_labels_sha256 !== null ||
        process.runtime_identity !== null || process.runtime_closure_sha256 !== null ||
        !Array.isArray(process.affinity_logical_cpus) ||
        process.affinity_logical_cpus.length !== 1 ||
        process.affinity_logical_cpus[0] !== timing.host?.selected_logical_cpu) {
      throw new Error("freeze requires successful, uniquely pinned retained processes");
    }
    for (const field of [
      "execution_epoch", "response_sha256", "generated_program_sha256", "stderr_sha256",
    ]) digest(process[field], `timing process ${key}.${field}`);
    for (const field of [
      "launched_monotonic_nanoseconds", "ended_monotonic_nanoseconds",
      "launch_to_ready_nanoseconds", "process_wall_nanoseconds",
    ]) {
      if (typeof process[field] !== "string" || !/^[1-9][0-9]*$/.test(process[field])) {
        throw new Error(`timing process ${key}.${field} must be a positive integer`);
      }
    }
    const launched = BigInt(process.launched_monotonic_nanoseconds);
    const ended = BigInt(process.ended_monotonic_nanoseconds);
    if (ended < launched || BigInt(process.process_wall_nanoseconds) !== ended - launched ||
        BigInt(process.launch_to_ready_nanoseconds) > ended - launched) {
      throw new Error(`timing process ${key} has inconsistent clocks`);
    }
    const expectedProgram = process.system === "sagejs"
      ? sha256(sageTimingSource(corpus, BOUNDARIES, process.round))
      : sha256(pariTimingSource(corpus, BOUNDARIES, process.round));
    if (process.generated_program_sha256 !== expectedProgram) {
      throw new Error(`timing process ${key} program is not independently reproducible`);
    }
    seen.add(key);
  }
  if (new Set(timing.processes.map((process) => process.execution_epoch)).size !== 1) {
    throw new Error("freeze requires one retained timing execution epoch");
  }
  const intervals = timing.processes.map((process) => ({
    start: BigInt(process.launched_monotonic_nanoseconds),
    end: BigInt(process.ended_monotonic_nanoseconds),
  })).sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  if (intervals.some((interval, index) =>
    index > 0 && intervals[index - 1].end > interval.start)) {
    throw new Error("freeze rejects overlapping retained processes on the pinned CPU");
  }
  for (let round = 0; round < RETAINED_ROUNDS; round += 1) {
    for (const system of REQUIRED_SYSTEMS) {
      if (!seen.has(`${round}:${system}`)) {
        throw new Error(`freeze misses retained process ${round}:${system}`);
      }
    }
  }
}

function validateTimingEvidence(timing, census, corpus, censusSha256) {
  exactKeys(timing, [
    "schema", "schema_version", "recorded_at", "corpus", "census", "source", "host",
    "protocol", "tools", "processes", "events", "metrics",
  ], "timing evidence");
  if (timing.schema !== TIMING_SCHEMA || timing.schema_version !== 1 ||
      !corpusIdentitiesMatch(timing.corpus, corpusIdentity("manifest.json", corpus)) ||
      timing.census?.sha256 !== censusSha256 ||
      !sourceIdentitiesMatchForTiming(census.source, timing.source) ||
      census.source.candidate_commit !== timing.source.candidate_commit) {
    throw new Error("freeze timing does not match the accepted census, corpus, and source");
  }
  isoTimestamp(timing.recorded_at, "timing.recorded_at");
  validateSourceIdentity(timing.source, "timing.source");
  if (timing.protocol?.retained_rounds !== RETAINED_ROUNDS ||
      timing.protocol?.shard_count !== 20 || timing.protocol?.fields_per_shard !== 50 ||
      canonicalDigest(timing.protocol?.boundaries) !== canonicalDigest({
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
      })) {
    throw new Error("freeze requires the complete retained two-boundary timing protocol");
  }
  validateTimingProcesses(timing, corpus);
  if (!Array.isArray(timing.events) ||
      timing.events.length !==
        RETAINED_ROUNDS * REQUIRED_SYSTEMS.length * BOUNDARIES.length * 20) {
    throw new Error("freeze requires every retained timing event");
  }
  const seen = new Set();
  for (const event of timing.events) {
    validateTimingEvent(event);
    const key = `${event.round}:${event.system}:${event.boundary}:${event.shard}`;
    const order = systemOrder(event.round, REQUIRED_SYSTEMS);
    if (event.status !== "ok" || event.record_count !== 50 ||
        event.round >= RETAINED_ROUNDS || event.shard >= 20 || seen.has(key) ||
        event.order_position !== order.indexOf(event.system) ||
        event.answer_digest !== expectedTimingAnswerDigest(corpus, event.system, event.shard)) {
      throw new Error(`freeze rejects malformed or incomplete timing event ${key}`);
    }
    seen.add(key);
  }
  const frontierCandidate = selectFrontierCandidate(corpus, census, timing.events);
  const recomputedMetrics = {
    ...timingMetrics(timing.events, corpus, census),
    frontier_candidate: frontierCandidate,
  };
  if (canonicalDigest(recomputedMetrics) !== canonicalDigest(timing.metrics)) {
    throw new Error("freeze requires timing metrics and frontier selection to recompute exactly");
  }
  if (frontierCandidate === null) {
    throw new Error("survey has no mechanically selected frontier candidate to freeze");
  }
  return frontierCandidate;
}

function validateAcceptedSurveyEvidence({
  corpus,
  census,
  censusBytes,
  censusFilename,
  timing,
  timingBytes,
  timingFilename,
}) {
  if (census.schema !== CENSUS_SCHEMA || census.schema_version !== 1 ||
      !corpusIdentitiesMatch(census.corpus, corpusIdentity("manifest.json", corpus)) ||
      census.summary?.agreement !== true || census.summary?.coverage_complete !== true ||
      canonicalDigest(census.proof_contract) !== canonicalDigest(PROOF_CONTRACT)) {
    throw new Error("freeze requires a complete, agreeing, proof-contract-valid survey census");
  }
  isoTimestamp(census.recorded_at, "census.recorded_at");
  validateSourceIdentity(census.source, "census.source");
  const tools = validateTools(census, timing);
  validateCensusProcessTopology(census, corpus, tools);
  const censusPhysical = physicalEvidence(censusFilename, censusBytes, census);
  const timingPhysical = physicalEvidence(timingFilename, timingBytes, timing);
  const candidate = validateTimingEvidence(
    timing,
    census,
    corpus,
    censusPhysical.sha256,
  );
  return {
    candidate,
    census: censusPhysical,
    timing: timingPhysical,
    source: census.source,
    tools,
  };
}

function projectSource(source) {
  return {
    candidate_commit: source.candidate_commit,
    candidate_tree: source.candidate_tree,
    source_closure_sha256: source.source_closure_sha256,
    build_receipt_sha256: source.build_receipt.sha256,
  };
}

function projectHoldoutAsset(asset) {
  if (!asset || asset.role !== "holdout" || asset.record_count !== 400) {
    throw new Error("manifest does not bind the frozen 400-field holdout asset");
  }
  return {
    role: asset.role,
    filename: asset.filename,
    record_count: asset.record_count,
    gzip_sha256: digest(asset.gzip_sha256, "holdout.gzip_sha256"),
    canonical_jsonl_sha256: digest(
      asset.canonical_jsonl_sha256,
      "holdout.canonical_jsonl_sha256",
    ),
    records_sha256: digest(asset.records_sha256, "holdout.records_sha256"),
    labels_sha256: digest(asset.labels_sha256, "holdout.labels_sha256"),
  };
}

function makeFreezeArtifact({
  corpus,
  manifest,
  census,
  censusBytes,
  censusFilename,
  timing,
  timingBytes,
  timingFilename,
  frozenAt = new Date().toISOString(),
}) {
  isoTimestamp(frozenAt, "frozen_at");
  if (Date.parse(frozenAt) < Math.max(Date.parse(census.recorded_at), Date.parse(timing.recorded_at))) {
    throw new Error("frozen_at cannot precede its survey evidence");
  }
  const accepted = validateAcceptedSurveyEvidence({
    corpus,
    census,
    censusBytes,
    censusFilename,
    timing,
    timingBytes,
    timingFilename,
  });
  const record = corpus.records.find((entry) => entry.label === accepted.candidate.label);
  if (!record) throw new Error("mechanically selected candidate is absent from the survey");
  const payload = {
    schema: FREEZE_SCHEMA,
    schema_version: 1,
    frozen_at: frozenAt,
    corpus: {
      manifest_id: corpus.manifest.id,
      manifest_file_sha256: corpus.manifest.file_sha256,
      survey_records_sha256: corpus.digests.records_sha256,
      survey_labels_sha256: corpus.digests.labels_sha256,
    },
    predecessor_evidence: {
      census: accepted.census,
      timing: accepted.timing,
    },
    source: projectSource(accepted.source),
    selection: {
      mechanism: SELECTION_MECHANISM,
      parameters: SELECTION_PARAMETERS,
      candidate: accepted.candidate,
      candidate_record_sha256: canonicalDigest(record),
      stratum: record.selection.stratum,
      survey_global_rank: record.selection.global_rank,
      survey_stratum_rank: record.selection.stratum_rank,
      survey_shard: record.selection.shard,
    },
    holdout: {
      asset: projectHoldoutAsset(manifest.release?.assets?.[1]),
      stratum: record.selection.stratum,
      first_rank: HOLDOUT_FIRST_RANK,
      last_rank: HOLDOUT_LAST_RANK,
      field_count: HOLDOUT_COUNT,
      policy: "all and only frozen-stratum ranks 51-70; no filtering, replacement, or adaptation",
    },
  };
  return { ...payload, freeze_sha256: canonicalDigest(payload) };
}

function freezeFilename(artifact) {
  return `${FREEZE_PREFIX}${artifact.freeze_sha256}.json`;
}

function validateFreezeArtifact(artifact, inputs) {
  exactKeys(artifact, [
    "schema", "schema_version", "frozen_at", "corpus", "predecessor_evidence", "source",
    "selection", "holdout", "freeze_sha256",
  ], "freeze artifact");
  if (artifact.schema !== FREEZE_SCHEMA || artifact.schema_version !== 1) {
    throw new Error("unsupported complex-cubic frontier freeze schema");
  }
  const { freeze_sha256: recorded, ...payload } = artifact;
  if (digest(recorded, "freeze_sha256") !== canonicalDigest(payload)) {
    throw new Error("stale complex-cubic frontier freeze digest");
  }
  const recomputed = makeFreezeArtifact({ ...inputs, frozenAt: artifact.frozen_at });
  if (canonicalDigest(recomputed) !== canonicalDigest(artifact)) {
    throw new Error("freeze does not match its accepted survey predecessors and selector");
  }
  return artifact;
}

function readFreezeFile(filename) {
  const bytes = fs.readFileSync(filename);
  const artifact = parseJsonBytes(bytes, "freeze artifact");
  if (Buffer.from(`${canonicalJson(artifact)}\n`).compare(bytes) !== 0) {
    throw new Error("freeze artifact must use canonical JSON followed by LF");
  }
  if (path.basename(filename) !== freezeFilename(artifact)) {
    throw new Error("freeze artifact filename is not content-addressed by its payload");
  }
  return artifact;
}

function writeFreezeExclusive(directory, artifact) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, freezeFilename(artifact));
  const bytes = `${canonicalJson(artifact)}\n`;
  try {
    fs.writeFileSync(filename, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST" || fs.readFileSync(filename, "utf8") !== bytes) throw error;
  }
  return filename;
}

function makeHoldoutCorpus(corpus, artifact, records) {
  const selected = records.filter((record) =>
    record.selection?.role === "holdout" &&
    record.selection.stratum === artifact.holdout.stratum &&
    record.selection.selection_rank >= artifact.holdout.first_rank &&
    record.selection.selection_rank <= artifact.holdout.last_rank)
    .sort((left, right) => left.selection.selection_rank - right.selection.selection_rank);
  const expectedRanks = Array.from({ length: HOLDOUT_COUNT }, (_, index) =>
    HOLDOUT_FIRST_RANK + index);
  if (selected.length !== HOLDOUT_COUNT ||
      JSON.stringify(selected.map((record) => record.selection.selection_rank)) !==
        JSON.stringify(expectedRanks)) {
    throw new Error("holdout asset does not contain exactly frozen-stratum ranks 51-70");
  }
  const projected = selected.map((record, index) => validateField(projectField(record, {
    global_rank: index + 1,
    stratum: artifact.holdout.stratum,
    stratum_rank: record.selection.selection_rank,
    shard: 0,
  }), `holdout.records[${index}]`));
  return {
    schema: HOLDOUT_CORPUS_SCHEMA,
    schema_version: 1,
    freeze_sha256: artifact.freeze_sha256,
    selection: {
      stratum: artifact.holdout.stratum,
      first_rank: HOLDOUT_FIRST_RANK,
      last_rank: HOLDOUT_LAST_RANK,
      field_count: HOLDOUT_COUNT,
      policy: artifact.holdout.policy,
    },
    warmups: corpus.warmups,
    records: projected,
    digests: {
      labels_sha256: recordLabelsDigest(projected),
      records_sha256: canonicalDigest(projected),
    },
  };
}

function validateFreezeThenLoadHoldout({
  artifact,
  inputs,
  assetDirectory,
  loadAsset = frozen.loadAsset,
}) {
  // This validation deliberately precedes even resolution of the holdout filename.
  validateFreezeArtifact(artifact, inputs);
  const asset = inputs.manifest.release.assets[1];
  if (canonicalDigest(projectHoldoutAsset(asset)) !== canonicalDigest(artifact.holdout.asset)) {
    throw new Error("freeze does not bind the manifest holdout asset");
  }
  const records = loadAsset(asset, assetDirectory);
  return makeHoldoutCorpus(inputs.corpus, artifact, records);
}

function currentSourceIdentity(allowDirty = false) {
  const git = (args) => childProcess.execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8",
  }).trim();
  const candidateCommit = git(["rev-parse", "HEAD"]);
  const candidateTree = git(["rev-parse", "HEAD^{tree}"]);
  const dirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty && !allowDirty) throw new Error("holdout census requires a clean Git worktree");
  const build = inspectBuildReceipt(ROOT);
  const receiptPath = path.join(ROOT, "dist/build-receipt.json");
  const identity = {
    candidate_commit: candidateCommit,
    candidate_tree: candidateTree,
    clean: dirty === "",
    promotion_eligible: dirty === "" && build.current,
    source_closure_sha256: sha256(`git-tree:${candidateTree}`),
    build_receipt: {
      current: build.current,
      reason: build.reason,
      path: fs.existsSync(receiptPath) ? receiptPath : null,
      sha256: fs.existsSync(receiptPath) ? sha256(fs.readFileSync(receiptPath)) : null,
    },
  };
  if (!allowDirty) validateSourceIdentity(identity, "holdout census source");
  return identity;
}

async function runHoldoutCensus(holdout, artifact, options, dependencies = {}) {
  const planTools = dependencies.toolPlan || toolPlan;
  const invoke = dependencies.invokeAdapter || invokeAdapter;
  const identifySource = dependencies.currentSourceIdentity || currentSourceIdentity;
  const tools = planTools({
    systems: REQUIRED_SYSTEMS,
    adapters: {},
    sagejs: options.sagejs,
    gp: options.gp,
  });
  if (tools.some((tool) => tool.status !== "available")) {
    throw new Error("holdout census requires available Sage.js and direct GP executables");
  }
  const sourceBefore = identifySource(options.allowDirty);
  const executionEpoch = sha256([
    process.pid,
    Date.now(),
    process.hrtime.bigint(),
    Math.random(),
    os.hostname(),
  ].join(":"));
  const processes = [];
  const sageRecords = [];
  const sageTool = tools[0];
  for (const [index, record] of holdout.records.entries()) {
    const invocation = await invoke(
      sageTool,
      { ...holdout, records: [record] },
      "census",
      {
        cpu: options.cpu,
        timeoutSeconds: options.timeoutSeconds,
        executionEpoch,
        censusShard: index,
      },
    );
    if (invocation.process) processes.push(invocation.process);
    const observed = invocation.response.payload?.records?.[0];
    if (invocation.response.status !== "ok" || !observed) {
      throw new Error(`Sage.js holdout census failed at rank ${record.selection.stratum_rank}`);
    }
    validateCheckpointObservation(observed, record);
    sageRecords.push(observed);
  }
  const pariInvocation = await invoke(tools[1], holdout, "census", {
    cpu: options.cpu,
    timeoutSeconds: options.timeoutSeconds,
    executionEpoch,
  });
  if (pariInvocation.process) processes.push(pariInvocation.process);
  if (pariInvocation.response.status !== "ok") {
    throw new Error("PARI holdout census did not complete");
  }
  const pariRecords = pariInvocation.response.payload?.records;
  if (!Array.isArray(pariRecords) || pariRecords.length !== HOLDOUT_COUNT) {
    throw new Error("PARI holdout census emitted the wrong number of fields");
  }
  pariRecords.forEach((observed, index) => {
    const expected = holdout.records[index];
    if (observed.status !== "ok" || observed.label !== expected.label ||
        observed.discriminant !== expected.discriminant ||
        observed.class_number !== expected.class_number ||
        JSON.stringify(observed.class_group_invariants) !==
          JSON.stringify(expected.class_group_invariants)) {
      throw new Error(`PARI holdout result disagrees with LMFDB at ${expected.label}`);
    }
  });
  const responses = [{
    schema: pariInvocation.response.schema,
    mode: "census",
    system: "sagejs",
    status: "ok",
    proof: "conditional-grh",
    payload: { records: sageRecords },
  }, pariInvocation.response];
  const combined = combineCensus(holdout, responses);
  if (!combined.summary.agreement || !combined.summary.coverage_complete) {
    throw new Error("holdout census is incomplete or disagrees with LMFDB");
  }
  const sourceAfter = identifySource(options.allowDirty);
  if (canonicalDigest(sourceAfter) !== canonicalDigest(sourceBefore)) {
    throw new Error("holdout census source or build changed during execution");
  }
  return {
    schema: HOLDOUT_CENSUS_SCHEMA,
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    predecessor_freeze: {
      freeze_sha256: artifact.freeze_sha256,
      candidate: artifact.selection.candidate,
      stratum: artifact.selection.stratum,
    },
    current_source: sourceBefore,
    proof_contract: PROOF_CONTRACT,
    corpus: holdout,
    tools,
    execution: {
      mode: "correctness-only-no-retained-timing",
      logical_cpu: options.cpu,
      sagejs_partition: "twenty isolated singleton processes",
      pari_partition: "one twenty-field process",
      execution_epoch: executionEpoch,
    },
    records: combined.records,
    summary: { ...combined.summary, processes },
  };
}

function parseArguments(argv) {
  const options = {
    mode: null,
    corpus: null,
    assetDir: null,
    census: null,
    timing: null,
    freeze: null,
    output: null,
    outputDir: null,
    sagejs: path.join(ROOT, "bin/sagejs"),
    gp: "gp",
    cpu: 0,
    timeoutSeconds: 3600,
    allowDirty: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--freeze", "--holdout-census"].includes(argument)) {
      if (options.mode) throw new Error("choose exactly one mode");
      options.mode = argument.slice(2);
      continue;
    }
    if (argument === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    if (argument === "--help") {
      console.log(`Usage:
  ${path.relative(ROOT, __filename)} --freeze --corpus MANIFEST --asset-dir DIR \\
    --census CENSUS.json --timing TIMING.json --output-dir DIR
  ${path.relative(ROOT, __filename)} --holdout-census --freeze-file FREEZE.json \\
    --corpus MANIFEST --asset-dir DIR --census CENSUS.json --timing TIMING.json \\
    --sagejs PATH --gp PATH --cpu N --output HOLDOUT-CENSUS.json`);
      process.exit(0);
    }
    const valued = [
      "--corpus", "--asset-dir", "--census", "--timing", "--freeze-file", "--output",
      "--output-dir", "--sagejs", "--gp", "--cpu", "--timeout-seconds",
    ];
    if (!valued.includes(argument) || index + 1 >= argv.length) {
      throw new Error(`unknown or valueless argument ${argument}`);
    }
    const value = argv[(index += 1)];
    if (argument === "--corpus") options.corpus = path.resolve(value);
    else if (argument === "--asset-dir") options.assetDir = path.resolve(value);
    else if (argument === "--census") options.census = path.resolve(value);
    else if (argument === "--timing") options.timing = path.resolve(value);
    else if (argument === "--freeze-file") options.freeze = path.resolve(value);
    else if (argument === "--output") options.output = path.resolve(value);
    else if (argument === "--output-dir") options.outputDir = path.resolve(value);
    else if (argument === "--sagejs") options.sagejs = value;
    else if (argument === "--gp") options.gp = value;
    else if (argument === "--cpu") options.cpu = Number(value);
    else options.timeoutSeconds = Number(value);
  }
  if (!options.mode || !options.corpus || !options.assetDir || !options.census ||
      !options.timing || !Number.isSafeInteger(options.cpu) || options.cpu < 0 ||
      !Number.isSafeInteger(options.timeoutSeconds) || options.timeoutSeconds < 1) {
    throw new Error("mode, predecessor inputs, and valid execution limits are required");
  }
  if (options.mode === "freeze" && (!options.outputDir || options.freeze || options.output)) {
    throw new Error("--freeze requires only --output-dir for its content-addressed output");
  }
  if (options.mode === "holdout-census" && (!options.freeze || !options.output ||
      options.outputDir)) {
    throw new Error("--holdout-census requires --freeze-file and --output");
  }
  return options;
}

function loadPredecessorInputs(options) {
  const manifestBytes = fs.readFileSync(options.corpus);
  const manifest = frozen.parseManifestBytes(manifestBytes, options.corpus);
  const corpus = loadFrozenSurveyCorpus(options.corpus, options.assetDir);
  const censusBytes = fs.readFileSync(options.census);
  const timingBytes = fs.readFileSync(options.timing);
  return {
    corpus,
    manifest,
    census: parseJsonBytes(censusBytes, "survey census"),
    censusBytes,
    censusFilename: options.census,
    timing: parseJsonBytes(timingBytes, "survey timing"),
    timingBytes,
    timingFilename: options.timing,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputs = loadPredecessorInputs(options);
  if (options.mode === "freeze") {
    const artifact = makeFreezeArtifact(inputs);
    const filename = writeFreezeExclusive(options.outputDir, artifact);
    console.log(`${filename}: ${artifact.freeze_sha256}`);
    return;
  }
  const artifact = readFreezeFile(options.freeze);
  const holdout = validateFreezeThenLoadHoldout({
    artifact,
    inputs,
    assetDirectory: options.assetDir,
  });
  const evidence = await runHoldoutCensus(holdout, artifact, options);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${canonicalJson(evidence)}\n`, { flag: "wx" });
  console.log(`${options.output}: ${evidence.schema}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  FREEZE_PREFIX,
  FREEZE_SCHEMA,
  HOLDOUT_CENSUS_SCHEMA,
  HOLDOUT_CORPUS_SCHEMA,
  HOLDOUT_COUNT,
  HOLDOUT_FIRST_RANK,
  HOLDOUT_LAST_RANK,
  PROOF_CONTRACT,
  SELECTION_MECHANISM,
  SELECTION_PARAMETERS,
  expectedTimingAnswerDigest,
  freezeFilename,
  makeFreezeArtifact,
  makeHoldoutCorpus,
  parseArguments,
  readFreezeFile,
  runHoldoutCensus,
  validateAcceptedSurveyEvidence,
  validateFreezeArtifact,
  validateFreezeThenLoadHoldout,
  validateTimingEvidence,
  writeFreezeExclusive,
};
