#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { platformIdentity, repositoryIdentity, repositoryPath } = require("../common.cjs");
const { prepare } = require("./prepare-browser.cjs");
const { manifestBoundArtifacts } = require("./prepared-artifacts.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const CORPUS = "bench/numerical-computing/qualification/product.corpus.json";
const ADAPTER = "bench/numerical-computing/qualification/browser-adapter.cjs";
const SPEC = "bench/numerical-computing/qualification/capabilities/node-capability-spec.json";
const ARTIFACT = "packages/flint-wasm";
const CMINPACK = "packages/flint-wasm/dist/cminpack.wasm";
const NLOPT = "packages/flint-wasm/dist/nlopt-methods.wasm";

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/collect-browser.cjs \\
  --candidate COMMIT --output DIRECTORY [--artifact PATH]

On Linux x64, collects the exact Chromium, Firefox, WebKit, and Chromium-worker
full-product rows plus all five canonical supplemental evidence categories.
The production browser package and Linux SEA must already exist.
`;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set(["--candidate", "--output", "--artifact"]);
  const result = { artifact: ARTIFACT };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(name)) throw new Error(`unknown argument ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    const key = name.slice(2);
    if (key !== "artifact" && result[key] !== undefined) {
      throw new Error(`${name} may appear only once`);
    }
    result[key] = value;
  }
  if (result.candidate === undefined || result.output === undefined) {
    throw new Error("--candidate and --output are required");
  }
  return { help: false, ...result };
}

function runNode(arguments_, label) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
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

function cleanOutput(relative) {
  if (path.isAbsolute(relative) || relative.includes("\0")) {
    throw new Error("--output must be a repository-relative directory");
  }
  const output = repositoryPath(root, relative, "browser qualification output");
  if (fs.existsSync(output.absolute) && fs.readdirSync(output.absolute).length !== 0) {
    throw new Error(`output directory is not empty: ${output.relative}`);
  }
  fs.mkdirSync(output.absolute, { recursive: true });
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "--quiet", output.relative]);
  if (ignored.status !== 0) throw new Error("--output must be ignored");
  return output.relative;
}

async function collectRow({ kind, engine, output, artifact }) {
  const rowId = `linux-x64-browser-${kind === "worker" ? "worker" : engine}`;
  const directory = `${output}/rows/${rowId}`;
  const prepared = await prepare({
    root,
    corpusPath: CORPUS,
    adapterPath: ADAPTER,
    specPath: SPEC,
    artifactPath: artifact,
    cminpackArtifactPath: CMINPACK,
    nloptArtifactPath: NLOPT,
    outputDirectory: directory,
    kind,
    engine,
  });
  const receipt = `${directory}/${kind}-${engine}.receipt.json`;
  runNode([
    "scripts/numerical-computing/qualify.cjs", "run",
    "--corpus", CORPUS,
    "--adapter", ADAPTER,
    "--capabilities", prepared.manifestPath,
    ...manifestBoundArtifacts(prepared, rowId).flatMap((item) => ["--artifact", item]),
    "--output", receipt,
  ], `collect ${rowId}`);
  runNode([
    "scripts/numerical-computing/qualify.cjs", "verify", receipt, "--require-clean",
  ], `verify ${rowId}`);
}

async function run(options) {
  const before = repositoryIdentity(root);
  if (!before.clean || before.commit !== options.candidate) {
    throw new Error(
      `browser qualification requires clean candidate ${options.candidate}; ` +
        `got ${before.commit}${before.clean ? "" : " (dirty)"}`,
    );
  }
  if (platformIdentity().id !== "linux-x64") {
    throw new Error(`browser qualification requires linux-x64, got ${platformIdentity().id}`);
  }
  const output = cleanOutput(options.output);
  repositoryPath(root, options.artifact, "production browser artifact");
  for (const required of [CMINPACK, NLOPT, "build/sea/sagejs"]) {
    const absolute = path.join(root, required);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`missing release qualification artifact ${required}`);
    }
  }

  for (const [kind, engine] of [
    ["browser", "chromium"], ["browser", "firefox"], ["browser", "webkit"],
    ["worker", "chromium"],
  ]) {
    await collectRow({ kind, engine, output, artifact: options.artifact });
  }

  const supplemental = `${output}/supplemental`;
  fs.mkdirSync(path.join(root, supplemental), { recursive: true });
  runNode([
    "scripts/numerical-computing/qualification/run-native-sanitizers.cjs",
    "--output", `${supplemental}/native-sanitizers.evidence.json`,
  ], "native sanitizer evidence");
  runNode([
    "scripts/numerical-computing/qualification/run-wasm-destructive.cjs",
    "--output", `${supplemental}/wasm-destructive.evidence.json`,
  ], "destructive Wasm evidence");
  for (const [kind, engine] of [
    ["browser", "chromium"], ["browser", "firefox"], ["browser", "webkit"],
    ["worker", "chromium"],
  ]) {
    runNode([
      "scripts/numerical-computing/qualification/run-browser-memory.cjs",
      "--kind", kind,
      "--engine", engine,
      "--artifact", options.artifact,
      "--cminpack-artifact", CMINPACK,
      "--nlopt-artifact", NLOPT,
      "--output", `${supplemental}/memory-${kind}-${engine}`,
    ], `browser memory ${kind}/${engine}`);
  }
  runNode([
    "scripts/numerical-computing/qualification/run-structural-performance.cjs",
    "--output", `${supplemental}/structural-performance.evidence.json`,
  ], "structural performance evidence");

  const after = repositoryIdentity(root);
  if (!after.clean || after.commit !== before.commit || after.tree !== before.tree ||
      after.status_sha256 !== before.status_sha256) {
    throw new Error("candidate checkout changed while browser qualification executed");
  }
  return output;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const output = await run(options);
  process.stdout.write(`passed: four browser rows and five supplemental categories -> ${output}\n`);
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

module.exports = { main, parseArguments, run, usage };
