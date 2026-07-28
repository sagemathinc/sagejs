"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const generated = readFileSync(
  join(root, "dist/compiler/baselib-plain-pretty.js"),
  "utf8",
);
const source = readFileSync(
  join(root, "src/baselib/finite_fields.py"),
  "utf8",
);
const rationalSource = readFileSync(
  join(root, "src/baselib/exact_rational.py"),
  "utf8",
);
const realComplexSource = readFileSync(
  join(root, "src/baselib/real_complex.py"),
  "utf8",
);

function methodBody(className, methodName) {
  const marker = `${className}.prototype.${methodName} = `;
  const start = generated.indexOf(marker);
  assert.notEqual(start, -1, `missing generated ${className}.${methodName}`);
  const end = generated.indexOf("\n};", start);
  assert.notEqual(end, -1, `unterminated generated ${className}.${methodName}`);
  return generated.slice(start, end);
}

const constructorStart = generated.indexOf("function FiniteFieldElement()");
const constructorEnd = generated.indexOf(
  "ρσ_extends(FiniteFieldElement",
  constructorStart,
);
const constructor = generated.slice(constructorStart, constructorEnd);
const initialize = methodBody("FiniteFieldElement", "__init__");
const add = methodBody("FiniteFieldElement", "_add_");
const subtract = methodBody("FiniteFieldElement", "_sub_");
const multiply = methodBody("FiniteFieldElement", "_mul_");

assert.doesNotMatch(
  source,
  /\bv(?:'[^']*'|"[^"]*"|"""[\s\S]*?""")/,
  "finite_fields.py must not require verbatim JavaScript escapes",
);
assert.doesNotMatch(constructor, /ρσ_object_id/);
assert.match(initialize, /value instanceof FiniteFieldElement/);
assert.match(initialize, /value instanceof Rational/);
assert.match(initialize, /residue = ρσ_integer_bigint\(value\)/);
assert.doesNotMatch(initialize, /ρσ_instanceof/);
assert.doesNotMatch(
  initialize,
  /ρσ_integer_bigint\?\.__call__|ρσ_integer_bigint\?\./,
);

assert.match(
  add,
  /new FiniteFieldElement\(self\._parent, self\._value \+ other\._value\)/,
);
assert.match(
  subtract,
  /new FiniteFieldElement\(self\._parent, self\._value - other\._value\)/,
);
assert.match(
  multiply,
  /new FiniteFieldElement\(self\._parent, self\._value \* other\._value\)/,
);
for (const body of [add, subtract, multiply]) {
  assert.doesNotMatch(
    body,
    /ρσ_operator_(?:add|sub|mul)|ρσ_new_prime_field_element/,
  );
}

const rationalConstructorStart = generated.indexOf("function Rational()");
const rationalConstructorEnd = generated.indexOf(
  "ρσ_extends(Rational",
  rationalConstructorStart,
);
const rationalConstructor = generated.slice(
  rationalConstructorStart,
  rationalConstructorEnd,
);
const rationalAdd = methodBody("Rational", "_add_");
const rationalSubtract = methodBody("Rational", "_sub_");
const rationalMultiply = methodBody("Rational", "_mul_");

assert.doesNotMatch(rationalSource, /\bv(?:'[^']*'|"[^"]*"|"""[\s\S]*?""")/);
assert.doesNotMatch(rationalSource, /\/\//);
assert.doesNotMatch(rationalConstructor, /ρσ_object_id/);
for (const body of [rationalAdd, rationalSubtract, rationalMultiply]) {
  assert.match(body, /ρσ_bigint_divexact/);
  assert.doesNotMatch(body, /ρσ_operator_(?:add|sub|mul|floordiv)/);
}

assert.doesNotMatch(
  realComplexSource,
  /\bv(?:'[^']*'|"[^"]*"|"""[\s\S]*?""")/,
);
const realAdd = methodBody("RealNumberElement", "_add_");
const realMultiply = methodBody("RealNumberElement", "_mul_");
const complexAdd = methodBody("ComplexNumberElement", "_add_");
const complexMultiply = methodBody("ComplexNumberElement", "_mul_");
for (const body of [realAdd, realMultiply, complexAdd, complexMultiply]) {
  assert.doesNotMatch(body, /ρσ_operator_(?:add|mul)/);
  assert.doesNotMatch(body, /\bruntime\./);
}

console.log("Typed mathematical class lowering passed.");
