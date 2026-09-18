"use strict";

// Linux-only adapter for the pinned pristine PARI 2.17.4 row-21 prepared
// boundary. The system gp executable is not part of this path.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIBRARY_SHA256 =
  "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f";
const FIELD_ID = "5.3.1009349859375.3";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "36", "930", "-305", "-90", "0", "1",
]);
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-common-group-structure-projection-v2";
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-common-group-structure-replay-v1";
const SOURCE = path.join(__dirname, "row21_phase6_pari_prepared_adapter.c");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const fileSha256 = filename => sha256(fs.readFileSync(filename));

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has unexpected fields`);
}

function canonicalUnsigned(value, label, positive = false) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  if (positive) assert(BigInt(value) > 0n, `${label} must be positive`);
  return value;
}

let cachedBuild;

function buildHelper() {
  if (cachedBuild) return cachedBuild;
  assert.equal(process.platform, "linux", "row-21 PARI adapter is Linux-only");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT ||
    "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE ||
    "/home/user/upstream/pari-2.17.4.tar.gz");
  const objects = path.join(pariRoot, "Olinux-x86_64");
  const library = fs.realpathSync(path.join(objects, "libpari.so"));
  assert.equal(fileSha256(archive), ARCHIVE_SHA256, "wrong PARI archive");
  assert.equal(fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256, "wrong pristine PARI buch2.c");
  assert.equal(fileSha256(library), LIBRARY_SHA256,
    "wrong pristine PARI library");
  const compiler = fs.realpathSync(spawnSync("which", [process.env.CC || "cc"],
    { encoding: "utf8" }).stdout.trim());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row21-pari-"));
  const executable = path.join(directory, "row21-pari-prepared-adapter");
  const args = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${objects}`, SOURCE,
    `-L${objects}`, `-Wl,-rpath,${objects}`, "-lpari", "-lm", "-o", executable];
  const built = spawnSync(compiler, args, { encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024 });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  cachedBuild = Object.freeze({ executable, provenance: Object.freeze({
    pariVersion: Object.freeze(["2", "17", "4"]),
    archiveSha256: ARCHIVE_SHA256, buch2Sha256: BUCH2_SHA256,
    librarySha256: LIBRARY_SHA256, sourceSha256: fileSha256(SOURCE),
    executableSha256: fileSha256(executable), compiler,
  }) });
  return cachedBuild;
}

function validateProjection(projection) {
  assert.deepEqual(projection, {
    schema: PROJECTION_SCHEMA,
    scope: "exact-abstract-class-and-unit-structure",
    field: { id: FIELD_ID,
      polynomialAscending: POLYNOMIAL_ASCENDING },
    classGroup: { classNumber: "1", invariantFactors: [],
      generatorCount: "0" },
    unitGroup: { rank: "3", torsionOrder: "2" },
    regulatorEvidence: "nonzero-only-not-equal-value",
    completionMode: "flag-zero-class-and-unit-result",
  });
  return projection;
}

function validateReady(record) {
  exactKeys(record, ["degree", "discriminant", "fieldId", "pariVersion",
    "precisionBits", "preparationNanoseconds", "schema", "signature"],
  "PARI row-21 ready record");
  assert.equal(record.schema, 1);
  assert.equal(record.fieldId, FIELD_ID);
  assert.deepEqual(record.pariVersion, ["2", "17", "4"]);
  assert.equal(record.precisionBits, "192");
  assert.equal(record.degree, "5");
  assert.deepEqual(record.signature, ["3", "1"]);
  assert.equal(record.discriminant, "-1009349859375");
  canonicalUnsigned(record.preparationNanoseconds, "nfinit preparation", true);
  return record;
}

function validateSample(sample) {
  exactKeys(sample, ["kernelNanoseconds", "observedCounters",
    "processMaxRssKiB", "projection", "replay", "resourceCounters", "rng",
    "schema"], "PARI row-21 sample");
  assert.equal(sample.schema,
    "sagejs.pari-class-group/row21-pari-prepared-sample-v2");
  canonicalUnsigned(sample.kernelNanoseconds, "bnfinit kernel", true);
  canonicalUnsigned(sample.processMaxRssKiB, "maximum RSS", true);
  validateProjection(sample.projection);
  exactKeys(sample.rng, ["algorithm", "seed", "terminalState"], "RNG record");
  assert.equal(sample.rng.algorithm, "pari-xorshift1024star-2.17.4");
  canonicalUnsigned(sample.rng.seed, "RNG seed", true);
  assert.equal(sample.rng.terminalState.length, 66);
  sample.rng.terminalState.forEach((value, index) =>
    canonicalUnsigned(value, `RNG state ${index}`));
  assert.deepEqual(sample.replay, {
    schema: REPLAY_SCHEMA,
    scope: "exact-abstract-class-and-unit-structure",
    fieldId: FIELD_ID, classNumber: "1", invariantFactors: [],
    generatorCount: "0", unitRank: "3", torsionOrder: "2",
    regulatorNonzero: true,
  });
  assert.deepEqual(sample.observedCounters, {
    classGenerators: "0", classNumber: "1", degree: "5",
    exactFundamentalUnits: "3", unitRank: "3",
  });
  assert.deepEqual(sample.resourceCounters,
    { bnfinit0CallCount: "1", mathematicalCalls: "1" });
  return sample;
}

function replayProjection(sample) {
  validateSample(sample);
  return structuredClone(sample.replay);
}

function observedCounters(sample) {
  validateSample(sample);
  return structuredClone(sample.observedCounters);
}

class Client {
  constructor(build = buildHelper()) {
    this.build = build;
    this.buffer = ""; this.lines = []; this.waiters = [];
    this.stderr = ""; this.closed = false;
    this.child = spawn(build.executable, [], { stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME,
        LANG: "C", LC_ALL: "C" } });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      for (;;) {
        const at = this.buffer.indexOf("\n");
        if (at < 0) break;
        const line = this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + 1);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(line); else this.lines.push(line);
      }
    });
    this.exit = new Promise(resolve => this.child.once("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(
        `row-21 PARI helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }

  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "row-21 helper is closed");
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async ready() {
    const line = await this.nextLine();
    assert(line.startsWith("READY "), `unexpected helper greeting: ${line}`);
    return validateReady(JSON.parse(line.slice(6)));
  }

  async run(seed = "1") {
    assert.match(seed, /^[1-9][0-9]*$/, "seed must be a positive integer");
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

function commonProjection(sample) {
  return structuredClone(validateSample(sample).projection);
}

module.exports = { ARCHIVE_SHA256, BUCH2_SHA256, Client, FIELD_ID,
  LIBRARY_SHA256, POLYNOMIAL_ASCENDING, PROJECTION_SCHEMA, REPLAY_SCHEMA,
  buildHelper, commonProjection, observedCounters, replayProjection,
  validateProjection, validateReady, validateSample };
