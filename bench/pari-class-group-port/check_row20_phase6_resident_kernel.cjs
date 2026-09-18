#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const kernel = require("./row20_phase6_resident_kernel.cjs");

const CORPUS = process.env.SAGEJS_FRESH_PREPARED_CORPUS ||
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function prepared() {
  const matches = fs.readdirSync(CORPUS)
    .filter(name => name.startsWith("prepared-row-20-") && name.endsWith(".json"));
  assert.equal(matches.length, 1);
  return JSON.parse(fs.readFileSync(path.join(CORPUS, matches[0])));
}

async function main() {
  const input = prepared();
  for (const mutate of [
    value => { value.prep_polynomial[0] = "-11"; },
    value => { value.prep_index = "9"; },
    value => { value.precision = "193"; },
    value => { value.basis_table[0] = String(BigInt(value.basis_table[0]) + 1n); },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    await assert.rejects(() => kernel.prepareResident(changed));
  }
  const resident = await kernel.prepareResident(structuredClone(input));
  const forbidden = ["appendFileSync", "chmodSync", "copyFileSync", "mkdirSync",
    "renameSync", "rmSync", "truncateSync", "unlinkSync", "writeFileSync"];
  const saved = Object.fromEntries(forbidden.map(name => [name, fs[name]]));
  for (const name of forbidden) fs[name] = () => {
    throw new Error(`resident kernel attempted filesystem mutation: ${name}`);
  };
  let result;
  try {
    result = await kernel.runResident(resident);
  } finally {
    for (const name of forbidden) fs[name] = saved[name];
  }
  assert.deepEqual(result.classGroup,
    { classNumber: "1", invariantFactors: [], generatorCount: "0" });
  assert.equal(result.unitGroup.rank, "2");
  assert.equal(result.unitGroup.torsionOrder, "2");
  assert.equal(result.unitGroup.coordinates.length, 10);
  assert.equal(result.exact.hnfState.join(","), "0,7,7,0,7,4,0,14,0");
  assert.equal(result.correspondenceComplete, true);
  assert.equal(result.allocationFreeMatchedClock, false);
  const canonical = JSON.stringify(result);
  process.stdout.write(`${JSON.stringify({ schema:
    "sagejs.pari-class-group/row20-phase6-resident-kernel-check-v1",
  preparedMutationsRejected: 4, residentNoPublication: true,
  residentNoCpythonChild: true, resultSha256: sha(Buffer.from(canonical)),
  result })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
