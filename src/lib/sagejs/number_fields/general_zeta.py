"""Exact metadata and resource policy for general Dedekind zeta functions.

This module contains no analytic continuation algorithm.  It freezes the exact
input contract shared by the readable evaluator and future accelerated
implementations:

* the field degree, discriminant, and exact signature;
* a coefficient provider returning `[a_1, ..., a_B]`;
* deterministic limits checked before coefficient generation; and
* serializable route and proof-status diagnostics.

The signature is computed from exact algebraic roots.  A numerical root whose
imaginary part merely appears small is never accepted as evidence that an
embedding is real.
"""

from __future__ import annotations

from typing import Any, Protocol, TypedDict, runtime_checkable

__all__ = [
    "AnalyticZetaLimits",
    "CoefficientPrefixProvider",
    "DedekindZetaMetadata",
    "ExactEmbeddingMetadata",
    "GeneralZetaResourceError",
    "exact_embedding_metadata",
    "exact_signature",
    "fetch_exact_coefficients",
    "make_zeta_metadata",
    "trivial_zero_order",
]


@runtime_checkable
class CoefficientPrefixProvider(Protocol):
    """Project-3 exact coefficient-prefix protocol.

    `coefficients(bound)` returns exactly `bound` ordinary exact integers,
    indexed as `[a_1, ..., a_bound]`.  In particular, `a_1` is at index
    zero.  Providers may cache and extend their internal prefix, but a caller
    never splices prefixes produced for different fields.
    """

    def coefficients(self, bound: int) -> list[int]: ...


class ExactEmbeddingMetadata(TypedDict):
    """Exact signature certificate and stable embedding representatives."""

    version: int
    degree: int
    r1: int
    r2: int
    real_roots: tuple[Any, ...]
    complex_representatives: tuple[Any, ...]
    certificate: str
    ordering: str


class DedekindZetaMetadata(TypedDict):
    """Exact arithmetic metadata in the frozen completion normalization."""

    version: int
    degree: int
    discriminant: int
    r1: int
    r2: int
    functional_equation_sign: int
    gamma_normalization: str
    pole_locations: tuple[int, int]
    proof_status: str


class AnalyticZetaLimits:
    """Deterministic limits checked before an analytic reference request."""

    def __init__(
        self,
        *,
        maximum_precision_bits: int = 512,
        maximum_abs_imaginary: float = 64.0,
        maximum_abs_real_offset: float = 16.0,
        maximum_coefficients: int = 100_000,
        maximum_quadrature_nodes: int = 8_192,
        maximum_coefficient_terms: int = 100_000_000,
        maximum_derivative_order: int = 8,
        maximum_batch_points: int = 64,
    ) -> None:
        self.maximum_precision_bits = int(maximum_precision_bits)
        self.maximum_abs_imaginary = float(maximum_abs_imaginary)
        self.maximum_abs_real_offset = float(maximum_abs_real_offset)
        self.maximum_coefficients = int(maximum_coefficients)
        self.maximum_quadrature_nodes = int(maximum_quadrature_nodes)
        self.maximum_coefficient_terms = int(maximum_coefficient_terms)
        self.maximum_derivative_order = int(maximum_derivative_order)
        self.maximum_batch_points = int(maximum_batch_points)


