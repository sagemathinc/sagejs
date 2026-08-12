#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/extension-polynomial-resource-v1",
    capability: "sanitizers",
    supported: false,
    reason: "ASan/UBSan lifecycle execution is currently a Unix CI capability",
  }) + "\n");
  process.exit(0);
}

const source = String.raw`
#include <stdint.h>
#include <stdio.h>
#include <sagejs/fq_polynomial_ffi.h>

int main(void)
{
    const uint64_t modulus[3] = {1, 0, 1};
    const uint64_t other_modulus[3] = {2, 1, 1};
    const uint64_t left_coordinates[6] = {1, 2, 0, 1, 2, 2};
    const uint64_t right_coordinates[4] = {2, 0, 1, 1};
    const uint64_t element_coordinates[2] = {1, 2};
    const uint64_t invalid_coordinates[2] = {1, 3};
    for (slong round = 0; round < 1000; round++)
    {
        sagejs_fq_context_t context, other_context, invalid_context;
        sagejs_fq_element_t element, element_copy, element_sum, other_element;
        sagejs_fq_element_t failed_element;
        sagejs_fq_polynomial_t left, right, copy, sum, product, negated;
        sagejs_fq_polynomial_t other_polynomial, failed_polynomial;
        sagejs_flint_byte_region_t coordinates;

        if (!sagejs_fq_context_init(context, modulus, 3, 3) ||
            !sagejs_fq_context_init(other_context, other_modulus, 3, 3) ||
            sagejs_fq_context_init(invalid_context, modulus, 3, 4) ||
            sagejs_fq_context_characteristic(context) != 3 ||
            sagejs_fq_context_degree(context) != 2 ||
            sagejs_fq_context_allocated_bytes(context) <=
                sizeof(sagejs_fq_context_state))
            return 1;
        if (!sagejs_fq_element_init_coordinates(
                element, context, element_coordinates, 2) ||
            !sagejs_fq_element_copy(element_copy, element) ||
            !sagejs_fq_element_add(element_sum, element, element_copy) ||
            !sagejs_fq_element_init_coordinates(
                other_element, other_context, element_coordinates, 2) ||
            !sagejs_fq_element_equal(element, element_copy) ||
            sagejs_fq_element_degree(element) != 2 ||
            sagejs_fq_element_coordinate(element, 1) != 2 ||
            sagejs_fq_element_allocated_bytes(element) <=
                sagejs_fq_context_allocated_bytes(context) ||
            sagejs_fq_element_init_coordinates(
                failed_element, context, invalid_coordinates, 2))
            return 2;
        if (!sagejs_fq_polynomial_init_coordinates(
                left, context, left_coordinates, 6, 3) ||
            !sagejs_fq_polynomial_init_coordinates(
                right, context, right_coordinates, 4, 2) ||
            !sagejs_fq_polynomial_copy(copy, left) ||
            !sagejs_fq_polynomial_init_coordinates(
                other_polynomial, other_context, right_coordinates, 4, 2) ||
            !sagejs_fq_polynomial_equal(left, copy) ||
            sagejs_fq_polynomial_allocated_bytes(left) <=
                sagejs_fq_context_allocated_bytes(context) ||
            sagejs_fq_polynomial_init_coordinates(
                failed_polynomial, context, invalid_coordinates, 2, 1))
            return 3;

        /* Dependents retain the context after its public owner closes. */
        sagejs_fq_context_clear(context);
        if (!sagejs_fq_polynomial_add(sum, left, right) ||
            !sagejs_fq_polynomial_mul(product, left, right) ||
            !sagejs_fq_polynomial_neg(negated, product) ||
            !sagejs_fq_polynomial_coordinate_bytes(coordinates, product) ||
            coordinates->length < 24 ||
            memcmp(coordinates->data, "SJFC", 4) != 0 ||
            coordinates->data[4] != 1 ||
            sagejs_fq_polynomial_length(left) != 3 ||
            sagejs_fq_polynomial_degree(left) != 2 ||
            sagejs_fq_polynomial_coordinate(left, 0, 1) != 2)
            return 4;
        sagejs_flint_byte_region_clear(coordinates);

        /* Equal descriptors do not authorize cross-context operations. */
        if (sagejs_fq_polynomial_add(
                failed_polynomial, left, other_polynomial) ||
            sagejs_fq_element_add(
                failed_element, element, other_element))
            return 5;

        sagejs_fq_polynomial_clear(negated);
        sagejs_fq_polynomial_clear(product);
        sagejs_fq_polynomial_clear(sum);
        sagejs_fq_polynomial_clear(copy);
        sagejs_fq_polynomial_clear(right);
        sagejs_fq_polynomial_clear(left);
        sagejs_fq_polynomial_clear(other_polynomial);
        sagejs_fq_element_clear(element_sum);
        sagejs_fq_element_clear(element_copy);
        sagejs_fq_element_clear(element);
        sagejs_fq_element_clear(other_element);
        sagejs_fq_context_clear(other_context);
    }
    printf("rounds=1000\n");
    return 0;
}
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-fq-poly-resource-"));
try {
  const sourcePath = join(temporary, "lifecycle.c");
  const executable = join(temporary, "lifecycle");
  writeFileSync(sourcePath, source);
  const compiler = process.env.CC || "cc";
  const compile = spawnSync(compiler, [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(flintPrefix, "include")}`,
    sourcePath,
    `-L${join(flintPrefix, "lib")}`,
    "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
    "-o", executable,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(
    compile.status,
    0,
    `sanitizer harness compile failed:\n${compile.stdout}${compile.stderr}`,
  );
  const executed = spawnSync(executable, [], {
    cwd: root,
    env: {
      ...process.env,
      ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
      UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
    },
    encoding: "utf8",
  });
  assert.equal(
    executed.status,
    0,
    `sanitizer harness failed:\n${executed.stdout}${executed.stderr}`,
  );
  assert.equal(executed.stdout.trim(), "rounds=1000");
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/extension-polynomial-resource-v1",
    capability: "sanitizers",
    supported: true,
    compiler,
    result: executed.stdout.trim(),
  }) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
