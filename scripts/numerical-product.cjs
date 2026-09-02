#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, relative, resolve, sep } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const schema = "sagejs.numerical-runtime-product/v1";
const manifestName = "numerical-product.json";
const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;

const productFiles = [
  ["node/backend.cjs", "dist/numerical/backend.cjs"],
  ["node/cminpack.wasm", "dist/numerical/cminpack.wasm"],
  ["node/nlopt-backend.cjs", "dist/numerical/nlopt-backend.cjs"],
  ["node/nlopt-methods.wasm", "dist/numerical/nlopt-methods.wasm"],
  ["browser/numerical-backend.mjs", "packages/flint-wasm/dist/numerical-backend.mjs"],
  ["browser/cminpack.wasm", "packages/flint-wasm/dist/cminpack.wasm"],
  ["browser/nlopt-backend.mjs", "packages/flint-wasm/dist/nlopt-backend.mjs"],
  ["browser/nlopt-methods.wasm", "packages/flint-wasm/dist/nlopt-methods.wasm"],
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function gitCommit(root = repositoryRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function regularBytes(filename, label) {
  const status = lstatSync(filename);
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
    throw new Error(`${label} must be a regular, non-linked file`);
  }
  return readFileSync(filename);
}

function safeInputDirectory(input) {
  const status = lstatSync(input);
  if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(input) !== input) {
    throw new Error("numerical product input or one of its ancestors is symlinked");
  }
  return input;
}

function filesUnder(directory) {
  const result = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        result.push(relative(directory, filename).replaceAll("\\", "/"));
      } else {
        throw new Error(`numerical product contains a non-regular entry: ${filename}`);
      }
    }
  }
  visit(directory);
  return result;
}

function productionManifests(root) {
  return {
    cminpack: JSON.parse(readFileSync(join(
      root,
      "packages/flint-wasm/numerical/release/production-manifest.json",
    ), "utf8")),
    nlopt: JSON.parse(readFileSync(join(
      root,
      "src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json",
    ), "utf8")),
  };
}

function pathsForScope(scope) {
  if (scope === "all") return productFiles;
  if (scope === "sea") {
    return productFiles.filter(([path]) => path.startsWith("node/") && path.endsWith(".wasm"));
  }
  if (scope === "node" || scope === "browser") {
    return productFiles.filter(([path]) => path.startsWith(`${scope}/`));
  }
  throw new Error(`unsupported numerical runtime scope ${scope}`);
}

function validateRuntimeFiles(root, filenameForProductPath, { scope = "all" } = {}) {
  const manifests = productionManifests(root);
  const scopedPaths = new Set(pathsForScope(scope).map(([path]) => path));
  for (const [name, manifest, paths] of [
    ["cminpack", manifests.cminpack, ["node/cminpack.wasm", "browser/cminpack.wasm"]],
    ["NLopt", manifests.nlopt, ["node/nlopt-methods.wasm", "browser/nlopt-methods.wasm"]],
  ]) {
    const selectedPaths = paths.filter((path) => scopedPaths.has(path));
    const copies = selectedPaths.map((path) => regularBytes(
      filenameForProductPath(path), `${name} runtime ${path}`,
    ));
    if (copies.length === 2 && !copies[0].equals(copies[1])) {
      throw new Error(`${name} Node and browser runtime bytes differ`);
    }
    if (
      manifest?.artifact?.bytes !== copies[0].byteLength ||
      manifest?.artifact?.sha256 !== sha256(copies[0])
    ) {
      throw new Error(`${name} runtime differs from its production manifest`);
    }
  }
  for (const path of pathsForScope(scope)
    .map(([productPath]) => productPath)
    .filter((path) => !path.endsWith(".wasm"))) {
    if (regularBytes(filenameForProductPath(path), `numerical runtime ${path}`).length === 0) {
      throw new Error(`numerical runtime ${path} is empty`);
    }
  }
}

