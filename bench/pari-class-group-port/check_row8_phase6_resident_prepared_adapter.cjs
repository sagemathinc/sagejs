#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const adapterApi = require("./row8_phase6_resident_prepared_adapter.cjs");
const core = require("./qualification_execution_core.cjs");

const FIELD =
  "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363";

async function main() {
  const adapter = await adapterApi.createRow8ResidentPreparedAdapter();
  const request = { boundary: "prepared-kernel", fieldId: FIELD,
    repetitions: 2, seed: "1", tier: "diagnostic" };
  const batch = await core.executeFreshBatch(adapter, request);
  assert.equal(batch.repetitions, 2);
  assert.deepEqual(batch.counters, { factorBaseSize: "143", initialRelations: "9",
    nativeCalls: "13", relationCount: "152" });
  assert(BigInt(batch.wallNanoseconds) > 0n);
  assert.equal(batch.stageTiming.inclusiveNanoseconds, batch.wallNanoseconds);

  const changed = JSON.parse(fs.readFileSync(adapterApi.DEFAULT_INPUT, "utf8"));
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row8-phase6-mutation-"));
  const filename = path.join(directory, "mutated.json");
  fs.writeFileSync(filename, JSON.stringify(changed));
  let mutationRejected = false;
  try { await adapterApi.createRow8ResidentPreparedAdapter({ inputPath: filename }); }
  catch { mutationRejected = true; }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert.equal(mutationRejected, true);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row8-phase6-resident-prepared-check-v1",
    freshResidentRuns: 2, exactDigestsStable: true, mutationRejected,
    outputDigest: batch.outputDigest, replayDigest: batch.replayDigest,
    rngDigest: batch.rngDigest, workDigest: batch.workDigest,
    wallNanoseconds: batch.wallNanoseconds, peakRssKiB: batch.peakRssKiB,
    qualifiedTiming: false,
  }, null, 2)}\n`);
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1;
});
