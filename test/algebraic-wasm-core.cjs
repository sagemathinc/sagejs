// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const prefix = path.join(root, "packages", "flint", ".native", "prefix");

const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "algebraic_core.h"

static void put_u32(uint8_t *p, uint32_t x) {
    p[0] = (uint8_t) x; p[1] = (uint8_t) (x >> 8);
    p[2] = (uint8_t) (x >> 16); p[3] = (uint8_t) (x >> 24);
}

static uint32_t get_u32(const uint8_t *p) {
    return (uint32_t) p[0] | ((uint32_t) p[1] << 8) |
        ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24);
}

static uint32_t pack_i64(uint8_t *p, int64_t x) {
    uint64_t magnitude = x < 0 ? (uint64_t) (-(x + 1)) + 1 : (uint64_t) x;
    uint32_t count = 0;
    put_u32(p, x < 0 ? 1 : 0);
    while (count < 8 && (magnitude >> (8 * count)) != 0) count++;
    put_u32(p + 4, count);
    for (uint32_t i = 0; i < count; i++) p[8 + i] = (uint8_t) (magnitude >> (8 * i));
    return 8 + count;
}

static uint32_t pack_values(uint8_t *p, const int64_t *values, uint32_t count) {
    uint32_t offset = 4;
    put_u32(p, count);
    for (uint32_t i = 0; i < count; i++) offset += pack_i64(p + offset, values[i]);
    return offset;
}

static int64_t unpack_small(const uint8_t *p, uint32_t length, uint32_t *offset) {
    assert(*offset + 8 <= length);
    uint32_t sign = get_u32(p + *offset);
    uint32_t count = get_u32(p + *offset + 4);
    assert(count <= 8 && *offset + 8 + count <= length);
    uint64_t value = 0;
    for (uint32_t i = 0; i < count; i++) value |= (uint64_t) p[*offset + 8 + i] << (8 * i);
    *offset += 8 + count;
    return sign ? -(int64_t) value : (int64_t) value;
}

