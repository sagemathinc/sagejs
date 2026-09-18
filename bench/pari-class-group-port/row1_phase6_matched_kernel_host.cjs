"use strict";

// Field-configurable resident host used by row 1 and row 4.  Prepared-input
// authentication, compilation, native-buffer allocation and result inspection
// are deliberately separate from runInvocation's one native mathematical call.

const assert = require("node:assert/strict");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const auth = require("./prepared_nf_authentication.cjs");
const row1Input = require("./check_row1_resident_generated_class_attempt.cjs");
const row4Input = require("./row4_fresh_prepared_input.cjs");

const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");
const CONFIG = Object.freeze({
  1: Object.freeze({ authority:
    "fbfe6fd1c4f0e045410e0efb6834c66b5cfdf30f43a81e8b33271fd57c6c8d54",
    fieldId:
    "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f",
    polynomialAscending: ["20018", "-20010", "0", "1"], classNumber: "3",
    invariantFactors: ["3"], relations: "58", factorBaseSize: "51",
    prepBaseState: ["259", "259", "51", "36", "36", "51"],
    unitStatus: "materialized", makeFreshInput: row1Input.makeFreshInput }),
  4: Object.freeze({ authority:
    "9421ca79dcf494d3834d7fa1869e037a26804be210b61b2ab28a088aef862ab4",
    fieldId:
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
    polynomialAscending: ["20000000018", "-20000000010", "0", "1"],
    classNumber: "2", invariantFactors: ["2"], relations: "567",
    factorBaseSize: "560",
    prepBaseState: ["4033", "4033", "560", "360", "360", "560"],
    unitStatus: "not_given(LARGE)", makeFreshInput: row4Input.makeFreshInput }),
});

const values = owner => owner.toArray ? owner.toArray() : Array.from(owner);

function allocate(fn, names, input) {
  return Object.fromEntries(names.map(([name, kind]) => {
    const raw = input[name];
    assert.notEqual(raw, undefined, `missing root input ${name}`);
    if (!kind.endsWith("Buffer")) {
      return [name, kind === "bool" ? Boolean(raw) :
        kind === "float" ? Number(raw) : BigInt(raw)];
    }
    if (kind === "Float64Buffer")
      return [name, fn.createFloat64Buffer(raw.map(Number))];
    if (kind === "Int64Buffer")
      return [name, fn.createInt64Buffer(raw.map(BigInt))];
    const integers = raw.map(BigInt);
    const inputWords = integers.reduce((maximum, value) => {
      const absolute = value < 0n ? -value : value;
      return Math.max(maximum,
        Math.ceil(Math.max(1, absolute.toString(2).length) / 64) + 2);
    }, 1);
    return [name, fn.createIntegerBuffer(raw.length,
      Math.max(16, inputWords), integers)];
  }));
}

async function prepareResident(row, prepared) {
  const config = CONFIG[row]; assert(config, `unsupported resident row ${row}`);
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, config.authority,
    `row ${row} prepared authority changed`);
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_resident_generated_class_attempt;
  assert.equal(fn.nativeAvailable, true);
  return Object.freeze({ row, config, prepared: structuredClone(prepared),
    preparedAuthoritySha256: authority.sha256, built, fn });
}

function prepareInvocation(resident) {
  const generated = resident.config.makeFreshInput(resident.prepared);
  const names = generated.names;
  const input = generated.input || generated;
  assert(Array.isArray(names), "fresh input lacks the native ABI");
  return { names, owners: allocate(resident.fn, names, input) };
}

function projection(resident, invocation) {
  const owner = name => values(invocation.owners[name]).map(String);
  assert.deepEqual(owner("attempt_state").slice(0, 4), ["4", "0", "1", "1"]);
  assert.deepEqual(owner("prep_base_state").slice(0, 6),
    resident.config.prepBaseState);
  assert.equal(owner("relation_state")[0], resident.config.relations);
  assert.equal(owner("class_number")[0], resident.config.classNumber);
  assert.deepEqual(owner("class_invariants").slice(
    0, resident.config.invariantFactors.length), resident.config.invariantFactors);
  assert(owner("accept_regulator").slice(0, 3).some(value => value !== "0"));
  return {
    schema: `sagejs.pari-class-group/row${resident.row}-phase6-common-projection-v1`,
    field: { id: resident.config.fieldId,
      polynomialAscending: resident.config.polynomialAscending },
    classGroup: { classNumber: resident.config.classNumber,
      invariantFactors: resident.config.invariantFactors },
    unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2" },
    work: { degree: "3", logRows: "3", logColumns: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

function runInvocation(resident, invocation) {
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...invocation.names.map(([name]) =>
    invocation.owners[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n, `row ${resident.row} native root failed`);
  return Object.freeze({
    schema: `sagejs.pari-class-group/row${resident.row}-phase6-sage-sample-v1`,
    kernelNanoseconds: String(stopped - started),
    projection: projection(resident, invocation),
    executionBoundary: Object.freeze({ residentProcess: true,
      compilationInsideClock: false, preparedAuthenticationInsideClock: false,
      bufferAllocationInsideClock: false, subprocessesInsideClock: false,
      filesystemInsideClock: false, replayInsideClock: false,
      publicationInsideClock: false, nativeCallsInsideClock: 1 }),
  });
}

module.exports = { CONFIG, SOURCE, prepareInvocation, prepareResident,
  projection, runInvocation };
