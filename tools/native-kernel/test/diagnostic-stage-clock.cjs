// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../compiler.cjs");
const { generateArtifacts } = require("../c-backend.cjs");
const { lowerSource } = require("../ir.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");

const sourcePath = resolve(__dirname, "diagnostic_stage_clock_witness.py");
const stages = Object.freeze([
  "unattributed-remainder",
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
]);
const configuration = Object.freeze({
  function: "diagnostic_stage_clock_witness",
  stages,
  maximumVisits: 16,
});

function conserved(trace) {
  return Object.values(trace.totalsNanoseconds)
    .reduce((total, value) => total + value, 0n);
}

test("diagnostic native stage clock is explicit, repeated, and transactional", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-stage-clock-"));
  try {
    const ir = await lowerSource(
      require("node:fs").readFileSync(sourcePath, "utf8"),
      sourcePath,
    );
    const ordinary = generateArtifacts(ir);
    assert.doesNotMatch(ordinary.coreSource, /CLOCK_MONOTONIC/);
    assert.doesNotMatch(ordinary.adapterSource, /__sagejsDiagnosticStageSnapshot/);
    assert.match(ordinary.coreSource, /\(void\) /);

    const diagnostic = generateArtifacts(ir, {
      moduleIdentity: "0123456789abcdef",
      diagnosticStageClock: configuration,
    });
    assert.match(diagnostic.coreSource, /CLOCK_MONOTONIC/);
    assert.match(diagnostic.adapterSource, /__sagejsDiagnosticStageSnapshot/);

    const built = await compileKernel({
      sourcePath,
      cacheRoot: join(directory, "cache"),
      diagnosticStageClock: configuration,
    });
    const compiled = require(built.modulePath);
    const fn = compiled.diagnostic_stage_clock_witness;
    assert.equal(typeof fn.diagnosticStageTrace, "function");
    const output = new BigInt64Array(1);
    const answer = fn.gmp(output, 200000n, false);
    assert.equal(output[0], answer);
    const trace = fn.diagnosticStageTrace();
    assert.deepEqual(
      trace.visits.map(visit => visit.stage),
      [
        "unattributed-remainder",
        "relation-retry",
        "sparse-hnf-snf-transform",
        "unit-regulator",
        "sparse-hnf-snf-transform",
        "unit-regulator",
        "sparse-hnf-snf-transform",
        "unit-regulator",
        "honesty-generators-final",
      ],
    );
    assert.equal(trace.failed, false);
    assert.equal(trace.clockFailed, false);
    assert.equal(conserved(trace), trace.rootNanoseconds);
    assert.equal(
      trace.visits.reduce((total, visit) => total + visit.nanoseconds, 0n),
      trace.rootNanoseconds,
    );

    assert.throws(
      () => fn.gmp(output, 1000n, true),
      /requested diagnostic witness failure/,
    );
    const failed = fn.diagnosticStageTrace();
    assert.equal(failed.failed, true);
    assert.equal(failed.clockFailed, false);
    assert.equal(conserved(failed), failed.rootNanoseconds);
    assert.deepEqual(
      failed.visits.map(visit => visit.stage),
      trace.visits.slice(0, -1).map(visit => visit.stage),
    );

    fn.gmp(output, 1000n, false);
    const recovered = fn.diagnosticStageTrace();
    assert.equal(recovered.failed, false);
    assert.equal(recovered.clockFailed, false);
  } finally {
    removeLoadedNativeCache(directory);
    rmSync(directory, { recursive: true, force: true });
  }
});
