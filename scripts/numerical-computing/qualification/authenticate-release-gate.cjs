#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parseJsonText, repositoryPath } = require("../common.cjs");
const {
  RELEASE_GATE_SCHEMA,
  verifyContentId,
} = require("./supplemental-report.cjs");

const EXPECTED_PLATFORMS = [
  "linux-x64", "linux-arm64", "macos-arm64", "windows-x64",
];
const EXPECTED_ROW_IDS = [
  ...EXPECTED_PLATFORMS.flatMap((platform) =>
    ["node", "npm", "sea"].map((kind) => `${platform}-${kind}`)),
  "linux-x64-browser-chromium",
  "linux-x64-browser-firefox",
  "linux-x64-browser-webkit",
  "linux-x64-browser-worker",
].sort();
const root = path.resolve(__dirname, "..", "..", "..");

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/authenticate-release-gate.cjs \\
  --candidate COMMIT --gate FILE

Authenticates the immutable final numerical release-gate document before a
publisher or deployment consumes it. This checks the content ID and the exact
16-row, five-category/seven-record production inventory.
`;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--candidate", "--gate"].includes(name)) throw new Error(`unknown argument ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2);
    if (result[key] !== undefined) throw new Error(`${name} may appear only once`);
    result[key] = value;
  }
  if (!result.candidate || !result.gate) throw new Error("--candidate and --gate are required");
  if (!/^[0-9a-f]{40}$/.test(result.candidate)) throw new Error("--candidate must be a full commit SHA");
  return { help: false, ...result };
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has an unexpected field inventory`);
  }
}

function authenticate(value, candidate) {
  verifyContentId(value, "numerical release gate");
  exactKeys(value, [
    "schema", "candidate", "status", "matrix_report", "matrix_receipts",
    "capability_manifests", "matrix_policy", "matrix_template",
    "supplemental_report", "supplemental_evidence", "artifact_coherence",
    "scipy_oracle_coherence", "id",
  ], "numerical release gate");
  if (value.schema !== RELEASE_GATE_SCHEMA || value.status !== "passed" ||
      value.candidate !== candidate) {
    throw new Error("numerical release gate is not passing for the requested candidate");
  }
  if (value.matrix_receipts?.length !== 16 ||
      value.capability_manifests?.length !== 16 ||
      value.matrix_policy?.rows !== 16 || value.matrix_template?.rows !== 16) {
    throw new Error("numerical release gate does not contain the exact 16-row matrix");
  }
  const rowIds = value.capability_manifests.map((record) => record.row_id);
  if (JSON.stringify([...rowIds].sort()) !== JSON.stringify(EXPECTED_ROW_IDS)) {
    throw new Error("numerical release gate substitutes or duplicates a required row");
  }
  if (value.supplemental_report?.rows !== 5 || value.supplemental_evidence?.length !== 7) {
    throw new Error("numerical release gate lacks the five supplemental categories");
  }
  const platforms = value.scipy_oracle_coherence?.platform_bindings
    ?.map((record) => record.platform).sort();
  if (JSON.stringify(platforms) !== JSON.stringify([...EXPECTED_PLATFORMS].sort())) {
    throw new Error("numerical release gate lacks one hermetic oracle per platform");
  }
  const expectedSubjects = new Map([
    ["linux-x64", 7], ["linux-arm64", 3], ["macos-arm64", 3], ["windows-x64", 3],
  ]);
  for (const binding of value.scipy_oracle_coherence.platform_bindings) {
    if (binding.subjects?.length !== expectedSubjects.get(binding.platform)) {
      throw new Error(`numerical release gate has the wrong oracle subjects for ${binding.platform}`);
    }
  }
  exactKeys(value.artifact_coherence, [
    "cminpack_content_sha256", "nlopt_content_sha256", "linux_sea_content_sha256",
    "browser_distribution_content_sha256",
  ], "numerical release gate artifact coherence");
  for (const digest of Object.values(value.artifact_coherence)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error("numerical release gate artifact coherence contains a non-SHA-256 digest");
    }
  }
  return value;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const gate = repositoryPath(root, options.gate, "numerical release gate");
  const status = fs.lstatSync(gate.absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error("--gate must be a non-symlink regular file");
  }
  const value = parseJsonText(fs.readFileSync(gate.absolute, "utf8"), "numerical release gate");
  authenticate(value, options.candidate);
  process.stdout.write(`passed: authenticated numerical release gate ${value.id}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { authenticate, main, parseArguments, usage };
