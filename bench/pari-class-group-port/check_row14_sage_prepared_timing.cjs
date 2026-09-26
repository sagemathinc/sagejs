#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const sage = require("./row14_sage_prepared_timing_adapter.cjs");
const pari = require("./row14_pari_prepared_timing_adapter.cjs");

async function worker() {
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  const result = request.strict
    ? await sage.runStrictPreparedDiagnostic(request)
    : await sage.runSagePreparedDiagnostic(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  if (process.argv[2] === "--worker") return worker();
  const strict = process.argv.includes("--strict");
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-row14-sage-prepared-timing-"));
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, __filename, "--worker"], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8",
    input: JSON.stringify({ outputDirectory, strict }), timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const diagnostic = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(diagnostic.qualifiedTiming, false);
  assert.equal(diagnostic.ratioPublished, false);
  if (strict) {
    assert.equal(diagnostic.boundary.inputMathematicsMatched, true);
    assert.equal(diagnostic.boundary.rootRuntimeInput, false);
    assert.equal(diagnostic.boundary.clockImplementationMatched, false);
  } else {
    assert.equal(diagnostic.boundary.initialRootExcludedFromClock, true);
  }
  assert.equal(diagnostic.receipt.correspondenceComplete, true);
  assert.equal(diagnostic.receipt.publicComplete, false);
  const principalClock = strict
    ? diagnostic.phases.mathematicalElapsedNs
    : diagnostic.phases.connectedTransactionNs;
  assert(BigInt(principalClock) < 600_000_000_000n);
  const stageTotal = Object.values(diagnostic.phases.mathematicalStageElapsedNs)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  assert(stageTotal > 0n);

  const client = new pari.HelperClient(pari.buildHelper());
  await client.ready();
  let sample;
  try { sample = await client.run("1"); }
  finally { await client.close(); }
  const comparison = sage.compareWithPari(diagnostic.projection, sample);
  assert.equal(comparison.exactGeneratorIdeals, true);
  assert.equal(comparison.exactRegulatorValue, true);
  assert.equal(comparison.exactRngState, true);
  assert(comparison.minimumLogAgreementBits >= 96);

  // The alternating mechanism is ready, but using it is forbidden until the
  // two clocks begin at the same prepared-nf boundary.
  assert.deepEqual(pari.alternatingOrder(0),
    ["sagejs", "pari", "pari", "sagejs"]);
  assert.throws(() => sage.compareWithPari(
    { ...diagnostic.projection, work: { ...diagnostic.projection.work,
      factorBaseSize: "798" } }, sample));
  const changedRng = structuredClone(diagnostic.projection);
  changedRng.rng.terminalState[0] = "0";
  assert.throws(() => sage.compareWithPari(changedRng, sample));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-sage-prepared-timing-check-v1",
    phases: diagnostic.phases,
    maximumRssKiB: diagnostic.receipt.maxRssKiB,
    comparison,
    boundary: diagnostic.boundary,
    strictPreparedNfInput: strict,
    alternatingScheduleReady: true,
    alternatingScheduleExecuted: false,
    ratioPublished: false,
    qualifiedTiming: false,
    negativeCases: 2,
  }, null, 2)}\n`);
}

Promise.resolve(main()).catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
});
