#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
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
    sanitize ? "-O1" : "-O2",
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

test("construction-carried proofs agree across parallel and fallback lanes", {
  skip: process.platform === "win32"
    ? "native Windows uses the generated sequential correctness fallback"
    : false,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-carried-native-"));
  try {
    const normal = join(temporary, "normal");
    const sequential = join(temporary, "sequential");
    const pthreadFallback = join(temporary, "pthread-fallback");
    const injectedFailure = join(temporary, "injected-failure");
    compile(normal);
    compile(sequential, ["SAGEJS_NF_ORDER_FORCE_ONE_INDEPENDENT_WORKER=1"]);
    compile(pthreadFallback, ["SAGEJS_NF_ORDER_TEST_PTHREAD_FALLBACK=1"]);
    compile(injectedFailure, [
      "SAGEJS_NF_ORDER_TERMINAL_PROOF_TEST_FAIL(prime)=((prime)==103)",
      "SAGEJS_NF_ORDER_TERMINAL_PROOF_EXPECT_FAILURE=1",
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

test("current carried proof and external ordinary replay agree on random cubics", () => {
  const program = String.raw`
from sagejs.number_fields.field_analysis_resource import (
    authenticated_round2_order_proof_matches,
    decode_carried_round2_order_resource,
    native_carried_round2_order_from_resources,
)
import sagejs.ffi.flint as flint

def prime_divisors(value):
    answer = []
    prime = 2
    remaining = abs(value)
    while prime * prime <= remaining:
        if remaining % prime == 0:
            answer.append(prime)
            while remaining % prime == 0:
                remaining //= prime
        prime += 1
    if remaining > 1:
        answer.append(remaining)
    return answer

def integer_locations(payload, offset, count):
    answer = []
    for unused in range(count):
        start = offset
        header = sum(payload[offset + index] << (8 * index) for index in range(4))
        length = header & 2147483647
        offset += 4 + length
        answer.append((start, offset))
    return answer, offset

def corrupt_integer(payload, location):
    answer = list(payload)
    start, end = location
    if end == start + 4:
        answer[start + 3] |= 128
        return answer
    answer[start + 4] ^= 1
    return answer

state = 17
for case_index in range(16):
    state = (1103515245 * state + 12345) % 2147483648
    constant = 2 + state % 97
    coefficients = [-constant, 0, 0, 1]
    primes = prime_divisors(27 * constant * constant)
    prime = primes[0]
    polynomial = flint.fmpz_polynomial(4)
    hints = flint.fmpz_matrix(1, 1)
    try:
        for index, value in enumerate(coefficients):
            flint.fmpz_polynomial_set_coefficient(polynomial, index, value)
        flint.fmpz_polynomial_seal(polynomial)
        flint.fmpz_matrix_set_entry(hints, 0, 0, prime)
        resource = flint.number_field_order_with_round2_proof_resource(
            polynomial, hints
        )
        payload = list(resource.copy_bytes())
        resource.close()
        replay_order, replay = decode_carried_round2_order_resource(
            payload,
            expected_polynomial=coefficients,
            expected_primes=[prime],
        )
        direct_order, direct = native_carried_round2_order_from_resources(
            polynomial,
            hints,
            coefficients_low_to_high=coefficients,
            certified_primes=[prime],
        )
        assert replay_order.to_dict() == direct_order.to_dict()
        assert replay.verification_tier == "ordinary-mathematical-proof-carrying-round2"
        assert direct.verification_tier == "current-generated-proof-carrying-round2"
        rows = [list(row) for row in direct_order.basis.numerator]
        for proof in (replay, direct):
            assert authenticated_round2_order_proof_matches(
                proof,
                polynomial=coefficients,
                certified_primes=[prime],
                basis_numerator=rows,
                basis_denominator=direct_order.basis.denominator,
                index=direct_order.index,
                equation_discriminant=direct_order.equation_discriminant,
                order_discriminant=direct_order.order_discriminant,
            )

        if case_index == 0:
            order_length = sum(payload[32 + index] << (8 * index) for index in range(8))
            degree = 3
            nested_locations, unused_offset = integer_locations(
                payload, 72 + 64, 5 + degree * degree
            )
            stream = 72 + order_length
            source_locations, stream = integer_locations(payload, stream, degree + 1)
            prime_locations, stream = integer_locations(payload, stream, 1)
            metadata_locations, stream = integer_locations(payload, stream, 3)
            local_locations, stream = integer_locations(payload, stream, degree * degree)
            radical_dimension_location = metadata_locations[2]
            radical_header = sum(
                payload[radical_dimension_location[0] + index] << (8 * index)
                for index in range(4)
            )
            radical_length = radical_header & 2147483647
            radical_dimension = 0 if radical_length == 0 else payload[
                radical_dimension_location[0] + 4
            ]
            radical_locations, stream = integer_locations(
                payload, stream, radical_dimension * degree
            )
            selector_locations, stream = integer_locations(payload, stream, degree)
            minor_locations, stream = integer_locations(payload, stream, degree * degree)
            assert stream == len(payload)
            corruptions = [
                corrupt_integer(payload, source_locations[0]),
                corrupt_integer(payload, prime_locations[0]),
                corrupt_integer(payload, nested_locations[5]),
                corrupt_integer(payload, local_locations[0]),
                corrupt_integer(payload, minor_locations[-1]),
            ]
            for corrupted in corruptions:
                try:
                    decode_carried_round2_order_resource(
                        corrupted,
                        expected_polynomial=coefficients,
                        expected_primes=[prime],
                    )
                    raise AssertionError("same-length carried corruption was accepted")
                except ValueError:
                    pass
            for mismatched_polynomial, mismatched_primes in (
                ([coefficients[0] + 1, *coefficients[1:]], [prime]),
                (coefficients, [prime + 1]),
            ):
                try:
                    decode_carried_round2_order_resource(
                        payload,
                        expected_polynomial=mismatched_polynomial,
                        expected_primes=mismatched_primes,
                    )
                    raise AssertionError("mismatched carried source was accepted")
                except ValueError:
                    pass
    finally:
        hints.close()
        polynomial.close()
print("ROUND2_CARRIED_RANDOM_DIFFERENTIAL_OK")
`;
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-carried-python-"));
  try {
    const source = join(temporary, "differential.py");
    writeFileSync(source, program);
    const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), source], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: process.env,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /ROUND2_CARRIED_RANDOM_DIFFERENTIAL_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
