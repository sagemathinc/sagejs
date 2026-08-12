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

const correctnessSource = [
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
  // f(1/2) = huge - 3/2 + 7/8 = huge - 5/8.
  "assert f(QQ(1)/QQ(2)) == QQ(huge) - QQ(5)/QQ(8)",
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
].join("\n");

assert.equal(run(correctnessSource), "exact-polynomial-resources-ok");
assert.equal(
  run(correctnessSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-polynomial-resources-ok",
);

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
  "assert (x + 1) // (x + 2) == rz(1)",
  "assert (x + 1) % (x + 2) == rz(-1)",
  "assert (y + 1) // (y + 2) == rq(1)",
  "assert (y + 1) % (y + 2) == rq(-1)",
  "for left, right in [(x + 1, rz(0)), (y + 1, rq(0))]:",
  "    for operation in [lambda: left // right, lambda: left % right, lambda: left.quo_rem(right)]:",
  "        try:",
  "            operation()",
  "        except ZeroDivisionError:",
  "            pass",
  "        else:",
  "            raise AssertionError('division by zero polynomial was accepted')",
  "print('public-exact-polynomial-resource-division-ok')",
  "",
].join("\n");

assert.equal(run(directDivisionSource), "public-exact-polynomial-resource-division-ok");
assert.equal(
  run(directDivisionSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-exact-polynomial-resource-division-ok",
);

const directGcdSource = [
  "import sagejs.runtime as runtime",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "def forbid_compatibility_materialization(self):",
  "    raise AssertionError('exact gcd materialized compatibility storage')",
  "setattr(type(x), '_materialize_exact_compatibility_storage', forbid_compatibility_materialization)",
  "zero = R(0)",
  "assert zero.gcd(zero) == zero",
  "assert zero.gcd(-2*x + 4) == 2*x - 4",
  "assert (6*x + 6).gcd(9*x + 9) == 3*x + 3",
  "assert (2*x).gcd(R(4)) == R(2)",
  "huge = 2**8193 + 2**4097 + 17",
  "skew = x**3 + huge*x + 1",
  "assert skew.gcd(skew) == skew",
  "common = (x - 2)**4 * (x + 5)",
  "left = 6 * common * (x + 1)**17",
  "right = -9 * common * (x**2 + x + 1)**11",
  "value = left.gcd(right)",
  "assert value == 3*common",
  "assert value._has_fmpz_polynomial_resource()",
  "assert left // value * value == left",
  "assert right // value * value == right",
  "assert not hasattr(left._storage, 'coefficients')",
  "assert not hasattr(right._storage, 'coefficients')",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "qzero = S(0)",
  "assert qzero.gcd(qzero) == qzero",
  "assert qzero.gcd(-2*y + 4) == y - 2",
  "assert (6*y + 6).gcd(9*y + 9) == y + 1",
  "assert S(2).gcd(S(4)) == S(1)",
  "qskew = y**4 + QQ(huge)/QQ(2**4099 + 9)*y + QQ(3)/QQ(11)",
  "assert qskew.gcd(qskew) == qskew",
  "qcommon = (y - QQ(2)/3)**3 * (y + QQ(5)/7)",
  "qleft = QQ(6)/QQ(5) * qcommon * (y + QQ(1)/3)**13",
  "qright = QQ(-9)/QQ(7) * qcommon * (y**2 + y + 1)**9",
  "qvalue = qleft.gcd(qright)",
  "assert qvalue == qcommon",
  "assert qvalue._has_fmpq_polynomial_resource()",
  "assert qleft // qvalue * qvalue == qleft",
  "assert qright // qvalue * qvalue == qright",
  "assert not hasattr(qleft._storage, 'numerators')",
  "assert not hasattr(qleft._storage, 'denominators')",
  "for index in range(1, 13):",
  "    zcommon = x**3 + (index + 1)*x + 1",
  "    zleft = (index + 2)*zcommon*(x**4 + index*x + 1)",
  "    zright = -(2*index + 2)*zcommon*(x**3 + (index + 1)*x**2 + 1)",
  "    zgcd = zleft.gcd(zright)",
  "    assert zleft // zgcd * zgcd == zleft",
  "    assert zright // zgcd * zgcd == zright",
  "    assert zgcd._has_fmpz_polynomial_resource()",
  "    qcommon_random = y**3 + QQ(index + 1)/(index + 2)*y + 1",
  "    qleft_random = qcommon_random*(y**4 + index*y + 1)",
  "    qright_random = qcommon_random*(y**3 + (index + 1)*y**2 + 1)",
  "    qgcd = qleft_random.gcd(qright_random)",
  "    assert qleft_random // qgcd * qgcd == qleft_random",
  "    assert qright_random // qgcd * qgcd == qright_random",
  "    assert qgcd._has_fmpq_polynomial_resource()",
  "closed = (x + 1)**3",
  "closed._storage.resource.close()",
  "try:",
  "    closed.gcd(x + 1)",
  "except Exception:",
  "    pass",
  "else:",
  "    raise AssertionError('closed polynomial resource was accepted')",
  "print('public-exact-polynomial-resource-gcd-ok')",
  "",
].join("\n");

assert.equal(run(directGcdSource), "public-exact-polynomial-resource-gcd-ok");
assert.equal(
  run(directGcdSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-exact-polynomial-resource-gcd-ok",
);

const portableGcdSource = [
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "assert R(0).gcd(R(0)) == R(0)",
  "assert R(0).gcd(-2*x + 4) == 2*x - 4",
  "assert (6*x + 6).gcd(9*x + 9) == 3*x + 3",
  "assert (2*x).gcd(R(4)) == R(2)",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "assert S(0).gcd(S(0)) == S(0)",
  "assert S(0).gcd(-2*y + 4) == y - 2",
  "assert (6*y + 6).gcd(9*y + 9) == y + 1",
  "assert S(2).gcd(S(4)) == S(1)",
  "print('portable-exact-polynomial-gcd-ok')",
  "",
].join("\n");

assert.equal(run(portableGcdSource), "portable-exact-polynomial-gcd-ok");
assert.equal(
  run(portableGcdSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "portable-exact-polynomial-gcd-ok",
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
