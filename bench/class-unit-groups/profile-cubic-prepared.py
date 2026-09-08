"""Sample only run_prepared descendants; this is not a retained timing gate."""

import json
import os
import time

from sagejs.polynomial_algorithms import public_structural

mode = os.environ["SAGEJS_DIAGNOSTIC_IRREDUCIBILITY"]
assert mode in ("metadata", "reconstruction")
iterations = int(os.environ.get("SAGEJS_DIAGNOSTIC_PREPARED_COUNT", "512"))
assert 1 <= iterations <= 2048


def reconstruction(polynomial):
    factors = polynomial.factor()
    return (
        len(factors) == 1
        and factors[0][1] == 1
        and factors[0][0] * factors.unit() == polynomial
    )


if mode == "reconstruction":
    public_structural.rational_is_irreducible = reconstruction

R = PolynomialRing(QQ, "x")
p = R([-63, -11, -1, 1])
warm = NumberField(p, "warm")
assert warm.class_number(proof=False) == 3
assert warm._native_cubic_class_number_certificate.verify_conditional_grh(warm)
for i in range(128):
    warm = NumberField(p, "warm_" + str(i))
    warm.maximal_order()
    assert warm.class_number(proof=False) == 3

fields = [NumberField(p, "sample_" + str(i)) for i in range(iterations)]
for field in fields:
    field.maximal_order()


def run_prepared(prepared):
    answers = []
    for field in prepared:
        answers.append(int(field.class_number(proof=False)))
    return answers


print("SAGEJS_NATIVE_LEDGER_BEGIN")
started = time.perf_counter_ns()
answers = run_prepared(fields)
elapsed = time.perf_counter_ns() - started
print("SAGEJS_NATIVE_LEDGER_END")
assert all(answer == 3 for answer in answers)
for field in fields:
    receipt = field._native_cubic_class_number_certificate
    assert receipt.matches(field) and list(receipt.invariants) == [3]
assert receipt.verify_conditional_grh(fields[-1])
print(
    "PREPARED_PROFILE="
    + json.dumps(
        {
            "mode": mode,
            "iterations": len(fields),
            "root_ns": str(elapsed),
            "instrumented": True,
            "authenticated_receipts": len(fields),
            "sampled_exact_replay": True,
        }
    )
)
