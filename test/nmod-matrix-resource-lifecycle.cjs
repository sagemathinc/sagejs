#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(root, "packages", "flint", ".native", "prefix"),
);
const generatedDirectory = join(root, "packages", "flint", "build", "generated-ffi");
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

for (let round = 0; round < 200; round += 1) {
  const source = flint.ffiNmodMatrixRandom(7n, 9n, 65537n, BigInt(round + 1), 19n);
  const rows = flint.ffiNmodMatrixSelectRows(
    source, new BigUint64Array([6n, 0n, 3n, 6n]), 4n,
  );
  const columns = flint.ffiNmodMatrixSelectColumns(
    source, new BigUint64Array([8n, 1n, 8n, 0n]), 4n,
  );
  const stacked = flint.ffiNmodMatrixStack(rows, rows);
  const augmented = flint.ffiNmodMatrixAugment(columns, columns);
  assert.throws(() => flint.ffiNmodMatrixSelectRows(
    source, new BigUint64Array([7n]), 1n,
  ));
  for (const resource of [augmented, stacked, columns, rows, source]) {
    assert.ok(accounted(resource) > 0n);
    flint.ffiNmodMatrixClose(resource);
    flint.ffiNmodMatrixClose(resource);
    assert.equal(accounted(resource), 0n);
  }
}

if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/nmod-matrix-lifecycle-v1",
    supported: false,
    dynamicRounds: 200,
    reason: "ASan/UBSan C lifecycle witnesses are currently a Unix capability",
  }) + "\n");
  process.exit(0);
}

const source = String.raw`
#include <stdint.h>
#include <sagejs/nmod_matrix_ffi.h>

int main(void)
{
    for (uint64_t round = 0; round < 500; round++) {
        sagejs_nmod_matrix_t source, rows, columns, stacked, augmented, failed;
        const uint64_t row_indices[4] = {6, 0, 3, 6};
        const uint64_t column_indices[4] = {8, 1, 8, 0};
        const uint64_t invalid_row[1] = {7};
        sagejs_flint_byte_region_t vector_result;
        if (!sagejs_nmod_matrix_random(source, 7, 9, 65537,
                round + 1, 19) ||
            !sagejs_nmod_matrix_select_rows(
                rows, source, row_indices, 4) ||
            !sagejs_nmod_matrix_select_columns(
                columns, source, column_indices, 4) ||
            !sagejs_nmod_matrix_stack(stacked, rows, rows) ||
            !sagejs_nmod_matrix_augment(augmented, columns, columns))
            return 1;
        if (sagejs_nmod_matrix_select_rows(
                failed, source, invalid_row, 1) ||
            sagejs_nmod_matrix_select_rows(failed, source, NULL, 1) ||
            sagejs_nmod_matrix_select_columns(failed, source, NULL, 1) ||
            sagejs_nmod_matrix_mul_column_vector(
                vector_result, source, NULL, 9) ||
            vector_result->data != NULL || vector_result->length != 0)
            return 2;
        if (!sagejs_nmod_matrix_init(failed, 1, 1, 65537))
            return 3;
        sagejs_nmod_matrix_clear(failed);
        sagejs_nmod_matrix_clear(augmented);
        sagejs_nmod_matrix_clear(stacked);
        sagejs_nmod_matrix_clear(columns);
        sagejs_nmod_matrix_clear(rows);
        sagejs_nmod_matrix_clear(source);
    }
    return 0;
}
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: options.env || process.env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-nmod-lifecycle-"));
try {
  const sourcePath = join(temporary, "lifecycle.c");
  const executable = join(temporary, "lifecycle");
  writeFileSync(sourcePath, source);
  const compiler = process.env.CC || "cc";
  run(compiler, [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(flintPrefix, "include")}`,
    sourcePath,
    `-L${join(flintPrefix, "lib")}`,
    "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
    "-o", executable,
  ]);
  run(executable, [], { env: sanitizerEnvironment({ strictStringChecks: true }) });
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/nmod-matrix-lifecycle-v1",
    supported: true,
    dynamicRounds: 200,
    sanitizerRounds: 500,
  }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
