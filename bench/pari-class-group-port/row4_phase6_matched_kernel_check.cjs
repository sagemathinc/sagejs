#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const common = require("./row0_phase6_matched_kernel_check.cjs");
const host = require("./row4_phase6_matched_kernel_host.cjs");
const shared = require("./row1_phase6_matched_kernel_host.cjs");

async function runFreshOnly() {
  const transaction = require("./row4_fresh_prepared_transaction.cjs");
  const { prepared } = common.loadPrepared(4);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row4-phase6-fresh-isolated-"));
  try {
    const receipt = await transaction.runFreshPrepared(prepared, directory);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    assert.equal(receipt.qualifiedTiming, false);
    return { resultSha256: receipt.sha256 || receipt.result.sha256,
      correspondenceComplete: true, publicComplete: false };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function run() {
  let freshCorrectness = null;
  if (!process.argv.includes("--skip-fresh-correctness")) {
    const child = spawnSync(process.execPath, [__filename, "--fresh-only"], {
      cwd: __dirname, encoding: "utf8", timeout: 1_200_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    freshCorrectness = JSON.parse(child.stdout);
  }
  const receipt = await common.run(4, {
    freshCorrectness: false,
  });
  receipt.freshCorrectness = freshCorrectness;
  const { prepared } = common.loadPrepared(4);
  const generated = shared.CONFIG[4].makeFreshInput(prepared);
  const input = generated.input || generated;
  const wordCapacity = host.factorProductWordCapacity(input);
  assert.equal(wordCapacity, 234);
  assert(wordCapacity > 16);
  assert.throws(() => host.factorProductWordCapacity({ analytic_primes: ["1"] }),
    /prepared prime catalog must be positive/);
  receipt.capacityPolicy = {
    owner: "prep_base_state",
    derivedFrom: "sum of prepared-prime bit lengths",
    preparedPrimeCount: input.analytic_primes.length,
    productBitBound: input.analytic_primes.reduce((sum, raw) =>
      sum + BigInt(raw).toString(2).length, 0),
    wordCapacity,
    defaultWordCapacity: 16,
    invalidCatalogMutationsRejected: 1,
  };
  return receipt;
}

const operation = process.argv.includes("--fresh-only") ? runFreshOnly() : run();
operation.then(receipt =>
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`),
error => { console.error(error.stack || error); process.exitCode = 1; });
