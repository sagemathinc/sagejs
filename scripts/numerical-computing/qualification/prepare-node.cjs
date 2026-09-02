#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { pretty, readJson, repositoryPath } = require("../common.cjs");
const { CAPABILITY_SCHEMA, validateCorpus } = require("../contracts.cjs");
const { bindCapabilityDraft, writeImmutableJson } = require("../receipt.cjs");
const { createBinding: createScipyOracleBinding } = require("./scipy-oracle.cjs");

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

function sameMembers(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function validateExecutableEnvelopeCoverage(spec, corpus) {
  const cases = new Map(corpus.cases.map((item) => [item.id, item]));
  for (const capability of spec.capabilities) {
    if ((capability.status ?? "available") !== "available") continue;
    const boundCases = capability.case_ids.map((id) => cases.get(id));
    const coversEarlyProduct = boundCases.some((item) =>
      item !== undefined && ["P0", "P1", "P2"].includes(item.program_phase));
    if (!coversEarlyProduct) continue;
    const requiredDimensions = Object.entries(capability.envelope ?? {})
      .filter(([dimension, members]) =>
        dimension !== "executable_coverage" && Array.isArray(members))
      .map(([dimension]) => dimension);
    if (requiredDimensions.length === 0) continue;
    const coverage = capability.envelope.executable_coverage;
    if (coverage === null || typeof coverage !== "object" || Array.isArray(coverage)) {
      throw new Error(`capability ${capability.id} lacks executable envelope coverage`);
    }
    if (!sameMembers(Object.keys(coverage), requiredDimensions)) {
      throw new Error(
        `capability ${capability.id} executable coverage dimensions differ from its envelope`,
      );
    }
    for (const dimension of requiredDimensions) {
      const envelopeMembers = capability.envelope[dimension];
      if (envelopeMembers.length === 0 ||
          envelopeMembers.some((member) => typeof member !== "string" || member.length === 0) ||
          new Set(envelopeMembers).size !== envelopeMembers.length) {
        throw new Error(`capability ${capability.id} has invalid ${dimension} members`);
      }
      const records = coverage[dimension];
      if (!Array.isArray(records) || records.length === 0) {
        throw new Error(`capability ${capability.id} does not bind ${dimension} to cases`);
      }
      const coveredMembers = [];
      for (const record of records) {
        if (record === null || typeof record !== "object" || Array.isArray(record) ||
            Object.keys(record).sort().join("\0") !==
              ["case_id", "check_id", "members"].sort().join("\0")) {
          throw new Error(
            `capability ${capability.id} ${dimension} coverage has an invalid record`,
          );
        }
        if (!capability.case_ids.includes(record.case_id)) {
          throw new Error(
            `capability ${capability.id} ${dimension} coverage names unbound case ${record.case_id}`,
          );
        }
        const item = cases.get(record.case_id);
        if (item === undefined || !item.required_capabilities.includes(capability.id)) {
          throw new Error(
            `case ${record.case_id} does not require covered capability ${capability.id}`,
          );
        }
        if (!Array.isArray(record.members) || record.members.length === 0 ||
            record.members.some((member) => typeof member !== "string" || member.length === 0) ||
            new Set(record.members).size !== record.members.length) {
          throw new Error(
            `capability ${capability.id} ${dimension} coverage record has invalid members`,
          );
        }
        const check = item.checks.find((candidate) => candidate.id === record.check_id);
        if (check === undefined || check.kind !== "deep-equal" ||
            check.evidence !== "validation" || !check.actual.startsWith("/values/") ||
            !sameMembers(check.expected?.literal ?? [], record.members)) {
          throw new Error(
            `capability ${capability.id} ${dimension} coverage check ${record.check_id} ` +
            "must validate the executed member set",
          );
        }
        coveredMembers.push(...record.members);
      }
      if (new Set(coveredMembers).size !== coveredMembers.length ||
          !sameMembers(coveredMembers, envelopeMembers)) {
        throw new Error(
          `capability ${capability.id} ${dimension} executable coverage differs from its envelope`,
        );
      }
    }
  }
}

function capabilityDraft(
  spec,
  corpus,
  subject = { kind: "node", name: "node", version: process.version, engine: null },
) {
  exactKeys("node capability spec", spec, ["schema", "backend", "capabilities"]);
  if (spec.schema !== "sagejs.numerical-node-capability-spec/v1") {
    throw new Error("unsupported node capability spec schema");
  }
  validateExecutableEnvelopeCoverage(spec, corpus);
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
    subject,
    capabilities,
  };
}

