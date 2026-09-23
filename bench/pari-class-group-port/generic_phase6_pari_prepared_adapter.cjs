"use strict";

// Reusable Linux-only adapter for the pinned pristine PARI 2.17.4 build.
// A caller may supply a structured clone of a frozen specification, but only
// an exact match for one of the reviewed development fields is admitted.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const SOURCE = path.join(__dirname, "generic_phase6_pari_prepared_adapter.c");
const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIBRARY_SHA256 =
  "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f";

const freeze = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

const ROWS = freeze({
  8: { panelIndex: 8,
    fieldId: "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363",
    polynomial: "x^4-20018*x-20034",
    polynomialAscending: ["-20034", "-20018", "0", "0", "1"],
    discriminant: "-4337631470366176176", degree: "4", signature: ["2", "1"],
    classNumber: "1", invariantFactors: [], generatorCount: "0",
    unitRank: "2", torsionOrder: "2" },
  10: { panelIndex: 10,
    fieldId: "generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7",
    polynomial: "x^4-2000022*x-2000042",
    polynomialAscending: ["-2000042", "-2000022", "0", "0", "1"],
    discriminant: "-315574182938393724979760", degree: "4",
    signature: ["2", "1"], classNumber: "4",
    invariantFactors: ["2", "2"], generatorCount: "2",
    unitRank: "2", torsionOrder: "2" },
  11: { panelIndex: 11,
    fieldId: "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab",
    polynomial: "x^4-2000010*x-2000018",
    polynomialAscending: ["-2000018", "-2000010", "0", "0", "1"],
    discriminant: "-432010688120096713665762992", degree: "4",
    signature: ["2", "1"], classNumber: "4",
    invariantFactors: ["2", "2"], generatorCount: "2",
    unitRank: "2", torsionOrder: "2" },
  13: { panelIndex: 13,
    fieldId: "generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33",
    polynomial: "x^4-20000000006*x-20000000010",
    polynomialAscending: ["-20000000010", "-20000000006", "0", "0", "1"],
    discriminant: "-4320000007232000005404800002002560000290992",
    degree: "4", signature: ["2", "1"], classNumber: "2",
    invariantFactors: ["2"], generatorCount: "1",
    unitRank: "2", torsionOrder: "2" },
  18: { panelIndex: 18, fieldId: "3.1.1005907102200.3",
    polynomial: "x^3+177570*x-7353960",
    polynomialAscending: ["-7353960", "177570", "0", "1"],
    discriminant: "-1005907102200", degree: "3", signature: ["1", "1"],
    classNumber: "18", invariantFactors: ["18"], generatorCount: "1",
    unitRank: "1", torsionOrder: "2" },
  20: { panelIndex: 20, fieldId: "5.1.1000000.1",
    polynomial: "x^5-5*x-12",
    polynomialAscending: ["-12", "-5", "0", "0", "0", "1"],
    discriminant: "1000000", degree: "5", signature: ["1", "2"],
    classNumber: "1", invariantFactors: [], generatorCount: "0",
    unitRank: "2", torsionOrder: "2" },
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = filename => sha256(fs.readFileSync(filename));
let cachedBuild;

function frozenFieldSpecification(panelIndex) {
  const value = ROWS[panelIndex];
  assert(value, `unsupported generic PARI prepared row ${panelIndex}`);
  return value;
}

function validateFrozenFieldSpecification(value) {
  assert(value && Number.isSafeInteger(value.panelIndex));
  const expected = frozenFieldSpecification(value.panelIndex);
  assert.deepEqual(value, expected,
    `row ${value.panelIndex} differs from its reviewed frozen field specification`);
  return expected;
}

function buildHelper() {
  if (cachedBuild) return cachedBuild;
  assert.equal(process.platform, "linux", "generic PARI prepared adapter is Linux-only");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT ||
    "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE ||
    "/home/user/upstream/pari-2.17.4.tar.gz");
  const objects = path.join(pariRoot, "Olinux-x86_64");
  const library = fs.realpathSync(path.join(objects, "libpari.so"));
  assert.equal(fileSha256(archive), ARCHIVE_SHA256, "wrong PARI archive");
  assert.equal(fileSha256(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256, "wrong pristine buch2.c");
  assert.equal(fileSha256(library), LIBRARY_SHA256, "wrong pristine libpari");
  const compiler = fs.realpathSync(spawnSync("which", [process.env.CC || "cc"],
    { encoding: "utf8" }).stdout.trim());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-generic-phase6-pari-"));
  const executable = path.join(directory, "prepared-adapter");
  const args = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${objects}`, SOURCE,
    `-L${objects}`, `-Wl,-rpath,${objects}`, "-lpari", "-lm", "-o", executable];
  const built = spawnSync(compiler, args, { encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024 });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  cachedBuild = freeze({ executable, provenance: {
    pariVersion: ["2", "17", "4"], archiveSha256: ARCHIVE_SHA256,
    buch2Sha256: BUCH2_SHA256, librarySha256: LIBRARY_SHA256,
    sourceSha256: fileSha256(SOURCE), executableSha256: fileSha256(executable),
    compiler, compilerArguments: args.map(argument => argument
      .replace(pariRoot, "$PARI_ROOT").replace(objects, "$PARI_OBJECTS")
      .replace(executable, "$EXECUTABLE")),
  } });
  return cachedBuild;
}

function validateProjection(specification, projection) {
  const spec = validateFrozenFieldSpecification(specification);
  assert.deepEqual(projection, {
    schema: spec.panelIndex === 13
      ? "sagejs.pari-class-group/row13-phase6-neutral-lean-projection-v2"
      : `sagejs.pari-class-group/row${spec.panelIndex}-phase6-neutral-exact-projection-v1`,
    ...(spec.panelIndex === 13 ? { semanticScope: {
      compared: ["class-number", "class-invariant-factors",
        "class-generator-count", "unit-rank", "torsion-order",
        "regulator-presence", "completion-mode"],
      excluded: ["generator-ideal-values", "fundamental-unit-values",
        "regulator-value"],
    } } : {}),
    field: { id: spec.fieldId, polynomialAscending: spec.polynomialAscending },
    classGroup: { classNumber: spec.classNumber,
      invariantFactors: spec.invariantFactors, generatorCount: spec.generatorCount },
    unitGroup: { rank: spec.unitRank, regulatorPresent: true,
      torsionOrder: spec.torsionOrder },
    completionMode: "flag-zero-class-and-unit-result",
  });
  return projection;
}

class HelperClient {
  constructor(specification, build = buildHelper()) {
    this.specification = validateFrozenFieldSpecification(specification);
    this.build = build; this.buffer = ""; this.lines = []; this.waiters = [];
    this.stderr = ""; this.closed = false;
    const spec = this.specification;
    const args = [String(spec.panelIndex), spec.fieldId, spec.polynomial,
      JSON.stringify(spec.polynomialAscending), spec.discriminant, spec.degree];
    this.child = spawn(build.executable, args, { stdio: ["pipe", "pipe", "pipe"],
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
      const error = new Error(`generic PARI helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }
  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "generic PARI helper closed");
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
  async ready() {
    const line = await this.nextLine();
    assert(line.startsWith("READY "), `unexpected helper greeting: ${line}`);
    const record = JSON.parse(line.slice(6)), spec = this.specification;
    assert.deepEqual(record, {
      schema: 1, row: spec.panelIndex, fieldId: spec.fieldId,
      pariVersion: ["2", "17", "4"], precisionBits: "192",
      degree: spec.degree, signature: spec.signature,
      discriminant: spec.discriminant,
      preparationNanoseconds: record.preparationNanoseconds,
    });
    assert.match(record.preparationNanoseconds, /^[1-9][0-9]*$/);
    return record;
  }
  async run(seed = "1") {
    assert.match(seed, /^[1-9][0-9]*$/, "seed must be a positive decimal integer");
    this.child.stdin.write(`RUN ${seed}\n`);
    const sample = JSON.parse(await this.nextLine()), spec = this.specification;
    assert.equal(sample.schema,
      "sagejs.pari-class-group/generic-phase6-pari-prepared-sample-v1");
    assert.equal(sample.row, spec.panelIndex);
    assert.match(sample.kernelNanoseconds, /^[1-9][0-9]*$/);
    assert.match(sample.processCpuNanoseconds, /^[1-9][0-9]*$/);
    assert.match(sample.processMaxRssKiB, /^[1-9][0-9]*$/);
    if (spec.panelIndex === 13) sample.projection.semanticScope = {
      compared: ["class-number", "class-invariant-factors",
        "class-generator-count", "unit-rank", "torsion-order",
        "regulator-presence", "completion-mode"],
      excluded: ["generator-ideal-values", "fundamental-unit-values",
        "regulator-value"],
    };
    validateProjection(spec, sample.projection);
    assert.deepEqual(sample.replayEvidence, {
      source: "independent-pari-bnf-getters",
      classNumber: spec.classNumber, invariantFactors: spec.invariantFactors,
      generatorCount: spec.generatorCount, unitRank: spec.unitRank,
      regulatorPresent: true, torsionOrder: spec.torsionOrder,
    });
    assert.deepEqual({ degree: sample.detail.degree,
      signature: sample.detail.signature, discriminant: sample.detail.discriminant },
    { degree: spec.degree, signature: spec.signature,
      discriminant: spec.discriminant });
    assert.deepEqual(sample.rng.algorithm, "pari-xorshift1024star-2.17.4");
    assert.equal(sample.rng.seed, seed);
    assert.equal(sample.rng.terminalState.length, 66);
    sample.rng.terminalState.forEach(value => assert.match(value, /^(0|[1-9][0-9]*)$/));
    return sample;
  }
  async close() {
    if (this.closed) return;
    this.child.stdin.end("CLOSE\n");
    const result = await this.exit;
    assert.equal(result.signal, null); assert.equal(result.code, 0, this.stderr);
  }
}

module.exports = { ARCHIVE_SHA256, BUCH2_SHA256, LIBRARY_SHA256, ROWS,
  HelperClient, buildHelper, frozenFieldSpecification,
  validateFrozenFieldSpecification, validateProjection };
