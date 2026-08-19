"""Readable inverse-Mellin continuation of a general Dedekind zeta function.

For exact metadata `(D,r1,r2)` this module uses the normalization

```text
A_K(s)      = |D|^(s/2) Gamma_R(s)^r1 Gamma_C(s)^r2,
Lambda_K(s) = A_K(s) zeta_K(s),
xi_K(s)     = s(s-1) Lambda_K(s).
```

Thus `xi_K` is entire and `xi_K(s)=xi_K(1-s)`.  Put

```text
A_K(s) = C Q^s Gamma(s/2)^r1 Gamma(s)^r2,
C=2^r2, Q=sqrt(|D|)/(pi^(r1/2)*(2*pi)^r2).
```

Let `phi_K` be the inverse Mellin transform of `A_K` and
`psi_K=(-t*d/dt)(-t*d/dt-1)phi_K`.  Mellin inversion and the functional
equation give the residue-free identity

```text
xi_K(s) = integral_1^infinity Theta_K(t)
          (t^s+t^(1-s)) dt/t,
Theta_K(t) = sum_(n>=1) a_n psi_K(n*t).
```

The duplication formula makes `psi_K` a Meijer G kernel.  With
`x=t^2/(4^r2 Q^2)` and
`b=(0 repeated r1+r2, 1/2 repeated r2)`, one obtains

```text
psi_K(t) = 2*pi^(-r2/2)
           (4*G_(0,n)^(n,0)(x; 2,b[1:])
            - 6*G_(0,n)^(n,0)(x; 1,b[1:])).
```

Using `xi` removes the unknown residues at zero and one.  Using the
inverse-Mellin kernel, rather than a short unsmoothed Dirichlet series on a
far-right Gaussian contour, avoids catastrophic cancellation and gives rapid
coefficient decay.

After `t=exp(u)`, derivatives in `s` are exact powers of `u`; this code
therefore integrates Taylor jets and never finite-differences public midpoint
values.  The coefficient prefix, upper integration range, quadrature mesh,
and working precision are independently refined.  There is not yet a proved
uniform Meijer-G/coefficient or quadrature remainder, so results are always
labeled `numerical approximation` and `rigorous=False`.  Refinement
stability is evidence, never a theorem or an Arb enclosure.
"""

from __future__ import annotations

from math import ceil, factorial
from typing import Any, TypedDict

from mpmath import mp

from .general_zeta import (
    AnalyticZetaLimits,
    DedekindZetaMetadata,
    GeneralZetaResourceError,
    fetch_exact_coefficients,
)

__all__ = [
    "AnalyticZetaPlan",
    "ReferenceAnalyticZeta",
    "ReferenceZetaNumericalIndeterminacyError",
    "ReferenceZetaResult",
    "plan_analytic_zeta",
]


class ReferenceZetaNumericalIndeterminacyError(ArithmeticError):
    """Independent reference refinements did not meet the requested goal."""

    def __init__(self, message: str, diagnostics: ReferenceZetaResult) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


class AnalyticZetaPlan(TypedDict):
    """Serializable preflight plan produced before coefficient generation."""

    precision_bits: int
    work_precision_bits: int
    derivative_order: int
    coefficient_bound: int
    recommended_coefficient_bound: int
    quadrature_nodes: int
    refined_quadrature_nodes: int
    upper_u: str
    refined_upper_u: str
    estimated_kernel_terms: int
    coefficient_tail_status: str
    quadrature_status: str
    rigorous: bool


class ReferenceZetaResult(TypedDict):
    """An `xi_K` jet together with explicit numerical diagnostics."""

    kind: str
    value_real: str
    value_imag: str
    derivatives: list[tuple[str, str]]
    plan: AnalyticZetaPlan
    coefficient_refinement_difference: str
    range_refinement_difference: str
    mesh_refinement_difference: str
    refinement_difference: str
    refinement_tolerance: str
    refinement_stable: bool
    proof_status: str
    rigorous: bool
    route: str


def _bits_to_digits(bits: int) -> int:
    return max(20, int(bits * 0.3010299956639812) + 10)


def _number_string(value: Any, digits: int) -> str:
    return str(mp.nstr(value, n=max(18, digits), strip_zeros=False))


