"""Exact extension-field Gröbner dispatch, independent of packed native ABIs.

The public polynomial representation remains resident where possible. Only
the algorithm boundary exchanges sparse terms carrying actual field elements.
Both proof policies currently use the same fully verified exact algorithm.
"""

from __future__ import annotations

from typing import Any

from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.generic_groebner import (
    GenericGroebnerRing,
    basis_with_certificate,
)


def contract_ring(ring: Any) -> GenericGroebnerRing:
    field = ExactField(ring.base_ring())
    if field.family != "finite-extension":
        raise NotImplementedError("extension ideal dispatch requires GF(p^d)")
    return GenericGroebnerRing(ring.ngens(), field, ring._order)


def sparse_terms(polynomial: Any) -> Any:
    """Copy the algorithm boundary without reinterpreting coefficients."""
    return tuple(
        (coefficient, tuple(exponents)) for coefficient, exponents in polynomial.terms()
    )


def groebner_basis(ideal: Any, algorithm: str, proof_required: bool) -> Any:
    if algorithm in ("flint", "msolve"):
        raise NotImplementedError(
            "this Groebner backend does not support extension coefficients; "
            "use algorithm='auto' or 'buchberger'"
        )
    if algorithm not in ("auto", "buchberger"):
        raise ValueError("unknown finite-extension Groebner basis algorithm")
    ring = ideal.ring()
    backend = "python:groebner-exact-gf-extension-v1"
    key = backend + (":proof" if proof_required else ":candidate")
    if key not in ideal._groebner_cache:
        source = tuple(sparse_terms(value) for value in ideal.gens())
        basis, transformation = basis_with_certificate(source, contract_ring(ring))
        # Do not populate either cache until verified results are materialized:
        # resource exhaustion must never publish a partial basis.
        values = [ring._from_sparse_terms(value) for value in basis]
        from sagejs.polynomial_algorithms.ideal import _sequence

        sequence = _sequence(values, ring)
        ideal._groebner_transform_cache[key] = transformation
        ideal._groebner_cache[key] = sequence
    ideal._groebner_metadata = {
        "backend": backend,
        "domain": "GF(p^d)",
        "characteristic": int(ring.base_ring().characteristic()),
        "order": ring._order,
        "proof": True,
        "proof_requested": proof_required,
        "deterministic": True,
        "probabilistic": False,
    }
    return ideal._groebner_cache[key]
