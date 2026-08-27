#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
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
      input: `${source}\n`,
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
  return result.stdout.trim();
}

const publicCorpus = [
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "huge = 2**8193 + 2**4097 + 17",
  "z = R([5, -4, 3, 0, huge])",
  "q = S([QQ(5)/7, QQ(-4)/3, QQ(3)/2, 0, QQ(huge)/11])",
  "def forbid_coefficients(self):",
  "    raise AssertionError('exact scalar operation exported all coefficients')",
  "setattr(type(z), 'coefficients', forbid_coefficients)",
  "for divisor, expected in [",
  "    (2, R([2, -2, 1, 0, huge // 2])),",
  "    (-2, R([-3, 2, -2, 0, huge // -2])),",
  "    (3, R([1, -2, 1, 0, huge // 3])),",
  "    (-3, R([-2, 1, -1, 0, huge // -3])),",
  "]:",
  "    value = z // divisor",
  "    assert value == expected and value._has_fmpz_polynomial_resource()",
  "for divisor in [QQ(2), QQ(-2)/3, QQ(3)/5, QQ(huge)/13]:",
  "    value = q // divisor",
  "    assert value == S([q[index] / divisor for index in range(5)])",
  "    assert value._has_fmpq_polynomial_resource()",
  "for value, kind in [(z, 'z'), (q, 'q')]:",
  "    length = value._coefficient_length()",
  "    for stop in [None, -100, -1, 0, 1, 3, length, length + 100]:",
  "        actual = value[:] if stop is None else value[:stop]",
  "        bounded = length if stop is None else min(max(stop, 0), length)",
  "        assert actual._coefficient_length() == bounded",
  "        for index in range(bounded):",
  "            assert actual[index] == value[index]",
  "        assert (kind == 'z' and actual._has_fmpz_polynomial_resource()) or (kind == 'q' and actual._has_fmpq_polynomial_resource())",
  "for value in [R(0), S(0)]:",
  "    assert value[:100] == value and value[:-1] == value",
  "for value in [z, q]:",
  "    for operation in [lambda: value // 0, lambda: value[1:], lambda: value[::2]]:",
  "        try:",
  "            operation()",
  "        except (ZeroDivisionError, IndexError):",
  "            pass",
  "        else:",
  "            raise AssertionError('invalid exact polynomial operation was accepted')",
  "closed = (x + 1)**4",
  "closed._storage.resource.close()",
  "for operation in [lambda: closed // 2, lambda: closed[:2]]:",
  "    try:",
  "        operation()",
  "    except Exception:",
  "        pass",
  "    else:",
  "        raise AssertionError('closed polynomial resource was accepted')",
  "print('exact-polynomial-scalar-slice-resource-ok')",
].join("\n");

assert.equal(run(publicCorpus), "exact-polynomial-scalar-slice-resource-ok");
assert.equal(
  run(publicCorpus, { SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-polynomial-scalar-slice-resource-ok",
);

const portableCorpus = [
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "z = R([5, -4, 3])",
  "q = S([QQ(5)/7, QQ(-4)/3, QQ(3)/2])",
  "assert z // -2 == R([-3, 2, -2])",
  "assert q // (QQ(-2)/3) == S([QQ(-15)/14, 2, QQ(-9)/4])",
  "assert z[:2] == R([5, -4]) and z[:-1] == R(0)",
  "assert q[:2] == S([QQ(5)/7, QQ(-4)/3]) and q[:100] == q",
  "print('portable-exact-polynomial-scalar-slice-ok')",
].join("\n");

assert.equal(run(portableCorpus), "portable-exact-polynomial-scalar-slice-ok");
assert.equal(
  run(portableCorpus, { SAGEJS_NATIVE_DISABLE: "1" }),
  "portable-exact-polynomial-scalar-slice-ok",
);

const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  const differentialCorpus = [
    "R = PolynomialRing(ZZ, 'x')",
    "S = PolynomialRing(QQ, 'y')",
    "huge = 2**521 + 17",
    "z = R([5, -4, 3, 0, huge])",
    "q = S([QQ(5)/7, QQ(-4)/3, QQ(3)/2, 0, QQ(huge)/11])",
    "print([[(z // divisor)[index] for index in range(5)] for divisor in [2, -2, 3, -3, huge]])",
    "print([[(q // divisor)[index] for index in range(5)] for divisor in [QQ(2), QQ(-2)/3, QQ(3)/5, QQ(huge)/13]])",
    "print([[[z[:stop][index] for index in range(5)], z[:stop].degree()] for stop in [-100, -1, 0, 1, 3, 5, 100]])",
    "print([[[q[:stop][index] for index in range(5)], q[:stop].degree()] for stop in [-100, -1, 0, 1, 3, 5, 100]])",
  ].join("\n");
  const expected = spawnSync(sage, ["-c", differentialCorpus], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(expected.status, 0, expected.stderr);
  assert.equal(run(differentialCorpus), expected.stdout.trim());
}

console.log(JSON.stringify({
  schema: "sagejs.polynomial/exact-scalar-slice-resource-v1",
  status: "ok",
}));
