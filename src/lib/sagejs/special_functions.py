"""Lazy host adapters for batched gamma, Riemann zeta and xi.

The public bootstrap retains signatures and documentation; these algorithms
and FLINT/Arb calls load only when one of those functions is used.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_ZETA_BERNOULLI = [
    0.16666666666666666,
    -0.03333333333333333,
    0.023809523809523808,
    -0.03333333333333333,
    0.07575757575757576,
    -0.2531135531135531,
    1.1666666666666667,
    -7.092156862745098,
]


def _zeta_integer_greater_than_one(value: Any) -> Any:
    if not runtime.is_exact_integer(value):
        raise TypeError("the Euler--Maclaurin shortcut requires an integer")
    s = runtime.number(value)
    if s <= 1:
        raise ValueError("the Euler--Maclaurin shortcut requires an integer > 1")

    cutoff = 16
    answer = 0.0
    for n in range(1, cutoff):
        answer += runtime.math.pow(n, -s)
    answer += runtime.math.pow(cutoff, 1 - s) / (s - 1) + 0.5 * runtime.math.pow(
        cutoff, -s
    )

    rising = s
    factorial = 2.0
    for index in range(len(_ZETA_BERNOULLI)):
        if index:
            rising *= (s + 2 * index - 1) * (s + 2 * index)
            factorial *= (2 * index + 1) * (2 * index + 2)
        answer += (
            _ZETA_BERNOULLI[index]
            * rising
            / factorial
            * runtime.math.pow(cutoff, -(s + 2 * index + 1))
        )
    return answer


_riemann_zeta_module_cache = runtime.undefined


def _riemann_zeta_module() -> Any:
    global _riemann_zeta_module_cache
    if _riemann_zeta_module_cache is runtime.undefined:
        _riemann_zeta_module_cache = __import__(
            "sagejs.number_fields.riemann_zeta",
            fromlist=["riemann_zeta"],
        )
    return _riemann_zeta_module_cache


def _analytic_precision(value: Any) -> Any:
    if value is None:
        value = 53
    precision = runtime.normalize_integer(value)
    if (
        runtime.jstype(precision) != "number"
        or not runtime.number.isSafeInteger(precision)
        or precision < 16
    ):
        raise ValueError("analytic precision must be at least 16 bits")
    return precision


def _analytic_complex_point(field: Any, value: Any) -> Any:
    if runtime.array.isArray(value) and len(value) == 2:
        return field(value[0], value[1])
    try:
        return field(value)
    except Exception:
        evaluator_factory = getattr(value, "_plot_complex_callable", None)
        if evaluator_factory is not None:
            evaluator = evaluator_factory([])
            evaluated = runtime.reflect.apply(evaluator, runtime.undefined, [])
            real_part = runtime.reflect.get(evaluated, "real")
            imaginary_part = runtime.reflect.get(evaluated, "imag")
            if (
                runtime.jstype(real_part) != "number"
                or runtime.jstype(imaginary_part) != "number"
                or not runtime.number.isFinite(real_part)
                or not runtime.number.isFinite(imaginary_part)
            ):
                return _riemann_raise_nonfinite()
            return field(real_part, imaginary_part)
        real_part = getattr(value, "real", runtime.undefined)
        imaginary_part = getattr(value, "imag", runtime.undefined)
        if (
            real_part is not runtime.undefined
            and imaginary_part is not runtime.undefined
        ):
            if callable(real_part):
                real_part = real_part()
            if callable(imaginary_part):
                imaginary_part = imaginary_part()
            try:
                return field(str(real_part), str(imaginary_part))
            except Exception:
                pass
        raise


def _analytic_complex_batch(points: Any, precision: Any) -> Any:
    if not runtime.array.isArray(points) or len(points) == 0:
        raise ValueError("analytic points must be a nonempty list or tuple")
    precision = _analytic_precision(precision)
    field = runtime.reflect.get(runtime.global_object, "ComplexField")(precision)
    return field, [_analytic_complex_point(field, point)._native for point in points]


def complex_gamma_values(points: Any, prec: Any = 53) -> list[Any]:
    """Numerically evaluate complex gamma at a nonempty batch of points.

    The entire batch is sent through one Arb/Acb backend call. The returned
    midpoint values belong to `ComplexField(prec)`; this function does not
    implement symbolic gamma or exact integer/half-integer simplification.
    """

    field, native_points = _analytic_complex_batch(points, prec)
    backend = runtime.flint_backend()
    evaluator = getattr(backend, "complexGammaValues", runtime.undefined)
    if evaluator is runtime.undefined:
        raise RuntimeError("the complex-gamma batch backend is unavailable")
    native_values = evaluator(native_points, field.precision())
    return [field._fromNative(value) for value in native_values]


def complex_gamma(value: Any, prec: Any = 53) -> Any:
    """Numerically evaluate complex gamma in `ComplexField(prec)`."""

    return complex_gamma_values([value], prec=prec)[0]


def riemann_xi_values(points: Any, prec: Any = 53) -> list[Any]:
    """Numerically evaluate Riemann xi at a nonempty batch of points.

    Sage.js uses the no-half normalization
    `s*(s-1)*pi^(-s/2)*Gamma(s/2)*zeta(s)`, matching
    `RiemannZeta(prec).xi(s)`. The entire batch uses one backend call when the
    receipt-backed Arb/Acb batch is available.
    """

    field, native_points = _analytic_complex_batch(points, prec)
    backend = runtime.flint_backend()
    evaluator = getattr(backend, "riemannXiValues", runtime.undefined)
    if evaluator is runtime.undefined:
        scalar = getattr(backend, "riemannXiStandardValue", runtime.undefined)
        if scalar is runtime.undefined:
            raise RuntimeError("the Riemann-xi backend is unavailable")
        native_values = [scalar(point, field.precision()) for point in native_points]
    else:
        native_values = evaluator(native_points, field.precision())
    two = field(2)
    return [field._fromNative(value) * two for value in native_values]


def riemann_xi(value: Any, prec: Any = 53) -> Any:
    """Numerically evaluate no-half-normalized Riemann xi."""

    return riemann_xi_values([value], prec=prec)[0]


class _FlintRiemannZetaProvider:
    def _field(self, precision: Any) -> Any:
        return runtime.reflect.get(runtime.global_object, "ComplexField")(precision)

    def _point(self, field: Any, value: Any) -> Any:
        return _analytic_complex_point(field, value)

    def jet(
        self,
        value: Any,
        first_order: Any,
        count: Any,
        deflate: Any,
        precision: Any,
    ) -> list[Any]:
        field = self._field(precision)
        point = self._point(field, value)
        native_values = runtime.flint_backend().riemannZetaJet(
            point._native,
            first_order,
            count,
            deflate,
            precision,
        )
        return [field._fromNative(item) for item in native_values]

    def values(
        self,
        points: Any,
        derivative: Any,
        precision: Any,
    ) -> list[Any]:
        if derivative != 0:
            return [
                self.jet(point, derivative, 1, False, precision)[0] for point in points
            ]
        field = self._field(precision)
        native_points = [self._point(field, point)._native for point in points]
        native_values = runtime.flint_backend().riemannZetaValues(
            native_points, precision
        )
        return [field._fromNative(item) for item in native_values]

    def xi(self, value: Any, precision: Any) -> Any:
        field = self._field(precision)
        standard = field._fromNative(
            runtime.flint_backend().riemannXiStandardValue(
                self._point(field, value)._native, precision
            )
        )
        return standard * 2


_flint_riemann_zeta_provider = _FlintRiemannZetaProvider()


def _riemann_raise_nonfinite() -> Any:
    raise ValueError("Riemann-zeta point must be finite")


def RiemannZeta(prec: Any = 53) -> Any:
    """Return an arbitrary-precision FLINT/Arb Riemann-zeta evaluator."""

    return _riemann_zeta_module().RiemannZetaEvaluator(
        prec,
        provider=_flint_riemann_zeta_provider,
    )


def zeta(value: Any, derivative: Any = 0, prec: Any = None) -> Any:
    """Numerically evaluate the Riemann zeta function or one derivative."""

    if (
        prec is None
        and runtime.is_exact_integer(value)
        and runtime.integer_bigint(value) > 1
        and runtime.integer_bigint(derivative) == 0
    ):
        return _zeta_integer_greater_than_one(value)
    precision = 53 if prec is None else prec
    if prec is None and hasattr(value, "precision"):
        precision = value.precision()
    return RiemannZeta(precision).value(value, derivative=derivative)
