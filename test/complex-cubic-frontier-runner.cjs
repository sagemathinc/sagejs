// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough, Writable } = require("node:stream");
const test = require("node:test");

const {
  ADAPTER_SCHEMA,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateAdapterResponse,
  validateCorpus,
} = require("../bench/class-unit-groups/complex-cubic-frontier-schema.cjs");
const {
  projectSurvey,
} = require("../bench/class-unit-groups/load-complex-cubic-frontier-survey.cjs");
const frozen = require("../bench/optimization-engine/complex-cubic-frontier-corpus.cjs");
const {
  CENSUS_PARTS_SCHEMA,
  DIRECT_CENSUS_PARTITIONS,
  MINIMUM_ROOT_NS,
  READY_MARKER,
  WARMUP_ATTESTATION_SCHEMA,
  WARMUP_MARKER,
  WARMUP_SCHEMA,
  assertRuntimeClosureUnchanged,
  bindWarmedRuntimeClosure,
  censusBatchPlan,
  censusPartFilename,
  censusPartKey,
  combineCensus,
  corpusIdentitiesMatch,
  corpusIdentity,
  externalCensusProgramDigest,
  interpretAdapterProcessResult,
  makeTimingEvent,
  mergeCensusInvocations,
  nativeRelationTranscriptIsValid,
  normalizePariInvariants,
  parseArguments,
  parseGpCensus,
  pariCensusSource,
  pariTimingSource,
  recordLabelsDigest,
  runBoundedCensusBatches,
  runCensusBatchWithCheckpoint,
  runFreshProcess,
  runtimeClosureDigest,
  sageCensusSource,
  sageWarmupSource,
  sageTimingSource,
  shardRecords,
  systemOrder,
  selectFrontierCandidate,
  sourceIdentitiesMatchForTiming,
  timingMetrics,
  validateRuntimeWarmupAttestation,
  validateWarmupResponse,
  validateCensusProcessTopology,
  validateRuntimeIdentity,
  warmCandidateDirectEnvironment,
} = require("../bench/class-unit-groups/run-complex-cubic-frontier.cjs");

const root = path.resolve(__dirname, "..");

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

test("conditional native receipts require a complete exact transcript shape", () => {
  const receipt = {
    proof_status: "exact-trivial-presentation-conditional-grh",
    factor_base_size: "2",
    relation_count: "3",
    relation_transcript: {
      schema: "sagejs.number-fields/complex-cubic-relation-transcript-v1",
      factor_ideal_hnf_order_coordinates: [
        [["2", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]],
        [["3", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]],
      ],
      relation_rows: [["1", "0"], ["0", "1"], ["1", "1"]],
      principal_element_order_coordinates: [
        ["1", "0", "0"], ["0", "1", "0"], ["1", "1", "0"],
      ],
    },
  };
  assert.equal(nativeRelationTranscriptIsValid(receipt), true);
  const malformed = structuredClone(receipt);
  malformed.relation_transcript.relation_rows[0].pop();
  assert.equal(nativeRelationTranscriptIsValid(malformed), false);
  const negative = structuredClone(receipt);
  negative.relation_transcript.relation_rows[1][0] = "-1";
  assert.equal(nativeRelationTranscriptIsValid(negative), false);
  assert.equal(nativeRelationTranscriptIsValid({
    proof_status: "exact-relations-conditional-grh",
  }), false);
});

function groupFor(stratum) {
  if (stratum.endsWith("h0-trivial")) return ["1", []];
  if (stratum.endsWith("h1-cyclic-2-4")) return ["2", ["2"]];
  if (stratum.endsWith("h2-cyclic-5-16")) return ["5", ["5"]];
  if (stratum.endsWith("h3-cyclic-ge-17")) return ["17", ["17"]];
  return ["4", ["2", "2"]];
}

let cachedCorpus;

function corpusFixture() {
  if (cachedCorpus) return cachedCorpus;
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
        role: "tune", stratum, selection_rank: rank,
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
      total: 1412, smoke: 12, tune: 1000, holdout: 400, strata: 20,
      tune_per_stratum: 50, holdout_per_stratum: 20,
    },
    snapshot: {
      captured_at: "2026-09-02T00:00:00.000Z",
      selection_seed: frozen.SELECTION_SEED,
    },
    exclusions: {
      count: 1, labels_sha256: "2".repeat(64), derivation: { roots: ["unit-test"] },
    },
    checksums: { selection_sql_sha256: "3".repeat(64) },
    release: { assets: [{
      role: "survey", filename: "survey.jsonl.gz", gzip_sha256: "4".repeat(64),
      records_sha256: "5".repeat(64), labels_sha256: "6".repeat(64),
    }] },
  };
  cachedCorpus = projectSurvey(manifest, survey, {
    manifestFilename: "manifest.json",
    manifestFileSha256: "7".repeat(64),
  });
  return cachedCorpus;
}

test("frozen survey projection is deterministic, disjoint, and authenticated", () => {
  const first = corpusFixture();
  const second = corpusFixture();
  assert.deepEqual(first, second);
  validateCorpus(first);
  assert.equal(first.records.length, 1000);
  assert.equal(first.warmups.length, 12);
  assert.equal(new Set([...first.records, ...first.warmups].map((record) => record.label)).size, 1012);
  assert.equal(first.digests.records_sha256, canonicalDigest(first.records));
  const counts = Array(20).fill(0);
  first.records.forEach((record) => { counts[record.selection.shard] += 1; });
  assert.deepEqual(counts, Array(20).fill(50));
  assert.deepEqual(shardRecords(first).map((records) => records.length), Array(20).fill(50));
});

