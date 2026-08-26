#!/usr/bin/env node
// sagejs-test-tier: integration
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
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

function integerPolynomial(coefficients, seal = true) {
  const result = flint.ffiFmpzPolynomialCreate(BigInt(coefficients.length));
  try {
    for (let index = 0; index < coefficients.length; index += 1) {
      flint.ffiFmpzPolynomialSetCoefficient(
        result, BigInt(index), BigInt(coefficients[index]),
      );
    }
    if (seal) flint.ffiFmpzPolynomialSeal(result);
    return result;
  } catch (error) {
    flint.ffiFmpzPolynomialClose(result);
    throw error;
  }
}

function rationalPolynomial(coefficients, seal = true) {
  const result = flint.ffiFmpqPolynomialCreate(BigInt(coefficients.length));
  try {
    for (let index = 0; index < coefficients.length; index += 1) {
      const [numerator, denominator] = coefficients[index];
      flint.ffiFmpqPolynomialSetCoefficient(
        result, BigInt(index), BigInt(numerator), BigInt(denominator),
      );
    }
    if (seal) flint.ffiFmpqPolynomialSeal(result);
    return result;
  } catch (error) {
    flint.ffiFmpqPolynomialClose(result);
    throw error;
  }
}

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function readU64(source, offset) {
  let result = 0n;
  for (let byte = 7; byte >= 0; byte -= 1) {
    result = (result << 8n) | BigInt(source[offset + byte]);
  }
  return result;
}

{
  const source = integerPolynomial([24n, 0n, -18n, -6n]);
  const factorization = flint.ffiFmpzPolynomialFactorResource(source);
  assert.equal(flint.ffiExactPolynomialFactorizationCount(factorization), 2n);
  assert.equal(
    flint.ffiExactPolynomialFactorizationUnitNumerator(factorization), -6n,
  );
  assert.equal(
    flint.ffiExactPolynomialFactorizationUnitDenominator(factorization), 1n,
  );
  assert.ok(accounted(factorization) > 0n);
  const bulk = flint.ffiExactPolynomialFactorizationCopyBytes(factorization);
  assert.deepEqual([...bulk.subarray(0, 5)], [83, 74, 80, 70, 1]);
  assert.equal(readU64(bulk, 8), 2n);
  const factors = [0n, 1n].map((index) => ({
    exponent: flint.ffiExactPolynomialFactorizationExponent(
      factorization, index,
    ),
    value: flint.ffiExactPolynomialFactorizationFmpzFactor(
      factorization, index,
    ),
  }));
  assert.deepEqual(
    factors.map(({ exponent }) => exponent).sort(),
    [1n, 2n],
  );
  closeTwice(
    factorization, flint.ffiExactPolynomialFactorizationClose,
  );
  for (const factor of factors) {
    assert.ok(flint.ffiFmpzPolynomialLength(factor.value) >= 2n);
    closeTwice(factor.value, flint.ffiFmpzPolynomialClose);
  }
  assert.throws(
    () => flint.ffiExactPolynomialFactorizationCount(factorization),
    /closed/i,
  );
  assert.throws(
    () => flint.ffiExactPolynomialFactorizationCount(source),
    /declared .* resource/i,
  );
  flint.ffiFmpzPolynomialClose(source);
}

{
  const source = rationalPolynomial([
    [2n, 3n], [0n, 1n], [-1n, 2n], [-1n, 6n],
  ]);
  const factorization = flint.ffiFmpqPolynomialFactorResource(source);
  assert.equal(flint.ffiExactPolynomialFactorizationCount(factorization), 2n);
  assert.equal(
    flint.ffiExactPolynomialFactorizationUnitNumerator(factorization), -1n,
  );
  assert.equal(
    flint.ffiExactPolynomialFactorizationUnitDenominator(factorization), 6n,
  );
  const copied = flint.ffiExactPolynomialFactorizationFmpqFactor(
    factorization, 0n,
  );
  flint.ffiExactPolynomialFactorizationClose(factorization);
  assert.ok(flint.ffiFmpqPolynomialLength(copied) >= 2n);
  flint.ffiFmpqPolynomialClose(copied);
  flint.ffiFmpqPolynomialClose(source);
}

for (const [create, factor, close] of [
  [integerPolynomial, flint.ffiFmpzPolynomialFactorResource,
    flint.ffiFmpzPolynomialClose],
  [rationalPolynomial, flint.ffiFmpqPolynomialFactorResource,
    flint.ffiFmpqPolynomialClose],
]) {
  const unsealed = create([], false);
  assert.throws(() => factor(unsealed), /factorization of 0|unsealed/i);
  close(unsealed);
  const zero = create([]);
  assert.throws(() => factor(zero), /factorization of 0/i);
  close(zero);
}