class GeneralZetaResourceError(ValueError):
    """A request exceeded a deterministic limit before expensive work."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


def _root_is_real(root: Any) -> bool:
    predicate = getattr(root, "is_real", None)
    if predicate is None:
        raise TypeError("exact algebraic roots must provide is_real()")
    return bool(predicate())


def _root_real_part(root: Any) -> Any:
    part = getattr(root, "real", None)
    return part() if part is not None else root


def _root_imaginary_part(root: Any) -> Any:
    part = getattr(root, "imag", None)
    if part is None:
        raise TypeError("exact complex algebraic roots must provide imag()")
    return part()


def exact_embedding_metadata(field: Any) -> ExactEmbeddingMetadata:
    """Return exact signature data and a stable ordering of embeddings.

    The defining polynomial is squarefree and irreducible for an absolute
    simple number field.  Its roots are requested in `QQbar` so reality and
    the sign of an imaginary part are exact algebraic predicates.  Real roots
    are ordered increasingly.  From every nonreal conjugate pair, the root in
    the exact upper half-plane is retained, ordered lexicographically by exact
    real and then imaginary part.
    """
    degree = int(field.degree())
    archimedean_factory = getattr(field, "archimedean_data", None)
    if callable(archimedean_factory):
        data: Any = archimedean_factory()
        signature = data.signature()
        real_roots = tuple(
            embedding.generator_image
            for embedding in data.embeddings
            if embedding.kind == "real"
        )
        upper_roots = tuple(
            embedding.generator_image
            for embedding in data.embeddings
            if embedding.kind == "complex"
        )
        return {
            "version": 1,
            "degree": degree,
            "r1": int(signature[0]),
            "r2": int(signature[1]),
            "real_roots": real_roots,
            "complex_representatives": upper_roots,
            "certificate": "exact archimedean root certificate",
            "ordering": "real increasing, then upper-half-plane lexicographic (real,imag)",
        }

    import sagejs as sage

    polynomial = field.defining_polynomial()
    sage_module: Any = sage
    exact_complex_field = sage_module.QQbar
    roots = list(polynomial.roots(exact_complex_field, multiplicities=False))
    if len(roots) != degree:
        raise ArithmeticError("the defining polynomial did not have degree-many roots")

    real_roots = [root for root in roots if _root_is_real(root)]
    real_roots.sort(key=_root_real_part)
    upper_roots = [
        root
        for root in roots
        if not _root_is_real(root) and _root_imaginary_part(root) > 0
    ]
    upper_roots.sort(
        key=lambda root: (_root_real_part(root), _root_imaginary_part(root))
    )
    r1 = len(real_roots)
    r2 = len(upper_roots)
    if r1 + 2 * r2 != degree:
        raise ArithmeticError("exact roots did not form real roots and conjugate pairs")
    return {
        "version": 1,
        "degree": degree,
        "r1": r1,
        "r2": r2,
        "real_roots": tuple(real_roots),
        "complex_representatives": tuple(upper_roots),
        "certificate": "exact QQbar root reality and conjugation",
        "ordering": "real increasing, then upper-half-plane lexicographic (real,imag)",
    }


def exact_signature(field: Any) -> tuple[int, int]:
    """Return `(r1,r2)` using exact algebraic root classification."""
    metadata = exact_embedding_metadata(field)
    return metadata["r1"], metadata["r2"]


def make_zeta_metadata(field: Any) -> DedekindZetaMetadata:
    """Build the exact metadata consumed by analytic evaluators."""
    embeddings = exact_embedding_metadata(field)
    discriminant = int(field.discriminant())
    if discriminant == 0:
        raise ArithmeticError("a number field must have nonzero discriminant")
    return {
        "version": 1,
        "degree": embeddings["degree"],
        "discriminant": discriminant,
        "r1": embeddings["r1"],
        "r2": embeddings["r2"],
        "functional_equation_sign": 1,
        "gamma_normalization": (
            "|D|^(s/2) * Gamma_R(s)^r1 * Gamma_C(s)^r2; "
            "Gamma_R=pi^(-s/2)Gamma(s/2), "
            "Gamma_C=2(2*pi)^(-s)Gamma(s)"
        ),
        "pole_locations": (0, 1),
        "proof_status": "exact",
    }


def fetch_exact_coefficients(provider: Any, bound: int) -> list[int]:
    """Return and validate the exact Project-3 prefix `[a_1,...,a_bound]`."""
    requested = int(bound)
    if requested < 1:
        raise ValueError("coefficient bound must be positive")
    method = getattr(provider, "coefficients", None)
    if method is None:
        if not callable(provider):
            raise TypeError(
                "coefficient provider must be callable or define coefficients()"
            )
        values: Any = provider(requested)
    else:
        values = method(requested)
    answer = list(values)
    if len(answer) != requested:
        raise ValueError("coefficient provider must return exactly [a_1,...,a_bound]")
    normalized: list[int] = []
    for value in answer:
        integer = int(value)
        if integer != value or integer < 0:
            raise ValueError("Dedekind-zeta coefficients must be nonnegative integers")
        normalized.append(integer)
    if normalized[0] != 1:
        raise ValueError("a_1 must equal 1")
    return normalized


def trivial_zero_order(metadata: DedekindZetaMetadata, integer: int) -> int:
    """Return the exact order of the trivial zero at a nonpositive integer.

    At zero the order is `r1+r2-1`.  At a negative even integer it is
    `r1+r2`, and at a negative odd integer it is `r2`.  A nontrivial point
    returns zero.
    """
    value = int(integer)
    r1 = metadata["r1"]
    r2 = metadata["r2"]
    if value == 0:
        return r1 + r2 - 1
    if value < 0:
        return r1 + r2 if value % 2 == 0 else r2
    return 0
