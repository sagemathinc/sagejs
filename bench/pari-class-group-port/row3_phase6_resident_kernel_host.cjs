"use strict";

// One prepared invocation of the generic translated class-and-unit graph.
// Authentication, compilation, allocation, reset and inspection are outside
// the mathematical clock.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const inputApi = require("./row3_phase6_resident_input.cjs");

const AUTHORITY = "8dd27ea0c2f070e34964db79efcc03fa60e869891c996aba9f51b0291a97f41f";
const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-03-19f1cf52c8f4b9f9574d332bff0ee5c01252c868fc83ff51cc729bcf88034bcd.json";

function view(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }
function wordCapacity(values) {
  let result = 16;
  for (const raw of values) {
    const value = BigInt(raw), magnitude = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, magnitude.toString(2).length) / 64) + 2);
  }
  return result;
}

async function prepareResident(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, AUTHORITY,
    "prepared input is outside the reviewed row-3 corridor");
  const names = inputApi.signature();
  const capacities = inputApi.lengths();
  const built = await compileKernel({ sourcePath: inputApi.SOURCE });
  const fn = require(built.modulePath).pari_resident_generated_class_attempt;
  assert.equal(fn.nativeAvailable, true);
  const owners = {}, reset = [];
  const compact = new Set(["relation_records", "relation_hashes",
    "relation_metadata", "relation", "relation_scratch", "hnf_cup_arena",
    "hnf_cup_frames"]);
  const wide = new Set(["admission_group_tau", "packet_ideals",
    "prep_kummer_factorwork", "prep_kummer_factor",
    "prep_kummer_minpoly_diagnostic", "prep_kummer_polywork",
    "prep_kummer_rational", "prep_kummer_resultant_work",
    "prep_kummer_resultant_trace", "prep_kummer_tau_output",
    "prep_kummer_descriptor_state", "prep_kummer_unsorted",
    "prep_kummer_generators", "prep_kummer_sort_diagnostic",
    "prep_kummer_decomposition_output", "prep_kummer_catalog_generators",
    "prep_kummer_catalog_tau"]);
  const veryWide = new Set(["prep_base_state"]);
  const args = names.map(([name, kind]) => {
    let raw = prepared[name];
    if (name === "accept_inverse_hr") raw = [-991, -992, -993];
    if (name === "analytic_log_discriminant") raw = [-999];
    const initialized = raw !== undefined;
    if (!initialized) {
      assert(kind.endsWith("Buffer"), `unclassified scalar ${name}`);
      assert(Number.isInteger(capacities[name]) && capacities[name] >= 0,
        `unclassified owner capacity ${name}`);
    }
    const length = initialized ? raw.length : capacities[name];
    let value;
    if (kind === "IntegerBuffer") {
      value = fn.createIntegerBuffer(length, initialized ? wordCapacity(raw) :
        veryWide.has(name) ? 256 : wide.has(name) ? 32 :
          compact.has(name) ? 4 : 16,
        initialized ? raw.map(BigInt) : undefined);
      if (initialized) {
        const sizes = value.sizes.slice(), limbs = value.limbs.slice();
        reset.push(() => { value.sizes.set(sizes); value.limbs.set(limbs); });
      } else reset.push(() => { value.sizes.fill(0); value.limbs.fill(0n); });
    } else if (kind === "Int64Buffer") {
      value = fn.createInt64Buffer(initialized ? raw.map(BigInt) : length);
      if (initialized) {
        const copy = value.slice(); reset.push(() => value.set(copy));
      } else reset.push(() => value.fill(0n));
    } else if (kind === "Float64Buffer") {
      value = fn.createFloat64Buffer(initialized ? raw.map(Number) : length);
      if (initialized) {
        const copy = value.slice(); reset.push(() => value.set(copy));
      } else reset.push(() => value.fill(0));
    } else if (kind === "int") value = BigInt(raw);
    else if (kind === "float") value = Number(raw);
    else if (kind === "bool") value = Boolean(raw);
    else throw new Error(`unsupported native kind ${kind}`);
    owners[name] = value;
    return value;
  });
  return { args, authority, built, fn, owners, reset };
}

function semanticProjection(resident) {
  const owner = name => view(resident.owners[name]).map(String);
  assert.deepEqual(owner("attempt_state").slice(0, 4), ["4", "0", "1", "1"]);
  assert.deepEqual(owner("prep_base_state").slice(0, 6),
    ["5301", "5301", "668", "446", "446", "668"]);
  assert.equal(owner("relation_state")[0], "675");
  assert.equal(owner("class_number")[0], "6");
  assert.deepEqual(owner("class_invariants").slice(0, 1), ["6"]);
  assert(owner("accept_regulator").slice(0, 3).some(value => value !== "0"));
  return {
    schema: "sagejs.pari-class-group/row3-phase6-class-candidate-projection-v1",
    field: { id:
      "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
    polynomialAscending: ["20000000042", "-20000000022", "0", "1"] },
    classGroup: { classNumber: "6", invariantFactors: ["6"] },
    regulator: { rank: "2", present: true },
    work: { degree: "3", logRows: "3", logColumns: "2" },
    completionMode: "initial-class-candidate-and-regulator",
  };
}

function runInvocation(resident) {
  const resetStarted = process.hrtime.bigint();
  resident.reset.forEach(reset => reset());
  const resetNanoseconds = String(process.hrtime.bigint() - resetStarted);
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.args);
  const kernelNanoseconds = String(process.hrtime.bigint() - started);
  assert.equal(status, 0n, "row-3 resident root failed");
  return {
    schema: "sagejs.pari-class-group/row3-phase6-sage-sample-v1",
    kernelNanoseconds, resetNanoseconds,
    projection: semanticProjection(resident),
    executionBoundary: { residentProcess: true,
      compilationInsideClock: false, preparedAuthenticationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
      filesystemInsideClock: false, subprocessesInsideClock: false,
      replayInsideClock: false, publicationInsideClock: false,
      nativeCallsInsideClock: 1 },
  };
}

module.exports = { AUTHORITY, DEFAULT_INPUT, prepareResident, runInvocation,
  semanticProjection };
