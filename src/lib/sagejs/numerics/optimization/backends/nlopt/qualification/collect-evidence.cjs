#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  EVIDENCE_RECEIPT_SCHEMA,
  REQUIRED_CHECKS,
  atomicWriteFile,
  bindRecord,
  formattedJson,
  loadCurrentContext,
  readJson,
  sha256,
  validateRawDestructive,
  validateRawSanitizer,
} = require("./contracts.cjs");

const packageRoot = path.resolve(__dirname, "..");
const root = path.resolve(packageRoot, "../../../../../../..");
const COLLECTOR = path.relative(root, __filename).replaceAll(path.sep, "/");
const LOG_LIMIT = 16 * 1024 * 1024;

const COMMANDS = Object.freeze({
  "browser-lifecycle": [[process.execPath, ["test/numerical-p3-nlopt/browser.mjs"]]],
  "public-integration": [[process.execPath, ["--test", "test/numerical-p3-nlopt/public-integration.cjs"]]],
  "resource-corruption": [
    [process.execPath, ["--test", "test/numerical-p3-nlopt/public-browser.mjs"]],
    [process.execPath, ["--test", "test/numerical-p3-nlopt/public-relocation.cjs"]],
  ],
  relocation: [[process.execPath, ["--test", "test/numerical-p3-nlopt/public-relocation.cjs"]]],
  sea: [[process.execPath, ["--test", "test/numerical-p3-nlopt/public-sea.cjs"]]],
});

function usage() {
  return `Usage: node ${COLLECTOR} --candidate COMMIT --kind KIND --output FILE

KIND is one of: ${Object.keys(REQUIRED_CHECKS).join(", ")}.
The collector runs the canonical source-current command(s), rejects skips, and
writes a candidate/artifact/semantics-bound receipt. Sanitizer and destructive
Wasm collection use the P8 exact-candidate collectors and validate their raw
evidence before wrapping it. Release collection requires clean linux-x64.
`;
}

function parseArguments(argv) {
  const options = { candidate: null, kind: null, output: null, help: false };
  for (let index = 0; index < argv.length; ++index) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (["--candidate", "--kind", "--output"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      const field = argument.slice(2);
      if (options[field] !== null) throw new Error(`${argument} may appear only once`);
      options[field] = value;
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help && Object.values(options).some((value) => value === null)) {
    throw new Error("--candidate, --kind, and --output are required");
  }
  if (!options.help && !Object.hasOwn(REQUIRED_CHECKS, options.kind)) {
    throw new Error(`unsupported evidence kind ${options.kind}`);
  }
  return options;
}

function git(...arguments_) {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8", timeout: 30_000, maxBuffer: LOG_LIMIT,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
  return result.stdout.trim();
}

function context(candidate) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`supplemental NLopt evidence requires linux-x64, got ${process.platform}-${process.arch}`);
  }
  const head = git("rev-parse", "HEAD");
  if (head !== candidate) throw new Error(`checkout is at ${head}, expected ${candidate}`);
  if (git("status", "--porcelain", "--untracked-files=no") !== "") {
    throw new Error("evidence collection requires a clean tracked checkout");
  }
  return loadCurrentContext({
    root,
    candidate,
    manifestPath: path.join(packageRoot, "release/production-manifest.json"),
    artifactPath: path.join(packageRoot, "build/nlopt-methods.wasm"),
    buildReportPath: path.join(packageRoot, "build/build-report.json"),
    corpusPath: path.join(root, "bench/numerical-p3-nlopt/corpus.json"),
    oraclePath: path.join(packageRoot, "qualification/oracle-summary.json"),
    oracleSourcePath: path.join(packageRoot, "qualification/oracle.py"),
    selectionPath: path.join(packageRoot, "qualification/selection-v1.json"),
  });
}

function execute(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: LOG_LIMIT,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`${command} ${arguments_.join(" ")} failed (${result.status ?? result.signal}):\n${result.stderr}`);
  }
  if (/(?:#\s*SKIP|\bSKIP:)/i.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(`${command} ${arguments_.join(" ")} skipped required qualification work`);
  }
  return result;
}

function validatePackagedArtifact(current, filename = path.join(
  root, "dist/numerical/nlopt-methods.wasm",
)) {
  const artifact = fs.readFileSync(filename);
  if (artifact.length !== current.artifact.bytes ||
      sha256(artifact) !== current.artifact.sha256) {
    throw new Error("public package does not contain the exact qualified NLopt artifact");
  }
}

