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
  createNativeImportResolver,
} = require("../native-imports.cjs");
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
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import NativeExactArena, native, uint64


@native
def early_checkpoint_witness(
    value: int,
    scale: int,
    fail: bool,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(4, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 1)
        values[0] = value
        values.addmul(0, scale, scale)
        fmpz_matrix_set_entry(matrix, 0, 0, values[0])
        if fail:
            raise ZeroDivisionError
        return fmpz_matrix_entry(matrix, 0, 0) + values[0]
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

function ordered(body, fragments) {
  let prior = -1;
  for (const fragment of fragments) {
    const position = body.indexOf(fragment, prior + 1);
    assert.notEqual(position, -1, `missing ordered fragment ${fragment}`);
    assert.ok(position > prior, `${fragment} is out of order`);
    prior = position;
  }
}

test("eligible fmpz arenas carry a narrow early-checkpoint proof", async () => {
  const ir = await lowerSource(source, "fmpz-early-checkpoint.py");
  const fn = ir.functions[0];
  assert.equal(fn.analysis.backend.kind, "fmpz");
  assert.deepEqual(
    fn.analysis.liveExactWorkspace.scopes[0].checkpointLifetime,
    {
      placement: "immediately-after-arena-init-before-child-init",
      authority: "closed-fmpz-call-local-ownership-analysis-v1",
      children: "all-nonescaping-call-local-vectors-and-resources",
      rewind: "none-admitted-by-qualified-operation-grammar",
      entry: "drain-flint-promotion-cache-before-arena-init",
      cleanup: "reverse-children-before-checkpoint-end-on-every-exit",
    },
  );

  const core = generateHostCore(ir).source;
  const fmpz = emittedFunction(
    core,
    "static int fmpz_native_early_checkpoint_witness(",
  );
  ordered(fmpz, [
    "sagejs_flint_exact_checkpoint_cleanup",
    "sagejs_native_exact_arena_init",
    "sagejs_native_gmp_checkpoint_begin",
    "sagejs_native_fmpz_vector_init_in_budget",
    "sagejs_fmpz_matrix_init",
  ]);
  for (const label of ["success:", "fail:"]) {
    const cleanup = fmpz.slice(fmpz.indexOf(label));
    ordered(cleanup, [
      "sagejs_fmpz_matrix_clear",
      "sagejs_native_fmpz_vector_clear",
      "sagejs_native_exact_arena_clear",
    ]);
  }

  // A bounded vector is deliberately outside the fmpz qualification.  Its
  // generic GMP program retains the old resident-before-checkpoint lifetime.
  const boundedIr = await lowerSource(
    source.replace("arena.integer_vector(4, 0)", "arena.integer_vector(4, 256)"),
    "generic-delayed-checkpoint.py",
  );
  const bounded = boundedIr.functions[0];
  assert.equal(bounded.analysis.backend.kind, "gmp");
  assert.equal(
    bounded.analysis.liveExactWorkspace.scopes[0].checkpointLifetime,
    undefined,
  );
  const generic = emittedFunction(
    generateHostCore(boundedIr).source,
    "static int native_early_checkpoint_witness(",
  );
  ordered(generic, [
    "sagejs_native_exact_arena_init",
    "sagejs_native_integer_vector_init_in_budget",
    "sagejs_fmpz_matrix_init",
    "sagejs_native_gmp_checkpoint_begin",
  ]);

  const pureIr = await lowerSource(String.raw`
from sagejs.native import NativeExactArena, native, uint64


@native
def pure_fmpz_vector(
    value: int, scale: int, memory_limit: uint64, temporary_limit: uint64
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = value
        values.addmul(0, scale, scale)
        return values[0]
`, "pure-fmpz-early-checkpoint.py");
  assert.equal(pureIr.functions[0].analysis.backend.kind, "fmpz");
  const pure = emittedFunction(
    generateHostCore(pureIr).source,
    "static int fmpz_native_pure_fmpz_vector(",
  );
  ordered(pure, [
    "flint_cleanup",
    "sagejs_native_exact_arena_init",
    "sagejs_native_gmp_checkpoint_begin",
    "sagejs_native_fmpz_vector_init_in_budget",
  ]);
});

test("the complete cubic root initializes all 59 children inside its checkpoint", {
  timeout: 120_000,
}, async () => {
  const sourcePath = join(
    root,
    "src/lib/sagejs/number_fields/cubic_class_number_native.py",
  );
  const rootFunction = [
    "certified",
    "complex",
    "cubic",
    "class",
    "group",
    "v1",
  ].join("_");
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath, {
    functions: [rootFunction],
    resolveNativeImport: createNativeImportResolver({
      root,
      lowerSource,
      initialSourcePath: sourcePath,
    }),
  });
  const fn = ir.functions.find((candidate) => candidate.name === rootFunction);
  assert.equal(fn.analysis.backend.kind, "fmpz");
  const [scope] = fn.analysis.liveExactWorkspace.scopes;
  // Online HNF adds three resident basis matrices and membership coordinates.
  // They must obey the same initialization/all-exit cleanup ordering below.
  assert.equal(scope.children.length, 59);
  for (const owner of ["online_relation_basis", "online_relation_source",
    "online_relation_hnf", "online_membership_coordinates"]) {
    assert.ok(scope.children.some((child) => child.owner === owner &&
      child.resourceId === "fmpz_matrix"));
  }
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        scope.children.reduce((counts, child) => {
          const kind = child.resourceId || child.storage;
          counts[kind] = (counts[kind] || 0) + 1;
          return counts;
        }, {}),
      ).sort(),
    ),
    {
      fmpz_matrix: 55,
      fmpz_polynomial: 1,
      "inline-promoting-fmpz-vector": 2,
      number_field_analysis_resource: 1,
    },
  );
  assert.equal(
    scope.checkpointLifetime?.authority,
    "closed-fmpz-call-local-ownership-analysis-v1",
  );

  const body = emittedFunction(
    generateHostCore(ir).source,
    `static int fmpz_native_${rootFunction}(`,
  );
  const checkpoint = body.indexOf("sagejs_native_gmp_checkpoint_begin");
  assert.notEqual(checkpoint, -1);
  for (const child of scope.children) {
    const initialized = body.indexOf(`sagejs_${child.owner}_initialized = 1;`);
    assert.ok(
      initialized > checkpoint,
      `${child.owner} was initialized before the qualified checkpoint`,
    );
  }
  for (const label of ["success:", "fail:"]) {
    const cleanup = body.slice(body.indexOf(label));
    const arenaClear = cleanup.indexOf("sagejs_native_exact_arena_clear");
    assert.notEqual(arenaClear, -1);
    for (const child of scope.children) {
      const guardedClear = cleanup.indexOf(
        `if (sagejs_${child.owner}_initialized)`,
      );
      assert.ok(
        guardedClear !== -1 && guardedClear < arenaClear,
        `${child.owner} was not cleared before checkpoint end on ${label}`,
      );
    }
  }
});

