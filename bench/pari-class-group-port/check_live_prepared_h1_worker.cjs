#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT ||
  "/home/user/sagejs-worktrees/pari-class-group-e2e-integration");
const { compileKernel } = require(path.join(runtimeRoot,
  "tools/native-kernel/compiler.cjs"));
const { digest } = require("./h1_outcome_c_worker.cjs");
const inputPath = path.resolve(process.argv[2] ||
  "/tmp/sagejs-resident-generated-class-3qtnS5/inputs.json");
const adapterPath = path.join(__dirname, "live_prepared_h1_worker.cjs");

function preparedInput() {
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  assert.deepEqual(Object.keys(raw).sort(), ["input", "names"]);
  const allowed = new Set([
    "admission_matrix_m", "admission_matrix_p", "admission_matrix_e",
    "preparation_embedding", "preparation_rounded_embedding",
    "admission_primes", "admission_products", "n", "precision",
    "admission_real_count", "admission_factorlimit", "admission_prime_limit",
    "analytic_discriminant", "analytic_roots_of_unity", "prep_index",
    "prep_zkden", "prep_polynomial", "prep_invzk", "prep_zk",
    "prep_zk_degrees", "basis_table", "analytic_primes",
  ]);
  for (const [name] of raw.names) {
    const value = raw.input[name];
    const nonzero = Array.isArray(value)
      ? value.some(entry => Number(entry) !== 0)
      : value !== false && Number(value) !== 0;
    if (nonzero && name !== "accept_inverse_hr" &&
        name !== "analytic_log_discriminant") assert(allowed.has(name),
      `answer-derived prepared owner: ${name}`);
  }
  assert.deepEqual(raw.input.accept_inverse_hr.map(String), ["-991", "-992", "-993"]);
  assert.deepEqual(raw.input.analytic_log_discriminant.map(Number), [-999]);
  return {
    schema: "sagejs.pari-class-group/sanitized-prepared-h1-v1",
    fieldId: "pari-2.17.4:x^3-20018*x+20034",
    names: raw.names,
    input: raw.input,
  };
}

async function main() {
  const cacheRoot = path.join(__dirname, ".sagejs-native-kernels");
  const build = async (basename) => {
    if (fs.existsSync(cacheRoot)) {
      for (const key of fs.readdirSync(cacheRoot)) {
        const directory = path.join(cacheRoot, key);
        const manifestPath = path.join(directory, "manifest.json");
        const modulePath = path.join(directory, "index.cjs");
        const addonPath = path.join(directory, "build/Release/sagejs_native_kernel.node");
        if (!fs.existsSync(manifestPath) || !fs.existsSync(modulePath) ||
            !fs.existsSync(addonPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (path.basename(manifest.sourcePath) === basename) {
          return { modulePath, cacheKey: manifest.cacheKey, ir: manifest.ir };
        }
      }
    }
    return compileKernel({ sourcePath: path.join(__dirname, basename) });
  };
  // The compiler frontend owns one WebAssembly tree-sitter parser; compile
  // sequentially so this focused checker is deterministic in one process.
  const unifiedBuild = await build("live_prepared_h1_native.py");
  const unifiedEntry = unifiedBuild.ir?.functions.find(
    (fn) => fn.name === "pari_live_prepared_h1_native",
  );
  assert(unifiedEntry, "unified native entry disappeared");
  assert.equal(
    unifiedEntry.params.find((param) => param.name === "prep_state")?.type,
    "IntegerBuffer",
  );
  assert.equal(
    unifiedEntry.params.some((param) => param.name === "final_prep_state"),
    false,
  );
  const embeddingBuild = await build("cubic_embedding_rebuild.py");
  const precisionBuild = await build("cubic_precision_rebuild.py");
  const determinantBuild = await build("regulator_determinant.py");
  const prepared = preparedInput();
  process.env.SAGEJS_H1_UNIFIED_MODULE = unifiedBuild.modulePath;
  process.env.SAGEJS_H1_EMBEDDING_MODULE = embeddingBuild.modulePath;
  process.env.SAGEJS_H1_PRECISION_MODULE = precisionBuild.modulePath;
  process.env.SAGEJS_H1_DETERMINANT_MODULE = determinantBuild.modulePath;
  const adapter = require(adapterPath);
  const calls = [];
  for (let repetition = 0; repetition < 2; repetition += 1) {
    const stages = [];
    const started = process.hrtime.bigint();
    const output = await adapter.runPreparedH1({
      implementation: "sagejs",
      seed: "20260917",
      preparedInput: structuredClone(prepared),
      switchStage: stage => stages.push(stage),
    });
    calls.push({ output, stages, elapsedNanoseconds: process.hrtime.bigint() - started });
  }
  const expectedStatus = "experimental-specialized-live-h1-incomplete";
  for (const { output, stages } of calls) {
    assert.equal(output.correspondenceComplete, false);
    assert.equal(output.terminalStatus, expectedStatus);
    assert.equal(output.result.terminal.status, expectedStatus);
    assert.equal(output.result.terminal.correspondence_complete, false);
    assert.equal(output.result.terminal.composition_driver_published, false);
    assert.deepEqual(output.result.terminal.missing_live_authorities, [
      "live-logical-relation-active-and-kernel-lengths",
      "live-precision-retry-policy",
      "rigorous-regulator-enclosure-authority",
    ]);
    assert.deepEqual(output.result.assumptions.frozen_diagnostic_controls,
      adapter.DIAGNOSTIC_CONTROLS);
    assert.equal(output.work.serializedIntermediates, "0");
    assert.equal(output.work.externalOracleCalls, "0");
    assert.deepEqual(stages, ["unit-regulator", "honesty-generators-final"]);
  }
  const resultDigest = digest(calls[0].output);
  assert.equal(digest(calls[1].output), resultDigest);
  assert.match(resultDigest, /^[0-9a-f]{64}$/);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/live-prepared-h1-worker-check-v1",
    terminalStatus: expectedStatus,
    correspondenceComplete: false,
    freshCalls: calls.length,
    resultDigest,
    rootNanoseconds: calls.map(call => call.elapsedNanoseconds.toString()),
    frozenDiagnosticControls: adapter.DIAGNOSTIC_CONTROLS,
    unifiedCacheKey: unifiedBuild.cacheKey,
    serializedIntermediatesInsideRoot: 0,
    externalOracleCallsInsideRoot: 0,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
