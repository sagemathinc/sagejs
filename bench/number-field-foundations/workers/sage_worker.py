"""Persistent Sage/PARI worker for number-field-foundations benchmarks."""

import json
import sys
import time
import traceback

from sage.all import CC, NumberField, PolynomialRing, QQ, prime_range, version


def milliseconds(started):
    return (time.perf_counter_ns() - started) / 1_000_000


def complex_text(value):
    return [str(value.real()), str(value.imag())]


def normalized_splitting(field, bound):
    rows = []
    for prime in prime_range(2, bound):
        factors = []
        for ideal in field.primes_above(prime):
            factors.append(
                [int(ideal.ramification_index()), int(ideal.residue_class_degree())]
            )
        rows.append([int(prime), sorted(factors)])
    return rows


def one_sample(request, sample_index):
    ring = PolynomialRing(QQ, "x")
    polynomial = ring([int(value) for value in request["coefficients"]])
    field = NumberField(polynomial, f"a{sample_index}", check=False)
    operation = request["operation"]
    bound = int(request.get("bound", 0))
    points = request.get("points", [])
    if operation == "prime-stream":
        field.maximal_order()
        started = time.perf_counter_ns()
        answer = normalized_splitting(field, bound)
    elif operation == "coefficients":
        started = time.perf_counter_ns()
        answer = [int(value) for value in field.zeta_coefficients(bound)]
    elif operation == "quadratic-zeta-batch":
        zeta = field.zeta_function(prec=int(request["precision_bits"]))
        values = [CC(real, imaginary) for real, imaginary in points]
        started = time.perf_counter_ns()
        answer = [complex_text(zeta(value)) for value in values]
    elif operation == "general-zeta-scalar":
        zeta = field.zeta_function(prec=int(request["precision_bits"]))
        value = CC(points[0][0], points[0][1])
        started = time.perf_counter_ns()
        answer = complex_text(zeta(value))
    elif operation == "global-arithmetic":
        started = time.perf_counter_ns()
        units = field.unit_group(proof=True)
        classes = field.class_group(proof=True)
        regulator = field.regulator()
        answer = {
            "unit_rank": int(units.rank()),
            "unit_complete": True,
            "class_complete": True,
            "class_number": int(classes.order()),
            "regulator": str(regulator),
        }
    else:
        raise ValueError(f"unknown benchmark operation {operation}")
    return {"timing_ms": milliseconds(started), "result": answer}


def run(request):
    for warmup in range(int(request.get("warmups", 0))):
        one_sample(request, -warmup - 1)
    return {
        "status": "ok",
        "samples": [
            one_sample(request, index)
            for index in range(int(request.get("samples", 1)))
        ],
    }


print("@@NFFP_READY@@" + version(), flush=True)
for line in sys.stdin:
    try:
        response = run(json.loads(line))
    except NotImplementedError as error:
        response = {"status": "unsupported", "reason": str(error)}
    except Exception as error:
        response = {
            "status": "error",
            "reason": str(error),
            "traceback": traceback.format_exc(limit=12),
        }
    print("@@NFFP_RESULT@@" + json.dumps(response, sort_keys=True), flush=True)
