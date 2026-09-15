"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const elapsed = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const geometricMean = (xs) =>
  Math.exp(xs.reduce((sum, x) => sum + Math.log(x), 0) / xs.length);
const hashFile = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) throw new Error("pass fixtures.json from the int64 checker");
  const backend = process.argv[3] || "gmp";
  assert(["gmp", "tagged"].includes(backend));
  const packet = JSON.parse(fs.readFileSync(evidencePath)).packets[0];
  const int64Build = await compileKernel({
    sourcePath: path.join(__dirname, "int64_prime_degree_catalog.py"),
  });
  const boundedBuild = await compileKernel({
    sourcePath: path.join(__dirname, "bounded_prime_degree_catalog.py"),
  });
  const int64 = require(int64Build.modulePath).int64_pari_prime_degree_catalog;
  const bounded = require(boundedBuild.modulePath).bounded_pari_prime_degree_catalog;

  function int64Arguments() {
    return packet.map((entry, index) => {
      if (!Array.isArray(entry)) return BigInt(entry);
      if ([0, 5, 6, 7].includes(index))
        return int64.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
      if (index === 8) return int64.createUInt64Buffer(entry.map(BigInt));
      return int64.createInt64Buffer(entry.map(BigInt));
    });
  }
  function boundedArguments() {
    const oldPacket = [...packet.slice(0, 6), ...packet.slice(8)];
    return oldPacket.map((entry, index) => {
      if (!Array.isArray(entry)) return BigInt(entry);
      if (index === 6) return bounded.createUInt64Buffer(entry.map(BigInt));
      return bounded.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
    });
  }
  const ia = int64Arguments();
  const ba = boundedArguments();
  function batch(fn, args, repetitions) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < repetitions; i += 1)
      assert.equal(Number(fn[backend](...args)), 0);
    return elapsed(start);
  }
  function calibrate(fn, args) {
    const pilot = batch(fn, args, 1);
    return Math.max(1, Math.ceil(1500 / pilot));
  }
  const int64Repetitions = calibrate(int64, ia);
  const boundedRepetitions = calibrate(bounded, ba);
  for (let warm = 0; warm < 3; warm += 1) {
    batch(int64, ia, int64Repetitions);
    batch(bounded, ba, boundedRepetitions);
  }
  const int64Milliseconds = [], boundedMilliseconds = [], batchMilliseconds = [];
  for (let pair = 0; pair < 7; pair += 1) {
    const run = (label, fn, args, repetitions, target) => {
      const ms = batch(fn, args, repetitions);
      assert(ms >= 1000, `${label} retained batch shorter than one second: ${ms}`);
      target.push(ms / repetitions);
      batchMilliseconds.push({ pair, label, milliseconds: ms, repetitions });
    };
    if (pair % 2 === 0) {
      run("int64", int64, ia, int64Repetitions, int64Milliseconds);
      run("bounded", bounded, ba, boundedRepetitions, boundedMilliseconds);
    } else {
      run("bounded", bounded, ba, boundedRepetitions, boundedMilliseconds);
      run("int64", int64, ia, int64Repetitions, int64Milliseconds);
    }
  }
  const ratios = int64Milliseconds.map((x, i) => x / boundedMilliseconds[i]);
  assert.deepEqual(Array.from(ia[22]).slice(0, 4).map(String), ["0", "1230", "1833", "2270"]);
  assert.deepEqual(ba[20].toArray().slice(0, 4).map(String), ["0", "1230", "1833", "2270"]);
  console.log(JSON.stringify({
    schema: "sagejs.benchmark/int64-prime-degree-catalog-v1",
    backend,
    protocol: { warmupBatches: 3, alternatingPairs: 7, minimumRetainedBatchMilliseconds: 1000,
      int64Repetitions, boundedRepetitions, packingAndCompilationExcluded: true },
    int64Milliseconds, boundedMilliseconds, batchMilliseconds, ratios,
    geometricMeanRatio: geometricMean(ratios),
    int64CoreHash: hashFile(int64Build.coreSourcePath),
    boundedCoreHash: hashFile(boundedBuild.coreSourcePath),
    qualifiedTiming: false,
    note: "Shared-host diagnostic; exact algorithm and eager 1,230-prime schedule retained.",
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