test("direct GP sources pin flag-zero conditional and explicit full certification", () => {
  const corpus = corpusFixture();
  const record = corpus.records[0];
  const conditional = pariCensusSource([record], "conditional-grh");
  assert.match(conditional, /bnfinit\(P,0\)/);
  assert.doesNotMatch(conditional, /bnfinit\(P,1\)/);
  assert.doesNotMatch(conditional, /bnfcertify/);

  const unconditional = pariCensusSource([record], "unconditional");
  assert.match(unconditional, /bnfinit\(P,1\)/);
  assert.match(unconditional, /bnfcertify\(bnf,0\)/);
  assert.doesNotMatch(unconditional, /bnfcertify\(bnf\)/);

  const timing = pariTimingSource(corpus, ["scalar-prepared", "fresh-complete"], 0, 17n);
  assert.match(timing, /listput\(prepared,nfinit\(Polrev\(C\[i\]\)\)\)/);
  assert.match(timing, /bnfinit\(prepared\[position\],0\)/);
  assert.match(timing, /P=Polrev\(C\[i\]\);bnf=bnfinit\(P,0\)/);
  assert.doesNotMatch(timing, /P=\[Polrev/);
  assert.doesNotMatch(timing, /bnfinit\([^\n]*,1\)/);
  assert.match(timing, /root=getwalltime\(\)/);
  assert.match(timing, /ret\[1\]\*1000000<17/);
});

test("direct PARI invariant factors are normalized to Sage divisibility order", () => {
  assert.deepEqual(normalizePariInvariants([12, 6, 2]), ["2", "6", "12"]);
  assert.deepEqual(normalizePariInvariants([]), []);
  assert.throws(() => normalizePariInvariants([2, 6]), /not divisibility ordered/);
  const record = corpusFixture().records[0];
  const response = parseGpCensus(
    `SAGEJS_COMPLEX_CUBIC_GP_CENSUS|${record.label}|${record.discriminant}|8|[4,2]\n`,
    [record],
  );
  assert.deepEqual(response.payload.records[0].class_group_invariants, ["2", "4"]);
});

test("census isolates Sage fields while retaining PARI timing strata", () => {
  const corpus = corpusFixture();
  const tool = {
    system: "sagejs", status: "available", adapter_kind: "generated-sagejs-python",
  };
  const batches = censusBatchPlan(corpus, tool);
  assert.deepEqual(DIRECT_CENSUS_PARTITIONS.sagejs, {
    partition: "singleton-global-rank-v1", fields_per_shard: 1, shard_count: 1000,
  });
  assert.equal(batches.length, 1000);
  assert.deepEqual(batches.map((batch) => batch.shard),
    Array.from({ length: 1000 }, (_, index) => index));
  assert.ok(batches.every((batch) => batch.corpus.records.length === 1));
  assert.deepEqual(batches.map((batch) => batch.corpus.records[0].label),
    corpus.records.map((record) => record.label));

  const pariBatches = censusBatchPlan(corpus, {
    system: "pari", status: "available", adapter_kind: "generated-direct-gp",
  });
  assert.deepEqual(DIRECT_CENSUS_PARTITIONS.pari, {
    partition: "timing-stratum-v1", fields_per_shard: 50, shard_count: 20,
  });
  assert.equal(pariBatches.length, 20);
  assert.ok(pariBatches.every((batch) => batch.corpus.records.length === 50));

  const entries = batches.map((batch) => ({
    batch,
    invocation: {
      response: batch.shard === 7
        ? {
          schema: ADAPTER_SCHEMA, mode: "census", system: "sagejs",
          status: "timeout", proof: "conditional-grh", payload: null,
        }
        : {
          schema: ADAPTER_SCHEMA, mode: "census", system: "sagejs",
          status: "ok", proof: "conditional-grh",
          payload: { records: batch.corpus.records.map((record) => ({
            label: record.label, status: "native-pass",
          })) },
        },
    },
  }));
  const merged = mergeCensusInvocations(tool, corpus, entries);
  assert.equal(merged.payload.records.length, 1000);
  assert.equal(merged.payload.records.filter((record) => record.status === "timeout").length, 1);
  assert.equal(censusBatchPlan(corpus, { ...tool, adapter_kind: "json-protocol" }).length, 1);

  const unavailableTool = { ...tool, system: "magma", status: "unavailable" };
  const unavailableBatch = censusBatchPlan(corpus, unavailableTool)[0];
  const unavailable = mergeCensusInvocations(unavailableTool, corpus, [{
    batch: unavailableBatch,
    invocation: { response: {
      schema: ADAPTER_SCHEMA, mode: "census", system: "magma",
      status: "unavailable", proof: "conditional-grh", payload: null,
    } },
  }]);
  const combined = combineCensus(corpus, [merged, unavailable]);
  assert.equal(combined.summary.coverage_complete, false);
  assert.equal(combined.records[0].status, "comparator-unavailable");
});

test("census CPU lists are explicit and never affect retained timing", () => {
  const required = ["--corpus", "/tmp/corpus.json", "--output", "/tmp/output.json"];
  assert.deepEqual(parseArguments(["--census", ...required, "--cpu", "2"]).censusCpus, [2]);
  assert.deepEqual(
    parseArguments(["--census", ...required, "--cpu", "2", "--census-cpus", "0,3,1"])
      .censusCpus,
    [0, 3, 1],
  );
  assert.throws(() => parseArguments([
    "--census", ...required, "--census-cpus", "0,0",
  ]), /unique logical CPUs/);
  assert.throws(() => parseArguments([
    "--census", ...required, "--census-cpus", "0,-1",
  ]), /canonical nonnegative integer/);
  assert.throws(() => parseArguments([
    "--census", ...required, "--census-cpus", "0,01",
  ]), /canonical nonnegative integer/);
  assert.throws(() => parseArguments([
    "--timing", ...required, "--census-file", "/tmp/census.json", "--census-cpus", "0,1",
  ]), /only valid with --census/);
  assert.equal(parseArguments(["--census", ...required]).censusPartsDir,
    path.resolve("/tmp/output.json.parts"));
  assert.equal(parseArguments(["--census", ...required, "--no-census-parts"])
    .censusPartsDir, null);
  assert.throws(() => parseArguments([
    "--census", ...required, "--allow-dirty",
  ]), /require a clean Git worktree/);
  assert.throws(() => parseArguments([
    "--census", ...required, "--no-census-parts", "--census-parts-dir", "/tmp/parts",
  ]), /conflicts/);
});

test("bounded census workers dynamically refill CPUs and preserve shard order", async () => {
  const batches = Array.from({ length: 9 }, (_, shard) => ({ shard }));
  const active = new Set();
  let maximumActive = 0;
  const observed = [];
  const results = await runBoundedCensusBatches(batches, [1, 3, 5], async (batch, cpu) => {
    assert.equal(active.has(cpu), false);
    active.add(cpu);
    maximumActive = Math.max(maximumActive, active.size);
    observed.push([batch.shard, cpu]);
    await new Promise((resolve) => setTimeout(resolve, batch.shard === 0 ? 5 : 0));
    active.delete(cpu);
    return `${batch.shard}:${cpu}`;
  });
  assert.equal(maximumActive, 3);
  assert.equal(results[0], "0:1");
  assert.equal(results[1], "1:3");
  assert.equal(results[2], "2:5");
  assert.ok(results.slice(3).some((value) => !value.endsWith(":1")));
  assert.deepEqual(observed.map(([shard]) => shard).sort((a, b) => a - b),
    Array.from({ length: 9 }, (_, shard) => shard));
});

test("verified Sage singleton checkpoints publish atomically and resume exactly", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-frontier-parts-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const corpus = corpusFixture();
  const tool = {
    system: "sagejs",
    status: "available",
    adapter_kind: "generated-sagejs-python",
    executable_sha256: "a".repeat(64),
  };
  const source = {
    clean: true,
    candidate_tree: "b".repeat(40),
    source_closure_sha256: "c".repeat(64),
    build_receipt: { current: true, sha256: "d".repeat(64) },
  };
  const options = {
    cpu: 0,
    censusCpus: [0],
    censusPartsEnabled: true,
    censusPartsDir: directory,
  };
  const batch = censusBatchPlan(corpus, tool)[0];
  const record = batch.corpus.records[0];
  const receipt = {
    schema: "sagejs.number-fields/certified-complex-cubic-native-v4",
    polynomial_coefficients: record.coefficients,
    class_number: record.class_number,
    invariants: record.class_group_invariants,
    field_discriminant: record.discriminant,
    equation_order_index: "3",
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
  const receiptDigest = sha256(JSON.stringify(JSON.parse(canonicalJson(receipt))));
  const response = {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: "sagejs",
    status: "ok",
    proof: "conditional-grh",
    payload: { records: [{
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
      receipt_digest: receiptDigest,
      receipt,
    }] },
  };
  const processEvidence = {
    system: "sagejs",
    mode: "census",
    execution_epoch: "9".repeat(64),
    round: null,
    census_shard: batch.shard,
    record_labels_sha256: recordLabelsDigest([record]),
    status: "ok",
    response_validation_error: null,
    response_sha256: canonicalDigest(response),
    generated_program_sha256: sha256(sageCensusSource([record])),
    launched_monotonic_nanoseconds: "1",
    ended_monotonic_nanoseconds: "11",
    launch_to_ready_nanoseconds: "5",
    process_wall_nanoseconds: "10",
    timeout_seconds: 3600,
    affinity_logical_cpus: [0],
    peak_rss_bytes: "1024",
    stderr_sha256: "f".repeat(64),
    runtime_identity: null,
    runtime_closure_sha256: null,
  };
  let calls = 0;
  const invoke = async () => {
    calls += 1;
    return { response, process: processEvidence };
  };
  const first = await runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, invoke,
  );
  assert.equal(first.checkpoint, "published");
  assert.equal(calls, 1);
  const expected = censusPartKey(corpus, tool, source, options, batch);
  const filename = censusPartFilename(directory, expected);
  assert.equal(fs.existsSync(filename), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, "utf8")).response, response);
  const originalPart = fs.readFileSync(filename, "utf8");

  const second = await runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, async () => {
      throw new Error("a valid checkpoint must suppress relaunch");
    },
  );
  assert.equal(second.checkpoint, "reused");
  assert.deepEqual(second.invocation.response, response);

  const structurallyInvalid = JSON.parse(originalPart);
  delete structurallyInvalid.process.execution_epoch;
  delete structurallyInvalid.part_sha256;
  structurallyInvalid.part_sha256 = canonicalDigest(structurallyInvalid);
  fs.writeFileSync(filename, canonicalJson(structurallyInvalid));
  await assert.rejects(() => runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, invoke,
  ), /schema-valid census process evidence/);
  fs.writeFileSync(filename, originalPart);

  const wrongReplayContract = JSON.parse(originalPart);
  wrongReplayContract.response.payload.records[0].independent_exact_replay_contract =
    "ordinary-native-self-check";
  wrongReplayContract.process.response_sha256 = canonicalDigest(
    wrongReplayContract.response,
  );
  delete wrongReplayContract.part_sha256;
  wrongReplayContract.part_sha256 = canonicalDigest(wrongReplayContract);
  fs.writeFileSync(filename, canonicalJson(wrongReplayContract));
  await assert.rejects(() => runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, invoke,
  ), /invalid native proof branch/);
  fs.writeFileSync(filename, originalPart);

  const wrongProofContract = JSON.parse(originalPart);
  wrongProofContract.response.payload.records[0].receipt.proof_status =
    "exact-invented-conditional-grh";
  wrongProofContract.response.payload.records[0].proof_status =
    "exact-invented-conditional-grh";
  wrongProofContract.response.payload.records[0].receipt_digest = sha256(
    JSON.stringify(JSON.parse(canonicalJson(
      wrongProofContract.response.payload.records[0].receipt,
    ))),
  );
  wrongProofContract.process.response_sha256 = canonicalDigest(
    wrongProofContract.response,
  );
  delete wrongProofContract.part_sha256;
  wrongProofContract.part_sha256 = canonicalDigest(wrongProofContract);
  fs.writeFileSync(filename, canonicalJson(wrongProofContract));
  await assert.rejects(() => runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, invoke,
  ), /invalid native proof branch/);
  fs.writeFileSync(filename, originalPart);

  const tampered = JSON.parse(fs.readFileSync(filename, "utf8"));
  tampered.response.payload.records[0].class_number = "999";
  fs.writeFileSync(filename, JSON.stringify(tampered));
  await assert.rejects(() => runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, invoke,
  ), /stale census checkpoint digest/);
});

