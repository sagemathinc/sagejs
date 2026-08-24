// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

function runCPython(source) {
  const result = spawnSync(pythonExecutable(), ["-c", source], {
    cwd: __dirname,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.replaceAll("\r\n", "\n").trim();
}

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

test("complex division by a real follows the direct binary64 path", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "value = complex(1e308, -1e308) / 1e308",
    "print(value)",
    "print(value.real == 1.0, value.imag == -1.0)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "(1-1j)\nTrue True");
});

test("fractional powers of negative floats use the complex branch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "value = (-5.0) ** (-1.5)",
    "print(type(value) is complex)",
    "print(abs(value - complex(-1.6430360947926078e-17, 0.08944271909999159)) < 1e-16)",
    "print((-5.0) ** -1, type((-5.0) ** -1) is float)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True\nTrue\n-0.2 True");
});

test("float() accepts real protocols and rejects complex values", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class Indexed:",
    "    def __index__(self): return 7",
    "print(float(True), float(False), float(10**100), float(Indexed()))",
    "for value in (1+0j, 1e-10j, object()):",
    "    try:",
    "        float(value)",
    "    except TypeError as error:",
    "        print(type(value).__name__, str(error))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "1.0 0.0 1e+100 7.0",
    "complex float() argument must be a string or a real number, not 'complex'",
    "complex float() argument must be a string or a real number, not 'complex'",
    "object float() argument must be a string or a real number, not 'object'",
  ].join("\n"));
});

test("large integer binary64 boundaries agree exactly with CPython", async (t) => {
  const source = String.raw`
import math

def capture(label, operation):
    try:
        value = operation()
        print(label, repr(value))
    except Exception as error:
        print(label, type(error).__name__, str(error))

capture('issue-23', lambda: 9 * (10**16 - 1) / 9)
capture('balanced-huge', lambda: (2**1075 - 1) / 2**1075)
capture('division-overflow', lambda: 10**400 / 1)
capture('float-round-down', lambda: float(2**53 + 1))
capture('float-round-up', lambda: float(2**53 + 3))
capture('float-finite-edge', lambda: float(2**1023))
capture('float-overflow-edge', lambda: float(2**1024 - 1))
capture('negative-zero', lambda: 0 / -1)
capture('positive-underflow', lambda: 1 / 10**400)
capture('negative-underflow', lambda: -1 / 10**400)
capture('negative-power-underflow', lambda: (10**400) ** -1)
capture('mixed-add-overflow', lambda: 1.0 + 10**400)
capture('mixed-sub-overflow', lambda: 1.0 - 10**400)
capture('mixed-mul-overflow', lambda: 0.5 * 10**400)
capture('mixed-div-overflow', lambda: 1.0 / 10**400)
capture('mixed-floor-overflow', lambda: 10**400 // 1.0)
capture('mixed-floor-right-overflow', lambda: 1.0 // 10**400)
capture('mixed-mod-overflow', lambda: 10**400 % 3.0)
capture('mixed-mod-right-overflow', lambda: 1.0 % 10**400)
capture('mixed-pow-base-overflow', lambda: (10**400) ** 0.5)
capture('mixed-pow-exp-overflow', lambda: 2.0 ** (10**400))
capture('complex-real-overflow', lambda: complex(10**400))
capture('complex-imag-overflow', lambda: complex(1, 10**400))
capture('complex-add-overflow', lambda: (1 + 2j) + 10**400)
capture('math-copysign-overflow', lambda: math.copysign(10**400, -1))
capture('math-fabs-overflow', lambda: math.fabs(10**400))
capture('math-fmod-overflow', lambda: math.fmod(10**400, 3))
capture('math-fsum-overflow', lambda: math.fsum([10**400]))
capture('math-isfinite-overflow', lambda: math.isfinite(10**400))
capture('math-modf-overflow', lambda: math.modf(10**400))
capture('math-exp-overflow', lambda: math.exp(10**400))
capture('math-atan2-overflow', lambda: math.atan2(10**400, 1))
capture('math-hypot-overflow', lambda: math.hypot(10**400, 1))
capture('math-sin-overflow', lambda: math.sin(10**400))
capture('math-sqrt-overflow', lambda: math.sqrt(10**400))
capture('math-degrees-overflow', lambda: math.degrees(10**400))
capture('math-tanh-overflow', lambda: math.tanh(10**400))

class HugeIndex:
    def __index__(self):
        return 2**1024 - 1

capture('index-overflow', lambda: float(HugeIndex()))
`;
  const expected = runCPython(source);
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(source);
  assert.equal(result.stdout.trim(), expected);
});

