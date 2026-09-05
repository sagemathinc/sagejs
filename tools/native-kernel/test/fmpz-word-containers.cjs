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
from sagejs.native import (
    NativeExactArena,
    NativeIntegerVector,
    UInt64Buffer,
    checked_uint64,
    native,
    uint64,
)


@native
def fmpz_checked_word(value: int) -> uint64:
    return checked_uint64(value)


@native
def fmpz_floor_mod_word(value: int, modulus: uint64) -> uint64:
    return value % modulus


@native
def fmpz_word_buffer_leaf(
    output: UInt64Buffer,
    source: UInt64Buffer,
    index: int,
    value: uint64,
) -> uint64:
    before = source[index]
    tail = source[-1]
    output[index] = value
    output[-1] = before + tail
    return len(source) + output[index] + output[-1]


@native
def fmpz_vector_leaf(
    values: NativeIntegerVector,
    index: int,
    other: int,
    value: int,
) -> int:
    observed = values[index]
    values[index] = value
    values.addmul(index, value, 3)
    values.submul(index, value, 2)
    values.swap(index, other)
    values.addmul(other, values[index], value)
    return observed + values[index] + values[other]


@native
def resident_fmpz_word_program(
    output: UInt64Buffer,
    source: UInt64Buffer,
    buffer_index: int,
    vector_index: int,
    other_index: int,
    value: int,
    modulus: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> tuple[int, uint64, uint64]:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(4, 0)
        values[0] = 11
        values[1] = 17
        vector_total = fmpz_vector_leaf(
            values, vector_index, other_index, value
        )
        converted = fmpz_checked_word(value)
        residue = fmpz_floor_mod_word(value, modulus)
        buffer_total = fmpz_word_buffer_leaf(
            output, source, buffer_index, converted
        )
        return vector_total + buffer_total, converted, residue


@native
def resident_fmpz_vector_operation(
    output: UInt64Buffer,
    operation: uint64,
    index: int,
    other: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(2, 0)
        values[0] = 11
        values[1] = 17
        observed = 0
        if operation == 0:
            observed = values[index]
        elif operation == 1:
            values[index] = 23
        elif operation == 2:
            values.addmul(index, 3, 5)
        elif operation == 3:
            values.submul(index, 3, 5)
        else:
            values.swap(index, other)
        output[0] = checked_uint64(values[0])
        output[1] = checked_uint64(values[1])
        return observed + values[0] + values[1]
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
  const markers = ["\nstatic ", "\nint sagejs_kernel_"];
  const candidates = markers
    .map((next) => text.indexOf(next, start + marker.length))
    .filter((value) => value !== -1);
  const end = candidates.length === 0 ? text.length : Math.min(...candidates);
  return text.slice(start, end);
}

test("fmpz word and container operations qualify one closed graph", async () => {
  const ir = await lowerSource(source, "fmpz-word-containers.py");
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  assert.deepEqual(
    Array.from(functions, ([name, fn]) => [name, fn.analysis.backend.kind]),
    [
      ["fmpz_checked_word", "fmpz"],
      ["fmpz_floor_mod_word", "fmpz"],
      ["fmpz_word_buffer_leaf", "fmpz"],
      ["fmpz_vector_leaf", "fmpz"],
      ["resident_fmpz_word_program", "fmpz"],
      ["resident_fmpz_vector_operation", "fmpz"],
    ],
  );
  assert.equal(functions.get("fmpz_word_buffer_leaf").hostCallable, false);
  assert.deepEqual(
    functions.get("resident_fmpz_word_program").analysis.effects.externalWrites,
    ["output"],
  );

  const core = generateHostCore(ir).source;
  const runtime = core.slice(
    core.indexOf("static int sagejs_fmpz_to_uint64_checked("),
    core.indexOf("static uint64_t sagejs_fmpz_payload_charge("),
  );
  assert.match(runtime, /fmpz_get_uiui/);
  assert.match(runtime, /fmpz_get_signed_uiui/);
  assert.match(runtime, /sagejs_fmpz_fdiv_uint64/);
  assert.match(runtime, /fmpz_tstbit/);
  assert.match(runtime, /#if FLINT_BITS == 64/);
  assert.doesNotMatch(runtime, /\bmpz_/);

  const checked = emittedFunction(
    core,
    "static int fmpz_native_fmpz_checked_word(",
  );
  const modulo = emittedFunction(
    core,
    "static int fmpz_native_fmpz_floor_mod_word(",
  );
  const buffers = emittedFunction(
    core,
    "static int fmpz_native_fmpz_word_buffer_leaf(",
  );
  const vectors = emittedFunction(
    core,
    "static int fmpz_native_fmpz_vector_leaf(",
  );
  assert.match(checked, /sagejs_fmpz_to_uint64_checked/);
  assert.match(modulo, /fmpz_fdiv_ui/);
  assert.match(modulo, /sagejs_fmpz_fdiv_uint64/);
  assert.match(modulo, /#if FLINT_BITS == 64/);
  assert.match(buffers, /sagejs_uint64_buffer sagejs_arg_output/);
  assert.match(buffers, /sagejs_fmpz_signed_buffer_index/);
  assert.match(vectors, /sagejs_native_fmpz_vector_get_at/);
  assert.match(vectors, /sagejs_native_fmpz_vector_borrow_at/);
  assert.match(vectors, /sagejs_native_fmpz_vector_set/);
  assert.match(vectors, /sagejs_native_fmpz_vector_addmul/);
  assert.match(vectors, /sagejs_native_fmpz_vector_swap_at/);
  const checkedVectorRuntime = core.slice(
    core.indexOf("static int sagejs_native_fmpz_vector_get_at("),
    core.indexOf("\n\nstatic int native_"),
  );
  assert.match(checkedVectorRuntime, /sagejs_native_fmpz_vector_swap_at/);
  assert.doesNotMatch(checkedVectorRuntime, /\bmpz_/);
  for (const implementation of [checked, modulo, buffers, vectors]) {
    assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
    assert.doesNotMatch(implementation, /\bmpz_/);
    assert.doesNotMatch(implementation, /napi_|PyObject|JavaScript/);
  }
});

test("fmpz checked words, floor residues, indices, and aliases agree", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-words-"));
  try {
    const sourcePath = join(temporary, "fmpz_word_containers.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const runner = String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const checked = module.fmpz_checked_word;
const modulo = module.fmpz_floor_mod_word;

for (const value of [0n, 1n, (1n << 64n) - 1n]) {
  const answers = [checked.fmpz, checked.gmp, checked.tagged, checked.javascript]
    .map((implementation) => implementation(value));
  for (const answer of answers) assert.equal(answer, value);
}
for (const value of [-1n, 1n << 64n, 1n << 4096n]) {
  for (const implementation of [checked.fmpz, checked.gmp, checked.tagged, checked.javascript]) {
    assert.throws(() => implementation(value), /outside unsigned 64-bit/);
  }
}

for (const [value, modulus] of [
  [-1n, 7n],
  [-((1n << 4096n) + 12345n), (1n << 64n) - 1n],
  [(1n << 4096n) + 98765n, (1n << 64n) - 1n],
  [-(1n << 4095n), 1n],
]) {
  const expected = ((value % modulus) + modulus) % modulus;
  const answers = [modulo.fmpz, modulo.gmp, modulo.tagged, modulo.javascript]
    .map((implementation) => implementation(value, modulus));
  for (const answer of answers) assert.equal(answer, expected);
}
for (const implementation of [modulo.fmpz, modulo.gmp, modulo.tagged, modulo.javascript]) {
  assert.throws(() => implementation(17n, 0n), /division or modulo by zero/);
}

const program = module.resident_fmpz_word_program;
const implementations = [program.fmpz, program.gmp, program.tagged, program.javascript];
for (const args of [
  [0n, 0n, 1n, (1n << 63n) + 19n, (1n << 64n) - 1n],
  [-1n, 1n, 0n, (1n << 63n) + 19n, (1n << 64n) - 1n],
  [-3n, 0n, 1n, (1n << 63n) + 19n, (1n << 64n) - 1n],
]) {
  const results = implementations.map((implementation) => {
    const output = new BigUint64Array([101n, 103n, 107n]);
    const source = new BigUint64Array([5n, 7n, 11n]);
    const answer = implementation(
      output, source, ...args, 32n << 20n, 64n << 20n,
    );
    return [answer, [...output]];
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
}

const aliasResults = implementations.map((implementation) => {
  const words = new BigUint64Array([5n, 7n, 11n]);
  const answer = implementation(
    words, words, -1n, 0n, 1n, 37n, 101n, 32n << 20n, 64n << 20n,
  );
  return [answer, [...words]];
});
for (const result of aliasResults.slice(1)) assert.deepEqual(result, aliasResults[0]);

for (const index of [-4n, 3n, 1n << 4096n, -(1n << 4096n)]) {
  const output = new BigUint64Array([211n, 223n, 227n]);
  const source = new BigUint64Array([5n, 7n, 11n]);
  assert.throws(
    () => program.fmpz(
      output, source, index, 0n, 1n, 37n, 101n,
      32n << 20n, 64n << 20n,
    ),
    /UInt64Buffer index out of range/,
  );
  assert.deepEqual([...output], [211n, 223n, 227n]);
}

const probe = module.resident_fmpz_vector_operation;
const invalid = [-1n, (1n << 64n) - 1n, 1n << 64n, 1n << 4096n];
for (let operation = 0n; operation <= 4n; operation += 1n) {
  for (const index of invalid) {
    const output = new BigUint64Array([313n, 317n]);
    assert.throws(
      () => probe.fmpz(
        output, operation, index, operation === 4n ? 1n : 0n,
        32n << 20n, 64n << 20n,
      ),
      /NativeIntegerVector index out of range/,
    );
    assert.deepEqual([...output], [313n, 317n]);
  }
}
for (const other of invalid) {
  const output = new BigUint64Array([331n, 337n]);
  assert.throws(
    () => probe.fmpz(
      output, 4n, 0n, other, 32n << 20n, 64n << 20n,
    ),
    /NativeIntegerVector index out of range/,
  );
  assert.deepEqual([...output], [331n, 337n]);
}
const output = new BigUint64Array(2);
assert.equal(
  probe.fmpz(output, 4n, 0n, 1n, 32n << 20n, 64n << 20n),
  28n,
);
assert.deepEqual([...output], [17n, 11n]);
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const python =
      process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(temporary)})`,
      "from fmpz_word_containers import (",
      "    fmpz_checked_word,",
      "    fmpz_floor_mod_word,",
      "    resident_fmpz_word_program,",
      ")",
      "assert fmpz_checked_word((1 << 64) - 1) == (1 << 64) - 1",
      "value = -(1 << 4096) - 12345",
      "modulus = (1 << 64) - 1",
      "assert fmpz_floor_mod_word(value, modulus) == value % modulus",
      "output = [101, 103, 107]",
      "assert resident_fmpz_word_program(",
      "    output, [5, 7, 11], -1, 0, 1, 37, 101, 32 << 20, 64 << 20",
      ") == (778, 37, 37)",
      "assert output == [101, 103, 22]",
      "print('cpython-fmpz-word-containers-ok')",
      "",
    ].join("\n");
    const cpythonResult = spawnSync(python, ["-I", "-c", cpython], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (cpythonResult.error) throw cpythonResult.error;
    assert.equal(
      cpythonResult.status,
      0,
      cpythonResult.stderr || cpythonResult.stdout,
    );
    assert.equal(cpythonResult.stdout.trim(), "cpython-fmpz-word-containers-ok");

    const core = readFileSync(compiled.coreSourcePath, "utf8");
    for (const name of [
      "fmpz_checked_word",
      "fmpz_floor_mod_word",
      "fmpz_word_buffer_leaf",
      "fmpz_vector_leaf",
      "resident_fmpz_word_program",
      "resident_fmpz_vector_operation",
    ]) {
      const implementation = emittedFunction(
        core,
        `static int fmpz_native_${name}(`,
      );
      assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
      assert.doesNotMatch(implementation, /\bmpz_/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("fmpz read-only UInt64Buffer helpers accept immutable leases", async () => {
  const capsuleRuntime = require(
    "../../../dist/tools/immutable-uint64-capsule.js"
  );
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-lease-"));
  try {
    const sourcePath = join(temporary, "fmpz_word_containers.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const wrapper = capsuleRuntime.configureImmutableUInt64KernelWrapper(
      require(compiled.modulePath),
    );
    const owner = {};
    const model = "fmpz-word-container/v1";
    const format = "uint64-row/v1";
    const capsule = capsuleRuntime.createImmutableUInt64Capsule(
      new BigUint64Array([5n, 7n, 11n]), owner, model, format, 3,
    );
    const lease = capsuleRuntime.authorizeImmutableUInt64Capsule(
      capsule, owner, model, format, 3,
    );
    const output = new BigUint64Array(3);
    assert.deepEqual(
      wrapper.resident_fmpz_word_program.fmpz(
        output, lease, 0n, 0n, 1n, 37n, 101n,
        32n << 20n, 64n << 20n,
      ),
      wrapper.resident_fmpz_word_program.gmp(
        new BigUint64Array(3), lease, 0n, 0n, 1n, 37n, 101n,
        32n << 20n, 64n << 20n,
      ),
    );
    assert.throws(
      () => wrapper.resident_fmpz_word_program.fmpz(
        lease, new BigUint64Array([5n, 7n, 11n]),
        0n, 0n, 1n, 37n, 101n, 32n << 20n, 64n << 20n,
      ),
      /read-only/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("fmpz word/container success and failure survive sanitizers", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(source, "fmpz-word-container-sanitizer.py");
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-word-asan-"));
  const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <gmp.h>
#include "kernel_core.c"

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    uint64_t words[2] = {313, 317};
    sagejs_uint64_buffer output = {words, 2};
    mpz_t result, index, other, value;
    uint64_t word = 0;
    mpz_inits(result, index, other, value, NULL);

    {
        sagejs_native_exact_budget budget;
        sagejs_native_fmpz_vector vector = {0};
        fmpz_t first, second, invalid, factor, observed, valid_index, valid_other;
        const fmpz *borrowed;
        uint64_t first_charge;
        uint64_t second_charge;
        sagejs_native_exact_budget_init(&budget, UINT64_C(1) << 20);
        assert(sagejs_native_fmpz_vector_init_in_budget(
            &status, &vector, 2, &budget, "test budget exceeded"));
        fmpz_init(first);
        fmpz_init(second);
        fmpz_init(invalid);
        fmpz_init(factor);
        fmpz_init(observed);
        fmpz_init(valid_index);
        fmpz_init(valid_other);
        fmpz_set_ui(first, 11);
        fmpz_set_ui(second, 17);
        fmpz_set_ui(factor, 5);
        fmpz_set_si(invalid, -1);
        assert(sagejs_native_fmpz_vector_set(&status, &vector, 0, first));
        assert(sagejs_native_fmpz_vector_set(&status, &vector, 1, second));
        first_charge = vector.payload_charges[0];
        second_charge = vector.payload_charges[1];

        fmpz_set_ui(observed, 991);
        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_get_at(
            &status, &vector, invalid, observed));
        assert(fmpz_equal_si(observed, 991));
        borrowed = vector.entries;
        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_borrow_at(
            &status, &vector, invalid, &borrowed));
        assert(borrowed == vector.entries);

        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_set_at(
            &status, &vector, invalid, factor));
        assert(fmpz_equal_si(vector.entries + 0, 11));
        assert(fmpz_equal_si(vector.entries + 1, 17));
        assert(vector.payload_charges[0] == first_charge);
        assert(vector.payload_charges[1] == second_charge);

        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_addmul_at(
            &status, &vector, invalid, first, factor, 0));
        assert(fmpz_equal_si(vector.entries + 0, 11));
        assert(fmpz_equal_si(vector.entries + 1, 17));
        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_addmul_at(
            &status, &vector, invalid, first, factor, 1));
        assert(fmpz_equal_si(vector.entries + 0, 11));
        assert(fmpz_equal_si(vector.entries + 1, 17));

        fmpz_set_ui(valid_index, 0);
        fmpz_set_ui(valid_other, 1);
        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_swap_at(
            &status, &vector, invalid, valid_other));
        assert(fmpz_equal_si(vector.entries + 0, 11));
        assert(fmpz_equal_si(vector.entries + 1, 17));
        sagejs_native_status_reset(&status);
        assert(!sagejs_native_fmpz_vector_swap_at(
            &status, &vector, valid_index, invalid));
        assert(fmpz_equal_si(vector.entries + 0, 11));
        assert(fmpz_equal_si(vector.entries + 1, 17));
        assert(vector.payload_charges[0] == first_charge);
        assert(vector.payload_charges[1] == second_charge);

        fmpz_clear(valid_other);
        fmpz_clear(valid_index);
        fmpz_clear(observed);
        fmpz_clear(factor);
        fmpz_clear(invalid);
        fmpz_clear(second);
        fmpz_clear(first);
        sagejs_native_fmpz_vector_clear(&vector);
    }

    mpz_set_ui(value, 1);
    mpz_mul_2exp(value, value, 64);
    mpz_sub_ui(value, value, 1);
    assert(sagejs_kernel_fmpz_checked_word(&status, &word, value));
    assert(word == UINT64_MAX);

    mpz_set_ui(value, 1);
    mpz_mul_2exp(value, value, 4096);
    mpz_add_ui(value, value, 12345);
    mpz_neg(value, value);
    {
        const uint64_t portable_moduli[] = {
            UINT64_C(1),
            UINT64_C(4294967311),
            UINT64_C(9223372036854775837),
            UINT64_MAX
        };
        fmpz_t portable_value;
        size_t modulus_index;
        fmpz_init(portable_value);
        fmpz_one(portable_value);
        fmpz_mul_2exp(portable_value, portable_value, 4096);
        fmpz_add_ui(portable_value, portable_value, 12345);
        fmpz_neg(portable_value, portable_value);
        for (modulus_index = 0;
             modulus_index < sizeof(portable_moduli) / sizeof(uint64_t);
             modulus_index += 1)
        {
            const uint64_t modulus = portable_moduli[modulus_index];
            assert(sagejs_fmpz_fdiv_uint64(portable_value, modulus) ==
                (uint64_t) mpz_fdiv_ui(value, (ulong) modulus));
        }
        fmpz_neg(portable_value, portable_value);
        mpz_neg(value, value);
        for (modulus_index = 0;
             modulus_index < sizeof(portable_moduli) / sizeof(uint64_t);
             modulus_index += 1)
        {
            const uint64_t modulus = portable_moduli[modulus_index];
            assert(sagejs_fmpz_fdiv_uint64(portable_value, modulus) ==
                (uint64_t) mpz_fdiv_ui(value, (ulong) modulus));
        }
        for (modulus_index = 0;
             modulus_index < sizeof(portable_moduli) / sizeof(uint64_t);
             modulus_index += 1)
        {
            const uint64_t modulus = portable_moduli[modulus_index];
            fmpz_set_ui(portable_value, (ulong) modulus);
            fmpz_mul_ui(portable_value, portable_value, 37);
            mpz_set_ui(value, (ulong) modulus);
            mpz_mul_ui(value, value, 37);
            assert(sagejs_fmpz_fdiv_uint64(portable_value, modulus) == 0);
            assert(mpz_fdiv_ui(value, (ulong) modulus) == 0);
            fmpz_neg(portable_value, portable_value);
            mpz_neg(value, value);
            assert(sagejs_fmpz_fdiv_uint64(portable_value, modulus) == 0);
            assert(mpz_fdiv_ui(value, (ulong) modulus) == 0);
        }
        fmpz_clear(portable_value);
    }
    mpz_set_ui(value, 1);
    mpz_mul_2exp(value, value, 4096);
    mpz_add_ui(value, value, 12345);
    mpz_neg(value, value);
    assert(sagejs_kernel_fmpz_floor_mod_word(
        &status, &word, value, UINT64_MAX));
    assert(word < UINT64_MAX);

    mpz_set_si(index, -1);
    mpz_set_ui(other, 1);
    mpz_set_ui(result, 991);
    assert(!sagejs_kernel_resident_fmpz_vector_operation(
        &status, result, output, 4, index, other, 32U << 20, 64U << 20));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    assert(words[0] == 313 && words[1] == 317);
    assert(mpz_cmp_ui(result, 991) == 0);

    mpz_set_ui(index, 0);
    assert(sagejs_kernel_resident_fmpz_vector_operation(
        &status, result, output, 4, index, other, 32U << 20, 64U << 20));
    assert(status.code == SAGEJS_NATIVE_OK);
    assert(words[0] == 17 && words[1] == 11);
    assert(mpz_cmp_ui(result, 28) == 0);

    mpz_clears(result, index, other, value, NULL);
    return 0;
}
`;
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), harness);
    const executable = join(temporary, "fmpz-word-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const build = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "harness.c"),
      "-Wl,--start-group",
      join(prefix, "lib", "libflint.a"),
      join(prefix, "lib", "libmpfr.a"),
      join(prefix, "lib", "libgmp.a"),
      join(prefix, "lib", "libopenblas.a"),
      "-Wl,--end-group",
      "-lm",
      "-lpthread",
      "-ldl",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(
      build.status,
      0,
      `sanitizer compile failed:\n${build.stdout}${build.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed: ${run.error?.message || ""}\n` +
        `${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
