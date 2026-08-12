#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-mod-poly-"));
const source = join(temporary, "witness.c");
const executable = join(temporary, "witness");
const sanitize = process.env.SAGEJS_FFI_SANITIZE === "1";

writeFileSync(
  source,
  String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "sagejs/fmpz_mod_polynomial_ffi.h"

static void polynomial(
    sagejs_fmpz_mod_polynomial_t output,
    const fmpz_t modulus,
    const slong *coefficients,
    size_t length)
{
    assert(sagejs_fmpz_mod_polynomial_init(
        output, modulus, (uint64_t) length));
    fmpz_t coefficient;
    fmpz_init(coefficient);
    for (size_t index = 0; index < length; index++)
    {
        fmpz_set_si(coefficient, coefficients[index]);
        assert(sagejs_fmpz_mod_polynomial_set_coefficient(
            output, (uint64_t) index, coefficient));
    }
    fmpz_clear(coefficient);
    assert(sagejs_fmpz_mod_polynomial_seal(output));
}

static void assert_coefficient(
    const sagejs_fmpz_mod_polynomial_t polynomial,
    uint64_t index, const char *expected)
{
    fmpz_t value;
    fmpz_init(value);
    assert(sagejs_fmpz_mod_polynomial_coefficient(value, polynomial, index));
    char *actual = fmpz_get_str(NULL, 10, value);
    assert(strcmp(actual, expected) == 0);
    flint_free(actual);
    fmpz_clear(value);
}

static void assert_equal(
    const sagejs_fmpz_mod_polynomial_t left,
    const sagejs_fmpz_mod_polynomial_t right)
{
    fmpz_t value;
    fmpz_init(value);
    assert(sagejs_fmpz_mod_polynomial_equal(value, left, right));
    assert(fmpz_is_one(value));
    fmpz_clear(value);
}

int main(void)
{
    fmpz_t p89, p127, p521;
    fmpz_init(p89);
    fmpz_init(p127);
    fmpz_init(p521);
    fmpz_one(p89);
    fmpz_mul_2exp(p89, p89, 89);
    fmpz_sub_ui(p89, p89, 1);
    fmpz_one(p127);
    fmpz_mul_2exp(p127, p127, 127);
    fmpz_sub_ui(p127, p127, 1);
    fmpz_one(p521);
    fmpz_mul_2exp(p521, p521, 521);
    fmpz_sub_ui(p521, p521, 1);
    fmpz_t composite;
    fmpz_init_set_ui(composite, 15);
    sagejs_fmpz_mod_polynomial_t rejected_composite;
    assert(!sagejs_fmpz_mod_polynomial_init(
        rejected_composite, composite, 1));
    fmpz_clear(composite);

    const slong left_values[] = {-1, 0, 1};
    const slong divisor_values[] = {-1, 1};
    sagejs_fmpz_mod_polynomial_t left, divisor;
    polynomial(left, p89, left_values, 3);
    polynomial(divisor, p89, divisor_values, 2);
    assert(sagejs_fmpz_mod_polynomial_allocated_bytes(left) >
        sizeof(sagejs_fmpz_mod_polynomial_struct));
    assert_coefficient(left, 0, "618970019642690137449562110");

    sagejs_fmpz_mod_polynomial_t copied, product, sum, negated, powered;
    assert(sagejs_fmpz_mod_polynomial_copy(copied, left));
    assert(sagejs_fmpz_mod_polynomial_mul(product, left, divisor));
    assert(sagejs_fmpz_mod_polynomial_add(sum, left, divisor));
    assert(sagejs_fmpz_mod_polynomial_neg(negated, divisor));
    assert(sagejs_fmpz_mod_polynomial_pow(powered, divisor, 5));
    assert_equal(copied, left);

    sagejs_fmpz_mod_polynomial_division_result_t division;
    assert(sagejs_fmpz_mod_polynomial_divrem_resource(
        division, left, divisor));
    sagejs_fmpz_mod_polynomial_t quotient, remainder;
    assert(sagejs_fmpz_mod_polynomial_division_result_quotient(
        quotient, division));
    assert(sagejs_fmpz_mod_polynomial_division_result_remainder(
        remainder, division));
    sagejs_fmpz_mod_polynomial_division_result_clear(division);
    fmpz_t scalar;
    fmpz_init(scalar);
    assert(sagejs_fmpz_mod_polynomial_length(scalar, quotient));
    assert(fmpz_equal_ui(scalar, 2));
    assert_coefficient(quotient, 0, "1");
    assert_coefficient(quotient, 1, "1");
    assert(sagejs_fmpz_mod_polynomial_length(scalar, remainder));
    assert(fmpz_is_zero(scalar));

    sagejs_fmpz_mod_polynomial_xgcd_result_t extended;
    assert(sagejs_fmpz_mod_polynomial_xgcd_resource(
        extended, left, divisor));
    sagejs_fmpz_mod_polynomial_t gcd, bezout_left, bezout_right;
    assert(sagejs_fmpz_mod_polynomial_xgcd_result_gcd(gcd, extended));
    assert(sagejs_fmpz_mod_polynomial_xgcd_result_left_coefficient(
        bezout_left, extended));
    assert(sagejs_fmpz_mod_polynomial_xgcd_result_right_coefficient(
        bezout_right, extended));
    sagejs_fmpz_mod_polynomial_xgcd_result_clear(extended);
    assert(sagejs_fmpz_mod_polynomial_length(scalar, gcd));
    assert(fmpz_equal_ui(scalar, 2));
    assert_coefficient(gcd, 1, "1");

    /* Factorization preserves a nonmonic unit and repeated exponents. Child
       resources remain independently owned after the aggregate closes. */
    const slong target_values[] = {104, -52, -130, 13, 52, 13};
    sagejs_fmpz_mod_polynomial_t target;
    polynomial(target, p89, target_values, 6);
    sagejs_fmpz_mod_polynomial_factorization_t factorization;
    assert(sagejs_fmpz_mod_polynomial_factor_resource(factorization, target));
    assert(sagejs_fmpz_mod_polynomial_factorization_count(
        scalar, factorization));
    assert(fmpz_equal_ui(scalar, 2));
    assert(sagejs_fmpz_mod_polynomial_factorization_unit(
        scalar, factorization));
    assert(fmpz_equal_ui(scalar, 13));
    unsigned char *factor_bytes = NULL;
    uint64_t factor_bytes_length = 0;
    assert(sagejs_fmpz_mod_polynomial_factorization_copy_bytes(
        &factor_bytes, &factor_bytes_length, factorization));
    assert(factor_bytes_length > 32);
    assert(memcmp(factor_bytes, "SJFPM\1\0\0", 8) == 0);
    assert(sagejs_fmpz_mod_polynomial_read_u64(factor_bytes, 8) == 2);
    sagejs_fmpz_mod_polynomial_free_bytes(factor_bytes);
    sagejs_fmpz_mod_polynomial_t factor, other_factor;
    assert(sagejs_fmpz_mod_polynomial_factorization_factor(
        factor, factorization, 0));
    assert(sagejs_fmpz_mod_polynomial_factorization_factor(
        other_factor, factorization, 1));
    fmpz_t first_exponent, second_exponent;
    fmpz_init(first_exponent);
    fmpz_init(second_exponent);
    assert(sagejs_fmpz_mod_polynomial_factorization_exponent(
        first_exponent, factorization, 0));
    assert(sagejs_fmpz_mod_polynomial_factorization_exponent(
        second_exponent, factorization, 1));
    assert((fmpz_equal_ui(first_exponent, 2) &&
            fmpz_equal_ui(second_exponent, 3)) ||
        (fmpz_equal_ui(first_exponent, 3) &&
            fmpz_equal_ui(second_exponent, 2)));
    sagejs_fmpz_mod_polynomial_factorization_clear(factorization);
    assert(sagejs_fmpz_mod_polynomial_length(scalar, factor));
    assert(fmpz_equal_ui(scalar, 2));
    sagejs_fmpz_mod_polynomial_t first_power, second_power, factor_product;
    assert(sagejs_fmpz_mod_polynomial_pow(
        first_power, factor, fmpz_get_ui(first_exponent)));
    assert(sagejs_fmpz_mod_polynomial_pow(
        second_power, other_factor, fmpz_get_ui(second_exponent)));
    assert(sagejs_fmpz_mod_polynomial_mul(
        factor_product, first_power, second_power));
    const slong unit_values[] = {13};
    sagejs_fmpz_mod_polynomial_t unit_polynomial, reconstructed;
    polynomial(unit_polynomial, p89, unit_values, 1);
    assert(sagejs_fmpz_mod_polynomial_mul(
        reconstructed, unit_polynomial, factor_product));
    assert_equal(reconstructed, target);

    sagejs_fmpz_mod_polynomial_roots_t roots;
    assert(sagejs_fmpz_mod_polynomial_roots_resource(roots, target));
    assert(sagejs_fmpz_mod_polynomial_roots_count(scalar, roots));
    assert(fmpz_equal_ui(scalar, 2));
    unsigned char *root_bytes = NULL;
    uint64_t root_bytes_length = 0;
    assert(sagejs_fmpz_mod_polynomial_roots_copy_bytes(
        &root_bytes, &root_bytes_length, roots));
    assert(root_bytes_length > 24);
    assert(memcmp(root_bytes, "SJRPM\1\0\0", 8) == 0);
    assert(sagejs_fmpz_mod_polynomial_read_u64(root_bytes, 8) == 2);
    sagejs_fmpz_mod_polynomial_free_bytes(root_bytes);
    fmpz_t root;
    fmpz_init(root);
    assert(sagejs_fmpz_mod_polynomial_roots_root(root, roots, 0));
    assert(sagejs_fmpz_mod_polynomial_roots_exponent(scalar, roots, 0));
    assert(fmpz_equal_ui(scalar, 2) || fmpz_equal_ui(scalar, 3));
    sagejs_fmpz_mod_polynomial_roots_clear(roots);

    sagejs_flint_byte_region_t bytes, text;
    assert(sagejs_fmpz_mod_polynomial_serialize(bytes, left));
    assert(bytes->length > 24);
    assert(memcmp(bytes->data, "SJMP\1\0\0\0", 8) == 0);
    sagejs_fmpz_mod_polynomial_t roundtrip;
    assert(sagejs_fmpz_mod_polynomial_deserialize(roundtrip, bytes));
    assert_equal(roundtrip, left);
    assert(sagejs_fmpz_mod_polynomial_format(text, left));
    assert(text->length != 0);

    /* Modulus equality is an exact precondition, not context identity. */
    sagejs_fmpz_mod_polynomial_t left127, left521;
    polynomial(left127, p127, left_values, 3);
    polynomial(left521, p521, left_values, 3);
    sagejs_fmpz_mod_polynomial_t rejected;
    assert(!sagejs_fmpz_mod_polynomial_add(rejected, left, left127));
    assert(!sagejs_fmpz_mod_polynomial_mul(rejected, left, left521));
    assert(!sagejs_fmpz_mod_polynomial_divrem_resource(
        division, left, left127));
    assert_coefficient(left127, 0,
        "170141183460469231731687303715884105726");
    assert_coefficient(left521, 1, "0");

    /* Thousands of independent result/close schedules catch accidental
       context borrowing under ASAN/LSAN and ordinary libc. */
    for (size_t iteration = 0; iteration < 4096; iteration++)
    {
        sagejs_fmpz_mod_polynomial_t temporary;
        assert(sagejs_fmpz_mod_polynomial_add(temporary, left, divisor));
        assert(sagejs_fmpz_mod_polynomial_length(scalar, temporary));
        sagejs_fmpz_mod_polynomial_clear(temporary);
    }
    for (size_t iteration = 0; iteration < 256; iteration++)
    {
        sagejs_fmpz_mod_polynomial_division_result_t aggregate_division;
        sagejs_fmpz_mod_polynomial_t child;
        assert(sagejs_fmpz_mod_polynomial_divrem_resource(
            aggregate_division, left, divisor));
        assert(sagejs_fmpz_mod_polynomial_division_result_quotient(
            child, aggregate_division));
        sagejs_fmpz_mod_polynomial_division_result_clear(aggregate_division);
        assert(sagejs_fmpz_mod_polynomial_length(scalar, child));
        sagejs_fmpz_mod_polynomial_clear(child);

        sagejs_fmpz_mod_polynomial_xgcd_result_t aggregate_xgcd;
        assert(sagejs_fmpz_mod_polynomial_xgcd_resource(
            aggregate_xgcd, left, divisor));
        assert(sagejs_fmpz_mod_polynomial_xgcd_result_gcd(
            child, aggregate_xgcd));
        sagejs_fmpz_mod_polynomial_xgcd_result_clear(aggregate_xgcd);
        assert(sagejs_fmpz_mod_polynomial_length(scalar, child));
        sagejs_fmpz_mod_polynomial_clear(child);

        sagejs_fmpz_mod_polynomial_factorization_t aggregate_factors;
        assert(sagejs_fmpz_mod_polynomial_factor_resource(
            aggregate_factors, target));
        assert(sagejs_fmpz_mod_polynomial_factorization_factor(
            child, aggregate_factors, 0));
        sagejs_fmpz_mod_polynomial_factorization_clear(aggregate_factors);
        assert(sagejs_fmpz_mod_polynomial_length(scalar, child));
        sagejs_fmpz_mod_polynomial_clear(child);

        sagejs_fmpz_mod_polynomial_roots_t aggregate_roots;
        assert(sagejs_fmpz_mod_polynomial_roots_resource(
            aggregate_roots, target));
        assert(sagejs_fmpz_mod_polynomial_roots_root(
            scalar, aggregate_roots, 0));
        sagejs_fmpz_mod_polynomial_roots_clear(aggregate_roots);
    }

    sagejs_fmpz_mod_polynomial_clear(left521);
    sagejs_fmpz_mod_polynomial_clear(left127);
    sagejs_flint_byte_region_clear(text);
    sagejs_fmpz_mod_polynomial_clear(roundtrip);
    sagejs_flint_byte_region_clear(bytes);
    fmpz_clear(root);
    sagejs_fmpz_mod_polynomial_clear(reconstructed);
    sagejs_fmpz_mod_polynomial_clear(unit_polynomial);
    sagejs_fmpz_mod_polynomial_clear(factor_product);
    sagejs_fmpz_mod_polynomial_clear(second_power);
    sagejs_fmpz_mod_polynomial_clear(first_power);
    fmpz_clear(second_exponent);
    fmpz_clear(first_exponent);
    sagejs_fmpz_mod_polynomial_clear(other_factor);
    sagejs_fmpz_mod_polynomial_clear(factor);
    sagejs_fmpz_mod_polynomial_clear(target);
    sagejs_fmpz_mod_polynomial_clear(bezout_right);
    sagejs_fmpz_mod_polynomial_clear(bezout_left);
    sagejs_fmpz_mod_polynomial_clear(gcd);
    sagejs_fmpz_mod_polynomial_clear(remainder);
    sagejs_fmpz_mod_polynomial_clear(quotient);
    sagejs_fmpz_mod_polynomial_clear(powered);
    sagejs_fmpz_mod_polynomial_clear(negated);
    sagejs_fmpz_mod_polynomial_clear(sum);
    sagejs_fmpz_mod_polynomial_clear(product);
    sagejs_fmpz_mod_polynomial_clear(copied);
    sagejs_fmpz_mod_polynomial_clear(divisor);
    sagejs_fmpz_mod_polynomial_clear(left);
    fmpz_clear(scalar);
    fmpz_clear(p521);
    fmpz_clear(p127);
    fmpz_clear(p89);
    return 0;
}
`,
);

const libraries = [
  "libflint.a",
  "libopenblas.a",
  "libmpc.a",
  "libmpfr.a",
  "libgmp.a",
].map((name) => join(prefix, "lib", name));

try {
  const compile = spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...(sanitize
      ? [
          "-fno-omit-frame-pointer",
          "-fsanitize=address,undefined",
        ]
      : []),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    source,
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(
    compile.status,
    0,
    `${compile.stdout}\n${compile.stderr}`,
  );
  const run = spawnSync(executable, [], {
    cwd: root,
    encoding: "utf8",
    env: sanitize
      ? sanitizerEnvironment()
      : process.env,
    timeout: 120_000,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
