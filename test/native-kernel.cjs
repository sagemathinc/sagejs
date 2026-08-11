"use strict";

const assert = require("node:assert/strict");
const {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const {
  NATIVE_ABI_VERSION,
  generateC,
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const { auditKernels } = require("../tools/native-kernel/introspection.cjs");
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
const scalarExactPath = join(
  root,
  "bench",
  "cowasm",
  "native",
  "scalar_exact.py",
);
const scalarFloatPath = join(
  root,
  "bench",
  "cowasm",
  "native",
  "scalar_float.py",
);
const numericalBuffersPath = join(
  root,
  "bench",
  "cowasm",
  "native",
  "numerical_buffers.py",
);
const signedBuffersPath = join(root, "bench", "native_signed_buffers.py");
const integerBuffersPath = join(root, "bench", "native_integer_buffers.py");
const reductionsPath = join(root, "bench", "native_reductions.py");
const ergonomicsPath = join(root, "bench", "native_v20_ergonomics.py");
const nativeRecordPath = join(root, "bench", "native_record_witness.py");
const primeFieldMatrixPath = join(
  root,
  "bench",
  "native_prime_field_matrix.py",
);
const primeFieldSourcePath = join(
  root,
  "bench",
  "native_prime_field_source.py",
);
const nativeTatePath = join(root, "bench", "native_tate_large_prime.py");
const nativeP1Path = join(
  root, "src", "lib", "sagejs", "kernels", "p1.py",
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
const generatedFieldCore = generateHostCore(ir);
const mpmathSource = readFileSync(mpmathSourcePath, "utf8");
const mpmathIr = await lowerSource(mpmathSource, mpmathSourcePath);
const harmonicFunction = mpmathIr.functions[0];
const harmonicC = generateC(mpmathIr);
const harmonicCoreC = generateHostCore(mpmathIr).source;
const integerSource = readFileSync(integerSourcePath, "utf8");
const integerIr = await lowerSource(integerSource, integerSourcePath);
const integerFunction = integerIr.functions[0];
const integerAdapterC = generateC(integerIr);
const integerCore = generateHostCore(integerIr);
const integerC = integerCore.source;
assert.match(integerC, /__builtin_add_overflow/);
assert.match(integerC, /__builtin_sub_overflow/);
assert.match(integerC, /__builtin_mul_overflow/);
assert.match(integerC, /SAGEJS_WORD_INLINE int word_integer_quadratic_sum/);
const integerAlgorithmsSource = readFileSync(integerAlgorithmsPath, "utf8");
const integerAlgorithmsIr = await lowerSource(
  integerAlgorithmsSource,
  integerAlgorithmsPath,
);
const integerAlgorithmsAdapterC = generateC(integerAlgorithmsIr);
const integerAlgorithmsCore = generateHostCore(integerAlgorithmsIr);
const integerAlgorithmsC = integerAlgorithmsCore.source;
const nativeNumberTheoryIr = await lowerSource(
  readFileSync(nativeNumberTheoryPath, "utf8"),
  nativeNumberTheoryPath,
);
const completeNumberTheoryIr = await lowerSource(
  readFileSync(completeNumberTheoryPath, "utf8"),
  completeNumberTheoryPath,
);
const completeNumberTheoryAudit = await auditKernels({
  sourcePath: completeNumberTheoryPath,
});
assert.equal(completeNumberTheoryAudit.schemaVersion, 1);
assert.equal(completeNumberTheoryAudit.summary.modules, 1);
assert.equal(completeNumberTheoryAudit.summary.functions, 6);
assert.equal(completeNumberTheoryAudit.summary.eligibleFunctions, 6);
assert.equal(completeNumberTheoryAudit.summary.rejectedFunctions, 0);
const scalarAudit = await auditKernels({
  sourcePath: join(root, "bench", "cowasm", "native"),
});
assert.equal(scalarAudit.summary.modules, 3);
assert.equal(scalarAudit.summary.functions, 10);
assert.equal(scalarAudit.summary.eligibleFunctions, 10);
assert.deepEqual(
  scalarAudit.modules.map((module) => module.path),
  ["numerical_buffers.py", "scalar_exact.py", "scalar_float.py"],
);
const completeNumberTheoryAdapterC = generateC(completeNumberTheoryIr);
const completeNumberTheoryCore = generateHostCore(completeNumberTheoryIr);
const completeNumberTheoryC = completeNumberTheoryCore.source;
assert.equal(completeNumberTheoryCore.audit.isolated, true);
assert.equal(completeNumberTheoryCore.audit.hostCallbacks, 0);
assert.deepEqual(
  completeNumberTheoryCore.audit.functions,
  completeNumberTheoryIr.functions.map((fn) => fn.name),
);
assert.doesNotMatch(
  completeNumberTheoryC,
  /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
);
assert.match(completeNumberTheoryAdapterC, /#include "kernel_core\.c"/);
const scalarExactIr = await lowerSource(
  readFileSync(scalarExactPath, "utf8"),
  scalarExactPath,
);
const scalarFloatIr = await lowerSource(
  readFileSync(scalarFloatPath, "utf8"),
  scalarFloatPath,
);
const scalarFloatAdapterC = generateC(scalarFloatIr);
const scalarFloatCore = generateHostCore(scalarFloatIr);
const scalarFloatC = scalarFloatCore.source;
const numericalBuffersIr = await lowerSource(
  readFileSync(numericalBuffersPath, "utf8"),
  numericalBuffersPath,
);
const numericalBuffersAdapterC = generateC(numericalBuffersIr);
const numericalBuffersCore = generateHostCore(numericalBuffersIr);
const numericalBuffersC = numericalBuffersCore.source;
const signedBuffersIr = await lowerSource(
  readFileSync(signedBuffersPath, "utf8"),
  signedBuffersPath,
);
const signedBuffersAdapterC = generateC(signedBuffersIr);
const signedBuffersC = generateHostCore(signedBuffersIr).source;
const reductionsIr = await lowerSource(
  readFileSync(reductionsPath, "utf8"),
  reductionsPath,
);
const reductionsCore = generateHostCore(reductionsIr);
const ergonomicsIr = await lowerSource(
  readFileSync(ergonomicsPath, "utf8"),
  ergonomicsPath,
);
const nativeRecordIr = await lowerSource(
  readFileSync(nativeRecordPath, "utf8"),
  nativeRecordPath,
);
const undecoratedNativeRecordIr = await lowerSource(
  readFileSync(nativeRecordPath, "utf8").replaceAll("@native\n", ""),
  "undecorated-native-record.py",
);
assert.deepEqual(
  undecoratedNativeRecordIr.records,
  nativeRecordIr.records,
);
assert.deepEqual(nativeRecordIr.records, [{
  name: "PrimeVector",
  type: "Record:PrimeVector",
  layout: "compiler-owned-value",
  ownership: "borrowed-fields",
  fields: [
    { name: "entries", type: "UInt64Buffer" },
    { name: "length", type: "uint64" },
    { name: "modulus", type: "PrimeModulusValue" },
  ],
}]);
assert.deepEqual(nativeRecordIr.callGraph, {
  scaled_sum: [],
  scale_first: [],
  scaled_sum_constructed: ["scaled_sum"],
});
const nativeRecordCore = generateHostCore(nativeRecordIr);
assert.match(nativeRecordCore.header, /sagejs_native_record_PrimeVector/);
assert.doesNotMatch(nativeRecordCore.source,
  /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
assert.deepEqual(
  ergonomicsIr.functions.map((fn) => [fn.name, fn.kernelKind]),
  [
    ["quadratic_sum", "integer"],
    ["quadratic_sum_declared", "integer"],
    ["float64_record_at", "float64"],
  ],
);
for (const name of ["quadratic_sum", "quadratic_sum_declared"]) {
  assert.equal(
    ergonomicsIr.functions.find((fn) => fn.name === name)
      .locals.find((local) => local.name === "total").type,
    "Integer",
  );
}
const reductionFunction = reductionsIr.functions.find(
  (fn) => fn.name === "sum_gcd_reduction",
);
assert.deepEqual(reductionsIr.callGraph, {
  reduction_gcd: [],
  sum_gcd_reduction: ["reduction_gcd"],
  sum_gcd_loop: ["reduction_gcd"],
  filtered_square_sum: [],
  eager_square_sum: [],
});
assert.equal(reductionFunction.analysis.execution.rangeLoops, 1);
assert.equal(reductionFunction.analysis.execution.nativeCalls, 1);
assert.equal(reductionsCore.audit.isolated, true);
assert.equal(reductionsCore.audit.hostCallbacks, 0);
assert.doesNotMatch(
  reductionsCore.source,
  /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
);
assert.match(integerAlgorithmsAdapterC, /#include "kernel_core\.c"/);
const primeFieldMatrixIr = await lowerSource(
  readFileSync(primeFieldMatrixPath, "utf8"),
  primeFieldMatrixPath,
);
const primeFieldMatrixC = generateC(primeFieldMatrixIr);
const primeFieldMatrixCore = generateHostCore(primeFieldMatrixIr);
const primeFieldSourceIr = await lowerSource(
  readFileSync(primeFieldSourcePath, "utf8"),
  primeFieldSourcePath,
);
const primeFieldSourceC = generateC(primeFieldSourceIr);
const primeFieldSourceCore = generateHostCore(primeFieldSourceIr);
const renamedPrimeFieldSourceIr = await lowerSource(
  readFileSync(primeFieldSourcePath, "utf8")
    .replaceAll("source_prime_rank", "renamed_rank_kernel")
    .replaceAll("source_prime_matmul", "renamed_matmul_kernel"),
  "renamed-prime-field-source.py",
);

assert.equal(ir.version, 21);
assert.equal(scalarExactIr.version, 21);
assert.equal(scalarFloatIr.version, 21);
assert.equal(reductionsIr.version, 21);
assert.deepEqual(
  scalarFloatIr.functions.map((fn) => [fn.name, fn.kernelKind]),
  [["int_to_float", "float64"], ["float_abs", "float64"]],
);
assert.match(scalarFloatC, /fabs\(/);
assert.match(scalarFloatC, /\(double\)/);
assert.deepEqual(
  numericalBuffersIr.functions.map((fn) => [
    fn.name,
    fn.params.map((param) => param.type),
    fn.analysis.effects.mutates,
  ]),
  [
    [
      "nbody_advance_energy",
      ["Float64Buffer", "Float64", "uint64", "uint64"],
      ["state"],
    ],
    [
      "matrix_multiply_repeated",
      [
        "Float64Buffer",
        "Float64Buffer",
        "Float64Buffer",
        "uint64",
        "uint64",
      ],
      ["left", "scratch"],
    ],
  ],
);
assert.match(numericalBuffersAdapterC, /napi_float64_array/);
assert.match(numericalBuffersAdapterC, /sagejs_native_get_float64_buffer/);
assert.match(numericalBuffersC, /sqrt\(/);
assert.equal(scalarFloatCore.audit.hostCallbacks, 0);
assert.equal(numericalBuffersCore.audit.hostCallbacks, 0);
assert.doesNotMatch(numericalBuffersC, /\bnapi_/);
assert.match(numericalBuffersC, /sagejs_left\.data/);
assert.deepEqual(
  signedBuffersIr.functions.map((fn) => [
    fn.name,
    fn.params.map((param) => param.type),
    fn.analysis.effects.externalWrites,
  ]),
  [
    ["fill_signed_records", ["Int64Buffer", "uint64"], ["output"]],
    ["sum_signed_records", ["Int64Buffer", "uint64"], []],
    ["write_then_overflow", ["Int64Buffer", "Integer"], ["output"]],
  ],
);
assert.match(signedBuffersAdapterC, /napi_bigint64_array/);
assert.match(signedBuffersC, /sagejs_int64_buffer_index/);
assert.match(signedBuffersC, /Int64Record is outside its buffer/);
const strideLoop = scalarExactIr.functions
  .find((fn) => fn.name === "sum_stride").body
  .find((operation) => operation.kind === "loop.range");
assert.equal(strideLoop.start, 0);
assert.equal(strideLoop.step, 3);
assert.equal(strideLoop.boundIsStop, true);
assert.equal(complexFunction.params[0].type, "ComplexField");
assert.equal(complexFunction.params[1].type, "uint64");
assert.equal(complexFunction.returnType, "ComplexNumber");
assert.equal(complexFunction.locals[0].storage, "return");
const {
  id: complexOperationId,
  origins: complexOperationOrigins,
  provenance: complexOperationProvenance,
  ...complexOperation
} = complexFunction.body[2].body[0];
assert.deepEqual(complexOperation, {
  kind: "complex.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.match(complexOperationId, /^multiply_loop:/);
assert.deepEqual(complexOperationOrigins, [complexOperationId]);
assert.equal(complexOperationProvenance.file, sourcePath);
assert.equal(realFunction.params[0].type, "RealField");
assert.equal(realFunction.returnType, "RealNumber");
assert.equal(realFunction.locals[0].type, "RealNumber");
const {
  id: realOperationId,
  origins: realOperationOrigins,
  provenance: realOperationProvenance,
  ...realOperation
} = realFunction.body[2].body[0];
assert.deepEqual(realOperation, {
  kind: "real.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.deepEqual(realOperationOrigins, [realOperationId]);
assert.equal(realOperationProvenance.file, sourcePath);
assert.match(
  generatedFieldCore.source,
  /mpc_mul\(sagejs_native_output, sagejs_native_output, sagejs_step/,
);
assert.match(
  generatedFieldCore.source,
  /mpfr_mul\(sagejs_native_output, sagejs_native_output, sagejs_step/,
);
assert.equal(generatedFieldCore.audit.hostCallbacks, 0);
assert.doesNotMatch(generatedFieldCore.source, /\bnapi_/);
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
    [
      "prime_field_factor",
      "prime-field-matrix",
      "factor",
      ["PrimeFieldMatrix"],
      "PrimeFieldDecomposition",
    ],
    [
      "prime_field_factor_rank",
      "prime-field-matrix",
      "factor-rank",
      ["PrimeFieldDecomposition"],
      "uint64",
    ],
    [
      "prime_field_factor_determinant",
      "prime-field-matrix",
      "factor-determinant",
      ["PrimeFieldDecomposition"],
      "PrimeFieldElement",
    ],
    [
      "prime_field_factor_echelon",
      "prime-field-matrix",
      "factor-echelon",
      ["PrimeFieldDecomposition"],
      "PrimeFieldMatrix",
    ],
    [
      "prime_field_factor_solve",
      "prime-field-matrix",
      "factor-solve",
      ["PrimeFieldDecomposition", "PrimeFieldMatrix"],
      "PrimeFieldMatrix",
    ],
  ],
);
assert.deepEqual(
  primeFieldMatrixIr.functions[0].arithmetic.representations,
  ["u32", "u64"],
);
assert.match(primeFieldMatrixCore.source, /sagejs_prime_factor_blocked/);
assert.match(primeFieldMatrixCore.source, /sagejs_prime_factor_classical/);
assert.match(primeFieldMatrixCore.source, /sagejs_prime_factor_solve/);
assert.match(primeFieldMatrixCore.source, /nmod_mul\(left, right/);
assert.match(primeFieldMatrixC, /sagejs_native_wrap_prime_matrix/);
assert.equal(primeFieldMatrixCore.audit.hostCallbacks, 0);
assert.doesNotMatch(primeFieldMatrixCore.source, /\bnapi_/);
assert.deepEqual(
  primeFieldSourceIr.functions.map((fn) => [
    fn.name,
    fn.kernelKind,
    fn.sourceTransparent,
    fn.optimizations,
  ]),
  [
    [
      "source_prime_rank",
      "prime-field-source",
      true,
      { rowSubmul: 1, dotAccumulate: 0, panelUpdate: 0 },
    ],
    [
      "source_prime_matmul",
      "prime-field-source",
      true,
      { rowSubmul: 0, dotAccumulate: 1, panelUpdate: 0 },
    ],
  ],
);
assert.match(primeFieldSourceCore.source, /sagejs_source_prime_row_submul/);
assert.match(primeFieldSourceCore.source, /sagejs_source_prime_dot_accumulate/);
assert.match(primeFieldSourceC, /compiled_source_prime_rank/);
assert.doesNotMatch(primeFieldSourceCore.source, /sagejs_prime_factor/);
assert.equal(primeFieldSourceCore.audit.hostCallbacks, 0);
assert.doesNotMatch(primeFieldSourceCore.source, /\bnapi_/);
assert.deepEqual(
  renamedPrimeFieldSourceIr.functions.map((fn) => fn.optimizations),
  primeFieldSourceIr.functions.map((fn) => fn.optimizations),
);
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
assert.match(completeNumberTheoryAdapterC, /compiled_pi_gmp/);
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
  /native_inverse_mod[\s\S]*native_xgcd\(status/,
);
assert.match(
  completeNumberTheoryC,
  /native_pi[\s\S]*native_is_prime\(status/,
);
assert.match(
  completeNumberTheoryC,
  /tagged_pi[\s\S]*tagged_is_prime\(status/,
);
assert.match(
  harmonicCoreC,
  /mpfr_set_uj\(sagejs_sagejs_native_tmp_3, sagejs_denominator/,
);
assert.match(
  harmonicCoreC,
  /mpfr_pow_ui\(sagejs_sagejs_native_tmp_2, sagejs_sagejs_native_tmp_3, 3/,
);
assert.match(
  harmonicCoreC,
  /sagejs_denominator - UINT64_C\(1\).*sagejs_terms/,
);
assert.equal(integerFunction.name, "integer_quadratic_sum");
assert.equal(integerFunction.returnType, "Integer");
assert.deepEqual(
  new Set(
    integerFunction.body.find((item) => item.kind === "loop.range").body
      .map((item) => item.kind),
  ),
  new Set(["uint64.binary", "integer.from_uint64", "integer.binary"]),
);
assert.match(integerC, /mpz_mul\(/);
assert.match(integerC, /sagejs_tagged_mul\(/);
assert.match(integerAdapterC, /napi_create_bigint_words\(/);
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
    threadSafe: true,
    mayAllocate: false,
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
  /native_native_lcm[\s\S]*native_native_gcd\(status/,
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
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import NativeRecord, UInt64Buffer, native, uint64\n" +
      "class Span(NativeRecord):\n" +
      "    entries: UInt64Buffer\n" +
      "    length: uint64\n" +
      "@native\n" +
      "def f(span: Span) -> uint64:\n" +
      "    return span.missing\n",
    "record-field.py",
  ),
  /Span has no field missing/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import NativeRecord, UInt64Buffer, native\n" +
      "class Span(NativeRecord):\n" +
      "    entries: UInt64Buffer = []\n" +
      "@native\n" +
      "def f(span: Span) -> Span:\n" +
      "    return span\n",
    "record-default.py",
  ),
  /Span\.entries may not have a default/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import NativeRecord, UInt64Buffer, native\n" +
      "class Span(NativeRecord):\n" +
      "    entries: UInt64Buffer\n" +
      "@native\n" +
      "def f(span: Span) -> Span:\n" +
      "    return span\n",
    "record-escape.py",
  ),
  /compiler-owned records are borrowed values and may not be returned/,
);
await assert.rejects(
  () =>
    lowerSource(
      "from sagejs.native import native\n" +
        "@native\n" +
        "def f() -> Integer:\n" +
        "    total = 0\n" +
        "    for index in range(0, 10, 3):\n" +
        "        total += index\n" +
        "    return total\n",
      "exact-step.py",
    ),
  /range step currently requires a uint64 stop/,
);
await assert.rejects(
  () =>
    lowerSource(
      "from sagejs.native import native\n" +
        "@native\n" +
        "def f(value: int) -> int:\n" +
        "    print(value)\n" +
        "    return value\n",
      "host-callback.py",
    ),
  /unsupported call to print/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import native\n" +
      "@native\n" +
      "def f(n: Integer) -> Integer:\n" +
      "    return sum(i * j for i in range(n) for j in range(i))\n",
    "nested-reduction.py",
  ),
  /sum\(\) currently supports one range-comprehension clause/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import native\n" +
      "@native\n" +
      "def f(count) -> Integer:\n" +
      "    return count\n",
    "missing-native-type.py",
  ),
  /parameter count requires a native type annotation/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import native\n" +
      "@native\n" +
      "def f(count: uint64) -> str:\n" +
      "    return count\n",
    "unsupported-native-result.py",
  ),
  /unsupported return annotation str/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import native\n" +
      "@native\n" +
      "def f(count: uint64) -> Integer:\n" +
      "    total: bool = 0\n" +
      "    return count\n",
    "inconsistent-local-type.py",
  ),
  /local total declares bool, got Integer/,
);
await assert.rejects(
  () => lowerSource(
    "from sagejs.native import native\n" +
      "@native\n" +
      "def f(count: uint64) -> Integer:\n" +
      "    total: Integer\n" +
      "    return count\n",
    "uninitialized-annotated-local.py",
  ),
  /native local annotations require an initializer/,
);
const shadowedSum = await lowerSource(
  "from sagejs.native import native\n" +
    "@native\n" +
    "def sum(value: Integer) -> Integer:\n" +
    "    return value + 1\n" +
    "@native\n" +
    "def f(value: Integer) -> Integer:\n" +
    "    return sum(value)\n",
  "shadowed-sum.py",
);
assert.deepEqual(shadowedSum.callGraph, { sum: [], f: ["sum"] });

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

function runForeignCacheWitness(prefix, cacheRoot, source) {
  const program = `
const fs = require("node:fs");
const { compileKernel } = require(${JSON.stringify(
    join(root, "tools", "native-kernel", "compiler.cjs"),
  )});
(async () => {
  const result = await compileKernel({
    sourcePath: ${JSON.stringify(source)},
    functions: [
      "foreign_cache_adapter_create",
      "foreign_cache_adapter_rows",
    ],
    cacheRoot: ${JSON.stringify(cacheRoot)},
  });
  const addon = require(result.addonPath);
  const matrix = addon.foreign_cache_adapter_create(2n, 3n);
  const manifest = JSON.parse(fs.readFileSync(
    result.outputPath + "/manifest.json", "utf8"
  ));
  process.stdout.write(JSON.stringify({
    cacheKey: result.cacheKey,
    cached: result.cached,
    value: Number(addon.foreign_cache_adapter_rows(matrix)),
    foreignInputs: result.foreignInputs,
    manifestForeignInputs: manifest.foreignInputs,
  }));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;
  const result = spawnSync(process.execPath, ["-e", program], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_FLINT_PREFIX: prefix },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `cache witness exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function copyForeignCacheWitnessPrefix(source, target) {
  cpSync(join(source, "include"), join(target, "include"), { recursive: true });
  mkdirSync(join(target, "lib"), { recursive: true });
  const names = process.platform === "win32"
    ? [
      "flint.lib",
      "openblas.lib",
      "pthreadVC3.lib",
      "mpc.lib",
      "mpfr.lib",
      "gmp.lib",
    ]
    : [
      "libflint.a",
      "libopenblas.a",
      "libmpc.a",
      "libmpfr.a",
      "libgmp.a",
    ];
  for (const name of names) {
    copyFileSync(join(source, "lib", name), join(target, "lib", name));
  }
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

  const installedForeignPrefix = process.env.SAGEJS_FLINT_PREFIX || join(
    root,
    "packages",
    "flint",
    ".native",
    process.platform === "win32"
      ? join("vcpkg-installed", "x64-windows-static-md-release")
      : "prefix",
  );
  const foreignWitnessPrefix = join(temporary, "foreign-input-prefix");
  const foreignWitnessCache = join(temporary, "foreign-input-cache");
  copyForeignCacheWitnessPrefix(installedForeignPrefix, foreignWitnessPrefix);
  cpSync(
    join(root, "packages", "flint", "include", "sagejs"),
    join(foreignWitnessPrefix, "include", "sagejs"),
    { recursive: true },
  );
  const foreignWitnessSource = join(temporary, "foreign-cache-adapter.py");
  writeFileSync(
    foreignWitnessSource,
    "from sagejs.ffi.flint import (\n" +
      "    FmpqMatrix,\n" +
      "    fmpq_matrix,\n" +
      "    fmpq_matrix_nrows,\n" +
      ")\n" +
      "from sagejs.native import native, uint64\n\n" +
      "@native\n" +
      "def foreign_cache_adapter_create(\n" +
      "    rows: uint64, columns: uint64\n" +
      ") -> FmpqMatrix:\n" +
      "    return fmpq_matrix(rows, columns)\n\n" +
      "@native\n" +
      "def foreign_cache_adapter_rows(matrix: FmpqMatrix) -> uint64:\n" +
      "    return fmpq_matrix_nrows(matrix)\n",
  );
  const initialForeignWitness = runForeignCacheWitness(
    foreignWitnessPrefix,
    foreignWitnessCache,
    foreignWitnessSource,
  );
  assert.equal(initialForeignWitness.cached, false);
  assert.equal(initialForeignWitness.value, 2);
  assert.deepEqual(
    initialForeignWitness.foreignInputs,
    initialForeignWitness.manifestForeignInputs,
  );
  const initialFlintInputs = initialForeignWitness.foreignInputs[0];
  assert.equal(initialFlintInputs.id, "flint");
  assert.match(initialFlintInputs.fingerprint, /^[a-f0-9]{64}$/);
  const initialHeader = initialFlintInputs.headers.find(
    (input) => input.name === "sagejs/fmpq_matrix_ffi.h",
  );
  assert.match(initialHeader.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    initialHeader.path,
    join(
      foreignWitnessPrefix,
      "include",
      "sagejs",
      "fmpq_matrix_ffi.h",
    ).replaceAll("\\", "/"),
  );
  assert.equal(
    initialForeignWitness.foreignInputs[0].libraries.length,
    process.platform === "win32" ? 3 : 2,
  );

  const cachedForeignWitness = runForeignCacheWitness(
    foreignWitnessPrefix,
    foreignWitnessCache,
    foreignWitnessSource,
  );
  assert.equal(cachedForeignWitness.cached, true);
  assert.equal(cachedForeignWitness.cacheKey, initialForeignWitness.cacheKey);
  writeFileSync(join(foreignWitnessPrefix, "unrelated.txt"), "unrelated\n");
  const unrelatedForeignWitness = runForeignCacheWitness(
    foreignWitnessPrefix,
    foreignWitnessCache,
    foreignWitnessSource,
  );
  assert.equal(unrelatedForeignWitness.cached, true);
  assert.equal(unrelatedForeignWitness.cacheKey, initialForeignWitness.cacheKey);

  const witnessHeaderPath = join(
    foreignWitnessPrefix,
    "include",
    "sagejs",
    "fmpq_matrix_ffi.h",
  );
  writeFileSync(
    witnessHeaderPath,
    readFileSync(witnessHeaderPath, "utf8") +
      "\n#undef sagejs_fmpq_matrix_nrows\n" +
      "#define sagejs_fmpq_matrix_nrows(matrix) ((uint64_t) 123)\n",
  );
  const changedForeignWitness = runForeignCacheWitness(
    foreignWitnessPrefix,
    foreignWitnessCache,
    foreignWitnessSource,
  );
  assert.equal(changedForeignWitness.cached, false);
  assert.equal(changedForeignWitness.value, 123);
  assert.notEqual(changedForeignWitness.cacheKey, initialForeignWitness.cacheKey);
  assert.notEqual(
    changedForeignWitness.foreignInputs[0].fingerprint,
    initialFlintInputs.fingerprint,
  );
  assert.notEqual(
    changedForeignWitness.foreignInputs[0].headers.find(
      (input) => input.name === "sagejs/fmpq_matrix_ffi.h",
    ).sha256,
    initialHeader.sha256,
  );
  assert.deepEqual(
    changedForeignWitness.foreignInputs[0].libraries,
    initialFlintInputs.libraries,
  );

  const missingHeaderPath = join(
    foreignWitnessPrefix,
    "include",
    "flint",
    "ulong_extras.h",
  );
  rmSync(missingHeaderPath);
  const missingHeaderProgram = `
const { compileKernel } = require(${JSON.stringify(
    join(root, "tools", "native-kernel", "compiler.cjs"),
  )});
compileKernel({
  sourcePath: ${JSON.stringify(foreignWitnessSource)},
  functions: [
    "foreign_cache_adapter_create",
    "foreign_cache_adapter_rows",
  ],
  cacheRoot: ${JSON.stringify(foreignWitnessCache)},
}).then(() => process.exit(0)).catch((error) => {
  console.error(error && error.message || error);
  process.exit(2);
});
`;
  const missingHeader = spawnSync(
    process.execPath,
    ["-e", missingHeaderProgram],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FLINT_PREFIX: foreignWitnessPrefix,
      },
    },
  );
  assert.equal(missingHeader.status, 2);
  assert.match(missingHeader.stderr, /declared native header.*does not resolve/);

  const scalarFloatKernel = await compileKernel({
    sourcePath: scalarFloatPath,
    cacheRoot: join(temporary, "scalar-float-cache"),
  });
  const scalarFloatModule = require(scalarFloatKernel.modulePath);
  assert.equal(
    scalarFloatModule.int_to_float(1000000, 1, 4, 6, 7, 8, 9),
    35000000,
  );
  assert.equal(
    scalarFloatModule.int_to_float.javascript(1000000, 1, 4, 6, 7, 8, 9),
    35000000,
  );
  const absoluteSum = scalarFloatModule.float_abs(
    1000000, 1, -1.234567, 44324, 23.4, -43.44e-4,
  );
  assert.ok(
    0.999999 <= absoluteSum / 44349638911.052574 &&
      absoluteSum / 44349638911.052574 <= 1.000001,
  );
  const javascriptAbsoluteSum = scalarFloatModule.float_abs.javascript(
    1000000, 1, -1.234567, 44324, 23.4, -43.44e-4,
  );
  assert.ok(
    0.999999 <= javascriptAbsoluteSum / 44349638911.052574 &&
      javascriptAbsoluteSum / 44349638911.052574 <= 1.000001,
  );
  const numericalBuffersKernel = await compileKernel({
    sourcePath: numericalBuffersPath,
    cacheRoot: join(temporary, "numerical-buffers-cache"),
  });
  const numericalBuffersModule = require(numericalBuffersKernel.modulePath);
  const matrixLeft = new Float64Array([1, 2, 3, 4]);
  const matrixRight = new Float64Array([1, 0, 0, 1]);
  const matrixScratch = new Float64Array(4);
  assert.equal(
    numericalBuffersModule.matrix_multiply_repeated(
      matrixLeft, matrixRight, matrixScratch, 2, 1,
    ),
    10,
  );
  assert.deepEqual(Array.from(matrixScratch), [1, 2, 3, 4]);
  const fallbackLeft = new Float64Array([1, 2, 3, 4]);
  const fallbackScratch = new Float64Array(4);
  assert.equal(
    numericalBuffersModule.matrix_multiply_repeated.javascript(
      fallbackLeft, matrixRight, fallbackScratch, 2, 1,
    ),
    10,
  );
  assert.deepEqual(Array.from(fallbackScratch), [1, 2, 3, 4]);
  const twoBodyState = new Float64Array([
    0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 1, 0, 1,
  ]);
  const fallbackTwoBodyState = twoBodyState.slice();
  const twoBodyEnergy = numericalBuffersModule.nbody_advance_energy(
    twoBodyState, 0.01, 1, 2,
  );
  const fallbackTwoBodyEnergy =
    numericalBuffersModule.nbody_advance_energy.javascript(
      fallbackTwoBodyState, 0.01, 1, 2,
    );
  assert.equal(twoBodyEnergy, fallbackTwoBodyEnergy);
  assert.deepEqual(Array.from(twoBodyState), Array.from(fallbackTwoBodyState));
  assert.equal(
    numericalBuffersModule.nbody_advance_energy.backendPolicy.kind,
    "native-double-buffer",
  );
  const signedBuffersKernel = await compileKernel({
    sourcePath: signedBuffersPath,
    cacheRoot: join(temporary, "signed-buffers-cache"),
  });
  const signedBuffersModule = require(signedBuffersKernel.modulePath);
  const signedRecords = Array(12).fill(0);
  assert.equal(
    signedBuffersModule.fill_signed_records(signedRecords, 3),
    -3n,
  );
  assert.deepEqual(
    signedRecords.map(BigInt),
    [0n, 0n, 0n, 1n, 1n, -1n, 1n, 0n, 2n, -2n, 4n, -3n],
  );
  assert.equal(signedBuffersModule.sum_signed_records(signedRecords, 3), 3n);
  assert.equal(
    signedBuffersModule.sum_signed_records.javascript(signedRecords, 3),
    3n,
  );
  assert.deepEqual(
    signedBuffersModule.fill_signed_records.effects.externalWrites,
    ["output"],
  );
  assert.equal(
    signedBuffersModule.fill_signed_records.taggedInteger.calleeSpeculation,
    "disabled",
  );
  for (const backend of ["tagged", "gmp"]) {
    const packed = new BigInt64Array(12);
    assert.equal(
      signedBuffersModule.fill_signed_records[backend](packed, 3),
      -3n,
    );
    assert.deepEqual(
      Array.from(packed),
      [0n, 0n, 0n, 1n, 1n, -1n, 1n, 0n, 2n, -2n, 4n, -3n],
    );
  }
  for (const backend of ["javascript", "tagged", "gmp"]) {
    const partiallyWritten = [0n, 0n];
    assert.throws(
      () => signedBuffersModule.write_then_overflow[backend](
        partiallyWritten, 1n << 63n,
      ),
      /outside signed 64-bit/,
    );
    assert.deepEqual(partiallyWritten, [7n, 0n]);
  }
  assert.throws(
    () => signedBuffersModule.fill_signed_records(Array(3).fill(0), 1),
    /Int64Record is outside its buffer/,
  );
  const integerBuffersKernel = await compileKernel({
    sourcePath: integerBuffersPath,
    cacheRoot: join(temporary, "integer-buffers-cache"),
  });
  const integerBuffersModule = require(integerBuffersKernel.modulePath);
  const exactValues = Array(3).fill(0n);
  const exactSeed = 1n << 100n;
  integerBuffersModule.fill_integer_powers(exactValues, 3, exactSeed);
  const fallbackExactValues = Array(3).fill(0n);
  integerBuffersModule.fill_integer_powers.javascript(
    fallbackExactValues, 3, exactSeed,
  );
  assert.deepEqual(exactValues, fallbackExactValues);
  assert.ok(exactValues[2] > (1n << 300n));
  assert.equal(
    integerBuffersModule.sum_integer_buffer(exactValues),
    exactValues.reduce((left, right) => left + right, 0n),
  );
  const veryLargePacked = integerBuffersModule.createIntegerBuffer(4, 16);
  integerBuffersModule.fill_integer_powers(veryLargePacked, 4, exactSeed);
  let expectedPackedSum = 0n;
  let expectedPackedValue = exactSeed;
  for (let index = 0; index < 4; index += 1) {
    expectedPackedSum += expectedPackedValue;
    expectedPackedValue = expectedPackedValue ** 2n + BigInt(index + 1);
  }
  assert.equal(
    integerBuffersModule.sum_integer_buffer(veryLargePacked),
    expectedPackedSum,
  );
  const packedExact = integerBuffersModule.createIntegerBuffer(1, 1);
  assert.throws(
    () => integerBuffersModule.write_integer_value(packedExact, 1n << 80n),
    /IntegerBuffer word capacity exceeded/,
  );
  for (const backend of ["javascript", "tagged", "gmp"]) {
    assert.throws(
      () => integerBuffersModule.write_integer_value[backend]([], 1),
      /IntegerBuffer index out of range/,
    );
  }
  const scalarExactKernel = await compileKernel({
    sourcePath: scalarExactPath,
    cacheRoot: join(temporary, "scalar-exact-cache"),
  });
  const scalarExactModule = require(scalarExactKernel.modulePath);
  assert.equal(scalarExactModule.sum_stride(), 333334n);
  assert.equal(scalarExactModule.xgcd_loop(), 2414484n);

  const reductionsKernel = await compileKernel({
    sourcePath: reductionsPath,
    cacheRoot: join(temporary, "reductions-cache"),
  });
  const reductionsModule = require(reductionsKernel.modulePath);
  for (const backend of ["javascript", "tagged", "gmp"]) {
    assert.equal(reductionsModule.sum_gcd_reduction[backend](1000), 1500n);
    assert.equal(
      reductionsModule.sum_gcd_reduction[backend](1000),
      reductionsModule.sum_gcd_loop[backend](1000),
    );
    assert.equal(reductionsModule.filtered_square_sum[backend](10), 272n);
    assert.equal(reductionsModule.filtered_square_sum[backend](0, -5), 95n);
    assert.equal(reductionsModule.eager_square_sum[backend](5), 33n);
  }
  assert.equal(reductionsModule.executionMode, "native-capable");
  assert.deepEqual(
    reductionsModule.sum_gcd_reduction.__sagejs_native_boundary__,
    {
      publicCrossingsPerCall: 1,
      callbacksInsideCore: 0,
      dependenciesStayInsideCore: true,
    },
  );

  const ergonomicsKernel = await compileKernel({
    sourcePath: ergonomicsPath,
    cacheRoot: join(temporary, "ergonomics-cache"),
  });
  const nativeRecordKernel = await compileKernel({
    sourcePath: nativeRecordPath,
    cacheRoot: join(temporary, "native-record-cache"),
  });
  const ergonomicsModule = require(ergonomicsKernel.modulePath);
  assert.equal(ergonomicsModule.quadratic_sum(1000), 332833500n);
  assert.equal(
    ergonomicsModule.quadratic_sum(1000),
    ergonomicsModule.quadratic_sum_declared(1000),
  );
  for (const invalid of [1.5, "10"]) {
    assert.throws(
      () => ergonomicsModule.quadratic_sum(invalid),
      /must be an exact integer/,
    );
  }
  for (const invalid of [-1, 1n << 64n]) {
    assert.throws(
      () => ergonomicsModule.quadratic_sum(invalid),
      /outside uint64/,
    );
  }
  const floatState = ergonomicsModule.createFloat64Buffer([
    0, 1, 2, 3, 4, 5, 6,
  ]);
  assert.ok(floatState instanceof Float64Array);
  assert.equal(
    ergonomicsModule.float64_record_at(floatState, 0, 7, 6),
    6,
  );
  for (const implementation of [
    ergonomicsModule.float64_record_at,
    ergonomicsModule.float64_record_at.javascript,
  ]) {
    assert.throws(() => implementation(floatState, 4, 7, 0),
      /Float64Record is outside its buffer/);
    assert.throws(() => implementation(floatState, 0, 7, 100),
      /Float64 buffer index out of range/);
  }

  const mpmathKernel = await compileKernel({
    sourcePath: mpmathSourcePath,
    cacheRoot: join(temporary, "mpmath-cache"),
  });
  const primeFieldKernel = await compileKernel({
    sourcePath: primeFieldMatrixPath,
    cacheRoot: join(temporary, "prime-field-cache"),
  });
  const primeFieldSourceKernel = await compileKernel({
    sourcePath: primeFieldSourcePath,
    cacheRoot: join(temporary, "prime-field-source-cache"),
  });
  const nativeTateKernel = await compileKernel({
    sourcePath: nativeTatePath,
    functions: ["tate_large_prime"],
    cacheRoot: join(temporary, "native-tate-cache"),
  });
  const nativeP1Kernel = await compileKernel({
    sourcePath: nativeP1Path,
    cacheRoot: join(temporary, "native-p1-cache"),
  });
  for (const [family, compiled, expectedKinds] of [
    ["MPFR/MPC fields", first, ["complex-field", "real-field"]],
    ["packed binary64", numericalBuffersKernel, ["float64"]],
    ["exact integer", scalarExactKernel, ["integer"]],
    ["source prime field", primeFieldSourceKernel, ["prime-field-source"]],
    ["compiler-owned record", nativeRecordKernel, ["prime-field-source"]],
    ["specialized prime field", primeFieldKernel, ["prime-field-matrix"]],
  ]) {
    const manifest = JSON.parse(
      readFileSync(join(compiled.outputPath, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.hostIsolation.isolated, true, family);
    assert.equal(manifest.hostIsolation.hostCallbacks, 0, family);
    assert.deepEqual(
      [...manifest.hostIsolation.kernelKinds].sort(),
      [...expectedKinds].sort(),
      family,
    );
    assert.doesNotMatch(
      readFileSync(compiled.coreSourcePath, "utf8"),
      /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
      family,
    );
    assert.match(
      readFileSync(join(compiled.outputPath, "kernel.c"), "utf8"),
      /#include "kernel_core\.c"/,
      family,
    );
    if (process.platform !== "win32" &&
        spawnSync(process.env.CC || "cc", ["--version"]).status === 0) {
      const objectPath = join(
        temporary,
        `isolated-${family.replaceAll(/[^a-z0-9]+/gi, "-")}.o`,
      );
      const nativePrefix = join(root, "packages", "flint", ".native", "prefix");
      const independent = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-O2", "-fPIC", "-c",
        `-I${compiled.outputPath}`,
        `-I${join(nativePrefix, "include")}`,
        compiled.coreSourcePath,
        "-o", objectPath,
      ], { encoding: "utf8" });
      assert.equal(independent.status, 0, `${family}: ${independent.stderr}`);
    }
  }
  const nativeRecordModule = require(nativeRecordKernel.modulePath);
  assert.equal(nativeRecordModule.scaled_sum({
    entries: [1, 2, 3], length: 3, modulus: 101,
  }, 7), 42);
  assert.equal(
    nativeRecordModule.scaled_sum_constructed([1, 2, 3], 3, 101, 7),
    42,
  );
  const mutableRecordEntries = [3];
  assert.equal(nativeRecordModule.scale_first({
    entries: mutableRecordEntries, length: 1, modulus: 101,
  }, 7), 21);
  assert.deepEqual(mutableRecordEntries.map(Number), [21]);
  assert.throws(() => nativeRecordModule.scaled_sum({
    entries: [1], length: 1, modulus: 1,
  }, 7), /must be a prime/);
  const nativeP1Module = require(nativeP1Kernel.modulePath);
  const p1Fused = nativeP1Module.heilbronn_higher_weight_hecke_fill;
  assert.ok(p1Fused.createInt64Buffer([1, -2, 3]) instanceof BigInt64Array);
  assert.deepEqual(
    p1Fused.packIntegerBuffer([1n << 700n, -(1n << 900n)]).toArray(),
    [1n << 700n, -(1n << 900n)],
  );
  assert.deepEqual(
    p1Fused.createIntegerBuffer(3, 4).toArray(),
    [0n, 0n, 0n],
  );
  for (const [p, expected] of [
    [2, [4n, 6n, 1n, 1n, 6n, 61n]],
    [3, [6n, 10n, 0n, 2n, 6n, 83n]],
    [5, [12n, 28n, 2n, 4n, 20n, 683n]],
    [11, [30n, 126n, 4n, 10n, 66n, 5411n]],
    [101, [412n, 10062n, -140n, -538n, -1850n, -2900275n]],
  ]) {
    assert.deepEqual(nativeP1Module.heilbronn_cremona_digest(p), expected);
    assert.deepEqual(
      nativeP1Module.heilbronn_cremona_digest.javascript(p), expected,
    );
    const count = Number(expected[0]);
    const packed = Array(4 * count).fill(0);
    const fallbackPacked = Array(4 * count).fill(0);
    assert.equal(nativeP1Module.heilbronn_cremona_fill(p, packed), expected[0]);
    assert.equal(
      nativeP1Module.heilbronn_cremona_fill.javascript(p, fallbackPacked),
      expected[0],
    );
    assert.deepEqual(packed.map(BigInt), fallbackPacked.map(BigInt));
    for (let index = 0; index < count; index += 1) {
      const entry = nativeP1Module.heilbronn_cremona_entry(p, index);
      assert.deepEqual(
        entry,
        nativeP1Module.heilbronn_cremona_entry.javascript(p, index),
      );
      assert.deepEqual(
        packed.slice(4 * index, 4 * index + 4).map(BigInt),
        entry.slice(1),
      );
    }
    const width = 3;
    const action = Array(count * width * width).fill(0);
    const fallbackAction = Array(action.length).fill(0);
    assert.equal(
      nativeP1Module.heilbronn_higher_weight_action_fill(
        4, packed, count, action,
      ),
      BigInt(action.length),
    );
    assert.equal(
      nativeP1Module.heilbronn_higher_weight_action_fill.javascript(
        4, fallbackPacked, count, fallbackAction,
      ),
      BigInt(action.length),
    );
    assert.deepEqual(action.map(BigInt), fallbackAction.map(BigInt));
    assert.deepEqual(
      action.slice(0, 9).map(BigInt),
      [BigInt(p * p), 0n, 0n, 0n, BigInt(p), 0n, 0n, 0n, 1n],
    );
  }
  for (const [args, expected] of [
    [[12, 7, 15], [true, 1n, 9n, 7n]],
    [[12, 2, 3], [true, 2n, 3n, 1n]],
    [[1, 9, 4], [true, 0n, 0n, 1n]],
    [[11, -4, 19], [true, 1n, 9n, 7n]],
    [[100, 50, 25], [false, 0n, 0n, 0n]],
  ]) {
    assert.deepEqual(nativeP1Module.p1_normalize_with_scalar(...args), expected);
    assert.deepEqual(
      nativeP1Module.p1_normalize_with_scalar.javascript(...args), expected,
    );
  }
  for (const [index, expected] of [
    [1, [1n, 1n, 0n, 0n, 1n, 8n]],
    [2, [4n, 6n, 1n, 1n, 6n, 130n]],
    [5, [15n, 44n, 18n, 18n, 44n, 3342n]],
    [20, [159n, 1258n, 712n, 712n, 1258n, 1043247n]],
  ]) {
    assert.deepEqual(nativeP1Module.heilbronn_merel_digest(index), expected);
    assert.deepEqual(
      nativeP1Module.heilbronn_merel_digest.javascript(index), expected,
    );
    const count = Number(expected[0]);
    const packed = Array(4 * count).fill(0);
    assert.equal(nativeP1Module.heilbronn_merel_fill(index, packed), expected[0]);
    for (let position = 0; position < count; position += 1) {
      assert.deepEqual(
        packed.slice(4 * position, 4 * position + 4).map(BigInt),
        nativeP1Module.heilbronn_merel_entry(index, position).slice(1),
      );
    }
  }
  assert.deepEqual(
    Object.keys(nativeTateKernel.ir.callGraph).sort(),
    [
      "tate_cubic_multiply_mod",
      "tate_cubic_root_count",
      "tate_inverse_mod",
      "tate_jacobi",
      "tate_large_prime",
      "tate_large_prime_invariants",
      "tate_legendre",
      "tate_power",
      "tate_valuation",
      "tate_x_power_mod_cubic",
    ],
  );
  const nativeTateModule = require(nativeTateKernel.modulePath);
  const tateCases = [
    [[0, 0, 1, -1, 0], 5, [0n, 1n, 1n]],
    [[0, 0, 0, 0, 5], 5, [2n, 2n, 1n]],
    [[0, 0, 0, 0, 25], 5, [2n, 4n, 3n]],
    [[0, 0, 0, 0, 125], 5, [2n, -1n, 2n]],
    [[0, 0, 0, 0, 625], 5, [2n, -4n, 3n]],
    [[0, 0, 0, 0, 3125], 5, [2n, -2n, 1n]],
    [[0, 0, 0, 5, 0], 5, [2n, 3n, 2n]],
    [[0, 0, 0, 25, 0], 5, [2n, -1n, 4n]],
    [[0, 0, 0, 125, 0], 5, [2n, -3n, 2n]],
    [[0, -1, 1, -10, -20], 11, [1n, 9n, 5n]],
    [[1, -16, 0, -9, 16], 11, [1n, 5n, 1n]],
    [[7, 1, 17, 16, 0], 17, [1n, 6n, 2n]],
    [[3, 20, -4, -7, -10], 13, [1n, 7n, 1n]],
    [[0, 0, 0, 0, 101 ** 3], 101, [2n, -1n, 2n]],
    [[0, 0, 0, 0, 1000003n ** 3n], 1000003n, [2n, -1n, 4n]],
  ];
  for (const [coefficients, prime, expected] of tateCases) {
    const args = [...coefficients, prime];
    assert.deepEqual(nativeTateModule.tate_large_prime(...args), expected);
    assert.deepEqual(
      nativeTateModule.tate_large_prime.javascript(...args),
      expected,
    );
    assert.deepEqual(
      nativeTateModule.tate_large_prime.tagged(...args),
      expected,
    );
  }
  for (const prime of [5, 7, 11, 13, 17, 19]) {
    for (let aValue = 0; aValue < prime; aValue += 1) {
      for (let bValue = 0; bValue < prime; bValue += 1) {
        let roots = 0;
        for (let xValue = 0; xValue < prime; xValue += 1) {
          if ((xValue ** 3 + aValue * xValue + bValue) % prime === 0) roots += 1;
        }
        assert.equal(
          nativeTateModule.tate_cubic_root_count(aValue, bValue, prime),
          BigInt(roots),
        );
      }
    }
  }
  const primeFieldSourceAddon = require(primeFieldSourceKernel.addonPath);
  const primeFieldSourceModule = require(primeFieldSourceKernel.modulePath);
  const primeFieldSourceManifest = JSON.parse(
    readFileSync(
      join(primeFieldSourceKernel.outputPath, "manifest.json"),
      "utf8",
    ),
  );
  assert.ok(primeFieldSourceManifest.coreSourceMap.length > 0);
  assert.equal(
    primeFieldSourceManifest.coreSourceMap[0].location,
    `${primeFieldSourcePath}:29:5`,
  );
  assert.match(
    readFileSync(
      join(primeFieldSourceKernel.outputPath, "kernel_core.c"), "utf8",
    ),
    new RegExp(`#line 29 ${JSON.stringify(primeFieldSourcePath)}`),
  );
  const primeFieldAddon = require(primeFieldKernel.addonPath);
  const primeFieldModule = require(primeFieldKernel.modulePath);
  const primeFieldManifest = JSON.parse(
    readFileSync(join(primeFieldKernel.outputPath, "manifest.json"), "utf8"),
  );
  const expectedPrimeFieldTuning = {
    blockThresholdU32: 32,
    blockThresholdU64: 320,
    panelU32: 20,
    panelU64: 48,
    columnTile: 512,
    shoupThreshold: 4,
  };
  assert.deepEqual(
    primeFieldModule.primeFieldTuning,
    expectedPrimeFieldTuning,
  );
  assert.deepEqual(
    primeFieldManifest.primeFieldTuning,
    expectedPrimeFieldTuning,
  );
  assert.equal(primeFieldSourceManifest.sourceBoundsChecked, true);
  assert.equal(primeFieldSourceModule.sourceBoundsChecked, true);
  assert.equal(
    primeFieldSourceModule.source_prime_rank.sourceTransparent,
    true,
  );
  const previousBoundsCheck = process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK;
  let uncheckedPrimeFieldSourceKernel;
  try {
    process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK = "0";
    uncheckedPrimeFieldSourceKernel = await compileKernel({
      sourcePath: primeFieldSourcePath,
      cacheRoot: join(temporary, "prime-field-source-cache"),
    });
    process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK = "invalid";
    await assert.rejects(
      () => compileKernel({
        sourcePath: primeFieldSourcePath,
        cacheRoot: join(temporary, "invalid-prime-field-source-cache"),
      }),
      /SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK must be 0 or 1/,
    );
  } finally {
    if (previousBoundsCheck === undefined)
      delete process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK;
    else
      process.env.SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK = previousBoundsCheck;
  }
  assert.notEqual(
    uncheckedPrimeFieldSourceKernel.cacheKey,
    primeFieldSourceKernel.cacheKey,
  );
  const thresholdEnvironment = "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32";
  const previousThreshold = process.env[thresholdEnvironment];
  let tunedPrimeFieldKernel;
  try {
    process.env[thresholdEnvironment] = "33";
    tunedPrimeFieldKernel = await compileKernel({
      sourcePath: primeFieldMatrixPath,
      cacheRoot: join(temporary, "prime-field-cache"),
    });
    process.env[thresholdEnvironment] = "0";
    await assert.rejects(
      () => compileKernel({
        sourcePath: primeFieldMatrixPath,
        cacheRoot: join(temporary, "invalid-prime-field-cache"),
      }),
      /SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32 must be an integer/,
    );
  } finally {
    if (previousThreshold === undefined)
      delete process.env[thresholdEnvironment];
    else
      process.env[thresholdEnvironment] = previousThreshold;
  }
  assert.notEqual(tunedPrimeFieldKernel.cacheKey, primeFieldKernel.cacheKey);
  assert.equal(
    JSON.parse(
      readFileSync(
        join(tunedPrimeFieldKernel.outputPath, "manifest.json"),
        "utf8",
      ),
    ).primeFieldTuning.blockThresholdU32,
    33,
  );
  const flint = require("../packages/flint");
  for (const [level, weight, sign, prime] of [
    [5, 2, 0, 2],
    [7, 4, -1, 3],
    [11, 4, 0, 5],
    [11, 6, 1, 7],
    [13, 4, 0, 13],
  ]) {
    const line = flint.p1List(level);
    const pairCount = flint.p1ListCount(line);
    const pairs = [];
    for (let index = 0; index < pairCount; index += 1) {
      pairs.push(...flint.p1ListEntry(line, index));
    }
    const presentation = flint.p1ListHigherWeightPresentation(
      line, weight, sign,
    );
    const reduction = flint.higherWeightPresentationReduction(presentation);
    const matrixCount = Number(
      nativeP1Module.heilbronn_cremona_count(prime),
    );
    const matrices = Array(4 * matrixCount).fill(0);
    nativeP1Module.heilbronn_cremona_fill(prime, matrices);
    const width = weight - 1;
    const streamLength = width * pairCount * matrixCount * width;
    const images = Array(streamLength).fill(0);
    const coefficients = Array(streamLength).fill(0n);
    nativeP1Module.heilbronn_transported_action_fill(
      weight, level, pairs, pairCount, matrices, matrixCount,
      images, coefficients,
    );
    const fallbackImages = Array(streamLength).fill(0);
    const fallbackCoefficients = Array(streamLength).fill(0n);
    nativeP1Module.heilbronn_transported_action_fill.javascript(
      weight, level, pairs, pairCount, matrices, matrixCount,
      fallbackImages, fallbackCoefficients,
    );
    assert.deepEqual(images.map(BigInt), fallbackImages.map(BigInt));
    assert.deepEqual(coefficients, fallbackCoefficients);
    const reductionNumerators = [];
    const reductionDenominators = [];
    for (let row = 0; row < presentation.generators; row += 1) {
      for (let column = 0; column < presentation.dimension; column += 1) {
        const entry = flint.matrixEntry(reduction, row, column);
        reductionNumerators.push(entry.numerator);
        reductionDenominators.push(entry.denominator);
      }
    }
    const outputLength = presentation.dimension ** 2;
    const outputNumerators = Array(outputLength).fill(0n);
    const outputDenominators = Array(outputLength).fill(0n);
    nativeP1Module.heilbronn_reduce_transported_action(
      weight, matrixCount, presentation.basisGenerators,
      presentation.dimension, images, coefficients,
      reductionNumerators, reductionDenominators,
      outputNumerators, outputDenominators,
    );
    const fallbackNumerators = Array(outputLength).fill(0n);
    const fallbackDenominators = Array(outputLength).fill(0n);
    nativeP1Module.heilbronn_reduce_transported_action.javascript(
      weight, matrixCount, presentation.basisGenerators,
      presentation.dimension, fallbackImages, fallbackCoefficients,
      reductionNumerators, reductionDenominators,
      fallbackNumerators, fallbackDenominators,
    );
    assert.deepEqual(outputNumerators, fallbackNumerators);
    assert.deepEqual(outputDenominators, fallbackDenominators);
    const fusedNumerators = Array(outputLength).fill(0n);
    const fusedDenominators = Array(outputLength).fill(0n);
    nativeP1Module.heilbronn_higher_weight_hecke_fill(
      weight, level, pairs, pairCount, matrices, matrixCount,
      presentation.basisGenerators, presentation.dimension,
      reductionNumerators, reductionDenominators,
      fusedNumerators, fusedDenominators,
    );
    assert.deepEqual(fusedNumerators, outputNumerators);
    assert.deepEqual(fusedDenominators, outputDenominators);
    const fallbackFusedNumerators = Array(outputLength).fill(0n);
    const fallbackFusedDenominators = Array(outputLength).fill(0n);
    nativeP1Module.heilbronn_higher_weight_hecke_fill.javascript(
      weight, level, pairs, pairCount, matrices, matrixCount,
      presentation.basisGenerators, presentation.dimension,
      reductionNumerators, reductionDenominators,
      fallbackFusedNumerators, fallbackFusedDenominators,
    );
    assert.deepEqual(fallbackFusedNumerators, outputNumerators);
    assert.deepEqual(fallbackFusedDenominators, outputDenominators);
    const expected = flint.p1ListHigherWeightHeckeMatrix(
      line, weight, sign, prime, presentation,
    );
    for (let row = 0; row < presentation.dimension; row += 1) {
      for (let column = 0; column < presentation.dimension; column += 1) {
        const index = row * presentation.dimension + column;
        const entry = flint.matrixEntry(expected, row, column);
        assert.equal(outputNumerators[index], entry.numerator);
        assert.equal(outputDenominators[index], entry.denominator);
      }
    }
  }
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
  let sourceRandomState = 0x12345678;
  const sourceRandom = () => {
    sourceRandomState = (
      Math.imul(sourceRandomState, 1664525) + 1013904223
    ) >>> 0;
    return sourceRandomState;
  };
  const sourcePrimes = [2n, 3n, 5n, 251n, 65521n, 4294967291n];
  for (let trial = 0; trial < 80; trial += 1) {
    const modulus = sourcePrimes[trial % sourcePrimes.length];
    const rows = sourceRandom() % 13;
    const columns = sourceRandom() % 13;
    const resultColumns = sourceRandom() % 13;
    const left = flint.nmodMatrix(
      rows,
      columns,
      Array.from(
        { length: rows * columns },
        () => BigInt(sourceRandom()) % modulus,
      ),
      modulus,
    );
    const right = flint.nmodMatrix(
      columns,
      resultColumns,
      Array.from(
        { length: columns * resultColumns },
        () => BigInt(sourceRandom()) % modulus,
      ),
      modulus,
    );
    assert.equal(
      primeFieldSourceAddon.source_prime_rank(left),
      flint.matrixRank(left),
    );
    assert.equal(
      flint.matrixEqual(
        primeFieldSourceAddon.source_prime_matmul(left, right),
        flint.matrixMul(left, right),
      ),
      true,
    );
  }
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
  const smallPrimeFactor = primeFieldAddon.prime_field_factor(
    smallPrimeMatrix,
  );
  assert.equal(smallPrimeFactor.algorithm, "classical");
  assert.equal(
    primeFieldAddon.prime_field_factor_rank(smallPrimeFactor),
    2,
  );
  assert.equal(
    primeFieldAddon.prime_field_factor_determinant(smallPrimeFactor),
    3n,
  );
  assert.equal(
    flint.matrixEqual(
      primeFieldAddon.prime_field_factor_echelon(smallPrimeFactor),
      flint.matrixRref(smallPrimeMatrix),
    ),
    true,
  );
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const answer = primeFieldAddon.prime_field_factor_solve(
      smallPrimeFactor,
      smallPrimeRight,
    );
    assert.equal(
      flint.matrixEqual(flint.matrixMul(smallPrimeMatrix, answer), smallPrimeRight),
      true,
    );
  }
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
  for (const modulus of [2147483647n, 2305843009213693951n]) {
    const size = modulus <= 0xffffffffn ? 64 : 320;
    let left;
    let sample = 0;
    do {
      left = flint.nmodMatrixRandom(
        size,
        size,
        modulus,
        BigInt(8675309 + sample),
        BigInt(424242 + sample * 19),
      );
      sample += 1;
    } while (flint.matrixDet(left) === 0n);
    const unchanged = flint.nmodMatrixRandom(
      size,
      size,
      modulus,
      BigInt(8675309 + sample - 1),
      BigInt(424242 + (sample - 1) * 19),
    );
    const right = flint.nmodMatrixRandom(
      size,
      4,
      modulus,
      1234567n,
      7654321n,
    );
    const factor = primeFieldAddon.prime_field_factor(left);
    assert.equal(factor.algorithm, "blocked");
    assert.equal(primeFieldAddon.prime_field_factor_rank(factor), size);
    assert.equal(
      primeFieldAddon.prime_field_factor_determinant(factor),
      flint.matrixDet(left),
    );
    assert.equal(
      flint.matrixEqual(
        primeFieldAddon.prime_field_factor_echelon(factor),
        flint.matrixRref(left),
      ),
      true,
    );
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const answer = primeFieldAddon.prime_field_factor_solve(factor, right);
      assert.equal(flint.matrixEqual(flint.matrixMul(left, answer), right), true);
    }
    assert.equal(flint.matrixEqual(left, unchanged), true);
  }
  {
    const size = 32;
    const entries = Array.from(
      { length: size * size },
      (_unused, index) => {
        const row = Math.floor(index / size);
        const column = index % size;
        return row === column && row + 1 < size ? 1n : 0n;
      },
    );
    const singular = flint.nmodMatrix(size, size, entries, 65521n);
    const factor = primeFieldAddon.prime_field_factor(singular);
    assert.equal(factor.algorithm, "classical");
    assert.equal(primeFieldAddon.prime_field_factor_rank(factor), size - 1);
    assert.equal(primeFieldAddon.prime_field_factor_determinant(factor), 0n);
    assert.equal(
      flint.matrixEqual(
        primeFieldAddon.prime_field_factor_echelon(factor),
        flint.matrixRref(singular),
      ),
      true,
    );
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
  assert.throws(
    () => primeFieldAddon.prime_field_factor_rank(smallPrimeMatrix),
    /decomposition/,
  );
  const rectangularFactor = primeFieldAddon.prime_field_factor(
    flint.nmodMatrix(1, 2, [1n, 2n], 5n),
  );
  assert.throws(
    () => primeFieldAddon.prime_field_factor_determinant(rectangularFactor),
    /square matrix/,
  );
  assert.throws(
    () => primeFieldAddon.prime_field_factor_solve(
      smallPrimeFactor,
      flint.nmodMatrix(2, 1, [1n, 0n], 7n),
    ),
    /base rings differ/,
  );
  const singularFactor = primeFieldAddon.prime_field_factor(
    flint.nmodMatrix(2, 2, [1n, 2n, 2n, 4n], 5n),
  );
  assert.throws(
    () => primeFieldAddon.prime_field_factor_solve(
      singularFactor,
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
    prime_field_factor,
    prime_field_factor_rank,
    prime_field_factor_determinant,
    prime_field_factor_echelon,
    prime_field_factor_solve,
)
from sagejs.native import is_compiled
import sagejs.runtime as runtime

backend = runtime.flint_backend()
def legacy_oracle(source):
    return source._new(backend.nmodMatrix(
        source.nrows(), source.ncols(),
        [runtime.integer_bigint(value.lift()) for value in source.list()],
        runtime.integer_bigint(source.base_ring().characteristic()),
    ))

A = legacy_oracle(matrix(GF(5), 2, 2, [1, 2, 3, 4]))
B = legacy_oracle(matrix(GF(5), 2, 1, [1, 0]))
C = matrix(GF(2305843009213693951), 1, 1, [1])
X = prime_field_solve(A, B)
D = prime_field_factor(A)
print(prime_field_rank(A))
print(prime_field_determinant(A))
print(prime_field_echelon(A).list() == A.echelon_form().list())
print(X.list() == [GF(5)(3), GF(5)(4)])
print(D.rank())
print(D.determinant())
print(D.echelon().list() == A.echelon_form().list())
print(D.solve(B).list() == X.list())
print(D.algorithm)
print(is_compiled(prime_field_rank))
print(prime_field_rank.backendFor(A) if is_compiled(prime_field_rank) else 'fallback')
print(prime_field_rank.backendFor(C) if is_compiled(prime_field_rank) else 'fallback')
try:
    prime_field_rank(A, A)
except Exception as error:
    print(isinstance(error, TypeError))
try:
    prime_field_solve(
        A, legacy_oracle(matrix(GF(7), 2, 1, [1, 0])))
except Exception as error:
    print(isinstance(error, ValueError))
`;
  const primeFieldEnvironment = {
    SAGEJS_NATIVE_CACHE_DIR: join(temporary, "prime-field-cache"),
  };
  assert.deepEqual(
    runSage(primeFieldScript, primeFieldEnvironment),
    [
      "2", "3", "True", "True", "2", "3", "True", "True", "classical",
      "True", "u32", "u64",
      "True", "True",
    ],
  );
  assert.deepEqual(
    runSage(primeFieldScript, {
      ...primeFieldEnvironment,
      SAGEJS_NATIVE_AUTOLOAD: "0",
    }),
    [
      "2", "3", "True", "True", "2", "3", "True", "True", "python",
      "False", "fallback", "fallback",
      "True", "True",
    ],
  );
  const primeFieldSourceScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_prime_field_source import source_prime_matmul, source_prime_rank
from sagejs.native import is_compiled
import sagejs.runtime as runtime

backend = runtime.flint_backend()
def legacy_oracle(source):
    return source._new(backend.nmodMatrix(
        source.nrows(), source.ncols(),
        [runtime.integer_bigint(value.lift()) for value in source.list()],
        runtime.integer_bigint(source.base_ring().characteristic()),
    ))

A = legacy_oracle(matrix(GF(5), 3, 3, [1, 2, 3, 0, 1, 4, 2, 0, 1]))
B = legacy_oracle(matrix(GF(5), 3, 2, [1, 2, 3, 4, 0, 1]))
expected = matrix(GF(5), 3, 2, [2, 3, 3, 3, 2, 0])
answer = source_prime_matmul(A, B)
print(source_prime_rank(A))
print(answer.list() == expected.list())
print(answer.dimensions())
print(is_compiled(source_prime_rank))
try:
    source_prime_matmul(
        A, legacy_oracle(matrix(GF(5), 2, 1, [1, 2])))
except Exception as error:
    print(isinstance(error, ValueError))
try:
    source_prime_matmul(
        A, legacy_oracle(matrix(GF(7), 3, 1, [1, 2, 3])))
except Exception as error:
    print(isinstance(error, ValueError))
`;
  const primeFieldSourceEnvironment = {
    SAGEJS_NATIVE_CACHE_DIR: join(temporary, "prime-field-source-cache"),
  };
  assert.deepEqual(
    runSage(primeFieldSourceScript, primeFieldSourceEnvironment),
    ["3", "True", "(3, 2)", "True", "True", "True"],
  );
  assert.deepEqual(
    runSage(primeFieldSourceScript, {
      ...primeFieldSourceEnvironment,
      SAGEJS_NATIVE_AUTOLOAD: "0",
    }),
    ["3", "True", "(3, 2)", "False", "True", "True"],
  );
  assert.deepEqual(
    runSage(primeFieldSourceScript, {
      ...primeFieldSourceEnvironment,
      SAGEJS_NATIVE_DISABLE: "1",
    }),
    ["3", "True", "(3, 2)", "False", "True", "True"],
  );
  const integerCache = join(temporary, "integer-cache");
  const integerKernel = await nativeApi.compile({
    sourcePath: integerSourcePath,
    sourceKey: "fixtures/native-integer-buffer.py",
    cacheRoot: integerCache,
  });
  assert.equal(typeof integerKernel.coreSourcePath, "string");
  assert.equal(typeof integerKernel.coreHeaderPath, "string");
  const emittedCore = readFileSync(integerKernel.coreSourcePath, "utf8");
  assert.doesNotMatch(
    emittedCore,
    /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/,
  );
  const standaloneDriver = join(temporary, "native-core-driver.c");
  writeFileSync(standaloneDriver, `#include <stdio.h>
#include "kernel_core.h"
int main(void)
{
    mpz_t answer, large;
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    mpz_init(answer);
    mpz_init_set_ui(large, 1);
    mpz_mul_2exp(large, large, 190);
    mpz_add_ui(large, large, 17);
    if (!sagejs_kernel_integer_quadratic_sum(&status, answer, 10))
    {
        fprintf(stderr, "%s\\n", status.message);
        return 1;
    }
    gmp_printf("%Zd\\n", answer);
    if (!sagejs_kernel_integer_round_trip(&status, answer, large))
    {
        fprintf(stderr, "%s\\n", status.message);
        return 1;
    }
    if (mpz_cmp(answer, large) != 0)
    {
        fprintf(stderr, "large exact scalar did not round trip\\n");
        return 1;
    }
    gmp_printf("%Zd\\n", answer);
    mpz_clear(large);
    mpz_clear(answer);
    return 0;
}
`);
  if (process.platform !== "win32" &&
      spawnSync(process.env.CC || "cc", ["--version"]).status === 0) {
    const standalone = join(temporary, "native-core-standalone");
    const nativePrefix = join(root, "packages", "flint", ".native", "prefix");
    const buildStandalone = spawnSync(process.env.CC || "cc", [
      "-O3",
      `-I${integerKernel.outputPath}`,
      `-I${join(nativePrefix, "include")}`,
      integerKernel.coreSourcePath,
      standaloneDriver,
      join(nativePrefix, "lib", "libgmp.a"),
      "-lm",
      "-o", standalone,
    ], { encoding: "utf8" });
    assert.equal(buildStandalone.status, 0, buildStandalone.stderr);
    const runStandalone = spawnSync(standalone, [], { encoding: "utf8" });
    assert.equal(runStandalone.status, 0, runStandalone.stderr);
    assert.deepEqual(
      runStandalone.stdout.trim().split("\n"),
      ["-275", ((1n << 190n) + 17n).toString()],
    );

    const cowasmRoot = join(root, "..", "cowasm");
    const wasiSdk = join(
      cowasmRoot, "core", "build", "build", "wasi-sdk", "dist",
      "wasi-sdk-next", "native",
    );
    const wasiClang = join(wasiSdk, "bin", "clang");
    const wasiGmp = join(cowasmRoot, "sagemath", "gmp", "dist", "wasi-sdk");
    const wasiRun = join(
      root, "packages", "flint-wasm", "node_modules", ".bin", "wasi-run",
    );
    if (existsSync(wasiClang) && existsSync(wasiRun) &&
        existsSync(join(wasiGmp, "lib", "libgmp.a"))) {
      const wasm = join(temporary, "native-core.wasm");
      const buildWasm = spawnSync(wasiClang, [
        "--target=wasm32-wasip1",
        `--sysroot=${join(wasiSdk, "share", "wasi-sysroot")}`,
        "-O3",
        `-I${integerKernel.outputPath}`,
        `-I${join(wasiGmp, "include")}`,
        integerKernel.coreSourcePath,
        standaloneDriver,
        join(root, "packages", "flint-wasm", "src", "wasi-stubs.c"),
        `-L${join(wasiGmp, "lib")}`,
        "-lgmp", "-lm", "-lwasi-emulated-signal",
        "-o", wasm,
      ], { encoding: "utf8" });
      assert.equal(buildWasm.status, 0, buildWasm.stderr);
      const runWasm = spawnSync(wasiRun, [wasm], { encoding: "utf8" });
      assert.equal(runWasm.status, 0, runWasm.stderr);
      assert.deepEqual(
        runWasm.stdout.trim().split("\n"),
        ["-275", ((1n << 190n) + 17n).toString()],
      );
    }
  }
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
  const adaptiveWrapperStart = integerAdapterC.indexOf(
    "static napi_value compiled_integer_quadratic_sum(",
  );
  const forcedWrapperStart = integerAdapterC.indexOf(
    "static napi_value compiled_integer_quadratic_sum_gmp(",
  );
  const adaptiveWrapper = integerAdapterC.slice(
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
  assert.equal(typeof cliResult.coreSourcePath, "string");
  assert.equal(typeof cliResult.coreHeaderPath, "string");
  assert.deepEqual(cliResult.callGraph.native_lcm, ["native_gcd"]);
  assert.equal(cliResult.analysis.native_gcd.backend.minimumBits, 64);
  assert.equal(cliResult.analysis.native_lcm.storage.scratchSlots, 2);
  const explainCli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "explain",
      integerAlgorithmsPath,
      "--function",
      "native_gcd",
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(explainCli.status, 0, explainCli.stderr);
  const explanation = JSON.parse(explainCli.stdout);
  assert.equal(explanation.eligible, true);
  assert.equal(explanation.functions[0].analysis.backend.minimumBits, 64);
  assert.ok(explanation.functions[0].ir.operations > 0);
  const emitCli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "emit-c",
      primeFieldSourcePath,
      "--function",
      "source_prime_rank",
      "--json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  assert.equal(emitCli.status, 0, emitCli.stderr);
  const emission = JSON.parse(emitCli.stdout);
  assert.match(emission.cSource, /#include "kernel_core\.c"/);
  assert.equal(emission.sourceMap.length, 0);
  const emitCoreCli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "emit-core-c",
      integerAlgorithmsPath,
      "--function",
      "native_gcd",
      "--json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  assert.equal(emitCoreCli.status, 0, emitCoreCli.stderr);
  const coreEmission = JSON.parse(emitCoreCli.stdout);
  assert.equal(coreEmission.hostIsolation.isolated, true);
  assert.equal(coreEmission.hostIsolation.hostCallbacks, 0);
  assert.match(coreEmission.coreSource, /sagejs_kernel_native_gcd/);
  assert.doesNotMatch(coreEmission.coreSource, /\bnapi_/);
  assert.match(coreEmission.coreHeader, /sagejs_kernel_native_gcd/);
  const emittedHeaderPath = join(temporary, "emitted-kernel-core.h");
  const emitHeaderCli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "emit-header",
      integerAlgorithmsPath,
      "--function",
      "native_gcd",
      "--output",
      emittedHeaderPath,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(emitHeaderCli.status, 0, emitHeaderCli.stderr);
  assert.match(readFileSync(emittedHeaderPath, "utf8"), /sagejs_kernel_native_gcd/);
  const benchmarkCli = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "native",
      "benchmark",
      integerAlgorithmsPath,
      "--function",
      "native_gcd",
      "--args",
      "[92250,922350]",
      "--warmup",
      "1",
      "--repeat",
      "2",
      "--cache-root",
      join(temporary, "cli-cache"),
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(benchmarkCli.status, 0, benchmarkCli.stderr);
  const benchmarkResult = JSON.parse(benchmarkCli.stdout);
  assert.deepEqual(
    benchmarkResult.implementations.map((item) => item.name),
    ["selected", "javascript", "tagged", "gmp"],
  );
  const integerIndex = JSON.parse(
    readFileSync(join(integerCache, "index.json"), "utf8"),
  );
  assert.equal(integerIndex.schema, "sagejs.native-cache/v3");
  assert.equal(
    integerIndex.sources[integerSourcePath].cacheKey,
    integerKernel.cacheKey,
  );
  assert.deepEqual(
    integerIndex.logicalSources["fixtures/native-integer-buffer.py"],
    integerIndex.sources[integerSourcePath],
  );
  assert.equal(
    integerIndex.sources[integerSourcePath].nativeAbi,
    NATIVE_ABI_VERSION,
  );
  assert.deepEqual(
    integerIndex.sources[integerSourcePath].foreignDeclarations,
    [],
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

  const numericalBuffersScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench", "cowasm", "native"))})

from numerical_buffers import matrix_multiply_repeated
from sagejs.native import is_compiled

left = [1.0, 2.0, 3.0, 4.0]
right = [1.0, 0.0, 0.0, 1.0]
scratch = [0.0, 0.0, 0.0, 0.0]
print(matrix_multiply_repeated(left, right, scratch, 2, 1))
print(scratch)
print(is_compiled(matrix_multiply_repeated))
`;
  assert.deepEqual(
    runSage(numericalBuffersScript, {
      SAGEJS_NATIVE_CACHE_DIR: join(temporary, "numerical-buffers-cache"),
    }),
    ["10", "[1, 2, 3, 4]", "True"],
  );
  assert.deepEqual(
    runSage(numericalBuffersScript, {
      SAGEJS_NATIVE_CACHE_DIR: join(temporary, "numerical-buffers-cache"),
      SAGEJS_NATIVE_DISABLE: "1",
    }),
    ["10", "[1, 2, 3, 4]", "True"],
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
  const reductionsScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_reductions import sum_gcd_reduction
from sagejs.native import execution_mode, is_compiled

print(sum_gcd_reduction(1000))
print(is_compiled(sum_gcd_reduction))
print(execution_mode(sum_gcd_reduction))
print(execution_mode(sum_gcd_reduction, 1000))
print(getattr(sum_gcd_reduction, 'nativeAvailable', None))
`;
  const reductionsEnvironment = {
    SAGEJS_NATIVE_CACHE_DIR: join(temporary, "reductions-cache"),
  };
  assert.deepEqual(runSage(reductionsScript, reductionsEnvironment), [
    "1500", "True", "native-capable", "native", "True",
  ]);
  assert.deepEqual(
    runSage(reductionsScript, {
      ...reductionsEnvironment,
      SAGEJS_NATIVE_MODE: "javascript",
    }),
    ["1500", "True", "javascript", "javascript", "False"],
  );
  assert.deepEqual(
    runSage(reductionsScript, {
      ...reductionsEnvironment,
      SAGEJS_NATIVE_MODE: "dynamic",
    }),
    ["1500", "False", "dynamic", "dynamic", "None"],
  );
  assert.deepEqual(
    runSage(reductionsScript, {
      ...reductionsEnvironment,
      SAGEJS_NATIVE_MODE: "native",
    }),
    ["1500", "True", "native", "native", "True"],
  );
  const ergonomicsScript = `import sys
sys.path.append(${JSON.stringify(join(root, "bench"))})

from native_v20_ergonomics import quadratic_sum, quadratic_sum_declared
from native_v20_ergonomics import float64_record_at
from sagejs.native import kernel_float64_buffer

print(quadratic_sum(1000))
print(quadratic_sum_declared(1000))
for value in (1.0, 1.5, '10'):
    try:
        quadratic_sum(value)
    except TypeError as error:
        print('TypeError', str(error))
for value in (-1, 2**64):
    try:
        quadratic_sum(value)
    except OverflowError as error:
        print('OverflowError', str(error))
state = kernel_float64_buffer(float64_record_at, [0,1,2,3,4,5,6])
print(float64_record_at(state, 0, 7, 6))
for args in ((state,4,7,0),(state,0,7,100)):
    try:
        float64_record_at(*args)
    except IndexError as error:
        print('IndexError', str(error))
`;
  assert.deepEqual(
    runSage(ergonomicsScript, {
      SAGEJS_NATIVE_CACHE_DIR: join(temporary, "ergonomics-cache"),
    }),
    [
      "332833500",
      "332833500",
      "TypeError n must be an exact integer",
      "TypeError n must be an exact integer",
      "TypeError n must be an exact integer",
      "OverflowError n is outside uint64",
      "OverflowError n is outside uint64",
      "6",
      "IndexError Float64Record is outside its buffer",
      "IndexError Float64 buffer index out of range",
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

console.log(
  "Native Kernel v21 canonical isolated cores, records, reductions, buffers, provenance, P1, ABI, FFI, and fallback passed.",
);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
