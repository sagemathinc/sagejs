"use strict";

// Run with two already-built index.cjs paths. Build/compilation is deliberately
// outside timed regions; each measurement starts a fresh exact workspace.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { cpus, platform, arch } = require("node:os");
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = [];
for (const [path, baseline, candidate] of [
  [process.argv[2], "explicit_stores", "slice_stores"],
  [process.argv[3], "explicit", "bundled"],
]) {
  const module = require(resolve(path));
  for (const backend of ["gmp", "fmpz"]) {
    for (const value of [7n, (1n << 300n) + 7n]) {
      const iterations = 1000n;
      const callsPerSample = 100;
      const samples = { baseline: [], candidate: [] };
      const functions = { baseline: module[baseline][backend], candidate: module[candidate][backend] };
      for (let round = 0; round < 35; round++) {
        for (const key of round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
          const start = performance.now();
          let result;
          for (let call = 0; call < callsPerSample; call++) result = functions[key](value, iterations);
          const elapsed = performance.now() - start;
          assert.equal(result, value + iterations);
          if (round >= 5) samples[key].push(elapsed);
        }
      }
      results.push({ candidate, backend, inputBits: value.toString(2).length, iterations: String(iterations), callsPerSample,
        baselineMs: median(samples.baseline), candidateMs: median(samples.candidate),
        ratio: median(samples.candidate) / median(samples.baseline), samples });
    }
  }
}
console.log(JSON.stringify({ node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model, results }, null, 2));
