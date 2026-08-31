#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { pretty, readJson, repositoryPath } = require("../common.cjs");
const { CAPABILITY_SCHEMA, validateCorpus } = require("../contracts.cjs");
const { bindCapabilityDraft, writeImmutableJson } = require("../receipt.cjs");

const defaultRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const DEFAULT_ADAPTER = "bench/numerical-computing/qualification/node-adapter.cjs";
const DEFAULT_SPEC = "bench/numerical-computing/qualification/capabilities/node-capability-spec.json";

function value(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function exactKeys(label, record, required) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be an object`);
  }
  const expected = new Set(required);
  for (const name of required) if (!Object.hasOwn(record, name)) throw new Error(`${label} missing ${name}`);
  for (const name of Object.keys(record)) if (!expected.has(name)) throw new Error(`${label} unknown ${name}`);
}

function capabilityDraft(spec, corpus) {
  exactKeys("node capability spec", spec, ["schema", "backend", "capabilities"]);
  if (spec.schema !== "sagejs.numerical-node-capability-spec/v1") {
    throw new Error("unsupported node capability spec schema");
  }
  const caseIds = new Set(corpus.cases.map((item) => item.id));
  const capabilities = spec.capabilities.map((entry) => {
    const status = entry.status ?? "available";
    if (!Array.isArray(entry.case_ids)) throw new Error(`capability ${entry.id} needs case_ids`);
    for (const id of entry.case_ids) {
      if (!caseIds.has(id)) throw new Error(`capability ${entry.id} names unknown case ${id}`);
    }
    return {
      id: entry.id,
      status,
      reason: status === "available" ? null : entry.reason,
      case_ids: [...entry.case_ids].sort(),
      envelope: entry.envelope,
    };
  });
  return {
    schema: CAPABILITY_SCHEMA,
    backend: spec.backend,
    subject: { kind: "node", name: "node", version: process.version, engine: null },
    capabilities,
  };
}

function prepare({ root, corpusPath, adapterPath, specPath, artifactPath, outputDirectory }) {
  const corpus = validateCorpus(readJson(repositoryPath(root, corpusPath, "corpus").absolute));
  const spec = readJson(repositoryPath(root, specPath, "capability spec").absolute);
  const draft = capabilityDraft(spec, corpus);
  const output = repositoryPath(root, outputDirectory, "output directory");
  fs.mkdirSync(output.absolute, { recursive: true });
  const draftPath = `${output.relative}/capability-draft.json`;
  fs.writeFileSync(path.join(root, draftPath), pretty(draft));
  const manifest = bindCapabilityDraft({
    root,
    corpusPath,
    adapterPath,
    artifactSpecifications: [`sagejs-dist=${artifactPath}`],
    draftPath,
  });
  const manifestPath = `${output.relative}/capabilities.json`;
  writeImmutableJson(path.join(root, manifestPath), manifest);
  return { draftPath, manifestPath, manifest };
}

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/prepare-node.cjs [options]

  --root ROOT            repository root (default: repository checkout)
  --corpus PATH          product corpus
  --adapter PATH         first-party Node adapter
  --spec PATH            authored capability specification
  --artifact PATH        built Sage.js dist directory (default: dist)
  --output DIRECTORY     empty output directory (required)

The generated capability manifest is immutable. Use a fresh output directory
for every source/artifact candidate; do not delete and replace an old binding.
`;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    return 0;
  }
  const outputDirectory = value(argv, "--output");
  if (outputDirectory === null) throw new Error("--output is required");
  const root = path.resolve(value(argv, "--root", defaultRoot));
  const corpusPath = value(argv, "--corpus", DEFAULT_CORPUS);
  const adapterPath = value(argv, "--adapter", DEFAULT_ADAPTER);
  const specPath = value(argv, "--spec", DEFAULT_SPEC);
  const artifactPath = value(argv, "--artifact", "dist");
  const prepared = prepare({
    root, corpusPath, adapterPath, specPath, artifactPath, outputDirectory,
  });
  process.stdout.write(pretty({
    capability_manifest_id: prepared.manifest.id,
    capability_manifest: prepared.manifestPath,
    next: [
      "node scripts/numerical-computing/qualify.cjs run",
      `--corpus ${corpusPath}`,
      `--adapter ${adapterPath}`,
      `--capabilities ${prepared.manifestPath}`,
      `--artifact sagejs-dist=${artifactPath}`,
      `--output ${outputDirectory}/node.receipt.json`,
    ].join(" "),
  }));
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

module.exports = { capabilityDraft, main, prepare, usage };
