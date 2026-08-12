#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function run(source) {
  const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim();
}

const cases = [
  ["ZZ", "x", "[]", "0"],
  ["ZZ", "xx", "[1]", "1"],
  ["ZZ", "xx", "[-1]", "-1"],
  ["ZZ", "theta", "[0, -1, 1]", "theta^2 - theta"],
  ["ZZ", "a_b", "[1, -1, 2]", "2*a_b^2 - a_b + 1"],
  ["QQ", "q", "[QQ(-1, 2), 1, QQ(-7, 9)]", "-7/9*q^2 + q - 1/2"],
  ["QQ", "xx", "[0, QQ(-1), QQ(1, 2)]", "1/2*xx^2 - xx"],
  [
    "QQ",
    "x_2",
    "[QQ(2, 4), QQ(-2, 4), QQ(6, 3)]",
    "2*x_2^2 - 1/2*x_2 + 1/2",
  ],
];

const caseSource = JSON.stringify(cases);
const resource = run([
  `cases = ${caseSource}`,
  "values = []",
  "for base_name, variable, coefficients, expected in cases:",
  "    base = ZZ if base_name == 'ZZ' else QQ",
  "    ring = PolynomialRing(base, variable)",
  "    value = ring(eval(coefficients))",
  "    assert repr(value) == expected",
  "    assert str(value) == expected",
  "    values.append(value)",
  "huge = 2**4097 + 2**521 + 17",
  "skew_ring = PolynomialRing(ZZ, 'skew_x')",
  "skew = skew_ring([huge, 0, -1, 1])",
  "assert repr(skew) == 'skew_x^3 - skew_x^2 + ' + str(huge)",
  "rational_ring = PolynomialRing(QQ, 'r')",
  "numerator = 2**4099 + 31",
  "denominator = 2**2053 + 9",
  "rational = rational_ring([QQ(-numerator, denominator), 0, 1])",
  "assert repr(rational) == 'r^2 - ' + str(numerator) + '/' + str(denominator)",
  "def forbid_coefficients(self):",
  "    raise AssertionError('resource formatting materialized coefficients')",
  "setattr(type(skew), 'coefficients', forbid_coefficients)",
  "for value in values + [skew, rational]:",
  "    assert len(repr(value)) != 0",
  "print('exact-polynomial-resource-format-ok')",
  "",
].join("\n"));
assert.equal(resource, "exact-polynomial-resource-format-ok");

const portable = run([
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  `cases = ${caseSource}`,
  "for base_name, variable, coefficients, expected in cases:",
  "    base = ZZ if base_name == 'ZZ' else QQ",
  "    value = PolynomialRing(base, variable)(eval(coefficients))",
  "    assert repr(value) == expected",
  "    assert str(value) == expected",
  "print('exact-polynomial-portable-format-ok')",
  "",
].join("\n"));
assert.equal(portable, "exact-polynomial-portable-format-ok");

const bulkCoefficients = run([
  "ring = PolynomialRing(QQ, 'q')",
  "count = 20000",
  "value = ring([QQ((-1)**index * (index + 1), index % 11 + 1) for index in range(count)])",
  "coefficients = value.coefficients()",
  "assert len(coefficients) == count",
  "assert coefficients[0] == 1",
  "assert coefficients[-1] == QQ(-20000, 2)",
  "assert all(coefficient.parent() is QQ for coefficient in coefficients)",
  "print('exact-polynomial-bulk-coefficients-ok')",
  "",
].join("\n"));
assert.equal(bulkCoefficients, "exact-polynomial-bulk-coefficients-ok");

console.log(JSON.stringify({
  schema: "sagejs.polynomial/exact-format-v1",
  status: "ok",
}));
