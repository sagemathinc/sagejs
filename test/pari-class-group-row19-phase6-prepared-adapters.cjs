// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const pari = require("../bench/pari-class-group-port/row19_phase6_pari_prepared_adapter.cjs");
const sage = require("../bench/pari-class-group-port/row19_phase6_sage_prepared_adapter.cjs");
const fresh = require("../bench/pari-class-group-port/row19_phase6_fresh_adapter.cjs");

const projection = {
  schema: sage.PROJECTION_SCHEMA,
  field: { id: sage.FIELD_ID,
    polynomialAscending: [...sage.POLYNOMIAL_ASCENDING] },
  classGroup: { classNumber: "39366",
    invariantFactors: ["3", "3", "3", "3", "3", "3", "3", "3", "6"],
    generatorCount: "9" },
  unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2" },
  completionMode: "flag-zero-class-and-unit-result",
};

test("row 19 shares one exact neutral class-and-unit projection", () => {
  assert.deepEqual(pari.validateProjection(structuredClone(projection)), projection);
  const sourceResult = {
    schema: "sagejs.pari-class-group/row19-prepared-aggregate-result-v1",
    panelIndex: 19, fieldId: sage.FIELD_ID,
    preparedAuthoritySha256: sage.PREPARED_AUTHORITY_SHA256,
    classNumber: "39366",
    invariants: ["6", "3", "3", "3", "3", "3", "3", "3", "3"],
    terminalAcceptanceState: [2, 0, 0],
    classState: [0, 0, 9, 0, 2, 0, 0, 243, 0, 0, 9, 243],
    unitState: [0, 430, 6, 1, 352, 20, 1, 1, 192, 1],
    correspondenceComplete: true, nativeCallsInsideTimedBoundary: 1,
  };
  assert.deepEqual(sage.semanticProjection(sourceResult), projection);
  sourceResult.classNumber = "39365";
  assert.throws(() => sage.semanticProjection(sourceResult));
});

test("the pristine helper isolates the prepared bnfinit0 clock", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "row19_phase6_pari_prepared_adapter.c"), "utf8");
  assert.match(source,
    /nf = nfinit0\([\s\S]*prepared_stack = avma;[\s\S]*READY/);
  assert.match(source,
    /setrand\(gp_read_str\(seed\)\);[\s\S]*clock_gettime\(CLOCK_MONOTONIC, &begin\);\s*bnf = bnfinit0\(nf, 0, NULL, nbits2prec\(192\)\);\s*clock_gettime\(CLOCK_MONOTONIC, &end\);/);
  assert.match(source,
    /avma = prepared_stack;\s*emit_run\(nf, seed\);\s*avma = prepared_stack;/);
});

test("the PARI validator rejects changed row-19 semantics", async () => {
  const changed = structuredClone(projection);
  changed.classGroup.invariantFactors[8] = "3";
  assert.throws(() => pari.validateProjection(changed));
  await assert.rejects(() => pari.Client.prototype.run.call({}, "0"),
    /positive integer/);
});

test("the Sage adapter rejects a changed prepared owner before compilation", async () => {
  const prepared = JSON.parse(fs.readFileSync(sage.DEFAULT_INPUT, "utf8"));
  prepared.prep_polynomial[0] = String(BigInt(prepared.prep_polynomial[0]) + 1n);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row19-forged-"));
  const filename = path.join(directory, "prepared.json");
  fs.writeFileSync(filename, JSON.stringify(prepared));
  try {
    await assert.rejects(sage.prepareResident(filename),
      /prepared|authority|manifest|digest|changed|mismatch|discriminant/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("the repeated-fresh factory exposes the qualification worker protocol", async () => {
  for (const implementation of ["sagejs", "pari"]) {
    const adapter = await fresh.createRow19FreshPreparedAdapter(
      { panelIndex: 19, implementation });
    assert.equal(adapter.implementation, implementation);
    assert.equal(adapter.projectionSchema, sage.PROJECTION_SCHEMA);
    assert.equal(typeof adapter.runFresh, "function");
  }
  await assert.rejects(() => fresh.createRow19FreshPreparedAdapter(
    { panelIndex: 18, implementation: "sagejs" }));
});

test("the pair checker defaults to the authoritative v2 RNG receipt", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bench",
    "pari-class-group-port", "check_row19_phase6_qualification_pair.cjs"),
  "utf8");
  assert.match(source, /row19-phase6-unqualified-pair-check-v2-rng\.json/);
  assert.match(source, /assert\.deepEqual\(sageSample\.rng, first\.rng\)/);
  assert.match(source, /workCounters/);
});
