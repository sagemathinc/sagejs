"""Experimental prepared bisection with independent expression validation."""

from __future__ import annotations

import math
import time
from typing import Any

from .evaluators import PreparedFunction
from .frontends.expressions import evaluate_expression
from .model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from .trace import TracePolicy


def solve_prepared_root(
    function: PreparedFunction,
    lower: float,
    upper: float,
    *,
    parameters: tuple[Any, ...] = (),
    xtol: float = 1e-12,
    ftol: float = 1e-12,
    maxiter: int = 100,
    max_evaluations: int = 256,
    max_elapsed_ms: int = 30000,
) -> NumericalResult:
    """Solve for the first input using residual-and-width bisection.

    This explicit extension does not replace an existing root method. Three
    evaluations are reserved for independent final checks. Cancellation inside
    a compiled call requires worker termination; elapsed time is checked after
    that bounded call. Iteration traces and rigorous certificates are unsupported.
    """
    if not isinstance(function, PreparedFunction):
        raise TypeError("expected PreparedFunction")
    function._require_open()
    if len(parameters) != len(function._names) - 1:
        raise ValueError("prepared parameter count mismatch")
    budget = ResourceBudget(
        max_iterations=maxiter,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
    )
    if maxiter > 1024 or max_evaluations < 6:
        raise ValueError(
            "prepared root requires at most 1024 iterations and at least six evaluations"
        )
    # Lock before user-defined float conversion, not merely during the kernel.
    function._busy = True
    try:
        return _solve(
            function,
            float(lower),
            float(upper),
            tuple(float(x) for x in parameters),
            float(xtol),
            float(ftol),
            budget,
        )
    finally:
        function._busy = False


