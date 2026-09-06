"""Bounded exact-field Gröbner computations with transformation certificates.

The sparse v2 contract carries actual field elements, not prime residues or
rational pairs. Its monomial algorithms are shared with the packed v1 oracle;
all coefficient operations are delegated to the explicit exact-field adapter.
No encoded auxiliary variable, conjecture, or probabilistic certificate is
used by this reference implementation.
"""

from __future__ import annotations

import json
from time import monotonic
from typing import Any

from sagejs.polynomial_algorithms import groebner_contract as engine

GENERIC_ABI = "sagejs.groebner.sparse/v2"


class GroebnerResourceError(RuntimeError):
    """An exact computation exceeded its budget; no partial answer is valid."""


class GroebnerBudget:
    """Per-operation resource envelope, shared by construction and checking."""

    def __init__(
        self,
        max_operations: int = 1000000,
        max_terms: int = 4096,
        max_pairs: int = 4096,
        max_generators: int = 64,
        max_exponent: int = 1048576,
        max_seconds: float = 30.0,
        max_output_bytes: int = 16777216,
    ) -> None:
        for value in [
            max_operations,
            max_terms,
            max_pairs,
            max_generators,
            max_exponent,
            max_output_bytes,
        ]:
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                raise ValueError("Gröbner resource limits must be positive integers")
        if isinstance(max_seconds, bool) or not 0 < max_seconds <= 86400:
            raise ValueError("Gröbner timeout must be positive and at most one day")
        self.max_operations = max_operations
        self.max_terms = max_terms
        self.max_pairs = max_pairs
        self.max_generators = max_generators
        self.max_exponent = max_exponent
        self.max_seconds = max_seconds
        self.max_output_bytes = max_output_bytes
        self.operations = 0
        self.started = monotonic()

    def charge(self) -> None:
        self.operations += 1
        if self.operations > self.max_operations:
            raise GroebnerResourceError(
                "exact Gröbner coefficient/monomial-operation limit exceeded"
            )
        if self.operations % 256 == 1 and monotonic() - self.started > self.max_seconds:
            raise GroebnerResourceError("exact Gröbner time limit exceeded")

    def check_terms(self, count: int) -> None:
        if count > self.max_terms:
            raise GroebnerResourceError(
                "exact Gröbner intermediate-term limit exceeded"
            )

    def check_pairs(self, count: int) -> None:
        if count > self.max_pairs:
            raise GroebnerResourceError("exact Gröbner pair limit exceeded")

    def check_generators(self, count: int) -> None:
        if count > self.max_generators:
            raise GroebnerResourceError("exact Gröbner generator limit exceeded")

    def check_exponents(self, exponents: Any, variables: int) -> None:
        if not isinstance(exponents, (tuple, list)) or len(exponents) != variables:
            raise ValueError("invalid generic Gröbner exponent vector")
        for value in exponents:
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise ValueError(
                    "generic Gröbner exponents must be nonnegative integers"
                )
            if value > self.max_exponent:
                raise GroebnerResourceError("exact Gröbner exponent limit exceeded")

    def check_output(self, size: int) -> None:
        if size > self.max_output_bytes:
            raise GroebnerResourceError(
                "exact Gröbner certificate-output limit exceeded"
            )


class GenericGroebnerRing(engine.GroebnerRing):
    """A distinct v2 domain; its descriptor cannot be a packed v1 receipt."""

    def __init__(
        self, variables: int, field: Any, order: str = "degrevlex", budget: Any = None
    ) -> None:
        if isinstance(variables, bool):
            raise ValueError("variable count must be an integer, not a boolean")
        super().__init__(variables, order, field.characteristic)
        if variables > 64:
            raise GroebnerResourceError(
                "exact Gröbner reference supports at most 64 variables"
            )
        self.coefficient_field = field
        self.budget = GroebnerBudget() if budget is None else budget

    @property
    def domain(self) -> str:
        return self.coefficient_field.family

    def descriptor(self) -> dict[str, Any]:
        return {
            "abi": GENERIC_ABI,
            "field": self.coefficient_field.descriptor(),
            "variables": self.variables,
            "order": self.order,
        }


def basis_with_certificate(generators: Any, ring: GenericGroebnerRing) -> Any:
    """Return an exact reduced basis and its full input transformation.

    Verification is deliberately performed before returning; budget exhaustion
    anywhere, including during verification, raises instead of returning a
    partial or unverified result.
    """
    source = []
    for polynomial in generators:
        ring.budget.check_generators(len(source) + 1)
        source.append(engine.canonical_polynomial(polynomial, ring))
    basis, transformation = engine.groebner_basis_reference(source, ring)
    report = engine.verify_groebner_certificate(source, basis, transformation, ring)
    if not report.valid:
        raise ArithmeticError(
            "exact Gröbner transformation certificate failed verification"
        )
    encode_certificate(basis, transformation, ring)
    return basis, transformation


