"use strict";

// Linux-only benchmark adapter for pristine PARI 2.17.4.  This module never
// uses /usr/bin/gp: it authenticates and links the pinned private libpari.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "-200000002", "-200000002", "0", "0", "1",
]);
const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const SOURCE_PATH = path.join(__dirname, "row14_pari_prepared_timing_adapter.c");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filename) {
  return sha256(fs.readFileSync(filename));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${name} has unexpected fields`);
}

function canonicalUnsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${name} must be canonical`);
  const result = BigInt(value);
  if (positive) assert(result > 0n, `${name} must be positive`);
  return result;
}

function canonicalSigned(value, name) {
  assert.equal(typeof value, "string", `${name} must be a string`);
  assert.match(value, /^(0|-?[1-9][0-9]*)$/, `${name} must be canonical`);
  return BigInt(value);
}

function compilerIdentity(compiler) {
  const found = path.isAbsolute(compiler)
    ? compiler
    : spawnSync("which", [compiler], { encoding: "utf8" }).stdout.trim();
  assert(found, `compiler ${compiler} was not found`);
  const executable = fs.realpathSync(found);
  const version = spawnSync(executable, ["--version"], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(version.status, 0, version.stderr || String(version.error));
  return {
    requested: compiler,
    executable,
    executableSha256: fileSha256(executable),
    version: version.stdout.split("\n")[0],
  };
}

let buildCache = null;

function buildHelper() {
  if (buildCache) return buildCache;
  assert.equal(process.platform, "linux", "row-14 PARI timing is Linux-only");
  const pariRoot = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  const archive = path.resolve(
    process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(fileSha256(archive), ARCHIVE_SHA256, "wrong PARI archive");
  assert.equal(fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256, "wrong pristine PARI buch2.c");
  const objectDirectory = path.join(pariRoot, "Olinux-x86_64");
  const libraryPath = fs.realpathSync(path.join(objectDirectory, "libpari.so"));
  const compiler = compilerIdentity(process.env.CC || "cc");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-row14-pari-prepared-timing-"),
  );
  const executable = path.join(directory, "row14-pari-prepared-adapter");
  const normalizedArguments = [
    "-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    "-I$PARI_ROOT/src/headers", "-I$PARI_OBJECT_DIRECTORY",
    "row14_pari_prepared_timing_adapter.c", "-L$PARI_OBJECT_DIRECTORY",
    "-Wl,-rpath,$PARI_OBJECT_DIRECTORY", "-lpari", "-lm", "-o", "$EXECUTABLE",
  ];
  const compileArguments = [
    "-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${objectDirectory}`,
    SOURCE_PATH, `-L${objectDirectory}`, `-Wl,-rpath,${objectDirectory}`,
    "-lpari", "-lm", "-o", executable,
  ];
  const built = spawnSync(compiler.executable, compileArguments, {
    encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  const provenance = {
    schema: "sagejs.pari-class-group/row14-pari-prepared-build-v1",
    pariVersion: ["2", "17", "4"],
    archiveSha256: fileSha256(archive),
    buch2Sha256: fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    librarySha256: fileSha256(libraryPath),
    sourceSha256: fileSha256(SOURCE_PATH),
    compiler,
    compilerArguments: normalizedArguments,
    executableSha256: fileSha256(executable),
  };
  provenance.toolchainSha256 = digest({
    pariVersion: provenance.pariVersion,
    archiveSha256: provenance.archiveSha256,
    buch2Sha256: provenance.buch2Sha256,
    librarySha256: provenance.librarySha256,
    sourceSha256: provenance.sourceSha256,
    compiler: provenance.compiler,
    compilerArguments: provenance.compilerArguments,
  });
  buildCache = Object.freeze({
    archive, pariRoot, objectDirectory, libraryPath, executable, provenance,
  });
  return buildCache;
}

function validateReady(record) {
  exactKeys(record, [
    "schema", "fieldId", "pariVersion", "precisionBits", "degree",
    "signature", "discriminant", "preparationNanoseconds",
  ], "PARI row-14 ready record");
  assert.equal(record.schema, 1);
  assert.equal(record.fieldId, FIELD_ID);
  assert.deepEqual(record.pariVersion, ["2", "17", "4"]);
  assert.equal(record.precisionBits, "192");
  assert.equal(record.degree, "4");
  assert.deepEqual(record.signature, ["2", "1"]);
  assert.equal(record.discriminant,
    "-43200003776000087360000787200002480");
  canonicalUnsigned(record.preparationNanoseconds, "nfinit preparation", { positive: true });
  return record;
}

function validateTriplet(value, name) {
  assert(Array.isArray(value) && value.length === 3, `${name} is not a real triplet`);
  value.forEach((entry, index) => {
    assert.equal(typeof entry, "string", `${name}[${index}] is not a string`);
    assert.match(entry, /^-?[0-9]+$/);
  });
}

function validateSample(sample) {
  exactKeys(sample, [
    "schema", "kernelNanoseconds", "result", "work", "rng", "processMaxRssKiB",
  ], "PARI row-14 sample");
  assert.equal(sample.schema,
    "sagejs.pari-class-group/row14-pari-prepared-sample-v1");
  canonicalUnsigned(sample.kernelNanoseconds, "bnfinit kernel", { positive: true });
  canonicalUnsigned(sample.processMaxRssKiB, "maximum RSS", { positive: true });
  exactKeys(sample.result, ["field", "classGroup", "unitGroup", "terminal"], "result");
  assert.equal(sample.result.field.id, FIELD_ID);
  assert.deepEqual(sample.result.field.polynomialAscending, POLYNOMIAL_ASCENDING);
  assert.equal(sample.result.classGroup.classNumber, "192");
  assert.deepEqual(sample.result.classGroup.invariantFactorsSourceOrder, ["24", "8"]);
  assert.equal(sample.result.classGroup.generatorIdealHnfs.length, 2);
  for (const ideal of sample.result.classGroup.generatorIdealHnfs) {
    assert.equal(ideal.length, 4);
    ideal.forEach((row, rowIndex) => {
      assert.equal(row.length, 4);
      row.forEach((value, columnIndex) => canonicalSigned(
        value, `generator ideal cell ${rowIndex},${columnIndex}`));
    });
  }
  assert.equal(sample.result.unitGroup.rank, "2");
  assert.deepEqual(sample.result.unitGroup.logEmbeddingShape, ["3", "2"]);
  assert.equal(sample.result.unitGroup.logEmbeddingColumnMajor.length, 6);
  sample.result.unitGroup.logEmbeddingColumnMajor.forEach((value, index) =>
    validateTriplet(value, `log entry ${index}`));
  validateTriplet(sample.result.unitGroup.regulatorTriplet, "regulator");
  assert.equal(sample.result.unitGroup.torsionOrder, "2");
  assert.equal(sample.result.unitGroup.torsionGeneratorPowerBasis.length, 4);
  sample.result.unitGroup.torsionGeneratorPowerBasis.forEach((value, index) =>
    canonicalSigned(value, `torsion basis ${index}`));
  assert.deepEqual(sample.result.unitGroup.flagZeroFundamentalUnits, {
    pariType: "19", logicalLength: "0", status: "not_given(LARGE)",
  });
  assert.deepEqual(sample.result.terminal, {
    status: "pari-flag-zero-complete",
    correspondenceAssumed: true,
    publicCertified: false,
  });
  exactKeys(sample.work, [
    "degree", "factorBaseSize", "classHnfColumns",
    "logEmbeddingRows", "logEmbeddingColumns",
  ], "work record");
  assert.equal(sample.work.degree, "4");
  assert.equal(sample.work.factorBaseSize, "799");
  assert.equal(sample.work.classHnfColumns, "3");
  assert.equal(sample.work.logEmbeddingRows, "3");
  assert.equal(sample.work.logEmbeddingColumns, "2");
  exactKeys(sample.rng, ["algorithm", "seed", "terminalState"], "RNG record");
  assert.equal(sample.rng.algorithm, "pari-xorshift1024star-2.17.4");
  assert.match(sample.rng.seed, /^(0|[1-9][0-9]*)$/);
  assert.equal(sample.rng.terminalState.length, 66);
  sample.rng.terminalState.forEach((value, index) =>
    canonicalUnsigned(value, `RNG word ${index}`));
  return sample;
}

class HelperClient {
  constructor(build = buildHelper()) {
    this.build = build;
    this.buffer = "";
    this.lines = [];
    this.waiters = [];
    this.stderr = "";
    this.closed = false;
    this.child = spawn(build.executable, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", LC_ALL: "C" },
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(line);
        else this.lines.push(line);
      }
    });
    this.exit = new Promise(resolve => this.child.once("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(`row-14 PARI helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }

  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "row-14 PARI helper is closed");
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async ready() {
    const line = await this.nextLine();
    assert(line.startsWith("READY "), `unexpected helper greeting: ${line}`);
    return validateReady(JSON.parse(line.slice(6)));
  }

  async run(seed = "1") {
    assert.match(seed, /^(0|[1-9][0-9]*)$/);
    this.child.stdin.write(`RUN ${seed}\n`);
    return validateSample(JSON.parse(await this.nextLine()));
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end("CLOSE\n");
    const result = await this.exit;
    assert.equal(result.signal, null);
    assert.equal(result.code, 0, this.stderr);
  }
}

function semanticRecord(sample) {
  return {
    result: sample.result,
    work: sample.work,
    rng: sample.rng,
  };
}

function matchedProjection(sample) {
  validateSample(sample);
  return {
    schema: "sagejs.pari-class-group/row14-flag-zero-matched-projection-v1",
    field: sample.result.field,
    classGroup: {
      classNumber: sample.result.classGroup.classNumber,
      invariantFactors: [...sample.result.classGroup.invariantFactorsSourceOrder].reverse(),
      generatorCount: String(sample.result.classGroup.generatorIdealHnfs.length),
    },
    unitGroup: {
      rank: sample.result.unitGroup.rank,
      regulatorPresent: true,
      torsionOrder: sample.result.unitGroup.torsionOrder,
      flagZeroStatus: sample.result.unitGroup.flagZeroFundamentalUnits.status,
    },
    terminalStatus: sample.result.terminal.status,
  };
}

function alternatingOrder(pairIndex) {
  assert(Number.isSafeInteger(pairIndex) && pairIndex >= 0);
  return pairIndex % 2 === 0
    ? ["sagejs", "pari", "pari", "sagejs"]
    : ["pari", "sagejs", "sagejs", "pari"];
}

async function runAlternatingCampaign({ pairCount = 7, executeArm }) {
  assert(Number.isSafeInteger(pairCount) && pairCount >= 7,
    "an alternating diagnostic requires at least seven pairs");
  assert.equal(typeof executeArm, "function");
  const pairs = [];
  let projectionSha256 = null;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
    const order = alternatingOrder(pairIndex);
    const arms = [];
    for (const [position, implementation] of order.entries()) {
      const arm = await executeArm({ pairIndex, position, implementation });
      exactKeys(arm, ["implementation", "kernelNanoseconds", "matchedProjection"],
        "alternating timing arm");
      assert.equal(arm.implementation, implementation);
      canonicalUnsigned(arm.kernelNanoseconds, "arm kernel time", { positive: true });
      const current = digest(arm.matchedProjection);
      projectionSha256 ??= current;
      assert.equal(current, projectionSha256,
        "alternating arms do not publish the same matched result projection");
      arms.push(arm);
    }
    pairs.push({ pairIndex, order, arms });
  }
  return {
    schema: "sagejs.pari-class-group/row14-prepared-alternating-campaign-v1",
    pairCount,
    schedule: "ABBA/BAAB",
    matchedProjectionSha256: projectionSha256,
    pairs,
    ratioPublished: false,
    qualifiedTiming: false,
    qualification:
      "a coordinator must separately prove identical prepared-input and resident-output boundaries",
  };
}

async function runPariBaseline({ samples = 1, seed = "1" } = {}) {
  assert(Number.isSafeInteger(samples) && samples >= 1);
  const build = buildHelper();
  const client = new HelperClient(build);
  const ready = await client.ready();
  const values = [];
  try {
    for (let index = 0; index < samples; index++) values.push(await client.run(seed));
  } finally {
    await client.close();
  }
  const reference = digest(semanticRecord(values[0]));
  values.forEach(value => assert.equal(digest(semanticRecord(value)), reference,
    "PARI row-14 semantic output changed across repetitions"));
  return {
    schema: "sagejs.pari-class-group/row14-pari-prepared-baseline-v1",
    diagnosticOnly: true,
    qualifiedTiming: false,
    ratioPublished: false,
    boundary: "prepared nfinit outside; complete pristine bnfinit0(nf,0) inside",
    preparation: ready,
    provenance: build.provenance,
    semanticRecordSha256: reference,
    matchedProjectionSha256: digest(matchedProjection(values[0])),
    samples: values.map(value => ({
      kernelNanoseconds: value.kernelNanoseconds,
      processMaxRssKiB: value.processMaxRssKiB,
    })),
    alternatingProtocol: {
      minimumDiagnosticPairs: 7,
      minimumFinalPairs: 11,
      orders: [alternatingOrder(0), alternatingOrder(1)],
      status: "mechanism-ready; awaiting identical Sage.js prepared boundary",
    },
  };
}

module.exports = {
  ARCHIVE_SHA256,
  BUCH2_SHA256,
  FIELD_ID,
  POLYNOMIAL_ASCENDING,
  HelperClient,
  alternatingOrder,
  buildHelper,
  digest,
  matchedProjection,
  runAlternatingCampaign,
  runPariBaseline,
  semanticRecord,
  validateReady,
  validateSample,
};
