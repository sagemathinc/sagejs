#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const coordinator = require("./row23_degree5_correspondence_coordinator.cjs");

const CLASS = process.env.ROW23_CLASS_OWNER || "/scratch/sagejs-row23-class-witness-owner/row23-cyclic-class-witness-beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50.json.gz";
const FACTOR = process.env.ROW23_FACTOR_OWNER || "/scratch/sagejs-row23-class-witness-factor-kguyOE/row23-prepared-factor-base-b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439.json.gz";
const W0 = process.env.ROW23_W0 || "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const clone = value => JSON.parse(JSON.stringify(value));

function rejected(owner, mutate, label) {
  const changed = clone(owner); mutate(changed);
  assert.throws(() => coordinator.verifyOwner(changed), undefined, label);
}

const output = fs.mkdtempSync("/scratch/sagejs-row23-degree5-correspondence-check-");
const w0 = JSON.parse(fs.readFileSync(W0, "utf8"));
const authenticated = require("./prepared_nf_authentication.cjs");
const normalized = authenticated.normalizePreparedBundle(w0.prepared);
const result = coordinator.run({ classOwnerPath: CLASS, factorOwnerPath: FACTOR,
  outputDirectory: output, prepared: normalized, w0Path: W0 });
assert.equal(result.ownerSha256, "0dae599f70d46e1de77804b8a47c277d20114f31555f1c7db68587c7b78dd68b");
assert.equal(result.postcomputeOracle.consumedAfterPublication, true);
assert.equal(result.postcomputeOracle.reducedGeneratorMatches, true);
assert.equal(coordinator.verifyOwner(result.owner), true);
rejected(result.owner, value => { value.expandedPrincipalWitness.alpha[0] = "55528"; }, "alpha mutation accepted");
rejected(result.owner, value => { value.expandedPrincipalWitness.powerIdealHnfs[5][0] = "117648"; }, "ideal power mutation accepted");
rejected(result.owner, value => { value.idealred.pseudomin[0] = "1"; }, "pseudomin mutation accepted");
rejected(result.owner, value => { value.idealred.firstLllCoefficientColumn[1] = "1"; }, "LLL mutation accepted");
rejected(result.owner, value => { value.ancestry.factorOwnerSha256 = "0".repeat(64); }, "ancestry mutation accepted");

const classOwner = coordinator.loadOwner(CLASS, coordinator.CLASS_SHA256);
const factorOwner = coordinator.loadOwner(FACTOR, coordinator.FACTOR_SHA256);
const prepared = { multiplicationTensor: normalized.basis_table.map(String),
  roundedEmbedding: normalized.preparation_rounded_embedding.map(String) };
const badClass = clone(classOwner);
badClass.compactPrincipalWitness.principalGenerators[0][0] = "15";
assert.throws(() => coordinator.compose(badClass, factorOwner, prepared, result.owner.ancestry),
  undefined, "principal-source mutation accepted");
const badFactor = clone(factorOwner);
badFactor.factorBase.descriptors[0][8] = "2";
assert.throws(() => coordinator.compose(classOwner, badFactor, prepared, result.owner.ancestry),
  undefined, "idealred-source mutation accepted");

console.log(JSON.stringify({ status: "ok", ownerSha256: result.ownerSha256,
  compressedSha256: result.compressedSha256, ownerPath: result.path,
  oracle: result.postcomputeOracle, mutationsRejected: 7 }, null, 2));
