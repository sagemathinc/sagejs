"""Persistent SageMath maximal-order oracle used only by the benchmark driver."""

import json
import sys
import time
import traceback

from sage.all import NumberField, PolynomialRing, QQ, ZZ, factor, version


def milliseconds(started):
    return (time.perf_counter_ns() - started) / 1_000_000


def rational_text(value):
    return f"{value.numerator()}/{value.denominator()}"


def one_sample(polynomial, request):
    construction_started = time.perf_counter_ns()
    field = NumberField(polynomial, "a", check=False)
    construction_ms = milliseconds(construction_started)

    boundary = request["boundary"]
    if boundary == "factor-discovery":
        discriminant_started = time.perf_counter_ns()
        polynomial_discriminant = polynomial.discriminant()
        discriminant_ms = milliseconds(discriminant_started)
        factor_started = time.perf_counter_ns()
        factors = factor(abs(polynomial_discriminant))
        factor_ms = milliseconds(factor_started)
        return {
            "timing_ms": factor_ms,
            "stages": {
                "field_construction": construction_ms,
                "polynomial_discriminant": discriminant_ms,
                "factor_discovery": factor_ms,
            },
            "factorization": [[str(prime), int(exponent)] for prime, exponent in factors],
        }

    order_started = time.perf_counter_ns()
    order = field.maximal_order()
    order_ms = milliseconds(order_started)
    materialize_started = time.perf_counter_ns()
    basis = [
        [rational_text(entry) for entry in element.list()]
        for element in order.basis()
    ]
    field_discriminant = str(order.discriminant())
    materialize_ms = milliseconds(materialize_started)
    certify_started = time.perf_counter_ns()
    certified = bool(order.is_maximal())
    certification_ms = milliseconds(certify_started)
    return {
        "timing_ms": order_ms,
        "stages": {
            "field_construction": construction_ms,
            "maximal_order": order_ms,
            "public_object_materialization": materialize_ms,
            "certification": certification_ms,
            "local_primes": "not-exposed-by-sage-public-api",
            "basis_merge": "included-in-maximal_order",
        },
        "basis": basis,
        "field_discriminant": field_discriminant,
        "certified": certified,
    }


def run(request):
    coefficients = [ZZ(coefficient) for coefficient in request["coefficients"]]
    ring = PolynomialRing(QQ, "x")
    polynomial = ring(coefficients)
    irreducibility_started = time.perf_counter_ns()
    irreducible = bool(polynomial.is_irreducible())
    irreducibility_ms = milliseconds(irreducibility_started)
    if not irreducible:
        return {
            "status": "unsupported",
            "reason": "defining polynomial is reducible",
            "irreducible_verified": False,
        }
    for _ in range(request.get("warmups", 0)):
        one_sample(polynomial, request)
    samples = [
        one_sample(polynomial, request)
        for _ in range(request.get("samples", 1))
    ]
    final = samples[-1]
    return {
        "status": "ok",
        "irreducible_verified": True,
        "irreducibility_ms": irreducibility_ms,
        "samples": samples,
        "basis": final.get("basis"),
        "field_discriminant": final.get("field_discriminant"),
        "certified": final.get("certified"),
        "factorization": final.get("factorization"),
    }


print("@@NFMO_READY@@", version(), flush=True)
for line in sys.stdin:
    try:
        request = json.loads(line)
        response = run(request)
    except NotImplementedError as error:
        response = {"status": "unsupported", "reason": str(error)}
    except Exception as error:  # The harness must preserve a bounded crash record.
        response = {
            "status": "error",
            "reason": str(error),
            "traceback": traceback.format_exc(limit=12),
        }
    print("@@NFMO_RESULT@@" + json.dumps(response, sort_keys=True), flush=True)