test("failed Sage singleton attempts never become checkpoints", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-frontier-failed-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const corpus = corpusFixture();
  const tool = {
    system: "sagejs", status: "available", adapter_kind: "generated-sagejs-python",
    executable_sha256: "a".repeat(64),
  };
  const source = {
    clean: true, candidate_tree: "b".repeat(40), source_closure_sha256: "c".repeat(64),
    build_receipt: { current: true, sha256: "d".repeat(64) },
  };
  const options = {
    cpu: 0, censusCpus: [0], censusPartsEnabled: true, censusPartsDir: directory,
  };
  const batch = censusBatchPlan(corpus, tool)[1];
  const failed = await runCensusBatchWithCheckpoint(
    corpus, tool, source, options, batch, 0, async () => ({
      response: {
        schema: ADAPTER_SCHEMA, mode: "census", system: "sagejs",
        status: "timeout", proof: "conditional-grh", payload: null,
      },
      process: {
        system: "sagejs", mode: "census", census_shard: batch.shard,
        status: "timeout", response_validation_error: null,
      },
    }),
  );
  assert.equal(failed.checkpoint, "not-published");
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("a malformed direct census shard becomes an explicit failed region", () => {
  const corpus = { ...corpusFixture(), records: corpusFixture().records.slice(0, 50) };
  const tool = { system: "pari", adapter_kind: "generated-direct-gp" };
  const malformed = interpretAdapterProcessResult(tool, corpus, "census", {}, {
    status: "ok",
    stdout: `${READY_MARKER}\nSAGEJS_COMPLEX_CUBIC_GP_CENSUS|bad|bad|bad|not-json\n`,
    ready: 1n,
  }, null);
  assert.equal(malformed.response.status, "error");
  assert.match(malformed.responseValidationError, /JSON/);

  const record = corpus.records[0];
  const missingReady = interpretAdapterProcessResult(
    tool,
    { ...corpus, records: [record] },
    "census",
    {},
    {
      status: "ok",
      stdout: `SAGEJS_COMPLEX_CUBIC_GP_CENSUS|${record.label}|${record.discriminant}|1|[]\n`,
      ready: null,
    },
    null,
  );
  assert.equal(missingReady.response.status, "error");
  assert.match(missingReady.responseValidationError, /never emitted the ready marker/);
  assert.throws(() => interpretAdapterProcessResult(tool, corpus, "timing", {
    boundaries: ["scalar-prepared"], round: 0,
  }, {
    status: "ok", ready: 1n,
    stdout: "SAGEJS_COMPLEX_CUBIC_GP_TIMING|bad|bad|bad|bad|not-json|not-json\n",
  }, null));
});

test("timing authenticates every direct census shard and label digest", () => {
  const corpus = corpusFixture();
  const tool = {
    system: "sagejs", status: "available", adapter_kind: "generated-sagejs-python",
  };
  const cpus = [0, 1, 2, 3];
  const observations = corpus.records.map((record) => ({
    label: record.label,
    status: "native-decline-fallback-pass",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    proof_status: "exact-unconditional",
    native_receipt_authenticated: null,
    independent_exact_replay: null,
    independent_exact_replay_contract: null,
    fallback_verified: true,
    receipt_digest: null,
    receipt: null,
  }));
  const fullResponse = {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: "sagejs",
    status: "ok",
    proof: "conditional-grh",
    payload: { records: observations },
  };
  const combined = combineCensus(corpus, [fullResponse]);
  const processes = censusBatchPlan(corpus, tool).map((batch) => {
    const response = {
      ...fullResponse,
      payload: { records: [observations[batch.shard]] },
    };
    const launched = batch.shard * 20 + 1;
    return {
      system: tool.system,
      mode: "census",
      execution_epoch: "9".repeat(64),
      round: null,
      census_shard: batch.shard,
      record_labels_sha256: recordLabelsDigest(batch.corpus.records),
      status: "ok",
      response_validation_error: null,
      response_sha256: canonicalDigest(response),
      generated_program_sha256: sha256(sageCensusSource(batch.corpus.records)),
      launched_monotonic_nanoseconds: String(launched),
      ended_monotonic_nanoseconds: String(launched + 10),
      launch_to_ready_nanoseconds: "5",
      process_wall_nanoseconds: "10",
      timeout_seconds: 3600,
      affinity_logical_cpus: [cpus[batch.shard % cpus.length]],
      peak_rss_bytes: "1024",
      stderr_sha256: "f".repeat(64),
      runtime_identity: null,
      runtime_closure_sha256: null,
    };
  });
  const census = {
    execution: {
      scheduler: "dynamic-next-shard-on-idle-cpu-list-v1",
      direct_cpus: cpus,
      external_cpu: 0,
      direct_partitions: DIRECT_CENSUS_PARTITIONS,
      max_live_direct_processes_per_cpu: 1,
      timing_authority: "none-census-is-non-authoritative",
      checkpointing: {
        schema: CENSUS_PARTS_SCHEMA,
        enabled: true,
        scope: "verified-sagejs-singletons-only",
        parts_dir: "/tmp/frontier-parts",
        reused: 750,
        published: 250,
        not_published: 0,
        disabled: 0,
      },
    },
    records: combined.records,
    summary: { ...combined.summary, processes },
  };
  assert.equal(validateCensusProcessTopology(census, corpus, [tool]).size, 0);

  const omitted = structuredClone(census);
  omitted.summary.processes.pop();
  assert.throws(() => validateCensusProcessTopology(omitted, corpus, [tool]),
    /exactly the expected census process topology/);

  const duplicate = structuredClone(census);
  duplicate.summary.processes[999].census_shard = 998;
  assert.throws(() => validateCensusProcessTopology(duplicate, corpus, [tool]),
    /topology is invalid/);

  const outOfRange = structuredClone(census);
  outOfRange.summary.processes[999].census_shard = 1000;
  assert.throws(() => validateCensusProcessTopology(outOfRange, corpus, [tool]),
    /schema-valid census process evidence/);

  const stale = structuredClone(census);
  stale.summary.processes[7].record_labels_sha256 = "0".repeat(64);
  assert.throws(() => validateCensusProcessTopology(stale, corpus, [tool]),
    /label digest is stale/);

  const wrongCpu = structuredClone(census);
  wrongCpu.summary.processes[7].affinity_logical_cpus = [99];
  assert.throws(() => validateCensusProcessTopology(wrongCpu, corpus, [tool]),
    /label digest is stale/);

  const staleProgram = structuredClone(census);
  staleProgram.summary.processes[7].generated_program_sha256 = "1".repeat(64);
  assert.throws(() => validateCensusProcessTopology(staleProgram, corpus, [tool]),
    /label digest is stale/);

  const unboundResponse = structuredClone(census);
  unboundResponse.summary.processes[7].response_sha256 = "2".repeat(64);
  assert.throws(() => validateCensusProcessTopology(unboundResponse, corpus, [tool]),
    /not bound to its observations/);

  const forgedSummary = structuredClone(census);
  forgedSummary.summary.counts = { "native-pass": 1000 };
  assert.throws(() => validateCensusProcessTopology(forgedSummary, corpus, [tool]),
    /records and summary recompute exactly/);

  const forgedObservation = structuredClone(census);
  forgedObservation.records[7].observations.sagejs.fallback_verified = false;
  assert.throws(() => validateCensusProcessTopology(forgedObservation, corpus, [tool]),
    /invalid fallback proof branch/);

  const resumedEpoch = structuredClone(census);
  resumedEpoch.summary.processes[4].execution_epoch = "8".repeat(64);
  resumedEpoch.summary.processes[4].launched_monotonic_nanoseconds = "5";
  resumedEpoch.summary.processes[4].ended_monotonic_nanoseconds = "15";
  assert.equal(validateCensusProcessTopology(resumedEpoch, corpus, [tool]).size, 0);

  const sameEpochOverlap = structuredClone(census);
  sameEpochOverlap.summary.processes[4].launched_monotonic_nanoseconds = "5";
  sameEpochOverlap.summary.processes[4].ended_monotonic_nanoseconds = "15";
  assert.throws(() => validateCensusProcessTopology(sameEpochOverlap, corpus, [tool]),
    /overlap within execution epoch/);

  const missingProcessField = structuredClone(census);
  delete missingProcessField.summary.processes[0].timeout_seconds;
  assert.throws(() => validateCensusProcessTopology(missingProcessField, corpus, [tool]),
    /schema-valid census process evidence/);

  const extraProcessField = structuredClone(census);
  extraProcessField.summary.processes[0].forged = true;
  assert.throws(() => validateCensusProcessTopology(extraProcessField, corpus, [tool]),
    /schema-valid census process evidence/);

  for (const mutate of [
    (execution) => { execution.direct_partitions.sagejs.partition = "forged-partition"; },
    (execution) => { execution.direct_partitions.sagejs.fields_per_shard = 10; },
    (execution) => { execution.direct_partitions.pari.shard_count = 19; },
  ]) {
    const forged = structuredClone(census);
    mutate(forged.execution);
    assert.throws(() => validateCensusProcessTopology(forged, corpus, [tool]),
      /authenticated census execution topology/);
  }

  const missingExecution = structuredClone(census);
  delete missingExecution.execution;
  assert.throws(() => validateCensusProcessTopology(missingExecution, corpus, [tool]),
    /authenticated census execution topology/);

  const extraSummary = structuredClone(census);
  extraSummary.summary.forged = true;
  assert.throws(() => validateCensusProcessTopology(extraSummary, corpus, [tool]),
    /schema-valid census summary/);

  const invalidDisabledPath = structuredClone(census);
  invalidDisabledPath.execution.checkpointing = {
    ...invalidDisabledPath.execution.checkpointing,
    enabled: false,
    parts_dir: 17,
    reused: 0,
    published: 0,
    disabled: 1000,
  };
  assert.throws(() => validateCensusProcessTopology(invalidDisabledPath, corpus, [tool]),
    /authenticated census execution topology/);
});

test("external census programs are independently regenerated at the timing gate", () => {
  const corpus = corpusFixture();
  const executable = path.join(root,
    "bench/class-unit-groups/complex-cubic-frontier-magma-adapter.cjs");
  const tool = {
    system: "magma",
    status: "available",
    adapter_kind: "json-protocol",
    executable,
  };
  const expectedProgram = externalCensusProgramDigest(tool, corpus);
  const observations = corpus.records.map((record) => ({
    label: record.label,
    status: "ok",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    proof_status: "exact-relations-conditional-grh",
  }));
  const identityPayload = {
    schema: "sagejs.benchmark/complex-cubic-frontier-runtime-identity-v1",
    system: "magma",
    version: "Magma V2.18-5",
    executable: "/opt/magma/bin/magma",
    proof_setting: 'ClassGroup(order : Proof := "GRH")',
    proof_semantics: "conditional factor-base theorem and exact relation arithmetic",
    environment: { MAGMA_LIBRARIES: "" },
    artifacts: [{
      role: "magma-runtime", path: "/opt/magma/magma.exe", bytes: 100,
      sha256: "a".repeat(64),
    }],
    adapter: {
      role: "protocol-adapter", path: executable, bytes: 200,
      sha256: "b".repeat(64),
    },
    helper: {
      role: "protocol-helper", path: "/repo/external-adapter.cjs", bytes: 300,
      sha256: "c".repeat(64),
    },
    generated_program_sha256: expectedProgram,
  };
  const identity = {
    ...identityPayload,
    identity_sha256: canonicalDigest(identityPayload),
  };
  const response = {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: "magma",
    status: "ok",
    proof: "conditional-grh",
    payload: { records: observations, runtime_identity: identity },
  };
  const processEvidence = {
    system: "magma",
    mode: "census",
    execution_epoch: "9".repeat(64),
    round: null,
    census_shard: null,
    record_labels_sha256: recordLabelsDigest(corpus.records),
    status: "ok",
    response_validation_error: null,
    response_sha256: canonicalDigest(response),
    generated_program_sha256: expectedProgram,
    launched_monotonic_nanoseconds: "1",
    ended_monotonic_nanoseconds: "11",
    launch_to_ready_nanoseconds: "5",
    process_wall_nanoseconds: "10",
    timeout_seconds: 3600,
    affinity_logical_cpus: [0],
    peak_rss_bytes: "1024",
    stderr_sha256: "d".repeat(64),
    runtime_identity: identity,
    runtime_closure_sha256: runtimeClosureDigest(identity),
  };
  const combined = combineCensus(corpus, [{
    ...response,
    payload: { records: observations },
  }]);
  const census = {
    execution: {
      scheduler: "dynamic-next-shard-on-idle-cpu-list-v1",
      direct_cpus: [0],
      external_cpu: 0,
      direct_partitions: DIRECT_CENSUS_PARTITIONS,
      max_live_direct_processes_per_cpu: 1,
      timing_authority: "none-census-is-non-authoritative",
      checkpointing: {
        schema: CENSUS_PARTS_SCHEMA,
        enabled: true,
        scope: "verified-sagejs-singletons-only",
        parts_dir: "/tmp/frontier-parts",
        reused: 0,
        published: 0,
        not_published: 0,
        disabled: 0,
      },
    },
    records: combined.records,
    summary: { ...combined.summary, processes: [processEvidence] },
  };
  assert.equal(validateCensusProcessTopology(census, corpus, [tool]).get("magma"),
    runtimeClosureDigest(identity));

  const forged = structuredClone(census);
  const forgedDigest = "e".repeat(64);
  forged.summary.processes[0].generated_program_sha256 = forgedDigest;
  const forgedIdentityPayload = {
    ...forged.summary.processes[0].runtime_identity,
    generated_program_sha256: forgedDigest,
  };
  delete forgedIdentityPayload.identity_sha256;
  const forgedIdentity = {
    ...forgedIdentityPayload,
    identity_sha256: canonicalDigest(forgedIdentityPayload),
  };
  forged.summary.processes[0].runtime_identity = forgedIdentity;
  forged.summary.processes[0].runtime_closure_sha256 = runtimeClosureDigest(forgedIdentity);
  forged.summary.processes[0].response_sha256 = canonicalDigest({
    ...response,
    payload: { records: observations, runtime_identity: forgedIdentity },
  });
  assert.throws(() => validateCensusProcessTopology(forged, corpus, [tool]),
    /does not match independent regeneration/);
});

test("Sage sources classify and replay outside timing and use contiguous roots", () => {
  const corpus = corpusFixture();
  const census = sageCensusSource(corpus.records.slice(0, 1));
  assert.doesNotMatch(census, /from sage\.all import/);
  assert.match(census, /class_number\(proof=False\)/);
  assert.match(census, /receipt\.matches\(field\)/);
  assert.match(census, /receipt\.verify_conditional_grh\(field\)/);
  assert.match(
    census,
    /ordinary-object-exact-replay-bypassing-closed-cubic-authority/,
  );
  assert.match(census, /native-decline-fallback-pass/);

  const warmup = sageWarmupSource(corpus.records);
  assert.ok(warmup.includes(WARMUP_MARKER));
  assert.match(warmup, /class_number\(proof=False\)/);
  assert.match(warmup, /receipt\.matches\(field\)/);
  assert.match(warmup, /receipt\.verify_conditional_grh\(field\)/);
  assert.match(warmup, /receipt\.to_dict\(\)/);
  assert.match(warmup, /warmup class-group disagreement/);
  assert.doesNotMatch(warmup, /"receipt": receipt_payload/);

  const timing = sageTimingSource(corpus, ["scalar-prepared", "fresh-complete"], 0, 17n);
  assert.doesNotMatch(timing, /from sage\.all import/);
  assert.match(timing, /field\.maximal_order\(\)/);
  assert.match(timing, /root_started = time\.perf_counter_ns\(\)/);
  assert.match(timing, /root_ns = time\.perf_counter_ns\(\) - root_started/);
  assert.match(timing, /class_number\(proof=False\)/);
  assert.match(timing, /calibration_ns/);
  assert.match(timing, /if root_ns >= minimum_ns:/);
  assert.match(timing, /retained repetition safety limit exceeded/);
  assert.doesNotMatch(timing, /root_ns\s*=\s*sum/);
});

test("full-survey warmup is a two-pass, content-bound runtime fixed point", () => {
  const corpus = corpusFixture();
  const observations = corpus.records.map((record) => ({
    label: record.label,
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
  }));
  const response = {
    schema: WARMUP_SCHEMA,
    record_count: 1000,
    native_pass_count: 1000,
    observations_sha256: sha256(JSON.stringify(JSON.parse(canonicalJson(observations)))),
  };
  assert.equal(validateWarmupResponse(response, corpus.records), response);
  assert.throws(() => validateWarmupResponse({ ...response, extra: true }, corpus.records),
    /disagrees/);
  assert.throws(() => validateWarmupResponse({
    ...response, observations_sha256: "0".repeat(64),
  }, corpus.records), /disagrees/);

  let spawnCount = 0;
  let closureCount = 0;
  const closure = { schema: "unit-runtime", sha256: "a".repeat(64), files: 3 };
  const partitions = shardRecords(corpus);
  const expectedWarmupPrograms = partitions.map(sageWarmupSource);
  const partitionResponses = partitions.map((partition) => {
    const partitionObservations = partition.map((record) => ({
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
        sha256(JSON.stringify(JSON.parse(canonicalJson(partitionObservations)))),
    };
  });
  const warmup = warmCandidateDirectEnvironment(corpus, "/candidate", {
    candidateDirectEnvironmentIdentity: () => ({
      node_executable: { path: "/node" }, environment: { UNIT: "1" },
    }),
    candidateRuntimeClosure: () => {
      closureCount += 1;
      return structuredClone(closure);
    },
    sageWarmupSource,
    spawnSync: (executable, args, options) => {
      const shard = spawnCount % partitions.length;
      spawnCount += 1;
      assert.equal(executable, "/node");
      assert.deepEqual(args, [path.resolve("/candidate/bin/sagejs"), "--python", "-"]);
      assert.equal(options.input, expectedWarmupPrograms[shard]);
      return {
        error: null,
        status: 0,
        signal: null,
        stderr: "",
        stdout: `${WARMUP_MARKER}${JSON.stringify(partitionResponses[shard])}\n`,
      };
    },
  });
  assert.equal(spawnCount, 40);
  assert.equal(closureCount, 2);
  assert.deepEqual(warmup.candidate_runtime_closure, closure);
  assert.equal(warmup.attestation.schema, WARMUP_ATTESTATION_SCHEMA);
  assert.equal(warmup.attestation.pass_count, 2);
  assert.deepEqual(warmup.attestation.response_bundle_sha256_by_pass,
    [canonicalDigest(partitionResponses), canonicalDigest(partitionResponses)]);

  const source = { candidate_runtime_closure: structuredClone(closure) };
  const bound = bindWarmedRuntimeClosure(warmup, source, corpus.records);
  assert.deepEqual(bound.candidate_runtime_warmup, warmup.attestation);
  assert.equal(validateRuntimeWarmupAttestation(
    bound.candidate_runtime_warmup, closure, corpus.records,
  ), bound.candidate_runtime_warmup);
  assert.throws(() => bindWarmedRuntimeClosure(warmup, {
    candidate_runtime_closure: { ...closure, files: 4 },
  }, corpus.records), /changed after/);
  assert.equal(assertRuntimeClosureUnchanged(closure, structuredClone(closure)).sha256,
    closure.sha256);
  assert.throws(() => assertRuntimeClosureUnchanged(
    closure, { ...closure, files: 4 },
  ), /changed during/);

  let unstableClosureCall = 0;
  let unstableSpawnCount = 0;
  assert.throws(() => warmCandidateDirectEnvironment(corpus, "/candidate", {
    candidateDirectEnvironmentIdentity: () => ({
      node_executable: { path: "/node" }, environment: {},
    }),
    candidateRuntimeClosure: () => ({
      ...closure, files: ++unstableClosureCall,
    }),
    sageWarmupSource,
    spawnSync: () => {
      const ordinal = unstableSpawnCount++ % partitions.length;
      return {
        error: null, status: 0, signal: null, stderr: "",
        stdout: `${WARMUP_MARKER}${JSON.stringify(partitionResponses[ordinal])}\n`,
      };
    },
  }), /stable runtime closure/);
});

test("eleven left rotations balance every system position", () => {
  const counts = Object.fromEntries(["sagejs", "pari", "magma", "hecke"].map((system) =>
    [system, Array(4).fill(0)]));
  for (let round = 0; round < 11; round += 1) {
    systemOrder(round).forEach((system, position) => { counts[system][position] += 1; });
  }
  for (const positions of Object.values(counts)) {
    assert.equal(Math.max(...positions) - Math.min(...positions), 1);
  }
});

test("fake executable and fake monotonic clock preserve launch/ready boundaries", async () => {
  const ticks = [10n, 30n, 80n];
  const nowNs = () => ticks.shift();
  const spawn = (executable, args) => {
    assert.equal(executable, "/fake/cas");
    assert.deepEqual(args, ["--unit"]);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.write(`${READY_MARKER}\n`);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 0, null);
    });
    return child;
  };
  const result = await runFreshProcess({
    executable: "/fake/cas", args: ["--unit"], input: "{}\n", env: {}, timeoutSeconds: 1,
  }, { spawn, nowNs });
  assert.equal(result.status, "ok");
  assert.equal(result.ready - result.launched, 20n);
  assert.equal(result.ended - result.launched, 70n);
});

