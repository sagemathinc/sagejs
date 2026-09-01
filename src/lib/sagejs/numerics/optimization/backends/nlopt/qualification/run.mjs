#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createNloptBackend } from "../index.mjs";
import {
  optionsFromCase,
  validateCase,
} from "../../../../../../../../bench/numerical-p3-nlopt/problems.mjs";

const require = createRequire(import.meta.url);
const {
  CASE_RECEIPT_SCHEMA,
  atomicWriteFile,
  canonicalJson,
  formattedJson,
  loadCurrentContext,
  sha256,
} = require("./contracts.cjs");

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../../../../../../..");

function usage() {
  return `Usage: node ${fileURLToPath(import.meta.url)} --candidate COMMIT --output FILE

Executes exactly the source-current selected NLopt Nelder-Mead corpus cases.
The checkout must be clean and at COMMIT. The output is a source-, oracle-,
artifact-, semantics-, and qualification-tooling-bound portable receipt.
`;
}

function parseArguments(argv) {
  const options = { candidate: null, output: null, help: false };
  for (let index = 0; index < argv.length; ++index) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--candidate" || argument === "--output") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      const field = argument === "--candidate" ? "candidate" : "output";
      if (options[field] !== null) throw new Error(`${argument} may appear only once`);
      options[field] = value;
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help && (options.candidate === null || options.output === null)) {
    throw new Error("--candidate and --output are required");
  }
  return options;
}

function git(...arguments_) {
  const result = spawnSync("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `git ${arguments_.join(" ")} failed`);
  return result.stdout.trim();
}

function currentContext(candidate) {
  const head = git("rev-parse", "HEAD");
  if (head !== candidate) throw new Error(`checkout is at ${head}, expected candidate ${candidate}`);
  if (git("status", "--porcelain", "--untracked-files=no") !== "") {
    throw new Error("qualification requires a clean tracked checkout");
  }
  return loadCurrentContext({
    root: repositoryRoot,
    candidate,
    manifestPath: resolve(packageRoot, "release/production-manifest.json"),
    artifactPath: resolve(packageRoot, "build/nlopt-methods.wasm"),
    buildReportPath: resolve(packageRoot, "build/build-report.json"),
    corpusPath: resolve(repositoryRoot, "bench/numerical-p3-nlopt/corpus.json"),
    oraclePath: resolve(packageRoot, "qualification/oracle-summary.json"),
    oracleSourcePath: resolve(packageRoot, "qualification/oracle.py"),
    selectionPath: resolve(packageRoot, "qualification/selection-v1.json"),
  });
}

async function execute(context) {
  const artifact = await readFile(resolve(packageRoot, "build/nlopt-methods.wasm"));
  const solver = await createNloptBackend(artifact);
  const records = context.selection.case_ids.map((id) =>
    context.corpus.cases.find((record) => record.id === id));
  const results = [];
  for (const record of records) {
    if (record === undefined || record.method !== "nlopt-nelder-mead") {
      throw new Error(`selected case ${record?.id ?? "missing"} is not Nelder-Mead`);
    }
    const result = solver.solve(optionsFromCase(record));
    const validation = validateCase(record, result);
    if (!validation.accepted) {
      throw new Error(`${record.id} failed independent validation: ${JSON.stringify(validation)}`);
    }
    if (result.method !== "nlopt-nelder-mead" || result.gradientCallbacks !== 0 ||
        result.jacobianCallbacks !== 0 || result.independentValidationRequired !== true) {
      throw new Error(`${record.id} violated the qualified method contract`);
    }
    results.push({
      id: record.id,
      method: result.method,
      backend_status: result.backendStatus,
      backend_converged: result.backendConverged,
      value: result.value,
      objective: validation.objective,
      maximum_violation: validation.maximumViolation,
      evaluations: result.evaluations,
      callbacks: result.callbackCount,
      independently_accepted: true,
    });
  }
  const lifecycle = solver.inspect();
  if (lifecycle.liveAllocations !== 0 || lifecycle.liveBytes !== 0) {
    throw new Error(`qualification leaked Wasm state: ${JSON.stringify(lifecycle)}`);
  }
  return {
    schema: CASE_RECEIPT_SCHEMA,
    candidate_commit: context.candidate,
    artifact: { ...context.artifact },
    public_semantics_bundle_sha256: context.publicSemantics.sha256,
    qualification_tooling_bundle_sha256: context.tooling.sha256,
    source_lock_sha256: context.source.source_lock_sha256,
    source_closure_sha256: context.source.source_closure_sha256,
    build_report_sha256: context.source.build_report_sha256,
    corpus_sha256: context.corpusBinding.sha256,
    oracle_sha256: context.oracleBinding.sha256,
    oracle_source_sha256: context.oracleSourceSha256,
    selection_sha256: context.selectionBinding.sha256,
    selected_case_ids: [...context.selection.case_ids],
    runtime: { node: process.version, os: process.platform, architecture: process.arch },
    method: "nlopt-nelder-mead",
    results,
    results_sha256: sha256(Buffer.from(canonicalJson(results))),
    lifecycle_after: lifecycle,
    automatic_selection: false,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const context = currentContext(options.candidate);
  const receipt = await execute(context);
  atomicWriteFile(resolve(options.output), Buffer.from(formattedJson(receipt)));
  process.stdout.write(`${JSON.stringify({
    schema: receipt.schema,
    candidate_commit: receipt.candidate_commit,
    artifact: receipt.artifact,
    runtime: receipt.runtime,
    selected_case_ids: receipt.selected_case_ids,
    results_sha256: receipt.results_sha256,
    lifecycle_after: receipt.lifecycle_after,
  }, null, 2)}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
    },
  );
}

export { currentContext, execute, main, parseArguments, usage };
