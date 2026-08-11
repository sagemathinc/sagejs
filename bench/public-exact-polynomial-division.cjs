#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

async function measure(base, compatibility) {
  const rational = base === "QQ";
  const source = [
    "import sagejs.runtime as runtime",
    `ring = PolynomialRing(${base}, 'x')`,
    "x = ring.gen()",
    rational
      ? "divisor = x**1000 + QQ(2)/3"
      : "divisor = x**1000 + 1",
    rational
      ? "quotient = ring([QQ(index % 17 - 8)/(index % 7 + 1) for index in range(4001)])"
      : "quotient = ring([index % 17 - 8 for index in range(4001)])",
    "dividend = divisor * quotient",
    ...(compatibility ? [
      "dividend._materialize_exact_compatibility_storage()",
      "divisor._materialize_exact_compatibility_storage()",
      "def never_resource():",
      "    return False",
      `setattr(type(dividend), '_has_${rational ? "fmpq" : "fmpz"}_polynomial_resource', never_resource)`,
    ] : []),
    "def benchmark_division():",
    "    started = runtime.wall_time()",
    "    result = dividend // divisor",
    "    if result is None:",
    "        raise RuntimeError('polynomial division returned None')",
    "    return (runtime.wall_time() - started) * 1000",
    "",
  ].join("\n");
  const session = await createSage();
  try {
    const setup = await session.evaluate(source);
    if (setup.stderr !== undefined) throw new Error(setup.stderr);
    const samples = [];
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const sample = await session.evaluate("benchmark_division()");
      if (sample.stderr !== undefined) throw new Error(sample.stderr);
      const elapsed = Number(sample.repr);
      assert.ok(Number.isFinite(elapsed), sample.repr);
      if (iteration !== 0) samples.push(elapsed);
    }
    return median(samples);
  } finally {
    session.close();
  }
}

async function run() {
  const savedRequired = process.env.SAGEJS_NATIVE_REQUIRED;
  const savedForbidden = process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI;
  process.env.SAGEJS_NATIVE_REQUIRED = "1";
  process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI = "1";
  try {
    const integerDirect = await measure("ZZ", false);
    const integerCompatibility = await measure("ZZ", true);
    const rationalDirect = await measure("QQ", false);
    const rationalCompatibility = await measure("QQ", true);

    assert.ok(integerDirect < integerCompatibility);
    assert.ok(rationalDirect < rationalCompatibility);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.benchmark/public-exact-polynomial-division-v1",
      dividend_degree: 5000,
      divisor_degree: 1000,
      integer: {
        direct_resource_ms: integerDirect,
        former_compatibility_ms: integerCompatibility,
        speedup: integerCompatibility / integerDirect,
      },
      rational: {
        direct_resource_ms: rationalDirect,
        former_compatibility_ms: rationalCompatibility,
        speedup: rationalCompatibility / rationalDirect,
      },
    }, null, 2)}\n`);
  } finally {
    if (savedRequired === undefined) delete process.env.SAGEJS_NATIVE_REQUIRED;
    else process.env.SAGEJS_NATIVE_REQUIRED = savedRequired;
    if (savedForbidden === undefined) {
      delete process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI;
    } else {
      process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI = savedForbidden;
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
