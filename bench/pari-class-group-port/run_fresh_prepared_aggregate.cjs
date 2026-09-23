#!/usr/bin/env node
"use strict";

// Sequential, correctness-only aggregate gate for the frozen 16 development
// roots.  Every row runs in a fresh bounded process.  Child logs and durable
// row outputs live only in a private temporary directory removed on success or
// failure.  The published receipt contains no clocks, RSS, or timing claim.

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const roots = require("./phase5_development_roots.cjs");
const child = require("./fresh_prepared_aggregate_child.cjs");

const AGGREGATE_SCHEMA =
  "sagejs.pari-class-group/fresh-prepared-development-aggregate-v1";
const CORPUS_SCHEMA =
  "sagejs.pari-class-group/fresh-prepared-corpus-index-v1";
const SHA256 = /^[0-9a-f]{64}$/;
const RESOURCE_BOUNDS = Object.freeze({
  addressSpaceBytes: 4 * 1024 * 1024 * 1024,
  cpuSeconds: 600,
  fileBytes: 1024 * 1024 * 1024,
  wallMilliseconds: 600_000,
});

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function frozenPopulation() {
  return roots.DEVELOPMENT_ROOTS.map(root => ({
    panelIndex: root.panelIndex,
    fieldId: root.manifestFieldId,
    internalFieldId: root.internalFieldId,
  }));
}

function inspectCorpus(directory) {
  const corpusDirectory = fs.realpathSync(directory);
  const manifestPath = path.join(__dirname, "fresh-prepared-corpus-manifest.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const indexPath = path.join(corpusDirectory, "prepared-corpus-index.json");
  const indexBytes = fs.readFileSync(indexPath);
  const index = JSON.parse(indexBytes);
  assert.equal(index.schema, CORPUS_SCHEMA);
  assert.equal(index.manifestSha256, sha256(manifestBytes));
  assert.equal(index.sourceManifestSha256, manifest.sourceManifestSha256);
  assert.equal(index.count, 16);
  assert.equal(index.files.length, 16);
  const population = frozenPopulation();
  assert.deepEqual(manifest.rows.map(row => row.panelIndex),
    population.map(row => row.panelIndex));
  assert.deepEqual(index.files.map(row => row.panelIndex),
    population.map(row => row.panelIndex));
  const files = population.map(identity => {
    const expected = manifest.rows.find(row => row.panelIndex === identity.panelIndex);
    const record = index.files.find(row => row.panelIndex === identity.panelIndex);
    assert(record && expected);
    assert.equal(record.fieldId, identity.fieldId);
    assert.equal(record.sha256, expected.preparedJsonSha256);
    assert.equal(record.authoritySha256, expected.preparedAuthoritySha256);
    const filename = path.join(corpusDirectory, record.filename);
    const stat = fs.statSync(filename);
    assert(stat.isFile());
    assert.equal(stat.mode & 0o222, 0, `prepared row ${identity.panelIndex} is writable`);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, expected.preparedJsonBytes);
    assert.equal(sha256(bytes), expected.preparedJsonSha256);
    return Object.freeze({ ...identity, filename,
      preparedJsonSha256: expected.preparedJsonSha256,
      preparedAuthoritySha256: expected.preparedAuthoritySha256 });
  });
  return Object.freeze({
    directory: corpusDirectory,
    manifestSha256: sha256(manifestBytes),
    indexSha256: sha256(indexBytes),
    sourceManifestSha256: manifest.sourceManifestSha256,
    files: Object.freeze(files),
  });
}

function probeRegistry(corpusDirectory) {
  const resolvedCorpus = fs.realpathSync(corpusDirectory);
  const result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, "fresh_prepared_aggregate_child.cjs"), "--probe",
      resolvedCorpus], {
      cwd: __dirname,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: { ...process.env, SAGEJS_AGGREGATE_CHILD: "1" },
    });
  assert.equal(result.status, 0, result.stderr || "registry probe failed");
  const probe = JSON.parse(result.stdout);
  assert.equal(probe.schema, child.PROBE_SCHEMA);
  assert.deepEqual(probe.expected, frozenPopulation().map(row => row.panelIndex));
  assert.deepEqual([...probe.registered, ...probe.missing].sort((a, b) => a - b),
    probe.expected);
  assert.deepEqual(probe.validated.map(row => row.panelIndex), probe.registered);
  return Object.freeze(probe);
}

function assertRegistryReady(probe) {
  assert.equal(probe.ready, true,
    `aggregate gate remains closed; missing fresh-prepared rows: ${probe.missing.join(",")}`);
  assert.deepEqual(probe.registered, probe.expected);
  assert.deepEqual(probe.missing, []);
  assert.equal(probe.allInputsAuthenticated, true);
  assert.equal(probe.validated.length, probe.expected.length);
}

