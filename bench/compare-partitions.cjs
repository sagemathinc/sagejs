"use strict";

// Compare integer-partition counting, enumeration, and addressing against the
// research systems that publish the same operations: SageMath (FLINT's
// Rademacher implementation for the counting cases) and PARI/GP (`numbpart`).
//
//   node bench/compare-partitions.cjs
//
// Set SAGELITE_SAGE to a `sage` executable and SAGELITE_GP to a `gp`
// executable.  A system that is not installed is reported and skipped rather
// than failing the run.
//
// Every case runs in a fresh process and is timed inside that process, so the
// figures are cold operation cost with interpreter startup excluded.  Counting
// has to be measured this way: Sage.js memoizes partition numbers, so repeating
// a count inside one process would time the cache.

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "partitions.sage");
const sagejs = join(root, "bin", "sagejs");
const sage = process.env.SAGELITE_SAGE || "sage";
const gp = process.env.SAGELITE_GP || "gp";
const SAMPLES = Number(process.env.SAGEJS_BENCH_SAMPLES || 5);

const CASES = [
  "count-100",
  "count-1000",
  "count-10000",
  "cardinality-200",
  "constrained-100",
  "list-30",
  "unrank-100",
  "random-100",
];
// PARI has no combinatorial class; `numbpart` is exactly the counting case.
const PARI_CASES = new Map([
  ["count-100", 100],
  ["count-1000", 1000],
  ["count-10000", 10000],
]);

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function available(command) {
  if (command.includes("/")) return existsSync(command);
  const probe = spawnSync("command", ["-v", command], {
    shell: true,
    encoding: "utf8",
  });
  return probe.status === 0 && probe.stdout.trim().length > 0;
}

function elapsedFrom(stdout, label) {
  for (const line of stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "RESULT") return Number(fields[4]);
  }
  throw new Error(`${label} produced no RESULT line`);
}

function measure(label, build) {
  const timings = new Map();
  for (const benchmarkCase of CASES) {
    const samples = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const { command, args, input } = build(benchmarkCase);
      if (command === null) break;
      const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        input,
        env: { ...process.env, SAGEJS_BENCH_CASE: benchmarkCase },
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.stderr.write(result.stderr);
        throw new Error(`${label} ${benchmarkCase} exited ${result.status}`);
      }
      samples.push(elapsedFrom(result.stdout, `${label} ${benchmarkCase}`));
    }
    if (samples.length) timings.set(benchmarkCase, samples);
  }
  return timings;
}

function pariProgram(size) {
  return [
    "t = getabstime();",
    `v = numbpart(${size});`,
    'print("RESULT case 1 0 ", (getabstime() - t) / 1000.0);',
    "quit",
  ].join("\n");
}

const results = [
  [
    "Sage.js",
    measure("Sage.js", () => ({
      command: process.execPath,
      args: [sagejs, source],
    })),
  ],
];
if (available(sage)) {
  results.push([
    "SageMath",
    measure("SageMath", () => ({ command: sage, args: [source] })),
  ]);
} else {
  console.log(`SageMath not found at ${sage}; set SAGELITE_SAGE to compare.`);
}
if (available(gp)) {
  results.push([
    "PARI/GP",
    measure("PARI/GP", (benchmarkCase) =>
      PARI_CASES.has(benchmarkCase)
        ? {
            command: gp,
            args: ["-q"],
            input: pariProgram(PARI_CASES.get(benchmarkCase)),
          }
        : { command: null },
    ),
  ]);
} else {
  console.log(`PARI/GP not found at ${gp}; set SAGELITE_GP to compare.`);
}

const reference = results.find(([label]) => label === "SageMath");
const referenceMedians = new Map();
if (reference) {
  for (const [operation, samples] of reference[1]) {
    referenceMedians.set(operation, median(samples));
  }
}

console.log(
  `cold operation cost, median of ${SAMPLES} runs, startup excluded\n`,
);
console.log(
  "operation runtime".padEnd(34),
  "median".padStart(14),
  "vs SageMath".padStart(13),
);
console.log("-".repeat(63));
for (const operation of CASES) {
  for (const [label, timings] of results) {
    const samples = timings.get(operation);
    if (!samples) continue;
    const seconds = median(samples);
    // PARI/GP reports whole milliseconds, so a fast case reads as zero.
    const shown = seconds > 0 ? `${(seconds * 1000).toFixed(3)} ms` : "< 1 ms";
    const relative =
      seconds > 0 && referenceMedians.get(operation)
        ? `${(seconds / referenceMedians.get(operation)).toFixed(1)}x`
        : "-";
    console.log(
      `${operation.padEnd(20)} ${label.padEnd(12)}`.padEnd(34),
      shown.padStart(14),
      relative.padStart(13),
    );
  }
}
