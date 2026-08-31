#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { pretty, readJson, repositoryPath } = require("../common.cjs");
const { validateCorpus } = require("../contracts.cjs");
const { bindCapabilityDraft, writeImmutableJson } = require("../receipt.cjs");
const { capabilityDraft } = require("./prepare-node.cjs");

const defaultRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const DEFAULT_ADAPTER = "bench/numerical-computing/qualification/package-adapter.cjs";
const DEFAULT_SPEC = "bench/numerical-computing/qualification/capabilities/node-capability-spec.json";

function value(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function usage() {
  return `Usage:
  node scripts/numerical-computing/qualification/prepare-package.cjs npm \\
    --root-archive FILE --platform-archive FILE --output DIRECTORY
  node scripts/numerical-computing/qualification/prepare-package.cjs sea \\
    --executable FILE --version VERSION --output DIRECTORY

The command binds the complete product corpus and capability draft to exact
package or relocated-SEA artifacts. Run it on the matching persistent platform;
it never substitutes another platform or creates a receipt.
`;
}

function prepare(argv) {
  const kind = argv[0];
  if (!["npm", "sea"].includes(kind)) throw new Error("first argument must be npm or sea");
  const root = path.resolve(value(argv, "--root", defaultRoot));
  const corpusPath = value(argv, "--corpus", DEFAULT_CORPUS);
  const adapterPath = value(argv, "--adapter", DEFAULT_ADAPTER);
  const specPath = value(argv, "--spec", DEFAULT_SPEC);
  const outputDirectory = value(argv, "--output");
  if (outputDirectory === null) throw new Error("--output is required");
  const version = value(argv, "--version");
  if (version === null) throw new Error("package preparation requires --version");
  const subject = {
    kind,
    name: kind === "npm" ? "@sagemath/sagejs" : "sagejs",
    version,
    engine: null,
  };
  const artifacts = kind === "npm"
    ? [
      `npm-root-tarball=${value(argv, "--root-archive")}`,
      `npm-platform-tarball=${value(argv, "--platform-archive")}`,
    ]
    : [`sea-executable=${value(argv, "--executable")}`];
  if (artifacts.some((item) => item.endsWith("=null"))) {
    throw new Error(kind === "npm"
      ? "npm preparation requires --root-archive and --platform-archive"
      : "SEA preparation requires --executable");
  }
  const corpus = validateCorpus(readJson(repositoryPath(root, corpusPath, "corpus").absolute));
  const spec = readJson(repositoryPath(root, specPath, "capability spec").absolute);
  const draft = capabilityDraft(spec, corpus, subject);
  const output = repositoryPath(root, outputDirectory, "output directory");
  fs.mkdirSync(output.absolute, { recursive: true });
  const draftPath = `${output.relative}/capability-draft.json`;
  fs.writeFileSync(path.join(root, draftPath), pretty(draft));
  const manifest = bindCapabilityDraft({
    root, corpusPath, adapterPath, artifactSpecifications: artifacts, draftPath,
  });
  const manifestPath = `${output.relative}/capabilities.json`;
  writeImmutableJson(path.join(root, manifestPath), manifest);
  return { kind, corpusPath, adapterPath, artifacts, manifest, manifestPath, outputDirectory };
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    return 0;
  }
  const prepared = prepare(argv);
  process.stdout.write(pretty({
    capability_manifest_id: prepared.manifest.id,
    capability_manifest: prepared.manifestPath,
    next: [
      "node scripts/numerical-computing/qualify.cjs run",
      `--corpus ${prepared.corpusPath}`,
      `--adapter ${prepared.adapterPath}`,
      `--capabilities ${prepared.manifestPath}`,
      ...prepared.artifacts.flatMap((item) => ["--artifact", item]),
      `--output ${prepared.outputDirectory}/${prepared.kind}.receipt.json`,
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

module.exports = { prepare };
