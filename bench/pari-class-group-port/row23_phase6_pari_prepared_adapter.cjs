"use strict";

// Linux-only adapter for the pristine PARI 2.17.4 row-23 prepared boundary.
// It authenticates and links the pinned private libpari; /usr/bin/gp is never
// part of this path.

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
const FIELD_ID = "5.5.1002836007889.1";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "341", "-970", "772", "-141", "-2", "1",
]);
const SOURCE = path.join(__dirname, "row23_phase6_pari_prepared_adapter.c");
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row23-phase6-common-projection-v1";

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
  assert.equal(process.platform, "linux", "row-23 PARI adapter is Linux-only");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT ||
    "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE ||
    "/home/user/upstream/pari-2.17.4.tar.gz");
  const objectDirectory = path.join(pariRoot, "Olinux-x86_64");
  const libraryPath = fs.realpathSync(path.join(objectDirectory, "libpari.so"));
  assert.equal(fileSha256(archive), ARCHIVE_SHA256, "wrong PARI archive");
  assert.equal(fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256, "wrong pristine PARI buch2.c");
  assert.equal(fileSha256(libraryPath), LIBRARY_SHA256,
    "wrong pristine PARI library");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row23-pari-"));
  const executable = path.join(directory, "row23-pari-prepared-adapter");
  const arguments_ = [
    "-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${objectDirectory}`,
    SOURCE, `-L${objectDirectory}`, `-Wl,-rpath,${objectDirectory}`,
    "-lpari", "-lm", "-o", executable,
  ];
  const built = spawnSync(process.env.CC || "cc", arguments_, {
    encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  cachedBuild = Object.freeze({ executable, provenance: Object.freeze({
    pariVersion: Object.freeze(["2", "17", "4"]),
    archiveSha256: ARCHIVE_SHA256,
    buch2Sha256: BUCH2_SHA256,
    librarySha256: LIBRARY_SHA256,
    sourceSha256: fileSha256(SOURCE),
    executableSha256: fileSha256(executable),
  }) });
  return cachedBuild;
}

function validateReady(record) {
  exactKeys(record, ["degree", "discriminant", "fieldId", "pariVersion",
    "precisionBits", "preparationNanoseconds", "schema", "signature"],
  "PARI row-23 ready record");
  assert.equal(record.schema, 1);
  assert.equal(record.fieldId, FIELD_ID);
  assert.deepEqual(record.pariVersion, ["2", "17", "4"]);
  assert.equal(record.precisionBits, "192");
  assert.equal(record.degree, "5");
  assert.deepEqual(record.signature, ["5", "0"]);
  assert.equal(record.discriminant, "1002836007889");
  canonicalUnsigned(record.preparationNanoseconds, "nfinit preparation", true);
  return record;
}

function validateProjection(projection) {
  assert.deepEqual(projection, {
    schema: PROJECTION_SCHEMA,
    field: { id: FIELD_ID, polynomialAscending: POLYNOMIAL_ASCENDING },
    classGroup: { classNumber: "6", invariantFactors: ["6"] },
    unitGroup: { rank: "4", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  });
  return projection;
}

function validateSample(sample) {
  exactKeys(sample, ["kernelNanoseconds", "processMaxRssKiB", "projection",
    "rng", "schema"], "PARI row-23 sample");
  assert.equal(sample.schema,
    "sagejs.pari-class-group/row23-pari-prepared-sample-v1");
  canonicalUnsigned(sample.kernelNanoseconds, "bnfinit kernel", true);
  canonicalUnsigned(sample.processMaxRssKiB, "maximum RSS", true);
  validateProjection(sample.projection);
  exactKeys(sample.rng, ["algorithm", "seed", "terminalState"], "RNG record");
  assert.equal(sample.rng.algorithm, "pari-xorshift1024star-2.17.4");
  canonicalUnsigned(sample.rng.seed, "RNG seed");
  assert.equal(sample.rng.terminalState.length, 66);
  sample.rng.terminalState.forEach((value, index) =>
    canonicalUnsigned(value, `RNG state ${index}`));
  return sample;
}

class Client {
  constructor(build = buildHelper()) {
    this.build = build;
    this.buffer = "";
    this.lines = [];
    this.waiters = [];
    this.stderr = "";
    this.closed = false;
    this.child = spawn(build.executable, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME,
        LANG: "C", LC_ALL: "C" },
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
      const error = new Error(
        `row-23 PARI helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }

  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "row-23 helper is closed");
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

function commonProjection(sample) {
  return structuredClone(validateSample(sample).projection);
}

module.exports = { ARCHIVE_SHA256, BUCH2_SHA256, Client, FIELD_ID,
  LIBRARY_SHA256, POLYNOMIAL_ASCENDING, PROJECTION_SCHEMA, buildHelper,
  commonProjection, validateProjection, validateReady, validateSample };
