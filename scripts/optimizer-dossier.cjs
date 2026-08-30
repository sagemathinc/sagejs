#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { generateDossier } = require("../tools/optimizer-development/dossier.cjs");

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
  if (typeof api.dossierAdapter === "function") return api.dossierAdapter();
  if (api.dossierAdapter) return api.dossierAdapter;
  return api;
}

function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    process.stdout.write("Usage: node scripts/optimizer-dossier.cjs --overlay FILE --dashboard FILE --profile FILE_JSON_ARRAY --region-id EXACT_SHA256_ID --adapter MODULE [--output FILE]\n");
    return null;
  }
  const overlay = JSON.parse(fs.readFileSync(value(args, "--overlay"), "utf8"));
  const dashboard = JSON.parse(fs.readFileSync(value(args, "--dashboard"), "utf8"));
  const profileReceipts = JSON.parse(fs.readFileSync(value(args, "--profile"), "utf8"));
  if (!Array.isArray(profileReceipts)) throw new Error("--profile must contain a JSON array of receipts");
  const adapter = loadAdapter(value(args, "--adapter"));
  const dossier = generateDossier({ overlay, dashboard, profileReceipts,
    regionId: value(args, "--region-id"), adapter });
  const json = `${JSON.stringify(dossier, null, 2)}\n`;
  const output = value(args, "--output", false);
  if (output) fs.writeFileSync(output, json);
  else process.stdout.write(json);
  return dossier;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = { main };
