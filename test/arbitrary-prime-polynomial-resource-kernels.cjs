#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

const witness = String.raw`
from sagejs.ffi.flint import (
    FlintByteRegion,
    fmpz_mod_polynomial,
    fmpz_mod_polynomial_add,
    fmpz_mod_polynomial_coefficient,
    fmpz_mod_polynomial_deserialize,
    fmpz_mod_polynomial_division_result_quotient,
    fmpz_mod_polynomial_division_result_remainder,
    fmpz_mod_polynomial_divrem_resource,
    fmpz_mod_polynomial_equal,
    fmpz_mod_polynomial_factor_resource,
    fmpz_mod_polynomial_modulus,
    fmpz_mod_polynomial_roots_resource,
    fmpz_mod_polynomial_seal,
    fmpz_mod_polynomial_serialize,
    fmpz_mod_polynomial_set_coefficient,
)
from sagejs.kernels.polynomial.arbitrary_prime_flint import (
    flint_arbitrary_prime_polynomial_coefficient_sum,
)
from sagejs.polynomial_algorithms.arbitrary_prime_public import (
    decode_factorization_payload,
    decode_resource_payload,
    decode_roots_payload,
)

p = 2**89 - 1
f = fmpz_mod_polynomial(p, 3)
assert fmpz_mod_polynomial_set_coefficient(f, 0, -1)
assert fmpz_mod_polynomial_set_coefficient(f, 1, 42)
assert fmpz_mod_polynomial_set_coefficient(f, 2, 1)
assert fmpz_mod_polynomial_seal(f)
assert flint_arbitrary_prime_polynomial_coefficient_sum(f) == 42

twice = fmpz_mod_polynomial_add(f, f)
assert fmpz_mod_polynomial_coefficient(twice, 1) == 84

serialized = fmpz_mod_polynomial_serialize(f).take_bytes()
modulus, coefficients = decode_resource_payload(serialized)
assert modulus == p and coefficients == [p - 1, 42, 1]
region = FlintByteRegion.from_bytes(serialized)
try:
    restored = fmpz_mod_polynomial_deserialize(region)
finally:
    region.close()
assert fmpz_mod_polynomial_modulus(restored) == p
assert fmpz_mod_polynomial_equal(restored, f) == 1

divisor = fmpz_mod_polynomial(p, 2)
assert fmpz_mod_polynomial_set_coefficient(divisor, 0, -1)
assert fmpz_mod_polynomial_set_coefficient(divisor, 1, 1)
assert fmpz_mod_polynomial_seal(divisor)
division = fmpz_mod_polynomial_divrem_resource(f, divisor)
try:
    quotient = fmpz_mod_polynomial_division_result_quotient(division)
    remainder = fmpz_mod_polynomial_division_result_remainder(division)
finally:
    division.close()
assert fmpz_mod_polynomial_coefficient(quotient, 0) == 43
assert fmpz_mod_polynomial_coefficient(quotient, 1) == 1
assert fmpz_mod_polynomial_coefficient(remainder, 0) == 42

square = fmpz_mod_polynomial(p, 3)
assert fmpz_mod_polynomial_set_coefficient(square, 0, -1)
assert fmpz_mod_polynomial_set_coefficient(square, 2, 1)
assert fmpz_mod_polynomial_seal(square)
factor_modulus, unit, factors = decode_factorization_payload(
    fmpz_mod_polynomial_factor_resource(square).take_bytes()
)
assert factor_modulus == p and unit == 1 and len(factors) == 2
roots_modulus, roots = decode_roots_payload(
    fmpz_mod_polynomial_roots_resource(square).take_bytes()
)
assert roots_modulus == p
assert sorted([root for root, multiplicity in roots]) == [1, p - 1]
assert all(multiplicity == 1 for root, multiplicity in roots)

for resource in [square, remainder, quotient, divisor, restored, twice, f]:
    resource.close()
print("arbitrary-prime-resource-kernel-ok")
`;

function run(environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-arbitrary-prime-kernel-"));
  try {
    const program = join(directory, "check.py");
    writeFileSync(program, witness);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), program], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim(), "arbitrary-prime-resource-kernel-ok");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

run({});
run({ SAGEJS_NATIVE_DISABLE: "1" });