int main(void) {
    sagejs_algebraic_context *context = sagejs_algebraic_context_create();
    uint8_t packed[4096];
    uint8_t output[4096];
    uint32_t length, output_length, handle_two, handle_sqrt, handle_i, restored, rejected;
    uint32_t roots[8], multiplicities[8], count;
    int32_t value;
    assert(context != NULL);

    const int64_t rational_two[] = {2, 1};
    length = pack_values(packed, rational_two, 2);
    assert(sagejs_algebraic_from_rational(context, packed, length, &handle_two) == 0);
    const int64_t half[] = {1, 2};
    length = pack_values(packed, half, 2);
    assert(sagejs_algebraic_pow_rational(context, handle_two, packed, length, &handle_sqrt) == 0);
    assert(sagejs_algebraic_property_value(context, handle_sqrt, SAGEJS_ALGEBRAIC_IS_REAL, &value) == 0);
    assert(value == 1);
    assert(sagejs_algebraic_property_value(context, handle_sqrt, SAGEJS_ALGEBRAIC_DEGREE, &value) == 0);
    assert(value == 2);
    assert(sagejs_algebraic_root_of_unity(context, 1, 4, &handle_i) == 0);
    assert(sagejs_algebraic_unary(
        context, SAGEJS_ALGEBRAIC_IMAG, handle_i, &restored) == 0);
    assert(sagejs_algebraic_property_value(
        context, restored, SAGEJS_ALGEBRAIC_IS_RATIONAL, &value) == 0);
    assert(value == 1);
    assert(sagejs_algebraic_close(context, restored) == 0);

    assert(sagejs_algebraic_cyclotomic_coefficients(
        context, handle_i, 4, output, sizeof(output), &output_length) == 0);
    uint32_t coordinate_offset = 4;
    assert(get_u32(output) == 3);
    assert(unpack_small(output, output_length, &coordinate_offset) == 1);
    assert(unpack_small(output, output_length, &coordinate_offset) == 0);
    assert(unpack_small(output, output_length, &coordinate_offset) == 1);
    assert(sagejs_algebraic_cyclotomic_coefficients(
        context, handle_i, 4, output, 10, &output_length) == SAGEJS_ALGEBRAIC_BUFFER_TOO_SMALL);
    assert(sagejs_algebraic_cyclotomic_coefficients(
        context, handle_i, 4096, output, sizeof(output), &output_length) == SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);

    uint32_t entries[] = {handle_two, handle_two, handle_two, handle_two, handle_two, handle_two};
    uint32_t matrix, kernel, transposed, annihilator, selected, stacked, nullity;
    uint32_t indices[] = {2, 0};
    assert(sagejs_algebraic_matrix_create(context, 2, 3, entries, 6, 1, &matrix) == 0);
    assert(sagejs_algebraic_matrix_right_kernel(context, matrix, &kernel, &nullity) == 0);
    uint32_t pivot_columns[128], pivot_count;
    assert(sagejs_algebraic_matrix_pivots(context, kernel, pivot_columns, 128, &pivot_count) == 0);
    assert(pivot_count == nullity);
    for (uint32_t i = 1; i < pivot_count; i++) assert(pivot_columns[i-1] < pivot_columns[i]);
    assert(sagejs_algebraic_matrix_pivots(context, matrix, pivot_columns, 0, &pivot_count) == SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);
    assert(pivot_count == 0);
    assert(sagejs_algebraic_matrix_pivots(context, matrix, NULL, 128, &pivot_count) == SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);
    assert(sagejs_algebraic_matrix_pivots(context, matrix, pivot_columns, 128, NULL) == SAGEJS_ALGEBRAIC_INVALID_ARGUMENT);
    assert(nullity == 2);
    assert(sagejs_algebraic_matrix_unary(context, SAGEJS_ALGEBRAIC_MATRIX_TRANSPOSE, kernel, &transposed) == 0);
    assert(sagejs_algebraic_matrix_binary(context, SAGEJS_ALGEBRAIC_MATRIX_MUL, matrix, transposed, &annihilator) == 0);
    assert(sagejs_algebraic_matrix_rank(context, annihilator, &value) == 0 && value == 0);
    assert(sagejs_algebraic_matrix_select(context, matrix, indices, 2, 1, &selected) == 0);
    assert(sagejs_algebraic_matrix_rank(context, selected, &value) == 0 && value == 1);
    assert(sagejs_algebraic_matrix_binary(context, SAGEJS_ALGEBRAIC_MATRIX_STACK, matrix, matrix, &stacked) == 0);
    assert(sagejs_algebraic_matrix_rank(context, stacked, &value) == 0 && value == 1);
    indices[0] = 3;
    assert(sagejs_algebraic_matrix_select(context, matrix, indices, 1, 1, &rejected) == SAGEJS_ALGEBRAIC_INVALID_ARGUMENT);
    assert(sagejs_algebraic_matrix_select(context, matrix, indices, 129, 1, &rejected) == SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);
    assert(sagejs_algebraic_matrix_select(context, matrix, NULL, 1, 1, &rejected) == SAGEJS_ALGEBRAIC_INVALID_ARGUMENT);
    assert(sagejs_algebraic_matrix_right_kernel(context, matrix, &rejected, NULL) == SAGEJS_ALGEBRAIC_INVALID_ARGUMENT);
    assert(sagejs_algebraic_matrix_live_count(context) == 6);
    assert(sagejs_algebraic_matrix_close(context, matrix) == 0);
    assert(sagejs_algebraic_matrix_close(context, kernel) == 0);
    assert(sagejs_algebraic_matrix_close(context, transposed) == 0);
    assert(sagejs_algebraic_matrix_close(context, annihilator) == 0);
    assert(sagejs_algebraic_matrix_close(context, selected) == 0);
    assert(sagejs_algebraic_matrix_close(context, stacked) == 0);
    assert(sagejs_algebraic_matrix_live_count(context) == 0);

    assert(sagejs_algebraic_minpoly(context, handle_sqrt, output, sizeof(output), &output_length) == 0);
    assert(get_u32(output) == 3);
    uint32_t offset = 4;
    assert(unpack_small(output, output_length, &offset) == -2);
    assert(unpack_small(output, output_length, &offset) == 0);
    assert(unpack_small(output, output_length, &offset) == 1);
    assert(offset == output_length);

    const int64_t repeated[] = {4, 0, -4, 0, 1};
    length = pack_values(packed, repeated, 5);
    assert(sagejs_algebraic_polynomial_roots(
        context, packed, length, roots, multiplicities, 8, &count) == 0);
    assert(count == 2 && multiplicities[0] == 2 && multiplicities[1] == 2);
    assert(sagejs_algebraic_compare_real(context, roots[0], roots[1], &value) == 0);
    assert(value < 0);
    assert(sagejs_algebraic_equal(context, handle_sqrt, roots[1], &value) == 0);
    assert(value == 1);

    assert(sagejs_algebraic_enclosure(context, handle_sqrt, 128, output, sizeof(output), &output_length) == 0);
    assert(get_u32(output) == 6 && output_length > 4);
    assert(sagejs_algebraic_format(context, handle_sqrt, 16, output, sizeof(output), &output_length) == 0);
    assert(output_length > 4);

    assert(sagejs_algebraic_serialize(context, handle_sqrt, output, sizeof(output), &output_length) == 0);
    assert(sagejs_algebraic_deserialize(context, output, output_length, &restored) == 0);
    assert(sagejs_algebraic_equal(context, handle_sqrt, restored, &value) == 0 && value == 1);

    uint32_t malformed_length = pack_values(packed, rational_two, 2);
    put_u32(packed + 4, 1); put_u32(packed + 8, 0);
    assert(sagejs_algebraic_from_rational(context, packed, malformed_length, &rejected) == SAGEJS_ALGEBRAIC_MALFORMED_ENCODING);

    assert(sagejs_algebraic_close(context, restored) == 0);
    assert(sagejs_algebraic_close(context, restored) == SAGEJS_ALGEBRAIC_INVALID_HANDLE);
    assert(sagejs_algebraic_close(context, roots[0]) == 0);
    assert(sagejs_algebraic_close(context, roots[1]) == 0);
    assert(sagejs_algebraic_close(context, handle_i) == 0);
    assert(sagejs_algebraic_close(context, handle_sqrt) == 0);
    assert(sagejs_algebraic_close(context, handle_two) == 0);
    assert(sagejs_algebraic_live_count(context) == 0);

    put_u32(packed, SAGEJS_ALGEBRAIC_MAX_DEGREE + 2);
    assert(sagejs_algebraic_polynomial_roots(
        context, packed, 4, roots, multiplicities, 8, &count) ==
        SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);
    assert(sagejs_algebraic_live_count(context) == 0);

    uint32_t *limit_handles = malloc(
        SAGEJS_ALGEBRAIC_MAX_VALUES * sizeof(uint32_t));
    assert(limit_handles != NULL);
    length = pack_values(packed, rational_two, 2);
    for (uint32_t i = 0; i < SAGEJS_ALGEBRAIC_MAX_VALUES; i++)
        assert(sagejs_algebraic_from_rational(
            context, packed, length, limit_handles + i) == 0);
    assert(sagejs_algebraic_live_count(context) == SAGEJS_ALGEBRAIC_MAX_VALUES);
    assert(sagejs_algebraic_from_rational(
        context, packed, length, &rejected) == SAGEJS_ALGEBRAIC_RESOURCE_LIMIT);
    assert(sagejs_algebraic_live_count(context) == SAGEJS_ALGEBRAIC_MAX_VALUES);
    for (uint32_t i = 0; i < SAGEJS_ALGEBRAIC_MAX_VALUES; i++)
        assert(sagejs_algebraic_close(context, limit_handles[i]) == 0);
    free(limit_handles);
    assert(sagejs_algebraic_live_count(context) == 0);
    sagejs_algebraic_context_destroy(context);
    return 0;
}
`;

test("host-neutral algebraic core is exact, bounded, serializable, and lifecycle-safe", {
  skip: fs.existsSync(path.join(prefix, "lib", "libflint.a"))
    ? false
    : "prepared FLINT development prefix is unavailable",
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-algebraic-core-"));
  try {
    const source = path.join(directory, "harness.c");
    const executable = path.join(directory, "harness");
    fs.writeFileSync(source, harness);
    childProcess.execFileSync("cc", [
      "-std=c11",
      "-O2",
      "-Wall",
      "-Wextra",
      ...(process.env.SAGEJS_ALGEBRAIC_CORE_SANITIZE === "1"
        ? ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"] : []),
      `-I${path.join(prefix, "include")}`,
      `-I${path.join(root, "packages", "flint", "src")}`,
      source,
      path.join(root, "packages", "flint", "src", "algebraic_core.c"),
      `-L${path.join(prefix, "lib")}`,
      "-lflint",
      "-lopenblas",
      "-lmpc",
      "-lmpfr",
      "-lgmp",
      "-lm",
      "-lpthread",
      "-o",
      executable,
    ], { cwd: root, stdio: "pipe" });
    childProcess.execFileSync(executable, [], { stdio: "pipe" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
