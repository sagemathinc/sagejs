#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");

function run(source) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: `${source}\n`,
      timeout: 60_000,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr.trim(), "", result.stderr || result.stdout);
  return result.stdout.trim().split("\n").at(-1);
}

test("explicit univariate conversion maps generators by position", () => {
  const output = run([
    'R = PolynomialRing(QQ, "x")',
    'S = PolynomialRing(QQ, "y")',
    "x = R.gen()",
    "y = S.gen()",
    "assert R(y) == x",
    "assert R(y**2 - 17) == x**2 - 17",
    "assert R(y**2 - 17).parent() is R",
    "assert R(y**2 - 17).coefficients() == [-17, 0, 1]",
    'Z = PolynomialRing(ZZ, "z")',
    "z = Z.gen()",
    "assert R(z**3 - 2*z + 9) == x**3 - 2*x + 9",
    "assert Z(S([1, -2, 3])) == z**2*3 - z*2 + 1",
    "try:",
    "    Z(S([QQ(1)/2, 1]))",
    "except TypeError:",
    "    pass",
    "else:",
    '    raise AssertionError("nonintegral rational coefficient converted to ZZ")',
    "try:",
    "    x + y",
    "except TypeError:",
    "    pass",
    "else:",
    '    raise AssertionError("distinct polynomial parents coerced implicitly")',
    "assert x != y",
    'ZZt = PolynomialRing(ZZ, "t")',
    'QQt = PolynomialRing(QQ, "t")',
    "zt = ZZt.gen()",
    "qt = QQt.gen()",
    "assert (zt + qt).parent() is QQt",
    "assert zt + qt == 2*qt",
    'print("polynomial-ring-conversion-ok")',
    "",
  ].join("\n"));
  assert.equal(output, "polynomial-ring-conversion-ok");
});