function privateTemporaryRoot() {
  const preferred = "/scratch";
  let base = os.tmpdir();
  try {
    if (fs.statSync(preferred).isDirectory()) {
      fs.accessSync(preferred, fs.constants.W_OK);
      base = preferred;
    }
  } catch {}
  const directory = fs.mkdtempSync(path.join(base, "sagejs-fresh-aggregate-"));
  fs.chmodSync(directory, 0o700);
  return directory;
}

function boundedChildArguments(row, outputDirectory, receiptPath) {
  return [
    `--as=${RESOURCE_BOUNDS.addressSpaceBytes}`,
    `--cpu=${RESOURCE_BOUNDS.cpuSeconds}`,
    `--fsize=${RESOURCE_BOUNDS.fileBytes}`,
    "--nofile=1024:1024",
    "--nproc=512:512",
    "--",
    process.execPath,
    path.join(__dirname, "fresh_prepared_aggregate_child.cjs"),
    "--run",
    String(row.panelIndex),
    row.filename,
    outputDirectory,
    receiptPath,
  ];
}

async function executeBoundedRow(row, temporaryRoot) {
  const rowDirectory = path.join(temporaryRoot,
    `row-${String(row.panelIndex).padStart(2, "0")}`);
  const outputDirectory = path.join(rowDirectory, "output");
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(rowDirectory, 0o700);
  fs.chmodSync(outputDirectory, 0o700);
  const receiptPath = path.join(rowDirectory, "child-receipt.json");
  const log = fs.openSync(path.join(rowDirectory, "child.log"), "wx", 0o600);
  let processHandle;
  try {
    processHandle = childProcess.spawn("/usr/bin/prlimit",
      boundedChildArguments(row, outputDirectory, receiptPath), {
        cwd: __dirname,
        detached: true,
        env: { ...process.env, SAGEJS_AGGREGATE_CHILD: "1" },
        stdio: ["ignore", log, log],
      });
    const exit = await new Promise((resolve, reject) => {
      let wallBoundExceeded = false;
      const timer = setTimeout(() => {
        wallBoundExceeded = true;
        try { process.kill(-processHandle.pid, "SIGTERM"); } catch {}
        setTimeout(() => {
          try { process.kill(-processHandle.pid, "SIGKILL"); } catch {}
        }, 5000).unref();
      }, RESOURCE_BOUNDS.wallMilliseconds);
      processHandle.once("error", error => { clearTimeout(timer); reject(error); });
      processHandle.once("exit", (code, signal) => {
        clearTimeout(timer);
        if (wallBoundExceeded) {
          reject(new Error(
            `fresh-prepared row ${row.panelIndex} exceeded its wall bound`));
        } else {
          resolve({ code, signal });
        }
      });
    });
    if (exit.signal !== null || exit.code !== 0) {
      const diagnostic = fs.readFileSync(path.join(rowDirectory, "child.log"), "utf8");
      const status = exit.signal === null ? `exit ${exit.code}`
        : `signal ${exit.signal}`;
      assert.fail(`fresh-prepared row ${row.panelIndex} failed (${status}):\n${diagnostic.slice(-12000)}`);
    }
    const stat = fs.statSync(receiptPath);
    assert.equal(stat.mode & 0o222, 0, "child receipt is writable");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    assert.equal(receipt.schema, child.CHILD_SCHEMA);
    assert.equal(receipt.panelIndex, row.panelIndex);
    assert.equal(receipt.fieldId, row.fieldId);
    assert.equal(receipt.internalFieldId, row.internalFieldId);
    assert.equal(receipt.preparedJsonSha256, row.preparedJsonSha256);
    assert.equal(receipt.preparedAuthoritySha256, row.preparedAuthoritySha256);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    assert.equal(receipt.freshPreparedExecution, true);
    assert.equal(receipt.registryAdmission, true);
    assert.equal(receipt.qualifiedTiming, false);
    assert.equal(receipt.retainedRuntimeInputs, false);
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert(SHA256.test(receipt.resultSha256));
    assert(SHA256.test(receipt.payloadSha256));
    return Object.freeze(receipt);
  } finally {
    fs.closeSync(log);
  }
}

function publishReceipt(filename, receipt) {
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 });
  fs.chmodSync(filename, 0o444);
  return Object.freeze({ path: path.resolve(filename), bytes: bytes.length,
    sha256: sha256(bytes) });
}

