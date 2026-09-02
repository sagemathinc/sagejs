#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { platformIdentity, repositoryIdentity, repositoryPath } = require("../common.cjs");
const packageRuntime = require("../../package-qualification/runtime.cjs");
const { prepare: prepareNode } = require("./prepare-node.cjs");
const { prepare: preparePackage } = require("./prepare-package.cjs");
const { manifestBoundArtifacts } = require("./prepared-artifacts.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const NODE_ADAPTER = "bench/numerical-computing/qualification/node-adapter.cjs";
const PACKAGE_ADAPTER = "bench/numerical-computing/qualification/package-adapter.cjs";
const CMINPACK = "dist/numerical/cminpack.wasm";
const NLOPT = "dist/numerical/nlopt-methods.wasm";
const DIST = "dist";

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/collect-platform.cjs \\
  --candidate COMMIT --root-archive FILE --platform-archive FILE \\
  --sea-executable FILE --output DIRECTORY [--subjects node,npm,sea]

Collects the exact Node, fresh-npm, and relocated-SEA rows for the derived
supported host platform. The output must be an empty ignored directory in the
candidate checkout. Platform and subject identities cannot be overridden.
`;
}

function parseArguments(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set([
    "--candidate", "--root-archive", "--platform-archive", "--sea-executable", "--output",
    "--subjects",
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(name)) throw new Error(`unknown argument ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2).replaceAll("-", "_");
    if (result[key] !== undefined) throw new Error(`${name} may appear only once`);
    result[key] = value;
  }
  for (const key of ["candidate", "output"]) {
    if (result[key] === undefined) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  }
  const subjects = (result.subjects ?? "node,npm,sea").split(",");
  if (subjects.length === 0 || new Set(subjects).size !== subjects.length ||
      subjects.some((subject) => !["node", "npm", "sea"].includes(subject))) {
    throw new Error("--subjects must be a unique comma-separated subset of node,npm,sea");
  }
  if (subjects.includes("npm") &&
      (result.root_archive === undefined || result.platform_archive === undefined)) {
    throw new Error("npm collection requires --root-archive and --platform-archive");
  }
  if (subjects.includes("sea") && result.sea_executable === undefined) {
    throw new Error("SEA collection requires --sea-executable");
  }
  if (subjects.includes("sea") && !subjects.includes("npm") && result.root_archive === undefined) {
    throw new Error("SEA collection requires --root-archive to bind the release version");
  }
  return { help: false, ...result, subjects };
}

function runNode(arguments_, label) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${label} failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  }
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

function prepareOutput(relative, platform, subjects) {
  if (path.isAbsolute(relative) || relative.includes("\0")) {
    throw new Error("--output must be a repository-relative directory");
  }
  const output = repositoryPath(root, relative, "qualification output");
  fs.mkdirSync(output.absolute, { recursive: true });
  const allowedExisting = new Set(
    ["node", "npm", "sea"]
      .filter((subject) => !subjects.includes(subject))
      .map((subject) => `${platform}-${subject}`),
  );
  for (const name of fs.readdirSync(output.absolute)) {
    if (!allowedExisting.has(name)) {
      throw new Error(`output contains foreign or selected row ${name}`);
    }
  }
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "--quiet", output.relative]);
  if (ignored.status !== 0) {
    throw new Error("--output must be ignored so collection cannot dirty the candidate checkout");
  }
  return output.relative;
}

function relativeInput(filename, label) {
  const absolute = path.resolve(root, filename);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`${label} is not a regular file: ${filename}`);
  }
  return repositoryPath(root, path.relative(root, absolute), label).relative;
}

function collect({ rowId, prepared, receiptName }) {
  runNode([
    "scripts/numerical-computing/qualify.cjs", "run",
    "--corpus", CORPUS,
    "--adapter", prepared.adapterPath,
    "--capabilities", prepared.manifestPath,
    ...manifestBoundArtifacts(prepared, rowId).flatMap((item) => ["--artifact", item]),
    "--output", `${prepared.outputDirectory}/${receiptName}`,
  ], `collect ${rowId}`);
  runNode([
    "scripts/numerical-computing/qualify.cjs", "verify",
    `${prepared.outputDirectory}/${receiptName}`, "--require-clean",
  ], `verify ${rowId}`);
}

function run(options) {
  const before = repositoryIdentity(root);
  if (!before.clean || before.commit !== options.candidate) {
    throw new Error(
      `platform qualification requires clean candidate ${options.candidate}; ` +
        `got ${before.commit}${before.clean ? "" : " (dirty)"}`,
    );
  }
  const platform = platformIdentity().id;
  if (!Object.hasOwn(packageRuntime.SUPPORTED_TARGETS, platform)) {
    throw new Error(`unsupported qualification platform ${platform}`);
  }
  const output = prepareOutput(options.output, platform, options.subjects);
  const rootArchive = options.root_archive === undefined ? null :
    relativeInput(options.root_archive, "root npm archive");
  const platformArchive = options.platform_archive === undefined ? null :
    relativeInput(options.platform_archive, "platform npm archive");
  const seaExecutable = options.sea_executable === undefined ? null :
    relativeInput(options.sea_executable, "SEA executable");
  for (const resource of [DIST, CMINPACK, NLOPT]) {
    const absolute = path.join(root, resource);
    if (!fs.existsSync(absolute)) throw new Error(`missing built qualification artifact ${resource}`);
  }
  const version = rootArchive === null ? null :
    packageRuntime.archiveJson(path.join(root, rootArchive), "package.json").version;

  if (options.subjects.includes("node")) {
    const nodeDirectory = `${output}/${platform}-node`;
    const nodePrepared = prepareNode({
      root,
      corpusPath: CORPUS,
      adapterPath: NODE_ADAPTER,
      specPath: "bench/numerical-computing/qualification/capabilities/node-capability-spec.json",
      artifactPath: DIST,
      cminpackArtifactPath: CMINPACK,
      nloptArtifactPath: NLOPT,
      outputDirectory: nodeDirectory,
    });
    collect({
      rowId: `${platform}-node`,
      prepared: {
        ...nodePrepared,
        adapterPath: NODE_ADAPTER,
        outputDirectory: nodeDirectory,
      },
      receiptName: "node.receipt.json",
    });
  }

  for (const kind of ["npm", "sea"].filter((item) => options.subjects.includes(item))) {
    const rowId = `${platform}-${kind}`;
    const outputDirectory = `${output}/${rowId}`;
    const argv = kind === "npm"
      ? [
        kind, "--root-archive", rootArchive, "--platform-archive", platformArchive,
        "--version", version,
      ]
      : [kind, "--executable", seaExecutable, "--version", version];
    const prepared = preparePackage([
      ...argv,
      "--cminpack-artifact", CMINPACK,
      "--nlopt-artifact", NLOPT,
      "--output", outputDirectory,
    ]);
    collect({
      rowId,
      prepared: { ...prepared, adapterPath: PACKAGE_ADAPTER },
      receiptName: `${kind}.receipt.json`,
    });
  }

  const after = repositoryIdentity(root);
  if (!after.clean || after.commit !== before.commit || after.tree !== before.tree ||
      after.status_sha256 !== before.status_sha256) {
    throw new Error("candidate checkout changed while platform qualification executed");
  }
  return { platform, output, subjects: options.subjects };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = run(options);
  process.stdout.write(
    `passed: ${result.platform} ${result.subjects.join("/")} -> ${result.output}\n`,
  );
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

module.exports = { main, parseArguments, run, usage };
