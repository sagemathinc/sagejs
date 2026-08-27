// sagejs-test-tier: unit
// sagejs-test-platform: true
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
const strictTopLevelBaselibModules = strictBaselibModules.filter((path) =>
  !path.slice("src/baselib/".length).includes("/"),
);
function containsVerbatimExpression(source) {
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "v" && !/[A-Za-z0-9_]/.test(source[index - 1] ?? "")) {
      const quote = source[index + 1];
      if (quote === "'" || quote === '"') return true;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }
    const delimiter = source.slice(index, index + 3) === character.repeat(3)
      ? character.repeat(3)
      : character;
    index += delimiter.length;
    while (index < source.length) {
      if (source.slice(index, index + delimiter.length) === delimiter) {
        index += delimiter.length;
        break;
      }
      if (source[index] === "\\") index += 2;
      else index += 1;
    }
  }
  return false;
}

assert.equal(containsVerbatimExpression("answer = v'nativeCall()'"), true);
assert.equal(containsVerbatimExpression('answer = v"nativeCall()"'), true);
assert.equal(
  containsVerbatimExpression("answer = {'v': 'triangle-down'}"),
  false,
);
assert.equal(
  containsVerbatimExpression('"""Documentation ending in Sage.js v"""'),
  false,
);
const topLevelModules = readdirSync(join(root, "src", "baselib"))
  .filter((name) => name.endsWith(".py"))
  .map((name) => `src/baselib/${name}`)
  .sort();
const bootstrapBoundary = "src/baselib/sagejs_bootstrap.py";
const compilerBootstrapBoundary = "src/baselib/compiler_bootstrap.py";

assert.deepEqual(
  [...strictTopLevelBaselibModules].sort(),
  topLevelModules.filter(
    (path) =>
      path !== bootstrapBoundary && path !== compilerBootstrapBoundary,
  ),
  "every top-level baselib module except the bootstrap boundary must be strict",
);

for (const relativePath of strictModules) {
  const source = readFileSync(join(root, relativePath), "utf8");
  assert.equal(
    containsVerbatimExpression(source),
    false,
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
      /^\s*import sagejs\.runtime as _?runtime$/m,
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
assert.equal(
  (
    generated.match(
      /ρσ_baselib_modules\["sagejs\.runtime"\] = \(function\(\) \{/g,
    ) || []
  ).length,
  1,
  "sagejs.runtime must be materialized as exactly one lexical module",
);
assert.match(
  generated,
  /ρσ_baselib_modules\["sagejs"\]\.runtime = ρσ_baselib_modules\["sagejs\.runtime"\]/,
  "the canonical sagejs package must publish the runtime module",
);
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
