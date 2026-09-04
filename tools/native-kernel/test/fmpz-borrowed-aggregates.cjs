"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const root = resolve(__dirname, "../../..");
const source = String.raw`
from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import (
    IntegerBuffer,
    NativeExactArena,
    NativeIntegerVector,
    native,
    uint64,
)


@native
def borrowed_fmpz_leaf(
    left: NativeIntegerVector,
    right: NativeIntegerVector,
    matrix: FmpzMatrix,
    packed: IntegerBuffer,
    published: IntegerBuffer,
    index: uint64,
    scale: int,
    fail: bool,
) -> tuple[int, int, bool]:
    before = left[index] + packed[index]
    right.addmul(index, before, scale)
    changed = right[index]
    fmpz_matrix_set_entry(matrix, 0, index, changed)
    published[index] = changed
    if fail:
        raise ZeroDivisionError
    observed = fmpz_matrix_entry(matrix, 0, index)
    return before, observed, observed < 0


@native
def borrowed_fmpz_middle(
    left: NativeIntegerVector,
    right: NativeIntegerVector,
    matrix: FmpzMatrix,
    packed: IntegerBuffer,
    published: IntegerBuffer,
    index: uint64,
    scale: int,
    fail: bool,
) -> tuple[int, int, bool]:
    before, changed, negative = borrowed_fmpz_leaf(
        left, right, matrix, packed, published, index, scale, fail
    )
    left.submul(index, changed, scale)
    left_after = left[index]
    fmpz_matrix_set_entry(matrix, 1, index, left_after)
    total = fmpz_matrix_entry(matrix, 0, index) + fmpz_matrix_entry(
        matrix, 1, index
    )
    return total + before, changed, negative


@native
def borrowed_fmpz_program(
    published: IntegerBuffer,
    packed: IntegerBuffer,
    seed: int,
    bias: int,
    scale: int,
    fail: bool,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> tuple[int, int, bool]:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        left = arena.integer_vector(4, 0)
        right = arena.integer_vector(4, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 2, 4)
        index: uint64 = 2
        left[index] = seed
        right[index] = bias
        total, changed, negative = borrowed_fmpz_middle(
            left, right, matrix, packed, published, index, scale, fail
        )
        visible = left[index] + right[index]
        visible += fmpz_matrix_entry(matrix, 0, index)
        visible += fmpz_matrix_entry(matrix, 1, index)
        return total + visible, changed, negative
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
  const next = text.indexOf("\nstatic ", start + marker.length);
  const publicNext = text.indexOf("\nint sagejs_kernel_", start + marker.length);
  const candidates = [next, publicNext].filter((value) => value !== -1);
  const end = candidates.length === 0 ? text.length : Math.min(...candidates);
  return text.slice(start, end);
}

test("fmpz helpers borrow vectors and matrices inside one closed program", async () => {
  const ir = await lowerSource(source, "fmpz-borrowed-aggregates.py");
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const entry = functions.get("borrowed_fmpz_program");
  const middle = functions.get("borrowed_fmpz_middle");
  const leaf = functions.get("borrowed_fmpz_leaf");

  assert.equal(entry.hostCallable, true);
  assert.equal(entry.analysis.backend.kind, "fmpz");
  assert.equal(
    entry.analysis.backend.qualification,
    "direct-fmpz-borrowed-aggregate-call-graph-v4",
  );
  for (const helper of [middle, leaf]) {
    assert.equal(helper.hostCallable, false);
    assert.equal(helper.analysis.backend.kind, "fmpz");
    assert.equal(
      helper.analysis.backend.qualification,
      "direct-fmpz-borrowed-aggregate-helper-call-graph-v4",
    );
    assert.equal(
      helper.analysis.fmpzExact.residentContainers,
      "caller-owned-borrowed-fmpz-aggregates",
    );
    assert.equal(
      helper.analysis.fmpzExact.hostBoundary,
      "none-internal-borrowed-aggregate-only",
    );
  }
  assert.deepEqual(middle.analysis.effects.externalWrites, [
    "left",
    "matrix",
    "published",
    "right",
  ]);
  assert.deepEqual(leaf.analysis.effects.externalWrites, [
    "matrix",
    "published",
    "right",
  ]);

  const artifacts = generateHostCore(ir);
  const core = artifacts.source;
  const entryBody = emittedFunction(
    core,
    "static int fmpz_native_borrowed_fmpz_program(",
  );
  const middleBody = emittedFunction(
    core,
    "static int fmpz_native_borrowed_fmpz_middle(",
  );
  const leafBody = emittedFunction(
    core,
    "static int fmpz_native_borrowed_fmpz_leaf(",
  );

  const leafSignatureStart = core.indexOf(
    "static int fmpz_native_borrowed_fmpz_leaf(",
  );
  assert.match(
    core.slice(leafSignatureStart, leafSignatureStart + 1200),
    /static int fmpz_native_borrowed_fmpz_leaf\([^)]*sagejs_native_fmpz_vector \*sagejs_arg_left[^)]*sagejs_native_fmpz_vector \*sagejs_arg_right[^)]*sagejs_fmpz_matrix_t sagejs_arg_matrix[^)]*sagejs_integer_buffer sagejs_arg_packed[^)]*sagejs_integer_buffer sagejs_arg_published/s,
  );
  assert.match(entryBody, /fmpz_native_borrowed_fmpz_middle\([^;]*&sagejs_left[^;]*&sagejs_right[^;]*sagejs_matrix/s);
  assert.match(middleBody, /fmpz_native_borrowed_fmpz_leaf\([^;]*sagejs_arg_left[^;]*sagejs_arg_right[^;]*sagejs_arg_matrix/s);
  assert.match(leafBody, /\(\*sagejs_arg_left\)\.entries/);
  assert.match(leafBody, /\(\*sagejs_arg_right\)\.entries/);
  assert.match(leafBody, /sagejs_arg_matrix/);
  assert.match(leafBody, /sagejs_integer_buffer_get_fmpz/);
  assert.match(leafBody, /sagejs_integer_buffer_set_fmpz/);
  assert.match(
    entryBody,
    /sagejs_flint_exact_checkpoint_cleanup\(\);\s+sagejs_native_gmp_checkpoint_suspend\(\);/,
  );
  for (const body of [middleBody, leafBody]) {
    assert.doesNotMatch(body, /sagejs_native_fmpz_vector_clear/);
    assert.doesNotMatch(body, /sagejs_fmpz_matrix_clear/);
  }
  for (const body of [entryBody, middleBody, leafBody]) {
    assert.doesNotMatch(body, /fmpz_(?:set|get)_mpz/);
    assert.doesNotMatch(body, /\bmpz_/);
  }
  assert.doesNotMatch(core, /sagejs_kernel_borrowed_fmpz_(?:leaf|middle)/);
});

test("one unsupported FFI helper rejects the whole fmpz closure", async () => {
  const unsupported = source
    .replace(
      "    FmpzMatrix,",
      "    FmpzMatrix,\n" +
        "    FmpzPolynomial,\n" +
        "    fmpz_polynomial,\n" +
        "    fmpz_polynomial_length,",
    )
    .replace(
      "\n\n@native\ndef borrowed_fmpz_leaf(",
      "\n\n@native\n" +
        "def unsupported_polynomial_length(polynomial: FmpzPolynomial) -> int:\n" +
        "    return fmpz_polynomial_length(polynomial)\n\n\n" +
        "@native\ndef borrowed_fmpz_leaf(",
    )
    .replace(
      "        matrix = arena.foreign_resource(fmpz_matrix, 2, 4)",
      "        matrix = arena.foreign_resource(fmpz_matrix, 2, 4)\n" +
        "        polynomial = arena.foreign_resource(fmpz_polynomial, 1)\n" +
        "        unsupported = unsupported_polynomial_length(polynomial)",
    )
    .replace(
      "        return total + visible, changed, negative",
      "        return total + visible + unsupported, changed, negative",
    );
  const ir = await lowerSource(unsupported, "unsupported-fmpz-aggregate.py");
  for (const fn of ir.functions) {
    assert.notEqual(fn.analysis.backend.kind, "fmpz", fn.name);
  }
});

test("borrowed fmpz aggregates preserve promoted mutation and failure", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-borrowed-"));
  const sourcePath = join(temporary, "fmpz_borrowed_aggregates.py");
  try {
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
    });
    const runner = String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const program = module.borrowed_fmpz_program;
assert.equal(program.backendPolicy.kind, "fmpz");

const implementations = [
  program,
  program.fmpz,
  program.tagged,
  program.gmp,
  program.javascript,
];
for (const args of [
  [37n, -11n, 5n, false],
  [-((1n << 521n) + 93n), (1n << 255n) + 17n, -((1n << 129n) + 7n), false],
  [(1n << 4095n) + 123n, -((1n << 1030n) + 51n), (1n << 257n) + 9n, false],
]) {
  const results = implementations.map((implementation) => {
    const packed = program.packIntegerBuffer([3n, -5n, 1n << 700n, 11n], 32);
    const published = program.createIntegerBuffer(4, 160);
    const answer = implementation(
      published,
      packed,
      ...args,
      32n << 20n,
      64n << 20n,
    );
    return [answer, published.toArray()];
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
}

for (const implementation of implementations) {
  const packed = program.packIntegerBuffer([0n, 0n, 1n << 700n, 0n], 32);
  const published = program.createIntegerBuffer(4, 160);
  assert.throws(
    () => implementation(
      published,
      packed,
      1n << 700n,
      -19n,
      23n,
      true,
      32n << 20n,
      64n << 20n,
    ),
    /division by zero/,
  );
  const recoveryPacked = program.packIntegerBuffer([0n, 0n, -7n, 0n], 4);
  const recoveryOutput = program.createIntegerBuffer(4, 8);
  const oraclePacked = program.packIntegerBuffer([0n, 0n, -7n, 0n], 4);
  const oracleOutput = program.createIntegerBuffer(4, 8);
  assert.deepEqual(
    [
      implementation(
        recoveryOutput,
        recoveryPacked,
        -31n,
        17n,
        -13n,
        false,
        32n << 20n,
        64n << 20n,
      ),
      recoveryOutput.toArray(),
    ],
    [
      implementations[0](
        oracleOutput,
        oraclePacked,
        -31n,
        17n,
        -13n,
        false,
        32n << 20n,
        64n << 20n,
      ),
      oracleOutput.toArray(),
    ],
  );
}
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout ||
        `terminated by ${result.signal}; module ${compiled.modulePath}`,
    );

    const core = readFileSync(compiled.coreSourcePath, "utf8");
    for (const name of [
      "borrowed_fmpz_program",
      "borrowed_fmpz_middle",
      "borrowed_fmpz_leaf",
    ]) {
      const body = emittedFunction(core, `static int fmpz_native_${name}(`);
      assert.doesNotMatch(body, /fmpz_(?:set|get)_mpz/);
      assert.doesNotMatch(body, /\bmpz_/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
// sagejs-test-tier: specialized