function buildNumericalRuntimeAdapters(root = repositoryRoot) {
  const { buildSync } = require("esbuild");
  const builds = [
    [
      "packages/flint-wasm/numerical/index.mjs",
      "dist/numerical/backend.cjs",
      { format: "cjs", platform: "node", target: ["node22"] },
    ],
    [
      "packages/flint-wasm/numerical/index.mjs",
      "packages/flint-wasm/dist/numerical-backend.mjs",
      { format: "esm", platform: "browser", target: ["es2022"] },
    ],
    [
      "packages/flint-wasm/numerical/nlopt-index.mjs",
      "dist/numerical/nlopt-backend.cjs",
      { format: "cjs", platform: "node", target: ["node22"] },
    ],
    [
      "packages/flint-wasm/numerical/nlopt-index.mjs",
      "packages/flint-wasm/dist/nlopt-backend.mjs",
      { format: "esm", platform: "browser", target: ["es2022"] },
    ],
  ];
  for (const [entryPoint, output, options] of builds) {
    const outfile = join(root, output);
    mkdirSync(dirname(outfile), { recursive: true });
    buildSync({
      entryPoints: [join(root, entryPoint)],
      outfile,
      bundle: true,
      ...options,
    });
  }
  return builds.map(([, output]) => output);
}

