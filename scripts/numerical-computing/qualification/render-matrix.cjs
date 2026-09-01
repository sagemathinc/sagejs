#!/usr/bin/env node
"use strict";

const path = require("node:path");

const { readJson } = require("../common.cjs");
const {
  POLICY_SCHEMA,
  validateCapabilityManifest,
  validateCorpus,
  validateMatrixPolicy,
} = require("../contracts.cjs");
const { writeImmutableJson } = require("../receipt.cjs");

const defaultRoot = path.resolve(__dirname, "..", "..", "..");

function value(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function values(argv, name) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
      result.push(argv[index + 1]);
      index += 1;
    }
  }
  return result;
}

function exactKeys(label, record, required, optional = []) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be an object`);
  }
  const expected = new Set([...required, ...optional]);
  for (const name of required) if (!Object.hasOwn(record, name)) throw new Error(`${label} missing ${name}`);
  for (const name of Object.keys(record)) if (!expected.has(name)) throw new Error(`${label} unknown ${name}`);
}

function requiredMemoryScope(subjectKind) {
  if (subjectKind === "node") return "collector_process";
  if (["npm", "sea", "browser", "worker"].includes(subjectKind)) {
    return "process_tree";
  }
  throw new Error(`no qualified memory scope for subject kind ${subjectKind}`);
}

function manifestArguments(specifications) {
  const result = new Map();
  for (const specification of specifications) {
    const separator = specification.indexOf("=");
    if (separator < 1 || separator === specification.length - 1) {
      throw new Error("--manifest must be ROW_ID=PATH");
    }
    const id = specification.slice(0, separator);
    if (result.has(id)) throw new Error(`duplicate manifest for ${id}`);
    result.set(id, specification.slice(separator + 1));
  }
  return result;
}

function renderMatrix(template, corpus, manifests) {
  exactKeys("matrix template", template, [
    "schema", "id", "description", "require_clean", "required_program_phases",
    "required_case_layers", "required_capabilities", "rows",
  ]);
  if (template.schema !== "sagejs.numerical-qualification-matrix-template/v1") {
    throw new Error("unsupported numerical matrix template schema");
  }
  const rows = template.rows.map((row) => {
    exactKeys(
      `matrix row ${row.id}`,
      row,
      ["id", "platform", "subject"],
      ["required_memory_scope"],
    );
    exactKeys(`matrix row ${row.id}.subject`, row.subject, ["kind", "name", "engine"]);
    const manifest = manifests.get(row.id);
    if (manifest === undefined) throw new Error(`missing bound capability manifest for ${row.id}`);
    if (manifest.subject.kind !== row.subject.kind || manifest.subject.name !== row.subject.name ||
        manifest.subject.engine !== row.subject.engine) {
      throw new Error(`manifest subject does not match template row ${row.id}`);
    }
    const capabilities = new Map(manifest.capabilities.map((item) => [item.id, item]));
    for (const id of template.required_capabilities) {
      if (capabilities.get(id)?.status !== "available") {
        throw new Error(`row ${row.id} lacks available capability ${id}`);
      }
    }
    const memoryScope = requiredMemoryScope(manifest.subject.kind);
    if (row.required_memory_scope !== undefined &&
        row.required_memory_scope !== memoryScope) {
      throw new Error(
        `row ${row.id} requires ${row.required_memory_scope} memory, ` +
        `but ${manifest.subject.kind} must use ${memoryScope}`,
      );
    }
    return {
      id: row.id,
      match: {
        corpus_id: corpus.id,
        corpus_sha256: manifest.bindings.corpus_sha256,
        source_bundle_sha256: manifest.bindings.source_bundle_sha256,
        capability_manifest_id: manifest.id,
        backend_id: manifest.backend.id,
        backend_version: manifest.backend.version,
        platform: row.platform,
        subject_kind: manifest.subject.kind,
        subject_name: manifest.subject.name,
        subject_version: manifest.subject.version,
        subject_engine: manifest.subject.engine,
      },
      required_program_phases: template.required_program_phases,
      required_case_layers: template.required_case_layers,
      required_capabilities: template.required_capabilities,
      required_artifacts: manifest.bindings.artifacts,
      required_memory_scope: memoryScope,
    };
  });
  const sourceHashes = new Set(rows.map((row) => row.match.source_bundle_sha256));
  const corpusHashes = new Set(rows.map((row) => row.match.corpus_sha256));
  if (sourceHashes.size !== 1 || corpusHashes.size !== 1) {
    throw new Error("matrix rows do not bind one exact corpus and source closure");
  }
  return validateMatrixPolicy({
    schema: POLICY_SCHEMA,
    id: template.id,
    description: template.description,
    require_clean: template.require_clean,
    rows,
  });
}

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/render-matrix.cjs \\
  --template FILE --corpus FILE --manifest ROW_ID=FILE... --output FILE [--root ROOT]

Every reviewed template row requires its own source/artifact-bound capability
manifest. Missing rows are rejected here; after rendering, the generic report
command represents absent run receipts as missing and exits nonzero.
`;
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    return 0;
  }
  const root = path.resolve(value(argv, "--root", defaultRoot));
  const templatePath = value(argv, "--template");
  const corpusPath = value(argv, "--corpus");
  const outputPath = value(argv, "--output");
  if (templatePath === null || corpusPath === null || outputPath === null) {
    throw new Error("--template, --corpus, and --output are required");
  }
  const corpus = validateCorpus(readJson(path.resolve(root, corpusPath)));
  const provided = manifestArguments(values(argv, "--manifest"));
  const manifests = new Map();
  for (const [id, filename] of provided) {
    manifests.set(id, validateCapabilityManifest(readJson(path.resolve(root, filename)), corpus));
  }
  const policy = renderMatrix(readJson(path.resolve(root, templatePath)), corpus, manifests);
  writeImmutableJson(path.resolve(root, outputPath), policy);
  process.stdout.write(`${policy.id}: ${policy.rows.length} exact required rows\n`);
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

module.exports = { main, manifestArguments, renderMatrix, requiredMemoryScope, usage };
