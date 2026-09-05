"use strict";
// Paired whole native polynomial-to-receipt comparisons. This is an equivalence
// and regression benchmark, not an independent mathematical certificate check.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const fixture = JSON.parse(readFileSync(process.argv[4], "utf8"));
const fields = fixture.records.map(record => ({ label: record.label, coefficients: record.coefficients.map(BigInt), h: BigInt(record.class_number) }));
fields.push(...[
  ["reported-h5", [-55n, 9n, 0n, 1n], 5n],
  ["reported-h2", [-4n, 3n, -1n, 1n], 2n],
  ["resumed-h3", [-92n, -32n, 0n, 1n], 3n],
  ["resumed-h5", [-48n, 30n, 0n, 1n], 5n],
].map(([label, coefficients, h]) => ({ label, coefficients, h })));
const implementations = process.argv.slice(2, 4).map(path => {
  const kernel = require(resolve(path)).certified_complex_cubic_class_group_v1;
  const zeros = length => kernel.createIntegerBuffer(length, 64);
  const output = kernel.createIntegerBuffer(64, 256);
  const buffers = [kernel.createUInt64Buffer(64 * 64 + 64 + 1),
    ...[512, 4, 9, 16, 16, 144, 48, 109, 1, 1, 1].map(zeros)];
  return { kernel, output, buffers };
});
const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const callsPerSample = 10;
const relationEffort = 5;
const results = [];
for (const field of fields) {
  const packed = implementations.map(({ kernel }) => kernel.packIntegerBuffer(field.coefficients));
  const samples = [[], []];
  let previous;
  for (let round = 0; round < 19; round++) {
    for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const { kernel, output, buffers } = implementations[index];
      const start = performance.now();
      let accepted;
      for (let call = 0; call < callsPerSample; call++) {
        const result = kernel(output, packed[index], ...buffers, 0, relationEffort, 1048576, 3145728);
        if (accepted !== undefined) assert.equal(result, accepted, field.label);
        accepted = result;
      }
      const milliseconds = (performance.now() - start) / callsPerSample;
      const receipt = { accepted, output: output.toArray().map(String) };
      if (previous) assert.deepEqual(receipt, previous, field.label);
      previous = receipt;
      if (accepted) assert.equal(BigInt(receipt.output[1]), field.h, field.label);
      if (round >= 4) samples[index].push(milliseconds);
    }
  }
  results.push({ label: field.label, accepted: previous.accepted,
    baselineMs: median(samples[0]), candidateMs: median(samples[1]),
    ratio: median(samples[1]) / median(samples[0]), samples });
}
console.log(JSON.stringify({ node: process.version, relationEffort, callsPerSample, results }, null, 2));