test("integer-to-float conversion matches CPython's rounding corpus", async (t) => {
  // Deterministic vectors from CPython Lib/test/test_long.py, including its
  // exhaustive neighborhoods around the 53-bit precision transition and the
  // finite/overflow boundary at the top of binary64.
  const source = String.raw`
DBL_MANT_DIG = 53
DBL_MAX_EXP = 1024
int_dbl_max = (2**53 - 1) * 2**971
top_power = 2**DBL_MAX_EXP
halfway = (int_dbl_max + top_power) // 2
values = [
    0, 1, 2,
    2**53 - 3, 2**53 - 2, 2**53 - 1, 2**53, 2**53 + 2,
    2**54 - 4, 2**54 - 2, 2**54, 2**54 + 4,
    int_dbl_max - 1, int_dbl_max, int_dbl_max + 1,
    halfway - 1, halfway, halfway + 1,
    top_power - 1, top_power, top_power + 1,
    2 * top_power - 1, 2 * top_power, top_power * top_power,
]
for power in range(15):
    for offset in range(8):
        values.append(2**power * (2**53 + offset))
    for offset in range(16):
        values.append(2**power * (2**54 + offset))
for power in range(-4, 8):
    for offset in range(-128, 128):
        values.append(2**(power + 53) + offset)
for power in range(100):
    values.append(2**power * (2**53 + 1) + 1)
    values.append(2**power * (2**53 + 1))

for index, value in enumerate(values):
    for sign in (1, -1):
        try:
            answer = repr(float(sign * value))
        except Exception as error:
            answer = type(error).__name__ + ':' + str(error)
        print(index, sign, answer)
`;
  const expected = runCPython(source);
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(source);
  assert.equal(result.stdout.trim(), expected);
});

test("integer true division matches CPython's rounding corpus", async (t) => {
  // This follows Lib/test/test_long.py's correctly-rounded division families:
  // exponent boundaries, overflow thresholds, sticky bits, half-even ties,
  // subnormals, powers of ten, and deterministic large balanced operands.
  const source = String.raw`
DBL_MANT_DIG = 53
DBL_MAX_EXP = 1024
DBL_MIN_EXP = -1021
DBL_MIN_OVERFLOW = 2**DBL_MAX_EXP - 2**(DBL_MAX_EXP - DBL_MANT_DIG - 1)
cases = [
    (123, 0), (-456, 0), (0, 3), (0, -3), (0, 0),
    (9 * (10**16 - 1), 9),
    (295147931372582273023, 295147932265116303360),
    (671 * 12345 * 2**DBL_MAX_EXP, 12345),
    (12345, 345678 * 2**(DBL_MANT_DIG - DBL_MIN_EXP)),
]

for base in (0, DBL_MANT_DIG, DBL_MIN_EXP, DBL_MAX_EXP,
             DBL_MIN_EXP - DBL_MANT_DIG):
    for exponent in range(base - 8, base + 8):
        cases.append((75312 * 2**max(exponent, 0),
                      69187 * 2**max(-exponent, 0)))
        cases.append((69187 * 2**max(exponent, 0),
                      75312 * 2**max(-exponent, 0)))

for multiplier in (1, 7, 12345, 7**100, -1, -23):
    for offset in range(-5, 6):
        cases.append((multiplier * DBL_MIN_OVERFLOW + offset, multiplier))
        cases.append((multiplier * DBL_MIN_OVERFLOW + offset, -multiplier))

for bit in range(101):
    cases.append(((2**DBL_MANT_DIG + 1) * 12345 * 2**200 + 2**bit,
                  2**DBL_MANT_DIG * 12345))

for exponent in range(201):
    cases.append((10**(exponent + 1), 10**exponent))
    cases.append((10**exponent, 10**(exponent + 1)))

for multiplier in (1, 7, 12345, 7**100, -1, -23):
    for offset in range(-5, 6):
        cases.append((2**DBL_MANT_DIG * multiplier + offset, multiplier))

for numerator in range(-20, 20):
    cases.append((numerator, 2**1076))

state = 0x4D595DF4D0F33173
mask = 2**64 - 1
def next_word():
    global state
    state = (state * 6364136223846793005 + 1442695040888963407) & mask
    return state

def patterned(bit_count):
    value = 0
    words = (bit_count + 63) // 64
    for _ in range(words):
        value = (value << 64) | next_word()
    value &= (1 << bit_count) - 1
    return value | (1 << (bit_count - 1))

for index in range(200):
    bits = 64 + next_word() % 937
    numerator = patterned(bits)
    denominator = numerator + patterned(bits) % (numerator + 1)
    cases.extend(((numerator, denominator), (-numerator, denominator),
                  (numerator, -denominator), (-numerator, -denominator)))

for index, (numerator, denominator) in enumerate(cases):
    try:
        answer = repr(numerator / denominator)
    except Exception as error:
        answer = type(error).__name__ + ':' + str(error)
    print(index, answer)
`;
  const expected = runCPython(source);
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(source);
  assert.equal(result.stdout.trim(), expected);
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
    "try:",
    "    math.ldexp(1.0, 10**100)",
    "except OverflowError:",
    "    print('large ldexp overflows')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "5 5 5",
    "5 5",
    "True True",
    "42",
    "(0.5, 4) 8.0",
    "large ldexp overflows",
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
