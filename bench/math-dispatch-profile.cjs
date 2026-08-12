#!/usr/bin/env node

"use strict";

// This command validates retained raw evidence. It deliberately does not edit
// authoritative profile source: fitting and review remain separate steps.

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { ingestBenchmarkReports } = require("../tools/math-dispatch/evidence.cjs");
const { loadRegistry } = require("../tools/math-dispatch/registry.cjs");

async function main() {
  const filenames = process.argv.slice(2);
  if (filenames.length === 0) {
    throw new Error("usage: node bench/math-dispatch-profile.cjs REPORT.json [...]");
  }
  const registry = await loadRegistry({ root: resolve(__dirname, "..") });
  const reports = filenames.map((filename) => JSON.parse(readFileSync(resolve(filename), "utf8")));
  const accepted = ingestBenchmarkReports(reports, registry, { filenames });
  process.stdout.write(`${JSON.stringify({
    schema: accepted.schema,
    fingerprint: accepted.fingerprint,
    reports: accepted.reports.map((item) => ({
      fingerprint: item.fingerprint,
      family: item.report.case.family,
      operation: item.report.case.operation,
      candidate: item.report.case.candidate,
    })),
    authority_unchanged: true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
