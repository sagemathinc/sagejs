#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { generateCampaign } = require("../tools/optimizer-development/campaign.cjs");

function value(args, option, required = true) {
  const at = args.indexOf(option);
  if (at < 0 || !args[at + 1]) {
    if (required) throw new Error(`${option} is required`);
    return null;
  }
  if (args.indexOf(option, at + 1) >= 0) throw new Error(`${option} may be supplied at most once`);
  return args[at + 1];
}

function loadAdapter(modulePath) {
  const api = require(path.resolve(modulePath));
  if (typeof api.campaignAdapter === "function") return api.campaignAdapter();
  if (api.campaignAdapter) return api.campaignAdapter;
  return api;
}

function activeContracts(directory) {
  if (!directory) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    process.stdout.write("Usage: node scripts/optimizer-campaign.cjs --dossier FILE --proposal FILE --base COMMIT --adapter MODULE [--contracts DIR] [--output FILE]\nThis command is always a dry run and never creates worktrees.\n");
    return null;
  }
  const dossier = JSON.parse(fs.readFileSync(value(args, "--dossier"), "utf8"));
  const proposal = JSON.parse(fs.readFileSync(value(args, "--proposal"), "utf8"));
  const adapter = loadAdapter(value(args, "--adapter"));
  const result = generateCampaign({
    dossier,
    baseCommit: value(args, "--base"),
    proposal,
    existingContracts: activeContracts(value(args, "--contracts", false)),
    adapter,
  });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const output = value(args, "--output", false);
  if (output) fs.writeFileSync(output, json);
  else process.stdout.write(json);
  return result;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = { main };
