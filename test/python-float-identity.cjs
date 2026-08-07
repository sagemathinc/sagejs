"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("integral binary64 values retain Python float identity", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "values = [1.0, 1e20, -0.0, float(), float(1)]",
    "values += [0.5 + 0.5, 4.0 / 2.0, 2.0**3, pow(2.0, 3), pow(2, -1)]",
    "values += [pow(1, -1), 1**-1, abs(-1.0)]",
    "values += [5.0 // 2, 4.0 % 2]",
    "print([repr(value) for value in values])",
    "print([type(value) is float for value in values])",
    "print([isinstance(value, int) for value in values])",
    "print(bool(-0.0), bool(0.0), bool(1.0))",
    "print(1.0 == 1, 1e20 == 10**20, hash(1.0) == hash(1))",
    "mapping = {1.0: 'float', 1: 'int'}",
    "print(len(mapping), mapping[1.0], len({1.0, 1}))",
    "print(repr(round(1.0)), type(round(1.0)) is int)",
    "print(repr(round(1.0, 2)), type(round(1.0, 2)) is float)",
    "print(repr(1.0 + 10**20), type(1.0 + 10**20) is float)",
    "print(repr((10**20) // 2.0), type((10**20) // 2.0) is float)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "['1.0', '1e+20', '-0.0', '0.0', '1.0', '1.0', '2.0', '8.0', '8.0', '0.5', '1.0', '1.0', '1.0', '2.0', '0.0']",
    "[True, True, True, True, True, True, True, True, True, True, True, True, True, True, True]",
    "[False, False, False, False, False, False, False, False, False, False, False, False, False, False, False]",
    "False False True",
    "True True True",
    "1 int 1",
    "1 True",
    "1.0 True",
    "1e+20 True",
    "5e+19 True",
  ].join("\n"));
});

test("math and serialization preserve integral float results", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import json, math",
    "from sagejs_serialization import dumps, loads",
    "values = [math.sqrt(1), math.sin(0), math.exp(0), math.pow(2, 3), math.fabs(-1)]",
    "print([(repr(value), type(value) is float) for value in values])",
    "answer = loads(dumps([1.0, 1e20, -0.0, 0.5]))",
    "print([repr(value) for value in answer])",
    "print([type(value) is float for value in answer])",
    "print(answer[0] == 1, answer[1] == 10**20, not bool(answer[2]))",
    "print(json.dumps([1.0, 1e20, -0.0, 0.5]))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "[('1.0', True), ('0.0', True), ('1.0', True), ('8.0', True), ('1.0', True)]",
    "['1.0', '1e+20', '-0.0', '0.5']",
    "[True, True, True, True]",
    "True True True",
    "[1.0,1e+20,-0.0,0.5]",
  ].join("\n"));
});

test("complex components and magnitudes retain float identity", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "values = [complex(1.0), complex(1e20), complex(-0.0), complex(1.0, 2.0)]",
    "for value in values:",
    "    print(repr(value.real), type(value.real) is float, repr(value.imag), type(value.imag) is float)",
    "print(repr(abs(values[0])), type(abs(values[0])) is float)",
    "print(complex(1.0) == 1.0, hash(complex(1.0)) == hash(1.0))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "1.0 True 0.0 True",
    "1e+20 True 0.0 True",
    "-0.0 True 0.0 True",
    "1.0 True 2.0 True",
    "1.0 True",
    "True True",
  ].join("\n"));
});

test("integral float wrappers do not leak across JavaScript interop", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs.javascript import require",
    "types = require('node:util').types",
    "print(types.isNumberObject(1.0), types.isNumberObject(1))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "False False");
});
