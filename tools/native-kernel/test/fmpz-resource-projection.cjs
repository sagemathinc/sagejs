// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");
const {
  sanitizerEnvironment,
} = require("../../../test/helpers/sanitizers.cjs");

const root = resolve(__dirname, "../../..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const source = String.raw`
from sagejs.ffi.flint import (
    fmpz_polynomial,
    fmpz_polynomial_seal,
    fmpz_polynomial_set_coefficient,
    number_field_analysis_resource_project,
    number_field_analysis_resource_project_proof,
    number_field_analyze_resource,
)
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def resident_field_projection(
    output: IntegerBuffer,
    proof: IntegerBuffer,
    coefficients: IntegerBuffer,
    scale: int,
    one: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> bool:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        scratch = arena.integer_vector(1, 0)
        polynomial = arena.foreign_resource(fmpz_polynomial, 4)
        index: uint64 = 0
        while index < 4:
            if not fmpz_polynomial_set_coefficient(
                polynomial, index, coefficients[index]
            ):
                return False
            index += 1
        if not fmpz_polynomial_seal(polynomial):
            return False
        analysis = arena.foreign_resource(
            number_field_analyze_resource,
            polynomial,
            scale,
            1000,
        )
        if not number_field_analysis_resource_project(
            output, analysis, len(output), one
        ):
            return False
        if not number_field_analysis_resource_project_proof(
            proof, analysis, len(proof), one
        ):
            return False
        scratch[0] = output[4]
        return scratch[0] == scale and proof[8] == scale
`;

const unsupportedSource = String.raw`
from sagejs.ffi.flint import (
    FmpzPolynomial,
    fmpz_polynomial,
    fmpz_polynomial_length,
)
from sagejs.native import NativeExactArena, native, uint64


@native
def unsupported_polynomial_length(polynomial: FmpzPolynomial) -> int:
    return fmpz_polynomial_length(polynomial)


@native
def rejected_projection_root(
    memory_limit: uint64, temporary_limit: uint64
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        scratch = arena.integer_vector(1, 0)
        polynomial = arena.foreign_resource(fmpz_polynomial, 1)
        scratch[0] = unsupported_polynomial_length(polynomial)
        return scratch[0]
`;

function emittedFunction(text, marker) {
  let start = text.indexOf(marker);
  while (
    start !== -1 &&
    text.slice(start, text.indexOf("\n", start)).endsWith(";")
  ) {
    start = text.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const candidates = ["\nstatic ", "\nint sagejs_kernel_"]
    .map((next) => text.indexOf(next, start + marker.length))
    .filter((value) => value !== -1);
  const end = candidates.length === 0 ? text.length : Math.min(...candidates);
  return text.slice(start, end);
}

test("resident field resources qualify a direct fmpz projection", async () => {
  const ir = await lowerSource(source, "fmpz-resource-projection.py");
  const witness = ir.functions.find(
    (fn) => fn.name === "resident_field_projection",
  );
  assert.equal(witness.analysis.backend.kind, "fmpz");
  assert.deepEqual(
    witness.foreignResources.map((resource) => resource.id).sort(),
    ["fmpz_polynomial", "number_field_analysis_resource"],
  );

  const core = generateHostCore(ir).source;
  assert.match(
    core,
    /sagejs_integer_buffer_set_fmpz[\s\S]*memset\(slot, 0, buffer->word_capacity \* sizeof\(\*slot\)\)/,
  );
  const body = emittedFunction(
    core,
    "static int fmpz_native_resident_field_projection(",
  );
  assert.match(body, /sagejs_fmpz_polynomial_init/);
  assert.match(body, /sagejs_fmpz_polynomial_set_coefficient/);
  assert.match(body, /sagejs_fmpz_polynomial_seal/);
  assert.match(body, /sagejs_number_field_analyze_resource/);
  assert.match(body, /sagejs_number_field_analysis_resource_project\(/);
  assert.match(body, /sagejs_number_field_analysis_resource_project_proof\(/);
  assert.match(body, /fmpz_mat_init/);
  assert.match(body, /fmpz_bits/);
  assert.match(body, /sagejs_words > \(size_t\) INT32_MAX/);
  assert.match(body, /sagejs_integer_buffer_set_fmpz/);
  assert.doesNotMatch(body, /fmpz_(?:set|get)_mpz/);
  assert.doesNotMatch(body, /sagejs_integer_buffer_(?:set|get)_mpz/);
  assert.doesNotMatch(body, /\bmpz_/);

  const preflight = body.indexOf("const flint_bitcnt_t sagejs_bits");
  const commit = body.indexOf("sagejs_integer_buffer_set_fmpz");
  assert.ok(preflight >= 0 && commit > preflight);
  assert.ok(
    body.indexOf("FFI resource argument is below minimum 1") <
      body.indexOf("integer matrix buffer length does not match dimensions"),
  );
  assert.match(
    body,
    /sagejs_number_field_analysis_resource_clear\(sagejs_analysis\)[\s\S]*sagejs_fmpz_polynomial_clear\(sagejs_polynomial\)[\s\S]*sagejs_native_fmpz_vector_clear\(&sagejs_scratch\)/,
  );
});

test("one unsupported FFI helper rejects the complete fmpz graph", async () => {
  const ir = await lowerSource(
    unsupportedSource,
    "unsupported-fmpz-resource-projection.py",
  );
  for (const fn of ir.functions) {
    assert.notEqual(fn.analysis.backend.kind, "fmpz", fn.name);
  }
  assert.equal(
    ir.functions.find((fn) => fn.name === "rejected_projection_root").analysis
      .backend.kind,
    "gmp",
  );
});

test("fmpz projections agree and failed publication leaves sentinels intact", {
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-project-"));
  try {
    const sourcePath = join(temporary, "fmpz_resource_projection.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const runner = String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const witness = module.resident_field_projection;
assert.equal(witness.backendPolicy.kind, "fmpz");
assert.equal(witness.nativeAvailable, true);

const coefficients = [-55n, 9n, 0n, 1n];
const scale = (1n << 130n) + 51n;
const poison = 0xdedebabecafef00dn;
const implementations = [
  witness.fmpz,
  witness.gmp,
  witness.tagged,
  witness.javascript,
];
function assertCanonical(sizes, limbs, wordCapacity) {
  for (let position = 0; position < sizes.length; position += 1) {
    const used = Math.abs(sizes[position]);
    for (let word = used; word < wordCapacity; word += 1) {
      assert.equal(limbs[position * wordCapacity + word], 0n);
    }
  }
}
const results = implementations.map((implementation) => {
  const output = witness.createIntegerBuffer(64, 16);
  const proof = witness.createIntegerBuffer(109, 16);
  output.limbs.fill(poison);
  proof.limbs.fill(poison);
  const answer = implementation(
    output,
    proof,
    witness.packIntegerBuffer(coefficients),
    scale,
    1n,
    32n << 20n,
    64n << 20n,
  );
  return [
    answer,
    output.toArray(),
    proof.toArray(),
    Array.from(output.sizes),
    Array.from(output.limbs),
    Array.from(proof.sizes),
    Array.from(proof.limbs),
  ];
});
for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
assert.equal(results[0][0], true);
assert.ok(results[0][1].some((value) => value < 0n));
assert.ok(results[0][1].some((value) => value > (1n << 64n)));
assertCanonical(results[0][3], results[0][4], 16);
assertCanonical(results[0][5], results[0][6], 16);

const sentinel = 313n;
const coefficientsBuffer = witness.packIntegerBuffer(coefficients);
const shortOutput = witness.createIntegerBuffer(1, 16, [sentinel]);
const untouchedProof = witness.createIntegerBuffer(
  109, 16, Array(109).fill(sentinel),
);
assert.throws(
  () => witness.fmpz(
    shortOutput, untouchedProof, coefficientsBuffer, scale, 1n,
    32n << 20n, 64n << 20n,
  ),
  /projection is invalid/,
);
assert.deepEqual(shortOutput.toArray(), [sentinel]);
assert.ok(untouchedProof.toArray().every((value) => value === sentinel));

const capacityOutput = witness.createIntegerBuffer(
  64, 1, Array(64).fill(sentinel),
);
const capacityProof = witness.createIntegerBuffer(
  109, 16, Array(109).fill(sentinel),
);
assert.throws(
  () => witness.fmpz(
    capacityOutput, capacityProof, coefficientsBuffer, scale, 1n,
    32n << 20n, 64n << 20n,
  ),
  /IntegerBuffer word capacity exceeded/,
);
assert.ok(capacityOutput.toArray().every((value) => value === sentinel));
assert.ok(capacityProof.toArray().every((value) => value === sentinel));

for (const implementation of implementations) {
  const committedOutput = witness.createIntegerBuffer(
    64, 16, Array(64).fill(sentinel),
  );
  const rejectedProof = witness.createIntegerBuffer(
    109, 1, Array(109).fill(sentinel),
  );
  assert.throws(
    () => implementation(
      committedOutput, rejectedProof, coefficientsBuffer, scale, 1n,
      32n << 20n, 64n << 20n,
    ),
    /IntegerBuffer word capacity exceeded/,
  );
  assert.deepEqual(committedOutput.toArray(), results[0][1]);
  assert.ok(rejectedProof.toArray().every((value) => value === sentinel));
}

const shapeOutput = witness.createIntegerBuffer(
  64, 16, Array(64).fill(sentinel),
);
const shapeProof = witness.createIntegerBuffer(
  109, 16, Array(109).fill(sentinel),
);
assert.throws(
  () => witness.fmpz(
    shapeOutput, shapeProof, coefficientsBuffer, scale, 2n,
    32n << 20n, 64n << 20n,
  ),
  /buffer length does not match dimensions/,
);
assert.ok(shapeOutput.toArray().every((value) => value === sentinel));
assert.ok(shapeProof.toArray().every((value) => value === sentinel));

const minimumErrors = implementations.map((implementation) => {
  const minimumOutput = witness.createIntegerBuffer(
    64, 16, Array(64).fill(sentinel),
  );
  const minimumProof = witness.createIntegerBuffer(
    109, 16, Array(109).fill(sentinel),
  );
  let error = null;
  try {
    implementation(
      minimumOutput, minimumProof, coefficientsBuffer, scale, 0n,
      32n << 20n, 64n << 20n,
    );
  } catch (caught) {
    error = caught;
  }
  assert.match(error?.message || "", /FFI resource argument is below minimum 1/);
  assert.ok(minimumOutput.toArray().every((value) => value === sentinel));
  assert.ok(minimumProof.toArray().every((value) => value === sentinel));
  return [error.constructor.name, error.message];
});
for (const error of minimumErrors.slice(1)) {
  assert.deepEqual(error, minimumErrors[0]);
}
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("transactional fmpz projection cleanup survives sanitizers", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
  timeout: 180_000,
}, async () => {
  const ir = await lowerSource(source, "fmpz-resource-projection-asan.py");
  const core = generateHostCore(ir);
  const originalBody = emittedFunction(
    core.source,
    "static int fmpz_native_resident_field_projection(",
  );
  const injectedProjector = String.raw`
static int sagejs_test_projection_failure = 0;

static int sagejs_test_number_field_analysis_resource_project(
    fmpz_mat_t output,
    const sagejs_number_field_analysis_resource_t resource)
{
    if (!sagejs_test_projection_failure)
        return sagejs_number_field_analysis_resource_project(output, resource);
    fmpz_mat_zero(output);
    if (fmpz_mat_nrows(output) > 0 && fmpz_mat_ncols(output) > 0)
    {
        fmpz_one(fmpz_mat_entry(output, 0, 0));
        fmpz_mul_2exp(fmpz_mat_entry(output, 0, 0),
            fmpz_mat_entry(output, 0, 0), 130);
        fmpz_neg(fmpz_mat_entry(output, 0, 0),
            fmpz_mat_entry(output, 0, 0));
    }
    return 0;
}

`;
  const failingBody = originalBody.replace(
    "sagejs_number_field_analysis_resource_project(",
    "sagejs_test_number_field_analysis_resource_project(",
  );
  assert.notEqual(failingBody, originalBody);
  const sanitizerCore = core.source.replace(
    originalBody,
    injectedProjector + failingBody,
  );
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-project-asan-"));
  const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <gmp.h>
#include "kernel_core.c"

int main(void)
{
    enum { CAPACITY = 16, OUTPUT_LENGTH = 64, PROOF_LENGTH = 109 };
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    int32_t output_sizes[OUTPUT_LENGTH] = {0};
    int32_t proof_sizes[PROOF_LENGTH] = {0};
    int32_t coefficient_sizes[4] = {1, 1, 0, 1};
    uint64_t output_limbs[OUTPUT_LENGTH * CAPACITY] = {0};
    uint64_t proof_limbs[PROOF_LENGTH * CAPACITY] = {0};
    uint64_t coefficient_limbs[4 * CAPACITY] = {0};
    sagejs_integer_buffer output = {
        output_sizes, output_limbs, OUTPUT_LENGTH, CAPACITY
    };
    sagejs_integer_buffer proof = {
        proof_sizes, proof_limbs, PROOF_LENGTH, CAPACITY
    };
    sagejs_integer_buffer coefficients = {
        coefficient_sizes, coefficient_limbs, 4, CAPACITY
    };
    mpz_t scale;
    int answer = 0;
    coefficient_sizes[0] = -1;
    coefficient_limbs[0] = 55;
    coefficient_limbs[CAPACITY] = 9;
    coefficient_limbs[3 * CAPACITY] = 1;
    mpz_init(scale);
    mpz_ui_pow_ui(scale, 2, 130);
    mpz_add_ui(scale, scale, 51);
    for (unsigned round = 0; round < 20; round += 1)
    {
        sagejs_native_status_reset(&status);
        assert(sagejs_kernel_resident_field_projection(
            &status, &answer, output, proof, coefficients, scale, 1,
            UINT64_C(32) << 20, UINT64_C(64) << 20));
        assert(status.code == SAGEJS_NATIVE_OK && answer);
    }

    for (size_t index = 0; index < OUTPUT_LENGTH; index++)
    {
        output_sizes[index] = 1;
        output_limbs[index * CAPACITY] = 313;
    }
    for (size_t index = 0; index < PROOF_LENGTH; index++)
    {
        proof_sizes[index] = 1;
        proof_limbs[index * CAPACITY] = 313;
    }
    sagejs_test_projection_failure = 1;
    sagejs_native_status_reset(&status);
    assert(!sagejs_kernel_resident_field_projection(
        &status, &answer, output, proof, coefficients, scale, 1,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    assert(status.code != SAGEJS_NATIVE_OK);
    for (size_t index = 0; index < OUTPUT_LENGTH; index++)
        assert(output_sizes[index] == 1 &&
            output_limbs[index * CAPACITY] == 313);
    for (size_t index = 0; index < PROOF_LENGTH; index++)
        assert(proof_sizes[index] == 1 &&
            proof_limbs[index * CAPACITY] == 313);
    sagejs_test_projection_failure = 0;

    int32_t short_size[1] = {1};
    uint64_t short_limbs[CAPACITY] = {313};
    sagejs_integer_buffer short_output = {
        short_size, short_limbs, 1, CAPACITY
    };
    sagejs_native_status_reset(&status);
    assert(!sagejs_kernel_resident_field_projection(
        &status, &answer, short_output, proof, coefficients, scale, 1,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    assert(status.code != SAGEJS_NATIVE_OK);
    assert(short_size[0] == 1 && short_limbs[0] == 313);

    int32_t capacity_sizes[OUTPUT_LENGTH];
    uint64_t capacity_limbs[OUTPUT_LENGTH];
    sagejs_integer_buffer capacity_output = {
        capacity_sizes, capacity_limbs, OUTPUT_LENGTH, 1
    };
    for (size_t index = 0; index < OUTPUT_LENGTH; index++)
    {
        capacity_sizes[index] = 1;
        capacity_limbs[index] = 313;
    }
    sagejs_native_status_reset(&status);
    assert(!sagejs_kernel_resident_field_projection(
        &status, &answer, capacity_output, proof, coefficients, scale, 1,
        UINT64_C(32) << 20, UINT64_C(64) << 20));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    for (size_t index = 0; index < OUTPUT_LENGTH; index++)
        assert(capacity_sizes[index] == 1 && capacity_limbs[index] == 313);
    mpz_clear(scale);
    return 0;
}
  `;
  try {
    writeFileSync(join(temporary, "kernel_core.c"), sanitizerCore);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), harness);
    const executable = join(temporary, "fmpz-resource-projection-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const libraries = [
      join(prefix, "lib", "libflint.a"),
      join(prefix, "lib", "libmpfr.a"),
      join(prefix, "lib", "libgmp.a"),
      join(prefix, "lib", "libopenblas.a"),
    ];
    const groupedLibraries = process.platform === "darwin"
      ? libraries
      : ["-Wl,--start-group", ...libraries, "-Wl,--end-group"];
    const build = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`,
      `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "harness.c"),
      ...groupedLibraries,
      "-lm",
      "-lpthread",
      "-ldl",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    if (build.error) throw build.error;
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const execution = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment(),
      timeout: 120_000,
    });
    if (execution.error) throw execution.error;
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