def _completion_constants(metadata: DedekindZetaMetadata) -> tuple[Any, Any]:
    r1 = metadata["r1"]
    r2 = metadata["r2"]
    constant = mp.power(2, r2)
    scale = mp.sqrt(abs(metadata["discriminant"])) / (
        mp.power(mp.pi, mp.mpf(r1) / 2) * mp.power(2 * mp.pi, r2)
    )
    return constant, scale


def _archimedean_factor(metadata: DedekindZetaMetadata, point: Any) -> Any:
    constant, scale = _completion_constants(metadata)
    return (
        constant
        * mp.power(scale, point)
        * mp.power(mp.gamma(point / 2), metadata["r1"])
        * mp.power(mp.gamma(point), metadata["r2"])
    )


def _reciprocal_archimedean(metadata: DedekindZetaMetadata, point: Any) -> Any:
    constant, scale = _completion_constants(metadata)
    return (
        mp.power(scale, -point)
        * mp.power(mp.rgamma(point / 2), metadata["r1"])
        * mp.power(mp.rgamma(point), metadata["r2"])
        / constant
    )


def _series_multiply(left: list[Any], right: list[Any], order: int) -> list[Any]:
    answer = [mp.mpc(0) for _index in range(order + 1)]
    for index in range(order + 1):
        for offset in range(index + 1):
            if offset < len(left) and index - offset < len(right):
                answer[index] += left[offset] * right[index - offset]
    return answer


def _meijer_kernel(metadata: DedekindZetaMetadata, argument: Any) -> Any:
    """Return the inverse-Mellin kernel `psi_K(argument)`."""
    _constant, scale = _completion_constants(metadata)
    r1 = metadata["r1"]
    r2 = metadata["r2"]
    x_value = argument * argument / (mp.power(4, r2) * scale * scale)
    # The G_(0,n) kernel has exponential factor
    # exp(-n*x^(1/n)).  Once this lies far below the current arithmetic
    # precision, asking hypercomb to resolve it wastes thousands of guard bits
    # and may fail to converge.  This omission is covered by the explicitly
    # non-rigorous prefix/range refinement status.
    decay = metadata["degree"] * mp.power(x_value, mp.mpf(1) / metadata["degree"])
    if decay > (mp.prec + 40) * mp.log(2):
        return mp.mpf(0)
    remaining = [mp.mpf(0) for _index in range(r1 + r2 - 1)] + [
        mp.mpf("0.5") for _index in range(r2)
    ]
    parameters_one = [mp.mpf(1)] + remaining
    parameters_two = [mp.mpf(2)] + remaining
    g_one = mp.meijerg([[], []], [parameters_one, []], x_value, zeroprec=mp.prec + 20)
    g_two = mp.meijerg([[], []], [parameters_two, []], x_value, zeroprec=mp.prec + 20)
    return 2 * mp.power(mp.pi, -mp.mpf(r2) / 2) * (4 * g_two - 6 * g_one)


def _theta_value(
    metadata: DedekindZetaMetadata,
    coefficients: list[int],
    t_value: Any,
) -> Any:
    return mp.fsum(
        coefficient * _meijer_kernel(metadata, (index + 1) * t_value)
        for index, coefficient in enumerate(coefficients)
        if coefficient != 0
    )


def _inverse_mellin_jet(
    metadata: DedekindZetaMetadata,
    coefficients: list[int],
    point: Any,
    upper_u: Any,
    nodes: int,
    order: int,
) -> list[Any]:
    """Integrate the inverse-Mellin theta identity on `0 <= u <= U`."""
    step = upper_u / nodes
    answer = [mp.mpc(0) for _index in range(order + 1)]
    for index in range(nodes + 1):
        u_value = index * step
        theta = _theta_value(metadata, coefficients, mp.exp(u_value))
        endpoint_weight = mp.mpf("0.5") if index in (0, nodes) else mp.mpf(1)
        positive = mp.exp(point * u_value)
        reflected = mp.exp((1 - point) * u_value)
        u_power = mp.mpf(1)
        for derivative in range(order + 1):
            symmetry = positive + (-1 if derivative % 2 else 1) * reflected
            answer[derivative] += (
                endpoint_weight * theta * symmetry * u_power / factorial(derivative)
            )
            u_power *= u_value
    return [value * step for value in answer]


