"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const [fixturesArgument, baselineArgument, stageAArgument, stageDArgument] =
  process.argv.slice(2);
if (!stageDArgument) {
  throw new Error(
    "usage: node benchmark_catalog_region_builds.cjs " +
      "FIXTURES BASELINE_DIRECTORY STAGE_A_DIRECTORY STAGE_D_DIRECTORY",
  );
}

const entry = "int64_pari_prime_degree_catalog";
const packet = JSON.parse(readFileSync(resolve(fixturesArgument))).packets[0];
const builds = [
  ["baseline", baselineArgument],
  ["stage-a", stageAArgument],
  ["stage-d", stageDArgument],
].map(([name, directory]) => {
  const kernel = require(join(resolve(directory), "index.cjs"))[entry];
  const arguments_ = packet.map((value, index) => {
    if (!Array.isArray(value)) return BigInt(value);
    if (index === 8) return kernel.createUInt64Buffer(value.map(BigInt));
    if ([5, 6, 7].includes(index)) {
      return kernel.createIntegerBuffer(value.length, 16, value.map(BigInt));
    }
    return kernel.createInt64Buffer(value.map(BigInt));
  });
  return { name, kernel, arguments_, samples: [] };
});

function batch(build, repetitions) {
  const start = process.hrtime.bigint();
  for (let index = 0; index < repetitions; index += 1) {
    assert.equal(Number(build.kernel.tagged(...build.arguments_)), 0);
  }
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

for (const build of builds) {
  build.repetitions = Math.max(600, Math.ceil(1500 / (batch(build, 3) / 3)));
}
for (let warmup = 0; warmup < 3; warmup += 1) {
  for (const build of builds) batch(build, build.repetitions);
}
for (let round = 0; round < 9; round += 1) {
  for (let offset = 0; offset < builds.length; offset += 1) {
    const build = builds[(round + offset) % builds.length];
    const milliseconds = batch(build, build.repetitions);
    assert(milliseconds >= 1000);
    build.samples.push(milliseconds / build.repetitions);
  }
}

const measurements = Object.fromEntries(builds.map((build) => [build.name, {
  repetitions: build.repetitions,
  milliseconds: build.samples,
  geometricMeanMilliseconds: geometricMean(build.samples),
}]));
console.log(JSON.stringify({
  schema: "sagejs.checked-region/catalog-build-comparison-v1",
  boundary: "tagged packet zero; compilation, packing, decoding excluded",
  protocol: { warmupRounds: 3, rotatedRounds: 9,
    minimumRetainedBatchMilliseconds: 1000 },
  measurements,
  ratios: {
    stageAToBaseline:
      measurements["stage-a"].geometricMeanMilliseconds /
      measurements.baseline.geometricMeanMilliseconds,
    stageDToBaseline:
      measurements["stage-d"].geometricMeanMilliseconds /
      measurements.baseline.geometricMeanMilliseconds,
    stageDToStageA:
      measurements["stage-d"].geometricMeanMilliseconds /
      measurements["stage-a"].geometricMeanMilliseconds,
  },
}));
