#!/usr/bin/env node
"use strict";

// This is an assertion-only dependency check.  It proves that the former
// row-1 index-divisor obstruction is computable from authenticated prepared
// data and remains connected to the field-neutral resident dispatch.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const authentication = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const EXPECTED_W0_SHA256 =
  "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";
const EXPECTED_PREPARED_AUTHORITY =
  "fbfe6fd1c4f0e045410e0efb6834c66b5cfdf30f43a81e8b33271fd57c6c8d54";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function integer(value, label) {
  assert(value && value.kind === "integer", `${label} is not an integer`);
  assert.match(value.value, /^-?(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  return value.value;
}

function vector(value, label) {
  assert(value && Array.isArray(value.values), `${label} is not a vector`);
  return value.values;
}

function retainedPrimeThree(bundle) {
  const factor = bundle.events.find(event => event.event === "factor_base");
  assert(factor, "row 1 has no retained factor-base oracle");
  const descriptors = vector(factor.LP, "factor_base.LP");
  const descriptor = descriptors.map((entry, index) => {
    const values = vector(entry, `LP[${index}]`);
    return {
      p: integer(values[0], "descriptor prime"),
      u: vector(values[1], "descriptor generator").map((x, i) => integer(x, `u[${i}]`)),
      e: integer(values[2], "descriptor e"),
      f: integer(values[3], "descriptor f"),
      tau: vector(values[4], "descriptor tau").flatMap((column, j) =>
        vector(column, `tau[${j}]`).map((x, i) => integer(x, `tau[${j}][${i}]`))),
    };
  }).find(entry => entry.p === "3");
  assert(descriptor, "row 1 factor base has no prime above 3");
  return descriptor;
}

function preparedIndexPrime(prepared) {
  const program = String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin)
small=importlib.import_module("bench.pari-class-group-port.get_fs_small")
index=importlib.import_module("bench.pari-class-group-port.prepared_index_prime")
degree=[91,92,93]; exponent=[81,82,83]; grouped=[71,72,73]; counts=[61,62,63]
state=[51,52,53]; workspace=[41]*393
status=small.pari_get_fs_small(
    list(map(int,d["prep_polynomial"])),3,3,3,workspace,degree,exponent,grouped,counts,state)
assert status == -3 and state == [-3,0,0]
assert degree == [91,92,93] and exponent == [81,82,83]
assert grouped == [71,72,73] and counts == [61,62,63]
w=[0]*12000; descriptors=[0]*45; ranks=[0]*3; descriptor_state=[0]*4
number=index.pari_prepared_index_prime_descriptors(
    list(map(int,d["basis_table"])),3,3,3,
    list(map(int,d["admission_matrix_m"])),
    list(map(int,d["admission_matrix_p"])),
    list(map(int,d["admission_matrix_e"])),
    w,descriptors,ranks,descriptor_state)
print(json.dumps({"frontierStatus":status,"count":number,
                  "descriptor":descriptors[:15],"ranks":ranks[:number],
                  "state":descriptor_state},separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT,
    input: JSON.stringify(prepared),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function sourceFrontier() {
  const resident = fs.readFileSync(path.join(__dirname,
    "resident_generated_class_attempt.py"), "utf8");
  const row6 = fs.readFileSync(path.join(__dirname,
    "row6_prepared_factor_base_root.py"), "utf8");
  const composer = fs.readFileSync(path.join(__dirname,
    "panel1_c7_result_composer.cjs"), "utf8");
  assert.match(resident, /from \.resident_cubic_catalog import \(/);
  assert.match(resident, /pari_resident_cubic_degree_catalog/);
  assert.match(resident, /pari_resident_cubic_descriptor_catalog/);
  assert.match(row6, /pari_row6_prime_degree_catalog/);
  assert.match(row6, /pattern_degrees\[index_pattern_position\] = degree/);
  assert.match(row6, /pattern_degrees\[index_pattern_position\] = 1/);
  assert.match(row6, /polynomial\[0\] != 2000000000018/);
  assert.match(composer, /function validateW0\(/);
  return {
    currentResidentDispatch: "field-neutral cubic ordinary/index-prime catalog",
    indexDispatchProvenance: "row6 maximal-order descriptor splice",
    nextBridge: "generalize the successful row-1 transaction beyond fixed cubic dimensions",
  };
}

function main() {
  assert.equal(process.argv.length, 3,
    "usage: check_row1_fresh_prepared_frontier.cjs ROW1_W0");
  const bytes = fs.readFileSync(path.resolve(process.argv[2]));
  assert.equal(sha256(bytes), EXPECTED_W0_SHA256, "row-1 W0 digest changed");
  const bundle = JSON.parse(bytes);
  const prepared = authentication.normalizePreparedBundle(bundle);
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, EXPECTED_PREPARED_AUTHORITY,
    "row-1 prepared authority changed");

  // The live computation sees prepared data only.  Retained W0 is consulted
  // afterwards and solely as a cold differential oracle in this checker.
  const live = preparedIndexPrime(prepared);
  assert.equal(live.count, 1);
  assert.deepEqual(live.ranks, [2]);
  assert.deepEqual(live.state, [0, 2, 1, 15]);
  const oracle = retainedPrimeThree(bundle);
  const expected = [oracle.p, oracle.e, oracle.f, ...oracle.u, ...oracle.tau];
  assert.deepEqual(live.descriptor.map(String), expected,
    "fresh maximal-order descriptor differs from retained PARI");

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row1-fresh-prepared-frontier-check-v1",
    ok: true,
    preparedAuthoritySha256: authority.sha256,
    indexPrime: 3,
    descriptor: live.descriptor.map(String),
    descriptorCount: live.count,
    formerGetFsStatus: live.frontierStatus,
    retainedW0RuntimeInput: false,
    qualifiedTiming: false,
    reserveClaim: false,
    neutralResultPublished: false,
    frontier: sourceFrontier(),
  })}\n`);
}

main();