def _solve(
    function: PreparedFunction,
    lower: float,
    upper: float,
    parameters: tuple[float, ...],
    xtol: float,
    ftol: float,
    budget: ResourceBudget,
) -> NumericalResult:
    started = time.perf_counter()
    if not all(math.isfinite(x) for x in (lower, upper, xtol, ftol) + parameters):
        raise ValueError("prepared root inputs must be finite")
    if lower >= upper or xtol <= 0 or ftol < 0:
        raise ValueError("invalid prepared bracket or tolerances")
    record = function._record

    def reference(x: float) -> float:
        values = (x,) + parameters
        return float(
            evaluate_expression(
                record,
                dict(zip(function._names, values, strict=True)),
                finite_intermediates=True,
            )
        )

    problem = NumericalProblem(
        "roots",
        "scalar_root",
        function_record={"kind": "expression", "replayable": False, "record": record},
        variables=list(function._names[:1]),
        initial_data={"parameters": list(parameters)},
        bounds={"bracket": [lower, upper]},
        tolerances={"xtol": xtol, "ftol": ftol},
        method="prepared-bisection-residual-width",
        resource_budget=budget,
        trace_policy=TracePolicy(level="none"),
    )
    limit = min(
        budget.max_iterations,
        budget.max_evaluations - 5,
        max(0, 1000000 // max(1, function._nodes) - 5),
    )
    native: Any = None
    if function._requested == "native" and function._eligible:
        from sagejs.native import is_compiled

        from ._evaluation_root import bisect_program

        if is_compiled(bisect_program) and getattr(
            bisect_program, "nativeAvailable", False
        ):
            native = bisect_program
    target = str(getattr(native, "executionTarget", "native")) if native else "dynamic"
    plan = NumericalPlan(
        problem,
        method="prepared-bisection-residual-width",
        backend="source-native" if native else "ordinary-python",
        reason="explicit prepared solve; no opaque callback replacement",
        capability={"classification": "extension", "execution_target": target},
        execution_target={
            "implementation_kind": "source_native" if native else "ordinary_python"
        },
    )
    calls, iterations, validation_calls = 0, 0, 0
    candidate: float | None = None
    status = "maximum_iterations"
    lo, hi = lower, upper
    if native is not None:
        from sagejs.native import kernel_float64_buffer, kernel_uint64_buffer

        # Retain only owned buffers, under the same lock as scalar evaluation.
        # A changed callable must receive freshly constructed buffers even if
        # it advertises the same target; backend identity is not a name string.
        if function._root_function is not native:
            buffers = [
                kernel_uint64_buffer(native, v)
                for v in (function._opcodes, function._left, function._right)
            ]
            buffers += [
                kernel_float64_buffer(native, function._constants),
                kernel_float64_buffer(native, [0.0] * len(function._names)),
                kernel_float64_buffer(native, [0.0] * len(function._opcodes)),
                kernel_float64_buffer(native, [0.0, 0.0]),
                kernel_float64_buffer(native, [0.0] * 5),
            ]
            function._root_workspace = buffers
            function._root_function = native
        arguments = function._root_workspace
        arguments[4][0] = 0.0
        for index, parameter in enumerate(parameters):
            arguments[4][index + 1] = parameter
        work, output = arguments[6], arguments[7]
        # Never allow an incomplete failing backend to reuse a prior success.
        for index in range(2):
            work[index] = 0.0
        for index in range(5):
            output[index] = math.nan
        code = native(
            *arguments,
            len(function._opcodes),
            lower,
            upper,
            xtol,
            ftol,
            limit,
        )
        calls = int(work[1])
        iterations = max(0, calls - 2)
        status = {
            0.0: "converged",
            1.0: "invalid_problem",
            4.0: "invalid_bracket",
            5.0: "maximum_iterations",
            6.0: "stagnation",
            11.0: "backend_failure",
            12.0: "nonfinite_evaluation",
            13.0: "nonfinite_evaluation",
        }.get(code, "backend_failure")
        if code == 0.0:
            candidate, lo, hi = float(output[0]), float(output[3]), float(output[4])
            if not all(math.isfinite(x) for x in (candidate, lo, hi)):
                candidate, lo, hi, status = None, lower, upper, "backend_failure"
    else:
        try:
            calls += 1
            flo = reference(lo)
            if flo == 0.0:
                candidate, hi, status = lo, lo, "converged"
            else:
                calls += 1
                fhi = reference(hi)
                if fhi == 0.0:
                    candidate, lo, status = hi, hi, "converged"
                elif (flo > 0) == (fhi > 0):
                    status = "invalid_bracket"
                else:
                    for iteration in range(limit):
                        midpoint = lo * 0.5 + hi * 0.5
                        if midpoint == lo or midpoint == hi:
                            status = "stagnation"
                            break
                        calls += 1
                        iterations = iteration + 1
                        value = reference(midpoint)
                        if value == 0.0:
                            candidate, lo, hi, status = (
                                midpoint,
                                midpoint,
                                midpoint,
                                "converged",
                            )
                            break
                        if abs(value) <= ftol and hi * 0.5 - lo * 0.5 <= xtol * 0.5:
                            candidate, status = midpoint, "converged"
                            break
                        if (flo > 0) == (value > 0):
                            lo, flo = midpoint, value
                        else:
                            hi = midpoint
        except (ArithmeticError, ValueError):
            status = "nonfinite_evaluation"
    if status == "maximum_iterations" and limit < budget.max_iterations:
        status = (
            "maximum_evaluations"
            if limit == budget.max_evaluations - 5
            else "invalid_problem"
        )
    passed = False
    residual: float | None = None
    if candidate is not None:
        try:
            validation_calls += 1
            residual = abs(reference(candidate))
            validation_calls += 1
            left_value = reference(lo)
            validation_calls += 1
            right_value = reference(hi)
            passed = (
                lower <= lo <= candidate <= hi <= upper
                and residual <= ftol
                and (lo == hi or hi * 0.5 - lo * 0.5 <= xtol * 0.5)
                and (
                    left_value == 0
                    or right_value == 0
                    or (left_value > 0) != (right_value > 0)
                )
            )
        except (ArithmeticError, ValueError):
            passed = False
        if not passed:
            status = "validation_failed"
    elapsed = 1000 * (time.perf_counter() - started)
    if elapsed > budget.max_elapsed_ms:
        status, passed = "maximum_elapsed_time", False
    validation = NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        residual=residual,
        checks=[{"kind": "independent-canonical-expression", "passed": passed}],
    )
    return NumericalResult(
        problem,
        plan,
        success=passed,
        status=status,
        value=candidate,
        validation=validation,
        evaluations=calls + validation_calls,
        iterations=iterations,
        elapsed_ms=elapsed,
        measurements={
            "solver_evaluations": calls,
            "validation_evaluations": validation_calls,
        },
        domain_payload={
            "bracket": [lo, hi],
            "host_calls_inside_compiled_core": 0 if native else None,
        },
        limitations=[
            "not-rigorous",
            "no-iteration-trace",
            "hard-cancellation-requires-worker-termination",
            "experimental-unqualified-route",
            "replay-dispatch-not-registered",
        ],
    )
