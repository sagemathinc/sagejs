#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const moduleDirectory = join(root, "src", "lib");

function runPython(source) {
  const result = spawnSync("python3", ["-c", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test("arbitrary-prime fallback agrees with Sage 10.9 arithmetic semantics", () => {
  const output = runPython(String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(moduleDirectory)})
from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    normalized_residues,
    polynomial_add_mod,
    polynomial_divrem_mod,
    polynomial_evaluate_mod,
    factorization_adapter_input,
    polynomial_format_mod,
    polynomial_gcd_mod,
    polynomial_multiply_mod,
    polynomial_negate_mod,
    polynomial_subtract_mod,
    polynomial_xgcd_mod,
    require_same_prime_modulus,
    validate_factorization_adapter_output,
    validate_roots_adapter_output,
)

primes = [2**89 - 1, 2**127 - 1, 2**521 - 1]
for prime in primes:
    f = normalized_residues([1, -1, prime + 2, 0], prime)
    g = polynomial_multiply_mod([-3, 1], [5, 1], prime)
    assert f == [1, prime - 1, 2]
    assert polynomial_format_mod(f, "x", prime) == (
        "2*x^2 + " + str(prime - 1) + "*x + 1"
    )
    assert polynomial_add_mod(f, g, prime) == [prime - 14, 1, 3]
    assert polynomial_subtract_mod(f, g, prime) == [16, prime - 3, 1]
    assert polynomial_negate_mod(f, prime) == [prime - 1, 1, prime - 2]

    product = polynomial_multiply_mod(f, g, prime)
    quotient, remainder = polynomial_divrem_mod(product, f, prime)
    assert quotient == g and remainder == []
    expected_monic_f = [(prime + 1) // 2, (prime - 1) // 2, 1]
    assert polynomial_gcd_mod(product, f, prime) == expected_monic_f
    assert polynomial_gcd_mod([], [], prime) == []

    gcd, left_cofactor, right_cofactor = polynomial_xgcd_mod(f, g, prime)
    bezout = polynomial_add_mod(
        polynomial_multiply_mod(left_cofactor, f, prime),
        polynomial_multiply_mod(right_cofactor, g, prime),
        prime,
    )
    assert gcd == [1]
    assert bezout == gcd
    assert polynomial_xgcd_mod([], [], prime) == ([], [1], [])
    assert polynomial_evaluate_mod(f, 123456789, prime) == 30483157376924254

assert require_same_prime_modulus(primes[0], primes[0]) == primes[0]
assert normalized_residues([2**127 - 2], primes[0]) == [274877906942]
try:
    require_same_prime_modulus(primes[0], primes[1])
except ValueError as error:
    assert str(error) == "arbitrary-prime polynomial moduli do not match"
else:
    raise AssertionError("a mixed-modulus operation was accepted")

try:
    polynomial_divrem_mod([1], [], primes[0])
except ZeroDivisionError:
    pass
else:
    raise AssertionError("division by zero polynomial was accepted")

unit, monic = factorization_adapter_input([6, -9, 3], primes[0])
assert unit == 3
assert monic == [2, primes[0] - 3, 1]
validate_factorization_adapter_output(
    [6, -9, 3], unit, [([primes[0] - 1, 1], 1), ([primes[0] - 2, 1], 1)], primes[0]
)
try:
    factorization_adapter_input([], primes[0])
except ArithmeticError:
    pass
else:
    raise AssertionError("zero polynomial factorization was accepted")

root_source = polynomial_multiply_mod(
    polynomial_multiply_mod([-2, 1], [-2, 1], primes[0]), [-3, 1], primes[0]
)
validate_roots_adapter_output(root_source, [3, 2], [1, 2], primes[0])
try:
    validate_roots_adapter_output([], [], [], primes[0])
except ArithmeticError:
    pass
else:
    raise AssertionError("zero polynomial roots were accepted")

print("arbitrary-prime-polynomial-fallback-ok")
`);
  assert.equal(output, "arbitrary-prime-polynomial-fallback-ok");
});

test("generated arbitrary-prime resources have self-contained ownership", () => {
  const output = runPython(String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(moduleDirectory)})
from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    arbitrary_prime_resource_contract,
)

contract = arbitrary_prime_resource_contract()
assert contract["owns"] == ("fmpz_mod_ctx_t", "fmpz_mod_poly_t")
assert contract["initialize"] == ("fmpz_mod_ctx_init", "fmpz_mod_poly_init")
assert contract["close"] == ("fmpz_mod_poly_clear", "fmpz_mod_ctx_clear")
assert contract["result"] == "fresh-callee-owned-self-contained-resource"
assert contract["contextCompatibility"] == "equal-modulus-not-pointer-identity"
assert contract["multiResourcePrecondition"].startswith("compare exact moduli")
assert contract["crossResourceLifetimeDependency"] is False
assert contract["callerPredictsCapacity"] is False
assert contract["publishedState"] == "sealed immutable resource"
assert contract["variable"] == "public-parent-metadata-not-native-resource-state"

required = {
    "construct", "copy", "coefficient", "length", "equal", "add",
    "subtract", "negate", "multiply", "power", "divrem", "gcd",
    "xgcd", "evaluate", "format", "factor", "roots", "serialize",
    "deserialize",
}
assert set(contract["operations"]) == required
assert all(
    "own contexts" in contract["aggregateResults"][operation]
    for operation in ("divrem", "xgcd", "factor")
)
assert contract["aggregateResults"]["roots"].endswith("integer residues")
assert "no packed output capacity" in contract["variableSizeResults"]["polynomial"]
assert contract["publicSemantics"]["roots"].endswith("not a semantic promise")
assert contract["publicSemantics"]["divisionByZero"].startswith("ZeroDivisionError")
assert contract["factorAdapter"]["input"] == "factor a monic copy"
assert contract["rootsAdapter"]["zero"].startswith("ArithmeticError")
assert contract["windows"].startswith("generated FLINT resource required")
assert contract["wasm"].startswith("same declaration")
print("arbitrary-prime-polynomial-resource-contract-ok")
`);
  assert.equal(output, "arbitrary-prime-polynomial-resource-contract-ok");
});

test("native serialization excludes and SagePack owns parent metadata", () => {
  const output = runPython(String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(moduleDirectory)})
from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    deserialize_resource_payload,
    sagepack_parent_envelope,
    serialize_resource_payload,
)

prime = 2**127 - 1
payload = serialize_resource_payload([1, -1, prime + 2, 0], prime)
assert payload.startswith(b"SJMP\x01\x00\x00\x00")
assert deserialize_resource_payload(payload) == (prime, [1, prime - 1, 2])
envelope = sagepack_parent_envelope(payload, "theta", True)
assert envelope == {
    "schema": "sagejs.sagepack/fmpz-mod-polynomial-parent-v1",
    "variable": "theta",
    "sparse": True,
    "resourcePayload": payload,
}
for invalid in (payload + b"\x00", payload[:-1]):
    try:
        deserialize_resource_payload(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("noncanonical serialization was accepted")
print("arbitrary-prime-polynomial-serialization-contract-ok")
`);
  assert.equal(output, "arbitrary-prime-polynomial-serialization-contract-ok");
});

test("Sage 10.9 arbitrary-prime compatibility observations remain explicit", () => {
  // Recorded with SageMath 10.9.post1 at p=2^89-1 and p=2^127-1.  These
  // assertions pin public behavior which cannot be inferred from dense-list
  // arithmetic alone.  In particular, explicit construction and binary
  // coercion intentionally have different policies.
  const sage109 = {
    ringBackend: "NTL",
    explicitCrossVariableConstruction: "coefficient-copy",
    explicitCrossModulusConstruction: "lift-residues-then-reduce",
    crossVariableBinaryOperation: "TypeError",
    crossModulusBinaryOperation: "TypeError",
    incompatibleEvaluation: "TypeError",
    divisionByZero: "NTLError in Sage 10.9; ZeroDivisionError in Sage.js",
    gcdNormalization: "monic",
    xgcdZeroPair: ["0", "1", "0"],
    zeroFactorization: "ArithmeticError",
    zeroRoots: "ArithmeticError",
    constantRoots: [],
    factorUnit: "leading-coefficient",
    rootOrderingPromised: false,
    serializationPreservesParentIdentity: true,
  };
  assert.equal(sage109.explicitCrossModulusConstruction, "lift-residues-then-reduce");
  assert.equal(sage109.crossModulusBinaryOperation, "TypeError");
  assert.deepEqual(sage109.xgcdZeroPair, ["0", "1", "0"]);
  assert.equal(sage109.rootOrderingPromised, false);
  assert.equal(sage109.serializationPreservesParentIdentity, true);
});
