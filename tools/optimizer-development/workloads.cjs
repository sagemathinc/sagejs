"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const {
  attachIdentity,
  canonicalJson,
  deepFreeze,
  sha256,
  verifyDocumentIdentity,
} = require("./common.cjs");
const {
  canonicalCompilerIdentity,
  sourceBundleIdentity,
} = require("./identity.cjs");
const {
  SCHEMAS,
  validateProfileReceipt,
  validateWorkloadCatalog,
} = require("./schemas.cjs");
const {
  inspectBuildReceipt,
  workspaceFingerprint,
} = require("../../scripts/build-receipt.cjs");
const { pythonExecutable } = require("../python-executable.cjs");

const DEFAULT_CATALOG = "architecture/optimizer-workloads.json";
const STATIC_CONTROL_INVENTORY =
  "test/fixtures/optimizer-development/workloads/static-control-inventory.json";

function repositoryFile(root, value, label) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) ||
      value.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} must be a repository-relative path`);
  }
  const filename = path.resolve(root, value);
  if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`${label} leaves the repository`);
  }
  return filename;
}

function workloadKey(workload) {
  return workload.runner.argv[0];
}

function canonicalWorkloadCompilerIdentity(root, options) {
  const { optimizerCatalog } = require(
    path.join(root, "dist/tools/python/optimizer/catalog.js")
  );
  return canonicalCompilerIdentity({
    root,
    irSchema: "sagejs.optimizing-mathematics/v1",
    optimizerCatalog,
    optionsDigest: sha256(canonicalJson(options)),
  });
}

function loadStaticControlInventory(root) {
  const filename = repositoryFile(root, STATIC_CONTROL_INVENTORY, "static control inventory");
  const inventory = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (inventory.schema !== "sagejs.optimizer-static-control-inventory/v1" ||
      !Array.isArray(inventory.controls)) {
    throw new Error("invalid optimizer static control inventory");
  }
  verifyDocumentIdentity("static control inventory", inventory);
  const selectors = new Set();
  for (const control of inventory.controls) {
    if (selectors.has(control.selector)) throw new Error(`duplicate static control ${control.selector}`);
    selectors.add(control.selector);
    const source = repositoryFile(root, control.path, `${control.selector} static control`);
    if (sha256(fs.readFileSync(source)) !== control.sha256) {
      throw new Error(`${control.selector} static control identity changed`);
    }
  }
  return deepFreeze(inventory);
}

function loadCatalog(root, filename = DEFAULT_CATALOG) {
  const resolved = repositoryFile(root, filename, "catalog filename");
  const catalog = validateWorkloadCatalog(JSON.parse(fs.readFileSync(resolved, "utf8")));
  let staticInventory = null;
  for (const workload of catalog.workloads) {
    const runner = repositoryFile(root, workload.runner.path, `${workload.id} runner`);
    if (!fs.existsSync(runner)) throw new Error(`${workload.id} runner does not exist`);
    const fixture = workload.input.value?.fixture;
    if (fixture) {
      const fixturePath = repositoryFile(root, fixture.path, `${workload.id} fixture`);
      if (sha256(fs.readFileSync(fixturePath)) !== fixture.sha256) {
        throw new Error(`${workload.id} fixture identity changed`);
      }
    }
    const sourcePath = workload.input.value?.sourcePath;
    if (sourcePath) {
      staticInventory ||= loadStaticControlInventory(root);
      const control = staticInventory.controls.find(
        (candidate) => candidate.selector === workloadKey(workload),
      );
      if (!control || control.path !== sourcePath) {
        throw new Error(`${workloadKey(workload)} has no matching static control provenance`);
      }
    }
  }
  return catalog;
}

function findWorkload(catalog, selector) {
  const matches = catalog.workloads.filter(
    (workload) => workload.id === selector || workloadKey(workload) === selector,
  );
  if (matches.length !== 1) {
    throw new Error(matches.length ? `ambiguous optimizer workload ${selector}` : `unknown optimizer workload ${selector}`);
  }
  return matches[0];
}

function profileSettings(workload, profile) {
  if (!new Set(["smoke", "standard"]).has(profile)) throw new Error(`unknown workload profile ${profile}`);
  const settings = workload.input.value?.profiles?.[profile];
  if (!settings) throw new Error(`${workloadKey(workload)} has no ${profile} profile`);
  return deepFreeze({ ...settings });
}

function gitIdentity(root) {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const commit = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  const status = run(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (commit.status !== 0 || tree.status !== 0 || status.status !== 0) {
    throw new Error("unable to authenticate the Git source identity");
  }
  return { commit: commit.stdout.trim(), tree: tree.stdout.trim(), dirty: status.stdout.trim() !== "" };
}

function requireCurrentBuild(root, { allowDirty = false, inspector = inspectBuildReceipt } = {}) {
  const source = gitIdentity(root);
  if (source.dirty && !allowDirty) {
    throw new Error("optimizer workload evidence requires a clean source tree; use --allow-dirty only for non-promotable development runs");
  }
  const build = inspector(root);
  if (!build?.current) throw new Error(`optimizer workload build preflight failed: ${build?.reason || "unknown build identity"}`);
  return deepFreeze({ source, build: { ...build }, workspaceSha256: workspaceFingerprint(root), promotable: !source.dirty });
}

function canonicalResidue(value, modulus) {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function float64Hex(value) {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleLE(value);
  return bytes.toString("hex");
}

function extensionMultiply(left, right, prime, polynomial) {
  const degree = polynomial.length;
  const modulus = BigInt(prime);
  const product = Array.from({ length: degree * 2 - 1 }, () => 0n);
  for (let leftIndex = 0; leftIndex < degree; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < degree; rightIndex += 1) {
      const index = leftIndex + rightIndex;
      product[index] = canonicalResidue(product[index] + left[leftIndex] * right[rightIndex], modulus);
    }
  }
  for (let exponent = product.length - 1; exponent >= degree; exponent -= 1) {
    const factor = product[exponent];
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = canonicalResidue(product[target] - factor * BigInt(polynomial[index]), modulus);
    }
  }
  return product.slice(0, degree);
}

function machineControlOracle(mode, size) {
  if (!Number.isSafeInteger(size) || size < 1) throw new TypeError("machine-control size must be positive");
  if (mode === "bounded-integer") {
    let value = 17n;
    for (let index = 0; index < size; index += 1) value = -value + 19n;
    return String(value);
  }
  if (mode === "strict-binary64-array") {
    let value = 0.125;
    for (let index = 0; index < size; index += 1) value = value * 0.9999999403953552 + ((index % 17) - 8) / 16;
    return float64Hex(value);
  }
  if (mode === "prime-residue-batch") {
    const modulus = 1009n;
    const output = [];
    for (let index = 0n; index < BigInt(size); index += 1n) {
      const input = canonicalResidue(index * index + 3n * index - 7n, modulus);
      output.push(canonicalResidue(input * 37n + 19n, modulus));
    }
    const sum = output.reduce((total, value) => canonicalResidue(total + value, modulus), 0n);
    return `${sum},${output[0]},${output.at(-1)}`;
  }
  if (mode === "fixed-extension") {
    const prime = 5n;
    let value = [1n, 2n, 3n];
    for (let index = 0; index < size; index += 1) {
      value = extensionMultiply(value, [2n, 1n, 4n], prime, [1, 1, 0])
        .map((entry, coordinate) => canonicalResidue(entry + [3n, 4n, 1n][coordinate], prime));
    }
    return value.join(",");
  }
  if (mode === "packed-container") {
    let checksum = 0n;
    let first = null;
    let last = null;
    for (let index = 0; index < size; index += 1) {
      const output = BigInt(((index % 257) - 128) * -17 + 23);
      if (index === 0) first = output;
      last = output;
      checksum += output;
    }
    return `${checksum},${first},${last}`;
  }
  throw new Error(`unknown machine-control oracle ${mode}`);
}

function primePolynomialOracle(size, modulus = 65_537n, value = 12_345n) {
  let answer = 0n;
  for (let index = size - 1; index >= 0; index -= 1) answer = (answer * value + BigInt(index) % modulus) % modulus;
  return String(answer);
}

function cpythonPrimePolynomialOracle(size, modulus = 65_537, value = 12_345) {
  const source = `answer=0\nfor index in range(${size}-1,-1,-1):\n answer=(answer*${value}+index%${modulus})%${modulus}\nprint(answer)\n`;
  const result = spawnSync(pythonExecutable(), ["-"], { input: source, encoding: "utf8", timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`CPython prime-polynomial oracle failed: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) throw new Error("median requires observations");
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function microseconds(values, unit = "milliseconds") {
  const factor = unit === "seconds" ? 1_000_000 : unit === "milliseconds" ? 1_000 : 1;
  const samples = values.map((value) => Math.max(0, Math.round(value * factor)));
  const ordered = [...samples].sort((left, right) => left - right);
  return { unit: "microseconds", samples, minimum: ordered[0], median: median(ordered), maximum: ordered.at(-1) };
}