const huge = (1n << 65537n) + 17n;
{
  const source = integerPolynomial([huge, -2n * huge, huge]);
  const factorization = flint.ffiFmpzPolynomialFactorResource(source);
  assert.equal(flint.ffiExactPolynomialFactorizationCount(factorization), 1n);
  assert.equal(
    flint.ffiExactPolynomialFactorizationUnitNumerator(factorization), huge,
  );
  assert.equal(
    flint.ffiExactPolynomialFactorizationExponent(factorization, 0n), 2n,
  );
  flint.ffiExactPolynomialFactorizationClose(factorization);
  flint.ffiFmpzPolynomialClose(source);
}

function runSage(source, extraEnvironment = {}) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
        ...extraEnvironment,
      },
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim();
}

const publicSource = [
  "import sagejs.ffi.flint as flint",
  "import sagejs.kernels.polynomial.packed_flint as packed_flint",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "def forbidden(*args):",
  "    raise AssertionError('packed factorization or scalar export was used')",
  "packed_flint.flint_packed_integer_polynomial_factor = forbidden",
  "packed_flint.flint_packed_rational_polynomial_factor = forbidden",
  "flint.fmpz_polynomial_coefficient = forbidden",
  "flint.fmpq_polynomial_coefficient_numerator = forbidden",
  "flint.fmpq_polynomial_coefficient_denominator = forbidden",
  "flint.exact_polynomial_factorization_count = forbidden",
  "flint.exact_polynomial_factorization_exponent = forbidden",
  "flint.exact_polynomial_factorization_unit_numerator = forbidden",
  "flint.exact_polynomial_factorization_unit_denominator = forbidden",
  "flint.exact_polynomial_factorization_fmpz_factor = forbidden",
  "flint.exact_polynomial_factorization_fmpq_factor = forbidden",
  "def forbid_materialization(self):",
  "    raise AssertionError('compatibility storage was materialized')",
  "setattr(type(x), '_materialize_exact_compatibility_storage', forbid_materialization)",
  "z_calls = 0",
  "q_calls = 0",
  "factorization_resources = []",
  "z_original = flint.fmpz_polynomial_factor_resource",
  "q_original = flint.fmpq_polynomial_factor_resource",
  "def z_counted(source):",
  "    global z_calls",
  "    z_calls += 1",
  "    answer = z_original(source)",
  "    factorization_resources.append(answer)",
  "    return answer",
  "def q_counted(source):",
  "    global q_calls",
  "    q_calls += 1",
  "    answer = q_original(source)",
  "    factorization_resources.append(answer)",
  "    return answer",
  "flint.fmpz_polynomial_factor_resource = z_counted",
  "flint.fmpq_polynomial_factor_resource = q_counted",
  "copy_calls = 0",
  "original_copy = flint.ExactPolynomialFactorization.copy_bytes",
  "def counted_copy(self):",
  "    global copy_calls",
  "    copy_calls += 1",
  "    return original_copy(self)",
  "flint.ExactPolynomialFactorization.copy_bytes = counted_copy",
  "huge = 2**65537 + 17",
  "z = -huge*(x - 1)**3*(x + 2)**2*(x**2 + x + 1)",
  "zf = z.factor()",
  "assert z_calls == 1 and copy_calls == 1 and zf.value() == z and zf.unit() == -huge",
  "assert all(factor._has_fmpz_polynomial_resource() for factor, exponent in zf)",
  "assert sorted(exponent for factor, exponent in zf) == [1, 2, 3]",
  "q = QQ(-huge, 2**32771 + 9)*(y - 1)**3*(y + 2)**2*(y**2 + y + 1)",
  "qf = q.factor()",
  "assert q_calls == 1 and copy_calls == 2 and qf.value() == q",
  "assert qf.unit() == QQ(-huge, 2**32771 + 9)",
  "assert all(factor._has_fmpq_polynomial_resource() for factor, exponent in qf)",
  "assert sorted(exponent for factor, exponent in qf) == [1, 2, 3]",
  "assert R(1).factor().value() == R(1)",
  "assert R(-7).factor().unit() == -7",
  "assert S(QQ(5, 11)).factor().unit() == QQ(5, 11)",
  "for zero in [R(0), S(0)]:",
  "    try:",
  "        zero.factor()",
  "    except ValueError:",
  "        pass",
  "    else:",
  "        raise AssertionError('zero factorization was accepted')",
  "def failing_copy(*args):",
  "    raise RuntimeError('injected bulk transfer failure')",
  "flint.ExactPolynomialFactorization.copy_bytes = failing_copy",
  "try:",
  "    (x + 1).factor()",
  "except RuntimeError:",
  "    pass",
  "else:",
  "    raise AssertionError('injected failure was ignored')",
  "assert factorization_resources[-1].closed",
  "flint.ExactPolynomialFactorization.copy_bytes = original_copy",
  "print('exact-polynomial-factorization-resource-ok')",
  "",
].join("\n");

