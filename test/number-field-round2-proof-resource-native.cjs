#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const witness = join(
  root,
  "bench",
  "number-field-round2-proof-resource-witness.c",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeout || 120_000,
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function compile(output, defines = [], sanitize = false) {
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"].map(
    (name) => join(prefix, "lib", `lib${name}.a`),
  );
  run(process.env.CC || "cc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...(sanitize ? ["-fno-omit-frame-pointer", "-fsanitize=address,undefined"] : []),
    ...defines.map((value) => `-D${value}`),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    witness,
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    output,
  ]);
}

test("parallel Round-2 proofs equal sequential and pthread-fallback proofs", {
  skip: process.platform === "win32" ? "native Windows uses the generated sequential boundary" : false,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-proof-native-"));
  try {
    const normal = join(temporary, "normal");
    const sequential = join(temporary, "sequential");
    const pthreadFallback = join(temporary, "pthread-fallback");
    const injectedFailure = join(temporary, "injected-failure");
    compile(normal);
    compile(sequential, ["SAGEJS_NF_ANALYSIS_PROOF_FORCE_ONE_WORKER=1"]);
    compile(pthreadFallback, ["SAGEJS_NF_ANALYSIS_PROOF_TEST_PTHREAD_FALLBACK=1"]);
    compile(injectedFailure, [
      "SAGEJS_NF_ANALYSIS_PROOF_TEST_FAIL(index)=((index)==1)",
      "SAGEJS_NF_ANALYSIS_PROOF_EXPECT_FAILURE=1",
    ]);
    const normalResult = run(normal, []);
    assert.equal(run(sequential, []), normalResult);
    assert.equal(run(pthreadFallback, []), normalResult);
    assert.deepEqual(JSON.parse(run(injectedFailure, [])), {
      failure_injection: true,
    });

    if (process.env.SAGEJS_FFI_SANITIZE === "1") {
      const sanitized = join(temporary, "sanitized");
      compile(sanitized, [], true);
      assert.equal(
        run(sanitized, [], {
          env: sanitizerEnvironment({ strictStringChecks: true }),
        }),
        normalResult,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("current native proof and ordinary replay agree on deterministic random cubics", () => {
  const program = String.raw`
from sagejs.number_fields.field_analysis_resource import (
    authenticated_round2_order_proof_matches,
    decode_round2_order_proof_resource,
    native_round2_order_proof_from_resources,
)
from sagejs.number_fields.order_resource import decode_order_resource
import sagejs.ffi.flint as flint

def prime_divisors(value):
    answer = []
    prime = 2
    remaining = value
    while prime * prime <= remaining:
        if remaining % prime == 0:
            answer.append(prime)
            while remaining % prime == 0:
                remaining //= prime
        prime += 1
    if remaining > 1:
        answer.append(remaining)
    return answer

state = 17
checked = 0
for unused in range(12):
    state = (1103515245 * state + 12345) % 2147483648
    constant = 2 + state % 97
    primes = prime_divisors(3 * constant)
    if len(primes) < 2:
        continue
    coefficients = [-constant, 0, 0, 1]
    polynomial = flint.fmpz_polynomial(4)
    hints = flint.fmpz_matrix(len(primes), 1)
    try:
        for index, value in enumerate(coefficients):
            flint.fmpz_polynomial_set_coefficient(polynomial, index, value)
        flint.fmpz_polynomial_seal(polynomial)
        for row, prime in enumerate(primes):
            flint.fmpz_matrix_set_entry(hints, row, 0, prime)
        order_resource = flint.number_field_order_from_polynomial_resource(
            polynomial, hints
        )
        try:
            order = decode_order_resource(order_resource.copy_bytes())
            proof_resource = flint.number_field_round2_proof_resource(
                polynomial, order_resource, hints
            )
            try:
                payload = list(proof_resource.copy_bytes())
            finally:
                proof_resource.close()
            rows = [list(row) for row in order.basis.numerator]
            replay = decode_round2_order_proof_resource(
                payload,
                expected_polynomial=coefficients,
                expected_primes=primes,
                expected_basis_numerator=rows,
                expected_basis_denominator=order.basis.denominator,
                expected_index=order.index,
                expected_equation_discriminant=order.equation_discriminant,
                expected_order_discriminant=order.order_discriminant,
            )
            direct = native_round2_order_proof_from_resources(
                polynomial,
                order_resource,
                hints,
                coefficients_low_to_high=coefficients,
                certified_primes=primes,
                basis_numerator=rows,
                basis_denominator=order.basis.denominator,
                index=order.index,
                equation_discriminant=order.equation_discriminant,
                order_discriminant=order.order_discriminant,
            )
            assert replay.verification_tier == "packed-mathematical-replay"
            assert direct.verification_tier == "current-generated-native-fixed-point"
            for proof in (replay, direct):
                assert authenticated_round2_order_proof_matches(
                    proof,
                    polynomial=coefficients,
                    certified_primes=primes,
                    basis_numerator=rows,
                    basis_denominator=order.basis.denominator,
                    index=order.index,
                    equation_discriminant=order.equation_discriminant,
                    order_discriminant=order.order_discriminant,
                )
            if checked == 0:
                mismatches = [
                    {
                        "coefficients_low_to_high": [
                            coefficients[0] + 1,
                            *coefficients[1:],
                        ]
                    },
                    {"certified_primes": [primes[0] + 1, *primes[1:]]},
                    {
                        "basis_numerator": [
                            [rows[0][0] + 1, *rows[0][1:]],
                            *rows[1:],
                        ]
                    },
                ]
                direct_arguments = {
                    "coefficients_low_to_high": coefficients,
                    "certified_primes": primes,
                    "basis_numerator": rows,
                    "basis_denominator": order.basis.denominator,
                    "index": order.index,
                    "equation_discriminant": order.equation_discriminant,
                    "order_discriminant": order.order_discriminant,
                }
                for mismatch in mismatches:
                    arguments = {**direct_arguments, **mismatch}
                    try:
                        native_round2_order_proof_from_resources(
                            polynomial,
                            order_resource,
                            hints,
                            **arguments,
                        )
                        raise AssertionError(
                            "mismatched current proof projection was accepted"
                        )
                    except ValueError:
                        pass
            corrupted = list(payload)
            corrupted[-1] ^= 1
            try:
                decode_round2_order_proof_resource(
                    corrupted,
                    expected_polynomial=coefficients,
                    expected_primes=primes,
                    expected_basis_numerator=rows,
                    expected_basis_denominator=order.basis.denominator,
                    expected_index=order.index,
                    expected_equation_discriminant=order.equation_discriminant,
                    expected_order_discriminant=order.order_discriminant,
                )
                raise AssertionError("corrupted external proof was accepted")
            except ValueError:
                pass
            checked += 1
        finally:
            order_resource.close()
    finally:
        hints.close()
        polynomial.close()
assert checked >= 8
print("ROUND2_PROOF_RANDOM_DIFFERENTIAL_OK")
`;
  const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: program,
    timeout: 120_000,
    env: process.env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /ROUND2_PROOF_RANDOM_DIFFERENTIAL_OK/);
});