def normal_form(polynomial: Any, basis: Any, ring: GenericGroebnerRing) -> Any:
    reducers = _polynomials(basis, ring.budget.max_pairs + 1, ring)
    result = engine.normal_form(polynomial, reducers, ring)
    encode_certificate((result,), (), ring)
    return result


def verify_certificate(
    generators: Any, basis: Any, transformation: Any, ring: GenericGroebnerRing
) -> Any:
    source = _polynomials(generators, ring.budget.max_generators, ring)
    candidate = _polynomials(basis, ring.budget.max_pairs + 1, ring)
    ring.budget.check_pairs(len(candidate) * (len(candidate) - 1) // 2)
    rows = []
    for row in transformation:
        if len(rows) >= len(candidate):
            return engine.GroebnerVerification(False, False, False, False)
        rows.append(_polynomials(row, ring.budget.max_generators, ring))
    encode_certificate(candidate, rows, ring)
    return engine.verify_groebner_certificate(source, candidate, rows, ring)


def _polynomials(values: Any, limit: int, ring: GenericGroebnerRing) -> Any:
    result = []
    for value in values:
        ring.budget.charge()
        if len(result) >= limit:
            raise GroebnerResourceError("exact Gröbner polynomial-count limit exceeded")
        result.append(engine.canonical_polynomial(value, ring))
    return tuple(result)


def encode_certificate(
    basis: Any, transformation: Any, ring: GenericGroebnerRing
) -> dict[str, Any]:
    """Encode coefficients canonically, enforcing the aggregate output budget.

    The ring descriptor fixes the target field and term order. Each coefficient
    uses the exact-field codec, never a printed expression or foreign handle.
    This is a representation of a certificate, not a claim it has been checked.
    """
    size = 0

    def polynomial_record(polynomial: Any) -> Any:
        nonlocal size
        ring.budget.charge()
        terms = []
        for coefficient, exponents in polynomial:
            ring.budget.check_terms(len(terms) + 1)
            ring.budget.check_exponents(exponents, ring.variables)
            record = [ring.coefficient_field.encode(coefficient), list(exponents)]
            size += (
                len(json.dumps(record, ensure_ascii=True, separators=(",", ":"))) + 1
            )
            ring.budget.check_output(size)
            terms.append(record)
        return terms

    encoded_basis = []
    for value in basis:
        count = len(encoded_basis) + 1
        ring.budget.check_pairs(count * (count - 1) // 2)
        encoded_basis.append(polynomial_record(value))
    encoded_transformation = []
    for row in transformation:
        if len(encoded_transformation) >= len(encoded_basis):
            raise ValueError("generic Gröbner transformation height exceeds basis")
        encoded_row = []
        for value in row:
            ring.budget.check_generators(len(encoded_row) + 1)
            encoded_row.append(polynomial_record(value))
        encoded_transformation.append(encoded_row)
    result = {
        "ring": ring.descriptor(),
        "basis": encoded_basis,
        "transformation": encoded_transformation,
    }
    ring.budget.check_output(
        len(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    )
    return result


def decode_certificate(record: Any, ring: GenericGroebnerRing) -> Any:
    """Decode into the requesting field; this does not certify ideal equality."""
    if not isinstance(record, dict) or set(record) != {
        "ring",
        "basis",
        "transformation",
    }:
        raise ValueError("invalid generic Gröbner certificate record")
    if record["ring"] != ring.descriptor():
        raise ValueError("generic Gröbner certificate ring mismatch")

    def polynomial(value: Any) -> Any:
        if not isinstance(value, list):
            raise ValueError("generic Gröbner polynomial must be a list")
        ring.budget.check_terms(len(value))
        terms = []
        for term in value:
            ring.budget.charge()
            if not isinstance(term, list) or len(term) != 2:
                raise ValueError("invalid generic Gröbner term record")
            coefficient, exponents = term
            ring.budget.check_exponents(exponents, ring.variables)
            terms.append((ring.coefficient_field.decode(coefficient), tuple(exponents)))
        result = engine.canonical_polynomial(terms, ring)
        if tuple(terms) != result:
            raise ValueError("generic Gröbner terms must be canonical")
        return result

    basis_records, row_records = record["basis"], record["transformation"]
    if not isinstance(basis_records, list) or not isinstance(row_records, list):
        raise ValueError("generic Gröbner basis and transformation must be lists")
    count = len(basis_records)
    ring.budget.check_pairs(count * (count - 1) // 2)
    if len(row_records) != count:
        raise ValueError("generic Gröbner transformation height mismatch")
    basis = tuple(polynomial(value) for value in basis_records)
    rows = []
    for row in row_records:
        if not isinstance(row, list):
            raise ValueError("generic Gröbner transformation row must be a list")
        ring.budget.check_generators(len(row))
        rows.append(tuple(polynomial(value) for value in row))
    transformation = tuple(rows)
    encode_certificate(basis, transformation, ring)
    return basis, transformation
