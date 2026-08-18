"""Probable analytic rank of elliptic curves over the rationals.

This module deliberately contains the readable implementation of the
mathematics.  For an elliptic curve of conductor `N`, put

`A = sqrt(N)/(2*pi)` and `x_n = 2*pi*n/sqrt(N)`.  Splitting the Mellin
integral at one and applying the functional equation gives

`Lambda(1+t) = sum_n a_n * (J_n(t) + w*J_n(-t))`

where `J_n(t) = integral_1^infinity exp(-x_n*y)*y^t dy`.  Consequently,
for a derivative order with the parity forced by `w`,

`Lambda^(k)(1) = 2 * integral_0^infinity f(i*exp(u)/sqrt(N))*exp(u)*u^k du`.

The reference evaluator computes those moments by deterministic composite
Gauss--Legendre quadrature.  It is an ordinary CPython-parseable fallback and
an oracle for the accelerated Arb evaluator.  Numerical containment of zero
does *not* prove vanishing; :func:`probable_analytic_rank` therefore requires
independent precision and cutoff refinements and returns a probable rank.

The zero-sum function is logically separate.  It implements the sinc-squared
explicit formula used by Sage and returns an upper bound conditional on GRH.
"""

from __future__ import annotations

from math import ceil, exp, floor, fsum, isfinite, log, log1p, pi, sqrt
from typing import Any

from mpmath import mp

# Positive nodes and weights for the 16-point Gauss--Legendre rule on [-1,1].
# Keeping this small fixed rule in source avoids generating an eigenproblem at
# runtime (and makes the reference quadrature identical in CPython and Sage.js).
_GL16 = (
    ("0.0950125098376374401853193354250", "0.189450610455068496285396723208"),
    ("0.281603550779258913230460501460", "0.182603415044923588866763667969"),
    ("0.458016777657227386342419442984", "0.169156519395002538189312079030"),
    ("0.617876244402643748446671764049", "0.149595988816576732081501730547"),
    ("0.755404408355003033895101194847", "0.124628971255533872052476282192"),
    ("0.865631202387831743880467897712", "0.0951585116824927848099251076022"),
    ("0.944575023073232576077988415535", "0.0622535239386478928628438369944"),
    ("0.989400934991649932596154173450", "0.0271524594117540948517805724560"),
)


