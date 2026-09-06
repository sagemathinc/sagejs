// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const common = require("../bench/class-unit-groups/complex-cubic-frontier-external-adapter.cjs");
const hecke = require("../bench/class-unit-groups/complex-cubic-frontier-hecke-adapter.cjs");
const magma = require("../bench/class-unit-groups/complex-cubic-frontier-magma-adapter.cjs");

function record(shard, index) {
  return {
    label: `3.1.${1000 + 50 * shard + index}.1`,
    coefficients: ["-1", "-1", "0", "1"],
  };
}

function request(system, mode = "census") {
  return {
    schema: "sagejs.benchmark/complex-cubic-frontier-adapter-request-v1",
    mode,
    system,
    proof: "conditional-grh",
    proof_setting: system === "magma"
      ? 'Proof := "GRH"'
      : "class_group(...; GRH=true)",
    boundaries: mode === "timing" ? ["scalar-prepared", "fresh-complete"] : [],
    round: mode === "timing" ? 3 : null,
    minimum_retained_root_nanoseconds: "1200000000",
    warmups: [record(0, 0)],
    shards: Array.from({ length: 20 }, (_, shard) =>
      Array.from({ length: 50 }, (_, index) => record(shard, index))),
  };
}

test("competitor requests pin the class-only conditional-GRH semantics", () => {
  assert.equal(common.validateRequest(request("magma"), "magma").proof,
    "conditional-grh");
  assert.equal(common.validateRequest(request("hecke"), "hecke").proof,
    "conditional-grh");

  const wrongMagma = request("magma");
  wrongMagma.proof_setting = 'Proof := "Full"';
  assert.throws(() => common.validateRequest(wrongMagma, "magma"), /not pinned/);

  const wrongHecke = request("hecke");
  wrongHecke.proof_setting = "class_group(...; GRH=false)";
  assert.throws(() => common.validateRequest(wrongHecke, "hecke"), /not pinned/);

  const shortRoot = request("magma", "timing");
  shortRoot.minimum_retained_root_nanoseconds = "1199999999";
  assert.throws(() => common.validateRequest(shortRoot, "magma"), /1.2 seconds/);
});

test("Magma source is version-pinned, class-only, and root-timed", () => {
  const census = magma.censusSource(request("magma"));
  const timing = magma.timingSource(request("magma", "timing"));
  assert.match(census, /major ne 2 or minor ne 18 or patch ne 5/);
  assert.match(census, /ClassGroup\(order : Proof := "GRH"\)/);
  assert.doesNotMatch(census, /\b(?:UnitGroup|Regulator|SetClassGroupBounds|Current)\b/);
  assert.match(timing,
    /root_started := Realtime\(\);[\s\S]*root_nanoseconds := Integers\(\)!Round\(\(Realtime\(\) - root_started\)/);
  assert.match(timing, /if boundary eq "scalar-prepared" then[\s\S]*root_started := Realtime\(\)/);
  assert.match(timing, /until root_ns ge minimum_root_ns/);
});

test("Hecke source is version-pinned, class-only, and root-timed", () => {
  const census = hecke.censusSource(request("hecke"));
  const timing = hecke.timingSource(request("hecke", "timing"));
  assert.match(census, /VERSION == v"1\.12\.7"/);
  assert.match(census, /pkgversion\(Hecke\) == v"0\.40\.0"/);
  assert.match(census, /class_group\(order_value; GRH=true, redo=true\)/);
  assert.doesNotMatch(census, /\b(?:unit_group|unit_group_fac_elem|regulator)\s*\(/);
  assert.match(timing,
    /root_started = time_ns\(\)[\s\S]*root_nanoseconds = time_ns\(\) - root_started/);
  assert.match(timing, /root_ns >= SAGEJS_MINIMUM_ROOT_NS && break/);
  assert.match(timing, /Threads\.nthreads\(\) == 1/);
});

test("census marker parser validates all answers and invariant products", () => {
  const value = request("magma");
  const stdout = value.shards.flat().map((field) =>
    `${magma.MARKER_PREFIX}CENSUS|${field.label}|-23|2|[2]`).join("\n");
  const records = common.parseCensus(stdout, magma.MARKER_PREFIX, value);
  assert.equal(records.length, 1000);
  assert.deepEqual(records[0].class_group_invariants, ["2"]);
  assert.equal(records[0].proof_status, "exact-relations-conditional-grh");

  const bad = stdout.replace("|-23|2|[2]", "|-23|3|[2]");
  assert.throws(() => common.parseCensus(bad, magma.MARKER_PREFIX, value),
    /invariant product/);
});

test("timing marker parser enforces retained roots and complete shard coverage", () => {
  const value = request("hecke", "timing");
  const answer = Array(50).fill("2#[2]").join(";");
  const per = Array(50).fill("24000000").join(",");
  const lines = [];
  for (const boundary of value.boundaries) {
    for (let shard = 0; shard < 20; shard += 1) {
      lines.push(`${hecke.MARKER_PREFIX}TIMING|${boundary}|${shard}|1|1200000000|` +
        `${answer}|${per}|50`);
    }
  }
  const events = common.parseTiming(lines.join("\n"), hecke.MARKER_PREFIX, value);
  assert.equal(events.length, 40);
  assert.equal(events[0].answers.length, 50);
  assert.equal(events[0].root_nanoseconds, "1200000000");

  assert.throws(() => common.parseTiming(lines.slice(1).join("\n"),
    hecke.MARKER_PREFIX, value), /wrong number/);
  assert.throws(() => common.parseTiming(lines.join("\n").replace(
    "|1200000000|", "|1199999999|"), hecke.MARKER_PREFIX, value),
  /metadata is malformed/);
});
