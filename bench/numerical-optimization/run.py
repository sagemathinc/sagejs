#!/usr/bin/env python3
"""Run the Sage.js numerical-optimization correctness/performance corpus.

The runner deliberately keeps problem definitions independent of NumPy so the
same file runs under CPython and Sage.js Python mode.  Backends adapt only the
solver call and result normalization.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Sequence


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORPUS = Path(__file__).with_name("corpus.json")
RESULT_SCHEMA = "sagejs.numerical-optimization-results/v1"


Vector = Sequence[float]
Objective = Callable[[Vector], float]
Gradient = Callable[[Vector], list[float]]
Residuals = Callable[[Vector], list[float]]
Constraint = Callable[[Vector], float]


def _float_list(values: Sequence[Any]) -> list[float]:
    return [float(value) for value in values]


def _linf(values: Sequence[float]) -> float:
    return max((abs(value) for value in values), default=0.0)


def _distance_linf(left: Vector, right: Vector) -> float:
    return _linf([float(a) - float(b) for a, b in zip(left, right, strict=True)])


def _nearest_linf(point: Vector, references: Sequence[Vector]) -> float:
    return min(_distance_linf(point, reference) for reference in references)


def _git_revision() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _median_ms(samples_ns: Sequence[int]) -> float | None:
    if not samples_ns:
        return None
    return statistics.median(samples_ns) / 1_000_000.0


def _target(dimension: int) -> list[float]:
    if dimension == 1:
        return [0.0]
    return [-1.0 + 2.0 * index / (dimension - 1) for index in range(dimension)]


def _rosenbrock(point: Vector) -> float:
    return sum(
        100.0 * (point[index + 1] - point[index] * point[index]) ** 2
        + (1.0 - point[index]) ** 2
        for index in range(len(point) - 1)
    )


def _rosenbrock_gradient(point: Vector) -> list[float]:
    gradient = [0.0] * len(point)
    for index in range(len(point) - 1):
        delta = point[index + 1] - point[index] * point[index]
        gradient[index] += -400.0 * point[index] * delta - 2.0 * (1.0 - point[index])
        gradient[index + 1] += 200.0 * delta
    return gradient


def make_problem(case: dict[str, Any]) -> dict[str, Any]:
    """Construct one source-independent problem from its registry name."""

    name = case["problem"]
    inputs = case["input"]
    dimension = int(inputs.get("dimension", len(inputs.get("x0", [])) or 1))
    problem: dict[str, Any] = {}

    if name == "cos-minus-x":
        problem["scalar"] = lambda x: math.cos(x) - x
    elif name == "flat-cubic":
        problem["scalar"] = lambda x: (x - 1.0) ** 3
    elif name == "endpoint-root":
        problem["scalar"] = lambda x: x - 2.0
    elif name == "scaled-exponential":
        problem["scalar"] = lambda x: math.exp(x) - 3.0
    elif name == "no-real-root":
        problem["scalar"] = lambda x: x * x + 1.0
    elif name == "smooth-quartic":
        problem["scalar"] = lambda x: (x - 0.25) ** 2 + 0.1 * (x - 0.25) ** 4
    elif name == "monotone-exponential":
        problem["scalar"] = math.exp
    elif name == "rosenbrock":
        problem["objective"] = _rosenbrock
        problem["gradient"] = _rosenbrock_gradient
        problem["known_points"] = [[1.0] * dimension]
    elif name == "beale":

        def beale(point: Vector) -> float:
            x, y = point
            return (
                (1.5 - x + x * y) ** 2
                + (2.25 - x + x * y * y) ** 2
                + (2.625 - x + x * y * y * y) ** 2
            )

        problem["objective"] = beale
    elif name == "weighted-absolute":
        problem["objective"] = lambda x: abs(x[0] - 0.5) + 2.0 * abs(x[1] + 0.25)
    elif name == "diagonal-quadratic":
        target = _target(dimension)
        condition = float(inputs["condition"])
        weights = [condition ** (index / (dimension - 1)) for index in range(dimension)]

        def diagonal_objective(point: Vector) -> float:
            return 0.5 * sum(
                weight * (value - center) ** 2
                for value, center, weight in zip(point, target, weights, strict=True)
            )

        def diagonal_gradient(point: Vector) -> list[float]:
            return [
                weight * (value - center)
                for value, center, weight in zip(point, target, weights, strict=True)
            ]

        problem.update(
            objective=diagonal_objective,
            gradient=diagonal_gradient,
            known_points=[target],
        )
    elif name == "active-box-quadratic":
        target = [2.0 if index % 2 == 0 else -2.0 for index in range(dimension)]
        projected = [1.0 if value > 0.0 else -1.0 for value in target]
        problem.update(
            objective=lambda x: sum(
                (value - center) ** 2 for value, center in zip(x, target, strict=True)
            ),
            gradient=lambda x: [
                2.0 * (value - center) for value, center in zip(x, target, strict=True)
            ],
            known_points=[projected],
        )
    elif name == "fixed-coordinate-quadratic":
        target = [2.0, -2.0, 0.5, 1.0, -0.5]
        problem.update(
            objective=lambda x: sum(
                (value - center) ** 2 for value, center in zip(x, target, strict=True)
            ),
            gradient=lambda x: [
                2.0 * (value - center) for value, center in zip(x, target, strict=True)
            ],
        )
    elif name == "linear-fit":
        observations = int(inputs["observations"])
        xs = [index / (observations - 1) for index in range(observations)]
        ys = [2.5 * x - 0.75 for x in xs]
        problem["residuals"] = lambda p: [
            p[0] * x + p[1] - y for x, y in zip(xs, ys, strict=True)
        ]
    elif name == "rosenbrock-residual":
        problem["residuals"] = lambda p: [10.0 * (p[1] - p[0] * p[0]), 1.0 - p[0]]
    elif name == "rank-deficient-linear":
        observations = int(inputs["observations"])
        problem["residuals"] = lambda p: [
            p[0] + p[1] - 1.0 for _ in range(observations)
        ]
    elif name == "exponential-decay":
        observations = int(inputs["observations"])
        xs = [3.0 * index / (observations - 1) for index in range(observations)]
        ys = [2.0 * math.exp(-1.5 * x) + 0.25 for x in xs]
        problem["residuals"] = lambda p: [
            p[0] * math.exp(-p[1] * x) + p[2] - y for x, y in zip(xs, ys, strict=True)
        ]
    elif name == "linear-boundary":
        problem.update(
            objective=lambda x: (x[0] - 1.0) ** 2 + (x[1] - 2.5) ** 2,
            constraints=[lambda x: x[0], lambda x: x[1], lambda x: 2.0 - x[0] - x[1]],
        )
    elif name == "circle-boundary":
        problem.update(
            objective=lambda x: (x[0] - 1.0) ** 2 + (x[1] - 1.0) ** 2,
            constraints=[lambda x: 1.0 - x[0] * x[0] - x[1] * x[1]],
        )
    elif name == "infeasible-interval":
        problem.update(
            objective=lambda x: x[0] * x[0],
            constraints=[lambda x: x[0] - 1.0, lambda x: -x[0]],
        )
    elif name == "six-hump-camel":

        def six_hump(point: Vector) -> float:
            x, y = point
            return (
                (4.0 - 2.1 * x * x + x**4 / 3.0) * x * x
                + x * y
                + (-4.0 + 4.0 * y * y) * y * y
            )

        problem["objective"] = six_hump
    elif name == "rastrigin":
        problem["objective"] = lambda x: (
            10.0 * len(x)
            + sum(value * value - 10.0 * math.cos(2.0 * math.pi * value) for value in x)
        )
        problem["known_points"] = [[0.0] * dimension]
    elif name == "ackley":

        def ackley(point: Vector) -> float:
            n = len(point)
            mean_square = sum(value * value for value in point) / n
            mean_cosine = sum(math.cos(2.0 * math.pi * value) for value in point) / n
            return (
                -20.0 * math.exp(-0.2 * math.sqrt(mean_square))
                - math.exp(mean_cosine)
                + 20.0
                + math.e
            )

        problem["objective"] = ackley
        problem["known_points"] = [[0.0] * dimension]
    else:
        raise KeyError(f"unknown numerical problem {name!r}")

    if "x0" in inputs:
        problem["x0"] = _float_list(inputs["x0"])
    elif inputs.get("x0_pattern") == "alternating-rosenbrock":
        problem["x0"] = [-1.2 if index % 2 == 0 else 1.0 for index in range(dimension)]
    elif inputs.get("x0_pattern") == "opposite-target":
        problem["x0"] = [-value for value in _target(dimension)]
    elif inputs.get("x0_pattern") == "zeros":
        problem["x0"] = [0.0] * dimension

    if (
        "bounds" in inputs
        and inputs["bounds"]
        and isinstance(inputs["bounds"][0], list)
    ):
        problem["bounds"] = [
            tuple(float(value) for value in pair) for pair in inputs["bounds"]
        ]
    elif inputs.get("bounds_pattern") == "unit-box":
        problem["bounds"] = [(-1.0, 1.0)] * dimension
    elif inputs.get("bounds_pattern") == "rastrigin":
        problem["bounds"] = [(-5.12, 5.12)] * dimension
    elif inputs.get("bounds_pattern") == "ackley":
        problem["bounds"] = [(-5.0, 5.0)] * dimension

    return problem


class ScipyBackend:
    name = "scipy"

    def __init__(self) -> None:
        import scipy
        import scipy.optimize

        self.version = scipy.__version__
        self.optimize = scipy.optimize

    def solve(self, case: dict[str, Any], problem: dict[str, Any]) -> dict[str, Any]:
        method = case["method"]
        inputs = case["input"]
        optimize = self.optimize
        if method == "brentq":
            root, details = optimize.brentq(
                problem["scalar"], *inputs["bracket"], full_output=True, disp=False
            )
            return {
                "x": [root],
                "fun": problem["scalar"](root),
                "success": bool(details.converged),
                "status": details.flag,
                "nit": int(details.iterations),
                "nfev": int(details.function_calls),
            }
        if method == "bounded":
            result = optimize.minimize_scalar(
                problem["scalar"],
                bounds=tuple(inputs["bounds"]),
                method="bounded",
                options={"xatol": 1.48e-8, "maxiter": 500},
            )
            return _scipy_result(result, [result.x])
        if method == "nelder-mead":
            result = optimize.minimize(
                problem["objective"],
                problem["x0"],
                method="Nelder-Mead",
                options={
                    "xatol": 1e-6,
                    "fatol": 1e-10,
                    "maxiter": 5000,
                    "maxfev": 10000,
                },
            )
            return _scipy_result(result)
        if method == "bfgs":
            result = optimize.minimize(
                problem["objective"],
                problem["x0"],
                jac=problem["gradient"],
                method="BFGS",
                options={"gtol": 1e-5, "maxiter": 5000},
            )
            return _scipy_result(result)
        if method == "lbfgsb":
            x, fun, info = optimize.fmin_l_bfgs_b(
                problem["objective"],
                problem["x0"],
                fprime=problem["gradient"],
                bounds=problem["bounds"],
                pgtol=1e-5,
                maxiter=15000,
                maxfun=15000,
            )
            return {
                "x": _float_list(x),
                "fun": float(fun),
                "success": int(info["warnflag"]) == 0,
                "status": str(info["task"]),
                "nit": int(info["nit"]),
                "nfev": int(info["funcalls"]),
            }
        if method == "levenberg-marquardt":
            x, _cov, info, message, ier = optimize.leastsq(
                problem["residuals"],
                problem["x0"],
                full_output=True,
                ftol=1.49012e-8,
                xtol=1.49012e-8,
                gtol=0.0,
                maxfev=200 * (len(problem["x0"]) + 1),
            )
            residuals = _float_list(info["fvec"])
            return {
                "x": _float_list(x),
                "fun": 0.5 * sum(value * value for value in residuals),
                "residuals": residuals,
                "success": int(ier) in (1, 2, 3, 4),
                "status": str(message),
                "nit": None,
                "nfev": int(info["nfev"]),
            }
        if method == "cobyla":
            constraints = [
                {"type": "ineq", "fun": constraint}
                for constraint in problem["constraints"]
            ]
            result = optimize.minimize(
                problem["objective"],
                problem["x0"],
                method="COBYLA",
                constraints=constraints,
                options={"rhobeg": 1.0, "tol": 1e-4, "maxiter": 2000, "catol": 2e-4},
            )
            return _scipy_result(result)
        if method == "differential-evolution":
            result = optimize.differential_evolution(
                problem["objective"],
                problem["bounds"],
                mutation=0.6,
                recombination=0.5,
                popsize=int(inputs.get("population_multiplier", 10)),
                maxiter=int(inputs["max_iterations"]),
                tol=0.001,
                rng=int(inputs["seed"]),
                polish=False,
                updating="immediate",
            )
            return _scipy_result(result)
        raise KeyError(f"unsupported scipy method {method!r}")


def _scipy_result(result: Any, x: Sequence[Any] | None = None) -> dict[str, Any]:
    return {
        "x": _float_list(result.x if x is None else x),
        "fun": float(result.fun),
        "success": bool(result.success),
        "status": str(result.message),
        "nit": int(result.nit) if getattr(result, "nit", None) is not None else None,
        "nfev": int(result.nfev) if getattr(result, "nfev", None) is not None else None,
    }


class PullRequestBackend:
    name = "pull-request-stack"
    version = "origin/numerics/wolfram-domains-sweep@98be0227"

    def __init__(self) -> None:
        from sagejs.optimization.brent_minimize import fminbound
        from sagejs.optimization.brent_root import brentq
        from sagejs.optimization.cobyla import cobyla
        from sagejs.optimization.differential_evolution import differential_evolution
        from sagejs.optimization.gradient_methods import fmin_bfgs
        from sagejs.optimization.lbfgsb import fmin_l_bfgs_b
        from sagejs.optimization.levenberg_marquardt import leastsq
        from sagejs.optimization.nelder_mead import nelder_mead

        self.brentq = brentq
        self.fminbound = fminbound
        self.cobyla = cobyla
        self.differential_evolution = differential_evolution
        self.fmin_bfgs = fmin_bfgs
        self.fmin_l_bfgs_b = fmin_l_bfgs_b
        self.leastsq = leastsq
        self.nelder_mead = nelder_mead

    def solve(self, case: dict[str, Any], problem: dict[str, Any]) -> dict[str, Any]:
        method = case["method"]
        inputs = case["input"]
        if method == "brentq":
            result = self.brentq(problem["scalar"], *inputs["bracket"])
            return {
                "x": [float(result.root)],
                "fun": float(problem["scalar"](result.root)),
                "success": bool(result.converged),
                "status": str(result.flag),
                "nit": int(result.iterations),
                "nfev": int(result.function_calls),
            }
        if method == "bounded":
            result = self.fminbound(problem["scalar"], *inputs["bounds"])
            return _pr_result(result)
        if method == "nelder-mead":
            result = self.nelder_mead(
                problem["objective"],
                problem["x0"],
                xatol=1e-6,
                fatol=1e-10,
                maxiter=5000,
                maxfev=10000,
            )
            return _pr_result(result)
        if method == "bfgs":
            result = self.fmin_bfgs(
                problem["objective"],
                problem["x0"],
                fprime=problem["gradient"],
                gtol=1e-5,
                maxiter=5000,
            )
            return _pr_result(result)
        if method == "lbfgsb":
            result = self.fmin_l_bfgs_b(
                problem["objective"],
                problem["x0"],
                fprime=problem["gradient"],
                bounds=problem["bounds"],
                pgtol=1e-5,
                maxiter=15000,
                maxfun=15000,
            )
            return _pr_result(result)
        if method == "levenberg-marquardt":
            result = self.leastsq(problem["residuals"], problem["x0"])
            normalized = _pr_result(result)
            normalized["residuals"] = _float_list(problem["residuals"](normalized["x"]))
            return normalized
        if method == "cobyla":
            result = self.cobyla(
                problem["objective"],
                problem["x0"],
                problem["constraints"],
                rhobeg=1.0,
                rhoend=1e-4,
                maxfun=2000,
                catol=2e-4,
            )
            return _pr_result(result)
        if method == "differential-evolution":
            result = self.differential_evolution(
                problem["objective"],
                problem["bounds"],
                scaling_factor=0.6,
                cross_probability=0.5,
                search_points=int(inputs.get("population_multiplier", 10))
                * len(problem["bounds"]),
                max_iterations=int(inputs["max_iterations"]),
                tolerance=0.001,
                seed=int(inputs["seed"]),
            )
            return _pr_result(result)
        raise KeyError(f"unsupported pull-request method {method!r}")


class NloptCtypesBackend:
    """Development adapter for a locally built NLopt shared library.

    This is not a proposed Sage.js runtime boundary. It measures mature C
    algorithms while retaining a Python callback, which approximates a host
    callback from a future Wasm adapter.
    """

    name = "nlopt-ctypes"

    def __init__(self, library: Path) -> None:
        import ctypes

        self.ctypes = ctypes
        self.library_path = library.resolve()
        self.library = ctypes.CDLL(str(self.library_path))
        self.callback_type = ctypes.CFUNCTYPE(
            ctypes.c_double,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_double),
            ctypes.POINTER(ctypes.c_double),
            ctypes.c_void_p,
        )
        functions = self.library
        functions.nlopt_create.argtypes = [ctypes.c_int, ctypes.c_uint]
        functions.nlopt_create.restype = ctypes.c_void_p
        functions.nlopt_destroy.argtypes = [ctypes.c_void_p]
        functions.nlopt_set_min_objective.argtypes = [
            ctypes.c_void_p,
            self.callback_type,
            ctypes.c_void_p,
        ]
        functions.nlopt_set_lower_bounds.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_double),
        ]
        functions.nlopt_set_upper_bounds.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_double),
        ]
        functions.nlopt_set_xtol_rel.argtypes = [ctypes.c_void_p, ctypes.c_double]
        functions.nlopt_set_ftol_abs.argtypes = [ctypes.c_void_p, ctypes.c_double]
        functions.nlopt_set_maxeval.argtypes = [ctypes.c_void_p, ctypes.c_int]
        functions.nlopt_set_population.argtypes = [ctypes.c_void_p, ctypes.c_uint]
        functions.nlopt_add_inequality_constraint.argtypes = [
            ctypes.c_void_p,
            self.callback_type,
            ctypes.c_void_p,
            ctypes.c_double,
        ]
        functions.nlopt_optimize.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_double),
            ctypes.POINTER(ctypes.c_double),
        ]
        functions.nlopt_optimize.restype = ctypes.c_int
        functions.nlopt_get_numevals.argtypes = [ctypes.c_void_p]
        functions.nlopt_get_numevals.restype = ctypes.c_int
        functions.nlopt_srand.argtypes = [ctypes.c_ulong]
        functions.nlopt_version.argtypes = [
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
        ]
        major = ctypes.c_int()
        minor = ctypes.c_int()
        bugfix = ctypes.c_int()
        functions.nlopt_version(
            ctypes.byref(major), ctypes.byref(minor), ctypes.byref(bugfix)
        )
        self.version = f"{major.value}.{minor.value}.{bugfix.value}@{self.library_path}"

    def _callback(
        self, function: Callable[[Vector], float], failures: list[BaseException]
    ) -> Any:
        @self.callback_type
        def callback(
            dimension: int,
            values: Any,
            _gradient: Any,
            _data: Any,
        ) -> float:
            try:
                return float(function([values[index] for index in range(dimension)]))
            except BaseException as exception:
                failures.append(exception)
                return math.inf

        return callback

    def solve(self, case: dict[str, Any], problem: dict[str, Any]) -> dict[str, Any]:
        ctypes = self.ctypes
        functions = self.library
        method = case["method"]
        inputs = case["input"]
        if method == "bounded":
            algorithm = 28  # NLOPT_LN_NELDERMEAD
            objective = lambda point: problem["scalar"](point[0])
            x0 = [sum(inputs["bounds"]) / 2.0]
            bounds = [tuple(float(value) for value in inputs["bounds"])]
            maxeval = 500
        elif method == "nelder-mead":
            algorithm = 28  # NLOPT_LN_NELDERMEAD
            objective = problem["objective"]
            x0 = problem["x0"]
            bounds = None
            maxeval = 10000
        elif method == "cobyla":
            algorithm = 25  # NLOPT_LN_COBYLA
            objective = problem["objective"]
            x0 = problem["x0"]
            bounds = problem.get("bounds")
            maxeval = 2000
        elif method == "differential-evolution":
            # NLopt has no differential evolution. CRS2-LM is the nearest
            # permissively licensed population comparison in the library.
            algorithm = 19  # NLOPT_GN_CRS2_LM
            objective = problem["objective"]
            bounds = problem["bounds"]
            x0 = [(lower + upper) / 2.0 for lower, upper in bounds]
            population = int(inputs.get("population_multiplier", 10)) * len(x0)
            maxeval = (int(inputs["max_iterations"]) + 1) * population
            functions.nlopt_srand(int(inputs["seed"]))
        else:
            raise NotImplementedError(f"NLopt comparison does not cover {method}")

        dimension = len(x0)
        optimizer = functions.nlopt_create(algorithm, dimension)
        if not optimizer:
            raise MemoryError("nlopt_create returned null")
        failures: list[BaseException] = []
        callbacks: list[Any] = []
        try:
            objective_callback = self._callback(objective, failures)
            callbacks.append(objective_callback)
            if (
                functions.nlopt_set_min_objective(optimizer, objective_callback, None)
                < 0
            ):
                raise ValueError("NLopt rejected the objective")
            if bounds is not None:
                lower = (ctypes.c_double * dimension)(*(pair[0] for pair in bounds))
                upper = (ctypes.c_double * dimension)(*(pair[1] for pair in bounds))
                if functions.nlopt_set_lower_bounds(optimizer, lower) < 0:
                    raise ValueError("NLopt rejected lower bounds")
                if functions.nlopt_set_upper_bounds(optimizer, upper) < 0:
                    raise ValueError("NLopt rejected upper bounds")
            for constraint in problem.get("constraints", []):
                # The corpus uses constraint(x) >= 0; NLopt expects g(x) <= 0.
                callback = self._callback(
                    lambda point, function=constraint: -function(point), failures
                )
                callbacks.append(callback)
                if (
                    functions.nlopt_add_inequality_constraint(
                        optimizer, callback, None, 2e-4
                    )
                    < 0
                ):
                    raise ValueError("NLopt rejected an inequality constraint")
            functions.nlopt_set_xtol_rel(optimizer, 1e-7)
            functions.nlopt_set_ftol_abs(optimizer, 1e-10)
            functions.nlopt_set_maxeval(optimizer, maxeval)
            if method == "differential-evolution":
                functions.nlopt_set_population(optimizer, population)
            point = (ctypes.c_double * dimension)(*_float_list(x0))
            minimum = ctypes.c_double()
            status = int(
                functions.nlopt_optimize(optimizer, point, ctypes.byref(minimum))
            )
            if failures:
                raise failures[0]
            names = {
                -5: "forced stop",
                -4: "roundoff limited",
                -3: "out of memory",
                -2: "invalid arguments",
                -1: "failure",
                1: "success",
                2: "stop value reached",
                3: "function tolerance reached",
                4: "parameter tolerance reached",
                5: "maximum evaluations reached",
                6: "maximum time reached",
            }
            label = (
                "CRS2-LM comparison" if method == "differential-evolution" else "NLopt"
            )
            return {
                "x": [float(point[index]) for index in range(dimension)],
                "fun": float(minimum.value),
                "success": status > 0,
                "status": f"{label}: {names.get(status, status)}",
                "nit": None,
                "nfev": int(functions.nlopt_get_numevals(optimizer)),
            }
        finally:
            # This assignment documents and enforces callback lifetime through
            # the synchronous native call above.
            _ = callbacks
            functions.nlopt_destroy(optimizer)


def _pr_result(result: Any) -> dict[str, Any]:
    x = getattr(result, "x", None)
    if x is None:
        x = [getattr(result, "root")]
    elif isinstance(x, (int, float)):
        x = [x]
    success = getattr(result, "success", getattr(result, "converged", False))
    fun = getattr(result, "fun", getattr(result, "cost", math.nan))
    return {
        "x": _float_list(x),
        "fun": float(fun),
        "success": bool(success),
        "status": str(getattr(result, "message", getattr(result, "flag", ""))),
        "nit": _optional_int(
            getattr(result, "nit", getattr(result, "iterations", None))
        ),
        "nfev": _optional_int(
            getattr(result, "nfev", getattr(result, "function_calls", None))
        ),
    }


def _optional_int(value: Any) -> int | None:
    return None if value is None else int(value)


def _bounds_projected_gradient(
    point: Vector, gradient: Vector, bounds: Sequence[tuple[float, float]]
) -> float:
    errors = []
    for value, derivative, (lower, upper) in zip(point, gradient, bounds, strict=True):
        if lower == upper:
            errors.append(0.0)
        elif value <= lower + 1e-9:
            errors.append(max(0.0, -derivative))
        elif value >= upper - 1e-9:
            errors.append(max(0.0, derivative))
        else:
            errors.append(abs(derivative))
    return _linf(errors)


def measure(
    case: dict[str, Any], problem: dict[str, Any], result: dict[str, Any]
) -> dict[str, float]:
    metrics: dict[str, float] = {}
    point = result.get("x", [])
    oracle = case["oracle"]
    known_points = problem.get("known_points", oracle.get("points"))
    if known_points and point:
        metrics["x_linf"] = _nearest_linf(point, known_points)
    if "fun" in oracle and math.isfinite(float(result.get("fun", math.nan))):
        metrics["objective_gap"] = abs(float(result["fun"]) - float(oracle["fun"]))
    if case["operation"] == "root" and point:
        metrics["residual_linf"] = abs(float(problem["scalar"](point[0])))
    if "gradient" in problem and point:
        gradient = problem["gradient"](point)
        metrics["gradient_linf"] = _linf(gradient)
        if "bounds" in problem:
            metrics["projected_gradient_linf"] = _bounds_projected_gradient(
                point, gradient, problem["bounds"]
            )
    if "residuals" in problem and point:
        residuals = problem["residuals"](point)
        cost = 0.5 * sum(value * value for value in residuals)
        metrics["residual_l2"] = math.sqrt(sum(value * value for value in residuals))
        metrics["cost_gap"] = abs(cost - float(oracle.get("cost", 0.0)))
    if "constraints" in problem and point:
        metrics["max_constraint_violation"] = max(
            [0.0, *(-float(constraint(point)) for constraint in problem["constraints"])]
        )
    return metrics


def accepted(
    case: dict[str, Any],
    result: dict[str, Any] | None,
    metrics: dict[str, float],
    error: dict[str, str] | None,
) -> tuple[bool, list[str]]:
    oracle = case["oracle"]
    thresholds = case["acceptance"]
    reasons: list[str] = []
    if "exception" in oracle:
        passed = error is not None and error["type"] == oracle["exception"]
        if not passed:
            reasons.append(
                f"expected {oracle['exception']}, observed {error or 'success'}"
            )
        return passed, reasons
    if error is not None or result is None:
        return False, [f"unexpected {error}"]
    if thresholds.get("expected_failure") and result["success"]:
        reasons.append("solver reported success for a declared infeasible case")
    for name, limit in thresholds.items():
        if name in (
            "expected_failure",
            "minimum_constraint_violation",
            "minimum_success_rate",
            "max_function_calls",
        ):
            continue
        observed = metrics.get(name)
        if observed is None or not math.isfinite(observed) or observed > float(limit):
            reasons.append(f"{name}={observed!r} exceeds {limit}")
    if "minimum_constraint_violation" in thresholds:
        observed = metrics.get("max_constraint_violation")
        if observed is None or observed < float(
            thresholds["minimum_constraint_violation"]
        ):
            reasons.append(
                f"max_constraint_violation={observed!r} is below the expected infeasibility floor"
            )
    if "max_function_calls" in thresholds:
        observed = result.get("nfev")
        if observed is None or observed > int(thresholds["max_function_calls"]):
            reasons.append(
                f"nfev={observed!r} exceeds {thresholds['max_function_calls']}"
            )
    return not reasons, reasons


def run_case(
    backend: Any,
    case: dict[str, Any],
    *,
    warmups: int,
    samples: int,
) -> dict[str, Any]:
    problem = make_problem(case)
    seeds = case["input"].get("seeds")
    trials: list[dict[str, Any]] | None = None
    if seeds:
        trials = []
        for seed in seeds:
            trial_case = {**case, "input": {**case["input"], "seed": int(seed)}}
            trial_result: dict[str, Any] | None = None
            trial_error: dict[str, str] | None = None
            try:
                trial_result = backend.solve(trial_case, problem)
            except Exception as exception:
                trial_error = {
                    "type": type(exception).__name__,
                    "message": str(exception),
                }
            trial_metrics = (
                measure(trial_case, problem, trial_result)
                if trial_result is not None
                else {}
            )
            trial_passed, trial_reasons = accepted(
                trial_case, trial_result, trial_metrics, trial_error
            )
            trials.append(
                {
                    "seed": int(seed),
                    "accepted": trial_passed,
                    "reasons": trial_reasons,
                    "result": trial_result,
                    "metrics": trial_metrics,
                    "error": trial_error,
                }
            )
    error: dict[str, str] | None = None
    result: dict[str, Any] | None = None
    durations_ns: list[int] = []
    repetitions = samples if case["benchmark"] else 1
    try:
        for _ in range(warmups if case["benchmark"] else 0):
            backend.solve(case, problem)
        for _ in range(repetitions):
            started = time.perf_counter_ns()
            result = backend.solve(case, problem)
            durations_ns.append(time.perf_counter_ns() - started)
    except Exception as exception:  # Corpus records exception contracts by type.
        error = {"type": type(exception).__name__, "message": str(exception)}
    metrics = measure(case, problem, result) if result is not None else {}
    passed, reasons = accepted(case, result, metrics, error)
    if trials is not None:
        success_rate = sum(trial["accepted"] for trial in trials) / len(trials)
        metrics["success_rate"] = success_rate
        minimum_rate = float(case["acceptance"].get("minimum_success_rate", 1.0))
        if success_rate < minimum_rate:
            passed = False
            reasons.append(
                f"success_rate={success_rate} is below {minimum_rate} over {len(trials)} seeds"
            )
    return {
        "id": case["id"],
        "operation": case["operation"],
        "method": case["method"],
        "benchmark": bool(case["benchmark"]),
        "accepted": passed,
        "reasons": reasons,
        "result": result,
        "metrics": metrics,
        "error": error,
        "trials": trials,
        "timing": {
            "warmups": warmups if case["benchmark"] else 0,
            "samples": len(durations_ns),
            "durations_ms": [duration / 1_000_000.0 for duration in durations_ns],
            "median_ms": _median_ms(durations_ns),
        },
    }


def load_corpus(path: Path) -> dict[str, Any]:
    corpus = json.loads(path.read_text(encoding="utf-8"))
    if corpus.get("schema") != "sagejs.numerical-optimization-corpus/v1":
        raise ValueError(f"unsupported corpus schema {corpus.get('schema')!r}")
    identifiers = [case["id"] for case in corpus["cases"]]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("corpus case identifiers must be unique")
    return corpus


def backend_named(name: str, *, nlopt_library: Path | None = None) -> Any:
    if name == "scipy":
        return ScipyBackend()
    if name == "pull-request-stack":
        return PullRequestBackend()
    if name == "nlopt-ctypes":
        if nlopt_library is None:
            raise ValueError("--nlopt-library is required for the nlopt-ctypes backend")
        return NloptCtypesBackend(nlopt_library)
    raise ValueError(f"unknown backend {name!r}")


def parse_arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backend",
        choices=("scipy", "pull-request-stack", "nlopt-ctypes"),
        default="scipy",
    )
    parser.add_argument("--nlopt-library", type=Path)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument(
        "--case", action="append", default=[], help="run one case ID; repeatable"
    )
    parser.add_argument(
        "--operation", action="append", default=[], help="run one operation; repeatable"
    )
    parser.add_argument("--benchmark-only", action="store_true")
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--subject-ref", default=None)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--list", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    options = parse_arguments(sys.argv[1:] if argv is None else argv)
    if options.samples < 1 or options.warmups < 0:
        raise ValueError("samples must be positive and warmups nonnegative")
    corpus = load_corpus(options.corpus)
    cases = corpus["cases"]
    if options.case:
        requested = set(options.case)
        cases = [case for case in cases if case["id"] in requested]
        missing = requested - {case["id"] for case in cases}
        if missing:
            raise KeyError(f"unknown corpus cases: {sorted(missing)}")
    if options.operation:
        operations = set(options.operation)
        cases = [case for case in cases if case["operation"] in operations]
    if options.benchmark_only:
        cases = [case for case in cases if case["benchmark"]]
    if options.list:
        for case in cases:
            print(case["id"])
        return 0
    backend = backend_named(options.backend, nlopt_library=options.nlopt_library)
    started = time.time()
    results = [
        run_case(backend, case, warmups=options.warmups, samples=options.samples)
        for case in cases
    ]
    receipt = {
        "schema": RESULT_SCHEMA,
        "corpus_schema": corpus["schema"],
        "backend": {"name": backend.name, "version": backend.version},
        "subject_ref": options.subject_ref,
        "environment": {
            "implementation": sys.implementation.name,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "machine": platform.machine(),
            "node": os.environ.get("SAGEJS_NODE_VERSION"),
            "repository_revision": _git_revision(),
        },
        "protocol": {
            "clock": "time.perf_counter_ns",
            "warmups": options.warmups,
            "samples": options.samples,
            "problem_setup_inside_timer": False,
            "solver_and_callback_inside_timer": True,
        },
        "started_unix": started,
        "elapsed_seconds": time.time() - started,
        "summary": {
            "cases": len(results),
            "accepted": sum(result["accepted"] for result in results),
            "failed": sum(not result["accepted"] for result in results),
        },
        "results": results,
    }
    encoded = json.dumps(receipt, indent=2, sort_keys=True, allow_nan=False) + "\n"
    if options.output:
        options.output.write_text(encoded, encoding="utf-8")
    sys.stdout.write(encoded)
    return 0 if receipt["summary"]["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
