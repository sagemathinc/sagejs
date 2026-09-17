#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const witnessApi = require("./panel1_c3_class_witness_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const presentationCoordinator = path.join(__dirname, "panel1_presentation_authority_coordinator.cjs");
const witnessCoordinator = path.join(__dirname, "panel1_c3_class_witness_coordinator.cjs");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";
const w0Sha = "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";
const presentationSha = "c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(args, expected = 0) {
  const result = spawnSync("prlimit", ["--as=4294967296", "--", process.execPath, ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel1-c3-class-"));
try {
  const presentationOutput = path.join(temporary, "presentation");
  const presentationPublication = JSON.parse(run([
    presentationCoordinator, "--pristine-w0", w0, "--pristine-sha256", w0Sha,
    "--output-dir", presentationOutput,
  ]).stdout);
  assert.equal(presentationPublication.sha256, presentationSha);
  const presentation = JSON.parse(fs.readFileSync(presentationPublication.path));

  const output = path.join(temporary, "witness");
  const args = [
    witnessCoordinator, "--presentation-owner", presentationPublication.path,
    "--presentation-sha256", presentationSha, "--output-dir", output,
  ];
  const first = JSON.parse(run(args).stdout);
  const second = JSON.parse(run(args).stdout);
  assert.deepEqual(second, first, "cold replay publication is not idempotent");
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(witnessApi.verifyWitness(owner, owner.ancestry));

  assert.deepEqual(owner.descriptor.idealHnf,
    ["11", "8", "6", "0", "1", "0", "0", "0", "1"]);
  assert.equal(owner.descriptor.sourceIndex, 4);
  assert.equal(presentation.replay.terminalPermutation[0], "5");
  const projection = owner.smithCoordinate.projection.map(BigInt);
  const matrix = presentation.presentation.matrix.map(BigInt);
  for (let column = 0; column < 51; column += 1) {
    let value = 0n;
    for (let row = 0; row < 51; row += 1)
      value += projection[row] * matrix[51 * column + row];
    assert.equal(value % 3n, 0n, `Smith projection column ${column}`);
  }
  assert.equal(projection[4], 1n, "generator coordinate must be nonzero modulo 3");

  const raw = owner.orderRelation.rawRelationCoefficients.map(BigInt);
  const relations = presentation.relations.matrix.map(BigInt);
  for (let row = 0; row < 51; row += 1) {
    let value = 0n;
    for (let column = 0; column < 58; column += 1)
      value += relations[51 * column + row] * raw[column];
    assert.equal(value, row === 4 ? 3n : 0n, `raw order relation row ${row}`);
  }
  assert.deepEqual(owner.exactIdealReplay.powerHnf,
    ["1331", "437", "831", "0", "1", "0", "0", "0", "1"]);
  assert.deepEqual(owner.exactIdealReplay.principalHnf, owner.exactIdealReplay.powerHnf);

  let mutations = 0;
  const reject = mutation => {
    const changed = structuredClone(owner);
    mutation(changed);
    assert.throws(() => witnessApi.verifyWitness(changed, owner.ancestry));
    mutations += 1;
  };
  reject(value => { value.descriptor.idealHnf[1] = "9"; });
  reject(value => { value.smithCoordinate.projection[4] = "0"; });
  reject(value => { value.orderRelation.rawRelationCoefficients[0] = String(BigInt(value.orderRelation.rawRelationCoefficients[0]) + 1n); });
  reject(value => { value.orderRelation.factorBaseExponents[4] = "0"; });
  reject(value => { value.orderRelation.principalGenerator[0] = String(BigInt(value.orderRelation.principalGenerator[0]) + 1n); });
  reject(value => { value.exactIdealReplay.squareHnf[0] = "120"; });
  reject(value => { value.exactIdealReplay.powerHnf[1] = "438"; });
  reject(value => { value.ancestry.presentationOwnerSha256 = "0".repeat(64); });

  const changedPresentation = path.join(temporary, "changed-presentation.json");
  const changed = structuredClone(presentation);
  changed.relations.principalGenerators[0] = "3";
  fs.writeFileSync(changedPresentation, `${JSON.stringify(changed)}\n`);
  const rejectedOwner = run([
    witnessCoordinator, "--presentation-owner", changedPresentation,
    "--presentation-sha256", presentationSha, "--output-dir", output,
  ], 1);
  assert.match(rejectedOwner.stderr, /presentation owner digest changed/);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/panel1-c3-class-witness-check-v1",
    presentationSha256: presentationSha, witnessSha256: first.sha256,
    generatorIdeal: owner.descriptor.idealHnf, smithCoordinate: owner.smithCoordinate.generatorCoordinate,
    invariant: 3, rawRelationTerms: raw.filter(value => value !== 0n).length,
    exactPowerProducts: 2, mutations, publication: "atomic-idempotent-0444",
    limits: { timeoutSeconds: 600, addressSpaceGiB: 4 },
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
