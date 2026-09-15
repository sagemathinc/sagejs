"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function milliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  );
}

function hashFile(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

async function main() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    throw new Error("pass fixtures.json emitted by the bounded catalog checker");
  }
  const repetitions = Number(process.argv[3] || 8);
  assert(Number.isSafeInteger(repetitions) && repetitions > 0);
  const evidenceBytes = fs.readFileSync(path.resolve(evidencePath));
  const packet = JSON.parse(evidenceBytes).packets[0];
  const boundedBuild = await compileKernel({
    sourcePath: path.join(__dirname, "bounded_prime_degree_catalog.py"),
  });
  const exactBuild = await compileKernel({
    sourcePath: path.join(__dirname, "prime_degree_catalog.py"),
  });
  const bounded = require(boundedBuild.modulePath).bounded_pari_prime_degree_catalog;
  const exact = require(exactBuild.modulePath).pari_prime_degree_catalog;

  function argumentsFor(fn, boundedStorage) {
    const selected = boundedStorage
      ? packet
      : [...packet.slice(0, 6), ...packet.slice(8)];
    return selected.map((entry, index) => {
      if (!Array.isArray(entry)) return BigInt(entry);
      if (boundedStorage && index === 6) {
        return fn.createUInt64Buffer(entry.map(BigInt));
      }
      return fn.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
    });
  }

  const boundedArguments = argumentsFor(bounded, true);
  const exactArguments = argumentsFor(exact, false);
  function run(fn, args) {
    const start = process.hrtime.bigint();
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      assert.equal(Number(fn.gmp(...args)), 0);
    }
    return milliseconds(start) / repetitions;
  }
  for (let warmup = 0; warmup < 3; warmup += 1) {
    run(bounded, boundedArguments);
    run(exact, exactArguments);
  }

  const boundedMilliseconds = [];
  const exactMilliseconds = [];
  for (let pair = 0; pair < 7; pair += 1) {
    if (pair % 2 === 0) {
      boundedMilliseconds.push(run(bounded, boundedArguments));
      exactMilliseconds.push(run(exact, exactArguments));
    } else {
      exactMilliseconds.push(run(exact, exactArguments));
      boundedMilliseconds.push(run(bounded, boundedArguments));
    }
  }
  const ratios = boundedMilliseconds.map(
    (value, index) => value / exactMilliseconds[index],
  );
  const report = {
    schema: "sagejs.benchmark/bounded-prime-degree-catalog-v1",
    workload: {
      polynomial: packet[0],
      primeCount: Number(packet[4]),
      expectedState: ["0", "1230", "1833", "2270"],
    },
    protocol: {
      backend: "gmp",
      warmupBatches: 3,
      alternatingPairs: 7,
      repetitionsPerBatch: repetitions,
      packingAndCompilationExcluded: true,
    },
    boundedMilliseconds,
    exactMilliseconds,
    ratios,
    geometricMeanRatio: geometricMean(ratios),
    boundedCoreHash: hashFile(boundedBuild.coreSourcePath),
    exactCoreHash: hashFile(exactBuild.coreSourcePath),
    qualifiedTiming: false,
    note: "Shared-host diagnostic; no PARI ratio or whole-class-group claim.",
  };
  assert.deepEqual(
    boundedArguments[20].toArray().slice(0, 4).map(String),
    report.workload.expectedState,
  );
  assert.deepEqual(
    exactArguments[18].toArray().slice(0, 4).map(String),
    report.workload.expectedState,
  );
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
