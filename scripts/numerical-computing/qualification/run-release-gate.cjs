#!/usr/bin/env node
"use strict";

const path = require("node:path");

const { repositoryIdentity } = require("../common.cjs");
const { writeImmutableJson } = require("../receipt.cjs");
const {
  buildReleaseGate,
  buildSupplementalReport,
  FULL_RUNTIME_TEMPLATE_PATH,
  readBoundJson,
  SUPPLEMENTAL_TEMPLATE_PATH,
} = require("./supplemental-report.cjs");

const root = path.resolve(__dirname, "..", "..", "..");

function usage() {
  return `Usage:
  node scripts/numerical-computing/qualification/run-release-gate.cjs \\
    --candidate COMMIT --matrix-report FILE --matrix-policy FILE \\
    --manifest ROW_ID=FILE... --receipt FILE... --evidence FILE... \
    --output FILE [--supplemental-output FILE]

  node scripts/numerical-computing/qualification/run-release-gate.cjs \\
    --development --candidate COMMIT \\
    [--evidence FILE...] --output FILE

Release mode fails closed unless the ordinary P0-P8 matrix report and every
declared supplemental row pass against the exact same clean candidate commit.
Development mode renders missing supplemental rows as pending and never emits
a passing release-gate document.
`;
}

function values(argv, name) {
  const result = [];
  for (let index = 0; index < argv.length; ++index) {
    if (argv[index] === name) {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new Error(`${name} requires a value`);
      result.push(next);
    }
  }
  return result;
}

function value(argv, name, required = false) {
  const found = values(argv, name);
  if (found.length > 1) throw new Error(`${name} may appear only once`);
  if (required && found.length === 0) throw new Error(`${name} is required`);
  return found[0] ?? null;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set([
    "--candidate", "--matrix-report", "--matrix-policy", "--evidence", "--output",
    "--supplemental-output", "--receipt", "--development",
    "--manifest",
  ]);
  for (let index = 0; index < argv.length; ++index) {
    if (!accepted.has(argv[index])) throw new Error(`unknown argument ${argv[index]}`);
    if (argv[index] !== "--development") index += 1;
  }
  const development = argv.includes("--development");
  const matrixReport = value(argv, "--matrix-report");
  const matrixPolicy = value(argv, "--matrix-policy");
  if (!development && matrixReport === null) throw new Error("--matrix-report is required in release mode");
  if (!development && matrixPolicy === null) throw new Error("--matrix-policy is required in release mode");
  const receipts = values(argv, "--receipt");
  const manifests = values(argv, "--manifest");
  if (development && ([matrixReport, matrixPolicy].some((item) => item !== null) ||
      receipts.length !== 0 || manifests.length !== 0)) {
    throw new Error("matrix inputs are not used in development mode");
  }
  return {
    help: false,
    development,
    candidate: value(argv, "--candidate", true),
    matrixReport,
    matrixPolicy,
    receipts,
    manifests,
    evidence: values(argv, "--evidence"),
    output: value(argv, "--output", true),
    supplementalOutput: value(argv, "--supplemental-output"),
  };
}

function run(options) {
  const repository = repositoryIdentity(root);
  if (!options.development &&
      (repository.clean !== true || repository.commit !== options.candidate)) {
    throw new Error(
      `release gate requires clean source-current candidate ${options.candidate}; ` +
        `got ${repository.commit}${repository.clean ? "" : " (dirty)"}`,
    );
  }
  const supplementalTemplate = readBoundJson(
    SUPPLEMENTAL_TEMPLATE_PATH, "canonical supplemental template",
  );
  const evidence = options.evidence.map((filename) => readBoundJson(filename, `evidence ${filename}`));
  const supplemental = buildSupplementalReport(supplementalTemplate.value, evidence, {
    candidate: options.candidate,
    release: !options.development,
  });
  if (options.supplementalOutput !== null) {
    writeImmutableJson(options.supplementalOutput, supplemental);
  }
  if (options.development) {
    writeImmutableJson(options.output, supplemental);
    return { document: supplemental, exitCode: supplemental.status === "passed" ? 0 : 1 };
  }
  const matrix = readBoundJson(options.matrixReport, "matrix report");
  const policy = readBoundJson(options.matrixPolicy, "compiled matrix policy");
  const matrixTemplate = readBoundJson(
    FULL_RUNTIME_TEMPLATE_PATH, "canonical full-runtime matrix template",
  );
  const receipts = options.receipts.map((filename) =>
    readBoundJson(filename, `matrix receipt ${filename}`));
  const manifests = new Map();
  for (const specification of options.manifests) {
    const separator = specification.indexOf("=");
    if (separator < 1 || separator === specification.length - 1) {
      throw new Error("--manifest must be ROW_ID=FILE");
    }
    const rowId = specification.slice(0, separator);
    if (manifests.has(rowId)) throw new Error(`duplicate manifest ${rowId}`);
    const filename = specification.slice(separator + 1);
    manifests.set(rowId, readBoundJson(filename, `capability manifest ${rowId}`));
  }
  const gate = buildReleaseGate({
    candidate: options.candidate,
    matrixReportRecord: matrix,
    matrixPolicyRecord: policy,
    matrixTemplateRecord: matrixTemplate,
    matrixReceiptRecords: receipts,
    matrixManifestRecords: manifests,
    supplementalTemplateRecord: supplementalTemplate,
    supplementalEvidenceRecords: evidence,
    supplementalReport: supplemental,
  });
  writeImmutableJson(options.output, gate);
  return { document: gate, exitCode: gate.status === "passed" ? 0 : 1 };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = run(options);
  process.stdout.write(`${result.document.status}: ${result.document.id}\n`);
  return result.exitCode;
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
