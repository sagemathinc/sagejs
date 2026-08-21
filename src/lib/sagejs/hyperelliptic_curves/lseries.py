"""Portable analytic L-functions of genus-2/3 hyperelliptic Jacobians.

For genus `g`, the canonical completion used here is

`Lambda(C,s) = A^s Gamma(s)^g L(C,s)`,
`A = sqrt(N)/(2*pi)^g`, and `Lambda(C,s)=w*Lambda(C,2-s)`.

The theta kernel is evaluated without an external L-function program.  If
`K_g` is the inverse Mellin transform of `Gamma(s)^g`, then

`Theta(t) = sum(a_n*K_g(n*t/A))`.

Rather than evaluating one Meijer-G value for every `(n,t)`, this module
computes the complete theta grid by a second inverse-Mellin trapezoid.  Each
vertical-grid value needs one ordinary Dirichlet polynomial, after which all
theta nodes are a small Fourier-type sum.  Independent coefficient and grid
refinement runs remain the numerical error witness.

The output is arbitrary-precision and functional-equation aware, but is not a
proof enclosure: inverse-Mellin and outer trapezoid errors are diagnosed by
refinement.  In particular, analytic ranks are explicitly probable.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from mpmath import mp

from .euler_products import reciprocal_local_coefficients

_LANCZOS_COEFFICIENTS = (
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    0.000009984369578019572,
    0.00000015056327351493116,
)


def _complex_gamma_machine(value: complex) -> complex:
    """Binary64 Lanczos gamma on the right half-plane used by the contour."""
    shifted = value - 1
    accumulator = complex(_LANCZOS_COEFFICIENTS[0])
    for index, coefficient in enumerate(_LANCZOS_COEFFICIENTS[1:], start=1):
        accumulator += coefficient / (shifted + index)
    tail = shifted + 7.5
    return (
        math.sqrt(2 * math.pi)
        * tail ** (shifted + 0.5)
        * cmath.exp(-tail)
        * accumulator
    )


class HyperellipticLseriesResourceError(ValueError):
    """A numerical plan exceeds a declared resource limit."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = dict(diagnostics)


class HyperellipticLseriesNumericalIndeterminacyError(ArithmeticError):
    """Nested numerical refinements do not determine the requested result."""


_CENTRAL_PLAN_CACHE: dict[tuple[int, int, int, int, bool], dict[str, Any]] = {}
_CENTRAL_WEIGHT_CACHE: dict[tuple[int, int, str, int], Any] = {}
_CENTRAL_CACHE_LIMIT = 256


def clear_central_weight_cache() -> None:
    """Clear bounded process-local central plan and reference-weight caches."""
    _CENTRAL_PLAN_CACHE.clear()
    _CENTRAL_WEIGHT_CACHE.clear()


def central_weight_cache_info() -> dict[str, int]:
    """Return inspectable process-local central cache sizes and limits."""
    return {
        "curve_plans": len(_CENTRAL_PLAN_CACHE),
        "reference_weights": len(_CENTRAL_WEIGHT_CACHE),
        "limit": _CENTRAL_CACHE_LIMIT,
    }


class GlobalCoefficientPrefix:
    """One extendable exact global Dirichlet-coefficient prefix."""

    def __init__(self, curve: Any) -> None:
        self.curve = curve
        self.values = [0, 1]
        self.extensions = 0
        self.backend_counts: dict[str, int] = {}
        self.bad_primes = {
            int(row.prime): tuple(int(value) for value in row.coefficients)
            for row in curve.global_reduction().local_data
        }

    @staticmethod
    def _smallest_prime_table(bound: int) -> list[int]:
        table = [0 for _index in range(bound + 1)]
        for prime in range(2, bound + 1):
            if table[prime] != 0:
                continue
            table[prime] = prime
            if prime <= bound // prime:
                for multiple in range(prime * prime, bound + 1, prime):
                    if table[multiple] == 0:
                        table[multiple] = prime
        return table

    def through(self, cutoff: int) -> list[int]:
        if cutoff < 1:
            cutoff = 1
        if cutoff < len(self.values):
            return self.values[: cutoff + 1]
        smallest = self._smallest_prime_table(cutoff)
        local: dict[int, tuple[Any, ...]] = {}
        for record in self.curve.local_data(2, cutoff, algorithm="auto"):
            prime = int(record.prime)
            if prime in self.bad_primes:
                coefficients = self.bad_primes[prime]
                backend = "certified-bad-reduction"
            elif record.available and record.coefficients is not None:
                coefficients = tuple(int(value) for value in record.coefficients)
                backend = record.backend
            else:
                raise ArithmeticError(
                    "a supposedly good prime has no certified Euler factor: p="
                    + str(prime)
                )
            self.backend_counts[backend] = self.backend_counts.get(backend, 0) + 1
            exponent = 0
            power = prime
            while power <= cutoff:
                exponent += 1
                if power > cutoff // prime:
                    break
                power *= prime
            local[prime] = reciprocal_local_coefficients(coefficients, exponent)
        values = [0, 1]
        for index in range(2, cutoff + 1):
            prime = smallest[index]
            remaining = index
            exponent = 0
            while remaining % prime == 0:
                remaining //= prime
                exponent += 1
            values.append(int(local[prime][exponent]) * values[remaining])
        self.values = values
        self.extensions += 1
        return self.values


def _checked_precision(value: Any) -> int:
    if isinstance(value, bool):
        raise TypeError("precision must be an integer")
    precision = int(value)
    if precision != value or precision < 16 or precision > 512:
        raise ValueError("precision must be an integer from 16 through 512")
    return precision


def _checked_order(value: Any, maximum: int = 32) -> int:
    if isinstance(value, bool):
        raise TypeError("derivative order must be an integer")
    order = int(value)
    if order != value or order < 0 or order > maximum:
        raise ValueError("derivative order is outside the supported range")
    return order


def _binomial(top: int, bottom: int) -> int:
    bottom = min(bottom, top - bottom)
    answer = 1
    for index in range(1, bottom + 1):
        answer = answer * (top - bottom + index) // index
    return answer


def _point_pair(field: Any, value: Any) -> tuple[str, str]:
    point = field(value)
    real_part = point.real()
    imaginary_part = point.imag()
    return str(real_part), str(imaginary_part)


def _serialized_complex(value: Any, digits: int = 50) -> tuple[str, str]:
    return str(mp.nstr(mp.re(value), digits)), str(mp.nstr(mp.im(value), digits))


def _deserialized_complex(value: Any) -> Any:
    return mp.mpc(value[0], value[1])


