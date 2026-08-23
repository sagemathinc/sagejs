// sagejs-test-tier: unit
// sagejs-test-platform: true
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
const newReduced = methodBody("FiniteFieldElement", "_new_reduced");
const add = methodBody("FiniteFieldElement", "_add_");
const subtract = methodBody("FiniteFieldElement", "_sub_");
const multiply = methodBody("FiniteFieldElement", "_mul_");
const residueNewReduced = methodBody("IntegerModElement", "_new_reduced");
const residueAdd = methodBody("IntegerModElement", "_add_");
const residueSubtract = methodBody("IntegerModElement", "_sub_");
const residueMultiply = methodBody("IntegerModElement", "_mul_");

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

assert.match(newReduced, /Object\.create\(_finite_field_element_prototype\)/);
assert.match(newReduced, /answer\._parent = self\._parent/);
assert.match(newReduced, /answer\._value = value/);
assert.match(newReduced, /Object\.freeze\(answer\)/);
assert.match(add, /return self\._new_reduced\(value\)/);
assert.match(subtract, /return self\._new_reduced\(value\)/);
assert.match(
  multiply,
  /return self\._new_reduced\(self\._value \* other\._value % self\._parent\._modulus\)/,
);
for (const body of [add, subtract, multiply]) {
  assert.doesNotMatch(
    body,
    /ρσ_operator_(?:add|sub|mul)|ρσ_new_prime_field_element|new FiniteFieldElement/,
  );
}
assert.match(
  residueNewReduced,
  /Object\.create\(_integer_mod_element_prototype\)/,
);
assert.match(residueNewReduced, /Object\.freeze\(answer\)/);
assert.match(residueAdd, /return self\._new_reduced\(value\)/);
assert.match(residueSubtract, /return self\._new_reduced\(value\)/);
assert.match(
  residueMultiply,
  /return self\._new_reduced\(self\._value \* other\._value % self\._parent\._modulus\)/,
);
for (const body of [residueAdd, residueSubtract, residueMultiply]) {
  assert.doesNotMatch(
    body,
    /ρσ_operator_(?:add|sub|mul)|ρσ_new_prime_field_element|new IntegerModElement/,
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