test("adapter responses and retained events fail closed", () => {
  const response = {
    schema: ADAPTER_SCHEMA,
    mode: "census",
    system: "sagejs",
    status: "ok",
    proof: "conditional-grh",
    payload: { records: [] },
  };
  assert.equal(validateAdapterResponse(response, { mode: "census", system: "sagejs" }), response);
  assert.throws(() => validateAdapterResponse({ ...response, proof: "unconditional" }, {
    mode: "census", system: "sagejs",
  }), /does not match/);

  const corpus = corpusFixture();
  const records = corpus.records.filter((record) => record.selection.shard === 0);
  const raw = {
    boundary: "scalar-prepared", shard: 0, iterations: 2,
    record_count: records.length,
    root_nanoseconds: MINIMUM_ROOT_NS.toString(),
    answers: records.map((record) => record.class_number),
    per_field_nanoseconds: records.map(() => "100"),
  };
  const event = makeTimingEvent(raw, "sagejs", 0, 0, corpus);
  assert.equal(event.root_source, "one-contiguous-monotonic-timer");
  assert.equal(event.phase_sum_used, false);
  assert.equal(event.digest_inside_root, false);
  assert.throws(() => makeTimingEvent({ ...raw, root_nanoseconds: "1199999999" },
    "sagejs", 0, 0, corpus), /at least 1.2 seconds/);
  const wrong = [...raw.answers];
  wrong[0] = "999";
  assert.throws(() => makeTimingEvent({ ...raw, answers: wrong }, "sagejs", 0, 0, corpus),
    /disagrees/);

  const expectedRecords = corpus.records.map((record) => ({
    label: record.label,
    status: "ok",
    discriminant: record.discriminant,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
  }));
  assert.throws(() => combineCensus(corpus, [{
    ...response,
    payload: { records: [...expectedRecords.slice(0, -1), expectedRecords[0]] },
  }]), /duplicate, or foreign/);
  const timedOut = combineCensus(corpus, [{ ...response, status: "timeout", payload: null }]);
  assert.equal(timedOut.records[0].status, "timeout");
  assert.equal(timedOut.summary.coverage_complete, false);
});

