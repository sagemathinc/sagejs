#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  buildQualification,
  loadCurrentContext,
  readJson,
  writePromotion,
} = require("../qualification/contracts.cjs");

const packageRoot = path.resolve(__dirname, "..");
const root = path.resolve(packageRoot, "../../../../../../..");

function usage() {
  return `Usage: node ${path.relative(root, __filename)} \\
  --candidate COMMIT --case-receipt FILE \\
  --campaign-challenge SHA256 \\
  --evidence FILE [--evidence FILE ...] \\
  --portable FILE [--portable FILE ...] \\
  [--summary FILE] [--manifest FILE]

Requires exactly the selected seven supplemental evidence kinds and four
portable platforms. It validates every input against one clean candidate,
NM-only artifact, source closure, corpus, oracle, selection, public-semantics
bundle, and qualification-tooling bundle before modifying either output.
Outputs are atomically replaced in fail-closed order: a transaction marker,
then the summary, then the qualified production manifest.
`;
}

function values(argv, name) {
  const result = [];
  for (let index = 0; index < argv.length; ++index) {
    if (argv[index] === name) result.push(argv[index + 1]);
  }
  return result;
}

function one(argv, name, fallback = null) {
  const found = values(argv, name);
  if (found.length > 1) throw new Error(`${name} may appear only once`);
  return found[0] ?? fallback;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set([
    "--candidate", "--case-receipt", "--evidence", "--portable", "--summary", "--manifest",
    "--campaign-challenge",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!accepted.has(argv[index])) throw new Error(`unknown argument ${argv[index]}`);
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`${argv[index]} requires a value`);
    }
  }
  const candidate = one(argv, "--candidate");
  const caseReceipt = one(argv, "--case-receipt");
  const campaignChallenge = one(argv, "--campaign-challenge");
  if (candidate === null || caseReceipt === null || campaignChallenge === null) {
    throw new Error("--candidate, --case-receipt, and --campaign-challenge are required");
  }
  return {
    help: false,
    candidate,
    campaignChallenge,
    caseReceipt,
    evidence: values(argv, "--evidence"),
    portable: values(argv, "--portable"),
    summary: one(argv, "--summary", path.join(packageRoot, "release/qualification-v1.json")),
    manifest: one(argv, "--manifest", path.join(packageRoot, "release/production-manifest.json")),
  };
}

function git(...arguments_) {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8", timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
  return result.stdout.trim();
}

function currentContext(candidate, manifestPath) {
  const head = git("rev-parse", "HEAD");
  if (head !== candidate) throw new Error(`checkout is at ${head}, expected ${candidate}`);
  if (git("status", "--porcelain", "--untracked-files=no") !== "") {
    throw new Error("promotion requires a clean tracked checkout");
  }
  return loadCurrentContext({
    root,
    candidate,
    manifestPath,
    artifactPath: path.join(packageRoot, "build/nlopt-methods.wasm"),
    buildReportPath: path.join(packageRoot, "build/build-report.json"),
    corpusPath: path.join(root, "bench/numerical-p3-nlopt/corpus.json"),
    oraclePath: path.join(packageRoot, "qualification/oracle-summary.json"),
    oracleSourcePath: path.join(packageRoot, "qualification/oracle.py"),
    selectionPath: path.join(packageRoot, "qualification/selection-v1.json"),
  });
}

function run(options) {
  const manifestPath = path.resolve(options.manifest);
  const context = currentContext(options.candidate, manifestPath);
  const qualification = buildQualification({
    context,
    campaignChallenge: options.campaignChallenge,
    caseReceiptRecord: readJson(path.resolve(options.caseReceipt), "case receipt"),
    evidenceRecords: options.evidence.map((filename) =>
      readJson(path.resolve(filename), `evidence ${filename}`)),
    portableRecords: options.portable.map((filename) =>
      readJson(path.resolve(filename), `portable receipt ${filename}`)),
  });
  writePromotion({
    summaryPath: path.resolve(options.summary),
    manifestPath,
    summary: qualification.summary,
    manifest: qualification.manifest,
  });
  return qualification;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const qualification = run(options);
  process.stdout.write(`${JSON.stringify({
    schema: qualification.summary.schema,
    status: qualification.summary.status,
    candidate_commit: qualification.summary.candidate_commit,
    artifact: qualification.summary.artifact,
    summary_sha256: qualification.summaryBinding.sha256,
  }, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { currentContext, main, parseArguments, run, usage };
