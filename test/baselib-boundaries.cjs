"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const pyrightConfig = JSON.parse(
  readFileSync(join(root, "pyrightconfig.json"), "utf8"),
);
const strictModules = pyrightConfig.include;
const strictBaselibModules = strictModules.filter((path) =>
  path.startsWith("src/baselib/"),
);
const verbatimExpression =
  /(?<!['"])\bv(?:'[^']*'|"[^"]*"|'''[\s\S]*?'''|"""[\s\S]*?""")/;

assert.match("answer = v'nativeCall()'", verbatimExpression);
assert.doesNotMatch("answer = {'v': 'triangle-down'}", verbatimExpression);
const topLevelModules = readdirSync(join(root, "src", "baselib"))
  .filter((name) => name.endsWith(".py"))
  .map((name) => `src/baselib/${name}`)
  .sort();
const bootstrapBoundary = "src/baselib/sagejs_bootstrap.py";

assert.deepEqual(
  [...strictBaselibModules].sort(),
  topLevelModules.filter((path) => path !== bootstrapBoundary),
  "every top-level baselib module except the bootstrap boundary must be strict",
);

for (const relativePath of strictModules) {
  const source = readFileSync(join(root, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    verbatimExpression,
    `${relativePath} must not contain verbatim JavaScript`,
  );
  assert.ok(
    !source.includes("%js"),
    `${relativePath} must not contain raw JavaScript expressions`,
  );
  assert.doesNotMatch(
    source,
    /^#\s*globals:/m,
    `${relativePath} must not declare implicit globals`,
  );
  if (source.includes("runtime.")) {
    assert.match(
      source,
      /^import sagejs\.runtime as runtime$/m,
      `${relativePath} must use the readable runtime namespace`,
    );
  }
}

const bootstrapSource = readFileSync(
  join(root, bootstrapBoundary),
  "utf8",
);
assert.match(bootstrapSource, /def ρσ_native_method_adapter/);
assert.match(bootstrapSource, /%js/);

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
assert.match(
  generated,
  /FiniteField_prime_modn = ρσ_callable_instance_class_adapter\(FiniteField_prime_modn\)/,
);
assert.match(
  generated,
  /FiniteField_givaro = ρσ_callable_instance_class_adapter\(FiniteField_givaro\)/,
);
assert.match(
  generated,
  /FiniteField_ntl_gf2e = ρσ_callable_instance_class_adapter\(FiniteField_ntl_gf2e\)/,
);
assert.match(
  generated,
  /FiniteField_pari_ffelt = ρσ_callable_instance_class_adapter\(FiniteField_pari_ffelt\)/,
);
assert.doesNotMatch(generated, /ρσ_modules\["sagejs\.runtime"\]/);
assert.doesNotMatch(generated, /\bruntime\.(?:flint_backend|coercion_model)/);

const algebraSource = readFileSync(
  join(root, "src/baselib/algebra.py"),
  "utf8",
);
assert.doesNotMatch(algebraSource, /function PolynomialElement/);
assert.doesNotMatch(algebraSource, /function PolynomialRingParent/);
assert.doesNotMatch(algebraSource, /function RealNumberElement/);
assert.doesNotMatch(algebraSource, /function ComplexNumberElement/);
assert.doesNotMatch(algebraSource, /function RealField/);
assert.doesNotMatch(algebraSource, /function ComplexField/);
assert.doesNotMatch(algebraSource, /function GF/);
assert.doesNotMatch(algebraSource, /ρσ_make_extension_field/);
assert.doesNotMatch(algebraSource, /ρσ_finite_field_name/);
assert.doesNotMatch(algebraSource, /ρσ_polynomial_from_coefficients/);

console.log("Baselib source boundaries passed.");
