"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const inputApi = require("./row18_fresh_prepared_input.cjs");
const sourceApi = require("./row18_phase6_resident_source.cjs");

const GENERATED = path.join(__dirname, "row18_phase6_resident_root.generated.py");
const AUTHORITY = "2306e01429981dc6e956f10dd4c9528b157fbff76c1c137419e678a958de1dd0";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const values = owner => owner.toArray ? owner.toArray() : Array.from(owner);

function allocate(fn, abi, input) {
  return Object.fromEntries(abi.map(({ name, kind }) => {
    let raw = input[name];
    if (raw === undefined) {
      assert(kind.endsWith("Buffer"), `missing scalar ${name}`);
      const retryLengths = {
        retry_subfactor: 4, retry_packet_primes: 41,
        retry_packet_inert: 41, retry_packet_generators: 123,
        retry_admission_group_e: 41, retry_admission_group_f: 41,
        retry_admission_group_inert: 41, retry_relation_primes: 41,
        retry_ramification: 41, retry_relation: 41,
        retry_search_ideals: 41, retry_packet_ids: 41,
        retry_packet_norms: 41, retry_admission_group_tau: 369,
        retry_packet_ideals: 369, retry_initial_primes: 26,
        retry_initial_offsets: 26, retry_initial_counts: 26,
        retry_initial_complete: 26, retry_outer_minidx: 41,
        retry_outer_present: 41, retry_outer_live: 41,
        retry_outer_perm: 41, retry_outer_multiplier: 41,
        retry_outer_state: 19, retry_power_metadata: 5,
      };
      raw = Array(retryLengths[name] || 4096).fill(0);
    }
    if (!kind.endsWith("Buffer"))
      return [name, kind === "bool" ? Boolean(raw) :
        kind === "float" ? Number(raw) : BigInt(raw)];
    if (kind === "Float64Buffer")
      return [name, fn.createFloat64Buffer(raw.map(Number))];
    if (kind === "Int64Buffer")
      return [name, fn.createInt64Buffer(raw.map(BigInt))];
    const integers = raw.map(BigInt);
    const words = integers.reduce((maximum, value) => {
      const absolute = value < 0n ? -value : value;
      return Math.max(maximum,
        Math.ceil(Math.max(1, absolute.toString(2).length) / 64) + 2);
    }, 1);
    return [name, fn.createIntegerBuffer(integers.length,
      Math.max(16, words), integers)];
  }));
}

async function prepareResident(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, AUTHORITY, "row 18 prepared authority changed");
  const emitted = sourceApi.emitSource();
  fs.writeFileSync(GENERATED, emitted.source, { flag: "wx" });
  let built;
  try { built = await compileKernel({ sourcePath: GENERATED }); }
  finally { fs.rmSync(GENERATED, { force: true }); }
  const fn = require(built.modulePath).pari_row18_phase6_resident_root;
  assert.equal(fn.nativeAvailable, true);
  return Object.freeze({ abi: emitted.abi, built, fn,
    prepared: structuredClone(prepared),
    preparedAuthoritySha256: authority.sha256,
    sourceSha256: sha(emitted.source) });
}

function prepareInvocation(resident) {
  const generated = inputApi.makeFreshInput(resident.prepared);
  return { owners: allocate(resident.fn, resident.abi, generated.input) };
}

function projection(invocation) {
  const owner = name => values(invocation.owners[name]).map(String);
  assert.deepEqual(owner("driver_state").slice(0, 6),
    ["4", "0", "1", "49", "1", "1"]);
  assert.equal(owner("relation_state")[0], "49");
  assert.equal(owner("class_number")[0], "18");
  assert.deepEqual(owner("class_invariants").slice(0, 1), ["18"]);
  assert(owner("accept_regulator").slice(0, 3).some(value => value !== "0"));
  return Object.freeze({
    schema: "sagejs.pari-class-group/row18-phase6-common-projection-v1",
    field: { id: "3.1.1005907102200.3",
      polynomialAscending: ["-7353960", "177570", "0", "1"] },
    classGroup: { classNumber: "18", invariantFactors: ["18"] },
    unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2" },
    work: { degree: "3", factorBaseSize: "41", relationCount: "49",
      kernelRank: "8" },
    completionMode: "initial-reject-then-connected-retry",
  });
}

function runInvocation(resident, invocation) {
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.abi.map(({ name }) =>
    invocation.owners[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n, "row 18 aggregate resident root failed");
  return Object.freeze({
    schema: "sagejs.pari-class-group/row18-phase6-sage-sample-v1",
    kernelNanoseconds: String(stopped - started),
    projection: projection(invocation),
    executionBoundary: Object.freeze({ residentProcess: true,
      compilationInsideClock: false, preparedAuthenticationInsideClock: false,
      bufferAllocationInsideClock: false, subprocessesInsideClock: false,
      filesystemInsideClock: false, replayInsideClock: false,
      publicationInsideClock: false, nativeCallsInsideClock: 1 }),
  });
}

module.exports = { AUTHORITY, GENERATED, prepareInvocation, prepareResident,
  projection, runInvocation };
