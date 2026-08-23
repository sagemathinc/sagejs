"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
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
  "packed_prime_field.py",
);
const matrixKernelSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "dense_prime_field.py",
);
const matrixFlintKernelSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "dense_prime_field_flint.py",
);

function runSage(source, environment) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n");
}

const witness = String.raw`
from sagejs.kernels.polynomial.packed_prime_field import packed_prime_field_polynomial_evaluate
from sagejs.native import is_compiled
import time

def oracle(coefficients, value, modulus):
    answer = 0
    for coefficient in reversed(coefficients):
        answer = (answer * value + coefficient) % modulus
    return answer

def check(parent, coefficients, value, field_element=False):
    modulus = int(parent.characteristic())
    polynomial = PolynomialRing(parent, "x")(coefficients)
    argument = parent(value) if field_element else value
    expected = oracle(
        [int(parent(coefficient).lift()) for coefficient in coefficients],
        int(parent(value).lift()),
        modulus,
    )
    answer = polynomial(argument)
    assert answer.parent() is parent
    assert int(answer.lift()) == expected

F = GF(97)
check(F, [], F(29), True)
zero_value = PolynomialRing(F, "z")(0)(F(29))
assert zero_value * F(2) == F(0)
integer_mod_zero = Zmod(12)(1)._new_reduced(0)
assert integer_mod_zero + Zmod(12)(2) == Zmod(12)(2)
assert integer_mod_zero * Zmod(12)(7) == Zmod(12)(0)
check(F, [31], -10**100 - 7)
check(F, [1, 2, 3, 96, 0, 18], F(73), True)
check(F, [1, 2, 3, 96, 0, 18], -10**100 - 7)
check(F, [1, 2, 3, 96, 0, 18], 10**100 + 7)

seed = 0x12345678
for prime in [2, 3, 97, 65537]:
    field = GF(prime)
    for trial in range(20):
        coefficients = []
        for _index in range((trial * 17) % 83):
            seed = (1664525 * seed + 1013904223) % (2**32)
            coefficients.append(seed % prime)
        seed = (1664525 * seed + 1013904223) % (2**32)
        raw_value = seed - 2**31
        check(field, coefficients, raw_value)
        check(field, coefficients, field(raw_value), True)

large_prime = 4294967291
L = GF(large_prime)
check(L, [large_prime - 1, 3, 17, large_prime - 2], L(4000000000), True)

f = PolynomialRing(F, "x")([1, 2, 3])
for invalid in [GF(101)(7), QQ(1) / QQ(2), 1.5, "7"]:
    try:
        f(invalid)
    except TypeError:
        pass
    else:
        raise AssertionError("noncanonical scalar unexpectedly used packed evaluation")

M = matrix(F, 2, 2, [1, 2, 3, 4])
assert f(M) == M * M * 3 + M * 2 + M.parent().one()
E = GF(5**2, "a")
S = PolynomialRing(E, "t")
t = S.gen()
assert (t**2 + t + 1)(E.gen()) == E.gen()**2 + E.gen() + 1
Z = PolynomialRing(ZZ, "z")([1, 2, 3])
assert Z(10) == 321

P = GF(65537)
H = PolynomialRing(P, "u")([index % 65537 for index in range(20000)])
target = P(12345)
expected = oracle([index % 65537 for index in range(20000)], 12345, 65537)
for _repeat in range(3):
    assert int(H(target).lift()) == expected
samples = []
for _repeat in range(7):
    started = time.perf_counter()
    answer = H(target)
    samples.append(1000 * (time.perf_counter() - started))
samples.sort()
print(is_compiled(packed_prime_field_polynomial_evaluate))
print(int(answer.lift()))
print(round(samples[len(samples) // 2], 6))
`;

test("packed prime polynomial scalar evaluation is native and source-transparent", () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-evaluate-"));
  try {
    const explanation = spawnSync(
      process.execPath,
      [
        sagejs,
        "native",
        "explain",
        kernelSource,
        "--function",
        "packed_prime_field_polynomial_evaluate",
      ],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (explanation.error) throw explanation.error;
    assert.equal(explanation.status, 0, explanation.stderr || explanation.stdout);
    assert.match(explanation.stdout, /kernel: prime-field-source/);
    assert.match(explanation.stdout, /host-isolated core: yes/);
    assert.match(explanation.stdout, /0 callbacks inside core/);

    for (const source of [
      kernelSource,
      matrixKernelSource,
      matrixFlintKernelSource,
    ]) {
      const compilation = spawnSync(
        process.execPath,
        [sagejs, "native", "compile", source, "--cache-root", cache],
        { cwd: root, encoding: "utf8", timeout: 60_000 },
      );
      if (compilation.error) throw compilation.error;
      assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);
    }

    const native = runSage(witness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    const dynamic = runSage(witness, {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_DISABLE: "1",
    });
    assert.equal(native[0], "True");
    assert.equal(dynamic[0], "False");
    assert.equal(native[1], dynamic[1]);
    assert.ok(Number(native[2]) < 8, `native evaluation took ${native[2]} ms`);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("the modular Horner source has an ordinary CPython fallback", () => {
  const program = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.kernels.polynomial.packed_prime_field import packed_prime_field_polynomial_evaluate",
    "assert packed_prime_field_polynomial_evaluate([], 7, 97) == 0",
    "assert packed_prime_field_polynomial_evaluate([31], 7, 97) == 31",
    "assert packed_prime_field_polynomial_evaluate([1, 2, 3], 5, 97) == 86",
    "print('cpython-ok')",
    "",
  ].join("\n");
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", program], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "cpython-ok");
});
