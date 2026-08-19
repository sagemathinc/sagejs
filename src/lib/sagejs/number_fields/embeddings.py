"""Certified archimedean metadata for absolute number fields.

The exact layer in this module is intentionally based on algebraic roots, not
floating point root counts.  Numerical images are derived from those exact
roots and are therefore stably ordered, but the current public `QQbar.n`
transport discards Arb radii.  They are consequently labelled numerical
approximations rather than rigorous enclosures.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


def _global(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if value is runtime.undefined:
        raise RuntimeError(name + " is not available in this runtime")
    return value


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root needs a nonnegative value")
    if value < 2:
        return value
    estimate = 1 << ((value.bit_length() + 1) // 2)
    while True:
        next_estimate = (estimate + value // estimate) // 2
        if next_estimate >= estimate:
            return estimate
        estimate = next_estimate


def _factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def _element_coefficients(element: Any) -> list[Any]:
    method = getattr(element, "list", None)
    if callable(method):
        return list(_untyped(method)())
    # The specialized imaginary-quadratic element stores ``real + imag*a``
    # and exposes those exact coordinates through indexed access.
    try:
        return [element[0], element[1]]
    except (IndexError, TypeError):
        raise TypeError("a number-field element must expose power-basis coordinates")


class ArchimedeanEmbedding:
    """One exact embedding, represented by the image of the field generator."""

    def __init__(self, index: int, kind: str, generator_image: Any) -> None:
        if kind not in ("real", "complex"):
            raise ValueError("embedding kind must be real or complex")
        self.index = index
        self.kind = kind
        self.generator_image = generator_image
        self.log_weight = 1 if kind == "real" else 2

    def __call__(self, element: Any) -> Any:
        coefficients = _element_coefficients(element)
        qqbar = _global("QQbar")
        result = qqbar(0)
        for coefficient in reversed(coefficients):
            result = result * self.generator_image + qqbar(coefficient)
        return result

    def approximate(self, element: Any, prec: int = 53) -> EmbeddingApproximation:
        if prec < 2:
            raise ValueError("precision must be at least 2")
        return EmbeddingApproximation(
            self.index,
            self.kind,
            self(element).n(prec),
            prec,
            "numerical-approximation",
        )

    def __repr__(self) -> str:
        return "Archimedean embedding #" + str(self.index) + " (" + self.kind + ")"


class EmbeddingApproximation:
    """A numerical image with an explicit, non-rigorous status label."""

    def __init__(
        self,
        index: int,
        kind: str,
        value: Any,
        precision: int,
        status: str,
    ) -> None:
        self.index = index
        self.kind = kind
        self.value = value
        self.precision = precision
        self.status = status

    def __repr__(self) -> str:
        return str(self.value) + " (" + self.status + ")"


class SignatureCertificate:
    """Replayable exact root-count certificate for a field signature."""

    def __init__(self, degree: int, real_count: int, complex_pair_count: int) -> None:
        self.degree = degree
        self.real_count = real_count
        self.complex_pair_count = complex_pair_count
        self.proof_status = "exact"
        if real_count + 2 * complex_pair_count != degree:
            raise ValueError("signature does not reproduce the field degree")

    def signature(self) -> tuple[int, int]:
        return (self.real_count, self.complex_pair_count)

    def verify(self, field: Any) -> bool:
        roots = _exact_roots(field)
        real_count = sum(1 for root in roots if root.is_real())
        return (
            len(roots) == self.degree
            and real_count == self.real_count
            and len(roots) - real_count == 2 * self.complex_pair_count
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/signature-certificate-v1",
            "degree": self.degree,
            "r1": self.real_count,
            "r2": self.complex_pair_count,
            "proof_status": self.proof_status,
        }


class ArchimedeanData:
    """Stable exact ordering of real embeddings and complex conjugate pairs."""

    def __init__(
        self,
        certificate: SignatureCertificate,
        embeddings: list[ArchimedeanEmbedding],
    ) -> None:
        self.certificate = certificate
        self.embeddings = tuple(embeddings)
        if (
            len(self.embeddings)
            != certificate.real_count + certificate.complex_pair_count
        ):
            raise ValueError("embedding representatives do not match the signature")

    def signature(self) -> tuple[int, int]:
        return self.certificate.signature()

    def numerical_images(self, element: Any, prec: int = 53) -> tuple[Any, ...]:
        return tuple(
            embedding.approximate(element, prec) for embedding in self.embeddings
        )

    def logarithmic_image(self, element: Any, prec: int = 53) -> tuple[float, ...]:
        """Return the standard weighted logarithmic image.

        Complex representatives have weight two.  A zero image is rejected;
        this function is intended for nonzero elements and units.
        """
        answer = []
        for embedding in self.embeddings:
            absolute_value = embedding(element).abs()
            approximation = float(absolute_value.n(prec))
            if approximation <= 0:
                raise ArithmeticError("a logarithmic embedding needs a nonzero element")
            answer.append(embedding.log_weight * runtime.math.log(approximation))
        return tuple(answer)


def _compare_exact(left: Any, right: Any) -> int:
    if left < right:
        return -1
    if left > right:
        return 1
    return 0


def _compare_roots(left: Any, right: Any) -> int:
    comparison = _compare_exact(left.real(), right.real())
    if comparison:
        return comparison
    return _compare_exact(left.imag(), right.imag())


def _insertion_sort_roots(values: list[Any]) -> list[Any]:
    answer: list[Any] = []
    for value in values:
        position = len(answer)
        while position and _compare_roots(value, answer[position - 1]) < 0:
            position -= 1
        answer.insert(position, value)
    return answer


def _exact_roots(field: Any) -> list[Any]:
    roots = list(
        field.defining_polynomial().roots(_global("QQbar"), multiplicities=False)
    )
    if len(roots) != field.degree():
        raise ArithmeticError("the defining polynomial did not yield all exact roots")
    return roots


def archimedean_data(field: Any) -> ArchimedeanData:
    """Return exact signature data and a deterministic embedding ordering."""
    roots = _exact_roots(field)
    real_roots = [root for root in roots if root.is_real()]
    upper_roots = [
        root
        for root in roots
        if not root.is_real() and _compare_exact(root.imag(), _global("AA")(0)) > 0
    ]
    real_roots = _insertion_sort_roots(real_roots)
    upper_roots = _insertion_sort_roots(upper_roots)
    complex_count = len(roots) - len(real_roots)
    if complex_count % 2 or len(upper_roots) * 2 != complex_count:
        raise ArithmeticError("complex roots did not split into conjugate pairs")
    certificate = SignatureCertificate(
        field.degree(), len(real_roots), complex_count // 2
    )
    embeddings = []
    for root in real_roots:
        embeddings.append(ArchimedeanEmbedding(len(embeddings), "real", root))
    for root in upper_roots:
        embeddings.append(ArchimedeanEmbedding(len(embeddings), "complex", root))
    return ArchimedeanData(certificate, embeddings)


def exact_signature(field: Any) -> tuple[int, int]:
    return archimedean_data(field).signature()


def exact_conjugate_sum_product(field: Any, element: Any) -> tuple[Any, Any]:
    """Return the exact sum and product over all embeddings in `QQbar`."""
    roots = _exact_roots(field)
    qqbar = _global("QQbar")
    total = qqbar(0)
    product = qqbar(1)
    coefficients = _element_coefficients(element)
    for root in roots:
        image = qqbar(0)
        for coefficient in reversed(coefficients):
            image = image * root + qqbar(coefficient)
        total += image
        product *= image
    return (total, product)


def exact_norm_is_unit(field: Any, element: Any) -> tuple[bool, int]:
    """Verify exactly that an integral element has norm `+1` or `-1`."""
    integral_test = getattr(element, "is_integral", None)
    is_integral = (
        bool(integral_test())
        if callable(integral_test)
        else element in field.maximal_order()
    )
    if not is_integral:
        return (False, 0)
    product = exact_conjugate_sum_product(field, element)[1]
    if product == 1:
        return (True, 1)
    if product == -1:
        return (True, -1)
    return (False, 0)


def certified_minkowski_class_bound(field: Any) -> int:
    """Return a coarse certified integral Minkowski class bound.

    The usual constant uses `(4/pi)^r2` and `sqrt(abs(D))`.  Replacing
    `pi` by the strict lower bound 3 and the square root by its integer
    ceiling gives a portable exact upper bound suitable for bounded searches.
    """
    degree = field.degree()
    _r1, r2 = exact_signature(field)
    discriminant = abs(int(field.discriminant()))
    root = _isqrt(discriminant)
    if root * root < discriminant:
        root += 1
    numerator = (4**r2) * _factorial(degree) * root
    denominator = (3**r2) * (degree**degree)
    return (numerator + denominator - 1) // denominator


__all__ = [
    "ArchimedeanData",
    "ArchimedeanEmbedding",
    "EmbeddingApproximation",
    "SignatureCertificate",
    "archimedean_data",
    "certified_minkowski_class_bound",
    "exact_conjugate_sum_product",
    "exact_norm_is_unit",
    "exact_signature",
]
