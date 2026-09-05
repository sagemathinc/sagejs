"""Public numerical performance witnesses shared by CPython and Sage.js.

Preparation and independent benchmark assertions are outside the timed public
call. The solver's own validation and result construction remain inside it.
This initial tranche measures warm calls and trace collection, not release
qualification, cold imports, or backend superiority.
"""

import math
import time


def _rosenbrock(point):
    return sum(
        100.0 * (point[i + 1] - point[i] * point[i]) ** 2 + (1.0 - point[i]) ** 2
        for i in range(len(point) - 1)
    )


def _gradient(point):
    result = [0.0 for _ in point]
    for i in range(len(point) - 1):
        delta = point[i + 1] - point[i] * point[i]
        result[i] += -400.0 * point[i] * delta + 2.0 * (point[i] - 1.0)
        result[i + 1] += 200.0 * delta
    return result


def prepare(name, level):
    """Return a public call and an independent error witness."""
    if name.startswith("trace-"):
        from sagejs.numerics.trace import NumericalTrace, TracePolicy

        count = int(name.split("-")[1])
        policy = TracePolicy(level, max_events=1024, max_bytes=8_000_000)
        payload = {"point": [1.0, -2.5, 3.25], "label": "step α 😀"}

        def collect():
            trace = NumericalTrace(policy)
            for i in range(count):
                trace.append("iteration", iteration=i, data=payload)
            return trace

        return collect, lambda result: 0.0
    if name.startswith("root-"):
        from sagejs.numerics.roots import find_root

        method = name.split("-")[1]
        return (
            lambda: find_root(
                lambda x: math.cos(x) - x, 0.0, 1.0, method=method, trace=level
            ),
            lambda result: abs(result.value - 0.7390851332151607),
        )
    if name == "bounded-minimum":
        from sagejs.numerics.optimization import minimize_scalar

        return (
            lambda: minimize_scalar(lambda x: (x - 2.0) ** 2, -1.0, 5.0, trace=level),
            lambda result: abs(result.value - 2.0),
        )
    if name in ("nelder-mead-2", "bfgs-20"):
        from sagejs.numerics.optimization import minimize

        initial = [-1.2, 1.0] * (10 if name == "bfgs-20" else 1)
        method = "bfgs" if name == "bfgs-20" else "nelder-mead"
        gradient = _gradient if method == "bfgs" else None
        return (
            lambda: minimize(
                _rosenbrock,
                initial,
                method=method,
                gradient=gradient,
                maxiter=3000,
                max_evaluations=50000,
                max_elapsed_ms=120000,
                trace=level,
            ),
            lambda result: _rosenbrock(result.value),
        )
    if name == "least-squares-exponential":
        from sagejs.numerics.optimization import least_squares

        x_values = [0.0, 1.0, 2.0, 3.0]
        return (
            lambda: least_squares(
                lambda point: [
                    point[0] * math.exp(-point[1] * x) - 2.0 * math.exp(-0.5 * x)
                    for x in x_values
                ],
                [1.5, 0.4],
                max_elapsed_ms=120000,
                trace=level,
            ),
            lambda result: max(abs(result.value[0] - 2.0), abs(result.value[1] - 0.5)),
        )
    if name in ("ode-classroom", "ode-oscillator"):
        from sagejs.numerics.ode import OdeInvariant, solve_ivp

        if name == "ode-classroom":
            return (
                lambda: solve_ivp(
                    lambda t, y: [y[0]],
                    (0.0, 1.0),
                    [1.0],
                    rtol=1e-7,
                    atol=1e-10,
                    reference=lambda t: [math.exp(t)],
                    reference_atol=1e-6,
                    reference_rtol=1e-6,
                    trace=level,
                ),
                lambda result: abs(result.value[0] - math.e),
            )
        invariant = OdeInvariant(
            lambda t, y: y[0] * y[0] + y[1] * y[1],
            name="squared_norm",
            atol=2e-5,
            rtol=2e-5,
        )
        return (
            lambda: solve_ivp(
                lambda t, y: [y[1], -y[0]],
                (0.0, 40.0 * math.pi),
                [1.0, 0.0],
                rtol=1e-7,
                atol=1e-10,
                max_step=0.25,
                invariants=[invariant],
                trace=level,
            ),
            lambda result: max(abs(result.value[0] - 1.0), abs(result.value[1])),
        )
    if name == "describe-20000":
        from sagejs.numerics.statistics import describe

        values = [1e9 + ((i * 37) % 1000) / 10.0 for i in range(20000)]
        return (
            lambda: describe(values, trace=level),
            lambda result: abs(result.value["mean"] - 1000000049.95),
        )
    if name == "dense-solve-16":
        from sagejs.numerics.linear_algebra import solve

        rows = [
            [4.0 if i == j else 1.0 / (1.0 + abs(i - j)) for j in range(16)]
            for i in range(16)
        ]
        right = [sum(row) for row in rows]
        return (
            lambda: solve(rows, right, trace=level),
            lambda result: max(abs(value - 1.0) for value in result.value),
        )
    if name == "integrate-sine":
        from sagejs.numerics.integration import integrate

        return (
            lambda: integrate(math.sin, 0.0, math.pi, trace=level),
            lambda result: abs(result.value - 2.0),
        )
    if name == "interpolate-32":
        from sagejs.numerics.approximation import interpolate

        nodes = sorted(math.cos(math.pi * i / 31.0) for i in range(32))
        values = [math.exp(x) for x in nodes]
        return (
            lambda: interpolate(nodes, values, trace=level),
            lambda result: abs(result.evaluate(0.125) - math.exp(0.125)),
        )
    if name == "fft-256":
        from sagejs.numerics.spectral import fft

        values = [1.0] + [0.0] * 255
        return (
            lambda: fft(values, trace=level),
            lambda result: max(
                max(abs(value[0] - 1.0), abs(value[1]))
                if isinstance(value, list)
                else abs(value - 1.0)
                for value in result.value
            ),
        )
    raise ValueError("unknown performance workload: " + name)