def _maximum_difference(left: list[Any], right: list[Any]) -> Any:
    return max(
        [abs(a - b) for a, b in zip(left, right, strict=True)],
        default=mp.mpf(0),
    )


def plan_analytic_zeta(
    metadata: DedekindZetaMetadata,
    point: Any,
    *,
    precision_bits: int = 53,
    derivative_order: int = 0,
    coefficient_bound: int = 128,
    quadrature_nodes: int = 64,
    limits: AnalyticZetaLimits | None = None,
) -> AnalyticZetaPlan:
    """Plan a bounded reference computation before requesting coefficients."""
    active_limits = limits if limits is not None else AnalyticZetaLimits()
    bits = int(precision_bits)
    order = int(derivative_order)
    bound = int(coefficient_bound)
    nodes = int(quadrature_nodes)
    # Parse under extra precision so an arbitrary-precision decimal input is
    # not first rounded at the ambient default precision.
    with mp.workprec(max(bits + 32, 80)):
        value = mp.mpc(point)
        point_real = value.real
        point_imaginary = value.imag
    diagnostics: dict[str, Any] = {
        "precision_bits": bits,
        "derivative_order": order,
        "coefficient_bound": bound,
        "quadrature_nodes": nodes,
        "point_real": str(point_real),
        "point_imag": str(point_imaginary),
    }
    if bits < 16 or bits > active_limits.maximum_precision_bits:
        raise GeneralZetaResourceError(
            "precision exceeds reference limits", diagnostics
        )
    if order < 0 or order > active_limits.maximum_derivative_order:
        raise GeneralZetaResourceError(
            "derivative order exceeds reference limits", diagnostics
        )
    if bound < 2 or bound > active_limits.maximum_coefficients:
        raise GeneralZetaResourceError(
            "coefficient bound exceeds reference limits", diagnostics
        )
    if nodes < 8 or 2 * nodes > active_limits.maximum_quadrature_nodes:
        raise GeneralZetaResourceError(
            "quadrature mesh exceeds reference limits", diagnostics
        )
    if abs(point_imaginary) > active_limits.maximum_abs_imaginary:
        raise GeneralZetaResourceError(
            "imaginary height exceeds reference limits", diagnostics
        )
    if abs(point_real - mp.mpf("0.5")) > active_limits.maximum_abs_real_offset:
        raise GeneralZetaResourceError(
            "real offset exceeds reference limits", diagnostics
        )
    with mp.workprec(max(bits + 32, 80)):
        _constant, scale = _completion_constants(metadata)
        degree = metadata["degree"]
        target = max(mp.mpf(4), (bits + 20) * mp.log(2) / degree)
        # G_(0,n)^(n,0)(x) decays like exp(-n*x^(1/n)).  This is a
        # planning heuristic only; the public status remains non-rigorous.
        upper_u = max(
            mp.mpf(3),
            mp.log(max(mp.mpf(1), mp.power(2, metadata["r2"]) * scale))
            + mp.mpf(degree) / 2 * mp.log(target)
            + 1,
        )
        refined_upper_u = upper_u + 1
        recommended_bound = max(
            2,
            int(
                mp.ceil(
                    mp.power(2, metadata["r2"])
                    * scale
                    * mp.power(target, mp.mpf(degree) / 2)
                )
            ),
        )
        coefficient_status = (
            "requested prefix is below the asymptotic planning recommendation; "
            "prefix refinement must pass before use"
            if bound < recommended_bound
            else "unproved inverse-Mellin coefficient tail; checked by prefix halving"
        )
        refined_nodes = int(ceil(2 * nodes * float(refined_upper_u / upper_u)))
    if refined_nodes > active_limits.maximum_quadrature_nodes:
        diagnostics["refined_quadrature_nodes"] = refined_nodes
        raise GeneralZetaResourceError(
            "refined quadrature mesh exceeds reference limits", diagnostics
        )
    estimated_terms = (5 * nodes + refined_nodes) * bound
    if estimated_terms > active_limits.maximum_coefficient_terms:
        diagnostics["estimated_kernel_terms"] = estimated_terms
        raise GeneralZetaResourceError(
            "coefficient-kernel work exceeds reference limits", diagnostics
        )
    return {
        "precision_bits": bits,
        "work_precision_bits": bits + 48 + 8 * order,
        "derivative_order": order,
        "coefficient_bound": bound,
        "recommended_coefficient_bound": recommended_bound,
        "quadrature_nodes": nodes,
        "refined_quadrature_nodes": refined_nodes,
        "upper_u": str(upper_u),
        "refined_upper_u": str(refined_upper_u),
        "estimated_kernel_terms": estimated_terms,
        "coefficient_tail_status": coefficient_status,
        "quadrature_status": (
            "range and mesh refinement only; no proved inverse-Mellin remainder"
        ),
        "rigorous": False,
    }


