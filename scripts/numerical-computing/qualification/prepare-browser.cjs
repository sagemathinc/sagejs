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
const DEFAULT_ADAPTER = "bench/numerical-computing/qualification/browser-adapter.cjs";
const DEFAULT_SPEC = "bench/numerical-computing/qualification/capabilities/node-capability-spec.json";

function value(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function subjectFor(kind, engine, version) {
  if (!['browser', 'worker'].includes(kind)) throw new Error("--kind must be browser or worker");
  if (!['chromium', 'firefox', 'webkit'].includes(engine)) {
    throw new Error("--engine must be chromium, firefox, or webkit");
  }
  return kind === "browser"
    ? { kind, name: "playwright-browser", version, engine }
    : { kind, name: "sagejs-browser-worker", version, engine: null };
}

async function prepare({
  root, corpusPath, adapterPath, specPath, artifactPath, cminpackArtifactPath,
  nloptArtifactPath, outputDirectory, kind, engine,
}) {
  const corpus = validateCorpus(readJson(repositoryPath(root, corpusPath, "corpus").absolute));
  const spec = readJson(repositoryPath(root, specPath, "capability spec").absolute);
  const adapter = require(repositoryPath(root, adapterPath, "adapter").absolute);
  const launched = await adapter._testing.launchBrowser(engine);
  let version;
  try {
    version = launched.version;
  } finally {
    await launched.browser.close();
  }
  const subject = subjectFor(kind, engine, version);
  const draft = capabilityDraft(spec, corpus, subject);
  const output = repositoryPath(root, outputDirectory, "output directory");
  fs.mkdirSync(output.absolute, { recursive: true });
  const draftPath = `${output.relative}/capability-draft.json`;
  fs.writeFileSync(path.join(root, draftPath), pretty(draft));
  const manifest = bindCapabilityDraft({
    root,
    corpusPath,
    adapterPath,
    artifactSpecifications: [
      `sagejs-browser=${artifactPath}`,
      `cminpack-wasm=${cminpackArtifactPath}`,
      `nlopt-wasm=${nloptArtifactPath}`,
    ],
    draftPath,
  });
  const manifestPath = `${output.relative}/capabilities.json`;
  writeImmutableJson(path.join(root, manifestPath), manifest);
  return { draftPath, manifestPath, manifest, engine };
}

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/prepare-browser.cjs [options]

  --root ROOT            repository root (default: repository checkout)
  --kind KIND            browser or worker (default: browser)
  --engine ENGINE        chromium, firefox, or webkit (default: chromium)
  --corpus PATH          product corpus
  --adapter PATH         first-party browser adapter
  --spec PATH            authored capability specification
  --artifact PATH        built packages/flint-wasm directory
  --cminpack-artifact PATH
                         cminpack.wasm inside the built browser package
  --nlopt-artifact PATH  NLopt Wasm inside the built browser package
  --output DIRECTORY     empty output directory (required)

The command launches the selected real browser to bind its exact version. It
does not collect a receipt; run the printed cold-process command separately.
`;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    return 0;
  }
  const outputDirectory = value(argv, "--output");
  if (outputDirectory === null) throw new Error("--output is required");
  const root = path.resolve(value(argv, "--root", defaultRoot));
  const kind = value(argv, "--kind", "browser");
  const engine = value(argv, "--engine", "chromium");
  const corpusPath = value(argv, "--corpus", DEFAULT_CORPUS);
  const adapterPath = value(argv, "--adapter", DEFAULT_ADAPTER);
  const specPath = value(argv, "--spec", DEFAULT_SPEC);
  const artifactPath = value(argv, "--artifact", "packages/flint-wasm");
  const cminpackArtifactPath = value(
    argv, "--cminpack-artifact", "packages/flint-wasm/dist/cminpack.wasm",
  );
  const nloptArtifactPath = value(
    argv, "--nlopt-artifact", "packages/flint-wasm/dist/nlopt-methods.wasm",
  );
  const prepared = await prepare({
    root, corpusPath, adapterPath, specPath, artifactPath, cminpackArtifactPath,
    nloptArtifactPath, outputDirectory, kind, engine,
  });
  process.stdout.write(pretty({
    capability_manifest_id: prepared.manifest.id,
    capability_manifest: prepared.manifestPath,
    next: [
      "node scripts/numerical-computing/qualify.cjs run",
      `--corpus ${corpusPath}`,
      `--adapter ${adapterPath}`,
      `--capabilities ${prepared.manifestPath}`,
      `--artifact sagejs-browser=${artifactPath}`,
      `--artifact cminpack-wasm=${cminpackArtifactPath}`,
      `--artifact nlopt-wasm=${nloptArtifactPath}`,
      `--output ${outputDirectory}/${kind}-${engine}.receipt.json`,
    ].join(" "),
  }));
  return 0;
}

if (require.main === module) {
  void main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = { main, prepare, subjectFor, usage };
