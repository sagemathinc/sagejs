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
const witnessApi = require("./row16_mixed_cubic_class_witness_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const presentationCoordinator = path.join(__dirname, "row16_mixed_cubic_owner_coordinator.cjs");
const witnessCoordinator = path.join(__dirname, "row16_mixed_cubic_class_witness_coordinator.cjs");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-16-aabb93f0d6139f93.json";
const w0Sha = "8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce";
const presentationSha = "e51d45b7a994f09bbb14ff7a707ca71d053b94bf924596f435e0f84debc97185";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(args, expected = 0) {
  const result = spawnSync("prlimit", ["--as=4294967296", "--", process.execPath, ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row16-class-witness-"));
try {
  const presentationPublication = JSON.parse(run([
    presentationCoordinator, "--pristine-w0", w0, "--pristine-sha256", w0Sha,
    "--output-dir", path.join(temporary, "presentation"),
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
  assert.deepEqual(second, first, "cold row-16 witness publication is not idempotent");
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(witnessApi.verifyWitness(owner, owner.ancestry));

  const projections = owner.quotient.projections.map(row => row.map(BigInt));
  const matrix = presentation.presentation.matrix.map(BigInt);
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    for (let column = 0; column < 48; column += 1) {
      let value = 0n;
      for (let row = 0; row < 48; row += 1)
        value += projections[coordinate][row] * matrix[48 * column + row];
      assert.equal(value % 3n, 0n, `quotient coordinate ${coordinate}, column ${column}`);
    }
  }
  assert.deepEqual(owner.quotient.generatorCoordinateMatrix,
    ["1", "0", "0", "0", "1", "0", "0", "0", "1"]);

  const relations = presentation.relations.matrix.map(BigInt);
  const sourceIndices = [0, 3, 7];
  owner.witnesses.forEach((witness, index) => {
    const raw = witness.orderRelation.rawRelationCoefficients.map(BigInt);
    for (let row = 0; row < 48; row += 1) {
      let value = 0n;
      for (let column = 0; column < 54; column += 1)
        value += relations[48 * column + row] * raw[column];
      assert.equal(value, row === sourceIndices[index] ? 3n : 0n,
        `raw order relation ${index}, row ${row}`);
    }
    assert.deepEqual(witness.exactIdealReplay.powerHnf, witness.exactIdealReplay.principalHnf);
  });
  assert.deepEqual(owner.witnesses.map(value => value.exactIdealReplay.powerHnf), [
    ["4", "1", "2", "0", "1", "0", "0", "0", "2"],
    ["25", "20", "2", "0", "5", "1", "0", "0", "1"],
    ["1331", "315", "353", "0", "1", "0", "0", "0", "1"],
  ]);

  let mutations = 0;
  const reject = mutation => {
    const changed = structuredClone(owner);
    mutation(changed);
    assert.throws(() => witnessApi.verifyWitness(changed, owner.ancestry));
    mutations += 1;
  };
  reject(value => { value.quotient.projections[0][0] = "0"; });
  reject(value => { value.quotient.generatorCoordinateMatrix[0] = "0"; });
  reject(value => { value.witnesses[0].descriptor.idealHnf[0] = "3"; });
  reject(value => { value.witnesses[1].orderRelation.rawRelationCoefficients[0] =
    String(BigInt(value.witnesses[1].orderRelation.rawRelationCoefficients[0]) + 1n); });
  reject(value => { value.witnesses[2].orderRelation.factorBaseExponents[7] = "0"; });
  reject(value => { value.witnesses[0].orderRelation.principalGenerator[0] =
    String(BigInt(value.witnesses[0].orderRelation.principalGenerator[0]) + 1n); });
  reject(value => { value.witnesses[1].exactIdealReplay.squareHnf[0] = "24"; });
  reject(value => { value.witnesses[2].exactIdealReplay.powerHnf[1] = "316"; });
  reject(value => { value.ancestry.presentationOwnerSha256 = "0".repeat(64); });

  const changedPresentation = path.join(temporary, "changed-presentation.json");
  const changed = structuredClone(presentation);
  changed.relations.principalGenerators[0] = "3";
  fs.writeFileSync(changedPresentation, `${JSON.stringify(changed)}\n`);
  const rejected = run([
    witnessCoordinator, "--presentation-owner", changedPresentation,
    "--presentation-sha256", presentationSha, "--output-dir", output,
  ], 1);
  assert.match(rejected.stderr, /presentation owner digest changed/);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row16-mixed-cubic-class-witness-check-v1",
    presentationSha256: presentationSha, witnessSha256: first.sha256,
    generators: 3, quotientDimension: 3, invariant: 3,
    sourceIndices, rawRelationEquations: 3, exactPowerProducts: 6, mutations,
    publication: "atomic-idempotent-0444",
    limits: { timeoutSeconds: 600, addressSpaceGiB: 4 },
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
