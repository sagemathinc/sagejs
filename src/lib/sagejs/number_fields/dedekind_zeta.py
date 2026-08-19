"""Complete quadratic Dedekind-zeta internals.

For a quadratic field of fundamental discriminant `D`,

`zeta_K(s) = zeta(s) * L(s, chi_D)`.

This identity supplies meromorphic continuation, exact pole semantics, jets,
completion, and the functional equation without a general approximate
functional equation.  The class is intentionally provider-oriented: the
integration layer supplies Sage.js/FLINT complex values and Dirichlet
L-functions, while the ordinary-Python fallback is an independent mpmath
reference.
"""

from __future__ import annotations

from math import factorial
from typing import Any, Callable

from mpmath import mp

from .quadratic_characters import (
    is_fundamental_discriminant,
    kronecker_character,
    kronecker_symbol,
)
from .riemann_zeta import (
    RiemannZetaEvaluator,
    ZetaPoleError,
    _decimal_equals_integer,
)

__all__ = ["DedekindZetaFunction", "QuadraticDirichletLReference"]


def _binomial(n: int, k: int) -> int:
    return factorial(n) // (factorial(k) * factorial(n - k))


def _precision(value: Any) -> int:
    result = int(value)
    if result < 16:
        raise ValueError("precision must be at least 16 bits")
    return result


def _order(value: Any) -> int:
    result = int(value)
    if result < 0 or result != value:
        raise ValueError("derivative order must be a nonnegative integer")
    return result


def _point(value: Any) -> Any:
    if isinstance(value, (tuple, list)):
        return mp.mpc(value[0], value[1])
    try:
        return mp.mpc(value)
    except (TypeError, ValueError):
        real = value.real()
        imaginary = value.imag()
        return mp.mpc(str(real), str(imaginary))


def _is_point(value: Any, real: int) -> bool:
    def equals_integer(scalar: Any, integer: int) -> bool:
        if isinstance(scalar, str):
            return _decimal_equals_integer(scalar, integer)
        return scalar == integer

    if isinstance(value, (tuple, list)):
        return (
            len(value) == 2
            and equals_integer(value[0], real)
            and equals_integer(value[1], 0)
        )
    real_part = getattr(value, "real", value)
    imaginary_part = getattr(value, "imag", 0)
    if callable(real_part):
        real_part = real_part()
    if callable(imaginary_part):
        imaginary_part = imaginary_part()
    return equals_integer(real_part, real) and equals_integer(imaginary_part, 0)


def _mpc_from_value(value: Any) -> Any:
    if isinstance(value, (int, float, complex, mp.mpf, mp.mpc)):
        return mp.mpc(value)
    real = value.real()
    imaginary = value.imag()
    return mp.mpc(str(real), str(imaginary))


def _machine_pair(value: Any) -> list[float]:
    real = getattr(value, "real", value)
    imaginary = getattr(value, "imag", 0)
    if callable(real):
        real = real()
    if callable(imaginary):
        imaginary = imaginary()
    return [float(str(real)), float(str(imaginary))]


class QuadraticDirichletLReference:
    """Portable reference for `L(s,chi_D)` using mpmath's Dirichlet L."""

    def __init__(self, discriminant: int, precision: int = 53) -> None:
        self._discriminant = int(discriminant)
        self._precision = _precision(precision)
        modulus = abs(self._discriminant)
        self._values = [kronecker_symbol(self._discriminant, n) for n in range(modulus)]

    def value(self, value: Any, derivative: Any = 0, prec: Any = None) -> Any:
        order = _order(derivative)
        precision = self._precision if prec is None else _precision(prec)
        with mp.workprec(precision + 40):
            point = _point(value)
            center = point.real if point.imag == 0 else point
            if order == 0:
                return mp.dirichlet(center, self._values)
            if center == 1:
                # Expand each Hurwitz zeta using generalized Stieltjes
                # constants. The 1/(s-1) terms cancel because chi is
                # nonprincipal, without numerical pole subtraction.
                modulus = len(self._values)
                log_modulus = mp.log(modulus)
                coefficient = 0
                for logarithm_degree in range(order + 1):
                    stieltjes_index = order - logarithm_degree
                    character_sum = 0
                    for residue in range(1, modulus):
                        character_sum += (
                            self._values[residue]
                            * (-1) ** stieltjes_index
                            * mp.stieltjes(
                                stieltjes_index,
                                mp.mpf(residue) / modulus,
                            )
                            / factorial(stieltjes_index)
                        )
                    coefficient += (
                        (-log_modulus) ** logarithm_degree
                        / factorial(logarithm_degree)
                        * character_sum
                    )
                return factorial(order) * coefficient / modulus

            def evaluate(point: Any) -> Any:
                return mp.dirichlet(point, self._values)

            return mp.diff(evaluate, center, order)

    def __call__(self, value: Any) -> Any:
        return self.value(value)

    def derivative(self, value: Any, D: Any = 1, prec: Any = None) -> Any:
        return self.value(value, D, prec)

    def values(
        self,
        points: list[Any] | tuple[Any, ...],
        derivative: Any = 0,
        prec: Any = None,
    ) -> list[Any]:
        return [self.value(point, derivative, prec) for point in points]


