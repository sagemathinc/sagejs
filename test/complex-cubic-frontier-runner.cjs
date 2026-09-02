// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { PassThrough, Writable } = require("node:stream");
const test = require("node:test");

const {
  ADAPTER_SCHEMA,
  canonicalDigest,
  validateAdapterResponse,
  validateCorpus,
} = require("../bench/class-unit-groups/complex-cubic-frontier-schema.cjs");
const {
  projectSurvey,
} = require("../bench/class-unit-groups/load-complex-cubic-frontier-survey.cjs");
const frozen = require("../bench/optimization-engine/complex-cubic-frontier-corpus.cjs");
const {
  MINIMUM_ROOT_NS,
  READY_MARKER,
  combineCensus,
  corpusIdentitiesMatch,
  corpusIdentity,
  makeTimingEvent,
  pariCensusSource,
  pariTimingSource,
  runFreshProcess,
  sageCensusSource,
  sageTimingSource,
  systemOrder,
  selectFrontierCandidate,
  timingMetrics,
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

test("Sage sources classify and replay outside timing and use contiguous roots", () => {
  const corpus = corpusFixture();
  const census = sageCensusSource(corpus.records.slice(0, 1));
  assert.doesNotMatch(census, /from sage\.all import/);
  assert.match(census, /class_number\(proof=False\)/);
  assert.match(census, /receipt\.matches\(field\)/);
  assert.match(census, /receipt\.verify\(field\)/);
  assert.match(census, /native-decline-fallback-pass/);

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
});
