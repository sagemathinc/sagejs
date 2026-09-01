#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const surfacePath = join(root, "docs/numerical-computing/surface.json");
const diagnosticsPath = join(root, "docs/numerical-computing/diagnostics.json");
const classifications = new Set([
  "faithful",
  "translated",
  "extension",
  "unsupported",
]);
const phaseByDomain = Object.freeze({
  roots: "P1",
  approximation: "P2",
  integration: "P2",
  linear_algebra: "P2",
  optimization: "P3",
  nonlinear_systems: "P3",
  least_squares: "P3",
  fitting: "P3",
  ode: "P4",
  sweeps: "P4",
  spectral: "P5",
  statistics: "P5",
});

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function phase(domain) {
  const result = phaseByDomain[domain];
  if (result === undefined) {
    throw new Error(`unclassified numerical product phase for domain ${domain}`);
  }
  return result;
}

function implementationTargets(capability) {
  const platforms = [];
  const runtimes = [];
  const methods = capability.methods;
  if (methods && !Array.isArray(methods) && typeof methods === "object") {
    for (const record of Object.values(methods)) {
      if (!record || typeof record !== "object") continue;
      const targets = record.implementation_targets;
      if (!targets || typeof targets !== "object") continue;
      if (Array.isArray(targets.platforms)) platforms.push(...targets.platforms);
      if (Array.isArray(targets.runtimes)) runtimes.push(...targets.runtimes);
    }
  }
  return {
    platforms: sortedUnique(platforms),
    runtimes: sortedUnique(runtimes),
  };
}

function receiptQualification(capability) {
  const platforms = [];
  const runtimes = [];
  const receiptSha256 = [];
  const methods = capability.methods;
  if (methods && !Array.isArray(methods) && typeof methods === "object") {
    for (const record of Object.values(methods)) {
      if (!record || typeof record !== "object") continue;
      const qualification = record.receipt_qualification;
      if (!qualification || qualification.status !== "receipt_qualified") continue;
      if (Array.isArray(qualification.platforms)) {
        platforms.push(...qualification.platforms);
      }
      if (Array.isArray(qualification.runtimes)) {
        runtimes.push(...qualification.runtimes);
      }
      if (Array.isArray(qualification.receipt_sha256)) {
        receiptSha256.push(...qualification.receipt_sha256);
      }
    }
  }
  return {
    platforms: sortedUnique(platforms),
    runtimes: sortedUnique(runtimes),
    receipt_sha256: sortedUnique(receiptSha256),
  };
}

function loadLiveSurface() {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const source = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.numerics import capabilities
print(json.dumps(capabilities(), sort_keys=True, separators=(",", ":")))
`;
  const result = spawnSync(python, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `could not inspect numerical capabilities:\n${result.stderr || result.stdout}`,
    );
  }
  const registry = JSON.parse(result.stdout);
  if (registry.schema_version !== 3) {
    throw new Error(
      `unsupported live numerical capability schema ${registry.schema_version}`,
    );
  }
  const operations = Object.entries(registry.operation_index).map(([id, entry]) => {
    const capability = entry.capability;
    const contract = capability.surface;
    if (!contract || !classifications.has(contract.classification)) {
      throw new Error(`live numerical capability ${id} has no surface classification`);
    }
    return {
      id,
      phase: phase(entry.domain),
      classification: contract.classification,
      status: contract.status,
      methods: [...contract.methods].sort(),
      implementation_targets: implementationTargets(capability),
      receipt_qualification: receiptQualification(capability),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const frontends = Object.entries(registry.frontend_index).map(([id, entry]) => {
    const operation = entry.operation;
    return {
      id,
      phase: phase(operation.domain),
      classification: entry.classification,
      status: "implemented",
      capability_operations: [...entry.capability_operations].sort(),
      source_languages: [...entry.source_languages].sort(),
      target_languages: [...entry.target_languages].sort(),
      round_trip_languages: [...entry.round_trip_languages].sort(),
      executable: entry.executable,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    schema_version: 2,
    classifications: [...classifications],
    capability_operations: operations,
    frontend_operations: frontends,
  };
}

function loadLiveDiagnostics() {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const source = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.numerics.diagnostics import diagnostic_registry
print(json.dumps(diagnostic_registry(), sort_keys=True, separators=(",", ":")))
`;
  const result = spawnSync(python, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `could not inspect numerical diagnostics:\n${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout);
}

function validateRows(label, retained, live) {
  if (!Array.isArray(retained)) throw new Error(`${label} must be an array`);
  const ids = retained.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`duplicate ${label} operation`);
  }
  for (const item of retained) {
    if (!classifications.has(item.classification)) {
      throw new Error(`unclassified ${label} operation: ${item.id}`);
    }
    if (!new Set(["implemented", "unsupported"]).has(item.status)) {
      throw new Error(`ambiguous ${label} operation status: ${item.id}`);
    }
  }
  assert.deepEqual(
    retained,
    live,
    `${label} ledger is stale; run pnpm architecture:numerics -- --write`,
  );
}

function validateSurface(retained, live) {
  if (retained.schema_version !== 2) {
    throw new Error("unsupported numerical surface schema");
  }
  assert.deepEqual(retained.classifications, live.classifications);
  validateRows(
    "capability",
    retained.capability_operations,
    live.capability_operations,
  );
  validateRows("frontend", retained.frontend_operations, live.frontend_operations);
}

function validateSupportingDocuments(liveDiagnostics) {
  const diagnostics = JSON.parse(
    readFileSync(diagnosticsPath, "utf8"),
  );
  const inventory = readFileSync(
    join(root, "docs/numerical-computing/inventory.md"),
    "utf8",
  );
  assert.deepEqual(
    diagnostics,
    { schema_version: 1, diagnostics: liveDiagnostics },
    "numerical diagnostic ledger is stale; run pnpm architecture:numerics -- --write",
  );
  for (const required of [
    "Existing Sage.js runtime",
    "Language frontends",
    "External reference systems",
    "Compatibility meaning",
  ]) {
    if (!inventory.includes(`## ${required}`)) {
      throw new Error(`numerical inventory is missing ${required}`);
    }
  }
  return diagnostics.diagnostics.length;
}

function main() {
  const live = loadLiveSurface();
  const liveDiagnostics = loadLiveDiagnostics();
  if (process.argv.slice(2).includes("--write")) {
    writeFileSync(surfacePath, JSON.stringify(live, null, 2) + "\n");
    writeFileSync(
      diagnosticsPath,
      JSON.stringify({ schema_version: 1, diagnostics: liveDiagnostics }, null, 2) + "\n",
    );
  }
  const retained = JSON.parse(readFileSync(surfacePath, "utf8"));
  validateSurface(retained, live);
  const diagnosticCount = validateSupportingDocuments(liveDiagnostics);
  console.log(
    `Numerical surface is exhaustive (${live.capability_operations.length} capabilities, ` +
      `${live.frontend_operations.length} frontends, ${diagnosticCount} diagnostics).`,
  );
}

if (require.main === module) main();

module.exports = {
  loadLiveDiagnostics,
  loadLiveSurface,
  validateSupportingDocuments,
  validateSurface,
};
