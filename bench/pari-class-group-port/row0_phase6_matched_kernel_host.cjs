"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const auth = require("./prepared_nf_authentication.cjs");
const preparedInput = require("./row0_fresh_prepared_input.cjs");
const unified = require("./h1_unified_complete_adapter.cjs");

const SOURCE = path.join(__dirname, "pari_unified_complete_h1_root.py");
const AUTHORITY =
  "e02411d4b97fdf92606698198993085b352a0d79e5a66133ac61c601e43dbba9";

const values = owner => owner.toArray ? owner.toArray() : Array.from(owner);

function pristineValues(prepared, specification) {
  const fresh = preparedInput.makeFreshInput(prepared);
  assert.deepEqual(fresh.names, specification.residentNames);
  const output = {};
  const final = new Set(Object.keys(specification.sizes)
    .filter(name => name.startsWith("final_")));
  for (const [name, kind] of specification.names) {
    if (Object.hasOwn(fresh.input, name)) output[name] = structuredClone(fresh.input[name]);
    else if (name === "precision_resource_cap") output[name] = 4096;
    else {
      assert(Number.isInteger(specification.sizes[name]), `missing capacity ${name}`);
      output[name] = Array(specification.sizes[name]).fill(final.has(name) ? 777 : 0);
    }
    if (name === "final_state" || name === "precision_authority_state")
      output[name].fill(0);
  }
  return output;
}

function allocate(fn, specification, raw) {
  return Object.fromEntries(specification.names.map(([name, kind]) => {
    const value = raw[name];
    if (!kind.endsWith("Buffer")) return [name,
      kind === "bool" ? Boolean(value) : kind === "float" ? Number(value) : BigInt(value)];
    if (kind === "Float64Buffer") return [name, fn.createFloat64Buffer(value.map(Number))];
    if (kind === "Int64Buffer") return [name, fn.createInt64Buffer(value.map(BigInt))];
    // The unified root's precision/final values are the only owners with
    // thousands of bits.  Other exact owners remain in the reviewed 16-word
    // corridor; allocating is outside the mathematical clock.
    const integers = value.map(BigInt);
    const inputWords = integers.reduce((maximum, entry) => {
      const absolute = entry < 0n ? -entry : entry;
      return Math.max(maximum,
        Math.ceil(Math.max(1, absolute.toString(2).length) / 64) + 2);
    }, 1);
    const baseWords = name.startsWith("precision_") || name.startsWith("final_")
      ? 128 : 16;
    return [name, fn.createIntegerBuffer(value.length,
      Math.max(baseWords, inputWords), integers)];
  }));
}

async function prepareResident(prepared) {
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, AUTHORITY, "row-0 prepared authority changed");
  const specification = unified.rootSpecification();
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_unified_complete_h1_root;
  assert.equal(fn.nativeAvailable, true);
  return Object.freeze({ prepared: structuredClone(prepared), authority, specification,
    built, fn });
}

function prepareInvocation(resident) {
  const raw = pristineValues(resident.prepared, resident.specification);
  return { owners: allocate(resident.fn, resident.specification, raw) };
}

function projection(invocation) {
  const owner = name => values(invocation.owners[name]).map(String);
  assert.deepEqual(owner("final_state").slice(0, 16), [
    "0", "0", "0", "0", "0", "0", "73", "8", "1", "0", "2", "2",
    "0", "811", "1", "0",
  ]);
  assert.deepEqual(owner("final_exact_norms").slice(0, 2), ["-1", "-1"]);
  assert.deepEqual(owner("final_torsion_order"), ["2"]);
  assert.deepEqual(owner("final_torsion_generator"), ["-1", "0", "0"]);
  assert(owner("final_regulator").some(value => value !== "0"));
  return {
    schema: "sagejs.pari-class-group/row0-phase6-common-projection-v1",
    field: { id: "pari-2.17.4:x^3-20018*x+20034",
      polynomialAscending: ["20034", "-20018", "0", "1"] },
    classGroup: { classNumber: "1", invariantFactors: [] },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    work: { degree: "3", logRows: "3", logColumns: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

function runInvocation(resident, invocation) {
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.specification.names.map(([name]) =>
    invocation.owners[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n, "row-0 unified native root failed");
  return Object.freeze({
    schema: "sagejs.pari-class-group/row0-phase6-sage-sample-v1",
    kernelNanoseconds: String(stopped - started), projection: projection(invocation),
    executionBoundary: Object.freeze({ residentProcess: true,
      compilationInsideClock: false, preparedAuthenticationInsideClock: false,
      bufferAllocationInsideClock: false, subprocessesInsideClock: false,
      filesystemInsideClock: false, replayInsideClock: false,
      publicationInsideClock: false, nativeCallsInsideClock: 1 }),
  });
}

module.exports = { AUTHORITY, SOURCE, prepareInvocation, prepareResident,
  projection, runInvocation };
