#!/usr/bin/env node
"use strict";

// Native GMP regression for the row-1 index-prime branch.  Full exact
// postprocessing is checked separately in ordinary Python because it is an
// untimed publication adapter, not part of the resident native kernel.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const { makeFreshInput } = require("./check_row1_resident_generated_class_attempt.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");

async function main() {
  assert.equal(process.argv.length, 3,
    "usage: check_row1_resident_native_candidate.cjs ROW1_W0");
  const bundle = JSON.parse(fs.readFileSync(path.resolve(process.argv[2])));
  const prepared = authentication.normalizePreparedBundle(bundle);
  const authority = authentication.authenticatePreparedNf(prepared);
  const { names, input } = makeFreshInput(prepared);
  const built = await require("../../tools/native-kernel/compiler.cjs")
    .compileKernel({ sourcePath: SOURCE });
  const entry = require(built.modulePath).pari_resident_generated_class_attempt;
  assert.equal(entry.nativeAvailable, true);
  const owners = Object.fromEntries(names.map(([name, kind]) => {
    const convert = kind === "bool" ? Boolean :
      ["float", "Float64Buffer"].includes(kind) ? Number : BigInt;
    const value = input[name];
    return [name, Array.isArray(value) ? value.map(convert) : convert(value)];
  }));
  const action = entry.gmp(...names.map(([name]) => owners[name]));
  assert.equal(action, 0n);
  assert.deepEqual(owners.attempt_state, [4n, 0n, 1n, 1n]);
  assert.deepEqual(owners.prep_base_state.slice(0, 6),
    [259n, 259n, 51n, 36n, 36n, 51n]);
  assert.equal(owners.relation_state[0], 58n);
  assert.equal(owners.class_number[0], 3n);
  assert.deepEqual(owners.class_invariants.slice(0, 1), [3n]);
  assert.deepEqual(owners.accept_regulator.slice(0, 3), [
    3895441961913051012156655978319959870688113589397982850906n,
    192n,
    17n,
  ]);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row1-resident-native-candidate-check-v1",
    ok: true,
    preparedAuthoritySha256: authority.sha256,
    action: String(action),
    relations: String(owners.relation_state[0]),
    classNumber: String(owners.class_number[0]),
    invariants: owners.class_invariants.slice(0, 1).map(String),
    oneNativeCall: true,
    retainedW0RuntimeInput: false,
    qualifiedTiming: false,
    neutralResultPublished: false,
    addonPath: built.addonPath,
  })}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