class DedekindZetaFunction:
    """The complete Dedekind zeta function of a quadratic number field."""

    def __init__(
        self,
        number_field: Any,
        *,
        discriminant: Any = None,
        precision: Any = 53,
        max_imaginary_part: Any = 0,
        algorithm: str = "auto",
        riemann: RiemannZetaEvaluator | None = None,
        character: Any = None,
        lfunction: Any = None,
        character_factory: Callable[..., Any] | None = None,
        result_coercer: Callable[[Any, int], Any] | None = None,
        completed_provider: Any = None,
    ) -> None:
        if hasattr(number_field, "degree") and int(number_field.degree()) != 2:
            raise NotImplementedError(
                "the quadratic-product route requires a degree-two field"
            )
        if algorithm not in ("auto", "quadratic-product", "reference"):
            raise ValueError(
                "algorithm must be 'auto', 'quadratic-product', or 'reference'"
            )
        self._number_field = number_field
        raw_discriminant = (
            number_field.discriminant() if discriminant is None else discriminant
        )
        self._discriminant = int(raw_discriminant)
        if self._discriminant in (0, 1) or not is_fundamental_discriminant(
            self._discriminant
        ):
            raise ValueError(
                "a quadratic field must have a nontrivial fundamental discriminant"
            )
        self._precision = _precision(precision)
        self._max_imaginary_part = max_imaginary_part
        self._algorithm = algorithm
        self._riemann = (
            RiemannZetaEvaluator(self._precision) if riemann is None else riemann
        )
        self._result_coercer = result_coercer
        self._completed_provider = completed_provider
        if algorithm == "reference":
            self._character = None
            self._lfunction = QuadraticDirichletLReference(
                self._discriminant, self._precision
            )
        else:
            if character is None:
                factory = (
                    kronecker_character
                    if character_factory is None
                    else character_factory
                )
                character = factory(self._discriminant)
            self._character = character
            self._lfunction = (
                character.lfunction(self._precision) if lfunction is None else lfunction
            )
        self._lfunctions = {self._precision: self._lfunction}
        self._last_diagnostics: dict[str, Any] = {}

    def number_field(self) -> Any:
        return self._number_field

    def discriminant(self) -> int:
        return self._discriminant

    def character(self) -> Any:
        return self._character

    def precision(self) -> int:
        return self._precision

    prec = precision

    def algorithm(self) -> str:
        return "reference" if self._algorithm == "reference" else "quadratic-product"

    @staticmethod
    def _validate_algorithm(algorithm: str) -> None:
        if algorithm not in ("auto", "quadratic-product", "reference"):
            raise ValueError(
                "algorithm must be 'auto', 'quadratic-product', or 'reference'"
            )

    def _coerce(self, value: Any, precision: int) -> Any:
        return (
            value
            if self._result_coercer is None
            else self._result_coercer(value, precision)
        )

    def _l_derivative(self, value: Any, derivative: int, precision: int) -> Any:
        lfunction = self._lfunction_at_precision(precision)
        if isinstance(lfunction, QuadraticDirichletLReference):
            return lfunction.value(value, derivative, precision)
        if derivative == 0:
            return lfunction(value)
        return lfunction.derivative(value, derivative)

    def _lfunction_at_precision(self, precision: int) -> Any:
        lfunction = self._lfunctions.get(precision)
        if lfunction is not None:
            return lfunction
        if self._algorithm == "reference":
            lfunction = QuadraticDirichletLReference(self._discriminant, precision)
        elif self._character is not None:
            lfunction = self._character.lfunction(precision)
        else:
            raise ValueError("this Dirichlet L provider cannot change precision")
        self._lfunctions[precision] = lfunction
        return lfunction

    def value(self, value: Any, prec: Any = None, algorithm: str = "auto") -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        if _is_point(value, 1):
            raise ZetaPoleError("the Dedekind zeta function has a pole at s=1")
        if algorithm == "reference" and not isinstance(
            self._lfunction, QuadraticDirichletLReference
        ):
            reference = DedekindZetaFunction(
                self._number_field,
                discriminant=self._discriminant,
                precision=precision,
                algorithm="reference",
                result_coercer=self._result_coercer,
            )
            return reference.value(value)
        with mp.workprec(precision + 40):
            result = self._riemann.value(value, prec=precision) * self._l_derivative(
                value, 0, precision
            )
        self._last_diagnostics = {
            "algorithm": self.algorithm(),
            "precision_bits": precision,
            "rigorous": False,
            "status": "numerical approximation",
        }
        return self._coerce(result, precision)

    def __call__(self, value: Any) -> Any:
        return self.value(value)

    def values(
        self,
        points: list[Any] | tuple[Any, ...],
        prec: Any = None,
        algorithm: str = "auto",
    ) -> list[Any]:
        self._validate_algorithm(algorithm)
        if not isinstance(points, (list, tuple)) or not points:
            raise ValueError("points must be a nonempty list or tuple")
        if any(_is_point(point, 1) for point in points):
            raise ZetaPoleError("the Dedekind zeta function has a pole at s=1")
        precision = self._precision if prec is None else _precision(prec)
        if algorithm == "reference" and not isinstance(
            self._lfunction, QuadraticDirichletLReference
        ):
            return [
                self.value(point, prec=precision, algorithm="reference")
                for point in points
            ]
        zeta_values = self._riemann.values(points, prec=precision)
        lfunction = self._lfunction_at_precision(precision)
        if hasattr(lfunction, "values"):
            l_values = list(lfunction.values(points, 0, precision))
        else:
            l_values = [self._l_derivative(point, 0, precision) for point in points]
        self._last_diagnostics = {
            "algorithm": self.algorithm(),
            "precision_bits": precision,
            "point_count": len(points),
            "batched_riemann": hasattr(self._riemann._provider, "values")
            if self._riemann._provider is not None
            else False,
            "batched_dirichlet": hasattr(lfunction, "values"),
            "rigorous": False,
            "status": "numerical approximation",
        }
        with mp.workprec(precision + 40):
            products = [
                left * right for left, right in zip(zeta_values, l_values, strict=True)
            ]
        return [self._coerce(product, precision) for product in products]

    def derivative(
        self,
        value: Any,
        D: Any = 1,
        prec: Any = None,
        algorithm: str = "auto",
    ) -> Any:
        self._validate_algorithm(algorithm)
        derivative_order = _order(D)
        precision = self._precision if prec is None else _precision(prec)
        if _is_point(value, 1):
            raise ZetaPoleError("Dedekind-zeta derivatives are undefined at s=1")
        if algorithm == "reference" and not isinstance(
            self._lfunction, QuadraticDirichletLReference
        ):
            reference = DedekindZetaFunction(
                self._number_field,
                discriminant=self._discriminant,
                precision=precision,
                algorithm="reference",
                result_coercer=self._result_coercer,
            )
            return reference.derivative(value, derivative_order)
        zeta_jet = self._riemann.jet(value, derivative_order, prec=precision)
        with mp.workprec(precision + 40):
            result = None
            for index in range(derivative_order + 1):
                term = zeta_jet[index] * self._l_derivative(
                    value,
                    derivative_order - index,
                    precision,
                )
                multiplicity = _binomial(derivative_order, index)
                if multiplicity != 1:
                    term = term * multiplicity
                result = term if result is None else result + term
        return self._coerce(result, precision)

    def deflated_taylor_series(
        self,
        order: Any,
        *,
        point: Any = 1,
        prec: Any = None,
    ) -> list[Any]:
        """Return Taylor coefficients of `(s-1)*zeta_K(s)` at `s=1`."""

        if not _is_point(point, 1):
            raise NotImplementedError(
                "deflated Taylor data is currently centered at s=1"
            )
        maximum_order = _order(order)
        precision = self._precision if prec is None else _precision(prec)
        # If h=zeta-1/(s-1), then (s-1)zeta=1+(s-1)h.
        h_derivatives = self._riemann.deflated_jet(point, maximum_order, prec=precision)
        with mp.workprec(precision + 40):
            zeta_deflated_coefficients = [1]
            for index in range(1, maximum_order + 1):
                zeta_deflated_coefficients.append(
                    h_derivatives[index - 1] / factorial(index - 1)
                )
            l_coefficients = [
                self._l_derivative(point, index, precision) / factorial(index)
                for index in range(maximum_order + 1)
            ]
            raw_result = []
            for degree in range(maximum_order + 1):
                coefficient = None
                for index in range(degree + 1):
                    term = (
                        zeta_deflated_coefficients[index]
                        * l_coefficients[degree - index]
                    )
                    coefficient = term if coefficient is None else coefficient + term
                raw_result.append(coefficient)
        result = [self._coerce(coefficient, precision) for coefficient in raw_result]
        return result

    def residue(self, value: Any = 1, prec: Any = None, algorithm: str = "auto") -> Any:
        self._validate_algorithm(algorithm)
        if not _is_point(value, 1):
            raise ValueError(
                "the quadratic Dedekind zeta function has no pole at this point"
            )
        precision = self._precision if prec is None else _precision(prec)
        if algorithm == "reference" and self._algorithm != "reference":
            reference = DedekindZetaFunction(
                self._number_field,
                discriminant=self._discriminant,
                precision=precision,
                algorithm="reference",
                result_coercer=self._result_coercer,
            )
            return reference.residue(1)
        return self._coerce(self._l_derivative(1, 0, precision), precision)

    def _reference_completed_value(
        self,
        value: Any,
        precision: int,
        algorithm: str,
    ) -> Any:
        self._validate_algorithm(algorithm)
        with mp.workprec(precision + 40):
            point = _point(value)
            raw = _mpc_from_value(
                self.value(value, prec=precision, algorithm=algorithm)
            )
            discriminant_factor = mp.power(abs(self._discriminant), point / 2)
            if self._discriminant > 0:
                gamma_factor = mp.power(mp.pi, -point) * mp.gamma(point / 2) ** 2
            else:
                gamma_factor = 2 * mp.power(2 * mp.pi, -point) * mp.gamma(point)
            return discriminant_factor * gamma_factor * raw

    def completed_value(
        self, value: Any, prec: Any = None, algorithm: str = "auto"
    ) -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        if _is_point(value, 0) or _is_point(value, 1):
            raise ZetaPoleError(
                "the completed Dedekind zeta function has poles at 0 and 1"
            )
        with mp.workprec(precision + 40):
            point = _point(value)
        if point.imag == 0 and point.real < 0 and point.real == int(point.real):
            # Avoid the indeterminate product of a gamma pole and a trivial
            # zero. The exact functional equation gives the regular value.
            return self.completed_value(
                [str(1 - point.real), str(-point.imag)],
                prec=precision,
                algorithm=algorithm,
            )
        if self._completed_provider is not None:
            raw = self.value(value, prec=precision, algorithm=algorithm)
            return self._completed_provider.completed_quadratic_value(
                self._discriminant,
                value,
                raw,
                precision,
            )
        return self._coerce(
            self._reference_completed_value(value, precision, algorithm),
            precision,
        )

    def xi(self, value: Any, prec: Any = None, algorithm: str = "auto") -> Any:
        """Return `s*(s-1)*Lambda_K(s)` in the plan's normalization."""

        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        if _is_point(value, 0) or _is_point(value, 1):
            with mp.workprec(precision + 40):
                residue = _mpc_from_value(self.residue(1, prec=precision))
                if self._discriminant > 0:
                    factor = mp.sqrt(abs(self._discriminant))
                else:
                    factor = mp.sqrt(abs(self._discriminant)) / mp.pi
                result = factor * residue
            return self._coerce(result, precision)
        with mp.workprec(precision + 40):
            point = _point(value)
            result = (
                point
                * (point - 1)
                * _mpc_from_value(
                    self.completed_value(
                        value,
                        prec=precision,
                        algorithm=algorithm,
                    )
                )
            )
        return self._coerce(result, precision)

    def last_diagnostics(self) -> dict[str, Any]:
        return dict(self._last_diagnostics)

    def plot(self, *range_args: Any, **options: Any) -> Any:
        """Plot on the real axis through the shared packed-plot protocol."""

        import sagejs as sage

        sage_module: Any = sage
        return sage_module.plot(self, *range_args, **options)

    def _plot_real_batch(
        self,
        points: list[float],
        precision: int,
        adaptive: bool = True,
    ) -> dict[str, Any]:
        """Private equally spaced real-axis plotting protocol."""

        return self._plot_complex_batch(
            [[float(point), 0.0] for point in points],
            precision,
            {"adaptive": bool(adaptive)},
        )

    def _plot_complex_batch(
        self,
        points: list[list[float]],
        precision: int,
        region: Any = None,
    ) -> dict[str, Any]:
        """Evaluate plot points in bounded coarse/fine native batches.

        Once integration supplies `riemannZetaValues` and
        `dirichletLValues`, each tile uses four packed native crossings (two
        factors at coarse and fine precision), never one crossing per point.
        The coarse/fine difference is a plotting heuristic, not a rigorous
        error enclosure.
        """

        target = int(precision)
        if target < 16 or target > 53:
            raise ValueError("plot precision must be between 16 and 53 bits")
        if not points:
            return {
                "coarse": [],
                "fine": [],
                "errors": [],
                "diagnostics": {"point_count": 0, "tile_count": 0},
            }
        normalized = []
        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError("plot points must be real/imaginary pairs")
            normalized.append((str(float(point[0])), str(float(point[1]))))
        adaptive = bool(region is not None and region.get("adaptive", False))
        fine_precision = target + (8 if adaptive else 32)
        tile_limit = 10_000
        coarse_pairs: list[list[float]] = []
        fine_pairs: list[list[float]] = []
        errors: list[float] = []
        for start in range(0, len(normalized), tile_limit):
            tile = normalized[start : start + tile_limit]
            coarse_values = self.values(tile, prec=target)
            fine_values = self.values(tile, prec=fine_precision)
            for coarse_value, fine_value in zip(
                coarse_values, fine_values, strict=True
            ):
                coarse_pair = _machine_pair(coarse_value)
                fine_pair = _machine_pair(fine_value)
                coarse_pairs.append(coarse_pair)
                fine_pairs.append(fine_pair)
                errors.append(
                    (
                        (fine_pair[0] - coarse_pair[0]) ** 2
                        + (fine_pair[1] - coarse_pair[1]) ** 2
                    )
                    ** 0.5
                )
        return {
            "coarse": coarse_pairs,
            "fine": fine_pairs,
            "errors": errors,
            "diagnostics": {
                "point_count": len(normalized),
                "tile_count": (len(normalized) + tile_limit - 1) // tile_limit,
                "coarse_precision_bits": target,
                "fine_precision_bits": fine_precision,
                "batched_riemann": self._last_diagnostics.get("batched_riemann", False),
                "batched_dirichlet": self._last_diagnostics.get(
                    "batched_dirichlet", False
                ),
                "rigorous": False,
            },
        }

    def coefficients(self, bound: Any) -> Any:
        from sagejs.number_fields.zeta_coefficients import zeta_coefficients

        order = self._number_field.maximal_order()
        return zeta_coefficients(
            int(bound),
            degree=2,
            splitting_provider=order.splitting_records,
        )

    def euler_factor(self, prime: Any) -> Any:
        from sagejs.number_fields.zeta_coefficients import local_zeta_factor_data

        order = self._number_field.maximal_order()
        decomposition = order.factor_rational_prime(prime)
        return local_zeta_factor_data(
            decomposition.splitting_record(),
            degree=2,
        )

    def euler_product(self, value: Any, prime_bound: Any, prec: Any = None) -> Any:
        from sagejs.number_fields.euler_products import euler_product

        precision = self._precision if prec is None else _precision(prec)
        order = self._number_field.maximal_order()
        result = euler_product(
            value,
            int(prime_bound),
            degree=2,
            splitting_provider=order.splitting_records,
            prec=precision,
        )
        return self._coerce(
            mp.mpc(result["value_real"], result["value_imag"]), precision
        )

    def __repr__(self) -> str:
        return "Dedekind zeta function of " + str(self._number_field)

    __str__ = __repr__


