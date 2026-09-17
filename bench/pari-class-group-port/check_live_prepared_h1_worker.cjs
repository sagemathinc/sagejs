#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT ||
  "/home/user/sagejs-worktrees/pari-class-group-e2e-integration");
const { compileKernel } = require(path.join(runtimeRoot,
  "tools/native-kernel/compiler.cjs"));
const { canonical, digest } = require("./h1_outcome_c_worker.cjs");

const root = path.resolve(__dirname, "../..");
const inputPath = path.resolve(process.argv[2] ||
  "/tmp/sagejs-resident-generated-class-3qtnS5/inputs.json");
const adapterPath = path.join(__dirname, "live_prepared_h1_worker.cjs");
const workerPath = path.join(__dirname, "h1_outcome_c_worker.cjs");

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
  const request = {
    schema: 1,
    fieldId: prepared.fieldId,
    seed: "20260917",
    pairIndex: 0,
    repetitions: 2,
    implementation: "sagejs",
    preparedInputSha256: digest(prepared),
    preparedInput: prepared,
  };
  const run = spawnSync(process.execPath, [workerPath,
    "--implementation", "sagejs", "--adapter", adapterPath], {
    cwd: root,
    input: JSON.stringify(canonical(request)),
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      SAGEJS_H1_UNIFIED_MODULE: unifiedBuild.modulePath,
      SAGEJS_H1_EMBEDDING_MODULE: embeddingBuild.modulePath,
      SAGEJS_H1_PRECISION_MODULE: precisionBuild.modulePath,
      SAGEJS_H1_DETERMINANT_MODULE: determinantBuild.modulePath,
    },
  });
  assert.equal(run.status, 0, run.stderr || JSON.stringify({
    error: run.error && String(run.error), signal: run.signal,
    stdoutTail: run.stdout && run.stdout.slice(-1000),
  }));
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.arm.terminalStatus,
    "pari-correspondence-complete-internal-h1");
  assert.equal(receipt.arm.repetitions, 2);
  assert.match(receipt.arm.resultDigest, /^[0-9a-f]{64}$/);
  for (const stage of ["relation-retry", "sparse-hnf-snf-transform",
    "unit-regulator", "honesty-generators-final"]) {
    assert(BigInt(receipt.arm.stageTotalsNanoseconds[stage]) > 0n);
  }
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/live-prepared-h1-worker-check-v1",
    terminalStatus: receipt.arm.terminalStatus,
    freshCalls: receipt.arm.repetitions,
    resultDigest: receipt.arm.resultDigest,
    rootNanoseconds: receipt.arm.rootNanoseconds,
    stageTotalsNanoseconds: receipt.arm.stageTotalsNanoseconds,
    unifiedCacheKey: unifiedBuild.cacheKey,
    serializedIntermediatesInsideRoot: 0,
    externalOracleCallsInsideRoot: 0,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
