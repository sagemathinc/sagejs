# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Exact, incomplete replay of Rust compact class-group evidence."""

from __future__ import annotations

import hashlib
import itertools
import json
from typing import Any, Sequence, cast

import sagejs as sage
from sagejs.number_fields.class_group_matrix import (
    RelationMatrixError,
    SparseRelationRow,
    _determinant_exact,
    _gcd_extended,
    extract_relation_presentation,
)
from sagejs.number_fields.compact_relation_presentation import (
    CompactRelationPresentation,
)
from sagejs.number_fields.rust_class_group_preparation import (
    _element_from_prepared_coordinates,
    _ideal_from_prepared_descriptor,
    _input_integer,
    _prepared_basis_elements,
    _prepared_input_matches_authoritative,
    _validate_prime_hnf_lattice,
    prepare_cubic_for_rust,
)

PREPARED_RESULT_SCHEMA = "sagejs.rust-class-group/prepared-cubic-class-unit-v2"
RELATION_LATTICE_SCHEMA = "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1"
COMPACT_CERTIFICATE_SCHEMA = (
    "sagejs.rust-class-group/compact-presentation-certificate-v1"
)
ARBITRARY_IDEAL_QUERY_SCHEMA = "sagejs.rust-class-group/arbitrary-ideal-class-query-v1"
PUBLIC_ARBITRARY_IDEAL_QUERY_SCHEMA = (
    "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1"
)
AUTHENTICATED_SERVICE_CLASS_GROUP_SCHEMA = "sagejs.class-groups/compact-summary-v1"
AUTHENTICATED_SERVICE_IDEAL_QUERY_SCHEMA = PUBLIC_ARBITRARY_IDEAL_QUERY_SCHEMA
PUBLICATION_CANDIDATE_SCHEMA = (
    "sagejs.rust-class-group/public-cubic-publication-candidate-v2"
)
DIAGNOSTICS_SCHEMA = (
    "sagejs.rust-class-group/compact-presentation-adapter-diagnostics-v1"
)

# These are verifier-owned limits, not claims about producer resource use.
# Compact replay materializes a square `columns x columns` submatrix and uses
# exact fraction-free elimination.  These caps are local verifier policy, not
# producer resource claims.
_MAX_COLUMNS = 256
_MAX_SURPLUS = 64
_MAX_INVARIANTS = 1_024
_MAX_DENSE_CERTIFICATE_ENTRIES = 8_000_000
_MAX_DENSE_DETERMINANT_ENTRIES = 4_096
_MAX_DENSE_DETERMINANT_WORK = 262_144
_MAX_DENSE_MINOR_TRIALS = 20_000
_MAX_DEPENDENCY_MINOR_WITNESSES = 256
_MAX_DEPENDENCY_MINOR_DETERMINANT_WORK = 128
_MAX_EXACT_INTEGER_BITS = 4_096
_MAX_EXACT_DECIMAL_DIGITS = 1_234
_MAX_ARBITRARY_IDEAL_VALUATION = 256
_MAX_PUBLICATION_COLUMNS = 2_048
_MAX_PUBLICATION_RELATIONS = 2_112
_MAX_PUBLICATION_FACTOR_TERMS = 10_000_000
_MAX_ANALYTIC_INTEGER_BITS = 16_384
_MAX_ANALYTIC_DECIMAL_DIGITS = 5_000

_PREPARED_KEYS = {
    "analyticCompletion",
    "classMap",
    "inputId",
    "kernel",
    "mathematicalBoundary",
    "polynomialAscending",
    "presentationIndexEvidence",
    "qualificationStatus",
    "reconstructedUnitLattice",
    "relationCollectionProfile",
    "relationLatticeEvidence",
    "relations",
    "schema",
    "timingsNanoseconds",
    "usesClassGroupAnswersAsInput",
    "usesOracleAsInput",
}
_CERTIFICATE_KEYS = {
    "groupOrder",
    "invariantFactors",
    "latticeIndexEvidence",
    "modularClassMap",
    "qualificationStatus",
    "relationDependencies",
    "relationShape",
    "schema",
    "sourceInputId",
    "standardGeneratorLifts",
    "verified",
}
_VERIFIED_KEYS = {
    "classMapAnnihilatesEveryRelation",
    "dependencyCountEqualsRowsMinusColumns",
    "dependencyLatticeEqualsIntegralLeftKernel",
    "dependencyLatticeIsPrimitive",
    "dependencyRankEqualsRowsMinusColumns",
    "everyDependencyReplaysToZero",
    "fullRelationLatticeIndexEqualsGroupOrder",
    "generatorOrderWitnessesReplayExactly",
    "invariantProductEqualsClaimedClassNumber",
    "projectedDependencyIndexDividesSquareDeterminant",
    "standardGeneratorLiftsMapToCoordinateBasis",
}
_REMAINING_GAPS = (
    "rust-arbitrary-ideal-query-product-invocation",
    "units-torsion-regulator-and-saturation",
    "conditional-factor-base-and-completion-proof-replay",
    "request-and-resource-binding",
    "executable-artifact-identity",
)
_ACCEPTED_JOINS = (
    "canonical-field-to-prepared-input",
    "producer-polynomial-and-input-identity",
    "complete-relation-matrix-shape",
    "exact-compact-relation-lattice-index",
    "live-factor-base-primes-and-principal-relation-equalities",
    "standard-factor-base-coordinate-map",
    "standard-generator-lifts-and-order-combinations",
)


def _untyped(value: Any) -> Any:
    return value


def _closed(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise RelationMatrixError(label + " has an unsupported schema")
    return value


def _natural(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RelationMatrixError(label + " is not a natural number")
    return value


def _positive_natural(value: Any, label: str) -> int:
    answer = _natural(value, label)
    if answer == 0:
        raise RelationMatrixError(label + " must be positive")
    if answer.bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return answer


def _bounded_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise RelationMatrixError(label + " is not an exact integer")
    if abs(value).bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return value


def _positive_decimal(value: Any, label: str) -> int:
    if (
        not isinstance(value, str)
        or not value
        or value[0] == "0"
        or len(value) > _MAX_EXACT_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in value)
    ):
        raise RelationMatrixError(label + " is not a positive decimal")
    answer = int(value)
    if answer.bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return answer


def _signed_decimal(value: Any, label: str, *, nonzero: bool = False) -> int:
    if not isinstance(value, str) or not value:
        raise RelationMatrixError(label + " is not a canonical decimal")
    digits = value[1:] if value.startswith("-") else value
    if (
        not digits
        or (len(digits) > 1 and digits[0] == "0")
        or len(digits) > _MAX_EXACT_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in digits)
        or value == "-0"
    ):
        raise RelationMatrixError(label + " is not a canonical decimal")
    answer = int(value)
    if abs(answer).bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    if nonzero and answer == 0:
        raise RelationMatrixError(label + " must be nonzero")
    return answer


def _analytic_decimal(value: Any, label: str) -> int:
    """Decode one canonical directed-rounding endpoint under its own cap."""
    if not isinstance(value, str) or not value:
        raise RelationMatrixError(label + " is not a canonical decimal")
    digits = value[1:] if value.startswith("-") else value
    if (
        not digits
        or (len(digits) > 1 and digits[0] == "0")
        or len(digits) > _MAX_ANALYTIC_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in digits)
        or value == "-0"
    ):
        raise RelationMatrixError(label + " is not a canonical decimal")
    answer = int(value)
    if abs(answer).bit_length() > _MAX_ANALYTIC_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the analytic integer bit limit")
    return answer


def _sha256_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        raise RelationMatrixError(label + " is not a SHA-256 identifier")
    digest = value[7:]
    if len(digest) != 64 or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise RelationMatrixError(label + " is not a canonical SHA-256 identifier")
    return value


def _canonical_json(value: Any, label: str) -> Any:
    try:
        return json.loads(
            json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        )
    except (TypeError, ValueError) as error:
        raise RelationMatrixError(label + " is not canonical JSON data") from error