function nodeArtifactSpecifications({
  artifactPath, cminpackArtifactPath, nloptArtifactPath, scipyOracleBindingPath,
}) {
  return [
    `sagejs-dist=${artifactPath}`,
    `cminpack-wasm=${cminpackArtifactPath}`,
    `nlopt-wasm=${nloptArtifactPath}`,
    `scipy-oracle-binding=${scipyOracleBindingPath}`,
  ];
}

function prepare({
  root, corpusPath, adapterPath, specPath, artifactPath, cminpackArtifactPath,
  nloptArtifactPath, outputDirectory,
}) {
  const corpus = validateCorpus(readJson(repositoryPath(root, corpusPath, "corpus").absolute));
  const spec = readJson(repositoryPath(root, specPath, "capability spec").absolute);
  const draft = capabilityDraft(spec, corpus);
  const output = repositoryPath(root, outputDirectory, "output directory");
  fs.mkdirSync(output.absolute, { recursive: true });
  const scipyOracleBindingPath = `${output.relative}/scipy-oracle.json`;
  writeImmutableJson(
    path.join(root, scipyOracleBindingPath),
    createScipyOracleBinding(),
  );
  const draftPath = `${output.relative}/capability-draft.json`;
  fs.writeFileSync(path.join(root, draftPath), pretty(draft));
  const artifacts = nodeArtifactSpecifications({
    artifactPath, cminpackArtifactPath, nloptArtifactPath, scipyOracleBindingPath,
  });
  const manifest = bindCapabilityDraft({
    root,
    corpusPath,
    adapterPath,
    artifactSpecifications: artifacts,
    draftPath,
  });
  const manifestPath = `${output.relative}/capabilities.json`;
  writeImmutableJson(path.join(root, manifestPath), manifest);
  return { artifacts, draftPath, manifestPath, manifest, scipyOracleBindingPath };
}

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/prepare-node.cjs [options]

  --root ROOT            repository root (default: repository checkout)
  --corpus PATH          product corpus
  --adapter PATH         first-party Node adapter
  --spec PATH            authored capability specification
  --artifact PATH        built Sage.js dist directory (default: dist)
  --cminpack-artifact PATH
                         built cminpack.wasm file
  --nlopt-artifact PATH  NLopt Wasm used by the built Sage.js runtime
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
  const cminpackArtifactPath = value(
    argv,
    "--cminpack-artifact",
    "packages/flint-wasm/numerical/build/cminpack.wasm",
  );
  const nloptArtifactPath = value(
    argv,
    "--nlopt-artifact",
    "dist/numerical/nlopt-methods.wasm",
  );
  const prepared = prepare({
    root, corpusPath, adapterPath, specPath, artifactPath, cminpackArtifactPath,
    nloptArtifactPath, outputDirectory,
  });
  process.stdout.write(pretty({
    capability_manifest_id: prepared.manifest.id,
    capability_manifest: prepared.manifestPath,
    next: [
      "node scripts/numerical-computing/qualify.cjs run",
      `--corpus ${corpusPath}`,
      `--adapter ${adapterPath}`,
      `--capabilities ${prepared.manifestPath}`,
      ...prepared.artifacts.map((artifact) => `--artifact ${artifact}`),
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

module.exports = {
  capabilityDraft,
  main,
  nodeArtifactSpecifications,
  prepare,
  usage,
  validateExecutableEnvelopeCoverage,
};
