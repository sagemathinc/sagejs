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

const root = resolve(__dirname, "../../..");
const source = String.raw`
from sagejs.ffi.flint import (
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import NativeExactArena, checked_uint64, native, uint64


@native
def fmpz_division_pair(value: int, divisor: int) -> tuple[int, int, bool]:
    quotient = value // divisor
    remainder = value % divisor
    return quotient, remainder, remainder == 0


@native
def fmpz_transform(
    value: int, divisor: int, scale: int
) -> tuple[int, bool]:
    quotient, remainder, exact = fmpz_division_pair(value, divisor)
    transformed = quotient * scale + remainder
    return transformed, exact or transformed < 0


@native
def fmpz_is_normalized(value: int, modulus: int) -> bool:
    return value >= 0 and value < modulus


@native
def resident_fmpz_call_graph(
    value: int,
    divisor: int,
    modulus: int,
    rounds: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(8192, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 1)
        index: uint64 = 0
        current = value
        while index < rounds:
            transformed, preferred = fmpz_transform(current, divisor, 3)
            values[index] = transformed
            if preferred and fmpz_is_normalized(current, modulus):
                values.addmul(index, transformed, divisor)
            else:
                values.submul(index, transformed, divisor)
            current = (values[index] + value) % modulus
            index += 1
        fmpz_matrix_set_entry(matrix, 0, 0, current)
        return fmpz_matrix_entry(matrix, 0, 0) + current
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

test("fmpz selection propagates through a closed tuple-return call graph", async () => {
  const ir = await lowerSource(source, "fmpz-call-graph.py");
  const functions = new Map(ir.functions.map((fn) => [fn.name, fn]));
  assert.deepEqual(
    Array.from(functions, ([name, fn]) => [name, fn.analysis.backend.kind]),
    [
      ["fmpz_division_pair", "fmpz"],
      ["fmpz_transform", "fmpz"],
      ["fmpz_is_normalized", "fmpz"],
      ["resident_fmpz_call_graph", "fmpz"],
    ],
  );
  assert.equal(
    functions.get("resident_fmpz_call_graph").analysis.backend.qualification,
    "direct-fmpz-vector-matrix-call-graph-v2",
  );
  assert.equal(
    functions.get("fmpz_division_pair").analysis.backend.qualification,
    "direct-fmpz-helper-call-graph-v2",
  );
  assert.equal(
    functions.get("fmpz_transform").analysis.fmpzExact.residentContainers,
    "caller-owned-fmpz-values",
  );

  const core = generateHostCore(ir).source;
  const rootImplementation = emittedFunction(
    core,
    "static int fmpz_native_resident_fmpz_call_graph(",
  );
  const transformImplementation = emittedFunction(
    core,
    "static int fmpz_native_fmpz_transform(",
  );
  const divisionImplementation = emittedFunction(
    core,
    "static int fmpz_native_fmpz_division_pair(",
  );
  assert.match(rootImplementation, /fmpz_native_fmpz_transform/);
  assert.match(rootImplementation, /fmpz_native_fmpz_is_normalized/);
  assert.match(transformImplementation, /fmpz_native_fmpz_division_pair/);
  for (const implementation of [
    rootImplementation,
    transformImplementation,
    divisionImplementation,
  ]) {
    assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
    assert.doesNotMatch(implementation, /\bmpz_/);
  }

  const helperBridge = emittedFunction(
    core,
    "int sagejs_kernel_fmpz_division_pair(",
  );
  assert.match(helperBridge, /fmpz_native_fmpz_division_pair/);
  assert.match(helperBridge, /fmpz_get_mpz/);
});

test("an unsupported helper invalidates the entire fmpz candidate", async () => {
  const unsupported = source.replace(
    "quotient = value // divisor",
    "checked = checked_uint64(value)\n    quotient = value // divisor + checked",
  );
  const unsupportedIr = await lowerSource(
    unsupported,
    "unsupported-fmpz-helper.py",
  );
  assert.notEqual(
    unsupportedIr.functions.find((fn) => fn.name === "resident_fmpz_call_graph")
      .analysis.backend.kind,
    "fmpz",
  );

  const bounded = source.replace(
    "arena.integer_vector(8192, 0)",
    "arena.integer_vector(8192, 256)",
  );
  const ir = await lowerSource(bounded, "bounded-fmpz-call-graph.py");
  assert.equal(
    ir.functions.find((fn) => fn.name === "resident_fmpz_call_graph")
      .analysis.backend.kind,
    "gmp",
  );
  assert.notEqual(
    ir.functions.find((fn) => fn.name === "fmpz_transform")
      .analysis.backend.kind,
    "fmpz",
  );
});

test("direct fmpz helpers preserve small and promoted tuple semantics", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-call-graph-"));
  const sourcePath = join(temporary, "fmpz_call_graph.py");
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

for (const args of [
  [37n, -7n],
  [-41n, 11n],
  [(1n << 255n) + 91n, -((1n << 70n) + 3n)],
  [(1n << 4095n) + 123n, -((1n << 130n) + 51n)],
]) {
  const implementations = [
    module.fmpz_division_pair,
    module.fmpz_division_pair.fmpz,
    module.fmpz_division_pair.tagged,
    module.fmpz_division_pair.gmp,
    module.fmpz_division_pair.javascript,
  ];
  const results = implementations.map((implementation) => implementation(...args));
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
}

for (const args of [[0n, 7n], [6n, 7n], [7n, 7n], [-1n, 7n]]) {
  const implementations = [
    module.fmpz_is_normalized,
    module.fmpz_is_normalized.fmpz,
    module.fmpz_is_normalized.tagged,
    module.fmpz_is_normalized.gmp,
    module.fmpz_is_normalized.javascript,
  ];
  const results = implementations.map((implementation) => implementation(...args));
  for (const result of results.slice(1)) assert.equal(result, results[0]);
}

const rootImplementations = [
  module.resident_fmpz_call_graph,
  module.resident_fmpz_call_graph.fmpz,
  module.resident_fmpz_call_graph.tagged,
  module.resident_fmpz_call_graph.gmp,
  module.resident_fmpz_call_graph.javascript,
];
for (const args of [
  [37n, -7n, 1009n, 16n],
  [-41n, 11n, -997n, 16n],
  [(1n << 255n) + 91n, -((1n << 70n) + 3n), (1n << 260n) + 93n, 16n],
  [(1n << 4095n) + 123n, -((1n << 130n) + 51n), (1n << 4099n) + 9n, 8n],
]) {
  const results = rootImplementations.map((implementation) =>
    implementation(...args, 32n << 20n, 64n << 20n)
  );
  for (const result of results.slice(1)) assert.equal(result, results[0]);
}
assert.throws(() => module.fmpz_division_pair(1n, 0n), /division or modulo by zero/);
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const core = readFileSync(compiled.coreSourcePath, "utf8");
    const implementation = emittedFunction(
      core,
      "static int fmpz_native_resident_fmpz_call_graph(",
    );
    assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