class NumericalIndeterminacyError(ArithmeticError):
    """The numerical evaluations did not determine a stable probable rank."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


class CoefficientPrefix:
    """An extendable exact `a_n` prefix owned by one curve computation."""

    def __init__(self, curve: Any) -> None:
        self.curve = curve
        self.values: list[int] = [0, 1]
        self.backend = "elliptic-curve anlist"

    def through(self, cutoff: int) -> list[int]:
        """Return `a_0,...,a_cutoff`, extending the cached prefix if needed."""
        if cutoff < 1:
            cutoff = 1
        if cutoff >= len(self.values):
            raw = self.curve.anlist(cutoff)
            self.values = [int(value) for value in raw]
        return self.values[: cutoff + 1]


def _factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def coefficient_tail_bound(conductor: int, cutoff: int, order: int) -> float:
    """Bound the omitted completed derivative using `|a_n| <= n`.

    With `a=2*pi/sqrt(N)` and `q=exp(-a)`, use

    `2*r!/a^(r+1) * q^(K+1) / ((K+1)^r * (1-q))`.

    This follows from `log(y) <= y-1` in the Mellin moment and the elementary
    bound on elliptic-curve Dirichlet coefficients.  For order zero it is the
    familiar tail bound used by Sage's `at1` implementation, multiplied by
    `A=1/a` because this function bounds a derivative of completed Lambda.
    """
    logarithm = _coefficient_tail_log(conductor, cutoff, order)
    return 0.0 if logarithm < -745.0 else exp(logarithm)


def _coefficient_tail_log(conductor: int, cutoff: int, order: int) -> float:
    """Return the logarithm of :func:`coefficient_tail_bound` safely."""
    a_value = 2.0 * pi / sqrt(float(conductor))
    log_factorial = fsum(log(index) for index in range(2, order + 1))
    return (
        log(2.0)
        + log_factorial
        - (order + 1) * log(a_value)
        - a_value * (cutoff + 1)
        - order * log(cutoff + 1)
        - log1p(-exp(-a_value))
    )


def choose_cutoff(conductor: int, precision_bits: int, max_order: int) -> int:
    """Choose a coefficient cutoff with a conservative analytic tail target."""
    log_target = (-precision_bits - 12) * log(2.0)
    a_value = 2.0 * pi / sqrt(float(conductor))
    cutoff = max(8, int(ceil((precision_bits * log(2.0) + 24.0) / a_value)))
    while (
        max(
            _coefficient_tail_log(conductor, cutoff, order)
            for order in range(max_order + 1)
        )
        > log_target
    ):
        cutoff = int(cutoff * 1.25) + 1
        if cutoff > 5_000_000:
            raise ValueError("analytic-rank coefficient cutoff exceeds 5000000")
    return cutoff


def _legendre_moments(
    coefficients: list[int],
    conductor: int,
    root_number: int,
    max_order: int,
    precision_bits: int,
    quadrature_degree: int,
) -> list[Any]:
    """Compute completed central derivatives by composite quadrature."""
    old_precision = mp.prec
    mp.prec = precision_bits
    try:
        conductor_real = mp.mpf(conductor)
        c_value = 2 * mp.pi / mp.sqrt(conductor_real)
        target_exponent = (precision_bits + 20) * mp.log(2)
        upper = max(mp.mpf(8), mp.log(target_exponent / c_value))
        mesh = max(1, quadrature_degree // 16)
        interval_count = max(1, int(mp.ceil(upper)) * mesh)
        positive_rule = [(mp.mpf(node), mp.mpf(weight)) for node, weight in _GL16]
        exact = [mp.mpf(value) for value in coefficients[1:]]
        moments = [mp.mpf(0) for _order in range(max_order + 1)]

        for interval in range(interval_count):
            left = mp.mpf(interval) * upper / interval_count
            right = mp.mpf(interval + 1) * upper / interval_count
            midpoint = (left + right) / 2
            radius = (right - left) / 2
            for positive_node, weight in positive_rule:
                for node in (-positive_node, positive_node):
                    u_value = midpoint + radius * node
                    exponential_u = mp.exp(u_value)
                    q_value = mp.exp(-c_value * exponential_u)
                    modular_value = mp.mpf(0)
                    for coefficient in reversed(exact):
                        modular_value = (modular_value + coefficient) * q_value
                    common = radius * weight * exponential_u * modular_value
                    power = mp.mpf(1)
                    for order in range(max_order + 1):
                        if (root_number == 1 and order % 2 == 0) or (
                            root_number == -1 and order % 2 == 1
                        ):
                            moments[order] += 2 * common * power
                        power *= u_value
        return moments
    finally:
        mp.prec = old_precision


def _completed_to_l_derivatives(
    completed: list[Any], conductor: int, precision_bits: int
) -> list[Any]:
    """Convert completed derivatives to derivatives of `L(E,s)` at one."""
    old_precision = mp.prec
    mp.prec = precision_bits
    try:
        completed_values = [mp.mpf(value) for value in completed]
        maximum = len(completed) - 1
        a_value = mp.sqrt(mp.mpf(conductor)) / (2 * mp.pi)
        log_series = [mp.mpf(0) for _index in range(maximum + 1)]
        log_series[0] = -mp.log(a_value)
        if maximum >= 1:
            log_series[1] = -mp.log(a_value) + mp.euler
        for index in range(2, maximum + 1):
            log_series[index] = (-1) ** (index + 1) * mp.zeta(index) / index

        reciprocal_gamma = [mp.mpf(0) for _index in range(maximum + 1)]
        reciprocal_gamma[0] = mp.exp(log_series[0])
        for degree in range(1, maximum + 1):
            total = mp.mpf(0)
            for index in range(1, degree + 1):
                total += index * log_series[index] * reciprocal_gamma[degree - index]
            reciprocal_gamma[degree] = total / degree

        completed_taylor = [
            completed_values[index] / _factorial(index) for index in range(maximum + 1)
        ]
        answer = []
        for degree in range(maximum + 1):
            coefficient = mp.mpf(0)
            for index in range(degree + 1):
                coefficient += (
                    reciprocal_gamma[index] * completed_taylor[degree - index]
                )
            answer.append(coefficient * _factorial(degree))
        return answer
    finally:
        mp.prec = old_precision


def reference_central_derivatives(
    curve: Any,
    root_number: int,
    precision_bits: int,
    max_order: int = 6,
    cutoff: int | None = None,
    quadrature_degree: int = 32,
    coefficient_prefix: CoefficientPrefix | None = None,
) -> dict[str, Any]:
    """Evaluate central derivatives with the readable Mellin implementation."""
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    if precision_bits < 32:
        raise ValueError("precision must be at least 32 bits")
    if max_order < 0 or max_order > 12:
        raise ValueError("maximum derivative order must lie between 0 and 12")
    conductor = int(curve.conductor())
    if cutoff is None:
        cutoff = choose_cutoff(conductor, precision_bits, max_order)
    prefix = coefficient_prefix or CoefficientPrefix(curve)
    coefficients = prefix.through(cutoff)
    completed = _legendre_moments(
        coefficients,
        conductor,
        root_number,
        max_order,
        precision_bits,
        quadrature_degree,
    )
    derivatives = _completed_to_l_derivatives(completed, conductor, precision_bits)
    tail = max(
        coefficient_tail_bound(conductor, cutoff, order)
        for order in range(max_order + 1)
    )
    return {
        "algorithm": "reference",
        "precision_bits": precision_bits,
        "cutoff": cutoff,
        "quadrature_degree": quadrature_degree,
        "completed_derivatives": [mp.nstr(value, n=30) for value in completed],
        "derivatives": [mp.nstr(value, n=30) for value in derivatives],
        "tail_bound": tail,
        "coefficient_backend": prefix.backend,
    }


def native_central_derivatives(
    curve: Any,
    precision_bits: int,
    max_order: int = 6,
    cutoff: int | None = None,
    coefficient_prefix: CoefficientPrefix | None = None,
) -> dict[str, Any]:
    """Evaluate a completed central jet through the optional Arb boundary."""
    conductor = int(curve.conductor())
    if cutoff is None:
        cutoff = choose_cutoff(conductor, precision_bits, max_order)
    prefix = coefficient_prefix or CoefficientPrefix(curve)
    coefficients = prefix.through(cutoff)
    native = curve._analytic_completed_derivatives_native(
        coefficients, 0, max_order + 1, precision_bits
    )
    if native["status"] != "ok":
        raise NumericalIndeterminacyError(
            "the native completed-derivative evaluator did not have enough input",
            native,
        )
    derivative_records = native["derivatives"]
    if len(derivative_records) != max_order + 1:
        raise NumericalIndeterminacyError(
            "the native completed-derivative evaluator returned an incomplete jet",
            native,
        )
    completed = [record["midpoint"] for record in derivative_records]
    derivatives = _completed_to_l_derivatives(completed, conductor, precision_bits)
    native_tail = float(native["tail_bound"])
    radius = max(float(record["radius"]) for record in derivative_records)
    return {
        "algorithm": "native",
        "precision_bits": native["precision_bits"],
        "work_precision_bits": native["work_precision_bits"],
        "cutoff": native["cutoff"],
        "required_cutoff": native["required_cutoff"],
        "grid_points": native["grid_points"],
        "grid_step": native["grid_step"],
        "completed_derivatives": [record["midpoint"] for record in derivative_records],
        "completed_radii": [record["radius"] for record in derivative_records],
        "derivatives": [mp.nstr(value, n=30) for value in derivatives],
        "tail_bound": native_tail + radius,
        "rigorous": native["rigorous"],
        "analytic_error_status": native["analytic_error_status"],
        "coefficient_backend": prefix.backend,
    }


def _rank_from_refinements(
    first: dict[str, Any],
    second: dict[str, Any],
    root_number: int,
    max_order: int,
) -> tuple[int, Any, list[dict[str, Any]]]:
    """Select a stable probable rank from two independent refinements."""
    old_precision = mp.prec
    mp.prec = max(int(first["precision_bits"]), int(second["precision_bits"]))
    try:
        # Vanishing is tested on completed derivatives.  Opposite-parity
        # derivatives of Lambda vanish exactly, whereas opposite-parity
        # derivatives of L generally do not because of the gamma factor.
        first_values = [mp.mpf(value) for value in first["completed_derivatives"]]
        second_values = [mp.mpf(value) for value in second["completed_derivatives"]]
        scale_error = max(
            mp.mpf(first["tail_bound"]),
            mp.mpf(second["tail_bound"]),
            mp.power(
                2,
                -min(int(first["precision_bits"]), int(second["precision_bits"])) // 3,
            ),
        )
        parity = 0 if root_number == 1 else 1
        decisions = []
        for order in range(parity, max_order + 1, 2):
            left = first_values[order]
            right = second_values[order]
            disagreement = abs(left - right)
            tolerance = 32 * scale_error * max(1, abs(right))
            separated = abs(right) > 128 * max(scale_error, disagreement)
            decisions.append(
                {
                    "order": order,
                    "first": mp.nstr(left, n=24),
                    "second": mp.nstr(right, n=24),
                    "difference": mp.nstr(disagreement, n=12),
                    "tolerance": mp.nstr(tolerance, n=12),
                    "separated_from_zero": bool(separated),
                }
            )
            if separated and disagreement <= tolerance:
                for lower in decisions[:-1]:
                    lower_value = abs(mp.mpf(lower["second"]))
                    lower_difference = mp.mpf(lower["difference"])
                    if lower_value > 128 * max(scale_error, lower_difference):
                        raise NumericalIndeterminacyError(
                            "lower central derivatives do not vanish numerically",
                            {"decisions": decisions},
                        )
                leading = mp.mpf(second["derivatives"][order])
                return order, leading, decisions
        raise NumericalIndeterminacyError(
            "no central derivative separated stably from zero",
            {"decisions": decisions},
        )
    finally:
        mp.prec = old_precision


def probable_analytic_rank(
    curve: Any,
    root_number: int,
    precision_bits: int | None = None,
    max_order: int = 6,
    algorithm: str = "auto",
) -> dict[str, Any]:
    """Return a probable analytic rank and reproducible numerical diagnostics."""
    if algorithm not in ("auto", "reference", "native"):
        if algorithm in ("pari", "sympow", "rubinstein", "magma"):
            raise NotImplementedError(
                "Sage.js does not ship the external "
                + algorithm
                + " analytic-rank backend"
            )
        raise ValueError("algorithm must be 'auto', 'reference', or 'native'")
    initial_precision = 80 if precision_bits is None else int(precision_bits)
    if initial_precision < 32:
        raise ValueError("precision must be at least 32 bits")
    prefix = CoefficientPrefix(curve)
    conductor = int(curve.conductor())
    first_cutoff = choose_cutoff(conductor, initial_precision, max_order)
    second_precision = initial_precision + 24
    second_cutoff = choose_cutoff(conductor, second_precision, max_order)
    evaluator = "reference"
    if algorithm in ("auto", "native"):
        try:
            first = native_central_derivatives(
                curve, initial_precision, max_order, first_cutoff, prefix
            )
            evaluator = "native"
        except NotImplementedError:
            if algorithm == "native":
                raise
            first = reference_central_derivatives(
                curve,
                root_number,
                initial_precision,
                max_order,
                first_cutoff,
                28,
                prefix,
            )
    else:
        first = reference_central_derivatives(
            curve,
            root_number,
            initial_precision,
            max_order,
            first_cutoff,
            28,
            prefix,
        )
    if evaluator == "native":
        second = native_central_derivatives(
            curve, second_precision, max_order, second_cutoff, prefix
        )
    else:
        second = reference_central_derivatives(
            curve,
            root_number,
            second_precision,
            max_order,
            second_cutoff,
            40,
            prefix,
        )
    try:
        rank, leading, decisions = _rank_from_refinements(
            first, second, root_number, max_order
        )
    except NumericalIndeterminacyError as error:
        diagnostics = {
            "root_number": root_number,
            "forced_parity": 0 if root_number == 1 else 1,
            "runs": [first, second],
        }
        diagnostics.update(error.diagnostics)
        raise NumericalIndeterminacyError(str(error), diagnostics) from error
    return {
        "rank": rank,
        "leading_derivative": mp.nstr(leading, n=30),
        "root_number": root_number,
        "forced_parity": 0 if root_number == 1 else 1,
        "probable": True,
        "runs": [first, second],
        "decisions": decisions,
    }


def _zero_sum_value(curve: Any, delta: float) -> tuple[float, float, int]:
    """Return the sinc-squared zero sum and its prime cutoff."""
    if not isfinite(delta) or delta <= 0:
        raise ValueError("Delta must be a positive finite real number")
    if delta > 3.0:
        raise ValueError("Delta above 3 is disabled by the resource cap")
    conductor = int(curve.conductor())
    t_value = 2.0 * pi * delta
    exp_t = exp(t_value)
    bound = int(ceil(exp_t))
    if bound > 160_000_000:
        raise ValueError("zero-sum prime cutoff exceeds the resource cap")
    c_zero = log(float(conductor)) / 2.0 - log(2.0 * pi) - 0.5772156649015329
    smooth = t_value * c_zero
    old_precision = mp.prec
    mp.prec = 80
    try:
        archimedean = float(mp.pi**2 / 6 - mp.polylog(2, mp.exp(-t_value)))
    finally:
        mp.prec = old_precision
    prime_terms = []
    for prime_value, ap_value in curve._analytic_rank_prime_traces(bound):
        prime = int(prime_value)
        log_prime = log(float(prime))
        ap = int(ap_value)
        bad = conductor % prime == 0
        power = prime
        exponent = 1
        previous_two = 2
        previous_one = ap
        while power < exp_t:
            if bad:
                frobenius = ap**exponent
            elif exponent == 1:
                frobenius = ap
            else:
                frobenius = ap * previous_one - prime * previous_two
                previous_two, previous_one = previous_one, frobenius
            log_power = exponent * log_prime
            prime_terms.append(-(frobenius * log_prime / power) * (t_value - log_power))
            if power > bound // prime:
                break
            power *= prime
            exponent += 1
    terms = [smooth, archimedean, *prime_terms]
    numerator = fsum(terms)
    value = 2.0 * numerator / (t_value * t_value)
    absolute_sum = fsum(abs(term) for term in terms)
    rounding_error = (
        64.0 * 2.0**-52 * (1.0 + absolute_sum + abs(value)) / (t_value * t_value)
    )
    return value, rounding_error, bound


def analytic_rank_upper_bound(
    curve: Any,
    root_number: int,
    Delta: float | None = None,
    adaptive: bool = True,
) -> dict[str, Any]:
    """Return a GRH-conditional analytic-rank upper bound.

    The returned integer is conditional on the Generalized Riemann Hypothesis
    for the elliptic-curve L-function.  It may be strictly larger than the
    analytic rank.
    """
    conductor = int(curve.conductor())
    if Delta is None:
        maximum = min(
            (log(float(conductor + 1000)) / 2 - log(2 * pi) - 0.5772156649015329) / pi,
            2.5,
        )
    else:
        maximum = float(Delta)
    if maximum <= 0:
        raise ValueError("Delta must be positive")
    if root_number not in (-1, 1):
        raise ValueError("root number must be +1 or -1")
    parity = 0 if root_number == 1 else 1
    deltas = [maximum]
    if adaptive and maximum > 1:
        start = maximum
        while start > 1:
            start -= 0.2
        deltas = []
        current = start
        while current <= maximum + 1.0e-12:
            deltas.append(current)
            current += 0.2
    runs = []
    best: int | None = None
    for delta in deltas:
        value, rounding_error, cutoff = _zero_sum_value(curve, delta)
        if not isfinite(value):
            raise NumericalIndeterminacyError(
                "the zero-sum evaluation is nonfinite",
                {"Delta": delta, "value": value, "prime_cutoff": cutoff},
            )
        integer_bound = int(floor(value + rounding_error))
        if integer_bound % 2 != parity:
            integer_bound -= 1
        if integer_bound < parity:
            raise NumericalIndeterminacyError(
                "the zero-sum enclosure is incompatible with root-number parity",
                {
                    "Delta": delta,
                    "value": value,
                    "rounding_error": rounding_error,
                    "root_number": root_number,
                },
            )
        runs.append(
            {
                "Delta": delta,
                "value": value,
                "rounding_error": rounding_error,
                "prime_cutoff": cutoff,
                "bound": integer_bound,
            }
        )
        if best is None or integer_bound < best:
            best = integer_bound
        if integer_bound == parity:
            break
    return {
        "bound": best if best is not None else parity,
        "conditional_on_grh": True,
        "root_number": root_number,
        "runs": runs,
    }
