#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function run(source, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python"], {
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
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim();
}

const correctness = run([
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "assert x._has_fmpz_polynomial_resource()",
  "zero = R([0, 0, 0])",
  "assert zero.coefficients() == [] and zero**0 == R(1)",
  "huge = 2**521 + 17",
  "f = R([huge, -3, 0, 7])",
  "g = (x + 1)**32",
  "assert f._has_fmpz_polynomial_resource() and g._has_fmpz_polynomial_resource()",
  "assert (f + g - g) == f and -(-f) == f",
  "assert (x + 1)**5 == x**5 + 5*x**4 + 10*x**3 + 10*x**2 + 5*x + 1",
  "assert f(3) == huge + 180",
  "assert f(QQ(1)/QQ(2)) == QQ(huge) + QQ(1)/QQ(8)",
  "assert f.coefficients() == [huge, -3, 0, 7]",
  "assert str(R([-1, 1, -2])) == '-2*x^2 + x - 1'",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "assert y._has_fmpq_polynomial_resource()",
  "q = S([QQ(2)/QQ(-4), 0, QQ(7)/QQ(9), 0])",
  "h = (y + QQ(1)/QQ(3))**12",
  "assert q._has_fmpq_polynomial_resource() and h._has_fmpq_polynomial_resource()",
  "assert q.coefficients() == [QQ(-1)/QQ(2), 0, QQ(7)/QQ(9)]",
  "assert (q + h - h) == q and -(-q) == q",
  "assert q(3) == QQ(13)/QQ(2)",
  "assert q(QQ(-3)/QQ(2)) == QQ(5)/QQ(4)",
  "assert str(q) == '7/9*y^2 - 1/2'",
  "restored_f = loads(dumps(f)); restored_q = loads(dumps(q))",
  "assert restored_f == f and restored_q == q",
  "assert restored_f._has_fmpz_polynomial_resource()",
  "assert restored_q._has_fmpq_polynomial_resource()",
  "print('exact-polynomial-resources-ok')",
  "",
].join("\n"));

assert.equal(correctness, "exact-polynomial-resources-ok");

const fallback = run([
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "f = (x - 1)**3 * (x + 2)",
  "quotient = f // (x - 1)",
  "assert quotient._has_fmpz_polynomial_resource()",
  "assert quotient * (x - 1) == f",
  "factorization = f.factor()",
  "assert all(factor._has_fmpz_polynomial_resource() for factor, exponent in factorization)",
  "assert factorization.value() == f",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "q = QQ(3)/QQ(10) * (y - 1)**2 * (y + 2)",
  "quotient = q // (y - 1)",
  "assert quotient._has_fmpq_polynomial_resource()",
  "assert quotient * (y - 1) == q",
  "factorization = q.factor()",
  "assert all(factor._has_fmpq_polynomial_resource() for factor, exponent in factorization)",
  "assert factorization.value() == q",
  "print('exact-polynomial-compatibility-ok')",
  "",
].join("\n"), { SAGEJS_NATIVE_DISABLE: "1" });

assert.equal(fallback, "exact-polynomial-compatibility-ok");
console.log(JSON.stringify({
  schema: "sagejs.polynomial/exact-resource-v1",
  status: "ok",
}));