test("external runtime identities are content-bound and system-bound", () => {
  const payload = {
    schema: "sagejs.benchmark/complex-cubic-frontier-runtime-identity-v1",
    system: "magma",
    version: "Magma V2.18-5",
    executable: "/opt/magma/bin/magma",
    proof_setting: 'ClassGroup(order : Proof := "GRH")',
    proof_semantics: "conditional factor-base theorem and exact relation arithmetic",
    environment: { MAGMA_LIBRARIES: "" },
    artifacts: [{
      role: "magma-runtime", path: "/opt/magma/magma.exe", bytes: 100,
      sha256: "a".repeat(64),
    }],
    adapter: {
      role: "protocol-adapter", path: "/repo/magma-adapter.cjs", bytes: 200,
      sha256: "b".repeat(64),
    },
    helper: {
      role: "protocol-helper", path: "/repo/external-adapter.cjs", bytes: 300,
      sha256: "c".repeat(64),
    },
    generated_program_sha256: "d".repeat(64),
  };
  const identity = { ...payload, identity_sha256: canonicalDigest(payload) };
  assert.equal(validateRuntimeIdentity(identity, "magma", "d".repeat(64)), identity);
  assert.throws(() => validateRuntimeIdentity({ ...identity, version: "Magma V2.29-1" },
    "magma"), /stale runtime identity digest/);
  assert.throws(() => validateRuntimeIdentity(identity, "hecke"),
    /malformed runtime identity/);
  assert.throws(() => validateRuntimeIdentity(identity, "magma", "e".repeat(64)),
    /request-derived program/);

  const secondPayload = { ...payload, generated_program_sha256: "e".repeat(64) };
  const secondIdentity = {
    ...secondPayload,
    identity_sha256: canonicalDigest(secondPayload),
  };
  assert.equal(runtimeClosureDigest(identity), runtimeClosureDigest(secondIdentity));
  const changedPayload = { ...payload, version: "Magma V2.18-6" };
  const changedIdentity = {
    ...changedPayload,
    identity_sha256: canonicalDigest(changedPayload),
  };
  assert.notEqual(runtimeClosureDigest(identity), runtimeClosureDigest(changedIdentity));
});

