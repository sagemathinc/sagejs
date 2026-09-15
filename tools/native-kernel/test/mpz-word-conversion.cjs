// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { generateExactCoreRuntime } = require("../exact-runtime.cjs");

const runtime = generateExactCoreRuntime();
const conversions = runtime.slice(runtime.indexOf("static int mpz_to_int64("),
  runtime.indexOf("static uint64_t sagejs_mpz_mod_uint64("));
const fallback = conversions.replaceAll("mpz_to_int64", "fallback_int64")
  .replaceAll("mpz_to_uint64", "fallback_uint64")
  .replaceAll("#if GMP_NUMB_BITS == 64", "#if 0");
const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <limits.h>
#include <stdio.h>
#include <time.h>
#include <gmp.h>
` + conversions + fallback + String.raw`
/* Prior export implementations retained as the local timing baseline. */
static int old_int64(const mpz_t value, int64_t *result)
{
    int sign = mpz_sgn(value);
    size_t count = 0;
    uint64_t magnitude = 0;
    if (sign == 0) { *result = 0; return 1; }
    if (mpz_sizeinbase(value, 2) > 64) return 0;
    mpz_export(&magnitude, &count, -1, sizeof(magnitude), 0, 0, value);
    if (count > 1) return 0;
    if (sign > 0) {
        if (magnitude > (uint64_t) INT64_MAX) return 0;
        *result = (int64_t) magnitude; return 1;
    }
    if (magnitude > (UINT64_C(1) << 63)) return 0;
    if (magnitude == (UINT64_C(1) << 63)) *result = INT64_MIN;
    else *result = -(int64_t) magnitude;
    return 1;
}
static int old_uint64(const mpz_t value, uint64_t *result)
{
    size_t count = 0;
    uint64_t magnitude = 0;
    if (mpz_sgn(value) < 0 || mpz_sizeinbase(value, 2) > 64) return 0;
    if (mpz_sgn(value) == 0) { *result = 0; return 1; }
    mpz_export(&magnitude, &count, -1, sizeof(magnitude), 0, 0, value);
    if (count > 1) return 0;
    *result = magnitude; return 1;
}
static size_t checked = 0;
static void verify(const mpz_t z)
{
    int64_t actual = -91, reference = -91, other = -91;
    uint64_t ua = 93, ur = 93, uf = 93;
    int a = mpz_to_int64(z, &actual), r = old_int64(z, &reference);
    assert(a == r && actual == reference);
    assert(fallback_int64(z, &other) == r && other == reference);
    a = mpz_to_uint64(z, &ua); r = old_uint64(z, &ur);
    assert(a == r && ua == ur);
    assert(fallback_uint64(z, &uf) == r && uf == ur);
    if (!a) assert(ua == 93);
    mpz_t min, max, restored;
    mpz_inits(min, max, restored, NULL);
    mpz_set_ui(max, 1); mpz_mul_2exp(max, max, 63);
    mpz_neg(min, max); mpz_sub_ui(max, max, 1);
    int fits = mpz_cmp(z, min) >= 0 && mpz_cmp(z, max) <= 0;
    assert(mpz_to_int64(z, &actual) == fits);
    if (!fits) assert(actual == -91);
    else {
        uint64_t mag = actual < 0 ? (uint64_t) (-(actual + 1)) + 1 : (uint64_t) actual;
        mpz_import(restored, 1, -1, sizeof(mag), 0, 0, &mag);
        if (actual < 0) mpz_neg(restored, restored);
        assert(mpz_cmp(restored, z) == 0);
    }
    mpz_set_ui(max, 1); mpz_mul_2exp(max, max, 64); mpz_sub_ui(max, max, 1);
    fits = mpz_sgn(z) >= 0 && mpz_cmp(z, max) <= 0;
    assert(mpz_to_uint64(z, &ua) == fits);
    if (fits) {
        mpz_import(restored, 1, -1, sizeof(ua), 0, 0, &ua);
        assert(mpz_cmp(restored, z) == 0);
    }
    mpz_clears(min, max, restored, NULL);
    ++checked;
}
static volatile uint64_t sink;
static double bench(mpz_t *values, int old, int unsig)
{
    int (*volatile signed_fn)(const mpz_t, int64_t *) = old ? old_int64 : mpz_to_int64;
    int (*volatile unsigned_fn)(const mpz_t, uint64_t *) = old ? old_uint64 : mpz_to_uint64;
    clock_t start = clock();
    uint64_t checksum = 0;
    for (size_t i = 0; i < 1000000; ++i) {
        int64_t s = -1; uint64_t u = 1;
        if (unsig) checksum += unsigned_fn(values[i % 256], &u) + u;
        else checksum += signed_fn(values[i % 256], &s) + (uint64_t) s;
    }
    sink = checksum;
    return (double) (clock() - start) / CLOCKS_PER_SEC;
}
int main(void)
{
    mpz_t z, power, values[256];
    mpz_inits(z, power, NULL);
    for (long i = -65536; i <= 65536; ++i) { mpz_set_si(z, i); verify(z); }
    for (unsigned bit = 0; bit <= 256; ++bit) {
        mpz_set_ui(power, 1); mpz_mul_2exp(power, power, bit);
        for (long delta = -3; delta <= 3; ++delta) {
            mpz_set(z, power);
            if (delta < 0) mpz_sub_ui(z, z, (unsigned long) -delta);
            else mpz_add_ui(z, z, (unsigned long) delta);
            verify(z); mpz_neg(z, z); verify(z);
        }
    }
    gmp_randstate_t random; gmp_randinit_default(random); gmp_randseed_ui(random, 81723);
    for (unsigned i = 0; i < 12000; ++i) {
        mpz_urandomb(z, random, 1 + i % 4096);
        verify(z); mpz_neg(z, z); verify(z);
    }
    for (unsigned i = 0; i < 256; ++i) mpz_init_set_ui(values[i], i * 17);
    printf("checks=%zu limb_bits=%d\n", checked, GMP_NUMB_BITS);
    for (unsigned sample = 0; sample < 4; ++sample) {
        double old_s, new_s, old_u, new_u;
        if (sample % 2 == 0) {
            old_s = bench(values, 1, 0); new_s = bench(values, 0, 0);
            old_u = bench(values, 1, 1); new_u = bench(values, 0, 1);
        } else {
            new_s = bench(values, 0, 0); old_s = bench(values, 1, 0);
            new_u = bench(values, 0, 1); old_u = bench(values, 1, 1);
        }
        printf("sample=%u signed_old=%.6f signed_new=%.6f unsigned_old=%.6f unsigned_new=%.6f\n",
            sample, old_s, new_s, old_u, new_u);
    }
    for (unsigned i = 0; i < 256; ++i) mpz_clear(values[i]);
    gmp_randclear(random); mpz_clears(z, power, NULL);
    return 0;
}
`;

test("checked mpz word extraction matches export and preserves failure outputs", {skip: process.platform === "win32"}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-mpz-word-"));
  try {
    const source = path.join(directory, "conversion.c");
    const binary = path.join(directory, "conversion");
    const prefix = process.env.SAGEJS_FLINT_PREFIX || path.resolve(__dirname, "../../../packages/flint/.native/prefix");
    fs.writeFileSync(source, harness);
    for (const sanitizer of [false, true]) {
      const built = spawnSync(process.env.CC || "cc", ["-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
        ...(sanitizer ? ["-fsanitize=undefined", "-fno-sanitize-recover=all"] : []),
        `-I${path.join(prefix, "include")}`, source, path.join(prefix, "lib/libgmp.a"), "-o", binary],
      {encoding: "utf8", timeout: 30000});
      assert.equal(built.status, 0, built.stderr);
      const run = spawnSync(binary, [], {encoding: "utf8", timeout: 30000});
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /checks=158671 limb_bits=/);
      if (!sanitizer) process.stdout.write(run.stdout);
    }
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
