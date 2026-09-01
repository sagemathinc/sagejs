#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  loadCurrentContext,
  readJson,
  validateManifestQualificationState,
  validateQualificationSummary,
} = require("../qualification/contracts.cjs");

const packageRoot = path.resolve(__dirname, "..");
const root = path.resolve(packageRoot, "../../../../../../..");
const manifestPath = path.join(packageRoot, "release/production-manifest.json");

function usage() {
  return `Usage: node ${path.relative(root, __filename)} [--require-qualified]\n\n` +
    "Without the flag, a source-current pending manifest is valid for ordinary\n" +
    "development builds. Release qualification must use --require-qualified.\n";
}

function gitHead() {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "git rev-parse failed");
  return result.stdout.trim();
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(usage());
    return 0;
  }
  if (argv.some((argument) => argument !== "--require-qualified") ||
      argv.filter((argument) => argument === "--require-qualified").length > 1) {
    throw new Error("only --require-qualified is accepted");
  }
  const requireQualified = argv.includes("--require-qualified");
  const manifestRecord = readJson(manifestPath, "production manifest");
  const manifestState = validateManifestQualificationState(manifestRecord.value);
  const pending = manifestState === "pending";
  if (pending && requireQualified) {
    throw new Error("the narrowed NLopt artifact is pending source-current qualification");
  }
  const candidate = pending ? gitHead() : manifestRecord.value.qualification.candidate_commit;
  const context = loadCurrentContext({
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
  if (!pending) {
    const summaryRecord = readJson(
      path.join(packageRoot, "release/qualification-v1.json"),
      "qualification summary",
    );
    validateQualificationSummary(summaryRecord, context, manifestRecord.value);
  }

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.numerical-nlopt-release-verification/v2",
    status: pending ? "pending-source-current-qualification" : "qualified",
    candidate_commit: candidate,
    source_revision: context.source.revision,
    source_closure_sha256: context.source.source_closure_sha256,
    artifact: context.artifact,
    public_semantics_bundle_sha256: context.publicSemantics.sha256,
    qualification_tooling_bundle_sha256: context.tooling.sha256,
    selection_sha256: context.selectionBinding.sha256,
    corpus_sha256: context.corpusBinding.sha256,
    oracle_sha256: context.oracleBinding.sha256,
    methods: ["nlopt-nelder-mead"],
    selection: "explicit-only",
    historical_cobyla_status: "excluded-not-qualified",
  }, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, usage };
