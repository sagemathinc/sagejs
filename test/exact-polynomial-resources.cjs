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

const directDivisionSource = [
  "from sagejs_serialization import dumps",
  "rz = PolynomialRing(ZZ, 'x')",
  "x = rz.gen()",
  "huge = 2**4096 + 2**521 + 17",
  "zdivisor = (x - 3)**48 * (x + 7)**31",
  "zexpected = rz([huge, -5, 0, 2**2048 + 9, 1])",
  "zdividend = zdivisor * zexpected",
  "zdividend_before = dumps(zdividend)",
  "zdivisor_before = dumps(zdivisor)",
  "zquotient = zdividend // zdivisor",
  "assert zquotient == zexpected",
  "assert zquotient._has_fmpz_polynomial_resource()",
  "assert dumps(zdividend) == zdividend_before",
  "assert dumps(zdivisor) == zdivisor_before",
  "assert not hasattr(zdividend._storage, 'coefficients')",
  "assert not hasattr(zdivisor._storage, 'coefficients')",
  "zzero = rz(0) // zdivisor",
  "assert zzero == rz(0) and zzero._has_fmpz_polynomial_resource()",
  "rq = PolynomialRing(QQ, 'y')",
  "y = rq.gen()",
  "qdivisor = (y - QQ(2)/3)**39 * (y + QQ(11)/5)**27",
  "qexpected = rq([QQ(huge)/13, QQ(-7)/11, 0, QQ(2**3072 + 1)/17, 1])",
  "qdividend = qdivisor * qexpected",
  "def forbid_compatibility_materialization(self):",
  "    raise AssertionError('exact division materialized compatibility storage')",
  "setattr(type(zdividend), '_materialize_exact_compatibility_storage', forbid_compatibility_materialization)",
  "qdividend_before = dumps(qdividend)",
  "qdivisor_before = dumps(qdivisor)",
  "qquotient = qdividend // qdivisor",
  "assert qquotient == qexpected",
  "assert qquotient._has_fmpq_polynomial_resource()",
  "assert dumps(qdividend) == qdividend_before",
  "assert dumps(qdivisor) == qdivisor_before",
  "assert not hasattr(qdividend._storage, 'numerators')",
  "assert not hasattr(qdividend._storage, 'denominators')",
  "assert not hasattr(qdivisor._storage, 'numerators')",
  "assert not hasattr(qdivisor._storage, 'denominators')",
  "qzero = rq(0) // qdivisor",
  "assert qzero == rq(0) and qzero._has_fmpq_polynomial_resource()",
  "for left, right in [(x + 1, x + 2), (y + 1, y + 2), (x + 1, rz(0)), (y + 1, rq(0))]:",
  "    try:",
  "        left // right",
  "    except ValueError:",
  "        pass",
  "    else:",
  "        raise AssertionError('invalid exact division was accepted')",
  "print('public-exact-polynomial-resource-division-ok')",
  "",
].join("\n");

assert.equal(run(directDivisionSource), "public-exact-polynomial-resource-division-ok");
assert.equal(
  run(directDivisionSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-exact-polynomial-resource-division-ok",
);

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
