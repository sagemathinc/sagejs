#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const diagnostic = require("./row14_unqualified_paired_diagnostic.cjs");

async function main() {
  const output = process.argv[2];
  assert(output, "usage: run_row14_unqualified_paired_diagnostic.cjs OUTPUT.json");
  const resolved = path.resolve(output);
  assert(resolved.startsWith("/scratch/"), "diagnostic receipts belong under /scratch");
  assert.equal(fs.existsSync(resolved), false, "refusing to overwrite a receipt");
  const receipt = await diagnostic.runDiagnostic();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ receipt: resolved, schema: receipt.schema,
    diagnosticOnly: true, qualifiedTiming: false })}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