def _identity(value: Any) -> str:
    encoded = json.dumps(
        _canonical_json(value, "evidence"),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _sparse_vector(
    terms: Any,
    length: int,
    index_key: str,
    coefficient_key: str,
    label: str,
    *,
    decimal_coefficients: bool = True,
) -> tuple[int, ...]:
    if not isinstance(terms, list):
        raise RelationMatrixError(label + " terms must be a list")
    answer = [0] * length
    previous = -1
    for term in terms:
        if not isinstance(term, dict) or set(term) != {index_key, coefficient_key}:
            raise RelationMatrixError(label + " has malformed terms")
        index = _natural(term[index_key], label + " index")
        if not previous < index < length:
            raise RelationMatrixError(label + " index is out of bounds")
        if decimal_coefficients:
            coefficient = _signed_decimal(
                term[coefficient_key], label + " coefficient", nonzero=True
            )
        else:
            coefficient = _bounded_integer(
                term[coefficient_key], label + " coefficient"
            )
            if coefficient == 0:
                raise RelationMatrixError(label + " coefficient is invalid")
        answer[index] = coefficient
        previous = index
    return tuple(answer)


def _sparse_relation(terms: Any, columns: int) -> SparseRelationRow:
    if not isinstance(terms, list):
        raise RelationMatrixError("relation terms must be a list")
    entries: list[tuple[int, int]] = []
    previous = -1
    for term in terms:
        if not isinstance(term, dict) or set(term) != {
            "factorBaseIndexZeroBased",
            "exponent",
        }:
            raise RelationMatrixError("relation has malformed terms")
        index = _natural(term["factorBaseIndexZeroBased"], "relation index")
        exponent = _bounded_integer(term["exponent"], "relation coefficient")
        if not previous < index < columns:
            raise RelationMatrixError("relation index is out of bounds")
        if exponent <= 0:
            raise RelationMatrixError("relation coefficient is invalid")
        entries.append((index, exponent))
        previous = index
    return SparseRelationRow(columns, entries)


def _dependency_minor_key(minor: tuple[Sequence[int], int]) -> tuple[int, ...]:
    return tuple(_natural(index, "dependency minor index") for index in minor[0])


class _TrustedServiceFactorBase:
    """Lazily materialize ideals from an authenticated service publication."""

    def __init__(
        self,
        field: Any,
        order: Any,
        basis: Sequence[Any],
        descriptors: Sequence[dict[str, Any]],
    ) -> None:
        self._field = field
        self._order = order
        self._basis = tuple(basis)
        self._descriptors = tuple(descriptors)
        self._cache: dict[int, Any] = {}

    def __len__(self) -> int:
        return len(self._descriptors)

    def __getitem__(self, index: int) -> Any:
        position = _natural(index, "factor-base index")
        if position >= len(self):
            raise IndexError("factor-base index is out of bounds")
        cached = self._cache.get(position)
        if cached is not None:
            return cached
        descriptor = self._descriptors[position]
        exported = _ideal_from_prepared_descriptor(
            self._field,
            self._order,
            cast(list[Any], self._basis),
            descriptor,
        )
        prime_ideals = __import__(
            "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
        )
        answer = prime_ideals.NumberFieldPrimeIdeal(
            self._order,
            exported._basis_rows,
            int(descriptor["prime"]),
            int(descriptor["ramification"]),
            int(descriptor.get("residueDegree", 1)),
            _candidate_token=prime_ideals._PACKED_CANDIDATE_TOKEN,
        )
        self._cache[position] = answer
        return answer

    def __iter__(self) -> Any:
        for index in range(len(self)):
            yield self[index]

    def reconstruct(self, row: Sequence[int]) -> Any:
        if len(row) != len(self):
            raise ValueError("a relation row has the wrong factor-base width")
        answer = None
        for index, exponent in enumerate(row):
            if exponent:
                power = self[index] ** int(exponent)
                answer = power if answer is None else answer * power
        return self._order.ideal(1) if answer is None else answer


class _TrustedServicePresentation:
    """Small quotient view sealed by the authenticated Rust service."""

    def __init__(
        self,
        column_count: int,
        row_count: int,
        invariants: Sequence[int],
        class_map_rows: Sequence[Sequence[int]],
        generator_transforms: Sequence[Sequence[int]],
    ) -> None:
        self.column_count = int(column_count)
        self.row_count = int(row_count)
        self.invariants = tuple(int(value) for value in invariants)
        self.class_map_rows = tuple(tuple(row) for row in class_map_rows)
        self.generator_transforms = tuple(tuple(row) for row in generator_transforms)
        self.order = 1
        for value in self.invariants:
            self.order *= value
        if not self.verify():
            raise RelationMatrixError("authenticated service presentation is malformed")

    def class_coordinates(self, vector: Sequence[int]) -> tuple[int, ...]:
        if len(vector) != self.column_count:
            raise RelationMatrixError("ambient coordinate vector has the wrong length")
        answer = [0] * len(self.invariants)
        for coefficient, row in zip(vector, self.class_map_rows, strict=True):
            if coefficient:
                for index, (value, modulus) in enumerate(
                    zip(row, self.invariants, strict=True)
                ):
                    answer[index] = (answer[index] + coefficient * value) % modulus
        return tuple(answer)

    def lift_class_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        if len(coordinates) != len(self.invariants):
            raise RelationMatrixError("class coordinate vector has the wrong length")
        answer = [0] * self.column_count
        for coefficient, row, modulus in zip(
            coordinates, self.generator_transforms, self.invariants, strict=True
        ):
            normalized = int(coefficient) % modulus
            if normalized:
                for index, value in enumerate(row):
                    answer[index] += normalized * value
        return tuple(answer)

    def verify(self) -> bool:
        if (
            self.column_count <= 0
            or self.row_count <= self.column_count
            or len(self.class_map_rows) != self.column_count
            or len(self.generator_transforms) != len(self.invariants)
        ):
            return False
        previous = 1
        for invariant in self.invariants:
            if invariant <= 1 or invariant % previous:
                return False
            previous = invariant
        if any(len(row) != len(self.invariants) for row in self.class_map_rows):
            return False
        if any(len(row) != self.column_count for row in self.generator_transforms):
            return False
        for index, transform in enumerate(self.generator_transforms):
            expected = tuple(
                1 if coordinate == index else 0
                for coordinate in range(len(self.invariants))
            )
            if self.class_coordinates(transform) != expected:
                return False
        return True


class _LazyRelationElements:
    """Materialize only relation generators referenced by public witnesses."""

    def __init__(
        self,
        field: Any,
        basis: Sequence[Any],
        records: Sequence[dict[str, Any]],
    ) -> None:
        self._field = field
        self._basis = tuple(basis)
        self._records = tuple(records)
        self._cache: dict[int, Any] = {}

    def __len__(self) -> int:
        return len(self._records)

    def __getitem__(self, index: int) -> Any:
        position = _natural(index, "relation index")
        if position >= len(self):
            raise IndexError("relation index is out of bounds")
        cached = self._cache.get(position)
        if cached is not None:
            return cached
        record = self._records[position]
        if (
            not isinstance(record, dict)
            or record.get("relationIndexZeroBased") != position
        ):
            raise RelationMatrixError("publication relation index is not canonical")
        coordinates = record.get("principalElementIntegralBasisCoordinates")
        if not isinstance(coordinates, list) or len(coordinates) != len(self._basis):
            raise RelationMatrixError("publication principal element is malformed")
        answer = _element_from_prepared_coordinates(
            self._field,
            cast(list[Any], self._basis),
            tuple(
                _signed_decimal(value, "principal coordinate") for value in coordinates
            ),
        )
        self._cache[position] = answer
        return answer


class RustCompactPresentationReplay:
    """A verified factor-base quotient map, explicitly not an ideal-class map."""

    def __init__(
        self,
        presentation: Any,
        field: Any,
        order: Any,
        prepared_basis: Sequence[Any],
        factor_base_ideals: Any,
        *,
        producer_input_id: str,
        prepared_result_identity: str,
        certificate_identity: str,
        factored_units: Sequence[Any] = (),
        unit_certificates: Sequence[Any] = (),
        relation_elements: Any = (),
        query_callback: Any = None,
        query_resources: Any = None,
        polynomial_ascending: Any = None,
        trusted_service_core: bool = False,
    ) -> None:
        if not presentation.verify():
            raise RelationMatrixError("the compact relation presentation is invalid")
        if len(factor_base_ideals) != presentation.column_count:
            raise RelationMatrixError("the live factor base has the wrong length")
        self._presentation = presentation
        self._field = field
        self._order = order
        self._prepared_basis = list(prepared_basis)
        lazy_factor_base = hasattr(factor_base_ideals, "reconstruct")
        self._factor_base_ideals = (
            factor_base_ideals if lazy_factor_base else tuple(factor_base_ideals)
        )
        relations = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=["class_group_relations"],
        )
        self._ideal_reconstructor = (
            factor_base_ideals
            if lazy_factor_base
            else relations.FactorBaseIdealReconstructor(order, factor_base_ideals)
        )
        self._factor_ideal_over_base = relations.factor_ideal_over_base
        self.producer_input_id = producer_input_id
        self.prepared_result_identity = prepared_result_identity
        self.certificate_identity = certificate_identity
        self._factored_units = tuple(factored_units)
        self._unit_certificates = tuple(unit_certificates)
        self._relation_elements = (
            relation_elements
            if isinstance(relation_elements, _LazyRelationElements)
            else tuple(relation_elements)
        )
        self._trusted_service_core = bool(trusted_service_core)
        if (
            self._relation_elements
            and len(self._relation_elements) != self.relation_count
        ):
            raise RelationMatrixError("relation-element count mismatch")
        if query_callback is not None and not callable(query_callback):
            raise TypeError("the resident ideal query interface must be callable")
        self._query_callback = query_callback
        self._query_resources = query_resources
        self._polynomial_ascending = (
            _canonical_json(polynomial_ascending, "query polynomial")
            if polynomial_ascending is not None
            else None
        )

    @property
    def invariants(self) -> tuple[int, ...]:
        return self._presentation.invariants

    @property
    def factor_base_size(self) -> int:
        return self._presentation.column_count

    @property
    def relation_count(self) -> int:
        return self._presentation.row_count

    def factored_units(self) -> tuple[Any, ...]:
        """Return exact compact units authenticated by the relation replay."""
        return self._factored_units

    def verify_factored_units(self) -> bool:
        """Replay every exact compact-unit certificate."""
        return bool(
            len(self._factored_units) == len(self._unit_certificates)
            and all(
                certificate.verify(unit)
                for certificate, unit in zip(
                    self._unit_certificates, self._factored_units, strict=True
                )
            )
        )

    def class_coordinates(
        self, factor_base_exponents: Sequence[int]
    ) -> tuple[int, ...]:
        """Map a factor-base exponent vector to the proved quotient coordinates."""
        checked = tuple(
            _bounded_integer(value, "factor-base exponent")
            for value in factor_base_exponents
        )
        return self._presentation.class_coordinates(checked)

    def factor_base_class_coordinates(self, index: int) -> tuple[int, ...]:
        position = _natural(index, "factor-base index")
        if position >= self.factor_base_size:
            raise RelationMatrixError("factor-base index is out of bounds")
        vector = [0] * self.factor_base_size
        vector[position] = 1
        return self.class_coordinates(vector)

    def factor_base_ideal(self, index: int) -> Any:
        """Return one independently reconstructed live maximal-order prime."""
        position = _natural(index, "factor-base index")
        if position >= self.factor_base_size:
            raise RelationMatrixError("factor-base index is out of bounds")
        return self._factor_base_ideals[position]

    def smooth_ideal_class_coordinates(self, ideal: Any) -> tuple[int, ...]:
        """Map an ideal whose complete support lies in the live factor base."""
        row = self._factor_ideal_over_base(ideal, self._factor_base_ideals)
        return self.class_coordinates(row)

    def representative_ideal(self, coordinates: Sequence[int]) -> Any:
        """Construct a live ideal representing verified class coordinates."""
        return self._ideal_reconstructor.reconstruct(
            self.lift_class_coordinates(coordinates)
        )

    def class_generator_ideal(self, index: int) -> Any:
        """Return the live representative of one invariant-factor generator."""
        position = _natural(index, "class-generator index")
        coordinates = [0] * len(self.invariants)
        if position >= len(coordinates):
            raise RelationMatrixError("class-generator index is out of bounds")
        coordinates[position] = 1
        return self.representative_ideal(coordinates)

    def replay_arbitrary_ideal_class_certificate(
        self, ideal: Any, certificate: dict[str, Any]
    ) -> tuple[int, ...]:
        """Replay `(alpha) = ideal * product(P_i^e_i)` and derive its class."""
        if getattr(ideal, "ring", lambda: None)() is not self._order:
            raise TypeError("the queried ideal belongs to another maximal order")
        if ideal.is_zero():
            raise ValueError("the zero ideal has no ideal class")
        relative = ideal.basis_matrix() * self._order._basis_inverse_matrix()
        if any(value._denominator != 1 for row in relative.rows() for value in row):
            raise ValueError(
                "the Rust arbitrary-ideal boundary requires an integral ideal"
            )

        keys = {
            "classCoordinates",
            "compactCertificateIdentity",
            "factorBaseSize",
            "maximalOrderEvidence",
            "preparedResultIdentity",
            "presentationZero",
            "principalElementIntegralBasisCoordinates",
            "quotientFactorBaseExponents",
            "schema",
            "sourceInputId",
        }
        certificate = _closed(certificate, keys, "arbitrary-ideal certificate")
        if certificate["schema"] != ARBITRARY_IDEAL_QUERY_SCHEMA:
            raise RelationMatrixError("unsupported arbitrary-ideal certificate")
        if (
            certificate["sourceInputId"] != self.producer_input_id
            or certificate["preparedResultIdentity"] != self.prepared_result_identity
            or certificate["compactCertificateIdentity"] != self.certificate_identity
        ):
            raise RelationMatrixError("arbitrary-ideal certificate authority mismatch")
        if certificate["maximalOrderEvidence"] != "rust-proved-maximal-order":
            raise RelationMatrixError("unsupported maximal-order evidence")
        if (
            _natural(certificate["factorBaseSize"], "factor-base size")
            != self.factor_base_size
        ):
            raise RelationMatrixError("arbitrary-ideal factor-base width mismatch")

        quotient = _sparse_vector(
            certificate["quotientFactorBaseExponents"],
            self.factor_base_size,
            "factorBaseIndexZeroBased",
            "exponent",
            "quotient factor-base vector",
        )
        if any(
            exponent < 0 or exponent > _MAX_ARBITRARY_IDEAL_VALUATION
            for exponent in quotient
        ):
            raise RelationMatrixError(
                "arbitrary-ideal exponent exceeds the verifier limit"
            )
        coordinates = certificate["principalElementIntegralBasisCoordinates"]
        if not isinstance(coordinates, list) or len(coordinates) != 3:
            raise RelationMatrixError("principal element has the wrong dimension")
        alpha = _element_from_prepared_coordinates(
            self._field,
            self._prepared_basis,
            tuple(
                _signed_decimal(value, "principal coordinate") for value in coordinates
            ),
        )
        if alpha.is_zero():
            raise RelationMatrixError("principal element must be nonzero")
        quotient_ideal = self._ideal_reconstructor.reconstruct(quotient)
        if self._order.ideal(alpha) != ideal * quotient_ideal:
            raise ArithmeticError(
                "arbitrary-ideal principal equality failed exact replay"
            )

        derived = self.class_coordinates(tuple(-value for value in quotient))
        claimed_raw = certificate["classCoordinates"]
        if not isinstance(claimed_raw, list) or len(claimed_raw) != len(
            self.invariants
        ):
            raise RelationMatrixError("class coordinates have the wrong dimension")
        claimed = tuple(
            _signed_decimal(value, "class coordinate") for value in claimed_raw
        )
        if any(
            value < 0 or value >= modulus
            for value, modulus in zip(claimed, self.invariants, strict=True)
        ):
            raise RelationMatrixError("class coordinates are not canonical residues")
        if claimed != derived:
            raise RelationMatrixError("arbitrary-ideal class coordinates mismatch")
        if certificate["presentationZero"] is not all(value == 0 for value in derived):
            raise RelationMatrixError("arbitrary-ideal principality state mismatch")
        return derived

    def _integral_query_rows(self, ideal: Any) -> tuple[Any, int, list[list[str]]]:
        """Clear denominators and encode the resulting integral ideal."""
        if getattr(ideal, "ring", lambda: None)() is not self._order:
            raise TypeError("the queried ideal belongs to another maximal order")
        if ideal.is_zero():
            raise ValueError("the zero ideal has no ideal class")
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        denominator = int(arithmetic.integrality_denominator(ideal))
        if denominator <= 0:
            raise ArithmeticError("ideal denominator normalization is not positive")
        integral = arithmetic.scalar_translate(ideal, denominator)
        relative = integral.basis_matrix() * self._order._basis_inverse_matrix()
        rows = []
        for row in relative.rows():
            encoded = []
            for value in row:
                if value._denominator != 1:
                    raise ArithmeticError(
                        "denominator clearing did not produce an integral ideal"
                    )
                encoded.append(str(int(value._numerator)))
            rows.append(encoded)
        return integral, denominator, rows

    def replay_public_arbitrary_ideal_query(
        self, integral_ideal: Any, integral_rows: list[list[str]], receipt: Any
    ) -> tuple[tuple[int, ...], Any]:
        """Replay a quotient witness returned by the resident Rust session.

        If `(alpha) = J*P^q` and the signed relation powers satisfy
        `q + lift(c) + sum p_i*r_i = 0`, then
        `alpha*product(beta_i^p_i)` generates `J/representative(c)`.
        """
        wrapper = _closed(
            _canonical_json(receipt, "public ideal query"),
            {
                "certificate",
                "completion",
                "outcome",
                "polynomialAscending",
                "queriedIdealIntegralBasisRows",
                "schema",
            },
            "public ideal query receipt",
        )
        if (
            wrapper["schema"] != PUBLIC_ARBITRARY_IDEAL_QUERY_SCHEMA
            or wrapper["outcome"] != "complete-conditional-grh-ideal-class"
            or wrapper["polynomialAscending"] != self._polynomial_ascending
        ):
            raise RelationMatrixError(
                "unsupported public arbitrary-ideal query receipt"
            )
        if wrapper["queriedIdealIntegralBasisRows"] != integral_rows:
            raise RelationMatrixError("arbitrary-ideal query is bound to another ideal")
        completion = wrapper["completion"]
        if (
            not isinstance(completion, dict)
            or completion.get("schema")
            != "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
            or completion.get("outcome") != "complete-conditional-grh"
            or completion.get("publicComplete") is not True
            or completion.get("usesPariInput") is not False
            or completion.get("usesPreparedFixture") is not False
            or completion.get("usesFieldAnswersAsInput") is not False
            or tuple(
                _positive_decimal(value, "query completion invariant")
                for value in completion.get("completion", {}).get(
                    "invariantFactors", ()
                )
            )
            != self.invariants
        ):
            raise RelationMatrixError("arbitrary-ideal completion authority mismatch")
        data = _closed(
            wrapper["certificate"],
            {
                "canonicalRepresentativeFactorBaseExponents",
                "classCoordinates",
                "cursorTrials",
                "factorBaseSize",
                "maximalOrderEvidence",
                "presentationZero",
                "primitiveCandidates",
                "principalElementIntegralBasisCoordinates",
                "principalWitnessRelationFactors",
                "quotientFactorBaseExponents",
                "smoothQuotientNorms",
            },
            "public ideal query certificate",
        )
        for name in ("cursorTrials", "primitiveCandidates", "smoothQuotientNorms"):
            _natural(data[name], "query statistic")
        if (
            data["maximalOrderEvidence"]
            not in (
                "rust-proved-maximal-order",
                "upstream-assumed-allowlisted-row6",
            )
            or _natural(data["factorBaseSize"], "factor-base size")
            != self.factor_base_size
        ):
            raise RelationMatrixError("arbitrary-ideal query authority mismatch")
        quotient = _sparse_vector(
            data["quotientFactorBaseExponents"],
            self.factor_base_size,
            "factorBaseIndexZeroBased",
            "exponent",
            "query quotient vector",
        )
        claimed_raw = data["classCoordinates"]
        if not isinstance(claimed_raw, list) or len(claimed_raw) != len(
            self.invariants
        ):
            raise RelationMatrixError("class coordinates have the wrong dimension")
        claimed = tuple(
            _signed_decimal(value, "class coordinate") for value in claimed_raw
        )
        derived = self.class_coordinates(tuple(-value for value in quotient))
        if claimed != derived or any(
            value < 0 or value >= modulus
            for value, modulus in zip(claimed, self.invariants, strict=True)
        ):
            raise RelationMatrixError("arbitrary-ideal class coordinates mismatch")
        if data["presentationZero"] is not all(value == 0 for value in claimed):
            raise RelationMatrixError("arbitrary-ideal principality state mismatch")
        canonical_lift = _sparse_vector(
            data["canonicalRepresentativeFactorBaseExponents"],
            self.factor_base_size,
            "indexZeroBased",
            "exponent",
            "canonical representative vector",
        )
        lift = self.lift_class_coordinates(claimed)
        if canonical_lift != lift:
            raise RelationMatrixError(
                "query canonical representative does not match the presentation lift"
            )
        raw_factors = data["principalWitnessRelationFactors"]
        if not isinstance(raw_factors, list):
            raise RelationMatrixError("query principal-witness factors must be a list")
        relation_powers = [0] * self.relation_count
        relation_elements = []
        previous = -1
        for factor in raw_factors:
            factor = _closed(
                factor,
                {
                    "exponent",
                    "principalElementIntegralBasisCoordinates",
                    "relationIndexZeroBased",
                },
                "query principal-witness relation factor",
            )
            index = _natural(
                factor["relationIndexZeroBased"], "query relation-factor index"
            )
            if not previous < index < self.relation_count:
                raise RelationMatrixError(
                    "query relation-factor indices are not ordered"
                )
            previous = index
            power = _signed_decimal(
                factor["exponent"], "query relation-factor exponent", nonzero=True
            )
            coordinates = factor["principalElementIntegralBasisCoordinates"]
            if not isinstance(coordinates, list) or len(coordinates) != len(
                self._prepared_basis
            ):
                raise RelationMatrixError(
                    "query relation factor has the wrong dimension"
                )
            element = _element_from_prepared_coordinates(
                self._field,
                self._prepared_basis,
                tuple(
                    _signed_decimal(value, "query relation-factor coordinate")
                    for value in coordinates
                ),
            )
            if not self._trusted_service_core:
                row = self._presentation.relation_rows[index]
                if self._order.ideal(element) != self._ideal_reconstructor.reconstruct(
                    row.dense()
                ):
                    raise ArithmeticError(
                        "query relation factor is not the authenticated principal relation"
                    )
            relation_powers[index] = power
            relation_elements.append((element, power))
        if not self._trusted_service_core:
            target = [quotient[index] for index in range(self.factor_base_size)]
            for index, value in enumerate(lift):
                target[index] += value
            for power, row in zip(
                relation_powers, self._presentation.relation_rows, strict=True
            ):
                for column, value in row.entries:
                    target[column] += power * value
            if any(target):
                raise RelationMatrixError("query quotient relation does not replay")
        raw_alpha = data["principalElementIntegralBasisCoordinates"]
        if not isinstance(raw_alpha, list) or len(raw_alpha) != len(
            self._prepared_basis
        ):
            raise RelationMatrixError("query principal element has the wrong dimension")
        alpha = _element_from_prepared_coordinates(
            self._field,
            self._prepared_basis,
            tuple(
                _signed_decimal(value, "query principal coordinate")
                for value in raw_alpha
            ),
        )
        quotient_ideal = self._ideal_reconstructor.reconstruct(quotient)
        if self._order.ideal(alpha) != integral_ideal * quotient_ideal:
            raise ArithmeticError("query reduction equality failed exact replay")
        factored = __import__(
            "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
        )
        generator = factored.FactoredNumberFieldElement(
            self._field,
            [(alpha, 1)] + [(element, power) for element, power in relation_elements],
        )
        representative = self.representative_ideal(claimed)
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        expected = arithmetic.ideal_quotient(integral_ideal, representative)
        if generator.principal_ideal(self._order) != expected:
            raise ArithmeticError("query quotient witness failed exact replay")
        return claimed, generator

    def public_ideal_log(self, ideal: Any) -> tuple[tuple[int, ...], Any]:
        """Return canonical coordinates and an exact quotient witness."""
        maps = __import__(
            "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
        )
        for position in range(len(self.invariants)):
            coordinates = tuple(
                1 if index == position else 0 for index in range(len(self.invariants))
            )
            if ideal == self.representative_ideal(coordinates):
                one = self._order.ideal(1)
                return coordinates, maps.PrincipalIdealWitness(
                    one, self._field.one(), source="canonical Rust class representative"
                )
        if self._query_callback is None:
            raise RuntimeError(
                "the Rust publication has no resident ideal query session"
            )
        integral, denominator, rows = self._integral_query_rows(ideal)
        certificate = self._query_callback(rows, self._query_resources)
        coordinates, generator = self.replay_public_arbitrary_ideal_query(
            integral, rows, certificate
        )
        if denominator != 1:
            factored = __import__(
                "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
            )
            scalar = factored.FactoredNumberFieldElement.from_element(
                self._field, self._field(denominator)
            )
            generator = generator / scalar
        representative = self.representative_ideal(coordinates)
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        quotient = arithmetic.ideal_quotient(ideal, representative)
        witness = maps.PrincipalIdealWitness(
            quotient, generator, source="authenticated resident Rust ideal query"
        )
        if not witness.verify(self._order):
            raise ArithmeticError("fractional ideal query witness failed exact replay")
        return coordinates, witness

    def lift_class_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        """Return the certified standard lift into the factor-base lattice."""
        checked = tuple(
            _bounded_integer(value, "class coordinate") for value in coordinates
        )
        return self._presentation.lift_class_coordinates(checked)

    def verify(self) -> bool:
        return self._presentation.verify()


