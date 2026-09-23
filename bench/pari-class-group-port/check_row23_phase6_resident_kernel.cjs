#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const host = require("./row23_phase6_resident_kernel_host.cjs");

async function child() {
  const resident = await host.prepareResident();
  const mutationDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row23-phase6-mutation-"));
  const changedPrepared = structuredClone(resident.prepared);
  changedPrepared.prep_polynomial[0] = String(
    BigInt(changedPrepared.prep_polynomial[0]) + 1n);
  const changedPreparedPath = path.join(mutationDirectory, "prepared.json");
  fs.writeFileSync(changedPreparedPath, JSON.stringify(changedPrepared));
  await assert.rejects(host.prepareResident(changedPreparedPath),
    /discriminant|reviewed row-23 corridor|prepared/);
  fs.rmSync(mutationDirectory, { recursive: true, force: true });
  const changedFactor = structuredClone(resident);
  changedFactor.factorOwner.factorBase.norms[0] = "11";
  await assert.rejects(host.runResident(changedFactor),
    /retained factor owner changed/);

  const sample = host.verifySample(await host.runResident(resident));
  assert.throws(() => host.verifySample({ ...sample,
    projection: { ...sample.projection,
      unitGroup: { ...sample.projection.unitGroup,
        exactUnitsSha256: "0".repeat(64) } } }), /exact units changed|Expected values/);
  const copied = { ...sample };
  assert.throws(() => host.verifySample(copied), /live HNF owner was not retained/);

  const source = fs.readFileSync(require.resolve(
    "./row23_phase6_resident_kernel_host.cjs"), "utf8");
  const body = source.match(/async function runResident\(resident\) \{([\s\S]*?)\n\}/)?.[1];
  assert(body, "row-23 resident root disappeared");
  assert.doesNotMatch(body, /spawnSync|writeFileSync|python3|JSON\.stringify/);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-phase6-resident-kernel-check-v1",
    sample: {
      inclusiveNanoseconds: sample.inclusiveNanoseconds,
      stageNanoseconds: sample.stageNanoseconds,
      projection: sample.projection,
      boundary: sample.boundary,
    },
    mutationsRejected: ["prepared-field", "retained-factor-owner", "unit-result",
      "detached-copy"],
    resourceEnvelope: { addressSpaceBytes: 4 * 1024 ** 3,
      cpuSeconds: 600, wallSeconds: 600 },
  })}\n`);
}

function parent() {
  const script = path.resolve(__filename);
  const command = `ulimit -v 4194304; ulimit -t 600; exec timeout 600s ` +
    `${JSON.stringify(process.execPath)} ${JSON.stringify(script)} --child`;
  const run = spawnSync("bash", ["-lc", command], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8",
    timeout: 610_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(receipt.sample.projection.classGroup.classNumber, "6");
  assert.deepEqual(receipt.sample.projection.classGroup.invariantFactors, ["6"]);
  assert.equal(receipt.sample.projection.unitGroup.rank, "4");
  assert.equal(receipt.sample.boundary.intermediateSerializationInsideRoot, false);
  assert.equal(receipt.sample.boundary.cpythonInsideRoot, false);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv.includes("--child")) child().catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
});
else parent();
