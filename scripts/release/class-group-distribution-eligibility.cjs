#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_PREFIX = "packages/class-groups/src/";

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function inspectClassGroupDistributionEligibility(root = process.cwd()) {
  const cargo = path.join(root, "packages/class-groups/Cargo.toml");
  if (!fs.existsSync(cargo)) {
    return {
      schema: "sagejs.class-groups/distribution-eligibility/v1",
      applicable: false,
      passed: true,
      failures: [],
    };
  }

  // Source-only development is not a distribution. If the public layout does
  // not convey the reactor, reject any stale staged bytes before publication.
  const layout = readJson(path.join(root, "packages/flint-wasm/release/production-layout.json"));
  const distributed = layout.modules.some(({ id }) => id === "class-group");
  if (!distributed) {
    const staged = ["class-group-core.wasm", "class-group-core-receipt.json"]
      .filter((name) => fs.existsSync(path.join(root, "packages/flint-wasm/dist", name)));
    return {
      schema: "sagejs.class-groups/distribution-eligibility/v1",
      applicable: false,
      passed: staged.length === 0,
      failures: staged.map((name) => `excluded class-group artifact remains staged: ${name}`),
    };
  }

  const failures = [];
  let provenance;
  let architecture;
  try {
    provenance = readJson(path.join(root, "packages/class-groups/provenance.json"));
  } catch {
    failures.push("the class-group provenance manifest is missing or invalid");
  }
  try {
    architecture = readJson(path.join(root, "architecture/native-code.json"));
  } catch {
    failures.push("the native-code architecture manifest is missing or invalid");
  }

  if (provenance?.legal_conclusion !== true) {
    failures.push("the class-group provenance manifest has no affirmative human legal conclusion");
  }

  const production = (architecture?.files ?? []).filter(
    (entry) =>
      typeof entry?.path === "string" &&
      entry.path.startsWith(PACKAGE_PREFIX) &&
      entry.distribution_status !== "qualification-only",
  );
  if (production.length === 0) {
    failures.push("the native-code manifest has no production class-group source inventory");
  }
  const pending = production
    .filter(
      (entry) =>
        entry.distribution_status !== "reviewed-for-distribution" ||
        typeof entry.distribution_receipt !== "string" ||
        entry.distribution_receipt.length === 0 ||
        !fs.existsSync(path.join(root, entry.distribution_receipt)),
    )
    .map((entry) => entry.path)
    .sort();
  if (pending.length !== 0) {
    failures.push(
      `${pending.length} production class-group source file(s) lack reviewed distribution receipts`,
    );
  }

  return {
    schema: "sagejs.class-groups/distribution-eligibility/v1",
    applicable: true,
    passed: failures.length === 0,
    legalConclusion: provenance?.legal_conclusion === true,
    productionFiles: production.length,
    pendingFiles: pending,
    failures,
    remedy:
      failures.length === 0
        ? null
        : "Complete human/legal notice, SBOM, corresponding-source, and relinking review; then record reviewed-for-distribution receipts for the exact production sources. Qualification builds may continue, but release packaging must not convey this backend yet.",
  };
}

function requireClassGroupDistributionEligibility(root = process.cwd()) {
  const report = inspectClassGroupDistributionEligibility(root);
  if (!report.passed) {
    const error = new Error(
      `class-group distribution is not eligible: ${report.failures.join("; ")}. ${report.remedy}`,
    );
    error.code = "CLASS_GROUP_DISTRIBUTION_INELIGIBLE";
    error.report = report;
    throw error;
  }
  return report;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 0) {
    console.error("Usage: node scripts/release/class-group-distribution-eligibility.cjs");
    return 2;
  }
  const report = inspectClassGroupDistributionEligibility();
  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  inspectClassGroupDistributionEligibility,
  requireClassGroupDistributionEligibility,
  main,
};
