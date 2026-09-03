#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const { pretty, readJson, repositoryPath, sha256 } = require("../common.cjs");
const { validateCorpus } = require("../contracts.cjs");
const { bindCapabilityDraft, writeImmutableJson } = require("../receipt.cjs");
const {
  validateLazyModuleBundle,
} = require("../../lazy-module-provenance.cjs");
const { createBinding } = require("./browser-executable.cjs");
const { createBinding: createScipyOracleBinding } = require("./scipy-oracle.cjs");
const { capabilityDraft } = require("./prepare-node.cjs");

const defaultRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const DEFAULT_ADAPTER = "bench/numerical-computing/qualification/browser-adapter.cjs";
const DEFAULT_SPEC = "bench/numerical-computing/qualification/capabilities/node-capability-spec.json";

function copyReleaseEntry(source, destination) {
  const status = fs.lstatSync(source);
  if (status.isSymbolicLink()) throw new Error(`browser artifact refuses symbolic link ${source}`);
  if (status.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) {
      copyReleaseEntry(path.join(source, name), path.join(destination, name));
    }
    return;
  }
  if (!status.isFile()) throw new Error(`browser artifact refuses special file ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function noFollowReleaseEntry(sourceRoot, entry) {
  let current = sourceRoot;
  for (const component of entry.split(/[\\/]/).filter(Boolean)) {
    current = path.join(current, component);
    if (!fs.existsSync(current)) {
      throw new Error(`browser package files entry is missing: ${entry}`);
    }
    const status = fs.lstatSync(current);
    if (status.isSymbolicLink()) {
      throw new Error(`browser artifact refuses symbolic-link path component ${entry}`);
    }
  }
  const relative = path.relative(sourceRoot, fs.realpathSync(current));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`browser package files entry escapes package: ${entry}`);
  }
  return current;
}

function stageBrowserArtifact(root, artifactPath, outputPath) {
  const source = repositoryPath(root, artifactPath, "browser artifact source");
  const destination = repositoryPath(root, outputPath, "staged browser artifact");
  if (fs.existsSync(destination.absolute)) {
    throw new Error(`staged browser artifact already exists: ${destination.relative}`);
  }
  const manifestPath = path.join(source.absolute, "package.json");
  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("browser artifact package.json must declare a nonempty files closure");
  }
  fs.mkdirSync(destination.absolute, { recursive: true });
  copyReleaseEntry(manifestPath, path.join(destination.absolute, "package.json"));
  // The browser worker consumes generated runtime resources (for example the
  // Conway table and capability report) that are intentionally not part of
  // the separate public npm package closure. Bind the complete built dist and
  // release directories, plus the manifest-declared top-level entrypoints.
  const entries = [
    ...manifest.files.filter((entry) =>
      !entry.replaceAll("\\", "/").startsWith("dist/") &&
      !entry.replaceAll("\\", "/").startsWith("release/")),
    ...fs.readdirSync(source.absolute).filter((entry) =>
      fs.lstatSync(path.join(source.absolute, entry)).isFile() &&
      [".mjs", ".d.ts"].some((suffix) => entry.endsWith(suffix))),
    "dist/",
    "release/",
  ];
  for (const entry of [...new Set(entries)].sort()) {
    if (typeof entry !== "string" || entry.length === 0 || path.isAbsolute(entry) ||
        entry.includes("\0") || entry.split(/[\\/]/).includes("..")) {
      throw new Error(`invalid browser package files entry ${JSON.stringify(entry)}`);
    }
    const normalized = entry.replace(/[\\/]$/, "");
    const input = noFollowReleaseEntry(source.absolute, normalized);
    copyReleaseEntry(input, path.join(destination.absolute, normalized));
  }
  return destination.relative;
}

function validateBrowserArtifactSources(root, artifactPath) {
  const source = repositoryPath(root, artifactPath, "browser artifact source");
  const standardLibraryPath = path.join(source.absolute, "dist", "stdlib.json");
  if (!fs.existsSync(standardLibraryPath) || !fs.statSync(standardLibraryPath).isFile()) {
    throw new Error(
      `browser artifact is missing its standard-library bundle: ${standardLibraryPath}`,
    );
  }
  let standardLibrary;
  try {
    standardLibrary = readJson(standardLibraryPath);
  } catch (error) {
    throw new Error(`invalid browser standard-library bundle: ${standardLibraryPath}`, {
      cause: error,
    });
  }
  if (
    standardLibrary === null ||
    typeof standardLibrary !== "object" ||
    Array.isArray(standardLibrary) ||
    standardLibrary.modules === null ||
    typeof standardLibrary.modules !== "object" ||
    Array.isArray(standardLibrary.modules)
  ) {
    throw new Error(`invalid browser standard-library bundle: ${standardLibraryPath}`);
  }
  for (const [name, module] of Object.entries(standardLibrary.modules)) {
    if (
      module === null ||
      typeof module !== "object" ||
      typeof module.source !== "string" ||
      module.cache === null ||
      typeof module.cache !== "object"
    ) {
      throw new Error(`invalid browser standard-library module ${name}`);
    }
    const expected = createHash("sha1").update(module.source).digest("hex");
    if (module.cache.signature !== expected) {
      throw new Error(`stale precompiled standard-library source ${name}`);
    }
  }
  const bundlePath = path.join(source.absolute, "dist", "lazy-modules.json");
  if (!fs.existsSync(bundlePath) || !fs.statSync(bundlePath).isFile()) {
    throw new Error(`browser artifact is missing its lazy-module bundle: ${bundlePath}`);
  }
  let bundle;
  try {
    bundle = readJson(bundlePath);
  } catch (error) {
    throw new Error(`invalid browser lazy-module bundle: ${bundlePath}`, {
      cause: error,
    });
  }
  validateLazyModuleBundle(bundle, { repositoryRoot: root });
  return bundle;
}

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
  if (kind === "worker" && engine !== "chromium") {
    throw new Error("the release worker subject is pinned to Chromium");
  }
  return kind === "browser"
    ? { kind, name: "playwright-browser", version, engine }
    : { kind, name: "sagejs-browser-worker", version, engine };
}

function browserArtifactSpecifications({
  stagedArtifactPath, cminpackArtifactPath, nloptArtifactPath,
  browserExecutableBindingPath, scipyOracleBindingPath,
}) {
  return [
    `sagejs-browser=${stagedArtifactPath}`,
    `browser-dist=${stagedArtifactPath}/dist`,
    `cminpack-wasm=${cminpackArtifactPath}`,
    `nlopt-wasm=${nloptArtifactPath}`,
    `browser-executable-binding=${browserExecutableBindingPath}`,
    `scipy-oracle-binding=${scipyOracleBindingPath}`,
  ];
}

async function prepare({
  root, corpusPath, adapterPath, specPath, artifactPath, cminpackArtifactPath,
  nloptArtifactPath, outputDirectory, kind, engine,
}) {
  validateBrowserArtifactSources(root, artifactPath);
  const corpus = validateCorpus(readJson(repositoryPath(root, corpusPath, "corpus").absolute));
  const spec = readJson(repositoryPath(root, specPath, "capability spec").absolute);
  const adapter = require(repositoryPath(root, adapterPath, "adapter").absolute);
  const launched = await adapter._testing.launchBrowser(engine);
  let version;
  let browserExecutable;
  try {
    version = launched.version;
    browserExecutable = launched.executable;
  } finally {
    await launched.browser.close();
  }
  const subject = subjectFor(kind, engine, version);
  const draft = capabilityDraft(spec, corpus, subject);
  const output = repositoryPath(root, outputDirectory, "output directory");
  fs.mkdirSync(output.absolute, { recursive: true });
  const browserExecutableBindingPath = `${output.relative}/browser-executable.json`;
  writeImmutableJson(
    path.join(root, browserExecutableBindingPath),
    createBinding(subject, browserExecutable),
  );
  const scipyOracleBindingPath = `${output.relative}/scipy-oracle.json`;
  writeImmutableJson(
    path.join(root, scipyOracleBindingPath),
    createScipyOracleBinding(),
  );
  const stagedArtifactPath = stageBrowserArtifact(
    root, artifactPath, `${output.relative}/browser-artifact`,
  );
  const draftPath = `${output.relative}/capability-draft.json`;
  fs.writeFileSync(path.join(root, draftPath), pretty(draft));
  const artifacts = browserArtifactSpecifications({
    stagedArtifactPath, cminpackArtifactPath, nloptArtifactPath,
    browserExecutableBindingPath, scipyOracleBindingPath,
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
  return {
    artifacts,
    draftPath,
    manifestPath,
    manifest,
    engine,
    artifactPath: stagedArtifactPath,
    browserDistPath: `${stagedArtifactPath}/dist`,
    browserExecutable,
    browserExecutableBindingPath,
    scipyOracleBindingPath,
  };
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

The command stages the browser runtime closure (top-level modules plus complete
built dist/release trees) without node_modules,
launches the selected real browser to bind its exact version, and does not
collect a receipt; run the printed cold-process command separately.
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
      ...prepared.artifacts.map((artifact) => `--artifact ${artifact}`),
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

module.exports = {
  browserArtifactSpecifications, main, prepare, stageBrowserArtifact, subjectFor, usage,
  validateBrowserArtifactSources,
};