function supplemental(kind, current, temporary) {
  const script = kind === "sanitizer"
    ? "scripts/numerical-computing/qualification/run-native-sanitizers.cjs"
    : "scripts/numerical-computing/qualification/run-wasm-destructive.cjs";
  if (!fs.existsSync(path.join(root, script))) {
    throw new Error(`${script} is missing; merge the reviewed P8 qualification tooling first`);
  }
  const rawPath = path.join(temporary, `${kind}.json`);
  const result = execute(process.execPath, [script, "--output", rawPath]);
  const raw = readJson(rawPath, `raw ${kind} evidence`).value;
  if (kind === "sanitizer") validateRawSanitizer(raw, current);
  else validateRawDestructive(raw, current);
  const payload = { raw, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  return {
    execution: result,
    sourceEvidence: { schema: raw.schema, ...bindRecord(payload), payload },
  };
}

function generic(kind, current) {
  if (["public-integration", "resource-corruption", "relocation"].includes(kind)) {
    validatePackagedArtifact(current);
  }
  const results = COMMANDS[kind].map(([command, arguments_]) => execute(command, arguments_));
  if (kind === "browser-lifecycle") {
    const value = JSON.parse(results[0].stdout);
    if (value.schema !== "sagejs.numerical-nlopt-browser/v1" ||
        value.cases !== current.selection.case_ids.length ||
        value.public_semantics_bundle_sha256 !== current.publicSemantics.sha256 ||
        value.pre_set_shared_atomic_force_stop !== "pass" ||
        value.hard_worker_replacement !== "pass" ||
        value.lifecycle_after?.liveAllocations !== 0 || value.lifecycle_after?.liveBytes !== 0) {
      throw new Error("browser lifecycle output did not satisfy its exact contract");
    }
  }
  if (kind === "sea") {
    const executable = path.join(root, "build/sea/sagepython");
    const probe = execute(executable, ["--qualification-resource-digests"]);
    let value;
    try { value = JSON.parse(probe.stdout); } catch { throw new Error("SEA resource probe did not emit JSON"); }
    const nlopt = (value.resources ?? []).find(({ name }) => name === "numerical/nlopt-methods.wasm");
    if (value.schema !== "sagejs.sea-qualification-resource-digests/v1" ||
        nlopt?.sha256 !== current.artifact.sha256 || nlopt?.bytes !== current.artifact.bytes) {
      throw new Error("SEA does not embed the exact qualified NLopt artifact");
    }
    results.push(probe);
  }
  const stdout = results.map((result, index) => `command-${index}\n${result.stdout}`).join("\n");
  const stderr = results.map((result, index) => `command-${index}\n${result.stderr}`).join("\n");
  const payload = { stdout, stderr };
  return {
    execution: { status: 0, signal: null, stdout, stderr },
    sourceEvidence: {
      schema: kind === "browser-lifecycle"
        ? "sagejs.numerical-nlopt-browser/v1"
        : "sagejs.numerical-nlopt-command-transcript/v1",
      ...bindRecord(payload),
      payload,
    },
  };
}

function collect(options) {
  const current = context(options.candidate);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-nlopt-evidence-"));
  try {
    const collected = ["sanitizer", "destructive-wasm"].includes(options.kind)
      ? supplemental(options.kind, current, temporary)
      : generic(options.kind, current);
    const execution = collected.execution;
    const collectorBytes = fs.readFileSync(__filename);
    return {
      schema: EVIDENCE_RECEIPT_SCHEMA,
      candidate_commit: current.candidate,
      artifact: { ...current.artifact },
      public_semantics_bundle_sha256: current.publicSemantics.sha256,
      qualification_tooling_bundle_sha256: current.tooling.sha256,
      source_lock_sha256: current.source.source_lock_sha256,
      source_closure_sha256: current.source.source_closure_sha256,
      build_report_sha256: current.source.build_report_sha256,
      corpus_sha256: current.corpusBinding.sha256,
      oracle_sha256: current.oracleBinding.sha256,
      oracle_source_sha256: current.oracleSourceSha256,
      selection_sha256: current.selectionBinding.sha256,
      selected_case_ids: [...current.selection.case_ids],
      kind: options.kind,
      status: "passed",
      platform: { id: "linux-x64", os: process.platform, architecture: process.arch },
      checks: [...REQUIRED_CHECKS[options.kind]],
      collector: { path: COLLECTOR, sha256: sha256(collectorBytes) },
      source_evidence: collected.sourceEvidence,
      execution: {
        status: execution.status,
        signal: execution.signal,
        stdout_sha256: sha256(execution.stdout ?? ""),
        stderr_sha256: sha256(execution.stderr ?? ""),
      },
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const receipt = collect(options);
  atomicWriteFile(path.resolve(options.output), Buffer.from(formattedJson(receipt)));
  process.stdout.write(`passed: ${receipt.kind} -> ${path.resolve(options.output)}\n`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  COMMANDS,
  collect,
  main,
  parseArguments,
  usage,
  validateRawDestructive,
  validatePackagedArtifact,
  validateRawSanitizer,
};
