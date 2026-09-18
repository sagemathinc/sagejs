#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

// Unqualified parity probe only. It executes one fresh Sage.js prepared root
// and two deterministic PARI prepared calls, but does not run a campaign,
// enable the qualification registry, or open a reserve field.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const pari = require("./row19_phase6_pari_prepared_adapter.cjs");
const sage = require("./row19_phase6_sage_prepared_adapter.cjs");

const CACHE =
  "/scratch/sagejs-row19-phase6-prepared-aggregate/native-cache-v1";
const canonical = value => Buffer.from(`${JSON.stringify(value)}\n`);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
  const output = process.argv[2] ||
    "/scratch/row19-phase6-unqualified-pair-check-v2-rng.json";
  const build = pari.buildHelper();
  const client = new pari.Client(build);
  const ready = await client.ready();
  let first, second;
  try {
    first = await client.run("1");
    second = await client.run("1");
  } finally { await client.close(); }
  assert.deepEqual(first.projection, second.projection);
  assert.deepEqual(first.rng, second.rng);

  const resident = await sage.prepareResident(sage.DEFAULT_INPUT,
    { cacheRoot: CACHE });
  const sageSample = sage.runResident(resident);
  assert.deepEqual(sageSample.projection, first.projection);
  assert.deepEqual(sageSample.rng, first.rng);
  assert.throws(() => sage.runResident(resident), /single-use/);

  const report = {
    schema: "sagejs.pari-class-group/row19-phase6-unqualified-pair-check-v2",
    qualifiedTiming: false, campaignExecuted: false, reservesOpened: false,
    fieldId: sage.FIELD_ID, projection: sageSample.projection,
    exactParity: true,
    sage: { kernelNanoseconds: sageSample.kernelNanoseconds,
      processMaxRssKiB: sageSample.processMaxRssKiB,
      boundary: sageSample.boundary, rng: sageSample.rng,
      provenance: sageSample.provenance },
    pari: { preparationNanoseconds: ready.preparationNanoseconds,
      kernelNanoseconds: [first.kernelNanoseconds, second.kernelNanoseconds],
      processMaxRssKiB: second.processMaxRssKiB,
      deterministicSameSeed: true, rng: first.rng,
      provenance: build.provenance },
    replay: { exact: true, projection: sageSample.projection },
    workCounters: { classNumber: "39366", degree: "3", unitRank: "1" },
  };
  const bytes = canonical(report);
  fs.writeFileSync(output, bytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ output, sha256: sha256(bytes), report })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
