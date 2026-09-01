#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { canonicalJson, contentId, digestPath, repositoryPath, sha256 } = require("../common.cjs");
const { collectReceipt, writeImmutableJson } = require("../receipt.cjs");
const { prepare } = require("./prepare-browser.cjs");

const processEntryTime = process.hrtime.bigint();
const root = path.resolve(__dirname, "..", "..", "..");
const CORPUS = "bench/numerical-computing/qualification/browser-memory.corpus.json";
const ADAPTER = "bench/numerical-computing/qualification/browser-adapter.cjs";
const SPEC = "bench/numerical-computing/qualification/capabilities/browser-memory-capability-spec.json";
const DEFAULT_DELTA = 32 * 1024 * 1024;
const COLLECTOR = "scripts/numerical-computing/qualification/run-browser-memory.cjs";

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/run-browser-memory.cjs [options]

  --engine ENGINE        chromium, firefox, or webkit (required)
  --kind KIND            browser or worker (default: browser; worker uses Chromium)
  --output DIRECTORY     empty repository-relative ignored directory (required)
  --artifact PATH        built packages/flint-wasm directory
  --cminpack-artifact PATH
  --nlopt-artifact PATH
  --minimum-delta BYTES  pressure minus baseline process-tree RSS (default: ${DEFAULT_DELTA})

