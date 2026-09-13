#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const marker = "SAGEJS_ALGEBRAIC_GEOMETRY_BENCH ";
const samples = Number(process.env.SAGEJS_AG_BENCH_SAMPLES ?? "3");
const warmups = Number(process.env.SAGEJS_AG_BENCH_WARMUPS ?? "1");

const cases = [
  {
    id: "intersection-and-saturation",
    profile: {
      field: "QQ",
      characteristic: 0,
      variables: 3,
      order: "degrevlex with private lex elimination rings",
      generator_count: 4,
      term_count: 4,
      degree_profile: [2, 2, 1, 1],
      quotient_dimension: null,
      coefficient_height_bits: 1,
    },
    source: `
R = PolynomialRing(QQ, names=("x", "y", "z"))
x, y, z = R.gens()
I = R.ideal(x*y, x*z)
J = R.ideal(y, z)
K = I.intersection(J, proof=True)
S = I.saturation(R.ideal(x), proof=True)
(K.dimension(proof=True), S.dimension(proof=True), len(K.groebner_basis(proof=True)), len(S.groebner_basis(proof=True)))
`,
  },
  {
    id: "sparse-hilbert-series",
    profile: {
      field: "QQ",
      characteristic: 0,
      variables: 5,
      order: "degrevlex",
      generator_count: 5,
      term_count: 5,
      degree_profile: [2, 3, 2, 3, 4],
      quotient_dimension: null,
      coefficient_height_bits: 1,
    },
    source: `
R = PolynomialRing(QQ, names=("a", "b", "c", "d", "e"))
a, b, c, d, e = R.gens()
I = R.ideal(a^2, b^3, c*d, c*e^2, e^4)
(I.h_vector(proof=True), I.dimension(proof=True), I.degree(proof=True))
`,
  },
  {
    id: "projective-closure-and-image",
    profile: {
      field: "QQ",
      characteristic: 0,
      variables: 2,
      order: "degrevlex with private lex elimination rings",
      generator_count: 1,
      term_count: 3,
      degree_profile: [3],
      quotient_dimension: null,
      coefficient_height_bits: 1,
    },
    source: `
A = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A.gens()
C = A.subscheme([y^2-x^3-x])
closure = C.projective_closure("z", proof=True)
T = AffineSpace(QQ, 1, names=("t",))
t = T.gen()
image = T.hom([t, t^2], A).image(proof=True)
(closure.dimension(proof=True), closure.degree(proof=True), image.dimension(proof=True))
`,
  },
  {
    id: "plane-curve-jacobian",
    profile: {
      field: "QQ",
      characteristic: 0,
      variables: 2,
      order: "degrevlex",
      generator_count: 1,
      term_count: 2,
      degree_profile: [3],
      quotient_dimension: null,
      coefficient_height_bits: 1,
    },
    source: `
A = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A.gens()
C = Curve(y^2-x^3)
S = C.singular_subscheme(proof=True)
(S.dimension(proof=True), C.tangent_space(C(0, 0), proof=True).dimension(), len(C.jacobian_matrix(proof=True).list()))
`,
  },
  {
    id: "zero-dimensional-decomposition",
    profile: {
      field: "QQ",
      characteristic: 0,
      variables: 2,
      order: "degrevlex",
      generator_count: 2,
      term_count: 5,
      degree_profile: [4, 1],
      quotient_dimension: 4,
      coefficient_height_bits: 2,
    },
    source: `
R = PolynomialRing(QQ, names=("x", "y"))
x, y = R.gens()
I = R.ideal((x-1)^2*(x+1)^2, y-x)
components = I.primary_decomposition(proof=True)
(len(components), I.vector_space_dimension(proof=True), I.radical(proof=True).vector_space_dimension(proof=True))
`,
  },
];

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

async function runCase(selected) {
  const { createSage } = require("../dist/tools/kernel.js");
  const sage = await createSage();
  try {
    let expected;
    for (let index = 0; index < warmups; index += 1) {
      expected = (await sage.evaluate(selected.source, { timeoutMs: 120_000 })).repr;
    }
    const timings = [];
    for (let index = 0; index < samples; index += 1) {
      const started = performance.now();
      const result = await sage.evaluate(selected.source, { timeoutMs: 120_000 });
      timings.push(performance.now() - started);
      assert.equal(result.repr, expected, `${selected.id} changed its exact result`);
    }
    return {
      id: selected.id,
      profile: selected.profile,
      proof: true,
      backend: "public exact auto-dispatch",
      result: expected,
      warm_median_ms: Number(median(timings).toFixed(3)),
      samples_ms: timings.map((value) => Number(value.toFixed(3))),
      process_peak_rss_kib: process.resourceUsage().maxRSS,
    };
  } finally {
    await sage.close();
  }
}

function sourceRevision() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

async function main() {
  assert.ok(Number.isInteger(samples) && samples >= 3 && samples % 2 === 1);
  assert.ok(Number.isInteger(warmups) && warmups >= 1);
  const requiredProfileKeys = [
    "field",
    "characteristic",
    "variables",
    "order",
    "generator_count",
    "term_count",
    "degree_profile",
    "quotient_dimension",
    "coefficient_height_bits",
  ];
  for (const selected of cases) {
    for (const key of requiredProfileKeys) {
      assert.ok(key in selected.profile, `${selected.id} profile omits ${key}`);
    }
  }
  const caseIndex = process.argv.indexOf("--case");
  if (caseIndex !== -1) {
    const selected = cases.find(({ id }) => id === process.argv[caseIndex + 1]);
    assert.ok(selected, "unknown algebraic-geometry benchmark case");
    console.log(marker + JSON.stringify(await runCase(selected)));
    return;
  }

  const results = [];
  for (const selected of cases) {
    const stdout = execFileSync(
      process.execPath,
      [__filename, "--case", selected.id],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    const line = stdout.split(/\r?\n/u).find((value) => value.startsWith(marker));
    assert.ok(line, `${selected.id} emitted no benchmark record`);
    results.push(JSON.parse(line.slice(marker.length)));
  }
  const report = {
    schema: "sagejs.algebraic-geometry-benchmark/v1",
    generated_at: new Date().toISOString(),
    source_revision: sourceRevision(),
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    cpu: os.cpus()[0]?.model ?? "unknown",
    samples,
    warmups,
    memory_note:
      "process_peak_rss_kib is the isolated child process high-water mark, including the Sage.js runtime",
    cases: results,
  };
  console.table(
    results.map(({ id, warm_median_ms, process_peak_rss_kib, result }) => ({
      workload: id,
      median_ms: warm_median_ms,
      peak_rss_mib: Number((process_peak_rss_kib / 1024).toFixed(1)),
      result,
    })),
  );
  if (process.argv.includes("--write")) {
    const filename = path.join(root, "bench", "algebraic-geometry-baseline.json");
    writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(root, filename)}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
