#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  pretty,
  readJson,
  repositoryIdentity,
  repositoryPath,
} = require("../common.cjs");
const {
  collectReceipt,
  verifyReceipt,
  writeImmutableJson,
} = require("../receipt.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const CORPUS = "bench/numerical-computing/qualification/root-performance.corpus.json";
const ADAPTER = "bench/numerical-computing/qualification/root-performance-adapter.cjs";
const SUPPORTED_SUBJECTS = new Set(["node", "npm", "sea", "browser", "worker"]);

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/collect-root-performance.cjs \\
  --candidate COMMIT --capabilities FILE --artifact NAME=PATH [--artifact NAME=PATH ...] \\
  --output FILE

Collects the multi-sample P1 scalar-root correctness and warm-kernel benchmark
on the exact clean candidate. The pre-bound capability manifest chooses and
authenticates the actual Node, npm, SEA, browser, or worker subject; the
adapter must observe the same runtime identity. This hook does not synthesize
missing rows or claim that host timings are portable to another runtime.
`;
}

function parseArguments(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const result = { artifacts: [] };
  const singular = new Set(["--candidate", "--capabilities", "--output"]);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (![...singular, "--artifact"].includes(name)) {
      throw new Error(`unknown argument ${name}`);
    }
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    if (name === "--artifact") {
      result.artifacts.push(value);
      continue;
    }
    const key = name.slice(2);
    if (result[key] !== undefined) throw new Error(`${name} may appear only once`);
    result[key] = value;
  }
  for (const name of ["candidate", "capabilities", "output"]) {
    if (result[name] === undefined) throw new Error(`--${name} is required`);
  }
  if (!/^[0-9a-f]{40}$/.test(result.candidate)) {
    throw new Error("--candidate must be a full commit SHA");
  }
  const artifactNames = result.artifacts.map((item) => {
    const separator = item.indexOf("=");
    if (separator <= 0 || separator === item.length - 1) {
      throw new Error("--artifact requires NAME=PATH");
    }
    return item.slice(0, separator);
  });
  if (result.artifacts.length === 0 ||
      new Set(artifactNames).size !== result.artifacts.length) {
    throw new Error("--artifact requires one or more uniquely named NAME=PATH values");
  }
  return { help: false, ...result };
}

function outputPath(filename) {
  const output = repositoryPath(root, filename, "root performance receipt output");
  if (fs.existsSync(output.absolute)) {
    throw new Error("root performance receipt output already exists");
  }
  fs.mkdirSync(path.dirname(output.absolute), { recursive: true });
  const ignored = require("node:child_process").spawnSync(
    "git",
    ["-C", root, "check-ignore", "--quiet", output.relative],
  );
  if (ignored.status !== 0) {
    throw new Error("root performance receipt output must be ignored");
  }
  return output;
}

async function run(options, processEntryTime = process.hrtime.bigint()) {
  const before = repositoryIdentity(root);
  if (!before.clean || before.commit !== options.candidate) {
    throw new Error(
      `root performance qualification requires clean candidate ${options.candidate}; ` +
        `got ${before.commit}${before.clean ? "" : " (dirty)"}`,
    );
  }
  const output = outputPath(options.output);
  const receipt = await collectReceipt({
    root,
    corpusPath: CORPUS,
    adapterPath: ADAPTER,
    capabilityPath: options.capabilities,
    artifactSpecifications: options.artifacts,
    processEntryTime,
  });
  if (!SUPPORTED_SUBJECTS.has(receipt.runtime.subject.kind)) {
    throw new Error(`unsupported measured subject ${receipt.runtime.subject.kind}`);
  }
  writeImmutableJson(output.absolute, receipt);
  verifyReceipt(readJson(output.absolute), { root, requireClean: true });
  const after = repositoryIdentity(root);
  if (!after.clean || after.commit !== before.commit || after.tree !== before.tree ||
      after.status_sha256 !== before.status_sha256) {
    throw new Error("candidate checkout changed while root performance qualification ran");
  }
  return { output: output.relative, receipt };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = await run(options);
  process.stdout.write(pretty({
    status: result.receipt.status,
    receipt: result.output,
    id: result.receipt.id,
    candidate: result.receipt.repository.commit,
    platform: result.receipt.platform.id,
    subject: result.receipt.runtime.subject,
  }));
  return result.receipt.status === "passed" ? 0 : 1;
}

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = { ADAPTER, CORPUS, main, parseArguments, run, usage };
