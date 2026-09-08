"""Isolate the predicate change in one rebuilt public runtime; diagnostic only."""

import json
import os
import time

from sagejs.polynomial_algorithms import public_structural

mode = os.environ["SAGEJS_DIAGNOSTIC_IRREDUCIBILITY"]
assert mode in ("metadata", "reconstruction")
extra_warmups = int(os.environ.get("SAGEJS_DIAGNOSTIC_CLASS_WARMUPS", "0"))
assert 0 <= extra_warmups <= 512


def reconstruction(polynomial):
    # Exact old predicate on this nonconstant QQ benchmark input.
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

for i in range(extra_warmups):
    warm = NumberField(p, "extra_warmup_" + str(i))
    warm.maximal_order()
    assert warm.class_number(proof=False) == 3
    receipt = warm._native_cubic_class_number_certificate
    assert receipt.matches(warm) and list(receipt.invariants) == [3]
if extra_warmups:
    assert receipt.verify_conditional_grh(warm)

results = []
for boundary in ["scalar-prepared", "coefficient-vector-class-number"]:
    prepared = None
    if boundary == "scalar-prepared":
        prepared = [NumberField(p, "a_" + str(i)) for i in range(128)]
        for field in prepared:
            field.maximal_order()
    fields = []
    answers = []
    started = time.perf_counter_ns()
    for i in range(128):
        field = (
            prepared[i]
            if prepared is not None
            else NumberField(
                R([int(v) for v in ["-63", "-11", "-1", "1"]]), "a_" + str(i)
            )
        )
        answers.append(int(field.class_number(proof=False)))
        fields.append(field)
    elapsed = time.perf_counter_ns() - started
    assert all(answer == 3 for answer in answers)
    for field in fields:
        receipt = field._native_cubic_class_number_certificate
        assert receipt.matches(field) and list(receipt.invariants) == [3]
    assert receipt.verify_conditional_grh(fields[-1])
    results.append(
        {
            "mode": mode,
            "extra_class_number_warmups": extra_warmups,
            "boundary": boundary,
            "iterations": 128,
            "root_ns": str(elapsed),
            "authenticated_receipts": 128,
            "independent_replay": True,
        }
    )
print("IRREDUCIBILITY_AB=" + json.dumps(results))
