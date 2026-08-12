"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const kernelSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "gf2_packed.py",
);
const sage = process.env.SAGE_EXECUTABLE || "/home/user/sagelite/sage";

function runSage(source, environment = {}) {
  const result = spawnSync(sagejs, ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const semanticWitness = String.raw`
from sagejs.native import is_compiled
from sagejs.kernels.polynomial.gf2_packed import (
    BitPolynomialView,
    gf2_packed_shift_left,
    gf2_packed_xor,
)
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B

a = B.from_coefficients([1, 0, 1, 1] + [0] * 62 + [1])
b = B.from_coefficients([1, 1])
maximum_word = B.from_words([2**64 - 1], 64)
boundaries = [B.from_words([2**62], 63), maximum_word, B.from_words([0, 1], 65)]
print(is_compiled(gf2_packed_xor), is_compiled(gf2_packed_shift_left))
print(type(a._words))
print([(value.bit_length, value.shift_left(1).shift_right(1) == value) for value in boundaries])
print(a.bit_length, a.degree, a.weight())
print(a.words)
print((a + b).format())
print(a.shift_left(65).shift_right(65) == a)
print(B.from_bytes(a.to_bytes()) == a)
print(B.zero().shift_left(2**64) == B.zero())
print(B.zero().shift_right(2**64) == B.zero())
print(maximum_word.weight(), maximum_word.shift_left(1).shift_right(1) == maximum_word)
print(maximum_word + maximum_word == B.zero())
bad = BitPolynomialView([1, 0], 1)
output = [91, 92]
output_length = [93]
print(gf2_packed_xor(output, output_length, bad, b._view()))
print(output, output_length)
`;

test("packed GF(2) storage is canonical under ordinary CPython", () => {
  const program = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.kernels.polynomial.gf2_packed import BitPolynomialView, gf2_packed_xor
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B

for length in [0, 1, 2, 63, 64, 65, 127, 128, 129, 1025]:
    coefficients = [((index * 17 + 3) % 7) % 2 for index in range(length)]
    if length:
        coefficients[-1] = 1
    value = B.from_coefficients(coefficients)
    assert value.bit_length == length
    assert value.degree == length - 1
    assert value.to_coefficients() == coefficients
    assert value.words == tuple(value.words)
    assert B.from_bytes(value.to_bytes()) == value
    assert hash(B.from_bytes(value.to_bytes())) == hash(value)
    for shift in [0, 1, 2, 63, 64, 65, 140, 2048]:
        left = value.shift_left(shift)
        assert left == B.from_coefficients([0] * shift + coefficients)
        assert left.shift_right(shift) == value
        assert value.shift_right(shift) == B.from_coefficients(coefficients[shift:])

left = B.from_coefficients([1, 0, 1, 1])
right = B.from_coefficients([1, 1])
maximum_word = B.from_words([2**64 - 1], 64)
assert (left + right).to_coefficients() == [0, 1, 1, 1]
assert (left ^ right) == left + right
assert maximum_word.weight() == 64
assert maximum_word.to_coefficients() == [1] * 64
assert maximum_word.shift_left(1).shift_right(1) == maximum_word
assert maximum_word + maximum_word == B.zero()
assert left.format() == "x^3 + x^2 + 1"
assert B.zero().format() == "0"
assert B.zero().shift_left(2**64) == B.zero()
assert B.zero().shift_right(2**64) == B.zero()
assert left.coefficient(1000) == 0
try:
    left.coefficient(-1)
except IndexError:
    pass
else:
    raise AssertionError("negative coefficient index was accepted")

for words, bit_length in [([0], 0), ([], 1), ([0], 1), ([3], 1), ([1, 0], 1)]:
    try:
        B.from_words(words, bit_length)
    except ValueError:
        pass
    else:
        raise AssertionError((words, bit_length))
for words in [[-1], [2**64]]:
    try:
        B.from_words(words, 1)
    except OverflowError:
        pass
    else:
        raise AssertionError(words)

encoded = left.to_bytes()
for malformed in [b"", encoded + b"x", encoded[:-1], encoded[:16] + b"\x03"]:
    try:
        B.from_bytes(malformed)
    except ValueError:
        pass
    else:
        raise AssertionError(malformed)

bad = BitPolynomialView([1, 0], 1)
output = [91, 92]
output_length = [93]
assert not gf2_packed_xor(output, output_length, bad, right._view())
assert output == [91, 92] and output_length == [93]
print("cpython-ok")
`;
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", program], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "cpython-ok");
});

test("packed GF(2) kernels compile source-transparently and match fallback", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-gf2-packed-core-"));
  try {
    const explanation = spawnSync(
      sagejs,
      ["native", "explain", kernelSource, "--function", "gf2_packed_xor"],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (explanation.error) throw explanation.error;
    assert.equal(explanation.status, 0, explanation.stderr || explanation.stdout);
    assert.match(explanation.stdout, /source-transparent: yes/);
    assert.match(explanation.stdout, /host-isolated core: yes/);
    assert.match(explanation.stdout, /0 callbacks inside core/);
    assert.match(explanation.stdout, /BitPolynomialView/);

    const compilation = spawnSync(
      sagejs,
      ["native", "compile", kernelSource, "--cache-root", cache],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (compilation.error) throw compilation.error;
    assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
    assert.match(compilation.stdout, /built 10 native functions/);

    const native = runSage(semanticWitness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    const dynamic = runSage(semanticWitness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_DISABLE: "1",
    });
    assert.match(native, /^True True/m);
    assert.match(dynamic, /^False False/m);
    assert.equal(
      native
        .replace(/^True True/m, "availability")
        .replace(/^<(?:class '[^']+'|function BigUint64Array)>$/m, "carrier"),
      dynamic
        .replace(/^False False/m, "availability")
        .replace(/^<class '[^']+'>$/m, "carrier"),
    );
    assert.match(native, /67 66 4/);
    assert.match(native, /BigUint64Array/);
    assert.equal((native.match(/BigUint64Array/g) || []).length, 1);
    assert.match(native, /x\^66 \+ x\^3 \+ x\^2 \+ x/);
    assert.match(native, /False\n\[91, 92\] \[93\]$/);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("selective packed kernels retain UInt64Buffer storage", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-gf2-packed-selective-"));
  try {
    const compilation = spawnSync(
      sagejs,
      [
        "native",
        "compile",
        kernelSource,
        "--functions",
        "gf2_packed_xor",
        "--cache-root",
        cache,
      ],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (compilation.error) throw compilation.error;
    assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
    assert.match(compilation.stdout, /built 3 native functions?/);

    const output = runSage(
      String.raw`
from sagejs.native import is_compiled
from sagejs.kernels.polynomial.gf2_packed import (
    gf2_packed_shift_left,
    gf2_packed_valid,
    gf2_packed_xor,
)
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B
a = B.from_coefficients([1, 0, 1, 1])
b = B.from_coefficients([1, 1])
added = a + b
cancelled = a + a
shifted = a.shift_left(1)
mixed = shifted + b
print(
    is_compiled(gf2_packed_xor),
    is_compiled(gf2_packed_valid),
    is_compiled(gf2_packed_shift_left),
)
print(
    type(a._words),
    type(added._words),
    type(cancelled._words),
    type(shifted._words),
    type(mixed._words),
)
print(added.format(), cancelled == B.zero(), mixed.format())
`,
      {
        SAGEJS_NATIVE_CACHE_DIR: cache,
      },
    );
    assert.match(output, /^True False False/m);
    assert.equal((output.match(/BigUint64Array/g) || []).length, 5);
    assert.match(output, /x\^3 \+ x\^2 \+ x True x\^4 \+ x\^3 \+ 1$/);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("bit-length-only artifacts retain persistent UInt64Buffer storage", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-gf2-packed-bit-length-"));
  try {
    const compilation = spawnSync(
      sagejs,
      [
        "native",
        "compile",
        kernelSource,
        "--functions",
        "gf2_packed_bit_length",
        "--cache-root",
        cache,
      ],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (compilation.error) throw compilation.error;
    assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
    assert.match(compilation.stdout, /built 1 native function/);

    const output = runSage(
      String.raw`
from sagejs.native import is_compiled
from sagejs.kernels.polynomial.gf2_packed import (
    gf2_packed_bit_length,
    gf2_packed_valid,
)
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B

value = B.from_coefficients([1, 0, 1] + [0] * 62 + [1])
carrier = value._words
print(is_compiled(gf2_packed_bit_length), is_compiled(gf2_packed_valid))
print(type(carrier), value._words is carrier)
print(gf2_packed_bit_length(value._view()))
print(gf2_packed_bit_length(value._view()))
print(type(value._words), value._words is carrier)
`,
      {
        SAGEJS_NATIVE_CACHE_DIR: cache,
      },
    );
    assert.match(output, /^True False/m);
    assert.equal((output.match(/BigUint64Array/g) || []).length, 2);
    assert.match(output, /BigUint64Array[^\n]* True\n66\n66\n/);
    assert.match(output, /BigUint64Array[^\n]* True$/);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test(
  "packed GF(2) semantics agree with SageMath",
  { skip: !existsSync(sage) },
  () => {
    const sageSource = String.raw`
from sage.all import *
R = PolynomialRing(GF(2), "x")
x = R.gen()
a = R([1, 0, 1, 1] + [0] * 62 + [1])
b = R([1, 1])
print([int(value) for value in a.list()])
print(a)
print([int(value) for value in (a + b).list()])
print([int(value) for value in (a * x^65).list()])
`;
    const sageResult = spawnSync(sage, ["-c", sageSource], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (sageResult.error) throw sageResult.error;
    assert.equal(sageResult.status, 0, sageResult.stderr || sageResult.stdout);

    const sagejsSource = String.raw`
from sagejs.polynomial_algorithms.gf2_packed_core import BitPolynomialStorage as B
a = B.from_coefficients([1, 0, 1, 1] + [0] * 62 + [1])
b = B.from_coefficients([1, 1])
print(a.to_coefficients())
print(a.format())
print((a + b).to_coefficients())
print(a.shift_left(65).to_coefficients())
`;
    const sageOutput = sageResult.stdout
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("//"))
      .join("\n")
      .trim();
    assert.equal(runSage(sagejsSource), sageOutput);
  },
);