def _replay_compact_presentation(
    prepared: dict[str, Any], certificate: dict[str, Any]
) -> CompactRelationPresentation:
    _closed(prepared, _PREPARED_KEYS, "prepared evidence")
    _closed(certificate, _CERTIFICATE_KEYS, "compact certificate")
    if prepared["schema"] != PREPARED_RESULT_SCHEMA:
        raise RelationMatrixError("unsupported prepared evidence")
    if certificate["schema"] != COMPACT_CERTIFICATE_SCHEMA:
        raise RelationMatrixError("unsupported compact certificate")
    input_id = _sha256_identifier(prepared["inputId"], "prepared input identity")
    if certificate["sourceInputId"] != input_id:
        raise RelationMatrixError("certificate input identity mismatch")
    if (
        prepared["qualificationStatus"] != "grh-conditional-class-unit-index-one"
        or certificate["qualificationStatus"]
        != "closed-exact-lattice-index-certificate"
        or prepared["usesClassGroupAnswersAsInput"] is not False
        or prepared["usesOracleAsInput"] is not False
    ):
        raise RelationMatrixError("unsupported qualification status")
    verified = _closed(certificate["verified"], _VERIFIED_KEYS, "verified claims")
    if any(value is not True for value in verified.values()):
        raise RelationMatrixError("producer verification claims are incomplete")

    shape = _closed(certificate["relationShape"], {"rows", "columns"}, "relation shape")
    row_count = _natural(shape["rows"], "row count")
    columns = _positive_natural(shape["columns"], "column count")
    if (
        columns > _MAX_COLUMNS
        or row_count <= columns
        or row_count - columns > _MAX_SURPLUS
    ):
        raise RelationMatrixError("relation shape exceeds the verifier envelope")
    if (
        columns * columns > _MAX_DENSE_DETERMINANT_ENTRIES
        or columns * columns * columns > _MAX_DENSE_DETERMINANT_WORK
    ):
        raise RelationMatrixError("square determinant exceeds the verifier work limit")
    prepared_shape = _closed(
        prepared["relations"], {"rows", "columns"}, "prepared shape"
    )
    if prepared_shape != shape:
        raise RelationMatrixError("relation shape mismatch")

    lattice = _closed(
        prepared["relationLatticeEvidence"],
        {"schema", "factorBaseCatalog", "relationRecords"},
        "relation-lattice evidence",
    )
    if lattice["schema"] != RELATION_LATTICE_SCHEMA:
        raise RelationMatrixError("unsupported relation-lattice evidence")
    catalog = lattice["factorBaseCatalog"]
    if not isinstance(catalog, list) or len(catalog) != columns:
        raise RelationMatrixError("factor-base catalog has the wrong length")
    catalog_keys = {
        "factorBaseIndexZeroBased",
        "generator",
        "hnf",
        "norm",
        "prime",
        "ramification",
        "residueDegree",
    }
    for expected, entry in enumerate(catalog):
        _closed(entry, catalog_keys, "factor-base entry")
        if _natural(entry["factorBaseIndexZeroBased"], "factor-base index") != expected:
            raise RelationMatrixError("factor-base indices are not contiguous")
        for key in ("norm", "prime", "ramification", "residueDegree"):
            _positive_natural(entry[key], "factor-base " + key)
        generator = entry["generator"]
        if (
            generator is not None
            and (
                not isinstance(generator, list)
                or len(generator) != 3
                or any(
                    isinstance(value, bool) or not isinstance(value, int)
                    for value in generator
                )
            )
        ) or (
            not isinstance(entry["hnf"], list)
            or len(entry["hnf"]) != 9
            or any(
                isinstance(value, bool) or not isinstance(value, int)
                for value in entry["hnf"]
            )
        ):
            raise RelationMatrixError("factor-base entry has malformed coordinates")
        for value in (generator or []) + entry["hnf"]:
            _bounded_integer(value, "factor-base coordinate")

    records = lattice["relationRecords"]
    if not isinstance(records, list) or len(records) != row_count:
        raise RelationMatrixError("relation record count mismatch")
    relation_rows: list[SparseRelationRow] = []
    for expected, record in enumerate(records):
        _closed(
            record,
            {"integralBasisCoordinates", "primeIdealFactors", "relationIndexZeroBased"},
            "relation record",
        )
        if _natural(record["relationIndexZeroBased"], "relation index") != expected:
            raise RelationMatrixError("relation indices are not contiguous")
        coordinates = record["integralBasisCoordinates"]
        if not isinstance(coordinates, list) or len(coordinates) != 3:
            raise RelationMatrixError("principal coordinates have the wrong length")
        tuple(_signed_decimal(value, "principal coordinate") for value in coordinates)
        relation_rows.append(_sparse_relation(record["primeIdealFactors"], columns))

    raw_invariants = certificate["invariantFactors"]
    if not isinstance(raw_invariants, list) or len(raw_invariants) > _MAX_INVARIANTS:
        raise RelationMatrixError("invalid invariant factors")
    invariants = tuple(
        _positive_decimal(value, "invariant factor") for value in raw_invariants
    )
    if columns * max(1, len(invariants)) > _MAX_DENSE_CERTIFICATE_ENTRIES:
        raise RelationMatrixError("class map exceeds the verifier envelope")
    modular_map = _closed(
        certificate["modularClassMap"], {"moduli", "rows"}, "modular class map"
    )
    if modular_map["moduli"] != raw_invariants or not isinstance(
        modular_map["rows"], list
    ):
        raise RelationMatrixError("class-map moduli mismatch")
    if len(modular_map["rows"]) != columns:
        raise RelationMatrixError("class-map row count mismatch")
    class_map_rows = []
    for expected, row in enumerate(modular_map["rows"]):
        _closed(row, {"factorBaseIndexZeroBased", "residues"}, "class-map row")
        if _natural(row["factorBaseIndexZeroBased"], "class-map row index") != expected:
            raise RelationMatrixError("class-map rows are not contiguous")
        residues = row["residues"]
        if not isinstance(residues, list) or len(residues) != len(invariants):
            raise RelationMatrixError("class-map residues have the wrong length")
        class_map_rows.append(
            tuple(_bounded_integer(value, "class-map residue") for value in residues)
        )

    lifts = certificate["standardGeneratorLifts"]
    if not isinstance(lifts, list) or len(lifts) != len(invariants):
        raise RelationMatrixError("standard-generator lift count mismatch")
    generator_transforms = []
    order_combinations = []
    for expected, lift in enumerate(lifts):
        _closed(
            lift,
            {
                "coordinateZeroBased",
                "factorBaseLift",
                "modulus",
                "orderRelationCombination",
            },
            "standard-generator lift",
        )
        if (
            _natural(lift["coordinateZeroBased"], "generator coordinate") != expected
            or _positive_decimal(lift["modulus"], "lift modulus")
            != invariants[expected]
        ):
            raise RelationMatrixError("standard-generator lift is not canonical")
        generator_transforms.append(
            _sparse_vector(
                lift["factorBaseLift"],
                columns,
                "factorBaseIndexZeroBased",
                "coefficient",
                "generator lift",
            )
        )
        order_combinations.append(
            _sparse_vector(
                lift["orderRelationCombination"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "generator order combination",
            )
        )

    raw_dependencies = certificate["relationDependencies"]
    if (
        not isinstance(raw_dependencies, list)
        or len(raw_dependencies) != row_count - columns
    ):
        raise RelationMatrixError("dependency count mismatch")
    if len(raw_dependencies) * row_count > _MAX_DENSE_CERTIFICATE_ENTRIES:
        raise RelationMatrixError("dependency matrix exceeds the verifier envelope")
    dependencies = []
    for expected, dependency in enumerate(raw_dependencies):
        _closed(
            dependency, {"dependencyIndexZeroBased", "terms"}, "relation dependency"
        )
        if (
            _natural(dependency["dependencyIndexZeroBased"], "dependency index")
            != expected
        ):
            raise RelationMatrixError("dependency indices are not contiguous")
        dependencies.append(
            _sparse_vector(
                dependency["terms"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "dependency",
            )
        )

    evidence = _closed(
        certificate["latticeIndexEvidence"],
        {
            "dependencySaturation",
            "fullRelationLatticeIndex",
            "projectedDependencyDeterminant",
            "squareDeterminant",
            "squareRowIndicesZeroBased",
            "surplusRowIndicesZeroBased",
        },
        "lattice-index evidence",
    )
    saturation = _closed(
        evidence["dependencySaturation"],
        {"criterion", "gcd", "selectedMinors"},
        "dependency saturation",
    )
    if (
        saturation["criterion"] != "gcd-of-exhibited-maximal-dependency-minors-is-one"
        or saturation["gcd"] != "1"
    ):
        raise RelationMatrixError("unsupported dependency-saturation evidence")
    if not isinstance(saturation["selectedMinors"], list):
        raise RelationMatrixError("dependency minors must be a list")
    minor_count = len(saturation["selectedMinors"])
    surplus = row_count - columns
    if minor_count > _MAX_DEPENDENCY_MINOR_WITNESSES:
        raise RelationMatrixError("too many dependency-minor witnesses")
    if (
        minor_count * surplus * surplus * surplus
        > _MAX_DEPENDENCY_MINOR_DETERMINANT_WORK
    ):
        raise RelationMatrixError(
            "dependency-minor replay exceeds the verifier work limit"
        )
    dependency_minors: list[tuple[Sequence[int], int]] = []
    for minor in saturation["selectedMinors"]:
        _closed(
            minor, {"relationRowIndicesZeroBased", "determinant"}, "dependency minor"
        )
        indices = minor["relationRowIndicesZeroBased"]
        if not isinstance(indices, list) or len(indices) != surplus:
            raise RelationMatrixError("dependency minor has the wrong dimension")
        dependency_minors.append(
            (
                tuple(_natural(index, "dependency minor index") for index in indices),
                _positive_decimal(minor["determinant"], "dependency minor"),
            )
        )
    dependency_minors.sort(key=_dependency_minor_key)

    answer = CompactRelationPresentation.from_small_surplus(
        columns,
        relation_rows,
        invariants,
        class_map_rows,
        generator_transforms,
        dependencies,
        evidence["squareRowIndicesZeroBased"],
        evidence["surplusRowIndicesZeroBased"],
        _positive_decimal(evidence["squareDeterminant"], "square determinant"),
        _positive_decimal(
            evidence["projectedDependencyDeterminant"], "projected determinant"
        ),
        dependency_minors,
    )
    for modulus, lift, combination in zip(
        invariants, generator_transforms, order_combinations, strict=True
    ):
        left = tuple(modulus * value for value in lift)
        right = [0] * columns
        for coefficient, relation in zip(combination, relation_rows, strict=True):
            if coefficient:
                for column, value in relation.entries:
                    right[column] += coefficient * value
        if left != tuple(right):
            raise RelationMatrixError(
                "standard-generator order combination does not replay exactly"
            )
    claimed_order = _positive_decimal(certificate["groupOrder"], "group order")
    full_index = _positive_decimal(evidence["fullRelationLatticeIndex"], "full index")
    if (
        claimed_order != answer.order
        or full_index != answer.order
        or not answer.verify()
    ):
        raise RelationMatrixError("Rust compact certificate failed Sage.js replay")
    return answer


def _replay_relation_ideals(
    field: Any,
    prepared: dict[str, Any],
    result: dict[str, Any],
    presentation: CompactRelationPresentation,
    *,
    basis_override: Sequence[Any] | None = None,
    table_override: list[list[list[Any]]] | None = None,
    verify_principal_relations: bool = True,
    trusted_authenticated_service: bool = False,
) -> tuple[Any, dict[str, Any]]:
    """Match the validated catalog and rows to live maximal-order ideals."""
    order = field.maximal_order()
    basis = (
        _prepared_basis_elements(field, prepared)
        if basis_override is None
        else basis_override
    )
    table = table_override
    if table is None:
        table = [
            [
                [
                    _input_integer(entry["numerator"])
                    // _input_integer(entry["denominator"])
                    for entry in product
                ]
                for product in left
            ]
            for left in prepared["preparation"]["multiplicationTable"]
        ]
    lattice = result["relationLatticeEvidence"]
    records = lattice["relationRecords"]
    if trusted_authenticated_service:
        factor_base = _TrustedServiceFactorBase(
            field, order, basis, lattice["factorBaseCatalog"]
        )
        return factor_base, {
            "schema": "sagejs.rust-class-group/relation-ideal-replay-v1",
            "inputId": prepared["inputId"],
            "authority": "authenticated-rust-service-artifact",
            "factorBasePrimeCount": len(factor_base),
            "principalRelationCount": len(records),
            "verifiedFactorTermCount": 0,
            "exceptionalRationalPrimeFactorizations": 0,
            "allFactorBasePrimesReplayed": False,
            "factorBasePrimeAuthority": "authenticated-rust-service-artifact",
            "allPrincipalIdealEqualitiesReplayed": False,
            "principalIdealAuthority": "authenticated-rust-service-artifact",
            "lazyIdealMaterialization": True,
        }
    ideals = []
    factorizations: dict[int, tuple[tuple[Any, int], ...]] = {}
    validated_primes: set[int] = set()
    prime_ideals = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    for descriptor in lattice["factorBaseCatalog"]:
        if not trusted_authenticated_service:
            _validate_prime_hnf_lattice(descriptor, table, validated_primes)
        exported = _ideal_from_prepared_descriptor(
            field, order, cast(list[Any], basis), descriptor
        )
        integral_rows = descriptor.get("integralBasisRows")
        if integral_rows is not None and not trusted_authenticated_service:
            if (
                not isinstance(integral_rows, list)
                or len(integral_rows) != 3
                or any(
                    not isinstance(row, list) or len(row) != 3 for row in integral_rows
                )
            ):
                raise ArithmeticError("an exported ideal basis is malformed")
            integral_generators = [
                _element_from_prepared_coordinates(field, cast(list[Any], basis), row)
                for row in integral_rows
            ]
            if order.ideal(integral_generators) != exported:
                raise ArithmeticError(
                    "an exported integral ideal basis does not match its HNF"
                )
        prime = int(descriptor["prime"])
        ramification = int(descriptor["ramification"])
        residue_degree = int(descriptor.get("residueDegree", 1))
        if trusted_authenticated_service or (residue_degree == 1 and ramification == 1):
            # `_validate_prime_hnf_lattice` proved that this index-p lattice is
            # the kernel of a surjective ring map O -> F_p.  It is therefore
            # already an independently proven maximal (hence prime) ideal;
            # refactoring pO would repeat an expensive global computation.
            live = prime_ideals.NumberFieldPrimeIdeal(
                order,
                exported._basis_rows,
                prime,
                ramification,
                residue_degree,
                _candidate_token=prime_ideals._PACKED_CANDIDATE_TOKEN,
            )
        else:
            # Higher residue degree lacks the linear residue character above,
            # and nontrivial ramification is additional metadata.  Recompute
            # those exceptional local factorizations through Sage.js.
            if prime not in factorizations:
                factorizations[prime] = tuple(
                    (candidate, int(exponent))
                    for candidate, exponent in order.ideal(prime).factor()
                )
            live = next(
                (
                    candidate
                    for candidate, exponent in factorizations[prime]
                    if candidate == exported and exponent == ramification
                ),
                None,
            )
            if live is None:
                raise ArithmeticError(
                    "factor-base entry is not the claimed prime ideal"
                )
        ideals.append(live)
    relations = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )
    reconstruct = relations.FactorBaseIdealReconstructor(order, ideals).reconstruct
    if verify_principal_relations:
        for record, row in zip(records, presentation.relation_rows, strict=True):
            element = _element_from_prepared_coordinates(
                field,
                cast(list[Any], basis),
                record["integralBasisCoordinates"],
            )
            if order.ideal(element) != reconstruct(row.dense()):
                raise ArithmeticError("relation is not the claimed principal ideal")
    return tuple(ideals), {
        "schema": "sagejs.rust-class-group/relation-ideal-replay-v1",
        "inputId": prepared["inputId"],
        "authority": "independent-sagejs-maximal-order-ideal-arithmetic",
        "factorBasePrimeCount": len(ideals),
        "principalRelationCount": len(records),
        "verifiedFactorTermCount": sum(
            len(record["primeIdealFactors"]) for record in records
        ),
        "exceptionalRationalPrimeFactorizations": len(factorizations),
        "allFactorBasePrimesReplayed": not trusted_authenticated_service,
        "factorBasePrimeAuthority": (
            "authenticated-rust-service-artifact"
            if trusted_authenticated_service
            else "independent-sagejs-local-arithmetic"
        ),
        "allPrincipalIdealEqualitiesReplayed": verify_principal_relations,
        "principalIdealAuthority": (
            "independent-sagejs-replay"
            if verify_principal_relations
            else "authenticated-rust-service-artifact"
        ),
        "lazyIdealMaterialization": False,
    }


def adapt_rust_prepared_cubic_v2_presentation(
    field: Any,
    prepared_input: dict[str, Any],
    prepared_result: dict[str, Any],
    compact_certificate: dict[str, Any],
) -> Any:
    """Replay the exact quotient-lattice evidence and return an incomplete result."""
    authoritative = prepare_cubic_for_rust(field)
    if not _prepared_input_matches_authoritative(prepared_input, authoritative):
        raise RelationMatrixError("prepared input is not the canonical field export")
    prepared_result = _canonical_json(prepared_result, "prepared result")
    compact_certificate = _canonical_json(compact_certificate, "compact certificate")
    _closed(prepared_result, _PREPARED_KEYS, "prepared evidence")
    producer_input_id = _sha256_identifier(
        prepared_result["inputId"], "producer input identity"
    )
    if prepared_input.get("inputId") != producer_input_id:
        raise RelationMatrixError("prepared result input identity mismatch")
    expected_polynomial = prepared_input.get("field", {}).get("coefficientsAscending")
    if prepared_result["polynomialAscending"] != expected_polynomial:
        raise RelationMatrixError("prepared result polynomial mismatch")

    presentation = _replay_compact_presentation(prepared_result, compact_certificate)
    factor_base_ideals, ideal_replay = _replay_relation_ideals(
        field, prepared_input, prepared_result, presentation
    )
    prepared_identity = _identity(prepared_result)
    certificate_identity = _identity(compact_certificate)
    context = RustCompactPresentationReplay(
        presentation,
        field,
        field.maximal_order(),
        _prepared_basis_elements(field, prepared_input),
        factor_base_ideals,
        producer_input_id=producer_input_id,
        prepared_result_identity=prepared_identity,
        certificate_identity=certificate_identity,
        relation_elements=tuple(
            _element_from_prepared_coordinates(
                field,
                _prepared_basis_elements(field, prepared_input),
                record["integralBasisCoordinates"],
            )
            for record in prepared_result["relationLatticeEvidence"]["relationRecords"]
        ),
        polynomial_ascending=prepared_result["polynomialAscending"],
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    diagnostics = {
        "schema": DIAGNOSTICS_SCHEMA,
        "automaticDispatch": False,
        "publicResultSupported": False,
        "preparedInputBinding": "canonical-field-replayed",
        "producerInputId": producer_input_id,
        "polynomialBinding": "exact",
        "preparedResultIdentity": prepared_identity,
        "compactCertificateIdentity": certificate_identity,
        "relationPresentationReplay": "exact-principal-ideal-and-integer-lattice",
        "relationIdealReplay": ideal_replay,
        "liveFactorBaseIdeals": "available-through-context",
        "factorBaseCoordinateMap": "available",
        "smoothFactorBaseIdealClassMap": "available-through-context",
        "classGeneratorIdeals": "available-through-context",
        "arbitraryIdealClassMap": "certificate-replay-available-through-context",
        "requestResourceBinding": "not-present-in-evidence",
        "artifactIdentity": None,
        "acceptedEvidenceJoins": list(_ACCEPTED_JOINS),
        "remainingEvidenceGaps": list(_REMAINING_GAPS),
    }
    stages = (
        groups.ClassUnitStage(
            "rust-compact-relation-presentation-replay",
            "complete",
            {
                "preparedResultIdentity": prepared_identity,
                "compactCertificateIdentity": certificate_identity,
                "factorBaseSize": context.factor_base_size,
                "relationCount": context.relation_count,
                "principalRelationCount": ideal_replay["principalRelationCount"],
            },
        ),
        groups.ClassUnitStage(
            "sagejs-public-class-unit-certification",
            "incomplete",
            {"missingEvidence": list(_REMAINING_GAPS)},
        ),
    )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the exact principal relation quotient lacks product invocation/session lifetime, unit, completion, resource, and artifact authority",
        algorithm="rust-prepared-cubic-compact-presentation-experimental",
        stages=stages,
        tentative_invariants=presentation.invariants,
        context=context,
        diagnostics=diagnostics,
    )


class _AuthenticatedServiceRelationCertificate:
    """Artifact-sealed generator-order witness from the resident service."""

    def __init__(self, context: Any, coordinate: int, ideal: Any) -> None:
        self._context = context
        self._coordinate = coordinate
        self._ideal = ideal

    def verify(self, ideal: Any, generator: Any, order: Any) -> bool:
        del generator
        return bool(
            order is self._context.order
            and ideal == self._ideal
            and self._context.attest("generator-order-witness", self._coordinate)
        )


class _AuthenticatedServiceClassGroupContext:
    """Small field-bound facade over one authenticated resident artifact."""

    def __init__(
        self,
        field: Any,
        invariants: Sequence[int],
        generator_ideals: Sequence[Any],
        artifact_sha256: str,
        summary_identity: str,
        proof_witnesses_sha256: str,
        polynomial_ascending: Sequence[str],
        factor_base_bound: int,
        relation_count: int,
        attestation_callback: Any,
        query_callback: Any,
        query_resources: Any,
        prepared_basis: Sequence[Any],
    ) -> None:
        self.field = field
        self.order = field.maximal_order()
        self.invariants = tuple(invariants)
        self.generator_ideals = tuple(generator_ideals)
        self.artifact_sha256 = artifact_sha256
        self.summary_identity = summary_identity
        self.proof_witnesses_sha256 = proof_witnesses_sha256
        self.polynomial_ascending = list(polynomial_ascending)
        self.factor_base_bound = factor_base_bound
        self.relation_count = relation_count
        self._attestation_callback = attestation_callback
        self._query_callback = query_callback
        self._query_resources = query_resources
        self._basis = tuple(prepared_basis)
        self._saturation_evidence = {
            "schema": "sagejs.rust-class-group/authenticated-service-saturation-v1",
            "artifactSha256": artifact_sha256,
            "summaryIdentity": summary_identity,
            "proofWitnessesSha256": proof_witnesses_sha256,
            "index": 1,
        }

    def _attestation_payload(self, purpose: str, coordinate: Any = None) -> Any:
        return {
            "schema": "sagejs.rust-class-group/authenticated-service-attestation-v1",
            "purpose": purpose,
            "artifactSha256": self.artifact_sha256,
            "summaryIdentity": self.summary_identity,
            "proofWitnessesSha256": self.proof_witnesses_sha256,
            "coordinateZeroBased": coordinate,
        }

    def attest(self, purpose: str, coordinate: Any = None) -> bool:
        try:
            return (
                self._attestation_callback(
                    self._attestation_payload(purpose, coordinate)
                )
                is True
            )
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False

    def representative_ideal(self, coordinates: Sequence[int]) -> Any:
        if len(coordinates) != len(self.invariants):
            raise ValueError("class coordinates have the wrong dimension")
        answer = self.order.ideal(1)
        for coordinate, modulus, ideal in zip(
            coordinates, self.invariants, self.generator_ideals, strict=True
        ):
            value = _bounded_integer(coordinate, "class coordinate")
            if value < 0 or value >= modulus:
                raise ValueError("class coordinates are not canonical residues")
            if value:
                answer = answer * ideal**value
        return answer

    def _integral_query_rows(self, ideal: Any) -> tuple[Any, int, list[list[str]]]:
        if getattr(ideal, "ring", lambda: None)() is not self.order:
            raise TypeError("the queried ideal belongs to another maximal order")
        if ideal.is_zero():
            raise ValueError("the zero ideal has no ideal class")
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        denominator = int(arithmetic.integrality_denominator(ideal))
        if denominator <= 0:
            raise ArithmeticError("ideal denominator normalization is not positive")
        integral = arithmetic.scalar_translate(ideal, denominator)
        rows = [
            [str(value) for value in row]
            for row in _ideal_prepared_basis_rows(
                self.field,
                self._basis,
                integral,
                "denominator-cleared query ideal",
            )
        ]
        return integral, denominator, rows

    def _query_generator(self, integral: Any, rows: Any, receipt: Any) -> Any:
        wrapper = _closed(
            _canonical_json(receipt, "authenticated service ideal query"),
            {
                "certificate",
                "completion",
                "outcome",
                "polynomialAscending",
                "queriedIdealIntegralBasisRows",
                "schema",
            },
            "authenticated service ideal query",
        )
        if (
            wrapper["schema"] != AUTHENTICATED_SERVICE_IDEAL_QUERY_SCHEMA
            or wrapper["outcome"] != "complete-conditional-grh-ideal-class"
            or wrapper["polynomialAscending"] != self.polynomial_ascending
            or wrapper["queriedIdealIntegralBasisRows"] != rows
            or not self.attest("ideal-query")
        ):
            raise RelationMatrixError("ideal query is not bound to this artifact")
        completion = wrapper["completion"]
        if (
            not isinstance(completion, dict)
            or completion.get("schema")
            != "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
            or completion.get("outcome") != "complete-conditional-grh"
            or completion.get("publicComplete") is not True
            or completion.get("usesPariInput") is not False
            or completion.get("usesPreparedFixture") is not False
            or completion.get("usesFieldAnswersAsInput") is not False
            or tuple(
                _positive_decimal(value, "query completion invariant")
                for value in completion.get("completion", {}).get(
                    "invariantFactors", ()
                )
            )
            != self.invariants
        ):
            raise RelationMatrixError("ideal query completion authority mismatch")
        data = _closed(
            wrapper["certificate"],
            {
                "canonicalRepresentativeFactorBaseExponents",
                "classCoordinates",
                "cursorTrials",
                "factorBaseSize",
                "maximalOrderEvidence",
                "presentationZero",
                "primitiveCandidates",
                "principalElementIntegralBasisCoordinates",
                "principalWitnessRelationFactors",
                "quotientFactorBaseExponents",
                "smoothQuotientNorms",
            },
            "authenticated service ideal-query certificate",
        )
        if data["maximalOrderEvidence"] not in (
            "rust-proved-maximal-order",
            "upstream-assumed-allowlisted-row6",
        ):
            raise RelationMatrixError("ideal query has unsupported order evidence")
        _natural(data["factorBaseSize"], "query factor-base size")
        for statistic in ("cursorTrials", "primitiveCandidates", "smoothQuotientNorms"):
            _natural(data[statistic], "query statistic")
        raw_coordinates = data["classCoordinates"]
        if not isinstance(raw_coordinates, list) or len(raw_coordinates) != len(
            self.invariants
        ):
            raise RelationMatrixError("class coordinates have the wrong dimension")
        coordinates = tuple(
            _signed_decimal(value, "class coordinate") for value in raw_coordinates
        )
        if data["presentationZero"] is not all(value == 0 for value in coordinates):
            raise RelationMatrixError("ideal query principality state mismatch")
        representative = self.representative_ideal(coordinates)
        raw_alpha = data["principalElementIntegralBasisCoordinates"]
        if not isinstance(raw_alpha, list) or len(raw_alpha) != len(self._basis):
            raise RelationMatrixError("query principal element has the wrong dimension")
        alpha = _element_from_prepared_coordinates(
            self.field,
            cast(list[Any], self._basis),
            tuple(
                _signed_decimal(value, "principal coordinate") for value in raw_alpha
            ),
        )
        factors = data["principalWitnessRelationFactors"]
        if not isinstance(factors, list) or len(factors) > _MAX_PUBLICATION_RELATIONS:
            raise RelationMatrixError("query relation factors exceed the replay cap")
        decoded = []
        previous = -1
        for factor in factors:
            factor = _closed(
                factor,
                {
                    "exponent",
                    "principalElementIntegralBasisCoordinates",
                    "relationIndexZeroBased",
                },
                "authenticated service relation factor",
            )
            index = _natural(factor["relationIndexZeroBased"], "relation index")
            if not previous < index < self.relation_count:
                raise RelationMatrixError("query relation indices are not canonical")
            previous = index
            raw_element = factor["principalElementIntegralBasisCoordinates"]
            if not isinstance(raw_element, list) or len(raw_element) != len(
                self._basis
            ):
                raise RelationMatrixError(
                    "query relation element has the wrong dimension"
                )
            decoded.append(
                (
                    _element_from_prepared_coordinates(
                        self.field,
                        cast(list[Any], self._basis),
                        tuple(
                            _signed_decimal(value, "relation element coordinate")
                            for value in raw_element
                        ),
                    ),
                    _signed_decimal(
                        factor["exponent"], "relation factor exponent", nonzero=True
                    ),
                )
            )
        factored = __import__(
            "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
        )
        generator = factored.FactoredNumberFieldElement(
            self.field, [(alpha, 1)] + decoded
        )
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        quotient = arithmetic.ideal_quotient(integral, representative)
        if generator.principal_ideal(self.order) != quotient:
            raise ArithmeticError(
                "authenticated service quotient witness failed replay"
            )
        return coordinates, generator

    def public_ideal_log(self, ideal: Any) -> tuple[tuple[int, ...], Any]:
        maps = __import__(
            "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
        )
        for position, generator_ideal in enumerate(self.generator_ideals):
            if ideal == generator_ideal:
                coordinates = tuple(
                    1 if index == position else 0
                    for index in range(len(self.invariants))
                )
                return coordinates, maps.PrincipalIdealWitness(
                    self.order.ideal(1),
                    self.field.one(),
                    source="authenticated service class generator",
                )
        integral, denominator, rows = self._integral_query_rows(ideal)
        receipt = self._query_callback(rows, self._query_resources)
        coordinates, generator = self._query_generator(integral, rows, receipt)
        if denominator != 1:
            factored = __import__(
                "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
            )
            generator = generator / factored.FactoredNumberFieldElement.from_element(
                self.field, self.field(denominator)
            )
        representative = self.representative_ideal(coordinates)
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        quotient = arithmetic.ideal_quotient(ideal, representative)
        witness = maps.PrincipalIdealWitness(
            quotient,
            generator,
            source="authenticated resident Rust ideal query",
        )
        if not witness.verify(self.order):
            raise ArithmeticError("fractional service ideal witness failed replay")
        return coordinates, witness

    def verify_saturation_record(self, record: Any) -> bool:
        return bool(
            record.complete
            and record.index_bound == 1
            and record.evidence == self._saturation_evidence
            and self.attest("conditional-class-group-proof")
        )

    def verify_conditional_grh_record(self, record: Any, group: Any) -> bool:
        return bool(
            tuple(group.invariants()) == self.invariants
            and record.theorem
            == "Belabas--Diaz y Diaz--Friedman strict factor-base inequality"
            and record.bound == (self.factor_base_bound, 1)
            and record.relation_count == self.relation_count
            and record.assumption
            == "GRH for all unramified Hecke L-functions of class-group characters AND GRH for the Dedekind-zeta residue bound"
            and self.verify_saturation_record(record.saturation)
        )

    def conditional_evidence_payload(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.rust-class-group/authenticated-service-proof-v1",
            "artifactSha256": self.artifact_sha256,
            "summaryIdentity": self.summary_identity,
            "proofWitnessesSha256": self.proof_witnesses_sha256,
        }

    def verify_conditional_evidence_payload(
        self, payload: Any, record: Any, group: Any, *, cancelled: Any = None
    ) -> bool:
        del cancelled
        return bool(
            isinstance(payload, dict)
            and payload.get("conditional_evidence")
            == self.conditional_evidence_payload()
            and self.verify_conditional_grh_record(record, group)
        )


def _ideal_prepared_basis_rows(
    field: Any,
    basis: Sequence[Any],
    ideal: Any,
    label: str,
) -> tuple[tuple[int, ...], ...]:
    """Return the canonical row HNF of an ideal in the exported Rust basis."""
    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    matrix = maximal._nf_global("matrix")
    prepared_matrix = matrix(sage.QQ, [element.list() for element in basis])
    coordinates = ideal.basis_matrix() * prepared_matrix.inverse()
    rows = []
    for row in coordinates.rows():
        if any(value._denominator != 1 for value in row):
            raise ArithmeticError(label + " is not integral in the prepared basis")
        rows.append([int(value._numerator) for value in row])
    buchmann = __import__(
        "sagejs.number_fields.buchmann_lenstra", fromlist=["buchmann_lenstra"]
    )
    canonical = buchmann._row_hnf(rows)
    return tuple(tuple(value for value in row) for row in canonical)


def _authenticated_service_basis(
    field: Any, raw_numerators: Any, raw_denominator: Any
) -> tuple[Any, ...]:
    """Replay the service's integral basis as a full maximal-order basis."""
    if not isinstance(raw_numerators, list) or len(raw_numerators) != 9:
        raise RelationMatrixError("service integral basis is malformed")
    numerators = [
        _signed_decimal(value, "service integral-basis numerator")
        for value in raw_numerators
    ]
    denominator = _positive_decimal(
        raw_denominator, "service integral-basis denominator"
    )
    scale = int(field._integral_equation_scale_cache)
    rows = []
    basis = []
    for row_index in range(3):
        row = []
        element = field(0)
        power = 1
        for column in range(3):
            coefficient = _untyped(sage.QQ)(
                _input_integer(numerators[3 * row_index + column]) * power,
                _input_integer(denominator),
            )
            row.append(coefficient)
            element += coefficient * field.gen() ** column
            power *= scale
        rows.append(row)
        basis.append(element)

    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    order = field.maximal_order()
    matrix = maximal._nf_global("matrix")
    published_matrix = matrix(sage.QQ, rows)
    if published_matrix.determinant() == 0 or any(
        element not in order for element in basis
    ):
        raise RelationMatrixError(
            "service integral basis is not integral and full rank"
        )
    change = published_matrix * order._basis_inverse_matrix()
    if any(value._denominator != 1 for row in change.rows() for value in row):
        raise RelationMatrixError("service integral basis is not contained integrally")
    determinant = change.determinant()
    if determinant._denominator != 1 or abs(int(determinant._numerator)) != 1:
        raise RelationMatrixError(
            "service integral basis is not the full maximal order"
        )
    return tuple(basis)


def _authenticated_service_ideal(
    field: Any, basis: Sequence[Any], rows: Any, label: str
) -> Any:
    if (
        not isinstance(rows, list)
        or len(rows) != len(basis)
        or any(not isinstance(row, list) or len(row) != len(basis) for row in rows)
    ):
        raise RelationMatrixError(label + " has malformed integral-basis rows")
    decoded = tuple(
        tuple(_signed_decimal(value, label + " coordinate") for value in row)
        for row in rows
    )
    order = field.maximal_order()
    generators = [
        _element_from_prepared_coordinates(field, cast(list[Any], basis), row)
        for row in decoded
    ]
    ideal = order.ideal(generators)
    actual = _ideal_prepared_basis_rows(field, basis, ideal, label)
    if actual != decoded:
        raise ArithmeticError(label + " is not a canonical full ideal basis")
    return ideal


def adapt_rust_authenticated_service_class_group(
    field: Any,
    summary: Any,
    *,
    attestation_callback: Any,
    query_callback: Any,
    query_resources: Any = None,
) -> Any:
    """Construct a public class group from a small artifact-sealed summary.

    The callbacks are live service capabilities and deliberately remain outside
    the authority JSON.  The service attests completeness and generator-order
    witnesses; every arbitrary-ideal answer still receives an exact local
    principal-ideal replay in Sage.js.
    """
    if not callable(attestation_callback) or not callable(query_callback):
        raise TypeError("authenticated service adapters require live callbacks")
    data = _closed(
        _canonical_json(summary, "authenticated service class-group summary"),
        {
            "artifactSha256",
            "authority",
            "basisDenominator",
            "classNumber",
            "discriminant",
            "factorBaseBound",
            "fieldBindingSha256",
            "generatorIdeals",
            "integralBasisNumerators",
            "invariants",
            "outcome",
            "polynomialAscending",
            "presentationBindingSha256",
            "proofMode",
            "proofWitnessesSha256",
            "relationCount",
            "schema",
            "signature",
        },
        "authenticated service class-group summary",
    )
    if (
        data["schema"] != AUTHENTICATED_SERVICE_CLASS_GROUP_SCHEMA
        or data["outcome"] != "complete-conditional-grh"
        or data["proofMode"] != "conditional-grh"
    ):
        raise RelationMatrixError("unsupported authenticated service summary")
    artifact = data["artifactSha256"]
    witness_digest = data["proofWitnessesSha256"]
    for value, label in (
        (artifact, "artifact SHA-256"),
        (witness_digest, "proof-witness SHA-256"),
        (data["fieldBindingSha256"], "field-binding SHA-256"),
        (data["presentationBindingSha256"], "presentation-binding SHA-256"),
    ):
        if (
            not isinstance(value, str)
            or len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
        ):
            raise RelationMatrixError(label + " is not canonical")
    prepared = prepare_cubic_for_rust(field)
    if data["polynomialAscending"] != prepared["field"]["coefficientsAscending"]:
        raise RelationMatrixError("service summary belongs to another number field")
    if _signed_decimal(data["discriminant"], "summary discriminant") != int(
        field.maximal_order().discriminant()
    ) or data["signature"] != [
        prepared["preparation"]["signature"]["realPlaces"],
        prepared["preparation"]["signature"]["complexPairs"],
    ]:
        raise RelationMatrixError("service summary changed the maximal-order field")
    authority = _closed(
        data["authority"],
        {
            "artifactAuthentication",
            "completionOutcome",
            "completionSchema",
            "sealedEvidenceVerified",
        },
        "service summary authority",
    )
    if (
        authority["completionSchema"]
        != "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
        or authority["completionOutcome"] != "complete-conditional-grh"
        or authority["sealedEvidenceVerified"] is not True
        or authority["artifactAuthentication"]
        != "host-must-bind-authenticated-artifact-sha256"
    ):
        raise RelationMatrixError("service summary has unsupported authority")
    raw_invariants = data["invariants"]
    if not isinstance(raw_invariants, list) or len(raw_invariants) > _MAX_INVARIANTS:
        raise RelationMatrixError("service invariants are malformed")
    invariants = tuple(
        _positive_decimal(value, "class-group invariant") for value in raw_invariants
    )
    previous = 1
    class_number = 1
    for invariant in invariants:
        if invariant <= 1 or invariant % previous:
            raise RelationMatrixError("service invariants are not Smith ordered")
        previous = invariant
        class_number *= invariant
    if _positive_decimal(data["classNumber"], "class number") != class_number:
        raise RelationMatrixError("service class number has the wrong product")
    basis = _authenticated_service_basis(
        field,
        data["integralBasisNumerators"],
        data["basisDenominator"],
    )
    raw_generators = data["generatorIdeals"]
    if not isinstance(raw_generators, list) or len(raw_generators) != len(invariants):
        raise RelationMatrixError("service generator count does not match invariants")
    generators = []
    for position, descriptor in enumerate(raw_generators):
        descriptor = _closed(
            descriptor,
            {
                "constructionEvidence",
                "coordinateZeroBased",
                "integralBasisRows",
                "invariantFactor",
            },
            "service class generator",
        )
        if (
            _natural(descriptor["coordinateZeroBased"], "generator coordinate")
            != position
            or _positive_decimal(descriptor["invariantFactor"], "generator invariant")
            != invariants[position]
        ):
            raise RelationMatrixError("service class generator is not canonical")
        construction = _closed(
            descriptor["constructionEvidence"],
            {"classCoordinates", "method", "principalShifts"},
            "service generator construction",
        )
        expected_coordinates = [
            "1" if index == position else "0" for index in range(len(invariants))
        ]
        shifts = construction["principalShifts"]
        if (
            construction["method"]
            != "authenticated-smith-lift-with-minimal-rational-principal-shifts"
            or construction["classCoordinates"] != expected_coordinates
            or not isinstance(shifts, list)
            or len(shifts) > _MAX_PUBLICATION_COLUMNS
        ):
            raise RelationMatrixError("service generator construction is malformed")
        for shift in shifts:
            shift = _closed(
                shift,
                {"exponent", "rationalPrime"},
                "service generator principal shift",
            )
            _positive_decimal(shift["rationalPrime"], "principal-shift prime")
            _positive_decimal(shift["exponent"], "principal-shift exponent")
        generators.append(
            _authenticated_service_ideal(
                field,
                basis,
                descriptor["integralBasisRows"],
                "service class generator",
            )
        )
    context = _AuthenticatedServiceClassGroupContext(
        field,
        invariants,
        generators,
        artifact,
        _identity(data),
        witness_digest,
        data["polynomialAscending"],
        _positive_natural(data["factorBaseBound"], "factor-base bound"),
        _natural(data["relationCount"], "relation count"),
        attestation_callback,
        query_callback,
        query_resources,
        basis,
    )
    if not context.attest("class-group-summary"):
        raise ArithmeticError("the resident service did not attest the summary")
    maps = __import__(
        "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
    )
    proof = __import__(
        "sagejs.number_fields.class_group_proof", fromlist=["class_group_proof"]
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    relation_witnesses = tuple(
        maps.PrincipalIdealWitness(
            ideal**invariant,
            field.one(),
            source="artifact-sealed resident Rust generator-order witness",
            relation_certificate=_AuthenticatedServiceRelationCertificate(
                context, position, ideal**invariant
            ),
        )
        for position, (ideal, invariant) in enumerate(
            zip(generators, invariants, strict=True)
        )
    )
    saturation = proof.SaturationProofRecord(
        (), (), index_bound=1, complete=True, evidence=context._saturation_evidence
    )
    theorem = "Belabas--Diaz y Diaz--Friedman strict factor-base inequality"
    assumption = (
        "GRH for all unramified Hecke L-functions of class-group characters AND "
        "GRH for the Dedekind-zeta residue bound"
    )
    proof_record = proof.ConditionalGRHProofRecord(
        theorem,
        (context.factor_base_bound, 1),
        relation_count=context.relation_count,
        assumption=assumption,
        saturation=saturation,
        analytic_index_one=True,
    )
    answer = maps.IdealClassGroup(
        field.maximal_order(),
        invariants,
        generators,
        relation_witnesses,
        context.public_ideal_log,
        proof_status=groups.EXACT_RELATIONS_CONDITIONAL_GRH,
        algorithm="rust-authenticated-service-cubic",
        factor_base_theorem=theorem,
        factor_base_bound=(context.factor_base_bound, 1),
        proof_record=proof_record,
        proof_context=context,
        relation_count=context.relation_count,
    )
    if answer.verify() is not True:
        raise ArithmeticError("authenticated service class group failed verification")
    return answer


def _replay_publication_field(
    field: Any, publication_field: Any, prepared_input: dict[str, Any]
) -> tuple[list[Any], list[list[list[Any]]], dict[str, Any]]:
    """Prove that an arbitrary published basis is the live maximal order."""
    keys = {
        "basisDenominator",
        "bindingSha256",
        "discriminant",
        "equationOrderIndex",
        "integralBasisNumerators",
        "irreducibilityPrime",
        "multiplicationTable",
        "polynomialAscending",
        "signature",
    }
    field_data = _closed(publication_field, keys, "publication field")
    prepared_field = prepared_input["field"]
    prepared = prepared_input["preparation"]
    digest = field_data["bindingSha256"]
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
    ):
        raise RelationMatrixError("publication field binding is not a SHA-256 digest")
    if (
        field_data["polynomialAscending"] != prepared_field["coefficientsAscending"]
        or field_data["irreducibilityPrime"] != prepared["irreducibilityPrime"]
        or field_data["discriminant"] != prepared["discriminant"]
        or field_data["signature"]
        != [prepared["signature"]["realPlaces"], prepared["signature"]["complexPairs"]]
    ):
        raise RelationMatrixError("publication field invariants do not match")

    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    order = field.maximal_order()
    expected_index = maximal.equation_order_index(order)
    if _positive_decimal(
        field_data["equationOrderIndex"], "equation-order index"
    ) != int(expected_index):
        raise RelationMatrixError("publication equation-order index does not match")
    raw_numerators = field_data["integralBasisNumerators"]
    if not isinstance(raw_numerators, list) or len(raw_numerators) != 9:
        raise RelationMatrixError("publication integral basis is malformed")
    numerators = [
        _signed_decimal(value, "integral-basis numerator") for value in raw_numerators
    ]
    denominator = _positive_decimal(field_data["basisDenominator"], "basis denominator")
    scale = int(field._integral_equation_scale_cache)
    rows = []
    basis = []
    for row_index in range(3):
        row = []
        element = field(0)
        power = 1
        for column in range(3):
            coefficient = _untyped(sage.QQ)(
                _input_integer(numerators[3 * row_index + column]) * power,
                _input_integer(denominator),
            )
            row.append(coefficient)
            element += coefficient * field.gen() ** column
            power *= scale
        rows.append(row)
        basis.append(element)

    matrix = maximal._nf_global("matrix")
    vector = maximal._nf_global("vector")
    published_matrix = matrix(sage.QQ, rows)
    if published_matrix.determinant() == 0:
        raise RelationMatrixError("publication integral basis is singular")
    if any(element not in order for element in basis):
        raise RelationMatrixError("publication basis is not integral")
    change = published_matrix * order._basis_inverse_matrix()
    if any(value._denominator != 1 for row in change.rows() for value in row):
        raise RelationMatrixError("publication basis is not contained integrally")
    determinant = change.determinant()
    if determinant._denominator != 1 or abs(int(determinant._numerator)) != 1:
        raise RelationMatrixError("publication basis is not the full maximal order")

    raw_table = field_data["multiplicationTable"]
    if not isinstance(raw_table, list) or len(raw_table) != 27:
        raise RelationMatrixError("publication multiplication table is malformed")
    expected_flat = [
        _signed_decimal(value, "multiplication-table entry") for value in raw_table
    ]
    inverse = published_matrix.inverse()
    actual_flat = []
    table = []
    for left in basis:
        products = []
        for right in basis:
            coordinates = list(
                vector(sage.QQ, maximal._nf_coordinates(left * right, 3)) * inverse
            )
            if any(value._denominator != 1 for value in coordinates):
                raise RelationMatrixError(
                    "publication basis is not multiplicatively closed"
                )
            integer_coordinates = [int(value._numerator) for value in coordinates]
            actual_flat.extend(integer_coordinates)
            products.append(integer_coordinates)
        table.append(products)
    if actual_flat != expected_flat:
        raise RelationMatrixError("publication multiplication table does not replay")
    return (
        basis,
        table,
        {
            "schema": "sagejs.rust-class-group/publication-field-replay-v1",
            "authority": "live-certified-maximal-order-with-unimodular-basis-change",
            "publishedBindingSha256": digest,
            "changeOfBasisDeterminant": int(determinant._numerator),
            "multiplicationTableReplayed": True,
        },
    )


def _publication_sparse_vector(
    terms: Any, length: int, index_key: str, label: str
) -> tuple[int, ...]:
    return _sparse_vector(terms, length, index_key, "value", label)


def _replay_dense_publication_presentation(
    columns: int,
    relation_rows: Sequence[SparseRelationRow],
    invariants: Sequence[int],
    class_map_rows: Sequence[Sequence[int]],
    generator_transforms: Sequence[Sequence[int]],
) -> CompactRelationPresentation:
    """Recompute and certify a deliberately small dense Smith quotient.

    The Rust producer selects dense Smith only below a conservative work
    crossover. Detached publication does not trust its transforms: Sage.js
    recomputes the exact quotient, then exhibits enough source-row maximal
    minors to prove that the separately replayed Rust coordinate map has the
    same order. Since every relation maps to zero, equality of orders makes
    the induced surjection an isomorphism.
    """
    row_count = len(relation_rows)
    if (
        columns <= 0
        or columns > _MAX_COLUMNS
        or row_count < columns
        or columns * columns > _MAX_DENSE_DETERMINANT_ENTRIES
        or columns * columns * columns > _MAX_DENSE_DETERMINANT_WORK
    ):
        raise RelationMatrixError("dense publication exceeds replay limits")
    dense = extract_relation_presentation(
        relation_rows, columns, backend="auto", require_full_rank=True
    )
    expected_order = 1
    for invariant in invariants:
        expected_order *= invariant
    if dense.order != expected_order or dense.invariants != tuple(invariants):
        raise RelationMatrixError("dense publication quotient mismatch")

    selected_minors: list[tuple[tuple[int, ...], int]] = []
    gcd = 0
    for trial, indices in enumerate(
        itertools.combinations(range(row_count), columns), start=1
    ):
        if trial > _MAX_DENSE_MINOR_TRIALS:
            raise RelationMatrixError("dense publication minor replay exceeded limits")
        determinant = abs(
            _determinant_exact([relation_rows[index].dense() for index in indices])
        )
        if determinant == 0:
            continue
        selected_minors.append((indices, determinant))
        gcd = _gcd_extended(gcd, determinant)[0]
        if gcd == expected_order:
            break
    if gcd != expected_order:
        raise RelationMatrixError(
            "dense publication minors do not certify the quotient"
        )
    return CompactRelationPresentation(
        columns,
        relation_rows,
        invariants,
        class_map_rows,
        generator_transforms,
        selected_minors,
    )


class RustCompactUnitReplayCertificate:
    """Exact proof that a factored relation product is a unit.

    Every factor is the principal generator of a relation already replayed as
    an exact ideal equality.  An exponent vector which annihilates the complete
    factor-base relation matrix therefore has principal ideal `(1)`.  Keeping
    the product factored is essential: expanded fundamental units can be
    astronomically larger than the relation generators which define them.
    """

    def __init__(
        self,
        relation_elements: Sequence[Any],
        relation_rows: Sequence[SparseRelationRow],
        exponents: Sequence[int],
    ) -> None:
        if len(relation_elements) != len(relation_rows) or len(exponents) != len(
            relation_rows
        ):
            raise RelationMatrixError("compact-unit relation dimensions mismatch")
        self._relation_elements = tuple(relation_elements)
        self._relation_rows = tuple(relation_rows)
        self._exponents = tuple(int(value) for value in exponents)
        self.proof_status = "exact-principal-relation-unit"

    @property
    def relation_exponents(self) -> tuple[int, ...]:
        return self._exponents

    def verify(self, unit: Any) -> bool:
        try:
            factored = __import__(
                "sagejs.number_fields.factored_elements",
                fromlist=["factored_elements"],
            )
            expected = factored.FactoredNumberFieldElement(
                unit.field(),
                (
                    (element, exponent)
                    for element, exponent in zip(
                        self._relation_elements, self._exponents, strict=True
                    )
                    if exponent
                ),
            )
            if expected != unit:
                return False
            columns = self._relation_rows[0].column_count
            totals = [0] * columns
            for coefficient, row in zip(
                self._exponents, self._relation_rows, strict=True
            ):
                if coefficient:
                    for column, value in row.entries:
                        totals[column] += coefficient * value
            return not any(totals)
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


class _TrustedServiceUnitCertificate:
    """Bind a compact unit to factors sealed by the authenticated service."""

    def __init__(self, field: Any, factors: Sequence[tuple[Any, int]]) -> None:
        self._field = field
        self._factors = tuple(factors)
        self.proof_status = "authenticated-rust-service-unit"

    def verify(self, unit: Any) -> bool:
        factored = __import__(
            "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
        )
        return unit == factored.FactoredNumberFieldElement(self._field, self._factors)


def _trusted_service_units(
    field: Any,
    publication_basis: Sequence[Any],
    relation_elements: _LazyRelationElements,
    payload: Any,
) -> tuple[Any, tuple[_TrustedServiceUnitCertificate, ...], dict[str, Any]]:
    """Construct only the unit factors referenced by a sealed service result."""
    units_data = _closed(
        payload,
        {
            "commonDenominator",
            "fundamentalUnits",
            "regulator",
            "rootsOfUnity",
            "selectedBasisIndex",
        },
        "publication units",
    )
    common_denominator = _positive_decimal(
        units_data["commonDenominator"], "unit common denominator"
    )
    selected_basis_index = _positive_decimal(
        units_data["selectedBasisIndex"], "selected unit-basis index"
    )
    if selected_basis_index > common_denominator:
        raise RelationMatrixError("selected unit-basis index exceeds its denominator")
    embeddings = __import__("sagejs.number_fields.embeddings", fromlist=["embeddings"])
    signature = embeddings.exact_signature(field)
    unit_rank = int(signature[0]) + int(signature[1]) - 1
    fundamental = units_data["fundamentalUnits"]
    if not isinstance(fundamental, list) or len(fundamental) != unit_rank:
        raise RelationMatrixError("publication fundamental-unit rank mismatch")
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    compact_units = []
    certificates = []
    nonzero_terms = 0
    for entry in fundamental:
        entry = _closed(entry, {"relationExponents"}, "publication unit")
        raw_terms = entry["relationExponents"]
        if not isinstance(raw_terms, list):
            raise RelationMatrixError("unit relation exponents must be an array")
        factors = []
        previous = -1
        for term in raw_terms:
            term = _closed(term, {"indexZeroBased", "value"}, "unit relation term")
            index = _natural(term["indexZeroBased"], "unit relation index")
            if not previous < index < len(relation_elements):
                raise RelationMatrixError("unit relation indices are not canonical")
            previous = index
            exponent = _signed_decimal(
                term["value"], "unit relation exponent", nonzero=True
            )
            factors.append((relation_elements[index], exponent))
        nonzero_terms += len(factors)
        unit = factored.FactoredNumberFieldElement(field, factors)
        compact_units.append(unit)
        certificates.append(_TrustedServiceUnitCertificate(field, factors))

    roots_data = _closed(
        units_data["rootsOfUnity"],
        {"exhaustionTheorem", "generatorIntegralBasisCoordinates", "order"},
        "publication roots of unity",
    )
    if (
        roots_data["exhaustionTheorem"]
        != "odd-degree-number-fields-have-only-plus-or-minus-one-roots-of-unity"
        or int(field.degree()) % 2 != 1
        or _positive_decimal(roots_data["order"], "roots-of-unity order") != 2
    ):
        raise RelationMatrixError("unsupported roots-of-unity publication theorem")
    raw_root = roots_data["generatorIntegralBasisCoordinates"]
    published_root = _element_from_prepared_coordinates(
        field,
        list(publication_basis),
        tuple(_signed_decimal(value, "torsion coordinate") for value in raw_root),
    )
    units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
    torsion = units_module.roots_of_unity(field)
    if published_root != -field.one() or not torsion.complete or not torsion.verify():
        raise ArithmeticError("roots-of-unity theorem failed independent replay")
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    unit_group = groups.UnitGroupComputation(
        torsion,
        compact_units,
        unit_rank,
        complete=False,
        reason="authenticated Rust units; analytic index-one proof remains detached",
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
    )
    return (
        unit_group,
        tuple(certificates),
        {
            "schema": "sagejs.rust-class-group/compact-unit-replay-v1",
            "authority": "authenticated-rust-service-artifact",
            "unitRank": unit_rank,
            "factoredUnitCount": len(compact_units),
            "nonzeroRelationExponentTerms": nonzero_terms,
            "selectedBasisIndex": selected_basis_index,
            "commonDenominator": common_denominator,
            "rootsOfUnityOrder": 2,
            "allRelationProductsAreUnits": True,
        },
    )


def _replay_publication_units(
    field: Any,
    publication_basis: Sequence[Any],
    relation_records: Sequence[dict[str, Any]],
    relation_rows: Sequence[SparseRelationRow],
    payload: Any,
) -> tuple[Any, tuple[RustCompactUnitReplayCertificate, ...], dict[str, Any]]:
    """Reconstruct exact factored units without expanding their huge values."""
    publication_basis_list = list(publication_basis)
    units_data = _closed(
        payload,
        {
            "commonDenominator",
            "fundamentalUnits",
            "regulator",
            "rootsOfUnity",
            "selectedBasisIndex",
        },
        "publication units",
    )
    common_denominator = _positive_decimal(
        units_data["commonDenominator"], "unit common denominator"
    )
    selected_basis_index = _positive_decimal(
        units_data["selectedBasisIndex"], "selected unit-basis index"
    )
    if selected_basis_index > common_denominator:
        raise RelationMatrixError("selected unit-basis index exceeds its denominator")

    relation_count = len(relation_rows)
    relation_elements = tuple(
        _element_from_prepared_coordinates(
            field,
            publication_basis_list,
            tuple(
                _signed_decimal(value, "principal coordinate")
                for value in record["integralBasisCoordinates"]
            ),
        )
        for record in relation_records
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    signature_module = __import__(
        "sagejs.number_fields.embeddings", fromlist=["embeddings"]
    )
    signature = signature_module.exact_signature(field)
    unit_rank = int(signature[0]) + int(signature[1]) - 1
    fundamental = units_data["fundamentalUnits"]
    if not isinstance(fundamental, list) or len(fundamental) != unit_rank:
        raise RelationMatrixError("publication fundamental-unit rank mismatch")
    compact_units = []
    certificates = []
    nonzero_terms = 0
    for entry in fundamental:
        entry = _closed(entry, {"relationExponents"}, "publication unit")
        exponents = _publication_sparse_vector(
            entry["relationExponents"],
            relation_count,
            "indexZeroBased",
            "unit relation exponent",
        )
        nonzero_terms += sum(1 for value in exponents if value)
        certificate = RustCompactUnitReplayCertificate(
            relation_elements, relation_rows, exponents
        )
        unit = factored.FactoredNumberFieldElement(
            field,
            (
                (element, exponent)
                for element, exponent in zip(relation_elements, exponents, strict=True)
                if exponent
            ),
        )
        if not certificate.verify(unit):
            raise ArithmeticError("compact unit does not annihilate the relations")
        compact_units.append(unit)
        certificates.append(certificate)

    roots_data = _closed(
        units_data["rootsOfUnity"],
        {"exhaustionTheorem", "generatorIntegralBasisCoordinates", "order"},
        "publication roots of unity",
    )
    if (
        roots_data["exhaustionTheorem"]
        != "odd-degree-number-fields-have-only-plus-or-minus-one-roots-of-unity"
        or int(field.degree()) % 2 != 1
    ):
        raise RelationMatrixError("unsupported roots-of-unity publication theorem")
    roots_order = _positive_decimal(roots_data["order"], "roots-of-unity order")
    raw_root = roots_data["generatorIntegralBasisCoordinates"]
    if not isinstance(raw_root, list) or len(raw_root) != int(field.degree()):
        raise RelationMatrixError("roots-of-unity generator has the wrong dimension")
    published_root = _element_from_prepared_coordinates(
        field,
        publication_basis_list,
        tuple(_signed_decimal(value, "torsion coordinate") for value in raw_root),
    )
    units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
    torsion = units_module.roots_of_unity(field)
    if (
        roots_order != 2
        or published_root != -field.one()
        or int(torsion.order) != roots_order
        or not torsion.complete
        or not torsion.verify()
    ):
        raise ArithmeticError("roots-of-unity theorem failed independent replay")

    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    unit_group = groups.UnitGroupComputation(
        torsion,
        compact_units,
        unit_rank,
        complete=False,
        reason="exact compact units replayed; analytic index-one proof remains detached",
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
    )
    return (
        unit_group,
        tuple(certificates),
        {
            "schema": "sagejs.rust-class-group/compact-unit-replay-v1",
            "authority": "independent-exact-principal-relation-annihilation",
            "unitRank": unit_rank,
            "factoredUnitCount": len(compact_units),
            "nonzeroRelationExponentTerms": nonzero_terms,
            "selectedBasisIndex": selected_basis_index,
            "commonDenominator": common_denominator,
            "rootsOfUnityOrder": roots_order,
            "allRelationProductsAreUnits": True,
        },
    )


def _replay_publication_regulator(
    unit_group: Any, units_payload: Any, analytic_payload: Any
) -> tuple[Any, dict[str, Any]]:
    """Independently enclose the regulator of the exact factored units."""
    units_data = _closed(
        units_payload,
        {
            "commonDenominator",
            "fundamentalUnits",
            "regulator",
            "rootsOfUnity",
            "selectedBasisIndex",
        },
        "publication units",
    )
    regulator_data = _closed(
        units_data["regulator"],
        {"binaryExponent", "lower", "upper"},
        "publication regulator",
    )
    analytic_data = _closed(
        analytic_payload,
        {
            "bdfMargin",
            "bdfPlan",
            "bfEnclosure",
            "bfPlan",
            "classUnitHypothesis",
            "factorBaseHypothesis",
            "precision",
        },
        "publication analytic completion",
    )
    precision_data = _closed(
        analytic_data["precision"],
        {
            "attemptedLevels",
            "requestedLogarithmPrecisionBits",
            "requestedReplayPrecisionBits",
        },
        "publication precision evidence",
    )
    requested_logarithm = _natural(
        precision_data["requestedLogarithmPrecisionBits"],
        "requested logarithm precision",
    )
    requested_replay = _natural(
        precision_data["requestedReplayPrecisionBits"],
        "requested replay precision",
    )
    attempted = precision_data["attemptedLevels"]
    if not isinstance(attempted, list) or not attempted:
        raise RelationMatrixError("publication precision history is empty")
    levels = []
    for entry in attempted:
        entry = _closed(
            entry,
            {"logarithmPrecisionBits", "replayPrecisionBits"},
            "publication precision level",
        )
        level = (
            _positive_natural(entry["logarithmPrecisionBits"], "logarithm precision"),
            _positive_natural(entry["replayPrecisionBits"], "replay precision"),
        )
        if levels and (level[0] <= levels[-1][0] or level[1] <= levels[-1][1]):
            raise RelationMatrixError("publication precision levels are not increasing")
        levels.append(level)
    accepted_logarithm, accepted_replay = levels[-1]
    if (
        accepted_logarithm > requested_logarithm
        or accepted_replay > requested_replay
        or accepted_replay > accepted_logarithm
        or accepted_logarithm > 16_384
    ):
        raise RelationMatrixError("publication precision history exceeds its request")

    analytic = __import__(
        "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    exponent = _bounded_integer(
        regulator_data["binaryExponent"], "regulator binary exponent"
    )
    published = analytic.RealBall.dyadic_endpoints(
        _analytic_decimal(regulator_data["lower"], "regulator lower endpoint"),
        exponent,
        _analytic_decimal(regulator_data["upper"], "regulator upper endpoint"),
        exponent,
        precision_bits=accepted_logarithm,
        rigorous=True,
        source="Rust/Arb detached regulator enclosure",
    )
    if published.contains_zero():
        raise ArithmeticError("published regulator enclosure contains zero")
    workspace = factored.FactoredLogarithmWorkspace(
        unit_group.generators[0].field(), maximum_entries=4096
    )
    replay_levels = tuple(
        bits
        for bits in (128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 4096, 8192)
        if bits <= accepted_logarithm
    )
    if not replay_levels or replay_levels[-1] != accepted_logarithm:
        replay_levels += (accepted_logarithm,)
    independent = None
    overlap = None
    independent_precision = None
    for bits in replay_levels:
        candidate = analytic.regulator_from_factored_units(
            unit_group.generators,
            unit_rank=unit_group.unit_rank,
            precision_bits=bits,
            absolute_tolerance_bits=min(64, max(16, bits // 4)),
            maximum_precision_bits=bits,
            logarithm_workspace=workspace,
        )
        if not candidate.rigorous:
            continue
        try:
            candidate_overlap = candidate.ball.intersection(published)
        except ValueError:
            continue
        independent = candidate
        overlap = candidate_overlap
        independent_precision = bits
        break
    if independent is None or overlap is None or independent_precision is None:
        raise ArithmeticError("published regulator is disjoint from independent replay")
    unit_group.regulator_enclosure = independent
    return (
        independent,
        {
            "schema": "sagejs.rust-class-group/regulator-replay-v1",
            "authority": "independent-sagejs-factored-unit-directed-logarithms",
            "acceptedLogarithmPrecisionBits": accepted_logarithm,
            "acceptedReplayPrecisionBits": accepted_replay,
            "independentLogarithmPrecisionBits": independent_precision,
            "attemptedLevels": [list(level) for level in levels],
            "publishedAndIndependentIntervalsOverlap": True,
            "independentRegulatorProofStatus": independent.proof_status,
            "overlapContainsZero": overlap.contains_zero(),
            "logarithmWorkspace": workspace.diagnostics(),
        },
    )


def _publication_dyadic_ball(analytic: Any, payload: Any, label: str) -> Any:
    data = _closed(payload, {"binaryExponent", "lower", "upper"}, label + " interval")
    exponent = _bounded_integer(data["binaryExponent"], label + " exponent")
    return analytic.RealBall.dyadic_endpoints(
        _analytic_decimal(data["lower"], label + " lower endpoint"),
        exponent,
        _analytic_decimal(data["upper"], label + " upper endpoint"),
        exponent,
        precision_bits=512,
        rigorous=True,
        source="Rust/Arb detached " + label,
    )


def _replay_publication_analytic_completion(
    field: Any,
    class_number: int,
    unit_group: Any,
    payload: Any,
) -> dict[str, Any]:
    """Rebuild the BF and BDF plans and their directed analytic decisions."""
    data = _closed(
        payload,
        {
            "bdfMargin",
            "bdfPlan",
            "bfEnclosure",
            "bfPlan",
            "classUnitHypothesis",
            "factorBaseHypothesis",
            "precision",
        },
        "publication analytic completion",
    )
    if (
        data["classUnitHypothesis"] != "GRH for the Dedekind-zeta residue bound"
        or data["factorBaseHypothesis"]
        != "GRH for all unramified Hecke L-functions of class-group characters"
    ):
        raise RelationMatrixError("unsupported analytic completion hypotheses")
    analytic = __import__(
        "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
    )
    primes = __import__("sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"])
    factor_base = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["class_group_factor_base"],
    )
    bf_data = _closed(
        data["bfPlan"], {"rawTerms", "terms", "threshold"}, "publication BF plan"
    )
    threshold = _positive_decimal(bf_data["threshold"], "BF threshold")
    if threshold > 1_000_000:
        raise RelationMatrixError("BF threshold exceeds the detached replay cap")
    expected_primes = tuple(analytic._primes_below(threshold))
    splitting = {}
    for record in primes.splitting_records(field.maximal_order(), 2, threshold):
        prime, factors = analytic._splitting_record(record, int(field.degree()))
        splitting[prime] = factors
    if tuple(sorted(splitting)) != expected_primes:
        raise ArithmeticError("BF replay did not cover the complete prime interval")
    plan = analytic._build_bf_plan_readable(threshold, splitting)
    raw_bf_terms = bf_data["terms"]
    if not isinstance(raw_bf_terms, list):
        raise RelationMatrixError("BF terms must be an array")
    published_bf_terms = tuple(
        tuple(_bounded_integer(value, "BF term") for value in term)
        if isinstance(term, list) and len(term) == 4
        else ()
        for term in raw_bf_terms
    )
    if (
        any(not term for term in published_bf_terms)
        or _natural(bf_data["rawTerms"], "BF raw term count") != plan.raw_terms
        or published_bf_terms != plan.terms
    ):
        raise ArithmeticError("BF prime-power plan failed independent replay")

    interval_field = analytic.IntervalBallField(512)
    finite = analytic._bf_finite_term(plan, interval_field)
    tail = analytic._BFErrorModel(
        int(field.maximal_order().discriminant()),
        int(field.degree()),
        interval_field,
    ).bound(threshold)
    zeta = finite.add_error(tail.upper)
    embeddings = __import__("sagejs.number_fields.embeddings", fromlist=["embeddings"])
    signature = tuple(int(value) for value in embeddings.exact_signature(field))
    index = analytic.validate_hr_index(
        signature=signature,
        discriminant=int(field.maximal_order().discriminant()),
        class_number=class_number,
        roots_of_unity=int(unit_group.torsion.order),
        regulator=unit_group.regulator_enclosure,
        zeta_log_residue=zeta,
        precision_bits=512,
    )
    if not index.index_one:
        raise ArithmeticError("independent BF replay did not isolate index one")
    bf_enclosure = _closed(
        data["bfEnclosure"],
        {"index", "tailBound", "zetaLogResidue"},
        "publication BF enclosure",
    )
    published_index = _publication_dyadic_ball(
        analytic, bf_enclosure["index"], "BF index"
    )
    published_tail = _publication_dyadic_ball(
        analytic, bf_enclosure["tailBound"], "BF tail"
    )
    published_zeta = _publication_dyadic_ball(
        analytic, bf_enclosure["zetaLogResidue"], "BF zeta residue"
    )
    try:
        published_index.intersection(index.index_ball)
        published_tail.intersection(tail)
        published_zeta.intersection(zeta)
    except ValueError as error:
        raise ArithmeticError(
            "published BF enclosure is disjoint from independent replay"
        ) from error
    quarter = analytic.RationalEndpoint(1, 4)
    if (
        published_index.lower.ceil() != 1
        or published_index.upper.floor() != 1
        or not published_tail.upper < quarter
    ):
        raise ArithmeticError("published BF tail does not prove the quarter bound")

    bdf_data = _closed(
        data["bdfPlan"], {"bound", "rawTerms", "terms"}, "publication BDF plan"
    )
    bdf_bound = _positive_decimal(bdf_data["bound"], "BDF bound")
    if bdf_bound > threshold:
        raise RelationMatrixError("BDF bound exceeds the replayed prime interval")
    aggregated: dict[tuple[int, int], int] = {}
    raw_bdf_terms = 0
    for prime in expected_primes:
        if prime >= bdf_bound:
            break
        for _ramification, residue_degree in splitting[prime]:
            norm = prime**residue_degree
            if norm >= bdf_bound:
                continue
            exponent = 1
            power = norm
            while power < bdf_bound:
                raw_bdf_terms += 1
                key = (norm, exponent)
                aggregated[key] = aggregated.get(key, 0) + 1
                exponent += 1
                power *= norm
    bdf_terms = tuple(
        (multiplicity, norm, exponent)
        for (norm, exponent), multiplicity in sorted(aggregated.items())
    )
    raw_published_bdf_terms = bdf_data["terms"]
    if not isinstance(raw_published_bdf_terms, list):
        raise RelationMatrixError("BDF terms must be an array")
    published_bdf_terms = tuple(
        tuple(_bounded_integer(value, "BDF term") for value in term)
        if isinstance(term, list) and len(term) == 3
        else ()
        for term in raw_published_bdf_terms
    )
    if (
        any(not term for term in published_bdf_terms)
        or _natural(bdf_data["rawTerms"], "BDF raw term count") != raw_bdf_terms
        or published_bdf_terms != bdf_terms
    ):
        raise ArithmeticError("BDF prime-power plan failed independent replay")
    evaluator = factor_base._BDFEvaluator(
        field.maximal_order(), bdf_bound, compact_index_primes=True
    )
    # The exact splitting map above already covers every prime needed by the
    # published BDF parameter.  Reuse it instead of scanning the number field
    # a second time, and verify the published parameter directly: publication
    # needs a strict valid bound, not an independent proof that it is minimal.
    evaluator.records = dict(splitting)
    evaluator.scanned_stop = bdf_bound
    published_margin = _publication_dyadic_ball(
        analytic, data["bdfMargin"], "BDF margin"
    )
    if not analytic.RationalEndpoint(0) < published_margin.lower:
        raise ArithmeticError("published BDF margin is not strictly positive")
    replay_precision = None
    for bits in (64, 96, 128, 192, 256, 384, 512):
        counted_terms, right_side, left_side = evaluator.inequality(
            bdf_bound,
            int(field.degree()),
            signature[0],
            abs(int(field.maximal_order().discriminant())),
            bits,
        )
        if counted_terms != raw_bdf_terms:
            raise ArithmeticError("independent BDF term count changed during replay")
        if not right_side.lower > left_side.upper:
            continue
        independent_margin = right_side - left_side
        bdf_interval = analytic.RealBall(
            analytic.RationalEndpoint(
                independent_margin.lower.numerator,
                independent_margin.lower.denominator,
            ),
            analytic.RationalEndpoint(
                independent_margin.upper.numerator,
                independent_margin.upper.denominator,
            ),
            precision_bits=bits,
            rigorous=True,
            source="independent Sage.js BDF inequality",
        )
        try:
            published_margin.intersection(bdf_interval)
        except ValueError as error:
            raise ArithmeticError(
                "published BDF margin is disjoint from independent replay"
            ) from error
        replay_precision = bits
        break
    if replay_precision is None:
        raise ArithmeticError("independent BDF inequality is not strictly positive")
    return {
        "schema": "sagejs.rust-class-group/analytic-completion-replay-v1",
        "authority": "independent-sagejs-bf-and-bdf-directed-interval-replay",
        "bfThreshold": threshold,
        "bfRawTerms": plan.raw_terms,
        "bfAggregatedTerms": len(plan.terms),
        "bfIndex": 1,
        "bfTailBelowOneQuarter": True,
        "bdfBound": bdf_bound,
        "bdfReplayPrecisionBits": replay_precision,
        "bdfRawTerms": raw_bdf_terms,
        "bdfAggregatedTerms": len(bdf_terms),
        "bdfStrictMargin": True,
        "hypothesis": "conditional-grh",
    }


class _RustPublicationCompletionEvidence:
    """Small immutable bridge from detached replay to public proof contracts."""

    def __init__(
        self,
        context: Any,
        units: Sequence[Any],
        candidate_identity: str,
        analytic_replay: dict[str, Any],
    ) -> None:
        self.units = tuple(units)
        self.unit_rank = len(self.units)
        self._context = context
        self._candidate_identity = candidate_identity
        self._analytic_replay = _canonical_json(analytic_replay, "analytic replay")
        self.completion_certificate = {
            "schema": "sagejs.rust-class-group/public-unit-completion-v1",
            "publicationCandidateIdentity": candidate_identity,
            "hypothesis": "conditional-grh",
        }

    def verify_completion(self) -> bool:
        return bool(
            self._context.prepared_result_identity == self._candidate_identity
            and self._context.verify_factored_units()
            and self._analytic_replay.get("bfIndex") == 1
            and self._analytic_replay.get("bdfStrictMargin") is True
            and self._analytic_replay.get("hypothesis") == "conditional-grh"
        )


class _RustPublicationProofContext:
    """Replay context for a conditional public class-group proof record."""

    def __init__(
        self,
        presentation: Any,
        candidate_identity: str,
        artifact_sha256: str,
        theorem: str,
        bound: int,
        relation_count: int,
        assumption: str,
        analytic_replay: dict[str, Any],
    ) -> None:
        self._presentation = presentation
        self._candidate_identity = candidate_identity
        self._artifact_sha256 = artifact_sha256
        self._theorem = theorem
        self._bound = int(bound)
        self._relation_count = int(relation_count)
        self._assumption = assumption
        self._analytic_identity = _identity(analytic_replay)
        self._saturation_evidence = {
            "schema": "sagejs.rust-class-group/public-saturation-replay-v1",
            "publicationCandidateIdentity": candidate_identity,
            "analyticReplayIdentity": self._analytic_identity,
            "index": 1,
        }

    def verify_saturation_record(self, record: Any) -> bool:
        return bool(
            record.complete
            and record.index_bound == 1
            and record.evidence == self._saturation_evidence
        )

    def verify_conditional_grh_record(self, record: Any, presentation: Any) -> bool:
        return bool(
            presentation is not None
            and tuple(presentation.invariants()) == tuple(self._presentation.invariants)
            and self._presentation.verify()
            and record.theorem == self._theorem
            and record.bound == (self._bound, 1)
            and record.relation_count == self._relation_count
            and record.assumption == self._assumption
            and self.verify_saturation_record(record.saturation)
        )

    def conditional_evidence_payload(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.rust-class-group/public-conditional-proof-evidence-v1",
            "publicationCandidateIdentity": self._candidate_identity,
            "artifactSha256": self._artifact_sha256,
            "analyticReplayIdentity": self._analytic_identity,
        }

    def verify_conditional_evidence_payload(
        self, payload: Any, record: Any, group: Any, *, cancelled: Any = None
    ) -> bool:
        del cancelled
        try:
            return bool(
                payload.get("conditional_evidence")
                == self.conditional_evidence_payload()
                and self.verify_conditional_grh_record(record, group)
            )
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


def _promote_replayed_publication(
    field: Any,
    presentation: Any,
    context: RustCompactPresentationReplay,
    unit_group: Any,
    relation_elements: Any,
    order_combinations: Sequence[Sequence[int]],
    factor_base_policy: dict[str, Any],
    analytic_replay: dict[str, Any],
    candidate_identity: str,
    artifact_sha256: str,
) -> tuple[Any, Any, Any]:
    """Construct ordinary public objects from already authenticated pieces."""
    maps = __import__(
        "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
    )
    proof = __import__(
        "sagejs.number_fields.class_group_proof", fromlist=["class_group_proof"]
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    policy = _closed(
        factor_base_policy,
        {"checkingBound", "hypothesis", "relationBound"},
        "publication factor-base policy",
    )
    bound = _positive_natural(policy["checkingBound"], "factor-base checking bound")
    _positive_natural(policy["relationBound"], "factor-base relation bound")
    if (
        not isinstance(policy["hypothesis"], str)
        or "GRH" not in policy["hypothesis"].upper()
    ):
        raise RelationMatrixError(
            "publication factor-base policy lost its GRH hypothesis"
        )
    theorem = "Belabas--Diaz y Diaz--Friedman strict factor-base inequality"
    assumption = (
        "GRH for all unramified Hecke L-functions of class-group characters AND "
        "GRH for the Dedekind-zeta residue bound"
    )
    generator_ideals = tuple(
        context.class_generator_ideal(index)
        for index in range(len(presentation.invariants))
    )
    witnesses = []
    for invariant, ideal, combination in zip(
        presentation.invariants, generator_ideals, order_combinations, strict=True
    ):
        generator = factored.FactoredNumberFieldElement(
            field,
            (
                (relation_elements[index], coefficient)
                for index, coefficient in enumerate(combination)
                if coefficient
            ),
        )
        relation_ideal = ideal**invariant
        witness = maps.PrincipalIdealWitness(
            relation_ideal,
            generator,
            source="authenticated Rust generator-order relation combination",
        )
        if not witness.verify(field.maximal_order()):
            raise ArithmeticError(
                "Rust generator-order witness failed exact ideal replay"
            )
        witnesses.append(witness)
    proof_context = _RustPublicationProofContext(
        presentation,
        candidate_identity,
        artifact_sha256,
        theorem,
        bound,
        context.relation_count,
        assumption,
        analytic_replay,
    )
    saturation = proof.SaturationProofRecord(
        (),
        (),
        index_bound=1,
        complete=True,
        evidence=proof_context._saturation_evidence,
    )
    proof_record = proof.ConditionalGRHProofRecord(
        theorem,
        (bound, 1),
        relation_count=context.relation_count,
        assumption=assumption,
        saturation=saturation,
        analytic_index_one=True,
    )
    class_group = maps.IdealClassGroup(
        field.maximal_order(),
        presentation.invariants,
        generator_ideals,
        witnesses,
        context.public_ideal_log,
        proof_status=groups.EXACT_RELATIONS_CONDITIONAL_GRH,
        algorithm="rust-public-cubic",
        factor_base_theorem=theorem,
        factor_base_bound=(bound, 1),
        presentation_evidence=presentation,
        proof_record=proof_record,
        proof_context=proof_context,
        relation_count=context.relation_count,
    )
    unit_evidence = _RustPublicationCompletionEvidence(
        context, unit_group.generators, candidate_identity, analytic_replay
    )
    complete_units = groups.UnitGroupComputation(
        unit_group.torsion,
        unit_group.generators,
        unit_group.unit_rank,
        complete=True,
        regulator=unit_group.regulator_enclosure,
        reason="exact compact units with independently replayed conditional index one",
        proof_status=groups.EXACT_RELATIONS_CONDITIONAL_GRH,
        completion_evidence=unit_evidence,
    )
    if (
        class_group.verify() is not True
        or complete_units.verify_completion() is not True
    ):
        raise ArithmeticError("promoted Rust public objects failed final proof replay")
    return class_group, complete_units, proof_context


def _finish_trusted_service_publication(
    field: Any,
    top: dict[str, Any],
    presentation_data: dict[str, Any],
    prepared_input: dict[str, Any],
    publication_basis: Sequence[Any],
    field_replay: dict[str, Any],
    old_catalog: Sequence[dict[str, Any]],
    relations: Sequence[dict[str, Any]],
    invariants: Sequence[int],
    class_map_rows: Sequence[Sequence[int]],
    generator_transforms: Sequence[Sequence[int]],
    order_combinations: Sequence[Sequence[int]],
    expected_class_number: int,
    artifact_sha256: str,
    query_callback: Any,
    query_resources: Any,
) -> Any:
    """Complete the product path without reinterpreting the full transcript."""
    columns = len(old_catalog)
    row_count = len(relations)
    presentation = _TrustedServicePresentation(
        columns,
        row_count,
        invariants,
        class_map_rows,
        generator_transforms,
    )
    factor_base_ideals = _TrustedServiceFactorBase(
        field, field.maximal_order(), publication_basis, old_catalog
    )
    relation_elements = _LazyRelationElements(field, publication_basis, relations)
    unit_group, unit_certificates, unit_replay = _trusted_service_units(
        field, publication_basis, relation_elements, top["units"]
    )
    _regulator, regulator_replay = _replay_publication_regulator(
        unit_group, top["units"], top["analyticCompletion"]
    )
    analytic_replay = _replay_publication_analytic_completion(
        field, expected_class_number, unit_group, top["analyticCompletion"]
    )
    identity_material = "\0".join(
        (
            artifact_sha256,
            top["field"]["bindingSha256"],
            presentation_data["bindingSha256"],
            presentation_data["principalWitnessesSha256"],
            str(expected_class_number),
        )
    )
    candidate_identity = (
        "sha256:" + hashlib.sha256(identity_material.encode("utf-8")).hexdigest()
    )
    context = RustCompactPresentationReplay(
        presentation,
        field,
        field.maximal_order(),
        publication_basis,
        factor_base_ideals,
        producer_input_id=prepared_input["inputId"],
        prepared_result_identity=candidate_identity,
        certificate_identity="sha256:" + artifact_sha256,
        factored_units=unit_group.generators,
        unit_certificates=unit_certificates,
        relation_elements=relation_elements,
        query_callback=query_callback,
        query_resources=query_resources,
        polynomial_ascending=top["field"]["polynomialAscending"],
        trusted_service_core=True,
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    remaining = (
        ()
        if query_callback is not None
        else ("resident-arbitrary-ideal-query-session",)
    )
    diagnostics = {
        "schema": "sagejs.rust-class-group/publication-candidate-replay-v1",
        "automaticDispatch": query_callback is not None,
        "publicResultSupported": query_callback is not None,
        "artifactSha256": artifact_sha256,
        "publicationCandidateIdentity": candidate_identity,
        "fieldReplay": field_replay,
        "relationPresentationReplay": "authenticated-rust-service-seal",
        "relationIdealReplay": {
            "authority": "authenticated-rust-service-artifact",
            "factorBasePrimeCount": columns,
            "principalRelationCount": row_count,
            "lazyIdealMaterialization": True,
        },
        "compactUnitReplay": unit_replay,
        "regulatorReplay": regulator_replay,
        "analyticCompletionReplay": analytic_replay,
        "remainingEvidenceGaps": list(remaining),
    }
    common_stages = (
        groups.ClassUnitStage(
            "rust-authenticated-class-quotient",
            "complete",
            {
                "factorBaseSize": columns,
                "relationCount": row_count,
                "classNumber": expected_class_number,
                "artifactSha256": artifact_sha256,
            },
        ),
        groups.ClassUnitStage(
            "rust-authenticated-compact-units", "complete", unit_replay
        ),
        groups.ClassUnitStage(
            "sagejs-detached-regulator-replay", "complete", regulator_replay
        ),
        groups.ClassUnitStage(
            "sagejs-detached-analytic-replay", "complete", analytic_replay
        ),
    )
    if query_callback is not None:
        class_group, complete_units, _proof_context = _promote_replayed_publication(
            field,
            presentation,
            context,
            unit_group,
            relation_elements,
            order_combinations,
            presentation_data["factorBasePolicy"],
            analytic_replay,
            candidate_identity,
            artifact_sha256,
        )
        return groups.ClassUnitComputation(
            field,
            proof_status=groups.EXACT_RELATIONS_CONDITIONAL_GRH,
            complete=True,
            reason="complete conditional-GRH Rust cubic class and unit computation",
            algorithm="rust-public-cubic",
            stages=common_stages
            + (
                groups.ClassUnitStage(
                    "sagejs-public-class-unit-construction",
                    "complete",
                    {"residentIdealQuery": True, "proofPayloadReplay": True},
                ),
            ),
            class_group=class_group,
            unit_group=complete_units,
            tentative_invariants=tuple(invariants),
            context=context,
            diagnostics=diagnostics,
        )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the authenticated service result needs a resident ideal-query session",
        algorithm="rust-public-cubic-publication-candidate-experimental",
        stages=common_stages,
        unit_group=unit_group,
        tentative_invariants=tuple(invariants),
        context=context,
        diagnostics=diagnostics,
    )


def adapt_rust_public_cubic_publication_candidate(
    field: Any,
    publication_candidate: dict[str, Any],
    artifact_sha256: str,
    *,
    query_callback: Any = None,
    query_resources: Any = None,
) -> Any:
    """Publish a sealed native-core result as ordinary Sage mathematical objects.

    The authenticated native artifact is part of the trusted mathematical
    core. This boundary validates schemas and field bindings, replays the
    compact integer quotient and analytic certificates, and leaves exhaustive
    duplicate principal-ideal replay to the explicit audit adapter.
    """
    if (
        not isinstance(artifact_sha256, str)
        or len(artifact_sha256) != 64
        or any(character not in "0123456789abcdef" for character in artifact_sha256)
    ):
        raise RelationMatrixError("artifact identity is not a canonical SHA-256 digest")
    if not isinstance(publication_candidate, dict):
        raise RelationMatrixError("publication candidate must be a dictionary")
    # The resident host already parsed a bounded canonical JSON response from
    # the authenticated artifact. Serializing and parsing the multi-megabyte
    # row-6 transcript again in interpreted Python dominated the entire call.
    candidate = publication_candidate
    top = _closed(
        candidate,
        {
            "analyticCompletion",
            "field",
            "maximalOrderCertificate",
            "presentation",
            "proofMode",
            "schema",
            "status",
            "units",
        },
        "publication candidate",
    )
    if (
        top["schema"] != PUBLICATION_CANDIDATE_SCHEMA
        or top["status"] != "detached-replay-required-before-publication"
        or top["proofMode"] != "conditional-grh"
    ):
        raise RelationMatrixError("unsupported publication candidate")
    prepared_input = prepare_cubic_for_rust(field)
    publication_basis, publication_table, field_replay = _replay_publication_field(
        field, top["field"], prepared_input
    )

    presentation_data = _closed(
        top["presentation"],
        {
            "bindingSha256",
            "classNumber",
            "factorBase",
            "factorBasePolicy",
            "generatorOrders",
            "invariantFactors",
            "latticeIndexEvidence",
            "principalRelations",
            "principalWitnessesSha256",
            "relationDependencies",
        },
        "publication presentation",
    )
    factor_base = presentation_data["factorBase"]
    relations = presentation_data["principalRelations"]
    if not isinstance(factor_base, list) or not isinstance(relations, list):
        raise RelationMatrixError("publication relations must be arrays")
    columns = len(factor_base)
    row_count = len(relations)
    trusted_fast_path = row_count > 128
    if (
        columns == 0
        or columns > _MAX_PUBLICATION_COLUMNS
        or row_count <= columns
        or row_count > _MAX_PUBLICATION_RELATIONS
        or row_count - columns > _MAX_SURPLUS
    ):
        raise RelationMatrixError("publication relation shape exceeds replay limits")

    descriptor_keys = {
        "classCoordinates",
        "generator",
        "hnf",
        "indexZeroBased",
        "integralBasisRows",
        "norm",
        "prime",
        "ramification",
        "residueDegree",
    }
    old_catalog = []
    class_map_rows = []
    for expected, descriptor in enumerate(factor_base):
        descriptor = _closed(
            descriptor, descriptor_keys, "publication factor-base entry"
        )
        if _natural(descriptor["indexZeroBased"], "factor-base index") != expected:
            raise RelationMatrixError(
                "publication factor-base indices are not contiguous"
            )
        generator = descriptor["generator"]
        hnf = descriptor["hnf"]
        integral_rows = descriptor["integralBasisRows"]
        if (
            not isinstance(generator, list)
            or len(generator) != 3
            or not isinstance(hnf, list)
            or len(hnf) != 9
            or not isinstance(integral_rows, list)
            or len(integral_rows) != 3
            or any(not isinstance(row, list) or len(row) != 3 for row in integral_rows)
        ):
            raise RelationMatrixError("publication factor-base lattice is malformed")
        if trusted_fast_path:
            old_catalog.append(
                {
                    "factorBaseIndexZeroBased": expected,
                    "generator": generator,
                    "hnf": hnf,
                    "integralBasisRows": integral_rows,
                    "norm": descriptor["norm"],
                    "prime": descriptor["prime"],
                    "ramification": descriptor["ramification"],
                    "residueDegree": descriptor["residueDegree"],
                }
            )
        else:
            old_catalog.append(
                {
                    "factorBaseIndexZeroBased": expected,
                    "generator": [
                        _signed_decimal(value, "prime generator") for value in generator
                    ],
                    "hnf": [_signed_decimal(value, "prime HNF") for value in hnf],
                    "integralBasisRows": [
                        [
                            _signed_decimal(value, "integral ideal basis")
                            for value in row
                        ]
                        for row in integral_rows
                    ],
                    "norm": _positive_decimal(descriptor["norm"], "prime norm"),
                    "prime": _positive_decimal(descriptor["prime"], "rational prime"),
                    "ramification": _positive_natural(
                        descriptor["ramification"], "ramification index"
                    ),
                    "residueDegree": _positive_natural(
                        descriptor["residueDegree"], "residue degree"
                    ),
                }
            )
        class_map_rows.append(
            tuple(
                _signed_decimal(value, "class coordinate")
                for value in descriptor["classCoordinates"]
            )
        )

    relation_rows = []
    old_records = []
    if trusted_fast_path:
        old_records = relations
    else:
        factor_terms = 0
        for expected, record in enumerate(relations):
            record = _closed(
                record,
                {
                    "primeIdealFactors",
                    "principalElementIntegralBasisCoordinates",
                    "relationIndexZeroBased",
                },
                "publication principal relation",
            )
            if _natural(record["relationIndexZeroBased"], "relation index") != expected:
                raise RelationMatrixError(
                    "publication relation indices are not contiguous"
                )
            factors = record["primeIdealFactors"]
            if not isinstance(factors, list):
                raise RelationMatrixError(
                    "publication relation factors must be an array"
                )
            factor_terms += len(factors)
            if factor_terms > _MAX_PUBLICATION_FACTOR_TERMS:
                raise RelationMatrixError(
                    "publication factor terms exceed replay limits"
                )
            entries = []
            for factor in factors:
                factor = _closed(
                    factor,
                    {"exponent", "factorBaseIndexZeroBased"},
                    "publication relation factor",
                )
                entries.append(
                    (
                        _natural(
                            factor["factorBaseIndexZeroBased"], "factor-base index"
                        ),
                        _positive_decimal(factor["exponent"], "relation exponent"),
                    )
                )
            row = SparseRelationRow(columns, entries)
            relation_rows.append(row)
            old_records.append(
                {
                    "relationIndexZeroBased": expected,
                    "integralBasisCoordinates": record[
                        "principalElementIntegralBasisCoordinates"
                    ],
                    "primeIdealFactors": [
                        {"factorBaseIndexZeroBased": index, "exponent": exponent}
                        for index, exponent in entries
                    ],
                }
            )

    raw_invariants = presentation_data["invariantFactors"]
    if not isinstance(raw_invariants, list) or len(raw_invariants) > _MAX_INVARIANTS:
        raise RelationMatrixError("publication invariant factors are malformed")
    invariants = tuple(
        _positive_decimal(value, "invariant factor") for value in raw_invariants
    )
    expected_class_number = 1
    for invariant in invariants:
        expected_class_number *= invariant
    if (
        _positive_decimal(presentation_data["classNumber"], "class number")
        != expected_class_number
    ):
        raise RelationMatrixError("publication class number has the wrong product")
    if any(len(row) != len(invariants) for row in class_map_rows):
        raise RelationMatrixError("publication class map has the wrong width")

    orders = presentation_data["generatorOrders"]
    if not isinstance(orders, list) or len(orders) != len(invariants):
        raise RelationMatrixError("publication generator-order count mismatch")
    generator_transforms = []
    order_combinations = []
    for expected, order in enumerate(orders):
        order = _closed(
            order,
            {
                "coordinateZeroBased",
                "factorBaseLift",
                "invariantFactor",
                "orderRelationCombination",
            },
            "publication generator order",
        )
        if (
            _natural(order["coordinateZeroBased"], "generator coordinate") != expected
            or _positive_decimal(order["invariantFactor"], "generator order")
            != invariants[expected]
        ):
            raise RelationMatrixError("publication generator order is not canonical")
        generator_transforms.append(
            _publication_sparse_vector(
                order["factorBaseLift"], columns, "indexZeroBased", "generator lift"
            )
        )
        order_combinations.append(
            _publication_sparse_vector(
                order["orderRelationCombination"],
                row_count,
                "indexZeroBased",
                "order relation combination",
            )
        )

    if trusted_fast_path:
        return _finish_trusted_service_publication(
            field,
            top,
            presentation_data,
            prepared_input,
            publication_basis,
            field_replay,
            old_catalog,
            relations,
            invariants,
            class_map_rows,
            generator_transforms,
            order_combinations,
            expected_class_number,
            artifact_sha256,
            query_callback,
            query_resources,
        )

    raw_dependencies = presentation_data["relationDependencies"]
    if (
        not isinstance(raw_dependencies, list)
        or len(raw_dependencies) != row_count - columns
    ):
        raise RelationMatrixError("publication dependency count mismatch")
    dependencies = [
        _publication_sparse_vector(
            terms, row_count, "indexZeroBased", "relation dependency"
        )
        for terms in raw_dependencies
    ]
    for dependency in dependencies:
        replayed = [0] * columns
        for coefficient, relation in zip(dependency, relation_rows, strict=True):
            if coefficient:
                for column, value in relation.entries:
                    replayed[column] += coefficient * value
        if any(replayed):
            raise RelationMatrixError("publication dependency failed exact replay")
    raw_lattice_evidence = presentation_data["latticeIndexEvidence"]
    presentation: Any = None
    if raw_lattice_evidence == {"method": "detached-dense-recompute"}:
        presentation = _replay_dense_publication_presentation(
            columns,
            relation_rows,
            invariants,
            class_map_rows,
            generator_transforms,
        )
        evidence = None
    else:
        evidence = _closed(
            raw_lattice_evidence,
            {
                "dependencySaturation",
                "method",
                "projectedDependencyDeterminant",
                "squareDeterminant",
                "squareRowIndicesZeroBased",
                "surplusRowIndicesZeroBased",
            },
            "publication lattice-index evidence",
        )
        if evidence["method"] != "compact-small-surplus":
            raise RelationMatrixError("unsupported publication quotient proof")
    if evidence is not None:
        saturation = _closed(
            evidence["dependencySaturation"],
            {"criterion", "selectedMinors"},
            "publication dependency saturation",
        )
        if (
            saturation["criterion"]
            != "gcd-of-exhibited-maximal-dependency-minors-is-one"
        ):
            raise RelationMatrixError("unsupported publication dependency proof")
        dependency_minors = []
        for minor in saturation["selectedMinors"]:
            minor = _closed(
                minor,
                {"determinant", "relationRowIndicesZeroBased"},
                "publication dependency minor",
            )
            dependency_minors.append(
                (
                    tuple(
                        _natural(index, "dependency minor index")
                        for index in minor["relationRowIndicesZeroBased"]
                    ),
                    _positive_decimal(
                        minor["determinant"], "dependency minor determinant"
                    ),
                )
            )
        dependency_minors.sort(key=_dependency_minor_key)
        presentation = CompactRelationPresentation.from_small_surplus(
            columns,
            relation_rows,
            invariants,
            class_map_rows,
            generator_transforms,
            dependencies,
            evidence["squareRowIndicesZeroBased"],
            evidence["surplusRowIndicesZeroBased"],
            _positive_decimal(evidence["squareDeterminant"], "square determinant"),
            _positive_decimal(
                evidence["projectedDependencyDeterminant"], "projected determinant"
            ),
            dependency_minors,
        )
    for modulus, lift, combination in zip(
        invariants, generator_transforms, order_combinations, strict=True
    ):
        left = tuple(modulus * value for value in lift)
        right = [0] * columns
        for coefficient, relation in zip(combination, relation_rows, strict=True):
            for column, value in relation.entries:
                right[column] += coefficient * value
        if left != tuple(right):
            raise RelationMatrixError(
                "publication generator-order witness failed replay"
            )
    if not presentation.verify():
        raise RelationMatrixError("publication quotient failed exact compact replay")

    prepared_result = {
        "relationLatticeEvidence": {
            "factorBaseCatalog": old_catalog,
            "relationRecords": old_records,
        }
    }
    # The installed service artifact is part of the trusted mathematical core,
    # just as FLINT is. It has already replayed every principal equality before
    # sealing this resident result. Repeating thousands of ideal products in
    # the JavaScript host made hard fields unusable; retain that exhaustive
    # duplicate replay in the explicit prepared-evidence audit adapter above.
    factor_base_ideals, ideal_replay = _replay_relation_ideals(
        field,
        prepared_input,
        prepared_result,
        presentation,
        basis_override=publication_basis,
        table_override=publication_table,
        verify_principal_relations=False,
        trusted_authenticated_service=True,
    )
    unit_group, unit_certificates, unit_replay = _replay_publication_units(
        field,
        publication_basis,
        old_records,
        relation_rows,
        top["units"],
    )
    _regulator, regulator_replay = _replay_publication_regulator(
        unit_group, top["units"], top["analyticCompletion"]
    )
    analytic_replay = _replay_publication_analytic_completion(
        field, expected_class_number, unit_group, top["analyticCompletion"]
    )
    identity_material = "\0".join(
        (
            artifact_sha256,
            top["field"]["bindingSha256"],
            presentation_data["bindingSha256"],
            presentation_data["principalWitnessesSha256"],
            str(expected_class_number),
        )
    )
    candidate_identity = (
        "sha256:" + hashlib.sha256(identity_material.encode("utf-8")).hexdigest()
    )
    relation_elements = tuple(
        _element_from_prepared_coordinates(
            field,
            publication_basis,
            tuple(
                _signed_decimal(value, "principal coordinate")
                for value in record["integralBasisCoordinates"]
            ),
        )
        for record in old_records
    )
    context = RustCompactPresentationReplay(
        presentation,
        field,
        field.maximal_order(),
        publication_basis,
        factor_base_ideals,
        producer_input_id=prepared_input["inputId"],
        prepared_result_identity=candidate_identity,
        certificate_identity="sha256:" + artifact_sha256,
        factored_units=unit_group.generators,
        unit_certificates=unit_certificates,
        relation_elements=relation_elements,
        query_callback=query_callback,
        query_resources=query_resources,
        polynomial_ascending=top["field"]["polynomialAscending"],
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    remaining = (
        ()
        if query_callback is not None
        else ("resident-arbitrary-ideal-query-session",)
    )
    diagnostics = {
        "schema": "sagejs.rust-class-group/publication-candidate-replay-v1",
        "automaticDispatch": False,
        "publicResultSupported": query_callback is not None,
        "artifactSha256": artifact_sha256,
        "publicationCandidateIdentity": candidate_identity,
        "fieldReplay": field_replay,
        "relationPresentationReplay": "exact-compact-small-surplus",
        "relationIdealReplay": ideal_replay,
        "compactUnitReplay": unit_replay,
        "regulatorReplay": regulator_replay,
        "analyticCompletionReplay": analytic_replay,
        "remainingEvidenceGaps": list(remaining),
    }
    common_stages = (
        groups.ClassUnitStage(
            "rust-detached-publication-class-quotient-replay",
            "complete",
            {
                "factorBaseSize": columns,
                "relationCount": row_count,
                "classNumber": expected_class_number,
                "artifactSha256": artifact_sha256,
            },
        ),
        groups.ClassUnitStage(
            "sagejs-detached-compact-unit-replay", "complete", unit_replay
        ),
        groups.ClassUnitStage(
            "sagejs-detached-regulator-replay", "complete", regulator_replay
        ),
        groups.ClassUnitStage(
            "sagejs-detached-analytic-replay", "complete", analytic_replay
        ),
    )
    if query_callback is not None:
        class_group, complete_units, _proof_context = _promote_replayed_publication(
            field,
            presentation,
            context,
            unit_group,
            relation_elements,
            order_combinations,
            presentation_data["factorBasePolicy"],
            analytic_replay,
            candidate_identity,
            artifact_sha256,
        )
        diagnostics["automaticDispatch"] = True
        diagnostics["remainingEvidenceGaps"] = []
        return groups.ClassUnitComputation(
            field,
            proof_status=groups.EXACT_RELATIONS_CONDITIONAL_GRH,
            complete=True,
            reason="complete conditional-GRH Rust cubic class and unit computation",
            algorithm="rust-public-cubic",
            stages=common_stages
            + (
                groups.ClassUnitStage(
                    "sagejs-public-class-unit-construction",
                    "complete",
                    {"residentIdealQuery": True, "proofPayloadReplay": True},
                ),
            ),
            class_group=class_group,
            unit_group=complete_units,
            tentative_invariants=invariants,
            context=context,
            diagnostics=diagnostics,
        )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the detached class/unit mathematics is independently replayed, but public group construction and arbitrary-ideal dispatch remain unfinished",
        algorithm="rust-public-cubic-publication-candidate-experimental",
        stages=common_stages
        + (
            groups.ClassUnitStage(
                "sagejs-public-class-unit-construction",
                "incomplete",
                {"missingEvidence": list(remaining)},
            ),
        ),
        unit_group=unit_group,
        tentative_invariants=invariants,
        context=context,
        diagnostics=diagnostics,
    )


__all__ = [
    "ARBITRARY_IDEAL_QUERY_SCHEMA",
    "AUTHENTICATED_SERVICE_CLASS_GROUP_SCHEMA",
    "AUTHENTICATED_SERVICE_IDEAL_QUERY_SCHEMA",
    "PUBLIC_ARBITRARY_IDEAL_QUERY_SCHEMA",
    "PUBLICATION_CANDIDATE_SCHEMA",
    "RustCompactPresentationReplay",
    "adapt_rust_authenticated_service_class_group",
    "adapt_rust_public_cubic_publication_candidate",
    "adapt_rust_prepared_cubic_v2_presentation",
]
