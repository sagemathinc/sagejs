#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const adapterApi = require("./row11_phase6_resident_prepared_adapter.cjs");
const core = require("./qualification_execution_core.cjs");

const FIELD = "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";

async function main() {
  const adapter = await adapterApi.createRow11ResidentPreparedAdapter();
  const batch = await core.executeFreshBatch(adapter, { boundary: "prepared-kernel",
    fieldId: FIELD, repetitions: 2, seed: "1", tier: "diagnostic" });
  assert.equal(batch.repetitions, 2);
  assert.equal(batch.counters.factorBaseSize, "421");
  assert.equal(batch.counters.initialRelations, "24");
  assert.equal(batch.counters.relationCount, "430");
  assert(BigInt(batch.counters.nativeCalls) > 0n);
  assert(BigInt(batch.wallNanoseconds) > 0n);
  assert.equal(batch.stageTiming.inclusiveNanoseconds, batch.wallNanoseconds);

  const changed = JSON.parse(fs.readFileSync(adapterApi.DEFAULT_INPUT, "utf8"));
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-phase6-mutation-"));
  const filename = path.join(directory, "mutated.json");
  fs.writeFileSync(filename, JSON.stringify(changed));
  let mutationRejected = false;
  try { await adapterApi.createRow11ResidentPreparedAdapter({ inputPath: filename }); }
  catch { mutationRejected = true; }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert.equal(mutationRejected, true);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row11-phase6-resident-prepared-check-v1",
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
