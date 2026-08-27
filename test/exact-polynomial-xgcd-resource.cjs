#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function run(source, extraEnvironment = {}) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: source,
      env: {
        ...process.env,
        SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
        ...extraEnvironment,
      },
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, "", result.stderr);
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim();
}

const oracleCorpus = [
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "def check(left, right, expected):",
  "    actual = left.xgcd(right)",
  "    assert actual == expected, (left, right, actual, expected)",
  "    g, s, t = actual",
  "    assert g == s*left + t*right",
  "    return actual",
  "check(x + 2, x + 4, (R(2), R(-1), R(1)))",
  "check(2*x + 4, 3*x + 9, (R(6), R(-3), R(2)))",
  "common = x**2 + 2",
  "check(common*x**3, common*(x - 3), (27*common, R(1), -x**2 - 3*x - 9))",
  "for left, right, expected in [",
  "    (R(2), R(2), (2, 0, 1)),",
  "    (R(-2), R(-4), (2, -1, 0)),",
  "    (R(0), R(0), (R(0), 0, 1)),",
  "    (R(0), -x, (-x, 0, 1)),",
  "    (x, R(0), (x, 1, 0)),",
  "]:",
  "    actual = left.xgcd(right)",
  "    assert actual == expected",
  "    g, s, t = actual",
  "    assert g == s*left + t*right",
  "large = 2**521 + 17",
  "left = (x**3 + large*x + 1)*(x**2 + x + 1)",
  "right = (x**4 - 3*x + 7)*(x**2 + x + 1)",
  "g, s, t = left.xgcd(right)",
  "assert g == s*left + t*right",
  "assert all(value._has_fmpz_polynomial_resource() for value in (g, s, t))",
  "assert not hasattr(left._storage, 'coefficients')",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "def qcheck(left, right, expected):",
  "    actual = left.xgcd(right)",
  "    assert actual == expected, (left, right, actual, expected)",
  "    g, s, t = actual",
  "    assert g == s*left + t*right",
  "    return actual",
  "qcheck(y + 2, y + 4, (S(1), S(QQ(-1)/2), S(QQ(1)/2)))",
  "g, s, t = S(0).xgcd(S(0))",
  "assert (g, s, t) == (S(0), S(0), S(0))",
  "assert g == s*S(0) + t*S(0)",
  "qcheck(S(0), -2*y + 4, (y - 2, S(0), S(QQ(-1)/2)))",
  "qcommon = y**2 + QQ(2)/3*y + QQ(5)/7",
  "qleft = qcommon*(y**4 + QQ(11)/13*y + 1)",
  "qright = qcommon*(y**3 - QQ(17)/19*y**2 + 2)",
  "qg, qs, qt = qleft.xgcd(qright)",
  "assert qg == qs*qleft + qt*qright",
  "assert qg == qcommon",
  "assert all(value._has_fmpq_polynomial_resource() for value in (qg, qs, qt))",
  "assert not hasattr(qleft._storage, 'numerators')",
  "closed = (x + 1).xgcd(x + 2)[0]",
  "closed._storage.resource.close()",
  "try:",
  "    closed.xgcd(x + 1)",
  "except Exception:",
  "    pass",
  "else:",
  "    raise AssertionError('closed polynomial resource was accepted')",
  "print('exact-polynomial-xgcd-resource-ok')",
  "",
].join("\n");

assert.equal(run(oracleCorpus), "exact-polynomial-xgcd-resource-ok");
assert.equal(
  run(oracleCorpus, { SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-polynomial-xgcd-resource-ok",
);

const portableCorpus = [
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "for left, right in [",
  "    (x + 2, x + 4),",
  "    (2*x + 4, 3*x + 9),",
  "    ((x**2 + 2)*x**3, (x**2 + 2)*(x - 3)),",
  "]:",
  "    g, s, t = left.xgcd(right)",
  "    assert g == s*left + t*right",
  "assert (x + 2).xgcd(x + 4) == (R(2), R(-1), R(1))",
  "common = x**2 + 2",
  "assert (common*x**3).xgcd(common*(x - 3)) == (27*common, R(1), -x**2 - 3*x - 9)",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "g, s, t = (y + 2).xgcd(y + 4)",
  "assert (g, s, t) == (S(1), S(QQ(-1)/2), S(QQ(1)/2))",
  "assert g == s*(y + 2) + t*(y + 4)",
  "g, s, t = S(0).xgcd(S(0))",
  "assert (g, s, t) == (S(0), S(0), S(0))",
  "assert g == s*S(0) + t*S(0)",
  "print('portable-exact-polynomial-xgcd-ok')",
  "",
].join("\n");

assert.equal(run(portableCorpus), "portable-exact-polynomial-xgcd-ok");
assert.equal(
  run(portableCorpus, { SAGEJS_NATIVE_DISABLE: "1" }),
  "portable-exact-polynomial-xgcd-ok",
);

console.log(JSON.stringify({
  schema: "sagejs.polynomial/exact-xgcd-resource-v1",
  status: "ok",
}));
