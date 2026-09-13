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
    GroebnerResourceError,
    basis_with_certificate,
)


def contract_ring(ring: Any) -> GenericGroebnerRing:
    field = ExactField(ring.base_ring())
    if field.family == "number-field":
        return ring._exact_context.workspace()
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
    number_field = ring.base_ring()._kind == "NumberField"
    backend = (
        "python:groebner-exact-number-field-v1"
        if number_field
        else "python:groebner-exact-gf-extension-v1"
    )
    key = backend + (":proof" if proof_required else ":candidate")
    if key not in ideal._groebner_cache:
        source = tuple(sparse_terms(value) for value in ideal.gens())
        contract = contract_ring(ring)
        if number_field:
            contract.coefficient_field.max_coordinate_bits = 0
        try:
            basis, transformation = basis_with_certificate(source, contract)
        except GroebnerResourceError as error:
            if not number_field:
                raise
            raise GroebnerResourceError(
                str(error)
                + "; charged_operations="
                + str(contract.budget.operations)
                + "; max_coordinate_bits="
                + str(contract.coefficient_field.max_coordinate_bits)
            ) from error
        # Do not populate either cache until verified results are materialized:
        # resource exhaustion must never publish a partial basis.
        values = [ring._from_sparse_terms(value) for value in basis]
        from sagejs.polynomial_algorithms.ideal import _sequence

        sequence = _sequence(values, ring)
        ideal._groebner_transform_cache[key] = transformation
        ideal._groebner_cache[key] = sequence
        if not hasattr(ideal, "_groebner_statistics_cache"):
            ideal._groebner_statistics_cache = {}
        ideal._groebner_statistics_cache[key] = {
            "charged_operations": contract.budget.operations,
            "output_terms": sum(len(value) for value in basis),
            "max_coordinate_bits": contract.coefficient_field.max_coordinate_bits
            if number_field
            else None,
        }
    ideal._groebner_metadata = {
        "backend": backend,
        "domain": "NumberField" if number_field else "GF(p^d)",
        "characteristic": 0 if number_field else int(ring.base_ring().characteristic()),
        "order": ring._order,
        "proof": True,
        "proof_requested": proof_required,
        "deterministic": True,
        "probabilistic": False,
        "statistics": dict(ideal._groebner_statistics_cache[key]),
    }
    return ideal._groebner_cache[key]