function verifyAggregateReceipt(receipt, corpus) {
  assert(receipt && typeof receipt === "object" && !Array.isArray(receipt));
  assert.equal(receipt.schema, AGGREGATE_SCHEMA);
  assert.equal(receipt.sourceManifestSha256, corpus.sourceManifestSha256);
  assert.equal(receipt.corpusManifestSha256, corpus.manifestSha256);
  assert.equal(receipt.corpusIndexSha256, corpus.indexSha256);
  assert.equal(receipt.registrySchema,
    require("./fresh_prepared_development_registry.cjs").SCHEMA);
  assert.equal(receipt.count, 16);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.allFreshPreparedExecutions, true);
  assert.equal(receipt.allRegistryAdmissions, true);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.qualifiedTiming, false);
  assert.deepEqual(receipt.population, frozenPopulation());
  assert.equal(receipt.rows.length, 16);
  assert.deepEqual(receipt.rows.map(row => row.panelIndex),
    corpus.files.map(row => row.panelIndex));
  for (let index = 0; index < receipt.rows.length; index += 1) {
    const row = receipt.rows[index];
    const expected = corpus.files[index];
    assert.equal(row.schema, child.CHILD_SCHEMA);
    assert.equal(row.fieldId, expected.fieldId);
    assert.equal(row.internalFieldId, expected.internalFieldId);
    assert.equal(row.preparedJsonSha256, expected.preparedJsonSha256);
    assert.equal(row.preparedAuthoritySha256, expected.preparedAuthoritySha256);
    assert(SHA256.test(row.resultSha256));
    assert(SHA256.test(row.payloadSha256));
    assert.equal(row.correspondenceComplete, true);
    assert.equal(row.publicComplete, false);
    assert.equal(row.freshPreparedExecution, true);
    assert.equal(row.registryAdmission, true);
    assert.equal(row.qualifiedTiming, false);
    assert.equal(row.retainedRuntimeInputs, false);
    assert.equal(row.frozenW0RuntimeInput, false);
  }
  for (const key of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
    "wallNanoseconds", "kernelNanoseconds", "threadCpuNanoseconds"]) {
    assert.equal(JSON.stringify(receipt).includes(`\"${key}\"`), false,
      `aggregate receipt leaked timing field ${key}`);
  }
  const { aggregateSha256, ...body } = receipt;
  assert.equal(aggregateSha256, sha256(Buffer.from(canonical(body))));
  return receipt;
}

async function runAggregate(corpusDirectory, receiptPath) {
  assert.equal(fs.existsSync(receiptPath), false,
    "aggregate receipt destination already exists");
  const corpus = inspectCorpus(corpusDirectory);
  const probe = probeRegistry(corpus.directory);
  assertRegistryReady(probe);
  const temporaryRoot = privateTemporaryRoot();
  try {
    const rows = [];
    for (const row of corpus.files) {
      rows.push(await executeBoundedRow(row, temporaryRoot));
    }
    const body = {
      schema: AGGREGATE_SCHEMA,
      sourceManifestSha256: corpus.sourceManifestSha256,
      corpusManifestSha256: corpus.manifestSha256,
      corpusIndexSha256: corpus.indexSha256,
      registrySchema: require("./fresh_prepared_development_registry.cjs").SCHEMA,
      count: rows.length,
      population: frozenPopulation(),
      rows,
      correspondenceComplete: true,
      publicComplete: false,
      allFreshPreparedExecutions: true,
      allRegistryAdmissions: true,
      retainedRuntimeInputs: false,
      frozenW0RuntimeInput: false,
      qualifiedTiming: false,
    };
    const receipt = Object.freeze({
      ...body,
      aggregateSha256: sha256(Buffer.from(canonical(body))),
    });
    verifyAggregateReceipt(receipt, corpus);
    return Object.freeze({ receipt, publication: publishReceipt(receiptPath, receipt) });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function main(argv) {
  if (argv[2] === "--inspect") {
    assert(argv[3], "usage: run_fresh_prepared_aggregate.cjs --inspect CORPUS");
    const corpus = inspectCorpus(argv[3]);
    const probe = probeRegistry(corpus.directory);
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/fresh-prepared-aggregate-inspection-v2",
      corpusRows: corpus.files.length,
      expected: probe.expected,
      registered: probe.registered,
      missing: probe.missing,
      validated: probe.validated,
      allInputsAuthenticated: probe.allInputsAuthenticated,
      ready: probe.ready,
      executionStarted: false,
      timingClaim: false,
    }, null, 2)}\n`);
    return;
  }
  assert.equal(argv[2], "--run",
    "aggregate execution is explicit: --run CORPUS RECEIPT");
  assert(argv[3] && argv[4],
    "usage: run_fresh_prepared_aggregate.cjs --run CORPUS RECEIPT");
  const completed = await runAggregate(argv[3], path.resolve(argv[4]));
  process.stdout.write(`${JSON.stringify(completed.publication)}\n`);
}

if (require.main === module) {
  main(process.argv).catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  AGGREGATE_SCHEMA,
  RESOURCE_BOUNDS,
  assertRegistryReady,
  canonical,
  frozenPopulation,
  inspectCorpus,
  probeRegistry,
  runAggregate,
  verifyAggregateReceipt,
};
