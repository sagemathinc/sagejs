#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

void (async () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const tier = option("--tier", "release");
  const receiptPath = option("--receipt");
  const { createSage } = require(path.join(root, "dist", "tools", "kernel.js"));
  const { assertParityExpectation, loadParityCorpus } = await import("./browser-wasm-support.mjs");
  const corpus = await loadParityCorpus();
  const cases = corpus.cases.filter((item) => tier === "release" || item.tier === "routine");
  const session = await createSage();
  const receipt = {
    schema_version: 1,
    kind: "sagejs-node-oracle-for-browser-wasm",
    source_revision: process.env.GITHUB_SHA ?? null,
    tier,
    cases: [],
  };
  try {
    for (const item of cases) {
      const current = {
        id: item.id,
        workflow: item.workflow,
        required_capability_routes: item.requires,
        oracle_route: "node-runtime",
        status: "failed",
      };
      receipt.cases.push(current);
      const started = performance.now();
      try {
        const result = await session.evaluate(item.source);
        current.duration_ms = performance.now() - started;
        current.instrumentation_status = result.instrumentation
          ? "observed"
          : "unavailable";
        current.instrumentation = result.instrumentation ?? null;
        current.failures = assertParityExpectation(item, result);
        current.status = current.failures.length === 0 ? "passed" : "mismatch";
      } catch (error) {
        current.status = "missing-or-failed-capability";
        current.error = String(error.stack ?? error);
      }
    }
  } finally {
    await session.close();
  }
  if (receiptPath) {
    fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  const failed = receipt.cases.filter((item) => item.status !== "passed");
  if (failed.length) {
    console.error(JSON.stringify(receipt, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(receipt, null, 2));
  }
})().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
