"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateC } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const nativeApi = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
(async () => {
const sourcePath = join(root, "bench", "native-kernel-input.sage");
const mpmathSourcePath = join(root, "bench", "native-mpmath-kernel.sage");
const integerSourcePath = join(root, "bench", "native_integer_kernel.py");
const integerAlgorithmsPath = join(
  root,
  "bench",
  "native_integer_algorithms.py",
);
const nativeNumberTheoryPath = join(
  root,
  "bench",
  "cowasm",
  "src",
  "native_number_theory.py",
);
const completeNumberTheoryPath = join(
  root,
  "bench",
  "cowasm",
  "src",
  "nt.py",
);
const primeFieldMatrixPath = join(
  root,
  "bench",
  "native_prime_field_matrix.py",
);
const source = readFileSync(sourcePath, "utf8");
const ir = await lowerSource(source, sourcePath);
const complexFunction = ir.functions.find(
  (fn) => fn.name === "multiply_loop",
);
const realFunction = ir.functions.find(
  (fn) => fn.name === "real_multiply_loop",
);
const generatedC = generateC(ir);
const mpmathSource = readFileSync(mpmathSourcePath, "utf8");
const mpmathIr = await lowerSource(mpmathSource, mpmathSourcePath);
const harmonicFunction = mpmathIr.functions[0];
const harmonicC = generateC(mpmathIr);
const integerSource = readFileSync(integerSourcePath, "utf8");
const integerIr = await lowerSource(integerSource, integerSourcePath);
const integerFunction = integerIr.functions[0];
const integerC = generateC(integerIr);
const integerAlgorithmsSource = readFileSync(integerAlgorithmsPath, "utf8");
const integerAlgorithmsIr = await lowerSource(
  integerAlgorithmsSource,
  integerAlgorithmsPath,
);
const integerAlgorithmsC = generateC(integerAlgorithmsIr);
const nativeNumberTheoryIr = await lowerSource(
  readFileSync(nativeNumberTheoryPath, "utf8"),
  nativeNumberTheoryPath,
);
const completeNumberTheoryIr = await lowerSource(
  readFileSync(completeNumberTheoryPath, "utf8"),
  completeNumberTheoryPath,
);
const completeNumberTheoryC = generateC(completeNumberTheoryIr);
const primeFieldMatrixIr = await lowerSource(
  readFileSync(primeFieldMatrixPath, "utf8"),
  primeFieldMatrixPath,
);
const primeFieldMatrixC = generateC(primeFieldMatrixIr);

assert.equal(ir.version, 8);
assert.equal(complexFunction.params[0].type, "ComplexField");
assert.equal(complexFunction.params[1].type, "uint64");
assert.equal(complexFunction.returnType, "ComplexNumber");
assert.equal(complexFunction.locals[0].storage, "return");
assert.deepEqual(complexFunction.body[2].body[0], {
  kind: "complex.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.equal(realFunction.params[0].type, "RealField");
assert.equal(realFunction.returnType, "RealNumber");
assert.equal(realFunction.locals[0].type, "RealNumber");
assert.deepEqual(realFunction.body[2].body[0], {
  kind: "real.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.match(
  generatedC,
  /mpc_mul\(sagejs_value->value, sagejs_value->value, sagejs_step/,
);
assert.match(
  generatedC,
  /mpfr_mul\(sagejs_value->value, sagejs_value->value, sagejs_step/,
);
assert.equal(harmonicFunction.name, "harmonic_cubic_loop");
assert.equal(harmonicFunction.decorated, true);
assert.deepEqual(
  harmonicFunction.body.find((item) => item.kind === "loop.range").body
    .map((item) => item.kind),
  [
    "real.from_uint64",
    "real.pow_uint",
    "real.binary",
    "real.binary",
  ],
);
assert.equal(
  harmonicFunction.body.filter((item) => item.kind === "real.constant")
    .length,
  2,
);
assert.deepEqual(completeNumberTheoryIr.callGraph, {
  gcd: [],
  xgcd: [],
  inverse_mod: ["xgcd"],
  trial_division: [],
  is_prime: ["trial_division"],
  pi: ["is_prime"],
});
assert.deepEqual(
  primeFieldMatrixIr.functions.map((fn) => [
    fn.name,
    fn.kernelKind,
    fn.operation,
    fn.params.map((param) => param.type),
    fn.returnType,
  ]),
  [
    [
      "prime_field_rank",
      "prime-field-matrix",
      "rank",
      ["PrimeFieldMatrix"],
      "uint64",
    ],
    [
      "prime_field_determinant",
      "prime-field-matrix",
      "determinant",
      ["PrimeFieldMatrix"],
      "PrimeFieldElement",
    ],
    [
      "prime_field_echelon",
      "prime-field-matrix",
      "echelon",
      ["PrimeFieldMatrix"],
      "PrimeFieldMatrix",
    ],
    [
      "prime_field_solve",
      "prime-field-matrix",
      "solve",
      ["PrimeFieldMatrix", "PrimeFieldMatrix"],
      "PrimeFieldMatrix",
    ],
  ],
);
assert.deepEqual(
  primeFieldMatrixIr.functions[0].arithmetic.representations,
  ["u32", "u64"],
);
assert.match(primeFieldMatrixC, /sagejs_prime_forward_eliminate/);
assert.match(primeFieldMatrixC, /nmod_mul\(left, right/);
assert.match(primeFieldMatrixC, /sagejs_native_wrap_prime_matrix/);
assert.equal(
  completeNumberTheoryIr.functions.find((fn) => fn.name === "xgcd")
    .returnType,
  "Tuple[Integer,Integer,Integer]",
);
assert.deepEqual(
  completeNumberTheoryIr.functions.find((fn) => fn.name === "trial_division")
    .params.map((param) => param.default),
  [undefined, "0", "2"],
);
assert.equal(
  completeNumberTheoryIr.functions.find((fn) => fn.name === "pi")
    .params[0].default,
  "100000",
);
assert.match(completeNumberTheoryC, /mpz_fdiv_qr\(/);
assert.match(completeNumberTheoryC, /static int tagged_pi\(/);
assert.match(completeNumberTheoryC, /sagejs_tagged_int/);
assert.match(completeNumberTheoryC, /sagejs_tagged_make_big\(/);
assert.match(completeNumberTheoryC, /sagejs_word_mul_int64\(/);
assert.match(completeNumberTheoryC, /SAGEJS_WORD_PROMOTE/);
assert.match(completeNumberTheoryC, /sagejs_tagged_promote:/);
assert.match(completeNumberTheoryC, /compiled_pi_gmp/);
assert.ok(
  completeNumberTheoryIr.functions.every(
    (fn) => fn.analysis.taggedInteger.eligible &&
      fn.analysis.taggedInteger.publicReplay === "never",
  ),
);
assert.ok(
  completeNumberTheoryIr.functions.every(
    (fn) => fn.analysis.effects.externalWrites.length === 0,
  ),
);
assert.match(
  completeNumberTheoryC,
  /native_inverse_mod[\s\S]*native_xgcd\(env/,
);
assert.match(
  completeNumberTheoryC,
  /native_pi[\s\S]*native_is_prime\(env/,
);
assert.match(
  completeNumberTheoryC,
  /tagged_pi[\s\S]*tagged_is_prime\(env/,
);
assert.match(
  harmonicC,
  /mpfr_set_uj\(sagejs_sagejs_native_tmp_3, sagejs_denominator/,
);
assert.match(
  harmonicC,
  /mpfr_pow_ui\(sagejs_sagejs_native_tmp_2, sagejs_sagejs_native_tmp_3, 3/,
);
assert.match(
  harmonicC,
  /sagejs_denominator - UINT64_C\(1\).*sagejs_terms/,
);
assert.equal(integerFunction.name, "integer_quadratic_sum");
assert.equal(integerFunction.returnType, "Integer");
assert.deepEqual(
  new Set(
    integerFunction.body.find((item) => item.kind === "loop.range").body
      .map((item) => item.kind),
  ),
  new Set(["integer.from_uint64", "integer.binary"]),
);
assert.match(integerC, /mpz_mul\(/);
assert.match(integerC, /sagejs_tagged_mul\(/);
assert.match(integerC, /napi_create_bigint_words\(/);
assert.deepEqual(integerAlgorithmsIr.callGraph.native_lcm, ["native_gcd"]);
assert.deepEqual(integerAlgorithmsIr.callGraph.native_coprime, ["native_gcd"]);
assert.deepEqual(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_lcm")
    .analysis.storage.borrowedParameters,
  ["a", "b"],
);
assert.equal(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_lcm")
    .analysis.storage.scratchSlots,
  2,
);
assert.deepEqual(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_identity")
    .analysis.storage,
  {
    borrowedParameters: ["value"],
    mutableParameters: [],
    scratchSlots: 0,
    slots: {},
    escapedValues: [],
  },
);
assert.equal(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_identity")
    .analysis.backend.kind,
  "bigint",
);
assert.deepEqual(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_gcd")
    .analysis.storage.mutableParameters,
  ["a", "b"],
);
assert.deepEqual(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_lcm")
    .analysis.effects,
  {
    pure: true,
    deterministic: true,
    localWrites: 12,
    externalWrites: [],
    calls: ["native_gcd"],
    mayRaise: ["ZeroDivisionError"],
    replaySafe: true,
  },
);
assert.equal(
  integerAlgorithmsIr.functions.find((fn) => fn.name === "native_lcm")
    .analysis.taggedInteger.promotion,
  "in-place-at-current-instruction",
);
assert.match(
  integerAlgorithmsC,
  /native_native_lcm[\s\S]*native_native_gcd\(env/,
);
assert.match(integerAlgorithmsC, /mpz_t sagejs_scratch_0/);
assert.doesNotMatch(integerAlgorithmsC, /mpz_t sagejs_a;/);
assert.match(integerAlgorithmsC, /mpz_fdiv_q\(/);
assert.match(integerAlgorithmsC, /mpz_fdiv_r\(/);
assert.equal(
  nativeNumberTheoryIr.functions.find((fn) => fn.name === "native_rfib")
    .analysis.storage.scratchSlots,
  3,
);
assert.equal(
  nativeNumberTheoryIr.functions.find((fn) => fn.name === "native_rfib")
    .analysis.backend.kind,
  "tagged",
);
assert.equal(
  nativeNumberTheoryIr.functions.find((fn) => fn.name === "native_bench_gcd")
    .analysis.backend.kind,
  "tagged",
);
assert.equal(
  nativeNumberTheoryIr.functions.find(
    (fn) => fn.name === "native_bench_large_gcd",
  ).analysis.backend.kind,
  "gmp",
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: ComplexField, n: uint64) -> ComplexNumber:\n" +
        "    return field(\"1\", \"0\")\n",
      "invalid.sage",
    ),
  /native function must return a ComplexNumber local/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field, n: uint64) -> ComplexNumber:\n" +
        "    return field(\"1\", \"0\")\n",
      "missing-annotation.sage",
    ),
  /native argument f\.field annotation is missing/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: RealField, n: uint64) -> RealNumber:\n" +
        "    x = field(1)\n" +
        "    for k in range(2, n + 1):\n" +
        "        x += field(k)\n" +
        "    return x\n",
      "invalid-range.sage",
    ),
  /two-argument loop must use range\(k, n \+ k\)/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: RealField, n: uint64) -> RealNumber:\n" +
        "    x = field(1)\n" +
        "    y = x ** 65\n" +
        "    return y\n",
      "invalid-power.sage",
    ),
  /nonnegative integer exponent at most 64/,
);
await assert.rejects(
  () =>
    lowerSource(
      "from sagejs.native import native\n" +
        "@native\n" +
        "def f(n: int) -> int:\n" +
        "    if n:\n" +
        "        value = 1\n" +
        "    return value\n",
      "uninitialized.py",
    ),
  /uninitialized\.py:\d+:\d+: f: native value value may be uninitialized/,
);
await assert.rejects(
  () =>
    lowerSource(
      "from sagejs.native import native\n" +
        "@native\n" +
        "def f(a: int, b: int) -> bool:\n" +
        "    return a or b\n",
      "non-boolean-short-circuit.py",
    ),
  /short-circuit operands must be bool, got Integer/,
);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-kernel-"));

function runSage(script, env = {}) {
  const scriptPath = join(temporary, "integration.sage");
  writeFileSync(scriptPath, script);
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), scriptPath],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  assert.equal(result.status, 0);
  return result.stdout.trim().split("\n");
}

try {
  const options = {
    sourcePath,
    cacheRoot: join(temporary, "cache"),
  };
  const first = await nativeApi.compile(options);
  const second = await compileKernel(options);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(first.modulePath, second.modulePath);

  const mpmathKernel = await compileKernel({
    sourcePath: mpmathSourcePath,
    cacheRoot: join(temporary, "mpmath-cache"),
  });
  const primeFieldKernel = await compileKernel({
    sourcePath: primeFieldMatrixPath,
    cacheRoot: join(temporary, "prime-field-cache"),
  });
  const primeFieldAddon = require(primeFieldKernel.addonPath);
  const flint = require("../packages/flint");
  assert.ok(
    statSync(primeFieldKernel.addonPath).size < 1024 * 1024,
    "the prime-field addon must not accidentally statically link FLINT",
  );
  const smallPrimeMatrix = flint.nmodMatrix(
    2,
    2,
    [1n, 2n, 3n, 4n],
    5n,
  );
  const smallPrimeRight = flint.nmodMatrix(2, 1, [1n, 0n], 5n);
  assert.equal(primeFieldAddon.prime_field_rank(smallPrimeMatrix), 2);
  assert.equal(
    primeFieldAddon.prime_field_determinant(smallPrimeMatrix),
    3n,
  );
  assert.equal(
    flint.matrixEqual(
      primeFieldAddon.prime_field_echelon(smallPrimeMatrix),
      flint.matrixRref(smallPrimeMatrix),
    ),
    true,
  );
  const emptyPrimeMatrix = flint.nmodMatrix(0, 0, [], 5n);
  assert.equal(primeFieldAddon.prime_field_rank(emptyPrimeMatrix), 0);
  assert.equal(
    primeFieldAddon.prime_field_determinant(emptyPrimeMatrix),
    1n,
  );
  assert.equal(
    flint.matrixEqual(
      primeFieldAddon.prime_field_echelon(emptyPrimeMatrix),
      emptyPrimeMatrix,
    ),
    true,
  );
  const emptyPrimeRight = flint.nmodMatrix(0, 2, [], 5n);
  assert.equal(
    flint.matrixEqual(
      primeFieldAddon.prime_field_solve(
        emptyPrimeMatrix,
        emptyPrimeRight,
      ),
      emptyPrimeRight,
    ),
    true,
  );
  assert.equal(
    flint.matrixEqual(
      flint.matrixMul(
        smallPrimeMatrix,
        primeFieldAddon.prime_field_solve(
          smallPrimeMatrix,
          smallPrimeRight,
        ),
      ),
      smallPrimeRight,
    ),
    true,
  );
  const primeModuli = [
    2n,
    3n,
    101n,
    65521n,
    2147483647n,
    2305843009213693951n,
  ];
  for (let sample = 0; sample < 1000; sample += 1) {
    const rows = 1 + (sample % 8);
    const columns = 1 + ((sample * 5 + 3) % 8);
    const modulus = primeModuli[sample % primeModuli.length];
    const seed1 = BigInt(20260808 + sample);
    const seed2 = BigInt(314159 + sample * 17);
    const matrix = flint.nmodMatrixRandom(
      rows,
      columns,
      modulus,
      seed1,
      seed2,
    );
    const unchanged = flint.nmodMatrixRandom(
      rows,
      columns,
      modulus,
      seed1,
      seed2,
    );
    assert.equal(
      primeFieldAddon.prime_field_rank(matrix),
      flint.matrixRank(matrix),
    );
    assert.equal(
      flint.matrixEqual(
        primeFieldAddon.prime_field_echelon(matrix),
        flint.matrixRref(matrix),
      ),
      true,
    );
    if (rows === columns) {
      assert.equal(
        primeFieldAddon.prime_field_determinant(matrix),
        flint.matrixDet(matrix),
      );
    }
    assert.equal(flint.matrixEqual(matrix, unchanged), true);
  }
  let solved = 0;
  for (let sample = 0; solved < 200; sample += 1) {
    const size = 1 + (sample % 7);
    const rightColumns = 1 + (sample % 3);
    const modulus = primeModuli[sample % primeModuli.length];
    const left = flint.nmodMatrixRandom(
      size,
      size,
      modulus,
      BigInt(271828 + sample),
      BigInt(161803 + sample * 11),
    );
    if (flint.matrixDet(left) === 0n) continue;
    const right = flint.nmodMatrixRandom(
      size,
      rightColumns,
      modulus,
      BigInt(141421 + sample),
      BigInt(173205 + sample * 13),
    );
    const answer = primeFieldAddon.prime_field_solve(left, right);
    assert.equal(flint.matrixEqual(flint.matrixMul(left, answer), right), true);
    assert.equal(
      flint.matrixEqual(answer, flint.matrixSolve(left, right)),
      true,
    );
    solved += 1;
  }
  assert.throws(
    () => primeFieldAddon.prime_field_rank(
      flint.zmodMatrix(1, 1, [1n], 4n),
    ),
    /prime field/,
  );
  assert.throws(
    () => primeFieldAddon.prime_field_determinant(
      flint.nmodMatrix(1, 2, [1n, 2n], 5n),
    ),
    /square matrix/,
  );
  assert.throws(
    () => primeFieldAddon.prime_field_solve(
      smallPrimeMatrix,
      flint.nmodMatrix(2, 1, [1n, 0n], 7n),
    ),
    /base rings differ/,
  );
  assert.throws(
    () => primeFieldAddon.prime_field_solve(
      flint.nmodMatrix(2, 2, [1n, 2n, 2n, 4n], 5n),
      smallPrimeRight,
    ),
    /singular/,
  );
  const primeFieldScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_prime_field_matrix import (
    prime_field_determinant,
    prime_field_echelon,
    prime_field_rank,
    prime_field_solve,
)
from sagejs.native import is_compiled

A = matrix(GF(5), 2, 2, [1, 2, 3, 4])
B = matrix(GF(5), 2, 1, [1, 0])
C = matrix(GF(2305843009213693951), 1, 1, [1])
X = prime_field_solve(A, B)
print(prime_field_rank(A))
print(prime_field_determinant(A))
print(prime_field_echelon(A) == A.echelon_form())
print(A * X == B)
print(is_compiled(prime_field_rank))
print(prime_field_rank.backendFor(A) if is_compiled(prime_field_rank) else 'fallback')
print(prime_field_rank.backendFor(C) if is_compiled(prime_field_rank) else 'fallback')
try:
    prime_field_rank(A, A)
except Exception as error:
    print(isinstance(error, TypeError))
try:
    prime_field_solve(A, matrix(GF(7), 2, 1, [1, 0]))
except Exception as error:
    print(isinstance(error, ValueError))
`;
  const primeFieldEnvironment = {
    SAGEJS_NATIVE_CACHE_DIR: join(temporary, "prime-field-cache"),
  };
  assert.deepEqual(
    runSage(primeFieldScript, primeFieldEnvironment),
    [
      "2", "3", "True", "True", "True", "u32", "u64",
      "True", "True",
    ],
  );
  assert.deepEqual(
    runSage(primeFieldScript, {
      ...primeFieldEnvironment,
      SAGEJS_NATIVE_AUTOLOAD: "0",
    }),
    [
      "2", "3", "True", "True", "False", "fallback", "fallback",
      "True", "True",
    ],
  );
  const integerCache = join(temporary, "integer-cache");
  const integerKernel = await nativeApi.compile({
    sourcePath: integerSourcePath,
    cacheRoot: integerCache,
  });
  const integerModule = require(integerKernel.modulePath);
  assert.equal(integerModule.integer_quadratic_sum(10), -275n);
  assert.equal(integerModule.integer_quadratic_sum.backendFor(10), "tagged");
  assert.equal(integerModule.integer_quadratic_sum.backendPolicy.kind, "tagged");
  assert.equal(
    integerModule.integer_quadratic_sum.taggedInteger.promotion,
    "in-place-at-current-instruction",
  );
  assert.equal(
    integerModule.integer_quadratic_sum.taggedInteger.publicReplay,
    "never",
  );
  assert.equal(integerModule.integer_quadratic_sum.effects.pure, true);
  assert.equal(
    integerModule.integer_quadratic_sum(1_000_000),
    -333332833332500000n,
  );
  assert.equal(
    integerModule.integer_quadratic_sum.javascript(10),
    -275n,
  );
  const promotedTerms = 4_000_000n;
  const promotedExpected = promotedTerms -
    ((promotedTerms - 1n) * promotedTerms * (2n * promotedTerms - 1n)) / 6n;
  assert.equal(
    integerModule.integer_quadratic_sum(Number(promotedTerms)),
    promotedExpected,
  );
  assert.equal(
    integerModule.integer_quadratic_sum.gmp(Number(promotedTerms)),
    promotedExpected,
  );
  assert.equal(
    integerModule.integer_quadratic_sum.tagged(Number(promotedTerms)),
    promotedExpected,
  );
  const adaptiveWrapperStart = integerC.indexOf(
    "static napi_value compiled_integer_quadratic_sum(",
  );
  const forcedWrapperStart = integerC.indexOf(
    "static napi_value compiled_integer_quadratic_sum_gmp(",
  );
  const adaptiveWrapper = integerC.slice(
    adaptiveWrapperStart,
    forcedWrapperStart,
  );
  assert.match(adaptiveWrapper, /tagged_integer_quadratic_sum\(/);
  assert.doesNotMatch(adaptiveWrapper, /native_integer_quadratic_sum\(/);
  const integerAlgorithmsCache = join(
    temporary,
    "integer-algorithms-cache",
  );
  const integerAlgorithms = await nativeApi.compile({
    sourcePath: integerAlgorithmsPath,
    cacheRoot: integerAlgorithmsCache,
  });
  assert.match(
    readFileSync(integerAlgorithms.modulePath, "utf8"),
    /sagejs_native_backend !== "bigint"/,
  );
  const integerAlgorithmsModule = require(integerAlgorithms.modulePath);
  const integerAlgorithmsAddon = require(integerAlgorithms.addonPath);
  assert.equal(
    integerAlgorithmsModule.native_identity(2n ** 200n),
    2n ** 200n,
  );
  assert.equal(
    integerAlgorithmsModule.native_identity(-(2n ** 200n)),
    -(2n ** 200n),
  );
  assert.equal(
    integerAlgorithmsModule.native_identity.backendFor(2n ** 2000n),
    "bigint",
  );
  assert.equal(
    integerAlgorithmsModule.native_gcd.backendFor(92250, 922350),
    "bigint",
  );
  assert.equal(
    integerAlgorithmsModule.native_gcd.backendFor(
      2n ** 100n - 1n,
      2n ** 50n - 1n,
    ),
    "tagged",
  );
  assert.equal(
    integerAlgorithmsModule.native_gcd.backendPolicy.minimumBits,
    64,
  );
  for (const [name, args, expected] of [
    ["native_gcd", [92250, 922350], 150n],
    ["native_gcd", [-84, 30], 6n],
    ["native_lcm", [-21, 6], 42n],
    ["native_powmod", [7n, 560n, 561n], 1n],
    ["native_coprime", [35, 64], true],
    ["native_floordiv", [-7, 3], -3n],
    ["native_floordiv", [7, -3], -3n],
    ["native_mod", [-7, 3], 2n],
    ["native_mod", [7, -3], -2n],
    ["native_zero_or_divides", [0, 19], true],
    ["native_zero_or_divides", [7, 21], true],
  ]) {
    assert.equal(integerAlgorithmsModule[name](...args), expected);
    assert.equal(integerAlgorithmsModule[name].javascript(...args), expected);
  }
  assert.equal(
    integerAlgorithmsModule.native_gcd(2n ** 100n - 1n, 2n ** 50n - 1n),
    2n ** 50n - 1n,
  );
  assert.equal(
    integerAlgorithmsAddon.native_gcd(-(2n ** 63n), 0n),
    2n ** 63n,
  );
  assert.equal(
    integerAlgorithmsAddon.native_floordiv(-(2n ** 63n), -1n),
    2n ** 63n,
  );
  assert.equal(
    integerAlgorithmsAddon.native_lcm(3_037_000_500n, 3_037_000_501n),
    3_037_000_500n * 3_037_000_501n,
  );
  const int64Min = -(2n ** 63n);
  const int64Max = 2n ** 63n - 1n;
  for (const [name, args, expected] of [
    ["native_add", [int64Max, 1n], int64Max + 1n],
    ["native_add", [int64Min, -1n], int64Min - 1n],
    ["native_sub", [int64Min, 1n], int64Min - 1n],
    ["native_sub", [int64Max, -1n], int64Max + 1n],
    ["native_mul", [int64Max, 2n], int64Max * 2n],
    ["native_mul", [int64Min, -1n], -int64Min],
    ["native_neg", [int64Min], -int64Min],
    ["native_abs", [int64Min], -int64Min],
    ["native_square", [3_037_000_500n], 3_037_000_500n ** 2n],
  ]) {
    assert.equal(integerAlgorithmsAddon[name](...args), expected);
  }
  assert.deepEqual(
    integerAlgorithmsAddon.native_divmod(int64Min, -1n),
    [2n ** 63n, 0n],
  );
  assert.deepEqual(
    integerAlgorithmsAddon.native_divmod(-7n, 3n),
    [-3n, 2n],
  );
  const boundaryWords = [
    int64Min, int64Min + 1n, -3_037_000_500n, -2n, -1n, 0n, 1n, 2n,
    3_037_000_499n, 3_037_000_500n, int64Max - 1n, int64Max,
  ];
  const taggedBoundaries = [
    ...boundaryWords,
    int64Min - 1n,
    int64Max + 1n,
    -(2n ** 100n),
    2n ** 100n,
    2n ** 200n + 17n,
  ];
  const pythonFloorDiv = (left, right) => {
    let quotient = left / right;
    const remainder = left % right;
    if (remainder !== 0n && (remainder < 0n) !== (right < 0n)) quotient -= 1n;
    return quotient;
  };
  for (const left of boundaryWords) {
    assert.equal(
      integerAlgorithmsAddon.native_neg(left),
      -left,
    );
    assert.equal(
      integerAlgorithmsAddon.native_abs(left),
      left < 0n ? -left : left,
    );
    assert.equal(
      integerAlgorithmsAddon.native_square(left),
      left * left,
    );
    for (const right of boundaryWords) {
      assert.equal(
        integerAlgorithmsAddon.native_add(left, right),
        left + right,
      );
      assert.equal(
        integerAlgorithmsAddon.native_sub(left, right),
        left - right,
      );
      assert.equal(
        integerAlgorithmsAddon.native_mul(left, right),
        left * right,
      );
      if (right === 0n) continue;
      const quotient = pythonFloorDiv(left, right);
      const remainder = left - quotient * right;
      assert.equal(
        integerAlgorithmsAddon.native_floordiv(left, right),
        quotient,
      );
      assert.equal(
        integerAlgorithmsAddon.native_mod(left, right),
        remainder,
      );
      assert.deepEqual(
        integerAlgorithmsAddon.native_divmod(left, right),
        [quotient, remainder],
      );
    }
  }
  for (const left of taggedBoundaries) {
    assert.equal(integerAlgorithmsAddon.native_neg(left), -left);
    assert.equal(
      integerAlgorithmsAddon.native_abs(left),
      left < 0n ? -left : left,
    );
    assert.equal(integerAlgorithmsAddon.native_square(left), left * left);
    for (const right of taggedBoundaries) {
      assert.equal(integerAlgorithmsAddon.native_add(left, right), left + right);
      assert.equal(integerAlgorithmsAddon.native_sub(left, right), left - right);
      assert.equal(integerAlgorithmsAddon.native_mul(left, right), left * right);
      if (right === 0n) continue;
      const quotient = pythonFloorDiv(left, right);
      const remainder = left - quotient * right;
      assert.equal(
        integerAlgorithmsAddon.native_floordiv(left, right),
        quotient,
      );
      assert.equal(integerAlgorithmsAddon.native_mod(left, right), remainder);
      assert.deepEqual(
        integerAlgorithmsAddon.native_divmod(left, right),
        [quotient, remainder],
      );
    }
  }
  assert.equal(
    integerAlgorithmsModule.native_call_square(int64Max),
    int64Max * int64Max + 1n,
  );
  assert.equal(
    integerAlgorithmsModule.native_call_square.tagged(2n ** 100n),
    2n ** 200n + 1n,
  );
  assert.equal(
    integerAlgorithmsModule.native_gcd.gmp(92250, 922350),
    150n,
  );
  assert.equal(
    integerAlgorithmsModule.native_gcd.bigint(92250, 922350),
    150n,
  );
  assert.throws(
    () => integerAlgorithmsModule.native_floordiv(1, 0),
    /division or modulo by zero/,
  );
  const nativeNumberTheory = await nativeApi.compile({
    sourcePath: nativeNumberTheoryPath,
    cacheRoot: join(temporary, "native-number-theory-cache"),
  });
  const nativeNumberTheoryModule = require(nativeNumberTheory.modulePath);
  assert.equal(
    nativeNumberTheoryModule.native_bench_gcd.backendFor(100),
    "tagged",
  );
  assert.equal(
    nativeNumberTheoryModule.native_bench_large_gcd.backendFor(2),
    "gmp",
  );
  assert.equal(
    nativeNumberTheory.ir.functions.find(
      (fn) => fn.name === "native_bench_large_gcd",
    ).analysis.taggedInteger.eligible,
    true,
  );
  assert.equal(
    nativeNumberTheoryModule.native_rfib.backendFor(10),
    "tagged",
  );
  assert.equal(nativeNumberTheoryModule.native_rfib(10), 89n);
  assert.equal(
    nativeNumberTheoryModule.native_bench_gcd(100),
    nativeNumberTheoryModule.native_bench_gcd.gmp(100),
  );
  assert.equal(nativeNumberTheoryModule.native_bench_large_gcd(2), 2n);
  assert.throws(
    () => integerAlgorithmsModule.native_mod.javascript(1, 0),
    /division or modulo by zero/,
  );
  const completeNumberTheory = await nativeApi.compile({
    sourcePath: completeNumberTheoryPath,
    cacheRoot: join(temporary, "complete-number-theory-cache"),
  });
  const completeNumberTheoryModule = require(completeNumberTheory.modulePath);
  const completeNumberTheoryAddon = require(completeNumberTheory.addonPath);
  assert.deepEqual(completeNumberTheory.ir.callGraph, {
    gcd: [],
    xgcd: [],
    inverse_mod: ["xgcd"],
    trial_division: [],
    is_prime: ["trial_division"],
    pi: ["is_prime"],
  });
  for (const backend of ["javascript", "tagged", "gmp"]) {
    const api = (name) => completeNumberTheoryModule[name][backend];
    assert.equal(api("gcd")(92250, 922350), 150n);
    for (const [a, b, expected] of [
      [240, 46, [2n, -9n, 47n]],
      [-84, 30, [6n, 1n, 3n]],
      [84, -30, [-6n, 1n, 3n]],
      [-84, -30, [-6n, -1n, 3n]],
      [0, 7, [7n, 0n, 1n]],
      [7, 0, [7n, 1n, 0n]],
    ]) {
      assert.deepEqual(api("xgcd")(a, b), expected);
    }
    assert.equal(api("inverse_mod")(3, 4000), 2667n);
    for (const [n, bound, start, expected] of [
      [-5, 0, 2, -5n], [0, 0, 2, 0n], [1, 0, 2, 1n],
      [2, 0, 2, 2n], [4, 0, 2, 2n], [25, 0, 2, 5n],
      [49, 0, 2, 7n], [91, 0, 2, 7n], [97, 0, 2, 97n],
      [121, 0, 2, 11n], [169, 0, 2, 13n], [221, 0, 2, 13n],
      [9973, 0, 2, 9973n], [49, 0, 8, 49n], [91, 5, 2, 91n],
      [91, 10, 2, 7n], [221, 0, 12, 13n], [221, 12, 12, 221n],
    ]) {
      assert.equal(api("trial_division")(n, bound, start), expected);
    }
    assert.equal(api("is_prime")(97), true);
    assert.equal(api("is_prime")(91), false);
    for (const [n, expected] of [
      [-2, 0n], [0, 0n], [1, 0n], [2, 1n], [10, 4n],
      [100, 25n], [1000, 168n],
    ]) {
      assert.equal(api("pi")(n), expected);
    }
  }
  assert.equal(completeNumberTheoryModule.trial_division(49), 7n);
  assert.equal(completeNumberTheoryAddon.trial_division(49), 7n);
  assert.equal(completeNumberTheoryModule.pi(), 9592n);
  assert.equal(completeNumberTheoryModule.pi.backendFor(100000), "tagged");
  assert.equal(Object.isFrozen(completeNumberTheoryModule.xgcd(240, 46)), true);
  for (const backend of ["javascript", "tagged", "gmp"]) {
    assert.throws(
      () => completeNumberTheoryModule.inverse_mod[backend](2, 4),
      /division by zero/,
    );
  }
  const completeModulePath = JSON.stringify(completeNumberTheory.modulePath);
  assert.deepEqual(
    runSage(`kernel = require(${completeModulePath})
value = kernel.xgcd(240, 46)
print(value)
print(type(value))
for inverse in [kernel.inverse_mod.javascript, kernel.inverse_mod.gmp]:
    try:
        inverse(2, 4)
    except Exception as error:
        print(type(error))
print(kernel.pi(1000))
`),
    [
      "(2, -9, 47)",
      "<class 'tuple'>",
      "<class 'ZeroDivisionError'>",
      "<class 'ZeroDivisionError'>",
      "168",
    ],
  );
  const selectedNt = await nativeApi.compile({
    sourcePath: completeNumberTheoryPath,
    functions: ["gcd"],
    cacheRoot: join(temporary, "selected-nt-cache"),
  });
  assert.deepEqual(selectedNt.ir.callGraph, { gcd: [] });
  assert.equal(require(selectedNt.modulePath).gcd(92250, 922350), 150n);
  for (const [override, expected] of [
    ["bigint", "bigint"],
    ["gmp", "gmp"],
  ]) {
    const selectedBackend = spawnSync(
      process.execPath,
      [
        "-e",
        `const kernel = require(${JSON.stringify(integerAlgorithms.modulePath)}); ` +
          "process.stdout.write(kernel.native_gcd.backendFor(92250, 922350));",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_NATIVE_INTEGER_BACKEND: override,
        },
      },
    );
    assert.equal(selectedBackend.status, 0, selectedBackend.stderr);
    assert.equal(selectedBackend.stdout, expected);
  }
  const cli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "compile",
      integerAlgorithmsPath,
      "--cache-root",
      join(temporary, "cli-cache"),
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.functions.includes("native_gcd"), true);
  assert.deepEqual(cliResult.callGraph.native_lcm, ["native_gcd"]);
  assert.equal(cliResult.analysis.native_gcd.backend.minimumBits, 64);
  assert.equal(cliResult.analysis.native_lcm.storage.scratchSlots, 2);
  const integerIndex = JSON.parse(
    readFileSync(join(integerCache, "index.json"), "utf8"),
  );
  assert.equal(integerIndex.schema, "sagejs.native-cache/v1");
  assert.equal(
    integerIndex.sources[integerSourcePath].cacheKey,
    integerKernel.cacheKey,
  );
  const harmonicAddon = require(mpmathKernel.addonPath);
  assert.match(
    flint.realToString(harmonicAddon.harmonic_cubic_loop(269, 400)),
    /^1\.20205378596232868074466308969974913071858345926099644512838/,
  );
  const harmonicModulePath = JSON.stringify(mpmathKernel.modulePath);
  const harmonicScript = `kernel = require(${harmonicModulePath})

def reference(field, terms):
    total = field(0)
    for denominator in range(1, terms + 1):
        total += field(1) / field(denominator) ** 3
    return total

expected = reference(RR, 40)
print(kernel.harmonic_cubic_loop(RR, 40) == expected)
print(kernel.harmonic_cubic_loop.javascript(RR, 40) == expected)
print(kernel.nativeAvailable)
`;
  assert.deepEqual(runSage(harmonicScript), ["True", "True", "True"]);
  assert.deepEqual(
    runSage(harmonicScript, { SAGEJS_NATIVE_DISABLE: "1" }),
    ["True", "True", "False"],
  );

  const direct = spawnSync(
    process.execPath,
    [join(__dirname, "native-kernel-addon-child.cjs"), first.addonPath],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(direct.status, 0, direct.stderr);

  const modulePath = JSON.stringify(first.modulePath);
  const script = `kernel = require(${modulePath})

def reference(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value

def real_reference(field, iterations):
    value = field("1.25")
    step = field("1.0000000000000002")
    for _ in range(iterations):
        value = value * step
    return value

actual = kernel.multiply_loop(CC, 25)
fallback = kernel.multiply_loop.javascript(CC, 25)
expected = reference(CC, 25)
real_actual = kernel.real_multiply_loop(RR, 25)
real_fallback = kernel.real_multiply_loop.javascript(RR, 25)
real_expected = real_reference(RR, 25)
print(type(actual))
print(parent(actual))
print(actual == expected)
print(fallback == expected)
print(type(real_actual))
print(parent(real_actual))
print(real_actual == real_expected)
print(real_fallback == real_expected)
print(kernel.nativeAvailable)
`;
  assert.deepEqual(runSage(script), [
    "<class 'ComplexNumber'>",
    "Complex Field with 53 bits of precision",
    "True",
    "True",
    "<class 'RealNumber'>",
    "Real Field with 53 bits of precision",
    "True",
    "True",
    "True",
  ]);
  assert.deepEqual(runSage(script, { SAGEJS_NATIVE_DISABLE: "1" }), [
    "<class 'ComplexNumber'>",
    "Complex Field with 53 bits of precision",
    "True",
    "True",
    "<class 'RealNumber'>",
    "Real Field with 53 bits of precision",
    "True",
    "True",
    "False",
  ]);
  assert.deepEqual(
    runSage(`from sagejs.native import is_native, native

@native
def square(value):
    return value * value

print(square(9))
print(is_native(square))
`),
    ["81", "True"],
  );
  const integerScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_integer_kernel import integer_quadratic_sum
from sagejs.native import is_compiled, is_native

answer = integer_quadratic_sum(1000000)
print(answer)
print(type(answer))
print(is_native(integer_quadratic_sum))
print(is_compiled(integer_quadratic_sum))
print(getattr(integer_quadratic_sum, 'nativeAvailable', None))
`;
  const integerEnvironment = {
    SAGEJS_NATIVE_CACHE_DIR: integerCache,
  };
  assert.deepEqual(runSage(integerScript, integerEnvironment), [
    "-333332833332500000",
    "<class 'int'>",
    "True",
    "True",
    "True",
  ]);
  assert.deepEqual(
    runSage(integerScript, {
      ...integerEnvironment,
      SAGEJS_NATIVE_DISABLE: "1",
    }),
    [
      "-333332833332500000",
      "<class 'int'>",
      "True",
      "True",
      "False",
    ],
  );
  assert.deepEqual(
    runSage(integerScript, {
      ...integerEnvironment,
      SAGEJS_NATIVE_AUTOLOAD: "0",
    }),
    [
      "-333332833332500000",
      "<class 'int'>",
      "True",
      "False",
      "None",
    ],
  );
  const integerAlgorithmsScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_integer_algorithms import native_lcm, native_powmod
from sagejs.native import is_compiled

print(native_lcm(-21, 6))
print(native_powmod(7, 560, 561))
print(is_compiled(native_lcm))
print(is_compiled(native_powmod))
`;
  assert.deepEqual(
    runSage(integerAlgorithmsScript, {
      SAGEJS_NATIVE_CACHE_DIR: integerAlgorithmsCache,
    }),
    ["42", "1", "True", "True"],
  );
  integerIndex.sources[integerSourcePath].sourceHash = "0".repeat(64);
  writeFileSync(
    join(integerCache, "index.json"),
    `${JSON.stringify(integerIndex, null, 2)}\n`,
  );
  assert.deepEqual(runSage(integerScript, integerEnvironment), [
    "-333332833332500000",
    "<class 'int'>",
    "True",
    "False",
    "None",
  ]);
  const restoredIntegerKernel = await nativeApi.compile({
    sourcePath: integerSourcePath,
    cacheRoot: integerCache,
  });
  assert.equal(restoredIntegerKernel.cached, true);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Native Kernel v8 analysis, deoptimization, ABI, and fallback passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
