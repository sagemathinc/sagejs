#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentDigestPath,
  parseJsonText,
  readJson,
  repositoryPath,
  sha256,
} = require("../common.cjs");
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
const packageVersion = readJson(path.join(root, "package.json")).version;
const fullRuntimeTemplate = readJson(path.join(
  root, "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
));
const supplementalTemplate = readJson(path.join(
  root, "bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json",
));
const scipyCatalog = readJson(path.join(
  root, "bench/numerical-computing/qualification/scipy-oracle-catalog.json",
));
const INPUT_ROOT = "build/numerical-qualification";
const GATE_ROOT = `${INPUT_ROOT}/gate`;

function rowFiles(rowId) {
  const browser = rowId.startsWith("linux-x64-browser-");
  const directory = browser
    ? `${INPUT_ROOT}/browser/rows/${rowId}`
    : `${INPUT_ROOT}/platform/${rowId.replace(/-(node|npm|sea)$/, "")}/${rowId}`;
  let receipt;
  if (browser) {
    const suffix = rowId.slice("linux-x64-browser-".length);
    receipt = suffix === "worker" ? "worker-chromium.receipt.json" :
      `browser-${suffix}.receipt.json`;
  } else {
    receipt = `${rowId.match(/(node|npm|sea)$/)[1]}.receipt.json`;
  }
  return { manifest: `${directory}/capabilities.json`, receipt: `${directory}/${receipt}` };
}

const EXPECTED_ROWS = new Map(EXPECTED_ROW_IDS.map((rowId) => [rowId, rowFiles(rowId)]));
const EXPECTED_SUPPLEMENTAL = new Map([
  ["native-sanitizers", {
    schema: "sagejs.numerical-native-sanitizer-evidence/v1",
    path: `${INPUT_ROOT}/browser/supplemental/native-sanitizers.evidence.json`,
  }],
  ["wasm-destructive", {
    schema: "sagejs.numerical-wasm-destructive-evidence/v1",
    path: `${INPUT_ROOT}/browser/supplemental/wasm-destructive.evidence.json`,
  }],
  ["structural-performance", {
    schema: "sagejs.numerical-structural-performance-evidence/v1",
    path: `${INPUT_ROOT}/browser/supplemental/structural-performance.evidence.json`,
  }],
  ...[
    ["browser-memory-chromium", "memory-browser-chromium/browser-chromium.memory-evidence.json"],
    ["browser-memory-firefox", "memory-browser-firefox/browser-firefox.memory-evidence.json"],
    ["browser-memory-webkit", "memory-browser-webkit/browser-webkit.memory-evidence.json"],
    ["browser-memory-worker", "memory-worker-chromium/worker-chromium.memory-evidence.json"],
  ].map(([category, suffix]) => [category, {
    schema: "sagejs.numerical-browser-memory-evidence/v1",
    path: `${INPUT_ROOT}/browser/supplemental/${suffix}`,
  }]),
]);

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/authenticate-release-gate.cjs \\
  --candidate COMMIT --gate FILE --rebuilt-gate FILE [--public-npm-root FILE]

