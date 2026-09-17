#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");

const inputPath = process.argv[2];
assert(inputPath, "usage: check_prepared_nf_authentication.cjs INPUTS.json");
const envelope = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const original = envelope.input;
const authority = authenticatePreparedNf(original);
const mutations = [];

function reject(name, mutate, pattern) {
  const changed = structuredClone(original);
  mutate(changed);
  assert.throws(() => authenticatePreparedNf(changed), pattern, `${name} was accepted`);
  mutations.push(name);
}

reject("signature", value => { value.admission_real_count = "1"; }, /signature disagrees/);
reject("reducible polynomial", value => {
  value.prep_polynomial = ["0", "-1", "0", "1"];
}, /rational root zero/);
reject("runtime precision policy", value => { value.precision = "256"; }, /precision is not/);
reject("discriminant", value => { value.analytic_discriminant = "32075641032117"; },
  /discriminant disagrees/);
reject("index", value => { value.prep_index = "2"; }, /index does not explain/);
reject("basis", value => { value.prep_zk[6] = String(BigInt(value.prep_zk[6]) + 1n); },
  /basis inverse/);
reject("inverse", value => { value.prep_invzk[6] = String(BigInt(value.prep_invzk[6]) + 1n); },
  /basis inverse/);
reject("basis degree", value => { value.prep_zk_degrees[2] = "1"; }, /is false/);
reject("multiplication tensor", value => {
  value.basis_table[26] = String(BigInt(value.basis_table[26]) + 1n);
}, /multiplication tensor is false/);
reject("embedding alias", value => {
  value.preparation_embedding[4] = String(BigInt(value.preparation_embedding[4]) + 1n);
}, /does not alias/);
reject("embedding homomorphism", value => {
  const index = 1;
  const perturbation = 1n << 240n;
  value.admission_matrix_m[index] = String(BigInt(value.admission_matrix_m[index]) + perturbation);
  value.preparation_embedding[3 * index] = value.admission_matrix_m[index];
}, /violates product/);
reject("rounded embedding", value => {
  value.preparation_rounded_embedding[8] = String(BigInt(value.preparation_rounded_embedding[8]) + 1n);
}, /rounded embedding entry/);
reject("admission prime table", value => {
  [value.admission_primes[100], value.admission_primes[101]] =
    [value.admission_primes[101], value.admission_primes[100]];
}, /prime table is not exhaustive/);
reject("admission product table", value => {
  value.admission_products[0] = String(BigInt(value.admission_products[0]) + 2n);
}, /product table is not PARI/);
reject("analytic prime table", value => { value.analytic_primes.pop(); }, /wrong length/);

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/prepared-nf-authentication-check-v1",
  inputPath: path.resolve(inputPath),
  authority,
  mutationCount: mutations.length,
  rejectedMutations: mutations,
}, null, 2));
