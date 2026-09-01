"use strict";

const { performance } = require("node:perf_hooks");
const flint = require("../../packages/flint");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function sum(values, context) {
  return values.reduce(
    (left, right) => flint.mpolyAdd(left, right),
    flint.mpolyConstant(context, 0n, 1n),
  );
}

function product(values, context) {
  return values.reduce(
    (left, right) => flint.mpolyMul(left, right),
    flint.mpolyConstant(context, 1n, 1n),
  );
}

function simpleSystem(kind, modulus = 0n) {
  const context = flint.mpolyContext(kind, 2, "degrevlex", modulus);
  const x = flint.mpolyGen(context, 0);
  const y = flint.mpolyGen(context, 1);
  return [
    flint.mpolySub(
      flint.mpolyMul(x, y),
      flint.mpolyConstant(context, 1n, 1n),
    ),
    flint.mpolyAdd(
      flint.mpolyPow(x, 3),
      flint.mpolyMul(
        flint.mpolyConstant(context, 7n, 1n),
        flint.mpolyPow(y, 2),
      ),
    ),
  ];
}

function cyclic(size) {
  const context = flint.mpolyContext("qq", size, "degrevlex", 0n);
  const variables = Array.from(
    { length: size },
    (_, index) => flint.mpolyGen(context, index),
  );
  const generators = [];
  for (let degree = 1; degree < size; degree += 1) {
    generators.push(sum(
      variables.map((_, start) => product(
        Array.from(
          { length: degree },
          (__, offset) => variables[(start + offset) % size],
        ),
        context,
      )),
      context,
    ));
  }
  generators.push(flint.mpolySub(
    product(variables, context),
    flint.mpolyConstant(context, 1n, 1n),
  ));
  return generators;
}

function katsura(size) {
  const context = flint.mpolyContext("qq", size + 1, "degrevlex", 0n);
  const variables = Array.from(
    { length: size + 1 },
    (_, index) => flint.mpolyGen(context, index),
  );
  const one = flint.mpolyConstant(context, 1n, 1n);
  const two = flint.mpolyConstant(context, 2n, 1n);
  const first = flint.mpolySub(
    flint.mpolyAdd(
      variables[0],
      flint.mpolyMul(two, sum(variables.slice(1), context)),
    ),
    one,
  );
  const generators = [first];
  for (let degree = 1; degree <= size; degree += 1) {
    const terms = [];
    for (let index = -size; index <= size; index += 1) {
      const other = degree - index;
      if (Math.abs(other) <= size) {
        terms.push(flint.mpolyMul(
          variables[Math.abs(index)],
          variables[Math.abs(other)],
        ));
      }
    }
    generators.push(flint.mpolySub(
      sum(terms, context),
      variables[degree],
    ));
  }
  return generators;
}

function measure(name, backend, generators, repetitions) {
  const operation = backend === "msolve"
    ? () => flint.mpolyGroebnerMsolve(generators)
    : () => flint.mpolyGroebner(generators);
  const rssBefore = process.memoryUsage().rss;
  const firstStart = performance.now();
  const firstBasis = operation();
  const firstMs = performance.now() - firstStart;
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  return {
    name,
    backend,
    basisLength: firstBasis.length,
    firstMs,
    warmMedianMs: median(samples),
    repetitions,
    rssDeltaBytes: Math.max(0, process.memoryUsage().rss - rssBefore),
  };
}

const cases = [
  ["simple-gf65537", "msolve", simpleSystem("nmod", 65537n), 9],
  ["simple-qq", "msolve", simpleSystem("qq"), 9],
  ["simple-qq", "flint", simpleSystem("qq"), 9],
  ["cyclic5-qq", "msolve", cyclic(5), 5],
  ["cyclic5-qq", "flint", cyclic(5), 3],
  ["katsura6-qq", "msolve", katsura(6), 3],
  ["katsura6-qq", "flint", katsura(6), 3],
  // FLINT's bounded naive Buchberger path does not complete cyclic-6 on a
  // documentation-sized time budget, so keep only the useful F4 measurement
  // in the routine benchmark.  See docs/groebner-bases.md for the capped
  // comparison.
  ["cyclic6-qq", "msolve", cyclic(6), 3],
];

const results = cases.map((entry) => measure(...entry));
const report = {
  schema: "sagejs.groebner-benchmark/v1",
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  scalar: true,
  results,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Gröbner benchmark (${report.platform}, ${report.node}, scalar)`);
  console.log(
    "case".padEnd(18),
    "backend".padEnd(8),
    "basis".padStart(7),
    "first".padStart(12),
    "warm median".padStart(14),
    "RSS delta".padStart(12),
  );
  for (const result of results) {
    console.log(
      result.name.padEnd(18),
      result.backend.padEnd(8),
      String(result.basisLength).padStart(7),
      `${result.firstMs.toFixed(2)} ms`.padStart(12),
      `${result.warmMedianMs.toFixed(2)} ms`.padStart(14),
      `${(result.rssDeltaBytes / 1048576).toFixed(1)} MiB`.padStart(12),
    );
  }
}
