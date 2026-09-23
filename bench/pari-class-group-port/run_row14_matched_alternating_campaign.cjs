#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const campaign = require("./row14_matched_alternating_campaign.cjs");

async function main() {
  const output = process.argv[2];
  assert(output, "usage: run_row14_matched_alternating_campaign.cjs OUTPUT.json");
  const resolved = path.resolve(output);
  assert(resolved.startsWith("/scratch/"),
    "large timing receipts must be written under /scratch");
  assert.equal(fs.existsSync(resolved), false, "refusing to overwrite a receipt");
  const receipt = await campaign.runCampaign();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    schema: receipt.schema,
    receipt: resolved,
    matchedProjectionSha256: receipt.matchedProjectionSha256,
    summary: receipt.summary,
    row14BoundaryQualified: receipt.row14BoundaryQualified,
    fullPanelQualified: receipt.fullPanelQualified,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