function fileDigest(root, repositoryPath) {
  return sha256(fs.readFileSync(path.join(root, repositoryPath)));
}

function phaseTimerOverhead() {
  const baselineRunsMicroseconds = [];
  const instrumentedRunsMicroseconds = [];
  let witness = 0;
  const repetitions = 10_000;
  for (let sample = 0; sample < 5; sample += 1) {
    let started = process.hrtime.bigint();
    for (let index = 0; index < repetitions; index += 1) witness += index & 1;
    baselineRunsMicroseconds.push(Math.max(1, Math.round(Number(process.hrtime.bigint() - started) / 1000)));
    started = process.hrtime.bigint();
    for (let index = 0; index < repetitions; index += 1) {
      performance.now();
      witness += index & 1;
      performance.now();
    }
    instrumentedRunsMicroseconds.push(Math.max(1, Math.round(Number(process.hrtime.bigint() - started) / 1000)));
  }
  const medianRatio = median(instrumentedRunsMicroseconds) / median(baselineRunsMicroseconds);
  return { baselineRunsMicroseconds, instrumentedRunsMicroseconds, medianRatio, witness };
}

function makeRunReceipt(raw) {
  const { root, catalog, workload, preflight } = raw;
  if (!raw.compilerOptions) throw new Error("workload receipt requires exact compiler options");
  if (!catalog.workloads.some((candidate) => candidate.id === workload.id)) {
    throw new Error(`workload ${workload.id} is not a member of catalog ${catalog.id}`);
  }
  const phaseIds = new Set(workload.phases.map((phase) => phase.id));
  for (const id of Object.keys(raw.phaseSamples || {})) {
    if (!phaseIds.has(id)) throw new Error(`profile phase ${id} is absent from workload ${workload.id}`);
  }
  const sourcePaths = [...new Set([
    workload.runner.path,
    DEFAULT_CATALOG,
    ...workload.oracles.map((oracle) => oracle.runnerPath).filter(Boolean),
    ...(raw.sourcePaths || []),
  ])].sort();
  const sourceBundle = sourceBundleIdentity(root, sourcePaths);
  const compiler = canonicalWorkloadCompilerIdentity(root, raw.compilerOptions);
  const buildReceipt = "dist/build-receipt.json";
  const artifact = attachIdentity("sagejs.optimizer-artifact/v1", { kind: raw.artifactKind || "node-build", receiptDigest: fileDigest(root, buildReceipt) });
  const phases = Object.entries(raw.phaseSamples || {}).map(([id, samples]) => ({ id, cold: microseconds([samples.cold], samples.unit), warm: microseconds(samples.warm, samples.unit) })).sort((a, b) => a.id.localeCompare(b.id));
  const outputDigest = sha256(canonicalJson(raw.output));
  const unavailable = new Set(raw.oracleUnavailable || []);
  const oracleResults = workload.oracles.map((oracle) => {
    if (unavailable.has(oracle.id)) return { id: oracle.id, status: "unavailable", digest: null };
    const evidence = raw.oracleEvidence?.[oracle.id];
    if (evidence === undefined) throw new Error(`successful oracle ${oracle.id} has no mechanically checked evidence`);
    const digest = sha256(canonicalJson(evidence));
    if (digest !== oracle.expectedDigest) {
      throw new Error(`oracle ${oracle.id} differs from its workload contract: ${digest}`);
    }
    return { id: oracle.id, status: "pass", digest };
  });
  const resources = raw.resources || { liveBefore: 0, liveAfter: 0, highWater: 0 };
  const timerOverhead = phaseTimerOverhead();
  const document = attachIdentity(SCHEMAS.profile, {
    authority: "host-workload-runner-phase-only",
    workload: { id: workload.id },
    sourceBundle,
    compiler,
    artifact,
    host: { platform: process.platform, architecture: process.arch, runtime: "node", runtimeVersion: process.version, engine: "v8", engineVersion: process.versions.v8 },
    capability: { runtime: "node", sourceSampling: "unavailable" },
    configuration: { target: raw.target, mode: raw.mode || "python", capabilities: workload.capabilities, environmentDigest: sha256(canonicalJson({ configuration: raw.configuration, compilerOptions: raw.compilerOptions, source: preflight.source, workspaceSha256: preflight.workspaceSha256, promotable: preflight.promotable })) },
    outcome: { status: "success", error: null },
    output: { digest: outputDigest, oracleResults },
    compilation: microseconds(raw.compilation || [0], raw.compilationUnit || "milliseconds"),
    execution: { cold: microseconds(raw.cold, raw.executionUnit || "seconds"), warm: microseconds(raw.warm, raw.executionUnit || "seconds") },
    phases,
    sampling: {
      kind: "phase-only",
      intervalMicroseconds: 0,
      rawProfileDigest: null,
      timeDeltaMicroseconds: 0,
      scripts: [],
      mapBindings: [],
      functionSampleCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 },
      functionSamples: [],
      positionTickCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 },
      positionTicks: [],
    },
    optimizer: { reportDigest: sha256(canonicalJson(raw.optimizerIr || [])), regions: [] },
    runtime: { authority: "unavailable", routeEventCounts: { total: 0, attributed: 0, ambiguous: 0, unmatched: 0 }, routeEvents: [] },
    counters: raw.counters || { boundaryCrossings: 0, copiedBytes: 0, materializations: 0, allocations: 0 },
    resources: { ...resources, highWater: Math.max(resources.highWater, resources.liveBefore, resources.liveAfter) },
    overhead: {
      method: "paired-alternating",
      samplingIntervalMicroseconds: 0,
      baselineRunsMicroseconds: timerOverhead.baselineRunsMicroseconds,
      instrumentedRunsMicroseconds: timerOverhead.instrumentedRunsMicroseconds,
      medianRatio: timerOverhead.medianRatio,
      reviewedMaximumRatio: 1000,
      status: "unreviewed",
    },
  });
  return validateProfileReceipt(document, { workloadId: workload.id });
}

function parseLastJson(stdout, label) {
  const source = String(stdout).trim();
  try { return JSON.parse(source); } catch {}
  for (const line of source.split(/\r?\n/).reverse()) {
    try { return JSON.parse(line); } catch {}
  }
  throw new Error(`${label} produced no JSON object`);
}

function parsePrefixedJson(stdout, prefix, label) {
  const line = String(stdout).split(/\r?\n/).findLast((item) => item.startsWith(prefix));
  if (!line) throw new Error(`${label} produced no ${prefix.trim()} payload`);
  try { return JSON.parse(line.slice(prefix.length)); } catch (error) { throw new Error(`${label} produced invalid JSON: ${error.message}`); }
}

module.exports = {
  DEFAULT_CATALOG,
  STATIC_CONTROL_INVENTORY,
  canonicalWorkloadCompilerIdentity,
  cpythonPrimePolynomialOracle,
  findWorkload,
  float64Hex,
  gitIdentity,
  loadCatalog,
  loadStaticControlInventory,
  machineControlOracle,
  makeRunReceipt,
  median,
  parseLastJson,
  parsePrefixedJson,
  primePolynomialOracle,
  profileSettings,
  requireCurrentBuild,
  sha256,
  workloadKey,
};
