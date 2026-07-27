"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const mathematicalModules = [
  "src/baselib/factorization.py",
  "src/baselib/finite_fields.py",
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

console.log("Mathematical baselib source boundaries passed.");