The command executes a 0-byte baseline and a touched 64-MiB allocation in the
real Sage.js browser worker, collects an ordinary source/artifact-bound receipt,
and requires collector-authenticated process-tree peak memory to rise by the
configured delta. It writes immutable receipt and summary files; it never
backfills an unmeasured browser row.
`;
}

function value(argv, name, fallback = null) {
  const positions = argv.flatMap((item, index) => item === name ? [index] : []);
  if (positions.length > 1) throw new Error(`${name} may appear only once`);
  if (positions.length === 0) return fallback;
  const result = argv[positions[0] + 1];
  if (result === undefined || result.startsWith("--")) throw new Error(`${name} requires a value`);
  return result;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const accepted = new Set([
    "--engine", "--kind", "--output", "--artifact", "--cminpack-artifact",
    "--nlopt-artifact", "--minimum-delta",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!accepted.has(argv[index])) throw new Error(`unknown argument ${argv[index]}`);
    if (argv[index + 1] === undefined) throw new Error(`${argv[index]} requires a value`);
  }
  const engine = value(argv, "--engine");
  if (!["chromium", "firefox", "webkit"].includes(engine)) {
    throw new Error("--engine must be chromium, firefox, or webkit");
  }
  const kind = value(argv, "--kind", "browser");
  if (!["browser", "worker"].includes(kind)) throw new Error("--kind must be browser or worker");
  if (kind === "worker" && engine !== "chromium") {
    throw new Error("the release worker row uses Chromium; --kind worker requires --engine chromium");
  }
  const outputDirectory = value(argv, "--output");
  if (outputDirectory === null || path.isAbsolute(outputDirectory) || outputDirectory.includes("\0")) {
    throw new Error("--output must be a repository-relative directory");
  }
  const minimumDelta = Number(value(argv, "--minimum-delta", String(DEFAULT_DELTA)));
  if (!Number.isSafeInteger(minimumDelta) || minimumDelta < 1) {
    throw new Error("--minimum-delta must be a positive safe integer");
  }
  return {
    help: false,
    engine,
    kind,
    outputDirectory,
    minimumDelta,
    artifactPath: value(argv, "--artifact", "packages/flint-wasm"),
    cminpackArtifactPath: value(
      argv, "--cminpack-artifact", "packages/flint-wasm/dist/cminpack.wasm",
    ),
    nloptArtifactPath: value(
      argv, "--nlopt-artifact", "packages/flint-wasm/dist/nlopt-methods.wasm",
    ),
  };
}

function caseById(receipt, id) {
  const found = receipt.cases.filter((item) => item.case_id === id);
  if (found.length !== 1) throw new Error(`receipt must contain exactly one ${id}`);
  if (found[0].status !== "passed") throw new Error(`${id} did not pass`);
  return found[0];
}

function authenticatedPeak(record, label) {
  const peak = record.metrics.peak_memory;
  if (peak?.measurement_scope !== "process_tree" ||
      peak.authenticated_by !== "qualification-collector" ||
      peak.measurement_method !== "linux-procfs-process-tree-sampled-v1" ||
      !Number.isSafeInteger(peak.bytes)) {
    throw new Error(`${label} lacks authenticated Linux process-tree peak memory`);
  }
  return peak;
}

function validateBrowserMemoryReceipt(receipt, minimumDelta) {
  if (receipt.status !== "passed") throw new Error("browser memory receipt did not pass");
  if (receipt.platform.id !== "linux-x64") {
    throw new Error(`browser memory evidence requires linux-x64, got ${receipt.platform.id}`);
  }
  if (!["browser", "worker"].includes(receipt.runtime.subject.kind)) {
    throw new Error("receipt subject is not a browser or worker");
  }
  const baselineCase = caseById(receipt, "p8-browser-memory-baseline");
  const pressureCase = caseById(receipt, "p8-browser-memory-pressure");
  const recoveryCase = caseById(receipt, "p8-browser-worker-replacement");
  const baseline = authenticatedPeak(baselineCase, "baseline");
  const pressure = authenticatedPeak(pressureCase, "pressure");
  const recovery = authenticatedPeak(recoveryCase, "worker replacement");
  const delta = pressure.bytes - baseline.bytes;
  if (delta < minimumDelta) {
    throw new Error(
      `browser process-tree peak increased by ${delta} bytes, below ${minimumDelta}`,
    );
  }
  return {
    baseline_peak_bytes: baseline.bytes,
    pressure_peak_bytes: pressure.bytes,
    delta_bytes: delta,
    minimum_delta_bytes: minimumDelta,
    measurement_method: pressure.measurement_method,
    measurement_scope: pressure.measurement_scope,
    authenticated_by: pressure.authenticated_by,
    sample_interval_ms: pressure.sample_interval_ms,
    worker_replacement_peak_bytes: recovery.bytes,
    worker_replacement_passed: true,
  };
}

function ensureEmptyIgnoredOutput(directory, repositoryRoot = root) {
  const resolved = repositoryPath(repositoryRoot, directory, "browser memory output");
  if (fs.existsSync(resolved.absolute) && fs.readdirSync(resolved.absolute).length !== 0) {
    throw new Error(`output directory is not empty: ${directory}`);
  }
  fs.mkdirSync(resolved.absolute, { recursive: true });
  const ignored = require("node:child_process").spawnSync(
    "git", ["-C", repositoryRoot, "check-ignore", "--quiet", resolved.relative],
  );
  if (ignored.status !== 0) {
    throw new Error("--output must be ignored so evidence collection does not dirty its source checkout");
  }
  return resolved.relative;
}

async function run(options) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`browser memory evidence requires linux-x64, got ${process.platform}-${process.arch}`);
  }
  const outputDirectory = ensureEmptyIgnoredOutput(options.outputDirectory);
  const prepared = await prepare({
    root,
    corpusPath: CORPUS,
    adapterPath: ADAPTER,
    specPath: SPEC,
    artifactPath: options.artifactPath,
    cminpackArtifactPath: options.cminpackArtifactPath,
    nloptArtifactPath: options.nloptArtifactPath,
    outputDirectory,
    kind: options.kind,
    engine: options.engine,
  });
  const artifactSpecifications = [
    `sagejs-browser=${prepared.artifactPath}`,
    `browser-dist=${prepared.browserDistPath}`,
    `cminpack-wasm=${options.cminpackArtifactPath}`,
    `nlopt-wasm=${options.nloptArtifactPath}`,
  ];
  const receipt = await collectReceipt({
    root,
    corpusPath: CORPUS,
    adapterPath: ADAPTER,
    capabilityPath: prepared.manifestPath,
    artifactSpecifications,
    processEntryTime,
  });
  const adapter = require(path.join(root, ADAPTER));
  const actualExecutable = adapter._testing.lastBrowserExecutable();
  if (actualExecutable === null ||
      canonicalJson(actualExecutable) !== canonicalJson(prepared.browserExecutable)) {
    throw new Error("measured browser executable differs from the prepared executable binding");
  }
  const executablePath = fs.realpathSync(actualExecutable.path);
  const executableBytes = fs.readFileSync(executablePath);
  if (executablePath !== actualExecutable.path || executableBytes.length !== actualExecutable.bytes ||
      sha256(executableBytes) !== actualExecutable.sha256) {
    throw new Error("measured browser executable changed while qualification executed");
  }
  const receiptPath = `${outputDirectory}/${options.kind}-${options.engine}.receipt.json`;
  writeImmutableJson(path.join(root, receiptPath), receipt);
  const memory = validateBrowserMemoryReceipt(receipt, options.minimumDelta);
  const receiptBinding = digestPath(root, receiptPath, "browser memory receipt");
  const core = {
    schema: "sagejs.numerical-browser-memory-evidence/v1",
    status: "passed",
    repository: receipt.repository,
    platform: receipt.platform,
    subject: receipt.runtime.subject,
    collector: digestPath(root, COLLECTOR, "browser memory collector"),
    browser_executable: actualExecutable,
    corpus: receipt.corpus,
    source_bundle: receipt.source_bundle,
    adapter: receipt.adapter,
    artifacts: receipt.artifacts,
    receipt: { id: receipt.id, ...receiptBinding },
    memory,
    scope: {
      claim: "collector-authenticated-real-browser-process-tree-memory",
      browser_heap_supplemental_only: true,
      allocation_executed_in: "Sage.js browser worker",
    },
  };
  const evidence = { ...core, id: contentId(core) };
  const evidencePath = `${outputDirectory}/${options.kind}-${options.engine}.memory-evidence.json`;
  writeImmutableJson(path.join(root, evidencePath), evidence);
  return { evidence, evidencePath, receiptPath };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = await run(options);
  process.stdout.write(
    `passed: ${result.evidence.id}\nreceipt: ${result.receiptPath}\nevidence: ${result.evidencePath}\n`,
  );
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
  DEFAULT_DELTA,
  ensureEmptyIgnoredOutput,
  main,
  parseArguments,
  run,
  usage,
  validateBrowserMemoryReceipt,
};
