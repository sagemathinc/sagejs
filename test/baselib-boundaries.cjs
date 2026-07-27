"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const mathematicalModules = [
  "src/baselib/factorization.py",
  "src/baselib/finite_fields.py",
  "src/baselib/polynomial.py",
];
const verbatimExpression =
  /\bv(?:'[^']*'|"[^"]*"|'''[\s\S]*?'''|"""[\s\S]*?""")/;

for (const relativePath of mathematicalModules) {
  const source = readFileSync(join(root, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    verbatimExpression,
    `${relativePath} must not contain verbatim JavaScript`,
  );
  assert.match(
    source,
    /^import sagejs\.runtime as runtime$/m,
    `${relativePath} must use the readable runtime namespace`,
  );
}

const generated = readFileSync(
  join(root, "dist/compiler/baselib-plain-pretty.js"),
  "utf8",
);
assert.match(
  generated,
  /Factorization = ρσ_callable_sequence_class\(Factorization\)/,
);
assert.match(
  generated,
  /IntegerFactorization = ρσ_callable_sequence_class\(IntegerFactorization\)/,
);
assert.doesNotMatch(generated, /ρσ_factorization_sequence_proxy/);
assert.doesNotMatch(generated, /ρσ_callable_factorization_class/);
assert.match(
  generated,
  /PolynomialRingParent = ρσ_callable_instance_class_adapter\(PolynomialRingParent\)/,
);
assert.doesNotMatch(generated, /ρσ_modules\["sagejs\.runtime"\]/);
assert.doesNotMatch(generated, /\bruntime\.(?:flint_backend|coercion_model)/);

const algebraSource = readFileSync(
  join(root, "src/baselib/algebra.py"),
  "utf8",
);
assert.doesNotMatch(algebraSource, /function PolynomialElement/);
assert.doesNotMatch(algebraSource, /function PolynomialRingParent/);

console.log("Mathematical baselib source boundaries passed.");