function productBody(sourceCommit, files) {
  return { schema, source_commit: sourceCommit, files };
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} has missing or extra fields`);
  }
}

function publishNumericalProduct({
  root = repositoryRoot,
  outputDirectory,
  sourceCommit = gitCommit(root),
} = {}) {
  if (!commitPattern.test(sourceCommit)) throw new Error("source commit must be exact");
  const output = resolve(outputDirectory);
  const resolvedRoot = resolve(root);
  if (output === resolvedRoot || resolvedRoot.startsWith(`${output}${sep}`)) {
    throw new Error("refusing unsafe numerical product output directory");
  }
  validateRuntimeFiles(root, (path) => {
    const record = productFiles.find(([productPath]) => productPath === path);
    return join(root, record[1]);
  });
  rmSync(output, { recursive: true, force: true });
  const files = productFiles.map(([productPath, installedPath]) => {
    const source = join(root, installedPath);
    const destination = join(output, ...productPath.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    const bytes = regularBytes(destination, productPath);
    return { path: productPath, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const body = productBody(sourceCommit, files);
  const manifest = { ...body, identity: `sha256:${sha256(canonicalJson(body))}` };
  writeFileSync(join(output, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function inspectNumericalProduct({
  root = repositoryRoot,
  inputDirectory,
  expectedCommit = gitCommit(root),
} = {}) {
  try {
    const input = safeInputDirectory(resolve(inputDirectory));
    const manifest = JSON.parse(regularBytes(
      join(input, manifestName), "numerical product manifest",
    ).toString("utf8"));
    exactKeys(manifest, ["schema", "source_commit", "files", "identity"],
      "numerical product manifest");
    if (
      manifest?.schema !== schema ||
      manifest.source_commit !== expectedCommit ||
      !commitPattern.test(manifest.source_commit) ||
      !Array.isArray(manifest.files)
    ) {
      throw new Error("numerical product has the wrong schema or source commit");
    }
    const expectedPaths = productFiles.map(([path]) => path);
    const actualPaths = manifest.files.map(({ path }) => path);
    if (canonicalJson(actualPaths) !== canonicalJson(expectedPaths)) {
      throw new Error("numerical product has a missing, extra, or reordered inventory row");
    }
    const body = productBody(manifest.source_commit, manifest.files);
    if (manifest.identity !== `sha256:${sha256(canonicalJson(body))}`) {
      throw new Error("numerical product identity differs");
    }
    for (const record of manifest.files) {
      exactKeys(record, ["path", "bytes", "sha256"],
        `numerical product row ${record?.path ?? "unknown"}`);
      if (!Number.isSafeInteger(record.bytes) || record.bytes <= 0 ||
          !shaPattern.test(record.sha256 ?? "")) {
        throw new Error(`numerical product has an invalid row: ${record.path}`);
      }
      const filename = resolve(input, ...record.path.split("/"));
      if (!filename.startsWith(`${input}${sep}`)) {
        throw new Error(`numerical product path escapes: ${record.path}`);
      }
      const bytes = regularBytes(filename, record.path);
      if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) {
        throw new Error(`numerical product file differs: ${record.path}`);
      }
    }
    const expectedFiles = [...expectedPaths, manifestName].sort();
    if (canonicalJson(filesUnder(input).sort()) !== canonicalJson(expectedFiles)) {
      throw new Error("numerical product directory contains unrecorded files");
    }
    validateRuntimeFiles(root, (path) => join(input, ...path.split("/")));
    return { valid: true, identity: manifest.identity, manifest };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

function validateInstalledNumericalProduct(root = repositoryRoot, { scope = "all" } = {}) {
  validateRuntimeFiles(root, (path) => {
    const record = productFiles.find(([productPath]) => productPath === path);
    return join(root, record[1]);
  }, { scope });
  return true;
}

function inspectInstalledNumericalProduct({
  root = repositoryRoot,
  scope = "all",
} = {}) {
  const files = pathsForScope(scope);
  const present = files.filter(([, installedPath]) => existsSync(join(root, installedPath)));
  if (present.length === 0) {
    return { available: false, status: "absent", scope };
  }
  if (present.length !== files.length) {
    return { available: false, status: "partial", scope };
  }
  try {
    validateInstalledNumericalProduct(root, { scope });
    return { available: true, status: "authenticated", scope };
  } catch (error) {
    return { available: false, status: "invalid", scope, reason: error.message };
  }
}

function numericalRuntimeRequired(environment = process.env) {
  const explicit = environment.SAGEJS_NUMERICAL_RUNTIME_REQUIRED;
  if (explicit !== undefined && explicit !== "0" && explicit !== "1") {
    throw new Error("SAGEJS_NUMERICAL_RUNTIME_REQUIRED must be 0 or 1");
  }
  return explicit === "1" || Boolean(environment.SAGEJS_NUMERICAL_PRODUCT_ROOT);
}

function resolveNumericalRuntimeCapability({
  root = repositoryRoot,
  environment = process.env,
  providerAvailable,
  scope = "node",
} = {}) {
  const required = numericalRuntimeRequired(environment);
  const inspection = inspectInstalledNumericalProduct({ root, scope });
  if (inspection.available && providerAvailable !== false) {
    return { ...inspection, required };
  }
  if (inspection.available) {
    throw new Error(
      `the ${scope} numerical runtime is installed without an authenticated provider`,
    );
  }
  if (inspection.status !== "absent" || required) {
    throw new Error(
      `the ${scope} numerical runtime is ${inspection.status}` +
        (inspection.reason ? `: ${inspection.reason}` : ""),
    );
  }
  return { ...inspection, required };
}

function installNumericalProduct({
  root = repositoryRoot,
  inputDirectory,
  expectedCommit = gitCommit(root),
} = {}) {
  const inspection = inspectNumericalProduct({ root, inputDirectory, expectedCommit });
  if (!inspection.valid) {
    throw new Error(`authenticated numerical product is invalid: ${inspection.reason}`);
  }
  const input = resolve(inputDirectory);
  for (const [productPath, installedPath] of productFiles) {
    const destination = join(root, installedPath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(input, ...productPath.split("/")), destination);
  }
  validateInstalledNumericalProduct(root);
  return inspection;
}

function one(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) throw new Error(`${name} is required`);
  return argv[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === "publish") {
    const result = publishNumericalProduct({ outputDirectory: one(argv, "--output") });
    process.stdout.write(`${result.identity}\n`);
  } else if (command === "install") {
    const result = installNumericalProduct({ inputDirectory: one(argv, "--input") });
    process.stdout.write(`${result.identity}\n`);
  } else if (command === "validate-installed") {
    validateInstalledNumericalProduct();
    process.stdout.write("authenticated numerical runtime is installed\n");
  } else {
    throw new Error("usage: numerical-product.cjs publish --output DIR | install --input DIR | validate-installed");
  }
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildNumericalRuntimeAdapters,
  inspectNumericalProduct,
  inspectInstalledNumericalProduct,
  installNumericalProduct,
  numericalRuntimeRequired,
  productFiles,
  publishNumericalProduct,
  resolveNumericalRuntimeCapability,
  validateInstalledNumericalProduct,
};
