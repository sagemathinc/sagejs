#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const generatedDirectory = join(root, "packages", "flint", "build", "generated-ffi");
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));

function closeTwice(resource) {
  flint.ffiFmpzPolynomialClose(resource);
  flint.ffiFmpzPolynomialClose(resource);
}

function run(source, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: {
      ...process.env,
      SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
      ...extraEnvironment,
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", result.stderr);
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim();
}

// The generated host boundary returns one sealed, variable-size resource.
for (const [order, length, constant] of [
  [1n, 2n, -1n],
  [2n, 2n, 1n],
  [12n, 5n, 1n],
  [105n, 49n, 1n],
  [1000n, 401n, 1n],
]) {
  const value = flint.ffiFmpzPolynomialCyclotomic(order);
  assert.equal(flint.ffiFmpzPolynomialLength(value), length);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(value, 0n), constant);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(value, length - 1n), 1n);
  assert.ok(flint.__sagejsFfiResourceExternalMemory(value) > 0n);
  closeTwice(value);
  assert.throws(() => flint.ffiFmpzPolynomialLength(value), /closed|resource/i);
}

assert.throws(
  () => flint.ffiFmpzPolynomialCyclotomic(0n),
  /degree must be positive/,
);
assert.throws(() => flint.ffiFmpzPolynomialCyclotomic(-1n), /uint64/);
assert.throws(() => flint.ffiFmpzPolynomialCyclotomic(1n << 64n), /uint64/);

const publicResult = run([
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "known = {",
  "    1: [-1, 1],",
  "    2: [1, 1],",
  "    3: [1, 1, 1],",
  "    4: [1, 0, 1],",
  "    6: [1, -1, 1],",
  "    12: [1, 0, -1, 0, 1],",
  "}",
  "for order, expected in known.items():",
  "    value = R.cyclotomic_polynomial(order)",
  "    assert value._has_fmpz_polynomial_resource()",
  "    assert value.coefficients() == expected",
  "assert cyclotomic_polynomial(5) == x**4 + x**3 + x**2 + x + 1",
  "S = cyclotomic_polynomial(5, 'y').parent(); y = S.gen()",
  "assert cyclotomic_polynomial(5, 'y') == y**4 + y**3 + y**2 + y + 1",
  "T = cyclotomic_polynomial(n=6, var='z').parent(); z = T.gen()",
  "assert cyclotomic_polynomial(n=6, var='z') == z**2 - z + 1",
  "assert R.cyclotomic_polynomial(105)(1) == 1",
  "for invalid in [0, -1]:",
  "    try:",
  "        R.cyclotomic_polynomial(invalid)",
  "    except ValueError:",
  "        pass",
  "    else:",
  "        raise AssertionError('nonpositive order was accepted')",
  "for invalid in [1.5, '5', None]:",
  "    try:",
  "        R.cyclotomic_polynomial(invalid)",
  "    except TypeError:",
  "        pass",
  "    else:",
  "        raise AssertionError('noninteger order was accepted')",
  "try:",
  "    R.cyclotomic_polynomial(2**64)",
  "except (OverflowError, ValueError):",
  "    pass",
  "else:",
  "    raise AssertionError('out-of-range FLINT order was accepted')",
  "skew = R.cyclotomic_polynomial(30030)",
  "assert skew._has_fmpz_polynomial_resource()",
  "assert skew._coefficient_length() == 5761 and skew(1) == 1",
  "assert (x**105 - 1) // R.cyclotomic_polynomial(105) * R.cyclotomic_polynomial(105) == x**105 - 1",
  "print('public-cyclotomic-resource-ok')",
  "",
].join("\n"));

assert.equal(publicResult, "public-cyclotomic-resource-ok");

// Browsers and other hosts without generated resources retain ordinary Python.
const portableResult = run([
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "assert R.cyclotomic_polynomial(1) == x - 1",
  "assert R.cyclotomic_polynomial(12) == x**4 - x**2 + 1",
  "S = PolynomialRing(GF(7), 't'); t = S.gen()",
  "assert S.cyclotomic_polynomial(6) == t**2 + 6*t + 1",
  "print('portable-cyclotomic-python-ok')",
  "",
].join("\n"));

assert.equal(portableResult, "portable-cyclotomic-python-ok");

console.log(JSON.stringify({
  schema: "sagejs.ffi/fmpz-cyclotomic-resource-v1",
  status: "ok",
}));
