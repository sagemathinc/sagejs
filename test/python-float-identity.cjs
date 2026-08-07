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
    "class FloatLike:",
    "    def __float__(self):",
    "        return 0.5",
    "print(math.sqrt(FloatLike()), math.pow(9, FloatLike()))",
    "print(abs(math.asinh(-9.930534833110869) + 2.9912870292378018) < 1e-15)",
    "try:",
    "    math.cosh(1000)",
    "except OverflowError as error:",
    "    print(error)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "[('1.0', True), ('0.0', True), ('1.0', True), ('8.0', True), ('1.0', True)]",
    "['1.0', '1e+20', '-0.0', '0.5']",
    "[True, True, True, True]",
    "True True True",
    "[1.0,1e+20,-0.0,0.5]",
    "0.7071067811865476 3.0",
    "True",
    "math range error",
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

test("complex() honors Python numeric conversion protocols", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class ComplexLike:",
    "    def __complex__(self):",
    "        return complex(2.0, -3.0)",
    "class FloatLike:",
    "    def __float__(self):",
    "        return 4.0",
    "class InvalidComplex:",
    "    def __complex__(self):",
    "        return 5",
    "class ReflectedComplex:",
    "    def __complex__(self):",
    "        return complex(6.0, 7.0)",
    "    def __radd__(self, other):",
    "        return 'reflected-add'",
    "    def __rmul__(self, other):",
    "        return 'reflected-mul'",
    "print(complex(ComplexLike()))",
    "print(complex(FloatLike()))",
    "print(complex('-inf').real == float('-inf'))",
    "reflected = ReflectedComplex()",
    "print(complex(reflected), 1j + reflected, 1j * reflected)",
    "try:",
    "    complex(InvalidComplex())",
    "except TypeError as error:",
    "    print(error)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "(2-3j)",
    "(4+0j)",
    "True",
    "(6+7j) reflected-add reflected-mul",
    "__complex__ returned non-complex",
  ].join("\n"));
});

test("complex equality permits reflected third-party comparison", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class ReflectedComplex:",
    "    def __eq__(self, other):",
    "        return complex(other) == 1j",
    "value = ReflectedComplex()",
    "print(complex.__eq__(1j, value) is NotImplemented)",
    "print(1j == value, value in (1j,))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "True",
    "True True",
  ].join("\n"));
});

test("runtime descriptors preserve Python binding semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import math",
    "Methods = type('Methods', (), {",
    "    'static_alias': staticmethod(lambda value: value + 1),",
    "    'class_alias': classmethod(lambda cls: cls),",
    "})",
    "static_descriptor = Methods.__dict__['static_alias']",
    "print(static_descriptor(4), static_descriptor.__func__(4), static_descriptor.__wrapped__(4))",
    "print(Methods.static_alias(4), Methods().static_alias(4))",
    "print(Methods.class_alias() is Methods, Methods().class_alias() is Methods)",
    "DynamicMethod = type('DynamicMethod', (), {})",
    "def compute(self, value=0, scale=1):",
    "    return value * scale",
    "DynamicMethod.compute = compute",
    "print(getattr(DynamicMethod(), 'compute')(value=6, scale=7))",
    "class BuiltinAliases:",
    "    frexp = math.frexp",
    "    ldexp = math.ldexp",
    "print(BuiltinAliases().frexp(8.0), BuiltinAliases().ldexp(0.5, 4))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "5 5 5",
    "5 5",
    "True True",
    "42",
    "(0.5, 4) 8.0",
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
