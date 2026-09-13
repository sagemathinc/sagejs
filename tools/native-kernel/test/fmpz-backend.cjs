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

const {
  generateArtifacts,
  generateHostCore,
} = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const root = resolve(__dirname, "../../..");
const source = String.raw`
from sagejs.ffi.flint import (
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import NativeExactArena, native, uint64


@native
def resident_fmpz_witness(
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
            values[index] = current
            values.addmul(index, current, divisor)
            current = values[index] * 3 + value
            current = current // divisor
            current = current % modulus
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
  const end = text.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `unterminated emitted function ${marker}`);
  return text.slice(start, end + 3);
}

test("closed unbounded exact arenas select direct fmpz storage", async () => {
  const ir = await lowerSource(source, "resident-fmpz-witness.py");
  const fn = ir.functions[0];
  assert.deepEqual(fn.analysis.backend, {
    kind: "fmpz",
    reason:
      "a closed unbounded exact arena is qualified for inline-promoting FLINT fmpz storage",
    requiresExactWorkspace: true,
    qualification: "direct-fmpz-vector-matrix-v1",
  });
  assert.deepEqual(fn.analysis.fmpzExact, {
    semanticType: "Integer",
    representation: "flint-fmpz-inline-word-with-gmp-promotion",
    residentContainers: "inline-promoting-fmpz-vector",
    promotion: "transparent-and-owning",
    ffiBoundary: "direct-fmpz_t",
    hostBoundary: "one-mpz-fmpz-conversion-on-entry-and-exit",
    cleanup:
      "clear-promoted-values-before-flint-cache-drain-and-arena-rewind",
    qualification: "direct-fmpz-vector-matrix-v1",
  });
  assert.equal(
    fn.analysis.liveExactWorkspace.scopes[0].children[0].storage,
    "inline-promoting-fmpz-vector",
  );

  const core = generateHostCore(ir);
  const residentRuntime = core.source.slice(
    core.source.indexOf("typedef struct\n{\n    fmpz *entries;"),
    core.source.indexOf("static int fmpz_native_resident_fmpz_witness"),
  );
  assert.match(residentRuntime, /fmpz \*entries/);
  assert.match(residentRuntime, /fmpz_init\(vector->entries \+ index\)/);
  assert.doesNotMatch(residentRuntime, /\bmpz_init(?:2)?\(/);

  const implementation = emittedFunction(
    core.source,
    "static int fmpz_native_resident_fmpz_witness(",
  );
  assert.match(implementation, /sagejs_native_fmpz_vector_init_in_budget/);
  assert.match(implementation, /sagejs_native_fmpz_vector_addmul/);
  assert.match(implementation, /fmpz_fdiv_q/);
  assert.match(implementation, /fmpz_fdiv_r/);
  assert.match(
    implementation,
    /sagejs_fmpz_matrix_set_entry\([^;]*sagejs_fmpz_scratch_/,
  );
  assert.match(
    implementation,
    /sagejs_fmpz_matrix_entry\(sagejs_fmpz_scratch_/,
  );
  assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
  assert.doesNotMatch(implementation, /\bmpz_/);

  const publicBridge = emittedFunction(
    core.source,
    "int sagejs_kernel_resident_fmpz_witness(",
  );
  assert.match(publicBridge, /fmpz_set_mpz/);
  assert.match(publicBridge, /fmpz_get_mpz/);
  assert.match(publicBridge, /fmpz_native_resident_fmpz_witness/);
  const adapter = generateArtifacts(ir).adapterSource;
  assert.match(
    adapter,
    /static napi_value compiled_resident_fmpz_witness\(/,
  );
  assert.match(adapter, /sagejs_kernel_resident_fmpz_witness\(/);
  assert.match(
    adapter,
    /static napi_value compiled_resident_fmpz_witness_gmp\(/,
  );
  assert.match(adapter, /native_resident_fmpz_witness\(/);
});

test("fmpz selection admits exact indices and rejects bounded vectors", async () => {
  const bounded = source.replace(
    "arena.integer_vector(8192, 0)",
    "arena.integer_vector(8192, 256)",
  );
  const boundedIr = await lowerSource(bounded, "bounded-fmpz-witness.py");
  assert.equal(boundedIr.functions[0].analysis.backend.kind, "gmp");

  const exactIndex = source.replace(
    "values[index] = current",
    "values[value] = current",
  );
  const exactIndexIr = await lowerSource(exactIndex, "exact-index-witness.py");
  assert.equal(exactIndexIr.functions[0].analysis.backend.kind, "fmpz");
  const implementation = emittedFunction(
    generateHostCore(exactIndexIr).source,
    "static int fmpz_native_resident_fmpz_witness(",
  );
  assert.match(implementation, /sagejs_native_fmpz_vector_set_at/);
  assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
  assert.doesNotMatch(implementation, /\bmpz_/);
});

test("small and promoted fmpz arithmetic agrees with JavaScript and GMP", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-backend-"));
  const sourcePath = join(temporary, "resident_fmpz_witness.py");
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
const implementations = [
  module.resident_fmpz_witness,
  module.resident_fmpz_witness.fmpz,
  module.resident_fmpz_witness.tagged,
  module.resident_fmpz_witness.gmp,
  module.resident_fmpz_witness.javascript,
];
assert.equal(
  module.resident_fmpz_witness.backendFor(
    1n, 1n, 1n, 0n, 32n << 20n, 64n << 20n
  ),
  "fmpz",
);
const cases = [
  [37n, -7n, 1009n, 16n],
  [-41n, 11n, -997n, 16n],
  [(1n << 255n) + 91n, -((1n << 70n) + 3n), (1n << 260n) + 93n, 16n],
  [(1n << 4095n) + 123n, -((1n << 130n) + 51n), (1n << 4099n) + 9n, 8n],
];
for (const args of cases) {
  const results = implementations.map((implementation) =>
    implementation(...args, 32n << 20n, 64n << 20n)
  );
  for (const result of results.slice(1)) assert.equal(result, results[0]);
}
assert.throws(
  () => module.resident_fmpz_witness(1n, 0n, 7n, 1n, 32n << 20n, 64n << 20n),
  /division or modulo by zero/,
);
assert.throws(
  () => module.resident_fmpz_witness(1n, 1n, 7n, 1n, 64n << 10n, 64n << 20n),
  /memory limit exceeded/,
);
`;
    const result = spawnSync(
      process.execPath,
      ["-e", runner, compiled.modulePath],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const coreSource = readFileSync(compiled.coreSourcePath, "utf8");
    const implementation = emittedFunction(
      coreSource,
      "static int fmpz_native_resident_fmpz_witness(",
    );
    assert.doesNotMatch(implementation, /fmpz_(?:set|get)_mpz/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
