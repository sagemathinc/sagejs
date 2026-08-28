#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildHotnessOverlay } = require("../tools/optimizer-development/overlay.cjs");

function values(args, option) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === option) out.push(args[++i]);
  return out;
}

function value(args, option) {
  const found = values(args, option);
  if (found.length !== 1 || !found[0]) throw new Error(`${option} is required exactly once`);
  return found[0];
}

function loadAdapter(modulePath) {
  const api = require(path.resolve(modulePath));
  if (typeof api.overlayAdapter === "function") return api.overlayAdapter();
  if (api.overlayAdapter) return api.overlayAdapter;
  return api;
}

function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    process.stdout.write("Usage: node scripts/optimizer-hotness-overlay.cjs --dashboard FILE --profile FILE [--profile FILE ...] --adapter MODULE [--minimum-coverage NUMBER] [--output FILE]\n");
    return null;
  }
  const dashboard = JSON.parse(fs.readFileSync(value(args, "--dashboard"), "utf8"));
  const profiles = values(args, "--profile").map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  if (profiles.length === 0) throw new Error("at least one --profile is required");
  const adapter = loadAdapter(value(args, "--adapter"));
  const coverage = values(args, "--minimum-coverage");
  if (coverage.length > 1) throw new Error("--minimum-coverage may be supplied at most once");
  const overlay = buildHotnessOverlay({ dashboard, profileReceipts: profiles, adapter,
    minimumCoverage: coverage.length ? Number(coverage[0]) : 0.8 });
  const json = `${JSON.stringify(overlay, null, 2)}\n`;
  const output = values(args, "--output");
  if (output.length > 1) throw new Error("--output may be supplied at most once");
  if (output.length === 1) fs.writeFileSync(output[0], json);
  else process.stdout.write(json);
  return overlay;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = { main };