class ReferenceAnalyticZeta:
    """Coefficient-driven, arbitrary-precision general zeta reference engine."""

    def __init__(
        self,
        metadata: DedekindZetaMetadata,
        coefficient_provider: Any,
        *,
        precision_bits: int = 53,
        limits: AnalyticZetaLimits | None = None,
    ) -> None:
        if metadata["degree"] != metadata["r1"] + 2 * metadata["r2"]:
            raise ValueError("signature does not match field degree")
        if metadata["functional_equation_sign"] != 1:
            raise ValueError("Dedekind zeta has functional-equation sign +1")
        self.metadata = metadata
        self.coefficient_provider = coefficient_provider
        self.precision_bits = int(precision_bits)
        self.limits = limits if limits is not None else AnalyticZetaLimits()

    def xi_result(
        self,
        point: Any,
        *,
        derivative_order: int = 0,
        precision_bits: int | None = None,
        coefficient_bound: int = 128,
        quadrature_nodes: int = 64,
    ) -> ReferenceZetaResult:
        """Return an `xi_K` jet and honest refinement diagnostics."""
        bits = self.precision_bits if precision_bits is None else int(precision_bits)
        plan = plan_analytic_zeta(
            self.metadata,
            point,
            precision_bits=bits,
            derivative_order=derivative_order,
            coefficient_bound=coefficient_bound,
            quadrature_nodes=quadrature_nodes,
            limits=self.limits,
        )
        # Every limit is checked before the first provider call.
        coefficients = fetch_exact_coefficients(
            self.coefficient_provider, plan["coefficient_bound"]
        )
        with mp.workprec(plan["work_precision_bits"]):
            value = mp.mpc(point)
            upper = mp.mpf(plan["upper_u"])
            refined_upper = mp.mpf(plan["refined_upper_u"])
            nodes = plan["quadrature_nodes"]
            full = _inverse_mellin_jet(
                self.metadata, coefficients, value, upper, 2 * nodes, derivative_order
            )
            mesh_coarse = _inverse_mellin_jet(
                self.metadata, coefficients, value, upper, nodes, derivative_order
            )
            range_refined = _inverse_mellin_jet(
                self.metadata,
                coefficients,
                value,
                refined_upper,
                plan["refined_quadrature_nodes"],
                derivative_order,
            )
            prefix_coarse = _inverse_mellin_jet(
                self.metadata,
                coefficients[: max(1, len(coefficients) // 2)],
                value,
                upper,
                2 * nodes,
                derivative_order,
            )
            derivatives = [
                range_refined[index] * factorial(index)
                for index in range(derivative_order + 1)
            ]
            mesh_difference = _maximum_difference(full, mesh_coarse)
            range_difference = _maximum_difference(range_refined, full)
            coefficient_difference = _maximum_difference(full, prefix_coarse)
            difference = max(mesh_difference, range_difference, coefficient_difference)
            tolerance = mp.power(2, -(bits - 8)) * max(mp.mpf(1), abs(derivatives[0]))
            digits = _bits_to_digits(bits)
            return {
                "kind": "xi",
                "value_real": _number_string(derivatives[0].real, digits),
                "value_imag": _number_string(derivatives[0].imag, digits),
                "derivatives": [
                    (
                        _number_string(item.real, digits),
                        _number_string(item.imag, digits),
                    )
                    for item in derivatives
                ],
                "plan": plan,
                "coefficient_refinement_difference": _number_string(
                    coefficient_difference, digits
                ),
                "range_refinement_difference": _number_string(range_difference, digits),
                "mesh_refinement_difference": _number_string(mesh_difference, digits),
                "refinement_difference": _number_string(difference, digits),
                "refinement_tolerance": _number_string(tolerance, digits),
                "refinement_stable": bool(difference <= tolerance),
                "proof_status": "numerical approximation",
                "rigorous": False,
                "route": "completed-xi inverse-Mellin Meijer-G AFE",
            }

    def xi(
        self,
        point: Any,
        *,
        require_stable: bool = True,
        **options: Any,
    ) -> Any:
        result = self.xi_result(point, **options)
        if require_stable and not result["refinement_stable"]:
            raise ReferenceZetaNumericalIndeterminacyError(
                "inverse-Mellin refinements did not meet the requested precision",
                result,
            )
        bits = int(options.get("precision_bits", self.precision_bits))
        with mp.workprec(bits + 16):
            return mp.mpc(result["value_real"], result["value_imag"])

    def completed_value(self, point: Any, **options: Any) -> Any:
        bits = int(options.get("precision_bits", self.precision_bits))
        with mp.workprec(bits + 16):
            value = mp.mpc(point)
            if value == 0 or value == 1:
                raise ArithmeticError("completed Dedekind zeta has a pole here")
            return self.xi(value, **options) / (value * (value - 1))

    def residue(self, point: Any = 1, **options: Any) -> Any:
        bits = int(options.get("precision_bits", self.precision_bits))
        with mp.workprec(bits + 16):
            value = mp.mpc(point)
            if value != 1:
                raise ValueError("Dedekind zeta has its raw pole only at s=1")
            return self.xi(1, **options) / _archimedean_factor(self.metadata, mp.mpf(1))

    def value(self, point: Any, **options: Any) -> Any:
        bits = int(options.get("precision_bits", self.precision_bits))
        with mp.workprec(bits + 16):
            value = mp.mpc(point)
            if value == 1:
                raise ArithmeticError("pole here")
            if value == 0:
                jet_options = dict(options)
                jet_options["derivative_order"] = 1
                result = self.xi_result(0, **jet_options)
                if not result["refinement_stable"]:
                    raise ReferenceZetaNumericalIndeterminacyError(
                        "zero deflation failed inverse-Mellin refinement", result
                    )
                xi_zero = mp.mpc(*result["derivatives"][0])
                xi_derivative = mp.mpc(*result["derivatives"][1])

                def reciprocal(argument: Any) -> Any:
                    return _reciprocal_archimedean(self.metadata, argument)

                return -(
                    xi_derivative * reciprocal(mp.mpf(0))
                    + xi_zero * mp.diff(reciprocal, mp.mpf(0))
                )
            return (
                self.xi(value, **options)
                * _reciprocal_archimedean(self.metadata, value)
                / (value * (value - 1))
            )

    __call__ = value

    def derivative(self, point: Any, order: int = 1, **options: Any) -> Any:
        """Return a regular-point derivative from the integrated `xi` jet."""
        requested = int(order)
        if requested < 0:
            raise ValueError("derivative order must be nonnegative")
        if requested == 0:
            return self.value(point, **options)
        bits = int(options.get("precision_bits", self.precision_bits))
        with mp.workprec(bits + 24):
            value = mp.mpc(point)
            if value == 1:
                raise ArithmeticError("pole here")
            if value.imag == 0 and value.real <= 0 and value.real == int(value.real):
                raise NotImplementedError(
                    "raw derivatives at exact gamma singularities need a "
                    "reciprocal-gamma jet"
                )
            jet_options = dict(options)
            jet_options["derivative_order"] = requested
            result = self.xi_result(value, **jet_options)
            if not result["refinement_stable"]:
                raise ReferenceZetaNumericalIndeterminacyError(
                    "derivative jet failed inverse-Mellin refinement", result
                )
            xi_taylor = [
                mp.mpc(real, imaginary) / factorial(index)
                for index, (real, imaginary) in enumerate(result["derivatives"])
            ]

            def conversion(argument: Any) -> Any:
                return _reciprocal_archimedean(self.metadata, argument) / (
                    argument * (argument - 1)
                )

            conversion_taylor = list(mp.taylor(conversion, value, requested))
            raw_taylor = _series_multiply(xi_taylor, conversion_taylor, requested)
            return raw_taylor[requested] * factorial(requested)

    def diagnostics(self, point: Any, **options: Any) -> ReferenceZetaResult:
        return self.xi_result(point, **options)

    def values_result(
        self,
        points: list[Any] | tuple[Any, ...],
        *,
        precision_bits: int | None = None,
        coefficient_bound: int = 128,
        quadrature_nodes: int = 64,
    ) -> dict[str, Any]:
        """Evaluate a batch after one preflight and coefficient-provider call.

        The readable mpmath reference still evaluates the Meijer-G quadrature
        point by point.  It does, however, preflight the complete batch before
        expensive work and generates the exact coefficient prefix exactly
        once.  A future packed Acb kernel can replace this policy-neutral
        boundary without changing the provider contract.
        """
        batch = list(points)
        if len(batch) == 0:
            raise ValueError("points must be a nonempty sequence")
        if len(batch) > self.limits.maximum_batch_points:
            raise GeneralZetaResourceError(
                "batch size exceeds reference limits",
                {
                    "point_count": len(batch),
                    "maximum_batch_points": self.limits.maximum_batch_points,
                },
            )
        bits = self.precision_bits if precision_bits is None else int(precision_bits)
        plans = [
            plan_analytic_zeta(
                self.metadata,
                point,
                precision_bits=bits,
                coefficient_bound=coefficient_bound,
                quadrature_nodes=quadrature_nodes,
                limits=self.limits,
            )
            for point in batch
        ]
        total_terms = sum(plan["estimated_kernel_terms"] for plan in plans)
        if total_terms > self.limits.maximum_coefficient_terms:
            raise GeneralZetaResourceError(
                "batch coefficient-kernel work exceeds reference limits",
                {"point_count": len(batch), "estimated_kernel_terms": total_terms},
            )
        coefficients = fetch_exact_coefficients(
            self.coefficient_provider, coefficient_bound
        )

        class FixedPrefix:
            def coefficients(self, bound: int) -> list[int]:
                if bound != len(coefficients):
                    raise ValueError("fixed batch prefix cannot be resized")
                return coefficients

        evaluator = ReferenceAnalyticZeta(
            self.metadata,
            FixedPrefix(),
            precision_bits=bits,
            limits=self.limits,
        )
        point_diagnostics = [
            evaluator.xi_result(
                point,
                precision_bits=bits,
                coefficient_bound=coefficient_bound,
                quadrature_nodes=quadrature_nodes,
            )
            for point in batch
        ]
        values = []
        with mp.workprec(bits + 16):
            for point, diagnostic in zip(batch, point_diagnostics, strict=True):
                if not diagnostic["refinement_stable"]:
                    raise ReferenceZetaNumericalIndeterminacyError(
                        "a batch point failed inverse-Mellin refinement", diagnostic
                    )
                xi_value = mp.mpc(diagnostic["value_real"], diagnostic["value_imag"])
                value = mp.mpc(point)
                if value == 1:
                    raise ArithmeticError("pole here")
                if value == 0:
                    # The scalar route has the special zero deflation and
                    # shares the already generated fixed prefix.
                    values.append(
                        evaluator.value(
                            value,
                            precision_bits=bits,
                            coefficient_bound=coefficient_bound,
                            quadrature_nodes=quadrature_nodes,
                        )
                    )
                else:
                    values.append(
                        xi_value
                        * _reciprocal_archimedean(self.metadata, value)
                        / (value * (value - 1))
                    )
        return {
            "values": values,
            "point_diagnostics": point_diagnostics,
            "coefficient_bound": coefficient_bound,
            "coefficient_provider_calls": 1,
            "shared_coefficient_prefix": True,
            "shared_kernel_preparation": False,
            "proof_status": "numerical approximation",
            "rigorous": False,
        }

    def values(
        self,
        points: list[Any] | tuple[Any, ...],
        **options: Any,
    ) -> list[Any]:
        """Return batch values while preserving order and duplicates."""
        return self.values_result(points, **options)["values"]