def observe(name, result, error):
    from sagejs.numerics._json import canonical_json

    if name.startswith("trace-"):
        record = result.to_dict()
        expected = int(name.split("-")[1])
        retained = expected if result.policy.level == "iterations" else 0
        assert record["observed_events"] == expected
        assert record["retained_events"] == retained
        assert [event.sequence for event in result.events] == list(range(retained))
        return {
            "method": "semantic-trace-append",
            "backend": "ordinary-python",
            "success": True,
            "independent_error": 0.0,
            "iterations": expected,
            "evaluations": 0,
            "trace_events": retained,
            "trace_bytes": len(canonical_json(record["events"]).encode("utf-8")),
        }
    assert result.success and result.validation.passed, (name, result.status)
    independent_error = error(result)
    tolerance = 2e-5 if name.startswith("ode-") else 1e-6
    assert math.isfinite(independent_error) and independent_error <= tolerance, (
        name,
        independent_error,
    )
    return {
        "method": result.method,
        "backend": result.backend,
        "success": result.success,
        "status": result.status,
        "truth_level": result.validation.truth_level,
        "independent_error": independent_error,
        "iterations": result.iterations,
        "evaluations": result.evaluations,
        "trace_events": len(result.trace.events),
        "trace_bytes": len(
            canonical_json([event.to_dict() for event in result.trace.events]).encode(
                "utf-8"
            )
        ),
    }


def measure(name, level, warmups, samples):
    started = time.perf_counter()
    solve, error = prepare(name, level)
    preparation_ms = 1000.0 * (time.perf_counter() - started)
    started = time.perf_counter()
    result = solve()
    first_call_ms = 1000.0 * (time.perf_counter() - started)
    observation = observe(name, result, error)
    for _ in range(warmups):
        observe(name, solve(), error)
    durations = []
    for _ in range(samples):
        started = time.perf_counter()
        result = solve()
        durations.append(1000.0 * (time.perf_counter() - started))
        current = observe(name, result, error)
        assert current == observation, (name, "non-reproducible witness")
    ordered = sorted(durations)
    middle = len(ordered) // 2
    median = (
        ordered[middle]
        if len(ordered) % 2
        else (ordered[middle - 1] + ordered[middle]) / 2.0
    )
    return {
        "case": name,
        "trace": level,
        "warmups": warmups,
        "samples": samples,
        "preparation_ms": preparation_ms,
        "first_call_ms": first_call_ms,
        "durations_ms": durations,
        "median_ms": median,
        "observation": observation,
    }
