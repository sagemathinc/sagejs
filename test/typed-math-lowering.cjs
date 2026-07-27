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

console.log("Typed mathematical class lowering passed.");
