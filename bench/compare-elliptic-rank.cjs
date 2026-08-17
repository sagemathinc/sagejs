"use strict";

const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const flint = require("../packages/flint");

const cases = [
  ["rank-2", [0n, 1n, 1n, -2n, 0n], 3],
  ["rank-8", [0n, 0n, 0n, -6544n, 7375129n], 3],
  [
    "rank-15",
    [
      1n,
      0n,
      1n,
      34318214642441646362435632562579908747n,
      3184376895814127197244886284686214848599453811643486936756n,
    ],
    1,
  ],
];

function nativeRank(coefficients) {
  return flint.ecRankData(
    ...coefficients.flatMap((value) => [value, 1n]),
    false,
  );
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measureNative(coefficients, repetitions) {
  nativeRank(coefficients);
  const samples = [];
  let answer;
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    answer = nativeRank(coefficients);
    samples.push(performance.now() - started);
  }
  return { milliseconds: median(samples), answer };
}

function measureUpstream(command, coefficients) {
  const input = `[${coefficients.join(",")}]\n`;
  const childEnvironment = { ...process.env };
  if (process.env.ECLIB_LIBRARY_PATH) {
    childEnvironment.LD_LIBRARY_PATH = process.env.ECLIB_LIBRARY_PATH;
    childEnvironment.DYLD_LIBRARY_PATH = process.env.ECLIB_LIBRARY_PATH;
  }
  const started = performance.now();
  const result = spawnSync(command, ["-q", "-v", "1", "-S", "0"], {
    encoding: "utf8",
    env: childEnvironment,
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  const milliseconds = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`upstream mwrank exited with ${result.status}`);
  }
  return milliseconds;
}

const upstream = process.env.ECLIB_MWRANK;
console.log("case".padEnd(12), "rank/selmer".padEnd(14), "Sage.js FLINT".padStart(16),
  ...(upstream ? ["upstream mwrank".padStart(18)] : []));
for (const [label, coefficients, repetitions] of cases) {
  const native = measureNative(coefficients, repetitions);
  const fields = [
    label.padEnd(12),
    `${native.answer.rankLowerBound}/${native.answer.twoSelmerRank}`.padEnd(14),
    `${native.milliseconds.toFixed(2)} ms`.padStart(16),
  ];
  if (upstream) {
    fields.push(`${measureUpstream(upstream, coefficients).toFixed(2)} ms`.padStart(18));
  }
  console.log(...fields);
}

if (!upstream) {
  console.log("\nSet ECLIB_MWRANK to an upstream mwrank executable for comparison.");
}