class GeneralDedekindZetaFunction:
    """Coefficient-driven Dedekind zeta function for a general number field.

    The continuation route is the readable inverse-Mellin Meijer-G engine.
    It is an arbitrary-precision numerical approximation with explicit
    refinement diagnostics, not a rigorous enclosure.
    """

    def __init__(
        self,
        number_field: Any,
        *,
        precision: Any = 53,
        max_imaginary_part: Any = 0,
        result_coercer: Callable[[Any, int], Any] | None = None,
        limits: Any = None,
    ) -> None:
        from sagejs.number_fields.analytic_zeta import ReferenceAnalyticZeta
        from sagejs.number_fields.general_zeta import (
            AnalyticZetaLimits,
            make_zeta_metadata,
        )

        self._number_field = number_field
        self._precision = _precision(precision)
        self._max_imaginary_part = max_imaginary_part
        self._result_coercer = result_coercer
        self._order = number_field.maximal_order()
        self._coefficient_cache: list[int] = []
        self._last_diagnostics: dict[str, Any] = {}
        self._limits = AnalyticZetaLimits() if limits is None else limits
        self._metadata = make_zeta_metadata(number_field)
        self._engine = ReferenceAnalyticZeta(
            self._metadata,
            self,
            precision_bits=self._precision,
            limits=self._limits,
        )

    def number_field(self) -> Any:
        return self._number_field

    def precision(self) -> int:
        return self._precision

    prec = precision

    def algorithm(self) -> str:
        return "afe"

    @staticmethod
    def _validate_algorithm(algorithm: str) -> None:
        if algorithm == "pari":
            raise NotImplementedError(
                "algorithm='pari' is unavailable; use 'auto' or 'afe'"
            )
        if algorithm not in ("auto", "afe", "reference"):
            raise ValueError("algorithm must be 'auto', 'afe', or 'reference'")

    def _coerce(self, value: Any, precision: int) -> Any:
        return (
            value
            if self._result_coercer is None
            else self._result_coercer(value, precision)
        )

    def coefficients(self, bound: Any) -> list[int]:
        from sagejs.number_fields.zeta_coefficients import zeta_coefficients

        requested = int(bound)
        if requested > len(self._coefficient_cache):
            self._coefficient_cache = zeta_coefficients(
                requested,
                degree=int(self._number_field.degree()),
                splitting_provider=self._order.splitting_records,
            )
        return list(self._coefficient_cache[:requested])

    def _options(self, precision: int) -> dict[str, Any]:
        return {
            "precision_bits": precision,
            "coefficient_bound": 128,
            "quadrature_nodes": 64,
        }

    def value(self, value: Any, prec: Any = None, algorithm: str = "auto") -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        result = self._engine.value(_point(value), **self._options(precision))
        self._last_diagnostics = {
            "algorithm": "inverse-mellin-meijer-g",
            "precision_bits": precision,
            "rigorous": False,
        }
        return self._coerce(result, precision)

    def __call__(self, value: Any) -> Any:
        return self.value(value)

    def values(
        self,
        points: list[Any] | tuple[Any, ...],
        prec: Any = None,
        algorithm: str = "auto",
    ) -> list[Any]:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        result = self._engine.values_result(
            [_point(point) for point in points], **self._options(precision)
        )
        self._last_diagnostics = dict(result)
        return [self._coerce(item, precision) for item in result["values"]]

    def derivative(
        self,
        value: Any,
        D: Any = 1,
        prec: Any = None,
        algorithm: str = "auto",
    ) -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        result = self._engine.derivative(
            _point(value),
            int(D),
            **self._options(precision),
        )
        return self._coerce(result, precision)

    def completed_value(
        self, value: Any, prec: Any = None, algorithm: str = "auto"
    ) -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        return self._coerce(
            self._engine.completed_value(_point(value), **self._options(precision)),
            precision,
        )

    def xi(self, value: Any, prec: Any = None, algorithm: str = "auto") -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        return self._coerce(
            self._engine.xi(_point(value), **self._options(precision)), precision
        )

    def residue(self, value: Any = 1, prec: Any = None, algorithm: str = "auto") -> Any:
        self._validate_algorithm(algorithm)
        precision = self._precision if prec is None else _precision(prec)
        return self._coerce(
            self._engine.residue(_point(value), **self._options(precision)), precision
        )

    def euler_factor(self, prime: Any) -> Any:
        from sagejs.number_fields.zeta_coefficients import local_zeta_factor_data

        decomposition = self._order.factor_rational_prime(prime)
        return local_zeta_factor_data(
            decomposition.splitting_record(),
            degree=int(self._number_field.degree()),
        )

    def dirichlet_series(
        self,
        value: Any,
        coefficient_bound: Any,
        prec: Any = None,
        rigorous: bool = False,
    ) -> Any:
        from sagejs.number_fields.euler_products import dirichlet_series

        precision = self._precision if prec is None else _precision(prec)
        result = dirichlet_series(
            value,
            int(coefficient_bound),
            degree=int(self._number_field.degree()),
            coefficients=self.coefficients(coefficient_bound),
            prec=precision,
            rigorous=rigorous,
        )
        self._last_diagnostics = dict(result)
        return self._coerce(
            mp.mpc(result["value_real"], result["value_imag"]), precision
        )

    def euler_product(
        self,
        value: Any,
        prime_bound: Any,
        prec: Any = None,
        rigorous: bool = False,
    ) -> Any:
        from sagejs.number_fields.euler_products import euler_product

        precision = self._precision if prec is None else _precision(prec)
        result = euler_product(
            value,
            int(prime_bound),
            degree=int(self._number_field.degree()),
            splitting_provider=self._order.splitting_records,
            prec=precision,
            rigorous=rigorous,
        )
        self._last_diagnostics = dict(result)
        return self._coerce(
            mp.mpc(result["value_real"], result["value_imag"]), precision
        )

    def last_diagnostics(self) -> dict[str, Any]:
        return dict(self._last_diagnostics)

    def plot(self, *range_args: Any, **options: Any) -> Any:
        import sagejs as sage

        sage_module: Any = sage
        return sage_module.plot(self, *range_args, **options)

    def _plot_real_batch(
        self,
        points: list[float],
        precision: int,
        adaptive: bool = True,
    ) -> dict[str, Any]:
        return self._plot_complex_batch(
            [[float(point), 0.0] for point in points],
            precision,
            {"adaptive": bool(adaptive)},
        )

    def _plot_complex_batch(
        self,
        points: list[list[float]],
        precision: int,
        region: Any = None,
    ) -> dict[str, Any]:
        target = int(precision)
        normalized = [(str(float(point[0])), str(float(point[1]))) for point in points]
        fine_precision = target + 8
        coarse_pairs: list[list[float]] = []
        fine_pairs: list[list[float]] = []
        errors: list[float] = []
        tile_limit = self._limits.maximum_batch_points
        for start in range(0, len(normalized), tile_limit):
            tile = normalized[start : start + tile_limit]
            coarse_values = self.values(tile, prec=target)
            fine_values = self.values(tile, prec=fine_precision)
            for coarse, fine in zip(coarse_values, fine_values, strict=True):
                coarse_pair = _machine_pair(coarse)
                fine_pair = _machine_pair(fine)
                coarse_pairs.append(coarse_pair)
                fine_pairs.append(fine_pair)
                errors.append(
                    (
                        (fine_pair[0] - coarse_pair[0]) ** 2
                        + (fine_pair[1] - coarse_pair[1]) ** 2
                    )
                    ** 0.5
                )
        return {
            "coarse": coarse_pairs,
            "fine": fine_pairs,
            "errors": errors,
            "diagnostics": {
                "point_count": len(normalized),
                "tile_count": (len(normalized) + tile_limit - 1) // tile_limit,
                "rigorous": False,
                "algorithm": "inverse-Mellin Meijer-G AFE",
            },
        }

    def __repr__(self) -> str:
        return "Dedekind zeta function of " + str(self._number_field)

    __str__ = __repr__