test("early-checkpoint fmpz execution agrees with exact fallbacks", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-early-runtime-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "fmpz_early_checkpoint.py");
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
  module.early_checkpoint_witness,
  module.early_checkpoint_witness.fmpz,
  module.early_checkpoint_witness.gmp,
  module.early_checkpoint_witness.tagged,
  module.early_checkpoint_witness.javascript,
];
const cases = [
  [37n, -11n],
  [-41n, (1n << 130n) + 17n],
  [(1n << 255n) + 9n, -((1n << 521n) + 3n)],
];
for (const [value, scale] of cases) {
  const expected = 2n * (value + scale * scale);
  for (const implementation of implementations) {
    assert.equal(
      implementation(value, scale, false, 32n << 20n, 1n << 20n),
      expected,
    );
    assert.throws(
      () => implementation(value, scale, true, 32n << 20n, 1n << 20n),
      /division by zero/,
    );
  }
}
assert.equal(
  module.early_checkpoint_witness.backendFor(
    1n, 1n, false, 32n << 20n, 1n << 20n
  ),
  "fmpz",
);
assert.throws(
  () => module.early_checkpoint_witness.fmpz(
    1n, 1n << 1048576n, false, 32n << 20n, 1n
  ),
  /NativeExactArena temporary capacity exhausted/,
);
`;
  const result = spawnSync(
    process.execPath,
    ["-e", runner, compiled.modulePath],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("early checkpoint owns promoted limbs and cleans every exit", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-early-asan-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(source, "fmpz-early-sanitizer.py");
  let core = generateHostCore(ir).source;

  // The witness uses a promoted vector entry.  This test-only assertion makes
  // allocator provenance observable while the checkpoint is still live.
  const action = core.indexOf(
    "if (!sagejs_native_fmpz_vector_addmul(status, &sagejs_values,",
    core.indexOf("static int fmpz_native_early_checkpoint_witness("),
  );
  assert.notEqual(action, -1);
  const actionEnd = core.indexOf("\n    }", action);
  assert.notEqual(actionEnd, -1);
  const insertion = actionEnd + "\n    }".length;
  core = core.slice(0, insertion) + String.raw`
    if (sagejs_arena.temporary_limit >= UINT64_C(1024) &&
        (!COEFF_IS_MPZ(sagejs_values.entries[0]) ||
         !sagejs_native_gmp_pointer_is_checkpoint_owned(
             COEFF_TO_PTR(sagejs_values.entries[0])->_mp_d)))
    {
        sagejs_native_status_set(status, SAGEJS_NATIVE_ERROR,
            "promoted vector entry escaped the checkpoint");
        goto fail;
    }` + core.slice(insertion);

  writeFileSync(join(temporary, "kernel_core.c"), core);
  writeFileSync(join(temporary, "kernel_core.h"), generateHostCore(ir).header);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "kernel_core.c"

static void reset_status(sagejs_native_status *status)
{
    status->code = SAGEJS_NATIVE_OK;
    status->message = NULL;
}

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    sagejs_native_gmp_checkpoint_stats stats = {0};
    mpz_t output, value, scale, expected;
    mpz_inits(output, value, scale, expected, NULL);
    mpz_set_si(value, -37);
    mpz_set_ui(scale, 1);
    mpz_mul_2exp(scale, scale, 2048);
    mpz_add_ui(scale, scale, 19);
    mpz_mul(expected, scale, scale);
    mpz_add(expected, expected, value);
    mpz_mul_ui(expected, expected, 2);

    for (unsigned round = 0; round < 100; round += 1)
    {
        reset_status(&status);
        mpz_set_ui(output, 991);
        if (!sagejs_kernel_early_checkpoint_witness(
                &status, output, value, scale, 0,
                UINT64_C(32) << 20, UINT64_C(1) << 20))
        {
            fprintf(stderr, "unexpected success failure: %d %s\n",
                status.code, status.message == NULL ? "(null)" : status.message);
            return 2;
        }
        assert(status.code == SAGEJS_NATIVE_OK);
        assert(mpz_cmp(output, expected) == 0);
        assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
        assert(stats.allocation_calls > 0);
        assert(stats.high_water > 0);
        assert(stats.soft_limit_exhaustions == 0);
        assert(stats.upstream_allocations == 0);

        reset_status(&status);
        mpz_set_ui(output, 992);
        assert(!sagejs_kernel_early_checkpoint_witness(
            &status, output, value, scale, 1,
            UINT64_C(32) << 20, UINT64_C(1) << 20));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
        assert(strcmp(status.message, "division by zero") == 0);
        assert(mpz_cmp_ui(output, 992) == 0);
    }

    reset_status(&status);
    mpz_set_ui(output, 993);
    mpz_set_ui(scale, 1);
    mpz_mul_2exp(scale, scale, 1048576);
    assert(!sagejs_kernel_early_checkpoint_witness(
        &status, output, value, scale, 0,
        UINT64_C(32) << 20, UINT64_C(1)));
    assert(status.code == SAGEJS_NATIVE_RETRY);
    assert(strcmp(
        status.message,
        "NativeExactArena temporary capacity exhausted"
    ) == 0);
    assert(mpz_cmp_ui(output, 993) == 0);
    assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
    assert(stats.soft_limit_exhaustions > 0 || stats.upstream_allocations > 0);

    mpz_clears(output, value, scale, expected, NULL);
    return 0;
}
`);
  const executable = join(temporary, "fmpz-early-checkpoint-sanitizer");
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
});