def _property(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def _ball_pair(value: Any) -> tuple[str, str]:
    return str(_property(value, "realMidpoint")), str(_property(value, "imagMidpoint"))


def _ball_diagnostics(value: Any) -> dict[str, Any]:
    return {
        "real_midpoint": str(_property(value, "realMidpoint")),
        "imaginary_midpoint": str(_property(value, "imagMidpoint")),
        "real_radius": str(_property(value, "realRadius")),
        "imaginary_radius": str(_property(value, "imagRadius")),
        "accuracy_bits": int(_property(value, "accuracyBits")),
    }


def _plan(
    conductor: int,
    genus: int,
    precision_bits: int,
    points: list[Any],
    *,
    fine: bool,
) -> dict[str, Any]:
    maximum_imaginary = max([abs(mp.im(point)) for point in points] + [mp.mpf(0)])
    maximum_real_offset = max([abs(mp.re(point) - 1) for point in points] + [mp.mpf(0)])
    work_bits = precision_bits + 48 + int(4 * maximum_imaginary)
    log_a = mp.log(conductor) / 2 - genus * mp.log(2 * mp.pi)
    demand = (precision_bits + 18) * mp.log(2)
    # The inverse Mellin kernel is asymptotic to a power times
    # exp(-g*x^(1/g)).  Start conservatively and compare against twice this
    # exact coefficient prefix in the final policy.
    cutoff = int(
        mp.ceil(
            max(
                64,
                2 * mp.sqrt(conductor) * (demand / (2 * mp.pi * genus)) ** genus,
            )
        )
    )
    if fine:
        cutoff *= 2
    inverse_step = mp.mpf("0.05" if fine else "0.1")
    inverse_height = (demand + (genus * mp.mpf("1.5") + 3) * mp.log(demand + 3) + 8) / (
        genus * mp.pi / 2
    )
    inverse_points = int(mp.ceil(inverse_height / inverse_step))
    outer_step = min(
        mp.mpf("0.05" if fine else "0.1"),
        mp.mpf("0.35" if fine else "0.7") / (maximum_imaginary + 1),
    )
    outer_height = max(
        mp.mpf(4),
        log_a + genus * mp.log((demand + maximum_real_offset * 8 + 8) / genus) + 2,
    )
    outer_points = int(mp.ceil(outer_height / outer_step))
    if cutoff > 2_000_000 or inverse_points > 4000 or outer_points > 20000:
        raise HyperellipticLseriesResourceError(
            "the hyperelliptic L-series plan exceeds resource limits",
            {
                "cutoff": cutoff,
                "inverse_mellin_points": inverse_points,
                "outer_points": outer_points,
            },
        )
    return {
        "precision_bits": precision_bits,
        "work_precision_bits": work_bits,
        "cutoff": cutoff,
        "inverse_mellin_step": inverse_step,
        "inverse_mellin_points": inverse_points,
        "outer_step": outer_step,
        "outer_points": outer_points,
        "log_a": log_a,
    }


def _theta_grid(
    coefficients: list[int],
    genus: int,
    plan: dict[str, Any],
) -> tuple[list[Any], list[Any], int]:
    cutoff = int(plan["cutoff"])
    values = coefficients[1 : cutoff + 1]
    if int(plan["precision_bits"]) <= 53:
        return _theta_grid_machine(values, genus, plan)
    logarithms = [mp.log(index) for index in range(1, cutoff + 1)]
    inverse_step = mp.mpf(plan["inverse_mellin_step"])
    inverse_points = int(plan["inverse_mellin_points"])
    contour = mp.mpf(2)
    q_values = []
    base_values = []
    coefficient_terms = 0
    for index in range(inverse_points + 1):
        height = inverse_step * index
        q_value = mp.mpc(contour, height)
        dirichlet = mp.fsum(
            coefficient * mp.exp(-q_value * logarithm)
            for coefficient, logarithm in zip(values, logarithms, strict=True)
            if coefficient != 0
        )
        base = (
            mp.gamma(q_value) ** genus
            * mp.exp(q_value * mp.mpf(plan["log_a"]))
            * dirichlet
        )
        if index == inverse_points:
            base /= 2
        q_values.append(q_value)
        base_values.append(base)
        coefficient_terms += len(values)
    outer_step = mp.mpf(plan["outer_step"])
    outer_points = int(plan["outer_points"])
    arguments = [outer_step * index for index in range(outer_points + 1)]
    theta_values = []
    scale = inverse_step / (2 * mp.pi)
    for argument in arguments:
        total = base_values[0] * mp.exp(-q_values[0] * argument)
        for q_value, base in zip(q_values[1:], base_values[1:], strict=True):
            total += 2 * mp.re(base * mp.exp(-q_value * argument))
        theta_values.append(mp.re(scale * total))
    return arguments, theta_values, coefficient_terms


def _theta_grid_machine(
    values: list[int], genus: int, plan: dict[str, Any]
) -> tuple[list[Any], list[Any], int]:
    """Evaluate the expensive Fourier sums with binary64 arithmetic."""
    logarithms = [math.log(index) for index in range(1, len(values) + 1)]
    inverse_step = float(plan["inverse_mellin_step"])
    inverse_points = int(plan["inverse_mellin_points"])
    log_a = float(plan["log_a"])
    dirichlet_real = [0.0 for _index in range(inverse_points + 1)]
    dirichlet_imaginary = [0.0 for _index in range(inverse_points + 1)]
    for coefficient, logarithm in zip(values, logarithms, strict=True):
        if coefficient == 0:
            continue
        angle = -inverse_step * logarithm
        step_real = math.cos(angle)
        step_imaginary = math.sin(angle)
        phase_real = 1.0
        phase_imaginary = 0.0
        amplitude = coefficient * math.exp(-2 * logarithm)
        for index in range(inverse_points + 1):
            dirichlet_real[index] += amplitude * phase_real
            dirichlet_imaginary[index] += amplitude * phase_imaginary
            next_real = phase_real * step_real - phase_imaginary * step_imaginary
            phase_imaginary = phase_real * step_imaginary + phase_imaginary * step_real
            phase_real = next_real
    q_values = []
    base_values = []
    for index in range(inverse_points + 1):
        q_value = complex(2, inverse_step * index)
        dirichlet = complex(dirichlet_real[index], dirichlet_imaginary[index])
        gamma_machine = _complex_gamma_machine(q_value)
        base = gamma_machine**genus * cmath.exp(q_value * log_a) * dirichlet
        if index == inverse_points:
            base /= 2
        q_values.append(q_value)
        base_values.append(base)
    outer_step = float(plan["outer_step"])
    outer_points = int(plan["outer_points"])
    arguments = [outer_step * index for index in range(outer_points + 1)]
    scale = inverse_step / (2 * math.pi)
    theta_values = []
    for argument in arguments:
        total = base_values[0] * cmath.exp(-q_values[0] * argument)
        for q_value, base in zip(q_values[1:], base_values[1:], strict=True):
            total += 2 * (base * cmath.exp(-q_value * argument)).real
        theta_values.append(float((scale * total).real))
    return arguments, theta_values, (inverse_points + 1) * len(values)


def _completed_derivatives_from_grid(
    points: list[Any],
    maximum_order: int,
    root_number: int,
    arguments: list[Any],
    theta_values: list[Any],
    outer_step: Any,
) -> list[list[Any]]:
    machine = bool(theta_values) and isinstance(theta_values[0], float)
    answer = []
    for point in points:
        machine_point = complex(float(mp.re(point)), float(mp.im(point)))
        derivatives = []
        for order in range(maximum_order + 1):
            terms = []
            for index, (argument, theta) in enumerate(
                zip(arguments, theta_values, strict=True)
            ):
                if machine:
                    weight = 0.5 if index in (0, len(arguments) - 1) else 1.0
                else:
                    weight = mp.mpf("0.5") if index in (0, len(arguments) - 1) else 1
                if machine:
                    exponential = cmath.exp(machine_point * argument) + root_number * (
                        -1
                    ) ** order * cmath.exp((2 - machine_point) * argument)
                else:
                    exponential = mp.exp(point * argument) + root_number * (
                        -1
                    ) ** order * mp.exp((2 - point) * argument)
                terms.append(weight * theta * argument**order * exponential)
            total = sum(terms) if machine else mp.fsum(terms)
            derivatives.append(outer_step * total)
        answer.append(derivatives)
    return answer


def _raw_derivatives(
    completed: list[Any], point: Any, conductor: int, genus: int
) -> list[Any]:
    log_a = mp.log(conductor) / 2 - genus * mp.log(2 * mp.pi)

    def inverse_gamma_factor(value: Any) -> Any:
        return mp.exp(-value * log_a) * mp.rgamma(value) ** genus

    inverse_derivatives = [
        mp.diff(inverse_gamma_factor, point, order) for order in range(len(completed))
    ]
    answer = []
    for order in range(len(completed)):
        answer.append(
            mp.fsum(
                _binomial(order, index)
                * inverse_derivatives[index]
                * completed[order - index]
                for index in range(order + 1)
            )
        )
    return answer


def central_kernel(genus: Any, x: Any, prec: Any = 53) -> Any:
    """Return the inverse Mellin kernel `K_g(x)` for genus 2 or 3.

    Genus 2 uses the closed Bessel formula.  Genus 3 uses a readable vertical
    inverse-Mellin integral and is intended as a differential oracle, not the
    production central evaluator.
    """
    genus_value = int(genus)
    bits = _checked_precision(prec)
    if genus_value not in (2, 3):
        raise ValueError("the central kernel currently supports genus 2 or 3")
    with mp.workprec(bits + 48):
        argument = mp.mpf(x)
        if argument <= 0:
            raise ValueError("the central-kernel argument must be positive")
        if genus_value == 2:
            return 2 * mp.besselk(0, 2 * mp.sqrt(argument))
        real_part = mp.mpf(2)

        def integrand(height: Any) -> Any:
            point = mp.mpc(real_part, height)
            return mp.re(mp.gamma(point) ** genus_value * argument ** (-point))

        return mp.quad(integrand, [0, mp.inf]) / mp.pi


def central_weight(genus: Any, order: Any, x: Any, prec: Any = 53) -> Any:
    """Return the universal logarithmic central weight `W_(g,k)(x)`.

    The genus-2 order-zero case is evaluated by
    `2*K_1(2*sqrt(x))/sqrt(x)`.  Other cases use the defining single Mellin
    contour and are cached as high-precision reference values.
    """
    genus_value = int(genus)
    order_value = _checked_order(order)
    bits = _checked_precision(prec)
    if genus_value not in (2, 3):
        raise ValueError("central weights currently support genus 2 or 3")
    with mp.workprec(bits + 64):
        argument = mp.mpf(x)
        if argument <= 0:
            raise ValueError("the central-weight argument must be positive")
        key = (
            genus_value,
            order_value,
            str(mp.nstr(argument, bits // 3 + 12)),
            bits,
        )
        cached = _CENTRAL_WEIGHT_CACHE.get(key)
        if cached is not None:
            return +cached
        if genus_value == 2 and order_value == 0:
            result = 2 * mp.besselk(1, 2 * mp.sqrt(argument)) / mp.sqrt(argument)
        else:
            real_part = mp.mpf(2)
            factorial = mp.factorial(order_value)

            def integrand(height: Any) -> Any:
                point = mp.mpc(real_part, height)
                return mp.re(
                    mp.gamma(point) ** genus_value
                    * argument ** (-point)
                    * factorial
                    / (point - 1) ** (order_value + 1)
                )

            result = mp.quad(integrand, [0, mp.inf]) / mp.pi
        if len(_CENTRAL_WEIGHT_CACHE) >= _CENTRAL_CACHE_LIMIT:
            del _CENTRAL_WEIGHT_CACHE[next(iter(_CENTRAL_WEIGHT_CACHE))]
        _CENTRAL_WEIGHT_CACHE[key] = +result
        return +result


def _central_weight_plan(
    conductor: int,
    genus: int,
    precision_bits: int,
    maximum_derivative: int,
    *,
    fine: bool,
) -> dict[str, Any]:
    """Plan the one-dimensional central-weight contour.

    The identity

    `W_(g,k)(x) = k!/(2*pi*i) integral Gamma(s)^g*x^-s/(s-1)^(k+1) ds`

    turns the central jet into one vertical-contour Dirichlet-polynomial
    calculation.  This is deliberately independent of the two-dimensional
    theta grid retained below as a differential oracle.
    """
    cache_key = (conductor, genus, precision_bits, maximum_derivative, fine)
    cached = _CENTRAL_PLAN_CACHE.get(cache_key)
    if cached is not None:
        return dict(cached)
    conductor_value = mp.mpf(conductor)
    demand = (precision_bits + 18) * mp.log(2)
    cutoff = int(
        mp.ceil(
            max(
                64,
                2 * mp.sqrt(conductor_value) * (demand / (2 * mp.pi * genus)) ** genus,
            )
        )
    )
    cutoff = int(mp.ceil(cutoff * max(mp.mpf(1), precision_bits / mp.mpf(64))))
    cutoff = int(mp.ceil(cutoff))
    # The closest singularity to Re(s)=2 is the pole at s=1 introduced by
    # the integrated central weight.  The trapezoid error therefore decays
    # geometrically like exp(-2*pi/h).  The extra logarithmic bandwidth term
    # resolves x=n/A through the requested coefficient cutoff.
    log_a = mp.log(conductor_value) / 2 - genus * mp.log(2 * mp.pi)
    bandwidth = max(mp.mpf(1), abs(mp.log(cutoff) - log_a))
    denominator = demand + bandwidth + 12 + maximum_derivative * mp.log(demand + 3)
    step = 4 * mp.pi / denominator
    if not fine:
        step *= mp.mpf("1.1")
    height = (demand + (genus * mp.mpf("1.5") + 3) * mp.log(demand + 3) + 8) / (
        genus * mp.pi / 2
    )
    points = int(mp.ceil(height / step))
    if cutoff > 2_000_000 or points > 8000 or cutoff * (points + 1) > 200_000_000:
        raise HyperellipticLseriesResourceError(
            "the hyperelliptic central-weight plan exceeds resource limits",
            {
                "cutoff": cutoff,
                "contour_points": points,
                "contour_step": str(step),
            },
        )
    result = {
        "precision_bits": precision_bits,
        "work_precision_bits": precision_bits + 80,
        "cutoff": cutoff,
        "contour_step": step,
        "contour_points": points,
        "contour_height": step * points,
        "contour_real_part": 2,
        "log_a": log_a,
    }
    if len(_CENTRAL_PLAN_CACHE) >= 64:
        del _CENTRAL_PLAN_CACHE[next(iter(_CENTRAL_PLAN_CACHE))]
    _CENTRAL_PLAN_CACHE[cache_key] = dict(result)
    return result


def _central_weight_contour(
    coefficients: list[int],
    genus: int,
    root_number: int,
    maximum_derivative: int,
    plan: dict[str, Any],
) -> tuple[list[Any], int]:
    """Evaluate completed central derivatives from their Mellin weights."""
    cutoff = int(plan["cutoff"])
    logarithms = [mp.log(index) for index in range(1, cutoff + 1)]
    values = coefficients[1 : cutoff + 1]
    step = mp.mpf(plan["contour_step"])
    contour_points = int(plan["contour_points"])
    log_a = mp.mpf(plan["log_a"])
    totals = [mp.mpf(0) for _order in range(maximum_derivative + 1)]
    factorials = [mp.factorial(order) for order in range(maximum_derivative + 1)]
    coefficient_terms = 0
    for index in range(contour_points + 1):
        height = step * index
        point = mp.mpc(2, height)
        dirichlet = mp.fsum(
            coefficient * mp.exp(-point * logarithm)
            for coefficient, logarithm in zip(values, logarithms, strict=True)
            if coefficient != 0
        )
        base = mp.gamma(point) ** genus * mp.exp(point * log_a) * dirichlet
        endpoint_weight = mp.mpf("0.5") if index in (0, contour_points) else 1
        denominator = point - 1
        denominator_power = denominator
        for order in range(maximum_derivative + 1):
            parity_factor = 1 + root_number * (-1) ** order
            if parity_factor:
                totals[order] += (
                    endpoint_weight
                    * parity_factor
                    * factorials[order]
                    * mp.re(base / denominator_power)
                )
            denominator_power *= denominator
        coefficient_terms += cutoff
    scale = step / mp.pi
    return [scale * value for value in totals], coefficient_terms


def central_weight_values(
    curve: Any,
    precision_bits: int,
    coefficient_prefix: GlobalCoefficientPrefix,
    maximum_derivative: int = 0,
) -> dict[str, Any]:
    """Evaluate the central jet with cached-weight contour identities."""
    precision_bits = _checked_precision(precision_bits)
    maximum_derivative = _checked_order(maximum_derivative)
    genus = int(curve.genus())
    conductor = int(curve.conductor())
    root_number = int(curve.root_number())
    with mp.workprec(precision_bits + 96):
        coarse_plan = _central_weight_plan(
            conductor,
            genus,
            precision_bits,
            maximum_derivative,
            fine=False,
        )
        fine_plan = _central_weight_plan(
            conductor,
            genus,
            precision_bits,
            maximum_derivative,
            fine=True,
        )
        coefficients = coefficient_prefix.through(int(fine_plan["cutoff"]))
        coarse_completed, coarse_terms = _central_weight_contour(
            coefficients[: int(coarse_plan["cutoff"]) + 1],
            genus,
            root_number,
            maximum_derivative,
            coarse_plan,
        )
        fine_completed, fine_terms = _central_weight_contour(
            coefficients,
            genus,
            root_number,
            maximum_derivative,
            fine_plan,
        )
        point = mp.mpf(1)
        raw = _raw_derivatives(fine_completed, point, conductor, genus)
        coarse_raw = _raw_derivatives(coarse_completed, point, conductor, genus)
        maximum_difference = mp.mpf(0)
        maximum_relative_difference = mp.mpf(0)
        for left, right in zip(coarse_raw, raw, strict=True):
            maximum_difference = max(maximum_difference, abs(right - left))
            maximum_relative_difference = max(
                maximum_relative_difference,
                abs(right - left) / max(1, abs(right)),
            )
        return {
            "algorithm": "central-mellin-weights",
            "status": "ok",
            "precision_bits": precision_bits,
            "work_precision_bits": int(fine_plan["work_precision_bits"]),
            "conductor": conductor,
            "root_number": root_number,
            "genus": genus,
            "cutoff": int(fine_plan["cutoff"]),
            "coarse_cutoff": int(coarse_plan["cutoff"]),
            "contour_points": int(fine_plan["contour_points"]),
            "contour_step": mp.nstr(fine_plan["contour_step"], 30),
            "coefficient_terms": fine_terms + coarse_terms,
            "coefficient_backend_counts": dict(coefficient_prefix.backend_counts),
            "coefficient_prefix_extensions": coefficient_prefix.extensions,
            "values": [
                {
                    "s_real": "1",
                    "s_imag": "0",
                    "raw_derivatives": tuple(
                        _serialized_complex(value) for value in raw
                    ),
                    "completed_derivatives": tuple(
                        _serialized_complex(value) for value in fine_completed
                    ),
                    "coarse_raw_derivatives": tuple(
                        _serialized_complex(value) for value in coarse_raw
                    ),
                    "coarse_completed_derivatives": tuple(
                        _serialized_complex(value) for value in coarse_completed
                    ),
                }
            ],
            "refinement_difference": mp.nstr(maximum_difference, 30),
            "refinement_relative_difference": mp.nstr(maximum_relative_difference, 30),
            "refinement_stable": maximum_relative_difference
            <= mp.power(2, -max(12, precision_bits // 2)),
            "rigorous": False,
            "analytic_error_status": (
                "coefficient and central-contour truncation checked by "
                "independent nested refinement"
            ),
        }


def lseries_values(
    curve: Any,
    point_pairs: list[tuple[str, str]],
    precision_bits: int,
    coefficient_prefix: GlobalCoefficientPrefix,
    maximum_derivative: int = 0,
) -> dict[str, Any]:
    """Evaluate raw/completed derivatives with nested independent grids."""
    precision_bits = _checked_precision(precision_bits)
    maximum_derivative = _checked_order(maximum_derivative)
    genus = int(curve.genus())
    conductor = int(curve.conductor())
    root_number = int(curve.root_number())
    with mp.workprec(precision_bits + 96):
        points = [mp.mpc(real, imaginary) for real, imaginary in point_pairs]
        coarse_plan = _plan(conductor, genus, precision_bits, points, fine=False)
        fine_plan = _plan(conductor, genus, precision_bits, points, fine=True)
        coefficients = coefficient_prefix.through(int(fine_plan["cutoff"]))
        coarse_arguments, coarse_theta, coarse_terms = _theta_grid(
            coefficients[: int(coarse_plan["cutoff"]) + 1], genus, coarse_plan
        )
        fine_arguments, fine_theta, fine_terms = _theta_grid(
            coefficients, genus, fine_plan
        )
        coarse_completed = _completed_derivatives_from_grid(
            points,
            maximum_derivative,
            root_number,
            coarse_arguments,
            coarse_theta,
            coarse_plan["outer_step"],
        )
        fine_completed = _completed_derivatives_from_grid(
            points,
            maximum_derivative,
            root_number,
            fine_arguments,
            fine_theta,
            fine_plan["outer_step"],
        )
        values = []
        maximum_difference = mp.mpf(0)
        maximum_relative_difference = mp.mpf(0)
        for point, coarse_jet, fine_jet in zip(
            points, coarse_completed, fine_completed, strict=True
        ):
            raw = _raw_derivatives(fine_jet, point, conductor, genus)
            coarse_raw = _raw_derivatives(coarse_jet, point, conductor, genus)
            for left, right in zip(coarse_raw, raw, strict=True):
                maximum_difference = max(maximum_difference, abs(right - left))
                maximum_relative_difference = max(
                    maximum_relative_difference,
                    abs(right - left) / max(1, abs(right)),
                )
            values.append(
                {
                    "s_real": mp.nstr(mp.re(point), 40),
                    "s_imag": mp.nstr(mp.im(point), 40),
                    "raw_derivatives": tuple(
                        _serialized_complex(value) for value in raw
                    ),
                    "completed_derivatives": tuple(
                        _serialized_complex(value) for value in fine_jet
                    ),
                    "coarse_completed_derivatives": tuple(
                        _serialized_complex(value) for value in coarse_jet
                    ),
                    "coarse_raw_derivatives": tuple(
                        _serialized_complex(value) for value in coarse_raw
                    ),
                }
            )
        return {
            "algorithm": "inverse-mellin-theta",
            "status": "ok",
            "precision_bits": precision_bits,
            "work_precision_bits": int(fine_plan["work_precision_bits"]),
            "conductor": conductor,
            "root_number": root_number,
            "genus": genus,
            "cutoff": int(fine_plan["cutoff"]),
            "coarse_cutoff": int(coarse_plan["cutoff"]),
            "inverse_mellin_points": int(fine_plan["inverse_mellin_points"]),
            "outer_points": int(fine_plan["outer_points"]),
            "coefficient_terms": fine_terms + coarse_terms,
            "coefficient_backend_counts": dict(coefficient_prefix.backend_counts),
            "coefficient_prefix_extensions": coefficient_prefix.extensions,
            "values": values,
            "refinement_difference": mp.nstr(maximum_difference, 30),
            "refinement_relative_difference": mp.nstr(maximum_relative_difference, 30),
            "refinement_stable": maximum_relative_difference
            <= mp.power(2, -max(12, precision_bits // 2)),
            "rigorous": False,
            "analytic_error_status": (
                "coefficient/inverse-Mellin/outer-grid errors estimated by "
                "independent nested refinement"
            ),
        }


def native_lseries_values(
    curve: Any,
    point_pairs: list[tuple[str, str]],
    precision_bits: int,
    coefficient_prefix: GlobalCoefficientPrefix,
    maximum_derivative: int = 0,
) -> dict[str, Any] | None:
    """Evaluate the same double-Mellin grid with FLINT Arb/Acb.

    The returned balls enclose native arithmetic roundoff.  The inverse-Mellin
    and outer trapezoid errors are still witnessed by an independently chosen
    coarse grid, so this boundary deliberately does not claim a fully rigorous
    analytic enclosure.
    """
    try:
        backend = runtime.flint_backend()
        function = _property(backend, "hyperellipticLseriesValues")
        if function is runtime.undefined:
            return None
        conductor = runtime.bigint(int(curve.conductor()))
        root_number = int(curve.root_number())
        genus = int(curve.genus())
        arguments: list[Any] = [
            conductor,
            root_number,
            genus,
            [0, 1],
            [list(pair) for pair in point_pairs],
            precision_bits,
            maximum_derivative,
        ]
        planned = runtime.reflect.apply(function, backend, arguments)
        required = int(_property(planned, "requiredCutoff"))
        coefficients = coefficient_prefix.through(required)
        if any(value < -(2**31) or value > 2**31 - 1 for value in coefficients):
            return None
        arguments[3] = coefficients
        native = runtime.reflect.apply(function, backend, arguments)
        if str(_property(native, "status")) != "ok":
            raise HyperellipticLseriesResourceError(
                "the native hyperelliptic L-series coefficient plan was not satisfied",
                {"required_cutoff": required},
            )
        values = []
        native_values = _property(native, "values")
        ball_rows = []
        for point_index in range(len(point_pairs)):
            row = native_values[point_index]
            raw = _property(row, "rawDerivatives")
            completed = _property(row, "completedDerivatives")
            coarse_raw = _property(row, "coarseRawDerivatives")
            coarse_completed = _property(row, "coarseCompletedDerivatives")
            raw_pairs = tuple(_ball_pair(raw[index]) for index in range(len(raw)))
            completed_pairs = tuple(
                _ball_pair(completed[index]) for index in range(len(completed))
            )
            coarse_raw_pairs = tuple(
                _ball_pair(coarse_raw[index]) for index in range(len(coarse_raw))
            )
            coarse_completed_pairs = tuple(
                _ball_pair(coarse_completed[index])
                for index in range(len(coarse_completed))
            )
            values.append(
                {
                    "s_real": point_pairs[point_index][0],
                    "s_imag": point_pairs[point_index][1],
                    "raw_derivatives": raw_pairs,
                    "completed_derivatives": completed_pairs,
                    "coarse_raw_derivatives": coarse_raw_pairs,
                    "coarse_completed_derivatives": coarse_completed_pairs,
                }
            )
            ball_rows.append(
                {
                    "raw": tuple(
                        _ball_diagnostics(raw[index]) for index in range(len(raw))
                    ),
                    "completed": tuple(
                        _ball_diagnostics(completed[index])
                        for index in range(len(completed))
                    ),
                }
            )
        return {
            "algorithm": "native-arb-double-mellin",
            "status": "ok",
            "precision_bits": precision_bits,
            "work_precision_bits": int(_property(native, "workPrecisionBits")),
            "conductor": int(curve.conductor()),
            "root_number": root_number,
            "genus": genus,
            "cutoff": int(_property(native, "requiredCutoff")),
            "coarse_cutoff": int(_property(native, "coarseCutoff")),
            "inverse_mellin_points": int(_property(native, "inverseMellinPoints")),
            "outer_points": int(_property(native, "outerPoints")),
            "coefficient_backend_counts": dict(coefficient_prefix.backend_counts),
            "coefficient_prefix_extensions": coefficient_prefix.extensions,
            "values": values,
            "balls": tuple(ball_rows),
            "refinement_difference": "not-materialized",
            "refinement_relative_difference": str(
                _property(native, "refinementRelativeDifference")
            ),
            "refinement_stable": bool(_property(native, "refinementStable")),
            "rigorous": False,
            "arithmetic_balls_rigorous": True,
            "analytic_error_status": str(_property(native, "analyticErrorStatus")),
        }
    except (HyperellipticLseriesResourceError, ArithmeticError):
        raise
    except Exception:
        return None


def native_central_weight_values(
    curve: Any,
    precision_bits: int,
    coefficient_prefix: GlobalCoefficientPrefix,
    maximum_derivative: int = 0,
) -> dict[str, Any] | None:
    """Evaluate the one-contour central weights with FLINT Arb/Acb."""
    try:
        backend = runtime.flint_backend()
        function = _property(backend, "hyperellipticCentralWeights")
        if function is runtime.undefined:
            return None
        conductor = runtime.bigint(int(curve.conductor()))
        root_number = int(curve.root_number())
        genus = int(curve.genus())
        arguments: list[Any] = [
            conductor,
            root_number,
            genus,
            [0, 1],
            precision_bits,
            maximum_derivative,
        ]
        planned = runtime.reflect.apply(function, backend, arguments)
        required = int(_property(planned, "requiredCutoff"))
        coefficients = coefficient_prefix.through(required)
        if any(value < -(2**31) or value > 2**31 - 1 for value in coefficients):
            return None
        arguments[3] = coefficients
        native = runtime.reflect.apply(function, backend, arguments)
        if str(_property(native, "status")) != "ok":
            raise HyperellipticLseriesResourceError(
                "the native central-weight coefficient plan was not satisfied",
                {"required_cutoff": required},
            )
        raw = _property(native, "rawDerivatives")
        completed = _property(native, "completedDerivatives")
        coarse_raw = _property(native, "coarseRawDerivatives")
        coarse_completed = _property(native, "coarseCompletedDerivatives")
        raw_pairs = tuple(_ball_pair(raw[index]) for index in range(len(raw)))
        completed_pairs = tuple(
            _ball_pair(completed[index]) for index in range(len(completed))
        )
        coarse_raw_pairs = tuple(
            _ball_pair(coarse_raw[index]) for index in range(len(coarse_raw))
        )
        coarse_completed_pairs = tuple(
            _ball_pair(coarse_completed[index])
            for index in range(len(coarse_completed))
        )
        return {
            "algorithm": "native-arb-central-mellin-weights",
            "status": "ok",
            "precision_bits": precision_bits,
            "work_precision_bits": int(_property(native, "workPrecisionBits")),
            "conductor": int(curve.conductor()),
            "root_number": root_number,
            "genus": genus,
            "cutoff": int(_property(native, "requiredCutoff")),
            "coarse_cutoff": int(_property(native, "coarseCutoff")),
            "contour_points": int(_property(native, "contourPoints")),
            "coarse_contour_points": int(_property(native, "coarseContourPoints")),
            "contour_step": str(_property(native, "contourStep")),
            "coefficient_terms": int(_property(native, "coefficientTerms")),
            "coefficient_backend_counts": dict(coefficient_prefix.backend_counts),
            "coefficient_prefix_extensions": coefficient_prefix.extensions,
            "values": [
                {
                    "s_real": "1",
                    "s_imag": "0",
                    "raw_derivatives": raw_pairs,
                    "completed_derivatives": completed_pairs,
                    "coarse_raw_derivatives": coarse_raw_pairs,
                    "coarse_completed_derivatives": coarse_completed_pairs,
                }
            ],
            "balls": (
                {
                    "raw": tuple(
                        _ball_diagnostics(raw[index]) for index in range(len(raw))
                    ),
                    "completed": tuple(
                        _ball_diagnostics(completed[index])
                        for index in range(len(completed))
                    ),
                },
            ),
            "refinement_difference": "not-materialized",
            "refinement_relative_difference": str(
                _property(native, "refinementRelativeDifference")
            ),
            "refinement_stable": bool(_property(native, "refinementStable")),
            "rigorous": False,
            "arithmetic_balls_rigorous": True,
            "analytic_error_status": str(_property(native, "analyticErrorStatus")),
        }
    except (HyperellipticLseriesResourceError, ArithmeticError):
        raise
    except Exception:
        return None


def _pairs_are_central(point_pairs: list[tuple[str, str]]) -> bool:
    if len(point_pairs) != 1:
        return False
    with mp.workprec(80):
        return mp.mpf(point_pairs[0][0]) == 1 and mp.mpf(point_pairs[0][1]) == 0


class HyperellipticLSeries:
    """Numerical Hasse--Weil L-function of a genus-2/3 Jacobian."""

    def __init__(
        self, curve: Any, coefficient_prefix: GlobalCoefficientPrefix | None = None
    ) -> None:
        self._curve = curve
        self._coefficient_prefix = (
            GlobalCoefficientPrefix(curve)
            if coefficient_prefix is None
            else coefficient_prefix
        )
        self._last_diagnostics: Any = None
        self._evaluation_cache: dict[tuple[Any, ...], dict[str, Any]] = {}

    def __repr__(self) -> str:
        return "L-series of " + repr(self._curve)

    def curve(self) -> Any:
        """Return the hyperelliptic curve defining this L-series."""
        return self._curve

    def _evaluate(
        self,
        points: list[Any],
        precision: Any,
        maximum_derivative: int = 0,
        algorithm: str = "auto",
    ) -> tuple[dict[str, Any], int]:
        bits = _checked_precision(precision)
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(bits)
        pairs = [_point_pair(complex_field, point) for point in points]
        if algorithm not in ("auto", "native", "reference", "inverse_mellin"):
            raise ValueError(
                "algorithm must be 'auto', 'native', 'reference', or 'inverse_mellin'"
            )
        central = _pairs_are_central(pairs)
        cache_key = (
            tuple(pairs),
            bits,
            int(maximum_derivative),
            algorithm,
        )
        cached = self._evaluation_cache.get(cache_key)
        if cached is not None:
            self._last_diagnostics = cached
            return cached, bits
        result = None
        if central and algorithm != "inverse_mellin":
            if algorithm != "reference":
                result = native_central_weight_values(
                    self._curve,
                    bits,
                    self._coefficient_prefix,
                    maximum_derivative,
                )
                if result is None and algorithm == "native":
                    raise NotImplementedError(
                        "the native Arb central-weight backend is unavailable"
                    )
            if result is None:
                result = central_weight_values(
                    self._curve,
                    bits,
                    self._coefficient_prefix,
                    maximum_derivative,
                )
        elif algorithm != "reference":
            result = native_lseries_values(
                self._curve,
                pairs,
                bits,
                self._coefficient_prefix,
                maximum_derivative,
            )
            if result is None and algorithm == "native":
                raise NotImplementedError(
                    "the native Arb hyperelliptic L-series backend is unavailable"
                )
        if result is None:
            result = lseries_values(
                self._curve,
                pairs,
                bits,
                self._coefficient_prefix,
                maximum_derivative,
            )
        if not result["refinement_stable"]:
            raise HyperellipticLseriesNumericalIndeterminacyError(
                "the hyperelliptic L-series refinement did not stabilize"
            )
        if len(self._evaluation_cache) >= 32:
            first_key = next(iter(self._evaluation_cache))
            del self._evaluation_cache[first_key]
        self._evaluation_cache[cache_key] = result
        self._last_diagnostics = result
        return result, bits

    @staticmethod
    def _coerce(value: Any, precision: int) -> Any:
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            precision
        )
        return complex_field(value[0], value[1])

    def __call__(self, s: Any) -> Any:
        return self.value(s)

    def value(self, s: Any, prec: Any = 53, algorithm: str = "auto") -> Any:
        """Return a probable numerical value of `L(C,s)`."""
        result, bits = self._evaluate([s], prec, algorithm=algorithm)
        return self._coerce(result["values"][0]["raw_derivatives"][0], bits)

    def values(self, points: Any, prec: Any = 53, algorithm: str = "auto") -> Any:
        """Evaluate several points using one coefficient prefix and theta grid."""
        point_list = list(points)
        if not point_list:
            return []
        result, bits = self._evaluate(point_list, prec, algorithm=algorithm)
        return [
            self._coerce(record["raw_derivatives"][0], bits)
            for record in result["values"]
        ]

    def completed_value(self, s: Any, prec: Any = 53, algorithm: str = "auto") -> Any:
        """Return the canonical completed value `Lambda(C,s)`."""
        result, bits = self._evaluate([s], prec, algorithm=algorithm)
        return self._coerce(result["values"][0]["completed_derivatives"][0], bits)

    def derivative(
        self, s: Any, order: Any = 1, prec: Any = 53, algorithm: str = "auto"
    ) -> Any:
        """Return the indicated derivative of the raw L-function."""
        derivative_order = _checked_order(order)
        result, bits = self._evaluate([s], prec, derivative_order, algorithm)
        return self._coerce(
            result["values"][0]["raw_derivatives"][derivative_order], bits
        )

    def analytic_rank(
        self,
        *,
        algorithm: str = "auto",
        leading_coefficient: bool = False,
        prec: Any = 53,
        max_order: Any = 12,
    ) -> Any:
        """Return the probable order of vanishing at the central point."""
        maximum = _checked_order(max_order)
        result, bits = self._evaluate([1], prec, maximum, algorithm)
        completed = [
            _deserialized_complex(value)
            for value in result["values"][0]["completed_derivatives"]
        ]
        coarse_completed = [
            _deserialized_complex(value)
            for value in result["values"][0]["coarse_completed_derivatives"]
        ]
        parity = 0 if int(self._curve.root_number()) == 1 else 1
        rank = None
        for order in range(parity, maximum + 1, 2):
            value = completed[order]
            coarse_value = coarse_completed[order]
            uncertainty = max(
                abs(value - coarse_value),
                mp.power(2, -max(16, bits // 2)) * max(1, abs(value)),
            )
            if abs(value) > 16 * uncertainty:
                rank = order
                break
        if rank is None:
            raise HyperellipticLseriesNumericalIndeterminacyError(
                "no nonzero central derivative was isolated through order "
                + str(maximum)
            )
        if not leading_coefficient:
            return sage.ZZ(rank)
        with mp.workprec(bits + 32):
            scale = mp.sqrt(int(self._curve.conductor())) / (2 * mp.pi) ** int(
                self._curve.genus()
            )
            leading = completed[rank] / scale
        return sage.ZZ(rank), self._coerce(_serialized_complex(leading), bits)

    def check_functional_equation(self, prec: Any = 53) -> Any:
        """Return a numerical residual for `Lambda(s)=w Lambda(2-s)`."""
        bits = _checked_precision(prec)
        point = runtime.reflect.get(runtime.global_object, "ComplexField")(bits)(
            "1.271828", "0.314159"
        )
        result, bits = self._evaluate([point, 2 - point], bits)
        left = self._coerce(result["values"][0]["completed_derivatives"][0], bits)
        right = self._coerce(result["values"][1]["completed_derivatives"][0], bits)
        return left - self._curve.root_number() * right

    def coefficients(self, bound: Any) -> Any:
        """Return exact global Dirichlet coefficients `[a_0,...,a_bound]`."""
        cutoff = int(bound)
        if cutoff < 1 or cutoff != bound:
            raise ValueError("coefficient bound must be a positive integer")
        return [sage.ZZ(value) for value in self._coefficient_prefix.through(cutoff)]

    def init(
        self,
        *,
        prec: Any = 53,
        max_order: Any = 6,
        domain: Any = None,
        algorithm: str = "auto",
    ) -> Any:
        """Return a prepared reusable evaluator for this `L`-function."""
        return LFunctionInit(
            self,
            prec=prec,
            max_order=max_order,
            domain=domain,
            algorithm=algorithm,
        )

    def central_jet(
        self,
        max_order: Any = 6,
        *,
        completed: bool = False,
        prec: Any = 53,
        algorithm: str = "auto",
    ) -> Any:
        """Return derivatives through `max_order` at the central point.

        With the native backend, `last_diagnostics()['balls']` contains the
        associated Arb arithmetic radii.  The returned numbers remain
        probable because the two trapezoid discretizations are checked by
        refinement rather than a proved enclosure.
        """
        maximum = _checked_order(max_order)
        result, bits = self._evaluate([1], prec, maximum, algorithm)
        key = "completed_derivatives" if completed else "raw_derivatives"
        return runtime.math_tuple(
            [self._coerce(value, bits) for value in result["values"][0][key]]
        )

    def value_ball(
        self, s: Any, prec: Any = 53, algorithm: str = "native"
    ) -> dict[str, Any]:
        """Return midpoint/radius diagnostics for one native Arb value.

        The radius encloses Arb arithmetic error only.  The separate
        `analytic_error_status` and refinement fields must be retained when
        serializing this result; this is not yet a proved analytic enclosure.
        """
        result, _bits = self._evaluate([s], prec, algorithm=algorithm)
        balls = result.get("balls")
        if balls is None:
            raise NotImplementedError(
                "the selected evaluator does not return Arb balls"
            )
        return {
            "raw": balls[0]["raw"][0],
            "completed": balls[0]["completed"][0],
            "rigorous": bool(result["rigorous"]),
            "arithmetic_balls_rigorous": bool(
                result.get("arithmetic_balls_rigorous", False)
            ),
            "analytic_error_status": result["analytic_error_status"],
            "refinement_stable": bool(result["refinement_stable"]),
        }

    def last_diagnostics(self) -> Any:
        return self._last_diagnostics


class LFunctionInit:
    """Prepared genus-2/3 `L`-function evaluation state.

    Central values and derivatives are materialized at construction. General
    points are cached lazily and continue to use the prepared coefficient
    prefix and inverse-Mellin implementation.
    """

    def __init__(
        self,
        lseries: HyperellipticLSeries,
        *,
        prec: Any = 53,
        max_order: Any = 6,
        domain: Any = None,
        algorithm: str = "auto",
    ) -> None:
        self._lseries = lseries
        self._precision = _checked_precision(prec)
        self._maximum_order = _checked_order(max_order)
        self._domain = domain
        self._algorithm = str(algorithm)
        self._closed = False
        self._central_result, _bits = lseries._evaluate(
            [1],
            self._precision,
            self._maximum_order,
            self._algorithm,
        )
        self._point_cache: dict[str, Any] = {}

    def __repr__(self) -> str:
        return "Initialized " + repr(self._lseries)

    def _check_open(self) -> None:
        if self._closed:
            raise ValueError("this LFunctionInit has been closed")

    def close(self) -> None:
        """Release prepared host caches owned by this object."""
        self._point_cache.clear()
        self._closed = True

    def __enter__(self) -> Any:
        self._check_open()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def curve(self) -> Any:
        self._check_open()
        return self._lseries.curve()

    def central_value(self) -> Any:
        self._check_open()
        return self._lseries._coerce(
            self._central_result["values"][0]["raw_derivatives"][0],
            self._precision,
        )

    def central_jet(self, max_order: Any = None, *, completed: bool = False) -> Any:
        self._check_open()
        maximum = (
            self._maximum_order if max_order is None else _checked_order(max_order)
        )
        if maximum > self._maximum_order:
            raise ValueError("the requested order exceeds this initialized jet")
        key = "completed_derivatives" if completed else "raw_derivatives"
        return runtime.math_tuple(
            [
                self._lseries._coerce(value, self._precision)
                for value in self._central_result["values"][0][key][: maximum + 1]
            ]
        )

    def analytic_rank(self, *, leading_coefficient: bool = False) -> Any:
        self._check_open()
        completed = [
            _deserialized_complex(value)
            for value in self._central_result["values"][0]["completed_derivatives"]
        ]
        coarse_completed = [
            _deserialized_complex(value)
            for value in self._central_result["values"][0][
                "coarse_completed_derivatives"
            ]
        ]
        parity = 0 if int(self.curve().root_number()) == 1 else 1
        rank = None
        for order in range(parity, self._maximum_order + 1, 2):
            value = completed[order]
            coarse_value = coarse_completed[order]
            uncertainty = max(
                abs(value - coarse_value),
                mp.power(2, -max(16, self._precision // 2)) * max(1, abs(value)),
            )
            if abs(value) > 16 * uncertainty:
                rank = order
                break
        if rank is None:
            raise HyperellipticLseriesNumericalIndeterminacyError(
                "no nonzero central derivative was isolated through order "
                + str(self._maximum_order)
            )
        if not leading_coefficient:
            return sage.ZZ(rank)
        raw = self._central_result["values"][0]["raw_derivatives"][rank]
        return sage.ZZ(rank), self._lseries._coerce(raw, self._precision)

    def leading_derivative(self) -> Any:
        """Return `(rank, L^(rank)(1))` using the prepared jet."""
        return self.analytic_rank(leading_coefficient=True)

    def value(self, s: Any) -> Any:
        self._check_open()
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            self._precision
        )
        pair = _point_pair(complex_field, s)
        key = pair[0] + ":" + pair[1]
        cached = self._point_cache.get(key)
        if cached is not None:
            return cached
        if _pairs_are_central([pair]):
            value = self.central_value()
        else:
            value = self._lseries.value(
                s,
                prec=self._precision,
                algorithm=self._algorithm,
            )
        self._point_cache[key] = value
        return value

    def __call__(self, s: Any) -> Any:
        return self.value(s)

    def values(self, points: Any) -> Any:
        self._check_open()
        point_list = list(points)
        if not point_list:
            return []
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            self._precision
        )
        pairs = [_point_pair(complex_field, point) for point in point_list]
        missing_points = []
        missing_keys = []
        for point, pair in zip(point_list, pairs, strict=True):
            key = pair[0] + ":" + pair[1]
            if key not in self._point_cache and not _pairs_are_central([pair]):
                missing_points.append(point)
                missing_keys.append(key)
        if missing_points:
            result, bits = self._lseries._evaluate(
                missing_points,
                self._precision,
                algorithm=self._algorithm,
            )
            for key, record in zip(missing_keys, result["values"], strict=True):
                self._point_cache[key] = self._lseries._coerce(
                    record["raw_derivatives"][0], bits
                )
        return [self.value(point) for point in point_list]

    def values_along_line(self, start: Any, stop: Any, count: Any) -> Any:
        """Evaluate `count` equally spaced points on a complex line segment."""
        self._check_open()
        number = int(count)
        if isinstance(count, bool) or number != count or number < 2:
            raise ValueError("count must be an integer at least 2")
        step = (stop - start) / (number - 1)
        return self.values([start + index * step for index in range(number)])

    def diagnostics(self) -> Any:
        self._check_open()
        return {
            "precision_bits": self._precision,
            "maximum_derivative": self._maximum_order,
            "domain": self._domain,
            "algorithm": self._central_result["algorithm"],
            "central": self._central_result,
            "cached_points": len(self._point_cache),
        }


__all__ = [
    "GlobalCoefficientPrefix",
    "HyperellipticLSeries",
    "HyperellipticLseriesNumericalIndeterminacyError",
    "HyperellipticLseriesResourceError",
    "LFunctionInit",
    "central_kernel",
    "central_weight",
    "central_weight_cache_info",
    "central_weight_values",
    "clear_central_weight_cache",
    "lseries_values",
]
