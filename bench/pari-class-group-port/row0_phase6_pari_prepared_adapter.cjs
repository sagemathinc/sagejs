"use strict";

// Shared implementation for the four row-prefixed Phase-6 PARI adapters.
// The exported factory compiles a distinct executable for each compile-time
// ROW_INDEX, so every helper owns exactly one resident prepared nf.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const SOURCE = path.join(__dirname, "row0_phase6_pari_prepared_adapter.c");
const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIBRARY_SHA256 =
  "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f";
const ROWS = Object.freeze({
  0: Object.freeze({ fieldId: "pari-2.17.4:x^3-20018*x+20034",
    polynomialAscending: ["20034", "-20018", "0", "1"],
    classNumber: "1", invariantFactors: [], unitRank: "2" }),
  1: Object.freeze({ fieldId:
    "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f",
    polynomialAscending: ["20018", "-20010", "0", "1"],
    classNumber: "3", invariantFactors: ["3"], unitRank: "2" }),
  3: Object.freeze({ fieldId:
    "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
    polynomialAscending: ["20000000042", "-20000000022", "0", "1"],
    classNumber: "6", invariantFactors: ["6"], unitRank: "2" }),
  4: Object.freeze({ fieldId:
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
    polynomialAscending: ["20000000018", "-20000000010", "0", "1"],
    classNumber: "2", invariantFactors: ["2"], unitRank: "2" }),
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = filename => sha256(fs.readFileSync(filename));
const buildCache = new Map();

function validateProjection(row, projection) {
  const expected = ROWS[row];
  assert(expected, `unsupported development row ${row}`);
  assert.deepEqual(projection, {
    schema: `sagejs.pari-class-group/row${row}-phase6-common-projection-v1`,
    field: { id: expected.fieldId,
      polynomialAscending: expected.polynomialAscending },
    classGroup: { classNumber: expected.classNumber,
      invariantFactors: expected.invariantFactors },
    unitGroup: { rank: expected.unitRank, regulatorPresent: true,
      torsionOrder: "2" },
    work: { degree: "3", logRows: "3", logColumns: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  });
  return projection;
}

function buildHelper(row) {
  assert(ROWS[row], `unsupported Phase-6 row ${row}`);
  if (buildCache.has(row)) return buildCache.get(row);
  assert.equal(process.platform, "linux", "Phase-6 PARI adapter is Linux-only");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT ||
    "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE ||
    "/home/user/upstream/pari-2.17.4.tar.gz");
  const objects = path.join(pariRoot, "Olinux-x86_64");
  const library = fs.realpathSync(path.join(objects, "libpari.so"));
  assert.equal(fileSha256(archive), ARCHIVE_SHA256, "wrong PARI archive");
  assert.equal(fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256, "wrong pristine buch2.c");
  assert.equal(fileSha256(library), LIBRARY_SHA256, "wrong PARI library");
  const cc = fs.realpathSync(spawnSync("which", [process.env.CC || "cc"], {
    encoding: "utf8" }).stdout.trim());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    `sagejs-row${row}-phase6-pari-`));
  const executable = path.join(directory, `row${row}-phase6-pari`);
  const args = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-DROW_INDEX=${row}`, `-I${path.join(pariRoot, "src/headers")}`,
    `-I${objects}`, SOURCE, `-L${objects}`, `-Wl,-rpath,${objects}`,
    "-lpari", "-lm", "-o", executable];
  const built = spawnSync(cc, args, { encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024 });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  const result = Object.freeze({ row, executable, provenance: Object.freeze({
    pariVersion: ["2", "17", "4"], archiveSha256: ARCHIVE_SHA256,
    buch2Sha256: BUCH2_SHA256, librarySha256: LIBRARY_SHA256,
    sourceSha256: fileSha256(SOURCE), executableSha256: fileSha256(executable),
    compiler: cc, compilerArguments: args.map(value => value
      .replace(pariRoot, "$PARI_ROOT").replace(objects, "$PARI_OBJECTS")
      .replace(executable, "$EXECUTABLE")),
  }) });
  buildCache.set(row, result);
  return result;
}

class HelperClient {
  constructor(row, build = buildHelper(row)) {
    this.row = row; this.build = build; this.buffer = ""; this.lines = [];
    this.waiters = []; this.stderr = ""; this.closed = false;
    this.child = spawn(build.executable, [], { stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME,
        LANG: "C", LC_ALL: "C" } });
    this.child.stdout.setEncoding("utf8"); this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      for (;;) {
        const at = this.buffer.indexOf("\n"); if (at < 0) break;
        const line = this.buffer.slice(0, at); this.buffer = this.buffer.slice(at + 1);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(line); else this.lines.push(line);
      }
    });
    this.exit = new Promise(resolve => this.child.once("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(`row-${row} PARI helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }
  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "PARI helper closed");
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
  async ready() {
    const line = await this.nextLine(); assert(line.startsWith("READY "));
    const value = JSON.parse(line.slice(6));
    assert.equal(value.schema, 1); assert.equal(value.row, this.row);
    assert.equal(value.fieldId, ROWS[this.row].fieldId);
    assert.deepEqual(value.pariVersion, ["2", "17", "4"]);
    assert.match(value.preparationNanoseconds, /^[1-9][0-9]*$/);
    return value;
  }
  async run(seed = "1") {
    assert.match(seed, /^(0|[1-9][0-9]*)$/); this.child.stdin.write(`RUN ${seed}\n`);
    const sample = JSON.parse(await this.nextLine());
    assert.equal(sample.schema,
      `sagejs.pari-class-group/row${this.row}-phase6-pari-sample-v1`);
    assert.match(sample.kernelNanoseconds, /^[1-9][0-9]*$/);
    validateProjection(this.row, sample.projection);
    assert.deepEqual(sample.detail.expectedClassNumber, ROWS[this.row].classNumber);
    assert.deepEqual(sample.detail.expectedInvariants, ROWS[this.row].invariantFactors);
    return sample;
  }
  async close() {
    if (this.closed) return; this.child.stdin.end("CLOSE\n");
    const result = await this.exit; assert.equal(result.signal, null);
    assert.equal(result.code, 0, this.stderr);
  }
}

module.exports = { ARCHIVE_SHA256, BUCH2_SHA256, LIBRARY_SHA256, ROWS,
  HelperClient, buildHelper, validateProjection };