Authenticates the immutable final numerical release-gate document before a
publisher or deployment consumes it. The rebuilt gate must have been assembled
from the complete raw evidence artifact in the consuming candidate checkout.
Exact byte equality makes the raw 16-row and seven-record inventory, rather
than a recomputable compact content ID alone, the publication trust boundary.
`;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--candidate", "--gate", "--rebuilt-gate", "--public-npm-root"].includes(name)) {
      throw new Error(`unknown argument ${name}`);
    }
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2).replaceAll("-", "_");
    if (result[key] !== undefined) throw new Error(`${name} may appear only once`);
    result[key] = value;
  }
  if (!result.candidate || !result.gate || !result.rebuilt_gate) {
    throw new Error("--candidate, --gate, and --rebuilt-gate are required");
  }
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

function digest(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error(`${label} is not SHA-256`);
  return value;
}

function contentIdentifier(value, label) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value ?? "")) {
    throw new Error(`${label} is not a content ID`);
  }
  return value;
}

function canonicalRelative(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") ||
      value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value) ||
      value.startsWith("//") || value.split("/").some((part) => ["", ".", ".."].includes(part))) {
    throw new Error(`${label} is not a canonical repository-relative path`);
  }
  return value;
}

function compactFile(record, label, expectedPath, extraKeys = []) {
  exactKeys(record, [...extraKeys, "path", "sha256", "id"], label);
  if (canonicalRelative(record.path, `${label}.path`) !== expectedPath) {
    throw new Error(`${label} substitutes ${record.path} for ${expectedPath}`);
  }
  digest(record.sha256, `${label}.sha256`);
  contentIdentifier(record.id, `${label}.id`);
  return record;
}

function exactInventory(records, expectedKeys, key, label) {
  if (!Array.isArray(records) || records.length !== expectedKeys.length) {
    throw new Error(`${label} does not have the exact required length`);
  }
  const actual = records.map((record) => record?.[key]);
  if (new Set(actual).size !== actual.length ||
      canonicalJson([...actual].sort()) !== canonicalJson([...expectedKeys].sort())) {
    throw new Error(`${label} substitutes, duplicates, or omits a required identity`);
  }
  if (canonicalJson(actual) !== canonicalJson([...expectedKeys].sort())) {
    throw new Error(`${label} is not in canonical identity order`);
  }
}

function validateMatrixInventory(value) {
  exactInventory(value.matrix_receipts, EXPECTED_ROW_IDS, "row_id", "matrix receipts");
  exactInventory(value.capability_manifests, EXPECTED_ROW_IDS, "row_id", "capability manifests");
  const receiptPaths = new Set();
  const manifestPaths = new Set();
  const receiptDigests = new Set();
  const manifestDigests = new Set();
  const receiptIds = new Set();
  const manifestIds = new Set();
  for (const record of value.matrix_receipts) {
    const expected = EXPECTED_ROWS.get(record.row_id);
    compactFile(record, `matrix receipt ${record.row_id}`, expected.receipt, ["row_id"]);
    if (receiptPaths.has(record.path) || receiptDigests.has(record.sha256) || receiptIds.has(record.id)) {
      throw new Error("matrix receipts duplicate a path, digest, or content identity");
    }
    receiptPaths.add(record.path);
    receiptDigests.add(record.sha256);
    receiptIds.add(record.id);
  }
  for (const record of value.capability_manifests) {
    const expected = EXPECTED_ROWS.get(record.row_id);
    compactFile(record, `capability manifest ${record.row_id}`, expected.manifest, ["row_id"]);
    if (manifestPaths.has(record.path) || manifestDigests.has(record.sha256) ||
        manifestIds.has(record.id)) {
      throw new Error("capability manifests duplicate a path, digest, or content identity");
    }
    manifestPaths.add(record.path);
    manifestDigests.add(record.sha256);
    manifestIds.add(record.id);
  }
}

function validateSupplementalInventory(value) {
  exactKeys(value.supplemental_report, [
    "id", "template_sha256", "rows", "requirement_ids",
  ], "supplemental report binding");
  contentIdentifier(value.supplemental_report.id, "supplemental report binding.id");
  digest(value.supplemental_report.template_sha256, "supplemental report template digest");
  const requirementIds = supplementalTemplate.requirements.map((item) => item.id).sort();
  if (value.supplemental_report.rows !== requirementIds.length ||
      canonicalJson(value.supplemental_report.requirement_ids) !== canonicalJson(requirementIds)) {
    throw new Error("supplemental report does not bind the exact five requirement identities");
  }
  exactInventory(
    value.supplemental_evidence, [...EXPECTED_SUPPLEMENTAL.keys()].sort(), "category",
    "supplemental evidence",
  );
  const paths = new Set();
  const digests = new Set();
  const ids = new Set();
  for (const record of value.supplemental_evidence) {
    const expected = EXPECTED_SUPPLEMENTAL.get(record.category);
    compactFile(record, `supplemental evidence ${record.category}`, expected.path, [
      "category", "schema",
    ]);
    if (record.schema !== expected.schema) {
      throw new Error(`supplemental evidence ${record.category} has the wrong schema`);
    }
    if (paths.has(record.path) || digests.has(record.sha256) || ids.has(record.id)) {
      throw new Error("supplemental evidence duplicates a path, digest, or content identity");
    }
    paths.add(record.path);
    digests.add(record.sha256);
    ids.add(record.id);
  }
}

function expectedSubjectEnvelope(platform) {
  return fullRuntimeTemplate.rows
    .filter((row) => row.platform === platform)
    .map((row) => ({
      kind: row.subject.kind,
      name: row.subject.name,
      engine: row.subject.engine,
    }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

function validateScipyCoherence(value) {
  exactKeys(value.scipy_oracle_coherence, [
    "catalog_id", "platform_bindings",
  ], "SciPy oracle coherence");
  contentIdentifier(value.scipy_oracle_coherence.catalog_id, "SciPy oracle catalog ID");
  if (value.scipy_oracle_coherence.catalog_id !== scipyCatalog.id) {
    throw new Error("SciPy oracle coherence does not bind the source-current catalog");
  }
  const bindings = value.scipy_oracle_coherence.platform_bindings;
  exactInventory(bindings, EXPECTED_PLATFORMS, "platform", "SciPy platform bindings");
  const bindingIds = new Set();
  const nodeVersions = new Set();
  const chromiumVersions = new Set();
  for (const binding of bindings) {
    exactKeys(binding, ["platform", "binding_id", "subjects"], `SciPy ${binding.platform}`);
    contentIdentifier(binding.binding_id, `SciPy ${binding.platform}.binding_id`);
    if (bindingIds.has(binding.binding_id)) throw new Error("SciPy binding IDs must be unique");
    bindingIds.add(binding.binding_id);
    if (!Array.isArray(binding.subjects)) throw new Error(`SciPy ${binding.platform} subjects missing`);
    const envelopes = [];
    const subjectKeys = new Set();
    for (const subject of binding.subjects) {
      exactKeys(subject, ["kind", "name", "version", "engine"], "SciPy oracle subject");
      if (typeof subject.version !== "string" || subject.version.length === 0) {
        throw new Error("SciPy oracle subject version must be nonempty");
      }
      if ((["npm", "sea"].includes(subject.kind)) && subject.version !== packageVersion) {
        throw new Error(`SciPy ${subject.kind} subject does not match candidate package version`);
      }
      if (subject.kind === "node") nodeVersions.add(subject.version);
      if ((subject.kind === "browser" && subject.engine === "chromium") ||
          subject.kind === "worker") chromiumVersions.add(subject.version);
      const envelope = { kind: subject.kind, name: subject.name, engine: subject.engine };
      const key = canonicalJson(envelope);
      if (subjectKeys.has(key)) throw new Error(`SciPy ${binding.platform} duplicates a subject`);
      subjectKeys.add(key);
      envelopes.push(envelope);
    }
    envelopes.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    if (canonicalJson(envelopes) !== canonicalJson(expectedSubjectEnvelope(binding.platform))) {
      throw new Error(`SciPy ${binding.platform} substitutes a canonical subject`);
    }
    const sortedSubjects = [...binding.subjects]
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    if (canonicalJson(binding.subjects) !== canonicalJson(sortedSubjects)) {
      throw new Error(`SciPy ${binding.platform} subjects are not canonically ordered`);
    }
  }
  if (nodeVersions.size !== 1 || chromiumVersions.size !== 1) {
    throw new Error("SciPy subject versions do not identify one Node and Chromium runtime");
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
  compactFile(value.matrix_report, "matrix report binding", `${GATE_ROOT}/full-runtime.report.json`);
  exactKeys(value.matrix_policy, ["path", "sha256", "id", "rows"], "matrix policy binding");
  if (canonicalRelative(value.matrix_policy.path, "matrix policy path") !==
      `${GATE_ROOT}/full-runtime.policy.json`) {
    throw new Error("matrix policy binding has the wrong path");
  }
  digest(value.matrix_policy.sha256, "matrix policy digest");
  if (value.matrix_policy.id !== fullRuntimeTemplate.id) {
    throw new Error("matrix policy binding has the wrong policy identity");
  }
  exactKeys(value.matrix_template, ["path", "sha256", "id", "rows"], "matrix template binding");
  canonicalRelative(value.matrix_template.path, "matrix template path");
  if (value.matrix_template.path !==
      "bench/numerical-computing/qualification/matrix/full-runtime.template.json" ||
      value.matrix_template.id !== fullRuntimeTemplate.id ||
      value.matrix_template.rows !== EXPECTED_ROW_IDS.length) {
    throw new Error("matrix template binding does not identify the canonical 16-row template");
  }
  digest(value.matrix_template.sha256, "matrix template digest");
  if (value.matrix_template.sha256 !== sha256(fs.readFileSync(path.join(
    root, "bench/numerical-computing/qualification/matrix/full-runtime.template.json",
  ))) || value.supplemental_report.template_sha256 !== sha256(canonicalJson(supplementalTemplate))) {
    throw new Error("release gate template digests are not source-current");
  }
  if (value.matrix_policy.rows !== EXPECTED_ROW_IDS.length) {
    throw new Error("matrix policy does not bind exactly 16 rows");
  }
  validateMatrixInventory(value);
  validateSupplementalInventory(value);
  validateScipyCoherence(value);
  exactKeys(value.artifact_coherence, [
    "cminpack_content_sha256", "nlopt_content_sha256", "linux_sea_content_sha256",
    "browser_distribution_content_sha256", "public_npm_root_content_sha256",
  ], "numerical release gate artifact coherence");
  for (const digest of Object.values(value.artifact_coherence)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error("numerical release gate artifact coherence contains a non-SHA-256 digest");
    }
  }
  return value;
}

function authenticatePublicNpmRoot(value, filename) {
  const digest = contentDigestPath(root, filename, "public npm root archive");
  if (digest !== value.artifact_coherence.public_npm_root_content_sha256) {
    throw new Error("public npm root archive differs from the four qualified npm rows");
  }
  return digest;
}

function authenticateRebuiltGate(value, rebuilt, candidate) {
  authenticate(value, candidate);
  authenticate(rebuilt, candidate);
  if (canonicalJson(value) !== canonicalJson(rebuilt)) {
    throw new Error("published numerical release gate differs from the raw-evidence rebuild");
  }
  return value;
}

function readGate(filename, label) {
  const resolved = repositoryPath(root, filename, label);
  const status = fs.lstatSync(resolved.absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${label} must be a non-symlink regular file`);
  }
  const bytes = fs.readFileSync(resolved.absolute);
  return {
    bytes,
    value: parseJsonText(bytes.toString("utf8"), label),
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const gate = readGate(options.gate, "numerical release gate");
  const rebuilt = readGate(options.rebuilt_gate, "raw-evidence rebuilt numerical release gate");
  authenticateRebuiltGate(gate.value, rebuilt.value, options.candidate);
  if (!gate.bytes.equals(rebuilt.bytes)) {
    throw new Error("published numerical release gate bytes differ from the raw-evidence rebuild");
  }
  if (options.public_npm_root !== undefined) {
    authenticatePublicNpmRoot(gate.value, options.public_npm_root);
  }
  process.stdout.write(`passed: authenticated raw-evidence numerical release gate ${gate.value.id}\n`);
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

module.exports = {
  authenticate, authenticatePublicNpmRoot, authenticateRebuiltGate,
  main, parseArguments, usage,
};