assert.equal(
  runSage(publicSource),
  "exact-polynomial-factorization-resource-ok",
);
assert.equal(
  runSage(publicSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-polynomial-factorization-resource-ok",
);

const portableSource = [
  "import sagejs._baselib.polynomial as polynomial_module",
  "polynomial_module._generated_flint_resources_available_cache = False",
  "R = PolynomialRing(ZZ, 'x'); x = R.gen()",
  "z = -6*(x - 1)**3*(x + 2)**2",
  "assert z.factor().value() == z",
  "S = PolynomialRing(QQ, 'y'); y = S.gen()",
  "q = QQ(-5, 11)*(y - 1)**2*(y + 2)",
  "assert q.factor().value() == q",
  "print('portable-exact-polynomial-factorization-ok')",
  "",
].join("\n");

assert.equal(
  runSage(portableSource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "portable-exact-polynomial-factorization-ok",
);

if (process.platform !== "win32") {
  const source = String.raw`
#include <stdint.h>
#include <sagejs/exact_polynomial_ffi.h>

int main(void)
{
    fmpz_t coefficient, unit, count, exponent;
    fmpz_init(coefficient);
    fmpz_init(unit);
    fmpz_init(count);
    fmpz_init(exponent);
    for (slong round = 0; round < 300; round++)
    {
        sagejs_fmpz_polynomial_t z, zzero, zunsealed, zfactor;
        sagejs_fmpq_polynomial_t q, qfactor;
        sagejs_exact_polynomial_factorization_t zf, qf;
        unsigned char *factor_bytes = NULL;
        uint64_t factor_byte_count = 0;
        if (!sagejs_fmpz_polynomial_init(z, 4) ||
            !sagejs_fmpq_polynomial_init(q, 4) ||
            !sagejs_fmpz_polynomial_init(zzero, 0) ||
            !sagejs_fmpz_polynomial_init(zunsealed, 1))
            return 2;
        const slong values[4] = {24, 0, -18, -6};
        for (slong index = 0; index < 4; index++)
        {
            fmpz_set_si(coefficient, values[index]);
            if (!sagejs_fmpz_polynomial_set_coefficient(
                    z, (uint64_t) index, coefficient) ||
                !sagejs_fmpq_polynomial_set_coefficient(
                    q, (uint64_t) index, coefficient, unit))
            {
                /* unit is initialized but zero on the first iteration. */
                if (index == 0)
                {
                    fmpz_one(unit);
                    if (!sagejs_fmpq_polynomial_set_coefficient(
                            q, 0, coefficient, unit))
                        return 3;
                }
                else
                    return 3;
            }
        }
        if (!sagejs_fmpz_polynomial_seal(z) ||
            !sagejs_fmpq_polynomial_seal(q) ||
            !sagejs_fmpz_polynomial_seal(zzero) ||
            sagejs_fmpz_polynomial_factor_resource(zf, zzero) ||
            sagejs_fmpz_polynomial_factor_resource(zf, zunsealed) ||
            !sagejs_fmpz_polynomial_factor_resource(zf, z) ||
            !sagejs_fmpq_polynomial_factor_resource(qf, q) ||
            !sagejs_exact_polynomial_factorization_count(count, zf) ||
            fmpz_cmp_ui(count, 2) != 0 ||
            !sagejs_exact_polynomial_factorization_unit_numerator(unit, zf) ||
            fmpz_cmp_si(unit, -6) != 0 ||
            !sagejs_exact_polynomial_factorization_exponent(exponent, zf, 0) ||
            !sagejs_exact_polynomial_factorization_fmpz_factor(zfactor, zf, 0) ||
            !sagejs_exact_polynomial_factorization_fmpq_factor(qfactor, qf, 0) ||
            !sagejs_exact_polynomial_factorization_copy_bytes(
                &factor_bytes, &factor_byte_count, zf) ||
            factor_byte_count < 16 || factor_bytes[0] != 'S' ||
            factor_bytes[1] != 'J' || factor_bytes[2] != 'P' ||
            factor_bytes[3] != 'F' ||
            sagejs_exact_polynomial_factorization_exponent(exponent, zf, 2) ||
            sagejs_exact_polynomial_factorization_allocated_bytes(zf) == 0)
            return 4;
        sagejs_exact_polynomial_factorization_free_bytes(factor_bytes);
        sagejs_exact_polynomial_factorization_clear(qf);
        sagejs_exact_polynomial_factorization_clear(zf);
        if (!zfactor->sealed || !qfactor->sealed)
            return 5;
        sagejs_fmpq_polynomial_clear(qfactor);
        sagejs_fmpz_polynomial_clear(zfactor);
        sagejs_fmpz_polynomial_clear(zunsealed);
        sagejs_fmpz_polynomial_clear(zzero);
        sagejs_fmpq_polynomial_clear(q);
        sagejs_fmpz_polynomial_clear(z);
    }
    fmpz_clear(exponent);
    fmpz_clear(count);
    fmpz_clear(unit);
    fmpz_clear(coefficient);
    return 0;
}
`;
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-factor-resource-"));
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, source);
    const compile = spawnSync(process.env.CC || "cc", [
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
      compile.status, 0,
      `sanitizer compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
        UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
      },
    });
    assert.equal(
      run.status, 0,
      `sanitizer harness failed:\n${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  schema: "sagejs.polynomial/exact-factorization-resource-v1",
  status: "ok",
}));
