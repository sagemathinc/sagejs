"""Compare public construction boundaries; no mathematical checks are bypassed."""

import json
import time

R = PolynomialRing(QQ, "x")
p = R([-63, -11, -1, 1])
warm = NumberField(p, "warm")
assert warm.degree() == 3


def factor():
    return p.factor()


def irreducible():
    return p.is_irreducible()


def construct():
    return NumberField(p, "a")


def display():
    return str(p)


operations = [factor, irreducible, construct, display]
for operation in operations:
    for i in range(30):
        operation()
samples = []
for round_index in range(11):
    order = operations if round_index % 2 == 0 else list(reversed(operations))
    for operation in order:
        started = time.perf_counter_ns()
        for i in range(128):
            result = operation()
        elapsed = time.perf_counter_ns() - started
        if operation is factor:
            assert len(result) == 1 and result[0][1] == 1
        elif operation is irreducible:
            assert result is True
        elif operation is construct:
            assert result.degree() == 3
        samples.append(
            {"round": round_index, "boundary": operation.__name__, "ns": str(elapsed)}
        )
print(
    "CONSTRUCTION_PROFILE="
    + json.dumps(
        {
            "iterations_per_sample": 128,
            "samples": samples,
            "instrumented": False,
            "polynomial_prepared": True,
            "class_number_computed": False,
        }
    )
)