test("timing identity binds the manifest and physical survey asset", () => {
  const corpus = corpusFixture();
  const current = corpusIdentity("/one/manifest.json", corpus);
  const relocated = corpusIdentity("/another/manifest.json", corpus);
  assert.equal(corpusIdentitiesMatch(current, relocated), true);

  for (const key of [
    "manifest_id",
    "manifest_file_sha256",
    "survey_asset_filename",
    "survey_asset_gzip_sha256",
    "survey_asset_records_sha256",
    "labels_sha256",
    "records_sha256",
    "record_count",
  ]) {
    const changed = structuredClone(current);
    changed[key] = typeof changed[key] === "number" ? changed[key] + 1 : `changed-${changed[key]}`;
    assert.equal(corpusIdentitiesMatch(changed, current), false, key);
  }
  const forgedDigest = structuredClone(current);
  forgedDigest.manifest_id = `sha256:${"8".repeat(64)}`;
  assert.equal(corpusIdentitiesMatch(forgedDigest, current), false);
});

test("timing accepts only clean matching source and current build closures", () => {
  const source = {
    clean: true,
    promotion_eligible: true,
    candidate_tree: "a".repeat(40),
    source_closure_sha256: "b".repeat(64),
    build_receipt: { current: true, sha256: "c".repeat(64) },
  };
  assert.equal(sourceIdentitiesMatchForTiming(source, structuredClone(source)), true);
  for (const mutate of [
    (value) => { value.clean = false; },
    (value) => { value.promotion_eligible = false; },
    (value) => { value.candidate_tree = "d".repeat(40); },
    (value) => { value.source_closure_sha256 = "e".repeat(64); },
    (value) => { value.build_receipt.current = false; },
    (value) => { value.build_receipt.sha256 = "f".repeat(64); },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.equal(sourceIdentitiesMatchForTiming(source, changed), false);
  }
});

test("metrics retain absolute round totals and paired shard/field summaries", () => {
  const corpus = corpusFixture();
  const census = { records: corpus.records.map((record) => ({
    label: record.label, status: "native-pass",
  })) };
  const events = [];
  for (const system of ["sagejs", "pari"]) {
    for (let shard = 0; shard < 20; shard += 1) {
      const records = corpus.records.filter((record) => record.selection.shard === shard);
      events.push(makeTimingEvent({
        boundary: "scalar-prepared", shard, iterations: 1,
        record_count: records.length,
        root_nanoseconds: system === "sagejs" ? "2400000000" : "1200000000",
        answers: records.map((record) => record.class_number),
        per_field_nanoseconds: records.map(() => system === "sagejs" ? "200" : "100"),
      }, system, 0, system === "sagejs" ? 0 : 1, corpus));
    }
  }
  const metrics = timingMetrics(events, corpus, census)["scalar-prepared"];
  assert.equal(metrics.absolute_corpus_nanoseconds_by_round.sagejs[0], 48_000_000_000);
  assert.equal(metrics.paired_shards.median, 2);
  assert(Math.abs(metrics.paired_fields_diagnostic_only.geometric_mean - 2) < 1e-12);
  assert(Math.abs(metrics.paired_shard_geometric_mean_bootstrap_95.lower - 2) < 1e-12);
  assert.equal(metrics.stratified_field_diagnostics["route:native-pass"].median, 2);
});

test("frontier selection prioritizes the smallest-discriminant native decline", () => {
  const corpus = corpusFixture();
  const sorted = [...corpus.records].sort((left, right) =>
    Number(BigInt(left.discriminant_absolute) - BigInt(right.discriminant_absolute)));
  const chosen = sorted[2];
  const census = { records: corpus.records.map((record) => ({
    label: record.label,
    status: record.label === chosen.label ? "native-decline-fallback-pass" : "native-pass",
    observations: { sagejs: {
      status: record.label === chosen.label ? "native-decline-fallback-pass" : "native-pass",
    } },
  })) };
  const candidate = selectFrontierCandidate(corpus, census, []);
  assert.equal(candidate.label, chosen.label);
  assert.equal(candidate.reason, "smallest-discriminant-native-decline");
});

test("machine schemas are valid JSON and pin the production cardinalities", () => {
  const corpusSchema = JSON.parse(fs.readFileSync(path.join(root,
    "bench/class-unit-groups/complex-cubic-frontier-corpus.schema.json")));
  const evidenceSchema = JSON.parse(fs.readFileSync(path.join(root,
    "bench/class-unit-groups/complex-cubic-frontier-evidence.schema.json")));
  assert.equal(corpusSchema.properties.schema.const,
    "sagejs.benchmark/complex-cubic-frontier-survey-view-v1");
  assert.equal(corpusSchema.properties.records.minItems, 1000);
  assert.equal(corpusSchema.properties.records.maxItems, 1000);
  assert.equal(corpusSchema.properties.warmups.minItems, 12);
  assert.equal(corpusSchema.properties.warmups.maxItems, 12);
  assert.equal(corpusSchema.properties.selection_policy.properties.shard_count.const, 20);
  assert.equal(evidenceSchema.$defs.timingEvent.properties.root_source.const,
    "one-contiguous-monotonic-timer");
  assert.equal(evidenceSchema.$defs.timingEvent.properties.phase_sum_used.const, false);
  assert.equal(evidenceSchema.$defs.timingEvent.properties.digest_inside_root.const, false);
  assert.equal(evidenceSchema.$defs.timingEvent.properties.shard.maximum, 19);
  assert.equal(evidenceSchema.$defs.timingEvent.properties.record_count.maximum, 50);
  assert.equal(evidenceSchema.$defs.censusTool.additionalProperties, false);
  assert.equal(evidenceSchema.$defs.censusProcess.additionalProperties, false);
  assert.equal(evidenceSchema.$defs.censusProcess.properties.census_shard.oneOf[0].maximum, 999);
  const execution = evidenceSchema.oneOf[0].properties.execution.properties;
  assert.equal(execution.scheduler.const, "dynamic-next-shard-on-idle-cpu-list-v1");
  assert.equal(execution.direct_partitions.properties.sagejs.properties.partition.const,
    "singleton-global-rank-v1");
  assert.equal(execution.direct_partitions.properties.sagejs.properties.fields_per_shard.const, 1);
  assert.equal(execution.direct_partitions.properties.sagejs.properties.shard_count.const, 1000);
  assert.equal(execution.direct_partitions.properties.pari.properties.partition.const,
    "timing-stratum-v1");
  assert.equal(execution.direct_partitions.properties.pari.properties.fields_per_shard.const, 50);
  assert.equal(execution.direct_partitions.properties.pari.properties.shard_count.const, 20);
  assert.equal(execution.checkpointing.properties.schema.const, CENSUS_PARTS_SCHEMA);
  for (const field of [
    "census_shard",
    "execution_epoch",
    "record_labels_sha256",
    "response_validation_error",
    "response_sha256",
    "generated_program_sha256",
    "launched_monotonic_nanoseconds",
    "ended_monotonic_nanoseconds",
    "affinity_logical_cpus",
    "runtime_identity",
    "runtime_closure_sha256",
  ]) assert.ok(evidenceSchema.$defs.censusProcess.required.includes(field), field);
  assert.deepEqual(evidenceSchema.$defs.censusSummary.required,
    ["counts", "agreement", "coverage_complete", "processes"]);
});
